/**
 * Provider adapters.
 *
 * Finder never invents records. When a source has no credential configured, the adapter
 * returns `connected: false` with the exact environment variables required, and the UI
 * renders a "connect this source" state instead of placeholder rows.
 */
import { ENV } from "../_core/env";

export type ProviderStatus = {
  provider: string;
  connected: boolean;
  requiredEnv: string[];
  docsUrl: string;
  note: string;
};

export type ProviderResult<T> = ProviderStatus & { items: T[] };

export type PlaceRecord = {
  externalId: string;
  name: string;
  category?: string;
  address?: string;
  phone?: string;
  website?: string;
  listingUrl?: string;
  rating?: number;
  reviewCount?: number;
  latitude?: number;
  longitude?: number;
  businessStatus?: string;
};

export type AdRecord = {
  pageName: string;
  adCount: number;
  firstSeen?: string;
  sampleAdUrl?: string;
};

export type RegistrationRecord = {
  name: string;
  registeredAt?: string;
  status?: string;
  address?: string;
  category?: string;
  sourceUrl?: string;
};

export type LocalJobRecord = {
  title: string;
  company: string;
  location?: string;
  postedAt?: string;
  url?: string;
};

const disconnected = <T>(status: ProviderStatus): ProviderResult<T> => ({ ...status, items: [] });

/* ------------------------------------------------- public business listings */

export const placesStatus: ProviderStatus = {
  provider: "Google Places",
  connected: Boolean(ENV.placesApiKey),
  requiredEnv: ["PLACES_API_KEY"],
  docsUrl: "https://developers.google.com/maps/documentation/places/web-service/text-search",
  note: "Supplies public business listings: name, category, address, public phone, website, rating and review count.",
};

type PlacesApiPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  primaryTypeDisplayName?: { text?: string };
  primaryType?: string;
  businessStatus?: string;
  location?: { latitude?: number; longitude?: number };
};

export async function searchPlaces(query: string, limit = 20): Promise<ProviderResult<PlaceRecord>> {
  if (!ENV.placesApiKey) return disconnected<PlaceRecord>(placesStatus);

  const response = await fetch(`${ENV.placesApiUrl.replace(/\/+$/, "")}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": ENV.placesApiKey,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.nationalPhoneNumber",
        "places.websiteUri",
        "places.googleMapsUri",
        "places.rating",
        "places.userRatingCount",
        "places.primaryTypeDisplayName",
        "places.primaryType",
        "places.businessStatus",
        "places.location",
      ].join(","),
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: Math.min(Math.max(limit, 1), 20) }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`Business listing source returned ${response.status}: ${detail.slice(0, 160)}`);
  }

  const payload = (await response.json()) as { places?: PlacesApiPlace[] };
  const items: PlaceRecord[] = (payload.places || []).map(place => ({
    externalId: place.id || `${place.displayName?.text}-${place.formattedAddress}`,
    name: place.displayName?.text || "Unnamed business",
    category: place.primaryTypeDisplayName?.text || place.primaryType,
    address: place.formattedAddress,
    phone: place.nationalPhoneNumber || place.internationalPhoneNumber,
    website: place.websiteUri,
    listingUrl: place.googleMapsUri,
    rating: place.rating,
    reviewCount: place.userRatingCount,
    latitude: place.location?.latitude,
    longitude: place.location?.longitude,
    businessStatus: place.businessStatus,
  }));

  return { ...placesStatus, connected: true, items };
}

/* ---------------------------------------------------------- ad-spend signal */

export const adLibraryStatus: ProviderStatus = {
  provider: "Meta Ad Library",
  connected: Boolean(ENV.adLibraryToken),
  requiredEnv: ["META_AD_LIBRARY_TOKEN"],
  docsUrl: "https://www.facebook.com/ads/library/api",
  note: "Confirms whether a business is currently paying to advertise — the strongest proof of an active marketing budget.",
};

export async function searchActiveAds(pageName: string, country = "US"): Promise<ProviderResult<AdRecord>> {
  if (!ENV.adLibraryToken) return disconnected<AdRecord>(adLibraryStatus);

  const url = new URL("https://graph.facebook.com/v21.0/ads_archive");
  url.searchParams.set("access_token", ENV.adLibraryToken);
  url.searchParams.set("search_terms", pageName);
  url.searchParams.set("ad_reached_countries", `["${country}"]`);
  url.searchParams.set("ad_active_status", "ACTIVE");
  url.searchParams.set("fields", "page_name,ad_delivery_start_time,ad_snapshot_url");
  url.searchParams.set("limit", "25");

  const response = await fetch(url);
  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`Ad library returned ${response.status}: ${detail.slice(0, 160)}`);
  }

  const payload = (await response.json()) as {
    data?: { page_name?: string; ad_delivery_start_time?: string; ad_snapshot_url?: string }[];
  };

  const grouped = new Map<string, AdRecord>();
  for (const ad of payload.data || []) {
    const key = ad.page_name || pageName;
    const existing = grouped.get(key);
    if (existing) {
      existing.adCount += 1;
    } else {
      grouped.set(key, {
        pageName: key,
        adCount: 1,
        firstSeen: ad.ad_delivery_start_time,
        sampleAdUrl: ad.ad_snapshot_url,
      });
    }
  }

  return { ...adLibraryStatus, connected: true, items: [...grouped.values()] };
}

/* --------------------------------------------------- new-business registry */

export const registryStatus: ProviderStatus = {
  provider: "Business registry",
  connected: Boolean(ENV.registryApiKey && ENV.registryApiUrl),
  requiredEnv: ["BUSINESS_REGISTRY_API_URL", "BUSINESS_REGISTRY_API_KEY"],
  docsUrl: "https://finderviews.online/docs/sources#registry",
  note: "Surfaces newly registered and newly opened businesses. Point it at any registry that returns JSON records.",
};

export async function searchRegistrations(
  location: string,
  sinceDays = 60,
): Promise<ProviderResult<RegistrationRecord>> {
  if (!ENV.registryApiKey || !ENV.registryApiUrl) return disconnected<RegistrationRecord>(registryStatus);

  const url = new URL(ENV.registryApiUrl);
  url.searchParams.set("location", location);
  url.searchParams.set("since_days", String(sinceDays));

  const response = await fetch(url, { headers: { Authorization: `Bearer ${ENV.registryApiKey}` } });
  if (!response.ok) throw new Error(`Registry source returned ${response.status}`);

  const payload = (await response.json()) as { records?: RegistrationRecord[]; results?: RegistrationRecord[] };
  return { ...registryStatus, connected: true, items: payload.records || payload.results || [] };
}

/* ---------------------------------------------------- local (non-remote) jobs */

export const localJobsStatus: ProviderStatus = {
  provider: "Local jobs feed",
  connected: Boolean(ENV.localJobsApiKey && ENV.localJobsApiUrl),
  requiredEnv: ["LOCAL_JOBS_API_URL", "LOCAL_JOBS_API_KEY"],
  docsUrl: "https://finderviews.online/docs/sources#local-jobs",
  note: "Adds on-site and local roles. The built-in Jobicy feed is remote-only, so local hiring signals need this source.",
};

export async function searchLocalJobs(
  role: string,
  location: string,
  sinceDays = 5,
): Promise<ProviderResult<LocalJobRecord>> {
  if (!ENV.localJobsApiKey || !ENV.localJobsApiUrl) return disconnected<LocalJobRecord>(localJobsStatus);

  const url = new URL(ENV.localJobsApiUrl);
  url.searchParams.set("what", role);
  url.searchParams.set("where", location);
  url.searchParams.set("max_days_old", String(sinceDays));

  const response = await fetch(url, { headers: { Authorization: `Bearer ${ENV.localJobsApiKey}` } });
  if (!response.ok) throw new Error(`Local jobs source returned ${response.status}`);

  const payload = (await response.json()) as {
    results?: { title?: string; company?: { display_name?: string } | string; location?: { display_name?: string } | string; created?: string; redirect_url?: string }[];
  };

  const items: LocalJobRecord[] = (payload.results || []).map(job => ({
    title: job.title || "Role not stated",
    company: typeof job.company === "string" ? job.company : job.company?.display_name || "Company not stated",
    location: typeof job.location === "string" ? job.location : job.location?.display_name,
    postedAt: job.created,
    url: job.redirect_url,
  }));

  return { ...localJobsStatus, connected: true, items };
}

export function allProviderStatuses(): ProviderStatus[] {
  return [
    { ...placesStatus, connected: Boolean(ENV.placesApiKey) },
    { ...adLibraryStatus, connected: Boolean(ENV.adLibraryToken) },
    { ...registryStatus, connected: Boolean(ENV.registryApiKey && ENV.registryApiUrl) },
    { ...localJobsStatus, connected: Boolean(ENV.localJobsApiKey && ENV.localJobsApiUrl) },
  ];
}
