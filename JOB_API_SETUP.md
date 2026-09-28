
## Resume upload and instant matching

Finder now accepts `PDF`, `DOCX`, `TXT`, Markdown, RTF, and HTML resumes through `POST /api/resume/parse`.

- Maximum upload size: **8 MB**.
- Maximum extracted text returned: **50,000 characters**.
- PDF text is extracted with `pdf-parse`; DOCX text is extracted with `mammoth`.
- The endpoint parses in memory and returns text; it does not persist the uploaded file.
- Scanned/image-only PDFs need OCR before they contain usable text.
- The homepage infers a likely role, refreshes the hiring search, ranks results by resume fit, and shows a readiness checklist covering contact details, experience, skills, education, and readable length.

The browser can upload a file directly with these headers:

```http
Content-Type: application/pdf
X-Resume-File-Name: candidate.pdf
```

The response includes `text`, `kind`, `characters`, `persisted: false`, and a privacy note. Resume text is kept locally in the existing browser resume field only when the user clicks **Save resume**.
