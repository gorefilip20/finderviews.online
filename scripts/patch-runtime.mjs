import fs from "node:fs";

const path = "server/prebuilt-index.js";
let source = fs.readFileSync(path, "utf8");
const jobicy = "companyWebsite: extractCompanyWebsite(rawDescription), applyEmail: extractApplyEmail(rawDescription) }";
const arbeitnow = "companyWebsite: extractCompanyWebsite(rawDesc), applyEmail: extractApplyEmail(rawDesc) }";
if (!source.includes(jobicy) || !source.includes(arbeitnow)) throw new Error("Expected runtime mapping expressions were not found");
source = source.replace(jobicy, "companyWebsite: extractCompanyWebsite(rawDescription), applyEmail: extractApplyEmail(rawDescription), contactSearchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${company} official website contact careers`)}`, hasActionableContact: Boolean(extractCompanyWebsite(rawDescription) || extractApplyEmail(rawDescription) || job.url) }");
source = source.replace(arbeitnow, "companyWebsite: extractCompanyWebsite(rawDesc), applyEmail: extractApplyEmail(rawDesc), contactSearchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${company} official website contact careers`)}`, hasActionableContact: Boolean(extractCompanyWebsite(rawDesc) || extractApplyEmail(rawDesc) || job.url) }");
const responseNeedle = "regionContext: input.region }; }";
if (!source.includes(responseNeedle)) throw new Error("Expected runtime response expression was not found");
source = source.replace(responseNeedle, "regionContext: input.region, contactCoverage: jobs.length ? Math.round(jobs.filter((job) => job.hasActionableContact).length / jobs.length * 100) : 0, refreshedAt: new Date().toISOString() }; }");
fs.writeFileSync(path, source);
console.log("Patched", path);

// Fail loudly if the production bundle still lacks the new contract fields.
for (const needle of ["contactSearchUrl", "hasActionableContact", "contactCoverage"]) {
  if (!source.includes(needle)) throw new Error(`Missing ${needle} after patch`);
}
console.log("Runtime contract verified");
