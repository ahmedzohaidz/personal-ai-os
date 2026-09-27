import type {
  AgentRole,
  AgentRun,
  Approval,
  AuditEvent,
  Goal,
  Intake,
  Plan,
  Project,
  TaskSpec,
  WorkflowResult
} from './types.js';

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  next(prefix: string): string;
}

export interface AgentContext {
  goal?: Goal;
  project?: Project;
  task?: TaskSpec;
  completedTasks?: TaskSpec[];
}

export interface AgentProvider {
  intake(command: string): Promise<Intake>;
  plan(input: string, context: AgentContext): Promise<Plan>;
  run(role: AgentRole, input: string, context: AgentContext): Promise<string>;
  review(input: string, context: AgentContext): Promise<{ approved: boolean; summary: string }>;
}

export interface ExecutionStore {
  saveGoal(goal: Goal): Promise<void>;
  saveProject(project: Project): Promise<void>;
  saveTask(task: TaskSpec): Promise<void>;
  saveRun(run: AgentRun): Promise<void>;
  saveApproval(approval: Approval): Promise<void>;
  appendAudit(event: AuditEvent): Promise<void>;
  getByIdempotencyKey(ownerId: string, key: string): Promise<WorkflowResult | undefined>;
  saveIdempotentResult(key: string, result: WorkflowResult): Promise<void>;
}
