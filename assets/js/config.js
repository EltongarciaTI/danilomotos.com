// assets/js/config.js
// ======================================================
// DANILO MOTOS — CONFIG CENTRAL
// ------------------------------------------------------
// Constantes compartilhadas do site.
// Pós-migração: 100% usa nossa API self-hosted (catálogo + admin + dashboard).
// Supabase foi removido.
// ======================================================

// API e Storage rodam na mesma origem (Caddy serve / e /api/*)
// Em dev local sem backend, fallback aponta pra produção (definir window.DM_API_BASE no console pra override).
export const API_BASE = (typeof window !== "undefined" && window.DM_API_BASE) || "";
export const STORAGE_PUBLIC_BASE = `${API_BASE}/storage/motos`;

export const WHATSAPP_NUMBER = "5575999185684";
export const MAX_FOTOS = 4;
