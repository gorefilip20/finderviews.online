/**
 * Finder visual reminder: Atlas Field Notes — partnership matches are grouped as complementary
 * categories, not one undifferentiated list.
 *
 * Partnership and referral finder. For a business the agency already works with, this finds
 * non-competing businesses serving the same customer in the same market — a retention tool
 * for existing clients as much as a new-business tool.
 */
import { MARKET_COVERAGE, SUPPORTED_REGIONS, type MarketRegion } from "@/lib/marketCoverage";
import { trpc } from "@/lib/trpc";
import { ExternalLink, Handshake, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState, Field, Note, Panel, SourceRow, Spinner, type ProviderStatus } from "./shared";

export default function Partnerships() {
  const [anchorName, setAnchorName] = useState("");
  const [anchorCategory, setAnchorCategory] = useState("wedding photographer");
  const [region, setRegion] = useState<MarketRegion>("Europe");
  const [country, setCountry] = useState("United Kingdom");
  const [location, setLocation] = useState("Manchester");

  const countries = useMemo(() => MARKET_COVERAGE[region], [region]);
  const find = trpc.finder.partnerships.useMutation({ onError: error => toast.error(error.message) });
  const result = find.data;

  return (
    <>
      <div className="wk-head">
        <div className="wk-kicker">
          <span className="signal-dot" /> Partnerships
        </div>
        <h1>Referral partners for a client you already have</h1>
        <p>
          Give Finder one business and it maps the complementary categories that reach the same customer without
          competing for the same job — the introductions that make an agency worth keeping.
        </p>
      </div>

      <Panel title="Anchor business">
        <div className="wk-grid wk-grid--2">
          <Field label="Client or business name">
            <input className="wk-input" value={anchorName} onChange={event => setAnchorName(event.target.value)} placeholder="Northlight Studio" />
          </Field>
          <Field label="What they do">
            <input className="wk-input" value={anchorCategory} onChange={event => setAnchorCategory(event.target.value)} />
          </Field>
        </div>
        <div className="wk-grid wk-grid--3" style={{ marginTop: ".85rem" }}>
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
          <Field label="City or area">
            <input className="wk-input" value={location} onChange={event => setLocation(event.target.value)} />
          </Field>
        </div>
        <div className="wk-actions">
          <button
            className="wk-btn"
            disabled={!anchorName.trim() || find.isPending}
            onClick={() => find.mutate({ anchorName: anchorName.trim(), anchorCategory, location, country, region })}
          >
            {find.isPending ? <Spinner /> : <Handshake size={15} />} Find partners
          </button>
        </div>
      </Panel>

      {result && (
        <>
          <Note tone="info">{result.precisionNote}</Note>
          {(result.sources as ProviderStatus[]).some(source => !source.connected) && (
            <Panel title="Data sources">
              {(result.sources as ProviderStatus[]).map(source => (
                <SourceRow key={source.provider} source={source} />
              ))}
            </Panel>
          )}
          {result.matches.map(match => (
            <Panel key={match.partnerCategory} title={match.partnerCategory} description={match.rationale}>
              {match.candidates.length === 0 ? (
                <EmptyState title="No candidates found">
                  Nothing in this category was returned for this market. Try a larger city or a nearby area.
                </EmptyState>
              ) : (
                <ul className="wk-list">
                  {match.candidates.map(candidate => (
                    <li key={candidate.dedupeKey} style={{ display: "flex", gap: "1rem", justifyContent: "space-between", flexWrap: "wrap" }}>
                      <div style={{ minWidth: 0 }}>
                        <strong>{candidate.name}</strong>
                        <div style={{ fontSize: ".78rem", color: "#6d7669", marginTop: ".2rem" }}>
                          {candidate.address || candidate.country}
                          {candidate.phone ? ` · ${candidate.phone}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: ".8rem" }}>
                        {candidate.rating != null && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: ".25rem", fontSize: ".8rem" }}>
                            <Star size={12} /> {candidate.rating.toFixed(1)}
                            <span style={{ color: "#7c8479" }}>({candidate.reviewCount ?? 0})</span>
                          </span>
                        )}
                        {candidate.listingUrl && (
                          <a className="wk-btn wk-btn--sm wk-btn--ghost" href={candidate.listingUrl} target="_blank" rel="noreferrer">
                            <ExternalLink size={13} /> Listing
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ))}
        </>
      )}

      {!result && !find.isPending && (
        <Panel>
          <EmptyState title="Start with one business">
            Partnership matching works from a business you already know. Name it, say what it does, and Finder maps
            the categories around it.
          </EmptyState>
        </Panel>
      )}
    </>
  );
}
