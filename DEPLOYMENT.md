# Finderviews deployment

The production domain for this project is `finderviews.online`.

## Hostinger target

The application is intended to run as a Node.js application behind the Hostinger domain. The expected production command is:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

The application should listen on the port supplied by Hostinger through `PORT`.

## Important archive audit

The supplied ZIP contains the client pages, server business logic, and a prebuilt `dist/index.js` bundle, but it does not contain several source support modules referenced by the TypeScript project, including `server/_core/*`, `client/src/_core/hooks/useAuth`, and `drizzle/schema.ts`. Therefore, a clean build from source cannot complete until the complete source export is supplied or those modules are restored.

The repository has been renamed and branded for Finderviews, including the browser title, description, visible logo label, accessibility labels, and user-facing page copy. No database credentials, OAuth secrets, or `.env` files should be committed; configure those privately in Hostinger environment variables after the missing source modules are restored.

## Domain

In Hostinger, finish the `finderviews.online` pending setup, attach it to the deployed Node.js application, enable SSL, and verify both `https://finderviews.online` and `https://www.finderviews.online` after DNS propagation.
