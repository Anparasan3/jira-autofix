/**
 * REST server mode — started with --mode=rest
 *
 * Endpoints:
 *   GET  /health  → { status: "ok", version: string }
 *   POST /run     → PipelineResult  (runs the full pipeline and returns JSON)
 *
 * Port is read from PORT env var (default 3000).
 * All config comes from env vars set at startup — no per-request overrides.
 */

import pkg from "../package.json";
import { loadConfig } from "./config";
import { runPipeline } from "./pipeline";

const PORT = Number(process.env["PORT"] ?? "3000");

// ── Request handler ──────────────────────────────────────────────────────────

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // ── GET /health ────────────────────────────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/health") {
    return Response.json({ status: "ok", version: pkg.version });
  }

  // ── POST /run ──────────────────────────────────────────────────────────────
  if (req.method === "POST" && url.pathname === "/run") {
    try {
      const cfg = loadConfig();
      const result = await runPipeline(cfg);
      return Response.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("  ✗  Pipeline error:", err);
      return Response.json({ error: message }, { status: 500 });
    }
  }

  return new Response("Not Found", { status: 404 });
}

// ── Server entrypoint ────────────────────────────────────────────────────────

export function startServer(): void {
  const server = Bun.serve({ port: PORT, fetch: handler });
  console.log(`🌐  REST server  |  http://localhost:${server.port}`);
  console.log(`  POST /run    — trigger the full pipeline`);
  console.log(`  GET  /health — health check`);
}
