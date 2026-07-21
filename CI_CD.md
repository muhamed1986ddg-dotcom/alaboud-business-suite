# CI/CD — v22.2.0

The repository now runs separate GitHub Actions workflows for backend tests, frontend production builds, dependency security audits, Android APK builds, and optional Render deployment.

## Required repository secret

To enable deployment after successful CI, create this GitHub Actions secret:

- `RENDER_DEPLOY_HOOK_URL`: the deploy-hook URL from the Render service settings.

If the secret is not configured, CI still runs and deployment is safely skipped.

## Branch protection recommendation

Protect `main` and require these checks before merge:

- `Backend CI / backend`
- `Frontend CI / frontend`
- `Dependency Security / audit (backend)`
- `Dependency Security / audit (frontend)`

## Local verification

```bash
npm ci --prefix backend
npm run test:coverage --prefix backend
npm ci --prefix frontend
npm run build
```
