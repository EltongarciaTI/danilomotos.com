// assets/js/motos.js
// Catálogo estilo marketplace (inspirado em Webmotors) + abas Disponíveis/Vendidas
import { loadMotos } from "./loader.js?v=20260520a";

const WHATSAPP_NUMBER = "5575999185684"; // 55 + DDD + número

function $(sel) {
  return document.querySelector(sel);
}

function makeWhatsLink(texto) {
  const msg = encodeURIComponent(texto || "Olá! Quero negociar uma moto do catálogo.");
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
}

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Placeholder SVG inline mostrado se a imagem do Supabase falhar.
// Não consome banda — fica embutido no JS.
const IMG_PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
      <rect width="400" height="300" fill="#1a1c20"/>
      <g fill="none" stroke="#3a3d44" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M120 200l40-40 40 30 40-50 40 30"/>
        <circle cx="130" cy="210" r="14"/>
        <circle cx="270" cy="210" r="14"/>
      </g>
      <text x="200" y="260" text-anchor="middle" fill="#5a5d64" font-family="system-ui,sans-serif" font-size="14" font-weight="700">Foto indisponivel</text>
    </svg>`.replace(/\s+/g, " ")
  );


function num(v) {
  const n = Number(String(v ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// 👇 COLE AQUI
function formatBRL(value) {
  const n = Number(String(value ?? "").replace(/[^\d]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);
}
function sortMotos(list) {
  return [...list].sort((a, b) => {
    const oa = Number.isFinite(Number(a?.ordem)) ? Number(a.ordem) : 999;
    const ob = Number.isFinite(Number(b?.ordem)) ? Number(b.ordem) : 999;

    // 1) Ordem definida no admin
    if (oa !== ob) return oa - ob;

    // 2) Desempate: ano mais novo primeiro
    const byAno = num(b.ano) - num(a.ano);
    if (byAno !== 0) return byAno;

    // 3) Desempate final: menor km
    return num(a.km) - num(b.km);
  });
}

function renderCards(grid, motos) {
  if (!motos.length) {
    grid.innerHTML = `<p class="muted" style="color:var(--muted)">Nenhuma moto aqui no momento.</p>`;
    return;
  }

  grid.innerHTML = motos
    .map((m) => {
      const id = encodeURIComponent(m.id);
      const titulo = escapeHtml(m.titulo || m.id);
      const ano = m.ano ? String(m.ano) : "";
      const km = m.km ? String(m.km) : "";

      const status = String(m.status || "disponivel").toLowerCase();

      let precoLabel = m.preco ? formatBRL(m.preco) : "Consultar";
      let precoClass = "isDisponivel";

      if (status === "vendida") {
        precoLabel = "Vendido";
        precoClass = "isVendido";
      } else if (status === "reservada") {
        precoLabel = "Reservado";
        precoClass = "isReservado";
      }

      const meta = [ano, km ? `${Number(km).toLocaleString("pt-BR")} km` : ""]
        .filter(Boolean)
        .join(" • ");

      const imgCapa = m.capa || IMG_PLACEHOLDER;

      const isBloqueada = status === "vendida" || status === "reservada";
      const Tag = isBloqueada ? "div" : "a";
      const href = isBloqueada ? "" : `href="moto.html?id=${id}"`;

      return `
        <${Tag} class="card-moto ${isBloqueada ? "isDisabled" : ""}" ${href}>
          <img class="card-moto__img"
               loading="lazy"
               src="${imgCapa}"
               alt="${titulo}"
               onerror="this.onerror=null; this.src='${IMG_PLACEHOLDER}';">
          <div class="card-moto__body">
            <div class="card-moto__titulo">${titulo}</div>
            <div class="card-moto__meta">${meta}</div>
            <strong class="card-moto__preco ${precoClass}">${precoLabel}</strong>
          </div>
        </${Tag}>
      `;
    })
    .join("");
}

async function main() {
  // WhatsApp global
  const waLink = makeWhatsLink();
  ["#waHeader", "#waContato", "#waFloat"].forEach((id) => {
    const a = $(id);
    if (a) a.href = waLink;
  });

  const grid = $("#motosGrid");
  if (!grid) return;

  const tabAtivas = $("#tabAtivas");
  const tabReservadas = $("#tabReservadas");
  const tabVendidas = $("#tabVendidas");
  const totalCount = $("#totalCount");

  // Skeleton simples
  grid.innerHTML = `
    <div style="opacity:.7;color:var(--muted);font-weight:900;padding:10px">
      Carregando motos...
    </div>
  `;

  // Lazy load: só carrega a tab clicada (default: disponíveis)
  const cache = {};

  async function getList(status) {
    if (cache[status]) return cache[status];
    const raw = await loadMotos({ status });
    cache[status] = sortMotos(raw);
    return cache[status];
  }

  function setActiveTab(active) {
    if (tabAtivas) tabAtivas.classList.toggle("isActive", active === "disponivel");
    if (tabReservadas) tabReservadas.classList.toggle("isActive", active === "reservada");
    if (tabVendidas) tabVendidas.classList.toggle("isActive", active === "vendida");
  }

  async function showTab(status) {
    setActiveTab(status);
    grid.innerHTML = `<div style="opacity:.7;color:var(--muted);font-weight:900;padding:10px">Carregando...</div>`;
    const list = await getList(status);
    renderCards(grid, list);
    if (totalCount) totalCount.textContent = String(list.length);
  }

  await showTab("disponivel");

  if (tabAtivas)     tabAtivas.addEventListener("click",     () => showTab("disponivel"));
  if (tabReservadas) tabReservadas.addEventListener("click", () => showTab("reservada"));
  if (tabVendidas)   tabVendidas.addEventListener("click",   () => showTab("vendida"));
}

main().catch((err) => {
  console.error(err);
  alert("Erro ao carregar o catálogo. Veja o console.");
});