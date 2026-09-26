# Job importer

FinderViews stores imported jobs in its own `jobs` table. The importer does not call third-party job APIs; it accepts a local or public structured JSON/RSS feed and normalizes the records before writing them to the database.

## JSON

```json
[
  {
    "title": "Senior React Engineer",
    "companyName": "Example Labs",
    "location": "Remote — Europe",
    "jobType": "Remote",
    "category": "Engineering",
    "salaryRange": "$100k – $130k",
    "description": "Build product experiences for a distributed team.",
    "requirements": "React and TypeScript\nAccessibility experience",
    "applicationContact": "hiring@example.com"
  }
]
```

Run a local JSON import:

```bash
pnpm import:jobs ./path/to/jobs.json
```

## RSS

RSS entries use `<title>`, `<author>` or `<dc:creator>`, `<description>`, `<link>`, and optionally `<location>`. RSS imports default to `Remote` and `Engineering` when the feed does not provide structured job metadata.

```bash
pnpm import:jobs https://your-owned-feed.example/jobs.xml
```

The command requires `DATABASE_URL` and uses the same Drizzle connection as the application. For recurring ingestion, invoke the command from your host's scheduler with a feed URL; the service itself remains deterministic and writes only to the first-party database.
