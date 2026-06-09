// Jedzenie i picie — konsumpcyjne pozycje z przedmioty.yaml (kategoria "Jedzenie"),
// ze stepperem ilości i sumą wagi (jak kalkulator / kosmetyczki).
// Źródło danych: data.json (generowane z YAML przez `python generate.py app`).
"use strict";

let DATA = null;
const STATE = { q: "", qty: {} };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dePL = (s) => String(s || "").toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
const fmt = (g) => !g ? "—" : (g >= 1000 ? (g / 1000).toFixed(2) + " kg" : g + " g");

// Podgrupy (kolejność = priorytet; pierwsze trafienie wygrywa). Słowa kluczowe
// dopasowywane do nazwy bez polskich znaków (dePL).
const FOODCATS = [
  ["Napoje i elektrolity", ["izotonik", "elektrolit", "slavic", "ors", "herbata", "kawa", "napoj", "nawadnia"]],
  ["Energia — żele, batony, musy", ["baton", "zel", "galaretka", "mus ", "specjal", "energ", "migdal", "miod"]],
  ["Woda — uzdatnianie i sprzęt", ["woda", "filtr", "uzdatnian", "javel"]],
];
const FOOD_ORDER = FOODCATS.map(c => c[0]).concat(["Pozostałe"]);
function classify(name) {
  const n = dePL(name);
  for (const [cat, kws] of FOODCATS) if (kws.some(k => n.includes(k))) return cat;
  return "Pozostałe";
}

function foodItems() {
  return DATA.jedzenie || [];
}

function writeUrl() {
  history.replaceState(null, "", (STATE.q ? "?q=" + encodeURIComponent(STATE.q) : location.pathname) + location.hash);
}
function readUrl() {
  const p = new URLSearchParams(location.search);
  if (p.has("q")) STATE.q = p.get("q");
}

function init() {
  const its = foodItems();
  $("#meta").textContent =
    `${its.length} pozycji · jedzenie i picie · wersja ${DATA.commit || DATA.generated}`;
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
  readUrl();
  $("#search").value = STATE.q;
  STATE.qty = load();
  render();
  if (location.hash) requestAnimationFrame(() => scrollToSec(location.hash.slice(1)));
}

// ---------- localStorage (ilości) ----------
function save() { try { localStorage.setItem("jedz:qty", JSON.stringify(STATE.qty)); } catch (e) {} }
function load() { try { return JSON.parse(localStorage.getItem("jedz:qty")) || {}; } catch (e) { return {}; } }

const qtyOf = (it) => (it.n in STATE.qty) ? STATE.qty[it.n] : 1;
const matchQ = (n) => { const q = dePL(STATE.q); return !q || dePL(n).includes(q); };

function group() {
  const g = {};
  foodItems().filter(it => matchQ(it.n)).forEach(it => {
    const k = classify(it.n); (g[k] = g[k] || []).push(it);
  });
  return FOOD_ORDER.filter(k => g[k])
    .map(k => [k, g[k].sort((a, b) => a.n.localeCompare(b.n, "pl"))]);
}

function rowHtml(it) {
  const u = it.w || 0;
  const q = qtyOf(it);
  const ut = u ? String(u) : "—";
  const note = it.pr ? ` <span class=forma>${esc(it.pr)}</span>` : "";
  return `<tr class="row${q === 0 ? " off" : ""}" data-name="${esc(it.n)}" data-w="${u}">
    <td>${esc(it.n)}${note}</td>
    <td class=qtycell><button type=button class=minus>−</button><span class=qty><span class=qv>${q}</span></span><button type=button class=plus>+</button></td>
    <td class=n>${ut}</td><td class="n rt">${fmt(u * q)}</td></tr>`;
}

const secId = (s) => "sec-" + dePL(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function renderCatnav(groups) {
  const nav = $("#catnav"); if (!nav) return;
  nav.innerHTML = (groups || []).map(([cat]) =>
    `<a class=catchip href="#${secId(cat)}" data-sec="${secId(cat)}">${esc(cat)}</a>`).join("");
}
function scrollToSec(id) {
  const sec = document.getElementById(id); if (!sec) return;
  const off = ($("#controls").offsetHeight || 0) + 6;
  window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY - off, behavior: "smooth" });
}
function render() {
  writeUrl();
  const gs = group();
  const app = $("#app");
  renderCatnav(gs);
  if (!gs.length) { app.innerHTML = `<p class=empty>Brak pozycji dla tych filtrów.</p>`; recompute(); return; }
  app.innerHTML = `<div class=cats>` + gs.map(([cat, items]) =>
    `<section class="cat sec" id="${secId(cat)}"><h3><span>${esc(cat)}</span><span class=sub>—</span></h3>
      <table><tr><th>Pozycja</th><th class=q>Ilość</th><th class=n>g/szt</th><th class=n>Razem</th></tr>
      ${items.map(rowHtml).join("")}</table></section>`).join("") + `</div>`;
  recompute();
}

function onStep(e) {
  const b = e.target;
  if (!b.classList.contains("plus") && !b.classList.contains("minus")) return;
  const row = b.closest(".row");
  let q = parseInt(row.querySelector(".qv").textContent, 10) || 0;
  q += b.classList.contains("plus") ? 1 : -1;
  if (q < 0) q = 0;
  row.querySelector(".qv").textContent = q;
  STATE.qty[row.dataset.name] = q; save(); recompute();
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
fetch("data.json", { cache: "no-cache" }).then(r => r.json()).then(d => { DATA = d; init(); })
  .catch(e => { $("#app").innerHTML = "<p class=empty>Nie udało się wczytać data.json (" + e + ")</p>"; });
