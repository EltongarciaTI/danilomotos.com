import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./data.js?v=20260521b";
import { loadMotos } from "./loader.js?v=20260521b";

// Atualiza tags Open Graph quando a moto carrega.
// Faz o link da moto bonitão no WhatsApp/Insta (preview com foto e descrição).
function setOG(title, description, imageUrl, url) {
  const set = (selector, attr, value) => {
    const el = document.querySelector(selector);
    if (el) el.setAttribute(attr, value);
  };
  document.title = title;
  set('meta[name="description"]', "content", description);
  set('meta[property="og:title"]', "content", title);
  set('meta[property="og:description"]', "content", description);
  if (imageUrl) set('meta[property="og:image"]', "content", imageUrl);
  set('meta[property="og:url"]', "content", url);
}

const WHATSAPP_NUMBER = "5575999185684";
const MAX_FOTOS = 4;

// Placeholder SVG inline mostrado se a imagem do Supabase falhar.
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
  const base = moto.fotosBase || "";
  if (!base) return [moto.capa].filter(Boolean);
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

  // Numa pagina de detalhe o user QUER ver todas as fotos da moto.
  // Carrega TODAS desde o inicio (eager): a primeira com prioridade alta,
  // as demais em paralelo (sem lazy). Sao no maximo 5 fotos por moto.
  track.innerHTML = fotos.map((src, i) =>
    `<img class="is-loading" src="${src||fallback}" loading="eager" ${i===0?'fetchpriority="high"':'fetchpriority="low"'} decoding="async" alt="Foto da moto" onload="this.classList.remove('is-loading');this.classList.add('is-loaded');" onerror="this.onerror=null;this.src='${IMG_PLACEHOLDER}';this.classList.remove('is-loading');this.classList.add('is-loaded');">`
  ).join("");

  // Imagens já em cache não disparam onload
  track.querySelectorAll("img").forEach((img) => {
    if (img.complete && img.naturalWidth > 0) {
      img.classList.remove("is-loading");
      img.classList.add("is-loaded");
    }
  });

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

  // Clicar na imagem do carrossel abre lightbox (zoom fullscreen)
  track.addEventListener("click", (e) => {
    const img = e.target.closest("img");
    if (!img || !img.src) return;
    openLightbox(fotos, idx);
  });

  requestAnimationFrame(update);
}

/* ── LIGHTBOX com ZOOM (wheel + double-click + pinch + pan) ── */
function openLightbox(fotos, startIdx = 0) {
  if (!fotos || !fotos.length) return;
  let i = startIdx;

  const overlay = document.createElement("div");
  overlay.className = "lightbox";
  overlay.innerHTML = `
    <button class="lightbox__close" aria-label="Fechar">✕</button>
    <button class="lightbox__btn lightbox__prev" aria-label="Anterior">‹</button>
    <div class="lightbox__stage">
      <img class="lightbox__img" src="${fotos[i]}" alt="Foto da moto" draggable="false">
    </div>
    <button class="lightbox__btn lightbox__next" aria-label="Próxima">›</button>
    <div class="lightbox__counter"></div>
    <div class="lightbox__hint">Scroll, duplo-clique ou pinch pra zoom</div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  const imgEl = overlay.querySelector(".lightbox__img");
  const stage = overlay.querySelector(".lightbox__stage");
  const counterEl = overlay.querySelector(".lightbox__counter");
  const hintEl = overlay.querySelector(".lightbox__hint");
  const prev = overlay.querySelector(".lightbox__prev");
  const next = overlay.querySelector(".lightbox__next");
  const close = overlay.querySelector(".lightbox__close");

  // Estado de transformacao
  let scale = 1, tx = 0, ty = 0;
  const MIN_SCALE = 1, MAX_SCALE = 4;
  let hintShown = false;

  function applyTransform() {
    imgEl.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
    imgEl.style.cursor = scale > 1 ? "grab" : "zoom-in";
    stage.classList.toggle("is-zoomed", scale > 1);
  }
  function resetZoom() { scale = 1; tx = 0; ty = 0; applyTransform(); }
  function clampPan() {
    // Limita pan pra imagem nao sair muito longe
    const rect = stage.getBoundingClientRect();
    const maxX = (rect.width * (scale - 1)) / 2 + 80;
    const maxY = (rect.height * (scale - 1)) / 2 + 80;
    tx = Math.max(-maxX, Math.min(maxX, tx));
    ty = Math.max(-maxY, Math.min(maxY, ty));
  }
  function zoomAt(factor, clientX, clientY) {
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));
    if (newScale === scale) return;
    // Zoom mantendo o ponto do mouse fixo
    const rect = imgEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (clientX - cx) / scale;
    const dy = (clientY - cy) / scale;
    tx -= dx * (newScale - scale);
    ty -= dy * (newScale - scale);
    scale = newScale;
    if (scale === 1) { tx = 0; ty = 0; }
    clampPan();
    applyTransform();
  }

  function render() {
    imgEl.src = fotos[i];
    counterEl.textContent = `${i + 1} / ${fotos.length}`;
    const show = fotos.length > 1;
    prev.style.display = show ? "" : "none";
    next.style.display = show ? "" : "none";
    resetZoom();
  }
  function fechar() {
    overlay.remove();
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKey);
  }
  function onKey(ev) {
    if (ev.key === "Escape") fechar();
    else if (ev.key === "ArrowLeft" && scale === 1) { i = (i - 1 + fotos.length) % fotos.length; render(); }
    else if (ev.key === "ArrowRight" && scale === 1) { i = (i + 1) % fotos.length; render(); }
    else if (ev.key === "+" || ev.key === "=") zoomAt(1.3, window.innerWidth/2, window.innerHeight/2);
    else if (ev.key === "-") zoomAt(1/1.3, window.innerWidth/2, window.innerHeight/2);
    else if (ev.key === "0") resetZoom();
  }
  function hideHint() {
    if (hintShown) return;
    hintShown = true;
    hintEl.classList.add("is-hidden");
  }

  prev.onclick = (ev) => { ev.stopPropagation(); i = (i - 1 + fotos.length) % fotos.length; render(); };
  next.onclick = (ev) => { ev.stopPropagation(); i = (i + 1) % fotos.length; render(); };
  close.onclick = fechar;

  // Click no fundo fecha (so quando nao tem zoom, pra nao fechar acidental durante zoom)
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay && scale === 1) fechar();
  });

  // Wheel zoom (desktop)
  stage.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    hideHint();
    const factor = ev.deltaY < 0 ? 1.18 : 1/1.18;
    zoomAt(factor, ev.clientX, ev.clientY);
  }, { passive: false });

  // Double-click toggle zoom (desktop)
  imgEl.addEventListener("dblclick", (ev) => {
    ev.preventDefault();
    hideHint();
    if (scale > 1) resetZoom();
    else zoomAt(2.5, ev.clientX, ev.clientY);
  });

  // Drag pra pan quando zoomed (mouse)
  let dragging = false, lastX = 0, lastY = 0;
  imgEl.addEventListener("mousedown", (ev) => {
    if (scale <= 1) return;
    dragging = true; lastX = ev.clientX; lastY = ev.clientY;
    imgEl.style.cursor = "grabbing";
    ev.preventDefault();
  });
  window.addEventListener("mousemove", (ev) => {
    if (!dragging) return;
    tx += ev.clientX - lastX; ty += ev.clientY - lastY;
    lastX = ev.clientX; lastY = ev.clientY;
    clampPan(); applyTransform();
  });
  window.addEventListener("mouseup", () => {
    if (dragging) { dragging = false; imgEl.style.cursor = scale > 1 ? "grab" : "zoom-in"; }
  });

  // Touch: pinch zoom + pan + swipe pra navegar
  let touches = [];
  let lastDist = 0, lastMid = null, swipeStart = null;
  let lastTap = 0;

  stage.addEventListener("touchstart", (ev) => {
    touches = Array.from(ev.touches);
    hideHint();
    if (touches.length === 2) {
      const [a, b] = touches;
      lastDist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      lastMid = { x: (a.clientX + b.clientX)/2, y: (a.clientY + b.clientY)/2 };
    } else if (touches.length === 1) {
      // Possivel swipe (se nao tem zoom) ou pan (se zoomed)
      swipeStart = { x: touches[0].clientX, y: touches[0].clientY, t: Date.now() };
      lastX = touches[0].clientX; lastY = touches[0].clientY;
      // Double-tap (toggle zoom)
      const now = Date.now();
      if (now - lastTap < 300) {
        if (scale > 1) resetZoom();
        else zoomAt(2.5, touches[0].clientX, touches[0].clientY);
        lastTap = 0;
      } else {
        lastTap = now;
      }
    }
  }, { passive: true });

  stage.addEventListener("touchmove", (ev) => {
    touches = Array.from(ev.touches);
    if (touches.length === 2) {
      ev.preventDefault();
      const [a, b] = touches;
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const mid = { x: (a.clientX + b.clientX)/2, y: (a.clientY + b.clientY)/2 };
      if (lastDist > 0) zoomAt(dist / lastDist, mid.x, mid.y);
      lastDist = dist;
      lastMid = mid;
    } else if (touches.length === 1 && scale > 1) {
      ev.preventDefault();
      tx += touches[0].clientX - lastX;
      ty += touches[0].clientY - lastY;
      lastX = touches[0].clientX; lastY = touches[0].clientY;
      clampPan(); applyTransform();
    }
  }, { passive: false });

  stage.addEventListener("touchend", (ev) => {
    if (ev.touches.length === 0) {
      // Se foi swipe horizontal (sem zoom), navega
      if (scale === 1 && swipeStart) {
        const dx = swipeStart.x - (ev.changedTouches[0]?.clientX || swipeStart.x);
        const dy = Math.abs(swipeStart.y - (ev.changedTouches[0]?.clientY || swipeStart.y));
        if (Math.abs(dx) > 50 && dy < 80) {
          if (dx > 0) { i = (i + 1) % fotos.length; render(); }
          else { i = (i - 1 + fotos.length) % fotos.length; render(); }
        }
      }
      lastDist = 0;
      swipeStart = null;
    }
  });

  document.addEventListener("keydown", onKey);

  render();
  // Esconde a hint apos 3 segundos
  setTimeout(hideHint, 3000);
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

    const motos = await loadMotos({ id });
    const moto = motos.find(m => String(m.id)===id);

    if (!moto) {
      setText("#titulo", "Moto não encontrada");
      setText("#subtitulo", `ID: ${id}`);
      return;
    }

    const status = String(moto.status||"disponivel").toLowerCase();
    const isBloqueada = status==="vendida" || status==="reservada";

    /* Título / subtítulo + Open Graph */
    const ogTitle = `${moto.titulo||moto.id} · Danilo Motos`;
    const ogDesc = [
      moto.preco ? formatBRL(moto.preco) : null,
      moto.ano,
      moto.km ? `${Number(moto.km).toLocaleString("pt-BR")} km` : null,
      moto.cor,
    ].filter(Boolean).join(" · ") || "Veja fotos, ficha técnica e negocie direto no WhatsApp.";
    setOG(ogTitle, ogDesc, moto.capa || "", location.href);
    setText("#titulo", moto.titulo||moto.id);
    setText("#subtitulo", [
      moto.ano,
      moto.km ? `${Number(moto.km).toLocaleString("pt-BR")} km` : "",
      moto.cor,
    ].filter(Boolean).join(" · "));

    // Reaparece o chip de status (estava invisible enquanto carregava)
    const chip = $("#statusChip");
    if (chip) chip.style.visibility = "visible";

    setStatusChip(status);

    /* WhatsApp */
    const msg = moto.whatsapp_texto || `Olá, tenho interesse nessa moto: ${moto.titulo||"moto"}${moto.ano?" ("+moto.ano+")":""}.`;
    const waLink = makeWhatsLink(msg);
    ["#btnWhatsapp","#waContato","#waFloat","#waHeader"].forEach(sel => {
      const a = $(sel);
      if (a) a.href = waLink;
    });

    const capaUrl = moto.capa || IMG_PLACEHOLDER;

    /* ── BLOQUEADA ── */
    if (isBloqueada) {
      const track = $("#galeria");
      if (track) {
        track.innerHTML = `<img src="${capaUrl}" loading="eager" fetchpriority="high" decoding="async" alt="${moto.titulo||moto.id}" onerror="this.onerror=null;this.src='${IMG_PLACEHOLDER}';">`;
        track.style.transform = "translateX(0%)";
      }
      const prev = $("#prevFoto"); const next = $("#nextFoto");
      if(prev) prev.style.display="none";
      if(next) next.style.display="none";
      if($("#fotoDots")) $("#fotoDots").innerHTML="";
      if($("#videoBox")) $("#videoBox").style.display="none";
      if($("#fichaSection")) $("#fichaSection").style.display="none";

      const label = status==="reservada" ? "Reservada" : "Vendida";
      const iconColor = status==="reservada" ? "#ffb300" : "#ff2d2d";
      const iconSvg = status==="reservada"
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="40" height="40" aria-hidden="true">
             <circle cx="12" cy="12" r="10"/>
             <polyline points="12 6 12 12 16 14"/>
           </svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="40" height="40" aria-hidden="true">
             <circle cx="12" cy="12" r="10"/>
             <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
           </svg>`;
      const sub   = status==="reservada"
        ? "Essa moto está reservada. Entre em contato para saber mais ou ver outras opções."
        : "Essa moto já foi vendida. Fale conosco para encontrar uma similar!";

      const bloq = $("#bloqueadaBox");
      if (bloq) {
        bloq.style.display = "";
        bloq.innerHTML = `
          <div class="bloqueadaIcon">${iconSvg}</div>
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
    const precoFichaFmt = formatBRL(moto.preco);
    const rows = [
      precoFichaFmt ? ["Preço",      precoFichaFmt, " preco"] : null,
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
