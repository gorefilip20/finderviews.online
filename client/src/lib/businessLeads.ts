export type BusinessLead = {
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

export type BusinessRecord = {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export type NominatimBusinessRecord = {
  osm_id: number;
  osm_type: string;
  lat: string;
  lon: string;
  display_name?: string;
  name?: string;
  extratags?: Record<string, string>;
  address?: Record<string, string>;
};

export type LeadMappingOptions = {
  country: string;
  marketLabel: string;
  category: string;
  presenceMode: "No website or limited presence" | "No listed website" | "Limited public presence";
};

function contactValue(tags: Record<string, string>, key: string): string | undefined {
  return tags[key] || tags[`contact:${key}`] || tags[`contact_${key}`] || undefined;
}

export function mapBusinessRecords(records: BusinessRecord[], options: LeadMappingOptions): BusinessLead[] {
  return records.reduce<BusinessLead[]>((results, record) => {
    if (!record.tags?.name) return results;
    const lat = record.lat ?? record.center?.lat;
    const lon = record.lon ?? record.center?.lon;
    if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) return results;

    const tags = record.tags;
    const website = contactValue(tags, "website") || tags.url || contactValue(tags, "homepage");
    const phone = contactValue(tags, "phone") || contactValue(tags, "mobile");
    const email = contactValue(tags, "email");
    const hasWebsite = Boolean(website);
    // A business can have a website but still be an untapped prospect when its
    // public listing has no phone or email route. Keep the strict no-website
    // mode separate, while allowing the broader limited-presence modes to
    // surface these incomplete public profiles.
    const hasLimitedPublicPresence = !hasWebsite || !phone || !email;
    const qualifies = options.presenceMode === "No listed website"
      ? !hasWebsite
      : options.presenceMode === "Limited public presence"
        ? hasLimitedPublicPresence
        : !hasWebsite || hasLimitedPublicPresence;
    if (!qualifies) return results;

    const category = (tags.shop || tags.amenity || tags.office || tags.craft || options.category).replaceAll("_", " ");
    results.push({
      id: `osm-${record.type}-${record.id}`,
      name: tags.name,
      category,
      location: [tags["addr:city"], tags["addr:state"], options.country].filter(Boolean).join(", ") || options.marketLabel,
      phone: phone || "No public phone listed",
      email,
      website,
      address: [tags["addr:housenumber"], tags["addr:street"], tags["addr:postcode"], tags["addr:city"]].filter(Boolean).join(", ") || undefined,
      verified: true,
      hasWebsite,
      score: 80,
      growthPath: "Review presence and propose next step",
      position: { lat, lng: lon },
      mapUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`,
      source: `https://www.openstreetmap.org/${record.type}/${record.id}`,
      contactSearchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${tags.name} ${[tags["addr:city"], tags["addr:state"], options.country].filter(Boolean).join(" ")} official contact`)}`,
      presence: !hasWebsite ? "No website listed" : "Limited public presence",
    });
    return results;
  }, []).slice(0, 50);
}

export function mapNominatimRecords(records: NominatimBusinessRecord[], options: LeadMappingOptions): BusinessLead[] {
  return mapBusinessRecords(records.map((record) => ({
    id: record.osm_id,
    type: record.osm_type.toLowerCase(),
    lat: Number.parseFloat(record.lat),
    lon: Number.parseFloat(record.lon),
    tags: {
      name: record.name || record.display_name?.split(",")[0] || options.category,
      ...(record.extratags || {}),
      "addr:city": record.address?.city || record.address?.town || record.address?.village || "",
      "addr:state": record.address?.state || "",
      "addr:street": record.address?.road || "",
      "addr:housenumber": record.address?.house_number || "",
      "addr:postcode": record.address?.postcode || "",
    },
  })), options);
}

export function shouldUseWebsiteFallback(leads: BusinessLead[]): boolean {
  return leads.length === 0;
}
