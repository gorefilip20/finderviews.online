/**
 * Shared shape for every job source.
 *
 * Sources disagree about field names, date formats and what "remote" means, so each adapter
 * normalises into this one type. Everything downstream — freshness, role matching, dedupe,
 * ranking — works on the normalised record and never on a provider's raw payload.
 */
export type NormalisedJob = {
  /** Stable within a source. Combined with the source name to dedupe across sources. */
  externalId: string;
  title: string;
  company: string;
  companyLogo?: string;
  location: string;
  remote: boolean;
  excerpt: string;
  description: string;
  /** ISO string. A job without a usable published date is discarded, never guessed. */
  postedAt: string;
  url: string;
  tags: string[];
  jobType: string[];
  salary?: string;
  sourceName: string;
  sourceUrl: string;
  /** Attribution the provider's terms require us to show. */
  attribution?: string;
};

export type SourceOutcome = {
  source: string;
  ok: boolean;
  /** Rows the provider returned before any Finder filtering. */
  fetched: number;
  /** Rows that survived parsing into a usable record. */
  usable: number;
  ms: number;
  error?: string;
  /** What geographic precision the provider actually applied. */
  scope?: string;
};

export type SourceQuery = {
  role: string;
  country: string;
  region: string;
  /** Free-text place, when the caller has one. */
  location?: string;
  limit: number;
  remoteOnly: boolean;
};
