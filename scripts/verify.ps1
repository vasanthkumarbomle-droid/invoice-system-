$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Write-Host ''
Write-Host '=== LedgerFlow verification ===' -ForegroundColor Cyan
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is not installed or not on PATH.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is not installed or not on PATH. Install Node.js 22+ first.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm is not installed or not on PATH.' }
$nodeMajor = [int]((node -p "process.versions.node.split('.')[0]").Trim())
Write-Host "Node.js major version: $nodeMajor"
if ($nodeMajor -lt 22) { throw "LedgerFlow requires Node.js 22 or later. Current major version: $nodeMajor" }
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (-not (Test-Path 'package.json')) { throw "package.json not found at $root" }
$branch = (git branch --show-current).Trim()
if ($branch -ne 'main') { throw "Current branch is '$branch', not main. Open main or use a clean clone; no branch switch was made." }
Write-Host ''
Write-Host '[1/4] Checking working tree...' -ForegroundColor Cyan
$dirty = @(git status --porcelain)
if ($LASTEXITCODE -ne 0) { throw 'git status failed.' }
if ($dirty.Count -gt 0) { Write-Host ($dirty -join "`n") -ForegroundColor Yellow; throw 'Working tree has local changes. Commit/stash them or use a clean clone; script will not overwrite them.' }
Write-Host '[2/4] Updating main from origin...' -ForegroundColor Cyan
git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { throw 'Could not fast-forward from origin/main. No reset was performed.' }
Write-Host '[3/4] Installing locked dependencies...' -ForegroundColor Cyan
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. Read the npm error above; checks were stopped.' }
$failed = @()
Write-Host '[4/4] Running tests, lint and production build...' -ForegroundColor Cyan
Write-Host '--- Unit tests ---' -ForegroundColor Cyan
npm test
if ($LASTEXITCODE -ne 0) { $failed += 'Unit tests' }
Write-Host '--- ESLint ---' -ForegroundColor Cyan
npm run lint
if ($LASTEXITCODE -ne 0) { $failed += 'ESLint' }
Write-Host '--- Production build ---' -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { $failed += 'Production build' }
Write-Host ''
if ($failed.Count -eq 0) { Write-Host 'All local checks passed. Live Supabase RLS/RPCs, email delivery and browser workflows are NOT tested by this script.' -ForegroundColor Green; exit 0 }
Write-Host ('Failed checks: ' + ($failed -join ', ')) -ForegroundColor Red
exit 1