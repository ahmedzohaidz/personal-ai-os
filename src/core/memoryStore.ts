import type { ExecutionStore } from './contracts.js';
import type { AgentRun, Approval, AuditEvent, Goal, Project, TaskSpec, WorkflowResult } from './types.js';

export class MemoryExecutionStore implements ExecutionStore {
  readonly goals = new Map<string, Goal>();
  readonly projects = new Map<string, Project>();
  readonly tasks = new Map<string, TaskSpec>();
  readonly runs = new Map<string, AgentRun>();
  readonly approvals = new Map<string, Approval>();
  readonly audit: AuditEvent[] = [];
  private readonly idempotency = new Map<string, WorkflowResult>();

  async saveGoal(goal: Goal): Promise<void> { this.goals.set(goal.id, structuredClone(goal)); }
  async saveProject(project: Project): Promise<void> { this.projects.set(project.id, structuredClone(project)); }
  async saveTask(task: TaskSpec): Promise<void> { this.tasks.set(task.id, structuredClone(task)); }
  async saveRun(run: AgentRun): Promise<void> { this.runs.set(run.id, structuredClone(run)); }
  async saveApproval(approval: Approval): Promise<void> { this.approvals.set(approval.id, structuredClone(approval)); }
  async appendAudit(event: AuditEvent): Promise<void> { this.audit.push(structuredClone(event)); }
  async getByIdempotencyKey(ownerId: string, key: string): Promise<WorkflowResult | undefined> {
    const value = this.idempotency.get(`${ownerId}:${key}`);
    return value ? structuredClone(value) : undefined;
  }
  async saveIdempotentResult(key: string, result: WorkflowResult): Promise<void> {
    this.idempotency.set(`${result.ownerId}:${key}`, structuredClone(result));
  }
}
