# Upgrade findings

## Authentication

The runtime already includes Manus OAuth authentication, signed session cookies, protected tRPC procedures, and a `users` table. The client already has a `useAuth` hook. The source checkout is incomplete for server-side schema/core development, while Hostinger runs `server/prebuilt-index.js`; profile persistence therefore needs either restoration of the missing schema/core source or a carefully mirrored runtime implementation.

## Real-time opportunity design

Jobicy's official API documentation confirms a public REST endpoint with latest remote listings, canonical source URLs, no API key, and a fair-use request frequency of no more than once per hour for automated checks. This is suitable for periodic external job ingestion, but it cannot provide true instant alerts for a brand-new listing.

A Nextdoor-style urgent opportunity feature should therefore be an original Finderviews user-generated posting flow: an authenticated employer or community member posts an urgent opportunity with title, location, urgency, contact/application URL, and expiration. The feed can use short polling or server-sent updates for signed-in users, while external job feeds remain periodic and clearly attributed. Scraping private Nextdoor content is not appropriate and would not be reliable.

## Location hierarchy

The current UI only has region and country. A proper region → country → state/province → city chain should use a maintained public geographic dataset/API, load states only after country selection, load cities only after state selection, and keep an optional manual entry fallback for markets without a subdivision dataset.

Sources reviewed: https://jobicy.com/jobs-rss-feed and https://www.arbeitnow.com/blog/job-board-api
