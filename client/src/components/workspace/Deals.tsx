/**
 * Finder visual reminder: Atlas Field Notes — a read receipt is a checked record. Lime marks the
 * one proposal worth calling about right now, nothing else.
 *
 * Deal tracking. A sent proposal used to vanish; this shows who opened it, how long they spent,
 * whether they reached the pricing, and what to do about it.
 */
import { trpc } from "@/lib/trpc";
import { Copy, ExternalLink, Link2, Phone, Ban } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, Field, Note, Panel, Spinner, Stat } from "./shared";

const STRENGTH_BAND: Record<string, string> = { hot: "prime", warm: "watch", cold: "weak", none: "weak" };

function readingTime(ms: number) {
  if (ms < 1000) return "—";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export default function Deals() {
  const [proposalId, setProposalId] = useState<number | null>(null);
  const [bookingUrl, setBookingUrl] = useState(() => {
    try {
      return localStorage.getItem("finder.bookingUrl") ?? "";
    } catch {
      return "";
    }
  });

  const utils = trpc.useUtils();
  const hot = trpc.sharing.hot.useQuery();
  const proposals = trpc.proposal.list.useQuery();
  const activity = trpc.sharing.activity.useQuery({ proposalId: proposalId ?? 0 }, { enabled: proposalId !== null });

  const createShare = trpc.sharing.create.useMutation({
    onSuccess: result => {
      toast.success("Share link created.");
      void navigator.clipboard.writeText(result.shareUrl).catch(() => undefined);
      void utils.sharing.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const revoke = trpc.sharing.revoke.useMutation({
    onSuccess: () => {
      toast.success("Link withdrawn.");
      void utils.sharing.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const rows = hot.data ?? [];
  const hotCount = rows.filter(row => row.signalStrength === "hot").length;

  const rememberBooking = (value: string) => {
    setBookingUrl(value);
    try {
      localStorage.setItem("finder.bookingUrl", value);
    } catch {
      /* a blocked localStorage is not worth interrupting the user over */
    }
  };

  return (
    <>
      <div className="wk-head">
        <div className="wk-kicker">
          <span className="signal-dot" /> Deals
        </div>
        <h1>Know when to pick up the phone</h1>
        <p>
          Every proposal you share reports how it was actually read — how many times, for how long, and whether the
          reader reached the pricing. That is the difference between guessing and calling at the right moment.
        </p>
      </div>

      {hot.isError ? (
        <Panel>
          <Note tone="warn">{hot.error.message}</Note>
        </Panel>
      ) : (
        <>
          <div className="wk-grid wk-grid--3" style={{ marginBottom: "1.2rem" }}>
            <Stat label="Call today" value={hotCount} sub="Strong buying signals right now" />
            <Stat label="Shared proposals" value={rows.length} sub="Live links in this workspace" />
            <Stat
              label="Accepted"
              value={rows.filter(row => row.share.status === "accepted").length}
              sub="Signed off through the document"
            />
          </div>

          <Panel
            title="Create a share link"
            description="Sharing a proposal as a link rather than a PDF is what makes tracking and one-click acceptance possible."
          >
            <div className="wk-grid wk-grid--2">
              <Field label="Proposal">
                <select
                  className="wk-select"
                  value={proposalId ?? ""}
                  onChange={event => setProposalId(event.target.value ? Number(event.target.value) : null)}
                >
                  <option value="">Select a saved proposal</option>
                  {(proposals.data ?? []).map(item => (
                    <option key={item.id} value={item.id}>
                      {item.prospectName} · {new Date(item.createdAt).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Booking link (optional)">
                <input
                  className="wk-input"
                  placeholder="https://cal.com/your-studio/15min"
                  value={bookingUrl}
                  onChange={event => rememberBooking(event.target.value)}
                />
              </Field>
            </div>
            <div className="wk-actions">
              <button
                className="wk-btn"
                disabled={proposalId === null || createShare.isPending}
                onClick={() =>
                  createShare.mutate({
                    proposalId: proposalId as number,
                    bookingUrl: bookingUrl.trim() || undefined,
                  })
                }
              >
                {createShare.isPending ? <Spinner /> : <Link2 size={15} />} Create link and copy
              </button>
            </div>
            {createShare.data && (
              <div style={{ marginTop: ".9rem" }}>
                <Note tone="info">
                  Ready and copied: <strong>{createShare.data.shareUrl}</strong>
                </Note>
              </div>
            )}
          </Panel>

          <Panel title="What is happening with your proposals">
            {rows.length === 0 ? (
              <EmptyState title="No shared proposals yet">
                Build a proposal in Studio, then create a share link here. From that moment you will see exactly how it
                is read.
              </EmptyState>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="wk-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Reading</th>
                      <th>What to do</th>
                      <th>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.share.id} style={{ cursor: "default" }}>
                        <td>
                          <span className="wk-band" data-band={STRENGTH_BAND[row.signalStrength]}>
                            {row.share.status}
                          </span>
                          <span className="wk-table__sub">
                            {row.lastSeenAt ? `Last opened ${new Date(row.lastSeenAt).toLocaleString()}` : "Not opened yet"}
                          </span>
                        </td>
                        <td>
                          <span className="wk-table__name">{row.opens} open{row.opens === 1 ? "" : "s"}</span>
                          <span className="wk-table__sub">
                            {readingTime(row.totalMs)}
                            {row.reachedPricing ? " · reached pricing" : ""}
                          </span>
                        </td>
                        <td style={{ maxWidth: 320 }}>
                          <span
                            className="wk-table__sub"
                            style={{ marginTop: 0, color: row.signalStrength === "hot" ? "#33621f" : undefined }}
                          >
                            {row.signalStrength === "hot" && <Phone size={12} style={{ display: "inline", marginRight: 4 }} />}
                            {row.signal}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: ".35rem", flexWrap: "wrap" }}>
                            <button
                              className="wk-btn wk-btn--sm wk-btn--ghost"
                              onClick={() => {
                                void navigator.clipboard.writeText(row.shareUrl).catch(() => undefined);
                                toast.success("Link copied.");
                              }}
                            >
                              <Copy size={12} />
                            </button>
                            <a className="wk-btn wk-btn--sm wk-btn--ghost" href={row.shareUrl} target="_blank" rel="noreferrer">
                              <ExternalLink size={12} />
                            </a>
                            <button
                              className="wk-btn wk-btn--sm wk-btn--danger"
                              onClick={() => revoke.mutate({ shareId: row.share.id })}
                            >
                              <Ban size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {proposalId !== null && (activity.data ?? []).length > 0 && (
            <Panel title="Section by section" description="Where the reader actually spent their attention.">
              {(activity.data ?? []).map(entry => (
                <div key={entry.share.id} style={{ marginBottom: "1rem" }}>
                  <Note tone={entry.signalStrength === "hot" ? "info" : "default"}>{entry.signal}</Note>
                  <ul className="wk-list" style={{ marginTop: ".6rem" }}>
                    {Object.entries(entry.sectionMs)
                      .sort((a, b) => b[1] - a[1])
                      .map(([section, ms]) => (
                        <li key={section} style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                          <span style={{ textTransform: "capitalize" }}>{section}</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".78rem" }}>{readingTime(ms)}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </Panel>
          )}
        </>
      )}
    </>
  );
}
