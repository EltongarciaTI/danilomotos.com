// Centraliza o carregamento das motos e faz cache em memória
import { fetchMotos } from "./data.js?v=20260301c";

/**
 * Cache simples para evitar múltiplas chamadas à API
 * enquanto o usuário navega pelo site
 */
const cache = {
  disponivel: null,
  reservada: null,
  vendida: null,
  all: null,
};

/**
 * Carrega motos da API
 * @param {Object} options
 * @param {string} options.status - "disponivel" | "reservada" | "vendida" | "all"
 */
export async function loadMotos({ status = "disponivel" } = {}) {
  if (cache[status]) {
    return cache[status];
  }

  const motos = await fetchMotos({ status });
  cache[status] = motos;

  return motos;
}