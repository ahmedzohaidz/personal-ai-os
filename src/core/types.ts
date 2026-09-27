export type EntityId = string;

export type AgentRole =
  | 'chief_of_staff'
  | 'planner'
  | 'researcher'
  | 'executor'
  | 'reviewer';

export type WorkflowState =
  | 'queued'
  | 'running'
  | 'waiting_for_approval'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type RiskLevel = 'read' | 'safe_write' | 'approval' | 'strong_approval';

export interface Intake {
  title: string;
  outcome: string;
  successCriteria: string[];
}

export interface Goal {
  id: EntityId;
  ownerId: EntityId;
  title: string;
  outcome: string;
  successCriteria: string[];
  status: 'active' | 'completed' | 'cancelled';
  createdAt: string;
}

export interface Project {
  id: EntityId;
  goalId: EntityId;
  ownerId: EntityId;
  title: string;
  status: 'planned' | 'active' | 'completed' | 'blocked' | 'cancelled';
  progress: number;
  createdAt: string;
  completedAt?: string;
}

export interface PlanTask {
  key: string;
  title: string;
  objective: string;
  assignedRole: Extract<AgentRole, 'researcher' | 'executor'>;
  risk: RiskLevel;
  dependsOn: string[];
}

export interface Plan {
  summary: string;
  tasks: PlanTask[];
}

export interface TaskSpec {
  id: EntityId;
  ownerId: EntityId;
  workflowRunId: EntityId;
  projectId: EntityId;
  planKey: string;
  title: string;
  objective: string;
  assignedRole: AgentRole;
  risk: RiskLevel;
  state: WorkflowState;
  dependsOn: EntityId[];
  attempt: number;
  maxAttempts: number;
  idempotencyKey: string;
  output?: string;
  lastError?: string;
}

export interface AgentRun {
  id: EntityId;
  ownerId: EntityId;
  workflowRunId: EntityId;
  projectId?: EntityId;
  taskId?: EntityId;
  role: AgentRole;
  state: WorkflowState;
  attempt: number;
  startedAt: string;
  completedAt?: string;
  output?: string;
  error?: string;
}

export interface Approval {
  id: EntityId;
  ownerId: EntityId;
  workflowRunId: EntityId;
  projectId: EntityId;
  taskId: EntityId;
  risk: Extract<RiskLevel, 'approval' | 'strong_approval'>;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  createdAt: string;
  decidedAt?: string;
}

export interface AuditEvent {
  id: EntityId;
  ownerId: EntityId;
  workflowRunId: EntityId;
  projectId?: EntityId;
  entityType: 'goal' | 'project' | 'task' | 'agent_run' | 'approval' | 'workflow' | 'system';
  entityId?: EntityId;
  event: string;
  actor: 'user' | 'system' | AgentRole;
  at: string;
  data?: Record<string, unknown>;
}

export interface WorkflowResult {
  workflowRunId: EntityId;
  idempotencyKey: string;
  ownerId: EntityId;
  state: WorkflowState;
  goal: Goal;
  project: Project;
  plan: Plan;
  tasks: TaskSpec[];
  runs: AgentRun[];
  approvals: Approval[];
  audit: AuditEvent[];
  finalSummary: string;
  reviewerApproved: boolean;
  updatedAt: string;
}
