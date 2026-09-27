import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ExecutionStore } from '../../core/contracts.js';
import type { AgentRun, Approval, AuditEvent, Goal, Project, TaskSpec, WorkflowResult } from '../../core/types.js';

type JsonState = {
  goals: Record<string, Goal>;
  projects: Record<string, Project>;
  tasks: Record<string, TaskSpec>;
  runs: Record<string, AgentRun>;
  approvals: Record<string, Approval>;
  audit: AuditEvent[];
  idempotency: Record<string, WorkflowResult>;
};

const emptyState = (): JsonState => ({
  goals: {},
  projects: {},
  tasks: {},
  runs: {},
  approvals: {},
  audit: [],
  idempotency: {}
});

export class JsonFileExecutionStore implements ExecutionStore {
  private state: JsonState = emptyState();
  private readonly ready: Promise<void>;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {
    this.ready = this.load();
  }

  private async load(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<JsonState>;
      this.state = {
        goals: parsed.goals ?? {},
        projects: parsed.projects ?? {},
        tasks: parsed.tasks ?? {},
        runs: parsed.runs ?? {},
        approvals: parsed.approvals ?? {},
        audit: parsed.audit ?? [],
        idempotency: parsed.idempotency ?? {}
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw error;
      await this.persist();
    }
  }

  private async persist(): Promise<void> {
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, JSON.stringify(this.state, null, 2), 'utf8');
    await rename(tempPath, this.filePath);
  }

  private async mutate(action: () => void): Promise<void> {
    await this.ready;
    const previous = this.mutationQueue;
    let release!: () => void;
    this.mutationQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      action();
      await this.persist();
    } finally {
      release();
    }
  }

  async saveGoal(goal: Goal): Promise<void> {
    await this.mutate(() => { this.state.goals[goal.id] = structuredClone(goal); });
  }

  async saveProject(project: Project): Promise<void> {
    await this.mutate(() => { this.state.projects[project.id] = structuredClone(project); });
  }

  async saveTask(task: TaskSpec): Promise<void> {
    await this.mutate(() => { this.state.tasks[task.id] = structuredClone(task); });
  }

  async saveRun(run: AgentRun): Promise<void> {
    await this.mutate(() => { this.state.runs[run.id] = structuredClone(run); });
  }

  async saveApproval(approval: Approval): Promise<void> {
    await this.mutate(() => { this.state.approvals[approval.id] = structuredClone(approval); });
  }

  async appendAudit(event: AuditEvent): Promise<void> {
    await this.mutate(() => { this.state.audit.push(structuredClone(event)); });
  }

  async getByIdempotencyKey(ownerId: string, key: string): Promise<WorkflowResult | undefined> {
    await this.ready;
    await this.mutationQueue;
    const value = this.state.idempotency[`${ownerId}:${key}`];
    return value ? structuredClone(value) : undefined;
  }

  async saveIdempotentResult(key: string, result: WorkflowResult): Promise<void> {
    await this.mutate(() => { this.state.idempotency[`${result.ownerId}:${key}`] = structuredClone(result); });
  }
}
