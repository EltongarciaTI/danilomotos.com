import { fetchMotos } from "./data.js?v=20260301c";

const CACHE_KEY = "daniloMotosCache";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

const mem = {};

export async function loadMotos({ status = "disponivel" } = {}) {
  // 1) cache em memória (mesma aba, mesma página)
  if (mem[status]) return mem[status];

  // 2) sessionStorage (navegar entre páginas sem re-buscar)
  try {
    const raw = sessionStorage.getItem(`${CACHE_KEY}_${status}`);
    if (raw) {
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts < CACHE_TTL) {
        mem[status] = data;
        return data;
      }
    }
  } catch {}

  // 3) busca na API
  const motos = await fetchMotos({ status });
  mem[status] = motos;

  try {
    sessionStorage.setItem(`${CACHE_KEY}_${status}`, JSON.stringify({ ts: Date.now(), data: motos }));
  } catch {}

  return motos;
}
