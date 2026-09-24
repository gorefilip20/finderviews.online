# Finderviews deployment

The production domain for this project is `finderviews.online`.

## Hostinger target

The application is intended to run as a Node.js application behind the Hostinger domain. The expected production command is:

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm start
```

The application should listen on the port supplied by Hostinger through `PORT`. The build copies the prebuilt frontend assets from `deploy/public` to `dist/public` and copies the production backend runtime to `dist/index.js`; Hostinger does not need to run Vite or esbuild.

## Important archive audit

The supplied ZIP contains the client pages, server business logic, and a prebuilt backend bundle, but it does not contain several source support modules referenced by the TypeScript project, including `server/_core/*`, `client/src/_core/hooks/useAuth`, and `drizzle/schema.ts`. The repository now restores the missing client authentication hook and preserves the supplied backend bundle as `server/prebuilt-index.js`. The final deployment artifact is intentionally runtime-only, allowing Hostinger to install dependencies without invoking the native esbuild postinstall scripts.

## Current product features

The hiring signal feed now queries Jobicy first and uses the public Arbeitnow API as an independent fallback. Results preserve the original public source URL, source name, geography, salary where available, and a 30-day freshness limit. Provider timeouts and temporary failures are handled without crashing the application.

The homepage includes saved browser job alerts with optional email capture and a 30-minute refresh interval while an alert is active. It also includes a live urgent-opportunity board: authenticated employers or community members can publish a title, description, role, region, state/province, city, and urgency flag. The public board refreshes every 15 seconds, and urgent posts expire after 48 hours while normal posts expire after 7 days.

Authentication is already wired through the existing Manus OAuth session flow. Employer profile management now requires a signed-in session and uses `/api/employer-profile`; urgent publishing uses `/api/opportunities`. In this runtime-only Hostinger package, these records are stored in JSON files beside the production runtime (`employer-profiles.json` and `urgent-opportunities.json`). Ensure the application directory is writable and backed up. For multi-instance scaling, moderation, audit history, and stronger durability, migrate these records to the configured MySQL database in a future schema migration.

The external Jobicy feed remains subject to its published fair-use polling guidance; it cannot guarantee instant delivery of a newly posted external job. The near-real-time experience is therefore provided by the Finderviews urgent-opportunity publisher and 15-second board refresh, while third-party jobs remain source-attributed and periodically refreshed.

The hiring workspace now defaults to `Worldwide` and `All hiring roles`, so the first hiring view is populated without requiring a country selection. It searches the global Jobicy feed, the independent Arbeitnow fallback, the public Himalayas Remote Jobs API, and the official We Work Remotely RSS feed. The WWR feed explicitly permits reuse with attribution, and each result retains its original application/source URL. Country and region searches retain their documented geographic precision. This is broad global aggregation, not a promise to mirror every restricted job board: Indeed and LinkedIn are used only through permitted public links or future approved partner APIs, not unauthorized scraping.

For deeper European coverage, an optional Adzuna adapter supports Germany, Finland, the United Kingdom, France, the Netherlands, Sweden, Norway, Denmark, Spain, Italy, Poland, Ireland, Austria, Belgium, Portugal, and Switzerland. It is credential-gated and remains disabled unless Hostinger provides `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`. When enabled, a Europe search queries the supported European country endpoints in parallel and retains Adzuna’s original redirect URL. Obtain credentials and follow Adzuna’s usage and attribution requirements before enabling this provider.

TheirStack is also integrated as an optional licensed aggregator. It supports Germany (`DE`), Finland (`FI`), and the other configured European country codes through `THEIRSTACK_API_KEY`, using the official `POST https://api.theirstack.com/v1/jobs/search` endpoint. The current official pricing page shows a free selected trial, one-time company-credit purchases at $0.109 per company credit, and API subscriptions beginning at 1,500 API credits for $49/month; higher tiers are available and unused credits roll over for 12 months. TheirStack’s page states that API credits count returned jobs, while company and technographics lookups consume more credits. Confirm the current commercial terms in the TheirStack dashboard before purchase.

To enable it on Hostinger, create or subscribe to a TheirStack API plan, generate an API key, add `THEIRSTACK_API_KEY` to the same Node.js application environment as `PORT`, restart the application, and run a Germany or Finland search. The adapter is disabled when the key is absent, never logs the key, applies the 30-day freshness window, keeps the original job URL, and deduplicates results against the other providers. TheirStack may include data originating from Indeed, LinkedIn, Glassdoor, StepStone, ATS platforms, and company career sites through its licensed service; Finderviews does not scrape those sites directly.

The adapter has regression coverage with mocked credentials for both Germany (`de`) and Finland (`fi`); the tests verify the country endpoint, normalized company/location fields, and source attribution without contacting Adzuna. Hostinger must provide both variables—`ADZUNA_APP_KEY` alone is insufficient. The repository’s installed TypeScript compiler currently reports an existing `tsconfig.json` incompatibility because `baseUrl` was removed in the compiler version; the production Vite build and runtime syntax checks remain the deployment checks used for this runtime-only package.

The outreach queue is account-scoped and stored in `outreach-leads.json` and `outreach-drafts.json` beside the runtime. Users can save local-business leads or hiring listings, create email drafts from verified public emails, and review them before sending. No message is sent merely by saving a lead or creating a draft. To enable optional sending on Hostinger, configure `RESEND_API_KEY` and `OUTREACH_FROM_EMAIL`; the send endpoint still requires an explicit confirmation payload. Direct messaging is handled through the public contact/application URL rather than automated scraping or unsolicited platform messages.

The repository has been renamed and branded for Finderviews, including the browser title, description, visible logo label, accessibility labels, and user-facing page copy. No database credentials, OAuth secrets, or `.env` files should be committed; configure those privately in Hostinger environment variables.

## Domain

In Hostinger, finish the `finderviews.online` pending setup, attach it to the deployed Node.js application, enable SSL, and verify both `https://finderviews.online` and `https://www.finderviews.online` after DNS propagation.
