// Busca motos no Supabase (substitui o Apps Script)

export const SUPABASE_URL = "https://zhivqujoneqzviasioug.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoaXZxdWpvbmVxenZpYXNpb3VnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2ODYwNzEsImV4cCI6MjA4NTI2MjA3MX0.ZvbcSoCPA4_cIIQoDBtZQMo7DrLGqqLHHiAQbvnpDL8";

export const STORAGE_PUBLIC_BASE = "https://danilomotos.com/assets/img/motos";

/**
 * Busca motos do Supabase
 * @param {Object} options
 * @param {string} options.status - "ativo" | "vendida" | "all"
 */
export async function fetchMotos({ status = "ativo" } = {}) {
  const base = `${SUPABASE_URL}/rest/v1/motos`;

  function buildUrl(withOrder = true) {
    const url = new URL(base);
    url.searchParams.set("select", "*");
    if (status !== "all") url.searchParams.set("status", `eq.${status}`);
    if (withOrder) url.searchParams.set("order", "created_at.desc");
    return url;
  }

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };

  // 1) tenta com order=created_at.desc
  let res = await fetch(buildUrl(true).toString(), { headers, cache: "no-store" });

  // 2) se falhar por coluna inexistente, tenta sem ordenação (evita travar o site)
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const low = txt.toLowerCase();
    const createdAtMissing = low.includes("created_at") && (low.includes("column") || low.includes("42703"));
    if (createdAtMissing) {
      res = await fetch(buildUrl(false).toString(), { headers, cache: "no-store" });
    } else {
      throw new Error("Erro ao carregar motos do Supabase: " + txt);
    }
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error("Erro ao carregar motos do Supabase: " + txt);
  }

  const data = await res.json();

  // Mantém compatibilidade com o front atual:
  // - capa e fotosBase sempre apontam para GitHub Pages
  return (data || []).map((m) => {
    const v = encodeURIComponent(m.updated_at || "");
    return {
      ...m,
      fotosBase: `${STORAGE_PUBLIC_BASE}/${m.id}/`,
      capa: `${STORAGE_PUBLIC_BASE}/${m.id}/capa.jpg${v ? `?v=${v}` : ""}`,
    };
  });
}
