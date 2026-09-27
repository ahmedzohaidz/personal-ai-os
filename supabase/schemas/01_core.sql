-- Personal AI OS V0.2 — clean-room production schema draft.
-- Do not run against an existing project. Intended for a fresh Supabase project.
-- Client access is read-only in V1. Server writes use a Supabase secret key after
-- verifying the authenticated user's identity. Secret keys must never reach the browser.

create extension if not exists pgcrypto;

create type public.goal_status as enum ('active','completed','cancelled');
create type public.project_status as enum ('planned','active','completed','blocked','cancelled');
create type public.workflow_state as enum ('queued','running','waiting_for_approval','retrying','completed','failed','cancelled');
create type public.risk_level as enum ('read','safe_write','approval','strong_approval');
create type public.agent_role as enum ('chief_of_staff','planner','researcher','executor','reviewer');
create type public.approval_status as enum ('pending','approved','rejected');

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  outcome text not null check (char_length(outcome) between 1 and 4000),
  success_criteria jsonb not null default '[]'::jsonb,
  status public.goal_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  status public.project_status not null default 'planned',
  progress smallint not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 160),
  state public.workflow_state not null default 'queued',
  current_step text,
  checkpoint jsonb not null default '{}'::jsonb,
  attempt integer not null default 0 check (attempt >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  locked_by text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  last_error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(owner_id, idempotency_key)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  plan_key text not null check (char_length(plan_key) between 1 and 50),
  title text not null check (char_length(title) between 1 and 180),
  objective text not null check (char_length(objective) between 1 and 2000),
  assigned_role public.agent_role not null,
  risk public.risk_level not null default 'read',
  state public.workflow_state not null default 'queued',
  attempt integer not null default 0 check (attempt >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  idempotency_key text not null,
  output jsonb,
  last_error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, idempotency_key),
  unique(workflow_run_id, plan_key)
);

create table public.task_dependencies (
  task_id uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  primary key(task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  role public.agent_role not null,
  state public.workflow_state not null,
  attempt integer not null default 1 check (attempt >= 1),
  provider text not null default 'deterministic',
  model text,
  trace_id text,
  input jsonb,
  output jsonb,
  error jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  risk public.risk_level not null check (risk in ('approval','strong_approval')),
  status public.approval_status not null default 'pending',
  reason text not null,
  decision_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table public.tool_calls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  tool_name text not null,
  risk public.risk_level not null,
  state public.workflow_state not null,
  idempotency_key text not null,
  input jsonb,
  output jsonb,
  error jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(owner_id, idempotency_key)
);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  workflow_run_id uuid references public.workflow_runs(id) on delete cascade,
  title text not null,
  decision text not null,
  rationale text,
  alternatives jsonb not null default '[]'::jsonb,
  actor text not null,
  created_at timestamptz not null default now()
);

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  workflow_run_id uuid references public.workflow_runs(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  kind text not null,
  title text not null,
  uri text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  scope text not null check (scope in ('working','session','project','long_term','decision')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workflow_run_id uuid references public.workflow_runs(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  event text not null,
  actor text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- RLS policy predicates depend on owner_id, so index owner_id everywhere it is used.
create index goals_owner_status_idx on public.goals(owner_id, status);
create index projects_owner_status_idx on public.projects(owner_id, status);
create index workflows_owner_state_idx on public.workflow_runs(owner_id, state, updated_at desc);
create index workflows_lease_idx on public.workflow_runs(state, lease_expires_at) where state in ('queued','running','retrying');
create index tasks_workflow_state_idx on public.tasks(workflow_run_id, state);
create index tasks_owner_state_idx on public.tasks(owner_id, state);
create index task_dependencies_dep_idx on public.task_dependencies(depends_on_task_id);
create index agent_runs_workflow_idx on public.agent_runs(workflow_run_id, started_at desc);
create index approvals_owner_status_idx on public.approvals(owner_id, status, created_at desc);
create index tool_calls_workflow_idx on public.tool_calls(workflow_run_id, started_at desc);
create index decisions_project_idx on public.decisions(project_id, created_at desc);
create index artifacts_project_idx on public.artifacts(project_id, created_at desc);
create index memories_owner_scope_idx on public.memories(owner_id, scope, created_at desc);
create index audit_project_created_idx on public.audit_events(project_id, created_at desc);

-- Maintain updated_at on mutable aggregate tables.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger goals_set_updated_at before update on public.goals for each row execute function public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger workflows_set_updated_at before update on public.workflow_runs for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks for each row execute function public.set_updated_at();

revoke all on function public.set_updated_at() from public, anon, authenticated;

-- Defense in depth: enable RLS on every exposed table.
alter table public.goals enable row level security;
alter table public.projects enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.tasks enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.agent_runs enable row level security;
alter table public.approvals enable row level security;
alter table public.tool_calls enable row level security;
alter table public.decisions enable row level security;
alter table public.artifacts enable row level security;
alter table public.memories enable row level security;
alter table public.audit_events enable row level security;

-- V1 browser model: authenticated users may read only their rows. All mutations
-- go through the trusted server, which first verifies the user and then uses the
-- server-only Supabase secret key. The secret key bypasses RLS by design.
create policy goals_owner_select on public.goals for select to authenticated using ((select auth.uid()) = owner_id);
create policy projects_owner_select on public.projects for select to authenticated using ((select auth.uid()) = owner_id);
create policy workflows_owner_select on public.workflow_runs for select to authenticated using ((select auth.uid()) = owner_id);
create policy tasks_owner_select on public.tasks for select to authenticated using ((select auth.uid()) = owner_id);
create policy agent_runs_owner_select on public.agent_runs for select to authenticated using ((select auth.uid()) = owner_id);
create policy approvals_owner_select on public.approvals for select to authenticated using ((select auth.uid()) = owner_id);
create policy tool_calls_owner_select on public.tool_calls for select to authenticated using ((select auth.uid()) = owner_id);
create policy decisions_owner_select on public.decisions for select to authenticated using ((select auth.uid()) = owner_id);
create policy artifacts_owner_select on public.artifacts for select to authenticated using ((select auth.uid()) = owner_id);
create policy memories_owner_select on public.memories for select to authenticated using ((select auth.uid()) = owner_id);
create policy audit_owner_select on public.audit_events for select to authenticated using ((select auth.uid()) = owner_id);

-- Dependencies inherit access through the owning task. This avoids exposing rows
-- for projects the signed-in user does not own.
create policy task_dependencies_owner_select on public.task_dependencies for select to authenticated
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_dependencies.task_id
      and t.owner_id = (select auth.uid())
  )
);

revoke all on public.goals, public.projects, public.workflow_runs, public.tasks,
  public.task_dependencies, public.agent_runs, public.approvals, public.tool_calls,
  public.decisions, public.artifacts, public.memories, public.audit_events from anon;

revoke insert, update, delete on public.goals, public.projects, public.workflow_runs, public.tasks,
  public.task_dependencies, public.agent_runs, public.approvals, public.tool_calls,
  public.decisions, public.artifacts, public.memories, public.audit_events from authenticated;

grant select on public.goals, public.projects, public.workflow_runs, public.tasks,
  public.task_dependencies, public.agent_runs, public.approvals, public.tool_calls,
  public.decisions, public.artifacts, public.memories, public.audit_events to authenticated;
