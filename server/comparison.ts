/**
 * Before / after side-by-side.
 *
 * The most persuasive artifact a web studio can send, assembled from two things Finder already
 * produces: the live audit of the site as it stands, and the generated concept for what it could
 * be. Neither half is new work — the value is entirely in putting them in one frame.
 *
 * An honest limitation, stated on the page itself: the "today" side is a rendering of measured
 * findings, not a screenshot. Finder has no headless browser, and a fabricated screenshot would
 * be worse than no screenshot. Their live site is linked so the reader can check for themselves.
 */
import type { WebAuditResult } from "./webaudit";

export type ComparisonInput = {
  agencyName: string;
  businessName: string;
  websiteUrl?: string;
  audit?: WebAuditResult;
  /** Full HTML of the generated homepage concept, embedded directly. */
  conceptHtml?: string;
  bookingUrl?: string;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, char =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string,
  );

/** The handful of findings a business owner actually feels, in the order they feel them. */
const IMPACT_COPY: Record<string, { title: string; impact: string }> = {
  parked: { title: "There is nothing to read", impact: "Visitors who arrive leave immediately." },
  status: { title: "The page does not load", impact: "Every visitor who clicks your listing hits an error." },
  reachable: { title: "The site does not respond", impact: "Anyone searching for you finds nothing." },
  viewport: { title: "Unusable on a phone", impact: "Most local searches happen on a phone. They pinch, zoom, and give up." },
  https: { title: "Marked “Not secure”", impact: "Browsers warn people away before they see anything." },
  speed: { title: "Slow to appear", impact: "A large share of visitors leave before the first line of text renders." },
  copyright: { title: "Visibly out of date", impact: "An old date tells a customer nobody is minding the business." },
  lastModified: { title: "Nothing published in a long time", impact: "Search engines treat a dormant site as a lower-quality result." },
  contact: { title: "No obvious way to get in touch", impact: "An interested customer has to work to reach you. Most will not." },
  analytics: { title: "No measurement", impact: "You cannot tell how many customers the site wins or loses." },
  title: { title: "Weak search listing", impact: "Your entry in search results does not say what you do." },
  legacy: { title: "Built on obsolete techniques", impact: "Parts of the page will not work in a current browser." },
  social: { title: "Disconnected from your profiles", impact: "The audience you have built elsewhere never reaches the site." },
};

export function impactfulFindings(audit: WebAuditResult | undefined, limit = 6) {
  if (!audit) {
    return [
      {
        key: "none",
        title: "No website at all",
        impact: "Anyone searching for this business finds a directory entry, a competitor, or nothing.",
        severity: "fail" as const,
      },
    ];
  }

  return audit.checks
    .filter(check => check.status === "fail" || check.status === "warn")
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "fail" ? -1 : 1;
      return b.weight - a.weight;
    })
    .slice(0, limit)
    .map(check => ({
      key: check.key,
      title: IMPACT_COPY[check.key]?.title ?? check.label,
      impact: IMPACT_COPY[check.key]?.impact ?? check.detail,
      severity: check.status as "fail" | "warn",
    }));
}

export function renderComparisonHtml(input: ComparisonInput): string {
  const findings = impactfulFindings(input.audit);
  const score = input.audit?.decayScore;
  const hasConcept = Boolean(input.conceptHtml);

  const findingRows = findings
    .map(
      finding => `<li class="f f--${finding.severity}">
        <div class="f-title">${escapeHtml(finding.title)}</div>
        <div class="f-impact">${escapeHtml(finding.impact)}</div>
      </li>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(input.businessName)} — today, and what it could be</title>
<style>
  :root { --paper:#F7F6F1; --ink:#1D241F; --stone:#E7E5DE; --lime:#C8FF3D; --muted:#6d7469; --bad:#9B2C2C; --warn:#8A6A12; }
  *,*::before,*::after { box-sizing:border-box; }
  body { margin:0; background:var(--paper); color:var(--ink);
         font-family:Manrope,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; }
  .wrap { max-width:1180px; margin:0 auto; padding:44px 28px 64px; }
  .label { font:500 10px/1.4 'DM Mono',ui-monospace,monospace; letter-spacing:.16em; text-transform:uppercase; color:var(--muted); }
  h1 { font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:clamp(28px,4.4vw,44px); line-height:1.05;
       letter-spacing:-.03em; margin:10px 0 12px; }
  .lede { font-size:16px; line-height:1.65; color:#3c433a; max-width:64ch; margin:0 0 34px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:22px; align-items:stretch; }
  .col { background:#fff; border:1px solid var(--stone); border-radius:14px; overflow:hidden; display:flex; flex-direction:column; }
  .col-head { padding:18px 22px; border-bottom:1px solid var(--stone); }
  .col-head h2 { font-family:'Space Grotesk',sans-serif; font-size:19px; margin:6px 0 0; letter-spacing:-.02em; }
  .col--after .col-head { background:var(--ink); color:var(--paper); border-bottom-color:var(--ink); }
  .col--after .col-head .label { color:#9aa294; }
  .body { padding:20px 22px; flex:1; }
  ul.findings { list-style:none; margin:0; padding:0; }
  .f { padding:13px 0; border-top:1px solid #ecebe4; }
  .f:first-child { border-top:0; }
  .f-title { font:700 14.5px/1.35 Manrope,sans-serif; }
  .f--fail .f-title::before { content:"●"; color:var(--bad); margin-right:8px; font-size:11px; vertical-align:2px; }
  .f--warn .f-title::before { content:"●"; color:var(--warn); margin-right:8px; font-size:11px; vertical-align:2px; }
  .f-impact { font-size:13.5px; line-height:1.6; color:#4a5148; margin-top:4px; padding-left:19px; }
  .score { display:flex; align-items:baseline; gap:10px; margin-bottom:14px; }
  .score b { font-family:'Space Grotesk',sans-serif; font-size:38px; font-weight:700; letter-spacing:-.03em; color:var(--bad); }
  .frame { width:100%; height:520px; border:0; display:block; background:#fff; }
  .note { font-size:12px; line-height:1.6; color:var(--muted); padding:14px 22px; border-top:1px solid var(--stone); }
  .cta { margin-top:34px; padding:26px; background:var(--ink); color:var(--paper); border-radius:14px; }
  .cta h3 { font-family:'Space Grotesk',sans-serif; font-size:22px; margin:0 0 8px; letter-spacing:-.02em; }
  .cta p { color:#c9cfc4; font-size:14.5px; line-height:1.65; margin:0 0 16px; max-width:60ch; }
  .btn { display:inline-block; background:var(--lime); color:var(--ink); text-decoration:none; padding:13px 22px;
         border-radius:8px; font:700 14px/1 Manrope,sans-serif; }
  .foot { margin-top:26px; font-size:11.5px; line-height:1.7; color:var(--muted); }
  @media (max-width:900px) { .grid { grid-template-columns:1fr; } .frame { height:420px; } }
  @media print { body { background:#fff; } .cta { background:#fff; color:#000; border:1px solid #000; } }
</style></head>
<body><div class="wrap">

  <div class="label">${escapeHtml(input.agencyName)}</div>
  <h1>${escapeHtml(input.businessName)} — today, and what it could be</h1>
  <p class="lede">
    On the left is what a customer meets today, measured directly from your live site. On the right is a concept
    built from your own public information. Same business, same reputation — different front door.
  </p>

  <div class="grid">
    <section class="col">
      <div class="col-head">
        <div class="label">Today</div>
        <h2>What a customer meets now</h2>
      </div>
      <div class="body">
        ${
          score !== undefined
            ? `<div class="score"><b>${score}</b><span style="color:var(--muted);font-size:13px;">/100 problem score — higher is worse</span></div>`
            : ""
        }
        <ul class="findings">${findingRows}</ul>
      </div>
      <div class="note">
        Rendered from checks run against ${
          input.websiteUrl
            ? `<a href="${escapeHtml(input.websiteUrl)}" target="_blank" rel="noreferrer">${escapeHtml(input.websiteUrl)}</a>`
            : "the public listing"
        }${input.audit ? ` on ${new Date(input.audit.fetchedAt).toLocaleDateString()}` : ""}.
        This panel shows measured findings rather than a screenshot — open the link to see the page yourself.
      </div>
    </section>

    <section class="col col--after">
      <div class="col-head">
        <div class="label">Could be</div>
        <h2>A concept built from your own details</h2>
      </div>
      ${
        hasConcept
          ? `<iframe class="frame" title="Homepage concept" sandbox="allow-same-origin" srcdoc="${escapeHtml(input.conceptHtml as string)}"></iframe>`
          : `<div class="body"><p style="color:var(--muted);font-size:14px;line-height:1.65;">Generate a homepage concept in Finder to fill this side.</p></div>`
      }
      <div class="note">Concept only, generated from publicly listed information. Nothing here is a finished design.</div>
    </section>
  </div>

  <div class="cta">
    <h3>The gap is the opportunity</h3>
    <p>Everything on the left is fixable, and most of it quickly. The right-hand side took minutes to generate — a
    real build is a conversation about what matters most to your customers.</p>
    ${input.bookingUrl ? `<a class="btn" href="${escapeHtml(input.bookingUrl)}" target="_blank" rel="noreferrer">Book a 15-minute call</a>` : ""}
  </div>

  <p class="foot">Prepared by ${escapeHtml(input.agencyName)} using publicly available information only. No private or
  personal contact data was collected in producing this comparison.</p>

</div></body></html>`;
}

export function buildComparison(input: ComparisonInput) {
  return {
    html: renderComparisonHtml(input),
    findings: impactfulFindings(input.audit),
    title: `${input.businessName} — today, and what it could be`,
  };
}
