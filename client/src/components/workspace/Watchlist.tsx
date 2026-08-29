/**
 * Finder visual reminder: Atlas Field Notes — a watchlist is a standing research order; the
 * digest reads like a field report, not a notification feed.
 *
 * Saved searches, alerts and the weekly digest. This is what turns Finder from a one-off list
 * generator into something worth opening every week: it re-runs the exact search and reports
 * only what is genuinely new.
 */
import { trpc } from "@/lib/trpc";
import { Bell, BellOff, Mail, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, Note, Panel, Spinner, Stat, openHtmlInTab } from "./shared";

const CADENCES = ["daily", "weekly", "monthly"] as const;

export default function Watchlist() {
  const utils = trpc.useUtils();
  const searches = trpc.savedSearches.list.useQuery();
  const alerts = trpc.savedSearches.alerts.useQuery({ limit: 60 });

  const run = trpc.savedSearches.run.useMutation({
    onSuccess: result => {
      toast.success(
        result.newProspects.length > 0
          ? `${result.newProspects.length} new match(es) in "${result.name}".`
          : `No new matches in "${result.name}" since the last run.`,
      );
      void utils.savedSearches.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const update = trpc.savedSearches.update.useMutation({
    onSuccess: () => void utils.savedSearches.invalidate(),
    onError: error => toast.error(error.message),
  });
  const remove = trpc.savedSearches.delete.useMutation({
    onSuccess: () => {
      toast.success("Watch removed.");
      void utils.savedSearches.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const markRead = trpc.savedSearches.markRead.useMutation({
    onSuccess: () => void utils.savedSearches.invalidate(),
  });
  const digest = trpc.digest.preview.useQuery(undefined, { enabled: false });
  const sendDigest = trpc.digest.send.useMutation({
    onSuccess: result => {
      if (result.sent) toast.success(`Digest sent to ${result.recipients.length} recipient(s).`);
      else toast.warning(result.reason ?? "The digest was built but not sent.");
    },
    onError: error => toast.error(error.message),
  });

  if (searches.isError) {
    return (
      <Panel>
        <Note tone="warn">{searches.error.message}</Note>
      </Panel>
    );
  }

  const rows = searches.data ?? [];
  const unread = (alerts.data ?? []).filter(alert => !alert.readAt);

  return (
    <>
      <div className="wk-head">
        <div className="wk-kicker">
          <span className="signal-dot" /> Watchlist
        </div>
        <h1>Standing orders on the markets you care about</h1>
        <p>
          Finder re-runs each saved search on its own cadence and reports only what changed. That difference — not
          the full list — is the reason to come back.
        </p>
      </div>

      <div className="wk-grid wk-grid--3" style={{ marginBottom: "1.2rem" }}>
        <Stat label="Watched markets" value={rows.length} sub="Saved searches in this workspace" />
        <Stat label="Unread alerts" value={unread.length} sub="New businesses since your last look" />
        <Stat
          label="Alerts on"
          value={rows.filter(row => row.alertsEnabled).length}
          sub="Searches that will re-run automatically"
        />
      </div>

      <Panel
        title="Weekly field report"
        description="Composes everything new across your watched markets into one email. Preview it here at any time."
        actions={
          <>
            <button
              className="wk-btn wk-btn--ghost wk-btn--sm"
              onClick={async () => {
                const result = await digest.refetch();
                if (result.data && !openHtmlInTab(result.data.html, result.data.subject)) {
                  toast.error("Your browser blocked the preview window. Allow pop-ups for this site.");
                }
              }}
            >
              {digest.isFetching ? <Spinner size={13} /> : <Mail size={13} />} Preview digest
            </button>
            <button className="wk-btn wk-btn--sm" disabled={sendDigest.isPending} onClick={() => sendDigest.mutate()}>
              {sendDigest.isPending ? <Spinner size={13} /> : <Mail size={13} />} Send now
            </button>
          </>
        }
      >
        <Note>
          Delivery needs an email provider key. Without one the digest still builds and previews — it just is not
          sent. Point any scheduler at <code>POST /api/cron/digest</code> to run it automatically.
        </Note>
      </Panel>

      {rows.length === 0 ? (
        <Panel>
          <EmptyState title="No watched markets yet">
            Run a finder, name the search, and choose “Watch this market”. Finder will keep checking it for you.
          </EmptyState>
        </Panel>
      ) : (
        <Panel title="Watched markets">
          <div style={{ overflowX: "auto" }}>
            <table className="wk-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Signal</th>
                  <th>Cadence</th>
                  <th>Last run</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} style={{ cursor: "default" }}>
                    <td>
                      <span className="wk-table__name">{row.name}</span>
                      <span className="wk-table__sub">
                        {(row.params as Record<string, string>).category} in{" "}
                        {(row.params as Record<string, string>).location}, {(row.params as Record<string, string>).country}
                      </span>
                    </td>
                    <td>{row.kind.replace(/_/g, " ")}</td>
                    <td>
                      <select
                        className="wk-select"
                        style={{ width: "auto", padding: ".25rem .4rem", fontSize: ".75rem" }}
                        value={row.cadence}
                        onChange={event => update.mutate({ id: row.id, cadence: event.target.value as (typeof CADENCES)[number] })}
                      >
                        {CADENCES.map(item => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ fontSize: ".8rem", color: "#6d7669" }}>
                      {row.lastRunAt ? new Date(row.lastRunAt).toLocaleDateString() : "Never"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: ".35rem", flexWrap: "wrap" }}>
                        <button className="wk-btn wk-btn--sm wk-btn--ghost" disabled={run.isPending} onClick={() => run.mutate({ id: row.id })}>
                          {run.isPending ? <Spinner size={12} /> : <Play size={12} />} Run
                        </button>
                        <button
                          className="wk-btn wk-btn--sm wk-btn--ghost"
                          onClick={() => update.mutate({ id: row.id, alertsEnabled: !row.alertsEnabled })}
                        >
                          {row.alertsEnabled ? <Bell size={12} /> : <BellOff size={12} />}
                          {row.alertsEnabled ? "On" : "Off"}
                        </button>
                        <button className="wk-btn wk-btn--sm wk-btn--danger" onClick={() => remove.mutate({ id: row.id })}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel
        title="Alerts"
        description="Businesses that appeared in a watched market since the previous run."
        actions={
          unread.length > 0 ? (
            <button
              className="wk-btn wk-btn--sm wk-btn--ghost"
              onClick={() => markRead.mutate({ ids: unread.slice(0, 200).map(alert => alert.id) })}
            >
              Mark all read
            </button>
          ) : undefined
        }
      >
        {(alerts.data ?? []).length === 0 ? (
          <EmptyState title="No alerts yet">
            Once a watched market has run twice, anything new since the previous run appears here.
          </EmptyState>
        ) : (
          <ul className="wk-list">
            {(alerts.data ?? []).map(alert => (
              <li key={alert.id} style={{ opacity: alert.readAt ? 0.6 : 1 }}>
                <strong>{alert.headline}</strong>
                <span style={{ display: "block", color: "#7c8479", fontSize: ".76rem", marginTop: ".2rem" }}>
                  {new Date(alert.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
