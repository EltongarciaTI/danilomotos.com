// ============================================================
// SCROLL EFFECTS — estilo Apple/Tesla
// ------------------------------------------------------------
// 1) Parallax na imagem hero (mais lenta que o scroll)
// 2) Fade-out + slide-up do texto hero conforme rola
// 3) Brand mark gigante com translate horizontal (parallax)
// 4) Cards reveal com IntersectionObserver
// ------------------------------------------------------------
// Performance: usa requestAnimationFrame + passive listeners.
// Acessibilidade: respeita prefers-reduced-motion.
// ============================================================

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!reduceMotion) {
  initHeroParallax();
  initBrandMarquee();
}
initCardReveal();

// ============================================================
// 1) HERO PARALLAX + FADE
// ============================================================
function initHeroParallax() {
  const hero      = document.querySelector(".hero");
  const heroMedia = document.querySelector(".hero__media");
  const heroInner = document.querySelector(".hero__inner");
  if (!hero || !heroMedia || !heroInner) return;

  let scrolled = 0;
  let ticking = false;

  // Pega altura do hero uma vez (e refresca em resize)
  let heroHeight = hero.offsetHeight;
  window.addEventListener("resize", () => {
    heroHeight = hero.offsetHeight;
  }, { passive: true });

  function update() {
    // Só anima enquanto o hero está visível (otimização)
    if (scrolled > heroHeight + 100) {
      ticking = false;
      return;
    }

    // Progresso de 0 (topo) a 1 (final do hero)
    const progress = Math.min(1, scrolled / heroHeight);

    // Parallax da imagem: move pra baixo mais devagar (efeito "ela fica")
    const mediaY = scrolled * 0.42;
    heroMedia.style.transform = `translate3d(0, ${mediaY}px, 0) scale(${1 + progress * 0.06})`;

    // Conteúdo: sobe levemente + fadeout
    const contentY = scrolled * -0.18;
    const contentOpacity = Math.max(0, 1 - progress * 1.4);
    heroInner.style.transform = `translate3d(0, ${contentY}px, 0)`;
    heroInner.style.opacity = String(contentOpacity);

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

// ============================================================
// 2) BRAND MARQUEE — "DANILO MOTOS" gigante com parallax horizontal
// ============================================================
function initBrandMarquee() {
  const marquee = document.querySelector(".brand-marquee");
  const inner   = document.querySelector(".brand-marquee__text");
  if (!marquee || !inner) return;

  let ticking = false;

  function update() {
    const rect = marquee.getBoundingClientRect();
    const vh = window.innerHeight;

    // Progresso de -1 (marquee abaixo da viewport) a +1 (acima)
    const progress = (vh - rect.top) / (vh + rect.height);
    const clamped = Math.max(-0.2, Math.min(1.2, progress));

    // Move horizontalmente — da direita pra esquerda
    // -50% quando progress = 0 (entrando), +5% quando progress = 1 (saindo)
    const x = -50 + clamped * 55;
    inner.style.transform = `translate3d(${x}%, 0, 0)`;

    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  update();
}

// ============================================================
// 3) CARD REVEAL com IntersectionObserver
// ============================================================
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
    {
      threshold: 0.1,
      rootMargin: "0px 0px -60px 0px",
    }
  );

  // Observa cards quando forem adicionados ao DOM (motos.js renderiza async)
  const grid = document.getElementById("motosGrid");
  if (!grid) return;

  // MutationObserver pra pegar cards adicionados depois
  const mutObserver = new MutationObserver(() => {
    grid.querySelectorAll(".card-moto:not(.is-observed)").forEach((card) => {
      card.classList.add("is-observed");
      observer.observe(card);
    });
  });

  mutObserver.observe(grid, { childList: true });

  // Observa o que já existe (caso JS chegue depois do render)
  grid.querySelectorAll(".card-moto").forEach((card) => {
    card.classList.add("is-observed");
    observer.observe(card);
  });
}
