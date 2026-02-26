// assets/js/admin.js
// ======================================================
// DANILO MOTOS — ADMIN (Painel)
// ------------------------------------------------------
// - Login / Logout (Supabase Auth)
// - CRUD da moto (tabela "motos")
// - Upload / substituição de fotos via Cloudflare Worker -> GitHub (GitHub Pages como CDN)
// - Remoção de fotos (individual / manter só capa ao vender / apagar tudo ao deletar moto) via Worker
// ======================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./data.js";

// ======================================================
// ===== CONFIG
// ======================================================

// Base do Worker (ajuste se mudar o domínio do Worker)
const WORKER_BASE = "https://blue-salad-b6ae.eltonng645.workers.dev";

// Endpoints do Worker
const IMG_UPLOAD_ENDPOINT = `${WORKER_BASE}/upload`;  // multipart/form-data: file, moto_id, filename
const IMG_LIST_ENDPOINT   = `${WORKER_BASE}/list`;    // GET ?moto_id=...
const IMG_DELETE_ENDPOINT = `${WORKER_BASE}/delete`;  // POST json: {moto_id, mode, filename?}



// Endpoint batch (múltiplos arquivos em 1 request)
const IMG_UPLOAD_BATCH_ENDPOINT = `${WORKER_BASE}/upload-batch`; // multipart/form-data: moto_id, file0+path0, file1+path1, ...

// Config de otimização (client-side) — mantém qualidade e acelera upload
const IMG_MAX_W = 1600;     // largura máxima
const IMG_QUALITY = 0.82;   // 0..1 (jpeg)
const UPLOAD_CONCURRENCY = 3; // fallback parallel
// Base pública (GitHub Pages)
const SITE_IMG_BASE = "https://danilomotos.com/assets/img/motos";

// Client Supabase (Auth + Database)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ======================================================
// ===== HELPERS (DOM / MSG / FORMATAÇÃO)
// ======================================================

function $(id) {
  return document.getElementById(id);
}

const els = {
  // dashboard
  dashGrid: $("dashGrid"),
  dashMsg: $("dashMsg"),

  // fotos (multi-upload)
  multiFotos: $("multiFotos"),

  // auth
  loginBox: $("loginBox"),
  appBox: $("appBox"),
  email: $("email"),
  senha: $("senha"),
  btnLogin: $("btnLogin"),
  btnLogout: $("btnLogout"),
  loginMsg: $("loginMsg"),

  // formulário da moto
  motoSelect: $("motoSelect"),
  id: $("id"),
  ordem: $("ordem"),
  status: $("status"),
  titulo: $("titulo"),
  preco: $("preco"),
  ano: $("ano"),
  km: $("km"),
  cor: $("cor"),
  cilindrada: $("cilindrada"),
  combustivel: $("combustivel"),
  partida: $("partida"),
  youtube: $("youtube"),
  observacoes: $("observacoes"),
  emplacada: $("emplacada"),

  // botões CRUD
  btnSalvar: $("btnSalvar"),
  btnNova: $("btnNova"),
  btnApagar: $("btnApagar"),
  saveMsg: $("saveMsg"),

  // grid de fotos
  fotosGrid: $("fotosGrid"),
  fotoMsg: $("fotoMsg"),
};

let motosCache = [];
let currentMoto = null;

function msg(el, text, type = "") {
  if (!el) return;
  el.className = "hint " + (type === "ok" ? "ok" : type === "err" ? "err" : "");
  el.textContent = text || "";
}

function cleanId(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "-")
    .replace(/[^\w-]/g, "");
}

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

function formatKmBR(value) {
  const digits = onlyDigits(value);
  if (!digits) return "";
  return Number(digits).toLocaleString("pt-BR");
}

function formatPrecoBR(value) {
  const digits = onlyDigits(value);
  if (!digits) return "";
  const n = Number(digits);
  return "R$ " + n.toLocaleString("pt-BR");
}

// ======================================================
// ===== IMAGEM (otimização client-side para upload rápido)
// ======================================================

async function optimizeImage(file, { maxW = IMG_MAX_W, quality = IMG_QUALITY } = {}) {
  if (!file) return file;

  // Se não for imagem, envia como está (não deve ocorrer)
  if (!file.type?.startsWith("image/")) return file;

  // Heurística: se já for pequeno (<300KB), não mexe
  if (file.size && file.size < 300 * 1024) return file;

  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;

  const w = bmp.width || 0;
  const h = bmp.height || 0;
  if (!w || !h) return file;

  const scale = Math.min(1, maxW / w);
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.drawImage(bmp, 0, 0, outW, outH);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) return file;

  // preserva nome "base" (o Worker escolhe o nome final pelo path)
  return new File([blob], (file.name || "foto")?.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

async function runWithConcurrency(items, limit, workerFn) {
  const results = new Array(items.length);
  let next = 0;

  async function runner() {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await workerFn(items[i]);
    }
  }

  const n = Math.max(1, Math.min(limit || 1, items.length || 1));
  await Promise.all(Array.from({ length: n }, runner));
  return results;
}


// ======================================================
// ===== AUTH (SUPABASE)
// ======================================================

async function login() {
  try {
    msg(els.loginMsg, "Entrando...");
    const email = String(els.email?.value || "").trim();
    const senha = String(els.senha?.value || "").trim();

    if (!email || !senha) {
      msg(els.loginMsg, "Informe email e senha.", "err");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) throw error;

    msg(els.loginMsg, "Login ok ✅", "ok");
    await refreshSessionUI();
  } catch (e) {
    console.error(e);
    msg(els.loginMsg, "Erro no login: " + (e?.message || String(e)), "err");
  }
}

async function logout() {
  try {
    await supabase.auth.signOut();
  } finally {
    await refreshSessionUI();
  }
}

async function refreshSessionUI() {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;

  if (session) {
    if (els.loginBox) els.loginBox.style.display = "none";
    if (els.appBox) els.appBox.style.display = "block";
    try {
      await loadMotos();
    } catch (e) {
      console.error(e);
      msg(els.dashMsg, "Logado, mas não consegui carregar as motos: " + (e?.message || String(e)), "err");
    }
  } else {
    if (els.appBox) els.appBox.style.display = "none";
    if (els.loginBox) els.loginBox.style.display = "block";
  }
}

// ======================================================
// ===== WORKER (LIST / DELETE / UPLOAD)
// ======================================================

function publicUrl(path) {
  return `${SITE_IMG_BASE}/${path}`;
}

function publicUrlV(path) {
  return `${publicUrl(path)}?v=${Date.now()}`;
}

function fotosSlots(id) {
  return [
    { key: "capa", filename: "capa.jpg" },
    ...Array.from({ length: 4 }).map((_, i) => ({
      key: String(i + 1),
      filename: `${i + 1}.jpg`,
    })),
  ].map((s) => ({ ...s, path: `${id}/${s.filename}` }));
}

async function listMotoFiles(motoId) {
  const res = await fetch(`${IMG_LIST_ENDPOINT}?moto_id=${encodeURIComponent(motoId)}`, { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data.files || [];
}

// mode:
// - "keep_cover"  => apaga tudo exceto capa.jpg
// - "delete_all"  => apaga tudo
// - "delete_one"  => apaga um arquivo (precisa filename)
async function deleteWorker(motoId, mode, filename = "") {
  const payload = { moto_id: motoId, mode };
  if (filename) payload.filename = filename;

  const res = await fetch(IMG_DELETE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

async function deleteAllExceptCover(motoId) {
  const data = await deleteWorker(motoId, "keep_cover");
  return { deleted: data.deleted || 0 };
}

async function deleteAllMotoFiles(motoId) {
  const data = await deleteWorker(motoId, "delete_all");
  return { deleted: data.deleted || 0 };
}

async function deleteSingleFile(motoId, filename) {
  const data = await deleteWorker(motoId, "delete_one", filename);
  return { deleted: data.deleted || 0 };
}

async function touchUpdatedAt(motoId) {
  try {
    await supabase
      .from("motos")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", motoId);
  } catch {
    // ignora se a coluna não existir
  }
}

async function uploadBatch(motoId, entries) {
  const form = new FormData();
  form.append("moto_id", motoId);

  entries.forEach((e, i) => {
    form.append(`path${i}`, e.path);
    form.append(`file${i}`, e.file);
  });

  const res = await fetch(IMG_UPLOAD_BATCH_ENDPOINT, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.ok) {
    const errMsg = data?.error || `HTTP ${res.status}`;
    throw new Error(errMsg);
  }
  return data;
}

async function uploadSingleToPath(path, file) {
  const [motoId, filename] = String(path || "").split("/");
  if (!motoId || !filename) throw new Error("Path inválido para upload: " + path);

  const optimized = await optimizeImage(file);
  const form = new FormData();
  form.append("file", optimized);
  form.append("moto_id", motoId);
  form.append("filename", filename);

  const res = await fetch(IMG_UPLOAD_ENDPOINT, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.ok) {
    const errMsg = data?.error || `HTTP ${res.status}`;
    throw new Error(errMsg);
  }
  return data;
}

async function handleMultiUpload(fileList) {
  const id = cleanId(els.id?.value);
  if (!id) {
    msg(els.fotoMsg, "Informe o ID antes de enviar fotos.", "err");
    return;
  }

  const files = Array.from(fileList || []).filter(Boolean);
  if (!files.length) return;

  const picked = files.slice(0, 5);
  const targets = [
    `${id}/capa.jpg`,
    `${id}/1.jpg`,
    `${id}/2.jpg`,
    `${id}/3.jpg`,
    `${id}/4.jpg`,
  ].slice(0, picked.length);

  msg(els.fotoMsg, `Otimizando ${picked.length} foto(s)...`);

  // Otimiza em paralelo (rápido) antes de subir
  const optimizedFiles = await Promise.all(picked.map((f) => optimizeImage(f)));

  const entries = targets.map((path, i) => ({ path, file: optimizedFiles[i] }));

  // 1) tenta batch (1 request só) — mais rápido
  try {
    msg(els.fotoMsg, `Enviando ${picked.length} foto(s) (rápido)...`);
    await uploadBatch(id, entries);
  } catch (e) {
    console.warn("Batch falhou, usando fallback paralelo:", e?.message || e);

    // 2) fallback: uploads em paralelo com concorrência controlada
    msg(els.fotoMsg, `Enviando ${picked.length} foto(s)...`);
    await runWithConcurrency(entries, UPLOAD_CONCURRENCY, async (it) => {
      await uploadSingleToPath(it.path, it.file);
    });
  }

  await touchUpdatedAt(id);
  msg(els.fotoMsg, "Fotos enviadas ✅", "ok");
  await renderFotosGrid(id);
}

// ======================================================
// ===== GRID DE FOTOS (PREVIEW + BOTÕES)
// ======================================================

async function renderFotosGrid(id) {
  if (!els.fotosGrid) return;

  if (!id) {
    els.fotosGrid.innerHTML = "";
    msg(els.fotoMsg, "");
    return;
  }

  const slots = fotosSlots(id);
  const v = Date.now();

  els.fotosGrid.innerHTML = slots
    .map(({ key, filename, path }) => {
      const label = key === "capa" ? "Capa" : `Foto ${key}`;
      const src = `${SITE_IMG_BASE}/${path}?v=${v}`;
      return `
        <div class="fotoSlot box">
          <div class="fotoSlotHead">
            <strong>${label}</strong>
            <small class="muted">${filename}</small>
          </div>

          <div class="fotoSlotPreview">
            <img src="${src}" alt="${label}" loading="lazy"
              onerror="this.style.display='none'; this.parentElement.classList.add('noimg');">
            <div class="noimgTxt">Sem foto</div>
          </div>

          <div class="fotoSlotActions">
            <label class="btn small">
              Enviar/Substituir
              <input type="file" accept="image/*" data-path="${path}" style="display:none">
            </label>
            <button class="btn small danger" type="button" data-del="${filename}">Apagar</button>
          </div>
        </div>
      `;
    })
    .join("");

  // listeners upload
  els.fotosGrid.querySelectorAll("input[type=file][data-path]").forEach((inp) => {
    inp.addEventListener("change", async (ev) => {
      const file = ev.target.files?.[0];
      const path = ev.target.getAttribute("data-path");
      if (!file || !path) return;

      try {
        await uploadSingleToPath(path, file);
        await touchUpdatedAt(id);
        await renderFotosGrid(id);
      } catch (e) {
        console.error(e);
        msg(els.fotoMsg, "Erro: " + (e?.message || String(e)), "err");
      } finally {
        ev.target.value = "";
      }
    });
  });

  // listeners delete
  els.fotosGrid.querySelectorAll("button[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const filename = btn.getAttribute("data-del");
      if (!filename) return;
      if (!confirm(`Apagar ${filename}?`)) return;

      try {
        msg(els.fotoMsg, "Apagando foto...");
        const { deleted } = await deleteSingleFile(id, filename);
        msg(els.fotoMsg, `Foto apagada ✅ (${deleted})`, "ok");
        await touchUpdatedAt(id);
        await renderFotosGrid(id);
      } catch (e) {
        console.error(e);
        msg(els.fotoMsg, "Erro ao apagar: " + (e?.message || String(e)), "err");
      }
    });
  });
}

// ======================================================
// ===== CRUD (SUPABASE DB)
// ======================================================

function readForm() {
  const id = cleanId(els.id?.value);
  return {
    id,
    ordem: els.ordem?.value ? Number(onlyDigits(els.ordem.value)) : null,
    status: els.status?.value || "disponivel",
    titulo: String(els.titulo?.value || "").trim(),
    preco: onlyDigits(els.preco?.value),
    ano: String(els.ano?.value || "").trim(),
    km: onlyDigits(els.km?.value),
    cor: String(els.cor?.value || "").trim(),
    cilindrada: String(els.cilindrada?.value || "").trim(),
    combustivel: String(els.combustivel?.value || "").trim(),
    partida: String(els.partida?.value || "").trim(),
    youtube: String(els.youtube?.value || "").trim(),
    observacoes: String(els.observacoes?.value || "").trim(),
    emplacada: !!(els.emplacada?.checked),
  };
}

function fillForm(m) {
  currentMoto = m || null;
  if (!m) return;

  if (els.id) els.id.value = m.id || "";
  if (els.ordem) els.ordem.value = m.ordem ?? "";
  if (els.status) els.status.value = m.status || "disponivel";
  if (els.titulo) els.titulo.value = m.titulo || "";
  if (els.preco) els.preco.value = m.preco ? formatPrecoBR(m.preco) : "";
  if (els.ano) els.ano.value = m.ano || "";
  if (els.km) els.km.value = m.km ? formatKmBR(m.km) : "";
  if (els.cor) els.cor.value = m.cor || "";
  if (els.cilindrada) els.cilindrada.value = m.cilindrada || "";
  if (els.combustivel) els.combustivel.value = m.combustivel || "";
  if (els.partida) els.partida.value = m.partida || "";
  if (els.youtube) els.youtube.value = m.youtube || "";
  if (els.observacoes) els.observacoes.value = m.observacoes || "";
  if (els.emplacada) els.emplacada.checked = !!m.emplacada;

  renderFotosGrid(m.id);
}

function clearForm() {
  currentMoto = null;
  [
    "id","ordem","titulo","preco","ano","km","cor","cilindrada","combustivel","partida","youtube","observacoes"
  ].forEach((k) => { if (els[k]) els[k].value = ""; });
  if (els.status) els.status.value = "disponivel";
  if (els.emplacada) els.emplacada.checked = false;
  if (els.fotosGrid) els.fotosGrid.innerHTML = "";
  msg(els.saveMsg, "");
  msg(els.fotoMsg, "");
}

async function loadMotos() {
  try {
    msg(els.dashMsg, "Carregando motos...");
    let data, error;

    // Primeiro tenta ordenar por "ordem" e depois por "created_at" (se existir).
    ({ data, error } = await supabase
      .from("motos")
      .select("*")
      .order("ordem", { ascending: true })
      .order("created_at", { ascending: false }));

    // Se a coluna created_at não existir, faz fallback sem ela (evita travar o admin).
    if (error && String(error.message || "").toLowerCase().includes("created_at")) {
      console.warn("Coluna created_at não existe. Fazendo fallback de ordenação...", error);
      ({ data, error } = await supabase
        .from("motos")
        .select("*")
        .order("ordem", { ascending: true }));
    }

    if (error) throw error;
    motosCache = data || [];

    // select
    if (els.motoSelect) {
      els.motoSelect.innerHTML =
        `<option value="">+ Criar nova</option>` +
        motosCache.map((m) => `<option value="${m.id}">${m.titulo || m.id}</option>`).join("");
    }

    // dashboard simples
    if (els.dashGrid) {
      els.dashGrid.innerHTML = motosCache
        .map((m) => {
          const cover = publicUrlV(`${m.id}/capa.jpg`);
          const status = m.status || "disponivel";
          return `
            <div class="cardMoto box" data-id="${m.id}">
              <img src="${cover}" alt="${m.titulo || m.id}" loading="lazy"
                onerror="this.style.display='none';">
              <div class="cardMotoBody">
                <strong>${m.titulo || m.id}</strong>
                <div class="muted">${status}</div>
              </div>
            </div>
          `;
        })
        .join("");

      els.dashGrid.querySelectorAll("[data-id]").forEach((card) => {
        card.addEventListener("click", () => {
          const id = card.getAttribute("data-id");
          const m = motosCache.find((x) => x.id === id);
          if (m) fillForm(m);
          if (els.motoSelect) els.motoSelect.value = id;
        });
      });
    }

    msg(els.dashMsg, `Motos: ${motosCache.length}`, "ok");
  } catch (e) {
    console.error(e);
    msg(els.dashMsg, "Erro ao carregar motos: " + (e?.message || String(e)), "err");
  }
}

async function novaMoto() {
  clearForm();
  if (els.id) els.id.focus();
}

async function salvar() {
  try {
    const payload = readForm();
    if (!payload.id) {
      msg(els.saveMsg, "Informe um ID válido.", "err");
      return;
    }

    msg(els.saveMsg, "Salvando...");
    // upsert: cria ou atualiza
    const { error } = await supabase.from("motos").upsert(payload, { onConflict: "id" });
    if (error) throw error;

    msg(els.saveMsg, "Salvo ✅", "ok");
    await loadMotos();

    // Se marcou como vendida, mantém só a capa (economiza banda e evita foto antiga)
    if (payload.status === "vendida") {
      try {
        msg(els.saveMsg, "Vendida: mantendo só a capa...");
        await deleteAllExceptCover(payload.id);
        await touchUpdatedAt(payload.id);
        await renderFotosGrid(payload.id);
      } catch (e) {
        console.warn("Falha ao limpar fotos (vendida):", e);
      }
    }

    // re-seleciona
    const m = motosCache.find((x) => x.id === payload.id);
    if (m) fillForm(m);
    if (els.motoSelect) els.motoSelect.value = payload.id;
  } catch (e) {
    console.error(e);
    msg(els.saveMsg, "Erro ao salvar: " + (e?.message || String(e)), "err");
  }
}

async function apagarMoto() {
  const id = cleanId(els.id?.value);
  if (!id) return;

  const ok = confirm("Apagar esta moto do banco e remover TODAS as fotos?");
  if (!ok) return;

  try {
    msg(els.saveMsg, "Apagando...");
    // delete DB
    const { error } = await supabase.from("motos").delete().eq("id", id);
    if (error) throw error;

    // delete imagens via worker
    msg(els.fotoMsg, "Apagando fotos...");
    await deleteAllMotoFiles(id);

    msg(els.saveMsg, "Moto apagada ✅", "ok");
    clearForm();
    await loadMotos();
  } catch (e) {
    console.error(e);
    msg(els.saveMsg, "Erro ao apagar: " + (e?.message || String(e)), "err");
  }
}

// ======================================================
// ===== EVENTOS (bind)
// ======================================================

function bind() {
  // Multi-upload (capa + 1..4)
  if (els.multiFotos) {
    els.multiFotos.addEventListener("change", async () => {
      await handleMultiUpload(els.multiFotos.files);
      els.multiFotos.value = "";
    });
  }

  // Login / logout
  if (els.btnLogin) els.btnLogin.addEventListener("click", login);
  if (els.btnLogout) els.btnLogout.addEventListener("click", logout);

  // CRUD
  if (els.btnSalvar) els.btnSalvar.addEventListener("click", salvar);
  if (els.btnNova) els.btnNova.addEventListener("click", novaMoto);
  if (els.btnApagar) els.btnApagar.addEventListener("click", apagarMoto);

  // Seleção de moto no select
  if (els.motoSelect) {
    els.motoSelect.addEventListener("change", () => {
      const id = els.motoSelect.value;
      if (!id) {
        novaMoto();
        return;
      }
      const m = motosCache.find((x) => x.id === id);
      if (m) fillForm(m);
    });
  }

  // máscara de km
  if (els.km) {
    els.km.addEventListener("input", () => {
      els.km.value = formatKmBR(els.km.value);
    });
  }

  // máscara de preço
  if (els.preco) {
    els.preco.addEventListener("input", () => {
      els.preco.value = formatPrecoBR(els.preco.value);
    });
  }

  // Quando muda status: se virar "vendida", apaga fotos extras (fica só capa)
  if (els.status) {
    els.status.addEventListener("change", async () => {
      const id = cleanId(els.id?.value);
      if (!id) return;

      if (els.status.value === "vendida") {
        const ok = confirm("Marcar como VENDIDA e apagar todas as fotos extras (ficando só a capa)?");
        if (!ok) return;

        try {
          msg(els.fotoMsg, "Apagando fotos extras...");
          const { deleted } = await deleteAllExceptCover(id);
          msg(els.fotoMsg, `Fotos extras removidas ✅ (${deleted})`, "ok");
          await touchUpdatedAt(id);
          await renderFotosGrid(id);
        } catch (e) {
          console.error(e);
          msg(els.fotoMsg, "Erro ao apagar fotos: " + (e?.message || String(e)), "err");
        }
      }
    });
  }
}

// ======================================================
// ===== STARTUP
// ======================================================

bind();
refreshSessionUI();
