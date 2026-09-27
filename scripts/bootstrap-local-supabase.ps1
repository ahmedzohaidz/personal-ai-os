$ErrorActionPreference = 'Stop'

Write-Host 'Personal AI OS - Supabase Local bootstrap' -ForegroundColor Cyan

$nodeVersion = node -p "process.versions.node"
if (-not $nodeVersion) { throw 'Node.js 20+ is required.' }
$major = [int]($nodeVersion.Split('.')[0])
if ($major -lt 20) { throw "Node.js 20+ is required. Current: $nodeVersion" }

$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
  throw 'A Docker-compatible container runtime is required (Docker Desktop, Rancher Desktop, or Podman).'
}

docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Container runtime is installed but not running.' }

if (-not (Test-Path 'node_modules')) {
  npm install
}

npx supabase --help *> $null
if (-not (Test-Path 'supabase/config.toml')) {
  npx supabase init
}

npx supabase start

$migrations = Get-ChildItem 'supabase/migrations' -Filter '*.sql' -ErrorAction SilentlyContinue
if (-not $migrations) {
  npx supabase db diff -f initial_schema
}

npx supabase db reset
npx supabase status

Write-Host ''
Write-Host 'Supabase Local is ready.' -ForegroundColor Green
Write-Host 'Copy the Project URL, Publishable key, and Secret key printed above into .env.local.'
Write-Host 'Set PERSISTENCE_DRIVER=supabase only after Auth is configured.'
