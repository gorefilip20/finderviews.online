/**
 * Finder visual reminder: Atlas Field Notes — a contact is a checked record. Every address shows
 * the page it came from, and lime marks only the inbox worth writing to.
 *
 * Contact discovery. Reads the contact points an organisation published on its own site, ranked
 * for whichever segment you are trying to reach, with the market's data-protection rules shown
 * beside the result rather than buried in a settings page.
 */
import { MARKET_COVERAGE, SUPPORTED_REGIONS, type MarketRegion } from "@/lib/marketCoverage";
import { trpc } from "@/lib/trpc";
import { AtSign, Copy, ExternalLink, Phone, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState, Field, Note, Panel, Spinner, Stat } from "./shared";

type SegmentKey = "business" | "creator" | "founder" | "investor";

const LEVEL_TONE: Record<string, "default" | "warn" | "info"> = {
  "opt-out": "info",
  mixed: "default",
  "opt-in": "warn",
};

export default function Contacts() {
  const [website, setWebsite] = useState("");
  const [name, setName] = useState("");
  const [segment, setSegment] = useState<SegmentKey>("business");
  const [region, setRegion] = useState<MarketRegion>("Africa");
  const [country, setCountry] = useState("Nigeria");

  const countries = useMemo(() => MARKET_COVERAGE[region], [region]);
  const segments = trpc.contacts.segments.useQuery();
  const discover = trpc.contacts.discover.useMutation({ onError: error => toast.error(error.message) });
  const result = discover.data;

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied.");
    } catch {
      toast.error("Your browser blocked the clipboard. Select and copy manually.");
    }
  };

  return (
    <>
      <div className="wk-head">
        <div className="wk-kicker">
          <span className="signal-dot" /> Contact discovery
        </div>
        <h1>Find the inbox that is actually read</h1>
        <p>
          Finder reads the contact points an organisation published on its own site — its contact
          page, its structured data, its legal notice. It never guesses an address from a name
          pattern, and it never reads one off a social platform.
        </p>
      </div>

      <Panel title="Look up a contact">
        <div className="wk-grid wk-grid--2">
          <Field label="Website or domain">
            <input
              className="wk-input"
              placeholder="example.com"
              value={website}
              onChange={event => setWebsite(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter" && website.trim()) {
                  discover.mutate({ website: website.trim(), name: name.trim() || undefined, country, segment });
                }
              }}
            />
          </Field>
          <Field label="Name (optional)">
            <input className="wk-input" value={name} onChange={event => setName(event.target.value)} />
          </Field>
        </div>

        <div className="wk-grid wk-grid--3" style={{ marginTop: ".85rem" }}>
          <Field label="Who are you reaching?">
            <select className="wk-select" value={segment} onChange={event => setSegment(event.target.value as SegmentKey)}>
              {(segments.data ?? []).map(item => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
              {!segments.data && <option value="business">Business or organisation</option>}
            </select>
          </Field>
          <Field label="Region">
            <select
              className="wk-select"
              value={region}
              onChange={event => {
                const next = event.target.value as MarketRegion;
                setRegion(next);
                setCountry(MARKET_COVERAGE[next][0]);
              }}
            >
              {SUPPORTED_REGIONS.map(item => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label="Country">
            <select className="wk-select" value={country} onChange={event => setCountry(event.target.value)}>
              {countries.map(item => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
        </div>

        {segments.data && (
          <div style={{ marginTop: ".9rem" }}>
            <Note>{segments.data.find(item => item.key === segment)?.note}</Note>
          </div>
        )}

        <div className="wk-actions">
          <button
            className="wk-btn"
            disabled={!website.trim() || discover.isPending}
            onClick={() =>
              discover.mutate({ website: website.trim(), name: name.trim() || undefined, country, segment })
            }
          >
            {discover.isPending ? <Spinner /> : <Search size={15} />} Find contact
          </button>
        </div>
      </Panel>

      {result && (
        <>
          <div className="wk-grid wk-grid--3" style={{ marginBottom: "1.1rem" }}>
            <Stat label="Emails published" value={result.emails.length} sub={result.reachable ? "Read from their own site" : "Site unreachable"} />
            <Stat label="Phone numbers" value={result.phones.length} sub={result.postalAddress ? "Postal address also found" : "No postal address found"} />
            <Stat label="Pages checked" value={result.pagesChecked.length} sub="Every address links to its page" />
          </div>

          <Note tone={result.emails.length > 0 ? "info" : "warn"}>{result.summary}</Note>
          {result.advice && (
            <div style={{ marginTop: ".6rem" }}>
              <Note tone="warn">{result.advice}</Note>
            </div>
          )}

          {result.compliance && (
            <Panel
              title={`Before you send — ${result.compliance.country}`}
              description={`${result.compliance.regime} · ${result.compliance.level}`}
            >
              <Note tone={LEVEL_TONE[result.compliance.level] ?? "default"}>{result.compliance.rule}</Note>
              <ul className="wk-list" style={{ marginTop: ".7rem" }}>
                {result.compliance.requirements.map(requirement => (
                  <li key={requirement} style={{ display: "flex", gap: ".5rem" }}>
                    <ShieldCheck size={14} style={{ flex: "none", marginTop: 3 }} />
                    {requirement}
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: ".74rem", color: "#7c8479", marginTop: ".8rem", lineHeight: 1.6 }}>
                {result.compliance.disclaimer}
              </p>
            </Panel>
          )}

          {result.emails.length > 0 && (
            <Panel title="Published addresses" description={result.segmentNote}>
              <div style={{ overflowX: "auto" }}>
                <table className="wk-table">
                  <thead>
                    <tr>
                      <th>Address</th>
                      <th>Type</th>
                      <th>Found on</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {result.emails.map(email => (
                      <tr key={email.address} style={{ cursor: "default" }}>
                        <td>
                          <span className="wk-table__name" style={{ wordBreak: "break-all" }}>
                            <AtSign size={12} style={{ display: "inline", marginRight: 4, verticalAlign: "-1px" }} />
                            {email.address}
                          </span>
                          <span className="wk-table__sub">{email.note}</span>
                        </td>
                        <td>
                          <span className="wk-band" data-band={email.kind === "role" ? "prime" : "watch"}>
                            {email.kind}
                          </span>
                          {email.ownDomain && (
                            <span className="wk-table__sub" style={{ marginTop: ".3rem" }}>
                              own domain
                            </span>
                          )}
                          {email.freeProvider && (
                            <span className="wk-table__sub" style={{ marginTop: ".3rem" }}>
                              free mailbox
                            </span>
                          )}
                        </td>
                        <td style={{ maxWidth: 240 }}>
                          <a
                            className="wk-table__sub"
                            style={{ marginTop: 0, wordBreak: "break-all" }}
                            href={email.foundOn}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {email.foundOn}
                          </a>
                        </td>
                        <td>
                          <button className="wk-btn wk-btn--sm wk-btn--ghost" onClick={() => void copy(email.address)}>
                            <Copy size={12} /> Copy
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {(result.phones.length > 0 || result.postalAddress || result.contactPageUrl) && (
            <Panel title="Other published routes">
              <ul className="wk-list">
                {result.phones.map(phone => (
                  <li key={phone.number} style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                    <Phone size={14} /> {phone.number}
                  </li>
                ))}
                {result.postalAddress && <li>{result.postalAddress}</li>}
                {result.contactPageUrl && (
                  <li>
                    <a href={result.contactPageUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={13} style={{ display: "inline", marginRight: 4, verticalAlign: "-2px" }} />
                      Contact page
                    </a>
                  </li>
                )}
              </ul>
            </Panel>
          )}
        </>
      )}

      {!result && !discover.isPending && (
        <Panel>
          <EmptyState title="Nothing looked up yet">
            Enter a website. Finder reads what that organisation published about how to reach it —
            the same information a person would find by opening the site, gathered and ranked for
            the segment you picked.
          </EmptyState>
        </Panel>
      )}
    </>
  );
}
