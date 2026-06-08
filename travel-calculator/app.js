// Kalkulator pakowania — statyczna aplikacja (GitHub Pages).
// Źródło danych: data.json (generowane z YAML przez `python generate.py app`).
"use strict";

let DATA = null;
const STATE = {
  tripId: "",            // "" = filtrowanie ręczne
  pasmo: "do_3000",
  temp: "dodatnie",      // najzimniejszy próg: dodatnie|chlodno|mroz|silny_mroz
  lod: "dowolnie",       // dowolnie | tak | nie
  tags: new Set(),
  q: "",                 // szukajka
  qty: {},               // nadpisania ilości: nazwa -> liczba
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s).replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (g) => !g ? "—" : (g >= 1000 ? (g / 1000).toFixed(2) + " kg" : g + " g");
const rank = (p) => (DATA.pasmo_rank[p] != null ? DATA.pasmo_rank[p] : 0);

// ---------- stan w URL (zapamiętywanie po refresh / udostępnianie linku) ----------
function writeUrl() {
  const p = new URLSearchParams();
  if (STATE.tripId) p.set("trip", STATE.tripId);
  if (STATE.pasmo) p.set("pasmo", STATE.pasmo);
  if (STATE.temp) p.set("temp", STATE.temp);
  if (STATE.lod && STATE.lod !== "dowolnie") p.set("lod", STATE.lod);
  if (STATE.tags.size) p.set("tags", [...STATE.tags].join(","));
  if (STATE.q) p.set("q", STATE.q);
  const qs = p.toString();
  history.replaceState(null, "", qs ? "?" + qs : location.pathname);
}
function readUrl() {
  const p = new URLSearchParams(location.search);
  if (![...p.keys()].length) return false;
  if (p.has("trip")) STATE.tripId = p.get("trip");
  if (p.has("pasmo")) STATE.pasmo = p.get("pasmo");
  if (p.has("temp")) STATE.temp = p.get("temp");
  STATE.lod = p.get("lod") || "dowolnie";
  if (p.has("tags")) STATE.tags = new Set(p.get("tags").split(",").filter(Boolean));
  if (p.has("q")) STATE.q = p.get("q");
  return true;
}

// ---------- inicjalizacja ----------
fetch("data.json", { cache: "no-cache" }).then(r => r.json()).then(d => { DATA = d; init(); })
  .catch(e => { $("#app").innerHTML = "<p class=empty>Nie udało się wczytać data.json (" + e + ")</p>"; });

function init() {
  $("#meta").textContent =
    `baza: ${DATA.items.length} rzeczy · ${DATA.wyjazdy.length} wyjazdów · wersja ${DATA.commit || DATA.generated}`;

  // presety wyjazdów
  const trip = $("#trip");
  trip.innerHTML = "<option value=''>— filtruj ręcznie —</option>" +
    DATA.wyjazdy.map(w => `<option value="${esc(w.id)}">${esc(w.nazwa)}</option>`).join("");

  // pasma (wg rangi rosnąco), pomijając alias
  const pas = Object.keys(DATA.pasmo_rank)
    .filter(k => k !== "powyzej_5000")
    .sort((a, b) => DATA.pasmo_rank[a] - DATA.pasmo_rank[b]);
  $("#pasmo").innerHTML = pas.map(p =>
    `<option value="${p}">${p}</option>`).join("");
  $("#pasmo").value = STATE.pasmo;

  // zakres temperatur (wg rangi rosnąco — od ciepła do silnego mrozu)
  const tlab = DATA.temperatury || {};
  const temps = Object.keys(DATA.temp_rank || {})
    .sort((a, b) => DATA.temp_rank[a] - DATA.temp_rank[b]);
  $("#temp").innerHTML = temps.map(t =>
    `<option value="${t}" title="${esc(tlab[t] || "")}">${t.replace("_", " ")}</option>`).join("");
  $("#temp").value = STATE.temp;

  // chipy: wszystkie tagi (aktywności + kontekst) — do filtrowania i porządkowania danych
  const tg = Object.assign({}, DATA.tagi_aktywnosci, DATA.tagi_kontekst || {});
  $("#tags").innerHTML = Object.keys(tg).map(t =>
    `<span class=chip data-tag="${t}" title="${esc(tg[t])}">${t}</span>`).join("");

  // zdarzenia
  trip.onchange = () => applyTrip(trip.value);
  $("#pasmo").onchange = e => { STATE.pasmo = e.target.value; render(); };
  $("#temp").onchange = e => { STATE.temp = e.target.value; render(); };
  $("#lod").onchange = e => { STATE.lod = e.target.value; render(); };
  let searchT;
  $("#search").oninput = e => {
    STATE.q = e.target.value.trim();
    clearTimeout(searchT); searchT = setTimeout(render, 120);
  };
  $("#tags").onclick = e => {
    const c = e.target.closest(".chip"); if (!c) return;
    const t = c.dataset.tag;
    STATE.tags.has(t) ? STATE.tags.delete(t) : STATE.tags.add(t);
    render();
  };
  // zwijanie panelu filtrów: przycisk + auto przy scrollu
  const body = $("#ctlbody"), ftog = $("#filtToggle");
  const setFilters = (open) => {
    body.classList.toggle("collapsed", !open);
    ftog.textContent = open ? "▴" : "▾";
    ftog.setAttribute("aria-expanded", open);
  };
  ftog.onclick = () => setFilters(body.classList.contains("collapsed"));
  setFilters(false);            // domyślnie filtry zwinięte
  $("#catnav").onclick = (e) => {
    const a = e.target.closest(".catchip"); if (!a) return;
    e.preventDefault(); scrollToSec(a.dataset.sec);
  };
  let lastY = 0;
  window.addEventListener("scroll", () => {
    const y = window.scrollY || 0;
    if (y > lastY + 6 && y > 120) setFilters(false);   // scroll w dół → schowaj
    lastY = y;                                         // otwieranie WYŁĄCZNIE ręcznie (przycisk Filtry)
  }, { passive: true });

  // iOS: trzymaj dolny dok (suma + szukajka) NAD klawiaturą, nie za nią
  const vv = window.visualViewport;
  if (vv) {
    const dock = $("#dock");
    const liftDock = () => {
      const overlap = window.innerHeight - vv.height - vv.offsetTop;
      dock.style.transform = overlap > 1 ? `translateY(${-overlap}px)` : "";
    };
    vv.addEventListener("resize", liftDock);
    vv.addEventListener("scroll", liftDock);
    $("#search").addEventListener("focus", () => setTimeout(liftDock, 50));
    $("#search").addEventListener("blur", () => { dock.style.transform = ""; });
  }

  $("#printBtn").onclick = () => { buildChecklist(); window.print(); };
  $("#resetBtn").onclick = () => { STATE.qty = {}; save(); render(); };
  $("#exportBtn").onclick = exportYaml;
  $("#copyBtn").onclick = () => { $("#exportTxt").select(); document.execCommand("copy"); };
  $("#exportClose").onclick = () => $("#exportDlg").close();
  $("#app").addEventListener("click", onStep);

  // stan z URL (po refresh / z linku); inaczej domyślnie trekking
  if (!readUrl()) STATE.tags.add("trekking");
  STATE.qty = load();                 // ilości dla bieżącego wyjazdu (lsKey zależy od tripId)
  trip.value = STATE.tripId || "";
  $("#pasmo").value = STATE.pasmo;
  $("#temp").value = STATE.temp;
  $("#lod").value = STATE.lod;
  $("#search").value = STATE.q;
  syncChips();
  render();
}

// ---------- preset wyjazdu ----------
function currentTrip() { return DATA.wyjazdy.find(w => w.id === STATE.tripId) || null; }

function applyTrip(id) {
  STATE.tripId = id;
  const t = currentTrip();
  if (t) {
    STATE.tags = new Set(t.tagi);
    STATE.pasmo = t.pasmo || "do_3000";
    STATE.temp = t.temperatura || "dodatnie";
    STATE.lod = t.lod == null ? "dowolnie" : (t.lod ? "tak" : "nie");
  }
  STATE.qty = load();   // wczytaj zapamiętane ilości dla tego wyjazdu
  $("#pasmo").value = STATE.pasmo;
  $("#temp").value = STATE.temp;
  $("#lod").value = STATE.lod;
  syncChips();
  render();
}

function syncChips() {
  $$(".chip").forEach(c => c.classList.toggle("on", STATE.tags.has(c.dataset.tag)));
}

// ---------- localStorage ----------
const lsKey = () => "pak:" + (STATE.tripId || "custom");
function save() { try { localStorage.setItem(lsKey(), JSON.stringify(STATE.qty)); } catch (e) {} }
function load() { try { return JSON.parse(localStorage.getItem(lsKey())) || {}; } catch (e) { return {}; } }

// ---------- filtrowanie ----------
function matchTags(it) { return it.t.some(t => STATE.tags.has(t)); }
function inPasmo(it) { return rank(it.p) <= rank(STATE.pasmo); }
function trank(t) { return (DATA.temp_rank && DATA.temp_rank[t] != null) ? DATA.temp_rank[t] : 0; }
function tempOK(it) { return it.temp == null || trank(it.temp) <= trank(STATE.temp); }
function lodOK(it) { return !(STATE.lod === "nie" && it.lod); }
function dePL(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
}
function searchOK(it) {
  if (!STATE.q) return true;
  const q = dePL(STATE.q);
  return [it.n, it.k, it.pr, it.md].some(s => s && dePL(s).includes(q));
}

function defQty(it) {
  if (it._apt) return 1;
  if (it._excl || it.roz) return 0;       // odfiltrowane / do rozważenia (nie mam) → domyślnie 0
  const t = currentTrip();
  if (t && t.ilosc && (it.n in t.ilosc)) return t.ilosc[it.n];
  return it.q;
}
function qtyOf(it) { return (it.n in STATE.qty) ? STATE.qty[it.n] : defQty(it); }

function compute() {
  const t = currentTrip();
  // szukanie globalne: wpisany tekst ignoruje filtry (tag/pasmo/temp/lód)
  if (STATE.q) return DATA.items.filter(searchOK);
  const dodaj = new Set(t ? t.dodaj : []);
  const usun = new Set(t ? t.usun : []);
  const out = [];
  DATA.items.forEach(it => {
    const forced = dodaj.has(it.n);
    // „do rozważenia" (nie posiadam) — zawsze widoczne we własnej sekcji, ilość 0
    if (it.roz && !forced) { out.push(Object.assign({}, it, { _excl: true })); return; }
    // powód odfiltrowania (jeśli jest) — pozycja pokaże się ZAWSZE, ale z ilością 0
    const r = forced ? null
      : usun.has(it.n) ? "decyzja: nie bierzemy"
      : !matchTags(it) ? "inna aktywność"
      : rank(it.p) > rank(STATE.pasmo) ? "pasmo " + it.p
      : !tempOK(it) ? "cieplej niż " + STATE.temp.replace("_", " ")
      : (STATE.lod === "nie" && it.lod) ? "tylko na śniegu/lodzie" : null;
    out.push(r ? Object.assign({}, it, { _r: r, _excl: true }) : it);
  });
  if (t) {  // apteczki + kosmetyczki wyjazdu jako pojemniki-pozycje
    t.apteczki.forEach(code => {
      const a = DATA.apteczki[code];
      if (a) out.push({ n: a.n, k: "Bezpieczeństwo", f: "Bezpieczeństwo", p: "niskie", w: a.w, q: 1, t: [], _apt: true });
    });
    (t.kosmetyczki || []).forEach(code => {
      const k = (DATA.kosmetyczki || {})[code];
      if (k) out.push({ n: k.n, k: "Kosmetyki", f: "Higiena", p: "niskie", w: k.w, q: 1, t: [], _apt: true });
    });
  }
  return out;
}

const ROZ_FUN = "🤔 Do rozważenia";
function groupByFun(items) {
  const g = {};
  items.forEach(it => { const fn = it.roz ? ROZ_FUN : it.f; (g[fn] = g[fn] || []).push(it); });
  return DATA.fun_order.concat([ROZ_FUN]).filter(fn => g[fn])
    .map(fn => [fn, g[fn].sort((a, b) => a.n.localeCompare(b.n, "pl"))]);
}

// ---------- render ----------
function rowHtml(it) {
  const u = it.w || 0;
  const owned = it._apt ? 1 : (it.q || 1);          // limit = ile posiadasz
  const q = Math.min(qtyOf(it), owned);
  const ut = u ? String(u) : "—";
  const uw = it.u ? ` <span class=uwg title="${esc(it.u)}">ⓘ</span>` : "";
  const pw = it._r ? ` <span class=powod>(${esc(it._r)})</span>` : "";
  return `<tr class="row${q === 0 ? " off" : ""}" data-name="${esc(it.n)}" data-w="${u}" data-max="${owned}" data-def="${defQty(it)}"${it._apt ? " data-apt=1" : ""}${it._excl ? " data-excl=1" : ""}>
    <td>${esc(it.n)}${uw}${pw}</td>
    <td class=qtycell><button type=button class=minus>−</button><span class=qty><span class=qv>${q}</span><span class=qmax>/${owned}</span></span><button type=button class=plus>+</button></td>
    <td class=n>${ut}</td><td class="n rt">${fmt(u * q)}</td></tr>`;
}

const secId = (s) => "sec-" + dePL(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function renderCatnav(groups) {
  const nav = $("#catnav"); if (!nav) return;
  nav.innerHTML = groups.map(([fn]) =>
    `<a class=catchip href="#${secId(fn)}" data-sec="${secId(fn)}">${esc(fn)}</a>`).join("");
}
function scrollToSec(id) {
  const sec = document.getElementById(id); if (!sec) return;
  const off = ($("#controls").offsetHeight || 0) + 6;
  window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY - off, behavior: "smooth" });
}

function sectionsHtml(groups) {
  return groups.map(([fn, items]) =>
    `<section class="cat sec" id="${secId(fn)}"><h3><span>${esc(fn)}</span><span class=sub>—</span></h3>
     <table><tr><th>Rzecz</th><th class=q>Ilość</th><th class=n>g/szt</th><th class=n>Razem</th></tr>
     ${items.map(rowHtml).join("")}</table></section>`).join("");
}

function render() {
  syncChips();
  writeUrl();
  const t = currentTrip();
  $("#celinfo").innerHTML = STATE.q
    ? `<span class=powod>szukanie „${esc(STATE.q)}" — filtry pominięte</span>`
    : t
    ? `<b>${esc(t.nazwa)}</b> · cel: ${esc(t.cel || "—")} · ${esc(t.uwagi || "").slice(0, 160)}`
    : (STATE.tags.size ? "" : "Wybierz aktywność (chipy) lub preset wyjazdu.");

  const items = compute();
  const app = $("#app");
  if (!items.length) {
    renderCatnav([]);
    app.innerHTML = STATE.q
      ? `<p class=empty>Brak rzeczy pasujących do „${esc(STATE.q)}".</p>`
      : "<p class=empty>Brak rzeczy dla tych filtrów. Zaznacz aktywność lub poszerz pasmo.</p>";
    recompute(); return;
  }
  const groups = groupByFun(items);
  renderCatnav(groups);
  app.innerHTML = `<div class=cats id=main-sections>${sectionsHtml(groups)}</div>`;
  recompute();
}

function onStep(e) {
  const b = e.target;
  if (!b.classList.contains("plus") && !b.classList.contains("minus")) return;
  const row = b.closest(".row"), name = row.dataset.name;
  const max = +row.dataset.max || Infinity;
  let q = parseInt(row.querySelector(".qv").textContent, 10) || 0;
  q += b.classList.contains("plus") ? 1 : -1;
  if (q < 0) q = 0; if (q > max) q = max;     // nie więcej niż posiadasz
  row.querySelector(".qv").textContent = q;
  STATE.qty[name] = q; save(); recompute();
}

function recompute() {
  let grand = 0, gc = 0;
  $$("#app .sec").forEach(sec => {
    let s = 0, c = 0;
    $$(".row", sec).forEach(r => {
      const q = parseInt(r.querySelector(".qv").textContent, 10) || 0;
      const w = +r.dataset.w || 0, tot = q * w, max = +r.dataset.max || Infinity;
      r.querySelector(".rt").textContent = fmt(tot);
      r.classList.toggle("off", q === 0);
      const pl = r.querySelector(".plus"), mi = r.querySelector(".minus");
      if (pl) pl.disabled = q >= max;
      if (mi) mi.disabled = q <= 0;
      s += tot; c += q;
    });
    const sub = sec.querySelector(".sub"); if (sub) sub.textContent = fmt(s) + " · " + c + " szt";
    grand += s; gc += c;
  });
  $$(".grandval").forEach(e => e.textContent = (grand / 1000).toFixed(2) + " kg");
  $$(".gcountval").forEach(e => e.textContent = gc);
  buildChecklist();   // utrzymuj widok PDF w zgodzie z bieżącą listą (też dla Ctrl+P)
}

// ---------- checklista do PDF (zwarta, ☐ przy każdej rzeczy) ----------
function buildChecklist() {
  const cont = $("#checklist"); if (!cont) return;
  const t = currentTrip();
  let total = 0, cnt = 0, secHtml = "";
  $$("#main-sections .sec").forEach(sec => {
    const fn = (sec.querySelector("h3 span") || {}).textContent || "";
    let sub = 0, c = 0, rows = "";
    $$(".row", sec).forEach(r => {
      const q = parseInt(r.querySelector(".qv").textContent, 10) || 0;
      if (q < 1) return;
      const w = +r.dataset.w || 0;
      sub += w * q; c += q;
      const qx = q > 1 ? ` <span class=cl-q>×${q}</span>` : "";
      const ww = w ? ` <span class=cl-w>${fmt(w * q)}</span>` : "";
      rows += `<div class=cl-it><span class=cb></span>${esc(r.dataset.name)}${qx}${ww}</div>`;
    });
    if (!rows) return;
    total += sub; cnt += c;
    secHtml += `<section class=cl-sec><h3>${esc(fn)} <span>${fmt(sub)}</span></h3>${rows}</section>`;
  });
  const title = t ? esc(t.nazwa) : "Lista pakowania";
  cont.innerHTML =
    `<div class=cl-head><h2>${title}</h2>` +
    `<div class=cl-meta>${(total / 1000).toFixed(2)} kg · ${cnt} szt · ${DATA.generated}</div></div>` +
    `<div class=cl-cols>${secHtml || "<p>Brak rzeczy do spakowania.</p>"}</div>`;
}

// ---------- eksport do YAML (usun / dodaj / ilosc) ----------
function exportYaml() {
  const usun = [], dodaj = [], ilosc = [];
  $$("#main-sections .row").forEach(r => {
    if (r.dataset.apt === "1") return;
    const name = r.dataset.name;
    const q = parseInt(r.querySelector(".qv").textContent, 10) || 0;
    const def = +r.dataset.def || 0;
    if (r.dataset.excl === "1") {            // odfiltrowane: domyślnie 0 → q>0 znaczy „dodaj"
      if (q > 0) { dodaj.push(name); if (q !== 1) ilosc.push([name, q]); }
    } else {
      if (q === 0) usun.push(name);
      else if (q !== def) ilosc.push([name, q]);
    }
  });
  const Q = (s) => JSON.stringify(s);
  let out = [];
  if (dodaj.length) out.push("  dodaj: [" + dodaj.map(Q).join(", ") + "]");
  if (usun.length) out.push("  usun: [" + usun.map(Q).join(", ") + "]");
  if (ilosc.length) {
    out.push("  ilosc:");
    ilosc.forEach(([n, q]) => out.push("    " + Q(n) + ": " + q));
  }
  $("#exportTxt").value = out.length
    ? out.join("\n")
    : "# Brak zmian względem domyślnych ilości.";
  $("#exportDlg").showModal();
}
