// assets/js/motos.js
// Catálogo estilo marketplace (inspirado em Webmotors) + abas Disponíveis/Vendidas
import { loadMotos } from "./loader.js?v=20260521b";
import { fetchMotosCount } from "./data.js?v=20260521b";

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
    // 1) Destaque (admin marca uma moto pra subir no topo)
    const da = a?.destaque ? 1 : 0;
    const db = b?.destaque ? 1 : 0;
    if (da !== db) return db - da;

    // 2) Ordem definida no admin
    const oa = Number.isFinite(Number(a?.ordem)) ? Number(a.ordem) : 999;
    const ob = Number.isFinite(Number(b?.ordem)) ? Number(b.ordem) : 999;
    if (oa !== ob) return oa - ob;

    // 3) Desempate: ano mais novo primeiro
    const byAno = num(b.ano) - num(a.ano);
    if (byAno !== 0) return byAno;

    // 4) Desempate final: menor km
    return num(a.km) - num(b.km);
  });
}

function renderSkeleton(grid, count = 6) {
  const card = `
    <div class="card-skeleton">
      <div class="card-skeleton__img"></div>
      <div class="card-skeleton__body">
        <div class="skeleton card-skeleton__line"></div>
        <div class="skeleton card-skeleton__line short"></div>
        <div class="skeleton card-skeleton__line tag"></div>
      </div>
    </div>`;
  grid.innerHTML = Array.from({ length: count }, () => card).join("");
}

function renderEmpty(grid, label = "Nenhuma moto nesta aba no momento") {
  grid.innerHTML = `
    <div class="emptyState">
      <svg class="emptyState__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="5.5" cy="17.5" r="3.5"/>
        <circle cx="18.5" cy="17.5" r="3.5"/>
        <path d="M15 6h4l2 5"/>
        <path d="M5 11l3-5h2l3 5"/>
        <path d="M8 11l-2 6h12L15 11"/>
      </svg>
      <p>${label}</p>
    </div>`;
}

function renderCards(grid, motos) {
  if (!motos.length) {
    renderEmpty(grid);
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
        <${Tag} class="card-moto ${isBloqueada ? "isDisabled" : ""}" data-status="${status}" ${href}>
          <img class="card-moto__img is-loading"
               loading="lazy"
               decoding="async"
               src="${imgCapa}"
               alt="${titulo}"
               onload="this.classList.remove('is-loading');this.classList.add('is-loaded');"
               onerror="this.onerror=null; this.src='${IMG_PLACEHOLDER}'; this.classList.remove('is-loading'); this.classList.add('is-loaded');">
          <div class="card-moto__body">
            <div class="card-moto__titulo">${titulo}</div>
            <div class="card-moto__meta">${meta}</div>
            <strong class="card-moto__preco ${precoClass}">${precoLabel}</strong>
          </div>
        </${Tag}>
      `;
    })
    .join("");

  // Imagens que já estavam no cache do navegador (load instantâneo)
  // não disparam onload. Forçamos a remoção do is-loading.
  grid.querySelectorAll(".card-moto__img").forEach((img) => {
    if (img.complete && img.naturalWidth > 0) {
      img.classList.remove("is-loading");
      img.classList.add("is-loaded");
    }
  });

  // Salva scroll + altura + tab quando user clica num card.
  // Quando voltar do detalhe (back button ou link), restauramos sem flicker.
  grid.querySelectorAll("a.card-moto").forEach((card) => {
    card.addEventListener("click", () => {
      try {
        sessionStorage.setItem(
          "catalogoState",
          JSON.stringify({
            y: window.scrollY,
            bodyH: document.documentElement.scrollHeight,
            tab: window.__currentTab || "disponivel",
            ts: Date.now(),
          })
        );
      } catch {}
    });
  });
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

  // Skeleton screens (shimmer profissional)
  renderSkeleton(grid, 6);

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

  const TITLES = {
    disponivel: "Motos disponíveis",
    reservada:  "Motos reservadas",
    vendida:    "Motos vendidas",
  };
  const heroTitle = $("#heroTitle");
  const statAtivas = $("#statAtivas");
  const statVendidas = $("#statVendidas");
  const catalogMeta = $("#catalogMeta");

  // Contadores: 3 requests HEAD leves (não baixam dados, só headers).
  // ~1 KB total em vez de ~80 KB do método antigo.
  (async () => {
    try {
      const [cAtivas, cReservadas, cVendidas] = await Promise.all([
        fetchMotosCount({ status: "disponivel" }),
        fetchMotosCount({ status: "reservada" }),
        fetchMotosCount({ status: "vendida" }),
      ]);
      if (statAtivas)   statAtivas.textContent   = String(cAtivas);
      if (statVendidas) statVendidas.textContent = String(cVendidas);
      if (totalCount)   totalCount.textContent   = String(cAtivas + cReservadas + cVendidas);
    } catch {}
  })();

  // Pre-cache das outras abas só quando o navegador estiver ocioso.
  // Não bloqueia nada e melhora a percepção de velocidade se o usuário trocar de aba.
  const onIdle = window.requestIdleCallback || ((fn) => setTimeout(fn, 2000));
  onIdle(() => {
    loadMotos({ status: "reservada" }).then((d) => { cache.reservada = sortMotos(d); }).catch(() => {});
    loadMotos({ status: "vendida" }).then((d)  => { cache.vendida   = sortMotos(d); }).catch(() => {});
  }, { timeout: 4000 });

  async function showTab(status) {
    setActiveTab(status);
    window.__currentTab = status;
    if (heroTitle) heroTitle.textContent = TITLES[status] || TITLES.disponivel;
    if (catalogMeta) {
      catalogMeta.textContent =
        status === "disponivel" ? "À VENDA AGORA" :
        status === "reservada"  ? "RESERVADAS" :
                                  "JÁ VENDIDAS";
    }

    // Se já temos cache, renderiza direto (sem flash de skeleton)
    if (cache[status]) {
      renderCards(grid, cache[status]);
      return;
    }
    renderSkeleton(grid, 4);
    const list = await getList(status);
    renderCards(grid, list);
  }

  // Restoration: state ja foi lido pelo script inline no <head> em window.__restoreState
  // (que tambem reservou minHeight no <html> pra evitar o flicker do topo).
  const restoreState = window.__restoreState || null;
  const initialTab = restoreState?.tab || "disponivel";
  const restoreScrollY = restoreState ? Number(restoreState.y) || 0 : null;

  // Aplica scroll IMEDIATAMENTE — antes mesmo de renderizar cards. Como o
  // minHeight ja foi reservado no <html>, o navegador aceita o scrollTo
  // (mesmo que os cards ainda nao tenham chegado).
  if (restoreScrollY != null) {
    window.scrollTo({ top: restoreScrollY, behavior: "instant" });
  }

  // Limpa o state pra so restaurar uma vez (proxima visita comeca do topo)
  try { sessionStorage.removeItem("catalogoState"); } catch {}

  await showTab(initialTab);

  // Depois dos cards renderizarem, reaplica scroll (caso a altura final
  // tenha mudado pra mais ou menos do que o reservado) e libera o minHeight.
  if (restoreScrollY != null) {
    requestAnimationFrame(() => {
      window.scrollTo({ top: restoreScrollY, behavior: "instant" });
      document.documentElement.style.minHeight = "";
    });
  } else {
    document.documentElement.style.minHeight = "";
  }

  if (tabAtivas)     tabAtivas.addEventListener("click",     () => showTab("disponivel"));
  if (tabReservadas) tabReservadas.addEventListener("click", () => showTab("reservada"));
  if (tabVendidas)   tabVendidas.addEventListener("click",   () => showTab("vendida"));
}

main().catch((err) => {
  console.error(err);
  alert("Erro ao carregar o catálogo. Veja o console.");
});