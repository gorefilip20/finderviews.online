# Europe source verification

- Live Finderviews test on 2026-09-14 returned HTTP 200 and 100 jobs for role `All hiring roles`, country `Worldwide`; deployed response source name was `Jobicy + Arbeitnow` because the latest source changes were not yet redeployed.
- EURES is the official EU employment portal, but its public search API documentation was not official; do not reverse-engineer it without an approved integration.
- Adzuna official developer documentation: https://developer.adzuna.com/ and https://developer.adzuna.com/docs/search. Its search route uses a country code in `/v1/api/jobs/{country}/search/{page}` and requires `app_id` and `app_key`. The adapter supports Germany (`de`), Finland (`fi`), and additional European country codes, and remains disabled until Hostinger credentials are supplied.
- We Work Remotely official RSS page: https://weworkremotely.com/remote-job-rss-feed. It explicitly says its public feed can be used by anyone with attribution and gives the feed URL https://weworkremotely.com/remote-jobs.rss. Live feed check returned HTTP 200 and 87 `<item>` records.
- Himalayas official API docs: https://himalayas.app/docs/remote-jobs-api. Live check returned HTTP 200, 8 current worldwide results in the requested page, and a reported total of 1,984.
- Indeed and LinkedIn official/partner access is restricted; do not scrape their pages. Use approved partner/licensed APIs only.
