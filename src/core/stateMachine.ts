import type { WorkflowState } from './types.js';

const transitions: Record<WorkflowState, ReadonlySet<WorkflowState>> = {
  queued: new Set(['running', 'cancelled']),
  running: new Set(['waiting_for_approval', 'retrying', 'completed', 'failed', 'cancelled']),
  waiting_for_approval: new Set(['running', 'cancelled']),
  retrying: new Set(['running', 'failed', 'cancelled']),
  completed: new Set(),
  failed: new Set(['retrying']),
  cancelled: new Set()
};

export function canTransition(from: WorkflowState, to: WorkflowState): boolean {
  return transitions[from].has(to);
}

export function assertTransition(from: WorkflowState, to: WorkflowState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid workflow transition: ${from} -> ${to}`);
  }
}
