import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./data.js?v=20260406a";
import { loadMotos } from "./loader.js?v=20260406a";

const WHATSAPP_NUMBER = "557599834731";
const MAX_FOTOS = 4;

function $(sel) { return document.querySelector(sel); }
function setText(sel, txt) { const e=$(sel); if(e) e.textContent=txt??''; }
function setHtml(sel, html) { const e=$(sel); if(e) e.innerHTML=html??''; }

function formatBRL(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL", maximumFractionDigits:0 }).format(n);
}

function makeWhatsLink(texto) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(texto||"Olá! Quero negociar uma moto do catálogo.")}`;
}

function youtubeToEmbed(url) {
  try {
    const u = new URL(url);
    let id = "";
    if (u.hostname.includes("youtu.be")) id = u.pathname.replace("/","");
    else if (u.pathname.includes("/shorts/")) id = u.pathname.split("/shorts/")[1]?.split("/")[0]||"";
    else id = u.searchParams.get("v")||"";
    return id ? `https://www.youtube.com/embed/${id}` : "";
  } catch { return ""; }
}

function buildFotos(moto) {
  if (Array.isArray(moto?.fotos) && moto.fotos.length) {
    if (["vendida","reservada"].includes((moto.status||"").toLowerCase())) return [moto.fotos[0]].filter(Boolean);
    return moto.fotos.filter(Boolean);
  }
  const base = moto.fotosBase || `assets/img/motos/${moto.id}/`;
  const fotos = [(moto.capa&&String(moto.capa).trim()) ? moto.capa : `${base}capa.jpg`];
  for (let i=1;i<=MAX_FOTOS;i++) fotos.push(`${base}${i}.jpg`);
  return fotos.filter(f => typeof f==="string"&&f.trim()!=="");
}

/* ── CAROUSEL COM DOTS ── */
function renderCarousel(fotos) {
  const track = $("#galeria");
  const dotsEl = $("#fotoDots");
  if (!track) return;

  let idx = 0;
  const fallback = fotos[0] || "";

  track.innerHTML = fotos.map((src, i) =>
    `<img src="${src||fallback}" ${i===0?'loading="eager" fetchpriority="high"':'loading="lazy"'} decoding="async" alt="Foto da moto" onerror="this.onerror=null;this.src='${fallback}';">`
  ).join("");

  const prevBtn = $("#prevFoto");
  const nextBtn = $("#nextFoto");

  function totalSlides() { return track.querySelectorAll("img").length; }

  function updateDots(total) {
    if (!dotsEl || total <= 1) { if(dotsEl) dotsEl.innerHTML=""; return; }
    dotsEl.innerHTML = Array.from({length:total}, (_,i) =>
      `<div class="fotoDot${i===idx?' active':''}"></div>`
    ).join("");
  }

  function update() {
    const total = totalSlides();
    if (idx < 0) idx = 0;
    if (idx > total-1) idx = total-1;

    if (total <= 0) {
      track.innerHTML = `<p class="muted" style="padding:20px">Sem fotos.</p>`;
      if(prevBtn) prevBtn.style.display="none";
      if(nextBtn) nextBtn.style.display="none";
      updateDots(0);
      return;
    }
    if(prevBtn) prevBtn.style.display = total>1 ? "" : "none";
    if(nextBtn) nextBtn.style.display = total>1 ? "" : "none";
    track.style.transform = `translateX(-${idx*100}%)`;
    updateDots(total);
  }

  track.querySelectorAll("img").forEach(img => {
    img.addEventListener("error", () => { img.remove(); update(); });
  });

  if (prevBtn) prevBtn.onclick = () => { const t=totalSlides(); if(t>1){ idx=(idx-1+t)%t; update(); } };
  if (nextBtn) nextBtn.onclick = () => { const t=totalSlides(); if(t>1){ idx=(idx+1)%t; update(); } };

  let startX = 0;
  track.addEventListener("touchstart", e => { startX = e.touches[0].clientX; }, {passive:true});
  track.addEventListener("touchend", e => {
    const diff = startX - e.changedTouches[0].clientX;
    if (diff > 50) nextBtn?.click();
    else if (diff < -50) prevBtn?.click();
  });

  requestAnimationFrame(update);
}

/* ── ÍCONES DA FICHA ── */
const ICONS = {
  "Preço":      `<path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>`,
  "Ano":        `<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>`,
  "KM":         `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
  "Cor":        `<circle cx="12" cy="12" r="10"/><path d="M12 8a4 4 0 100 8 4 4 0 000-8z"/>`,
  "Emplacada":  `<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 11 17 15 13"/>`,
  "Cilindrada": `<path d="M18 3a3 3 0 00-3 3v12a3 3 0 003 3 3 3 0 003-3 3 3 0 00-3-3H6a3 3 0 00-3 3 3 3 0 003 3 3 3 0 003-3V6a3 3 0 00-3-3 3 3 0 00-3 3 3 3 0 003 3h12a3 3 0 003-3 3 3 0 00-3-3z"/>`,
  "Combustível":`<path d="M3 22V8l9-6 9 6v14"/><path d="M12 22v-6"/><path d="M9 10h6"/>`,
  "Partida":    `<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>`,
  "Observações":`<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>`,
};

function icon(key) {
  const d = ICONS[key] || `<circle cx="12" cy="12" r="3"/>`;
  return `<svg viewBox="0 0 24 24">${d}</svg>`;
}

function buildFichaHtml(rows) {
  return rows.map(([k, v, extra]) => `
    <div class="fichaLinha">
      <span class="fichaKey">${icon(k)}${k}</span>
      <span class="fichaVal${extra||''}">${v}</span>
    </div>
  `).join("");
}

/* ── STATUS CHIP ── */
function setStatusChip(status) {
  const chip = $("#statusChip");
  if (!chip) return;
  const map = {
    disponivel: {cls:"disp", label:"Disponível"},
    reservada:  {cls:"resv", label:"Reservada"},
    vendida:    {cls:"vend", label:"Vendida"},
  };
  const s = map[status] || {cls:"disp", label:"Disponível"};
  chip.className = `statusChip ${s.cls}`;
  chip.innerHTML = `<span class="statusDot"></span>${s.label}`;
}

/* ── PREÇO DESTAQUE ── */
function setPreco(valor) {
  const box = $("#precoDestaque");
  const el  = $("#precoValor");
  if (!box || !el || !valor) return;
  el.textContent = valor;
  box.style.display = "block";
}

async function main() {
  try {
    const yearEl = $("#year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    const params = new URLSearchParams(location.search);
    const id = decodeURIComponent(params.get("id")||"").trim();

    if (!id) {
      setText("#titulo", "Moto não encontrada");
      setText("#subtitulo", "Parâmetro ?id= ausente");
      return;
    }

    const motos = await loadMotos({ status:"all" });
    const moto = motos.find(m => String(m.id)===id);

    if (!moto) {
      setText("#titulo", "Moto não encontrada");
      setText("#subtitulo", `ID: ${id}`);
      return;
    }

    const status = String(moto.status||"disponivel").toLowerCase();
    const isBloqueada = status==="vendida" || status==="reservada";

    /* Título / subtítulo */
    document.title = `${moto.titulo||moto.id} | Danilo Motos`;
    setText("#titulo", moto.titulo||moto.id);
    setText("#subtitulo", [
      moto.ano,
      moto.km ? `${Number(moto.km).toLocaleString("pt-BR")} km` : "",
      moto.cor,
    ].filter(Boolean).join(" · "));

    setStatusChip(status);

    /* WhatsApp */
    const msg = moto.whatsapp_texto || `Olá! Tenho interesse na ${moto.titulo||"moto"}${moto.ano?" "+moto.ano:""}.`;
    const waLink = makeWhatsLink(msg);
    ["#btnWhatsapp","#waContato","#waFloat","#waHeader"].forEach(sel => {
      const a = $(sel);
      if (a) a.href = waLink;
    });

    const base = moto.fotosBase || `assets/img/motos/${moto.id}/`;
    const capaUrl = moto.capa || `${base}capa.jpg`;

    /* ── BLOQUEADA ── */
    if (isBloqueada) {
      const track = $("#galeria");
      if (track) {
        track.innerHTML = `<img src="${capaUrl}" loading="eager" fetchpriority="high" decoding="async" alt="${moto.titulo||moto.id}" onerror="this.onerror=null;this.src='${base}capa.jpg';">`;
        track.style.transform = "translateX(0%)";
      }
      const prev = $("#prevFoto"); const next = $("#nextFoto");
      if(prev) prev.style.display="none";
      if(next) next.style.display="none";
      if($("#fotoDots")) $("#fotoDots").innerHTML="";
      if($("#videoBox")) $("#videoBox").style.display="none";
      if($("#fichaSection")) $("#fichaSection").style.display="none";

      const label = status==="reservada" ? "Reservada" : "Vendida";
      const emoji = status==="reservada" ? "🟠" : "🔴";
      const sub   = status==="reservada"
        ? "Essa moto está reservada. Entre em contato para saber mais ou ver outras opções."
        : "Essa moto já foi vendida. Fale conosco para encontrar uma similar!";

      const bloq = $("#bloqueadaBox");
      if (bloq) {
        bloq.style.display = "";
        bloq.innerHTML = `
          <div class="bloqueadaIcon">${emoji}</div>
          <div class="bloqueadaTitle">${label}</div>
          <div class="bloqueadaSub">${sub}</div>
          <a class="btn primary" href="${waLink}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;text-decoration:none">
            Consultar no WhatsApp
          </a>
        `;
      }
      return;
    }

    /* ── DISPONÍVEL ── */

    /* Fotos */
    renderCarousel(buildFotos(moto));

    /* Preço */
    const precoFmt = formatBRL(moto.preco);
    if (precoFmt) setPreco(precoFmt);

    /* Vídeo */
    const videoBox = $("#videoBox");
    if (moto.youtube) {
      const embed = youtubeToEmbed(moto.youtube);
      if (embed) {
        setHtml("#video", `<div class="videoWrap"><iframe src="${embed}" title="Vídeo da moto" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe></div>`);
        const vLink = $("#videoLink");
        if (vLink) vLink.href = moto.youtube;
        if (videoBox) videoBox.style.display="";
      } else {
        if (videoBox) videoBox.style.display="none";
      }
    } else {
      if (videoBox) videoBox.style.display="none";
    }

    /* Ficha */
    const rows = [
      moto.preco   ? ["Preço",      formatBRL(moto.preco), " preco"] : null,
      moto.ano     ? ["Ano",        moto.ano]           : null,
      moto.km      ? ["KM",         Number(moto.km).toLocaleString("pt-BR")+" km"] : null,
      moto.cor     ? ["Cor",        moto.cor]           : null,
                     ["Emplacada",  moto.emplacada ? "Sim" : "Não"],
      moto.cilindrada  ? ["Cilindrada",  moto.cilindrada]  : null,
      moto.combustivel ? ["Combustível", moto.combustivel] : null,
      moto.partida     ? ["Partida",     moto.partida]     : null,
      moto.observacoes ? ["Observações", moto.observacoes] : null,
    ].filter(Boolean);

    if (rows.length) {
      setHtml("#ficha", buildFichaHtml(rows));
    } else {
      setHtml("#ficha", `<p class="muted" style="padding:16px">Sem informações cadastradas.</p>`);
    }

  } catch (err) {
    console.error("Erro no moto.js:", err);
    setText("#titulo", "Erro ao carregar");
    setText("#subtitulo", "Abra o console (F12) para ver o motivo.");
  }
}

main();
