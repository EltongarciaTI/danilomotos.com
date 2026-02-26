// Busca motos no Supabase (substitui o Apps Script)

import { SUPABASE_URL, SUPABASE_ANON_KEY, SITE_IMG_BASE } from "./config.js";

// Mantém nomes antigos para compatibilidade
export { SUPABASE_URL, SUPABASE_ANON_KEY };
export const STORAGE_PUBLIC_BASE = SITE_IMG_BASE;

/**
 * Busca motos do Supabase
 * @param {Object} options
 * @param {string} options.status - "ativo" | "vendida" | "all"
 */
export async function fetchMotos({ status = "ativo" } = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/motos`);
  url.searchParams.set("select", "*");

  if (status !== "all") {
    url.searchParams.set("status", `eq.${status}`);
  }

  url.searchParams.set("order", "created_at.desc");  // ou o nome correto da coluna

  const res = await fetch(url.toString(), {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error("Erro ao carregar motos do Supabase: " + txt);
  }

  const data = await res.json();

  // Mantém compatibilidade com o seu front atual
return data.map((m) => {
  const v = encodeURIComponent(m.updated_at || "");
  return {
    ...m,
    fotosBase: `${STORAGE_PUBLIC_BASE}/${m.id}/`,
    capa: `${STORAGE_PUBLIC_BASE}/${m.id}/capa.jpg${v ? `?v=${v}` : ""}`,
  };
});
}