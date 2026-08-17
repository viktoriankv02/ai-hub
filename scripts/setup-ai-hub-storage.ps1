$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root "data"
$storePath = Join-Path $dataDir "ai-jobs.json"

if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir | Out-Null
    Write-Host "Created $dataDir"
} else {
    Write-Host "Data directory already exists: $dataDir"
}

if (-not (Test-Path $storePath)) {
    '{"jobs":[]}' | Set-Content -Path $storePath -Encoding UTF8
    Write-Host "Created empty AI job store: $storePath"
} else {
    Write-Host "AI job store already exists: $storePath"
}

Write-Host ""
Write-Host "AI Hub storage is ready."
Write-Host "Store: $storePath"
Write-Host "Start API with: npm run ai-jobs:server"
Write-Host "Run smoke test with: npm run ai-jobs:smoke"
