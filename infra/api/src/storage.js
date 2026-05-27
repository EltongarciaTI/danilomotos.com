import { Hono } from "hono";
import { promises as fs } from "node:fs";
import path from "node:path";
import { requireAuth } from "./auth.js";
import { query } from "./db.js";

export const storageRouter = new Hono();

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/uploads";
const UPLOAD_DIR_FIN = process.env.UPLOAD_DIR_FIN || "/uploads-fin";
const MAX_BYTES = (Number(process.env.MAX_UPLOAD_MB) || 10) * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp",
  "application/pdf",  // recibos
]);

// Sanitização: previne path traversal, normaliza
function safePath(motoId, filename) {
  const id = String(motoId).replace(/[^a-z0-9_-]/gi, "");
  const fn = String(filename).replace(/[^a-z0-9._-]/gi, "");
  if (!id || !fn || fn.startsWith(".") || fn.includes("..")) {
    throw new Error("path inválido");
  }
  const abs = path.join(UPLOAD_DIR, id, fn);
  const resolved = path.resolve(abs);
  if (!resolved.startsWith(path.resolve(UPLOAD_DIR))) {
    throw new Error("path traversal detectado");
  }
  return { dir: path.dirname(resolved), abs: resolved, rel: `${id}/${fn}` };
}

// Path seguro pro bucket financeiro (recibos/comprovantes)
function safePathFin(subpath) {
  // subpath pode ser "comprovantes/2026/file.pdf" — preserva subdirs mas sanitiza
  const parts = String(subpath).split("/").filter(Boolean);
  const cleaned = parts.map((p) => p.replace(/[^a-z0-9._-]/gi, "")).filter(Boolean);
  if (!cleaned.length || cleaned.some((p) => p.startsWith(".") || p.includes(".."))) {
    throw new Error("path inválido");
  }
  const abs = path.join(UPLOAD_DIR_FIN, ...cleaned);
  const resolved = path.resolve(abs);
  if (!resolved.startsWith(path.resolve(UPLOAD_DIR_FIN))) {
    throw new Error("path traversal detectado");
  }
  return { dir: path.dirname(resolved), abs: resolved, rel: cleaned.join("/") };
}

// GET /api/storage/:motoId  — lista fotos da moto
storageRouter.get("/:motoId", requireAuth(), async (c) => {
  const id = c.req.param("motoId").replace(/[^a-z0-9_-]/gi, "");
  const dir = path.join(UPLOAD_DIR, id);
  try {
    const items = await fs.readdir(dir, { withFileTypes: true });
    const out = [];
    for (const e of items) {
      if (!e.isFile()) continue;
      const st = await fs.stat(path.join(dir, e.name));
      out.push({
        name: e.name,
        size: st.size,
        created_at: st.birthtime.toISOString(),
        updated_at: st.mtime.toISOString(),
      });
    }
    return c.json(out);
  } catch (e) {
    if (e.code === "ENOENT") return c.json([]);
    throw e;
  }
});

// POST /api/storage/:motoId/:filename  — upload (multipart com 1 arquivo "file")
storageRouter.post("/:motoId/:filename", requireAuth(), async (c) => {
  const { motoId, filename } = c.req.param();
  const { dir, abs, rel } = safePath(motoId, filename);

  const form = await c.req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return c.json({ error: "campo 'file' ausente" }, 400);
  }
  if (file.size > MAX_BYTES) {
    return c.json({ error: `arquivo > ${process.env.MAX_UPLOAD_MB}MB` }, 413);
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(mime)) {
    return c.json({ error: `mime '${mime}' não permitido` }, 415);
  }

  await fs.mkdir(dir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(abs, buf);
  return c.json({ ok: true, path: rel, size: buf.length });
});

// DELETE /api/storage/:motoId/:filename  — apaga um arquivo
storageRouter.delete("/:motoId/:filename", requireAuth(), async (c) => {
  const { motoId, filename } = c.req.param();
  const { abs, rel } = safePath(motoId, filename);
  try {
    await fs.unlink(abs);
    return c.json({ ok: true, path: rel });
  } catch (e) {
    if (e.code === "ENOENT") return c.json({ ok: true, path: rel, note: "já não existia" });
    throw e;
  }
});

// DELETE /api/storage/:motoId  — apaga TODAS as fotos da moto (pasta inteira)
storageRouter.delete("/:motoId", requireAuth(), async (c) => {
  const id = c.req.param("motoId").replace(/[^a-z0-9_-]/gi, "");
  const dir = path.join(UPLOAD_DIR, id);
  try {
    await fs.rm(dir, { recursive: true, force: true });
    return c.json({ ok: true, deleted: id });
  } catch (e) {
    if (e.code === "ENOENT") return c.json({ ok: true, deleted: id, note: "já não existia" });
    throw e;
  }
});

// ============================================================================
// Storage FINANCEIRO (bucket "financeiro" do Supabase)
// Servido público em /storage/financeiro/* pelo Caddy
// Upload via POST /api/storage-fin/<subpath...> (auth required)
// ============================================================================
export const storageFinRouter = new Hono();

// POST /api/storage-fin/<path>  → upload (subpath pode ter slashes)
storageFinRouter.post("*", requireAuth(), async (c) => {
  // Pega tudo depois de /api/storage-fin/
  const url = new URL(c.req.url);
  const subpath = decodeURIComponent(url.pathname.replace(/^\/api\/storage-fin\/?/, ""));
  if (!subpath) return c.json({ error: "path obrigatório" }, 400);

  let target;
  try { target = safePathFin(subpath); }
  catch (e) { return c.json({ error: e.message }, 400); }

  const form = await c.req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") return c.json({ error: "campo 'file' ausente" }, 400);
  if (file.size > MAX_BYTES) return c.json({ error: `arquivo > ${process.env.MAX_UPLOAD_MB}MB` }, 413);
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(mime)) return c.json({ error: `mime '${mime}' não permitido` }, 415);

  await fs.mkdir(target.dir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(target.abs, buf);
  return c.json({ ok: true, path: target.rel, size: buf.length });
});

// DELETE /api/storage-fin/<path>
storageFinRouter.delete("*", requireAuth(), async (c) => {
  const url = new URL(c.req.url);
  const subpath = decodeURIComponent(url.pathname.replace(/^\/api\/storage-fin\/?/, ""));
  if (!subpath) return c.json({ error: "path obrigatório" }, 400);
  let target;
  try { target = safePathFin(subpath); }
  catch (e) { return c.json({ error: e.message }, 400); }
  try {
    await fs.unlink(target.abs);
    return c.json({ ok: true, path: target.rel });
  } catch (e) {
    if (e.code === "ENOENT") return c.json({ ok: true, path: target.rel, note: "já não existia" });
    throw e;
  }
});
