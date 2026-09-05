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

The repository has been renamed and branded for Finderviews, including the browser title, description, visible logo label, accessibility labels, and user-facing page copy. No database credentials, OAuth secrets, or `.env` files should be committed; configure those privately in Hostinger environment variables.

## Domain

In Hostinger, finish the `finderviews.online` pending setup, attach it to the deployed Node.js application, enable SSL, and verify both `https://finderviews.online` and `https://www.finderviews.online` after DNS propagation.
