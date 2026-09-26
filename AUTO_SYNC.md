# Automated job sync

FinderViews now syncs jobs directly into its own `jobs` table from public feeds:

- We Work Remotely RSS: `https://weworkremotely.com/remote-jobs.rss`
- Jobicy JSON: `https://jobicy.com/api/v2/remote-jobs?count=20`

The service normalizes each record into the existing job schema, maps job type/category, and skips any record whose exact title and company already exist. A single-flight lock prevents concurrent scheduled/manual runs from racing.

## Runtime behavior

- A sync starts once after server startup.
- A background sync repeats every six hours.
- `POST /api/admin/sync-jobs` runs the same sync manually and returns per-source counts.
- The **Sync fresh jobs now** button is available on `/tracker`.

## Optional protection

If `SYNC_ADMIN_TOKEN` is set on Hostinger, manual sync requests must include:

```http
x-admin-token: your-configured-token
```

If it is not set, the endpoint remains available for the existing dashboard widget. Set the variable if the endpoint should be restricted at the hosting layer.

## One-off command

```bash
pnpm sync:jobs
```

This uses the same service and database connection as the running application. Feed failures are isolated per source and returned in the `sources` array without taking down the job board.
