/**
 * Finder visual reminder: Atlas Field Notes — the research desk is a quiet working file:
 * paper ground, ledger rules, mono metadata, and Scout Lime only on the decisive action.
 *
 * The workspace shell. Everything a signed-in user does lives behind one nav so the tool is
 * learned once, and the environment's real capabilities are stated up front rather than
 * discovered through a failed click.
 */
import FinderLogo from "@/components/FinderLogo";
import Audit from "@/components/workspace/Audit";
import Contacts from "@/components/workspace/Contacts";
import Discover from "@/components/workspace/Discover";
import Partnerships from "@/components/workspace/Partnerships";
import Pipeline from "@/components/workspace/Pipeline";
import Settings from "@/components/workspace/Settings";
import Studio from "@/components/workspace/Studio";
import Watchlist from "@/components/workspace/Watchlist";
import { Note, Panel, Spinner } from "@/components/workspace/shared";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  AtSign,
  Bell,
  FileText,
  Gauge,
  Handshake,
  KanbanSquare,
  LogOut,
  Search,
  Settings as SettingsIcon,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

type Section = "discover" | "audit" | "contacts" | "partnerships" | "pipeline" | "watchlist" | "studio" | "settings";

const NAV: { group: string; items: { key: Section; label: string; icon: typeof Search }[] }[] = [
  {
    group: "Find",
    items: [
      { key: "discover", label: "Discover", icon: Search },
      { key: "audit", label: "Site audit", icon: Gauge },
      { key: "contacts", label: "Contacts", icon: AtSign },
      { key: "partnerships", label: "Partnerships", icon: Handshake },
    ],
  },
  {
    group: "Work",
    items: [
      { key: "pipeline", label: "Pipeline", icon: KanbanSquare },
      { key: "watchlist", label: "Watchlist", icon: Bell },
      { key: "studio", label: "Studio", icon: FileText },
    ],
  },
  {
    group: "Configure",
    items: [{ key: "settings", label: "Settings", icon: SettingsIcon }],
  },
];

export default function Workspace() {
  const [section, setSection] = useState<Section>("discover");
  const { user, isLoading, login, logout } = useAuth();
  const capabilities = trpc.system.capabilities.useQuery();
  const alerts = trpc.savedSearches.alerts.useQuery({ unreadOnly: true, limit: 50 }, { enabled: Boolean(user), retry: false });

  const agencyName = user?.name ? `${user.name}` : "Your studio";

  if (isLoading) {
    return (
      <div className="wk" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <Spinner size={22} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="wk">
        <div className="wk-top">
          <Link href="/">
            <FinderLogo />
          </Link>
        </div>
        <div className="wk-main" style={{ maxWidth: 640, margin: "0 auto", paddingTop: "4rem" }}>
          <div className="wk-head">
            <div className="wk-kicker">
              <span className="signal-dot" /> Research desk
            </div>
            <h1>Sign in to open your workspace</h1>
            <p>
              Discovery, scoring, the pipeline, proposals and watchlists are all tied to your workspace, so they need
              an account. The single-site audit works without one.
            </p>
          </div>
          <div className="wk-actions">
            <button className="wk-btn" onClick={login}>
              Sign in
            </button>
            <Link href="/" className="wk-btn wk-btn--ghost">
              Back to the site
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const unreadCount = alerts.data?.length ?? 0;
  const capability = capabilities.data;

  return (
    <div className="wk">
      <header className="wk-top">
        <Link href="/">
          <FinderLogo />
        </Link>
        <div className="wk-top__spacer" />
        <div className="wk-top__user">
          <span>{user.name || user.email}</span>
          <button className="wk-btn wk-btn--sm wk-btn--ghost" onClick={logout}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </header>

      <div className="wk-body">
        <nav className="wk-side">
          {NAV.map(group => (
            <div className="wk-side__group" key={group.group}>
              <div className="wk-side__label">{group.group}</div>
              {group.items.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className="wk-side__item"
                    data-active={section === item.key}
                    onClick={() => setSection(item.key)}
                  >
                    <Icon size={15} />
                    {item.label}
                    {item.key === "watchlist" && unreadCount > 0 && <span className="wk-side__badge">{unreadCount}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <main className="wk-main">
          {capability && !capability.database && (
            <div style={{ marginBottom: "1.2rem" }}>
              <Note tone="warn">
                <strong>No database connected.</strong> Discovery and the site audit work now. Saving prospects, the
                pipeline, watchlists, proposals and team seats need storage — set <code>DATABASE_URL</code> and run{" "}
                <code>pnpm db:push</code>.
              </Note>
            </div>
          )}
          {capability && capability.database && !capability.ai && (
            <div style={{ marginBottom: "1.2rem" }}>
              <Note>
                AI proposal copy is switched off because no AI service is configured. Every other part of the
                proposal — the audit, the scope and the pricing — is generated without it.
              </Note>
            </div>
          )}

          {section === "discover" && <Discover agencyName={agencyName} />}
          {section === "audit" && <Audit />}
          {section === "contacts" && <Contacts />}
          {section === "partnerships" && <Partnerships />}
          {section === "pipeline" && <Pipeline />}
          {section === "watchlist" && <Watchlist />}
          {section === "studio" && <Studio agencyName={agencyName} />}
          {section === "settings" && <Settings />}
        </main>
      </div>
    </div>
  );
}
