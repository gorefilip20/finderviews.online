# Finder Fresh-Job Data Research

## Official API Findings

| Provider | Confirmed capabilities | Integration implication |
| --- | --- | --- |
| Adzuna | The official job-search endpoint accepts a country code in the route and role/location parameters. Result examples include title, company display name, location, created timestamp, description snippet, category, and redirect URL. | This is the strongest initial source for a live Finder hiring search because the `created` timestamp supports a strict five-day filter and the returned redirect URL enables source attribution. It requires an application ID and key. |
| Jooble | The official REST API is described as allowing a site to submit job queries and present results in its own interface. It requires a key request. | A possible secondary global source, but its public landing page did not document freshness or returned-field semantics in enough detail to make it the primary integration without further vendor confirmation. |
| Remotive | The public remote-jobs API is available, but the provider requires attribution and link-back, delays public jobs by 24 hours, and prohibits using the free feed for lead-generation style list building. | Do not use as Finder’s company-prospecting source. It may be suitable only for a properly attributed remote-job browsing surface if the terms are followed. |
| Jobicy | The official developer page presents a public REST API with no API key, structured JSON, current remote jobs, role keyword filters, job categories, and regional filters. The documentation page describes results as including employer, role, location, job type, description, and salary, and its visible location control includes APAC and individual countries. | Recommended initial live source for the data-ready hiring workspace. Use public attribution and source links, and position the feed as hiring-opportunity research rather than data resale. |

## Recommended Product Constraint

Finder should label every job result with the source, original job URL, posted timestamp, and a calculated age. The five-day control should be a transparent client-facing filter, with AI analysis based only on the job ad and public company context—not inferred personal data.

For the initial build, use Jobicy’s public current-remote-jobs feed for no-key live coverage, then keep a provider adapter boundary so a broader paid country-level source can be added later without redesigning the Finder interface. Do not use Remotive’s free feed for prospecting because its official terms make that use unsuitable.

## Confirmed Jobicy Integration Shape

Finder can call `GET https://jobicy.com/api/v2/remote-jobs` with `count`, `tag`, `geo`, and `industry` query parameters. The official examples demonstrate country and region filters such as `geo=usa`, `geo=canada`, and `geo=usa&industry=marketing`. Each response carries `pubDate` as the original publication timestamp, enabling Finder to discard any listing older than five days at the server boundary before it reaches the interface.

Jobicy accepts documented regional geographic parameters for `apac`, `europe`, and `latam`; an arbitrary `geo=afghanistan` request returns HTTP 400. Finder therefore uses direct country scopes only where the provider documents one (including United States, Canada, Australia, China, and Hong Kong) and otherwise applies the provider’s documented regional scope while displaying that precision to the user. A direct Finder procedure call for an Asia `Product manager` request returned only the fresh **AI Chatbot Product Manager** title after Finder’s role-relevance filter ran.

## Sources

1. [Adzuna Search Ads Documentation](https://developer.adzuna.com/docs/search)
2. [Jooble REST API](https://jooble.org/api/about)
3. [Remotive Remote Jobs Public API](https://remotive.com/remote-jobs/api)
4. [Jobicy Remote Jobs API & RSS Feed](https://jobicy.com/jobs-rss-feed)
