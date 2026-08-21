# Operations

## Health check

Production health endpoint:

`/api/health`

A healthy current release should report `ok: true`, `version: 25.14.96`, and `serviceReady: true`.

## Deployment pattern

1. Deploy a tagged revision with 0% traffic using `DEPLOY_CLOUD_RUN.ps1`.
2. Test the tag-specific URL.
3. Verify health, login, grouped-payment editing and backup download.
4. Route production traffic only after verification.
5. Keep the previous known-good revision temporarily for rollback.

## Backups

The application backup is an operational company-wide backup across branches. Security credentials, sessions and API secrets are intentionally excluded. Do not test restore against live production data unless a restore is actually required and a separate database-level backup exists.
