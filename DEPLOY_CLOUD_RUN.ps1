param(
  [string]$Service = "alaboud-business-suite-us",
  [string]$Region = "us-central1"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".\Dockerfile")) { throw "Dockerfile not found. Run from the project root." }
if (-not (Test-Path ".\package.json")) { throw "package.json not found. Run from the project root." }

$Version = (node -p "require('./package.json').version").Trim()
if (-not $Version) { throw "Unable to read project version." }
$Tag = "v" + ($Version -replace '\.', '')

Write-Host "AlAboud Business Suite v$Version"
Write-Host "Deploying an isolated Cloud Run revision: $Tag"

npm run check:sensitive
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

gcloud run deploy $Service --source . --region $Region --no-traffic --tag $Tag
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Deployment completed with 0% traffic. Test the tagged revision before moving production traffic."
