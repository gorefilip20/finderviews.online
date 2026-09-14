import fs from "node:fs";
const path = "server/prebuilt-index.js";
let source = fs.readFileSync(path, "utf8");
source = source.replace('function getJobicyGeoScope(input) { var directGeo = countryToJobicyGeo[input.country]; return directGeo ? { geo: directGeo, scope: "country" } : { geo: regionToJobicyGeo[input.region], scope: "region" }; }', 'function getJobicyGeoScope(input) { if (input.country === "Worldwide") return { geo: "", scope: "global" }; var directGeo = countryToJobicyGeo[input.country]; return directGeo ? { geo: directGeo, scope: "country" } : { geo: regionToJobicyGeo[input.region], scope: "region" }; }');
source = source.replace('var scopedFallback = fallbackJobs.filter((job) => { var geography = job.geography.toLowerCase(); return geography.includes(countryNeedle) || regionNeedles.some((needle) => geography.includes(needle)); });', 'var scopedFallback = input.country === "Worldwide" ? fallbackJobs : fallbackJobs.filter((job) => { var geography = job.geography.toLowerCase(); return geography.includes(countryNeedle) || regionNeedles.some((needle) => geography.includes(needle)); });');
source = source.replace('regionContext: input.region, contactCoverage:', 'regionContext: input.region, globalFilterApplied: geoScope.scope === "global", contactCoverage:');
fs.writeFileSync(path, source);
if (!source.includes('input.country === "Worldwide"') || !source.includes('globalFilterApplied')) throw new Error("Worldwide runtime patch failed");
console.log("Added worldwide runtime scope");
