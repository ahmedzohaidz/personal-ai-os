# Architecture Decision Records — summary

## ADR-001 — Clean-room build

**Decision:** No code or runtime dependency from AI Workforce OS.

**Reason:** The previous system has not been sufficiently proven for this product's trust boundary.

## ADR-002 — Database is source of truth

**Decision:** AI conversation history is context, not authoritative project state.

**Reason:** Project state must be queryable, auditable, resumable, and deterministic.

## ADR-003 — Five agents only in V1

**Decision:** Chief of Staff, Planner, Researcher, Executor, Reviewer.

**Reason:** More agents increase orchestration complexity before correctness is proven.

## ADR-004 — Reviewer is independent

**Decision:** Executor cannot approve its own work.

**Reason:** Separation improves detectability of incomplete or fabricated completion claims.

## ADR-005 — Zero-cost runtime first

**Decision:** Deterministic agents + local file persistence are the default until paid services are explicitly approved.

**Reason:** Core correctness should not depend on recurring spend.

## ADR-006 — Temporal is optional, not foundational

**Decision:** Keep durable-workflow concepts provider-neutral. Temporal can be adopted later if scale justifies it.

**Reason:** Avoid lock-in and paid infrastructure before workload proves the need.

## ADR-007 — Structured outputs for planning

**Decision:** OpenAI intake, planning, and review use SDK schema validation instead of parsing JSON text manually.

**Reason:** Removes a common class of brittle model-output failures.
