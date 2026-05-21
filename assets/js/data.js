// Busca motos no Supabase (substitui o Apps Script)

export const SUPABASE_URL = "https://zhivqujoneqzviasioug.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoaXZxdWpvbmVxenZpYXNpb3VnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2ODYwNzEsImV4cCI6MjA4NTI2MjA3MX0.ZvbcSoCPA4_cIIQoDBtZQMo7DrLGqqLHHiAQbvnpDL8";

export const STORAGE_PUBLIC_BASE =
  `${SUPABASE_URL}/storage/v1/object/public/motos`;

/**
 * Busca motos do Supabase
 * @param {Object} options
 * @param {string} options.status - "ativo" | "vendida" | "all" | "disponivel" | "reservada"
 * @param {string} [options.id] - se passar, faz query individual por ID
 */
export async function fetchMotos({ status = "disponivel", id = null } = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/motos`);
  url.searchParams.set("select", "*");

  if (id) {
    url.searchParams.set("id", `eq.${id}`);
  } else if (status !== "all") {
    if (status === "disponivel") {
      url.searchParams.set("or", "(status.eq.disponivel,status.eq.ativo)");
    } else {
      url.searchParams.set("status", `eq.${status}`);
    }
  }

  url.searchParams.set("order", "id.desc");

  const res = await fetch(url.toString(), {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error("Erro ao carregar motos do Supabase: " + txt);
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
        const legacyExtras = [1,2,3,4].map((i) => `${STORAGE_PUBLIC_BASE}/${m.id}/${i}.jpg`);
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
