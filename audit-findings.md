# Finderviews full audit and recovery report

**Audit date:** 2026-09-14

## Executive assessment

Finderviews was not failing because the public feeds were completely empty. Both configured providers returned live records during this audit: Jobicy returned HTTP 200 with current USA listings, and Arbeitnow returned HTTP 200 with 250 records. The main product failure was the gap between **finding a listing** and **making it actionable**. Provider errors were swallowed into an indistinguishable empty result, geographic fallback was not explained clearly enough, and the detail view often stopped at “use the source listing” without a public company-contact path.

## Findings and severity

| Area | Finding | Severity | Resolution |
| --- | --- | --- | --- |
| Provider reliability | Jobicy and Arbeitnow network/provider failures were caught and converted to an empty list, so users could not tell “no matching jobs” from “source outage.” | High | Source-level status metadata is now returned in the TypeScript search service, including `ok`, `empty`, and `error` states, result counts, and refresh time. |
| Contact conversion | A mapped job exposed only an optional email or an extracted website. When neither was present, the UI did not offer a next action beyond the original listing. | High | Each job now carries a safe public company-contact search route, application route, and `hasActionableContact`/coverage metadata. No private contact data is fabricated. |
| Deployment parity | Hostinger starts `server/prebuilt-index.js`, not the TypeScript server. A source-only fix would not have reached production. | Critical | The production runtime bundle was patched in parallel with source, and the frontend was rebuilt into `deploy/public`. |
| Feed freshness | The product’s current contract is a 30-day window, while older tests still asserted five days. That mismatch created false regression failures. | Medium | Tests now reflect the documented 30-day product behavior while still checking original publication timestamps and sorting. |
| Geographic precision | The provider supports more direct country filters than the old test assumptions indicated; Japan and France are now treated as direct country scopes. | Medium | Regression assertions were aligned to the current provider mapping. The UI continues to label region fallback when a direct country scope is unavailable. |
| Testability | The repository’s test configuration referenced Vitest but did not declare it in the package manifest; several router tests also depend on omitted framework support modules. | Medium | Vitest was added as a development dependency. The isolated job-service suite passes; full-suite infrastructure gaps remain documented below. |

## Implemented in this pass

The hiring data contract now includes `contactSearchUrl`, `hasActionableContact`, provider health records, refresh time, and direct-contact coverage percentage. The frontend shows contact coverage in the feed footer. Each selected job now always provides one of three practical routes: a discovered public company website, a discovered public application email, or a clearly labeled public search for the company’s official website/contact/careers page; the original job listing remains the authoritative application route.

The production frontend was rebuilt, stale hashed assets were removed, and the Hostinger runtime bundle was patched so the deployed backend and rebuilt frontend agree on the new fields. The build command completed successfully and a local production smoke test returned HTTP 200 for the homepage.

## Live-source verification

At audit time, `https://jobicy.com/api/v2/remote-jobs?count=10&geo=usa` returned HTTP 200 and ten records, including a current Tines listing with an original Jobicy URL and publication timestamp. `https://www.arbeitnow.com/api/job-board-api` returned HTTP 200 and 250 records, including a current Global Changer listing with its original source URL. These sources are real public feeds, but they do not guarantee that every company publishes a direct email or website inside the job payload; the product therefore presents source-attributed routes rather than invented contact details.

## Verification results

The focused `server/hiring.test.ts` suite passes all five tests. The production frontend build passes, the Hostinger packaging build passes, and the packaged server serves the homepage successfully on a local production port. The full Vitest suite still cannot load router/AI tests because the supplied repository omits `server/_core/*` modules referenced by those tests; this is a repository completeness issue rather than a failure in the job mapper.

## Recommended co-founder roadmap

The highest-leverage next step is a **lead-to-outreach pipeline**, not another feed. Add saved jobs and local-business leads to a durable account-backed table, track `new → reviewed → contacted → replied → won`, and store the exact public source URL and contact route used. Then add a lightweight contact-enrichment queue that checks only public company websites and official careers/contact pages, records the page URL and verification timestamp, and never claims an email exists unless it was actually observed.

The second priority is **employer-side demand capture**. Turn the current opportunity board into verified employer posts with a public company profile, response channel, expiration, edit history, and moderation/reporting. This creates first-party opportunities that are more local and timely than remote-job aggregators.

The third priority is **alerts that deliver outcomes**. Browser alerts are useful for a prototype, but a durable alert subscription should store role, country, region, freshness, and delivery state server-side. Add deduplication, daily digest delivery, and a “why this matched” explanation so users see qualified leads rather than repeated feed records.

The fourth priority is **conversion analytics**. Track source, market, role, contact route, outbound click, reply, and conversion events with privacy-safe aggregate reporting. The core business question is not “how many jobs did we fetch?” but “which source and contact route produce real conversations?”

## Product guardrails

Finder should continue to display source attribution, original timestamps, and the limits of geographic precision. It should use only public business or employer information, avoid personal-data inference, respect provider terms and rate limits, and keep AI briefs grounded in the supplied listing. A source outage should be visible as an outage; an empty search should be visible as an empty search.
