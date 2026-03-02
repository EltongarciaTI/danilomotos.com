// Busca motos no Supabase (substitui o Apps Script)

export const SUPABASE_URL = "https://zhivqujoneqzviasioug.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoaXZxdWpvbmVxenZpYXNpb3VnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2ODYwNzEsImV4cCI6MjA4NTI2MjA3MX0.ZvbcSoCPA4_cIIQoDBtZQMo7DrLGqqLHHiAQbvnpDL8";

export const STORAGE_PUBLIC_BASE =
  `${SUPABASE_URL}/storage/v1/object/public/motos`;

/**
 * Busca motos do Supabase
 * @param {Object} options
 * @param {string} options.status - "ativo" | "vendida" | "all"
 */
export async function fetchMotos({ status = "disponivel" } = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/motos`);
  url.searchParams.set("select", "*");

  if (status !== "all") {
    url.searchParams.set("status", `eq.${status}`);
  }

  url.searchParams.set("order", "id.desc"); // ordena pelo ID (sempre existe)

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
  return (data || []).map((m) => {
    const v = encodeURIComponent(m.updated_at || "");

    // Paths salvos no banco (novo padrão)
    const capaPath = (m.capa_path && String(m.capa_path).trim()) ? String(m.capa_path).replace(/^\/+/, "") : "";
    const fotosPaths = Array.isArray(m.fotos_paths) ? m.fotos_paths : [];

    // Fallback: padrão antigo (id/capa.jpg e id/1.jpg..4.jpg)
    const legacyCapa = `${m.id}/capa.jpg`;

    const coverRel = capaPath || legacyCapa;
    const coverUrl = `${STORAGE_PUBLIC_BASE}/${coverRel}${v ? `?v=${v}` : ""}`;

    // Monta array de URLs para o detalhe (capa + extras do banco)
    // Se a moto estiver vendida, o site público deve mostrar apenas a capa.
    let fotosUrl = [coverUrl];

    if ((m.status || "").toLowerCase() !== "vendida") {
      if (fotosPaths.length) {
        const extras = fotosPaths
          .filter((p) => typeof p === "string" && p.trim() !== "")
          .map((p) => String(p).replace(/^\/+/, ""))
          .map((p) => `${STORAGE_PUBLIC_BASE}/${p}${v ? `?v=${v}` : ""}`);
        fotosUrl = [coverUrl, ...extras];
      } else {
        // fallback para o padrão antigo (id/1.jpg..4.jpg)
        const legacyExtras = [1,2,3,4].map((i) => `${STORAGE_PUBLIC_BASE}/${m.id}/${i}.jpg${v ? `?v=${v}` : ""}`);
        fotosUrl = [coverUrl, ...legacyExtras];
      }
    }

    return {
      ...m,
      // compat: usado em moto.js (base para montar fotos)
      fotosBase: `${STORAGE_PUBLIC_BASE}/${m.id}/`,
      // compat: usado no catálogo
      capa: coverUrl,
      // novo: usado no detalhe (preferencial)
      fotos: fotosUrl,
    };
  });
}
