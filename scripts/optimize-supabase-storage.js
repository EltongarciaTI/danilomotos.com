#!/usr/bin/env node
// ============================================================
// MIGRAÇÃO: comprime todas as fotos JÁ existentes no Supabase Storage
// ------------------------------------------------------------
// O que faz:
//  1) Lista todas as pastas em motos/
//  2) Para cada arquivo (capa.jpg, 1.jpg..4.jpg):
//     - Baixa
//     - Comprime com sharp
//     - Faz upload de volta (upsert) no MESMO path
//  3) Mostra resumo de bytes economizados
//
// Por que precisa do SERVICE_ROLE_KEY:
//  - O bucket é PÚBLICO pra leitura, mas o upload precisa de auth
//  - O ANON_KEY só funciona se o usuário estiver logado
//  - SERVICE_ROLE bypassa RLS — IDEAL pra script de manutenção
//
// Como rodar (uma vez só):
//  1) Pegue a SERVICE_ROLE no painel Supabase:
//     Settings > API > "service_role" (secret)
//  2) Salve em .env (NÃO COMMITE):
//     SUPABASE_URL=https://zhivqujoneqzviasioug.supabase.co
//     SUPABASE_SERVICE_ROLE=eyJ...
//  3) npm install
//  4) node scripts/optimize-supabase-storage.js
//
// Configurações de qualidade (alinhadas com a compressão do admin):
//  - capa.jpg     → max 1000x750, JPEG q=82
//  - {1..4}.jpg   → max 1280x960, JPEG q=80
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import sharp from "sharp";

// ─── 1. Configuração ───────────────────────────────────────
function loadEnv() {
  const envPath = ".env";
  if (existsSync(envPath)) {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || "https://zhivqujoneqzviasioug.supabase.co";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const BUCKET = "motos";
const DRY_RUN = process.argv.includes("--dry-run");
const ONLY_ID = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const SKIP_IF_SMALLER_THAN_KB = 250;

if (!SERVICE_ROLE) {
  console.error("\n❌ Faltou SUPABASE_SERVICE_ROLE em .env");
  console.error("    Pegue em: Supabase Dashboard > Settings > API > service_role\n");
  process.exit(1);
}

const HEADERS = {
  apikey: SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
};

// ─── 2. Helpers Storage ────────────────────────────────────
async function listFolders() {
  const url = `${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: "", limit: 1000, sortBy: { column: "name", order: "asc" } }),
  });
  if (!res.ok) throw new Error(`list folders: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.filter((d) => !d.id).map((d) => d.name);
}

async function listFiles(folder) {
  const url = `${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: folder, limit: 100, sortBy: { column: "name", order: "asc" } }),
  });
  if (!res.ok) throw new Error(`list ${folder}: ${res.status} ${await res.text()}`);
  return (await res.json()).filter((d) => d.id);
}

async function download(path) {
  const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${path}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function upload(path, buf) {
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      ...HEADERS,
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=2592000",
      "x-upsert": "true",
    },
    body: buf,
  });
  if (!res.ok) throw new Error(`upload ${path}: ${res.status} ${await res.text()}`);
}

// ─── 3. Otimização ─────────────────────────────────────────
function isCover(name) {
  return /^capa\.jpg$/i.test(name);
}

async function optimize(buf, cover) {
  return await sharp(buf)
    .rotate()
    .resize(cover ? { width: 1000, height: 750, fit: "inside" } : { width: 1280, height: 960, fit: "inside" })
    .jpeg({ quality: cover ? 82 : 80, mozjpeg: true, progressive: true })
    .toBuffer();
}

// ─── 4. Run ────────────────────────────────────────────────
async function main() {
  console.log("🔍 Listando pastas em", BUCKET);
  let folders = await listFolders();
  if (ONLY_ID) folders = folders.filter((f) => f === ONLY_ID);
  console.log(`   ${folders.length} pasta(s) encontrada(s)`);
  if (DRY_RUN) console.log("⚠️  DRY-RUN: nada será enviado de volta\n");

  let totalBefore = 0, totalAfter = 0, totalFiles = 0, skipped = 0, errors = 0;

  for (const folder of folders) {
    let files;
    try { files = await listFiles(folder); } catch (e) { console.error(`✗ ${folder}: ${e.message}`); errors++; continue; }

    for (const f of files) {
      const path = `${folder}/${f.name}`;
      if (!/\.(jpe?g|png|webp)$/i.test(f.name)) continue;

      const size = f.metadata?.size || 0;
      if (size > 0 && size < SKIP_IF_SMALLER_THAN_KB * 1024) {
        skipped++;
        console.log(`⏭  ${path.padEnd(50)} ${(size/1024).toFixed(0)}KB  (já pequeno, pulado)`);
        continue;
      }

      try {
        const inBuf = await download(path);
        const outBuf = await optimize(inBuf, isCover(f.name));
        const before = inBuf.length;
        const after = outBuf.length;

        if (after >= before) {
          skipped++;
          console.log(`⏭  ${path.padEnd(50)} ${(before/1024).toFixed(0)}KB  (compressão não ajudou)`);
          continue;
        }

        if (!DRY_RUN) await upload(path, outBuf);

        totalBefore += before;
        totalAfter += after;
        totalFiles++;
        const pct = ((1 - after / before) * 100).toFixed(0);
        console.log(`${DRY_RUN ? "↳ " : "✓ "}${path.padEnd(50)} ${(before/1024).toFixed(0)}KB → ${(after/1024).toFixed(0)}KB  (-${pct}%)`);
      } catch (e) {
        errors++;
        console.error(`✗ ${path}: ${e.message}`);
      }
    }
  }

  console.log("\n" + "─".repeat(70));
  console.log(`Arquivos otimizados: ${totalFiles}  ·  pulados: ${skipped}  ·  erros: ${errors}`);
  if (totalFiles) {
    const pct = ((1 - totalAfter / totalBefore) * 100).toFixed(0);
    console.log(`Tamanho: ${(totalBefore/1024/1024).toFixed(2)} MB → ${(totalAfter/1024/1024).toFixed(2)} MB  (-${pct}%)`);
    console.log(`Economia: ${((totalBefore - totalAfter)/1024/1024).toFixed(2)} MB`);
  }
  if (DRY_RUN) console.log("\n⚠️  Foi dry-run. Rode sem --dry-run pra aplicar.");
}

main().catch((e) => { console.error("\n❌ Erro fatal:", e); process.exit(1); });
