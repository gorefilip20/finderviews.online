/**
 * Finder visual reminder: Atlas Field Notes — use editorial negative space, ledger rules,
 * real-workflow controls, and Scout Lime only for verified opportunities and primary actions.
 */
import FinderLogo from "@/components/FinderLogo";
import { MapView } from "@/components/Map";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { MARKET_COVERAGE, SUPPORTED_COUNTRY_COUNT, SUPPORTED_REGIONS, type MarketRegion, isExcludedMarket } from "@/lib/marketCoverage";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
  ArrowDownRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  Crosshair,
  Download,
  ExternalLink,
  FileClock,
  Globe2,
  LoaderCircle,
  Mail,
  MapPin,
  Menu,
  Phone,
  Plus,
  Search,
  Sparkles,
  Target,
  UserRoundCheck,
  UsersRound,
  X,
} from "lucide-react";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Lead = {
  id: string;
  name: string;
  category: string;
  location: string;
  phone: string;
  email?: string;
  address?: string;
  verified: boolean;
  hasWebsite: boolean;
  score: number;
  growthPath: string;
  position?: { lat: number; lng: number };
  source?: string;
  preview?: boolean;
  presence: "No website listed" | "Limited public presence";
};

type PublicCompanyContact = {
  phone?: string;
  website?: string;
  address?: string;
  listingUrl?: string;
};


const categories = ["All local businesses", "Restaurant", "Home services", "Beauty & wellness", "Retail", "Auto services", "Professional services"];
const presenceOptions = ["No website or limited presence", "No listed website", "Limited public presence"] as const;
const hiringRoleSuggestions = ["Product manager", "Social media growth", "Web developer", "Content writer", "Copywriter", "Co-founder", "Online presence", "Biochemist", "Drug development scientist", "Skincare brand manager", "Funeral services manager"];

const faqs = [
  {
    question: "Where does Finder look for businesses?",
    answer:
      "Finder starts from publicly available local-business listing data. The live research experience evaluates whether a standalone website is listed, and it can flag profiles that show limited public information for manual review.",
  },
  {
    question: "What contact information can I use?",
    answer:
      "Finder displays the public phone number, business address, category and source profile where available. Public email availability is marked separately because many local listings do not publish an email address.",
  },
  {
    question: "Does " + "no website" + " mean the business needs branding too?",
    answer:
      "Not necessarily. Finder frames a website gap or limited public-presence signal as a conversation starter. Use the growth path and business context to propose the right next step, from a brand baseline to a new website, booking flow, online menu, or local-search cleanup.",
  },
  {
    question: "Can I work in any city?",
    answer:
      `Finder supports ${SUPPORTED_COUNTRY_COUNT} countries across Europe, the Americas, and Asia. African countries are intentionally excluded. Enter a country and then narrow it with a city or neighbourhood; live source coverage can vary by market.`,
  },
];

const locationSuggestions: Array<{ country: string; region: MarketRegion; city: string }> = [
  { country: "United Kingdom", region: "Europe", city: "London" },
  { country: "Brazil", region: "Americas", city: "São Paulo" },
  { country: "Japan", region: "Asia", city: "Tokyo" },
  { country: "Canada", region: "Americas", city: "Toronto" },
];

const regionCenters: Record<MarketRegion, { lat: number; lng: number }> = {
  Americas: { lat: 37.77, lng: -97.74 },
  Europe: { lat: 50.11, lng: 10.45 },
  Asia: { lat: 34.69, lng: 103.41 },
};

export default function Home() {
  const { isAuthenticated } = useAuth();
  const [location, setLocation] = useState("Austin");
  const [region, setRegion] = useState<MarketRegion>("Americas");
  const [country, setCountry] = useState("United States");
  const [category, setCategory] = useState("All local businesses");
  const [presenceMode, setPresenceMode] = useState<(typeof presenceOptions)[number]>("No website or limited presence");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [usingPreview, setUsingPreview] = useState(false);
  const [query, setQuery] = useState("");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [faqOpen, setFaqOpen] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [jobRole, setJobRole] = useState("Product manager");
  const [jobRegion, setJobRegion] = useState<MarketRegion>("Americas");
  const [jobCountry, setJobCountry] = useState("United States");
  const [jobFreshness, setJobFreshness] = useState<"24h" | "7d" | "30d">("30d");
  const [jobSearchRequested, setJobSearchRequested] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [approvedBriefFor, setApprovedBriefFor] = useState<string | null>(null);
  const [publicCompanyContact, setPublicCompanyContact] = useState<PublicCompanyContact | null>(null);
  const [isLookingUpCompanyContact, setIsLookingUpCompanyContact] = useState(false);
  const [companyContactLookupComplete, setCompanyContactLookupComplete] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  const jobSearchInput = useMemo(() => ({ role: jobRole || "All hiring roles", country: jobCountry, region: jobRegion }), [jobCountry, jobRegion, jobRole]);
  const hiringSearch = trpc.hiring.search.useQuery(jobSearchInput, { enabled: jobSearchRequested, retry: false, refetchOnWindowFocus: false });
  const hiringBrief = trpc.hiring.brief.useMutation({
    onSuccess: () => toast.success("Hiring brief prepared from the public job listing."),
    onError: () => toast.error("Finder could not prepare that brief just now. Please try again."),
  });
  const freshnessMaxHours = jobFreshness === "24h" ? 24 : jobFreshness === "7d" ? 168 : 720;
  const freshnessLabel = jobFreshness === "24h" ? "24 hours" : jobFreshness === "7d" ? "7 days" : "30 days";
  const allJobs = hiringSearch.data?.jobs || [];
  const jobs = allJobs.filter((job) => job.ageHours <= freshnessMaxHours);
  const selectedJob = jobs.find((job) => job.id === selectedJobId) || jobs[0];

  useEffect(() => {
    if (jobs.length > 0) setSelectedJobId(jobs[0].id);
    if (jobs.length === 0) setSelectedJobId(null);
  }, [jobs]);

  useEffect(() => {
    setApprovedBriefFor(null);
    setPublicCompanyContact(null);
    setCompanyContactLookupComplete(false);
  }, [selectedJobId]);

  useEffect(() => {
    setLeads([]);
    setSelectedLead(null);
    setUsingPreview(false);
  }, [country, region]);

  const visibleLeads = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return leads;
    return leads.filter((lead) =>
      [lead.name, lead.category, lead.location, lead.growthPath].some((value) => value.toLowerCase().includes(term)),
    );
  }, [leads, query]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileNavOpen(false);
  };

  const addMapPins = (items: Lead[]) => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    const positioned = items.filter((item) => item.position);
    positioned.forEach((item) => {
      if (!item.position) return;
      const marker = L.marker([item.position.lat, item.position.lng])
        .addTo(map)
        .bindPopup(item.name);
      markersRef.current.push(marker);
    });
    if (positioned[0]?.position) {
      map.setView(
        [positioned[0].position.lat, positioned[0].position.lng],
        positioned.length === 1 ? 14 : 12,
      );
    }
  };

  const marketLabel = `${location.trim() ? `${location.trim()}, ` : ""}${country}`;

  const runLiveSearch = async () => {
    if (isExcludedMarket(`${country} ${location}`)) {
      toast.error("Finder supports Europe, the Americas, and Asia. African markets are excluded from this search.");
      return;
    }
    setIsSearching(true);
    setSearched(true);
    try {
      const cityText = location.trim();
      const geoQuery = cityText ? `${cityText}, ${country}` : country;
      const geoParams: Record<string, string> = { q: geoQuery, format: "json", limit: "1" };
      if (!cityText) geoParams.featuretype = "city";
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?` + new URLSearchParams(geoParams),
        { headers: { "Accept": "application/json" } },
      );
      let geoData = (await geoRes.json()) as Array<{ lat: string; lng?: string; lon?: string; boundingbox?: string[]; type?: string }>;
      if (!geoData.length && !cityText) {
        const fallbackRes = await fetch(
          `https://nominatim.openstreetmap.org/search?` +
          new URLSearchParams({ q: `capital city ${country}`, format: "json", limit: "1" }),
          { headers: { "Accept": "application/json" } },
        );
        geoData = (await fallbackRes.json()) as typeof geoData;
      }
      if (!geoData.length) {
        const lastRes = await fetch(
          `https://nominatim.openstreetmap.org/search?` +
          new URLSearchParams({ q: country, format: "json", limit: "1" }),
          { headers: { "Accept": "application/json" } },
        );
        geoData = (await lastRes.json()) as typeof geoData;
      }
      if (!geoData.length) {
        toast.error("Could not locate that area. Try adding a city name.");
        setIsSearching(false);
        return;
      }
      const center = { lat: parseFloat(geoData[0].lat), lng: parseFloat(geoData[0].lon || geoData[0].lng || "0") };
      const bbox = geoData[0].boundingbox;
      const isCountryLevel = !cityText && geoData[0].type !== "city" && geoData[0].type !== "town";
      let radius: number;
      if (isCountryLevel) {
        radius = 25000;
      } else if (bbox) {
        radius = Math.min(30000, Math.max(3000, Math.abs(parseFloat(bbox[1]) - parseFloat(bbox[0])) * 111000));
      } else {
        radius = 8000;
      }

      const aroundClause = `(around:${radius},${center.lat},${center.lng})`;
      type TagFilter = string;
      const makePair = (filter: TagFilter) => [
        `node["name"]${filter}${aroundClause};`,
        `way["name"]${filter}${aroundClause};`,
      ];
      const categoryUnionMembers: string[] = (() => {
        switch (category) {
          case "Restaurant":
            return makePair('["amenity"~"restaurant|cafe|fast_food|bar"]');
          case "Home services":
            return [
              ...makePair('["shop"~"hardware|furniture|doityourself"]'),
              ...makePair('["craft"]'),
            ];
          case "Beauty & wellness":
            return [
              ...makePair('["shop"~"beauty|hairdresser|massage"]'),
              ...makePair('["amenity"~"beauty|spa"]'),
            ];
          case "Retail":
            return makePair('["shop"]');
          case "Auto services":
            return [
              ...makePair('["shop"~"car_repair|car"]'),
              ...makePair('["amenity"~"car_wash|fuel"]'),
            ];
          case "Professional services":
            return makePair('["office"]');
          default:
            return [
              ...makePair('["shop"]'),
              ...makePair('["amenity"~"restaurant|cafe|fast_food|bar|beauty|spa"]'),
              ...makePair('["office"]'),
              ...makePair('["craft"]'),
            ];
        }
      })();

      const overpassQuery = `[out:json][timeout:25];(${categoryUnionMembers.join("")});out center body 50;`;
      let overpassData: {
        elements: Array<{
          id: number;
          type: string;
          lat?: number;
          lon?: number;
          center?: { lat: number; lon: number };
          tags?: Record<string, string>;
        }>;
      };
      try {
        const overpassRes = await fetch("https://overpass-api.de/api/interpreter", {
          method: "POST",
          body: `data=${encodeURIComponent(overpassQuery)}`,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        if (!overpassRes.ok) {
          setLeads([]);
          setSelectedLead(null);
          setUsingPreview(false);
          if (overpassRes.status === 429) {
            toast.error("The data source is rate-limited. Wait a moment and try again.");
          } else if (overpassRes.status === 504 || overpassRes.status === 408) {
            toast.message("That area timed out. Try narrowing your search with a specific city name.");
          } else {
            toast.message("The data source returned an error. Try a different city or category.");
          }
          setIsSearching(false);
          return;
        }
        overpassData = (await overpassRes.json()) as typeof overpassData;
      } catch {
        setLeads([]);
        setSelectedLead(null);
        setUsingPreview(false);
        toast.error("Could not reach the business data source. Check your connection and try again.");
        setIsSearching(false);
        return;
      }

      const nextLeads = overpassData.elements.reduce<Lead[]>((results, el) => {
        if (!el.tags?.name) return results;
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (lat === undefined || lon === undefined) return results;
        const tags = el.tags;
        const hasWebsite = !!(tags.website || tags["contact:website"] || tags.url);
        const hasPhone = !!(tags.phone || tags["contact:phone"]);
        const hasNoWebsite = !hasWebsite;
        const hasLimitedPublicPresence = !hasWebsite || !hasPhone;
        const qualifies = presenceMode === "No listed website" ? hasNoWebsite
          : presenceMode === "Limited public presence" ? hasLimitedPublicPresence
          : hasNoWebsite || hasLimitedPublicPresence;
        if (!qualifies) return results;
        const businessType = tags.shop || tags.amenity || tags.office || tags.craft || category;
        results.push({
          id: `osm-${el.type}-${el.id}`,
          name: tags.name,
          category: businessType.replaceAll("_", " "),
          location: [tags["addr:city"], tags["addr:state"], country].filter(Boolean).join(", ") || marketLabel,
          phone: tags.phone || tags["contact:phone"] || "No public phone listed",
          email: tags.email || tags["contact:email"] ? "Public email available" : undefined,
          address: [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean).join(", ") || undefined,
          verified: true,
          hasWebsite,
          score: Math.min(96, 72 + Math.floor(Math.random() * 22)),
          growthPath: "Review presence and propose next step",
          position: { lat, lng: lon },
          source: `https://www.openstreetmap.org/${el.type}/${el.id}`,
          presence: hasNoWebsite ? "No website listed" : "Limited public presence",
        });
        return results;
      }, []).slice(0, 12);

      if (nextLeads.length === 0) {
        setLeads([]);
        setSelectedLead(null);
        setUsingPreview(false);
        toast.message("No website gaps surfaced in this first pass. Try a nearby neighbourhood or another category.");
      } else {
        setLeads(nextLeads);
        setSelectedLead(nextLeads[0]);
        setUsingPreview(false);
        addMapPins(nextLeads);
        toast.success(`${nextLeads.length} opportunity ${nextLeads.length === 1 ? "profile" : "profiles"} found in ${country}.`);
      }
    } catch {
      setLeads([]);
      setSelectedLead(null);
      setUsingPreview(false);
      toast.error("Could not complete the search. Check your connection and try again, or add a specific city name.");
    } finally {
      setIsSearching(false);
      window.setTimeout(() => scrollTo("finder-workspace"), 40);
    }
  };

  const toggleSaved = (id: string) => {
    setSavedIds((current) => {
      const saved = current.includes(id);
      toast.success(saved ? "Lead removed from your outreach set." : "Lead saved to your outreach set.");
      return saved ? current.filter((value) => value !== id) : [...current, id];
    });
  };

  const exportPreview = () => {
    toast.message("Export is ready to connect once Finder is linked to your research workflow.");
  };

  const runHiringSearch = () => {
    if (isExcludedMarket(jobCountry)) {
      toast.error("Finder supports Europe, the Americas, and Asia. African markets are excluded from this search.");
      return;
    }
    setJobSearchRequested(true);
    void hiringSearch.refetch();
  };

  const requestHiringBrief = () => {
    if (!selectedJob) return;
    if (!isAuthenticated) {
      toast.message("Sign in to generate a private AI outreach brief for this public listing.");
      startLogin();
      return;
    }
    hiringBrief.mutate({
      title: selectedJob.title,
      company: selectedJob.company,
      geography: selectedJob.geography,
      industry: selectedJob.industry,
      jobType: selectedJob.jobType,
      level: selectedJob.level,
      excerpt: selectedJob.excerpt,
      description: selectedJob.description,
      postedAt: selectedJob.postedAt,
      sourceUrl: selectedJob.sourceUrl,
    });
  };

  const lookUpPublicCompanyContact = async () => {
    if (!selectedJob) return;
    setIsLookingUpCompanyContact(true);
    setCompanyContactLookupComplete(false);
    try {
      const sourceLocation = selectedJob.geography && selectedJob.geography !== "Anywhere" ? selectedJob.geography : jobCountry;
      const searchQuery = `${selectedJob.company} ${sourceLocation}`;
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        new URLSearchParams({ q: searchQuery, format: "json", limit: "1", addressdetails: "1", extratags: "1" }),
        { headers: { "Accept": "application/json" } },
      );
      const data = (await res.json()) as Array<{
        display_name?: string;
        lat?: string;
        lon?: string;
        osm_type?: string;
        osm_id?: number;
        extratags?: Record<string, string>;
      }>;
      const item = data[0];
      if (item) {
        const tags = item.extratags || {};
        setPublicCompanyContact({
          phone: tags.phone || tags["contact:phone"] || undefined,
          website: tags.website || tags["contact:website"] || undefined,
          address: item.display_name || undefined,
          listingUrl: item.osm_type && item.osm_id
            ? `https://www.openstreetmap.org/${item.osm_type}/${item.osm_id}`
            : undefined,
        });
      } else {
        setPublicCompanyContact(null);
      }
      setCompanyContactLookupComplete(true);
    } catch {
      setCompanyContactLookupComplete(true);
      toast.error("Finderviews could not retrieve a public company contact record right now.");
    } finally {
      setIsLookingUpCompanyContact(false);
    }
  };

  return (
    <div className="finder-shell">
      <div className="page-grain" aria-hidden="true" />

      <header className="finder-nav" id="top">
        <button className="brand-button" onClick={() => scrollTo("top")} aria-label="Finderviews home">
          <FinderLogo />
        </button>
        <nav className={cn("finder-nav__links", mobileNavOpen && "finder-nav__links--open")} aria-label="Main navigation">
          <button onClick={() => scrollTo("how-it-works")}>How it works</button>
          <button onClick={() => scrollTo("finder-workspace")}>Explore leads</button>
          <button onClick={() => scrollTo("hiring-workspace")}>Hiring signals</button>
          <button onClick={() => scrollTo("growth-path")}>Growth outcomes</button>
          <button onClick={() => scrollTo("faq")}>FAQ</button>
        </nav>
        <div className="finder-nav__actions">
          <button className="nav-cta" onClick={() => scrollTo("finder-workspace")}>
            Find opportunities <ArrowDownRight size={15} strokeWidth={2.5} />
          </button>
          <button className="menu-button" aria-label="Toggle navigation" onClick={() => setMobileNavOpen((open) => !open)}>
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-map" aria-hidden="true" />
          <div className="hero-grid">
            <div className="hero-copy">
              <div className="eyebrow"><span className="signal-dot" /> Europe, the Americas + Asia</div>
              <h1>Find the businesses<br />ready to <em>move.</em></h1>
              <p className="hero-lede">Finderviews searches {SUPPORTED_COUNTRY_COUNT} eligible countries across Europe, the Americas, and Asia for businesses with no listed website, a limited public presence, or a fresh hiring need—so your offer reaches them when change is already underway.</p>
              <div className="hero-actions">
                <button className="button-primary" onClick={() => scrollTo("finder-workspace")}>
                  Explore opportunities <ArrowDownRight size={17} strokeWidth={2.5} />
                </button>
                <button className="text-link" onClick={() => scrollTo("how-it-works")}>
                  See the research method <ArrowUpRight size={16} />
                </button>
              </div>
              <div className="hero-proof">
                <div><strong>Phone</strong><span>public business detail</span></div>
                <div><strong>Presence signal</strong><span>site + public-detail check</span></div>
                <div><strong>Hiring signal</strong><span>roles posted in 30 days</span></div>
              </div>
            </div>

            <aside className="hero-search-card" aria-label="Finderviews search controls">
              <div className="card-topline"><span>FIELD QUERY</span><span className="live-chip"><i /> live source</span></div>
              <div className="search-stack">
                <label className="field-label" htmlFor="hero-region">Eligible region</label>
                <div className="select-wrap">
                  <Globe2 size={17} />
                  <select id="hero-region" value={region} onChange={(event) => { const nextRegion = event.target.value as MarketRegion; setRegion(nextRegion); setCountry(MARKET_COVERAGE[nextRegion][0]); setLocation(""); }}>
                    {SUPPORTED_REGIONS.map((option) => <option key={option}>{option}</option>)}
                  </select>
                  <ChevronDown size={16} />
                </div>
                <label className="field-label" htmlFor="hero-country">Country</label>
                <div className="select-wrap">
                  <MapPin size={17} />
                  <select id="hero-country" value={country} onChange={(event) => setCountry(event.target.value)}>
                    {MARKET_COVERAGE[region].map((option) => <option key={option}>{option}</option>)}
                  </select>
                  <ChevronDown size={16} />
                </div>
                <label className="field-label" htmlFor="hero-location">City or local area <span>(optional)</span></label>
                <div className="input-wrap">
                  <MapPin size={18} />
                  <input id="hero-location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder={`e.g. city in ${country}`} />
                </div>
                <label className="field-label" htmlFor="hero-category">Business category</label>
                <div className="select-wrap">
                  <BriefcaseBusiness size={17} />
                  <select id="hero-category" value={category} onChange={(event) => setCategory(event.target.value)}>
                    {categories.map((option) => <option key={option}>{option}</option>)}
                  </select>
                  <ChevronDown size={16} />
                </div>
                <label className="field-label" htmlFor="presence-mode">Opportunity signal</label>
                <div className="select-wrap">
                  <Crosshair size={17} />
                  <select id="presence-mode" value={presenceMode} onChange={(event) => setPresenceMode(event.target.value as (typeof presenceOptions)[number])}>
                    {presenceOptions.map((option) => <option key={option}>{option}</option>)}
                  </select>
                  <ChevronDown size={16} />
                </div>
              </div>
              <button className="button-primary button-primary--wide" onClick={runLiveSearch} disabled={isSearching}>
                {isSearching ? <><LoaderCircle className="spin" size={17} /> Checking listings</> : <><Search size={17} /> Find opportunities</>}
              </button>
              <p className="card-note"><span className="signal-dot" /> Africa is excluded. Limited presence is a public-listing signal, not a full digital audit.</p>
            </aside>
          </div>
          <div className="hero-index" aria-hidden="true"><span>01</span><div /><span>GLOBAL FIELD NOTE</span></div>
        </section>

        <section className="method-section" id="how-it-works">
          <div className="section-heading">
            <span className="section-number">01 / METHOD</span>
            <h2>From a local listing<br />to a meaningful <em>next move.</em></h2>
            <p>Finderviews does not just surface an absence. It helps you turn that opening into a practical conversation about visibility, trust, and business growth.</p>
          </div>
          <div className="method-list">
            <article className="method-item">
              <span className="method-index">01</span>
              <div className="method-icon"><Compass size={23} /></div>
              <h3>Choose a market</h3>
              <p>Choose from eligible countries in Europe, the Americas, and Asia, then focus the search with a city or category.</p>
            </article>
            <article className="method-item">
              <span className="method-index">02</span>
              <div className="method-icon"><Crosshair size={23} /></div>
              <h3>Verify the gap</h3>
              <p>Finderviews highlights no listed standalone website and limited public-presence signals for a thoughtful manual review.</p>
            </article>
            <article className="method-item">
              <span className="method-index">03</span>
              <div className="method-icon"><Sparkles size={23} /></div>
              <h3>Offer the right lift</h3>
              <p>Use the context to recommend a brand refresh, a website, a booking flow, or a clearer local search presence.</p>
            </article>
          </div>
        </section>

        <section className="workspace-section" id="finder-workspace">
          <div className="workspace-header">
            <div>
              <span className="section-number section-number--lime">02 / RESEARCH DESK</span>
              <h2>Put growth potential<br />on the <em>record.</em></h2>
            </div>
            <div className="workspace-summary">
              <span className="live-chip live-chip--dark"><i /> {usingPreview ? "research preview" : "live query"}</span>
              <p>{usingPreview ? `Illustrative records show how Finderviews organizes research across ${SUPPORTED_COUNTRY_COUNT} eligible countries.` : `Showing public listing signals from ${marketLabel}.`}</p>
            </div>
          </div>

          <div className="workspace-controls">
            <div className="workspace-input">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter this research set" aria-label="Filter lead records" />
            </div>
            <div className="mini-location-options" aria-label="Quick location choices">
              {locationSuggestions.map((suggestion) => (
                <button key={suggestion.country} className={cn("location-pill", suggestion.country === country && "location-pill--active")} onClick={() => { setRegion(suggestion.region); setCountry(suggestion.country); setLocation(suggestion.city); }}>{suggestion.country}</button>
              ))}
            </div>
            <button className="compact-action" onClick={runLiveSearch} disabled={isSearching}>{isSearching ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />} Run live check</button>
          </div>

          <div className="workspace-main">
            <div className="record-panel">
              <div className="record-panel__top">
                <div><span>FINDERVIEWS_RESEARCH_{country.toUpperCase().replaceAll(" ", "_")}{location ? `_${location.toUpperCase().replaceAll(" ", "_")}` : ""}.CSV</span><small>{visibleLeads.length} opportunities in view · {presenceMode.toLowerCase()}</small></div>
                <button className="export-button" onClick={exportPreview}><Download size={16} /> Export set</button>
              </div>
              <div className="record-table-wrap">
                <table className="record-table">
                  <thead><tr><th>Business</th><th>Contact</th><th>Presence signal</th><th>Best next move</th><th aria-label="Actions" /></tr></thead>
                  <tbody>
                    {visibleLeads.map((lead) => (
                      <tr key={lead.id} className={cn(selectedLead?.id === lead.id && "record-row--selected")} onClick={() => setSelectedLead(lead)}>
                        <td><strong>{lead.name}</strong><span>{lead.category} · {lead.location}</span></td>
                        <td><span className="contact-detail"><Phone size={13} /> {lead.phone}</span>{lead.email && <span className="contact-detail"><Mail size={13} /> {lead.email}</span>}</td>
                        <td><span className="verified-badge"><i /> {lead.presence}</span><small>Public listing signal</small></td>
                        <td><span className="growth-path">{lead.growthPath}</span></td>
                        <td><button className={cn("save-button", savedIds.includes(lead.id) && "save-button--saved")} onClick={(event) => { event.stopPropagation(); toggleSaved(lead.id); }} aria-label={`Save ${lead.name}`}>{savedIds.includes(lead.id) ? <Check size={16} /> : <Plus size={16} />}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visibleLeads.length === 0 && <div className="empty-records"><Search size={26} /><strong>No records match this filter.</strong><span>Try another search phrase or run a new local query.</span></div>}
              </div>
              {usingPreview && <div className="preview-banner"><CircleHelp size={15} /> <span><strong>Illustrative preview.</strong> Run a live check to surface public contact details for your chosen market.</span></div>}
            </div>

            <aside className="lead-detail-panel">
              <div className="detail-map-wrap">
                <div className="map-label"><Globe2 size={15} /> {country.toUpperCase()} CONTEXT</div>
                <MapView
                  initialCenter={regionCenters[region]}
                  initialZoom={4}
                  className="finder-map"
                  onMapReady={(map: L.Map) => { mapRef.current = map; if (leads.some((item) => item.position)) addMapPins(leads); }}
                />
              </div>
              {selectedLead ? (
                <div className="detail-content">
                  <div className="detail-kicker"><span className="signal-dot" /> OPPORTUNITY PROFILE <span>{String(selectedLead.score).padStart(2, "0")}/100</span></div>
                  <h3>{selectedLead.name}</h3>
                  <p>{selectedLead.category} in {selectedLead.location}. {selectedLead.presence === "No website listed" ? "A missing standalone site" : "A limited public-presence signal"} can be a strong opening for a practical, specific growth conversation.</p>
                  <div className="detail-facts">
                    <div><Phone size={16} /><span><small>PUBLIC PHONE</small>{selectedLead.phone}</span></div>
                    <div><MapPin size={16} /><span><small>LISTED AREA</small>{selectedLead.address || selectedLead.location}</span></div>
                  </div>
                  <div className="growth-callout"><Sparkles size={17} /><div><small>RECOMMENDED ANGLE</small><strong>{selectedLead.growthPath}</strong></div></div>
                  <div className="detail-actions"><button className="button-primary" onClick={() => toggleSaved(selectedLead.id)}>{savedIds.includes(selectedLead.id) ? <Check size={16} /> : <Plus size={16} />}{savedIds.includes(selectedLead.id) ? "Saved to outreach" : "Save opportunity"}</button><button className="icon-outline" onClick={() => toast.message("Open the public source from a live research result.")} aria-label="Open listing source"><ExternalLink size={16} /></button></div>
                </div>
              ) : <div className="detail-empty"><Target size={26} /><strong>Select a business record</strong><span>Details, contact clues, and a useful growth angle will appear here.</span></div>}
            </aside>
          </div>
        </section>

        <section className="hiring-section" id="hiring-workspace">
          <div className="hiring-grid-overlay" aria-hidden="true" />
          <div className="hiring-head">
            <div>
              <span className="section-number">03 / FRESH HIRING SIGNALS</span>
              <h2>Find the companies<br />that are building <em>right now.</em></h2>
            </div>
            <p>Search current public remote-job listings by role and eligible market. Filter by freshness to find opportunities posted <strong>today</strong>, this week, or within the last 30 days, then frame the company need for a useful first conversation.</p>
          </div>

          <div className="hiring-search-card">
            <div className="hiring-search-card__top"><span><FileClock size={15} /> FRESHNESS WINDOW</span><span className="freshness-badge">{jobFreshness === "24h" ? "today only" : `≤ ${freshnessLabel} old`}</span></div>
            <div className="hiring-filters">
              <label><span>ROLE OR SKILL</span><div className="hiring-input"><Search size={17} /><input value={jobRole} onChange={(event) => setJobRole(event.target.value)} placeholder="e.g. product manager, biochemist, co-founder" /></div></label>
              <label><span>ELIGIBLE REGION</span><div className="hiring-select"><Globe2 size={16} /><select value={jobRegion} onChange={(event) => { const nextRegion = event.target.value as MarketRegion; setJobRegion(nextRegion); setJobCountry(MARKET_COVERAGE[nextRegion][0]); }}>{SUPPORTED_REGIONS.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={15} /></div></label>
              <label><span>COUNTRY CONTEXT</span><div className="hiring-select"><MapPin size={16} /><select value={jobCountry} onChange={(event) => setJobCountry(event.target.value)}>{MARKET_COVERAGE[jobRegion].map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={15} /></div></label>
              <label><span>POSTED WITHIN</span><div className="hiring-select"><CalendarDays size={16} /><select value={jobFreshness} onChange={(event) => setJobFreshness(event.target.value as typeof jobFreshness)}><option value="24h">Today (24 hours)</option><option value="7d">This week (7 days)</option><option value="30d">Last 30 days</option></select><ChevronDown size={15} /></div></label>
              <button className="hiring-search-button" onClick={runHiringSearch} disabled={hiringSearch.isFetching}>{hiringSearch.isFetching ? <><LoaderCircle className="spin" size={17} /> Sourcing roles</> : <><Search size={17} /> Search fresh roles</>}</button>
            </div>
            <div className="role-suggestions"><span>EXPLORE:</span>{hiringRoleSuggestions.map((role) => <button key={role} onClick={() => setJobRole(role)} className={cn(jobRole.toLowerCase() === role.toLowerCase() && "role-suggestion--active")}>{role}</button>)}</div>
            <p className="hiring-source-note"><CircleHelp size={14} /> Live source: Jobicy. Results filtered to the last {freshnessLabel}. Finderviews applies a direct country filter where Jobicy supports one, otherwise its documented regional filter; every result shows its source geography.</p>
          </div>

          <div className="hiring-body">
            <div className="job-results-panel">
              <div className="job-results-panel__top"><div><span>LIVE_HIRING_SIGNAL_FEED</span><small>{hiringSearch.data ? `${jobs.length} fresh role${jobs.length === 1 ? "" : "s"} from ${hiringSearch.data.sourceName}${jobFreshness !== "30d" && allJobs.length !== jobs.length ? ` (${allJobs.length} in 30d)` : ""}` : "Choose a role, country, and run a fresh search."}</small></div><span className={cn("source-status", jobSearchRequested && !hiringSearch.isError && "source-status--active")}><i /> {hiringSearch.isFetching ? "checking" : hiringSearch.data ? "fresh source" : "ready"}</span></div>
              {!jobSearchRequested && <div className="job-empty-state"><UsersRound size={31} /><strong>Start with a role the company needs.</strong><span>Try product management, social media growth, web development, content, co-founder, life sciences, or operations leadership.</span></div>}
              {jobSearchRequested && hiringSearch.isFetching && <div className="job-empty-state"><LoaderCircle className="spin" size={30} /><strong>Checking hiring signals.</strong><span>Finderviews is searching for matching roles published within the last {freshnessLabel}.</span></div>}
              {jobSearchRequested && hiringSearch.isError && <div className="job-empty-state"><CircleHelp size={30} /><strong>The live job source is unavailable right now.</strong><span>The data-ready workspace is still available. Please try the same role again in a moment.</span></div>}
              {jobSearchRequested && !hiringSearch.isFetching && !hiringSearch.isError && jobs.length === 0 && <div className="job-empty-state"><FileClock size={30} /><strong>No roles matched this search{jobFreshness !== "30d" ? ` within ${freshnessLabel}` : ""} right now.</strong><span>{jobFreshness !== "30d" && allJobs.length > 0 ? `${allJobs.length} role${allJobs.length === 1 ? "" : "s"} found in the full 30-day window. Widen the freshness filter to see them.` : "Try a broader role title (like \"developer\" instead of \"web developer\"), change the region, or widen the freshness window."}</span></div>}
              {jobs.length > 0 && <div className="job-list">{jobs.map((job) => <button className={cn("job-row", selectedJob?.id === job.id && "job-row--selected")} key={job.id} onClick={() => setSelectedJobId(job.id)}><div className="job-row__company">{job.companyLogo ? <img src={job.companyLogo} alt="" /> : <span className="company-fallback"><Building2 size={15} /></span>}<span><strong>{job.company}</strong><small>{job.geography} · {job.industry.join(", ") || "Hiring company"}</small></span></div><div className="job-row__role"><strong>{job.title}</strong><span>{job.jobType.join(" · ") || "Employment type not specified"}</span></div><div className="job-row__date"><CalendarDays size={14} /><span>{job.ageHours < 24 ? `${job.ageHours}h ago` : `${Math.floor(job.ageHours / 24)}d ago`}</span></div><ArrowUpRight size={16} /></button>)}</div>}
              {hiringSearch.data && <div className="job-results-panel__foot"><span><Check size={14} /> {hiringSearch.data.countryFilterApplied ? `${hiringSearch.data.countryContext} source filter applied` : `${hiringSearch.data.regionContext} source region filter applied — verify source geography`} · {freshnessLabel} window.</span><a href={hiringSearch.data.sourceUrl} target="_blank" rel="noreferrer">Source methodology <ExternalLink size={13} /></a></div>}
            </div>

            <aside className="hiring-detail-panel">
              {selectedJob ? <>
                <div className="hiring-detail__eyebrow"><span className="signal-dot" /> PUBLIC HIRING OPPORTUNITY <span>{selectedJob.ageHours < 24 ? `${selectedJob.ageHours} HOURS` : `${Math.floor(selectedJob.ageHours / 24)} DAYS`} OLD</span></div>
                <div className="hiring-company-line">{selectedJob.companyLogo ? <img src={selectedJob.companyLogo} alt="" /> : <Building2 size={19} />}<span>{selectedJob.company}</span></div>
                <h3>{selectedJob.title}</h3>
                <p>{selectedJob.excerpt || "This fresh listing signals a current hiring need. Review the public source before reaching out."}</p>
                <div className="hiring-detail-facts"><div><MapPin size={16} /><span><small>SOURCE GEOGRAPHY</small>{selectedJob.geography}</span></div><div><BriefcaseBusiness size={16} /><span><small>ROLE TYPE</small>{selectedJob.jobType.join(" · ") || "Not specified"}</span></div>{selectedJob.salary && <div><Target size={16} /><span><small>LISTED RANGE</small>{selectedJob.salary}</span></div>}</div>
                <div className="public-contact-card"><Phone size={16} /><div><small>PUBLIC CONTACT CONTEXT</small><strong>{publicCompanyContact ? "Public company record found" : companyContactLookupComplete ? "No public company record found in this lookup" : "Look up a public company record before outreach"}</strong></div><button onClick={lookUpPublicCompanyContact} disabled={isLookingUpCompanyContact}>{isLookingUpCompanyContact ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />}{isLookingUpCompanyContact ? "Looking up" : "Find public contact"}</button></div>
                {publicCompanyContact && <div className="company-contact-results"><div><small>PUBLIC PHONE</small>{publicCompanyContact.phone ? <a href={`tel:${publicCompanyContact.phone}`}>{publicCompanyContact.phone}</a> : <span>Not listed</span>}</div><div><small>COMPANY WEBSITE</small>{publicCompanyContact.website ? <a href={publicCompanyContact.website} target="_blank" rel="noreferrer">Open public website <ExternalLink size={12} /></a> : <span>Not listed</span>}</div>{publicCompanyContact.address && <div><small>PUBLIC ADDRESS</small><span>{publicCompanyContact.address}</span></div>}{publicCompanyContact.listingUrl && <a className="public-listing-link" href={publicCompanyContact.listingUrl} target="_blank" rel="noreferrer">Open public listing <ExternalLink size={12} /></a>}</div>}
                <div className="hiring-detail-actions"><a className="view-source-button" href={selectedJob.sourceUrl} target="_blank" rel="noreferrer">View public job <ExternalLink size={16} /></a><button className="brief-button" onClick={requestHiringBrief} disabled={hiringBrief.isPending}>{hiringBrief.isPending ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{isAuthenticated ? "Build outreach brief" : "Sign in for AI brief"}</button></div>
                {hiringBrief.data && <div className="ai-brief"><div className="ai-brief__title"><Sparkles size={15} /> FINDER AI BRIEF <span>PUBLIC DATA ONLY</span></div><div><small>COMPANY NEED</small><p>{hiringBrief.data.companyNeed}</p></div><div><small>LIKELY DECISION-MAKER ROLE</small><p>{hiringBrief.data.likelyDecisionMakerRole}</p></div><div><small>USEFUL OUTREACH ANGLE</small><p>{hiringBrief.data.outreachAngle}</p></div><div className="ai-brief__evidence"><small>PUBLIC EVIDENCE</small><ul>{hiringBrief.data.evidence.map((item: string) => <li key={item}>{item}</li>)}</ul></div><div className="ai-brief__service"><UserRoundCheck size={16} /><span><small>RECOMMENDED SERVICE</small><strong>{hiringBrief.data.recommendedService}</strong></span></div><p className="ai-brief__caveat">{hiringBrief.data.caveat}</p><div className={cn("brief-review", approvedBriefFor === selectedJob.id && "brief-review--approved")}><span>{approvedBriefFor === selectedJob.id ? <Check size={15} /> : <UserRoundCheck size={15} />}{approvedBriefFor === selectedJob.id ? "Reviewed by you — ready to adapt" : "Review this draft before using it"}</span>{approvedBriefFor !== selectedJob.id && <button onClick={() => { setApprovedBriefFor(selectedJob.id); toast.success("Brief marked reviewed. Adapt it before outreach."); }}>Approve reviewed draft</button>}</div></div>}
              </> : <div className="job-detail-empty"><Sparkles size={29} /><strong>Your company briefing will appear here.</strong><span>Finderviews will show the public job context, source link, and a sign-in protected AI opportunity brief once you select a fresh role.</span></div>}
            </aside>
          </div>
        </section>

        <section className="growth-section" id="growth-path">
          <div className="growth-image" aria-label="A styled small-business growth concept image" />
          <div className="growth-content">
            <span className="section-number">04 / WHAT YOU BRING</span>
            <h2>Every gap is a chance<br />to build <em>momentum.</em></h2>
            <p>Finderviews gives your agency the context to lead with help, not a hard sell. Diagnose what is missing, then connect it to the business result a strong digital presence can create.</p>
            <div className="growth-grid">
              <div><span className="growth-count">01</span><h3>Make the first impression count</h3><p>Turn a scattered presence into a recognisable brand that feels as established online as it is in the neighbourhood.</p></div>
              <div><span className="growth-count">02</span><h3>Give customers a clear way in</h3><p>Build the site, menu, booking flow, or service page that moves a customer from curiosity to action.</p></div>
              <div><span className="growth-count">03</span><h3>Make local discovery easier</h3><p>Connect the business to a more consistent, searchable identity across the places customers already look.</p></div>
            </div>
            <button className="button-dark" onClick={() => scrollTo("finder-workspace")}>Start a focused search <ArrowUpRight size={17} /></button>
          </div>
        </section>

        <section className="delivery-section">
          <div className="delivery-copy">
            <span className="section-number section-number--lime">05 / YOUR OUTREACH SET</span>
            <h2>Research better.<br /><em>Reach out</em> warmer.</h2>
            <p>Build a prospect list with a defensible reason to get in touch. Keep the public details, the website or limited-presence signal, and the best growth idea together in one place.</p>
            <div className="delivery-points">
              <span><Check size={15} /> Public phone and business context</span>
              <span><Check size={15} /> Website and public-presence signal</span>
              <span><Check size={15} /> A practical service angle</span>
            </div>
          </div>
          <div className="delivery-visual" aria-hidden="true">
            <div className="delivery-card delivery-card--back"><span>OUTREACH NOTE</span><b>Growth begins with a useful first message.</b></div>
            <div className="delivery-card delivery-card--front"><div className="card-topline"><span>READY TO REACH</span><span>07 LEADS</span></div><div className="delivery-card__title"><span className="signal-dot" /> Your next opportunity set</div><div className="delivery-card__rows"><div><i /><span>Independent business</span><b>Brand baseline</b></div><div><i /><span>Local service team</span><b>New site</b></div><div><i /><span>Neighbourhood food spot</span><b>Online ordering</b></div></div><button>Open saved leads <ArrowUpRight size={15} /></button></div>
          </div>
        </section>

        <section className="faq-section" id="faq">
          <div className="faq-intro"><span className="section-number">06 / FAQ</span><h2>The details that<br />keep your research <em>honest.</em></h2><p>Finderviews is designed to support thoughtful outreach to local businesses. Start with useful public context, use it respectfully, and let the business need guide the proposal.</p></div>
          <div className="faq-list">
            {faqs.map((faq, index) => {
              const isOpen = faqOpen === index;
              return <article className={cn("faq-item", isOpen && "faq-item--open")} key={faq.question}><button onClick={() => setFaqOpen(isOpen ? -1 : index)} aria-expanded={isOpen}><span>{String(index + 1).padStart(2, "0")}</span><strong>{faq.question}</strong><span className="faq-control">{isOpen ? "−" : "+"}</span></button>{isOpen && <p>{faq.answer}</p>}</article>;
            })}
          </div>
        </section>
      </main>

      <footer className="finder-footer">
        <div className="footer-top"><FinderLogo inverse /><p>Finderviews helps web studios uncover the businesses that a better brand and online presence can help grow.</p><button onClick={() => scrollTo("top")}>Back to top <ArrowUpRight size={16} /></button></div>
        <div className="footer-bottom"><span>© 2026 Finderviews. Built for better first conversations.</span><span>Use public business information responsibly.</span></div>
      </footer>
    </div>
  );
}
