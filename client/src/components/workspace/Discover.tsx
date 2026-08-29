/**
 * Finder visual reminder: Atlas Field Notes — the discovery table reads as a research
 * ledger, and lime marks only verified opportunity.
 *
 * The discovery surface. One control set drives every finder so the user learns the
 * workspace once, and results are always ranked by the same transparent score.
 */
import { MARKET_COVERAGE, SUPPORTED_REGIONS, type MarketRegion } from "@/lib/marketCoverage";
import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ExternalLink,
  FileText,
  Layout,
  Plus,
  Search,
  ShieldOff,
  Star,
} from "lucide-react";
import {
  EmptyState,
  Field,
  Note,
  Panel,
  ScoreBadge,
  ScoreBreakdown,
  CheckList,
  SourceRow,
  Spinner,
  Stat,
  openHtmlInTab,
  type GapScore,
  type ProviderStatus,
} from "./shared";

type FinderKind = "rising" | "decaying_site" | "expansion" | "ad_spend";

const FINDERS: { kind: FinderKind; label: string; blurb: string }[] = [
  {
    kind: "rising",
    label: "Rising, Under-Built",
    blurb:
      "Businesses with proven demand — strong ratings and real review volume — that still have no standalone website. They can pay, and they have a bottleneck you can remove.",
  },
  {
    kind: "decaying_site",
    label: "Decaying web presence",
    blurb:
      "Businesses that already bought a website and now have a broken, insecure or years-out-of-date one. They have proven willingness to buy.",
  },
  {
    kind: "expansion",
    label: "New and expanding",
    blurb: "Newly registered and newly opened businesses, which have the highest urgency for a first website.",
  },
  {
    kind: "ad_spend",
    label: "Paying for ads",
    blurb:
      "Businesses actively running public ads. An active budget landing on a weak page is the strongest signal Finder can produce.",
  },
];

export type DiscoveredProspect = {
  dedupeKey: string;
  name: string;
  category?: string;
  country: string;
  region: MarketRegion;
  address?: string;
  phone?: string;
  website?: string;
  listingUrl?: string;
  rating?: number;
  reviewCount?: number;
  reviewVelocity?: number;
  signalType: string;
  signalSummary: string;
  score: GapScore;
  icp?: { score: number; matched: string[]; missed: string[]; verdict: string };
  deal: { band: string; low: number; high: number; currency: string; caveat: string };
  audit?: { checks: { key: string; label: string; status: "pass" | "warn" | "fail" | "unknown"; weight: number; detail: string }[]; verdict: string; decayScore: number; headline: string };
  source: string;
  sourceUrl?: string;
};

export default function Discover({ agencyName }: { agencyName: string }) {
  const [kind, setKind] = useState<FinderKind>("rising");
  const [region, setRegion] = useState<MarketRegion>("Americas");
  const [country, setCountry] = useState("United States");
  const [location, setLocation] = useState("Austin, Texas");
  const [category, setCategory] = useState("dentist");
  const [minScore, setMinScore] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");

  const sources = trpc.finder.sources.useQuery();
  const utils = trpc.useUtils();

  const run = trpc.finder.run.useMutation({
    onError: error => toast.error(error.message),
  });
  const addToPipeline = trpc.pipeline.add.useMutation({
    onSuccess: () => {
      toast.success("Added to your pipeline.");
      void utils.pipeline.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const suppress = trpc.suppression.add.useMutation({
    onSuccess: () => toast.success("Hidden from future results across your workspace."),
    onError: error => toast.error(error.message),
  });
  const buildProposal = trpc.proposal.build.useMutation({
    onSuccess: result => {
      if (!openHtmlInTab(result.html, result.title)) {
        toast.error("Your browser blocked the preview window. Allow pop-ups for this site.");
        return;
      }
      toast.success("Proposal ready. Use your browser's print dialog to save it as a PDF.");
      void utils.proposal.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const buildMockup = trpc.mockup.build.useMutation({
    onSuccess: result => {
      if (!openHtmlInTab(result.html, "Homepage preview")) {
        toast.error("Your browser blocked the preview window. Allow pop-ups for this site.");
        return;
      }
      toast.success("Homepage concept generated from their public listing.");
    },
    onError: error => toast.error(error.message),
  });
  const saveSearch = trpc.savedSearches.create.useMutation({
    onSuccess: () => {
      toast.success("Saved. Finder will re-run it and tell you what is new.");
      setSaveName("");
      void utils.savedSearches.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const countries = useMemo(() => MARKET_COVERAGE[region], [region]);
  const results = run.data;
  const prospects = useMemo(
    () => (results?.prospects ?? []).filter(p => p.score.score >= minScore) as unknown as DiscoveredProspect[],
    [results, minScore],
  );
  const selected = prospects.find(p => p.dedupeKey === selectedKey) ?? prospects[0] ?? null;
  const activeFinder = FINDERS.find(f => f.kind === kind)!;

  const params = { category, location, country, region };

  const onRun = () => {
    setSelectedKey(null);
    run.mutate({ kind, params });
  };

  const handleAddToPipeline = async (prospect: DiscoveredProspect) => {
    const refreshed = await utils.prospects.list.fetch({ limit: 500 });
    const match = refreshed.find(row => row.dedupeKey === prospect.dedupeKey);
    if (!match) {
      toast.error("This result is not saved yet. Re-run the search with saving enabled.");
      return;
    }
    addToPipeline.mutate({ prospectId: match.id });
  };

  return (
    <>
      <div className="wk-head">
        <div className="wk-kicker">
          <span className="signal-dot" /> Discovery
        </div>
        <h1>Find the businesses the web forgot</h1>
        <p>
          Every result is ranked by a single transparent score: how weak the digital presence is, multiplied by
          how much proven commercial demand the business has. Both must be true for a business to rank.
        </p>
      </div>

      <Panel title="Choose a signal">
        <div className="wk-grid wk-grid--4" style={{ marginBottom: "1rem" }}>
          {FINDERS.map(finder => (
            <button
              key={finder.kind}
              type="button"
              className="wk-stat"
              onClick={() => setKind(finder.kind)}
              style={{
                textAlign: "left",
                cursor: "pointer",
                borderColor: kind === finder.kind ? "#1d241f" : undefined,
                background: kind === finder.kind ? "#f4f8e6" : undefined,
              }}
            >
              <div className="wk-stat__k">{kind === finder.kind ? "Selected" : "Finder"}</div>
              <div style={{ fontWeight: 750, fontSize: ".92rem", marginTop: ".3rem", letterSpacing: "-.01em" }}>
                {finder.label}
              </div>
            </button>
          ))}
        </div>

        <Note>{activeFinder.blurb}</Note>

        <div className="wk-grid wk-grid--4" style={{ marginTop: "1rem" }}>
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
          <Field label="Category or trade">
            <input className="wk-input" value={category} onChange={event => setCategory(event.target.value)} />
          </Field>
        </div>

        <div className="wk-actions">
          <button className="wk-btn" onClick={onRun} disabled={run.isPending}>
            {run.isPending ? <Spinner /> : <Search size={15} />}
            {run.isPending ? "Scanning the market…" : "Run finder"}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
            <input
              className="wk-input"
              style={{ width: 190 }}
              placeholder="Name this search"
              value={saveName}
              onChange={event => setSaveName(event.target.value)}
            />
            <button
              className="wk-btn wk-btn--ghost"
              disabled={!saveName.trim() || saveSearch.isPending}
              onClick={() => saveSearch.mutate({ name: saveName.trim(), kind, params })}
            >
              {saveSearch.isPending ? <Spinner /> : <Plus size={15} />} Watch this market
            </button>
          </div>
        </div>
      </Panel>

      {sources.data && sources.data.some(source => !source.connected) && (
        <Panel
          title="Data sources"
          description="Finder shows nothing it has not observed. Sources without a credential simply stay switched off."
        >
          {(sources.data as ProviderStatus[]).map(source => (
            <SourceRow key={source.provider} source={source} />
          ))}
        </Panel>
      )}

      {results && (
        <>
          <div className="wk-grid wk-grid--4" style={{ marginBottom: "1.25rem" }}>
            <Stat label="Ranked results" value={prospects.length} sub={`${results.scannedCount} listings scanned`} />
            <Stat
              label="Prime opportunities"
              value={prospects.filter(p => p.score.band === "prime").length}
              sub="Proven demand with a real gap"
            />
            <Stat
              label="Already contacted"
              value={results.suppressedCount}
              sub="Hidden so nobody approaches them twice"
            />
            <Stat
              label="Profile applied"
              value={results.icpApplied ? "Yes" : "No"}
              sub={results.icpApplied ? "Ranked against your ICP" : "Set a default ICP in Settings"}
            />
          </div>

          <Note tone="info">{results.precisionNote}</Note>

          <div className="wk-split" style={{ marginTop: "1.1rem" }}>
            <Panel
              title="Ranked opportunities"
              actions={
                <Field label="Min score">
                  <input
                    className="wk-input"
                    style={{ width: 84 }}
                    type="number"
                    min={0}
                    max={100}
                    value={minScore}
                    onChange={event => setMinScore(Number(event.target.value) || 0)}
                  />
                </Field>
              }
            >
              {prospects.length === 0 ? (
                <EmptyState title="No businesses met this bar">
                  Either the market is well served, or the source returned nothing that clears your minimum score.
                  Try a wider area, a different category, or lower the minimum.
                </EmptyState>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="wk-table">
                    <thead>
                      <tr>
                        <th>Business</th>
                        <th>Signal</th>
                        <th>Demand</th>
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prospects.map(prospect => (
                        <tr
                          key={prospect.dedupeKey}
                          data-selected={selected?.dedupeKey === prospect.dedupeKey}
                          onClick={() => setSelectedKey(prospect.dedupeKey)}
                        >
                          <td>
                            <span className="wk-table__name">{prospect.name}</span>
                            <span className="wk-table__sub">
                              {prospect.category} · {prospect.country}
                            </span>
                          </td>
                          <td style={{ maxWidth: 280 }}>
                            <span className="wk-table__sub" style={{ marginTop: 0 }}>
                              {prospect.signalSummary}
                            </span>
                          </td>
                          <td>
                            {prospect.rating ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: ".25rem", fontSize: ".8rem" }}>
                                <Star size={12} /> {prospect.rating.toFixed(1)}
                                <span style={{ color: "#7c8479" }}>({prospect.reviewCount ?? 0})</span>
                              </span>
                            ) : (
                              <span style={{ color: "#8b9288", fontSize: ".8rem" }}>—</span>
                            )}
                          </td>
                          <td>
                            <ScoreBadge score={prospect.score.score} band={prospect.score.band} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <div className="wk-detail">
              {selected ? (
                <Panel>
                  <h3 className="wk-detail__name">{selected.name}</h3>
                  <div className="wk-detail__meta">
                    {selected.category} · {selected.address || selected.country}
                  </div>

                  <div style={{ marginTop: "1rem" }}>
                    <ScoreBreakdown score={selected.score} />
                  </div>

                  <div style={{ marginTop: "1.1rem" }}>
                    <div className="wk-detail__row">
                      <b>Deal band</b>
                      <span>
                        {selected.deal.currency === "USD" ? "$" : `${selected.deal.currency} `}
                        {selected.deal.low.toLocaleString()} – {selected.deal.high.toLocaleString()} ·{" "}
                        {selected.deal.band}
                      </span>
                    </div>
                    {selected.phone && (
                      <div className="wk-detail__row">
                        <b>Public phone</b>
                        <span>{selected.phone}</span>
                      </div>
                    )}
                    {selected.website && (
                      <div className="wk-detail__row">
                        <b>Website</b>
                        <span style={{ wordBreak: "break-all" }}>{selected.website}</span>
                      </div>
                    )}
                    {selected.icp && (
                      <div className="wk-detail__row">
                        <b>ICP match</b>
                        <span>
                          {selected.icp.score}/100 · {selected.icp.verdict}
                          {selected.icp.missed.length > 0 && (
                            <span style={{ display: "block", color: "#6d7669", fontSize: ".78rem", marginTop: ".2rem" }}>
                              Misses: {selected.icp.missed.join(", ")}
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                    <div className="wk-detail__row">
                      <b>Source</b>
                      <span>{selected.source}</span>
                    </div>
                  </div>

                  {selected.audit && (
                    <div style={{ marginTop: "1rem" }}>
                      <div className="wk-kicker" style={{ marginBottom: ".5rem" }}>
                        Live site audit
                      </div>
                      <Note tone="warn">{selected.audit.headline}</Note>
                      <CheckList checks={selected.audit.checks} />
                    </div>
                  )}

                  <div className="wk-actions">
                    <button className="wk-btn wk-btn--sm" onClick={() => void handleAddToPipeline(selected)} disabled={addToPipeline.isPending}>
                      {addToPipeline.isPending ? <Spinner size={13} /> : <Plus size={13} />} Add to pipeline
                    </button>
                    <button
                      className="wk-btn wk-btn--sm wk-btn--lime"
                      disabled={buildProposal.isPending}
                      onClick={() =>
                        buildProposal.mutate({
                          agencyName,
                          prospectName: selected.name,
                          prospectCategory: selected.category,
                          prospectLocation: selected.address || selected.country,
                          prospectWebsite: selected.website,
                          signalSummary: selected.signalSummary,
                          withNarrative: true,
                        })
                      }
                    >
                      {buildProposal.isPending ? <Spinner size={13} /> : <FileText size={13} />} Build proposal
                    </button>
                    <button
                      className="wk-btn wk-btn--sm wk-btn--ghost"
                      disabled={buildMockup.isPending}
                      onClick={() =>
                        buildMockup.mutate({
                          name: selected.name,
                          category: selected.category,
                          city: location,
                          country: selected.country,
                          address: selected.address,
                          phone: selected.phone,
                          rating: selected.rating,
                          reviewCount: selected.reviewCount,
                        })
                      }
                    >
                      {buildMockup.isPending ? <Spinner size={13} /> : <Layout size={13} />} Homepage concept
                    </button>
                    {selected.listingUrl && (
                      <a className="wk-btn wk-btn--sm wk-btn--ghost" href={selected.listingUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={13} /> Public listing
                      </a>
                    )}
                    <button
                      className="wk-btn wk-btn--sm wk-btn--danger"
                      onClick={() =>
                        suppress.mutate({
                          matchKey: selected.dedupeKey,
                          kind: "do_not_contact",
                          reason: "Hidden from the discovery table.",
                        })
                      }
                    >
                      <ShieldOff size={13} /> Never show again
                    </button>
                  </div>

                  <p style={{ fontSize: ".74rem", color: "#7c8479", marginTop: ".9rem", lineHeight: 1.6 }}>
                    {selected.deal.caveat}
                  </p>
                </Panel>
              ) : (
                <Panel>
                  <EmptyState title="Select a business">
                    Pick a row to see the full score breakdown, the evidence behind it, and the actions you can take.
                  </EmptyState>
                </Panel>
              )}
            </div>
          </div>
        </>
      )}

      {!results && !run.isPending && (
        <Panel>
          <EmptyState title="Run a finder to begin">
            Choose a signal, set the market, and Finder will return a ranked, evidence-backed list. Nothing is shown
            that was not observed from a public source.
          </EmptyState>
        </Panel>
      )}
    </>
  );
}
