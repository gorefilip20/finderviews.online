/**
 * Finder visual reminder: Atlas Field Notes — ledger rules, mono metadata, lime reserved for
 * verified opportunity and primary action.
 *
 * Shared workspace primitives. The score and evidence components deliberately surface
 * confidence and unobserved inputs: the product's core promise is that a user can always see
 * what a number is made of.
 */
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, Info, LoaderCircle, Minus, X } from "lucide-react";
import type { ReactNode } from "react";

export type ScoreFactor = {
  key: string;
  label: string;
  group: "gap" | "demand";
  weight: number;
  value: number;
  observed: boolean;
  evidence: string;
};

export type GapScore = {
  score: number;
  gapIndex: number;
  demandIndex: number;
  confidence: number;
  band: "prime" | "strong" | "watch" | "weak";
  headline: string;
  factors: ScoreFactor[];
  missingInputs: string[];
};

export type AuditCheck = {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail" | "unknown";
  weight: number;
  detail: string;
};

export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("wk-panel", className)}>
      {(title || actions) && (
        <div className="wk-panel__head">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="wk-actions" style={{ marginTop: 0 }}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="wk-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="wk-stat">
      <div className="wk-stat__k">{label}</div>
      <div className="wk-stat__v">{value}</div>
      {sub && <div className="wk-stat__s">{sub}</div>}
    </div>
  );
}

export function Note({
  tone = "default",
  children,
}: {
  tone?: "default" | "warn" | "info";
  children: ReactNode;
}) {
  const Icon = tone === "warn" ? AlertTriangle : Info;
  return (
    <div className={cn("wk-note", tone === "warn" && "wk-note--warn", tone === "info" && "wk-note--info")}>
      <Icon size={15} style={{ flex: "none", marginTop: 2 }} />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="wk-empty">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function Spinner({ size = 15 }: { size?: number }) {
  return <LoaderCircle size={size} className="wk-spin" />;
}

export function ScoreBadge({ score, band }: { score: number; band: GapScore["band"] }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: ".45rem" }}>
      <span className="wk-score">
        <span className="wk-score__n">{score}</span>
        <span className="wk-score__d">/100</span>
      </span>
      <span className="wk-band" data-band={band}>
        {band}
      </span>
    </span>
  );
}

/**
 * The full score breakdown. Unobserved factors are shown rather than hidden, because a
 * missing input is information the user needs when deciding how far to trust the ranking.
 */
export function ScoreBreakdown({ score }: { score: GapScore }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: ".9rem", flexWrap: "wrap" }}>
        <ScoreBadge score={score.score} band={score.band} />
        <div style={{ fontSize: ".8rem", color: "#6d7669" }}>
          gap {score.gapIndex} · demand {score.demandIndex} · {score.confidence}% observed
        </div>
      </div>
      <div className="wk-meter" style={{ marginTop: ".6rem" }}>
        <span style={{ width: `${score.score}%` }} />
      </div>
      <p style={{ fontSize: ".84rem", lineHeight: 1.6, color: "#4e574f", margin: ".7rem 0 0" }}>{score.headline}</p>

      <div style={{ marginTop: ".9rem" }}>
        {score.factors.map(factor => (
          <div className="wk-factor" key={factor.key} data-observed={factor.observed}>
            <div className="wk-factor__label">
              {factor.label}
              <span style={{ marginLeft: ".4rem", fontSize: ".68rem", color: "#8b9288", fontWeight: 500 }}>
                {factor.group}
              </span>
            </div>
            <div className="wk-factor__val">{factor.observed ? `${factor.value}` : "—"}</div>
            <div className="wk-factor__ev">{factor.evidence}</div>
          </div>
        ))}
      </div>

      {score.missingInputs.length > 0 && (
        <div style={{ marginTop: ".85rem" }}>
          <Note tone="warn">
            Not observed: {score.missingInputs.join(", ")}. These are excluded from the score's confidence rather
            than guessed.
          </Note>
        </div>
      )}
    </div>
  );
}

const CHECK_ICON = { pass: Check, warn: AlertTriangle, fail: X, unknown: Minus } as const;

export function CheckList({ checks }: { checks: AuditCheck[] }) {
  return (
    <div>
      {checks.map(check => {
        const Icon = CHECK_ICON[check.status];
        return (
          <div className="wk-check" key={check.key}>
            <div className="wk-check__s" data-s={check.status}>
              <Icon size={12} style={{ display: "inline", marginRight: 4, verticalAlign: "-1px" }} />
              {check.status}
            </div>
            <div className="wk-check__d">
              <b>{check.label}</b>
              {check.detail}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type ProviderStatus = {
  provider: string;
  connected: boolean;
  requiredEnv: string[];
  docsUrl: string;
  note: string;
};

export function SourceRow({ source }: { source: ProviderStatus }) {
  return (
    <div className="wk-source">
      <span className="wk-source__dot" data-on={source.connected} />
      <div style={{ minWidth: 0 }}>
        <div className="wk-source__b">
          {source.provider} — {source.connected ? "connected" : "not connected"}
        </div>
        <div className="wk-source__n">{source.note}</div>
        {!source.connected && <div className="wk-source__env">Set {source.requiredEnv.join(" and ")}</div>}
      </div>
    </div>
  );
}

/** Opens generated HTML (proposal, mockup, digest) in a new tab for review or printing. */
export function openHtmlInTab(html: string, title: string) {
  const tab = window.open("", "_blank", "noopener,noreferrer");
  if (!tab) return false;
  tab.document.open();
  tab.document.write(html);
  tab.document.close();
  tab.document.title = title;
  return true;
}
