# Supabase Local — Zero-cost development

Personal AI OS V0.3 uses Supabase Local for database/Auth development because the connected Supabase organization has already reached the two-active-free-project limit. No existing cloud project is modified.

## Why local first

- Zero cloud cost and no project quota usage.
- Clean-room database isolated from existing projects.
- Full local Postgres, Auth, Storage and Studio.
- The same declarative schema can later generate migrations for a fresh cloud project.

> Supabase Local is a development environment only. Do not expose its ports to the public internet and do not use the default local credentials as production credentials.

## Windows bootstrap

Prerequisites:

1. Node.js 20+.
2. A running Docker-compatible container runtime.
3. PowerShell from the repository root.

Run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\bootstrap-local-supabase.ps1
```

The script:

1. installs pinned project dependencies if required;
2. initializes Supabase CLI configuration if missing;
3. starts the local Supabase stack;
4. generates the initial migration from `supabase/schemas/01_core.sql` when no migration exists;
5. rebuilds the local DB with `db reset`;
6. prints the local URL and keys.

Then create `.env.local` and set:

```text
PERSISTENCE_DRIVER=supabase
NEXT_PUBLIC_SUPABASE_URL=<local Project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local Publishable key>
SUPABASE_SECRET_KEY=<local Secret key>
```

Keep `SUPABASE_SECRET_KEY` server-only. Never prefix it with `NEXT_PUBLIC_`.

## Schema workflow

This project uses Supabase's declarative-schema workflow for new projects:

- edit `supabase/schemas/*.sql`;
- generate a migration with `npx supabase db diff -f <name>`;
- review the generated SQL;
- verify from scratch with `npx supabase db reset`;
- commit both schema and migration.

Do not edit the live local DB as the source of truth.
