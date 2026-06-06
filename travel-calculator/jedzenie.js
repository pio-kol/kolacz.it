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
  return (DATA.items || []).filter(i => i.k === "Jedzenie");
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
  STATE.qty = load();
  render();
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
  const ut = u ? u + " g" : "—";
  const note = it.pr ? ` <span class=forma>${esc(it.pr)}</span>` : "";
  return `<tr class="row${q === 0 ? " off" : ""}" data-name="${esc(it.n)}" data-w="${u}">
    <td>${esc(it.n)}${note}</td>
    <td class=qtycell><button type=button class=minus>−</button>
      <span class=qv>${q}</span><button type=button class=plus>+</button></td>
    <td class=n>${ut}</td><td class="n rt">${fmt(u * q)}</td></tr>`;
}

function render() {
  const gs = group();
  const app = $("#app");
  if (!gs.length) { app.innerHTML = `<p class=empty>Brak pozycji dla tych filtrów.</p>`; recompute(); return; }
  app.innerHTML = `<div class=cats>` + gs.map(([cat, items]) =>
    `<section class="cat sec"><h3><span>${esc(cat)}</span><span class=sub>—</span></h3>
      <table><tr><th>Pozycja</th><th class=q>Ilość</th><th class=n>/szt</th><th class=n>Razem</th></tr>
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
