// Danilo Motos — API minimal pra substituir Supabase
// Hono server + Postgres + Auth JWT cookie

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

import { motosRouter } from "./motos.js";
import { storageRouter, storageFinRouter } from "./storage.js";
import { dbRouter } from "./db-rest.js";
import { login, cookieFor, clearCookie, revokeSession, requireAuth, getTokenFromHeaders, verifySession } from "./auth.js";
import { query, pool } from "./db.js";

const app = new Hono();

app.use("*", logger());
app.use("*", secureHeaders());
app.use("/api/*", cors({
  origin: (origin) => {
    const allowed = (process.env.ALLOWED_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!origin) return "*";
    return allowed.includes(origin) ? origin : null;
  },
  credentials: true,
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Healthcheck
app.get("/api/health", async (c) => {
  try {
    await query("SELECT 1");
    return c.json({ status: "ok", db: "ok", uptime: process.uptime() });
  } catch (e) {
    return c.json({ status: "degraded", db: "error", error: e.message }, 503);
  }
});

// ============================================================================
// Auth
// ============================================================================
app.post("/api/auth/login", async (c) => {
  const body = await c.req.json();
  const { email, password } = body || {};
  if (!email || !password) return c.json({ error: "email e password obrigatórios" }, 400);

  const result = await login(email, password);
  if (result.error) return c.json({ error: result.error }, 401);

  c.header("Set-Cookie", cookieFor(result.token, result.expiresAt));
  return c.json({ ok: true, token: result.token, expiresAt: result.expiresAt });
});

app.post("/api/auth/logout", async (c) => {
  const token = getTokenFromHeaders(c);
  if (token) await revokeSession(token);
  c.header("Set-Cookie", clearCookie());
  return c.json({ ok: true });
});

app.get("/api/auth/me", async (c) => {
  const token = getTokenFromHeaders(c);
  const user = await verifySession(token);
  if (!user) return c.json({ user: null }, 401);
  return c.json({ user: { id: user.id, email: user.email, uuid: user.uuid } });
});

// ============================================================================
// Routers
// ============================================================================
app.route("/api/motos", motosRouter);
app.route("/api/storage", storageRouter);
app.route("/api/storage-fin", storageFinRouter);
app.route("/api/db", dbRouter);

// Error handler
app.onError((err, c) => {
  console.error("[api] unhandled:", err);
  return c.json({ error: err.message || "erro interno" }, 500);
});

const port = Number(process.env.PORT) || 3000;
console.log(`[api] starting on :${port}, env=${process.env.NODE_ENV}`);

const server = serve({ fetch: app.fetch, port });

// Graceful shutdown
function shutdown(sig) {
  console.log(`[api] received ${sig}, draining...`);
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
