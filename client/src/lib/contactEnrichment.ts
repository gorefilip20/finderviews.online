import type { BusinessLead } from "./businessLeads";

export const NOMINATIM_MIN_INTERVAL_MS = 1_000;
export const NOMINATIM_ENRICHMENT_LIMIT = 12;

type DirectoryFetch = typeof fetch;
type NominatimResult = {
  osm_id?: number;
  osm_type?: string;
  extratags?: Record<string, string>;
  address?: Record<string, string>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function first(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => Boolean(value?.trim()))?.trim();
}

function contactValue(tags: Record<string, string>, key: string): string | undefined {
  return first(tags[key], tags[`contact:${key}`], tags[`contact_${key}`]);
}

export async function enrichBusinessLeadContacts(
  leads: BusinessLead[],
  fetchImpl: DirectoryFetch = fetch,
  options: { minIntervalMs?: number; limit?: number } = {},
): Promise<BusinessLead[]> {
  const minIntervalMs = options.minIntervalMs ?? NOMINATIM_MIN_INTERVAL_MS;
  const limit = options.limit ?? NOMINATIM_ENRICHMENT_LIMIT;
  let lastRequestAt = 0;
  let enrichedCount = 0;
  const output: BusinessLead[] = [];

  for (const lead of leads) {
    const needsContact = !lead.email || !lead.website || lead.phone.toLowerCase().includes("no public");
    if (!needsContact || enrichedCount >= limit) {
      output.push(lead);
      continue;
    }
    enrichedCount += 1;
    const waitForSlot = Math.max(0, minIntervalMs - (Date.now() - lastRequestAt));
    if (waitForSlot > 0) await sleep(waitForSlot);
    lastRequestAt = Date.now();

    const params = new URLSearchParams({ q: `${lead.name} ${lead.location}`, format: "json", limit: "1", addressdetails: "1", extratags: "1", namedetails: "1" });
    try {
      const response = await fetchImpl(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { Accept: "application/json", "User-Agent": "Finderviews/1.0 (public business research; https://finderviews.online)" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) { output.push(lead); continue; }
      const result = (await response.json() as NominatimResult[])[0];
      if (!result) { output.push(lead); continue; }
      const tags = result.extratags || {};
      const phone = first(contactValue(tags, "phone"), contactValue(tags, "mobile"));
      const email = contactValue(tags, "email");
      const website = first(contactValue(tags, "website"), tags.url, contactValue(tags, "homepage"));
      const address = [result.address?.house_number, result.address?.road, result.address?.postcode, result.address?.city || result.address?.town].filter(Boolean).join(", ");
      const osmSource = result.osm_id && result.osm_type ? `https://www.openstreetmap.org/${result.osm_type.toLowerCase()}/${result.osm_id}` : lead.source;
      output.push({
        ...lead,
        phone: lead.phone.toLowerCase().includes("no public") ? (phone || lead.phone) : lead.phone,
        email: lead.email || email,
        website: lead.website || website,
        address: lead.address || address || lead.address,
        source: osmSource,
        contactSource: "Nominatim public business metadata",
        contactEnriched: Boolean(phone || email || website || address),
      });
    } catch {
      output.push(lead);
    }
  }
  return output;
}
