import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./data.js";
import { loadMotos } from "./loader.js";

const WHATSAPP_NUMBER = "557599834731"; // 55 + DDD + número
const MAX_FOTOS = 4;

function $(sel) {
  return document.querySelector(sel);
}

function setText(sel, txt) {
  const el = $(sel);
  if (el) el.textContent = txt ?? "";
}

function setHtml(sel, html) {
  const el = $(sel);
  if (el) el.innerHTML = html ?? "";
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

function makeWhatsLink(texto) {
  const msg = encodeURIComponent(texto || "Olá! Quero negociar uma moto do catálogo.");
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
}

/* Converte link do YouTube para embed */
function youtubeToEmbed(url) {
  try {
    const u = new URL(url);
    let id = "";

    if (u.hostname.includes("youtu.be")) {
      id = u.pathname.replace("/", "");
    } else if (u.pathname.includes("/shorts/")) {
      id = u.pathname.split("/shorts/")[1]?.split("/")[0] || "";
    } else {
      id = u.searchParams.get("v") || "";
    }

    if (!id) return "";
    return `https://www.youtube.com/embed/${id}`;
  } catch {
    return "";
  }
}

/* Monta fotos: 1.jpg .. MAX_FOTOS.jpg */
function buildFotos(moto) {
  const base = moto.fotosBase || `assets2/motos/${moto.id}/`;
  const fotos = [];

  // usa a capa já montada com cache-bust (moto.capa), se existir
  fotos.push((moto.capa && String(moto.capa).trim()) ? moto.capa : `${base}capa.jpg`);

  // tenta 1..4
  for (let i = 1; i <= MAX_FOTOS; i++) {
    fotos.push(`${base}${i}.jpg`);
  }

  // remove possíveis valores vazios
  return fotos.filter(f => typeof f === "string" && f.trim() !== "");
}


/* ===== CAROUSEL ===== */
function renderCarousel(fotos) {
  const track = $("#galeria");
  const info = $("#fotoInfo");
  if (!track) return;

  let indexFoto = 0;

  track.innerHTML = fotos
    .map((src) => `<img src="${src}" loading="lazy" alt="Foto da moto">`)
    .join("");

  const prevBtn = $("#prevFoto");
  const nextBtn = $("#nextFoto");

  function totalSlides() {
    return track.querySelectorAll("img").length;
  }

  function clampIndex() {
    const total = totalSlides();
    if (total <= 0) {
      indexFoto = 0;
      return;
    }
    if (indexFoto < 0) indexFoto = 0;
    if (indexFoto > total - 1) indexFoto = total - 1;
  }

  function update() {
    clampIndex();
    const total = totalSlides();

    if (total <= 0) {
      track.innerHTML = `<p class="muted">Sem fotos cadastradas.</p>`;
      if (info) info.textContent = "";
      if (prevBtn) prevBtn.style.display = "none";
      if (nextBtn) nextBtn.style.display = "none";
      return;
    }

    if (prevBtn) prevBtn.style.display = total > 1 ? "" : "none";
    if (nextBtn) nextBtn.style.display = total > 1 ? "" : "none";

    track.style.transform = `translateX(-${indexFoto * 100}%)`;
    if (info) info.textContent = `Foto ${indexFoto + 1} de ${total}`;
  }

  // remove imagens quebradas automaticamente
  track.querySelectorAll("img").forEach((img) => {
    img.addEventListener("error", () => {
      img.remove();
      update();
    });
  });

  if (prevBtn) {
    prevBtn.onclick = () => {
      const total = totalSlides();
      if (total <= 1) return;
      indexFoto = (indexFoto - 1 + total) % total;
      update();
    };
  }

  if (nextBtn) {
    nextBtn.onclick = () => {
      const total = totalSlides();
      if (total <= 1) return;
      indexFoto = (indexFoto + 1) % total;
      update();
    };
  }

  let startX = 0;
  let endX = 0;
  track.addEventListener("touchstart", (e) => (startX = e.touches[0].clientX));
  track.addEventListener("touchend", (e) => {
    endX = e.changedTouches[0].clientX;
    if (startX - endX > 50) nextBtn?.click();
    else if (endX - startX > 50) prevBtn?.click();
  });

  requestAnimationFrame(update);
}


    

async function main() {
  try {
    // ano no footer
    const yearEl = $("#year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    const params = new URLSearchParams(location.search);
    const id = decodeURIComponent(params.get("id") || "").trim();

    if (!id) {
      setText("#titulo", "Moto não encontrada");
      setText("#subtitulo", "Faltou o parâmetro ?id=");
      return;
    }

    // 🔥 pega TODAS (ativo + reservada + vendida)
    const motos = await loadMotos({ status: "all" });
    const moto = motos.find((m) => String(m.id) === id);

    if (!moto) {
      setText("#titulo", "Moto não encontrada");
      setText("#subtitulo", `ID não localizado: ${id}`);
      console.error("Moto não encontrada:", { id, motos });
      return;
    }

    const status = String(moto.status || "ativo").toLowerCase();
    const isVendida = status === "vendida";



    // título/subtítulo normal
    setText("#titulo", moto.titulo || moto.id);
    const subtitulo = [
      moto.ano ? moto.ano : "",
      moto.km ? `${Number(moto.km).toLocaleString("pt-BR")} km` : "",
      moto.cor ? moto.cor : "",
    ]
      .filter(Boolean)
      .join(" • ");
    setText("#subtitulo", subtitulo);

    // WhatsApp
    const msg =
      moto.whatsapp_texto ||
      `Olá! Tenho interesse na ${moto.titulo || "moto"}${moto.ano ? " " + moto.ano : ""}.`;

    const waLink = makeWhatsLink(msg);
    ["#btnWhatsapp", "#waContato", "#waFloat"].forEach((sel) => {
      const a = $(sel);
      if (a) a.href = waLink;
    });



    // base/capa garantidas
    const base = moto.fotosBase || `assets2/motos/${moto.id}/`;
    const capaUrl = moto.capa || `${base}capa.jpg`;

    // ✅ VENDIDA: só capa + mensagem + botão (e para)
    if (isVendida) {
      // carrossel: só capa
      const track = $("#galeria");
      const info = $("#fotoInfo");
      if (track) {
        track.innerHTML = `
          <img src="${capaUrl}" loading="lazy"
               alt="${moto.titulo || moto.id}"
               onerror="this.onerror=null; this.src='${base}capa.jpg';">
        `;
        track.style.transform = "translateX(0%)";
      }
      if (info) info.textContent = "Vendida";

      // esconder botões do carrossel
      const prev = $("#prevFoto");
      const next = $("#nextFoto");
      if (prev) prev.style.display = "none";
      if (next) next.style.display = "none";

      // esconder vídeo
      const videoBox = $("#videoBox");
      if (videoBox) videoBox.style.display = "none";

      // ficha vira mensagem + botão
      setHtml(
        "#ficha",
        `
          <div class="linha">
            <span>Status</span>
            <strong>VENDIDA</strong>
          </div>

          <div class="muted" style="margin-top:12px">
            Consulte o nosso WhatsApp pra que possamos conseguir uma pra você.
          </div>

          <div style="margin-top:14px">
            <a class="btn primary" target="_blank" rel="noopener" href="${waLink}">
              Consultar no WhatsApp
            </a>
          </div>
        `
      );

      return;
    }

    // ✅ NÃO VENDIDA: fotos normais
    const fotos = buildFotos(moto);
    renderCarousel(fotos);

    // vídeo
    const videoBox = $("#videoBox");
    if (moto.youtube) {
      const embed = youtubeToEmbed(moto.youtube);
      if (embed) {
        setHtml(
          "#video",
          `
            <div class="videoWrap">
              <iframe
                src="${embed}"
                title="Vídeo da moto"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
              ></iframe>
            </div>
            <div style="margin-top:10px">
              <a class="btn" href="${moto.youtube}" target="_blank" rel="noopener">
                Abrir no YouTube
              </a>
            </div>
          `
        );
        if (videoBox) videoBox.style.display = "";
      } else {
        if (videoBox) videoBox.style.display = "none";
      }
    } else {
      if (videoBox) videoBox.style.display = "none";
    }

    // ficha técnica
   let precoParaFicha = moto.preco ? formatBRL(moto.preco) : null;
if (status === "reservada") precoParaFicha = "Reservado";

    const ficha = [
      ["Preço", precoParaFicha],
      ["Ano", moto.ano],
      ["KM", moto.km ? Number(moto.km).toLocaleString("pt-BR") : null],
      ["Cor", moto.cor],
      ["Emplacada", moto.emplacada ? "Sim" : "Não"],
      ["Cilindrada", moto.cilindrada],
      ["Combustível", moto.combustivel],
      ["Partida", moto.partida],
      ["Observações", moto.observacoes],
    ].filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "");

    if (!ficha.length) {
      setHtml("#ficha", `<p class="muted">Sem informações cadastradas.</p>`);
    } else {
      setHtml(
        "#ficha",
        ficha
          .map(
            ([k, v]) => `
              <div class="linha">
                <span>${k}</span>
                <strong>${String(v)}</strong>
              </div>
            `
          )
          .join("")
      );
    }
  } catch (err) {
    console.error("Erro no moto.js:", err);
    setText("#titulo", "Erro ao carregar");
    setText("#subtitulo", "Abra o console (F12) pra ver o motivo.");
  }
}

main();