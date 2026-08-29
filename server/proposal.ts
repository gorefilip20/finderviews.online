/**
 * Instant audit + proposal.
 *
 * Turns everything Finder observed about one business into a branded, print-ready document
 * the agency can send as-is. Every claim in it is traced to a check that actually ran —
 * the document never asserts a problem Finder did not observe.
 *
 * The output is self-contained HTML with a print stylesheet, so the browser's "Save as PDF"
 * produces the deliverable without a headless-browser dependency on the server.
 */
import type { AuditCheck, WebAuditResult } from "./webaudit";
import type { DealBand, GapScore } from "./scoring";

export type ProposalInput = {
  agencyName: string;
  agencyTagline?: string;
  prospectName: string;
  prospectCategory?: string;
  prospectLocation?: string;
  prospectWebsite?: string;
  score?: GapScore;
  audit?: WebAuditResult;
  deal?: DealBand;
  signalSummary?: string;
  preparedBy?: string;
  narrative?: { opening?: string; whyNow?: string; approach?: string };
};

export type ScopeItem = { title: string; detail: string; trigger: string };

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, char =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string,
  );

/**
 * Scope is derived from failed checks only. If a check passed, the matching line of work is
 * left out — an agency should not bill for fixing something that is not broken.
 */
export function deriveScope(input: ProposalInput): ScopeItem[] {
  const items: ScopeItem[] = [];
  const checks = input.audit?.checks ?? [];
  const failed = (key: string) => checks.find(c => c.key === key && (c.status === "fail" || c.status === "warn"));

  if (!input.prospectWebsite || input.audit?.verdict === "unreachable" || input.audit?.verdict === "broken") {
    items.push({
      title: "Website design and build",
      detail: "A complete, mobile-first site covering services, proof, location and a direct enquiry route.",
      trigger: input.prospectWebsite ? "The published site does not load for visitors." : "No website is listed publicly.",
    });
  }

  const viewport = failed("viewport");
  if (viewport) items.push({ title: "Mobile-first rebuild", detail: "Rebuild the layout so it works on the phones most customers use.", trigger: viewport.detail });

  const https = failed("https");
  if (https) items.push({ title: "Secure hosting and certificate", detail: "Move to HTTPS so browsers stop warning visitors away.", trigger: https.detail });

  const speed = failed("speed");
  if (speed) items.push({ title: "Performance work", detail: "Reduce load time so visitors do not leave before the page renders.", trigger: speed.detail });

  const copyright = failed("copyright") || failed("lastModified");
  if (copyright) items.push({ title: "Content refresh", detail: "Rewrite and restructure the core pages around current services and proof.", trigger: copyright.detail });

  const seo = failed("title") || failed("description");
  if (seo) items.push({ title: "Search presence", detail: "Titles, descriptions and structure so the business is findable for what it sells.", trigger: (failed("title") || failed("description"))!.detail });

  const analytics = failed("analytics");
  if (analytics) items.push({ title: "Measurement setup", detail: "Install analytics so the owner can see what the site actually produces.", trigger: analytics.detail });

  const contact = failed("contact");
  if (contact) items.push({ title: "Enquiry and contact routes", detail: "Clear phone, email and form routes on every page.", trigger: contact.detail });

  const social = failed("social");
  if (social) items.push({ title: "Profile and brand consistency", detail: "Align the site with the social profiles customers already find.", trigger: social.detail });

  if (items.length === 0) {
    items.push({
      title: "Growth review",
      detail: "A focused review of conversion, search visibility and brand consistency.",
      trigger: "No critical faults were found — the opportunity here is growth rather than repair.",
    });
  }

  return items;
}

const STATUS_COLOR: Record<AuditCheck["status"], string> = {
  pass: "#2F6B36",
  warn: "#8A6A12",
  fail: "#9B2C2C",
  unknown: "#6d7469",
};

const STATUS_LABEL: Record<AuditCheck["status"], string> = {
  pass: "OK",
  warn: "Weak",
  fail: "Failing",
  unknown: "Unknown",
};

const money = (value: number, currency: string) =>
  `${currency === "USD" ? "$" : `${currency} `}${value.toLocaleString("en-US")}`;

export function renderProposalHtml(input: ProposalInput, scope: ScopeItem[]): string {
  const checks = input.audit?.checks ?? [];
  const observed = input.score?.factors.filter(f => f.observed) ?? [];

  const findingsRows = checks
    .map(
      check => `<tr>
        <td style="padding:11px 0;border-top:1px solid #E7E5DE;font:500 13px/1.4 Manrope,sans-serif;color:#1D241F;width:34%;">${escapeHtml(check.label)}</td>
        <td style="padding:11px 0;border-top:1px solid #E7E5DE;font:500 11px/1.4 'DM Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:${STATUS_COLOR[check.status]};width:14%;">${STATUS_LABEL[check.status]}</td>
        <td style="padding:11px 0;border-top:1px solid #E7E5DE;font:400 13px/1.5 Manrope,sans-serif;color:#4a5148;">${escapeHtml(check.detail)}</td>
      </tr>`,
    )
    .join("");

  const scopeRows = scope
    .map(
      (item, index) => `<div class="scope-item">
        <div class="scope-index">${String(index + 1).padStart(2, "0")}</div>
        <div>
          <div class="scope-title">${escapeHtml(item.title)}</div>
          <div class="scope-detail">${escapeHtml(item.detail)}</div>
          <div class="scope-trigger">Because: ${escapeHtml(item.trigger)}</div>
        </div>
      </div>`,
    )
    .join("");

  const evidenceList = observed
    .slice(0, 6)
    .map(factor => `<li>${escapeHtml(factor.label)} — ${escapeHtml(factor.evidence)}</li>`)
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(input.prospectName)} — digital opportunity review</title>
<style>
  :root { --paper:#F7F6F1; --ink:#1D241F; --stone:#E7E5DE; --lime:#C8FF3D; --muted:#6d7469; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--paper); color:var(--ink);
         font-family:Manrope,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; }
  .sheet { max-width:820px; margin:0 auto; background:#fff; border:1px solid var(--stone); }
  .pad { padding:44px 52px; }
  .rule { border-top:1px solid var(--stone); }
  .label { font:500 10px/1.4 'DM Mono',ui-monospace,monospace; letter-spacing:.16em;
           text-transform:uppercase; color:var(--muted); }
  h1 { font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:34px; line-height:1.1;
       letter-spacing:-.02em; margin:10px 0 0; }
  h2 { font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:19px; letter-spacing:-.01em; margin:0 0 6px; }
  p { font-size:14px; line-height:1.65; color:#3c433a; }
  .meta { display:flex; flex-wrap:wrap; gap:26px; margin-top:22px; }
  .meta div { min-width:120px; }
  .meta .v { font:600 15px/1.3 Manrope,sans-serif; margin-top:4px; }
  .scorebox { display:flex; align-items:flex-end; gap:14px; margin-top:8px; }
  .score { font-family:'Space Grotesk',sans-serif; font-size:52px; font-weight:700; line-height:1; }
  .bar { height:8px; background:var(--stone); position:relative; margin-top:14px; }
  .bar span { position:absolute; inset:0 auto 0 0; background:var(--lime); }
  table { width:100%; border-collapse:collapse; }
  .scope-item { display:flex; gap:18px; padding:16px 0; border-top:1px solid var(--stone); }
  .scope-index { font:500 11px/1.4 'DM Mono',monospace; color:var(--muted); padding-top:3px; }
  .scope-title { font:600 15px/1.3 Manrope,sans-serif; }
  .scope-detail { font-size:13.5px; line-height:1.6; color:#3c433a; margin-top:4px; }
  .scope-trigger { font:400 12px/1.5 'DM Mono',monospace; color:var(--muted); margin-top:6px; }
  .invest { background:var(--ink); color:#F7F6F1; }
  .invest .label { color:#9aa294; }
  .range { font-family:'Space Grotesk',sans-serif; font-size:36px; font-weight:700; letter-spacing:-.02em; margin-top:8px; }
  ul { padding-left:18px; font-size:13.5px; line-height:1.7; color:#3c433a; }
  .foot { font-size:11.5px; line-height:1.6; color:var(--muted); }
  @media print {
    body { background:#fff; }
    .sheet { border:0; max-width:none; }
    .pad { padding:28px 32px; }
    .page-break { page-break-before:always; }
  }
</style></head>
<body><div class="sheet">

  <div class="pad">
    <div class="label">${escapeHtml(input.agencyName)}${input.agencyTagline ? ` · ${escapeHtml(input.agencyTagline)}` : ""}</div>
    <h1>${escapeHtml(input.prospectName)}</h1>
    <p style="margin-top:10px;max-width:60ch;">Digital opportunity review${
      input.prospectLocation ? ` · ${escapeHtml(input.prospectLocation)}` : ""
    }${input.prospectCategory ? ` · ${escapeHtml(input.prospectCategory)}` : ""}</p>
    <div class="meta">
      <div><div class="label">Prepared</div><div class="v">${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div></div>
      ${input.preparedBy ? `<div><div class="label">Prepared by</div><div class="v">${escapeHtml(input.preparedBy)}</div></div>` : ""}
      ${input.prospectWebsite ? `<div><div class="label">Reviewed site</div><div class="v" style="font-size:13px;word-break:break-all;">${escapeHtml(input.prospectWebsite)}</div></div>` : ""}
    </div>
  </div>

  ${
    input.score
      ? `<div class="pad rule">
          <div class="label">Opportunity score</div>
          <div class="scorebox"><div class="score">${input.score.score}</div><div style="padding-bottom:8px;font-size:13px;color:var(--muted);">/ 100 · ${escapeHtml(input.score.band)}</div></div>
          <div class="bar"><span style="width:${input.score.score}%"></span></div>
          <p style="margin-top:14px;max-width:64ch;">${escapeHtml(input.score.headline)} This score combines a digital gap index of ${input.score.gapIndex} with a commercial demand index of ${input.score.demandIndex}, and is ${input.score.confidence}% backed by directly observed public data.</p>
          ${evidenceList ? `<div class="label" style="margin-top:16px;">What was observed</div><ul>${evidenceList}</ul>` : ""}
        </div>`
      : ""
  }

  ${
    input.narrative?.opening || input.signalSummary
      ? `<div class="pad rule"><h2>Why we are writing</h2><p style="max-width:66ch;">${escapeHtml(
          input.narrative?.opening || input.signalSummary || "",
        )}</p>${input.narrative?.whyNow ? `<p style="max-width:66ch;">${escapeHtml(input.narrative.whyNow)}</p>` : ""}</div>`
      : ""
  }

  ${
    checks.length
      ? `<div class="pad rule page-break"><h2>What we checked</h2>
          <p style="max-width:66ch;">Each line below is a live reading of the public website taken on ${new Date(
            input.audit?.fetchedAt || Date.now(),
          ).toLocaleDateString()}. Nothing here is an assumption.</p>
          <table style="margin-top:14px;">${findingsRows}</table></div>`
      : ""
  }

  <div class="pad rule"><h2>Recommended scope</h2>
    <p style="max-width:66ch;">${
      input.narrative?.approach ||
      "Each item below exists because a specific check failed. Anything already working has been deliberately left out."
    }</p>
    <div style="margin-top:12px;">${scopeRows}</div>
  </div>

  ${
    input.deal
      ? `<div class="pad rule invest">
          <div class="label">Indicative investment</div>
          <div class="range">${money(input.deal.low, input.deal.currency)} – ${money(input.deal.high, input.deal.currency)}</div>
          <p style="color:#c9cfc4;max-width:64ch;margin-top:10px;">${escapeHtml(input.deal.caveat)}</p>
        </div>`
      : ""
  }

  <div class="pad rule">
    <h2>Next step</h2>
    <p style="max-width:66ch;">A 20-minute call to confirm what matters most, then a fixed scope and timeline.</p>
    <p class="foot" style="margin-top:22px;">Prepared by ${escapeHtml(input.agencyName)} using publicly available information only. Finder does not collect private or personal contact data; all findings trace to the public website and public business listing for this company.</p>
  </div>

</div></body></html>`;
}

export function buildProposal(input: ProposalInput) {
  const scope = deriveScope(input);
  return {
    scope,
    html: renderProposalHtml(input, scope),
    title: `${input.prospectName} — digital opportunity review`,
  };
}
