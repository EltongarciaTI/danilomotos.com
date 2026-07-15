// assets/js/dashboard.js — Danilo Motos Dashboard v2
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./assets/js/config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BUCKET_FIN = "financeiro";
const STORAGE_MOTOS_BASE = `${SUPABASE_URL}/storage/v1/object/public/motos`;
const MOTO_IMG_PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect width="100" height="100" fill="#1a1c20"/>
      <g fill="none" stroke="#3a3d44" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M28 62l12-13 11 9 11-15 11 9"/>
        <circle cx="32" cy="66" r="5"/>
        <circle cx="68" cy="66" r="5"/>
      </g>
    </svg>`.replace(/\s+/g, " ")
  );
function motoCoverUrl(m) {
  const capaPath = (m.capa_path && String(m.capa_path).trim()) ? String(m.capa_path).replace(/^\/+/, "") : "";
  const coverRel = capaPath || `${m.id}/capa.jpg`;
  return `${STORAGE_MOTOS_BASE}/${coverRel}`;
}
let currentRole = "admin";

// ── DOM ──────────────────────────────────────────────
function $(id) { return document.getElementById(id); }
function escHTML(s) {
  return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function hint(el, text, type = "") {
  if (!el) return;
  el.className = "hint" + (type ? " " + type : "");
  el.textContent = text || "";
}

// ── TOAST ────────────────────────────────────────────
function toast(msg, type = "ok", duration = 3200) {
  const container = $("toastContainer");
  if (!container) return;
  const icons = { ok: "✅", err: "❌", info: "ℹ️", warn: "⚠️" };
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || "•"}</span><span style="flex:1">${msg}</span>`;
  el.onclick = () => remove();
  container.appendChild(el);
  const remove = () => {
    el.style.animation = "toastOut .25s ease forwards";
    setTimeout(() => el.remove(), 250);
  };
  setTimeout(remove, duration);
}

// ── TOP LOAD BAR ─────────────────────────────────────
function showLoadBar() {
  const bar = document.getElementById("topLoadBar");
  if (bar) bar.classList.add("active");
}
function hideLoadBar() {
  const bar = document.getElementById("topLoadBar");
  if (bar) { bar.classList.remove("active"); }
}

// ── SKELETON ─────────────────────────────────────────
// Mostra overlay de loading sem destruir os elementos com IDs
function showSkeleton() {
  const area = $("screenOverview");
  if (!area) return;
  let ov = $("skeletonOverlay");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "skeletonOverlay";
    ov.style.cssText = "position:absolute;inset:0;z-index:10;background:var(--bg);padding:24px;display:grid;gap:14px;";
    ov.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">
        ${Array(3).fill(`<div class="skelCard"><div class="skeleton skelLine" style="width:40%"></div><div class="skeleton skelBig"></div><div class="skeleton skelSm"></div></div>`).join("")}
      </div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px">
        ${Array(5).fill(`<div class="skelCard" style="padding:14px;text-align:center"><div class="skeleton" style="height:22px;width:60%;margin:0 auto 8px"></div><div class="skeleton" style="height:10px;width:70%;margin:0 auto"></div></div>`).join("")}
      </div>
      <div style="display:grid;grid-template-columns:3fr 2fr;gap:14px">
        <div class="skelCard" style="height:280px"><div class="skeleton" style="height:100%;border-radius:10px"></div></div>
        <div class="skelCard" style="height:280px"><div class="skeleton" style="height:100%;border-radius:10px"></div></div>
      </div>`;
    area.style.position = "relative";
    area.appendChild(ov);
  }
  ov.style.display = "grid";
}

function hideSkeleton() {
  const ov = $("skeletonOverlay");
  if (ov) ov.style.display = "none";
}

// ── COUNTER ANIMATION ────────────────────────────────
function animateCount(el, target, isCurrency = true, duration = 900) {
  if (!el) return;
  const start = 0;
  const startTime = performance.now();
  const step = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (target - start) * ease);
    el.textContent = isCurrency
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(current)
      : current.toString();
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ── SPARKLINES ───────────────────────────────────────
function drawSparkline(id, data, color) {
  const el = document.getElementById(id);
  if (!el || data.length < 2) return;
  const w = 200, h = 28;
  const min = Math.min(0, ...data);
  const max = Math.max(1, ...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - 2 - ((v - min) / range) * (h - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const ptsStr = pts.join(" ");
  const [fx, fy] = pts[0].split(",");
  const lx = pts[pts.length - 1].split(",")[0];
  const areaPath = `M${fx},${h} ${pts.map(p=>`L${p}`).join(" ")} L${lx},${h} Z`;
  const gid = `spk_${id}`;
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:28px">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${areaPath}" fill="url(#${gid})"/>
    <polyline points="${ptsStr}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function injectSparklines() {
  const now = new Date();
  const r6 = [], e6 = [], l6 = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mm = d.getMonth() + 1, yy = d.getFullYear();
    const ms = salesCache.filter(s => { const sd = new Date(s.sale_date+"T00:00:00"); return sd.getMonth()+1===mm&&sd.getFullYear()===yy; });
    const me = expensesCache.filter(e => { const ed = new Date(e.expense_date+"T00:00:00"); return ed.getMonth()+1===mm&&ed.getFullYear()===yy; });
    const rv = ms.reduce((s,v)=>s+Number(v.sale_price),0);
    const ev = me.reduce((s,e)=>s+Number(e.amount),0);
    r6.push(rv); e6.push(ev); l6.push(rv - ev);
  }
  const lucroPos = l6[l6.length - 1] >= 0;
  drawSparkline("kpiSparkReceita", r6, "#22c55e");
  drawSparkline("kpiSparkGastos",  e6, "#e8192c");
  drawSparkline("kpiSparkLucro",   l6, lucroPos ? "#22c55e" : "#e8192c");
}

// ── PULL TO REFRESH (mobile) ──────────────────────────
let pullStartY = 0, pulling = false;
let pullIndicator = null;

function initPullToRefresh() {
  const content = $("contentArea");
  if (!content) return;

  pullIndicator = document.createElement("div");
  pullIndicator.id = "pullIndicator";
  pullIndicator.style.cssText = "position:fixed;top:58px;left:50%;transform:translateX(-50%) translateY(-60px);z-index:300;background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:8px 16px;font-size:13px;font-weight:800;color:var(--muted);transition:transform .2s;pointer-events:none;display:none";
  pullIndicator.textContent = "⬇️ Puxe para atualizar";
  document.body.appendChild(pullIndicator);

  content.addEventListener("touchstart", e => {
    if (content.scrollTop === 0) { pullStartY = e.touches[0].clientY; pulling = true; }
  }, { passive: true });

  content.addEventListener("touchmove", e => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - pullStartY;
    if (dy > 10) {
      pullIndicator.style.display = "block";
      const offset = Math.min(dy - 10, 60);
      pullIndicator.style.transform = `translateX(-50%) translateY(${offset - 60}px)`;
      if (offset >= 55) pullIndicator.textContent = "🔄 Solte para atualizar";
      else pullIndicator.textContent = "⬇️ Puxe para atualizar";
    }
  }, { passive: true });

  content.addEventListener("touchend", async e => {
    if (!pulling) return;
    pulling = false;
    const dy = e.changedTouches[0].clientY - pullStartY;
    pullIndicator.style.display = "none";
    pullIndicator.style.transform = "translateX(-50%) translateY(-60px)";
    if (dy > 65) {
      toast("Atualizando dados…", "info", 1500);
      await Promise.all([loadMotos(), loadExpenses(), loadSales(), loadMotoFin(), loadMotoCosts(), loadMotoInfo(), loadMotoDocs(), loadMotoBuyer()]);
      fillMotoSelects();
      await renderOverview();
      renderExpenseList();
      renderSalesList();
      renderMotoFinList();
      renderEstoque();
      toast("Dados atualizados!", "ok");
    }
  }, { passive: true });
}

// ── FORMATAÇÃO ───────────────────────────────────────
const BRL = v => {
  const n = Number(String(v ?? "").replace(/[^\d,.-]/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return "R$ 0";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
};

const parseBRL = v => {
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function maskMoney(inp) {
  inp.addEventListener("input", () => {
    let raw = inp.value.replace(/\D/g, "");
    if (!raw) { inp.value = ""; return; }
    const n = Number(raw) / 100;
    inp.value = n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });
}

function fmtDate(d) {
  if (!d) return "—";
  const [y, m, day] = String(d).split("-");
  return `${day}/${m}/${y}`;
}
function todayISO() { return new Date().toISOString().split("T")[0]; }

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function fillMonthSel(sel, selectedMonth) {
  sel.innerHTML = MONTHS.map((m, i) =>
    `<option value="${i+1}" ${(i+1) === selectedMonth ? "selected" : ""}>${m}</option>`
  ).join("");
}
function fillYearSel(sel, selectedYear) {
  const cur = new Date().getFullYear();
  let opts = "";
  for (let y = cur; y >= cur - 4; y--) opts += `<option value="${y}" ${y === selectedYear ? "selected" : ""}>${y}</option>`;
  sel.innerHTML = opts;
}

function calcTrend(current, previous) {
  if (!previous) return { pct: null, dir: "flat" };
  const pct = Math.round((current - previous) / previous * 100);
  return { pct, dir: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
}

function trendHtml(trend, invertColor = false) {
  if (trend.pct === null) return `<span class="kpiTrend flat">— vs mês anterior</span>`;
  const arrow = trend.dir === "up" ? "↑" : trend.dir === "down" ? "↓" : "→";
  const cls = invertColor
    ? (trend.dir === "up" ? "down" : trend.dir === "down" ? "up" : "flat")
    : trend.dir;
  return `<span class="kpiTrend ${cls}">${arrow} ${Math.abs(trend.pct)}% vs mês anterior</span>`;
}

// ── STATE ─────────────────────────────────────────────
let motosCache = [];
let expensesCache = [];
let salesCache = [];
let motoFinCache = [];
let motoCostsCache = [];
let motoInfoCache = [];
let motoDocsCache = [];
let motoBuyerCache = [];
let fixedExpensesCache = [];

let expFilter = { type: "business", month: new Date().getMonth() + 1, year: new Date().getFullYear(), search: "" };
let saleFilter = { month: new Date().getMonth() + 1, year: new Date().getFullYear() };
let overviewFilter = { month: new Date().getMonth() + 1, year: new Date().getFullYear() };
let estFilter = { status: "all", search: "" };
let expPage = 1;
const EXP_PAGE_SIZE = 20;

// ── CHART.JS ──────────────────────────────────────────
let chartInstances = {};

async function loadChartJS() {
  if (window.Chart) return;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}

function gradientFill(ctx, colorTop, colorBot) {
  const g = ctx.createLinearGradient(0, 0, 0, 420);
  g.addColorStop(0, colorTop);
  g.addColorStop(1, colorBot);
  return g;
}

function isLight() {
  return document.documentElement.classList.contains("light");
}

function chartTextColor() { return isLight() ? "#374151" : "#8a96a6"; }
function chartGridColor() { return isLight() ? "rgba(0,0,0,.07)" : "rgba(255,255,255,.04)"; }
function chartPanelBg()   { return isLight() ? "#ffffff" : "#0d0f13"; }

// ── SUPABASE DATA ────────────────────────────────────
async function loadMotos() {
  try {
    const { data } = await supabase.from("motos").select("id,titulo,status,preco,created_at,capa_path").order("created_at", { ascending: false });
    motosCache = data || [];
  } catch { motosCache = []; }
}
async function loadExpenses() {
  try {
    const { data } = await supabase.from("financial_expenses").select("*").order("expense_date", { ascending: false });
    expensesCache = data || [];
  } catch { expensesCache = []; }
}
async function loadSales() {
  try {
    const { data } = await supabase.from("financial_sales").select("*").order("sale_date", { ascending: false });
    salesCache = data || [];
  } catch { salesCache = []; }
}
async function loadMotoFin() {
  try {
    const { data } = await supabase.from("motorcycle_financials").select("*");
    motoFinCache = data || [];
  } catch { motoFinCache = []; }
}
async function loadMotoCosts() {
  try {
    const { data } = await supabase.from("motorcycle_costs").select("*").order("cost_date", { ascending: false });
    motoCostsCache = data || [];
  } catch { motoCostsCache = []; }
}
async function loadMotoInfo() {
  try {
    const { data } = await supabase.from("motorcycle_info").select("*");
    motoInfoCache = data || [];
  } catch { motoInfoCache = []; }
}
async function loadMotoDocs() {
  try {
    const { data } = await supabase.from("motorcycle_documents").select("*").order("created_at", { ascending: false });
    motoDocsCache = data || [];
  } catch { motoDocsCache = []; }
}
async function loadMotoBuyer() {
  try {
    const { data } = await supabase.from("motorcycle_buyer").select("*");
    motoBuyerCache = data || [];
  } catch { motoBuyerCache = []; }
}
async function loadGoal(month, year) {
  const { data } = await supabase.from("financial_goals").select("*").eq("month", month).eq("year", year).maybeSingle();
  return data;
}

// ── ALERTAS DE DOCUMENTOS ────────────────────────────
function getDocAlerts() {
  const atrasados = motoDocsCache.filter(d => d.status === "atrasado");
  const pendentes = motoDocsCache.filter(d => d.status === "pendente");
  const hoje = new Date();
  const vencendo = motoDocsCache.filter(d => {
    if (!d.expiry_date || d.status === "atrasado") return false;
    const exp = new Date(d.expiry_date + "T00:00:00");
    const diff = (exp - hoje) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  });
  return { atrasados, pendentes, vencendo };
}

// ── UPLOAD WEBP ───────────────────────────────────────
async function toWebP(file, maxW = 1200, quality = 0.82) {
  return new Promise(res => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => res(blob || file), "image/webp", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(file); };
    img.src = url;
  });
}

async function uploadReceipt(file, folder) {
  const webp = await toWebP(file);
  const name = `${folder}/${Date.now()}.webp`;
  const { error } = await supabase.storage.from(BUCKET_FIN).upload(name, webp, {
    upsert: false, cacheControl: "2592000", contentType: "image/webp"
  });
  if (error) throw error;
  const { data: pub } = supabase.storage.from(BUCKET_FIN).getPublicUrl(name);
  return pub?.publicUrl || "";
}

async function uploadDoc(file, folder) {
  const isPdf = file.type === "application/pdf";
  let uploadBlob = file;
  let contentType = file.type;
  let ext = isPdf ? "pdf" : "webp";

  if (!isPdf) {
    uploadBlob = await toWebP(file);
    contentType = "image/webp";
  }

  const name = `${folder}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET_FIN).upload(name, uploadBlob, {
    upsert: false, cacheControl: "2592000", contentType
  });
  if (error) throw error;
  const { data: pub } = supabase.storage.from(BUCKET_FIN).getPublicUrl(name);
  return pub?.publicUrl || "";
}

// ── DIAS EM ESTOQUE ───────────────────────────────────
function diasNoEstoque(moto) {
  if (!moto.created_at) return null;
  const criado = new Date(moto.created_at);
  const hoje = new Date();
  return Math.floor((hoje - criado) / (1000 * 60 * 60 * 24));
}

function diasBadgeHtml(dias) {
  if (dias === null) return "";
  const cls = dias < 30 ? "ok" : dias < 60 ? "warn" : "danger";
  return `<span class="diasBadge ${cls}">⏱ ${dias}d</span>`;
}

// ── HELPERS PARA PERÍODO ──────────────────────────────
function filterByPeriod(arr, dateField, m, y) {
  return arr.filter(e => {
    const d = new Date(e[dateField] + "T00:00:00");
    return d.getMonth() + 1 === m && d.getFullYear() === y;
  });
}

function getPrevPeriod(m, y) {
  if (m === 1) return { m: 12, y: y - 1 };
  return { m: m - 1, y };
}

// ── OVERVIEW ─────────────────────────────────────────
async function renderOverview() {
  const m = overviewFilter.month, y = overviewFilter.year;
  const { m: pm, y: py } = getPrevPeriod(m, y);

  const expenses = filterByPeriod(expensesCache, "expense_date", m, y);
  const prevExp  = filterByPeriod(expensesCache, "expense_date", pm, py);
  const sales    = filterByPeriod(salesCache, "sale_date", m, y);
  const prevSales= filterByPeriod(salesCache, "sale_date", pm, py);

  // Gastos Fixos: soma diretamente dos templates cadastrados na tela "Gastos Fixos"
  // (mesma fonte de dados = mesmos valores que aparecem la).
  const fixedExp = fixedExpensesCache.filter(f => f.active !== false).reduce((s, f) => s + Number(f.amount), 0);

  // Gastos variaveis: exclui registros gerados automaticamente pelo "Aplicar Gastos Fixos"
  // (esses ja estao contabilizados em fixedExp acima, evitando double-count).
  const AUTO_NOTE = "Aplicado automaticamente (gasto fixo)";
  const variableExp = expenses.filter(e => e.notes !== AUTO_NOTE);
  const businessExp = variableExp.filter(e => e.type === "business").reduce((s, e) => s + Number(e.amount), 0);
  const personalExp = variableExp.filter(e => e.type === "personal").reduce((s, e) => s + Number(e.amount), 0);

  const soldMotoIds = sales.map(s => s.motorcycle_id).filter(Boolean);
  const totalPurchasePrices = soldMotoIds.reduce((sum, mid) => {
    const fin = motoFinCache.find(f => f.motorcycle_id === mid);
    return sum + (fin?.purchase_price ? Number(fin.purchase_price) : 0);
  }, 0);

  const totalExp = businessExp + personalExp + fixedExp + totalPurchasePrices;
  const receita  = sales.reduce((s, v) => s + Number(v.sale_price), 0);
  const lucroLiq = receita - totalExp;

  const prevReceita  = prevSales.reduce((s, v) => s + Number(v.sale_price), 0);
  const prevTotalExp = prevExp.reduce((s, e) => s + Number(e.amount), 0);
  const prevLucro    = prevReceita - prevTotalExp;

  const estoque  = motosCache.filter(m => m.status === "ativo").length;

  // Atualiza valores com animação de contagem
  animateCount($("statReceita"),       receita,      true);
  animateCount($("statGastosTotal"),   totalExp,     true);
  animateCount($("statGastosLoja"),    businessExp,  true);
  animateCount($("statGastosPessoal"), personalExp,  true);
  animateCount($("statLucroLiq"),      Math.abs(lucroLiq), true);
  animateCount($("statVendidas"),      sales.length, false);
  animateCount($("statEstoque"),       estoque,      false);
  animateCount($("statFixos"),         fixedExp,     true);
  animateCount($("statComprasMes"),    totalPurchasePrices, true);

  const ticketMedio = sales.length > 0 ? receita / sales.length : 0;
  animateCount($("statTicketMedio"), ticketMedio, true);
  const margem = receita > 0 ? Math.round((lucroLiq / receita) * 100) : 0;
  const margemEl = $("statMargem");
  if (margemEl) {
    margemEl.textContent = margem + "%";
    margemEl.style.color = margem >= 0 ? "var(--green)" : "var(--red2)";
  }

  // Tendências
  const tR = calcTrend(receita, prevReceita);
  const tG = calcTrend(totalExp, prevTotalExp);
  const tL = calcTrend(lucroLiq, prevLucro);
  const recEl = $("trendReceita"); if (recEl) recEl.outerHTML = trendHtml(tR);
  const gasEl = $("trendGastos"); if (gasEl) gasEl.outerHTML = trendHtml(tG, true);
  const lucEl = $("trendLucro");  if (lucEl) lucEl.outerHTML = trendHtml(tL);

  // Cor do card de lucro
  const kpiLucro = $("kpiLucro");
  const kpiLucroBadge = $("kpiLucroBadge");
  const lucroVal = $("statLucroLiq");
  const clr = lucroLiq >= 0 ? "green" : "red";
  if (kpiLucro) { kpiLucro.className = "kpiCard " + clr; }
  if (kpiLucroBadge) { kpiLucroBadge.className = "kpiBadge " + clr; }
  if (lucroVal) { lucroVal.className = "kpiVal " + clr; }

  // Subtitle
  const sub = $("overviewSubtitle");
  if (sub) sub.textContent = `${MONTHS[m-1]} ${y} · ${sales.length} venda${sales.length !== 1 ? "s" : ""} · ${expenses.length} gasto${expenses.length !== 1 ? "s" : ""}`;

  const ml = $("monthLabel");
  if (ml) ml.textContent = `${MONTHS[m-1]} ${y}`;

  renderAlerts(expenses, receita, lucroLiq);
  renderRecentTransactions(expenses, sales);
  await renderCharts(expenses, sales);
  injectSparklines();
}

function renderAlerts(expenses, receita, lucroLiq) {
  const area = $("alertsArea");
  if (!area) return;
  const alerts = [];
  if (lucroLiq < 0) alerts.push({ type: "danger", msg: "⚠️ Lucro negativo este mês! Gastos superaram a receita." });
  if (receita === 0)  alerts.push({ type: "warn",   msg: "ℹ️ Nenhuma venda registrada neste período." });
  const noCategory = expenses.filter(e => !e.category);
  if (noCategory.length) alerts.push({ type: "warn", msg: `📂 ${noCategory.length} gasto(s) sem categoria definida.` });

  const motosParadas = motosCache.filter(m => {
    if (m.status !== "ativo" && m.status !== "reservada") return false;
    const dias = diasNoEstoque(m);
    return dias !== null && dias >= 45;
  });
  if (motosParadas.length) {
    const nomes = motosParadas.map(m => `${m.titulo || m.id} (${diasNoEstoque(m)}d)`).join(", ");
    alerts.push({ type: "warn", msg: `🏍️ ${motosParadas.length} moto(s) parada(s) há mais de 45 dias: ${nomes}` });
  }

  // Alertas de gastos fixos com vencimento
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const gastosPendentes = expensesCache.filter(e => e.due_date && e.paid_status !== 'pago');
  gastosPendentes.forEach(e => {
    const venc = new Date(e.due_date + 'T00:00:00');
    const diff = Math.round((venc - hoje) / 86400000);
    const nome = e.description || e.category || 'Gasto';
    if (diff < 0) {
      alerts.push({ type: 'danger', msg: `🔴 Gasto vencido há ${Math.abs(diff)} dia(s): <strong>${nome}</strong> — ${BRL(e.amount)}` });
    } else if (diff <= 3) {
      alerts.push({ type: 'warn', msg: `⚠️ Vence em ${diff === 0 ? 'hoje' : diff + ' dia(s)'}: <strong>${nome}</strong> — ${BRL(e.amount)}` });
    }
  });

  const { atrasados, vencendo } = getDocAlerts();
  if (atrasados.length) {
    const motos = [...new Set(atrasados.map(d => {
      const m = motosCache.find(x => x.id === d.motorcycle_id);
      return m?.titulo || d.motorcycle_id;
    }))];
    alerts.push({ type: "danger", msg: `📄 Documentos ATRASADOS: ${motos.join(", ")}` });
  }
  if (vencendo.length) {
    alerts.push({ type: "warn", msg: `📄 ${vencendo.length} documento(s) vencem em até 30 dias.` });
  }

  area.innerHTML = alerts.map(a => `<div class="alertBox ${a.type}">${a.msg}</div>`).join("");
}

function renderRecentTransactions(expenses, sales) {
  const area = $("recentTransactions");
  if (!area) return;

  const items = [
    ...expenses.slice(0, 5).map(e => ({
      type: e.type, desc: e.description || e.category || "Gasto",
      meta: `${fmtDate(e.expense_date)} · ${e.category || "—"} · ${e.type === "business" ? "Loja" : "Pessoal"}`,
      amt: `-${BRL(e.amount)}`, amtColor: "var(--red2)"
    })),
    ...sales.slice(0, 3).map(s => {
      const moto = motosCache.find(m => m.id === s.motorcycle_id);
      return {
        type: "sale", desc: moto?.titulo || "Venda de moto",
        meta: `${fmtDate(s.sale_date)} · ${s.payment_method || "—"}`,
        amt: `+${BRL(s.sale_price)}`, amtColor: "var(--green)"
      };
    })
  ].sort(() => -1).slice(0, 6);

  if (!items.length) {
    area.innerHTML = `<div class="emptyState" style="padding:24px"><p>Nenhuma transação neste período.</p></div>`;
    return;
  }

  area.innerHTML = `<div class="recentList">${items.map(i => `
    <div class="recentItem">
      <div class="recentDot ${i.type}"></div>
      <div class="recentInfo">
        <div class="recentDesc">${i.desc}</div>
        <div class="recentMeta">${i.meta}</div>
      </div>
      <div class="recentAmt" style="color:${i.amtColor}">${i.amt}</div>
    </div>
  `).join("")}</div>`;
}

async function renderCharts(expenses, sales) {
  await loadChartJS();
  const C = window.Chart;
  const now = new Date();

  // Global defaults — professional font
  C.defaults.font.family = "'Inter','Segoe UI',system-ui,sans-serif";
  C.defaults.animation.duration = 600;

  // ── Receita x Gastos (6 meses) ──
  const labels6 = [], dataRec = [], dataGasto = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mm = d.getMonth() + 1, yy = d.getFullYear();
    labels6.push(MONTHS[d.getMonth()].slice(0, 3) + " '" + String(yy).slice(-2));
    const mSales = salesCache.filter(s => { const sd = new Date(s.sale_date+"T00:00:00"); return sd.getMonth()+1===mm && sd.getFullYear()===yy; });
    const mExp   = expensesCache.filter(e => { const ed = new Date(e.expense_date+"T00:00:00"); return ed.getMonth()+1===mm && ed.getFullYear()===yy; });
    dataRec.push(mSales.reduce((s,v)=>s+Number(v.sale_price),0));
    dataGasto.push(mExp.reduce((s,e)=>s+Number(e.amount),0));
  }

  const tc = chartTextColor();
  const gc = chartGridColor();
  const pb = chartPanelBg();
  const dataLucro = labels6.map((_, i) => dataRec[i] - dataGasto[i]);

  const tooltipStyle = {
    backgroundColor: pb,
    titleColor: tc,
    bodyColor: tc,
    borderColor: gc,
    borderWidth: 1,
    padding: 10,
    cornerRadius: 8,
    titleFont: { size: 12, weight: "700" },
    bodyFont: { size: 12 },
    displayColors: true,
    boxWidth: 10,
    boxHeight: 10,
  };

  destroyChart("chartReceitaGastos");
  const ctx1 = $("chartReceitaGastos")?.getContext("2d");
  if (ctx1) {
    const gRec   = gradientFill(ctx1, "rgba(34,197,94,.8)",  "rgba(34,197,94,.08)");
    const gGasto = gradientFill(ctx1, "rgba(220,38,38,.75)", "rgba(220,38,38,.08)");
    chartInstances["chartReceitaGastos"] = new C(ctx1, {
      type: "bar",
      data: {
        labels: labels6,
        datasets: [
          {
            label: "Receita", data: dataRec,
            backgroundColor: gRec, borderRadius: 7, borderSkipped: false,
            barPercentage: 0.72, categoryPercentage: 0.72,
          },
          {
            label: "Gastos", data: dataGasto,
            backgroundColor: gGasto, borderRadius: 7, borderSkipped: false,
            barPercentage: 0.72, categoryPercentage: 0.72,
          },
          {
            label: "Lucro", data: dataLucro,
            type: "line",
            borderColor: "rgba(139,92,246,.9)",
            backgroundColor: "transparent",
            tension: 0.45,
            pointBackgroundColor: "rgba(139,92,246,.9)",
            pointBorderColor: pb,
            pointBorderWidth: 2,
            pointRadius: 5, pointHoverRadius: 7,
            borderWidth: 2.5,
            yAxisID: "y",
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            labels: {
              color: tc,
              font: { size: 12, weight: "600" },
              usePointStyle: true,
              pointStyle: "circle",
              padding: 16,
            }
          },
          tooltip: {
            ...tooltipStyle,
            callbacks: { label: ctx => `  ${ctx.dataset.label}: ${BRL(ctx.raw)}` }
          }
        },
        scales: {
          x: {
            ticks: { color: tc, font: { size: 11, weight: "600" } },
            grid: { display: false },
            border: { color: gc }
          },
          y: {
            ticks: { color: tc, font: { size: 11 }, callback: v => v === 0 ? "R$ 0" : (v >= 1000 ? `R$${(v/1000).toFixed(0)}k` : BRL(v)) },
            grid: { color: gc },
            border: { dash: [4,4], color: "transparent" }
          }
        }
      }
    });
  }

  // ── Gastos por categoria (doughnut com total central) ──
  const catMap = {};
  expenses.forEach(e => { const k = e.category || "Outros"; catMap[k] = (catMap[k] || 0) + Number(e.amount); });
  const catKeys = Object.keys(catMap).sort((a,b) => catMap[b]-catMap[a]).slice(0,8);
  const colors8 = ["#dc2626","#2563eb","#d97706","#16a34a","#7c3aed","#db2777","#0891b2","#f59e0b"];

  const centerTextPlugin = {
    id: "centerText",
    afterDraw(chart) {
      if (chart.config.type !== "doughnut") return;
      const { ctx: c, chartArea: { left, top, right, bottom } } = chart;
      const cx = (left + right) / 2, cy = (top + bottom) / 2;
      const total = chart.data.datasets[0].data.reduce((a,b)=>a+b,0);
      c.save();
      c.textAlign = "center"; c.textBaseline = "middle";
      c.font = `800 18px ${C.defaults.font.family}`;
      c.fillStyle = tc;
      c.fillText(total >= 1000 ? `R$${(total/1000).toFixed(0)}k` : BRL(total), cx, cy - 8);
      c.font = `600 10px ${C.defaults.font.family}`;
      c.fillStyle = isLight() ? "#6b7280" : "#8a96a6";
      c.fillText("total gastos", cx, cy + 10);
      c.restore();
    }
  };

  destroyChart("chartCategoria");
  const ctx2 = $("chartCategoria")?.getContext("2d");
  if (ctx2 && catKeys.length) {
    chartInstances["chartCategoria"] = new C(ctx2, {
      type: "doughnut",
      plugins: [centerTextPlugin],
      data: {
        labels: catKeys,
        datasets: [{
          data: catKeys.map(k=>catMap[k]),
          backgroundColor: colors8,
          borderWidth: 3,
          borderColor: pb,
          hoverOffset: 10,
          hoverBorderWidth: 0,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: true, cutout: "68%",
        plugins: {
          legend: {
            position: "right",
            labels: {
              color: tc,
              font: { size: 11, weight: "600" },
              usePointStyle: true, pointStyle: "circle",
              boxWidth: 8, padding: 10,
            }
          },
          tooltip: {
            ...tooltipStyle,
            callbacks: { label: ctx => `  ${ctx.label}: ${BRL(ctx.raw)}` }
          }
        }
      }
    });
  }

  // ── Evolução do lucro (area chart) ──
  destroyChart("chartLucro");
  const ctx3 = $("chartLucro")?.getContext("2d");
  if (ctx3) {
    const gLucro = gradientFill(ctx3, "rgba(139,92,246,.3)", "rgba(139,92,246,.02)");
    chartInstances["chartLucro"] = new C(ctx3, {
      type: "line",
      data: {
        labels: labels6,
        datasets: [{
          label: "Lucro líquido",
          data: dataLucro,
          borderColor: "rgba(139,92,246,1)",
          backgroundColor: gLucro,
          tension: 0.45, fill: true,
          pointBackgroundColor: "rgba(139,92,246,1)",
          pointBorderColor: pb,
          pointBorderWidth: 2.5,
          pointRadius: 5, pointHoverRadius: 8,
          borderWidth: 2.5,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: tc, font: { size: 12, weight: "600" }, usePointStyle: true, pointStyle: "circle", padding: 16 } },
          tooltip: { ...tooltipStyle, callbacks: { label: ctx => `  ${BRL(ctx.raw)}` } }
        },
        scales: {
          x: { ticks: { color: tc, font: { size: 11, weight: "600" } }, grid: { display: false }, border: { color: gc } },
          y: { ticks: { color: tc, font: { size: 11 }, callback: v => v >= 1000 ? `R$${(v/1000).toFixed(0)}k` : BRL(v) }, grid: { color: gc }, border: { dash: [4,4], color: "transparent" } }
        }
      }
    });
  }

  // ── Loja vs Pessoal (donut) ──
  const bTotal = expenses.filter(e=>e.type==="business").reduce((s,e)=>s+Number(e.amount),0);
  const pTotal = expenses.filter(e=>e.type==="personal").reduce((s,e)=>s+Number(e.amount),0);
  destroyChart("chartTipo");
  const ctx4 = $("chartTipo")?.getContext("2d");
  if (ctx4 && (bTotal || pTotal)) {
    chartInstances["chartTipo"] = new C(ctx4, {
      type: "doughnut",
      data: {
        labels: ["Gastos Loja","Gastos Pessoais"],
        datasets: [{
          data: [bTotal, pTotal],
          backgroundColor: ["rgba(220,38,38,.85)","rgba(37,99,235,.85)"],
          borderWidth: 3, borderColor: pb, hoverOffset: 10, hoverBorderWidth: 0
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: true, cutout: "62%",
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: tc, font: { size: 12, weight: "600" }, usePointStyle: true, pointStyle: "circle", padding: 14 }
          },
          tooltip: { ...tooltipStyle, callbacks: { label: ctx => `  ${ctx.label}: ${BRL(ctx.raw)}` } }
        }
      }
    });
  }
}

// ── ESTOQUE ───────────────────────────────────────────
function renderEstoque() {
  const search = estFilter.search.toLowerCase();
  const status = estFilter.status;

  const all = motosCache;
  const ativos    = all.filter(m => m.status === "ativo");
  const reservadas = all.filter(m => m.status === "reservada");

  const totalValorEstoque = [...ativos, ...reservadas].reduce((s, m) => {
    const fin = motoFinCache.find(f => f.motorcycle_id === m.id);
    const val = Number(fin?.purchase_price || m.preco || 0);
    return s + (Number.isFinite(val) ? val : 0);
  }, 0);

  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set("stockTotal", all.length);
  set("stockDisponiveis", ativos.length);
  set("stockReservadas", reservadas.length);
  set("stockValorTotal", BRL(totalValorEstoque));

  let filtered = all.filter(m => {
    if (status !== "all" && m.status !== status) return false;
    if (search) {
      const hay = (m.titulo || m.id).toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const container = $("estoqueList");
  if (!container) return;

  if (!filtered.length) {
    container.innerHTML = `<div class="emptyState"><div class="emptyIcon">🏍️</div><p>Nenhuma moto encontrada.</p></div>`;
    return;
  }

  container.innerHTML = filtered.map(moto => {
    const fin = motoFinCache.find(f => f.motorcycle_id === moto.id);
    const costs = motoCostsCache.filter(c => c.motorcycle_id === moto.id);
    const totalCosts = costs.reduce((s, c) => s + Number(c.amount), 0);
    const purchase = fin?.purchase_price ? Number(fin.purchase_price) : Number(moto.preco || 0);
    const sale = fin?.sale_price ? Number(fin.sale_price) : null;
    const lucro = (purchase && sale) ? sale - purchase - totalCosts : null;

    const statusLabel = { ativo: "Disponível", reservada: "Reservada", vendida: "Vendida" }[moto.status] || moto.status;
    const badgeClass = moto.status === "ativo" ? "ativo" : moto.status;

    const lucroTag = lucro !== null
      ? `<span class="badge ${lucro >= 0 ? "lucro" : "prejuizo"}">${lucro >= 0 ? "Lucro" : "Prejuízo"}: ${BRL(Math.abs(lucro))}</span>`
      : "";

    const precoDisplay = sale !== null ? BRL(sale) : (purchase ? BRL(purchase) : "—");
    const precoLabel   = sale !== null ? "Vendida por" : (purchase ? "Valor compra" : "Preço");

    const dias = (moto.status === "ativo" || moto.status === "reservada") ? diasNoEstoque(moto) : null;

    const lucroColor = lucro === null ? "var(--muted)" : lucro >= 0 ? "var(--green)" : "var(--red2)";
    const lucroTxt   = lucro === null ? "—" : `${lucro >= 0 ? "+" : ""}${BRL(lucro)}`;

    return `
      <div class="motoCard">
        <img class="motoCardImg" src="${motoCoverUrl(moto)}" alt="${escHTML(moto.titulo || moto.id)}"
             loading="lazy" onerror="this.onerror=null;this.src='${MOTO_IMG_PLACEHOLDER}'">
        <div class="motoCardMain">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
            <div class="motoCardTitle">${moto.titulo || moto.id}</div>
            <span class="badge ${badgeClass}">${statusLabel}</span>
            ${dias !== null ? diasBadgeHtml(dias) : ""}
          </div>

          <!-- Painel financeiro expandido -->
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;background:var(--panel3);border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin-bottom:2px">
            <div>
              <div style="font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px">Compra</div>
              <div style="font-size:14px;font-weight:900">${purchase ? BRL(purchase) : "—"}</div>
            </div>
            <div>
              <div style="font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px">Gastos</div>
              <div style="font-size:14px;font-weight:900;color:${totalCosts > 0 ? "var(--red2)" : "var(--muted)"}">${totalCosts > 0 ? BRL(totalCosts) : "—"}</div>
            </div>
            <div>
              <div style="font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px">${sale !== null ? "Vendida por" : "Venda"}</div>
              <div style="font-size:14px;font-weight:900;color:${sale !== null ? "var(--blue)" : "var(--muted)"}">${sale !== null ? BRL(sale) : "—"}</div>
            </div>
            <div>
              <div style="font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px">Lucro</div>
              <div style="font-size:15px;font-weight:900;color:${lucroColor}">${lucroTxt}</div>
            </div>
          </div>
          ${fin?.sold_at ? `<div style="font-size:11px;color:var(--muted);font-weight:600;margin-top:6px">📅 Vendida em ${fmtDate(fin.sold_at)}</div>` : ""}

          <!-- Lista de custos inline -->
          ${costs.length > 0 ? `
          <div style="margin-top:10px;border-top:1px solid var(--line);padding-top:8px">
            <div style="font-size:10px;font-weight:900;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Custos adicionais</div>
            ${costs.map(c => `
              <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line2)">
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.description}</div>
                  <div style="font-size:10px;color:var(--muted);font-weight:600">${fmtDate(c.cost_date)}</div>
                </div>
                <div style="font-size:13px;font-weight:900;color:var(--red2);white-space:nowrap">${BRL(c.amount)}</div>
                <button class="btn-ghost btn-sm" onclick="openMotoCostModal('${moto.id}',${c.id})" style="font-size:11px;padding:4px 8px">✏️</button>
              </div>
            `).join("")}
          </div>` : ""}
        </div>
        <div class="motoCardActions">
          <select class="statusSel" onchange="changeStatusMoto('${moto.id}', this.value)" title="Alterar status">
            <option value="ativo"     ${moto.status==="ativo"?"selected":""}>Disponível</option>
            <option value="reservada" ${moto.status==="reservada"?"selected":""}>Reservada</option>
            <option value="vendida"   ${moto.status==="vendida"?"selected":""}>Vendida</option>
          </select>
          ${moto.status !== "vendida" ? `<button class="btn-primary btn-sm" onclick="openSaleModalForMoto('${moto.id}')" style="font-size:12px">Vender</button>` : ""}
          <button class="btn-primary btn-sm" onclick="openFichaModal('${moto.id}')" style="font-size:12px">Ficha</button>
          <button class="btn-ghost btn-sm" onclick="openMotoFinModal('${moto.id}')" style="font-size:12px">Valores</button>
          <button class="btn-ghost btn-sm" onclick="openMotoCostModal('${moto.id}',null)" style="font-size:12px">+ Custo</button>
        </div>
      </div>
    `;
  }).join("");
}

window.changeStatusMoto = async function(motoId, newStatus) {
  const { error } = await supabase.from("motos").update({ status: newStatus }).eq("id", motoId);
  if (error) { alert("Erro ao atualizar status: " + error.message); return; }
  const moto = motosCache.find(m => m.id === motoId);
  if (moto) moto.status = newStatus;
  renderEstoque();
  renderOverview();
};

function bindEstoqueFilters() {
  const search = $("searchEstoque");
  if (search) search.oninput = () => { estFilter.search = search.value; renderEstoque(); };

  document.querySelectorAll("[data-stock-status]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-stock-status]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      estFilter.status = btn.dataset.stockStatus;
      renderEstoque();
    });
  });
}

// ── EXPENSES LIST ─────────────────────────────────────
function getFilteredExpenses() {
  return expensesCache.filter(e => {
    const d = new Date(e.expense_date + "T00:00:00");
    if (expFilter.type !== "all" && e.type !== expFilter.type) return false;
    if (d.getMonth() + 1 !== expFilter.month) return false;
    if (d.getFullYear() !== expFilter.year) return false;
    if (expFilter.search) {
      const hay = `${e.description||""} ${e.category||""} ${e.notes||""}`.toLowerCase();
      if (!hay.includes(expFilter.search.toLowerCase())) return false;
    }
    return true;
  });
}

function renderExpenseList() {
  const list = getFilteredExpenses();
  const totalPages = Math.max(1, Math.ceil(list.length / EXP_PAGE_SIZE));
  if (expPage > totalPages) expPage = totalPages;
  const page = list.slice((expPage-1)*EXP_PAGE_SIZE, expPage*EXP_PAGE_SIZE);

  const container = $("expenseList");
  if (!container) return;

  if (!page.length) {
    container.innerHTML = `<div class="emptyState"><div class="emptyIcon">💸</div><p>Nenhum gasto encontrado.</p></div>`;
    $("expensePagination").innerHTML = "";
    return;
  }

  container.innerHTML = page.map(e => {
    const moto = motosCache.find(m => m.id === e.motorcycle_id);
    const motoTag = moto ? `<span style="font-size:11px;color:var(--blue);font-weight:700"> · ${escHTML(moto.titulo||moto.id)}</span>` : "";
    const receipt = e.receipt_url ? `<img src="${e.receipt_url}" class="receiptThumb" onclick="openLightbox('${e.receipt_url}')" alt="comprovante"/>` : "";
    return `
      <div class="expenseItem">
        <div class="eDate">${fmtDate(e.expense_date)}</div>
        <div class="eInfo">
          <div class="eDesc">${e.description || e.category || "—"}${motoTag}</div>
          <div class="eCat">${e.category || "—"} · ${e.payment_method || "—"} · ${e.type==="business"?"🏪 Loja":"👤 Pessoal"}</div>
        </div>
        ${receipt}
        <div class="eAmt">${BRL(e.amount)}</div>
        <div class="eActions">
          <button class="btn-ghost btn-sm" onclick="openExpenseModal(${e.id})">✏️</button>
        </div>
      </div>
    `;
  }).join("");

  const pg = $("expensePagination");
  if (!pg) return;
  if (totalPages <= 1) { pg.innerHTML = ""; return; }
  let html = "";
  for (let p = 1; p <= totalPages; p++) {
    html += `<button class="pageBtn${p===expPage?" active":""}" onclick="setExpPage(${p})">${p}</button>`;
  }
  pg.innerHTML = html;
}

window.setExpPage = p => { expPage = p; renderExpenseList(); };

// ── EXPENSE MODAL ────────────────────────────────────
window.openExpenseModal = function(id) {
  const e = id ? expensesCache.find(x => x.id === id) : null;
  $("modalExpenseTitle").textContent = e ? "Editar Gasto" : "Novo Gasto";
  $("expId").value       = e?.id || "";
  $("expType").value     = e?.type || "business";
  $("expDate").value     = e?.expense_date || todayISO();
  $("expAmount").value   = e?.amount ? Number(e.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
  $("expPayment").value  = e?.payment_method || "";
  $("expCategory").value = e?.category || "";
  $("expMoto").value     = e?.motorcycle_id || "";
  $("expDesc").value     = e?.description || "";
  $("expNotes").value    = e?.notes || "";
  $("expDueDate").value  = e?.due_date || "";
  $("expPaidStatus").value = e?.paid_status || "pendente";
  $("expReceiptUrl").value = e?.receipt_url || "";
  const prev = $("expReceiptPreview");
  if (prev) { prev.src = e?.receipt_url || ""; prev.style.display = e?.receipt_url ? "block" : "none"; }
  $("btnDeleteExpense").style.display = e ? "" : "none";
  hint($("expMsg"), "");
  $("modalExpense").classList.add("open");
};

$("btnNovoGasto")?.addEventListener("click", () => openExpenseModal(null));
$("modalExpenseClose")?.addEventListener("click", () => $("modalExpense").classList.remove("open"));

$("expReceiptFile")?.addEventListener("change", async function() {
  const file = this.files?.[0];
  if (!file) return;
  const prev = $("expReceiptPreview");
  prev.src = URL.createObjectURL(file);
  prev.style.display = "block";
});

$("btnSaveExpense")?.addEventListener("click", async () => {
  const id = $("expId").value;
  const amount = parseBRL($("expAmount").value);
  if (!amount) { hint($("expMsg"), "Informe o valor.", "err"); return; }
  if (!$("expDate").value) { hint($("expMsg"), "Informe a data.", "err"); return; }
  if (!$("expCategory").value) { hint($("expMsg"), "Escolha a categoria.", "err"); return; }

  hint($("expMsg"), "Salvando…");
  let receipt_url = $("expReceiptUrl").value;
  const file = $("expReceiptFile").files?.[0];
  if (file) {
    try { receipt_url = await uploadReceipt(file, "expenses"); }
    catch (err) { hint($("expMsg"), "Erro no upload: " + err.message, "err"); return; }
  }

  const payload = {
    type: $("expType").value,
    category: $("expCategory").value,
    description: $("expDesc").value.trim() || null,
    amount,
    payment_method: $("expPayment").value || null,
    expense_date: $("expDate").value,
    receipt_url: receipt_url || null,
    motorcycle_id: $("expMoto").value || null,
    notes: $("expNotes").value.trim() || null,
    due_date: $("expDueDate").value || null,
    paid_status: $("expPaidStatus").value || "pendente",
    updated_at: new Date().toISOString(),
  };

  let err;
  if (id) {
    ({ error: err } = await supabase.from("financial_expenses").update(payload).eq("id", id));
  } else {
    ({ error: err } = await supabase.from("financial_expenses").insert(payload));
  }
  if (err) { hint($("expMsg"), "Erro: " + err.message, "err"); toast("Erro ao salvar gasto.", "err"); return; }
  hint($("expMsg"), "Salvo ✅", "ok");
  toast("Gasto salvo com sucesso!", "ok");
  await loadExpenses();
  renderExpenseList();
  renderOverview();
  setTimeout(() => $("modalExpense").classList.remove("open"), 600);
});

$("btnDeleteExpense")?.addEventListener("click", async () => {
  const id = $("expId").value;
  if (!id || !confirm("Excluir este gasto?")) return;
  hint($("expMsg"), "Excluindo…");
  const { error } = await supabase.from("financial_expenses").delete().eq("id", Number(id));
  if (error) { hint($("expMsg"), "Erro ao excluir: " + error.message, "err"); toast("Erro ao excluir gasto.", "err"); return; }
  toast("Gasto excluído.", "ok");
  await loadExpenses();
  renderExpenseList();
  renderOverview();
  $("modalExpense").classList.remove("open");
});

// ── MOTO FINANCEIRO ───────────────────────────────────
function renderMotoFinList() {
  const container = $("motoFinList");
  if (!container) return;
  const search = $("searchMotoFin")?.value.toLowerCase() || "";

  const list = motosCache.filter(m => {
    if (search) return (m.titulo||m.id).toLowerCase().includes(search);
    return true;
  });

  if (!list.length) {
    container.innerHTML = `<div class="emptyState"><div class="emptyIcon">🏍️</div><p>Nenhuma moto encontrada.</p></div>`;
    return;
  }

  container.innerHTML = list.map(moto => {
    const fin = motoFinCache.find(f => f.motorcycle_id === moto.id);
    const costs = motoCostsCache.filter(c => c.motorcycle_id === moto.id);
    const totalCosts = costs.reduce((s,c) => s + Number(c.amount), 0);
    const purchase = fin?.purchase_price ? Number(fin.purchase_price) : null;
    const sale = fin?.sale_price ? Number(fin.sale_price) : null;
    const lucro = (purchase !== null && sale !== null) ? sale - purchase - totalCosts : null;

    const lucroHtml = lucro !== null
      ? `<span class="badge ${lucro >= 0 ? "lucro" : "prejuizo"}">${lucro >= 0 ? "Lucro" : "Prejuízo"}: ${BRL(Math.abs(lucro))}</span>`
      : "";

    const costsList = costs.map(c =>
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);gap:10px">
        <div>
          <div style="font-size:13px;font-weight:700">${c.description}</div>
          <div style="font-size:11px;color:var(--muted)">${fmtDate(c.cost_date)}</div>
        </div>
        ${c.receipt_url ? `<img src="${c.receipt_url}" class="receiptThumb" onclick="openLightbox('${c.receipt_url}')" style="width:36px;height:36px"/>` : ""}
        <div style="font-size:13px;font-weight:900;color:var(--red2);white-space:nowrap">${BRL(c.amount)}</div>
        <button class="btn-danger btn-sm" onclick="openMotoCostModal('${moto.id}',${c.id})">✏️</button>
      </div>`
    ).join("");

    return `
      <div class="motoFinCard">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px">
          <div>
            <div class="motoFinTitle">${moto.titulo || moto.id}</div>
            <span class="badge ${moto.status}">${moto.status === "ativo" ? "Disponível" : moto.status}</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${lucroHtml}
            <button class="btn-ghost btn-sm" onclick="openMotoFinModal('${moto.id}')">✏️ Ficha</button>
            <button class="btn-ghost btn-sm" onclick="openMotoCostModal('${moto.id}',null)">+ Custo</button>
          </div>
        </div>
        <div class="motoFinRow">
          <div class="motoFinItem">
            <div class="label">Compra</div>
            <div class="value">${purchase !== null ? BRL(purchase) : "—"}</div>
          </div>
          <div class="motoFinItem">
            <div class="label">Custos extras</div>
            <div class="value" style="color:var(--red2)">${totalCosts > 0 ? BRL(totalCosts) : "—"}</div>
          </div>
          <div class="motoFinItem">
            <div class="label">Venda</div>
            <div class="value" style="color:var(--green)">${sale !== null ? BRL(sale) : "—"}</div>
          </div>
          ${fin?.sold_at ? `<div class="motoFinItem"><div class="label">Data venda</div><div class="value">${fmtDate(fin.sold_at)}</div></div>` : ""}
        </div>
        ${costs.length ? `<div style="margin-top:12px;border-top:1px solid rgba(255,255,255,.06);padding-top:10px"><div style="font-size:10px;font-weight:900;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Custos adicionais (${costs.length})</div>${costsList}</div>` : ""}
      </div>
    `;
  }).join("");
}

window.openMotoFinModal = function(motoId) {
  const fin = motoFinCache.find(f => f.motorcycle_id === motoId);
  const moto = motosCache.find(m => m.id === motoId);
  $("modalMotoFinTitle").textContent = `Ficha: ${moto?.titulo || motoId}`;
  $("mfId").value       = fin?.id || "";
  $("mfMoto").value     = motoId;
  $("mfPurchase").value = fin?.purchase_price ? Number(fin.purchase_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
  $("mfSale").value     = fin?.sale_price ? Number(fin.sale_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
  $("mfSoldAt").value   = fin?.sold_at || "";
  $("mfNotes").value    = fin?.notes || "";
  hint($("mfMsg"), "");
  $("modalMotoFin").classList.add("open");
};

window.openMotoCostModal = function(motoId, costId) {
  const cost = costId ? motoCostsCache.find(c => c.id === costId) : null;
  $("mcId").value      = cost?.id || "";
  $("mcMotoId").value  = motoId;
  $("mcDesc").value    = cost?.description || "";
  $("mcAmount").value  = cost?.amount ? Number(cost.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
  $("mcDate").value    = cost?.cost_date || todayISO();
  $("mcReceiptUrl").value = cost?.receipt_url || "";
  const prev = $("mcReceiptPreview");
  if (prev) { prev.src = cost?.receipt_url || ""; prev.style.display = cost?.receipt_url ? "block" : "none"; }
  $("btnDeleteMotoCost").style.display = cost ? "" : "none";
  hint($("mcMsg"), "");
  const moto = motosCache.find(m => m.id === motoId);
  $("modalMotoCostTitle").textContent = `Custo: ${moto?.titulo || motoId}`;
  $("modalMotoCost").classList.add("open");
};

$("btnNovoMotoFin")?.addEventListener("click", () => {
  if (!motosCache.length) { alert("Nenhuma moto cadastrada."); return; }
  openMotoFinModal(motosCache[0].id);
});

$("modalMotoFinClose")?.addEventListener("click", () => $("modalMotoFin").classList.remove("open"));
$("modalMotoCostClose")?.addEventListener("click", () => $("modalMotoCost").classList.remove("open"));

$("btnSaveMotoFin")?.addEventListener("click", async () => {
  const id = $("mfId").value;
  const motoId = $("mfMoto").value;
  if (!motoId) { hint($("mfMsg"), "Moto não identificada.", "err"); return; }

  const payload = {
    motorcycle_id: motoId,
    purchase_price: parseBRL($("mfPurchase").value) || null,
    sale_price: parseBRL($("mfSale").value) || null,
    sold_at: $("mfSoldAt").value || null,
    notes: $("mfNotes").value.trim() || null,
    updated_at: new Date().toISOString(),
  };

  let err;
  if (id) {
    ({ error: err } = await supabase.from("motorcycle_financials").update(payload).eq("id", id));
  } else {
    ({ error: err } = await supabase.from("motorcycle_financials").upsert({ ...payload }, { onConflict: "motorcycle_id" }));
  }
  if (err) { hint($("mfMsg"), "Erro: " + err.message, "err"); return; }
  hint($("mfMsg"), "Salvo ✅", "ok");
  await loadMotoFin();
  renderMotoFinList();
  renderEstoque();
  setTimeout(() => $("modalMotoFin").classList.remove("open"), 700);
});

$("mcReceiptFile")?.addEventListener("change", function() {
  const file = this.files?.[0];
  if (!file) return;
  const prev = $("mcReceiptPreview");
  prev.src = URL.createObjectURL(file);
  prev.style.display = "block";
});

$("btnSaveMotoCost")?.addEventListener("click", async () => {
  const id = $("mcId").value;
  const motoId = $("mcMotoId").value;
  const amount = parseBRL($("mcAmount").value);
  if (!$("mcDesc").value.trim()) { hint($("mcMsg"), "Informe a descrição.", "err"); return; }
  if (!amount) { hint($("mcMsg"), "Informe o valor.", "err"); return; }

  hint($("mcMsg"), "Salvando…");
  let receipt_url = $("mcReceiptUrl").value;
  const file = $("mcReceiptFile").files?.[0];
  if (file) {
    try { receipt_url = await uploadReceipt(file, `moto-costs/${motoId}`); }
    catch (err) { hint($("mcMsg"), "Erro upload: " + err.message, "err"); return; }
  }

  const payload = { motorcycle_id: motoId, description: $("mcDesc").value.trim(), amount, cost_date: $("mcDate").value, receipt_url: receipt_url || null };
  let err;
  if (id) {
    ({ error: err } = await supabase.from("motorcycle_costs").update(payload).eq("id", id));
  } else {
    ({ error: err } = await supabase.from("motorcycle_costs").insert(payload));
  }
  if (err) { hint($("mcMsg"), "Erro: " + err.message, "err"); return; }
  hint($("mcMsg"), "Salvo ✅", "ok");
  await loadMotoCosts();
  renderMotoFinList();
  setTimeout(() => $("modalMotoCost").classList.remove("open"), 700);
});

$("btnDeleteMotoCost")?.addEventListener("click", async () => {
  const id = $("mcId").value;
  if (!id || !confirm("Excluir este custo?")) return;
  hint($("mcMsg"), "Excluindo…");
  const { error } = await supabase.from("motorcycle_costs").delete().eq("id", Number(id));
  if (error) { hint($("mcMsg"), "Erro ao excluir: " + error.message, "err"); toast("Erro ao excluir custo.", "err"); return; }
  toast("Custo excluído.", "ok");
  await loadMotoCosts();
  renderMotoFinList();
  $("modalMotoCost").classList.remove("open");
});

// ── SALES ─────────────────────────────────────────────
function renderSalesList() {
  const container = $("salesList");
  if (!container) return;

  const list = salesCache.filter(s => {
    const d = new Date(s.sale_date + "T00:00:00");
    return d.getMonth() + 1 === saleFilter.month && d.getFullYear() === saleFilter.year;
  });

  if (!list.length) {
    container.innerHTML = `<div class="emptyState"><div class="emptyIcon">📈</div><p>Nenhuma venda no período.</p></div>`;
    return;
  }

  container.innerHTML = list.map(s => {
    const moto = motosCache.find(m => m.id === s.motorcycle_id);
    const receipt = s.receipt_url ? `<img src="${s.receipt_url}" class="receiptThumb" onclick="openLightbox('${s.receipt_url}')" alt="comprovante"/>` : "";
    return `
      <div class="expenseItem">
        <div class="eDate">${fmtDate(s.sale_date)}</div>
        <div class="eInfo">
          <div class="eDesc">${moto?.titulo || s.motorcycle_id || "Moto"}</div>
          <div class="eCat">${s.payment_method || "—"} ${s.notes ? "· "+s.notes : ""}</div>
        </div>
        ${receipt}
        <div class="eAmt" style="color:var(--green)">${BRL(s.sale_price)}</div>
        <div class="eActions">
          <button class="btn-ghost btn-sm" onclick="openSaleModal(${s.id})">✏️</button>
        </div>
      </div>
    `;
  }).join("");
}

window.openSaleModalForMoto = function(motoId) {
  openSaleModal(null);
  // Ativa filtro "todas" para garantir que a moto apareca no select
  document.querySelectorAll("[data-sl-filter]").forEach(b => b.classList.remove("active"));
  document.querySelector('[data-sl-filter="todas"]')?.classList.add("active");
  fillMotoSelects();
  const sel = $("slMoto");
  if (sel) { sel.value = motoId; }
  updateSaleCalc();
};

window.openSaleModal = function(id) {
  const s = id ? salesCache.find(x => x.id === id) : null;
  $("modalSaleTitle").textContent = s ? "Editar Venda" : "Registrar Venda";
  // Reseta filtro para Ativas ao abrir
  document.querySelectorAll("[data-sl-filter]").forEach(b => b.classList.remove("active"));
  const defaultFilter = id ? "todas" : "ativo";
  document.querySelector(`[data-sl-filter="${defaultFilter}"]`)?.classList.add("active");
  fillMotoSelects();
  $("slId").value      = s?.id || "";
  $("slMoto").value    = s?.motorcycle_id || "";
  $("slAmount").value  = s?.sale_price ? Number(s.sale_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
  const _slFin = motoFinCache.find(f => f.motorcycle_id === (s?.motorcycle_id || ""));
  if ($("slPurchase")) $("slPurchase").value = _slFin?.purchase_price ? Number(_slFin.purchase_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
  $("slDate").value    = s?.sale_date || todayISO();
  $("slPayment").value = s?.payment_method || "";
  $("slNotes").value   = s?.notes || "";
  $("slReceiptUrl").value = s?.receipt_url || "";
  const prev = $("slReceiptPreview");
  if (prev) { prev.src = s?.receipt_url || ""; prev.style.display = s?.receipt_url ? "block" : "none"; }
  $("btnDeleteSale").style.display = s ? "" : "none";
  hint($("slMsg"), "");
  $("modalSale").classList.add("open");
  updateSaleCalc();
};

$("btnNovaVenda")?.addEventListener("click", () => openSaleModal(null));
$("modalSaleClose")?.addEventListener("click", () => $("modalSale").classList.remove("open"));

function updateSaleCalc() {
  const motoId   = $("slMoto")?.value;
  const vendaVal = parseBRL($("slAmount")?.value || "0");
  const gastosEl = $("slGastosDisplay");
  const lucroEl  = $("slLucroDisplay");
  if (!gastosEl) return;

  if (!motoId) {
    gastosEl.textContent = "—"; lucroEl.textContent = "—";
    lucroEl.style.color = "var(--green)";
    return;
  }
  const fin   = motoFinCache.find(f => f.motorcycle_id === motoId);
  const costs = motoCostsCache.filter(c => c.motorcycle_id === motoId);

  const purchaseInp = $("slPurchase");
  if (purchaseInp && !purchaseInp.value && fin?.purchase_price) {
    purchaseInp.value = Number(fin.purchase_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  }

  const compra = parseBRL(purchaseInp?.value || "0") || (fin?.purchase_price ? Number(fin.purchase_price) : 0);
  const gastos = costs.reduce((s, c) => s + Number(c.amount), 0);
  const lucro  = vendaVal - compra - gastos;

  gastosEl.textContent = gastos ? BRL(gastos) : "—";
  lucroEl.textContent  = vendaVal ? BRL(lucro) : "—";
  lucroEl.style.color  = lucro >= 0 ? "var(--green)" : "var(--red2)";
}

$("slMoto")?.addEventListener("change", () => { const p = $("slPurchase"); if (p) p.value = ""; updateSaleCalc(); });
$("slAmount")?.addEventListener("input", updateSaleCalc);
$("slPurchase")?.addEventListener("input", updateSaleCalc);

$("slReceiptFile")?.addEventListener("change", function() {
  const file = this.files?.[0];
  if (!file) return;
  $("slReceiptPreview").src = URL.createObjectURL(file);
  $("slReceiptPreview").style.display = "block";
});

$("btnSaveSale")?.addEventListener("click", async () => {
  const id = $("slId").value;
  const amount = parseBRL($("slAmount").value);
  if (!amount) { hint($("slMsg"), "Informe o valor da venda.", "err"); return; }
  if (!$("slDate").value) { hint($("slMsg"), "Informe a data.", "err"); return; }

  hint($("slMsg"), "Salvando…");
  let receipt_url = $("slReceiptUrl").value;
  const file = $("slReceiptFile").files?.[0];
  if (file) {
    try { receipt_url = await uploadReceipt(file, "sales"); }
    catch (err) { hint($("slMsg"), "Erro upload: " + err.message, "err"); return; }
  }

  const payload = {
    motorcycle_id: $("slMoto").value || null,
    sale_price: amount,
    payment_method: $("slPayment").value || null,
    sale_date: $("slDate").value,
    receipt_url: receipt_url || null,
    notes: $("slNotes").value.trim() || null,
  };

  let err;
  if (id) {
    ({ error: err } = await supabase.from("financial_sales").update(payload).eq("id", id));
  } else {
    ({ error: err } = await supabase.from("financial_sales").insert(payload));
  }
  if (err) { hint($("slMsg"), "Erro: " + err.message, "err"); toast("Erro ao salvar venda.", "err"); return; }

  // Sincroniza motorcycle_financials para o card do Estoque refletir a venda
  const motoId = $("slMoto").value;
  if (motoId) {
    const purchaseAmt = parseBRL($("slPurchase")?.value || "0") || null;
    await supabase.from("motorcycle_financials").upsert({
      motorcycle_id: motoId,
      ...(purchaseAmt !== null ? { purchase_price: purchaseAmt } : {}),
      sale_price: amount,
      sold_at: $("slDate").value,
      updated_at: new Date().toISOString(),
    }, { onConflict: "motorcycle_id" });
    // Muda status da moto para vendida
    await supabase.from("motos").update({ status: "vendida" }).eq("id", motoId);
  }

  hint($("slMsg"), "Venda registrada ✅", "ok");
  toast("Venda registrada com sucesso!", "ok");
  await Promise.all([loadSales(), loadMotoFin(), loadMotos()]);
  renderSalesList();
  renderOverview();
  renderEstoque();
  setTimeout(() => $("modalSale").classList.remove("open"), 600);
});

$("btnDeleteSale")?.addEventListener("click", async () => {
  const id = $("slId").value;
  if (!id || !confirm("Excluir esta venda?")) return;
  hint($("slMsg"), "Excluindo…");
  const { error } = await supabase.from("financial_sales").delete().eq("id", Number(id));
  if (error) { hint($("slMsg"), "Erro ao excluir: " + error.message, "err"); toast("Erro ao excluir venda.", "err"); return; }
  toast("Venda excluída.", "ok");
  await loadSales();
  renderSalesList();
  renderOverview();
  $("modalSale").classList.remove("open");
});

// ── GOALS ─────────────────────────────────────────────
async function renderGoals() {
  const m = overviewFilter.month, y = overviewFilter.year;
  const goal = await loadGoal(m, y);

  const expenses = filterByPeriod(expensesCache, "expense_date", m, y);
  const sales    = filterByPeriod(salesCache, "sale_date", m, y);

  const bTotal  = expenses.filter(e=>e.type==="business").reduce((s,e)=>s+Number(e.amount),0);
  const pTotal  = expenses.filter(e=>e.type==="personal").reduce((s,e)=>s+Number(e.amount),0);
  const receita = sales.reduce((s,v)=>s+Number(v.sale_price),0);
  const lucro   = receita - bTotal - pTotal;

  const container = $("goalsContent");
  if (!container) return;

  function ringCard(label, current, limit, isProfit = false) {
    if (!limit) return "";
    const pct = Math.min(100, Math.max(0, Math.round(current / limit * 100)));
    const size = 100, r = size / 2 - 10;
    const circ = 2 * Math.PI * r;
    const color = isProfit
      ? (current >= limit ? "#22c55e" : current >= limit * 0.5 ? "#f59e0b" : "#e8192c")
      : (pct < 70 ? "#22c55e" : pct < 90 ? "#f59e0b" : "#e8192c");
    return `<div class="goalRingCard">
      <div class="goalRingLabel">${label}</div>
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="8"/>
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="8"
          stroke-linecap="round" stroke-dasharray="0 ${circ.toFixed(1)}"
          transform="rotate(-90 ${size/2} ${size/2})"
          class="ring-arc" data-final="${((pct/100)*circ).toFixed(1)}" data-circ="${circ.toFixed(1)}"/>
        <text x="${size/2}" y="${size/2}" dominant-baseline="middle" text-anchor="middle"
          style="font-size:18px;font-weight:900;fill:var(--text);font-family:'Inter',sans-serif">${pct}%</text>
      </svg>
      <div class="goalRingVal" style="color:${color}">${BRL(current)}</div>
      <div class="goalRingSub">Meta: ${BRL(limit)}</div>
    </div>`;
  }

  function progressCard(label, current, limit, isProfit=false) {
    if (!limit) return "";
    const pct = Math.min(100, Math.round(current/limit*100));
    const cls = isProfit
      ? (current >= limit ? "ok" : current >= limit*0.5 ? "warn" : "danger")
      : (pct < 70 ? "ok" : pct < 90 ? "warn" : "danger");
    return `
      <div class="goalCard">
        <div class="goalLabel">
          <span>${label}</span>
          <span style="font-size:12px;color:var(--muted)">${pct}%</span>
        </div>
        <div class="progressBar"><div class="progressFill ${cls}" style="width:${pct}%"></div></div>
        <div class="goalNumbers">
          <span>${BRL(current)}</span>
          <span>Meta: ${BRL(limit)}</span>
        </div>
      </div>
    `;
  }

  if (!goal) {
    container.innerHTML = `
      <div class="emptyState">
        <div class="emptyIcon">🎯</div>
        <p>Nenhuma meta para ${MONTHS[m-1]} ${y}.</p>
        <br/>
        <button class="btn-primary" onclick="document.getElementById('btnEditGoal').click()">Definir Meta</button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between">
      <strong style="font-size:17px">${MONTHS[m-1]} ${y}</strong>
      <button class="btn-ghost btn-sm" onclick="document.getElementById('btnEditGoal').click()">Editar meta</button>
    </div>
    <div class="goalRingsGrid">
      ${ringCard("💰 Lucro", lucro, goal.profit_goal, true)}
      ${ringCard("🏪 Gastos Loja", bTotal, goal.business_expense_limit)}
      ${ringCard("👤 Gastos Pessoais", pTotal, goal.personal_expense_limit)}
    </div>
    ${progressCard("💰 Meta de Lucro Mensal", lucro, goal.profit_goal, true)}
    ${progressCard("🏪 Limite Gastos da Loja", bTotal, goal.business_expense_limit)}
    ${progressCard("👤 Limite Gastos Pessoais", pTotal, goal.personal_expense_limit)}
  `;

  setTimeout(() => {
    container.querySelectorAll(".ring-arc").forEach(arc => {
      const final = parseFloat(arc.dataset.final);
      const circ  = parseFloat(arc.dataset.circ);
      arc.style.transition = "stroke-dasharray .9s cubic-bezier(.4,0,.2,1)";
      arc.setAttribute("stroke-dasharray", `${final.toFixed(1)} ${(circ - final).toFixed(1)}`);
    });
  }, 60);
}

$("btnEditGoal")?.addEventListener("click", async () => {
  const m = overviewFilter.month, y = overviewFilter.year;
  const goal = await loadGoal(m, y);
  fillMonthSel($("goalMonth"), m); fillYearSel($("goalYear"), y);
  $("goalId").value = goal?.id || "";
  $("goalBusiness").value = goal?.business_expense_limit ? Number(goal.business_expense_limit).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
  $("goalPersonal").value = goal?.personal_expense_limit ? Number(goal.personal_expense_limit).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
  $("goalProfit").value   = goal?.profit_goal ? Number(goal.profit_goal).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
  hint($("goalMsg"), "");
  $("modalGoal").classList.add("open");
});

$("modalGoalClose")?.addEventListener("click", () => $("modalGoal").classList.remove("open"));

$("btnSaveGoal")?.addEventListener("click", async () => {
  const month = Number($("goalMonth").value);
  const year  = Number($("goalYear").value);
  const payload = {
    month, year,
    business_expense_limit: parseBRL($("goalBusiness").value) || null,
    personal_expense_limit: parseBRL($("goalPersonal").value) || null,
    profit_goal: parseBRL($("goalProfit").value) || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("financial_goals").upsert(payload, { onConflict: "month,year" });
  if (error) { hint($("goalMsg"), "Erro: " + error.message, "err"); return; }
  hint($("goalMsg"), "Meta salva ✅", "ok");
  await renderGoals();
  setTimeout(() => $("modalGoal").classList.remove("open"), 700);
});

// ── REPORTS ───────────────────────────────────────────
function printReport(title, subtitle, headers, rows) {
  const totalRow = rows.length > 0
    ? `<tr><td colspan="${headers.length}" style="text-align:right;font-weight:700;color:#666;font-size:11px;padding:8px 10px">${rows.length} registro(s)</td></tr>`
    : "";

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>${title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#111;padding:28px 32px;background:#fff}
    .rpt-header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #e81c1c;padding-bottom:12px;margin-bottom:18px}
    .rpt-title{font-size:20px;font-weight:900;color:#e81c1c}
    .rpt-subtitle{font-size:12px;color:#666;margin-top:3px}
    .rpt-meta{font-size:11px;color:#999;text-align:right}
    table{width:100%;border-collapse:collapse;margin-top:4px}
    thead tr{background:#e81c1c;color:#fff}
    thead th{padding:9px 10px;text-align:left;font-size:12px;font-weight:700;white-space:nowrap}
    tbody tr:nth-child(even){background:#f9f9f9}
    tbody tr:hover{background:#fff3f3}
    tbody td{padding:8px 10px;border-bottom:1px solid #eee;font-size:12px;vertical-align:middle}
    tfoot tr td{background:#f1f1f1;font-size:11px;color:#555}
    .rpt-footer{margin-top:20px;font-size:10px;color:#aaa;text-align:center;border-top:1px solid #eee;padding-top:8px}
    @media print{body{padding:14px 18px}.rpt-header{-webkit-print-color-adjust:exact;print-color-adjust:exact}thead tr{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>
  <div class="rpt-header">
    <div>
      <div class="rpt-title">Danilo Motos</div>
      <div class="rpt-subtitle">${title}${subtitle ? " — " + subtitle : ""}</div>
    </div>
    <div class="rpt-meta">Gerado em ${new Date().toLocaleDateString("pt-BR", {day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
  </div>
  <table>
    <thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c??""}</td>`).join("")}</tr>`).join("")}</tbody>
    <tfoot>${totalRow}</tfoot>
  </table>
  <div class="rpt-footer">Danilo Motos · Sistema de Gestão · danilomotos.com</div>
  <script>window.onload=()=>{window.print();}<\/script>
  </body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (w) { w.document.write(html); w.document.close(); }
}

function bindReports() {
  $("rptGastosMes")?.addEventListener("click", () => {
    const m = overviewFilter.month, y = overviewFilter.year;
    const exp = filterByPeriod(expensesCache, "expense_date", m, y);
    const total = exp.reduce((s,e)=>s+Number(e.amount),0);
    const rows = exp.map(e => {
      const moto = motosCache.find(x=>x.id===e.motorcycle_id);
      return [fmtDate(e.expense_date), e.type==="business"?"🏪 Loja":"👤 Pessoal", e.category||"—", e.description||"—", BRL(e.amount), e.payment_method||"—", moto?.titulo||"—", e.notes||""];
    });
    rows.push(["","","","<strong>TOTAL</strong>",`<strong style="color:#e81c1c">${BRL(total)}</strong>`,"","",""]);
    printReport("Relatório de Gastos", `${MONTHS[m-1]} ${y}`,
      ["Data","Tipo","Categoria","Descrição","Valor","Pagamento","Moto","Obs."], rows);
  });

  $("rptVendasMes")?.addEventListener("click", () => {
    const m = overviewFilter.month, y = overviewFilter.year;
    const sv = filterByPeriod(salesCache, "sale_date", m, y);
    const total = sv.reduce((s,v)=>s+Number(v.sale_price),0);
    const rows = sv.map(s => {
      const mt = motosCache.find(x=>x.id===s.motorcycle_id);
      return [fmtDate(s.sale_date), mt?.titulo||s.motorcycle_id||"—", BRL(s.sale_price), s.payment_method||"—", s.notes||""];
    });
    rows.push(["","<strong>TOTAL</strong>",`<strong style="color:#16a34a">${BRL(total)}</strong>`,"",""]);
    printReport("Relatório de Vendas", `${MONTHS[m-1]} ${y}`,
      ["Data","Moto","Valor","Pagamento","Observação"], rows);
  });

  $("rptLucroMes")?.addEventListener("click", () => {
    const m = overviewFilter.month, y = overviewFilter.year;
    const sv = filterByPeriod(salesCache, "sale_date", m, y);
    let totalLucro = 0;
    const rows = sv.map(s => {
      const mt  = motosCache.find(x=>x.id===s.motorcycle_id);
      const fin = motoFinCache.find(f=>f.motorcycle_id===s.motorcycle_id);
      const costs = motoCostsCache.filter(c=>c.motorcycle_id===s.motorcycle_id).reduce((t,c)=>t+Number(c.amount),0);
      const purch = fin?.purchase_price ? Number(fin.purchase_price) : 0;
      const lucro = Number(s.sale_price) - purch - costs;
      totalLucro += lucro;
      const color = lucro >= 0 ? "#16a34a" : "#e81c1c";
      return [mt?.titulo||s.motorcycle_id||"—", BRL(s.sale_price), BRL(purch), BRL(costs), `<span style="color:${color};font-weight:700">${BRL(lucro)}</span>`];
    });
    rows.push(["","","","<strong>LUCRO TOTAL</strong>",`<strong style="color:${totalLucro>=0?"#16a34a":"#e81c1c"}">${BRL(totalLucro)}</strong>`]);
    printReport("Lucro por Moto", `${MONTHS[m-1]} ${y}`,
      ["Moto","Venda","Compra","Custos extras","Lucro líquido"], rows);
  });

  $("rptCategorias")?.addEventListener("click", () => {
    const m = overviewFilter.month, y = overviewFilter.year;
    const exp = filterByPeriod(expensesCache, "expense_date", m, y);
    const map = {};
    exp.forEach(e => { const k = (e.category||"Outros")+" ("+(e.type==="business"?"Loja":"Pessoal")+")"; map[k]=(map[k]||0)+Number(e.amount); });
    const total = Object.values(map).reduce((s,v)=>s+v,0);
    const rows = Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k, BRL(v), `${((v/total)*100).toFixed(1)}%`]);
    rows.push(["<strong>TOTAL</strong>", `<strong>${BRL(total)}</strong>`, "<strong>100%</strong>"]);
    printReport("Gastos por Categoria", `${MONTHS[m-1]} ${y}`,
      ["Categoria","Total","% do total"], rows);
  });

  $("rptMotos")?.addEventListener("click", () => {
    let totalLucro = 0;
    const rows = motosCache.map(moto => {
      const fin   = motoFinCache.find(f=>f.motorcycle_id===moto.id);
      const costs = motoCostsCache.filter(c=>c.motorcycle_id===moto.id).reduce((t,c)=>t+Number(c.amount),0);
      const purch = fin?.purchase_price ? Number(fin.purchase_price) : 0;
      const sale  = fin?.sale_price ? Number(fin.sale_price) : 0;
      const lucro = sale - purch - costs;
      if (sale) totalLucro += lucro;
      const statusLabel = {ativo:"Disponível",reservada:"Reservada",vendida:"Vendida"}[moto.status]||moto.status;
      const color = lucro >= 0 ? "#16a34a" : "#e81c1c";
      return [moto.titulo||moto.id, statusLabel, BRL(purch), BRL(costs), sale ? BRL(sale) : "—", sale ? `<span style="color:${color};font-weight:700">${BRL(lucro)}</span>` : "—"];
    });
    rows.push(["","","","","<strong>LUCRO TOTAL VENDIDAS</strong>",`<strong style="color:${totalLucro>=0?"#16a34a":"#e81c1c"}">${BRL(totalLucro)}</strong>`]);
    printReport("Financeiro por Moto", "Todas as motos",
      ["Moto","Status","Compra","Custos","Venda","Lucro"], rows);
  });

  $("rptEstoque")?.addEventListener("click", () => {
    const disponiveis = motosCache.filter(m => m.status === "ativo" || m.status === "reservada");
    const totalValor = disponiveis.reduce((s,m) => {
      const fin = motoFinCache.find(f=>f.motorcycle_id===m.id);
      return s + (fin?.purchase_price ? Number(fin.purchase_price) : Number(m.preco||0));
    }, 0);
    const rows = disponiveis.map(m => {
      const fin   = motoFinCache.find(f=>f.motorcycle_id===m.id);
      const costs = motoCostsCache.filter(c=>c.motorcycle_id===m.id).reduce((t,c)=>t+Number(c.amount),0);
      const purch = fin?.purchase_price ? Number(fin.purchase_price) : Number(m.preco||0);
      const sale  = fin?.sale_price ? Number(fin.sale_price) : Number(m.preco||0);
      const dias  = diasNoEstoque(m);
      return [m.titulo||m.id, m.status==="ativo"?"Disponível":"Reservada", BRL(purch), BRL(sale), BRL(costs), dias !== null ? `${dias}d` : "—"];
    });
    rows.push(["","<strong>TOTAL ESTOQUE</strong>",`<strong>${BRL(totalValor)}</strong>`,"","",""]);
    printReport("Estoque Atual", `${disponiveis.length} moto(s) em estoque`,
      ["Moto","Status","Preço compra","Preço venda","Custos extras","Dias em estoque"], rows);
  });

  $("rptImprimir")?.addEventListener("click", () => window.print());
}

// ── FILL SELECTS ──────────────────────────────────────
function fillMotoSelects() {
  const expM = $("expMoto");
  if (expM) expM.innerHTML = `<option value="">Nenhuma</option>` + motosCache.map(m => `<option value="${escHTML(m.id)}">${escHTML(m.titulo||m.id)}</option>`).join("");

  const mfM = $("mfMoto");
  if (mfM) mfM.innerHTML = motosCache.map(m => `<option value="${escHTML(m.id)}">${escHTML(m.titulo||m.id)} [${escHTML(m.status)}]</option>`).join("");

  const slM = $("slMoto");
  if (slM) {
    const activeFilter = document.querySelector("[data-sl-filter].active");
    const slFilter = activeFilter?.dataset.slFilter || "ativo";
    const order = { ativo: 0, reservada: 1, vendida: 2 };
    const filtered = slFilter === "todas"
      ? [...motosCache].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3))
      : motosCache.filter(m => m.status === slFilter);
    slM.innerHTML = `<option value="">— Sem vínculo —</option>` + filtered.map(m => `<option value="${escHTML(m.id)}">${escHTML(m.titulo||m.id)} [${escHTML(m.status)}]</option>`).join("");
  }
}

// ── FILTERS ───────────────────────────────────────────
function bindFilters() {
  const om = $("filterMonth"), oy = $("filterYear");
  if (om && oy) {
    fillMonthSel(om, overviewFilter.month);
    fillYearSel(oy, overviewFilter.year);
    om.onchange = () => { overviewFilter.month = Number(om.value); renderOverview(); renderGoals(); };
    oy.onchange = () => { overviewFilter.year = Number(oy.value); renderOverview(); renderGoals(); };
  }

  const em = $("filterExpMonth"), ey = $("filterExpYear"), es = $("searchExpense");
  if (em && ey) {
    fillMonthSel(em, expFilter.month); fillYearSel(ey, expFilter.year);
    em.onchange = () => { expFilter.month = Number(em.value); expPage = 1; renderExpenseList(); };
    ey.onchange = () => { expFilter.year  = Number(ey.value); expPage = 1; renderExpenseList(); };
  }
  if (es) es.oninput = () => { expFilter.search = es.value; expPage = 1; renderExpenseList(); };

  document.querySelectorAll("[data-exp-type]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-exp-type]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      expFilter.type = btn.dataset.expType;
      expPage = 1;
      renderExpenseList();
    });
  });

  const sm = $("filterSaleMonth"), sy = $("filterSaleYear");
  if (sm && sy) {
    fillMonthSel(sm, saleFilter.month); fillYearSel(sy, saleFilter.year);
    sm.onchange = () => { saleFilter.month = Number(sm.value); renderSalesList(); };
    sy.onchange = () => { saleFilter.year  = Number(sy.value); renderSalesList(); };
  }

  const mfs = $("searchMotoFin");
  if (mfs) mfs.oninput = () => renderMotoFinList();

  document.querySelectorAll("[data-sl-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-sl-filter]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      fillMotoSelects();
    });
  });
}

window.slFilterChange = function(btn) {
  document.querySelectorAll("[data-sl-filter]").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  fillMotoSelects();
};

// ── FICHA COMPLETA ────────────────────────────────────
let fichaCurrentMotoId = null;

window.openFichaModal = function(motoId) {
  fichaCurrentMotoId = motoId;
  const moto = motosCache.find(m => m.id === motoId);
  $("modalFichaTitle").textContent = moto?.titulo || motoId;
  $("modalFichaSubtitle").textContent = `Status: ${moto?.status === "ativo" ? "Disponível" : moto?.status || "—"}`;

  // Reset para aba Informações
  switchFichaTab("info");
  loadFichaInfo(motoId);
  loadFichaDocs(motoId);
  loadFichaBuyer(motoId);

  $("modalFicha").classList.add("open");
};

function switchFichaTab(tab) {
  document.querySelectorAll("[data-ficha-tab]").forEach(b => b.classList.remove("active"));
  document.querySelector(`[data-ficha-tab="${tab}"]`)?.classList.add("active");
  ["info","docs","buyer"].forEach(t => {
    const el = $(`fichaTab${t.charAt(0).toUpperCase()+t.slice(1)}`);
    if (el) el.style.display = t === tab ? "" : "none";
  });
}

document.querySelectorAll("[data-ficha-tab]").forEach(btn => {
  btn.addEventListener("click", () => switchFichaTab(btn.dataset.fichaTab));
});

$("modalFichaClose")?.addEventListener("click", () => $("modalFicha").classList.remove("open"));

// ── Aba Informações ──
function loadFichaInfo(motoId) {
  const info = motoInfoCache.find(i => i.motorcycle_id === motoId);
  $("fiInfoId").value        = info?.id || "";
  $("fiMotoId").value        = motoId;
  $("fiPlaca").value         = info?.plate || "";
  $("fiChassi").value        = info?.chassis_number || "";
  $("fiWhere").value         = info?.where_purchased || "";
  $("fiPurchaseNotes").value = info?.purchase_notes || "";
  $("fiOwnerName").value     = info?.previous_owner_name || "";
  $("fiOwnerPhone").value    = info?.previous_owner_phone || "";
  $("fiOwnerAddress").value  = info?.previous_owner_address || "";
  $("fiOwnerNotes").value    = info?.previous_owner_notes || "";
  $("fiGeneralNotes").value  = info?.general_notes || "";
  hint($("fiInfoMsg"), "");
}

$("btnSaveFiInfo")?.addEventListener("click", async () => {
  const id     = $("fiInfoId").value;
  const motoId = $("fiMotoId").value;
  const payload = {
    motorcycle_id:         motoId,
    plate:                 $("fiPlaca").value.trim() || null,
    chassis_number:        $("fiChassi").value.trim() || null,
    where_purchased:       $("fiWhere").value.trim() || null,
    purchase_notes:        $("fiPurchaseNotes").value.trim() || null,
    previous_owner_name:   $("fiOwnerName").value.trim() || null,
    previous_owner_phone:  $("fiOwnerPhone").value.trim() || null,
    previous_owner_address: $("fiOwnerAddress").value.trim() || null,
    previous_owner_notes:  $("fiOwnerNotes").value.trim() || null,
    general_notes:         $("fiGeneralNotes").value.trim() || null,
    updated_at:            new Date().toISOString(),
  };
  hint($("fiInfoMsg"), "Salvando…");
  const { error } = await supabase.from("motorcycle_info").upsert(payload, { onConflict: "motorcycle_id" });
  if (error) { hint($("fiInfoMsg"), "Erro: " + error.message, "err"); return; }
  hint($("fiInfoMsg"), "Salvo ✅", "ok");
  toast("Informações salvas!", "ok");
  await loadMotoInfo();
  loadFichaInfo(motoId);
});

// ── Aba Documentos ──
function loadFichaDocs(motoId) {
  resetDocForm();
  renderDocList(motoId);
}

function renderDocList(motoId) {
  const docs = motoDocsCache.filter(d => d.motorcycle_id === motoId);
  const container = $("docList");
  if (!container) return;

  if (!docs.length) {
    container.innerHTML = `<div style="text-align:center;padding:16px;color:var(--muted);font-size:13px;font-weight:700">Nenhum documento cadastrado ainda.</div>`;
    return;
  }

  const statusLabel = { em_dia: "✅ Em dia", atrasado: "⚠️ Atrasado", pendente: "⏳ Pendente" };
  const statusColor = { em_dia: "var(--green)", atrasado: "var(--red2)", pendente: "var(--orange)" };

  container.innerHTML = docs.map(d => {
    const fileLink = d.file_url
      ? d.file_url.toLowerCase().includes(".pdf")
        ? `<a href="${d.file_url}" target="_blank" style="font-size:12px;font-weight:700;color:var(--blue);text-decoration:underline">📄 Ver PDF</a>`
        : `<img src="${d.file_url}" class="receiptThumb" onclick="openLightbox('${d.file_url}')" style="width:40px;height:40px"/>`
      : "";
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--panel3);border:1px solid var(--line);border-radius:10px;margin-bottom:7px">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:900">${d.doc_type || "—"}</div>
          <div style="font-size:11px;color:${statusColor[d.status] || "var(--muted)"};font-weight:800">${statusLabel[d.status] || d.status}${d.delay_days > 0 ? ` · ${d.delay_days} dia(s) de atraso` : ""}</div>
          ${d.location ? `<div style="font-size:11px;color:var(--muted)">📍 ${d.location}</div>` : ""}
          ${d.expiry_date ? `<div style="font-size:11px;color:var(--muted)">Vence: ${fmtDate(d.expiry_date)}</div>` : ""}
          ${d.notes ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">${escHTML(d.notes)}</div>` : ""}
        </div>
        ${fileLink}
        <button class="btn-ghost btn-sm" onclick="editDoc(${d.id})" style="font-size:11px;white-space:nowrap">✏️</button>
      </div>
    `;
  }).join("");
}

function resetDocForm() {
  $("docId").value = "";
  $("docMotoId").value = fichaCurrentMotoId || "";
  $("docType").value = "";
  $("docStatus").value = "pendente";
  $("docLocation").value = "";
  $("docExpiry").value = "";
  $("docDelay").value = "";
  $("docNotes").value = "";
  $("docFileUrl").value = "";
  $("docFile").value = "";
  const wrap = $("docFilePreviewWrap");
  if (wrap) wrap.style.display = "none";
  $("btnDeleteDoc").style.display = "none";
  $("btnCancelDocEdit").style.display = "none";
  $("docFormTitle").textContent = "Adicionar Documento";
  hint($("docMsg"), "");
}

window.editDoc = function(docId) {
  const d = motoDocsCache.find(x => x.id === docId);
  if (!d) return;
  $("docId").value       = d.id;
  $("docMotoId").value   = d.motorcycle_id;
  $("docType").value     = d.doc_type || "";
  $("docStatus").value   = d.status || "pendente";
  $("docLocation").value = d.location || "";
  $("docExpiry").value   = d.expiry_date || "";
  $("docDelay").value    = d.delay_days || "";
  $("docNotes").value    = d.notes || "";
  $("docFileUrl").value  = d.file_url || "";
  $("docFormTitle").textContent = "Editar Documento";
  $("btnDeleteDoc").style.display = "";
  $("btnCancelDocEdit").style.display = "";

  const wrap = $("docFilePreviewWrap");
  const imgPrev = $("docFileImgPreview");
  const pdfPrev = $("docFilePdfPreview");
  if (d.file_url) {
    wrap.style.display = "";
    if (d.file_url.toLowerCase().includes(".pdf")) {
      imgPrev.style.display = "none"; pdfPrev.style.display = "";
    } else {
      pdfPrev.style.display = "none"; imgPrev.src = d.file_url; imgPrev.style.display = "";
    }
  } else {
    wrap.style.display = "none";
  }
  hint($("docMsg"), "");
  $("fichaTabDocs").scrollIntoView({ behavior: "smooth" });
};

$("docFile")?.addEventListener("change", function() {
  const file = this.files?.[0];
  if (!file) return;
  const wrap = $("docFilePreviewWrap");
  const imgPrev = $("docFileImgPreview");
  const pdfPrev = $("docFilePdfPreview");
  wrap.style.display = "";
  if (file.type === "application/pdf") {
    imgPrev.style.display = "none"; pdfPrev.style.display = "";
  } else {
    pdfPrev.style.display = "none";
    imgPrev.src = URL.createObjectURL(file); imgPrev.style.display = "";
  }
});

$("btnSaveDoc")?.addEventListener("click", async () => {
  const id     = $("docId").value;
  const motoId = $("docMotoId").value || fichaCurrentMotoId;
  if (!$("docType").value) { hint($("docMsg"), "Escolha o tipo de documento.", "err"); return; }

  hint($("docMsg"), "Salvando…");

  let file_url = $("docFileUrl").value;
  const file = $("docFile").files?.[0];
  if (file) {
    try { file_url = await uploadDoc(file, `docs/${motoId}`); }
    catch (err) { hint($("docMsg"), "Erro no upload: " + err.message, "err"); return; }
  }

  const payload = {
    motorcycle_id: motoId,
    doc_type:    $("docType").value,
    status:      $("docStatus").value,
    location:    $("docLocation").value.trim() || null,
    expiry_date: $("docExpiry").value || null,
    delay_days:  Number($("docDelay").value) || 0,
    file_url:    file_url || null,
    notes:       $("docNotes").value.trim() || null,
    updated_at:  new Date().toISOString(),
  };

  let err;
  if (id) {
    ({ error: err } = await supabase.from("motorcycle_documents").update(payload).eq("id", id));
  } else {
    ({ error: err } = await supabase.from("motorcycle_documents").insert(payload));
  }
  if (err) { hint($("docMsg"), "Erro: " + err.message, "err"); toast("Erro ao salvar documento.", "err"); return; }
  hint($("docMsg"), "Salvo ✅", "ok");
  toast("Documento salvo!", "ok");
  await loadMotoDocs();
  renderDocList(motoId);
  setTimeout(resetDocForm, 700);
});

$("btnDeleteDoc")?.addEventListener("click", async () => {
  const id = $("docId").value;
  if (!id || !confirm("Excluir este documento?")) return;
  await supabase.from("motorcycle_documents").delete().eq("id", id);
  await loadMotoDocs();
  renderDocList(fichaCurrentMotoId);
  resetDocForm();
});

$("btnCancelDocEdit")?.addEventListener("click", resetDocForm);

// ── Aba Comprador ──
function loadFichaBuyer(motoId) {
  const b = motoBuyerCache.find(x => x.motorcycle_id === motoId);
  $("buId").value      = b?.id || "";
  $("buMotoId").value  = motoId;
  $("buName").value    = b?.buyer_name || "";
  $("buCpf").value     = b?.buyer_cpf || "";
  $("buPhone").value   = b?.buyer_phone || "";
  $("buDate").value    = b?.sale_date || "";
  $("buAddress").value = b?.buyer_address || "";
  $("buNotes").value   = b?.notes || "";
  hint($("buMsg"), "");
}

$("btnSaveBuyer")?.addEventListener("click", async () => {
  const motoId = $("buMotoId").value;
  const payload = {
    motorcycle_id: motoId,
    buyer_name:    $("buName").value.trim() || null,
    buyer_cpf:     $("buCpf").value.trim() || null,
    buyer_phone:   $("buPhone").value.trim() || null,
    buyer_address: $("buAddress").value.trim() || null,
    sale_date:     $("buDate").value || null,
    notes:         $("buNotes").value.trim() || null,
    updated_at:    new Date().toISOString(),
  };
  hint($("buMsg"), "Salvando…");
  const { error } = await supabase.from("motorcycle_buyer").upsert(payload, { onConflict: "motorcycle_id" });
  if (error) { hint($("buMsg"), "Erro: " + error.message, "err"); return; }
  hint($("buMsg"), "Salvo ✅", "ok");
  await loadMotoBuyer();
});

// ── GASTOS FIXOS RECORRENTES ─────────────────────────
async function loadFixedExpenses() {
  const { data, error } = await supabase.from("fixed_expenses").select("*").order("category").order("description");
  if (!error) fixedExpensesCache = data || [];
}

function renderFixedExpenses() {
  const list = $("fixedList");
  const summary = $("fixedSummary");
  if (!list) return;

  const active = fixedExpensesCache.filter(f => f.active);
  const totalActive = active.reduce((s, f) => s + Number(f.amount), 0);
  const totalBusiness = active.filter(f => f.type === "business").reduce((s, f) => s + Number(f.amount), 0);
  const totalPersonal = active.filter(f => f.type === "personal").reduce((s, f) => s + Number(f.amount), 0);

  if (summary) {
    summary.innerHTML = `
      <div class="fixedSumCard">
        <div class="fsl">Total mensal</div>
        <div class="fsv">${BRL(totalActive)}</div>
      </div>
      <div class="fixedSumCard">
        <div class="fsl">🏪 Loja</div>
        <div class="fsv" style="color:var(--red2)">${BRL(totalBusiness)}</div>
      </div>
      <div class="fixedSumCard">
        <div class="fsl">👤 Pessoal</div>
        <div class="fsv" style="color:var(--purple)">${BRL(totalPersonal)}</div>
      </div>
      <div class="fixedSumCard">
        <div class="fsl">Ativos</div>
        <div class="fsv" style="color:var(--green)">${active.length} de ${fixedExpensesCache.length}</div>
      </div>`;
  }

  if (!fixedExpensesCache.length) {
    list.innerHTML = `<div style="text-align:center;padding:48px 0;color:var(--muted)">
      <div style="font-size:40px;margin-bottom:12px">📋</div>
      <div style="font-weight:700;margin-bottom:6px">Nenhum gasto fixo cadastrado</div>
      <div style="font-size:13px">Adicione seus gastos mensais recorrentes.</div>
    </div>`;
    return;
  }

  const catIcons = { "Aluguel": "🏠", "Energia elétrica": "⚡", "Água": "💧", "Internet": "🌐",
    "Funcionários": "👷", "Telefone": "📱", "Contabilidade": "📊", "Seguro": "🛡️",
    "Manutenção": "🔧", "Material de escritório": "✏️" };

  list.innerHTML = fixedExpensesCache.map(f => {
    const icon = catIcons[f.category] || (f.type === "business" ? "🏪" : "👤");
    const bgColor = f.type === "business" ? "rgba(232,28,28,.1)" : "rgba(139,92,246,.1)";
    const amtColor = f.active ? (f.type === "business" ? "var(--red2)" : "var(--purple)") : "var(--muted)";
    return `<div class="fixedItem ${f.active ? "" : "inactive"}" data-id="${f.id}">
      <div class="fixedIcon" style="background:${bgColor}">${icon}</div>
      <div class="fixedBody">
        <div class="fixedName">${f.description}</div>
        <div class="fixedMeta">${f.category} · ${f.type === "business" ? "Loja" : "Pessoal"}${f.payment_method ? " · " + f.payment_method : ""}</div>
      </div>
      <div class="fixedAmt" style="color:${amtColor}">${BRL(Number(f.amount))}</div>
      <div class="fixedActions">
        <button class="fixedToggle ${f.active ? "on" : "off"}" data-toggle="${f.id}" type="button">${f.active ? "Ativo" : "Pausado"}</button>
        <button class="fixedEditBtn" data-edit="${f.id}" type="button">Editar</button>
      </div>
    </div>`;
  }).join("");

  list.querySelectorAll("[data-toggle]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.toggle);
      const item = fixedExpensesCache.find(f => f.id === id);
      if (!item) return;
      const { error } = await supabase.from("fixed_expenses").update({ active: !item.active }).eq("id", id);
      if (error) { toast("Erro ao atualizar.", "err"); return; }
      await loadFixedExpenses();
      renderFixedExpenses();
    });
  });

  list.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.edit);
      openFixedModal(id);
    });
  });
}

function openFixedModal(id = null) {
  const item = id ? fixedExpensesCache.find(f => f.id === id) : null;
  $("modalFixedTitle").textContent = item ? "Editar Gasto Fixo" : "Novo Gasto Fixo";
  $("fxId").value       = item?.id || "";
  $("fxDesc").value     = item?.description || "";
  $("fxCategory").value = item?.category || "";
  $("fxType").value     = item?.type || "business";
  $("fxPayment").value  = item?.payment_method || "";
  $("fxAmount").value   = item ? Number(item.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
  $("btnDeleteFixed").style.display = item ? "" : "none";
  hint($("fxMsg"), "");
  $("modalFixed").classList.add("open");
  $("fxDesc").focus();
}

$("btnNovoFixed")?.addEventListener("click", () => openFixedModal());
$("modalFixedClose")?.addEventListener("click", () => $("modalFixed").classList.remove("open"));
$("modalFixed")?.addEventListener("click", e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove("open"); });

$("btnSaveFixed")?.addEventListener("click", async () => {
  const desc   = $("fxDesc").value.trim();
  const cat    = $("fxCategory").value.trim();
  const amount = parseBRL($("fxAmount").value);
  if (!desc || !cat || !amount) { hint($("fxMsg"), "Preencha descrição, categoria e valor.", "err"); return; }
  const id = $("fxId").value;
  const payload = {
    description:    desc,
    category:       cat,
    type:           $("fxType").value,
    amount:         amount,
    payment_method: $("fxPayment").value || null,
    updated_at:     new Date().toISOString(),
  };
  hint($("fxMsg"), "Salvando…");
  let err;
  if (id) {
    ({ error: err } = await supabase.from("fixed_expenses").update(payload).eq("id", id));
  } else {
    payload.active = true;
    ({ error: err } = await supabase.from("fixed_expenses").insert(payload));
  }
  if (err) { hint($("fxMsg"), "Erro: " + err.message, "err"); return; }
  toast("Gasto fixo salvo!", "ok");
  $("modalFixed").classList.remove("open");
  await loadFixedExpenses();
  renderFixedExpenses();
});

$("btnDeleteFixed")?.addEventListener("click", async () => {
  const id = $("fxId").value;
  if (!id || !confirm("Excluir este gasto fixo?")) return;
  const { error } = await supabase.from("fixed_expenses").delete().eq("id", id);
  if (error) { toast("Erro ao excluir.", "err"); return; }
  toast("Excluído.", "ok");
  $("modalFixed").classList.remove("open");
  await loadFixedExpenses();
  renderFixedExpenses();
});

$("btnApplyFixed")?.addEventListener("click", async () => {
  const active = fixedExpensesCache.filter(f => f.active);
  if (!active.length) { toast("Nenhum gasto fixo ativo para aplicar.", "warn"); return; }
  const now = new Date();
  const mm = now.getMonth() + 1, yy = now.getFullYear();
  const dateStr = `${yy}-${String(mm).padStart(2, "0")}-01`;

  // Verifica se já foi aplicado neste mês (evita duplicata)
  const jaAplicado = expensesCache.some(e =>
    e.notes === "Aplicado automaticamente (gasto fixo)" &&
    e.expense_date && e.expense_date.startsWith(`${yy}-${String(mm).padStart(2, "0")}`)
  );
  if (jaAplicado) {
    if (!confirm(`Os gastos fixos já foram aplicados em ${MONTHS[mm-1]} ${yy}. Aplicar novamente?`)) return;
  }

  const rows = active.map(f => ({
    type:           f.type,
    category:       f.category,
    description:    f.description,
    amount:         f.amount,
    payment_method: f.payment_method,
    expense_date:   dateStr,
    notes:          "Aplicado automaticamente (gasto fixo)",
  }));
  const { error } = await supabase.from("financial_expenses").insert(rows);
  if (error) { toast("Erro ao aplicar gastos: " + error.message, "err"); return; }
  toast(`✅ ${rows.length} gasto(s) fixo(s) aplicado(s) em ${MONTHS[mm-1]}!`, "ok", 4000);
  await loadExpenses();
  renderExpenseList();
  await renderOverview();
});

// ── AUTH ──────────────────────────────────────────────
async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await showApp();

  $("btnLogin")?.addEventListener("click", async () => {
    const email = $("dEmail")?.value.trim();
    const pass  = $("dSenha")?.value;
    if (!email || !pass) { hint($("loginMsg"), "Preencha e-mail e senha.", "err"); return; }
    hint($("loginMsg"), "Entrando…");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) { hint($("loginMsg"), "Credenciais inválidas.", "err"); return; }
    await showApp();
  });

  $("btnLogout")?.addEventListener("click", async () => {
    await supabase.auth.signOut({ scope: 'local' });
    location.reload();
  });

  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") location.reload();
  });
}

function applyRoleUI() {
  document.body.dataset.role = currentRole;
  if (currentRole !== "admin") {
    document.querySelectorAll("[data-admin-only]").forEach(el => { el.style.display = "none"; });
    if (typeof window.goScreen === "function") window.goScreen("screenEstoque");
  }
}

async function showApp() {
  $("loginSection").style.display = "none";
  $("appWrapper").classList.add("visible");

  showLoadBar();
  showSkeleton();

  try {
    await Promise.all([
      loadMotos(), loadExpenses(), loadSales(),
      loadMotoFin(), loadMotoCosts(),
      loadMotoInfo(), loadMotoDocs(), loadMotoBuyer(),
      loadFixedExpenses()
    ]);
  } catch (e) {
    console.warn("Erro ao carregar dados:", e);
  }

  hideSkeleton();
  hideLoadBar();

  const { data: { user: _authUser } } = await supabase.auth.getUser();
  currentRole = _authUser?.email === "donodanilo100@gmail.com" ? "admin" : "funcionario";
  applyRoleUI();

  fillMotoSelects();
  bindFilters();
  bindEstoqueFilters();
  bindReports();

  [$("expAmount"), $("mfPurchase"), $("mfSale"), $("slAmount"), $("slPurchase"),
   $("goalBusiness"), $("goalPersonal"), $("goalProfit"), $("mcAmount"), $("fxAmount")]
    .forEach(inp => { if (inp) maskMoney(inp); });

  await renderOverview();
  renderExpenseList();
  renderSalesList();
  renderMotoFinList();
  renderEstoque();
  await renderGoals();
  renderFixedExpenses();
  initPullToRefresh();
}

init();
