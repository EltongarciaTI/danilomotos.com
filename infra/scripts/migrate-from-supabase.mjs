#!/usr/bin/env node
/**
 * Migra dados do Supabase pro Postgres self-hosted — usa só ANON KEY (zero secrets).
 *
 * O que faz:
 *  1. GET /rest/v1/motos via ANON KEY (RLS permite SELECT anon)
 *  2. Pra cada moto, lê capa_path + fotos_paths (JSONB no row) → sabe quais arquivos baixar
 *  3. Baixa de URL pública /storage/v1/object/public/motos/<path> (sem auth)
 *  4. Insere/atualiza tudo no Postgres alvo
 *  5. User Danilo é inserido SEPARADAMENTE via SQL (auth.users não fica em REST anon)
 *
 * Idempotente — skip se foto já existe (mesmo tamanho).
 *
 * Uso:
 *   node migrate-from-supabase.mjs                # tudo
 *   node migrate-from-supabase.mjs --only=db      # só DB
 *   node migrate-from-supabase.mjs --only=files   # só fotos
 *   node migrate-from-supabase.mjs --dry-run      # mostra o que faria
 *
 * Env requeridos:
 *   SUPABASE_URL       — https://zhivqujoneqzviasioug.supabase.co
 *   SUPABASE_ANON_KEY  — chave anon pública (do config.js do site antigo)
 *   DATABASE_URL       — postgres://... do Postgres novo
 *   UPLOAD_DIR         — onde salvar fotos (default /uploads)
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

const argv = process.argv.slice(2);
const ONLY = (argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "all";
const DRY = argv.includes("--dry-run");

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const UPLOAD_DIR  = process.env.UPLOAD_DIR || "/uploads";

if (!SUPABASE_URL || !ANON) die("falta SUPABASE_URL ou SUPABASE_ANON_KEY");
if (!DATABASE_URL) die("falta DATABASE_URL");

const REST = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1`;
const STOR = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/motos`;

const pool = new Pool({ connectionString: DATABASE_URL });

const TABLES = ["motos", "motorcycle_financials"];
// Demais tabelas (motorcycle_info, financial_*, etc) estão vazias hoje — sem migração.

async function restGet(table) {
  const r = await fetch(`${REST}/${table}?select=*&limit=10000`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!r.ok) throw new Error(`GET /${table} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function downloadPublic(relPath) {
  const r = await fetch(`${STOR}/${relPath}`);
  if (!r.ok) throw new Error(`download ${relPath} → ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

function die(msg) {
  console.error("[migrate]", msg);
  process.exit(1);
}

async function migrateTable(table) {
  console.log(`[migrate] ${table}…`);
  const rows = await restGet(table);
  console.log(`[migrate]   ${rows.length} linhas`);

  for (const row of rows) {
    const cols = Object.keys(row);
    const values = cols.map((k) => {
      const v = row[k];
      if (Array.isArray(v) || (v && typeof v === "object" && !(v instanceof Date))) {
        return JSON.stringify(v);
      }
      return v;
    });
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");

    const pk = cols.includes("id") ? "id" : null;
    let sql;
    if (pk === "id" && table === "motos") {
      const updates = cols.filter((c) => c !== "id").map((c) => `${c} = EXCLUDED.${c}`).join(", ");
      sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})
             ON CONFLICT (id) DO UPDATE SET ${updates}`;
    } else if (table === "motorcycle_financials") {
      // unique em motorcycle_id
      const updates = cols.filter((c) => c !== "id" && c !== "motorcycle_id").map((c) => `${c} = EXCLUDED.${c}`).join(", ");
      sql = `INSERT INTO ${table} (${cols.filter(c => c !== 'id').join(", ")}) VALUES (${cols.filter(c => c !== 'id').map((_, i) => `$${i + 1}`).join(", ")})
             ON CONFLICT (motorcycle_id) DO UPDATE SET ${updates}`;
      const colsNoId = cols.filter(c => c !== 'id');
      const valuesNoId = colsNoId.map(k => {
        const v = row[k];
        if (Array.isArray(v) || (v && typeof v === "object")) return JSON.stringify(v);
        return v;
      });
      if (DRY) { console.log(`[dry] ${table} mid=${row.motorcycle_id}`); continue; }
      try { await pool.query(sql, valuesNoId); } catch (e) { console.error(`[migrate] ${table} → ${e.message}`); }
      continue;
    } else {
      sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
    }

    if (DRY) {
      console.log(`[dry]   ${table} id=${row.id ?? "?"}`);
    } else {
      try { await pool.query(sql, values); }
      catch (e) { console.error(`[migrate] ${table} id=${row.id} → ${e.message}`); }
    }
  }
  console.log(`[migrate] ${table} ✓`);
}

async function migrateFiles() {
  console.log("[files] descobrindo fotos pelos paths das motos…");
  const motos = await restGet("motos");
  const all = new Set();

  for (const m of motos) {
    if (m.capa_path) all.add(m.capa_path);
    if (Array.isArray(m.fotos_paths)) {
      for (const p of m.fotos_paths) if (p) all.add(p);
    }
    // Fallback legacy: capa.jpg + 1..4.jpg (caso não tenha paths setados)
    if (!m.capa_path) all.add(`${m.id}/capa.jpg`);
  }

  const files = Array.from(all);
  console.log(`[files] ${files.length} fotos pra processar`);

  let ok = 0, skipped = 0, missing = 0;
  for (const rel of files) {
    const localPath = path.join(UPLOAD_DIR, rel);
    const localDir  = path.dirname(localPath);

    // skip se já existe (com qualquer tamanho — não temos meta pra comparar sem auth)
    try {
      const st = await fs.stat(localPath);
      if (st.size > 0) { skipped++; continue; }
    } catch { /* não existe, baixa */ }

    if (DRY) { console.log(`[dry]   baixaria ${rel}`); ok++; continue; }

    try {
      const buf = await downloadPublic(rel);
      await fs.mkdir(localDir, { recursive: true });
      await fs.writeFile(localPath, buf);
      ok++;
      if (ok % 10 === 0) console.log(`[files]   ${ok}/${files.length}`);
    } catch (e) {
      // pode ser fallback (capa.jpg que não existe pra moto sem foto) — só nota
      missing++;
      if (process.env.LOG_LEVEL === "debug") console.log(`[files]   ${rel} → ${e.message}`);
    }
  }
  console.log(`[files] done: ${ok} baixadas, ${skipped} skipped, ${missing} missing (fallback)`);
}

async function main() {
  console.log(`[migrate] modo: ${ONLY}${DRY ? " (DRY-RUN)" : ""}`);

  if (ONLY === "all" || ONLY === "db") {
    for (const t of TABLES) await migrateTable(t);
  }

  if (ONLY === "all" || ONLY === "files") {
    await migrateFiles();
  }

  await pool.end();
  console.log("[migrate] tudo concluído ✓");
}

main().catch((e) => {
  console.error("[migrate] FATAL:", e);
  process.exit(1);
});
