import "dotenv/config";
import { syncAllFeeds } from "../server/services/autoSync.ts";

const result = await syncAllFeeds();
console.log(JSON.stringify(result, null, 2));
