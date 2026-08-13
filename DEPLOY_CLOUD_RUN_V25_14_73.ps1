$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$Version = (node -p "require('./package.json').version").Trim()
if ($Version -ne "25.14.73") {
    throw "Expected project version 25.14.73 but found $Version"
}

Write-Host "Running production safety checks for v$Version..."
npm test
if ($LASTEXITCODE -ne 0) { throw "Release verification failed" }

Write-Host "Deploying an isolated Cloud Run test revision without production traffic..."
gcloud run deploy alaboud-business-suite-us `
    --source $ProjectRoot `
    --region us-central1 `
    --project alaboud-business-suite `
    --no-traffic `
    --tag v251473-security

if ($LASTEXITCODE -ne 0) { throw "Cloud Run test deployment failed" }

Write-Host "Test revision created. Production traffic was not changed."
