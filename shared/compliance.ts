/**
 * Per-market data-protection context for discovered contacts.
 *
 * Finder operates worldwide, which means a single result set can span several very different
 * legal regimes. Rather than apply the strictest rule everywhere (useless) or ignore the
 * problem (reckless), every contact Finder returns carries the regime that governs it and the
 * practical rule for contacting it.
 *
 * This is reference information to help a user act carefully. It is not legal advice, and the
 * UI says so wherever it is displayed.
 */
import { regionForCountry, type MarketRegion } from "./marketCoverage";

/** How much care cold outreach in this market needs. */
export type ComplianceLevel = "opt-out" | "mixed" | "opt-in";

export type ComplianceProfile = {
  /** Name of the governing regime, as commonly cited. */
  regime: string;
  level: ComplianceLevel;
  /** The practical rule for unsolicited business email in this market. */
  rule: string;
  /** What a sender must include or do. */
  requirements: string[];
};

const OPT_OUT_REQUIREMENTS = [
  "Identify yourself and your business honestly",
  "Include a valid physical postal address",
  "Provide a working, honoured unsubscribe route",
];

const OPT_IN_REQUIREMENTS = [
  "Establish consent, or a documented existing business relationship, before sending",
  "Identify yourself and your business honestly",
  "Provide a working, honoured unsubscribe route",
  "Keep a record of the basis you relied on for each contact",
];

const GDPR_REQUIREMENTS = [
  "Rely on legitimate interest only for role addresses at a business, and document that assessment",
  "Treat a named individual's address as personal data — higher bar, and easy to get wrong",
  "State who you are and where you got the contact details in the first message",
  "Honour objection and erasure requests promptly",
];

const GDPR: ComplianceProfile = {
  regime: "GDPR / ePrivacy",
  level: "mixed",
  rule:
    "Business role addresses can often be contacted under legitimate interest. A named individual's address is personal data and needs a much stronger basis.",
  requirements: GDPR_REQUIREMENTS,
};

const CAN_SPAM: ComplianceProfile = {
  regime: "CAN-SPAM Act",
  level: "opt-out",
  rule: "Unsolicited business email is permitted provided the message is honest and offers a working opt-out.",
  requirements: OPT_OUT_REQUIREMENTS,
};

const CASL: ComplianceProfile = {
  regime: "CASL / PIPEDA",
  level: "opt-in",
  rule:
    "Consent-based. A published business address can support implied consent for a limited period, but the bar is high and penalties are significant.",
  requirements: OPT_IN_REQUIREMENTS,
};

const POPIA: ComplianceProfile = {
  regime: "POPIA",
  level: "opt-in",
  rule:
    "Section 69 restricts electronic direct marketing to data subjects without prior consent or an existing customer relationship.",
  requirements: OPT_IN_REQUIREMENTS,
};

const DEFAULT_BY_REGION: Record<MarketRegion, ComplianceProfile> = {
  Europe: GDPR,
  Americas: {
    regime: "Local data-protection law",
    level: "mixed",
    rule: "Rules vary considerably across the region. Treat named-individual addresses as sensitive by default.",
    requirements: OPT_OUT_REQUIREMENTS,
  },
  Africa: {
    regime: "Local data-protection law",
    level: "mixed",
    rule:
      "Most markets now have a data-protection statute, several modelled closely on GDPR. Treat named-individual addresses as sensitive by default.",
    requirements: GDPR_REQUIREMENTS,
  },
  Asia: {
    regime: "Local data-protection law",
    level: "mixed",
    rule: "Rules vary widely, from permissive to strictly consent-based. Check before any bulk send.",
    requirements: OPT_IN_REQUIREMENTS,
  },
  Oceania: {
    regime: "Spam Act / Privacy Act",
    level: "opt-in",
    rule: "Consent-based. A conspicuously published business address can support inferred consent for related messages.",
    requirements: OPT_IN_REQUIREMENTS,
  },
};

const BY_COUNTRY: Record<string, ComplianceProfile> = {
  "united states": CAN_SPAM,
  canada: CASL,
  "united kingdom": { ...GDPR, regime: "UK GDPR / PECR" },
  "south africa": POPIA,
  nigeria: {
    regime: "Nigeria Data Protection Act",
    level: "mixed",
    rule: "Processing needs a lawful basis; legitimate interest is available but must be documented.",
    requirements: GDPR_REQUIREMENTS,
  },
  kenya: {
    regime: "Data Protection Act 2019",
    level: "mixed",
    rule: "GDPR-style lawful-basis requirement, with a registration duty for many data controllers.",
    requirements: GDPR_REQUIREMENTS,
  },
  ghana: {
    regime: "Data Protection Act 2012",
    level: "mixed",
    rule: "Registration with the Data Protection Commission is required for many controllers.",
    requirements: GDPR_REQUIREMENTS,
  },
  egypt: {
    regime: "Personal Data Protection Law",
    level: "opt-in",
    rule: "Consent-led, with licensing and marketing-specific restrictions.",
    requirements: OPT_IN_REQUIREMENTS,
  },
  morocco: {
    regime: "Law 09-08",
    level: "mixed",
    rule: "Notification to the CNDP is required for many processing activities.",
    requirements: GDPR_REQUIREMENTS,
  },
  brazil: {
    regime: "LGPD",
    level: "mixed",
    rule: "GDPR-style lawful basis; legitimate interest is available for B2B contact but must be documented.",
    requirements: GDPR_REQUIREMENTS,
  },
  india: {
    regime: "DPDP Act 2023",
    level: "opt-in",
    rule: "Largely consent-based for personal data, with limited legitimate-use exceptions.",
    requirements: OPT_IN_REQUIREMENTS,
  },
  china: {
    regime: "PIPL",
    level: "opt-in",
    rule: "Strictly consent-based, with separate consent needed for marketing and for cross-border transfer.",
    requirements: OPT_IN_REQUIREMENTS,
  },
  japan: {
    regime: "APPI",
    level: "mixed",
    rule: "Purpose must be specified; opt-out is available for many business-contact uses.",
    requirements: OPT_OUT_REQUIREMENTS,
  },
  singapore: {
    regime: "PDPA",
    level: "opt-in",
    rule: "Consent-based, and the Do Not Call registry applies to phone numbers.",
    requirements: OPT_IN_REQUIREMENTS,
  },
  australia: {
    regime: "Spam Act 2003 / Privacy Act",
    level: "opt-in",
    rule: "Consent-based. A conspicuously published business address can support inferred consent for related messages.",
    requirements: OPT_IN_REQUIREMENTS,
  },
  "new zealand": {
    regime: "Unsolicited Electronic Messages Act / Privacy Act 2020",
    level: "opt-in",
    rule: "Consent-based, with an inferred-consent route for conspicuously published business addresses.",
    requirements: OPT_IN_REQUIREMENTS,
  },
};

const EU_EEA = new Set([
  "austria", "belgium", "bulgaria", "croatia", "cyprus", "czechia", "denmark", "estonia", "finland",
  "france", "germany", "greece", "hungary", "iceland", "ireland", "italy", "latvia", "liechtenstein",
  "lithuania", "luxembourg", "malta", "netherlands", "norway", "poland", "portugal", "romania",
  "slovakia", "slovenia", "spain", "sweden",
]);

export function complianceFor(country: string): ComplianceProfile {
  const key = country.trim().toLowerCase();
  const direct = BY_COUNTRY[key];
  if (direct) return direct;
  if (EU_EEA.has(key)) return GDPR;

  const region = regionForCountry(country);
  return region
    ? DEFAULT_BY_REGION[region]
    : {
        regime: "Unknown jurisdiction",
        level: "opt-in",
        rule: "Finder does not recognise this market. Assume the strictest rules until you have checked.",
        requirements: OPT_IN_REQUIREMENTS,
      };
}

export const COMPLIANCE_DISCLAIMER =
  "Reference information only, not legal advice. Confirm the rules for your market and your use before running any campaign.";
