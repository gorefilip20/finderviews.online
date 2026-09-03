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

The repository has been renamed and branded for Finderviews, including the browser title, description, visible logo label, accessibility labels, and user-facing page copy. No database credentials, OAuth secrets, or `.env` files should be committed; configure those privately in Hostinger environment variables.

## Domain

In Hostinger, finish the `finderviews.online` pending setup, attach it to the deployed Node.js application, enable SSL, and verify both `https://finderviews.online` and `https://www.finderviews.online` after DNS propagation.
