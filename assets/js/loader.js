import { fetchMotos } from "./data.js?v=20260520a";

const CACHE_KEY = "daniloMotosCache";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos (antes era 5 segundos)
const mem = {};

function readCache(key) {
  try {
    const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts < CACHE_TTL) return data;
  } catch {}
  return null;
}

function writeCache(key, data) {
  const payload = JSON.stringify({ ts: Date.now(), data });
  try { localStorage.setItem(key, payload); } catch {
    try { sessionStorage.setItem(key, payload); } catch {}
  }
}

export async function loadMotos({ status = "disponivel", id = null } = {}) {
  if (id) {
    const memKey = `id_${id}`;
    if (mem[memKey]) return mem[memKey];
    const cacheKey = `${CACHE_KEY}_id_${id}`;
    const cached = readCache(cacheKey);
    if (cached) { mem[memKey] = cached; return cached; }

    const motos = await fetchMotos({ id });
    mem[memKey] = motos;
    writeCache(cacheKey, motos);
    return motos;
  }

  if (mem[status]) return mem[status];

  const cacheKey = `${CACHE_KEY}_${status}`;
  const cached = readCache(cacheKey);
  if (cached) { mem[status] = cached; return cached; }

  const motos = await fetchMotos({ status });
  mem[status] = motos;
  writeCache(cacheKey, motos);
  return motos;
}

export function invalidateCache() {
  ["disponivel", "reservada", "vendida", "all"].forEach((s) => {
    try { localStorage.removeItem(`${CACHE_KEY}_${s}`); } catch {}
    try { sessionStorage.removeItem(`${CACHE_KEY}_${s}`); } catch {}
    delete mem[s];
  });
}
