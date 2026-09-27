import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExecutionStore } from '../../core/contracts.js';
import type {
  AgentRun,
  Approval,
  AuditEvent,
  Goal,
  Project,
  TaskSpec,
  WorkflowResult
} from '../../core/types.js';

function asJsonText(value?: string): unknown {
  return value === undefined ? null : { text: value };
}

function readJsonText(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const text = (value as { text?: unknown }).text;
  return typeof text === 'string' ? text : undefined;
}

export class SupabaseExecutionStore implements ExecutionStore {
  constructor(private readonly client: SupabaseClient) {}

  private static throwIfError(error: { message: string } | null): void {
    if (error) throw new Error(`Supabase persistence error: ${error.message}`);
  }

  async saveGoal(goal: Goal): Promise<void> {
    const { error } = await this.client.from('goals').upsert({
      id: goal.id,
      owner_id: goal.ownerId,
      title: goal.title,
      outcome: goal.outcome,
      success_criteria: goal.successCriteria,
      status: goal.status,
      created_at: goal.createdAt
    }, { onConflict: 'id' });
    SupabaseExecutionStore.throwIfError(error);
  }

  async saveProject(project: Project): Promise<void> {
    const { error } = await this.client.from('projects').upsert({
      id: project.id,
      owner_id: project.ownerId,
      goal_id: project.goalId,
      title: project.title,
      status: project.status,
      progress: project.progress,
      created_at: project.createdAt,
      completed_at: project.completedAt ?? null
    }, { onConflict: 'id' });
    SupabaseExecutionStore.throwIfError(error);
  }

  async saveTask(task: TaskSpec): Promise<void> {
    const { error } = await this.client.from('tasks').upsert({
      id: task.id,
      owner_id: task.ownerId,
      project_id: task.projectId,
      workflow_run_id: task.workflowRunId,
      plan_key: task.planKey,
      title: task.title,
      objective: task.objective,
      assigned_role: task.assignedRole,
      risk: task.risk,
      state: task.state,
      attempt: task.attempt,
      max_attempts: task.maxAttempts,
      idempotency_key: task.idempotencyKey,
      output: asJsonText(task.output),
      last_error: asJsonText(task.lastError)
    }, { onConflict: 'id' });
    SupabaseExecutionStore.throwIfError(error);

    const { error: deleteError } = await this.client
      .from('task_dependencies')
      .delete()
      .eq('task_id', task.id);
    SupabaseExecutionStore.throwIfError(deleteError);

    if (task.dependsOn.length) {
      const { error: dependencyError } = await this.client.from('task_dependencies').insert(
        task.dependsOn.map((dependencyId) => ({
          task_id: task.id,
          depends_on_task_id: dependencyId
        }))
      );
      SupabaseExecutionStore.throwIfError(dependencyError);
    }
  }

  async saveRun(run: AgentRun): Promise<void> {
    if (!run.projectId) throw new Error('AgentRun.projectId is required for Supabase persistence');
    const { error } = await this.client.from('agent_runs').upsert({
      id: run.id,
      owner_id: run.ownerId,
      workflow_run_id: run.workflowRunId,
      project_id: run.projectId,
      task_id: run.taskId ?? null,
      role: run.role,
      state: run.state,
      attempt: run.attempt,
      provider: process.env.OPENAI_API_KEY ? 'openai' : 'deterministic',
      input: null,
      output: asJsonText(run.output),
      error: asJsonText(run.error),
      started_at: run.startedAt,
      completed_at: run.completedAt ?? null
    }, { onConflict: 'id' });
    SupabaseExecutionStore.throwIfError(error);
  }

  async saveApproval(approval: Approval): Promise<void> {
    const { error } = await this.client.from('approvals').upsert({
      id: approval.id,
      owner_id: approval.ownerId,
      workflow_run_id: approval.workflowRunId,
      project_id: approval.projectId,
      task_id: approval.taskId,
      risk: approval.risk,
      status: approval.status,
      reason: approval.reason,
      created_at: approval.createdAt,
      decided_at: approval.decidedAt ?? null
    }, { onConflict: 'id' });
    SupabaseExecutionStore.throwIfError(error);
  }

  async appendAudit(event: AuditEvent): Promise<void> {
    const { error } = await this.client.from('audit_events').upsert({
      id: event.id,
      owner_id: event.ownerId,
      workflow_run_id: event.workflowRunId,
      project_id: event.projectId ?? null,
      entity_type: event.entityType,
      entity_id: event.entityId ?? null,
      event: event.event,
      actor: event.actor,
      data: event.data ?? {},
      created_at: event.at
    }, { onConflict: 'id' });
    SupabaseExecutionStore.throwIfError(error);
  }

  async getByIdempotencyKey(ownerId: string, key: string): Promise<WorkflowResult | undefined> {
    const { data, error } = await this.client
      .from('workflow_runs')
      .select('checkpoint')
      .eq('owner_id', ownerId)
      .eq('idempotency_key', key)
      .maybeSingle();
    SupabaseExecutionStore.throwIfError(error);
    return data?.checkpoint ? data.checkpoint as WorkflowResult : undefined;
  }

  async saveIdempotentResult(key: string, result: WorkflowResult): Promise<void> {
    const terminal = result.state === 'completed' || result.state === 'failed' || result.state === 'cancelled';
    const { error } = await this.client.from('workflow_runs').upsert({
      id: result.workflowRunId,
      owner_id: result.ownerId,
      project_id: result.project.id,
      idempotency_key: key,
      state: result.state,
      current_step: result.tasks.find((task) => !['completed', 'cancelled'].includes(task.state))?.planKey ?? 'review',
      checkpoint: result,
      attempt: Math.max(0, ...result.tasks.map((task) => task.attempt)),
      max_attempts: Math.max(1, ...result.tasks.map((task) => task.maxAttempts)),
      updated_at: result.updatedAt,
      completed_at: terminal ? result.project.completedAt ?? result.updatedAt : null
    }, { onConflict: 'id' });
    SupabaseExecutionStore.throwIfError(error);
  }
}
