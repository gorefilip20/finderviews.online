/**
 * Finder visual reminder: Atlas Field Notes — geographical scope is explicit and simple to audit.
 *
 * Coverage is worldwide. Africa and Oceania were added alongside the original three regions,
 * so no market is structurally excluded from discovery any more. What varies by market is not
 * whether Finder will look, but which data-protection regime applies to the result — see
 * `shared/compliance.ts`.
 */
export const MARKET_COVERAGE = {
  Europe: [
    "Albania", "Andorra", "Austria", "Belarus", "Belgium", "Bosnia and Herzegovina", "Bulgaria", "Croatia", "Czechia", "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", "Iceland", "Ireland", "Italy", "Kosovo", "Latvia", "Liechtenstein", "Lithuania", "Luxembourg", "Malta", "Moldova", "Monaco", "Montenegro", "Netherlands", "North Macedonia", "Norway", "Poland", "Portugal", "Romania", "Russia", "San Marino", "Serbia", "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland", "Ukraine", "United Kingdom", "Vatican City",
  ],
  Americas: [
    "Antigua and Barbuda", "Argentina", "Bahamas", "Barbados", "Belize", "Bolivia", "Brazil", "Canada", "Chile", "Colombia", "Costa Rica", "Cuba", "Dominica", "Dominican Republic", "Ecuador", "El Salvador", "Grenada", "Guatemala", "Guyana", "Haiti", "Honduras", "Jamaica", "Mexico", "Nicaragua", "Panama", "Paraguay", "Peru", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Suriname", "Trinidad and Tobago", "United States", "Uruguay", "Venezuela",
  ],
  Africa: [
    "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi", "Cabo Verde", "Cameroon", "Central African Republic", "Chad", "Comoros", "Democratic Republic of the Congo", "Djibouti", "Egypt", "Equatorial Guinea", "Eritrea", "Eswatini", "Ethiopia", "Gabon", "Gambia", "Ghana", "Guinea", "Guinea-Bissau", "Ivory Coast", "Kenya", "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi", "Mali", "Mauritania", "Mauritius", "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria", "Republic of the Congo", "Rwanda", "Sao Tome and Principe", "Senegal", "Seychelles", "Sierra Leone", "Somalia", "South Africa", "South Sudan", "Sudan", "Tanzania", "Togo", "Tunisia", "Uganda", "Zambia", "Zimbabwe",
  ],
  Asia: [
    "Afghanistan", "Armenia", "Azerbaijan", "Bahrain", "Bangladesh", "Bhutan", "Brunei", "Cambodia", "China", "Cyprus", "Georgia", "Hong Kong", "India", "Indonesia", "Iran", "Iraq", "Israel", "Japan", "Jordan", "Kazakhstan", "Kuwait", "Kyrgyzstan", "Laos", "Lebanon", "Malaysia", "Maldives", "Mongolia", "Myanmar", "Nepal", "North Korea", "Oman", "Pakistan", "Palestine", "Philippines", "Qatar", "Saudi Arabia", "Singapore", "South Korea", "Sri Lanka", "Syria", "Taiwan", "Tajikistan", "Thailand", "Timor-Leste", "Turkey", "Turkmenistan", "United Arab Emirates", "Uzbekistan", "Vietnam", "Yemen",
  ],
  Oceania: [
    "Australia", "Fiji", "Kiribati", "Marshall Islands", "Micronesia", "Nauru", "New Zealand", "Palau", "Papua New Guinea", "Samoa", "Solomon Islands", "Tonga", "Tuvalu", "Vanuatu",
  ],
} as const;

export type MarketRegion = keyof typeof MARKET_COVERAGE;

export const SUPPORTED_REGIONS = Object.keys(MARKET_COVERAGE) as MarketRegion[];
export const SUPPORTED_COUNTRY_COUNT = Object.values(MARKET_COVERAGE).flat().length;

const COUNTRY_TO_REGION: Record<string, MarketRegion> = Object.fromEntries(
  SUPPORTED_REGIONS.flatMap(region => MARKET_COVERAGE[region].map(country => [country.toLowerCase(), region])),
) as Record<string, MarketRegion>;

/** Resolves a country name to its region, or undefined when Finder does not recognise it. */
export function regionForCountry(country: string): MarketRegion | undefined {
  return COUNTRY_TO_REGION[country.trim().toLowerCase()];
}

export function isSupportedCountry(country: string): boolean {
  return regionForCountry(country) !== undefined;
}

/**
 * Retained so existing callers keep compiling after coverage went worldwide. No market is
 * excluded any more, so this is always false. Prefer `isSupportedCountry`.
 *
 * @deprecated Coverage is worldwide; this always returns false.
 */
export function isExcludedMarket(_value: string): boolean {
  return false;
}
