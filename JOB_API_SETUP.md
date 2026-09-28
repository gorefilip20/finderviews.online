# Finder job API setup

Finder uses a provider adapter layer. Provider credentials stay on the server and are never sent to the browser.

## Recommended provider mix

| Provider | What it adds | Access | Finder configuration |
|---|---|---|---|
| Jobicy, Arbeitnow, Himalayas, We Work Remotely | Public/remote feeds | Public feed access | Enabled by default where the feed is reachable |
| Adzuna | Broad country-level job search | Create an account and request an application ID/key at [developer.adzuna.com](https://developer.adzuna.com/) | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` |
| TheirStack | Job-posting search and company metadata | Request an API key at [theirstack.com/en/job-posting-api](https://theirstack.com/en/job-posting-api) | `THEIRSTACK_API_KEY` |
| Greenhouse | Public openings for specific employers using Greenhouse | No API key for a public board; obtain the board token from the employer's careers URL | `GREENHOUSE_BOARDS=company-one,company-two` |
| Lever | Public openings for specific employers using Lever | No API key for public postings; use the employer's Lever site name | `LEVER_SITES=company-one,company-two` |
| Nextdoor | Public local posts, marketplace listings, events, business pages | Beta, case-by-case approval; no universal jobs endpoint is documented | Apply through [Nextdoor Search API access](https://developer.nextdoor.com/docs/overview-copy-1) |

## Environment variables

Set these on the server/Hostinger environment, not in frontend code:

```env
ADZUNA_APP_ID=your-app-id
ADZUNA_APP_KEY=your-app-key
THEIRSTACK_API_KEY=your-theirstack-key
GREENHOUSE_BOARDS=acme,another-company
LEVER_SITES=acme,another-company
RESEND_API_KEY=re_your_key
OUTREACH_FROM_EMAIL=Finder alerts <alerts@your-domain.example>
```

`GREENHOUSE_BOARDS` and `LEVER_SITES` are comma-separated. Finder checks those public employer boards during the same six-hour sync used by the existing importer. The existing admin endpoint can trigger an immediate sync:

```http
POST /api/admin/sync-jobs
```

If `SYNC_ADMIN_TOKEN` is set, send it in the `x-admin-token` header.

## Email alerts

The existing app supports email sending for authenticated outreach/community applications through Resend. Before enabling automated job alerts, configure and verify the sending domain in Resend, set `RESEND_API_KEY` and `OUTREACH_FROM_EMAIL`, and add a user-owned saved-search/alert record. Alerts should be opt-in, deduplicated by source URL, and include the original source link rather than submitting applications automatically.

## Nextdoor integration boundaries

Nextdoor's official Search API is beta and approval-only. Its documented content types are public posts, marketplace listings, events, and business pages. It is not a general job-board API. After approval, add a dedicated adapter that:

1. Stores the Nextdoor client credentials only on the server.
2. Queries only the content and geography permitted by the approved scope.
3. Preserves Nextdoor attribution and links back to the original post.
4. Applies rate limits, deletion/expiry handling, and the platform's display rules.
5. Never asks users for their Nextdoor password or scrapes authenticated pages.

## Freshness expectations

No provider can guarantee every job on the internet within seconds. Finder can combine several providers, refresh frequently within provider rate limits, deduplicate records, and notify on newly observed source URLs. Closed platforms and partner-only APIs require approval or a licensed aggregator.
