# Finderviews audit findings

## Live site

The homepage loads successfully after the initial render delay. It is a single-page lead-research product with sections for local business opportunities, a Leaflet map, and a fresh hiring-signals section. The hiring section currently advertises a Jobicy-backed search, freshness windows, country/region selection, source links, and a protected AI outreach brief.

The live homepage initially shows no job results until a user runs a search. The current browser state defaults to `Product manager`, `Americas`, `United States`, and an Austin local-business location. The page supports the requested core brand/content and currently has no visible community feed, saved job alerts, employer posting, candidate profile, direct messaging, moderation, or notification center.

## Repository and deployment

Repository: `gorefilip20/finderviews.online`, branch `main`. The Hostinger deployment intentionally builds by copying `deploy/public` and `server/prebuilt-index.js` into `dist`, then starts `dist/index.js`. The source checkout is incomplete for a normal TypeScript server build because several support modules and `drizzle/schema.ts` are absent; therefore production changes must update the runtime bundle or replace it with a self-contained runtime, and the frontend must be rebuilt into `deploy/public`.

## Existing job integration

`server/hiring.ts` calls `https://jobicy.com/api/v2/remote-jobs` with `count`, `geo`, and optionally `tag`. It maps valid jobs to a 30-day freshness window and filters role matches in application code. The endpoint is currently live and returns valid JSON/jobs for `geo=usa`, and the deployed tRPC endpoint returns valid job results for a Product manager search.

The current integration can still produce empty results because it treats upstream non-2xx/network failures as an empty array, depends on a single provider, has sparse country mapping with region fallback, and applies role filtering after a provider tag query without exposing provider/update/error state. The current client also relies on the prebuilt backend bundle, so source-only changes would not be deployed by the documented Hostinger build.

## Feature research

Nextdoor's official public materials emphasize verified local membership/address, trusted local news, real-time safety alerts, local recommendations, marketplace-style listings, groups, events, and business pages. Job Today's official public materials emphasize fast local job discovery, job alerts, short profiles, direct candidate-employer chat, employer job posting, interviews, and rapid matching. Finderviews should adapt these patterns as original features: location-scoped opportunity feeds, trusted source labels, alert subscriptions, saved searches, community/job posts, employer/candidate profiles, messaging or contact handoff, and report/moderation controls. It should not copy proprietary code or branding.

Sources: https://about.nextdoor.com/ ; https://nextdoor.com/ ; https://jobtoday.com/us?locale=en-US ; https://play.google.com/store/apps/details?id=com.jobtoday.app&hl=en_US
