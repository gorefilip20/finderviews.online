/**
 * Finder visual reminder: Atlas Field Notes — documents are the deliverable; keep the builder
 * plain and let the generated sheet carry the design.
 *
 * The document studio. A proposal built here is the artefact the agency actually sends, and
 * every claim in it traces back to a check that ran.
 */
import { trpc } from "@/lib/trpc";
import { FileText, Layout, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, Field, Note, Panel, Spinner, openHtmlInTab } from "./shared";

export default function Studio({ agencyName }: { agencyName: string }) {
  const [agency, setAgency] = useState(agencyName);
  const [tagline, setTagline] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [withNarrative, setWithNarrative] = useState(true);

  const [mockName, setMockName] = useState("");
  const [mockCategory, setMockCategory] = useState("");
  const [mockCity, setMockCity] = useState("");
  const [mockPhone, setMockPhone] = useState("");

  const utils = trpc.useUtils();
  const proposals = trpc.proposal.list.useQuery();

  const build = trpc.proposal.build.useMutation({
    onSuccess: result => {
      if (!openHtmlInTab(result.html, result.title)) {
        toast.error("Your browser blocked the preview window. Allow pop-ups for this site.");
        return;
      }
      toast.success("Proposal ready. Print to PDF from your browser to send it.");
      void utils.proposal.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const mockup = trpc.mockup.build.useMutation({
    onSuccess: result => {
      if (!openHtmlInTab(result.html, "Homepage concept")) {
        toast.error("Your browser blocked the preview window. Allow pop-ups for this site.");
      }
    },
    onError: error => toast.error(error.message),
  });

  const [openingId, setOpeningId] = useState<number | null>(null);

  const openSaved = async (id: number) => {
    setOpeningId(id);
    try {
      const saved = await utils.proposal.get.fetch({ id });
      if (saved.html && !openHtmlInTab(saved.html, saved.title)) {
        toast.error("Your browser blocked the preview window. Allow pop-ups for this site.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That proposal could not be opened.");
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <>
      <div className="wk-head">
        <div className="wk-kicker">
          <span className="signal-dot" /> Studio
        </div>
        <h1>The documents that close the work</h1>
        <p>
          A branded audit and proposal, and a homepage concept built from the business's own public listing. Both
          open in a new tab; use your browser's print dialog to save a PDF.
        </p>
      </div>

      <Panel
        title="Audit and proposal"
        description="Finder audits the site live, then writes the scope from what actually failed. Passing checks are deliberately left out — an agency should not bill to fix something that works."
      >
        <div className="wk-grid wk-grid--2">
          <Field label="Your agency name">
            <input className="wk-input" value={agency} onChange={event => setAgency(event.target.value)} />
          </Field>
          <Field label="Tagline (optional)">
            <input className="wk-input" value={tagline} onChange={event => setTagline(event.target.value)} />
          </Field>
        </div>
        <div className="wk-grid wk-grid--2" style={{ marginTop: ".85rem" }}>
          <Field label="Business name">
            <input className="wk-input" value={name} onChange={event => setName(event.target.value)} />
          </Field>
          <Field label="Their website (audited live)">
            <input className="wk-input" placeholder="example.com" value={website} onChange={event => setWebsite(event.target.value)} />
          </Field>
        </div>
        <div className="wk-grid wk-grid--2" style={{ marginTop: ".85rem" }}>
          <Field label="Category">
            <input className="wk-input" value={category} onChange={event => setCategory(event.target.value)} />
          </Field>
          <Field label="Location">
            <input className="wk-input" value={location} onChange={event => setLocation(event.target.value)} />
          </Field>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: ".5rem", marginTop: ".9rem", fontSize: ".84rem" }}>
          <input type="checkbox" checked={withNarrative} onChange={event => setWithNarrative(event.target.checked)} />
          <Sparkles size={13} /> Add AI-written opening copy, based only on the audit findings
        </label>

        <div className="wk-actions">
          <button
            className="wk-btn"
            disabled={!agency.trim() || !name.trim() || build.isPending}
            onClick={() =>
              build.mutate({
                agencyName: agency.trim(),
                agencyTagline: tagline.trim() || undefined,
                prospectName: name.trim(),
                prospectCategory: category.trim() || undefined,
                prospectLocation: location.trim() || undefined,
                prospectWebsite: website.trim() || undefined,
                withNarrative,
              })
            }
          >
            {build.isPending ? <Spinner /> : <FileText size={15} />} Build proposal
          </button>
        </div>
      </Panel>

      <Panel
        title="Homepage concept"
        description="For a business with no website, the strongest thing you can send is a picture of what it could have. Built from their own listing data — nothing about the business is invented."
      >
        <div className="wk-grid wk-grid--4">
          <Field label="Business name">
            <input className="wk-input" value={mockName} onChange={event => setMockName(event.target.value)} />
          </Field>
          <Field label="Category">
            <input className="wk-input" value={mockCategory} onChange={event => setMockCategory(event.target.value)} />
          </Field>
          <Field label="City">
            <input className="wk-input" value={mockCity} onChange={event => setMockCity(event.target.value)} />
          </Field>
          <Field label="Public phone">
            <input className="wk-input" value={mockPhone} onChange={event => setMockPhone(event.target.value)} />
          </Field>
        </div>
        <div className="wk-actions">
          <button
            className="wk-btn wk-btn--lime"
            disabled={!mockName.trim() || mockup.isPending}
            onClick={() =>
              mockup.mutate({
                name: mockName.trim(),
                category: mockCategory.trim() || undefined,
                city: mockCity.trim() || undefined,
                phone: mockPhone.trim() || undefined,
              })
            }
          >
            {mockup.isPending ? <Spinner /> : <Layout size={15} />} Generate concept
          </button>
        </div>
      </Panel>

      <Panel title="Saved proposals">
        {proposals.isError ? (
          <Note tone="warn">{proposals.error.message}</Note>
        ) : (proposals.data ?? []).length === 0 ? (
          <EmptyState title="Nothing saved yet">
            Proposals you build are stored here so you can reopen or reprint them later.
          </EmptyState>
        ) : (
          <ul className="wk-list">
            {(proposals.data ?? []).map(item => (
              <li key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <strong>{item.prospectName}</strong>
                  <span style={{ display: "block", fontSize: ".77rem", color: "#7c8479", marginTop: ".2rem" }}>
                    {new Date(item.createdAt).toLocaleDateString()}
                    {item.priceLow != null && item.priceHigh != null
                      ? ` · ${item.currency} ${item.priceLow.toLocaleString()}–${item.priceHigh.toLocaleString()}`
                      : ""}
                  </span>
                </div>
                <button
                  className="wk-btn wk-btn--sm wk-btn--ghost"
                  disabled={openingId === item.id}
                  onClick={() => void openSaved(item.id)}
                >
                  {openingId === item.id ? <Spinner size={13} /> : <FileText size={13} />} Open
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
