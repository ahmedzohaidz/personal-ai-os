$ErrorActionPreference = 'Stop'

Write-Host '== Personal AI OS publish ==' -ForegroundColor Cyan

function Require-Cmd($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $name"
  }
}

Require-Cmd node
Require-Cmd npm
Require-Cmd git
Require-Cmd gh

Write-Host '1/6 Installing dependencies...'
npm install --no-audit --no-fund

Write-Host '2/6 Running tests...'
npm test

Write-Host '3/6 Production build...'
npm run build

if (-not (Test-Path '.git')) {
  git init
  git branch -M main
}

if (-not (git config user.name)) { git config user.name 'ibrahimalzuhait-max' }
if (-not (git config user.email)) { git config user.email 'ibrahimalzuhait-max@users.noreply.github.com' }

git add -A
if (git status --porcelain) {
  git commit -m 'feat: publish Personal AI OS v0.4'
}

gh auth status | Out-Host

$repo = 'ibrahimalzuhait-max/personal-ai-os'
$repoExists = $true
try { gh repo view $repo --json name | Out-Null } catch { $repoExists = $false }

Write-Host '4/6 Publishing to GitHub...'
if (-not $repoExists) {
  if (git remote get-url origin 2>$null) { git remote remove origin }
  gh repo create $repo --private --source=. --remote=origin --push --description 'Personal AI operating system for goals, projects and AI-agent execution'
} else {
  if (git remote get-url origin 2>$null) { git remote set-url origin "https://github.com/$repo.git" } else { git remote add origin "https://github.com/$repo.git" }
  git branch -M main
  git push -u origin main
}

Write-Host '5/6 Deploying to Vercel Production...'
npx --yes vercel@latest link --yes --project personal-ai-os --scope autoaifix-5960s-projects
npx --yes vercel@latest git connect --yes
$deployment = npx --yes vercel@latest deploy --prod --yes --scope autoaifix-5960s-projects
$deployment | Out-Host

Write-Host '6/6 Done.' -ForegroundColor Green
Write-Host "GitHub: https://github.com/$repo"
Write-Host 'Vercel deployment URL is shown above.'
