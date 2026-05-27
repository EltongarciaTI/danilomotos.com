// assets/js/admin.js
// ======================================================
// DANILO MOTOS — ADMIN (Painel)
// ------------------------------------------------------
// O que este arquivo faz:
// - Login / Logout (Supabase Auth)
// - CRUD da moto (criar/editar/apagar no banco "motos")
// - Upload de fotos para Supabase Storage (bucket "motos")
// - Remover fotos individualmente
// - Ao marcar como "vendida": apaga TODAS as fotos extras, deixa só "capa.jpg"
// - Preview de fotos com cache-bust (?v=timestamp) pra mostrar a imagem nova na hora
// ======================================================

// API self-hosted (substituiu @supabase/supabase-js — interface drop-in)
import { createClient } from "./api.js?v=20260526";
import { API_BASE, STORAGE_PUBLIC_BASE } from "./config.js?v=20260526";

// Mantido só pra logs/strings de erro mais claros
const SUPABASE_URL = API_BASE;
const SUPABASE_ANON_KEY = "";
const BUCKET = "motos"; // mantido pra paridade de interface

// Cria o client (wrapper local — mesma API: auth, from, storage)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ======================================================
// ===== HELPERS BÁSICOS (DOM / MSG / FORMATAÇÃO)
// ======================================================

// Seletor simples por ID (mais prático)
function $(id) {
  return document.getElementById(id);
}

// Centraliza todos os elementos do HTML para fácil manutenção
// (se mudar algum ID no HTML, ajusta aqui)
const els = {
  // dashboard
  dashGrid: $("dashGrid"),
  dashMsg: $("dashMsg"),
  motosCards: $("motosCards"),

  // fotos (multi-upload)
  multiFotos: $("multiFotos"),

  // auth
  loginSection: $("loginSection"),
  loginBox: $("loginBox"),
  appBox: $("appBox"),
  email: $("email"),
  senha: $("senha"),
  btnLogin: $("btnLogin"),
  btnLogout: $("btnLogout"),
  loginMsg: $("loginMsg"),

  // formulário da moto
  motoSelect: $("motoSelect"),
  buscaMoto: $("buscaMoto"),
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

  // cadastro rápido
  txtRapido: $("txtRapido"),
  btnPreencher: $("btnPreencher"),
  btnLimparRapido: $("btnLimparRapido"),
  btnConferir: $("btnConferir"),
  rapidoMsg: $("rapidoMsg"),
};

// cache local de motos (pra não ficar consultando toda hora)
let motosCache = [];
let allowedStatusSet = null;

let _currentMoto = null;
let idManuallyEdited = false;

// ======================================================
// ===== STAGING DE FOTOS (modelo "review → salvar")
// ======================================================
// Estrutura: { "<id>/capa.jpg": { type:"upload", file:File, previewUrl:string } | { type:"delete" } }
// Mudanças locais (não persistidas). Botão "Salvar" no UI executa tudo.
let pendingPhotos = {};
function clearPendingPhotos() {
  // Revoga as object URLs locais pra liberar memória
  Object.values(pendingPhotos).forEach((ch) => {
    if (ch && ch.previewUrl) URL.revokeObjectURL(ch.previewUrl);
  });
  pendingPhotos = {};
}
function pendingCount() { return Object.keys(pendingPhotos).length; }

// Mostra mensagens (ok/err/normal)
function msg(el, text, type = "") {
  if (!el) return;
  el.className = "hint " + (type === "ok" ? "ok" : type === "err" ? "err" : "");
  el.textContent = text || "";
}

// ======================================================
// ===== ICONES SVG (Heroicons outline, sem dependência externa)
// ======================================================
const ICONS = {
  save:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
  trash:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>',
  swap:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>',
  undo:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 00-4-4H4"/></svg>',
  plus:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  camera:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  check:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  alert:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  x:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  arrowL:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  image:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  spinner: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="animation:dmSpin 1s linear infinite"><circle cx="12" cy="12" r="9" stroke-opacity=".25"/><path d="M21 12a9 9 0 01-9 9"/></svg>',
  // Icones de ação dos cards
  pencil:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  eye:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>',
  dollar:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
};
function icon(name, size = 16) {
  const svg = ICONS[name] || "";
  return svg.replace("<svg ", `<svg width="${size}" height="${size}" `);
}
// Animação do spinner (injetada uma única vez)
if (typeof document !== "undefined" && !document.getElementById("__dmIconStyles")) {
  const st = document.createElement("style");
  st.id = "__dmIconStyles";
  st.textContent = "@keyframes dmSpin{to{transform:rotate(360deg)}}";
  document.head.appendChild(st);
}

// ======================================================
// ===== MODAL DE CONFIRMAÇÃO (substitui confirm() nativo)
// ======================================================
function confirmDialog({ title, message, confirmText = "Confirmar", cancelText = "Cancelar", danger = false } = {}) {
  return new Promise((resolve) => {
    // Overlay backdrop
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:99998;display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .15s ease;backdrop-filter:blur(2px);";

    // Modal box
    const box = document.createElement("div");
    box.style.cssText = "background:#1a1c20;border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:28px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.6);transform:scale(.95);transition:transform .15s ease;color:#e8e9ec;";

    const titleHtml = title ? `<h3 style="margin:0 0 12px;font-size:18px;font-weight:700;color:${danger ? "#ff6b6b" : "#fff"}">${title}</h3>` : "";
    const msgHtml = `<p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#c5c8cd;white-space:pre-line">${message}</p>`;
    const actionsHtml = `
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="__cancel" style="background:transparent;border:1px solid rgba(255,255,255,.15);color:#c5c8cd;padding:10px 18px;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px">${cancelText}</button>
        <button class="__confirm" style="background:${danger ? "#dc2626" : "#16a34a"};border:none;color:#fff;padding:10px 18px;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px">${confirmText}</button>
      </div>`;
    box.innerHTML = titleHtml + msgHtml + actionsHtml;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Animar entrada
    requestAnimationFrame(() => { overlay.style.opacity = "1"; box.style.transform = "scale(1)"; });

    const close = (result) => {
      overlay.style.opacity = "0";
      box.style.transform = "scale(.95)";
      setTimeout(() => { overlay.remove(); resolve(result); }, 150);
    };

    box.querySelector(".__confirm").addEventListener("click", () => close(true));
    box.querySelector(".__cancel").addEventListener("click", () => close(false));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
    const onKey = (e) => {
      if (e.key === "Escape") { close(false); document.removeEventListener("keydown", onKey); }
      if (e.key === "Enter")  { close(true);  document.removeEventListener("keydown", onKey); }
    };
    document.addEventListener("keydown", onKey);
    setTimeout(() => box.querySelector(".__confirm").focus(), 200);
  });
}

// ======================================================
// ===== TOAST (feedback flutuante, autodissolve em 2s)
// ======================================================
function toast(text, type = "ok") {
  let host = document.getElementById("__dmToastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "__dmToastHost";
    host.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;";
    document.body.appendChild(host);
  }
  const t = document.createElement("div");
  const colors = type === "err"
    ? "background:#dc2626;color:#fff;"
    : type === "warn"
    ? "background:#f59e0b;color:#000;"
    : "background:#16a34a;color:#fff;";
  t.style.cssText = `${colors}padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.35);opacity:0;transform:translateY(-12px);transition:all .25s ease;pointer-events:auto;`;
  t.textContent = text;
  host.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "translateY(0)"; });
  setTimeout(() => {
    t.style.opacity = "0"; t.style.transform = "translateY(-12px)";
    setTimeout(() => t.remove(), 250);
  }, 2200);
}


// ======================================================
// ===== FILTRO / BUSCA (Select de motos)
// ======================================================

let filtroStatus = "todas";

function renderMotoSelect() {
  if (!els.motoSelect) return;

  const term = String(els.buscaMoto?.value || "").trim().toLowerCase();

  const list = motosCache
    .filter((m) => {
      const st = String(m.status || "ativo").toLowerCase();
      if (filtroStatus !== "todas" && st !== filtroStatus) return false;
      if (!term) return true;
      const hay = `${m.id || ""} ${m.titulo || ""}`.toLowerCase();
      return hay.includes(term);
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id), "pt-BR", { numeric: true }));

  let options = "";

  // Se estiver em "todas" e sem busca, agrupa por status para ficar mais fácil achar.
  if (filtroStatus === "todas" && !term) {
   const labelMap = {
  ativo: "ATIVAS",
  reservada: "RESERVADAS",
  vendida: "VENDIDAS",
};

    const groups = {
  ativo: [],
  reservada: [],
  vendida: [],
};

    list.forEach((m) => {
      const st = String(m.status || "ativo").toLowerCase();
      if (groups[st]) groups[st].push(m);
    });

    options = Object.keys(groups)
      .map((key) => {
        const arr = groups[key];
        if (!arr.length) return "";
        const inner = arr
          .map((m) => {
            const st = String(m.status || "ativo").toUpperCase();
            const title = m.titulo ? ` — ${m.titulo}` : "";
            return `<option value="${m.id}">${m.id} [${st}]${title}</option>`;
          })
          .join("");
        return `<optgroup label="${labelMap[key]} (${arr.length})">${inner}</optgroup>`;
      })
      .join("");
  } else {
    options = list
      .map((m) => {
        const st = String(m.status || "ativo").toUpperCase();
        const title = m.titulo ? ` — ${m.titulo}` : "";
        return `<option value="${m.id}">${m.id} [${st}]${title}</option>`;
      })
      .join("");
  }
// mantém seleção atual se possível
  const keep = els.motoSelect.value || "";
  els.motoSelect.innerHTML = `<option value="">+ Criar nova moto…</option>` + options;

  if (keep && list.some((m) => String(m.id) === keep)) {
    els.motoSelect.value = keep;
  } else {
    els.motoSelect.value = "";
  }
}
// Normaliza ID (usado como pasta no storage e PK na tabela)
// Ex: "XRE 300 2022" -> "xre-300-2022"
function cleanId(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "-")
    .replace(/[^\w-]/g, "");

}

// Normaliza strings (lowercase, sem acento) para comparar status
function normStr(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Normaliza status e gera candidatos comuns
function buildStatusCandidates(input) {
  const raw = String(input || "").trim();
  const n = normStr(raw);

  const cands = new Set();
  const add = (x) => x && cands.add(String(x));

  // originais
  add(raw);
  add(raw.toLowerCase());
  add(n);

  // tira plural simples
  if (n.endsWith("s")) add(n.slice(0, -1));

  // mapeamentos comuns PT-BR
  const base = n.replace(/[^a-z]/g, "");
  const map = {
  disponiveis: "ativo",
  disponivel: "ativo",
  reservadas: "reservada",
  reservada: "reservada",
  reservado: "reservada",
  vendidas: "vendida",
  vendida: "vendida",
  vendido: "vendida",
};

  if (map[base]) add(map[base]);

  // tenta os 2 gêneros pra reservar/vender
  if (base.startsWith("reservad")) {
    add("reservado");
    add("reservada");
  }
  if (base.startsWith("vendid")) {
    add("vendido");
    add("vendida");
  }

  // disponivel com acento (alguns bancos usam)
add("ativo");
add("disponível");
add("disponiveis");
add("disponíveis");

  return Array.from(cands);
}

// Dado um input, tenta achar o valor exato que existe no banco (allowedStatusSet)
function pickAllowedStatus(input) {
  if (!allowedStatusSet || !allowedStatusSet.size) return null;

  const candidates = buildStatusCandidates(input);

  // 1) match direto
  for (const c of candidates) {
    if (allowedStatusSet.has(c)) return c;
  }

  // 2) match por normalização
  const allowedArr = Array.from(allowedStatusSet);
  const candNorms = candidates.map((c) => normStr(c));
  for (const a of allowedArr) {
    const an = normStr(a);
    if (candNorms.includes(an)) return a;
  }

  return null;
}


function syncStatusSelectOptions() {
  if (!els.status) return;
  // opções fixas — não altera o select
  const current = els.status.value;
  if (!current) els.status.value = "ativo";
}


// Remove tudo que não for dígito (pra km/preço)
function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

// Formata KM como "12.345"
function formatKmBR(value) {
  const digits = onlyDigits(value);
  if (!digits) return "";
  return Number(digits).toLocaleString("pt-BR");
}

// Formata preço como "R$ 23.900"
function formatPrecoBR(value) {
  const digits = onlyDigits(value);
  if (!digits) return "";
  const n = Number(digits);
  return "R$ " + n.toLocaleString("pt-BR");
}

// ======================================================
// ===== STORAGE (URL, LIST, DELETE, UPLOAD)
// ======================================================

// Monta URL pública do storage — agora servido pelo Caddy na mesma origem
// Ex: publicUrl("xre-300-2022/capa.jpg")
function publicUrl(path) {
  return `${STORAGE_PUBLIC_BASE}/${path}`;
}

// Cache-bust no preview do admin baseado na versao REAL do arquivo
// (updated_at do Supabase Storage). Date.now() em cada chamada forcaria
// reload da imagem inutilmente toda vez que o admin renderiza.
// Com updated_at, o browser cacheia ate a foto realmente mudar no Storage.
function publicUrlV(path, version) {
  if (!version) return publicUrl(path);
  const v = typeof version === "number" ? version : new Date(version).getTime();
  return Number.isFinite(v) && v > 0 ? `${publicUrl(path)}?v=${v}` : publicUrl(path);
}

// Define os slots fixos de fotos que o admin mostra:
// - capa.jpg
// - 1.jpg .. 4.jpg
// OBS: mesmo que você apague/lista outros arquivos, o grid só exibe esses slots.
function fotosSlots(id) {
  return [
    { key: "capa", filename: "capa.jpg" },
    ...Array.from({ length: 4 }).map((_, i) => ({
      key: String(i + 1),
      filename: `${i + 1}.jpg`,
    })),
  ].map((s) => ({ ...s, path: `${id}/${s.filename}` }));
}

// Lista tudo que existe dentro da pasta da moto no Storage (id/)
// Isso é MUITO importante pra:
// - apagar tudo ao vender
// - apagar tudo ao deletar moto
async function listMotoFiles(motoId) {
  const { data, error } = await supabase.storage.from(BUCKET).list(motoId, {
    limit: 100,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw error;
  return data || [];
}

// Apaga TUDO da pasta exceto a capa.
// Usado quando moto vira "vendida" (fica só a capa).
async function deleteAllExceptCover(motoId) {
  const data = await listMotoFiles(motoId);

  // monta lista completa com caminho id/arquivo
  const toDelete = data
    .filter((f) => f.name !== "capa.jpg") // mantém capa.jpg
    .map((f) => `${motoId}/${f.name}`);

  if (!toDelete.length) return { deleted: 0 };

  const { error } = await supabase.storage.from(BUCKET).remove(toDelete);
  if (error) throw error;

  return { deleted: toDelete.length };
}

// Apaga TUDO da pasta (inclusive capa).
// Usado quando o admin apaga a moto (delete total).
async function deleteAllMotoFiles(motoId) {
  const data = await listMotoFiles(motoId);

  const toDelete = data.map((f) => `${motoId}/${f.name}`);
  if (!toDelete.length) return { deleted: 0 };

  const { error } = await supabase.storage.from(BUCKET).remove(toDelete);
  if (error) throw error;

  return { deleted: toDelete.length };
}

// “Marca” a moto como atualizada no banco, se existir a coluna updated_at.
// Isso ajuda o site público a trocar a imagem (usando ?v=updated_at).
async function touchUpdatedAt(motoId) {
  try {
    await supabase
      .from("motos")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", motoId);
  } catch {
    // se a coluna não existir, a gente ignora sem quebrar o admin
  }
}


// Atualiza no banco os paths das fotos (capa_path e fotos_paths), se essas colunas existirem.
// - capa_path: "<id>/capa.jpg" (se existir)
// - fotos_paths: ["<id>/1.jpg", "<id>/2.jpg", ...] (apenas as que existirem)
async function syncPhotoPathsToDB(motoId) {
  try {
    const files = await listMotoFiles(motoId);
    const names = new Set((files || []).map((f) => f.name));

    const capa_path = names.has("capa.jpg") ? `${motoId}/capa.jpg` : null;

    const fotos_paths = [];
    for (let i = 1; i <= 4; i++) {
      const fn = `${i}.jpg`;
      if (names.has(fn)) fotos_paths.push(`${motoId}/${fn}`);
    }

    await supabase
      .from("motos")
      .update({ capa_path, fotos_paths })
      .eq("id", motoId);
  } catch {
    // Se não tiver colunas (ou policy), não quebra o admin.
  }
}


// ======================================================
// ===== COMPRESSÃO DE IMAGEM (cliente)
// ======================================================
// Reduz foto do celular (4-8 MB) para ~80-200 KB antes do upload.
// - Capa: max 1000x750, JPEG quality 82
// - Foto extra: max 1280x960, JPEG quality 80
// Se a compressão falhar por qualquer motivo, sobe o arquivo original
// (preferimos foto grande do que nenhuma foto).
async function compressImage(file, { isCover = false } = {}) {
  if (!file || !file.type || !file.type.startsWith("image/")) return file;

  const MAX_W = isCover ? 1000 : 1280;
  const MAX_H = isCover ? 750 : 960;
  const QUALITY = isCover ? 0.82 : 0.80;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const ratio = Math.min(MAX_W / bitmap.width, MAX_H / bitmap.height, 1);
    const w = Math.round(bitmap.width * ratio);
    const h = Math.round(bitmap.height * ratio);

    let blob;
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, w, h);
      blob = await canvas.convertToBlob({ type: "image/jpeg", quality: QUALITY });
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, w, h);
      blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", QUALITY)
      );
    }
    bitmap.close?.();
    if (!blob) return file;

    // Se o resultado ficou maior que o original (raro mas pode acontecer
    // se o arquivo original já era pequeno), retorna o original
    if (blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
  } catch (e) {
    console.warn("Compressão falhou, subindo original:", e);
    return file;
  }
}

// Faz upload de um arquivo para um caminho específico no Storage.
// upsert:true = se já existir, substitui (perfeito pra trocar capa)
// cacheControl alto = site carrega mais rápido
async function uploadSingleToPath(path, file) {
  const isCover = /\/capa\.jpg$/i.test(path);
  msg(els.fotoMsg, "Comprimindo foto...");

  const compressed = await compressImage(file, { isCover });
  const sizeKB = Math.round(compressed.size / 1024);
  const origKB = Math.round(file.size / 1024);

  msg(els.fotoMsg, `Enviando foto (${origKB}KB → ${sizeKB}KB)...`);

  const { error } = await supabase.storage.from(BUCKET).upload(path, compressed, {
    upsert: true,
    cacheControl: "2592000", // 30 dias (CDN + navegador)
    contentType: "image/jpeg",
  });

  if (error) {
    console.error("Erro upload:", error);
    msg(els.fotoMsg, "Erro ao enviar: " + error.message, "err");
    return;
  }

  msg(els.fotoMsg, `Foto enviada (${sizeKB} KB)`, "ok");
}

// Multi-upload: usuário seleciona arquivos → STAGING (preview local, ainda NÃO salvo)
// - a primeira vira capa
// - as outras viram 1..4
// Botão "Salvar" persiste tudo.
function handleMultiUpload(fileList) {
  const id = cleanId(els.id?.value);
  if (!id) {
    toast("Selecione uma moto antes de adicionar fotos", "warn");
    return;
  }

  const files = Array.from(fileList || []).filter(Boolean);
  if (!files.length) return;

  // pega no máximo 5 (capa + 4 extras)
  const picked = files.slice(0, 5);

  const targets = [
    `${id}/capa.jpg`,
    `${id}/1.jpg`,
    `${id}/2.jpg`,
    `${id}/3.jpg`,
    `${id}/4.jpg`,
  ];

  for (let i = 0; i < picked.length; i++) {
    const path = targets[i];
    // Revoga URL anterior se já tinha pending nesse slot
    if (pendingPhotos[path]?.previewUrl) URL.revokeObjectURL(pendingPhotos[path].previewUrl);
    pendingPhotos[path] = {
      type: "upload",
      file: picked[i],
      previewUrl: URL.createObjectURL(picked[i]),
    };
  }

  msg(els.fotoMsg, `${picked.length} foto(s) prontas pra salvar`, "ok");
  toast(`${picked.length} foto${picked.length > 1 ? "s prontas" : " pronta"} — clique em SALVAR`, "warn");
  renderFotosGrid(id);
}

// ======================================================
// ===== GRID DE FOTOS (PREVIEW + BOTÕES)
// ======================================================

// ======================================================
// ===== COMMIT / DISCARD das mudanças pendentes
// ======================================================
function updateActionBar(_id) {
  const bar = document.getElementById("fotosActionBar");
  if (!bar) return;
  const count = pendingCount();
  const btnSave = document.getElementById("btnSavePhotos");
  const btnDiscard = document.getElementById("btnDiscardPhotos");
  const helper = document.getElementById("fotosPendingLabel");
  const labelSpan = btnSave?.querySelector(".__btnLabel");

  if (count === 0) {
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.classList.add("__btnIdle");
      btnSave.classList.remove("__btnActive");
      if (labelSpan) labelSpan.textContent = "Nenhuma alteração pendente";
    }
    if (btnDiscard) btnDiscard.style.display = "none";
    if (helper) helper.textContent = "Suas fotos estão sincronizadas com o servidor.";
  } else {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.classList.remove("__btnIdle");
      btnSave.classList.add("__btnActive");
      if (labelSpan) labelSpan.textContent = `Salvar ${count} alteração${count > 1 ? "ões" : ""}`;
    }
    if (btnDiscard) btnDiscard.style.display = "inline-flex";
    if (helper) helper.textContent = `${count} alteração${count > 1 ? "ões" : ""} aguardando salvamento`;
  }
}

async function commitPendingPhotos(id) {
  if (pendingCount() === 0) return;
  const btnSave = document.getElementById("btnSavePhotos");
  const labelSpan = btnSave?.querySelector(".__btnLabel");
  const iconSpan  = btnSave?.querySelector(".__btnIcon");
  if (btnSave) {
    btnSave.disabled = true;
    if (labelSpan) labelSpan.textContent = "Salvando...";
    if (iconSpan)  iconSpan.innerHTML = icon("spinner", 18);
  }

  const entries = Object.entries(pendingPhotos);
  const total = entries.length;
  let ok = 0, fail = 0, i = 0;

  for (const [path, change] of entries) {
    i++;
    if (labelSpan) labelSpan.textContent = `Salvando ${i} de ${total}...`;
    try {
      if (change.type === "upload") {
        msg(els.fotoMsg, `Enviando ${path.split("/").pop()}...`);
        await uploadSingleToPath(path, change.file);
        ok++;
      } else if (change.type === "delete") {
        msg(els.fotoMsg, `Removendo ${path.split("/").pop()}...`);
        const { error } = await supabase.storage.from(BUCKET).remove([path]);
        if (error) throw error;
        ok++;
      }
    } catch (e) {
      console.error(`commit failed ${path}:`, e);
      fail++;
    }
  }

  try { await touchUpdatedAt(id); } catch {}
  try { await syncPhotoPathsToDB(id); } catch {}

  ["disponivel","reservada","vendida","all","ativo"].forEach((s) => {
    try { localStorage.removeItem(`daniloMotosCache_${s}`); } catch {}
  });

  clearPendingPhotos();
  if (iconSpan) iconSpan.innerHTML = icon("save", 18);

  if (fail === 0) {
    toast(`${ok} alteração${ok > 1 ? "ões salvas" : " salva"} com sucesso`, "ok");
    msg(els.fotoMsg, "Tudo salvo", "ok");
  } else {
    toast(`${ok} salvas, ${fail} falharam — veja console`, "err");
    msg(els.fotoMsg, `${ok} ok, ${fail} erros`, "err");
  }

  await renderFotosGrid(id);
}

async function discardPendingPhotos(id) {
  if (pendingCount() === 0) return;
  const ok = await confirmDialog({
    title: "Descartar alterações?",
    message: `Você tem ${pendingCount()} mudança(s) pendente(s) que ainda não foram salvas.\nDescartar elas?`,
    confirmText: "Sim, descartar",
    cancelText: "Continuar editando",
    danger: true,
  });
  if (!ok) return;
  clearPendingPhotos();
  toast("Alterações descartadas", "ok");
  await renderFotosGrid(id);
}

// Renderiza os slots (capa, 1..4) com:
// - preview se o arquivo existe
// - input pra subir/substituir a foto
// - botão pra remover do storage
async function renderFotosGrid(id) {
  if (!els.fotosGrid) return;

  // Atualiza o banner de contexto da tela de fotos
  const ctxTitle = document.getElementById("fotosContextTitle");
  if (ctxTitle) {
    const m = motosCache.find((x) => x.id === id);
    ctxTitle.textContent = m ? `${m.id} — ${m.titulo || "(sem título)"} · ${(m.status || "").toUpperCase()}` : id || "— Nenhuma moto selecionada —";
  }

  // se não tem id, limpa o grid
  if (!id) {
    els.fotosGrid.innerHTML = "<div style='color:#9aa0a6;padding:20px;text-align:center'>Selecione uma moto no painel pra gerenciar fotos.</div>";
    msg(els.fotoMsg, "");
    return;
  }

  const slots = fotosSlots(id);

  // Descobre quais arquivos existem no SERVIDOR (pra mostrar preview) + metadata
  let existing = new Set();
  let fileMeta = new Map();
  try {
    const data = await listMotoFiles(id);
    existing = new Set(data.map((x) => x.name));
    data.forEach((x) => fileMeta.set(x.name, x.updated_at || x.created_at));
  } catch {}

  // Render: pra cada slot decide o estado visual:
  //   - PENDING UPLOAD  → mostra preview local (laranja "Não salvo")
  //   - PENDING DELETE  → mostra ícone lixeira (vermelho "Será removido")
  //   - SALVO           → preview do servidor (verde "Salvo")
  //   - VAZIO           → placeholder (cinza "Vazio")
  els.fotosGrid.innerHTML = slots
    .map((s) => {
      const pend = pendingPhotos[s.path];
      const existsOnServer = existing.has(s.filename);
      const isCover = s.key === "capa";
      const label = isCover ? "CAPA" : `Foto ${s.key}`;

      // Estado visual: pendingUpload | pendingDelete | saved | empty
      let state, stateLabel, stateColor, imgSrc, imgStyle = "";
      if (pend?.type === "upload") {
        state = "pendingUpload";
        stateLabel = "Nova — não salva";
        stateColor = "#3b82f6";
        imgSrc = pend.previewUrl;
      } else if (pend?.type === "delete") {
        state = "pendingDelete";
        stateLabel = "Será removida";
        stateColor = "#dc2626";
        imgSrc = existsOnServer ? publicUrlV(s.path, fileMeta.get(s.filename)) : "";
        imgStyle = "filter:grayscale(1) opacity(.5);";
      } else if (existsOnServer) {
        state = "saved";
        stateLabel = "Salva";
        stateColor = "#16a34a";
        imgSrc = publicUrlV(s.path, fileMeta.get(s.filename));
      } else {
        state = "empty";
        stateLabel = "Sem foto";
        stateColor = "#6b7280";
        imgSrc = "";
      }

      const isPending = state === "pendingUpload" || state === "pendingDelete";
      const hasImage = !!imgSrc;

      // Capa: borda dourada + header destacado (não usa ribbon flutuante pra evitar overlap)
      const coverBorder = isCover ? "border:2px solid #eab308;" : "border:1px solid rgba(255,255,255,.08);";
      const pendingBorder = isPending ? `border:2px solid ${stateColor} !important;` : "";
      const titleText = isCover ? "FOTO PRINCIPAL (CAPA)" : `Foto ${s.key}`;
      const headerBg   = isCover ? "background:linear-gradient(90deg,#eab308 0%,#f59e0b 100%);color:#000;padding:8px 12px;margin:-14px -14px 12px;border-radius:8px 8px 0 0" : "";
      const titleStyle = isCover ? "font-weight:800;font-size:12px;letter-spacing:1.2px" : `font-weight:700;font-size:13px;color:#fff`;

      const placeholderHtml = hasImage ? "" : `
        <div style="display:flex;align-items:center;justify-content:center;height:160px;background:rgba(255,255,255,.02);border:2px dashed rgba(255,255,255,.1);border-radius:8px;color:#5a5d64;flex-direction:column;gap:8px">
          ${icon("image", 36)}
          <span style="font-size:13px">Sem foto ainda</span>
        </div>`;

      const undoBtn = isPending ? `
        <button class="btn ghost" type="button" data-undo="${s.path}" style="width:100%;margin-top:6px;font-size:13px;padding:10px;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px">
          ${icon("undo", 14)} Desfazer alteração
        </button>` : "";

      const removeBtn = (existsOnServer && pend?.type !== "delete") ? `
        <button class="btn danger" type="button" data-del="${s.path}" style="width:100%;margin-top:8px;font-size:13px;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px">
          ${icon("trash", 14)} Remover esta foto
        </button>` : "";

      const replaceBtn = pend?.type !== "delete" ? `
        <label class="btn" style="width:100%;margin-top:8px;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;font-size:13px;min-height:44px">
          ${hasImage ? icon("swap", 14) + " Trocar foto" : icon("plus", 16) + " Escolher foto"}
          <input type="file" data-path="${s.path}" accept="image/*" style="display:none"/>
        </label>` : "";

      return `
        <div class="thumb" style="${coverBorder}${pendingBorder}border-radius:10px;padding:14px;background:rgba(255,255,255,.02);position:relative;overflow:hidden">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:10px;${headerBg}">
            <div style="${titleStyle};flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${titleText}</div>
            <div style="background:${isCover ? "rgba(0,0,0,.2)" : stateColor + "22"};color:${isCover ? "#000" : stateColor};font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;border:1px solid ${isCover ? "rgba(0,0,0,.25)" : stateColor + "55"};white-space:nowrap">
              ${stateLabel}
            </div>
          </div>

          ${hasImage ? `<img src="${imgSrc}" alt="${titleText}" decoding="async" style="width:100%;border-radius:6px;${imgStyle}" onerror="this.style.display='none'">` : placeholderHtml}

          ${replaceBtn}
          ${removeBtn}
          ${undoBtn}
        </div>
      `;
    })
    .join("");

  // Atualiza barra de ação no topo (botões Salvar/Descartar)
  updateActionBar(id);

  // Bind upload: agora coloca em STAGING (não envia direto)
  els.fotosGrid.querySelectorAll('input[type="file"][data-path]').forEach((inp) => {
    inp.addEventListener("change", () => {
      const file = inp.files?.[0];
      if (!file) return;
      const path = inp.dataset.path;
      if (pendingPhotos[path]?.previewUrl) URL.revokeObjectURL(pendingPhotos[path].previewUrl);
      pendingPhotos[path] = {
        type: "upload",
        file,
        previewUrl: URL.createObjectURL(file),
      };
      inp.value = "";
      renderFotosGrid(id);
    });
  });

  // Bind delete: marca pra remoção (não apaga direto)
  els.fotosGrid.querySelectorAll("button[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const path = btn.dataset.del;
      pendingPhotos[path] = { type: "delete" };
      renderFotosGrid(id);
      toast("Foto marcada — clique em SALVAR ALTERAÇÕES no rodapé pra confirmar", "warn");
    });
  });

  // Bind undo: cancela mudança pendente em um slot
  els.fotosGrid.querySelectorAll("button[data-undo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const path = btn.dataset.undo;
      if (pendingPhotos[path]?.previewUrl) URL.revokeObjectURL(pendingPhotos[path].previewUrl);
      delete pendingPhotos[path];
      renderFotosGrid(id);
    });
  });

  msg(els.fotoMsg, "Clique em escolher arquivo para enviar/atualizar.", "");
}

// ======================================================
// ===== DASHBOARD (CONTADORES)
// ======================================================

function renderDashboard() {
  if (!els.dashGrid) return;

  const total = motosCache.length;
  const disp  = motosCache.filter((m) => (m.status || "ativo") === "ativo").length;
  const resv  = motosCache.filter((m) => m.status === "reservada").length;
  const vend  = motosCache.filter((m) => m.status === "vendida").length;

  els.dashGrid.innerHTML = `
    <div class="dashCard accent full">
      <div class="dashNum">${total}</div>
      <div class="dashLabel">Total cadastradas</div>
    </div>
    <div class="dashCard">
      <div class="dashNum" style="color:#25D366">${disp}</div>
      <div class="dashLabel">Ativas</div>
    </div>
    <div class="dashCard">
      <div class="dashNum" style="color:#ffaa00">${resv}</div>
      <div class="dashLabel">Reservadas</div>
    </div>
    <div class="dashCard">
      <div class="dashNum" style="color:#ff6b6b">${vend}</div>
      <div class="dashLabel">Vendidas</div>
    </div>
  `;

  renderMotoCards();
}

// ======================================================
// ===== LOGIN / LOGOUT
// ======================================================

async function login() {
  const email = (els.email?.value || "").trim();
  const password = els.senha?.value || "";

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    msg(els.loginMsg, "Erro: " + error.message, "err");
    return;
  }

  msg(els.loginMsg, "Logado", "ok");
  await refreshSessionUI();
}

async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    msg(els.loginMsg, "Erro ao sair: " + error.message, "err");
    return;
  }

  msg(els.loginMsg, "Você saiu.", "");
  await refreshSessionUI();
}

// Atualiza a interface dependendo se está logado ou não
async function refreshSessionUI() {
  const { data } = await supabase.auth.getSession();
  const logged = !!data.session;

  if (els.loginSection) els.loginSection.style.display = logged ? "none" : "";
  if (els.loginBox) els.loginBox.style.display = logged ? "none" : "grid";
  if (els.appBox) els.appBox.style.display = logged ? "" : "none";
  if (els.btnLogout) els.btnLogout.style.display = logged ? "" : "none";

  if (logged) {
    await loadMotosAndRender();
  }
}

// Detecta sessão expirada automaticamente e força re-login
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
    refreshSessionUI();
  }
});

// ======================================================
// ===== BANCO: CARREGAR / SALVAR / APAGAR
// ======================================================

// Carrega motos do banco e atualiza UI
async function loadMotosAndRender() {
  msg(els.saveMsg, "Carregando motos...");

  const { data, error } = await supabase
    .from("motos")
    .select("*")
    .order("id", { ascending: false });

  if (error) {
    console.error("Erro ao carregar motos:", error);
    msg(els.saveMsg, "Erro ao carregar motos: " + error.message, "err");
    motosCache = [];
    if (els.motoSelect) els.motoSelect.innerHTML = "";
    renderDashboard();
    return [];
  }

  motosCache = data || [];

  // Descobre os status reais que existem no seu banco (pra bater com o check constraint)
  allowedStatusSet = new Set((motosCache || []).map((m) => m?.status).filter(Boolean));
  syncStatusSelectOptions();

  // Preenche o select de motos (com filtro)
  renderMotoSelect();

  renderDashboard();
  novaMoto();

  msg(
    els.saveMsg,
    motosCache.length ? "Motos carregadas" : "Nenhuma moto cadastrada ainda.",
    motosCache.length ? "ok" : ""
  );

  return motosCache;
}

// Preenche os campos do formulário com a moto selecionada
function fillForm(m) {
  _currentMoto = m;

  if (els.id) els.id.value = m?.id || "";
  if (els.status) { syncStatusSelectOptions(); els.status.value = pickAllowedStatus(m?.status) || m?.status || "ativo"; }
  if (els.titulo) els.titulo.value = m?.titulo || "";
  if (els.preco) els.preco.value = m?.preco || "";
  if (els.ordem) els.ordem.value = m?.ordem ?? "";
  if (els.ano) els.ano.value = m?.ano ?? "";
  if (els.km) els.km.value = m?.km ?? "";
  if (els.cor) els.cor.value = m?.cor || "";
  if (els.cilindrada) {
    const val = m?.cilindrada || "";
    els.cilindrada.value = val;
    const sel = document.getElementById("cilindradaSel");
    const outra = document.getElementById("cilindradaOutra");
    if (sel) {
      const known = ["100cc","110cc","125cc","150cc","160cc","300cc"];
      if (!val) { sel.value = ""; }
      else if (known.includes(val)) { sel.value = val; if(outra) outra.style.display="none"; }
      else { sel.value = "outra"; if(outra){ outra.style.display="block"; outra.value=val; } }
    }
  }
  if (els.combustivel) els.combustivel.value = m?.combustivel || m?.["combustível"] || "";
  if (els.partida) els.partida.value = m?.partida || "";
  if (els.youtube) els.youtube.value = m?.youtube || "";
  if (els.whatsapp_texto) els.whatsapp_texto.value = m?.whatsapp_texto || "";
  if (els.observacoes) els.observacoes.value = m?.observacoes || "";
  if (els.emplacada) els.emplacada.checked = !!m?.emplacada;

  // campos extras
  if (els.obs_internas) els.obs_internas.value = m?.obs_internas || "";
  if (els.destaque) els.destaque.checked = !!m?.destaque;

  // atualiza grid de fotos
  renderFotosGrid(m?.id);
}

// Lê o formulário e monta o payload do banco
function getFormData() {
  const payload = {
    id: cleanId(els.id?.value),
    status: (pickAllowedStatus(els.status?.value) || els.status?.value || "ativo"),

    titulo: (els.titulo?.value || "").trim() || null,

    // preco no banco é TEXT
    preco: (els.preco?.value || "").trim() || null,

    ordem: els.ordem?.value ? Number(els.ordem.value) : 999,
    ano: (els.ano?.value || "").trim() || null,
    km: els.km?.value ? Number(onlyDigits(els.km.value)) : null,

    cor: (els.cor?.value || "").trim() || null,
    cilindrada: (els.cilindrada?.value || "").trim() || null,
    combustivel: (els.combustivel?.value || "").trim() || null,
    partida: (els.partida?.value || "").trim() || null,

    youtube: (els.youtube?.value || "").trim() || null,
    whatsapp_texto: (els.whatsapp_texto?.value || "").trim() || null,
    observacoes: (els.observacoes?.value || "").trim() || null,

    emplacada: !!els.emplacada?.checked,
  };

  if (els.obs_internas) payload.obs_internas = (els.obs_internas.value || "").trim() || null;
  if (els.destaque) payload.destaque = !!els.destaque.checked;

  return payload;
}

// Salva (cria ou atualiza) a moto no banco
async function salvar() {
  msg(els.saveMsg, "Salvando...");

  // Detecta antes do upsert: se já existia no cache, é edição; senão é criação nova
  const wasNew = !_currentMoto?.id;

  const payload = getFormData();

  // 🔒 garante boolean
  payload.emplacada = payload.emplacada === true;

  

  if (!payload.id) {
    msg(els.saveMsg, "O campo ID é obrigatório (ex: xre-300-2022).", "err");
    return;
  }

  // Campos opcionais que podem não existir na tabela
  const OPTIONAL_FIELDS = ["whatsapp_texto", "obs_internas", "destaque", "ordem", "youtube", "observacoes", "emplacada", "combustivel", "partida", "cilindrada", "cor"];

async function tryUpsert(p) {
  const clean = {
    id: p.id,
    status: p.status,
    titulo: p.titulo,
    preco: p.preco,
    ordem: p.ordem,
    ano: p.ano,
    km: p.km,
    cor: p.cor,
    cilindrada: p.cilindrada,
    combustivel: p.combustivel,
    partida: p.partida,
    youtube: p.youtube,
    whatsapp_texto: p.whatsapp_texto,
    observacoes: p.observacoes,
    emplacada: p.emplacada,
    destaque: p.destaque,
    obs_internas: p.obs_internas
  };

  const r = await supabase
    .from("motos")
    .upsert(clean, { onConflict: "id" })
    .select();

  return r;
}

  let { data, error } = await tryUpsert(payload);

  // Se der 400 por coluna inexistente, tenta remover campos opcionais um a um
  if (
  error &&
  (
    error.code === "PGRST204" ||
    (error.status === 400 && !String(error.message || "").includes("motos_status_check"))
  )
) {
    console.warn("Payload completo falhou, tentando sem campos opcionais:", error.message);
    const slim = { ...payload };
    OPTIONAL_FIELDS.forEach(f => delete slim[f]);
    const r2 = await tryUpsert(slim);
    if (!r2.error) { data = r2.data; error = null; }
    else error = r2.error;
  }

  // Se bater no CHECK do status, tenta variações
  if (error && String(error.message || "").includes("motos_status_check")) {
    const candidates = ["ativo", "reservada", "vendida"].filter(Boolean);
    for (const st of candidates) {
      const r = await tryUpsert({ ...payload, status: st });
      if (!r.error) {
        data = r.data; error = null; payload.status = st;
        if (allowedStatusSet) allowedStatusSet.add(st);
        syncStatusSelectOptions();
        break;
      }
    }
  }

  if (error) {
    console.error("Erro upsert:", error);
    if (error.status === 401 || String(error.message).toLowerCase().includes("jwt")) {
      await supabase.auth.signOut();
      msg(els.saveMsg, "Sessão expirada. Faça login novamente.", "err");
      await refreshSessionUI();
      return;
    }
    msg(els.saveMsg, "Erro ao salvar: " + error.message, "err");
    return;
  }

 msg(els.saveMsg, "Moto salva", "ok");

// limpa o cache do site público (local + session)
["disponivel","reservada","vendida","all","ativo"].forEach((s) => {
  try { localStorage.removeItem(`daniloMotosCache_${s}`); } catch {}
  try { sessionStorage.removeItem(`daniloMotosCache_${s}`); } catch {}
});

await loadMotosAndRender();
fillForm(payload);

// UX: nova moto → vai direto pra Fotos (próximo passo natural)
//     edição    → volta pra Dashboard
if (wasNew) {
  toast("Moto criada — agora adicione as fotos", "ok");
  setTimeout(() => {
    window.goScreen?.("screenFotos");
    renderFotosGrid(payload.id);
  }, 500);
} else {
  toast("Alterações salvas com sucesso", "ok");
  setTimeout(() => { window.goScreen?.("screenDash"); }, 400);
}
}

// Abre formulário em branco (nova moto)
function novaMoto() {
  idManuallyEdited = false;
  fillForm({
    id: "",
    status: "ativo",
    emplacada: false,
  });
  msg(els.saveMsg, "Preencha os campos e clique em Salvar.", "");
}

// Apaga a moto do banco e apaga a pasta toda do Storage
async function apagarMoto() {
  const id = cleanId(els.id?.value);
  if (!id) return msg(els.saveMsg, "Informe o ID da moto para apagar.", "err");

  const ok = await confirmDialog({
    title: `Apagar a moto "${id}"?`,
    message: "Esta ação vai apagar:\n• O registro da moto no banco\n• TODAS as fotos dela no storage\n\nNão dá pra desfazer.",
    confirmText: "Sim, apagar tudo",
    cancelText: "Cancelar",
    danger: true,
  });
  if (!ok) return;

  msg(els.saveMsg, "Apagando...");

  // 1) apaga storage primeiro (pra não sobrar lixo)
  try {
    await deleteAllMotoFiles(id);
  } catch (e) {
    console.error(e);
    msg(els.saveMsg, "Erro ao apagar fotos: " + (e?.message || e), "err");
    return;
  }

  // 2) apaga registro do banco
  const { error } = await supabase.from("motos").delete().eq("id", id);
  if (error) return msg(els.saveMsg, "Erro ao apagar: " + error.message, "err");

  msg(els.saveMsg, "Moto apagada", "ok");
  toast(`Moto "${id}" apagada`, "ok");
  await loadMotosAndRender();
  novaMoto();
  window.goScreen?.("screenDash");
}

// ======================================================
// ===== CARDS DE MOTOS (DASHBOARD)
// ======================================================

function renderMotoCards() {
  if (!els.motosCards) return;

  const term = String(els.buscaMoto?.value || "").trim().toLowerCase();
  const st   = filtroStatus;

  // Ordem padrão: ATIVAS → RESERVADAS → VENDIDAS. Dentro de cada grupo, ordem
  // por `ordem` ASC (motos com ordem definida primeiro), depois updated_at DESC.
  const STATUS_RANK = { ativo: 0, reservada: 1, vendida: 2 };
  const list = motosCache
    .filter((m) => {
      const mst = String(m.status || "ativo").toLowerCase();
      if (st !== "todas" && mst !== st) return false;
      if (!term) return true;
      const hay = `${m.titulo || ""} ${m.cor || ""} ${m.ano || ""} ${m.preco || ""}`.toLowerCase();
      return hay.includes(term);
    })
    .sort((a, b) => {
      const ra = STATUS_RANK[String(a.status || "ativo").toLowerCase()] ?? 99;
      const rb = STATUS_RANK[String(b.status || "ativo").toLowerCase()] ?? 99;
      if (ra !== rb) return ra - rb;
      const oa = Number(a.ordem ?? 999);
      const ob = Number(b.ordem ?? 999);
      if (oa !== ob) return oa - ob;
      return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
    });

  if (!list.length) {
    els.motosCards.innerHTML = `<div class="emptyState">Nenhuma moto encontrada.</div>`;
    return;
  }

  const statusLabel = { ativo: "Ativa", reservada: "Reservada", vendida: "Vendida" };

  els.motosCards.innerHTML = list.map((m) => {
    const id     = m.id || "";
    const titulo = m.titulo || m.id || "Sem título";
    const status = String(m.status || "ativo").toLowerCase();
    const badge  = statusLabel[status] || status;

    const metaParts = [m.ano, m.km ? `${Number(String(m.km).replace(/\D/g,"")).toLocaleString("pt-BR")} km` : "", m.cor].filter(Boolean);
    const meta   = metaParts.join(" · ");

    const precoBruto = String(m.preco || "").replace(/[^\d]/g, "");
    const precoFmt   = precoBruto ? "R$ " + Number(precoBruto).toLocaleString("pt-BR") : "";

    const capaUrl = `${STORAGE_PUBLIC_BASE}/${id}/capa.jpg`;
    const dest    = !!m.destaque;

    const isCurrent = _currentMoto?.id === id;
    const cardHighlight = isCurrent ? ' style="border-color:rgba(255,29,29,.5)"' : "";

    return `
      <div class="motoCard"${cardHighlight} data-id="${id}">
        <img class="motoCard__img" src="${capaUrl}" alt="${titulo}" decoding="async"
             onerror="this.style.background='rgba(255,255,255,.06)';this.style.minHeight='80px';this.removeAttribute('src')">
        <div class="motoCard__body">
          <div class="motoCard__title">${titulo}</div>
          ${meta     ? "<div class=\"motoCard__meta\">" + meta + "</div>" : ""}
          ${precoFmt ? "<div class=\"motoCard__preco\">" + precoFmt + "</div>" : ""}
          <div class="motoCard__badges">
            <span class="statusBadge ${status}">${badge}</span>
            ${dest ? "<span class=\"destaqueFlag\">Destaque</span>" : ""}
          </div>
        </div>
        <div class="motoCard__actions">
          <button class="cardEdit"  data-id="${id}">Editar</button>
          <button class="cardFotos" data-id="${id}">Fotos</button>
          ${status !== "ativo"    ? `<button class="cardAtiv" data-id="${id}" data-setstatus="ativo">Ativar</button>` : ""}
          ${status !== "reservada" && status !== "vendida" ? `<button class="cardResv" data-id="${id}" data-setstatus="reservada">Reservar</button>` : ""}
          ${status !== "vendida"  ? `<button class="cardVend" data-id="${id}" data-setstatus="vendida">Vender</button>` : ""}
          <button class="cardDel"  data-id="${id}">Apagar</button>
        </div>
      </div>`;
  }).join("");

  // Bind ações dos cards
  els.motosCards.querySelectorAll(".cardEdit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = motosCache.find((x) => x.id === btn.dataset.id);
      if (m) { fillForm(m); window.goScreen?.("screenMoto"); }
    });
  });

  // Atalho: clica em "Fotos" no card → carrega contexto da moto + abre screen de fotos
  els.motosCards.querySelectorAll(".cardFotos").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = motosCache.find((x) => x.id === btn.dataset.id);
      if (!m) return;
      fillForm(m);                       // carrega contexto (id, status, etc)
      window.goScreen?.("screenFotos");  // abre a tela de fotos direto
      renderFotosGrid(m.id);             // garante grid atualizado
    });
  });

  els.motosCards.querySelectorAll("[data-setstatus]").forEach((btn) => {
    btn.addEventListener("click", () => setMotoStatus(btn.dataset.id, btn.dataset.setstatus));
  });

  els.motosCards.querySelectorAll(".cardDel").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const ok = await confirmDialog({
        title: `Apagar a moto "${id}"?`,
        message: "Esta ação vai apagar:\n• O registro da moto no banco\n• TODAS as fotos dela no storage\n\nNão dá pra desfazer.",
        confirmText: "Sim, apagar tudo",
        cancelText: "Cancelar",
        danger: true,
      });
      if (!ok) return;
      msg(els.dashMsg, "Apagando...");
      try { await deleteAllMotoFiles(id); } catch {}
      const { error } = await supabase.from("motos").delete().eq("id", id);
      if (error) { msg(els.dashMsg, "Erro: " + error.message, "err"); toast("Erro: " + error.message, "err"); return; }
      msg(els.dashMsg, "Moto apagada", "ok");
      toast(`Moto "${id}" apagada`, "ok");
      await loadMotosAndRender();
    });
  });
}

async function setMotoStatus(motoId, status) {
  if (!motoId) return;
  const labelMap = { ativo: "ATIVA", reservada: "RESERVADA", vendida: "VENDIDA" };
  const okStatus = await confirmDialog({
    title: `Mudar status pra ${labelMap[status] || status}`,
    message: status === "vendida"
      ? `Marcar "${motoId}" como VENDIDA.\nIsso também apaga as fotos extras (mantém só a capa).`
      : `Marcar "${motoId}" como ${labelMap[status] || status}.`,
    confirmText: `Sim, ${status === "vendida" ? "vender" : status === "reservada" ? "reservar" : "ativar"}`,
    cancelText: "Cancelar",
    danger: status === "vendida",
  });
  if (!okStatus) return;

  if (status === "vendida") {
    try { await deleteAllExceptCover(motoId); } catch {}
    await touchUpdatedAt(motoId);
    await syncPhotoPathsToDB(motoId);
  }

  const { error } = await supabase.from("motos").update({ status }).eq("id", motoId);
  if (error) { toast("Erro: " + error.message, "err"); return; }

  toast(`"${motoId}" agora é ${labelMap[status]}`, "ok");

  ["disponivel","reservada","vendida","all","ativo"].forEach((s) => {
    try { localStorage.removeItem(`daniloMotosCache_${s}`); } catch {}
    try { sessionStorage.removeItem(`daniloMotosCache_${s}`); } catch {}
  });

  await loadMotosAndRender();
}

// ======================================================
// ===== PARSER DO CADASTRO RÁPIDO
// ======================================================

function parseMotoText(raw) {
  const result = {};
  if (!raw || !raw.trim()) return result;

  const lines = raw.split("\n").map(function(l) { return l.trim(); }).filter(Boolean);
  if (!lines.length) return result;

  const LABELS = {
    "modelo": "titulo", "modelo da moto": "titulo", "titulo": "titulo", "moto": "titulo",
    "ano": "ano",
    "km": "km", "quilometragem": "km",
    "cor": "cor",
    "preco": "preco", "preco": "preco", "valor": "preco",
    "emplacada": "emplacada",
    "cilindrada": "cilindrada",
    "combustivel": "combustivel", "combustivel": "combustivel",
    "observacoes": "observacoes", "obs": "observacoes",
  };

  const SKIP = new Set(["ficha tecnica", "preco"]);

  function nrm(s) { return normStr(s); }

  function labelKey(s) {
    const n = nrm(s);
    if (LABELS[n]) return LABELS[n];
    // tenta sem acento no mapa tbm
    for (const k of Object.keys(LABELS)) {
      if (nrm(k) === n) return LABELS[k];
    }
    return null;
  }

  // Detecta formato estruturado
  const isStructured = lines.some(function(l) { return /^[^:·\n]+:\s*.+/.test(l); });

  if (isStructured) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^([^:]+):\s*([\s\S]+)/);
      if (!m) continue;
      const field = labelKey(m[1]);
      if (field) result[field] = m[2].trim();
    }
  } else {
    let i = 0;
    const first = lines[0];

    if (first.indexOf("·") !== -1) {
      const parts = first.split("·").map(function(p) { return p.trim(); });
      if (parts[0]) result.titulo = parts[0];
      if (parts[1]) result.ano    = parts[1];
      if (parts[2]) result.km     = parts[2].replace(/\s*km/i, "").trim();
      if (parts[3]) result.cor    = parts[3];
      i = 1;
    } else {
      const fn = nrm(first);
      if (!labelKey(first) && !SKIP.has(fn)) {
        result.titulo = first;
        i = 1;
      }
    }

    while (i < lines.length) {
      const line  = lines[i];
      const lineN = nrm(line);
      if (SKIP.has(lineN)) { i++; continue; }

      const field = labelKey(line);
      if (field && i + 1 < lines.length) {
        const nextLine  = lines[i + 1];
        const nextField = labelKey(nextLine);
        const nextN     = nrm(nextLine);

        if (!nextField && !SKIP.has(nextN)) {
          if (field === "observacoes") {
            let obs = nextLine;
            let j = i + 2;
            while (j < lines.length && !labelKey(lines[j]) && !SKIP.has(nrm(lines[j]))) {
              obs += "\n" + lines[j];
              j++;
            }
            result[field] = obs;
            i = j;
            continue;
          }
          result[field] = nextLine;
          i += 2;
          continue;
        }
      }
      i++;
    }
  }

  return result;
}

function applyParsed(data) {
  if (!data) return;
  let filled = 0;

  if (data.titulo && els.titulo) { els.titulo.value = data.titulo; filled++; if (!els.id.value) { els.id.value = cleanId(data.titulo); idManuallyEdited = false; } }
  if (data.ano  && els.ano)   { els.ano.value  = data.ano;  filled++; }
  if (data.cor  && els.cor)   { els.cor.value  = data.cor;  filled++; }

  if (data.km && els.km) {
    const digits = String(data.km).replace(/[^\d]/g, "");
    els.km.value = digits ? Number(digits).toLocaleString("pt-BR") : "";
    if (digits) filled++;
  }

  if (data.preco && els.preco) {
    const digits = String(data.preco).replace(/[^\d]/g, "");
    els.preco.value = digits ? "R$ " + Number(digits).toLocaleString("pt-BR") : "";
    if (digits) filled++;
  }

  if (data.emplacada !== undefined && els.emplacada) {
    const v = normStr(String(data.emplacada));
    els.emplacada.checked = ["sim","s","yes","true","1"].includes(v);
    filled++;
  }

  if (data.cilindrada) {
    const raw  = String(data.cilindrada).trim();
    const norm = raw.replace(/\s/g, "").toLowerCase();
    const known = ["100cc","110cc","125cc","150cc","160cc","300cc"];
    const matched = known.find((k) => k === norm || k.replace("cc","") === norm.replace("cc",""));
    const sel  = document.getElementById("cilindradaSel");
    const outra = document.getElementById("cilindradaOutra");
    if (els.cilindrada) els.cilindrada.value = matched || raw;
    if (sel) {
      if (matched) { sel.value = matched; if (outra) outra.style.display = "none"; }
      else { sel.value = "outra"; if (outra) { outra.style.display = "block"; outra.value = raw; } }
    }
    filled++;
  }

  if (data.combustivel && els.combustivel) {
    const norm = normStr(String(data.combustivel));
    const opts = Array.from(els.combustivel.options).map(function(o) { return o.value; });
    const match = opts.find(function(o) { return normStr(o) === norm; });
    if (match) { els.combustivel.value = match; filled++; }
  }

  if (data.observacoes && els.observacoes) { els.observacoes.value = data.observacoes; filled++; }

  if (data.status && els.status) {
    const st = pickAllowedStatus(data.status);
    if (st) { els.status.value = st; filled++; }
  }

  if (data.destaque !== undefined && els.destaque) {
    const v = normStr(String(data.destaque));
    els.destaque.checked = ["sim","s","yes","true","1"].includes(v);
  }

  return filled;
}

function quickFill() {
  const raw = els.txtRapido?.value || "";
  if (!raw.trim()) { msg(els.rapidoMsg, "Cole o texto da moto antes de preencher.", "err"); return; }

  const data = parseMotoText(raw);
  const filled = applyParsed(data);

  if (!filled) {
    msg(els.rapidoMsg, "Não foi possível identificar os dados. Verifique o texto.", "err");
  } else {
    msg(els.rapidoMsg, `${filled} campo(s) preenchido(s)`, "ok");
  }
}

function conferirVazios() {
  const campos = [
    { id: "titulo",      label: "Modelo da moto" },
    { id: "ano",         label: "Ano" },
    { id: "km",          label: "KM" },
    { id: "cor",         label: "Cor" },
    { id: "preco",       label: "Preço" },
    { id: "cilindrada",  label: "Cilindrada" },
    { id: "combustivel", label: "Combustível" },
    { id: "observacoes", label: "Observações" },
  ];

  const vazios = campos.filter((c) => {
    const el = document.getElementById(c.id);
    return !el || !el.value.trim();
  });

  if (!vazios.length) {
    msg(els.rapidoMsg, "Todos os campos principais estão preenchidos", "ok");
  } else {
    msg(els.rapidoMsg, `Campos vazios: ${vazios.map((c) => c.label).join(", ")}`, "warn");
  }
}

// ======================================================
// ===== EVENTOS (bind de tudo)
// ======================================================

function bind() {
  // Multi-upload (capa + 1..4)
  if (els.multiFotos) {
    els.multiFotos.addEventListener("change", async () => {
      await handleMultiUpload(els.multiFotos.files);
      els.multiFotos.value = "";
    });
  }

  // Botões da action bar (Salvar / Descartar)
  const btnSavePhotos = document.getElementById("btnSavePhotos");
  if (btnSavePhotos) {
    // Inicializa ícone do botão salvar com SVG
    const ic = btnSavePhotos.querySelector(".__btnIcon");
    if (ic) ic.innerHTML = icon("save", 18);
    btnSavePhotos.addEventListener("click", () => {
      const id = cleanId(els.id?.value);
      if (id) commitPendingPhotos(id);
    });
  }
  document.getElementById("btnDiscardPhotos")?.addEventListener("click", () => {
    const id = cleanId(els.id?.value);
    if (id) discardPendingPhotos(id);
  });

  // Atalho "Gerenciar fotos desta moto" no topo do form
  document.getElementById("btnGotoFotos")?.addEventListener("click", (e) => {
    e.preventDefault();
    const id = cleanId(els.id?.value);
    if (!id) {
      toast("Preencha o ID da moto e salve antes de gerenciar fotos", "warn");
      return;
    }
    const exists = motosCache.some((m) => m.id === id);
    if (!exists) {
      toast("Salve a moto primeiro antes de adicionar fotos", "warn");
      return;
    }
    window.goScreen?.("screenFotos");
    renderFotosGrid(id);
  });

  // Avisa antes de fechar a aba se há fotos pendentes
  window.addEventListener("beforeunload", (e) => {
    if (pendingCount() > 0) { e.preventDefault(); e.returnValue = ""; }
  });

  // Drag-and-drop real no dropZone
  const dropZone = document.getElementById("dropZone");
  if (dropZone) {
    const setActive = (on) => {
      dropZone.style.borderColor = on ? "#25D366" : "";
      dropZone.style.background  = on ? "rgba(37,211,102,.08)" : "";
    };
    ["dragenter", "dragover"].forEach((ev) => {
      dropZone.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); setActive(true); });
    });
    ["dragleave", "drop"].forEach((ev) => {
      dropZone.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); setActive(false); });
    });
    dropZone.addEventListener("drop", async (e) => {
      const files = e.dataTransfer?.files;
      if (!files || !files.length) return;
      const id = cleanId(els.id?.value);
      if (!id) {
        toast("Selecione uma moto antes de adicionar fotos", "warn");
        return;
      }
      toast(`Recebido ${files.length} arquivo${files.length > 1 ? "s" : ""}, processando...`, "ok");
      await handleMultiUpload(files);
    });
  }


  // Busca: atualiza select oculto + cards (debounced 300ms pra nao recriar grid
  // a cada keystroke, evita thrashing de DOM e re-decode de imagens)
  if (els.buscaMoto) {
    let _buscaDebounce;
    els.buscaMoto.addEventListener("input", function() {
      clearTimeout(_buscaDebounce);
      _buscaDebounce = setTimeout(() => {
        renderMotoSelect();
        renderMotoCards();
      }, 300);
    });
  }

  // Auto-ID: gera ID a partir do título quando o campo id está vazio
  if (els.titulo) {
    els.titulo.addEventListener("input", function() {
      if (!idManuallyEdited && !(_currentMoto && _currentMoto.id)) {
        els.id.value = cleanId(els.titulo.value);
      }
    });
  }
  if (els.id) {
    els.id.addEventListener("input", function() { idManuallyEdited = true; });
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

      // Selecionou "Criar nova"
      if (!id) {
        novaMoto();
      } else {
        const m = motosCache.find((x) => x.id === id);
        if (m) fillForm(m);
      }

      // navega para tab moto no mobile
      const tabMoto = document.querySelector('.tab[data-tab="moto"]');
      if (tabMoto && !document.body.classList.contains('pcMode')) tabMoto.click();
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

  // Quando muda status: se virar "vendida", limpa fotos extras do Storage
  if (els.status) {
    els.status.addEventListener("change", async () => {
      const id = cleanId(els.id?.value);
      if (!id) return;

      if (els.status.value === "vendida") {
        const ok = await confirmDialog({
          title: "Marcar como VENDIDA?",
          message: "Isso vai apagar TODAS as fotos extras desta moto (1, 2, 3, 4).\nSó a capa fica.\nNão dá pra recuperar as fotos depois.",
          confirmText: "Sim, marcar vendida",
          cancelText: "Cancelar",
          danger: true,
        });
        if (!ok) return;

        try {
          msg(els.fotoMsg, "Apagando fotos extras...");
          const { deleted } = await deleteAllExceptCover(id);
          msg(els.fotoMsg, `Fotos extras removidas (${deleted})`, "ok");

          // marca updated_at pra site público atualizar a capa
          await touchUpdatedAt(id);
          await syncPhotoPathsToDB(id);

          await renderFotosGrid(id);
        } catch (e) {
          console.error(e);
          msg(els.fotoMsg, "Erro ao apagar fotos: " + (e?.message || e), "err");
        }
      }
    });
 

  // Default: mostrar disponíveis no select
  renderMotoSelect();
}

}

// ======================================================
// ===== BIND NOVOS ELEMENTOS
// ======================================================

function bindNew() {
  // Cadastro rápido
  if (els.btnPreencher)    els.btnPreencher.addEventListener("click", quickFill);
  if (els.btnConferir)     els.btnConferir.addEventListener("click", conferirVazios);
  if (els.btnLimparRapido) {
    els.btnLimparRapido.addEventListener("click", function() {
      if (els.txtRapido) els.txtRapido.value = "";
      msg(els.rapidoMsg, "");
    });
  }

  // Filter tabs do dashboard
  const filterTabs = document.getElementById("filterTabs");
  if (filterTabs) {
    filterTabs.querySelectorAll(".filterTab").forEach(function(tab) {
      tab.addEventListener("click", function() {
        filterTabs.querySelectorAll(".filterTab").forEach(function(t) { t.classList.remove("active"); });
        tab.classList.add("active");
        filtroStatus = tab.dataset.status || "todas";
        renderMotoSelect();
        renderMotoCards();
      });
    });
  }
}

// ======================================================
// ===== STARTUP
// ======================================================

bind();
bindNew();
refreshSessionUI();
// Inicializa a barra de ações de fotos no estado "vazio"
updateActionBar(null);