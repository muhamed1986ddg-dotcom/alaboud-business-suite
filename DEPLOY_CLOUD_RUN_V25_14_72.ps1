$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$Version = (node -p "require('./package.json').version").Trim()
if ($Version -ne "25.14.72") {
    throw "Expected project version 25.14.72 but found $Version"
}

Write-Host "Running production safety checks for v$Version..."
npm run check:sensitive
if ($LASTEXITCODE -ne 0) { throw "Sensitive-file check failed" }

npm run check:reliability
if ($LASTEXITCODE -ne 0) { throw "Reliability check failed" }

npm run check:regressions
if ($LASTEXITCODE -ne 0) { throw "Regression check failed" }

Write-Host "Deploying an isolated Cloud Run test revision without production traffic..."
gcloud run deploy alaboud-business-suite-us `
    --source $ProjectRoot `
    --region us-central1 `
    --project alaboud-business-suite `
    --no-traffic `
    --tag v251472-corrected

if ($LASTEXITCODE -ne 0) { throw "Cloud Run test deployment failed" }

Write-Host "Test revision created. Production traffic was not changed."
