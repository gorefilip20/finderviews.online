/**
 * Finder visual reminder: Atlas Field Notes — the board is a working file, not a dashboard;
 * stage columns stay quiet and the record does the talking.
 *
 * Pipeline. Discovery is only half the job: this is where a found business becomes tracked
 * work, assigned to a person, with a follow-up date and a visible history.
 */
import { trpc } from "@/lib/trpc";
import { CalendarClock, ExternalLink, Save, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, Field, Note, Panel, ScoreBadge, Spinner, Stat, type GapScore } from "./shared";

const STAGES = ["new", "researching", "contacted", "replied", "proposal", "won", "lost"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_LABEL: Record<Stage, string> = {
  new: "New",
  researching: "Researching",
  contacted: "Contacted",
  replied: "Replied",
  proposal: "Proposal out",
  won: "Won",
  lost: "Lost",
};

export default function Pipeline() {
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [value, setValue] = useState("");
  const [followUp, setFollowUp] = useState("");

  const utils = trpc.useUtils();
  const list = trpc.pipeline.list.useQuery();
  const summary = trpc.pipeline.summary.useQuery();
  const workspace = trpc.workspace.current.useQuery();
  const timeline = trpc.pipeline.timeline.useQuery(
    { entryId: selectedEntryId ?? 0 },
    { enabled: selectedEntryId !== null },
  );

  const update = trpc.pipeline.update.useMutation({
    onSuccess: () => {
      toast.success("Pipeline updated.");
      void utils.pipeline.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const rows = list.data ?? [];
  const selected = rows.find(row => row.entry.id === selectedEntryId) ?? null;

  const openEntry = (entryId: number) => {
    const row = rows.find(item => item.entry.id === entryId);
    setSelectedEntryId(entryId);
    setNotes(row?.entry.notes ?? "");
    setValue(row?.entry.value != null ? String(row.entry.value) : "");
    setFollowUp(row?.entry.nextFollowUpAt ? new Date(row.entry.nextFollowUpAt).toISOString().slice(0, 10) : "");
  };

  if (list.isLoading) {
    return (
      <Panel>
        <EmptyState title="Loading your pipeline">
          <Spinner /> Fetching tracked opportunities.
        </EmptyState>
      </Panel>
    );
  }

  if (list.isError) {
    return (
      <Panel>
        <Note tone="warn">{list.error.message}</Note>
      </Panel>
    );
  }

  const totals = summary.data;

  return (
    <>
      <div className="wk-head">
        <div className="wk-kicker">
          <span className="signal-dot" /> Pipeline
        </div>
        <h1>From found to won</h1>
        <p>
          Everything you add here is de-duplicated across the workspace. Moving a business to “Contacted”
          automatically hides it from future discovery results so nobody approaches it twice.
        </p>
      </div>

      {totals && (
        <div className="wk-grid wk-grid--4" style={{ marginBottom: "1.2rem" }}>
          <Stat label="Open" value={STAGES.slice(0, 5).reduce((sum, stage) => sum + totals.byStage[stage].count, 0)} sub="Not yet won or lost" />
          <Stat label="Won" value={totals.byStage.won.count} sub={`${totals.byStage.won.value.toLocaleString()} recorded value`} />
          <Stat label="Follow-ups due" value={totals.followUpsDue} sub="Scheduled for today or earlier" />
          <Stat label="Tracked total" value={rows.length} sub="Businesses in this workspace" />
        </div>
      )}

      {rows.length === 0 ? (
        <Panel>
          <EmptyState title="Nothing in the pipeline yet">
            Run a finder, open a business, and choose “Add to pipeline”. It will appear here with its score and
            evidence attached.
          </EmptyState>
        </Panel>
      ) : (
        <Panel title="Board">
          <div className="wk-board">
            {STAGES.map(stage => {
              const inStage = rows.filter(row => row.entry.stage === stage);
              return (
                <div className="wk-col" key={stage}>
                  <div className="wk-col__h">
                    <span className="wk-col__t">{STAGE_LABEL[stage]}</span>
                    <span className="wk-col__t">{inStage.length}</span>
                  </div>
                  {inStage.map(row => (
                    <div className="wk-card" key={row.entry.id}>
                      <button
                        type="button"
                        onClick={() => openEntry(row.entry.id)}
                        style={{ background: "none", border: 0, padding: 0, textAlign: "left", width: "100%" }}
                      >
                        <div className="wk-card__n">{row.prospect.name}</div>
                        <div className="wk-card__m">
                          {row.prospect.category} · {row.prospect.country}
                        </div>
                      </button>
                      <div className="wk-card__f">
                        {row.prospect.gapScore != null && (
                          <ScoreBadge
                            score={row.prospect.gapScore}
                            band={(row.prospect.gapFactors as GapScore | null)?.band ?? "watch"}
                          />
                        )}
                        <select
                          className="wk-select"
                          style={{ width: "auto", padding: ".2rem .3rem", fontSize: ".7rem" }}
                          value={row.entry.stage}
                          onChange={event =>
                            update.mutate({ entryId: row.entry.id, stage: event.target.value as Stage })
                          }
                        >
                          {STAGES.map(item => (
                            <option key={item} value={item}>
                              {STAGE_LABEL[item]}
                            </option>
                          ))}
                        </select>
                      </div>
                      {row.assigneeName && (
                        <div className="wk-card__m" style={{ display: "flex", alignItems: "center", gap: ".3rem" }}>
                          <UserRound size={11} /> {row.assigneeName}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {selected && (
        <Panel title={selected.prospect.name} description={selected.prospect.signalSummary ?? undefined}>
          <div className="wk-grid wk-grid--3">
            <Field label="Assigned to">
              <select
                className="wk-select"
                value={selected.entry.assignedUserId ?? ""}
                onChange={event =>
                  update.mutate({
                    entryId: selected.entry.id,
                    assignedUserId: event.target.value ? Number(event.target.value) : null,
                  })
                }
              >
                <option value="">Unassigned</option>
                {(workspace.data?.members ?? [])
                  .filter(member => member.userId)
                  .map(member => (
                    <option key={member.id} value={member.userId as number}>
                      {member.name || member.email || `Member ${member.id}`}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Deal value">
              <input className="wk-input" type="number" min={0} value={value} onChange={event => setValue(event.target.value)} />
            </Field>
            <Field label="Next follow-up">
              <input className="wk-input" type="date" value={followUp} onChange={event => setFollowUp(event.target.value)} />
            </Field>
          </div>

          <div style={{ marginTop: ".85rem" }}>
            <Field label="Notes">
              <textarea className="wk-textarea" value={notes} onChange={event => setNotes(event.target.value)} />
            </Field>
          </div>

          <div className="wk-actions">
            <button
              className="wk-btn"
              disabled={update.isPending}
              onClick={() =>
                update.mutate({
                  entryId: selected.entry.id,
                  notes,
                  value: value ? Number(value) : null,
                  nextFollowUpAt: followUp ? new Date(followUp) : null,
                })
              }
            >
              {update.isPending ? <Spinner /> : <Save size={15} />} Save changes
            </button>
            {selected.prospect.listingUrl && (
              <a className="wk-btn wk-btn--ghost" href={selected.prospect.listingUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={15} /> Public listing
              </a>
            )}
          </div>

          {timeline.data && timeline.data.length > 0 && (
            <div style={{ marginTop: "1.2rem" }}>
              <div className="wk-kicker" style={{ marginBottom: ".5rem" }}>
                <CalendarClock size={12} /> History
              </div>
              <ul className="wk-list">
                {timeline.data.map(event => (
                  <li key={event.id}>
                    <strong>{event.kind.replace(/_/g, " ")}</strong> — {event.detail}
                    <span style={{ color: "#7c8479" }}> · {new Date(event.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
