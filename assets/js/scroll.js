// ============================================================
// SCROLL EFFECTS — minimalista, sutil, performante
// ------------------------------------------------------------
// 1) Parallax SUTIL na imagem hero
// 2) Fade SIMPLES do conteúdo hero ao rolar
// 3) Header com blur quando rola
// 4) Cards reveal com IntersectionObserver
// ============================================================

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!reduceMotion) {
  initHeroScroll();
  initHeaderShadow();
}
initCardReveal();

// ------------------------------------------------------------
// 1+2) HERO PARALLAX + FADE — combinado em 1 rAF, mais leve
// ------------------------------------------------------------
function initHeroScroll() {
  const hero      = document.querySelector(".hero");
  const heroMedia = document.querySelector(".hero__media");
  const heroBrand = document.querySelector(".hero__brand");
  const heroScroll = document.querySelector(".hero__scroll");
  if (!hero || !heroMedia) return;

  let scrolled = 0;
  let ticking = false;
  let heroHeight = hero.offsetHeight;

  // Atualiza altura quando viewport muda
  const ro = new ResizeObserver(() => { heroHeight = hero.offsetHeight; });
  ro.observe(hero);

  function update() {
    // Otimização: para de calcular após sair do hero
    if (scrolled > heroHeight) {
      ticking = false;
      return;
    }

    const progress = Math.min(1, scrolled / heroHeight);

    // Parallax sutil da imagem (0.3x — mais discreto que antes)
    heroMedia.style.transform = `translate3d(0, ${scrolled * 0.3}px, 0)`;

    // Conteúdo: fade suave (sem mover, evita reflow)
    if (heroBrand) {
      heroBrand.style.opacity = String(Math.max(0, 1 - progress * 1.5));
    }
    if (heroScroll) {
      heroScroll.style.opacity = String(Math.max(0, 1 - progress * 2));
    }

    ticking = false;
  }

  function onScroll() {
    scrolled = window.scrollY;
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  update();
}

// ------------------------------------------------------------
// 3) Header: adiciona sombra/intensifica blur ao rolar
// ------------------------------------------------------------
function initHeaderShadow() {
  const header = document.querySelector("header");
  if (!header) return;

  let scrolled = false;
  function onScroll() {
    const should = window.scrollY > 20;
    if (should !== scrolled) {
      scrolled = should;
      header.classList.toggle("is-scrolled", scrolled);
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

// ------------------------------------------------------------
// 4) CARD REVEAL — IntersectionObserver
// ------------------------------------------------------------
function initCardReveal() {
  if (!("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );

  const grid = document.getElementById("motosGrid");
  if (!grid) return;

  const mutObserver = new MutationObserver(() => {
    grid.querySelectorAll(".card-moto:not(.is-observed)").forEach((card) => {
      card.classList.add("is-observed");
      observer.observe(card);
    });
  });
  mutObserver.observe(grid, { childList: true });

  grid.querySelectorAll(".card-moto").forEach((card) => {
    card.classList.add("is-observed");
    observer.observe(card);
  });
}
