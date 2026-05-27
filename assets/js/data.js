// assets/js/data.js
// ======================================================
// Busca motos na API self-hosted (substituiu Supabase REST)
// ======================================================

import { API_BASE, STORAGE_PUBLIC_BASE } from "./config.js?v=20260526";

// Re-export pra manter compat com módulos que importam daqui
export { API_BASE, STORAGE_PUBLIC_BASE };
// Aliases de compat (código legacy que importava daqui)
export const SUPABASE_URL = API_BASE;
export const SUPABASE_ANON_KEY = "";

/**
 * Conta motos sem baixar conteúdo (rota /api/motos/count).
 * @param {Object} options
 * @param {string} options.status
 */
export async function fetchMotosCount({ status = "disponivel" } = {}) {
  const url = new URL(`${API_BASE}/api/motos/count`, window.location.origin);
  url.searchParams.set("status", status);
  const res = await fetch(url.toString(), { credentials: "same-origin" });
  if (!res.ok) return 0;
  const body = await res.json().catch(() => null);
  return Number(body?.count) || 0;
}

/**
 * Busca motos da API.
 * @param {Object} options
 * @param {string} options.status - "ativo" | "vendida" | "all" | "disponivel" | "reservada"
 * @param {string} [options.id] - se passar, faz query individual por ID
 */
export async function fetchMotos({ status = "disponivel", id = null } = {}) {
  const url = new URL(`${API_BASE}/api/motos`, window.location.origin);
  if (id) {
    url.searchParams.set("id", id);
  } else {
    url.searchParams.set("status", status);
  }

  const res = await fetch(url.toString(), { credentials: "same-origin" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error("Erro ao carregar motos: " + txt);
  }

  const data = await res.json();

  return (data || []).map((m) => {
    const capaPath = (m.capa_path && String(m.capa_path).trim()) ? String(m.capa_path).replace(/^\/+/, "") : "";
    const fotosPaths = Array.isArray(m.fotos_paths) ? m.fotos_paths : [];

    const legacyCapa = `${m.id}/capa.jpg`;

    const coverRel = capaPath || legacyCapa;
    const coverUrl = `${STORAGE_PUBLIC_BASE}/${coverRel}`;

    let fotosUrl = [coverUrl];

    if ((m.status || "").toLowerCase() !== "vendida") {
      if (fotosPaths.length) {
        const extras = fotosPaths
          .filter((p) => typeof p === "string" && p.trim() !== "")
          .map((p) => String(p).replace(/^\/+/, ""))
          .map((p) => `${STORAGE_PUBLIC_BASE}/${p}`);
        fotosUrl = [coverUrl, ...extras];
      } else {
        const legacyExtras = [1, 2, 3, 4].map((i) => `${STORAGE_PUBLIC_BASE}/${m.id}/${i}.jpg`);
        fotosUrl = [coverUrl, ...legacyExtras];
      }
    }

    return {
      ...m,
      fotosBase: `${STORAGE_PUBLIC_BASE}/${m.id}/`,
      capa: coverUrl,
      fotos: fotosUrl,
    };
  });
}
