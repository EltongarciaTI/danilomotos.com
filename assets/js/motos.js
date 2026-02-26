// assets/js/motos.js
// Catálogo estilo marketplace (inspirado em Webmotors) + abas Disponíveis/Reservadas/Vendidas
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

function formatBRL(value) {
  // aceita número, "45900", "45.900", "R$ 45.900" etc.
  const n = typeof value === "number" ? value : num(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);
}

function sortMotos(list) {
  return [...(list || [])].sort((a, b) => {
    const oa = Number.isFinite(Number(a?.ordem)) ? Number(a.ordem) : 999;
    const ob = Number.isFinite(Number(b?.ordem)) ? Number(b.ordem) : 999;

    if (oa !== ob) return oa - ob;

    const byAno = num(b?.ano) - num(a?.ano);
    if (byAno !== 0) return byAno;

    return num(a?.km) - num(b?.km);
  });
}

function getImgFallback(m) {
  const idSafe = encodeURIComponent(String(m?.id ?? ""));
  const base = (m?.fotosBase || `assets2/motos/${idSafe}/`).replace(/\/\/+/g, "/");
  return `${base}1.jpg`;
}

function renderCards(grid, motos) {
  if (!motos?.length) {
    grid.innerHTML = `<p class="muted" style="color:var(--muted)">Nenhuma moto aqui no momento.</p>`;
    return;
  }

  grid.innerHTML = motos
    .map((m) => {
      const id = encodeURIComponent(String(m?.id ?? ""));
      const titulo = escapeHtml(m?.titulo || m?.id || "Moto");
      const anoTxt = m?.ano ? String(m.ano) : "";
      const kmNum = m?.km ? num(m.km) : 0;

      const status = String(m?.status || "ativo").toLowerCase();

      let precoLabel = m?.preco ? formatBRL(m.preco) : "Consultar";
      let precoClass = "isDisponivel";

      if (status === "vendida") {
        precoLabel = "Vendido";
        precoClass = "isVendido";
      } else if (status === "reservada") {
        precoLabel = "Reservado";
        precoClass = "isReservado";
      }

      const meta = [
        anoTxt,
        kmNum ? `${kmNum.toLocaleString("pt-BR")} km` : "",
      ]
        .filter(Boolean)
        .join(" • ");

      const imgCapa = String(m?.capa || "");
      const imgFallback = getImgFallback(m);

      const isVendida = status === "vendida";
      const Tag = isVendida ? "div" : "a";
      const hrefAttr = isVendida ? "" : `href="moto.html?id=${id}"`;

      return `
        <${Tag} class="card-moto ${isVendida ? "isDisabled" : ""}" ${hrefAttr}>
          <img class="card-moto__img"
               loading="lazy"
               src="${imgCapa}"
               alt="${titulo}"
               onerror="this.onerror=null; this.src='${imgFallback}';">
          <div class="card-moto__body">
            <div class="card-moto__titulo">${titulo}</div>
            <div class="card-moto__meta">${escapeHtml(meta)}</div>
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

  grid.innerHTML = `
    <div style="opacity:.7;color:var(--muted);font-weight:900;padding:10px">
      Carregando motos...
    </div>
  `;

  const [ativasRaw, reservadasRaw, vendidasRaw] = await Promise.all([
    loadMotos({ status: "ativo" }),
    loadMotos({ status: "reservada" }),
    loadMotos({ status: "vendida" }),
  ]);

  const lists = {
    ativo: sortMotos(ativasRaw),
    reservada: sortMotos(reservadasRaw),
    vendida: sortMotos(vendidasRaw),
  };

  function setActiveTab(active) {
    tabAtivas?.classList.toggle("isActive", active === "ativo");
    tabReservadas?.classList.toggle("isActive", active === "reservada");
    tabVendidas?.classList.toggle("isActive", active === "vendida");
  }

  function show(status) {
    setActiveTab(status);
    const arr = lists[status] || [];
    renderCards(grid, arr);
    if (totalCount) totalCount.textContent = String(arr.length);
  }

  tabAtivas?.addEventListener("click", () => show("ativo"));
  tabReservadas?.addEventListener("click", () => show("reservada"));
  tabVendidas?.addEventListener("click", () => show("vendida"));

  // Default: disponíveis
  show("ativo");
}

main().catch((err) => {
  console.error(err);
  alert("Erro ao carregar o catálogo. Veja o console.");
});