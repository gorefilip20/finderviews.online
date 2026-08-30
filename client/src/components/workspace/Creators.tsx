/**
 * Finder visual reminder: Atlas Field Notes — a creator's own published figures, read and set
 * side by side. Never a number the creator did not state.
 *
 * Creator roster, brand matching and the collaboration brief. Deliberately one-sided: the
 * workspace builds its own roster from published media kits, then ranks it against a brand it
 * already works with.
 */
import { trpc } from "@/lib/trpc";
import { FileText, Search, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, Field, Note, Panel, Spinner, Stat, openHtmlInTab } from "./shared";

const GOALS = ["awareness", "launch", "sales", "content"] as const;

export default function Creators({ agencyName }: { agencyName: string }) {
  const [website, setWebsite] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [city, setCity] = useState("");

  const [brandName, setBrandName] = useState("");
  const [brandCategory, setBrandCategory] = useState("skincare");
  const [budget, setBudget] = useState("");
  const [goal, setGoal] = useState<(typeof GOALS)[number]>("awareness");
  const [matching, setMatching] = useState(false);

  const utils = trpc.useUtils();
  const roster = trpc.creators.list.useQuery();

  const brand = {
    name: brandName.trim() || "This brand",
    category: brandCategory.trim() || "general",
    city: city.trim() || undefined,
    budget: budget ? Number(budget) : undefined,
    goal,
  };

  const matches = trpc.creators.match.useQuery({ brand }, { enabled: matching && Boolean(brandName.trim()) });

  const parseKit = trpc.creators.parseKit.useMutation({
    onSuccess: result => {
      toast[result.reachable ? "success" : "warning"](result.note);
      setWebsite("");
      setCreatorName("");
      void utils.creators.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.creators.remove.useMutation({
    onSuccess: () => void utils.creators.invalidate(),
    onError: error => toast.error(error.message),
  });
  const brief = trpc.creators.brief.useMutation({
    onSuccess: result => {
      if (!openHtmlInTab(result.html, result.title)) {
        toast.error("Your browser blocked the preview window. Allow pop-ups for this site.");
        return;
      }
      toast.success("Collaboration brief ready.");
    },
    onError: error => toast.error(error.message),
  });

  const rows = roster.data ?? [];

  return (
    <>
      <div className="wk-head">
        <div className="wk-kicker">
          <span className="signal-dot" /> Creators
        </div>
        <h1>Build a roster, then match it to a brand</h1>
        <p>
          Finder reads a creator's own media kit — audience, rates, past partners — and ranks your roster against a
          brand you already work with. Every figure is one the creator published about themselves.
        </p>
      </div>

      <Panel title="Read a media kit" description="Point Finder at a creator's own site, media kit or press page.">
        <div className="wk-grid wk-grid--3">
          <Field label="Website or media kit URL">
            <input className="wk-input" placeholder="creator.example/media-kit" value={website} onChange={event => setWebsite(event.target.value)} />
          </Field>
          <Field label="Creator name (optional)">
            <input className="wk-input" value={creatorName} onChange={event => setCreatorName(event.target.value)} />
          </Field>
          <Field label="City (optional)">
            <input className="wk-input" value={city} onChange={event => setCity(event.target.value)} />
          </Field>
        </div>
        <div className="wk-actions">
          <button
            className="wk-btn"
            disabled={!website.trim() || parseKit.isPending}
            onClick={() =>
              parseKit.mutate({
                website: website.trim(),
                creatorName: creatorName.trim() || undefined,
                city: city.trim() || undefined,
              })
            }
          >
            {parseKit.isPending ? <Spinner /> : <Search size={15} />} Read media kit
          </button>
        </div>

        {parseKit.data?.profile && (
          <div style={{ marginTop: "1rem" }}>
            <Note tone={parseKit.data.profile.sparse ? "warn" : "info"}>{parseKit.data.profile.summary}</Note>
            <div className="wk-grid wk-grid--4" style={{ marginTop: ".8rem" }}>
              <Stat label="Total reach" value={parseKit.data.profile.totalReach.toLocaleString()} />
              <Stat label="Platforms" value={parseKit.data.profile.followers.length} />
              <Stat label="Published rates" value={parseKit.data.profile.rates.length} />
              <Stat label="Named partners" value={parseKit.data.profile.partners.length} />
            </div>
          </div>
        )}
      </Panel>

      {roster.isError ? (
        <Panel>
          <Note tone="warn">{roster.error.message}</Note>
        </Panel>
      ) : rows.length === 0 ? (
        <Panel>
          <EmptyState title="Your roster is empty">
            Read one media kit to begin. Matching runs against creators you have added, not against a bought database.
          </EmptyState>
        </Panel>
      ) : (
        <Panel title={`Roster · ${rows.length}`}>
          <div style={{ overflowX: "auto" }}>
            <table className="wk-table">
              <thead>
                <tr>
                  <th>Creator</th>
                  <th>Niches</th>
                  <th>Contact</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} style={{ cursor: "default" }}>
                    <td>
                      <span className="wk-table__name">{row.creatorName}</span>
                      <span className="wk-table__sub">{row.website}</span>
                    </td>
                    <td>
                      <span className="wk-table__sub" style={{ marginTop: 0 }}>
                        {(row.niches ?? []).join(", ") || "Not stated"}
                      </span>
                    </td>
                    <td>
                      <span className="wk-table__sub" style={{ marginTop: 0 }}>
                        {row.contactEmail ?? "None published"}
                      </span>
                    </td>
                    <td>
                      <button className="wk-btn wk-btn--sm wk-btn--danger" onClick={() => remove.mutate({ id: row.id })}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel title="Match the roster to a brand" description="Relevance is weighted above raw reach: a small on-topic audience beats a large unrelated one.">
        <div className="wk-grid wk-grid--4">
          <Field label="Brand name">
            <input className="wk-input" value={brandName} onChange={event => setBrandName(event.target.value)} />
          </Field>
          <Field label="Brand category">
            <input className="wk-input" value={brandCategory} onChange={event => setBrandCategory(event.target.value)} />
          </Field>
          <Field label="Budget (optional)">
            <input className="wk-input" type="number" min={0} value={budget} onChange={event => setBudget(event.target.value)} />
          </Field>
          <Field label="Goal">
            <select className="wk-select" value={goal} onChange={event => setGoal(event.target.value as typeof goal)}>
              {GOALS.map(item => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="wk-actions">
          <button className="wk-btn" disabled={!brandName.trim()} onClick={() => setMatching(true)}>
            {matches.isFetching ? <Spinner /> : <Users size={15} />} Rank roster
          </button>
        </div>

        {matches.data && (
          <div style={{ marginTop: "1rem" }}>
            <Note tone="info">{matches.data.note}</Note>
            {matches.data.matches.map(match => (
              <div key={match.creator.id ?? match.creator.website} className="wk-stat" style={{ marginTop: ".7rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 750, fontSize: ".95rem" }}>{match.creator.creatorName}</div>
                    <div className="wk-table__sub">
                      {match.creator.totalReach.toLocaleString()} reach · suggested {match.suggestedStructure}
                      {match.estimatedCost !== null ? ` · about ${match.currency} ${match.estimatedCost.toLocaleString()}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
                    <span className="wk-band" data-band={match.score >= 70 ? "prime" : match.score >= 50 ? "strong" : "watch"}>
                      {match.score}/100
                    </span>
                    <button
                      className="wk-btn wk-btn--sm wk-btn--lime"
                      disabled={brief.isPending || !match.creator.id}
                      onClick={() =>
                        brief.mutate({ agencyName, creatorId: match.creator.id as number, brand })
                      }
                    >
                      {brief.isPending ? <Spinner size={12} /> : <FileText size={12} />} Brief
                    </button>
                  </div>
                </div>
                {match.reasons.length > 0 && (
                  <ul className="wk-list" style={{ marginTop: ".5rem" }}>
                    {match.reasons.slice(0, 3).map(reason => (
                      <li key={reason} style={{ fontSize: ".8rem", padding: ".3rem 0" }}>
                        {reason}
                      </li>
                    ))}
                  </ul>
                )}
                {match.concerns.length > 0 && (
                  <div className="wk-table__sub" style={{ color: "#7a5a1a", marginTop: ".4rem" }}>
                    Check: {match.concerns.join(" · ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
