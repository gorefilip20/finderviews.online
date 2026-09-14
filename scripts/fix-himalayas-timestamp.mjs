import fs from "node:fs";
for (const path of ["scripts/himalayas-runtime.fragment.txt", "server/prebuilt-index.js"]) {
  let source = fs.readFileSync(path, "utf8");
  source = source.replaceAll("const publishedMs = Date.parse(job.pubDate);", "const publishedMs = typeof job.pubDate === \"number\" ? (job.pubDate < 10000000000 ? job.pubDate * 1000 : job.pubDate) : Date.parse(job.pubDate);");
  fs.writeFileSync(path, source);
}
console.log("Fixed Himalayas numeric timestamps");
