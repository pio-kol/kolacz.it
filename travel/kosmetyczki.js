// Kosmetyczki — zawartość per pojemnik, ze stepperem ilości i sumą wagi (jak kalkulator).
// Źródło danych: data.json (generowane z YAML przez `python generate.py app`).
"use strict";

let DATA = null;
const STATE = { kosm: "", q: "", qty: {} };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dePL = (s) => String(s || "").toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
const fmt = (g) => !g ? "—" : (g >= 1000 ? (g / 1000).toFixed(2) + " kg" : g + " g");

function writeUrl() {
  const p = new URLSearchParams();
  if (STATE.kosm) p.set("kosm", STATE.kosm);
  if (STATE.q) p.set("q", STATE.q);
  const qs = p.toString();
  history.replaceState(null, "", (qs ? "?" + qs : location.pathname) + location.hash);
}
function readUrl() {
  const p = new URLSearchParams(location.search);
  if (p.has("kosm")) STATE.kosm = p.get("kosm");
  if (p.has("q")) STATE.q = p.get("q");
}

function init() {
  const K = DATA.kosmetyczki || {};
  const order = (DATA.kosmetyczki_order || Object.keys(K));
  const total = order.reduce((s, c) => s + ((K[c] && K[c].items || []).length), 0);
  $("#meta").textContent =
    `${order.length} kosmetyczki · ${total} pozycji · ${DATA.built || DATA.generated} · ${DATA.commit || ""}`;

  $("#kosmFilter").innerHTML = '<option value="">— wszystkie —</option>' +
    order.map(c => `<option value="${esc(c)}">${esc((K[c] || {}).n || c)}</option>`).join("");

  $("#kosmFilter").onchange = e => { STATE.kosm = e.target.value; render(); };
  let t;
  $("#search").oninput = e => {
    STATE.q = e.target.value.trim();
    clearTimeout(t); t = setTimeout(render, 120);
  };
  $("#app").addEventListener("click", onStep);
  $("#catnav").onclick = (e) => {
    const a = e.target.closest(".catchip"); if (!a) return;
    e.preventDefault();
    history.replaceState(null, "", location.pathname + location.search + "#" + a.dataset.sec);
    scrollToSec(a.dataset.sec);
  };
  const fbody = $("#ctlbody"), ftog = $("#filtToggle");
  if (fbody && ftog) ftog.onclick = () => {
    const collapsed = fbody.classList.toggle("collapsed");
    ftog.textContent = collapsed ? "▾" : "▴";
    ftog.setAttribute("aria-expanded", String(!collapsed));
  };
  readUrl();
  $("#kosmFilter").value = STATE.kosm;
  $("#search").value = STATE.q;
  STATE.qty = load();
  render();
  if (location.hash) requestAnimationFrame(() => scrollToSec(location.hash.slice(1)));
}

// ---------- localStorage (ilości) ----------
function save() { try { localStorage.setItem("kosm:qty", JSON.stringify(STATE.qty)); } catch (e) {} }
function load() { try { return JSON.parse(localStorage.getItem("kosm:qty")) || {}; } catch (e) { return {}; } }

const key = (code, n) => code + "|" + n;
const qtyOf = (code, it) => { const k = key(code, it.n); return (k in STATE.qty) ? STATE.qty[k] : 1; };
const matchQ = (n) => { const q = dePL(STATE.q); return !q || dePL(n).includes(q); };

function groups() {
  const K = DATA.kosmetyczki || {};
  return (DATA.kosmetyczki_order || Object.keys(K))
    .filter(c => !STATE.kosm || c === STATE.kosm)
    .map(c => [c, K[c]])
    .filter(([c, k]) => k && (k.items || []).some(it => matchQ(it.n)));
}

function rowHtml(code, it) {
  const u = it.w || 0;
  const q = qtyOf(code, it);
  const ut = u ? String(u) : "—";
  return `<tr class="row${q === 0 ? " off" : ""}" data-name="${esc(it.n)}" data-code="${esc(code)}" data-w="${u}">
    <td>${esc(it.n)}</td>
    <td class=qtycell><button type=button class=minus>−</button><span class=qty><span class=qv>${q}</span></span><button type=button class=plus>+</button></td>
    <td class=n>${ut}</td><td class="n rt">${fmt(u * q)}</td></tr>`;
}

const secId = (s) => "sec-" + dePL(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function renderCatnav(gs) {
  const nav = $("#catnav"); if (!nav) return;
  nav.innerHTML = (gs || []).map(([code, k]) =>
    `<a class=catchip href="#${secId(code)}" data-sec="${secId(code)}">${esc(k.n || code)}</a>`).join("");
}
function scrollToSec(id) {
  const sec = document.getElementById(id); if (!sec) return;
  const off = ($("#controls").offsetHeight || 0) + 6;
  window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY - off, behavior: "smooth" });
}
function render() {
  writeUrl();
  const gs = groups();
  const app = $("#app");
  renderCatnav(gs);
  if (!gs.length) { app.innerHTML = `<p class=empty>Brak kosmetyków dla tych filtrów.</p>`; recompute(); return; }
  app.innerHTML = `<div class=cats>` + gs.map(([code, k]) => {
    const items = (k.items || []).filter(it => matchQ(it.n));
    const opis = k.opis ? `<div class=exnote>${esc(k.opis)}</div>` : "";
    return `<section class="cat sec" id="${secId(code)}"><h3><span>${esc(k.n || code)}</span><span class=sub>—</span></h3>
      ${opis}<table><tr><th>Kosmetyk</th><th class=q>Ilość</th><th class=n>g/szt</th><th class=n>Razem</th></tr>
      ${items.map(it => rowHtml(code, it)).join("")}</table></section>`;
  }).join("") + `</div>`;
  recompute();
}

function onStep(e) {
  const b = e.target;
  if (!b.classList.contains("plus") && !b.classList.contains("minus")) return;
  const row = b.closest(".row");
  const k = key(row.dataset.code, row.dataset.name);
  let q = parseInt(row.querySelector(".qv").textContent, 10) || 0;
  q += b.classList.contains("plus") ? 1 : -1;
  if (q < 0) q = 0;
  row.querySelector(".qv").textContent = q;
  STATE.qty[k] = q; save(); recompute();
}

function recompute() {
  let grand = 0, gc = 0;
  $$("#app .sec").forEach(sec => {
    let s = 0, c = 0;
    $$(".row", sec).forEach(r => {
      const q = parseInt(r.querySelector(".qv").textContent, 10) || 0;
      const w = +r.dataset.w || 0, tot = q * w;
      r.querySelector(".rt").textContent = fmt(tot);
      r.classList.toggle("off", q === 0);
      const mi = r.querySelector(".minus"); if (mi) mi.disabled = q <= 0;
      s += tot; c += q;
    });
    const sub = sec.querySelector(".sub"); if (sub) sub.textContent = fmt(s) + " · " + c + " szt";
    grand += s; gc += c;
  });
  $(".grandval").textContent = (grand / 1000).toFixed(2) + " kg";
  $(".gcountval").textContent = gc;
}

// ---------- bootstrap (na końcu: po deklaracjach const) ----------
LM.unlock(d => { DATA = d; init(); });          // szyfrowanie klienta: odblokuj → init()
