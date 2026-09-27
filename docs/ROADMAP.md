# Roadmap

## V0.2 — Foundation proof ✅

- Clean-room core
- Five fixed agent roles
- Golden Workflow
- dependency-aware plans
- idempotency
- retry
- checkpoint/resume
- approval/rejection gates
- local durable JSON persistence
- Arabic RTL mobile-first command center
- production-oriented Supabase schema draft
- OpenAI structured-output adapter
- 9 passing core/persistence tests

## V0.3 — Free Supabase persistence + Auth

Exit criteria:

- fresh Supabase project on zero-cost plan
- schema applied through a reviewed migration
- Auth with one owner account
- RLS verified with positive and negative tests
- Supabase persistence adapter implements the same `ExecutionStore` contract
- local JSON adapter remains available for offline development
- security and performance advisors reviewed with no unresolved critical findings

## V0.4 — Durable background worker

- command submission becomes fast enqueue, not long HTTP execution
- worker leases + heartbeats
- crash recovery from checkpoint
- backoff scheduling instead of immediate retry
- stale-run reclamation
- concurrency limits per owner/project
- graceful shutdown and resume tests

## V0.5 — Tool Gateway + MCP

- Tool Registry
- per-tool role permissions
- risk classification
- approval gates around side effects
- tool-call idempotency
- verifiable tool receipts
- MCP adapters added one at a time

## V0.6 — Memory

- project memory
- decision memory
- retrieval policies
- embeddings only after the retrieval use case is proven
- no vector database as a replacement for structured state

## V0.7 — Proactive operations

- schedules and event triggers
- Daily Brief
- Next Best Action
- opportunity monitors
- notification policy and quiet hours

## Production gate

Production is not declared until:

- full dependency install succeeds
- full TypeScript check succeeds
- Next.js production build succeeds
- E2E browser flow succeeds
- Supabase RLS tests succeed
- restart/resume test succeeds
- duplicate-side-effect test succeeds
- approval bypass test fails as expected
- secret scan is clean
