// Centraliza o carregamento das motos e faz cache em memória
import { fetchMotos } from "./data.js";

/**
 * Cache simples para evitar múltiplas chamadas à API
 * enquanto o usuário navega pelo site
 */
const cache = {
  ativo: null,
  vendida: null,
  all: null,
};

/**
 * Carrega motos da API
 * @param {Object} options
 * @param {string} options.status - "ativo" | "vendida" | "all"
 */
export async function loadMotos({ status = "ativo" } = {}) {
  if (cache[status]) {
    return cache[status];
  }

  const motos = await fetchMotos({ status });
  cache[status] = motos;

  return motos;
}