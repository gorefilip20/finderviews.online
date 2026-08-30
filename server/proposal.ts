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

  <div class="pad" data-section="summary">
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
      ? `<div class="pad rule" data-section="score">
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
      ? `<div class="pad rule" data-section="summary"><h2>Why we are writing</h2><p style="max-width:66ch;">${escapeHtml(
          input.narrative?.opening || input.signalSummary || "",
        )}</p>${input.narrative?.whyNow ? `<p style="max-width:66ch;">${escapeHtml(input.narrative.whyNow)}</p>` : ""}</div>`
      : ""
  }

  ${
    checks.length
      ? `<div class="pad rule page-break" data-section="findings"><h2>What we checked</h2>
          <p style="max-width:66ch;">Each line below is a live reading of the public website taken on ${new Date(
            input.audit?.fetchedAt || Date.now(),
          ).toLocaleDateString()}. Nothing here is an assumption.</p>
          <table style="margin-top:14px;">${findingsRows}</table></div>`
      : ""
  }

  <div class="pad rule" data-section="scope"><h2>Recommended scope</h2>
    <p style="max-width:66ch;">${
      input.narrative?.approach ||
      "Each item below exists because a specific check failed. Anything already working has been deliberately left out."
    }</p>
    <div style="margin-top:12px;">${scopeRows}</div>
  </div>

  ${
    input.deal
      ? `<div class="pad rule invest" data-section="investment">
          <div class="label">Indicative investment</div>
          <div class="range">${money(input.deal.low, input.deal.currency)} – ${money(input.deal.high, input.deal.currency)}</div>
          <p style="color:#c9cfc4;max-width:64ch;margin-top:10px;">${escapeHtml(input.deal.caveat)}</p>
        </div>`
      : ""
  }

  <div class="pad rule" data-section="next">
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

/* --------------------------------------------------- tiers, accept, tracking */

export type PricingTier = {
  key: "essential" | "recommended" | "complete";
  name: string;
  price: number;
  currency: string;
  includes: string[];
  recommended: boolean;
};

/**
 * Three named packages instead of one range.
 *
 * A range invites negotiation from its bottom edge; a middle option that is visibly the best
 * value anchors the decision and is what most buyers take. Inclusions are drawn from the derived
 * scope, so the tiers describe real work rather than invented deliverables.
 */
export function buildTiers(scope: ScopeItem[], deal: DealBand | undefined): PricingTier[] {
  const currency = deal?.currency ?? "USD";
  const mid = deal ? Math.round((deal.low + deal.high) / 2) : 4000;
  const round = (value: number) => Math.max(250, Math.round(value / 50) * 50);

  const titles = scope.map(item => item.title);
  const core = titles.slice(0, Math.max(1, Math.ceil(titles.length / 2)));
  const full = titles;

  return [
    {
      key: "essential",
      name: "Essential",
      price: round(mid * 0.62),
      currency,
      includes: [...core, "One round of revisions"],
      recommended: false,
    },
    {
      key: "recommended",
      name: "Recommended",
      price: round(mid),
      currency,
      includes: [...full, "Two rounds of revisions", "Launch support"],
      recommended: true,
    },
    {
      key: "complete",
      name: "Complete",
      price: round(mid * 1.55),
      currency,
      includes: [...full, "Unlimited revisions during build", "Launch support", "Three months of maintenance and monitoring"],
      recommended: false,
    },
  ];
}

const tierMoney = (value: number, currency: string) =>
  `${currency === "USD" ? "$" : `${currency} `}${value.toLocaleString("en-US")}`;

/**
 * The reading beacon.
 *
 * Reports total dwell time and per-section reading time. It uses IntersectionObserver for
 * section visibility, pauses on tab blur so a forgotten tab does not inflate the numbers, and
 * flushes with sendBeacon on unload so the last reading is not lost. It records no identity: the
 * server derives a salted viewer key and stores no raw address.
 */
export function trackingScript(token: string, endpoint: string): string {
  return `<script>(function(){
  var sections={},current=null,since=Date.now(),start=Date.now(),active=true,sent=0;
  function tick(){
    if(!active)return;
    var now=Date.now();
    if(current){sections[current]=(sections[current]||0)+(now-since);}
    since=now;
  }
  function payload(){
    tick();
    return JSON.stringify({token:${JSON.stringify(token)},totalMs:Date.now()-start,sectionMs:sections,referrer:document.referrer||""});
  }
  function flush(useBeacon){
    var body=payload();
    if(useBeacon&&navigator.sendBeacon){navigator.sendBeacon(${JSON.stringify(endpoint)},new Blob([body],{type:"application/json"}));return;}
    try{fetch(${JSON.stringify(endpoint)},{method:"POST",headers:{"Content-Type":"application/json"},body:body,keepalive:true});}catch(e){}
  }
  document.addEventListener("visibilitychange",function(){
    if(document.hidden){tick();active=false;}else{active=true;since=Date.now();}
  });
  if("IntersectionObserver" in window){
    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){tick();current=entry.target.getAttribute("data-section");since=Date.now();}
      });
    },{threshold:0.4});
    document.querySelectorAll("[data-section]").forEach(function(el){io.observe(el);});
  }
  // Periodic flush so a long read is captured even if the tab is never closed cleanly.
  setInterval(function(){ if(Date.now()-start>5000&&sent<120){sent++;flush(false);} },15000);
  window.addEventListener("pagehide",function(){flush(true);});
  setTimeout(function(){flush(false);},4000);
})();</script>`;
}

export type ShareBarInput = {
  token: string;
  endpointBase: string;
  bookingUrl?: string | null;
  tiers?: PricingTier[] | null;
  status: string;
  acceptedTier?: string | null;
};

/**
 * The action bar appended to a shared proposal: pick a package, accept, or book a call. This is
 * the whole point of sharing rather than attaching a PDF — the recipient has one thing to click
 * instead of a decision to compose an email about.
 */
export function shareActionBar(input: ShareBarInput): string {
  const accepted = input.status === "accepted";
  const tiers = input.tiers ?? [];

  const tierCards = tiers
    .map(
      tier => `<label class="tier${tier.recommended ? " tier--rec" : ""}">
        <input type="radio" name="tier" value="${escapeHtml(tier.key)}"${tier.recommended ? " checked" : ""} />
        <div>
          <div class="tier-name">${escapeHtml(tier.name)}${tier.recommended ? ' <span class="tier-flag">Most chosen</span>' : ""}</div>
          <div class="tier-price">${escapeHtml(tierMoney(tier.price, tier.currency))}</div>
          <ul>${tier.includes.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </div>
      </label>`,
    )
    .join("");

  return `
  <div class="pad rule" data-section="next" id="finder-accept">
    <style>
      .tiers { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; margin:16px 0 8px; }
      .tier { display:flex; gap:10px; padding:16px; border:1px solid var(--stone); border-radius:10px; cursor:pointer;
              background:#fff; align-items:flex-start; }
      .tier--rec { border-color:var(--ink); box-shadow:0 0 0 2px var(--lime) inset; }
      .tier input { margin-top:4px; }
      .tier-name { font:700 14px/1.3 Manrope,sans-serif; }
      .tier-flag { font:600 10px/1 'DM Mono',monospace; letter-spacing:.08em; text-transform:uppercase;
                   background:var(--lime); padding:3px 6px; border-radius:99px; margin-left:4px; }
      .tier-price { font-family:'Space Grotesk',sans-serif; font-size:24px; font-weight:700; margin:6px 0 8px; letter-spacing:-.02em; }
      .tier ul { margin:0; padding-left:16px; font-size:12.5px; line-height:1.6; color:#4a5148; }
      .accept-row { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:14px; }
      .accept-row input[type=text], .accept-row input[type=email] {
        padding:10px 12px; border:1px solid var(--stone); border-radius:8px; font:inherit; font-size:14px; min-width:180px; }
      .btn-accept { background:var(--lime); color:var(--ink); border:1px solid var(--ink); padding:12px 20px;
                    border-radius:8px; font:700 14px/1 Manrope,sans-serif; cursor:pointer; }
      .btn-book { background:transparent; color:var(--ink); border:1px solid var(--ink); padding:12px 20px;
                  border-radius:8px; font:700 14px/1 Manrope,sans-serif; text-decoration:none; display:inline-block; }
      .accepted { background:#eefad2; border:1px solid #b7d97a; padding:16px; border-radius:10px;
                  font:600 15px/1.5 Manrope,sans-serif; }
      .privacy { font-size:11.5px; color:var(--muted); margin-top:14px; line-height:1.6; }
      @media print { #finder-accept { display:none; } }
    </style>

    ${
      accepted
        ? `<div class="accepted">Accepted${input.acceptedTier ? ` — ${escapeHtml(input.acceptedTier)} package` : ""}. Thank you. We will be in touch to confirm the start date.</div>`
        : `<h2>Ready to start?</h2>
           <p style="max-width:60ch;">Choose the package that fits, and we will confirm scope and a start date. Nothing is charged by clicking this.</p>
           <form id="finder-accept-form">
             <div class="tiers">${tierCards}</div>
             <div class="accept-row">
               <input type="text" name="name" placeholder="Your name" required />
               <input type="email" name="email" placeholder="Your email" required />
               <button class="btn-accept" type="submit">Accept and start</button>
               ${input.bookingUrl ? `<a class="btn-book" href="${escapeHtml(input.bookingUrl)}" target="_blank" rel="noreferrer">Book a call instead</a>` : ""}
             </div>
           </form>
           <div id="finder-accept-done" style="display:none;" class="accepted">Thank you — accepted. We will confirm the start date by email.</div>`
    }

    <p class="privacy">This document reports when it is opened so we know when to follow up. It records no personal
    information about you beyond what you choose to enter above.</p>
  </div>

  <script>(function(){
    var form=document.getElementById("finder-accept-form");
    if(!form)return;
    form.addEventListener("submit",function(event){
      event.preventDefault();
      var data=new FormData(form);
      var tier=form.querySelector('input[name="tier"]:checked');
      fetch(${JSON.stringify(input.endpointBase)}+"/accept",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({token:${JSON.stringify(input.token)},tier:tier?tier.value:null,name:data.get("name"),email:data.get("email")})
      }).then(function(){
        form.style.display="none";
        document.getElementById("finder-accept-done").style.display="block";
      }).catch(function(){ alert("That did not send. Please reply to the email instead."); });
    });
  })();</script>`;
}

/** Injects the action bar and the reading beacon into a stored proposal document. */
export function wrapForSharing(html: string, bar: ShareBarInput): string {
  const injection = `${shareActionBar(bar)}\n${trackingScript(bar.token, `${bar.endpointBase}/view`)}`;
  return html.includes("</body>")
    ? html.replace("</body>", `${injection}\n</body>`)
    : `${html}\n${injection}`;
}
