import FinderLogo from "@/components/FinderLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Building2, CheckCircle2, ChevronLeft, Clock3, ExternalLink, FilePlus2, MapPin, Search, Send, SlidersHorizontal } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { toast } from "sonner";

const JOB_TYPES = ["Remote", "Full-time", "Part-time", "Contract", "Hybrid"] as const;
const CATEGORIES = ["Engineering", "Design", "Marketing", "Product", "Operations", "Sales"];

type Job = {
  id: number; title: string; companyName: string; location: string; jobType: typeof JOB_TYPES[number]; category: string;
  salaryRange?: string | null; description: string; requirements: string; applicationContact: string; createdAt: string; isActive: boolean;
};

type JobResponse = { jobs: Job[]; total: number; page: number; pageSize: number; totalPages: number };

const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Something went wrong.");
  return body as T;
};

function JobsHeader() {
  return <header className="jobs-nav"><Link href="/" className="jobs-brand"><FinderLogo /><span className="jobs-brand__context">/ JOBS</span></Link><nav><Link href="/jobs">Browse jobs</Link><Link href="/jobs/new" className="jobs-nav__post"><FilePlus2 size={15} /> Post a job</Link></nav></header>;
}

function JobMeta({ job }: { job: Job }) {
  return <div className="job-meta"><span><MapPin size={14} /> {job.location}</span><span><BriefcaseBusiness size={14} /> {job.jobType}</span><span className="job-category">{job.category}</span></div>;
}

function JobCard({ job }: { job: Job }) {
  return <Link href={`/jobs/${job.id}`} className="job-card"><div className="job-card__top"><span className="job-card__category">{job.category}</span><span className="job-card__age">{new Date(job.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div><h2>{job.title}</h2><div className="job-card__company"><span className="job-company-mark"><Building2 size={16} /></span><strong>{job.companyName}</strong></div><JobMeta job={job} />{job.salaryRange && <p className="job-card__salary">{job.salaryRange}</p>}<span className="job-card__link">View role <ArrowRight size={15} /></span></Link>;
}

export function JobsPage() {
  const [filters, setFilters] = useState({ search: "", location: "", jobType: "", category: "" });
  const [result, setResult] = useState<JobResponse>({ jobs: [], total: 0, page: 1, pageSize: 9, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true); setError("");
      const params = new URLSearchParams({ page: String(page), pageSize: "9" });
      Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
      api<JobResponse>(`/api/jobs?${params}`, { signal: controller.signal }).then(setResult).catch((err) => { if (err.name !== "AbortError") setError(err.message); }).finally(() => setLoading(false));
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [filters, page]);

  const updateFilter = (key: keyof typeof filters, value: string) => { setPage(1); setFilters((current) => ({ ...current, [key]: value })); };

  return <div className="jobs-shell"><JobsHeader /><main className="jobs-main"><section className="jobs-hero"><div><p className="jobs-eyebrow"><span className="signal-dot" /> FIND YOUR NEXT MOVE</p><h1>Work worth<br /><em>looking for.</em></h1><p className="jobs-hero__lede">A focused board for roles posted directly to Finderviews. Search the opportunities that match your pace, place, and ambition.</p></div><div className="jobs-hero__index"><span>01</span><div /><span>FIRST-PARTY JOB BOARD</span></div></section>
    <section className="jobs-workspace"><div className="jobs-toolbar"><label className="jobs-search"><Search size={18} /><input value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Search title or company" aria-label="Search jobs" /></label><label className="jobs-search jobs-search--location"><MapPin size={18} /><input value={filters.location} onChange={(event) => updateFilter("location", event.target.value)} placeholder="Location" aria-label="Filter by location" /></label><select value={filters.jobType} onChange={(event) => updateFilter("jobType", event.target.value)} aria-label="Filter by job type"><option value="">All job types</option>{JOB_TYPES.map((type) => <option key={type}>{type}</option>)}</select><select value={filters.category} onChange={(event) => updateFilter("category", event.target.value)} aria-label="Filter by category"><option value="">All categories</option>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></div><div className="jobs-results-head"><div><p className="jobs-kicker"><SlidersHorizontal size={14} /> FILTERED RECORDS</p><h2>{loading ? "Finding roles…" : `${result.total} open ${result.total === 1 ? "role" : "roles"}`}</h2></div><Link href="/jobs/new" className="jobs-inline-link"><FilePlus2 size={16} /> Post your role</Link></div>{error && <div className="jobs-state jobs-state--error"><strong>{error}</strong><span>Try again in a moment.</span></div>}{!error && loading && <div className="jobs-grid">{[1, 2, 3].map((item) => <div className="job-card job-card--skeleton" key={item} />)}</div>}{!error && !loading && result.jobs.length === 0 && <div className="jobs-state"><Search size={28} /><strong>No roles match those filters.</strong><span>Try a broader title, location, or category.</span></div>}{!error && !loading && result.jobs.length > 0 && <div className="jobs-grid">{result.jobs.map((job) => <JobCard key={job.id} job={job} />)}</div>}{result.totalPages > 1 && <div className="jobs-pagination"><button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} /> Previous</button><span>Page {page} of {result.totalPages}</span><button disabled={page >= result.totalPages} onClick={() => setPage((current) => current + 1)}>Next <ArrowRight size={16} /></button></div>}</section></main></div>;
}

export function JobDetailsPage() {
  const [, params] = useRoute("/jobs/:id");
  const [, setLocation] = useLocation();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (!params?.id) return; api<{ job: Job }>(`/api/jobs/${params.id}`).then((payload) => setJob(payload.job)).catch(() => setJob(null)).finally(() => setLoading(false)); }, [params?.id]);
  const isUrl = job ? /^(https?:\/\/|mailto:)/i.test(job.applicationContact) : false;
  const applyHref = job ? (isUrl ? job.applicationContact : `mailto:${job.applicationContact}`) : "#";
  if (loading) return <div className="jobs-shell"><JobsHeader /><div className="jobs-state jobs-state--page"><Clock3 className="spin" size={28} /><strong>Loading role details…</strong></div></div>;
  if (!job) return <div className="jobs-shell"><JobsHeader /><div className="jobs-state jobs-state--page"><strong>That role is no longer available.</strong><Link href="/jobs" className="jobs-inline-link">Back to jobs <ArrowRight size={15} /></Link></div></div>;
  return <div className="jobs-shell"><JobsHeader /><main className="job-detail"><Link href="/jobs" className="jobs-back"><ArrowLeft size={15} /> Back to all jobs</Link><div className="job-detail__grid"><article><p className="jobs-eyebrow"><span className="signal-dot" /> {job.category.toUpperCase()} / OPEN ROLE</p><h1>{job.title}</h1><div className="job-detail__company"><span className="job-company-mark job-company-mark--large"><Building2 size={21} /></span><strong>{job.companyName}</strong></div><JobMeta job={job} />{job.salaryRange && <p className="job-detail__salary">{job.salaryRange}</p>}<div className="job-copy"><h2>About the role</h2>{job.description.split(/\n+/).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}<h2>What you’ll bring</h2><ul>{job.requirements.split(/\n+/).filter(Boolean).map((requirement) => <li key={requirement}><CheckCircle2 size={17} /> <span>{requirement}</span></li>)}</ul></div></article><aside className="job-apply-card"><p className="jobs-kicker">READY WHEN YOU ARE</p><h2>Make the next move.</h2><p>Apply directly to {job.companyName}. Your application route is provided by the person who posted this role.</p><a href={applyHref} target={isUrl ? "_blank" : undefined} rel={isUrl ? "noreferrer" : undefined} className="jobs-apply-button">Apply now <ExternalLink size={16} /></a><div className="job-apply-card__contact"><span>APPLICATION CONTACT</span><strong>{job.applicationContact}</strong></div><small>Posted {new Date(job.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</small></aside></div></main></div>;
}

const emptyForm = { title: "", companyName: "", location: "", jobType: "Remote", category: "Engineering", salaryRange: "", description: "", requirements: "", applicationContact: "" };

export function NewJobPage() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const setField = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => { event.preventDefault(); setErrors([]); setSubmitting(true); try { const payload = await api<{ job: Job }>("/api/jobs", { method: "POST", body: JSON.stringify(form) }); toast.success("Your role is now live on Finderviews."); setLocation(`/jobs/${payload.job.id}`); } catch (error) { setErrors([error instanceof Error ? error.message : "Please check the form and try again."]); } finally { setSubmitting(false); } };
  return <div className="jobs-shell"><JobsHeader /><main className="new-job"><Link href="/jobs" className="jobs-back"><ArrowLeft size={15} /> Back to jobs</Link><div className="new-job__intro"><p className="jobs-eyebrow"><span className="signal-dot" /> POST A ROLE</p><h1>Put a good role<br /><em>in the world.</em></h1><p>Share the context people need to decide if this is their next move. All fields marked with * are required.</p></div><form className="new-job__form" onSubmit={submit}><div className="form-section"><p className="jobs-kicker">01 / THE ROLE</p><div className="form-grid"><label className="form-field form-field--wide"><span>Job title *</span><Input required value={form.title} onChange={(event) => setField("title", event.target.value)} placeholder="e.g. Senior Frontend Engineer" /></label><label className="form-field"><span>Company name *</span><Input required value={form.companyName} onChange={(event) => setField("companyName", event.target.value)} placeholder="Your company" /></label><label className="form-field"><span>Location *</span><Input required value={form.location} onChange={(event) => setField("location", event.target.value)} placeholder="Remote — Europe, London, etc." /></label><label className="form-field"><span>Job type *</span><select required value={form.jobType} onChange={(event) => setField("jobType", event.target.value)}>{JOB_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label><label className="form-field"><span>Category *</span><select required value={form.category} onChange={(event) => setField("category", event.target.value)}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label><label className="form-field"><span>Salary range <small>optional</small></span><Input value={form.salaryRange} onChange={(event) => setField("salaryRange", event.target.value)} placeholder="$90k – $120k" /></label></div></div><div className="form-section"><p className="jobs-kicker">02 / THE STORY</p><div className="form-grid"><label className="form-field form-field--wide"><span>About the role *</span><Textarea required minLength={20} value={form.description} onChange={(event) => setField("description", event.target.value)} placeholder="What will this person own? What makes the work meaningful?" /></label><label className="form-field form-field--wide"><span>Requirements *</span><Textarea required minLength={10} value={form.requirements} onChange={(event) => setField("requirements", event.target.value)} placeholder="One requirement per line: experience, skills, and ways of working." /></label><label className="form-field form-field--wide"><span>Application email or URL *</span><Input required value={form.applicationContact} onChange={(event) => setField("applicationContact", event.target.value)} placeholder="hiring@company.com or https://..." /></label></div></div>{errors.map((error) => <p className="form-error" key={error}>{error}</p>)}<div className="new-job__actions"><span>Listings are stored and served by Finderviews.</span><Button type="submit" disabled={submitting} className="jobs-submit">{submitting ? "Publishing…" : <>Publish role <Send size={16} /></>}</Button></div></form></main></div>;
}
