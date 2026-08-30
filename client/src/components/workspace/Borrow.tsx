/**
 * Finder visual reminder: Atlas Field Notes — an open door is a verified finding. Lime marks the
 * door you can walk through today, nothing else.
 *
 * Borrowed attention. Finds the people, shows, newsletters and communities that already hold the
 * audience you want, and — more usefully — the standing invitation each one published for being
 * approached.
 */
import { trpc } from "@/lib/trpc";
import {
  CalendarCheck,
  DoorOpen,
  ExternalLink,
  ListChecks,
  Search,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, Field, Note, Panel, Spinner, Stat } from "./shared";

const STATUSES = ["found", "approached", "booked", "published", "declined"] as const;

const BAND_TONE: Record<string, string> = { open: "prime", reachable: "watch", closed: "weak" };

export default function Borrow() {
  const [url, setUrl] = useState("");
  const [topics, setTopics] = useState("");
  const [bulk, setBulk] = useState("");
  const [mode, setMode] = useState<"single" | "shortlist">("single");

  const utils = trpc.useUtils();
  const grounds = trpc.attention.grounds.useQuery();
  const roster = trpc.attention.list.useQuery();

  const topicList = topics
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);

  const analyse = trpc.attention.analyse.useMutation({
    onSuccess: result => {
      toast[result.reachable ? "success" : "warning"](result.note);
      void utils.attention.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const shortlist = trpc.attention.shortlist.useMutation({
    onError: error => toast.error(error.message),
  });
  const setStatus = trpc.attention.setStatus.useMutation({
    onSuccess: () => void utils.attention.invalidate(),
    onError: error => toast.error(error.message),
  });
  const remove = trpc.attention.remove.useMutation({
    onSuccess: () => void utils.attention.invalidate(),
    onError: error => toast.error(error.message),
  });

  const analysis = analyse.data?.analysis ?? null;
  const rows = roster.data ?? [];
  const booked = rows.filter(row => row.status === "booked" || row.status === "published").length;
  const withBooking = rows.filter(row => row.bookingUrl).length;

  return (
    <>
      <div className="wk-head">
        <div className="wk-kicker">
          <span className="signal-dot" /> Borrow
        </div>
        <h1>Borrow attention before you earn it</h1>
        <p>
          Building an audience from nothing is slow. Other people already built one — and many of them
          published a standing invitation to be approached. Finder looks for those <strong>open doors</strong>:
          a booking link, a be-a-guest page, a sponsor rate card, a call for speakers.
        </p>
      </div>

      <Note tone="info">
        A cold email is permission you assume. A published booking link is permission they gave. Finder ranks
        openness above audience size for exactly that reason — a show with 3,000 listeners that answers beats one with
        300,000 that never will.
      </Note>

      <Panel
        title="Find the door"
        description="Point Finder at a podcast, newsletter, community, event, founder or brand. It reads their own site for every published way in."
        actions={
          <div style={{ display: "flex", gap: ".4rem" }}>
            <button
              className={`wk-btn wk-btn--sm ${mode === "single" ? "" : "wk-btn--ghost"}`}
              onClick={() => setMode("single")}
            >
              One at a time
            </button>
            <button
              className={`wk-btn wk-btn--sm ${mode === "shortlist" ? "" : "wk-btn--ghost"}`}
              onClick={() => setMode("shortlist")}
            >
              Shortlist
            </button>
          </div>
        }
      >
        <Field label="Your own topics (used only to measure overlap)">
          <input
            className="wk-input"
            placeholder="web design, small business, branding"
            value={topics}
            onChange={event => setTopics(event.target.value)}
          />
        </Field>

        {mode === "single" ? (
          <div style={{ display: "flex", gap: ".7rem", alignItems: "flex-end", flexWrap: "wrap", marginTop: ".85rem" }}>
            <div style={{ flex: "1 1 320px" }}>
              <Field label="Their website">
                <input
                  className="wk-input"
                  placeholder="somepodcast.com"
                  value={url}
                  onChange={event => setUrl(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === "Enter" && url.trim()) {
                      analyse.mutate({ url: url.trim(), myTopics: topicList });
                    }
                  }}
                />
              </Field>
            </div>
            <button
              className="wk-btn"
              disabled={!url.trim() || analyse.isPending}
              onClick={() => analyse.mutate({ url: url.trim(), myTopics: topicList })}
            >
              {analyse.isPending ? <Spinner /> : <DoorOpen size={15} />} Find open doors
            </button>
          </div>
        ) : (
          <div style={{ marginTop: ".85rem" }}>
            <Field label="Up to eight websites, one per line">
              <textarea
                className="wk-textarea"
                style={{ minHeight: 120 }}
                placeholder={"showone.com\nnewsletter.example\ncommunity.example"}
                value={bulk}
                onChange={event => setBulk(event.target.value)}
              />
            </Field>
            <div className="wk-actions">
              <button
                className="wk-btn"
                disabled={shortlist.isPending || bulk.trim().length === 0}
                onClick={() =>
                  shortlist.mutate({
                    urls: bulk
                      .split(/\n|,/)
                      .map(item => item.trim())
                      .filter(Boolean)
                      .slice(0, 8),
                    myTopics: topicList,
                  })
                }
              >
                {shortlist.isPending ? <Spinner /> : <ListChecks size={15} />} Rank them
              </button>
            </div>
          </div>
        )}
      </Panel>

      {/* ------------------------------------------------------ single result */}
      {mode === "single" && analysis && (
        <>
          <div className="wk-grid wk-grid--4" style={{ marginBottom: "1.1rem" }}>
            <Stat label="Borrow score" value={`${analysis.score.score}/100`} sub={analysis.score.band} />
            <Stat label="Open doors" value={analysis.doors.length} sub="Published ways in" />
            <Stat
              label="Audience"
              value={analysis.audience.estimate ? analysis.audience.estimate.toLocaleString() : "—"}
              sub={analysis.audience.estimate ? "As they state it" : "No figure published"}
            />
            <Stat label="Channel" value={analysis.channel.type} sub={`${analysis.channel.confidence}% confidence`} />
          </div>

          <Note tone={analysis.score.band === "open" ? "info" : analysis.score.band === "closed" ? "warn" : "default"}>
            {analysis.score.headline}
          </Note>

          {analysis.bookingLinks.length > 0 && (
            <Panel title="Book time directly">
              {analysis.bookingLinks.map(link => (
                <div
                  key={link.url}
                  style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap", padding: ".55rem 0", borderTop: "1px solid #ecebe4" }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: ".9rem" }}>
                      {link.provider}
                      {link.minutes ? ` · ${link.minutes} min` : ""} · {link.intent}
                    </div>
                    <div className="wk-table__sub" style={{ wordBreak: "break-all" }}>{link.url}</div>
                  </div>
                  <a className="wk-btn wk-btn--sm wk-btn--lime" href={link.url} target="_blank" rel="noreferrer">
                    <CalendarCheck size={13} /> Book
                  </a>
                </div>
              ))}
            </Panel>
          )}

          <Panel title="Every door they left open" description={analysis.nextStep}>
            {analysis.doors.length === 0 ? (
              <EmptyState title="No published door">
                Nothing here invites an approach. Follow their work, be useful in public, and come back once you are a
                familiar name.
              </EmptyState>
            ) : (
              analysis.doors.map(door => (
                <div key={door.key} style={{ padding: ".8rem 0", borderTop: "1px solid #ecebe4" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 750, fontSize: ".95rem" }}>{door.label}</div>
                    {door.url && (
                      <a className="wk-btn wk-btn--sm wk-btn--ghost" href={door.url} target="_blank" rel="noreferrer">
                        <ExternalLink size={12} /> Open
                      </a>
                    )}
                  </div>
                  <div className="wk-table__sub" style={{ marginTop: ".25rem" }}>{door.evidence}</div>
                  <div style={{ fontSize: ".82rem", color: "#4e574f", marginTop: ".4rem", lineHeight: 1.6 }}>{door.why}</div>
                  <div style={{ fontSize: ".82rem", color: "#33621f", marginTop: ".3rem", lineHeight: 1.6 }}>
                    <strong>How:</strong> {door.approach}
                  </div>
                </div>
              ))
            )}
          </Panel>

          <Panel title="How the score was reached">
            {analysis.score.factors.map(factor => (
              <div className="wk-factor" key={factor.label} data-observed="true">
                <div className="wk-factor__label">
                  {factor.label}
                  <span style={{ marginLeft: ".4rem", fontSize: ".68rem", color: "#8b9288", fontWeight: 500 }}>
                    weight {factor.weight}
                  </span>
                </div>
                <div className="wk-factor__val">{factor.value}</div>
                <div className="wk-factor__ev">{factor.note}</div>
              </div>
            ))}
          </Panel>
        </>
      )}

      {/* --------------------------------------------------- shortlist result */}
      {mode === "shortlist" && shortlist.data && (
        <Panel title="Ranked shortlist" description="Highest borrow score first — openness weighted above audience size.">
          <div style={{ overflowX: "auto" }}>
            <table className="wk-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Channel</th>
                  <th>Doors</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {shortlist.data.map(row => (
                  <tr key={row.url} style={{ cursor: "default" }}>
                    <td>
                      <span className="wk-table__name">{row.analysis?.name ?? row.url}</span>
                      <span className="wk-table__sub">{row.url}</span>
                    </td>
                    <td>{row.analysis?.channel.type ?? "—"}</td>
                    <td>
                      <span className="wk-table__sub" style={{ marginTop: 0 }}>
                        {row.analysis ? row.analysis.doors.map(door => door.label).join(" · ") || "None" : (row.error ?? "—")}
                      </span>
                    </td>
                    <td>
                      {row.analysis ? (
                        <span className="wk-band" data-band={BAND_TONE[row.analysis.score.band]}>
                          {row.analysis.score.score}
                        </span>
                      ) : (
                        <span style={{ color: "#8b9288" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* ------------------------------------------------------------ roster */}
      {roster.isError ? (
        <Panel>
          <Note tone="warn">{roster.error.message}</Note>
        </Panel>
      ) : rows.length > 0 ? (
        <Panel title={`Your list · ${rows.length}`}>
          <div className="wk-grid wk-grid--3" style={{ marginBottom: "1rem" }}>
            <Stat label="With a booking link" value={withBooking} sub="Can be booked today" />
            <Stat label="Booked or published" value={booked} sub="Attention actually borrowed" />
            <Stat label="Still to approach" value={rows.filter(row => row.status === "found").length} sub="Doors not yet walked through" />
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="wk-table">
              <thead>
                <tr>
                  <th>Who</th>
                  <th>Door</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} style={{ cursor: "default" }}>
                    <td>
                      <span className="wk-table__name">{row.name}</span>
                      <span className="wk-table__sub">
                        {row.channelType}
                        {row.audienceEstimate ? ` · ${row.audienceEstimate.toLocaleString()} people` : ""}
                      </span>
                    </td>
                    <td>
                      {row.bookingUrl ? (
                        <a className="wk-btn wk-btn--sm wk-btn--lime" href={row.bookingUrl} target="_blank" rel="noreferrer">
                          <CalendarCheck size={12} /> {row.bookingProvider}
                        </a>
                      ) : (
                        <span className="wk-table__sub" style={{ marginTop: 0 }}>{row.contactEmail ?? "No direct route"}</span>
                      )}
                    </td>
                    <td>{row.borrowScore ?? "—"}</td>
                    <td>
                      <select
                        className="wk-select"
                        style={{ width: "auto", padding: ".2rem .35rem", fontSize: ".72rem" }}
                        value={row.status}
                        onChange={event =>
                          setStatus.mutate({ id: row.id, status: event.target.value as (typeof STATUSES)[number] })
                        }
                      >
                        {STATUSES.map(status => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
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
      ) : (
        !analysis && (
          <Panel>
            <EmptyState title="Nothing on your list yet">
              <span style={{ display: "inline-flex", alignItems: "center", gap: ".35rem" }}>
                <Search size={14} /> Start with one show, newsletter or founder you already admire. Finder will tell you
                whether they left a door open.
              </span>
            </EmptyState>
          </Panel>
        )
      )}

      <Panel title="Where to look" description="Finder reads a site you give it. This is how to build the list in the first place.">
        {(grounds.data ?? []).map(ground => (
          <div key={ground.channel} style={{ padding: ".7rem 0", borderTop: "1px solid #ecebe4" }}>
            <div style={{ fontWeight: 700, fontSize: ".88rem", textTransform: "capitalize" }}>{ground.channel}</div>
            <div style={{ fontSize: ".83rem", color: "#4e574f", marginTop: ".25rem", lineHeight: 1.6 }}>{ground.where}</div>
            <div style={{ fontSize: ".81rem", color: "#33621f", marginTop: ".25rem", lineHeight: 1.6 }}>{ground.tip}</div>
          </div>
        ))}
      </Panel>
    </>
  );
}
