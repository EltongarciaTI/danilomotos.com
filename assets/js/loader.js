import { fetchMotos } from "./data.js?v=20260406e";

const CACHE_KEY = "daniloMotosCache";
const CACHE_TTL = 65 * 1000; // 65 segundos
const mem = {};

export async function loadMotos({ status = "disponivel" } = {}) {
  if (mem[status]) return mem[status];

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

  const motos = await fetchMotos({ status });
  mem[status] = motos;

  try {
    sessionStorage.setItem(
      `${CACHE_KEY}_${status}`,
      JSON.stringify({ ts: Date.now(), data: motos })
    );
  } catch {}

  return motos;
}