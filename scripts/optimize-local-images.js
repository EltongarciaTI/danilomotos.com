#!/usr/bin/env node
// Comprime todas as imagens em assets/img/motos/
// - Capa: max 800x600, jpeg quality 80
// - Fotos extras: max 1280x960, jpeg quality 80
// Sobrescreve o arquivo original.

import { readdir, stat, writeFile, readFile } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import sharp from "sharp";

const ROOT = new URL("../assets/img/motos/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    const s = await stat(p);
    if (s.isDirectory()) out.push(...(await walk(p)));
    else if (/\.(jpe?g|png)$/i.test(name)) out.push(p);
  }
  return out;
}

function isCover(path) {
  return /capa\.jpg$/i.test(basename(path));
}

async function optimize(path) {
  const inputBuf = await readFile(path);
  const before = inputBuf.length;
  const outBuf = await sharp(inputBuf)
    .rotate()
    .resize(isCover(path) ? { width: 800, height: 600, fit: "cover" } : { width: 1280, height: 960, fit: "inside" })
    .jpeg({ quality: 80, mozjpeg: true, progressive: true })
    .toBuffer();
  await writeFile(path, outBuf);
  return { before, after: outBuf.length };
}

async function main() {
  console.log("Buscando imagens em", ROOT);
  const files = await walk(ROOT);
  console.log(`Encontradas ${files.length} imagens.`);

  let totalBefore = 0, totalAfter = 0;
  for (const f of files) {
    try {
      const { before, after } = await optimize(f);
      totalBefore += before;
      totalAfter += after;
      const pct = ((1 - after / before) * 100).toFixed(0);
      console.log(`✓ ${basename(f).padEnd(20)} ${(before/1024).toFixed(0)}KB → ${(after/1024).toFixed(0)}KB  (-${pct}%)  [${f.replace(ROOT, "")}]`);
    } catch (e) {
      console.error(`✗ ${f}: ${e.message}`);
    }
  }

  const pctTotal = ((1 - totalAfter / totalBefore) * 100).toFixed(0);
  console.log(`\nTOTAL: ${(totalBefore/1024/1024).toFixed(2)}MB → ${(totalAfter/1024/1024).toFixed(2)}MB  (-${pctTotal}%)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
