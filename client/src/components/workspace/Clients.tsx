/**
 * Finder visual reminder: Atlas Field Notes — a falling line is a client kept. Show the trend
 * plainly and let the numbers argue for the retainer.
 *
 * Client health. Re-audits a won site on a cadence and plots the improvement, which is the
 * argument that turns a one-off build into a monthly relationship.
 */
import { trpc } from "@/lib/trpc";
import { Activity, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, Field, Note, Panel, Spinner, Stat } from "./shared";

const CADENCES = ["weekly", "monthly", "quarterly"] as const;

export default function Clients() {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [cadence, setCadence] = useState<(typeof CADENCES)[number]>("monthly");
  const [selected, setSelected] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const sites = trpc.health.list.useQuery();
  const report = trpc.health.report.useQuery({ id: selected ?? 0 }, { enabled: selected !== null });

  const track = trpc.health.track.useMutation({
    onSuccess: () => {
      toast.success("Baseline recorded. The trend starts from here.");
      setLabel("");
      setUrl("");
      void utils.health.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const untrack = trpc.health.untrack.useMutation({
    onSuccess: () => void utils.health.invalidate(),
    onError: error => toast.error(error.message),
  });
  const checkNow = trpc.health.checkNow.useMutation({
    onSuccess: result => {
      toast.success(`Re-checked — score now ${result.decayScore}/100.`);
      void utils.health.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const rows = sites.data ?? [];
  const improving = rows.filter(row => row.baselineScore != null && row.lastScore != null && row.lastScore < row.baselineScore);

  return (
    <>
      <div className="wk-head">
        <div className="wk-kicker">
          <span className="signal-dot" /> Clients
        </div>
        <h1>Prove the work is still working</h1>
        <p>
          Finder keeps auditing a site after you have built it. A score that falls month after month is the clearest
          argument there is for keeping you on retainer — and it writes itself.
        </p>
      </div>

      {sites.isError ? (
        <Panel>
          <Note tone="warn">{sites.error.message}</Note>
        </Panel>
      ) : (
        <>
          <div className="wk-grid wk-grid--3" style={{ marginBottom: "1.2rem" }}>
            <Stat label="Sites tracked" value={rows.length} sub="Clients under monitoring" />
            <Stat label="Improving" value={improving.length} sub="Better than their baseline" />
            <Stat
              label="Checked this week"
              value={rows.filter(row => row.lastCheckedAt && Date.now() - new Date(row.lastCheckedAt).getTime() < 7 * 864e5).length}
              sub="Automatic on the chosen cadence"
            />
          </div>

          <Panel title="Track a client site" description="The first audit becomes the baseline everything later is measured against.">
            <div className="wk-grid wk-grid--3">
              <Field label="Client name">
                <input className="wk-input" value={label} onChange={event => setLabel(event.target.value)} />
              </Field>
              <Field label="Website">
                <input className="wk-input" placeholder="example.com" value={url} onChange={event => setUrl(event.target.value)} />
              </Field>
              <Field label="Re-check every">
                <select className="wk-select" value={cadence} onChange={event => setCadence(event.target.value as typeof cadence)}>
                  {CADENCES.map(item => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="wk-actions">
              <button
                className="wk-btn"
                disabled={!label.trim() || !url.trim() || track.isPending}
                onClick={() => track.mutate({ label: label.trim(), url: url.trim(), cadence })}
              >
                {track.isPending ? <Spinner /> : <Plus size={15} />} Start tracking
              </button>
            </div>
            <div style={{ marginTop: ".9rem" }}>
              <Note>
                Automatic re-checks run from a scheduler. Point any cron at <code>POST /api/cron/health</code> with your
                secret header, or press re-check here whenever you want a fresh reading.
              </Note>
            </div>
          </Panel>

          {rows.length === 0 ? (
            <Panel>
              <EmptyState title="No client sites tracked yet">
                Add a site you have built or fixed. Two readings are enough to show a trend, and the trend is the
                renewal conversation.
              </EmptyState>
            </Panel>
          ) : (
            <Panel title="Tracked sites">
              <div style={{ overflowX: "auto" }}>
                <table className="wk-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Baseline</th>
                      <th>Now</th>
                      <th>Change</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => {
                      const change =
                        row.baselineScore != null && row.lastScore != null ? row.baselineScore - row.lastScore : null;
                      return (
                        <tr key={row.id} data-selected={selected === row.id} onClick={() => setSelected(row.id)}>
                          <td>
                            <span className="wk-table__name">{row.label}</span>
                            <span className="wk-table__sub">{row.url}</span>
                          </td>
                          <td>{row.baselineScore ?? "—"}</td>
                          <td>{row.lastScore ?? "—"}</td>
                          <td>
                            {change === null ? (
                              <span style={{ color: "#8b9288" }}>—</span>
                            ) : (
                              <span className="wk-band" data-band={change > 2 ? "prime" : change < -2 ? "weak" : "watch"}>
                                {change > 0 ? `−${change} better` : change < 0 ? `+${Math.abs(change)} worse` : "steady"}
                              </span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: ".35rem" }}>
                              <button
                                className="wk-btn wk-btn--sm wk-btn--ghost"
                                disabled={checkNow.isPending}
                                onClick={event => {
                                  event.stopPropagation();
                                  checkNow.mutate({ id: row.id });
                                }}
                              >
                                {checkNow.isPending ? <Spinner size={12} /> : <RefreshCw size={12} />}
                              </button>
                              <button
                                className="wk-btn wk-btn--sm wk-btn--danger"
                                onClick={event => {
                                  event.stopPropagation();
                                  untrack.mutate({ id: row.id });
                                }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {selected !== null && report.data && (
            <Panel title={report.data.site.label} description={report.data.headline}>
              <div style={{ display: "flex", alignItems: "center", gap: "1.4rem", flexWrap: "wrap" }}>
                <div dangerouslySetInnerHTML={{ __html: report.data.sparkline }} />
                <div className="wk-grid wk-grid--3" style={{ flex: "1 1 320px" }}>
                  <Stat label="Baseline" value={report.data.baseline ?? "—"} />
                  <Stat label="Current" value={report.data.current ?? "—"} />
                  <Stat
                    label="Improvement"
                    value={report.data.improvementPercent != null ? `${report.data.improvementPercent}%` : "—"}
                    sub="Lower score is healthier"
                  />
                </div>
              </div>
              <ul className="wk-list" style={{ marginTop: "1rem" }}>
                {report.data.points.slice(-8).reverse().map(point => (
                  <li key={point.id} style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                    <span>
                      <Activity size={12} style={{ display: "inline", marginRight: 6 }} />
                      {new Date(point.recordedAt).toLocaleDateString()} · {point.verdict}
                    </span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".78rem" }}>
                      {point.decayScore}/100 · {point.failingChecks} failing
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </>
  );
}
