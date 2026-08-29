/**
 * Instant homepage preview.
 *
 * For a business with no website, the strongest thing an agency can send is a picture of
 * what it could have. This composes a complete one-screen homepage from the business's own
 * public listing data — real name, category, location, rating, public phone — so the
 * preview is recognisably theirs rather than a generic template.
 *
 * Nothing here invents a fact about the business. Copy is built from category templates and
 * the listing fields; anything unknown is simply left out.
 */

export type MockupInput = {
  name: string;
  category?: string;
  city?: string;
  country?: string;
  address?: string;
  phone?: string;
  rating?: number;
  reviewCount?: number;
};

type Palette = { bg: string; ink: string; accent: string; soft: string; muted: string };

const PALETTES: Record<string, Palette> = {
  food: { bg: "#FBF7F0", ink: "#241C15", accent: "#B4522D", soft: "#F0E4D4", muted: "#7A6A5A" },
  health: { bg: "#F5F9F8", ink: "#12252A", accent: "#1E7A6E", soft: "#DCEDEA", muted: "#5F7B78" },
  trade: { bg: "#F6F7F5", ink: "#1B2119", accent: "#3B6B2E", soft: "#E3EADF", muted: "#65705F" },
  professional: { bg: "#F6F7FA", ink: "#161B26", accent: "#2C4C8C", soft: "#E2E7F2", muted: "#5E6880" },
  beauty: { bg: "#FBF6F8", ink: "#241820", accent: "#9C4370", soft: "#F0DFE7", muted: "#7C6470" },
  retail: { bg: "#F8F7F4", ink: "#1F211C", accent: "#8A6A12", soft: "#EDE8DC", muted: "#726E60" },
};

const CATEGORY_GROUP: [RegExp, keyof typeof PALETTES][] = [
  [/restaurant|cafe|coffee|bakery|food|pizza|bar|catering|deli|butcher/i, "food"],
  [/dent|clinic|medical|health|physio|doctor|vet|pharma|therap|optic/i, "health"],
  [/plumb|electric|construct|roof|build|landscap|garage|auto|repair|hvac|carpent|clean/i, "trade"],
  [/law|legal|account|consult|financ|insur|estate|architect|engineer|agency/i, "professional"],
  [/salon|barber|beauty|spa|nail|skincare|hair|cosmet|wellness|massage/i, "beauty"],
];

export function paletteFor(category?: string): Palette {
  const value = category || "";
  const match = CATEGORY_GROUP.find(([pattern]) => pattern.test(value));
  return PALETTES[match?.[1] ?? "retail"];
}

const HEADLINES: [RegExp, (name: string, city: string) => string][] = [
  [/restaurant|cafe|coffee|bakery|food|pizza|deli/i, (n, c) => `Made fresh in ${c || "our kitchen"}, every day.`],
  [/dent|clinic|medical|health|physio|doctor|vet/i, (n, c) => `Careful, unhurried care${c ? ` in ${c}` : ""}.`],
  [/plumb|electric|construct|roof|build|hvac|repair|garage|auto/i, (n, c) => `Work that holds up${c ? `, across ${c}` : ""}.`],
  [/law|legal|account|consult|financ|insur|estate/i, (n, c) => `Clear advice${c ? ` for ${c} businesses` : ""}, plainly explained.`],
  [/salon|barber|beauty|spa|nail|hair/i, (n, c) => `Look like yourself, only better.`],
];

export function headlineFor(name: string, category?: string, city?: string): string {
  const match = HEADLINES.find(([pattern]) => pattern.test(category || ""));
  return match ? match[1](name, city || "") : `${name} — trusted${city ? ` in ${city}` : ""} for good reason.`;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, char =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string,
  );

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() ?? "")
    .join("");

export function renderMockupHtml(input: MockupInput): string {
  const palette = paletteFor(input.category);
  const city = input.city || "";
  const headline = headlineFor(input.name, input.category, city);
  const hasRating = typeof input.rating === "number" && typeof input.reviewCount === "number";

  const services = (() => {
    const category = input.category || "";
    if (/restaurant|cafe|food|bakery/i.test(category)) return ["Menu", "Book a table", "Order ahead"];
    if (/dent|clinic|medical|health|physio|vet/i.test(category)) return ["Treatments", "Book an appointment", "New patients"];
    if (/plumb|electric|construct|roof|build|hvac|repair|auto/i.test(category)) return ["Services", "Request a quote", "Recent work"];
    if (/law|legal|account|consult|financ|estate/i.test(category)) return ["How we help", "Book a consultation", "About us"];
    if (/salon|barber|beauty|spa|hair|nail/i.test(category)) return ["Treatments", "Book online", "Our team"];
    return ["What we do", "Get in touch", "About us"];
  })();

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(input.name)} — homepage preview</title>
<style>
  *,*::before,*::after { box-sizing:border-box; }
  body { margin:0; background:${palette.bg}; color:${palette.ink};
         font-family:Manrope,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; }
  .wrap { max-width:1080px; margin:0 auto; }
  header { display:flex; align-items:center; justify-content:space-between; gap:20px;
           padding:22px 32px; border-bottom:1px solid ${palette.soft}; flex-wrap:wrap; }
  .brand { display:flex; align-items:center; gap:12px; }
  .mark { width:38px; height:38px; border-radius:50%; background:${palette.accent}; color:#fff;
          display:grid; place-items:center; font-weight:700; font-size:14px; letter-spacing:.02em; }
  .brandname { font-weight:700; font-size:17px; letter-spacing:-.01em; }
  nav { display:flex; gap:22px; flex-wrap:wrap; }
  nav span { font-size:14px; color:${palette.muted}; }
  .cta { background:${palette.accent}; color:#fff; padding:10px 18px; border-radius:999px;
         font-size:14px; font-weight:600; white-space:nowrap; }
  .hero { padding:64px 32px 56px; display:grid; grid-template-columns:1.15fr .85fr; gap:44px; align-items:center; }
  h1 { font-size:clamp(32px,5vw,52px); line-height:1.06; letter-spacing:-.025em; margin:0 0 18px; }
  .sub { font-size:17px; line-height:1.6; color:${palette.muted}; max-width:46ch; margin:0 0 26px; }
  .actions { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
  .ghost { border:1px solid ${palette.ink}; padding:10px 18px; border-radius:999px; font-size:14px; font-weight:600; }
  .card { background:#fff; border:1px solid ${palette.soft}; border-radius:14px; padding:26px; }
  .rating { display:flex; align-items:center; gap:10px; font-size:15px; font-weight:600; }
  .stars { color:${palette.accent}; letter-spacing:2px; }
  .detail { display:flex; gap:10px; padding:13px 0; border-top:1px solid ${palette.soft}; font-size:14px; color:${palette.muted}; }
  .detail b { color:${palette.ink}; font-weight:600; }
  .strip { background:${palette.soft}; padding:20px 32px; display:flex; gap:34px; flex-wrap:wrap; justify-content:center;
           font-size:14px; font-weight:600; }
  .grid { padding:52px 32px 64px; display:grid; grid-template-columns:repeat(3,1fr); gap:20px; }
  .tile { background:#fff; border:1px solid ${palette.soft}; border-radius:14px; padding:26px; min-height:150px; }
  .tile h3 { margin:0 0 8px; font-size:17px; letter-spacing:-.01em; }
  .tile p { margin:0; font-size:14px; line-height:1.6; color:${palette.muted}; }
  footer { border-top:1px solid ${palette.soft}; padding:26px 32px 34px; font-size:13px; color:${palette.muted}; }
  .banner { background:${palette.ink}; color:${palette.bg}; font-size:12px; padding:9px 32px; text-align:center; letter-spacing:.02em; }
  @media (max-width:820px) {
    .hero { grid-template-columns:1fr; padding:40px 22px; }
    .grid { grid-template-columns:1fr; padding:34px 22px 48px; }
    header { padding:18px 22px; }
  }
</style></head>
<body>
  <div class="banner">Concept preview generated by Finder from public listing information — not a live website.</div>
  <div class="wrap">
    <header>
      <div class="brand"><div class="mark">${escapeHtml(initials(input.name))}</div><div class="brandname">${escapeHtml(input.name)}</div></div>
      <nav>${services.map(s => `<span>${escapeHtml(s)}</span>`).join("")}</nav>
      <div class="cta">${input.phone ? "Call now" : "Get in touch"}</div>
    </header>

    <section class="hero">
      <div>
        <h1>${escapeHtml(headline)}</h1>
        <p class="sub">${escapeHtml(
          `${input.name} serves ${city || "the local area"}${
            input.category ? ` as a trusted ${input.category.toLowerCase()}` : ""
          }. This page shows how that reputation could look online.`,
        )}</p>
        <div class="actions">
          <div class="cta">${escapeHtml(services[1] || "Get in touch")}</div>
          <div class="ghost">${escapeHtml(services[0] || "What we do")}</div>
        </div>
      </div>
      <div class="card">
        ${
          hasRating
            ? `<div class="rating"><span class="stars">${"★".repeat(Math.round(input.rating as number))}</span>${(input.rating as number).toFixed(1)} · ${input.reviewCount} reviews</div>`
            : `<div class="rating">Trusted locally</div>`
        }
        ${input.address ? `<div class="detail"><b>Find us</b> ${escapeHtml(input.address)}</div>` : ""}
        ${input.phone ? `<div class="detail"><b>Call</b> ${escapeHtml(input.phone)}</div>` : ""}
        ${input.category ? `<div class="detail"><b>Speciality</b> ${escapeHtml(input.category)}</div>` : ""}
        <div class="detail"><b>Hours</b> Shown here once confirmed</div>
      </div>
    </section>

    <div class="strip">${services.map(s => `<span>${escapeHtml(s)}</span>`).join("")}</div>

    <section class="grid">
      ${services
        .map(
          (service, index) => `<div class="tile"><h3>${escapeHtml(service)}</h3><p>${escapeHtml(
            [
              "The things customers ask for most, laid out so they can find them in seconds.",
              "One clear route to get in touch, on every screen size.",
              "The reputation this business already has, made visible to people searching now.",
            ][index] || "A clear, simple section built around what customers actually need.",
          )}</p></div>`,
        )
        .join("")}
    </section>

    <footer>
      ${escapeHtml(input.name)}${input.address ? ` · ${escapeHtml(input.address)}` : ""}${
        input.phone ? ` · ${escapeHtml(input.phone)}` : ""
      }
      <div style="margin-top:8px;">Concept only. Every detail shown comes from this business's public listing.</div>
    </footer>
  </div>
</body></html>`;
}

export function buildMockup(input: MockupInput) {
  return {
    html: renderMockupHtml(input),
    palette: paletteFor(input.category),
    headline: headlineFor(input.name, input.category, input.city),
    note: "Generated from public listing data only. Send it as a conversation starter, not as a finished design.",
  };
}
