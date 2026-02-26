// assets/js/config.js
// ======================================================
// DANILO MOTOS — CONFIG CENTRAL
// ------------------------------------------------------
// Mantenha aqui as constantes compartilhadas do site.
// ======================================================

export const SUPABASE_URL = "https://zhivqujoneqzviasioug.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoaXZxdWpvbmVxenZpYXNpb3VnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2ODYwNzEsImV4cCI6MjA4NTI2MjA3MX0.ZvbcSoCPA4_cIIQoDBtZQMo7DrLGqqLHHiAQbvnpDL8";

// Base pública (GitHub Pages)


// Cloudflare Worker (API de upload/list/delete no GitHub)

export const WHATSAPP_NUMBER = "557599834731";
export const MAX_FOTOS = 4;
export const WORKER_BASE = "https://blue-salad-b6ae.eltonng645.workers.dev".replace(/\/+$/, "");
export const IMG_UPLOAD_ENDPOINT = `${WORKER_BASE}/upload`;
export const IMG_LIST_ENDPOINT   = `${WORKER_BASE}/list`;
export const IMG_DELETE_ENDPOINT = `${WORKER_BASE}/delete`;
export const IMG_UPLOAD_MULTI_ENDPOINT = `${WORKER_BASE}/upload-multi`;
export const SITE_IMG_BASE = "https://raw.githubusercontent.com/EltongarciaTI/danilomotos.com/main/assets/img/motos";