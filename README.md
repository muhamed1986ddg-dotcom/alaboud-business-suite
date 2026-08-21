# AlAboud Business Suite — Production Master

Current source version: **25.14.106**

This directory is the canonical clean source tree for the AlAboud Business Suite. It contains the backend, frontend, Android source, database migrations, active regression tests, and Cloud Run/Docker deployment configuration. Generated builds, local dependencies, customer data, backups, logs, APK/AAB files, and historical release-report archives are intentionally excluded.

## Main directories

- `backend/` — Node.js/Express API, PostgreSQL integration, financial logic, migrations and tests.
  - `backend/src/routes/` — domain route modules (health, developer, notifications, organization, finance operations, backup).
  - `backend/src/finance/` — canonical financial calculations kept separate from HTTP routes.
- `frontend/` — React/Vite application and UI tests.
- `app/` — Android application source and resources.
- `scripts/` — active build, validation, backup and operational utilities.
- `.github/workflows/` — CI, dependency security and Android build automation.
- `docs/` — current operational documentation only.

## Requirements

- Node.js 22.x
- npm
- Google Cloud CLI for Cloud Run deployment
- Java 17 / Gradle for Android builds

## Local verification

```powershell
npm run install:all
npm test
npm run build
```

## Start locally

```powershell
npm start
```

## Safe Cloud Run deployment

Use the version-aware script:

```powershell
.\DEPLOY_CLOUD_RUN.ps1
```

It deploys the current source as a tagged revision with **0% traffic** first. Verify `/api/health` and the application before moving production traffic.

## Safety

Never place `.env`, customer exports, database dumps, service-account files, passwords, signing keys, APK/AAB outputs or local backups inside this source tree. The repository guards and ignore files intentionally block those artifacts.
