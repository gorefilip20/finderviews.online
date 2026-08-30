# Finder Implementation Tasks

## Fresh Hiring Opportunity Discovery

- [x] Make the job search’s country match precision explicit and prevent it from implying an exact country match when the live source provides only a regional scope.
- [x] Add a real public-company contact lookup for selected fresh job listings, including public website, phone, address, and listing link when available.
- [x] Select and prepare a viable non-Adzuna global job-data provider for Finder’s live results.
- [x] Deliver the data-ready hiring workspace even before a live-provider credential is connected.
- [x] Add a Finder workflow for companies actively hiring within the last five days.
- [x] Support role and skill searches, including product management, social media growth, web development, content writing, co-founder, copywriting, online presence, life sciences, cosmetics, skincare, and operations leadership.
- [x] Keep the existing eligible-country controls and apply them to job searches.
- [x] Display fresh-job date, company, role, public contact context, source link, and an outreach-relevant need summary.
- [x] Add AI-generated, human-reviewed decision-maker and opportunity briefs using only public job and company context.
- [x] Define a live job-data source and freshness calculation with clear source attribution.
- [x] Add a visible review-and-approve step before an AI hiring brief is treated as actionable.
- [ ] Verify the signed-in browser AI brief flow, including success, loading, error, empty, and review states.
- [ ] Complete the final end-to-end opportunity-brief check after the signed-in browser flow is verified.

## Worldwide Coverage Update

- [x] Add region and country controls covering Europe, the Americas, and Asia only.
- [x] Prevent African countries from being selected or searched through Finder’s location controls.
- [x] Update the search request and results copy to include no-website and limited-online-presence opportunities.
- [x] Surface the supported worldwide coverage in the hero and research workspace.
- [x] Verify a supported country search and the Africa-exclusion behavior.

- [x] Replace the Scoutly product name with Finder throughout the interface and page metadata.
- [x] Update the positioning so Finder helps agencies identify businesses without websites and offer website, branding, and online-growth services.
- [x] Add business-growth outcome language to the hero, lead detail view, and delivery narrative.
- [x] Generate and use the Finder logo and supporting visual assets.
- [x] Implement the interactive discovery, filtering, lead saving, and outreach-note experience.
- [x] Verify responsive behavior, key actions, and visual consistency before delivery.

## Growth Platform Build (features 1–17)

- [x] 0. Restore the missing source layer so the project builds: `server/_core/*`, `client/src/_core/hooks/useAuth`, `drizzle/schema.ts`.
- [x] 1. Rising, Under-Built finder — proven demand (rating, review volume, momentum) with no standalone website.
- [x] 2. Decaying web presence finder — live audit of security, mobile, speed, freshness, legacy markup, parked pages.
- [x] 3. Partnership and referral finder — complementary, non-competing categories around an anchor business.
- [x] 4. New and expanding business finder, behind a registry adapter.
- [x] 5. Advertising-spend signal, verified against the public ad library.
- [x] 6. Local and on-site hiring source, behind an adapter, alongside the remote-only Jobicy feed.
- [x] 7. Digital Gap Score — gap index × demand index, with a per-factor evidence breakdown and a stated confidence.
- [x] 8. ICP profiles — defined once per workspace and applied to every finder's ranking.
- [x] 9. Deal-band estimator from category, market and team size, with an explicit uncertainty note.
- [x] 10. Saved searches with per-search cadence and enable/disable.
- [x] 11. Monitoring, alerts and the weekly field-report digest, with a secured scheduler hook.
- [x] 12. Territory claims and workspace-wide suppression; reaching "Contacted" suppresses automatically.
- [x] 13. Instant audit and proposal document — scope derived only from failed checks, print-ready.
- [x] 14. Homepage concept generator, built from the business's own public listing data.
- [x] 15. Pipeline with stages, assignment, notes, deal value, follow-up dates and a change history.
- [x] 16. CSV export (formula-injection safe) plus HubSpot and Airtable sync using the customer's own token.
- [x] 17. Team seats, invitations by email, roles, seat limits and lead assignment.

### Open items

- [ ] Connect a live business-listing credential (`PLACES_API_KEY`) and verify the four market finders against real data.
- [ ] Provision the database, run `pnpm db:push`, and verify the pipeline, watchlist and proposal flows end to end in the browser.
- [ ] Verify the signed-in browser AI brief flow, including success, loading, error, empty, and review states.
- [ ] Complete the final end-to-end opportunity-brief check after the signed-in browser flow is verified.


## Worldwide Coverage and Contact Discovery

- [x] Expand coverage from three regions to five: Europe, the Americas, Africa, Asia, Oceania.
- [x] Remove the Africa exclusion registry and every piece of interface copy that announced it.
- [x] Replace market exclusion with recognition plus a country/region agreement check.
- [x] Widen the hiring adapter to all regions, omitting the geo filter where the provider documents no scope and labelling the reduced precision.
- [x] Add contact discovery that reads only what an organisation published on its own site.
- [x] Parse mailto links, page text, `[at]`/`[dot]` obfuscation, schema.org blocks, and the contact or legal-notice page.
- [x] Filter out site-platform addresses and asset filenames that resemble addresses.
- [x] Add creator/influencer/model, founder/business-owner, and investor/VC/private-equity targeting segments.
- [x] Rank results by the inbox that matters for the chosen segment.
- [x] Add a per-market data-protection layer covering the named regimes, defaulting to the strictest posture for an unrecognised market.
- [x] Rate limit the contact endpoint and apply the existing private-network request guard to it.

### Open items

- [ ] Run one live contact lookup against a real website after deployment; the build environment's egress proxy blocks outbound HTTP, so only the parsing is verified so far.
- [ ] Decide whether to add an official platform API adapter for creator business-contact fields, which needs a platform credential and app review.
