// REST genérico PostgREST-like — pra suportar dashboard.js (drop-in supabase-js)
// Endpoints:
//   GET    /api/db/:table?select=*&col=eq.val&order=col.desc[,col2.asc]
//   POST   /api/db/:table  body=obj|array  (insert)
//   POST   /api/db/:table?on_conflict=col1,col2  body=obj (upsert)
//   PATCH  /api/db/:table?col=eq.val  body=obj
//   DELETE /api/db/:table?col=eq.val
//
// Todas as rotas exigem auth (cookie JWT) e operam só nas tabelas da whitelist.

import { Hono } from "hono";
import { query } from "./db.js";
import { requireAuth } from "./auth.js";

export const dbRouter = new Hono();

// Whitelist de tabelas que podem ser acessadas via REST genérico
const ALLOWED_TABLES = new Set([
  "motos",
  "motorcycle_financials",
  "motorcycle_info",
  "motorcycle_documents",
  "motorcycle_buyer",
  "motorcycle_costs",
  "financial_expenses",
  "financial_sales",
  "financial_goals",
  "fixed_expenses",
]);

// Colunas permitidas em filtros — qualquer string sem caracteres especiais
const SAFE_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function checkTable(c, table) {
  if (!ALLOWED_TABLES.has(table)) {
    return c.json({ error: `tabela "${table}" não permitida` }, 400);
  }
  return null;
}

function checkIdent(name) {
  return SAFE_IDENT.test(name);
}

// Parse query params estilo Supabase REST:
//   col=eq.val  →  { col, op:"=", val }
//   col=gte.5   →  { col, op:">=", val: "5" }
// Ops suportados: eq, neq, gt, gte, lt, lte, like, ilike, in
const OPS = {
  eq: "=", neq: "<>",
  gt: ">", gte: ">=", lt: "<", lte: "<=",
  like: "LIKE", ilike: "ILIKE",
};

function parseFilters(c) {
  const filters = [];
  const reserved = new Set(["select", "order", "limit", "offset", "on_conflict"]);
  for (const [key, val] of new URLSearchParams(c.req.url.split("?")[1] || "")) {
    if (reserved.has(key)) continue;
    if (!checkIdent(key)) continue;
    const m = String(val).match(/^([a-z]+)\.(.+)$/);
    if (!m) continue;
    const op = OPS[m[1]];
    if (op) filters.push({ col: key, op, val: m[2] });
    else if (m[1] === "in") {
      const list = m[2].replace(/^\(/, "").replace(/\)$/, "").split(",");
      filters.push({ col: key, op: "IN", val: list });
    }
  }
  return filters;
}

function parseOrder(orderStr) {
  if (!orderStr) return [];
  return orderStr.split(",").map((part) => {
    const [col, dir] = part.split(".");
    if (!checkIdent(col)) return null;
    const direction = dir === "desc" ? "DESC" : "ASC";
    return `${col} ${direction}`;
  }).filter(Boolean);
}

function buildWhere(filters, startIdx = 1) {
  const conds = [];
  const params = [];
  let idx = startIdx;
  for (const f of filters) {
    if (f.op === "IN") {
      const placeholders = f.val.map(() => `$${idx++}`).join(",");
      conds.push(`${f.col} IN (${placeholders})`);
      params.push(...f.val);
    } else {
      conds.push(`${f.col} ${f.op} $${idx++}`);
      params.push(f.val);
    }
  }
  return { sql: conds.length ? "WHERE " + conds.join(" AND ") : "", params };
}

// ============================================================
// GET /api/db/:table — SELECT
// ============================================================
dbRouter.get("/:table", requireAuth(), async (c) => {
  const table = c.req.param("table");
  const err = checkTable(c, table); if (err) return err;

  const select = c.req.query("select") || "*";
  // Permite "col1,col2" ou "*"
  const cols = select === "*" ? "*"
    : select.split(",").every(checkIdent)
    ? select
    : "*";

  const filters = parseFilters(c);
  const { sql: whereSql, params } = buildWhere(filters);
  const orderArr = parseOrder(c.req.query("order"));
  const orderSql = orderArr.length ? "ORDER BY " + orderArr.join(", ") : "";
  const limit = Math.min(Number(c.req.query("limit")) || 1000, 5000);
  const offset = Math.max(Number(c.req.query("offset")) || 0, 0);

  const sql = `SELECT ${cols} FROM ${table} ${whereSql} ${orderSql} LIMIT ${limit} OFFSET ${offset}`;
  try {
    const r = await query(sql, params);
    return c.json(r.rows);
  } catch (e) {
    return c.json({ error: e.message, code: e.code }, 400);
  }
});

// ============================================================
// POST /api/db/:table — INSERT ou UPSERT
// ============================================================
dbRouter.post("/:table", requireAuth(), async (c) => {
  const table = c.req.param("table");
  const err = checkTable(c, table); if (err) return err;

  const onConflict = c.req.query("on_conflict"); // ex: "id" ou "month,year"
  const body = await c.req.json();
  const rows = Array.isArray(body) ? body : [body];
  if (!rows.length) return c.json([]);

  // Pega colunas do primeiro row (assume mesma forma pra todos)
  const cols = Object.keys(rows[0]).filter(checkIdent);
  if (!cols.length) return c.json({ error: "payload vazio" }, 400);

  const values = [];
  const placeholders = [];
  let idx = 1;
  for (const row of rows) {
    const rowPh = cols.map((col) => {
      const v = row[col];
      values.push(v === undefined ? null : (Array.isArray(v) || (v && typeof v === "object" && !(v instanceof Date)) ? JSON.stringify(v) : v));
      return `$${idx++}`;
    });
    placeholders.push(`(${rowPh.join(",")})`);
  }

  let sql = `INSERT INTO ${table} (${cols.join(",")}) VALUES ${placeholders.join(",")}`;
  if (onConflict) {
    const conflictCols = onConflict.split(",").filter(checkIdent);
    if (!conflictCols.length) return c.json({ error: "on_conflict inválido" }, 400);
    const updates = cols
      .filter((c) => !conflictCols.includes(c))
      .map((c) => `${c}=EXCLUDED.${c}`).join(",");
    sql += ` ON CONFLICT (${conflictCols.join(",")}) DO UPDATE SET ${updates || conflictCols[0] + "=EXCLUDED." + conflictCols[0]}`;
  }
  sql += " RETURNING *";

  try {
    const r = await query(sql, values);
    return c.json(r.rows);
  } catch (e) {
    return c.json({ error: e.message, code: e.code }, 400);
  }
});

// ============================================================
// PATCH /api/db/:table — UPDATE
// ============================================================
dbRouter.patch("/:table", requireAuth(), async (c) => {
  const table = c.req.param("table");
  const err = checkTable(c, table); if (err) return err;

  const filters = parseFilters(c);
  if (!filters.length) return c.json({ error: "UPDATE sem filtro é proibido" }, 400);

  const body = await c.req.json();
  const cols = Object.keys(body).filter(checkIdent);
  if (!cols.length) return c.json({ error: "payload vazio" }, 400);

  const setParts = [];
  const params = [];
  let idx = 1;
  for (const col of cols) {
    setParts.push(`${col}=$${idx++}`);
    const v = body[col];
    params.push(v === undefined ? null : (Array.isArray(v) || (v && typeof v === "object" && !(v instanceof Date)) ? JSON.stringify(v) : v));
  }
  const { sql: whereSql, params: whereParams } = buildWhere(filters, idx);
  params.push(...whereParams);

  const sql = `UPDATE ${table} SET ${setParts.join(",")} ${whereSql} RETURNING *`;
  try {
    const r = await query(sql, params);
    return c.json(r.rows);
  } catch (e) {
    return c.json({ error: e.message, code: e.code }, 400);
  }
});

// ============================================================
// DELETE /api/db/:table — DELETE
// ============================================================
dbRouter.delete("/:table", requireAuth(), async (c) => {
  const table = c.req.param("table");
  const err = checkTable(c, table); if (err) return err;

  const filters = parseFilters(c);
  if (!filters.length) return c.json({ error: "DELETE sem filtro é proibido" }, 400);

  const { sql: whereSql, params } = buildWhere(filters);
  const sql = `DELETE FROM ${table} ${whereSql} RETURNING *`;
  try {
    const r = await query(sql, params);
    return c.json(r.rows);
  } catch (e) {
    return c.json({ error: e.message, code: e.code }, 400);
  }
});
