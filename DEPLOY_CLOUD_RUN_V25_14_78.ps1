$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$Version = (node -p "require('./package.json').version").Trim()
if ($Version -ne "25.14.78") {
    throw "Expected project version 25.14.78 but found $Version"
}

if (!(Test-Path "$ProjectRoot\backend\node_modules\pg") -or !(Test-Path "$ProjectRoot\frontend\node_modules\vite")) {
    Write-Host "Installing locked backend/frontend dependencies..."
    npm.cmd run install:all
    if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed" }
}

Write-Host "Running production safety checks for v$Version..."
npm.cmd test
if ($LASTEXITCODE -ne 0) { throw "Release verification failed" }

Write-Host "Deploying an isolated Cloud Run test revision without production traffic..."
gcloud run deploy alaboud-business-suite-us `
    --source $ProjectRoot `
    --region us-central1 `
    --project alaboud-business-suite `
    --no-traffic `
    --tag v251478 `
    --max-instances 1

if ($LASTEXITCODE -ne 0) { throw "Cloud Run test deployment failed" }

Write-Host "Test revision created. Production traffic was not changed."
