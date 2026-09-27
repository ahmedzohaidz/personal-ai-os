import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonFileExecutionStore } from '../.local-dist/infrastructure/local/jsonFileStore.js';
import { executeGoldenWorkflow } from '../.local-dist/core/goldenWorkflow.js';
import { DeterministicAgentProvider } from '../.local-dist/core/deterministicAgents.js';
import { SequentialIdGenerator } from '../.local-dist/core/runtime.js';

class Clock {
  now() { return new Date().toISOString(); }
}

test('local JSON store survives a new store instance', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'personal-ai-os-'));
  const file = join(dir, 'state.json');
  const firstStore = new JsonFileExecutionStore(file);
  const result = await executeGoldenWorkflow(
    { ownerId: 'user_1', command: 'اختبر التخزين المحلي', idempotencyKey: 'persist-123' },
    { store: firstStore, agents: new DeterministicAgentProvider(), clock: new Clock(), ids: new SequentialIdGenerator() }
  );
  assert.equal(result.state, 'completed');

  const secondStore = new JsonFileExecutionStore(file);
  const recovered = await secondStore.getByIdempotencyKey('user_1', 'persist-123');
  assert.equal(recovered?.project.status, 'completed');
  assert.equal(recovered?.idempotencyKey, 'persist-123');

  const raw = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(Object.keys(raw.idempotency).length, 1);
});
