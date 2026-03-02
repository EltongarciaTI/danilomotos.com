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
};

// cache local de motos (pra não ficar consultando toda hora)
let motosCache = [];
let currentMoto = null;

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
      const st = String(m.status || "disponivel").toLowerCase();
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
      disponivel: "✅ Disponíveis",
      reservada: "🟠 Reservadas",
      vendida: "🔴 Vendidas",
    };

    const groups = {
      disponivel: [],
      reservada: [],
      vendida: [],
    };

    list.forEach((m) => {
      const st = String(m.status || "disponivel").toLowerCase();
      if (groups[st]) groups[st].push(m);
      else groups.disponivel.push(m);
    });

    options = Object.keys(groups)
      .map((key) => {
        const arr = groups[key];
        if (!arr.length) return "";
        const inner = arr
          .map((m) => {
            const st = String(m.status || "disponivel").toUpperCase();
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
        const st = String(m.status || "disponivel").toUpperCase();
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
  const disp = motosCache.filter((m) => (m.status || "disponivel") === "disponivel").length;
  const resv = motosCache.filter((m) => m.status === "reservada").length;
  const vend = motosCache.filter((m) => m.status === "vendida").length;
  const dest = motosCache.filter((m) => !!m.destaque).length;

  els.dashGrid.innerHTML = `
    <div class="thumb"><div class="thumbTitle">Total cadastradas</div><div style="font-size:22px;font-weight:1100">${total}</div></div>
    <div class="thumb"><div class="thumbTitle">Disponíveis</div><div style="font-size:22px;font-weight:1100">${disp}</div></div>
    <div class="thumb"><div class="thumbTitle">Reservadas</div><div style="font-size:22px;font-weight:1100">${resv}</div></div>
    <div class="thumb"><div class="thumbTitle">Vendidas</div><div style="font-size:22px;font-weight:1100">${vend}</div></div>
    <div class="thumb"><div class="thumbTitle">Destaques</div><div style="font-size:22px;font-weight:1100">${dest}</div></div>
  `;
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

  if (els.loginBox) els.loginBox.style.display = logged ? "none" : "grid";
  if (els.appBox) els.appBox.style.display = logged ? "" : "none";
  if (els.btnLogout) els.btnLogout.style.display = logged ? "" : "none";

  if (logged) {
    await loadMotosAndRender();
  }
}

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
  currentMoto = m;

  if (els.id) els.id.value = m?.id || "";
  if (els.status) els.status.value = m?.status || "disponivel";
  if (els.titulo) els.titulo.value = m?.titulo || "";
  if (els.preco) els.preco.value = m?.preco || "";
  if (els.ordem) els.ordem.value = m?.ordem ?? "";
  if (els.ano) els.ano.value = m?.ano ?? "";
  if (els.km) els.km.value = m?.km ?? "";
  if (els.cor) els.cor.value = m?.cor || "";
  if (els.cilindrada) els.cilindrada.value = m?.cilindrada || "";
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
    status: els.status?.value || "disponivel",
    titulo: (els.titulo?.value || "").trim(),
    preco: els.preco?.value ? Number(onlyDigits(els.preco.value)) : null,
    ordem: els.ordem?.value ? Number(els.ordem.value) : 999,
    ano: (els.ano?.value || "").trim(),
    km: els.km?.value ? Number(onlyDigits(els.km.value)) : null,
    cor: (els.cor?.value || "").trim(),
    cilindrada: (els.cilindrada?.value || "").trim(),
    combustivel: (els.combustivel?.value || "").trim(),
    partida: (els.partida?.value || "").trim(),

    youtube: (els.youtube?.value || "").trim(),
    whatsapp_texto: (els.whatsapp_texto?.value || "").trim(),
    observacoes: (els.observacoes?.value || "").trim(),

    emplacada: !!els.emplacada?.checked,
  };

  // campos extras (se existirem na tabela)
  if (els.obs_internas) payload.obs_internas = (els.obs_internas.value || "").trim();
  if (els.destaque) payload.destaque = !!els.destaque.checked;

  // limpa strings vazias -> null
  Object.keys(payload).forEach((k) => {
    if (payload[k] === "" || payload[k] === undefined) payload[k] = null;
  });

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

  const { data, error } = await supabase
    .from("motos")
    .upsert(payload, { onConflict: "id" })
    .select();

  if (error) {
    console.error("Erro upsert:", error);
    msg(els.saveMsg, "Erro ao salvar: " + error.message, "err");
    return;
  }

  msg(els.saveMsg, "Moto salva ✅", "ok");
  await loadMotosAndRender();
  fillForm(payload);
}

// Abre formulário em branco (nova moto)
function novaMoto() {
  fillForm({
    id: "",
    status: "disponivel",
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


  // Filtros e busca do select
  if (els.buscaMoto) els.buscaMoto.addEventListener("input", () => renderMotoSelect());
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
// ===== STARTUP
// ======================================================

bind();
refreshSessionUI();