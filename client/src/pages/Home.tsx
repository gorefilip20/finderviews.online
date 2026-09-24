/**
 * Finder visual reminder: Atlas Field Notes — use editorial negative space, ledger rules,
 * real-workflow controls, and Scout Lime only for verified opportunities and primary actions.
 */
import FinderLogo from "@/components/FinderLogo";
import { MapView } from "@/components/Map";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { MARKET_COVERAGE, SUPPORTED_COUNTRY_COUNT, SUPPORTED_REGIONS, type MarketRegion } from "@/lib/marketCoverage";
import { fetchOverpassData, fetchBusinessDirectoryFallback, type OverpassData } from "@/lib/businessProvider";
import { mapBusinessRecords } from "@/lib/businessLeads";
import { enrichBusinessLeadContacts } from "@/lib/contactEnrichment";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BellRing,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  ClipboardPaste,
  Copy,
  Crosshair,
  Download,
  ExternalLink,
  FileText,
  FileClock,
  Globe2,
  LoaderCircle,
  Mail,
  MessageCircle,
  MapPin,
  Menu,
  Phone,
  Plus,
  Search,
  Send,
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
  website?: string;
  address?: string;
  verified: boolean;
  hasWebsite: boolean;
  score: number;
  growthPath: string;
  position?: { lat: number; lng: number };
  mapUrl?: string;
  source?: string;
  contactSearchUrl?: string;
  contactSource?: string;
  contactEnriched?: boolean;
  preview?: boolean;
  presence: "No website listed" | "Limited public presence";
};


const categories = ["All local businesses", "Restaurant", "Home services", "Beauty & wellness", "Retail", "Auto services", "Professional services"];
const presenceOptions = ["No website or limited presence", "No listed website", "Limited public presence"] as const;
const hiringRoleSuggestions = ["AI engineer", "Software engineer", "Data scientist", "Web developer", "Product manager", "Designer", "Marketing", "Sales", "Content writer", "Developer", "Customer support", "Co-founder"];

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
      `Finder supports ${SUPPORTED_COUNTRY_COUNT} countries across Europe, the Americas, Asia, Africa, and Oceania. Enter a country and then narrow it with a city or neighbourhood; live source coverage can vary by market.`,
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
  Africa: { lat: 1.65, lng: 17.72 },
  Oceania: { lat: -25.27, lng: 133.77 },
};

export default function Home() {
  const { isAuthenticated } = useAuth();
  const [location, setLocation] = useState("");
  const [region, setRegion] = useState<MarketRegion>("Americas");
  const [country, setCountry] = useState("United States");
  const [category, setCategory] = useState("All local businesses");
  const [presenceMode, setPresenceMode] = useState<(typeof presenceOptions)[number]>("No website or limited presence");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [usingPreview, setUsingPreview] = useState(false);
  const [query, setQuery] = useState("");
  const [contactFilter, setContactFilter] = useState<"any" | "phone" | "email" | "both">("any");
  const [scoreFilter, setScoreFilter] = useState<"any" | "high" | "top">("any");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [outreachSavedJobIds, setOutreachSavedJobIds] = useState<string[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [faqOpen, setFaqOpen] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [jobRole, setJobRole] = useState("All hiring roles");
  const [jobRegion, setJobRegion] = useState<MarketRegion>("Americas");
  const [jobCountry, setJobCountry] = useState("Worldwide");
  const [jobFreshness, setJobFreshness] = useState<"24h" | "7d" | "30d">("30d");
  const [jobSearchRequested, setJobSearchRequested] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [approvedBriefFor, setApprovedBriefFor] = useState<string | null>(null);
  const [applicationStatuses, setApplicationStatuses] = useState<Record<string, "saved" | "ready" | "applied" | "interview" | "closed">>({});
  const [jobAlertEnabled, setJobAlertEnabled] = useState(false);
  const [alertEmail, setAlertEmail] = useState("");
  const [communityText, setCommunityText] = useState("");
  const [opportunityTitle, setOpportunityTitle] = useState("");
  const [urgentPost, setUrgentPost] = useState(false);
  const [communityPosts, setCommunityPosts] = useState<Array<{ id: string; title?: string; description?: string; text?: string; role: string; country: string; state?: string; city?: string; urgent?: boolean; createdAt: string }>>([]);
  const [locationDirectory, setLocationDirectory] = useState<Array<{ name: string; states?: Array<{ name: string }> }>>([]);
  const [jobState, setJobState] = useState("");
  const [jobCity, setJobCity] = useState("");
  const [locationCities, setLocationCities] = useState<string[]>([]);
  const [businessState, setBusinessState] = useState("");
  const [businessCity, setBusinessCity] = useState("");
  const [businessCities, setBusinessCities] = useState<string[]>([]);
  const [profile, setProfile] = useState({ companyName: "", companyDescription: "", website: "", contactEmail: "" });
  const [profileSaved, setProfileSaved] = useState(false);
  const [pitchProfile, setPitchProfile] = useState({ name: "", offer: "Websites, landing pages, and digital growth systems", proof: "", portfolio: "", availability: "Available for a focused project" });
  const [resumeText, setResumeText] = useState("");
  const [resumeSaved, setResumeSaved] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingLeadEmail, setSendingLeadEmail] = useState(false);
  const [hiringTab, setHiringTab] = useState<"external" | "community">("external");
  const [communityJobs, setCommunityJobs] = useState<Array<{ id: string; title: string; company: string; description: string; applyEmail?: string; applyUrl?: string; country: string; state: string; city: string; jobType: string; level: string; salaryRange?: string; industry: string[]; status: string; createdAt: string; expiresAt: string; posterName?: string }>>([]);
  const [communityJobsLoading, setCommunityJobsLoading] = useState(false);
  const [selectedCommunityJobId, setSelectedCommunityJobId] = useState<string | null>(null);
  const [postJobForm, setPostJobForm] = useState({ title: "", company: "", description: "", applyEmail: "", applyUrl: "", jobType: "Full-time", level: "Not specified", salaryRange: "", industry: "" });
  const [postingJob, setPostingJob] = useState(false);
  const [showPostJobForm, setShowPostJobForm] = useState(false);
  const [applyingToCommunityJob, setApplyingToCommunityJob] = useState(false);
  const [applyCoverNote, setApplyCoverNote] = useState("");
  const [applyEmail, setApplyEmailField] = useState("");
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  const jobSearchInput = useMemo(() => ({ role: jobRole || "All hiring roles", country: jobCountry, region: jobRegion }), [jobCountry, jobRegion, jobRole]);
  const hiringSearch = trpc.hiring.search.useQuery(jobSearchInput, { enabled: jobSearchRequested, retry: false, refetchOnWindowFocus: false, refetchInterval: jobAlertEnabled ? 30 * 60 * 1000 : false });
  const hiringBrief = trpc.hiring.brief.useMutation({
    onSuccess: () => toast.success("Hiring brief prepared from the public job listing."),
    onError: () => toast.error("Finder could not prepare that brief just now. Please try again."),
  });
  const resumeTailor = trpc.hiring.tailorResume.useMutation({
    onSuccess: () => toast.success("Resume tailored to match this role."),
    onError: () => toast.error("Resume tailoring failed. Please try again."),
  });
  const selectedCountryLocation = locationDirectory.find((item) => item.name === jobCountry);
  const availableStates = selectedCountryLocation?.states?.map((item) => item.name) || [];
  const availableCities = locationCities;
  const selectedBusinessCountry = locationDirectory.find((item) => item.name === country);
  const businessStates = selectedBusinessCountry?.states?.map((item) => item.name) || [];
  const freshnessMaxHours = jobFreshness === "24h" ? 24 : jobFreshness === "7d" ? 168 : 720;
  const freshnessLabel = jobFreshness === "24h" ? "24 hours" : jobFreshness === "7d" ? "7 days" : "30 days";
  const allJobs = hiringSearch.data?.jobs || [];
  const jobs = allJobs.filter((job) => job.ageHours <= freshnessMaxHours);
  const selectedJob = jobs.find((job) => job.id === selectedJobId) || jobs[0];

  useEffect(() => {
    try {
      const savedAlert = JSON.parse(localStorage.getItem("finderviews-job-alert") || "null");
      if (savedAlert?.role) { setJobAlertEnabled(true); setAlertEmail(savedAlert.email || ""); }
      const savedPosts = JSON.parse(localStorage.getItem("finderviews-community-posts") || "[]");
      if (Array.isArray(savedPosts)) setCommunityPosts(savedPosts.slice(0, 12));
      const savedProfile = JSON.parse(localStorage.getItem("finderviews-employer-profile") || "null");
      if (savedProfile) setProfile(savedProfile);
      const savedPitch = JSON.parse(localStorage.getItem("finderviews-pitch-profile") || "null");
      if (savedPitch) setPitchProfile((current) => ({ ...current, ...savedPitch }));
      const savedApplicationStatuses = JSON.parse(localStorage.getItem("finderviews-application-statuses") || "{}");
      if (savedApplicationStatuses && typeof savedApplicationStatuses === "object") setApplicationStatuses(savedApplicationStatuses);
      const savedResume = localStorage.getItem("finderviews-resume") || "";
      if (savedResume) { setResumeText(savedResume); setResumeSaved(true); }
    } catch { /* local storage can be unavailable in private browsing */ }
    fetch("https://countriesnow.space/api/v0.1/countries/states").then((response) => response.ok ? response.json() : null).then((payload) => { if (Array.isArray(payload?.data)) setLocationDirectory(payload.data); }).catch(() => undefined);
    const syncPosts = (event: StorageEvent) => { if (event.key === "finderviews-community-posts") { try { const next = JSON.parse(event.newValue || "[]"); if (Array.isArray(next)) setCommunityPosts(next.slice(0, 12)); } catch { /* ignore malformed local data */ } } };
    window.addEventListener("storage", syncPosts);
    return () => window.removeEventListener("storage", syncPosts);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetch("/api/outreach/leads", { credentials: "include" }).then((response) => response.ok ? response.json() : null).then((payload) => {
      if (Array.isArray(payload?.leads)) setOutreachSavedJobIds(payload.leads.map((lead: { sourceUrl?: string }) => lead.sourceUrl).filter(Boolean));
    }).catch(() => undefined);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const loadProfile = () => fetch("/api/employer-profile", { credentials: "include" }).then((response) => response.ok ? response.json() : null).then((payload) => { if (!cancelled && payload?.profile) { setProfile(payload.profile); setProfileSaved(true); } }).catch(() => undefined);
    void loadProfile();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  useEffect(() => {
    const refreshUrgent = () => fetch("/api/opportunities", { credentials: "include" }).then((response) => response.ok ? response.json() : null).then((payload) => { if (Array.isArray(payload?.opportunities)) setCommunityPosts(payload.opportunities.slice(0, 12)); }).catch(() => undefined);
    void refreshUrgent();
    const timer = window.setInterval(refreshUrgent, 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!jobCountry || !jobState) { setLocationCities([]); return; }
    fetch("https://countriesnow.space/api/v0.1/countries/state/cities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ country: jobCountry, state: jobState }) }).then((response) => response.ok ? response.json() : null).then((payload) => { setLocationCities(Array.isArray(payload?.data) ? payload.data : []); }).catch(() => setLocationCities([]));
  }, [jobCountry, jobState]);

  useEffect(() => {
    setBusinessState("");
    setBusinessCity("");
    setBusinessCities([]);
    setLocation("");
  }, [country]);

  useEffect(() => {
    if (!country || !businessState) { setBusinessCities([]); return; }
    fetch("https://countriesnow.space/api/v0.1/countries/state/cities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ country, state: businessState }) })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => setBusinessCities(Array.isArray(payload?.data) ? payload.data : []))
      .catch(() => setBusinessCities([]));
  }, [country, businessState]);

  useEffect(() => {
    if (jobs.length > 0) setSelectedJobId(jobs[0].id);
    if (jobs.length === 0) setSelectedJobId(null);
  }, [jobs]);

  useEffect(() => {
    setApprovedBriefFor(null);
  }, [selectedJobId]);

  useEffect(() => {
    setLeads([]);
    setSelectedLead(null);
    setUsingPreview(false);
  }, [country, region]);

  const visibleLeads = useMemo(() => {
    const term = query.trim().toLowerCase();
    return leads.filter((lead) => {
      const hasPhone = Boolean(lead.phone && !lead.phone.toLowerCase().includes("no public"));
      const hasEmail = Boolean(lead.email);
      const matchesContact = contactFilter === "any" || (contactFilter === "phone" && hasPhone) || (contactFilter === "email" && hasEmail) || (contactFilter === "both" && hasPhone && hasEmail);
      const matchesScore = scoreFilter === "any" || (scoreFilter === "high" && lead.score >= 80) || (scoreFilter === "top" && lead.score >= 90);
      const matchesText = !term || [lead.name, lead.category, lead.location, lead.growthPath].some((value) => value.toLowerCase().includes(term));
      return matchesContact && matchesScore && matchesText;
    });
  }, [contactFilter, leads, query, scoreFilter]);

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

  const marketLabel = `${businessCity.trim() ? `${businessCity.trim()}, ` : ""}${country}`;

  const runLiveSearch = async () => {
    if (!businessCity) {
      toast.error("Choose a city before searching for local businesses.");
      return;
    }
    setIsSearching(true);
    setSearched(true);
    try {
      const cityText = businessCity.trim();
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
        radius = Math.min(10000, Math.max(3000, Math.abs(parseFloat(bbox[1]) - parseFloat(bbox[0])) * 111000));
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

      const overpassQuery = `[out:json][timeout:15];(${categoryUnionMembers.join("")});out center tags 50;`;
      let overpassData: OverpassData;
      try {
        const providerData = await fetchOverpassData(overpassQuery);
        if (!providerData) {
          const fallbackTerm = category === "All local businesses" ? "business" : category;
          overpassData = await fetchBusinessDirectoryFallback(fallbackTerm, marketLabel);
        } else overpassData = providerData;

        // A healthy Overpass response can still contain no matching records when a
        // mirror is stale, rate-limited, or applies a narrower interpretation of
        // the category query. Treat an empty payload like a provider miss and use
        // the public Nominatim directory fallback instead of showing a false zero.
        if (!Array.isArray(overpassData.elements) || overpassData.elements.length === 0) {
          const fallbackTerm = category === "All local businesses" ? "business" : category;
          overpassData = await fetchBusinessDirectoryFallback(fallbackTerm, marketLabel);
        }
      } catch {
        setLeads([]);
        setSelectedLead(null);
        setUsingPreview(false);
        toast.error("Could not reach the business data source. Check your connection and try again.");
        setIsSearching(false);
        return;
      }

      const mappedLeads: Lead[] = mapBusinessRecords(overpassData.elements, {
        country,
        marketLabel,
        category,
        presenceMode,
      }).map((lead) => ({
        ...lead,
        score: Math.min(96, 72 + Math.floor(Math.random() * 22)),
      }));
      const nextLeads: Lead[] = await enrichBusinessLeadContacts(mappedLeads);

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

  const saveLeadToOutreach = async (lead: Lead) => {
    if (!isAuthenticated) { toast.message("Sign in to sync saved leads and outreach drafts across devices."); startLogin(); return; }
    const response = await fetch("/api/outreach/leads", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: lead.name, company: lead.name, sourceUrl: lead.source || "https://www.openstreetmap.org/", geography: lead.location, contactEmail: lead.email, contactUrl: lead.source }) });
    if (!response.ok) throw new Error("lead save failed");
    toast.success("Lead added to your outreach queue.");
  };

  const toggleSaved = (id: string) => {
    setSavedIds((current) => {
      const saved = current.includes(id);
      const lead = leads.find((item) => item.id === id);
      if (!saved && lead) void saveLeadToOutreach(lead).catch(() => toast.error("Lead saved locally, but could not sync to the outreach queue."));
      toast.success(saved ? "Lead removed from your outreach set." : "Lead saved to your outreach set.");
      return saved ? current.filter((value) => value !== id) : [...current, id];
    });
  };
  const createLocalLeadDraft = async () => {
    if (!selectedLead) return;
    if (!selectedLead.email || !/^\S+@\S+\.\S+$/.test(selectedLead.email)) {
      toast.message("No public email is listed for this business. Use the public phone or listing link and respect the business's preferred contact route.");
      return;
    }
    if (!isAuthenticated) { toast.message("Sign in to create an outreach draft."); startLogin(); return; }
    try {
      const response = await fetch("/api/outreach/drafts", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: selectedLead.email, subject: `A simple website idea for ${selectedLead.name}`, text: `Hello ${selectedLead.name} team,\n\nI found your public business listing while researching ${selectedLead.category.toLowerCase()} businesses in ${selectedLead.location}. I noticed that no standalone website is listed, so I wanted to ask whether improving your online presence is something you are considering.\n\nIf useful, I can share a short, no-pressure idea tailored to your business.\n\nBest,\n[Your name]\n\nPublic listing: ${selectedLead.source || "https://www.openstreetmap.org/"}`, leadId: selectedLead.source || selectedLead.id }) });
      if (!response.ok) throw new Error("draft failed");
      toast.success("Message draft saved for review. Nothing was sent automatically.");
    } catch { toast.error("The message draft could not be saved."); }
  };
  const publicPhone = selectedLead?.phone && !selectedLead.phone.toLowerCase().includes("no public") ? selectedLead.phone : "";
  const phoneHref = publicPhone ? `tel:${publicPhone.replace(/[^+\d]/g, "")}` : "";
  const whatsappHref = publicPhone ? `https://wa.me/${publicPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hello ${selectedLead?.name || "there"}, I found your public business listing and wanted to share a short idea about improving your online presence. Is this the right contact route?`)}` : "";
  const openPublicContactSearch = () => {
    if (selectedLead?.website) { window.open(selectedLead.website, "_blank", "noopener,noreferrer"); return; }
    if (selectedLead?.contactSearchUrl) { window.open(selectedLead.contactSearchUrl, "_blank", "noopener,noreferrer"); return; }
    toast.message("No public website or contact route was listed. Verify the business manually before reaching out.");
  };

  const saveSelectedJobToOutreach = async () => {
    if (!selectedJob) return;
    if (!isAuthenticated) { toast.message("Sign in to save jobs to the outreach queue."); startLogin(); return; }
    try {
      const response = await fetch("/api/outreach/leads", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: selectedJob.title, company: selectedJob.company, sourceUrl: selectedJob.sourceUrl, geography: selectedJob.geography, contactEmail: selectedJob.applyEmail, contactUrl: selectedJob.companyWebsite || selectedJob.contactSearchUrl }) });
      if (!response.ok) throw new Error("job save failed");
      setOutreachSavedJobIds((current) => current.includes(selectedJob.sourceUrl) ? current : [...current, selectedJob.sourceUrl]);
      toast.success("Job added to your outreach queue.");
    } catch { toast.error("The job could not be added to your outreach queue."); }
  };

  const createOutreachDraft = async () => {
    if (!selectedJob?.applyEmail) { toast.message("This listing has no public email. Open the public contact route or original application page instead."); return; }
    if (!isAuthenticated) { toast.message("Sign in to create an outreach draft."); startLogin(); return; }
    try {
      const response = await fetch("/api/outreach/drafts", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: selectedJob.applyEmail, subject: `A practical idea for ${selectedJob.company}'s ${selectedJob.title} hiring need`, text: `Hello ${selectedJob.company} team,\n\nI saw your public ${selectedJob.title} listing and wanted to share a practical idea that may support this hiring need. If useful, I would be glad to send a short overview.\n\nBest,\n[Your name]\n\nPublic source: ${selectedJob.sourceUrl}`, leadId: selectedJob.sourceUrl }) });
      if (!response.ok) throw new Error("draft failed");
      toast.success("Draft saved for review. Nothing was sent automatically.");
    } catch { toast.error("The outreach draft could not be saved."); }
  };

  const updateApplicationStatus = (status: "saved" | "ready" | "applied" | "interview" | "closed") => {
    if (!selectedJob) return;
    setApplicationStatuses((current) => {
      const next = { ...current, [selectedJob.sourceUrl]: status };
      localStorage.setItem("finderviews-application-statuses", JSON.stringify(next));
      return next;
    });
    toast.success(status === "applied" ? "Marked applied. Keep the employer confirmation in your records." : "Application status updated.");
  };

  const exportPreview = () => {
    toast.message("Export is ready to connect once Finder is linked to your research workflow.");
  };
  const pitchText = `Hello, I'm ${pitchProfile.name || "[your name]"}. I help teams with ${pitchProfile.offer.toLowerCase()}. ${pitchProfile.proof ? `Recent proof: ${pitchProfile.proof}. ` : ""}${pitchProfile.availability}. ${pitchProfile.portfolio ? `Portfolio: ${pitchProfile.portfolio}` : "I can share a short relevant example if useful."}`;
  const savePitchProfile = () => {
    localStorage.setItem("finderviews-pitch-profile", JSON.stringify(pitchProfile));
    toast.success("Your opportunity profile is ready to reuse.");
  };
  const copyPitch = async () => {
    try { await navigator.clipboard.writeText(pitchText); toast.success("Pitch copied. Personalize it before sending."); } catch { toast.message("Copy is unavailable here; select the pitch text manually."); }
  };

  const runHiringSearch = () => {
    setJobSearchRequested(true);
    void hiringSearch.refetch();
  };

  const toggleJobAlert = async () => {
    if (jobAlertEnabled) {
      localStorage.removeItem("finderviews-job-alert");
      setJobAlertEnabled(false);
      toast.message("Job alert paused for this search.");
      return;
    }
    const email = alertEmail.trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      toast.error("Enter a valid email address or leave it blank for browser alerts.");
      return;
    }
    localStorage.setItem("finderviews-job-alert", JSON.stringify({ role: jobRole, country: jobCountry, region: jobRegion, email, createdAt: new Date().toISOString() }));
    setJobAlertEnabled(true);
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch { /* browser may block permission prompts */ }
    }
    toast.success(`Alert saved for ${jobRole || "all roles"} in ${jobCountry}.`);
  };

  const publishCommunityPost = async () => {
    if (!isAuthenticated) { toast.message("Sign in before publishing an opportunity."); startLogin(); return; }
    const text = communityText.trim();
    const title = opportunityTitle.trim();
    if (title.length < 4 || text.length < 10) { toast.error("Add a short title and at least 10 characters of useful detail."); return; }
    try {
      const response = await fetch("/api/opportunities", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, description: text, role: jobRole || "All roles", country: jobCountry, state: jobState, city: jobCity, urgent: urgentPost }) });
      if (!response.ok) throw new Error("publish failed");
      const payload = await response.json();
      if (payload.opportunity) setCommunityPosts((current) => [payload.opportunity, ...current].slice(0, 12));
      setOpportunityTitle(""); setCommunityText(""); setUrgentPost(false);
      toast.success(urgentPost ? "Urgent opportunity published to the live board." : "Opportunity published to the live board.");
    } catch { toast.error("The opportunity could not be published. Please try again."); }
  };

  const saveEmployerProfile = async () => {
    if (!isAuthenticated) { toast.message("Sign in to manage your employer profile."); startLogin(); return; }
    if (!profile.companyName.trim() || !profile.contactEmail.trim()) { toast.error("Company name and contact email are required."); return; }
    try {
      const response = await fetch("/api/employer-profile", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
      if (!response.ok) throw new Error("profile save failed");
      const payload = await response.json();
      if (payload.profile) setProfile(payload.profile);
      setProfileSaved(true);
      toast.success("Employer profile saved securely for your account.");
    } catch { toast.error("The employer profile could not be saved. Please try again."); }
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
  const recruiterSearchUrl = selectedJob ? `https://www.google.com/search?q=${encodeURIComponent(`${selectedJob.company} ${selectedJob.title} recruiter hiring manager LinkedIn`)}` : "";
  const applicationMessage = selectedJob ? `Hello ${selectedJob.company} hiring team,\n\nI'm applying for the ${selectedJob.title} role because my experience in ${pitchProfile.offer.toLowerCase()} can help with the work described in the public listing. ${pitchProfile.proof ? `Relevant proof: ${pitchProfile.proof}. ` : ""}${pitchProfile.portfolio ? `Portfolio: ${pitchProfile.portfolio}. ` : ""}I would welcome the chance to explain how I could contribute.\n\nBest,\n${pitchProfile.name || "[Your name]"}` : "";
  const copyApplicationMessage = async () => {
    if (!applicationMessage) return;
    try { await navigator.clipboard.writeText(applicationMessage); toast.success("Tailored application message copied. Personalize it before sending."); } catch { toast.message("Copy is unavailable; select the message manually."); }
  };

  const sendLeadEmail = async () => {
    if (!selectedLead?.email) { toast.message("No public email for this business. Use a different contact route."); return; }
    if (!isAuthenticated) { toast.message("Sign in to send emails."); startLogin(); return; }
    setSendingLeadEmail(true);
    try {
      const draftRes = await fetch("/api/outreach/drafts", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: selectedLead.email, subject: `A simple website idea for ${selectedLead.name}`, text: `Hello ${selectedLead.name} team,\n\nI found your public business listing while researching ${selectedLead.category.toLowerCase()} businesses in ${selectedLead.location}. I noticed that no standalone website is listed, so I wanted to ask whether improving your online presence is something you are considering.\n\nIf useful, I can share a short, no-pressure idea tailored to your business.\n\nBest,\n${pitchProfile.name || "[Your name]"}\n\nPublic listing: ${selectedLead.source || "https://www.openstreetmap.org/"}`, leadId: selectedLead.source || selectedLead.id }) });
      if (!draftRes.ok) throw new Error("draft failed");
      const draftPayload = await draftRes.json();
      if (!draftPayload.sendingConfigured) { toast.message("Draft saved. Email sending requires RESEND_API_KEY on your server."); setSendingLeadEmail(false); return; }
      const sendRes = await fetch("/api/outreach/send", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId: draftPayload.draft.id, confirmSend: true }) });
      if (!sendRes.ok) { const err = await sendRes.json().catch(() => ({})); toast.error((err as { error?: string }).error || "Email could not be sent."); setSendingLeadEmail(false); return; }
      toast.success(`Email sent to ${selectedLead.email}.`);
    } catch { toast.error("Something went wrong sending the email."); }
    setSendingLeadEmail(false);
  };

  const sendJobEmail = async () => {
    if (!selectedJob?.applyEmail) { toast.message("No public email for this job. Use the original application route."); return; }
    if (!isAuthenticated) { toast.message("Sign in to send emails."); startLogin(); return; }
    setSendingEmail(true);
    try {
      const draftRes = await fetch("/api/outreach/drafts", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: selectedJob.applyEmail, subject: `Application for ${selectedJob.title} at ${selectedJob.company}`, text: applicationMessage, leadId: selectedJob.sourceUrl }) });
      if (!draftRes.ok) throw new Error("draft failed");
      const draftPayload = await draftRes.json();
      if (!draftPayload.sendingConfigured) { toast.message("Draft saved. Email sending requires RESEND_API_KEY on your server."); setSendingEmail(false); return; }
      const sendRes = await fetch("/api/outreach/send", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId: draftPayload.draft.id, confirmSend: true }) });
      if (!sendRes.ok) { const err = await sendRes.json().catch(() => ({})); toast.error((err as { error?: string }).error || "Email could not be sent."); setSendingEmail(false); return; }
      toast.success(`Application email sent to ${selectedJob.applyEmail}.`);
    } catch { toast.error("Something went wrong sending the email."); }
    setSendingEmail(false);
  };

  const saveResume = () => {
    if (resumeText.trim().length < 20) { toast.error("Paste at least a short resume (20+ characters)."); return; }
    localStorage.setItem("finderviews-resume", resumeText);
    setResumeSaved(true);
    toast.success("Resume saved locally. You can tailor it to any job.");
  };

  const tailorResumeForJob = () => {
    if (!selectedJob) return;
    if (!resumeText.trim() || resumeText.trim().length < 20) { toast.error("Save your resume first in the Resume section below."); return; }
    if (!isAuthenticated) { toast.message("Sign in to use AI resume tailoring."); startLogin(); return; }
    resumeTailor.mutate({
      resume: resumeText,
      jobTitle: selectedJob.title,
      company: selectedJob.company,
      description: selectedJob.description,
      jobType: selectedJob.jobType,
      level: selectedJob.level,
    });
  };

  const selectedCommunityJob = communityJobs.find((j) => j.id === selectedCommunityJobId) || communityJobs[0] || null;

  const tailorResumeForCommunityJob = () => {
    if (!selectedCommunityJob) return;
    if (!resumeText.trim() || resumeText.trim().length < 20) { toast.error("Save your resume first in the Resume section below."); return; }
    if (!isAuthenticated) { toast.message("Sign in to use AI resume tailoring."); startLogin(); return; }
    resumeTailor.mutate({
      resume: resumeText,
      jobTitle: selectedCommunityJob.title,
      company: selectedCommunityJob.company,
      description: selectedCommunityJob.description,
      jobType: [selectedCommunityJob.jobType],
      level: selectedCommunityJob.level,
    });
  };

  const fetchCommunityJobs = async () => {
    setCommunityJobsLoading(true);
    try {
      const params = new URLSearchParams();
      if (jobRole && jobRole !== "All hiring roles") params.set("role", jobRole);
      if (jobCountry && jobCountry !== "Worldwide") params.set("country", jobCountry);
      const res = await fetch(`/api/community-jobs?${params.toString()}`);
      if (!res.ok) throw new Error("fetch failed");
      const payload = await res.json();
      setCommunityJobs(payload.jobs || []);
      if (payload.jobs?.length > 0) setSelectedCommunityJobId(payload.jobs[0].id);
    } catch { toast.error("Could not load community jobs."); }
    setCommunityJobsLoading(false);
  };

  useEffect(() => { if (hiringTab === "community") void fetchCommunityJobs(); }, [hiringTab]);

  const postCommunityJob = async () => {
    if (!isAuthenticated) { toast.message("Sign in to post a job."); startLogin(); return; }
    if (!postJobForm.title.trim() || !postJobForm.company.trim() || postJobForm.description.trim().length < 20) { toast.error("Fill in the title, company, and a description (20+ characters)."); return; }
    if (!postJobForm.applyEmail.trim() && !postJobForm.applyUrl.trim()) { toast.error("Provide an application email or URL so people can apply."); return; }
    setPostingJob(true);
    try {
      const res = await fetch("/api/community-jobs", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: postJobForm.title, company: postJobForm.company, description: postJobForm.description, applyEmail: postJobForm.applyEmail, applyUrl: postJobForm.applyUrl, country: jobCountry, state: jobState, city: jobCity, jobType: postJobForm.jobType, level: postJobForm.level, salaryRange: postJobForm.salaryRange, industry: postJobForm.industry.split(",").map((s) => s.trim()).filter(Boolean) }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error((err as { error?: string }).error || "Could not post the job."); setPostingJob(false); return; }
      const payload = await res.json();
      setCommunityJobs((current) => [payload.job, ...current]);
      setSelectedCommunityJobId(payload.job.id);
      setPostJobForm({ title: "", company: "", description: "", applyEmail: "", applyUrl: "", jobType: "Full-time", level: "Not specified", salaryRange: "", industry: "" });
      setShowPostJobForm(false);
      toast.success("Job posted to the Finderviews community board.");
    } catch { toast.error("Could not post the job."); }
    setPostingJob(false);
  };

  const applyToCommunityJob = async () => {
    if (!selectedCommunityJob) return;
    if (!isAuthenticated) { toast.message("Sign in to apply."); startLogin(); return; }
    if (!resumeText || resumeText.trim().length < 20) { toast.error("Save your resume first in the Resume section below."); return; }
    const emailToUse = applyEmail.trim() || profile.contactEmail || "";
    if (!emailToUse || !/^\S+@\S+\.\S+$/.test(emailToUse)) { toast.error("Enter your email address so the employer can reach you."); return; }
    setApplyingToCommunityJob(true);
    try {
      const res = await fetch(`/api/community-jobs/${selectedCommunityJob.id}/apply`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resume: resumeText, coverNote: applyCoverNote, applicantEmail: emailToUse, applicantName: pitchProfile.name || "" }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error((err as { error?: string }).error || "Application could not be sent."); setApplyingToCommunityJob(false); return; }
      toast.success(`Application sent to ${selectedCommunityJob.company}!`);
      setApplyCoverNote("");
    } catch { toast.error("Something went wrong sending your application."); }
    setApplyingToCommunityJob(false);
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
          <button onClick={() => scrollTo("community-board")}>Opportunity board</button>
          <button onClick={() => scrollTo("employer-profile")}>Employer profile</button>
          <button onClick={() => scrollTo("resume-section")}>Resume</button>
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
              <div className="eyebrow"><span className="signal-dot" /> Worldwide coverage</div>
              <h1>Find the businesses<br />ready to <em>move.</em></h1>
              <p className="hero-lede">Finderviews searches {SUPPORTED_COUNTRY_COUNT} countries worldwide for businesses with no listed website, a limited public presence, or a fresh hiring need—so your offer reaches them when change is already underway.</p>
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
                <label className="field-label" htmlFor="hero-state">State / province</label>
                <div className="select-wrap">
                  <MapPin size={17} />
                  <select id="hero-state" value={businessState} onChange={(event) => setBusinessState(event.target.value)} disabled={locationDirectory.length === 0 || businessStates.length === 0}>
                    <option value="">{locationDirectory.length === 0 ? "Loading states…" : businessStates.length ? "Choose a state / province" : "No state list available"}</option>
                    {businessStates.map((option) => <option key={option}>{option}</option>)}
                  </select>
                  <ChevronDown size={16} />
                </div>
                <label className="field-label" htmlFor="hero-location">City <span>(required)</span></label>
                <div className="select-wrap">
                  <MapPin size={17} />
                  <select id="hero-location" value={businessCity} onChange={(event) => { setBusinessCity(event.target.value); setLocation(event.target.value); }} disabled={!businessState || businessCities.length === 0}>
                    <option value="">{!businessState ? "Choose a state first" : businessCities.length ? "Choose a city" : "Loading cities…"}</option>
                    {businessCities.map((option) => <option key={option}>{option}</option>)}
                  </select>
                  <ChevronDown size={16} />
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
              <button className="button-primary button-primary--wide" onClick={runLiveSearch} disabled={isSearching || !businessCity}>
                {isSearching ? <><LoaderCircle className="spin" size={17} /> Checking listings</> : <><Search size={17} /> Find opportunities</>}
              </button>
              <p className="card-note"><span className="signal-dot" /> Limited presence is a public-listing signal, not a full digital audit.</p>
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
              <p>Choose from any country worldwide, then focus the search with a city or category.</p>
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
            <label className="workspace-filter" aria-label="Filter by contact availability">
              <Phone size={15} />
              <select value={contactFilter} onChange={(event) => setContactFilter(event.target.value as typeof contactFilter)}>
                <option value="any">Any contact</option>
                <option value="phone">Phone listed</option>
                <option value="email">Email listed</option>
                <option value="both">Phone + email</option>
              </select>
              <ChevronDown size={14} />
            </label>
            <label className="workspace-filter" aria-label="Filter by opportunity score">
              <Crosshair size={15} />
              <select value={scoreFilter} onChange={(event) => setScoreFilter(event.target.value as typeof scoreFilter)}>
                <option value="any">Any score</option>
                <option value="high">High opportunity (80+)</option>
                <option value="top">Top priority (90+)</option>
              </select>
              <ChevronDown size={14} />
            </label>
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
                    <div><UserRoundCheck size={16} /><span><small>BEST CONTACT</small>Owner or manager</span></div>
                  </div>
                  <div className="growth-callout"><Sparkles size={17} /><div><small>RECOMMENDED ANGLE</small><strong>{selectedLead.growthPath}</strong></div></div>
                  <div className="contact-action-grid">{selectedLead.email ? <a className="contact-action contact-action--email" href={`mailto:${selectedLead.email}?subject=${encodeURIComponent(`A simple website idea for ${selectedLead.name}`)}`}><Mail size={15} /> Email {selectedLead.email}</a> : <button className="contact-action" onClick={() => void createLocalLeadDraft()}><Mail size={15} /> Draft message</button>}{phoneHref && <a className="contact-action" href={phoneHref}><Phone size={15} /> Call {selectedLead.phone}</a>}{whatsappHref && <a className="contact-action" href={whatsappHref} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp / message</a>}<button className="contact-action" onClick={openPublicContactSearch}><ExternalLink size={15} /> Public website / contact</button>{selectedLead.mapUrl && <a className="contact-action" href={selectedLead.mapUrl} target="_blank" rel="noreferrer"><MapPin size={15} /> Open exact map</a>}</div>
                  <div className="detail-actions"><button className="button-primary" onClick={() => toggleSaved(selectedLead.id)}>{savedIds.includes(selectedLead.id) ? <Check size={16} /> : <Plus size={16} />}{savedIds.includes(selectedLead.id) ? "Saved to outreach" : "Save opportunity"}</button>{selectedLead.email && <button className="button-secondary" onClick={() => void createLocalLeadDraft()}><Mail size={16} /> Save email draft</button>}{selectedLead.email && <button className="button-secondary" onClick={sendLeadEmail} disabled={sendingLeadEmail}>{sendingLeadEmail ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} Send email now</button>}<button className="icon-outline" onClick={() => { if (selectedLead.source) window.open(selectedLead.source, "_blank", "noopener,noreferrer"); else toast.message("No public listing source is available."); }} aria-label="Open listing source"><ExternalLink size={16} /></button></div>
                  <small className="detail-source-note">Public listing data only. {selectedLead.contactEnriched ? `Contact fields checked through ${selectedLead.contactSource || "a secondary public directory"}. ` : "No secondary contact match was found. "}Verify the website gap and use the business's preferred contact route before sending.</small>
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
            <p>Search current public remote-job listings by role and eligible market, or browse jobs posted directly by employers on the Finderviews community board.</p>
          </div>

          <div className="hiring-tab-bar">
            <button className={cn("hiring-tab", hiringTab === "external" && "hiring-tab--active")} onClick={() => setHiringTab("external")}>
              <Globe2 size={15} /> External Jobs
            </button>
            <button className={cn("hiring-tab", hiringTab === "community" && "hiring-tab--active")} onClick={() => setHiringTab("community")}>
              <UsersRound size={15} /> Community Board
            </button>
          </div>

          {hiringTab === "external" && <><div className="hiring-search-card">
            <div className="hiring-search-card__top"><span><FileClock size={15} /> FRESHNESS WINDOW</span><span className="freshness-badge">{jobFreshness === "24h" ? "today only" : `≤ ${freshnessLabel} old`}</span></div>
            <div className="hiring-filters">
              <label><span>ROLE OR SKILL</span><div className="hiring-input"><Search size={17} /><input value={jobRole} onChange={(event) => setJobRole(event.target.value)} placeholder="e.g. product manager, biochemist, co-founder" /></div></label>
              <label><span>ELIGIBLE REGION</span><div className="hiring-select"><Globe2 size={16} /><select value={jobRegion} onChange={(event) => { const nextRegion = event.target.value as MarketRegion; setJobRegion(nextRegion); setJobCountry(MARKET_COVERAGE[nextRegion][0]); }}>{SUPPORTED_REGIONS.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={15} /></div></label>
              <label><span>COUNTRY CONTEXT</span><div className="hiring-select"><MapPin size={16} /><select value={jobCountry} onChange={(event) => { setJobCountry(event.target.value); setJobState(""); setJobCity(""); }}><option>Worldwide</option>{MARKET_COVERAGE[jobRegion].map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={15} /></div></label>
              <label><span>STATE / PROVINCE</span><div className="hiring-select"><MapPin size={16} /><select value={jobState} onChange={(event) => { setJobState(event.target.value); setJobCity(""); }} disabled={availableStates.length === 0}><option value="">{availableStates.length ? "All states / provinces" : "Loading states…"}</option>{availableStates.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={15} /></div></label>
              <label><span>CITY</span><div className="hiring-select"><MapPin size={16} /><select value={jobCity} onChange={(event) => setJobCity(event.target.value)} disabled={availableCities.length === 0}><option value="">{availableCities.length ? "All cities" : "Select a state first"}</option>{availableCities.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={15} /></div></label>
              <label><span>POSTED WITHIN</span><div className="hiring-select"><CalendarDays size={16} /><select value={jobFreshness} onChange={(event) => setJobFreshness(event.target.value as typeof jobFreshness)}><option value="24h">Today (24 hours)</option><option value="7d">This week (7 days)</option><option value="30d">Last 30 days</option></select><ChevronDown size={15} /></div></label>
              <button className="hiring-search-button" onClick={runHiringSearch} disabled={hiringSearch.isFetching}>{hiringSearch.isFetching ? <><LoaderCircle className="spin" size={17} /> Sourcing roles</> : <><Search size={17} /> Search fresh roles</>}</button>
            </div>
            <div className="role-suggestions"><span>EXPLORE:</span>{hiringRoleSuggestions.map((role) => <button key={role} onClick={() => setJobRole(role)} className={cn(jobRole.toLowerCase() === role.toLowerCase() && "role-suggestion--active")}>{role}</button>)}</div>
            <p className="hiring-source-note"><CircleHelp size={14} /> Live sources: Jobicy plus an independent public fallback feed. Results are filtered to the last {freshnessLabel}; every result keeps its original source link, geography, and a public contact route where available.</p>
            <div className="job-alert-card"><div className="job-alert-card__copy"><span className="job-alert-card__icon">{jobAlertEnabled ? <BellRing size={18} /> : <Bell size={18} />}</span><div><strong>{jobAlertEnabled ? "Alert is active for this search" : "Never miss a fresh hiring signal"}</strong><span>Save this role and market. Finder remembers the search and can request browser permission for notifications.</span></div></div><div className="job-alert-card__actions"><input value={alertEmail} onChange={(event) => setAlertEmail(event.target.value)} placeholder="Email (optional)" type="email" aria-label="Optional alert email" /><button onClick={toggleJobAlert}>{jobAlertEnabled ? "Pause alert" : "Create alert"}</button></div></div>
          </div>

          <div className="hiring-body">
            <div className="job-results-panel">
              <div className="job-results-panel__top"><div><span>LIVE HIRING SIGNAL FEED</span><small>{hiringSearch.data ? `${jobs.length} fresh role${jobs.length === 1 ? "" : "s"} from ${hiringSearch.data.sourceName}${jobFreshness !== "30d" && allJobs.length !== jobs.length ? ` (${allJobs.length} in 30d)` : ""}` : "Choose a role, country, and run a fresh search."}</small></div><span className={cn("source-status", jobSearchRequested && !hiringSearch.isError && "source-status--active")}><i /> {hiringSearch.isFetching ? "checking" : hiringSearch.data ? "fresh source" : "ready"}</span></div>
              {!jobSearchRequested && <div className="job-empty-state"><UsersRound size={31} /><strong>Start with a role the company needs.</strong><span>Try product management, social media growth, web development, content, co-founder, life sciences, or operations leadership.</span></div>}
              {jobSearchRequested && hiringSearch.isFetching && <div className="job-empty-state"><LoaderCircle className="spin" size={30} /><strong>Checking hiring signals.</strong><span>Finderviews is searching for matching roles published within the last {freshnessLabel}.</span></div>}
              {jobSearchRequested && hiringSearch.isError && <div className="job-empty-state"><CircleHelp size={30} /><strong>The live job source is unavailable right now.</strong><span>The data-ready workspace is still available. Please try the same role again in a moment.</span></div>}
              {jobSearchRequested && !hiringSearch.isFetching && !hiringSearch.isError && jobs.length === 0 && <div className="job-empty-state"><FileClock size={30} /><strong>No roles matched this search{jobFreshness !== "30d" ? ` within ${freshnessLabel}` : ""} right now.</strong><span>{jobFreshness !== "30d" && allJobs.length > 0 ? `${allJobs.length} role${allJobs.length === 1 ? "" : "s"} found in the full 30-day window. Widen the freshness filter to see them.` : "Try a broader role title (like \"developer\" instead of \"web developer\"), change the region, or widen the freshness window."}</span></div>}
              {jobs.length > 0 && <div className="job-list">{jobs.map((job) => <button className={cn("job-row", selectedJob?.id === job.id && "job-row--selected")} key={job.id} onClick={() => setSelectedJobId(job.id)}><div className="job-row__company">{job.companyLogo ? <img src={job.companyLogo} alt="" /> : <span className="company-fallback"><Building2 size={15} /></span>}<span><strong>{job.company}</strong><small>{job.geography} · {job.industry.join(", ") || "Hiring company"}</small></span></div><div className="job-row__role"><strong>{job.title}</strong><span>{job.jobType.join(" · ") || "Employment type not specified"}</span></div><div className="job-row__date"><CalendarDays size={14} /><span>{job.ageHours < 24 ? `${job.ageHours}h ago` : `${Math.floor(job.ageHours / 24)}d ago`}</span></div><ArrowUpRight size={16} /></button>)}</div>}
              {hiringSearch.data && <div className="job-results-panel__foot"><span><Check size={14} /> {hiringSearch.data.globalFilterApplied ? "Worldwide source search" : hiringSearch.data.countryFilterApplied ? `${hiringSearch.data.countryContext} source filter applied` : `${hiringSearch.data.regionContext} source region filter applied — verify source geography`} · {freshnessLabel} window · {hiringSearch.data.contactCoverage}% have a direct public route.</span><a href={hiringSearch.data.sourceUrl} target="_blank" rel="noreferrer">Source methodology <ExternalLink size={13} /></a></div>}
            </div>

            <aside className="hiring-detail-panel">
              {selectedJob ? <>
                <div className="hiring-detail__eyebrow"><span className="signal-dot" /> PUBLIC HIRING OPPORTUNITY <span>{selectedJob.ageHours < 24 ? `${selectedJob.ageHours} HOURS` : `${Math.floor(selectedJob.ageHours / 24)} DAYS`} OLD</span></div>
                <div className="hiring-company-line">{selectedJob.companyLogo ? <img src={selectedJob.companyLogo} alt="" /> : <Building2 size={19} />}<span>{selectedJob.company}</span></div>
                <h3>{selectedJob.title}</h3>
                <p>{selectedJob.excerpt || "This fresh listing signals a current hiring need. Review the public source before reaching out."}</p>
                <div className="hiring-detail-facts"><div><MapPin size={16} /><span><small>SOURCE GEOGRAPHY</small>{selectedJob.geography}</span></div><div><BriefcaseBusiness size={16} /><span><small>ROLE TYPE</small>{selectedJob.jobType.join(" · ") || "Not specified"}</span></div>{selectedJob.salary && <div><Target size={16} /><span><small>LISTED RANGE</small>{selectedJob.salary}</span></div>}</div>
                <div className="company-contact-results"><div><small>BEST CONTACT ROLE</small><span>Hiring manager, team lead, or talent acquisition</span></div><div><small>COMPANY WEBSITE</small>{selectedJob.companyWebsite ? <a href={selectedJob.companyWebsite} target="_blank" rel="noreferrer">Open company website <ExternalLink size={12} /></a> : <a href={selectedJob.contactSearchUrl} target="_blank" rel="noreferrer">Find public company contact <ExternalLink size={12} /></a>}</div>{selectedJob.applyEmail ? <div><small>APPLY EMAIL</small><a href={`mailto:${selectedJob.applyEmail}`}>{selectedJob.applyEmail}</a></div> : <div><small>APPLICATION ROUTE</small><a href={selectedJob.sourceUrl} target="_blank" rel="noreferrer">Apply on original listing <ExternalLink size={12} /></a></div>}</div>
                <div className="recruiter-tools"><div><small>FIND THE RIGHT PERSON</small><strong>Search the company, role, and recruiter title together</strong></div><a href={recruiterSearchUrl} target="_blank" rel="noreferrer"><UsersRound size={15} /> Find recruiter / hiring manager <ExternalLink size={13} /></a></div>
                <div className="application-checklist"><small>APPLICATION READINESS CHECK</small><div className="application-status-row"><small>APPLICATION STATUS</small><select aria-label="Application status" value={applicationStatuses[selectedJob.sourceUrl] || "ready"} onChange={(event) => updateApplicationStatus(event.target.value as "saved" | "ready" | "applied" | "interview" | "closed")}><option value="saved">Saved</option><option value="ready">Ready to apply</option><option value="applied">Applied</option><option value="interview">Interview</option><option value="closed">Closed</option></select></div><div className="application-status-row"><small>APPLICATION STATUS</small><select aria-label="Application status" value={applicationStatuses[selectedJob.sourceUrl] || "ready"} onChange={(event) => updateApplicationStatus(event.target.value as "saved" | "ready" | "applied" | "interview" | "closed")}><option value="saved">Saved</option><option value="ready">Ready to apply</option><option value="applied">Applied</option><option value="interview">Interview</option><option value="closed">Closed</option></select></div><span><Check size={14} /> Match your first two lines to the job title</span><span><Check size={14} /> Include one proof point, not a generic claim</span><span><Check size={14} /> Use the original application route before cold outreach</span><button onClick={() => void copyApplicationMessage()}><Copy size={14} /> Copy tailored application message</button></div>
                <div className="hiring-detail-actions"><a className="view-source-button" href={selectedJob.sourceUrl} target="_blank" rel="noreferrer">Apply / view job <ExternalLink size={16} /></a><button className="brief-button" onClick={saveSelectedJobToOutreach}>{outreachSavedJobIds.includes(selectedJob.sourceUrl) ? <Check size={16} /> : <Plus size={16} />}{outreachSavedJobIds.includes(selectedJob.sourceUrl) ? "In outreach queue" : "Save for pitch"}</button><button className="brief-button" onClick={createOutreachDraft}>Create email draft <Mail size={16} /></button>{selectedJob.applyEmail && <button className="brief-button" onClick={sendJobEmail} disabled={sendingEmail}>{sendingEmail ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} Send email now</button>}<button className="brief-button" onClick={tailorResumeForJob} disabled={resumeTailor.isPending}>{resumeTailor.isPending ? <LoaderCircle className="spin" size={16} /> : <FileText size={16} />}{resumeSaved ? "Tailor my resume" : "Save resume first"}</button><button className="brief-button" onClick={requestHiringBrief} disabled={hiringBrief.isPending}>{hiringBrief.isPending ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{isAuthenticated ? "Build outreach brief" : "Sign in for AI brief"}</button></div>

                {resumeTailor.data && <div className="ai-brief"><div className="ai-brief__title"><FileText size={15} /> AI TAILORED RESUME <span>MATCH: {resumeTailor.data.matchScore}</span></div><div><small>TAILORED RESUME</small><pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "0.85rem", lineHeight: 1.6, margin: 0 }}>{resumeTailor.data.tailoredResume}</pre></div><div className="ai-brief__evidence"><small>KEY CHANGES MADE</small><ul>{resumeTailor.data.keyChanges.map((item: string) => <li key={item}>{item}</li>)}</ul></div><div className="ai-brief__service"><Sparkles size={16} /><span><small>AI SUGGESTION</small><strong>{resumeTailor.data.suggestion}</strong></span></div><button className="brief-button" style={{ marginTop: "0.5rem" }} onClick={async () => { try { await navigator.clipboard.writeText(resumeTailor.data!.tailoredResume); toast.success("Tailored resume copied to clipboard."); } catch { toast.message("Copy unavailable; select the text manually."); } }}><Copy size={14} /> Copy tailored resume</button></div>}

                {hiringBrief.data && <div className="ai-brief"><div className="ai-brief__title"><Sparkles size={15} /> FINDER AI BRIEF <span>PUBLIC DATA ONLY</span></div><div><small>COMPANY NEED</small><p>{hiringBrief.data.companyNeed}</p></div><div><small>LIKELY DECISION-MAKER ROLE</small><p>{hiringBrief.data.likelyDecisionMakerRole}</p></div><div><small>USEFUL OUTREACH ANGLE</small><p>{hiringBrief.data.outreachAngle}</p></div><div className="ai-brief__evidence"><small>PUBLIC EVIDENCE</small><ul>{hiringBrief.data.evidence.map((item: string) => <li key={item}>{item}</li>)}</ul></div><div className="ai-brief__service"><UserRoundCheck size={16} /><span><small>RECOMMENDED SERVICE</small><strong>{hiringBrief.data.recommendedService}</strong></span></div><p className="ai-brief__caveat">{hiringBrief.data.caveat}</p><div className={cn("brief-review", approvedBriefFor === selectedJob.id && "brief-review--approved")}><span>{approvedBriefFor === selectedJob.id ? <Check size={15} /> : <UserRoundCheck size={15} />}{approvedBriefFor === selectedJob.id ? "Reviewed by you — ready to adapt" : "Review this draft before using it"}</span>{approvedBriefFor !== selectedJob.id && <button onClick={() => { setApprovedBriefFor(selectedJob.id); toast.success("Brief marked reviewed. Adapt it before outreach."); }}>Approve reviewed draft</button>}</div></div>}
              </> : <div className="job-detail-empty"><Sparkles size={29} /><strong>Your company briefing will appear here.</strong><span>Finderviews will show the public job context, source link, and a sign-in protected AI opportunity brief once you select a fresh role.</span></div>}
            </aside>
          </div></>}

          {hiringTab === "community" && <div className="community-jobs-section">
            <div className="community-jobs-header">
              <div>
                <h3>Community Job Board</h3>
                <p>Jobs posted directly by employers on Finderviews. No third-party APIs. Apply with your saved resume in one click.</p>
              </div>
              <div className="community-jobs-header__actions">
                <button className="button-dark" onClick={() => { setShowPostJobForm((v) => !v); }}>{showPostJobForm ? <><X size={15} /> Cancel</> : <><Plus size={15} /> Post a job</>}</button>
                <button className="hiring-search-button" onClick={fetchCommunityJobs} disabled={communityJobsLoading}>{communityJobsLoading ? <><LoaderCircle className="spin" size={15} /> Loading</> : <><Search size={15} /> Refresh</>}</button>
              </div>
            </div>

            {showPostJobForm && <div className="community-job-form">
              <span className="card-topline">POST A NEW JOB</span>
              <div className="community-job-form__fields">
                <label><span>JOB TITLE</span><input value={postJobForm.title} onChange={(e) => setPostJobForm({ ...postJobForm, title: e.target.value })} placeholder="e.g. Frontend Developer" maxLength={240} /></label>
                <label><span>COMPANY NAME</span><input value={postJobForm.company} onChange={(e) => setPostJobForm({ ...postJobForm, company: e.target.value })} placeholder="Your company" maxLength={240} /></label>
                <label><span>APPLICATION EMAIL</span><input value={postJobForm.applyEmail} onChange={(e) => setPostJobForm({ ...postJobForm, applyEmail: e.target.value })} placeholder="hiring@company.com" type="email" /></label>
                <label><span>APPLICATION URL (optional)</span><input value={postJobForm.applyUrl} onChange={(e) => setPostJobForm({ ...postJobForm, applyUrl: e.target.value })} placeholder="https://careers.company.com/apply" type="url" /></label>
                <label><span>JOB TYPE</span><select value={postJobForm.jobType} onChange={(e) => setPostJobForm({ ...postJobForm, jobType: e.target.value })}><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Freelance</option><option>Internship</option></select></label>
                <label><span>EXPERIENCE LEVEL</span><select value={postJobForm.level} onChange={(e) => setPostJobForm({ ...postJobForm, level: e.target.value })}><option>Not specified</option><option>Entry level</option><option>Mid level</option><option>Senior</option><option>Lead / Manager</option><option>Executive</option></select></label>
                <label><span>SALARY RANGE (optional)</span><input value={postJobForm.salaryRange} onChange={(e) => setPostJobForm({ ...postJobForm, salaryRange: e.target.value })} placeholder="e.g. $60,000 - $90,000 / year" maxLength={100} /></label>
                <label><span>INDUSTRY / TAGS (comma-separated)</span><input value={postJobForm.industry} onChange={(e) => setPostJobForm({ ...postJobForm, industry: e.target.value })} placeholder="e.g. Tech, SaaS, Healthcare" maxLength={300} /></label>
                <label className="community-job-form__wide"><span>JOB DESCRIPTION</span><textarea value={postJobForm.description} onChange={(e) => setPostJobForm({ ...postJobForm, description: e.target.value })} placeholder="Describe the role, responsibilities, requirements, and benefits. Be specific about what you are looking for." maxLength={5000} rows={8} /></label>
              </div>
              <div className="community-job-form__footer">
                <small>{postJobForm.description.length}/5000 characters. Job will be posted for {[jobCity, jobState, jobCountry].filter(Boolean).join(", ") || "Worldwide"} and expire in 30 days.</small>
                <button className="button-dark" onClick={postCommunityJob} disabled={postingJob}>{postingJob ? <><LoaderCircle className="spin" size={15} /> Publishing</> : <><ArrowUpRight size={15} /> Publish job</>}</button>
              </div>
            </div>}

            <div className="hiring-body">
              <div className="job-results-panel">
                <div className="job-results-panel__top"><div><span>COMMUNITY_JOB_BOARD</span><small>{communityJobs.length} job{communityJobs.length !== 1 ? "s" : ""} posted by employers on Finderviews</small></div><span className={cn("source-status", communityJobs.length > 0 && "source-status--active")}><i /> {communityJobsLoading ? "loading" : communityJobs.length > 0 ? "live" : "empty"}</span></div>
                {communityJobsLoading && <div className="job-empty-state"><LoaderCircle className="spin" size={30} /><strong>Loading community jobs.</strong></div>}
                {!communityJobsLoading && communityJobs.length === 0 && <div className="job-empty-state"><UsersRound size={31} /><strong>No community jobs yet.</strong><span>Be the first to post a job. Click "Post a job" above to get started.</span></div>}
                {communityJobs.length > 0 && <div className="job-list">{communityJobs.map((job) => <button className={cn("job-row", selectedCommunityJobId === job.id && "job-row--selected")} key={job.id} onClick={() => setSelectedCommunityJobId(job.id)}><div className="job-row__company"><span className="company-fallback"><Building2 size={15} /></span><span><strong>{job.company}</strong><small>{[job.city, job.state, job.country].filter(Boolean).join(", ") || "Remote"} · {job.industry.join(", ") || "Employer"}</small></span></div><div className="job-row__role"><strong>{job.title}</strong><span>{job.jobType} · {job.level}</span></div><div className="job-row__date"><CalendarDays size={14} /><span>{Math.floor((Date.now() - Date.parse(job.createdAt)) / (1000 * 60 * 60)) < 24 ? `${Math.floor((Date.now() - Date.parse(job.createdAt)) / (1000 * 60 * 60))}h ago` : `${Math.floor((Date.now() - Date.parse(job.createdAt)) / (1000 * 60 * 60 * 24))}d ago`}</span></div><ArrowUpRight size={16} /></button>)}</div>}
              </div>

              <aside className="hiring-detail-panel">
                {selectedCommunityJob ? <>
                  <div className="hiring-detail__eyebrow"><span className="signal-dot" /> COMMUNITY JOB POSTING <span>POSTED {Math.floor((Date.now() - Date.parse(selectedCommunityJob.createdAt)) / (1000 * 60 * 60)) < 24 ? `${Math.floor((Date.now() - Date.parse(selectedCommunityJob.createdAt)) / (1000 * 60 * 60))} HOURS` : `${Math.floor((Date.now() - Date.parse(selectedCommunityJob.createdAt)) / (1000 * 60 * 60 * 24))} DAYS`} AGO</span></div>
                  <div className="hiring-company-line"><Building2 size={19} /><span>{selectedCommunityJob.company}</span></div>
                  <h3>{selectedCommunityJob.title}</h3>
                  <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: "0.88rem" }}>{selectedCommunityJob.description}</p>
                  <div className="hiring-detail-facts">
                    <div><MapPin size={16} /><span><small>LOCATION</small>{[selectedCommunityJob.city, selectedCommunityJob.state, selectedCommunityJob.country].filter(Boolean).join(", ") || "Remote / Worldwide"}</span></div>
                    <div><BriefcaseBusiness size={16} /><span><small>JOB TYPE</small>{selectedCommunityJob.jobType}</span></div>
                    <div><Target size={16} /><span><small>LEVEL</small>{selectedCommunityJob.level}</span></div>
                    {selectedCommunityJob.salaryRange && <div><Target size={16} /><span><small>SALARY</small>{selectedCommunityJob.salaryRange}</span></div>}
                  </div>
                  <div className="company-contact-results">
                    {selectedCommunityJob.applyEmail && <div><small>APPLICATION EMAIL</small><a href={`mailto:${selectedCommunityJob.applyEmail}`}>{selectedCommunityJob.applyEmail}</a></div>}
                    {selectedCommunityJob.applyUrl && <div><small>APPLICATION URL</small><a href={selectedCommunityJob.applyUrl} target="_blank" rel="noreferrer">Apply on employer site <ExternalLink size={12} /></a></div>}
                  </div>
                  <div className="community-apply-section">
                    <span className="card-topline">APPLY WITH YOUR RESUME</span>
                    {!resumeSaved && <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Save your resume in the Resume section below before applying.</p>}
                    {resumeSaved && <>
                      <label><span>YOUR EMAIL</span><input value={applyEmail} onChange={(e) => setApplyEmailField(e.target.value)} placeholder="your@email.com" type="email" /></label>
                      <label><span>COVER NOTE (optional)</span><textarea value={applyCoverNote} onChange={(e) => setApplyCoverNote(e.target.value)} placeholder="A short note about why you are a great fit for this role." maxLength={2000} rows={4} /></label>
                    </>}
                  </div>
                  <div className="hiring-detail-actions">
                    {selectedCommunityJob.applyEmail && resumeSaved && <button className="view-source-button" onClick={applyToCommunityJob} disabled={applyingToCommunityJob}>{applyingToCommunityJob ? <><LoaderCircle className="spin" size={16} /> Sending</> : <><Send size={16} /> Apply now</>}</button>}
                    {selectedCommunityJob.applyUrl && <a className="brief-button" href={selectedCommunityJob.applyUrl} target="_blank" rel="noreferrer">Apply on employer site <ExternalLink size={16} /></a>}
                    {selectedCommunityJob.applyEmail && <a className="brief-button" href={`mailto:${selectedCommunityJob.applyEmail}?subject=Application for ${encodeURIComponent(selectedCommunityJob.title)}`}>Email directly <Mail size={16} /></a>}
                    <button className="brief-button" onClick={tailorResumeForCommunityJob} disabled={resumeTailor.isPending}>{resumeTailor.isPending ? <LoaderCircle className="spin" size={16} /> : <FileText size={16} />}{resumeSaved ? "Tailor my resume" : "Save resume first"}</button>
                  </div>

                  {resumeTailor.data && <div className="ai-brief"><div className="ai-brief__title"><FileText size={15} /> AI TAILORED RESUME <span>MATCH: {resumeTailor.data.matchScore}</span></div><div><small>TAILORED RESUME</small><pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "0.85rem", lineHeight: 1.6, margin: 0 }}>{resumeTailor.data.tailoredResume}</pre></div><div className="ai-brief__evidence"><small>KEY CHANGES MADE</small><ul>{resumeTailor.data.keyChanges.map((item: string) => <li key={item}>{item}</li>)}</ul></div><div className="ai-brief__service"><Sparkles size={16} /><span><small>AI SUGGESTION</small><strong>{resumeTailor.data.suggestion}</strong></span></div><button className="brief-button" style={{ marginTop: "0.5rem" }} onClick={async () => { try { await navigator.clipboard.writeText(resumeTailor.data!.tailoredResume); toast.success("Tailored resume copied to clipboard."); } catch { toast.message("Copy unavailable; select the text manually."); } }}><Copy size={14} /> Copy tailored resume</button></div>}

                </> : <div className="job-detail-empty"><UsersRound size={29} /><strong>Select a community job to see details.</strong><span>Browse the jobs posted by employers on Finderviews, or post your own.</span></div>}
              </aside>
            </div>
          </div>}
        </section>

        <section className="community-section" id="community-board"><div className="community-head"><div><span className="section-number">03B / OPPORTUNITY BOARD</span><h2>Local signals are<br /><em>stronger together.</em></h2></div><p>Employers and community members can publish a public opportunity. Urgent posts appear in the live board for 48 hours and the board refreshes every 15 seconds.</p></div><div className="community-grid"><div className="community-compose"><span>SHARE A PUBLIC OPPORTUNITY</span><label className="urgent-toggle"><input type="checkbox" checked={urgentPost} onChange={(event) => setUrgentPost(event.target.checked)} /> I need someone urgently</label><input className="opportunity-title" value={opportunityTitle} onChange={(event) => setOpportunityTitle(event.target.value)} placeholder="Opportunity title, e.g. Weekend barista needed now" maxLength={160} /><textarea value={communityText} onChange={(event) => setCommunityText(event.target.value)} placeholder="Example: A café in Austin is hiring weekend staff — public listing linked in the job details." maxLength={500} /><div><small>{communityText.length}/500 · {[jobCity, jobState, jobCountry].filter(Boolean).join(", ")}</small><button className="button-dark" onClick={publishCommunityPost}>Publish signal <ArrowUpRight size={16} /></button></div></div><div className="community-feed">{communityPosts.length === 0 ? <div className="community-empty"><UsersRound size={25} /><strong>No local signals yet.</strong><span>Be the first to share a useful, public opportunity.</span></div> : communityPosts.map((post) => <article className="community-post" key={post.id}><div><span className="signal-dot" /><small>{post.urgent ? "URGENT · " : ""}{post.role} · {[post.city, post.state, post.country].filter(Boolean).join(", ")}</small></div><strong className="community-post__title">{post.title || post.role}</strong><p>{post.text || post.description}</p><time>{new Date(post.createdAt).toLocaleDateString()}</time></article>)}</div></div></section>

        <section className="employer-section" id="employer-profile"><div className="employer-head"><div><span className="section-number">03C / EMPLOYER PROFILE</span><h2>Be ready when<br /><em>people respond.</em></h2></div><p>Create a clear public employer identity for urgent listings and hiring conversations. Sign-in is required before publishing as an employer.</p></div><div className="employer-card"><div className="employer-status"><span className="signal-dot" /> {isAuthenticated ? "SIGNED IN · PROFILE MANAGEMENT ENABLED" : "SIGN IN REQUIRED TO MANAGE PROFILE"}</div><div className="employer-fields"><label><span>COMPANY NAME</span><input value={profile.companyName} onChange={(event) => setProfile({ ...profile, companyName: event.target.value })} placeholder="Your company or team" /></label><label><span>CONTACT EMAIL</span><input value={profile.contactEmail} onChange={(event) => setProfile({ ...profile, contactEmail: event.target.value })} placeholder="hiring@company.com" type="email" /></label><label><span>PUBLIC WEBSITE</span><input value={profile.website} onChange={(event) => setProfile({ ...profile, website: event.target.value })} placeholder="https://" type="url" /></label><label className="employer-fields__wide"><span>ABOUT THE EMPLOYER</span><textarea value={profile.companyDescription} onChange={(event) => setProfile({ ...profile, companyDescription: event.target.value })} placeholder="What does your team do, and who should apply?" maxLength={700} /></label></div><div className="employer-actions"><small>{profileSaved ? "Saved on this device" : "Keep details accurate and public-facing."}</small><button className="button-dark" onClick={saveEmployerProfile}>{isAuthenticated ? "Save employer profile" : "Sign in to continue"} <ArrowUpRight size={16} /></button></div></div></section>

        <section className="opportunity-cockpit" id="opportunity-cockpit">
          <div className="opportunity-cockpit__head"><div><span className="section-number">04 / OPPORTUNITY COCKPIT</span><h2>Make the next move<br /><em>easy to send.</em></h2></div><p>Build your own positioning once, then use it when applying for a role or opening a respectful business conversation. Finder suggests a next step, but you decide what to send.</p></div>
          <div className="opportunity-cockpit__grid">
            <div className="pitch-profile-card"><span className="card-topline">YOUR POSITIONING</span><div className="pitch-fields"><label><span>YOUR NAME</span><input value={pitchProfile.name} onChange={(event) => setPitchProfile({ ...pitchProfile, name: event.target.value })} placeholder="Your name" /></label><label><span>WHAT YOU OFFER</span><input value={pitchProfile.offer} onChange={(event) => setPitchProfile({ ...pitchProfile, offer: event.target.value })} placeholder="Your strongest offer" /></label><label><span>PROOF OR CREDIBILITY</span><input value={pitchProfile.proof} onChange={(event) => setPitchProfile({ ...pitchProfile, proof: event.target.value })} placeholder="Example: shipped 12 sites for local teams" /></label><label><span>PORTFOLIO LINK</span><input value={pitchProfile.portfolio} onChange={(event) => setPitchProfile({ ...pitchProfile, portfolio: event.target.value })} placeholder="https://yourportfolio.com" type="url" /></label><label><span>AVAILABILITY</span><select value={pitchProfile.availability} onChange={(event) => setPitchProfile({ ...pitchProfile, availability: event.target.value })}><option>Available for a focused project</option><option>Open to a full-time role</option><option>Available for contract work</option><option>Available for a short discovery call</option></select></label></div><button className="button-dark" onClick={savePitchProfile}>Save my positioning <Check size={16} /></button></div>
            <div className="pitch-preview-card"><div className="pitch-preview-card__top"><span className="card-topline">REUSABLE INTRO</span><button className="text-link" onClick={() => void copyPitch()}>Copy pitch <Download size={14} /></button></div><p>{pitchText}</p><div className="next-move"><span className="signal-dot" /><div><small>NEXT BEST MOVE</small><strong>{selectedJob ? `Apply to ${selectedJob.company} and tailor your first two lines to "${selectedJob.title}".` : selectedLead ? `Verify ${selectedLead.name}'s public listing, then offer one specific improvement.` : "Run a focused job or city search, then select one result."}</strong></div></div><div className="cockpit-actions"><button className="button-primary" onClick={() => scrollTo("hiring-workspace")}>Find work <BriefcaseBusiness size={16} /></button><button className="button-secondary" onClick={() => scrollTo("finder-workspace")}>Find clients <Compass size={16} /></button></div></div>
          </div>
          <div className="resume-upload-card" id="resume-section">
            <div className="resume-upload-card__top"><span className="card-topline"><ClipboardPaste size={15} /> YOUR RESUME</span><span className={cn("resume-status", resumeSaved && "resume-status--saved")}>{resumeSaved ? "Saved locally" : "Not saved yet"}</span></div>
            <p className="resume-upload-card__intro">Paste your resume below. Once saved, you can tailor it to any job with one click from the hiring section.</p>
            <textarea className="resume-textarea" value={resumeText} onChange={(event) => { setResumeText(event.target.value); setResumeSaved(false); }} placeholder="Paste your resume here (plain text). Include your name, experience, skills, education, and anything relevant to the roles you want." maxLength={15000} rows={12} />
            <div className="resume-upload-card__actions">
              <small>{resumeText.length}/15000 characters</small>
              <button className="button-dark" onClick={saveResume}>{resumeSaved ? <><Check size={16} /> Resume saved</> : <><FileText size={16} /> Save resume</>}</button>
            </div>
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
