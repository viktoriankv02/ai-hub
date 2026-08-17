param(
  [string]$DataDir = "D:\ai-hub-data"
)

$ErrorActionPreference = "Stop"

Write-Host "AI Hub storage bootstrap" -ForegroundColor Cyan
Write-Host "Target: $DataDir"

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DataDir "logs") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DataDir "jobs") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DataDir "deployments") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DataDir "cache") | Out-Null

[Environment]::SetEnvironmentVariable("AI_HUB_DATA_DIR", $DataDir, "User")
$env:AI_HUB_DATA_DIR = $DataDir

Write-Host ""
Write-Host "AI_HUB_DATA_DIR=$DataDir" -ForegroundColor Green
Write-Host "Created: logs, jobs, deployments, cache" -ForegroundColor Green
Write-Host ""
Write-Host "Open a new PowerShell window before starting long-running workers." -ForegroundColor Yellow
