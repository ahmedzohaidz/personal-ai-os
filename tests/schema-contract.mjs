import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const schema = await readFile(new URL('../supabase/schemas/01_core.sql', import.meta.url), 'utf8');

const exposedTables = [
  'goals','projects','workflow_runs','tasks','task_dependencies','agent_runs',
  'approvals','tool_calls','decisions','artifacts','memories','audit_events'
];

test('Supabase schema contract is RLS-first and workflow-linked', () => {
  for (const table of exposedTables) {
    assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security;`));
  }

  for (const table of exposedTables.filter((name) => name !== 'task_dependencies')) {
    assert.match(schema, new RegExp(`create policy [^\\n]+ on public\\.${table} for select to authenticated`));
  }

  assert.match(schema, /workflow_run_id uuid not null references public\.workflow_runs\(id\) on delete cascade/);
  assert.match(schema, /unique\(owner_id, idempotency_key\)/);
  assert.match(schema, /revoke insert, update, delete on public\.goals/);
  assert.doesNotMatch(schema, /grant\s+(insert|update|delete|all).*to\s+authenticated/i);
  assert.doesNotMatch(schema, /service_role|sb_secret_/i);
});
