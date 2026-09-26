import "dotenv/config";
import { readFile } from "node:fs/promises";
import { importJobsFromJson, importJobsFromRss } from "../server/services/jobImporter.ts";

const source = process.argv[2];
if (!source) throw new Error("Usage: pnpm import:jobs <path-or-url.json|path-or-url.xml>");
const content = source.startsWith("http://") || source.startsWith("https://") ? await (await fetch(source)).text() : await readFile(source, "utf8");
const imported = source.toLowerCase().endsWith(".xml") || content.includes("<rss") || content.includes("<feed") ? await importJobsFromRss(content) : await importJobsFromJson(JSON.parse(content));
console.log(`Imported ${imported.length} jobs.`);
