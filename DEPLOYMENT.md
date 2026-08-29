# Finderviews deployment

The production domain for this project is `finderviews.online`.

## Build and run

```bash
pnpm install --frozen-lockfile
pnpm build      # vite build + esbuild bundle -> dist/
pnpm start      # NODE_ENV=production node dist/index.js
```

The application listens on the port supplied through `PORT` and serves both the API
(`/api/*`) and the built single-page app from the same process.

## Environment

Copy `.env.example` to `.env` and fill in what you want switched on. **Nothing in it is
required to boot.** Finder reports each source's real state rather than failing or
inventing data:

| Set this | Switches on |
| --- | --- |
| *(nothing)* | Single-site audit, scoring, proposal and homepage-concept generators |
| `DATABASE_URL` | Saved prospects, pipeline, watchlists, alerts, proposals, seats, territory, suppression |
| `JWT_SECRET` + OAuth vars | Sign-in and everything workspace-scoped |
| `PLACES_API_KEY` | Rising Under-Built, Decaying web presence, ad-spend finder, partnership matching |
| `META_AD_LIBRARY_TOKEN` | Confirmed active ad spend |
| `BUSINESS_REGISTRY_*` | New and expanding businesses |
| `LOCAL_JOBS_*` | Local and on-site hiring signals |
| `RESEND_API_KEY` | Sending the weekly digest (it still builds and previews without one) |
| `BUILT_IN_FORGE_API_*` | AI hiring briefs and AI proposal copy |

After setting `DATABASE_URL`:

```bash
pnpm db:push    # drizzle-kit generate && drizzle-kit migrate
```

## Scheduled digest

The weekly field report runs from an external scheduler - Hostinger cron, a GitHub Action,
or any uptime pinger:

```bash
curl -X POST https://finderviews.online/api/cron/digest \
  -H "x-cron-secret: $CRON_SECRET"
```

The endpoint refuses the request unless `CRON_SECRET` is set and the header matches.

## Hostinger

1. Deploy as a Node.js application with the build and start commands above.
2. Set the environment variables privately in Hostinger - never commit `.env`.
3. Finish the `finderviews.online` pending setup, attach it to the deployed application,
   and enable SSL.
4. Verify `https://finderviews.online` and `https://www.finderviews.online` after DNS
   propagation.

## Routes

- `/` - marketing site, live opportunity search and hiring signals
- `/app` - the research desk (discovery, pipeline, watchlist, studio, settings)
- `/api/trpc/*` - application API
- `/api/oauth/callback` - sign-in callback
- `/api/cron/digest` - scheduled digest hook

## Data handling

- Only publicly listed business contact points are stored. No private or personal contact
  data is collected, and the AI prompts forbid inventing one.
- Every prospect row records its source and the time it was observed.
- The site audit refuses non-http(s) schemes, URLs containing credentials, and hosts that
  resolve into private or loopback ranges, so it cannot be used to probe an internal network.
- Anonymous site audits are rate limited per IP address.
