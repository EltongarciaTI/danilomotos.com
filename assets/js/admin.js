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
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./data.js";
// Nome do bucket do Storage onde ficam as fotos
// ⚠️ NÃO usamos mais Supabase Storage (evita estourar banda). Imagens vão para GitHub via Cloudflare Worker.
const IMG_UPLOAD_ENDPOINT = "https://blue-salad-b6ae.eltonng645.workers.dev/upload";
const SITE_IMG_BASE = "https://danilomotos.com/assets/img/motos";

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
  return `${SITE_IMG_BASE}/${path}`;
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

// Faz upload de um arquivo para um caminho específico no Storage.
// upsert:true = se já existir, substitui (perfeito pra trocar capa)
// cacheControl alto = site carrega mais rápido
async function uploadSingleToPath(path, file) {
  // path vem como: `${id}/capa.jpg` ou `${id}/1.jpg` etc.
  const [motoId, filename] = String(path || "").split("/");
  if (!motoId || !filename) throw new Error("Path inválido para upload: " + path);

  msg(els.fotoMsg, "Enviando foto...");
  const form = new FormData();
  form.append("file", file);
  form.append("moto_id", motoId);
  form.append("filename", filename);

  const res = await fetch(IMG_UPLOAD_ENDPOINT, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.ok) {
    const errMsg = data?.error || `HTTP ${res.status}`;
    console.error("Erro upload (worker):", errMsg, data);
    msg(els.fotoMsg, "Erro ao enviar: " + errMsg, "err");
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

  // Preview baseado em URL pública do site (GitHub Pages).
  // Se não existir ainda, o <img> vai falhar e a gente esconde.
  const v = Date.now();
  els.fotosGrid.innerHTML = slots
    .map(({ label, path, name }) => {
      const src = `${SITE_IMG_BASE}/${id}/${name}?v=${v}`;
      return `
        <div class="fotoSlot box">
          <div class="fotoSlotHead">
            <strong>${label}</strong>
            <small class="muted">${name}</small>
          </div>

          <div class="fotoSlotPreview">
            <img src="${src}" alt="${label}" loading="lazy"
              onerror="this.style.display='none'; this.parentElement.classList.add('noimg');">
            <div class="noimgTxt">Sem foto</div>
          </div>

          <label class="btn small">
            Enviar/Substituir
            <input type="file" accept="image/*" data-path="${path}" style="display:none">
          </label>
        </div>
      `;
    })
    .join("");

  // listeners dos inputs
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


          await renderFotosGrid(id);
        } catch (e) {
          console.error(e);
          msg(els.fotoMsg, "Erro ao apagar fotos: " + (e?.message || e), "err");
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