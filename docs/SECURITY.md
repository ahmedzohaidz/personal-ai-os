# Security model — V0.2

## Trust boundary

Browser → authenticated server route → domain orchestration → agent policy → tool policy → external service.

The browser never owns execution state and never receives server secrets.

## Supabase keys

- Browser: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` only.
- Server: `SUPABASE_SECRET_KEY` only in server-controlled code.
- Never expose the secret key in client bundles, logs, screenshots, or source control.
- Do not use user-editable metadata for authorization.

## Database access

V1 grants authenticated clients read-only access to their own rows with RLS. All mutations flow through server endpoints after identity verification. RLS remains enabled as defense in depth.

## Agent safety

Risk levels:

- `read`: read-only work.
- `safe_write`: internal reversible write.
- `approval`: external side effect requires explicit human approval.
- `strong_approval`: destructive, financial, credential, or production-impacting action requires explicit human approval and should later support step-up authentication.

A model response alone is never proof that a tool action succeeded. Tool execution must return a verifiable result that is persisted in `tool_calls` and `audit_events`.

## Idempotency

Every workflow, task, and external tool call must have an idempotency key. Replays must return the prior result or resume the same workflow; they must not create duplicate side effects.

## Durable execution

The durable schema supports workflow checkpoints, leases, heartbeats, retries, and resumable approvals. V0.2 uses an in-memory adapter for offline development; Supabase becomes the durable source of truth after the free project is created and verified.
