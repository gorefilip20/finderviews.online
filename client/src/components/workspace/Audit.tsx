/**
 * Finder visual reminder: Atlas Field Notes — every check is a stated observation, never an
 * inference.
 *
 * Single-URL site audit. Runs with no data-provider credential, so it works on a bare
 * deployment and doubles as the fastest way to qualify a business someone just mentioned.
 */
import { trpc } from "@/lib/trpc";
import { Gauge, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CheckList, EmptyState, Field, Note, Panel, Spinner, Stat } from "./shared";

const VERDICT_TONE: Record<string, "default" | "warn" | "info"> = {
  healthy: "info",
  aging: "warn",
  decayed: "warn",
  broken: "warn",
  unreachable: "warn",
};

export default function Audit() {
  const [url, setUrl] = useState("");
  const audit = trpc.finder.auditSite.useMutation({
    onError: error => toast.error(error.message),
  });
  const result = audit.data;

  return (
    <>
      <div className="wk-head">
        <div className="wk-kicker">
          <span className="signal-dot" /> Site audit
        </div>
        <h1>Check any website in seconds</h1>
        <p>
          A live reading of a public page: security, mobile readiness, speed, freshness and measurement. Use it to
          qualify a single business, or as the evidence base for a proposal.
        </p>
      </div>

      <Panel>
        <div style={{ display: "flex", gap: ".7rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px" }}>
            <Field label="Website address">
              <input
                className="wk-input"
                placeholder="example.com"
                value={url}
                onChange={event => setUrl(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter" && url.trim()) audit.mutate({ url: url.trim() });
                }}
              />
            </Field>
          </div>
          <button className="wk-btn" disabled={!url.trim() || audit.isPending} onClick={() => audit.mutate({ url: url.trim() })}>
            {audit.isPending ? <Spinner /> : <Search size={15} />} Audit site
          </button>
        </div>
      </Panel>

      {result && (
        <>
          <div className="wk-grid wk-grid--4" style={{ marginBottom: "1.1rem" }}>
            <Stat label="Decay score" value={`${result.decayScore}/100`} sub="Higher means more decayed" />
            <Stat label="Verdict" value={result.verdict} sub={result.reachable ? "Page responded" : "No response"} />
            <Stat
              label="Response time"
              value={result.responseMs != null ? `${result.responseMs}ms` : "—"}
              sub="Time to first byte"
            />
            <Stat
              label="Mobile ready"
              value={result.mobileFriendly ? "Yes" : "No"}
              sub={result.secure ? "Served over HTTPS" : "Not served over HTTPS"}
            />
          </div>

          <Panel title="What was checked" description={`Read live from ${result.finalUrl} on ${new Date(result.fetchedAt).toLocaleString()}.`}>
            <Note tone={VERDICT_TONE[result.verdict] ?? "default"}>{result.headline}</Note>
            <div style={{ marginTop: ".8rem" }}>
              <CheckList checks={result.checks} />
            </div>
          </Panel>
        </>
      )}

      {!result && !audit.isPending && (
        <Panel>
          <EmptyState title="Nothing audited yet">
            <span style={{ display: "inline-flex", alignItems: "center", gap: ".35rem" }}>
              <Gauge size={14} /> Enter a website address to run a live check. Private and internal addresses are
              rejected.
            </span>
          </EmptyState>
        </Panel>
      )}
    </>
  );
}
