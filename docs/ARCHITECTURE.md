# Personal AI OS — Architecture V0.2

## Product boundary

Personal AI OS is a clean-room system. It does not import or depend on AI Workforce OS.

The first invariant is the Golden Workflow:

`Command → Chief of Staff → Goal → Project → Planner → Tasks → Agent Runs → Reviewer → Result`

A feature is not considered complete unless it strengthens or safely extends that path.

## Layers

### 1. Domain/Core

Pure TypeScript. No Next.js, database, OpenAI, filesystem, or Temporal dependencies.

Owns:

- entities and invariants
- workflow state machine
- plan dependency validation and topological ordering
- risk and approval policy
- idempotency semantics
- retry and resume orchestration
- independent Reviewer gate

### 2. Application

Builds runtime composition and use cases around the core. The current local runtime selects:

- JSON file persistence by default
- deterministic agents with zero API cost
- OpenAI Agents provider only when `OPENAI_API_KEY` exists

### 3. Infrastructure

Adapters live behind core contracts:

- Local atomic JSON store — implemented and tested
- OpenAI Agents SDK — implemented, optional, uses Zod structured outputs
- Supabase/Postgres — schema prepared; adapter is the next persistence milestone
- Temporal — adapter sketch only; not required in V0.2 and not part of the zero-cost runtime

### 4. Delivery/UI

Next.js App Router, Arabic RTL, mobile-first. The browser sends commands and approval decisions to server routes. It does not own authoritative execution state.

## Workflow states

`queued → running → completed`

Additional paths:

- `running → waiting_for_approval → running`
- `running → retrying → running`
- `running → failed`
- any active state → `cancelled` where policy allows

Terminal states never transition back to active states.

## Idempotency

Every submitted workflow has one idempotency key. Re-submitting the same key returns the existing workflow instead of duplicating work.

Tasks and future external tool calls also receive independent idempotency keys. External side effects must not execute without a durable idempotency record.

## Approval model

Risk levels:

1. `read`
2. `safe_write`
3. `approval`
4. `strong_approval`

The last two pause the workflow. Approval is persisted separately from task state. Rejection cancels the sensitive path and does not call the executor.

## Reliability model

V0.2 proves:

- checkpoint snapshots
- resume semantics
- bounded retries
- dependency validation
- atomic local persistence
- independent review

The production Supabase model adds leases and heartbeats to `workflow_runs` so a worker can safely reclaim abandoned executions.

## Data ownership

Database rows are owned by `owner_id`. RLS is enabled on every exposed table. V1 client access is read-only. All writes go through trusted server routes after identity verification.

## AI provider design

The core never depends on a model provider. `AgentProvider` exposes four capabilities:

- intake
- plan
- execute
- review

OpenAI output for intake, planning, and review is validated through Zod structured outputs. Deterministic agents make tests reproducible and free.

## What V0.2 intentionally does not claim

- No production Supabase connection yet.
- No production authentication yet.
- No external tools or MCP execution yet.
- No long-running background worker yet; the current HTTP demo executes the small Golden Workflow in-process.
- No paid Temporal Cloud dependency.
- No production deployment yet.
