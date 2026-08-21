# CI/CD — Production Master v25.14.106

The production workflow uses one source tree and one release gate.

## Validation

```powershell
npm run install:all
npm test
npm run build
```

The build runs the sensitive-file check, current-release checks, reliability gates, financial regressions, and the frontend production build.

## Cloud Run

Use:

```powershell
.\DEPLOY_CLOUD_RUN.ps1
```

The script reads the version from `package.json`, creates a matching tag, and deploys a **no-traffic** revision first. Test the tagged URL and `/api/health` before routing traffic. Keep the previous known-good revision available for rollback until the new revision is verified.

Production secrets belong in Google Secret Manager / Cloud Run configuration, not in source files or shell history.
