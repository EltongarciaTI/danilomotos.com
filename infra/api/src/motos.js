import { Hono } from "hono";
import { z } from "zod";
import { query } from "./db.js";
import { requireAuth } from "./auth.js";

export const motosRouter = new Hono();

const STATUSES = ["ativo", "vendida", "reservada"];

const motoBaseSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9-_]+$/i, "id inválido"),
  status: z.enum(STATUSES).default("ativo"),
  titulo: z.string().nullable().optional(),
  preco: z.string().nullable().optional(),
  ano: z.string().nullable().optional(),
  km: z.coerce.number().int().nonnegative().nullable().optional(),
  cor: z.string().nullable().optional(),
  cilindrada: z.string().nullable().optional(),
  combustivel: z.string().nullable().optional(),
  cambio: z.string().nullable().optional(),
  partida: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  youtube: z.string().nullable().optional(),
  whatsapp_texto: z.string().nullable().optional(),
  emplacada: z.coerce.boolean().optional(),
  destaque: z.coerce.boolean().optional(),
  observacoes_internas: z.string().nullable().optional(),
  obs_internas: z.string().nullable().optional(),
  ordem: z.coerce.number().int().optional(),
  capa_path: z.string().nullable().optional(),
  fotos_paths: z.array(z.string()).nullable().optional(),
});

// GET /api/motos?status=ativo|vendida|reservada|all&id=xxx
motosRouter.get("/", async (c) => {
  const status = c.req.query("status") || "all";
  const id = c.req.query("id");

  if (id) {
    const r = await query("SELECT * FROM motos WHERE id = $1 LIMIT 1", [id]);
    return c.json(r.rows);
  }

  let sql = "SELECT * FROM motos";
  const params = [];
  if (status === "disponivel" || status === "ativo") {
    sql += " WHERE status IN ('ativo')";
  } else if (status === "all") {
    // no filter
  } else if (STATUSES.includes(status)) {
    params.push(status);
    sql += " WHERE status = $1";
  }
  sql += " ORDER BY ordem ASC, id DESC";

  const r = await query(sql, params);
  return c.json(r.rows);
});

// HEAD /api/motos?status=... — só conta (compat com client antigo que fazia HEAD)
motosRouter.get("/count", async (c) => {
  const status = c.req.query("status") || "all";
  let sql = "SELECT count(*)::int AS count FROM motos";
  const params = [];
  if (status === "disponivel" || status === "ativo") sql += " WHERE status = 'ativo'";
  else if (STATUSES.includes(status)) {
    params.push(status);
    sql += " WHERE status = $1";
  }
  const r = await query(sql, params);
  return c.json({ count: r.rows[0].count });
});

// POST /api/motos — cria ou atualiza (upsert)
motosRouter.post("/", requireAuth(), async (c) => {
  const body = await c.req.json();
  const parsed = motoBaseSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "validação", details: parsed.error.flatten() }, 400);

  const m = parsed.data;
  const cols = Object.keys(m);
  const values = Object.values(m);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const updates = cols.filter((c) => c !== "id").map((c) => `${c} = EXCLUDED.${c}`).join(", ");

  const sql = `INSERT INTO motos (${cols.join(", ")})
               VALUES (${placeholders})
               ON CONFLICT (id) DO UPDATE SET ${updates}, updated_at = now()
               RETURNING *`;
  try {
    const r = await query(sql, values);
    return c.json(r.rows[0]);
  } catch (e) {
    console.error("[motos.upsert] error:", e);
    return c.json({ error: e.message }, 400);
  }
});

// PATCH /api/motos/:id — update parcial
motosRouter.patch("/:id", requireAuth(), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const partial = motoBaseSchema.partial().safeParse(body);
  if (!partial.success) return c.json({ error: "validação", details: partial.error.flatten() }, 400);

  const fields = partial.data;
  const cols = Object.keys(fields);
  if (!cols.length) return c.json({ error: "nada pra atualizar" }, 400);

  const setSql = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = [...Object.values(fields), id];
  const sql = `UPDATE motos SET ${setSql}, updated_at = now()
               WHERE id = $${cols.length + 1} RETURNING *`;
  const r = await query(sql, values);
  if (!r.rows.length) return c.json({ error: "não encontrada" }, 404);
  return c.json(r.rows[0]);
});

// DELETE /api/motos/:id
motosRouter.delete("/:id", requireAuth(), async (c) => {
  const id = c.req.param("id");
  await query("DELETE FROM motos WHERE id = $1", [id]);
  return c.json({ ok: true });
});
