// assets/js/motos.js
// Catálogo estilo marketplace (inspirado em Webmotors) + abas Disponíveis/Vendidas
import { loadMotos } from "./loader.js";

import { WHATSAPP_NUMBER } from "./config.js";

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


function num(v) {
  const n = Number(String(v ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// 👇 COLE AQUI
function formatBRL(value) {
  const n = Number(value);
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

      const status = String(m.status || "ativo").toLowerCase();

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

      const ver = m.updated_at || Date.now();
      const imgCapa = `${SITE_IMG_BASE}/${m.id}/capa.jpg?v=${ver}`;
      const imgFallback = `assets/img/motos/${m.id}/1.jpg?v=${encodeURIComponent(ver)}`;

      const isVendida = status === "vendida";
      const Tag = isVendida ? "div" : "a";
      const href = isVendida ? "" : `href="moto.html?id=${id}"`;

      return `
        <${Tag} class="card-moto ${isVendida ? "isDisabled" : ""}" ${href}>
          <img class="card-moto__img"
               loading="lazy"
               src="${imgCapa}"
               alt="${titulo}"
               onerror="this.onerror=null; this.src='${imgFallback}';">
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

  // Carrega as três listas
  const [ativasRaw, reservadasRaw, vendidasRaw] = await Promise.all([
    loadMotos({ status: "ativo" }),
    loadMotos({ status: "reservada" }),
    loadMotos({ status: "vendida" }),
  ]);

  const ativas = sortMotos(ativasRaw);
  const reservadas = sortMotos(reservadasRaw);
  const vendidas = sortMotos(vendidasRaw);

  // Default: disponíveis
  renderCards(grid, ativas);
  if (totalCount) totalCount.textContent = String(ativas.length);

  function setActiveTab(active) {
    if (tabAtivas) tabAtivas.classList.toggle("isActive", active === "ativo");
    if (tabReservadas) tabReservadas.classList.toggle("isActive", active === "reservada");
    if (tabVendidas) tabVendidas.classList.toggle("isActive", active === "vendida");
  }

  if (tabAtivas) {
    tabAtivas.addEventListener("click", () => {
      setActiveTab("ativo");
      renderCards(grid, ativas);
      if (totalCount) totalCount.textContent = String(ativas.length);
      setActiveTab("ativo");
    });
  }

  if (tabReservadas) {
    tabReservadas.addEventListener("click", () => {
      setActiveTab("reservada");
      renderCards(grid, reservadas);
      if (totalCount) totalCount.textContent = String(reservadas.length);
    });
  }

  if (tabVendidas) {
    tabVendidas.addEventListener("click", () => {
      setActiveTab("vendida");
      renderCards(grid, vendidas);
      if (totalCount) totalCount.textContent = String(vendidas.length);
    });
  }
}

main().catch((err) => {
  console.error(err);
  alert("Erro ao carregar o catálogo. Veja o console.");
});