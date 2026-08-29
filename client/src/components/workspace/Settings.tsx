/**
 * Finder visual reminder: Atlas Field Notes — settings are a stated policy, not a form dump;
 * each block says plainly what it changes about the work.
 *
 * Workspace settings: the ideal-customer profile that ranks every finder, the people who
 * share the workspace, territory and suppression rules, export routes and data sources.
 */
import { MARKET_COVERAGE, SUPPORTED_REGIONS, type MarketRegion } from "@/lib/marketCoverage";
import { trpc } from "@/lib/trpc";
import { Download, Link2, MapPin, Plus, ShieldOff, Trash2, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, Field, Note, Panel, SourceRow, Spinner, Stat, type ProviderStatus } from "./shared";

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function Settings() {
  const utils = trpc.useUtils();

  const workspace = trpc.workspace.current.useQuery();
  const icps = trpc.icp.list.useQuery();
  const territories = trpc.territory.list.useQuery();
  const suppressions = trpc.suppression.list.useQuery();
  const integrations = trpc.exports.integrations.useQuery();
  const sources = trpc.finder.sources.useQuery();
  const csv = trpc.exports.csv.useQuery(undefined, { enabled: false });

  const [icpName, setIcpName] = useState("Core profile");
  const [icpIndustries, setIcpIndustries] = useState("dentist, law firm, clinic");
  const [icpRegions, setIcpRegions] = useState<MarketRegion[]>(["Americas"]);
  const [icpCountries, setIcpCountries] = useState("United States");
  const [icpMinScore, setIcpMinScore] = useState(55);
  const [icpMinRating, setIcpMinRating] = useState(4.2);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");

  const [territoryLabel, setTerritoryLabel] = useState("");

  const [hubspotToken, setHubspotToken] = useState("");
  const [airtableKey, setAirtableKey] = useState("");
  const [airtableBase, setAirtableBase] = useState("");
  const [airtableTable, setAirtableTable] = useState("Prospects");

  const createIcp = trpc.icp.create.useMutation({
    onSuccess: () => {
      toast.success("Profile saved. Finders will now rank against it.");
      void utils.icp.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const updateIcp = trpc.icp.update.useMutation({
    onSuccess: () => void utils.icp.invalidate(),
    onError: error => toast.error(error.message),
  });
  const deleteIcp = trpc.icp.delete.useMutation({
    onSuccess: () => void utils.icp.invalidate(),
    onError: error => toast.error(error.message),
  });
  const invite = trpc.workspace.invite.useMutation({
    onSuccess: result => {
      toast.success(result.note);
      setInviteEmail("");
      void utils.workspace.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const removeMember = trpc.workspace.removeMember.useMutation({
    onSuccess: () => void utils.workspace.invalidate(),
    onError: error => toast.error(error.message),
  });
  const setSeats = trpc.workspace.setSeatLimit.useMutation({
    onSuccess: () => void utils.workspace.invalidate(),
    onError: error => toast.error(error.message),
  });
  const claim = trpc.territory.claim.useMutation({
    onSuccess: result => {
      toast[result.claimed ? "success" : "warning"](result.note);
      setTerritoryLabel("");
      void utils.territory.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const release = trpc.territory.release.useMutation({
    onSuccess: () => void utils.territory.invalidate(),
    onError: error => toast.error(error.message),
  });
  const unsuppress = trpc.suppression.remove.useMutation({
    onSuccess: () => void utils.suppression.invalidate(),
    onError: error => toast.error(error.message),
  });
  const connect = trpc.exports.connect.useMutation({
    onSuccess: () => {
      toast.success("Connected.");
      void utils.exports.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const disconnect = trpc.exports.disconnect.useMutation({
    onSuccess: () => void utils.exports.invalidate(),
    onError: error => toast.error(error.message),
  });

  if (workspace.isError) {
    return (
      <Panel>
        <Note tone="warn">{workspace.error.message}</Note>
      </Panel>
    );
  }

  const members = workspace.data?.members ?? [];
  const seatLimit = workspace.data?.workspace.seatLimit ?? 3;

  return (
    <>
      <div className="wk-head">
        <div className="wk-kicker">
          <span className="signal-dot" /> Settings
        </div>
        <h1>How this workspace works</h1>
        <p>
          The profile below ranks every finder. Territory and suppression rules keep a team from approaching the
          same business twice.
        </p>
      </div>

      <div className="wk-grid wk-grid--3" style={{ marginBottom: "1.2rem" }}>
        <Stat label="Seats used" value={`${members.length} / ${seatLimit}`} sub={workspace.data?.workspace.name} />
        <Stat label="Profiles" value={(icps.data ?? []).length} sub="Ideal customer definitions" />
        <Stat label="Suppressed" value={(suppressions.data ?? []).length} sub="Businesses hidden from results" />
      </div>

      {/* ------------------------------------------------------------- ICP */}
      <Panel
        title="Ideal customer profile"
        description="Define your ideal client once. Every finder then scores against your business rather than a generic notion of a good lead."
      >
        <div className="wk-grid wk-grid--2">
          <Field label="Profile name">
            <input className="wk-input" value={icpName} onChange={event => setIcpName(event.target.value)} />
          </Field>
          <Field label="Industries (comma separated)">
            <input className="wk-input" value={icpIndustries} onChange={event => setIcpIndustries(event.target.value)} />
          </Field>
        </div>
        <div className="wk-grid wk-grid--4" style={{ marginTop: ".85rem" }}>
          <Field label="Regions">
            <select
              className="wk-select"
              multiple
              value={icpRegions}
              onChange={event =>
                setIcpRegions(Array.from(event.target.selectedOptions).map(option => option.value as MarketRegion))
              }
              style={{ minHeight: 76 }}
            >
              {SUPPORTED_REGIONS.map(region => (
                <option key={region}>{region}</option>
              ))}
            </select>
          </Field>
          <Field label="Countries (comma separated)">
            <input className="wk-input" value={icpCountries} onChange={event => setIcpCountries(event.target.value)} />
          </Field>
          <Field label="Minimum score">
            <input
              className="wk-input"
              type="number"
              min={0}
              max={100}
              value={icpMinScore}
              onChange={event => setIcpMinScore(Number(event.target.value) || 0)}
            />
          </Field>
          <Field label="Minimum rating">
            <input
              className="wk-input"
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={icpMinRating}
              onChange={event => setIcpMinRating(Number(event.target.value) || 0)}
            />
          </Field>
        </div>
        <div className="wk-actions">
          <button
            className="wk-btn"
            disabled={createIcp.isPending || !icpName.trim()}
            onClick={() =>
              createIcp.mutate({
                name: icpName.trim(),
                industries: icpIndustries.split(",").map(item => item.trim()).filter(Boolean),
                regions: icpRegions,
                countries: icpCountries.split(",").map(item => item.trim()).filter(Boolean),
                minGapScore: icpMinScore,
                minRating: icpMinRating,
                isDefault: (icps.data ?? []).length === 0,
              })
            }
          >
            {createIcp.isPending ? <Spinner /> : <Plus size={15} />} Save profile
          </button>
        </div>

        {(icps.data ?? []).length > 0 && (
          <ul className="wk-list" style={{ marginTop: "1rem" }}>
            {(icps.data ?? []).map(profile => (
              <li key={profile.id} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <strong>{profile.name}</strong>
                  {profile.isDefault && (
                    <span className="wk-band" data-band="prime" style={{ marginLeft: ".5rem" }}>
                      default
                    </span>
                  )}
                  <span style={{ display: "block", fontSize: ".78rem", color: "#6d7669", marginTop: ".2rem" }}>
                    {(profile.industries ?? []).join(", ") || "Any industry"} · min score {profile.minGapScore}
                  </span>
                </div>
                <div style={{ display: "flex", gap: ".35rem" }}>
                  {!profile.isDefault && (
                    <button
                      className="wk-btn wk-btn--sm wk-btn--ghost"
                      onClick={() => updateIcp.mutate({ id: profile.id, isDefault: true })}
                    >
                      Make default
                    </button>
                  )}
                  <button className="wk-btn wk-btn--sm wk-btn--danger" onClick={() => deleteIcp.mutate({ id: profile.id })}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ------------------------------------------------------------ team */}
      <Panel
        title="Team"
        description="Invite the people who work these markets with you. Anyone invited by email joins automatically the first time they sign in."
      >
        <div style={{ display: "flex", gap: ".6rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 240px" }}>
            <Field label="Email address">
              <input className="wk-input" type="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} />
            </Field>
          </div>
          <Field label="Role">
            <select className="wk-select" value={inviteRole} onChange={event => setInviteRole(event.target.value as "admin" | "member")}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <button
            className="wk-btn"
            disabled={!inviteEmail.trim() || invite.isPending}
            onClick={() => invite.mutate({ email: inviteEmail.trim(), role: inviteRole })}
          >
            {invite.isPending ? <Spinner /> : <UserPlus size={15} />} Invite
          </button>
          <Field label="Seat limit">
            <input
              className="wk-input"
              style={{ width: 90 }}
              type="number"
              min={1}
              defaultValue={seatLimit}
              onBlur={event => {
                const next = Number(event.target.value);
                if (next && next !== seatLimit) setSeats.mutate({ seatLimit: next });
              }}
            />
          </Field>
        </div>

        <ul className="wk-list" style={{ marginTop: "1rem" }}>
          {members.map(member => (
            <li key={member.id} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <strong>{member.name || member.email || member.invitedEmail}</strong>
                <span style={{ display: "block", fontSize: ".78rem", color: "#6d7669", marginTop: ".2rem" }}>
                  {member.role} · {member.status}
                </span>
              </div>
              {member.role !== "owner" && (
                <button className="wk-btn wk-btn--sm wk-btn--danger" onClick={() => removeMember.mutate({ memberId: member.id })}>
                  <X size={12} /> Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      {/* ------------------------------------------------------- territory */}
      <Panel
        title="Territory"
        description="Claim a market so two people on the same team do not work it in parallel. A claim is advisory — it is shown, not enforced."
      >
        <div style={{ display: "flex", gap: ".6rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px" }}>
            <Field label="Market (e.g. dentists in Austin)">
              <input className="wk-input" value={territoryLabel} onChange={event => setTerritoryLabel(event.target.value)} />
            </Field>
          </div>
          <button
            className="wk-btn"
            disabled={!territoryLabel.trim() || claim.isPending}
            onClick={() =>
              claim.mutate({
                label: territoryLabel.trim(),
                scopeKey: territoryLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"),
              })
            }
          >
            {claim.isPending ? <Spinner /> : <MapPin size={15} />} Claim
          </button>
        </div>

        {(territories.data ?? []).length === 0 ? (
          <div style={{ marginTop: "1rem" }}>
            <EmptyState title="No territories claimed">
              Claims matter once more than one person works the same city. Until then you can safely skip this.
            </EmptyState>
          </div>
        ) : (
          <ul className="wk-list" style={{ marginTop: "1rem" }}>
            {(territories.data ?? []).map(item => (
              <li key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                <div>
                  <strong>{item.label}</strong>
                  <span style={{ display: "block", fontSize: ".78rem", color: "#6d7669", marginTop: ".2rem" }}>
                    Held by {item.claimedBy || item.claimedEmail || "a team member"}
                  </span>
                </div>
                <button className="wk-btn wk-btn--sm wk-btn--ghost" onClick={() => release.mutate({ scopeKey: item.scopeKey })}>
                  Release
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ----------------------------------------------------- suppression */}
      <Panel
        title="Suppression list"
        description="Businesses hidden from every finder in this workspace — existing clients, people who asked not to be contacted, and anyone already approached."
      >
        {(suppressions.data ?? []).length === 0 ? (
          <EmptyState title="Nothing suppressed">
            Marking a pipeline entry as “Contacted” adds it here automatically, so nobody approaches it twice.
          </EmptyState>
        ) : (
          <ul className="wk-list">
            {(suppressions.data ?? []).map(item => (
              <li key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                <div>
                  <strong style={{ fontFamily: "'DM Mono', monospace", fontSize: ".8rem" }}>{item.matchKey}</strong>
                  <span style={{ display: "block", fontSize: ".78rem", color: "#6d7669", marginTop: ".2rem" }}>
                    {item.kind.replace(/_/g, " ")}
                    {item.reason ? ` · ${item.reason}` : ""}
                  </span>
                </div>
                <button className="wk-btn wk-btn--sm wk-btn--ghost" onClick={() => unsuppress.mutate({ matchKey: item.matchKey })}>
                  <ShieldOff size={12} /> Unhide
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* --------------------------------------------------------- exports */}
      <Panel
        title="Export and CRM"
        description="CSV works with no setup. HubSpot and Airtable push using your own token, so your data never routes through a shared account."
        actions={
          <button
            className="wk-btn wk-btn--sm"
            onClick={async () => {
              const result = await csv.refetch();
              if (result.data) {
                downloadCsv(result.data.filename, result.data.csv);
                toast.success(`${result.data.rows} row(s) exported.`);
              }
            }}
          >
            {csv.isFetching ? <Spinner size={13} /> : <Download size={13} />} Export CSV
          </button>
        }
      >
        <div className="wk-grid wk-grid--2">
          <div>
            <Field label="HubSpot private app token">
              <input className="wk-input" type="password" value={hubspotToken} onChange={event => setHubspotToken(event.target.value)} />
            </Field>
            <div className="wk-actions">
              <button
                className="wk-btn wk-btn--sm wk-btn--ghost"
                disabled={!hubspotToken.trim() || connect.isPending}
                onClick={() => connect.mutate({ kind: "hubspot", config: { accessToken: hubspotToken.trim() } })}
              >
                <Link2 size={13} /> Connect HubSpot
              </button>
              <button className="wk-btn wk-btn--sm wk-btn--danger" onClick={() => disconnect.mutate({ kind: "hubspot" })}>
                Disconnect
              </button>
            </div>
          </div>
          <div>
            <Field label="Airtable API key">
              <input className="wk-input" type="password" value={airtableKey} onChange={event => setAirtableKey(event.target.value)} />
            </Field>
            <div className="wk-grid wk-grid--2" style={{ marginTop: ".5rem" }}>
              <Field label="Base id">
                <input className="wk-input" value={airtableBase} onChange={event => setAirtableBase(event.target.value)} />
              </Field>
              <Field label="Table name">
                <input className="wk-input" value={airtableTable} onChange={event => setAirtableTable(event.target.value)} />
              </Field>
            </div>
            <div className="wk-actions">
              <button
                className="wk-btn wk-btn--sm wk-btn--ghost"
                disabled={!airtableKey.trim() || !airtableBase.trim() || connect.isPending}
                onClick={() =>
                  connect.mutate({
                    kind: "airtable",
                    config: { apiKey: airtableKey.trim(), baseId: airtableBase.trim(), tableName: airtableTable.trim() },
                  })
                }
              >
                <Link2 size={13} /> Connect Airtable
              </button>
              <button className="wk-btn wk-btn--sm wk-btn--danger" onClick={() => disconnect.mutate({ kind: "airtable" })}>
                Disconnect
              </button>
            </div>
          </div>
        </div>

        {(integrations.data ?? []).length > 0 && (
          <ul className="wk-list" style={{ marginTop: "1rem" }}>
            {(integrations.data ?? []).map(item => (
              <li key={item.id}>
                <strong>{item.kind}</strong> — {item.configured ? "connected" : "not configured"}
                {item.lastSyncedAt && (
                  <span style={{ color: "#7c8479" }}> · last synced {new Date(item.lastSyncedAt).toLocaleString()}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* --------------------------------------------------------- sources */}
      <Panel
        title="Data sources"
        description="Finder never invents a business. A source without a credential simply stays off, and the finder that needs it says so."
      >
        {(sources.data as ProviderStatus[] | undefined)?.map(source => (
          <SourceRow key={source.provider} source={source} />
        ))}
      </Panel>
    </>
  );
}
