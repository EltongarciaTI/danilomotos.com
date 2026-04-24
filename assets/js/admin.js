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

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// ======================================================
// ===== CONFIG SUPABASE
// ======================================================
// URL do seu projeto e ANON KEY (cliente). Ideal: rotacionar se repo for público.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./data.js?v=20260301c";
// Nome do bucket do Storage onde ficam as fotos
const BUCKET = "motos";

// Cria o client do Supabase (Auth + Database + Storage)
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

// Mostra mensagens (ok/err/normal)
function msg(el, text, type = "") {
  if (!el) return;
  el.className = "hint " + (type === "ok" ? "ok" : type === "err" ? "err" : "");
  el.textContent = text || "";
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
  ativo: "✅ Ativas",
  reservada: "🟠 Reservadas",
  vendida: "🔴 Vendidas",
};

    const groups = {
  ativo: [],
  reservada: [],
  vendida: [],
};

    list.forEach((m) => {
      const st = String(m.status || "ativo").toLowerCase();
      if (groups[st]) groups[st].push(m);
      else groups.disponivel.push(m);
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
  els.motoSelect.innerHTML = `<option value="">➕ Criar nova moto…</option>` + options;

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

// Monta URL pública do storage (bucket público)
// Ex: publicUrl("xre-300-2022/capa.jpg")
function publicUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

// Cache-bust no preview do admin:
// força o navegador a puxar a imagem atualizada ao trocar capa/foto
function publicUrlV(path) {
  return `${publicUrl(path)}?v=${Date.now()}`;
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


// Faz upload de um arquivo para um caminho específico no Storage.
// upsert:true = se já existir, substitui (perfeito pra trocar capa)
// cacheControl alto = site carrega mais rápido
async function uploadSingleToPath(path, file) {
  msg(els.fotoMsg, "Enviando foto...");

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    cacheControl: "2592000", // 30 dias (CDN + navegador)
    contentType: file.type || "image/jpeg",
  });

  if (error) {
    console.error("Erro upload:", error);
    msg(els.fotoMsg, "Erro ao enviar: " + error.message, "err");
    return;
  }

  msg(els.fotoMsg, "Foto enviada ✅", "ok");
}

// Multi-upload: usuário seleciona até 5 fotos no input
// - a primeira vira capa
// - as outras viram 1..4
async function handleMultiUpload(fileList) {
  const id = cleanId(els.id?.value);
  if (!id) {
    msg(els.fotoMsg, "Informe o ID antes de enviar fotos.", "err");
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

  msg(els.fotoMsg, `Enviando ${picked.length} foto(s)...`);

  for (let i = 0; i < picked.length; i++) {
    await uploadSingleToPath(targets[i], picked[i]);
  }

  // ajuda o site público a atualizar a capa quando trocamos fotos
  await touchUpdatedAt(id);
  await syncPhotoPathsToDB(id);

  msg(els.fotoMsg, "Fotos enviadas ✅", "ok");
  await renderFotosGrid(id);
}

// ======================================================
// ===== GRID DE FOTOS (PREVIEW + BOTÕES)
// ======================================================

// Renderiza os slots (capa, 1..4) com:
// - preview se o arquivo existe
// - input pra subir/substituir a foto
// - botão pra remover do storage
async function renderFotosGrid(id) {
  if (!els.fotosGrid) return;

  // se não tem id, limpa o grid
  if (!id) {
    els.fotosGrid.innerHTML = "";
    msg(els.fotoMsg, "");
    return;
  }

  const slots = fotosSlots(id);

  // Descobre quais arquivos existem de verdade na pasta (pra mostrar preview)
  let existing = new Set();
  try {
    const data = await listMotoFiles(id);
    existing = new Set(data.map((x) => x.name));
  } catch {
    // se falhar list (policy, etc), ainda renderiza os slots (sem preview)
  }

  // Monta o HTML dos slots
  els.fotosGrid.innerHTML = slots
    .map((s) => {
      const exists = existing.has(s.filename);
      const src = exists ? publicUrlV(s.path) : ""; // cache-bust
      const label = s.key === "capa" ? "Capa" : `Foto ${s.key}`;

      return `
        <div class="thumb">
          <div class="thumbTitle">${label}</div>

          <img src="${src}" alt="${label}" onerror="this.style.display='none'">

          <input type="file" data-path="${s.path}" accept="image/*" />

          <button class="btn danger" type="button" data-del="${s.path}" style="width:100%;margin-top:8px">
            Remover
          </button>
        </div>
      `;
    })
    .join("");

  // ==========================
  // Bind upload: quando escolhe arquivo em um slot
  // ==========================
  els.fotosGrid.querySelectorAll('input[type="file"][data-path]').forEach((inp) => {
    inp.addEventListener("change", async () => {
      const file = inp.files?.[0];
      if (!file) return;

      const path = inp.dataset.path;

      await uploadSingleToPath(path, file);

      // Se subiu a capa, ajuda o site público a refletir a mudança
      if (String(path || "").endsWith("/capa.jpg")) {
        await touchUpdatedAt(id);
      }

      await syncPhotoPathsToDB(id);

      inp.value = "";
      await renderFotosGrid(id);
    });
  });

  // ==========================
  // Bind delete: botão remover por slot
  // ==========================
  els.fotosGrid.querySelectorAll("button[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const path = btn.dataset.del;
      const ok = confirm("Remover essa foto? Isso apaga do Storage.");
      if (!ok) return;

      msg(els.fotoMsg, "Removendo foto...");

      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      if (error) {
        console.error(error);
        msg(els.fotoMsg, "Erro ao remover: " + error.message, "err");
        return;
      }

      if (String(path || "").endsWith("/capa.jpg")) {
        await touchUpdatedAt(id);
      }

      await syncPhotoPathsToDB(id);

      msg(els.fotoMsg, "Foto removida ✅", "ok");
      await renderFotosGrid(id);
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

  msg(els.loginMsg, "Logado ✅", "ok");
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
    motosCache.length ? "Motos carregadas ✅" : "Nenhuma moto cadastrada ainda.",
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
// Salva (cria ou atualiza) a moto no banco
async function salvar() {
  msg(els.saveMsg, "Salvando...");

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

  console.log("PAYLOAD MOTOS:", clean);

  const r = await supabase
    .from("motos")
    .upsert(clean, { onConflict: "id" })
    .select();

  console.log("RESPOSTA UPSERT:", r);
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

 msg(els.saveMsg, "Moto salva ✅", "ok");

// limpa o cache do site público
sessionStorage.removeItem("daniloMotosCache_ativo");
sessionStorage.removeItem("daniloMotosCache_reservada");
sessionStorage.removeItem("daniloMotosCache_vendida");

await loadMotosAndRender();
fillForm(payload);
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

  const ok = confirm(`Tem certeza que quer apagar a moto "${id}"?\nIsso vai apagar também as fotos no Storage.`);
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

  msg(els.saveMsg, "Moto apagada ✅", "ok");
  await loadMotosAndRender();
  novaMoto();
}

// ======================================================
// ===== CARDS DE MOTOS (DASHBOARD)
// ======================================================

function renderMotoCards() {
  if (!els.motosCards) return;

  const term = String(els.buscaMoto?.value || "").trim().toLowerCase();
  const st   = filtroStatus;

  const list = motosCache.filter((m) => {
    const mst = String(m.status || "ativo").toLowerCase();
    if (st !== "todas" && mst !== st) return false;
    if (!term) return true;
    const hay = `${m.titulo || ""} ${m.cor || ""} ${m.ano || ""} ${m.preco || ""}`.toLowerCase();
    return hay.includes(term);
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

    const capaUrl = `${SUPABASE_URL}/storage/v1/object/public/motos/${id}/capa.jpg`;
    const dest    = !!m.destaque;

    const isCurrent = _currentMoto?.id === id;
    const cardHighlight = isCurrent ? ' style="border-color:rgba(255,29,29,.5)"' : "";

    return `
      <div class="motoCard"${cardHighlight} data-id="${id}">
        <img class="motoCard__img" src="${capaUrl}" alt="${titulo}"
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
          <button class="cardEdit" data-id="${id}">Editar</button>
          <button class="cardAtiv" data-id="${id}" data-setstatus="ativo">Ativar</button>
          <button class="cardResv" data-id="${id}" data-setstatus="reservada">Reservar</button>
          <button class="cardVend" data-id="${id}" data-setstatus="vendida">Vender</button>
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

  els.motosCards.querySelectorAll("[data-setstatus]").forEach((btn) => {
    btn.addEventListener("click", () => setMotoStatus(btn.dataset.id, btn.dataset.setstatus));
  });

  els.motosCards.querySelectorAll(".cardDel").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      if (!confirm(`Apagar a moto "${id}"?\nIsso vai apagar também as fotos no Storage.`)) return;
      msg(els.dashMsg, "Apagando...");
      try { await deleteAllMotoFiles(id); } catch {}
      const { error } = await supabase.from("motos").delete().eq("id", id);
      if (error) { msg(els.dashMsg, "Erro: " + error.message, "err"); return; }
      msg(els.dashMsg, "Moto apagada ✅", "ok");
      await loadMotosAndRender();
    });
  });
}

async function setMotoStatus(motoId, status) {
  if (!motoId) return;
  const labelMap = { ativo: "ATIVA", reservada: "RESERVADA", vendida: "VENDIDA" };
  if (!confirm(`Marcar "${motoId}" como ${labelMap[status] || status}?`)) return;

  if (status === "vendida") {
    try { await deleteAllExceptCover(motoId); } catch {}
    await touchUpdatedAt(motoId);
    await syncPhotoPathsToDB(motoId);
  }

  const { error } = await supabase.from("motos").update({ status }).eq("id", motoId);
  if (error) { alert("Erro: " + error.message); return; }

  sessionStorage.removeItem("daniloMotosCache_ativo");
  sessionStorage.removeItem("daniloMotosCache_reservada");
  sessionStorage.removeItem("daniloMotosCache_vendida");

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
    msg(els.rapidoMsg, `${filled} campo(s) preenchido(s) ✅`, "ok");
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
    msg(els.rapidoMsg, "Todos os campos principais estão preenchidos ✅", "ok");
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


  // Busca: atualiza select oculto + cards
  if (els.buscaMoto) els.buscaMoto.addEventListener("input", function() { renderMotoSelect(); renderMotoCards(); });

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
        const ok = confirm("Marcar como VENDIDA e apagar todas as fotos extras (ficando só a capa)?");
        if (!ok) return;

        try {
          msg(els.fotoMsg, "Apagando fotos extras...");
          const { deleted } = await deleteAllExceptCover(id);
          msg(els.fotoMsg, `Fotos extras removidas ✅ (${deleted})`, "ok");

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