import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decideApprovalAndResume,
  executeGoldenWorkflow,
  resumeGoldenWorkflow
} from '../.core-dist/goldenWorkflow.js';
import { MemoryExecutionStore } from '../.core-dist/memoryStore.js';
import { DeterministicAgentProvider } from '../.core-dist/deterministicAgents.js';
import { SequentialIdGenerator } from '../.core-dist/runtime.js';
import { assertTransition } from '../.core-dist/stateMachine.js';
import { validateAndSortPlan } from '../.core-dist/plan.js';

class FixedClock {
  constructor() { this.tick = 0; }
  now() {
    this.tick += 1;
    return new Date(Date.UTC(2026, 8, 26, 20, 0, this.tick)).toISOString();
  }
}

function makeDeps(store = new MemoryExecutionStore(), agents = new DeterministicAgentProvider()) {
  return { store, agents, clock: new FixedClock(), ids: new SequentialIdGenerator() };
}

test('golden workflow completes end-to-end through all five agent roles', async () => {
  const deps = makeDeps();
  const result = await executeGoldenWorkflow(
    { ownerId: 'user_1', command: 'أطلق مشروعًا تجريبيًا موثوقًا', idempotencyKey: 'golden-1' },
    deps
  );

  assert.equal(result.state, 'completed');
  assert.equal(result.goal.status, 'completed');
  assert.equal(result.project.status, 'completed');
  assert.equal(result.project.progress, 100);
  assert.equal(result.tasks.length, 2);
  assert.ok(result.tasks.every((task) => task.state === 'completed'));
  assert.equal(result.reviewerApproved, true);
  assert.deepEqual(new Set(result.runs.map((run) => run.role)), new Set([
    'chief_of_staff', 'planner', 'researcher', 'executor', 'reviewer'
  ]));
  assert.ok(result.audit.some((event) => event.event === 'project.completed'));
});

test('idempotency returns the same workflow result without duplicate persistence', async () => {
  const store = new MemoryExecutionStore();
  const deps = makeDeps(store);
  const input = { ownerId: 'user_1', command: 'اختبار التكرار', idempotencyKey: 'same-key' };
  const first = await executeGoldenWorkflow(input, deps);
  const second = await executeGoldenWorkflow(input, deps);
  assert.deepEqual(second, first);
  assert.equal(store.goals.size, 1);
  assert.equal(store.projects.size, 1);
});


test('idempotency keys are isolated per owner', async () => {
  const store = new MemoryExecutionStore();
  const deps = makeDeps(store);
  const a = await executeGoldenWorkflow(
    { ownerId: 'user_a', command: 'مشروع أ', idempotencyKey: 'shared-key' }, deps
  );
  const b = await executeGoldenWorkflow(
    { ownerId: 'user_b', command: 'مشروع ب', idempotencyKey: 'shared-key' }, deps
  );
  assert.notEqual(a.workflowRunId, b.workflowRunId);
  assert.notEqual(a.project.id, b.project.id);
  assert.equal(store.goals.size, 2);
});

test('approval pauses workflow and approved decision resumes to completion', async () => {
  class ApprovalProvider extends DeterministicAgentProvider {
    async plan(input) {
      return {
        summary: `Approval plan: ${input}`,
        tasks: [{
          key: 'publish',
          title: 'نشر النتيجة',
          objective: 'إجراء كتابة خارجية حساسة',
          assignedRole: 'executor',
          risk: 'approval',
          dependsOn: []
        }]
      };
    }
  }

  const deps = makeDeps(new MemoryExecutionStore(), new ApprovalProvider());
  const pending = await executeGoldenWorkflow(
    { ownerId: 'user_1', command: 'نفذ إجراء يحتاج موافقة', idempotencyKey: 'approval-1' },
    deps
  );
  assert.equal(pending.state, 'waiting_for_approval');
  assert.equal(pending.project.status, 'blocked');
  assert.equal(pending.approvals.length, 1);
  assert.equal(pending.approvals[0].status, 'pending');
  assert.equal(pending.tasks[0].state, 'waiting_for_approval');

  const completed = await decideApprovalAndResume({
    ownerId: 'user_1',
    idempotencyKey: 'approval-1',
    approvalId: pending.approvals[0].id,
    decision: 'approved'
  }, deps);

  assert.equal(completed.state, 'completed');
  assert.equal(completed.approvals[0].status, 'approved');
  assert.equal(completed.tasks[0].state, 'completed');
  assert.equal(completed.reviewerApproved, true);
});

test('rejected approval cancels workflow without executing sensitive task', async () => {
  class ApprovalProvider extends DeterministicAgentProvider {
    async plan() {
      return {
        summary: 'Sensitive plan',
        tasks: [{
          key: 'danger',
          title: 'حذف مورد',
          objective: 'حذف مورد خارجي',
          assignedRole: 'executor',
          risk: 'strong_approval',
          dependsOn: []
        }]
      };
    }
  }

  const provider = new ApprovalProvider();
  let executions = 0;
  provider.run = async () => { executions += 1; return 'should not run'; };
  const deps = makeDeps(new MemoryExecutionStore(), provider);
  const pending = await executeGoldenWorkflow(
    { ownerId: 'user_1', command: 'مهمة حساسة', idempotencyKey: 'approval-reject' }, deps
  );
  const cancelled = await decideApprovalAndResume({
    ownerId: 'user_1',
    idempotencyKey: 'approval-reject',
    approvalId: pending.approvals[0].id,
    decision: 'rejected'
  }, deps);

  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.project.status, 'cancelled');
  assert.equal(cancelled.tasks[0].state, 'cancelled');
  assert.equal(executions, 0);
});

test('transient task failure retries and completes on the second attempt', async () => {
  class FlakyProvider extends DeterministicAgentProvider {
    constructor() { super(); this.calls = 0; }
    async run(role, input, context) {
      if (role === 'researcher') {
        this.calls += 1;
        if (this.calls === 1) throw new Error('temporary failure');
      }
      return super.run(role, input, context);
    }
  }

  const deps = makeDeps(new MemoryExecutionStore(), new FlakyProvider());
  const result = await executeGoldenWorkflow(
    { ownerId: 'user_1', command: 'اختبر إعادة المحاولة', idempotencyKey: 'retry-1' }, deps
  );
  const firstTask = result.tasks[0];
  assert.equal(result.state, 'completed');
  assert.equal(firstTask.attempt, 2);
  assert.ok(result.audit.some((event) => event.event === 'task.retry_scheduled'));
});

test('resume can recover a non-terminal checkpoint', async () => {
  class ApprovalProvider extends DeterministicAgentProvider {
    async plan() {
      return {
        summary: 'Pause then resume',
        tasks: [{ key: 'one', title: 'موافقة', objective: 'x', assignedRole: 'executor', risk: 'approval', dependsOn: [] }]
      };
    }
  }
  const deps = makeDeps(new MemoryExecutionStore(), new ApprovalProvider());
  const pending = await executeGoldenWorkflow(
    { ownerId: 'user_1', command: 'توقف', idempotencyKey: 'resume-1' }, deps
  );
  const stillPending = await resumeGoldenWorkflow({ ownerId: 'user_1', idempotencyKey: 'resume-1' }, deps);
  assert.equal(stillPending.state, 'waiting_for_approval');
  assert.equal(stillPending.approvals[0].id, pending.approvals[0].id);
});

test('plan validation rejects cycles and unknown dependencies', () => {
  assert.throws(() => validateAndSortPlan({
    summary: 'cycle',
    tasks: [
      { key: 'a', title: 'A', objective: 'A', assignedRole: 'executor', risk: 'read', dependsOn: ['b'] },
      { key: 'b', title: 'B', objective: 'B', assignedRole: 'executor', risk: 'read', dependsOn: ['a'] }
    ]
  }), /Cyclic/);

  assert.throws(() => validateAndSortPlan({
    summary: 'missing',
    tasks: [
      { key: 'a', title: 'A', objective: 'A', assignedRole: 'executor', risk: 'read', dependsOn: ['missing'] }
    ]
  }), /Unknown dependency/);
});

test('invalid terminal transition is rejected', () => {
  assert.throws(() => assertTransition('completed', 'running'), /Invalid workflow transition/);
});
