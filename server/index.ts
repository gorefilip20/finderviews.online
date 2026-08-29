import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { ENV } from "./_core/env";
import { registerApi } from "./_core/index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.set("trust proxy", 1);

  // API first: the SPA fallback below matches everything else.
  registerApi(app);

  const staticPath =
    ENV.isProduction
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all non-API routes
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    return res.sendFile(path.join(staticPath, "index.html"));
  });

  server.listen(ENV.port, () => {
    console.log(`Finder server running on http://localhost:${ENV.port}/`);
  });
}

startServer().catch(error => {
  console.error("[Server] failed to start:", error);
  process.exit(1);
});
