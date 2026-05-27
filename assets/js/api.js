// assets/js/api.js
// ======================================================
// Cliente da API self-hosted (substitui @supabase/supabase-js)
// Drop-in compatível: createClient(), .auth, .from(), .storage
// Suporta as 10 tabelas do projeto + bucket motos + bucket financeiro
// ======================================================

export const API_BASE = ""; // mesma origem (Caddy serve / e /api/*)
export const STORAGE_MOTOS_BASE = "/storage/motos";
export const STORAGE_FIN_BASE   = "/storage/financeiro";

const COOKIE_HEADERS = { credentials: "include" };

async function request(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && !(opts.body instanceof FormData) && typeof opts.body !== "string") {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${API_BASE}${path}`, { ...COOKIE_HEADERS, ...opts, headers });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error((data && data.error) || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = data;
    return { __err: err };
  }
  return { __data: data };
}

// ============================================================
// AUTH — emula supabase.auth.*
// ============================================================
const authListeners = new Set();

export const auth = {
  async signInWithPassword({ email, password }) {
    const r = await request("/api/auth/login", { method: "POST", body: { email, password } });
    if (r.__err) return { data: null, error: r.__err };
    authListeners.forEach((cb) => cb("SIGNED_IN", { user: { email } }));
    return { data: r.__data, error: null };
  },
  async signOut() {
    const r = await request("/api/auth/logout", { method: "POST" });
    authListeners.forEach((cb) => cb("SIGNED_OUT", null));
    return { error: r.__err || null };
  },
  async getSession() {
    const r = await request("/api/auth/me", { method: "GET" });
    if (r.__err && r.__err.status === 401) return { data: { session: null }, error: null };
    if (r.__err) return { data: null, error: r.__err };
    const u = r.__data.user;
    return { data: { session: u ? { user: u } : null }, error: null };
  },
  onAuthStateChange(cb) {
    authListeners.add(cb);
    return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } };
  },
};

// ============================================================
// DB — supabase.from(table).select/insert/update/delete/upsert
// Suporta chaining: .select().eq().order().limit() etc.
// ============================================================

function queryBuilder(table, op, payload, opts = {}) {
  // Estado interno da query
  const state = {
    table,
    op,             // "select" | "insert" | "update" | "delete" | "upsert"
    cols: "*",
    filters: [],    // [{ col, op, val }]
    orders: [],     // [{ col, asc }]
    limit: null,
    payload,        // pra insert/update/upsert
    onConflict: opts.onConflict || null,
    single: false,
  };

  function buildUrl() {
    const params = new URLSearchParams();
    if (state.op === "select" && state.cols !== "*") params.set("select", state.cols);
    for (const f of state.filters) {
      params.append(f.col, `${f.op}.${f.val}`);
    }
    if (state.orders.length) {
      params.set("order", state.orders.map((o) => `${o.col}.${o.asc ? "asc" : "desc"}`).join(","));
    }
    if (state.limit) params.set("limit", String(state.limit));
    if (state.op === "upsert" && state.onConflict) params.set("on_conflict", state.onConflict);
    const qs = params.toString();
    return `/api/db/${state.table}${qs ? "?" + qs : ""}`;
  }

  async function execute() {
    let res;
    if (state.op === "select") {
      res = await request(buildUrl(), { method: "GET" });
    } else if (state.op === "insert" || state.op === "upsert") {
      res = await request(buildUrl(), { method: "POST", body: state.payload });
    } else if (state.op === "update") {
      res = await request(buildUrl(), { method: "PATCH", body: state.payload });
    } else if (state.op === "delete") {
      res = await request(buildUrl(), { method: "DELETE" });
    }
    if (res.__err) return { data: null, error: res.__err };
    let data = res.__data;
    if (state.single) data = Array.isArray(data) ? data[0] || null : data;
    return { data, error: null };
  }

  // Objeto chainable que também é thenable (pra `await`)
  const builder = {
    select(cols) { state.cols = cols || "*"; return builder; },
    eq(col, val)  { state.filters.push({ col, op: "eq",  val }); return builder; },
    neq(col, val) { state.filters.push({ col, op: "neq", val }); return builder; },
    gt(col, val)  { state.filters.push({ col, op: "gt",  val }); return builder; },
    gte(col, val) { state.filters.push({ col, op: "gte", val }); return builder; },
    lt(col, val)  { state.filters.push({ col, op: "lt",  val }); return builder; },
    lte(col, val) { state.filters.push({ col, op: "lte", val }); return builder; },
    like(col, val)  { state.filters.push({ col, op: "like",  val }); return builder; },
    ilike(col, val) { state.filters.push({ col, op: "ilike", val }); return builder; },
    in(col, arr)  { state.filters.push({ col, op: "in", val: `(${arr.join(",")})` }); return builder; },
    order(col, options = {}) {
      state.orders.push({ col, asc: options.ascending !== false });
      return builder;
    },
    limit(n) { state.limit = n; return builder; },
    single() { state.single = true; return builder; },
    maybeSingle() { state.single = true; return builder; },
    then(onFulfilled, onRejected) {
      return execute().then(onFulfilled, onRejected);
    },
  };

  return builder;
}

function fromBuilder(table) {
  return {
    select(cols = "*") { return queryBuilder(table, "select").select(cols); },
    insert(payload)    { return queryBuilder(table, "insert", payload); },
    update(payload)    { return queryBuilder(table, "update", payload); },
    delete()           { return queryBuilder(table, "delete"); },
    upsert(payload, opts = {}) { return queryBuilder(table, "upsert", payload, opts); },
  };
}

// ============================================================
// STORAGE — supabase.storage.from(bucket).list/upload/remove/getPublicUrl
// Buckets suportados: "motos" e "financeiro"
// ============================================================
function storageBucket(bucket) {
  const isFinanceiro = bucket === "financeiro";
  const publicBase   = isFinanceiro ? STORAGE_FIN_BASE : STORAGE_MOTOS_BASE;
  const uploadBase   = isFinanceiro ? "/api/storage-fin" : "/api/storage";

  return {
    async list(prefix, _opts = {}) {
      if (isFinanceiro) {
        // dashboard nunca lista bucket financeiro; retorna vazio se chamar
        return { data: [], error: null };
      }
      const r = await request(`${uploadBase}/${encodeURIComponent(prefix)}`);
      if (r.__err && r.__err.status === 401) return { data: null, error: r.__err };
      return { data: r.__data || [], error: null };
    },
    async upload(pathStr, file, _opts = {}) {
      if (isFinanceiro) {
        const fd = new FormData();
        fd.append("file", file);
        const r = await request(`${uploadBase}/${pathStr}`, { method: "POST", body: fd });
        return r.__err ? { data: null, error: r.__err } : { data: r.__data, error: null };
      }
      // bucket motos: path = "motoId/filename"
      const [motoId, filename] = String(pathStr).split("/");
      if (!motoId || !filename) return { data: null, error: new Error("path inválido") };
      const fd = new FormData();
      fd.append("file", file);
      const r = await request(
        `${uploadBase}/${encodeURIComponent(motoId)}/${encodeURIComponent(filename)}`,
        { method: "POST", body: fd },
      );
      return r.__err ? { data: null, error: r.__err } : { data: r.__data, error: null };
    },
    async remove(paths) {
      const arr = Array.isArray(paths) ? paths : [paths];
      const errors = [];
      for (const p of arr) {
        if (isFinanceiro) {
          const r = await request(`${uploadBase}/${p}`, { method: "DELETE" });
          if (r.__err) errors.push(r.__err);
        } else {
          const [motoId, filename] = String(p).split("/");
          const r = await request(`${uploadBase}/${encodeURIComponent(motoId)}/${encodeURIComponent(filename)}`, { method: "DELETE" });
          if (r.__err) errors.push(r.__err);
        }
      }
      return errors.length ? { error: errors[0] } : { error: null };
    },
    getPublicUrl(pathStr) {
      return { data: { publicUrl: `${publicBase}/${pathStr}` } };
    },
  };
}

// ============================================================
// Client compatível com createClient() do Supabase
// ============================================================
export function createClient(_url, _key, _opts) {
  return {
    auth,
    from: fromBuilder,
    storage: { from: storageBucket },
  };
}

export default { createClient, auth, STORAGE_MOTOS_BASE, STORAGE_FIN_BASE };
