import type { AgentProvider, Clock, ExecutionStore, IdGenerator } from './contracts.js';
import { validateAndSortPlan } from './plan.js';
import { requiresApproval } from './policy.js';
import { assertTransition } from './stateMachine.js';
import type { AgentRun, Approval, AuditEvent, Goal, Project, TaskSpec, WorkflowResult } from './types.js';

export interface GoldenWorkflowDeps {
  store: ExecutionStore;
  agents: AgentProvider;
  clock: Clock;
  ids: IdGenerator;
}

export interface GoldenWorkflowInput {
  ownerId: string;
  command: string;
  idempotencyKey: string;
}

export interface ResumeWorkflowInput {
  ownerId: string;
  idempotencyKey: string;
}

export interface ApprovalDecisionInput extends ResumeWorkflowInput {
  approvalId: string;
  decision: 'approved' | 'rejected';
}

async function checkpoint(result: WorkflowResult, deps: GoldenWorkflowDeps): Promise<void> {
  result.updatedAt = deps.clock.now();
  await deps.store.saveIdempotentResult(result.idempotencyKey, result);
}

async function emit(
  result: WorkflowResult,
  deps: GoldenWorkflowDeps,
  event: Omit<AuditEvent, 'id' | 'at' | 'ownerId' | 'workflowRunId'>
): Promise<void> {
  const full: AuditEvent = { ...event, ownerId: result.ownerId, workflowRunId: result.workflowRunId, id: deps.ids.next('evt'), at: deps.clock.now() };
  result.audit.push(full);
  await deps.store.appendAudit(full);
}

function calculateProgress(tasks: TaskSpec[]): number {
  if (tasks.length === 0) return 0;
  return Math.round((tasks.filter((task) => task.state === 'completed').length / tasks.length) * 100);
}

async function executeTaskWithRetry(
  result: WorkflowResult,
  task: TaskSpec,
  deps: GoldenWorkflowDeps
): Promise<boolean> {
  while (task.attempt < task.maxAttempts) {
    if (task.state === 'retrying' || task.state === 'waiting_for_approval') {
      assertTransition(task.state, 'running');
      task.state = 'running';
    } else if (task.state === 'queued') {
      assertTransition(task.state, 'running');
      task.state = 'running';
    }

    task.attempt += 1;
    task.lastError = undefined;
    await deps.store.saveTask(task);

    const run: AgentRun = {
      id: deps.ids.next('run'),
      ownerId: result.ownerId,
      workflowRunId: result.workflowRunId,
      projectId: result.project.id,
      taskId: task.id,
      role: task.assignedRole,
      state: 'running',
      attempt: task.attempt,
      startedAt: deps.clock.now()
    };
    result.runs.push(run);
    await deps.store.saveRun(run);
    await emit(result, deps, {
      projectId: result.project.id,
      entityType: 'agent_run',
      entityId: run.id,
      event: 'agent_run.started',
      actor: task.assignedRole,
      data: { taskId: task.id, attempt: task.attempt }
    });

    try {
      const output = await deps.agents.run(task.assignedRole, task.objective, {
        goal: result.goal,
        project: result.project,
        task,
        completedTasks: result.tasks.filter((candidate) => candidate.state === 'completed')
      });

      assertTransition(task.state, 'completed');
      task.state = 'completed';
      task.output = output;
      run.state = 'completed';
      run.output = output;
      run.completedAt = deps.clock.now();
      await deps.store.saveTask(task);
      await deps.store.saveRun(run);
      await emit(result, deps, {
        projectId: result.project.id,
        entityType: 'task',
        entityId: task.id,
        event: 'task.completed',
        actor: task.assignedRole,
        data: { attempt: task.attempt }
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      run.state = 'failed';
      run.error = message;
      run.completedAt = deps.clock.now();
      task.lastError = message;
      await deps.store.saveRun(run);

      if (task.attempt < task.maxAttempts) {
        assertTransition(task.state, 'retrying');
        task.state = 'retrying';
        await deps.store.saveTask(task);
        await emit(result, deps, {
          projectId: result.project.id,
          entityType: 'task',
          entityId: task.id,
          event: 'task.retry_scheduled',
          actor: 'system',
          data: { attempt: task.attempt, error: message }
        });
        await checkpoint(result, deps);
        continue;
      }

      assertTransition(task.state, 'failed');
      task.state = 'failed';
      await deps.store.saveTask(task);
      await emit(result, deps, {
        projectId: result.project.id,
        entityType: 'task',
        entityId: task.id,
        event: 'task.failed',
        actor: task.assignedRole,
        data: { attempts: task.attempt, error: message }
      });
      return false;
    }
  }

  return false;
}

async function runReviewer(result: WorkflowResult, deps: GoldenWorkflowDeps): Promise<void> {
  const reviewerRun: AgentRun = {
    id: deps.ids.next('run'),
    ownerId: result.ownerId,
    workflowRunId: result.workflowRunId,
    projectId: result.project.id,
    role: 'reviewer',
    state: 'running',
    attempt: 1,
    startedAt: deps.clock.now()
  };
  result.runs.push(reviewerRun);
  await deps.store.saveRun(reviewerRun);

  const review = await deps.agents.review(result.plan.summary, {
    goal: result.goal,
    project: result.project,
    completedTasks: result.tasks
  });

  result.reviewerApproved = review.approved;
  reviewerRun.state = review.approved ? 'completed' : 'failed';
  reviewerRun.completedAt = deps.clock.now();
  reviewerRun.output = review.summary;
  await deps.store.saveRun(reviewerRun);

  if (review.approved) {
    result.project.status = 'completed';
    result.project.progress = 100;
    result.project.completedAt = deps.clock.now();
    result.goal.status = 'completed';
    result.state = 'completed';
    result.finalSummary = review.summary;
    await deps.store.saveProject(result.project);
    await deps.store.saveGoal(result.goal);
    await emit(result, deps, {
      projectId: result.project.id,
      entityType: 'project',
      entityId: result.project.id,
      event: 'project.completed',
      actor: 'reviewer'
    });
  } else {
    result.project.status = 'blocked';
    result.state = 'failed';
    result.finalSummary = review.summary;
    await deps.store.saveProject(result.project);
    await emit(result, deps, {
      projectId: result.project.id,
      entityType: 'project',
      entityId: result.project.id,
      event: 'project.review_failed',
      actor: 'reviewer'
    });
  }
}

async function continueWorkflow(result: WorkflowResult, deps: GoldenWorkflowDeps): Promise<WorkflowResult> {
  if (result.state === 'completed' || result.state === 'cancelled') return result;

  result.state = 'running';
  result.project.status = 'active';
  await deps.store.saveProject(result.project);

  for (const task of result.tasks) {
    if (task.state === 'completed') continue;

    const dependenciesComplete = task.dependsOn.every((dependencyId) =>
      result.tasks.some((candidate) => candidate.id === dependencyId && candidate.state === 'completed')
    );
    if (!dependenciesComplete) {
      result.state = 'failed';
      result.project.status = 'blocked';
      result.finalSummary = `تعذر تشغيل «${task.title}» لأن أحد اعتماداته غير مكتمل.`;
      await deps.store.saveProject(result.project);
      await emit(result, deps, {
        projectId: result.project.id,
        entityType: 'task',
        entityId: task.id,
        event: 'task.dependencies_incomplete',
        actor: 'system'
      });
      await checkpoint(result, deps);
      return result;
    }

    let approval = result.approvals.find((candidate) => candidate.taskId === task.id);

    if (task.state === 'waiting_for_approval') {
      if (!approval || approval.status === 'pending') {
        result.state = 'waiting_for_approval';
        result.project.status = 'blocked';
        result.finalSummary = 'المشروع متوقف مؤقتًا بانتظار موافقة بشرية.';
        await deps.store.saveProject(result.project);
        await checkpoint(result, deps);
        return result;
      }
      if (approval.status === 'rejected') {
        assertTransition(task.state, 'cancelled');
        task.state = 'cancelled';
        result.state = 'cancelled';
        result.project.status = 'cancelled';
        result.goal.status = 'cancelled';
        result.finalSummary = `تم إيقاف المشروع لأن الموافقة على «${task.title}» رُفضت.`;
        await deps.store.saveTask(task);
        await deps.store.saveProject(result.project);
        await deps.store.saveGoal(result.goal);
        await checkpoint(result, deps);
        return result;
      }
    } else if (requiresApproval(task.risk) && !approval) {
      if (task.state === 'queued') {
        assertTransition(task.state, 'running');
        task.state = 'running';
      }
      assertTransition(task.state, 'waiting_for_approval');
      task.state = 'waiting_for_approval';
      approval = {
        id: deps.ids.next('approval'),
        ownerId: result.ownerId,
        workflowRunId: result.workflowRunId,
        projectId: result.project.id,
        taskId: task.id,
        risk: task.risk as Approval['risk'],
        status: 'pending',
        reason: `المهمة «${task.title}» تتطلب موافقة بشرية.`,
        createdAt: deps.clock.now()
      };
      result.approvals.push(approval);
      result.state = 'waiting_for_approval';
      result.project.status = 'blocked';
      result.finalSummary = 'المشروع متوقف مؤقتًا بانتظار موافقة بشرية.';
      await deps.store.saveApproval(approval);
      await deps.store.saveTask(task);
      await deps.store.saveProject(result.project);
      await emit(result, deps, {
        projectId: result.project.id,
        entityType: 'approval',
        entityId: approval.id,
        event: 'approval.requested',
        actor: 'system',
        data: { taskId: task.id, risk: task.risk }
      });
      await checkpoint(result, deps);
      return result;
    }

    const succeeded = await executeTaskWithRetry(result, task, deps);
    if (!succeeded) {
      result.state = 'failed';
      result.project.status = 'blocked';
      result.project.progress = calculateProgress(result.tasks);
      result.finalSummary = `فشلت المهمة «${task.title}» بعد ${task.attempt} محاولة.`;
      await deps.store.saveProject(result.project);
      await checkpoint(result, deps);
      return result;
    }

    result.project.progress = calculateProgress(result.tasks);
    await deps.store.saveProject(result.project);
    await checkpoint(result, deps);
  }

  if (result.tasks.every((task) => task.state === 'completed')) {
    await runReviewer(result, deps);
  }

  await checkpoint(result, deps);
  return result;
}

export async function executeGoldenWorkflow(
  input: GoldenWorkflowInput,
  deps: GoldenWorkflowDeps
): Promise<WorkflowResult> {
  const cached = await deps.store.getByIdempotencyKey(input.ownerId, input.idempotencyKey);
  if (cached) return cached;

  const command = input.command.trim();
  if (!command) throw new Error('Command is required');

  const workflowRunId = deps.ids.next('workflow');

  const chiefRun: AgentRun = {
    id: deps.ids.next('run'),
    ownerId: input.ownerId,
    workflowRunId,
    role: 'chief_of_staff',
    state: 'running',
    attempt: 1,
    startedAt: deps.clock.now()
  };
  const intake = await deps.agents.intake(command);
  chiefRun.state = 'completed';
  chiefRun.completedAt = deps.clock.now();
  chiefRun.output = intake.outcome;

  const goal: Goal = {
    id: deps.ids.next('goal'),
    ownerId: input.ownerId,
    title: intake.title.slice(0, 120),
    outcome: intake.outcome,
    successCriteria: intake.successCriteria,
    status: 'active',
    createdAt: deps.clock.now()
  };
  await deps.store.saveGoal(goal);

  const project: Project = {
    id: deps.ids.next('project'),
    goalId: goal.id,
    ownerId: input.ownerId,
    title: `مشروع: ${goal.title}`,
    status: 'planned',
    progress: 0,
    createdAt: deps.clock.now()
  };
  await deps.store.saveProject(project);
  chiefRun.projectId = project.id;

  const plannerRun: AgentRun = {
    id: deps.ids.next('run'),
    ownerId: input.ownerId,
    workflowRunId,
    projectId: project.id,
    role: 'planner',
    state: 'running',
    attempt: 1,
    startedAt: deps.clock.now()
  };
  const plan = await deps.agents.plan(goal.outcome, { goal, project });
  const orderedPlan = validateAndSortPlan(plan);
  plannerRun.state = 'completed';
  plannerRun.completedAt = deps.clock.now();
  plannerRun.output = plan.summary;

  const taskIds = new Map<string, string>();
  orderedPlan.forEach((spec) => taskIds.set(spec.key, deps.ids.next('task')));
  const tasks: TaskSpec[] = orderedPlan.map((spec, index) => ({
    id: taskIds.get(spec.key)!,
    ownerId: input.ownerId,
    workflowRunId,
    projectId: project.id,
    planKey: spec.key,
    title: spec.title,
    objective: spec.objective,
    assignedRole: spec.assignedRole,
    risk: spec.risk,
    state: 'queued',
    dependsOn: spec.dependsOn.map((key) => taskIds.get(key)!),
    attempt: 0,
    maxAttempts: 3,
    idempotencyKey: `${input.idempotencyKey}:task:${index}:${spec.key}`
  }));

  const result: WorkflowResult = {
    workflowRunId,
    idempotencyKey: input.idempotencyKey,
    ownerId: input.ownerId,
    state: 'queued',
    goal,
    project,
    plan: { ...plan, tasks: orderedPlan },
    tasks,
    runs: [chiefRun, plannerRun],
    approvals: [],
    audit: [],
    finalSummary: 'تم إنشاء المشروع وجارٍ التنفيذ.',
    reviewerApproved: false,
    updatedAt: deps.clock.now()
  };

  // Persist the workflow checkpoint before child rows. Relational stores use this
  // to satisfy workflow_run foreign keys for tasks, agent runs, approvals and audit.
  await checkpoint(result, deps);
  await deps.store.saveRun(chiefRun);
  await deps.store.saveRun(plannerRun);
  for (const task of tasks) await deps.store.saveTask(task);

  await emit(result, deps, { entityType: 'goal', entityId: goal.id, event: 'goal.created', actor: 'chief_of_staff' });
  await emit(result, deps, { projectId: project.id, entityType: 'project', entityId: project.id, event: 'project.created', actor: 'chief_of_staff' });
  await emit(result, deps, { projectId: project.id, entityType: 'agent_run', entityId: plannerRun.id, event: 'planner.completed', actor: 'planner' });
  for (const task of tasks) {
    await emit(result, deps, { projectId: project.id, entityType: 'task', entityId: task.id, event: 'task.queued', actor: 'planner' });
  }
  await checkpoint(result, deps);

  return continueWorkflow(result, deps);
}

export async function resumeGoldenWorkflow(
  input: ResumeWorkflowInput,
  deps: GoldenWorkflowDeps
): Promise<WorkflowResult> {
  const result = await deps.store.getByIdempotencyKey(input.ownerId, input.idempotencyKey);
  if (!result) throw new Error('Workflow not found');
  if (result.ownerId !== input.ownerId) throw new Error('Workflow owner mismatch');
  return continueWorkflow(result, deps);
}

export async function decideApprovalAndResume(
  input: ApprovalDecisionInput,
  deps: GoldenWorkflowDeps
): Promise<WorkflowResult> {
  const result = await deps.store.getByIdempotencyKey(input.ownerId, input.idempotencyKey);
  if (!result) throw new Error('Workflow not found');
  if (result.ownerId !== input.ownerId) throw new Error('Workflow owner mismatch');

  const approval = result.approvals.find((candidate) => candidate.id === input.approvalId);
  if (!approval) throw new Error('Approval not found');
  if (approval.status !== 'pending') throw new Error('Approval already decided');

  approval.status = input.decision;
  approval.decidedAt = deps.clock.now();
  await deps.store.saveApproval(approval);
  await emit(result, deps, {
    projectId: result.project.id,
    entityType: 'approval',
    entityId: approval.id,
    event: input.decision === 'approved' ? 'approval.approved' : 'approval.rejected',
    actor: 'user',
    data: { taskId: approval.taskId }
  });
  await checkpoint(result, deps);

  return continueWorkflow(result, deps);
}
