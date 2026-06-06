// Kosmetyczki — przeglądarka zawartości (per pojemnik, z wagami).
// Źródło danych: data.json (generowane z YAML przez `python generate.py app`).
"use strict";

let DATA = null;
const STATE = { kosm: "", q: "" };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dePL = (s) => String(s || "").toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
const fmt = (g) => !g ? "—" : (g >= 1000 ? (g / 1000).toFixed(2) + " kg" : g + " g");

function init() {
  const K = DATA.kosmetyczki || {};
  const order = (DATA.kosmetyczki_order || Object.keys(K));
  const total = order.reduce((s, c) => s + ((K[c] && K[c].items || []).length), 0);
  $("#meta").textContent =
    `${order.length} kosmetyczki · ${total} pozycji · zaktualizowano ${DATA.generated}`;

  $("#kosmFilter").innerHTML = '<option value="">— wszystkie —</option>' +
    order.map(c => `<option value="${esc(c)}">${esc((K[c] || {}).n || c)}</option>`).join("");

  $("#kosmFilter").onchange = e => { STATE.kosm = e.target.value; render(); };
  let t;
  $("#search").oninput = e => {
    STATE.q = e.target.value.trim();
    clearTimeout(t); t = setTimeout(render, 120);
  };
  render();
}

const matchQ = (n) => { const q = dePL(STATE.q); return !q || dePL(n).includes(q); };

function itemRow(it) {
  const w = it.w ? `<span class=waz>${esc(fmt(it.w))}</span>` : `<span class="waz" title="brak wagi">— g</span>`;
  return `<div class=arow><div class=aname>${esc(it.n)}</div><div class=ameta>${w}</div></div>`;
}

function render() {
  const K = DATA.kosmetyczki || {};
  const order = (DATA.kosmetyczki_order || Object.keys(K))
    .filter(c => !STATE.kosm || c === STATE.kosm);
  let html = "", nAll = 0, gAll = 0;
  order.forEach(code => {
    const k = K[code]; if (!k) return;
    const items = (k.items || []).filter(it => matchQ(it.n));
    if (!items.length) return;
    const sub = items.reduce((s, it) => s + (it.w || 0), 0);
    nAll += items.length; gAll += sub;
    const opis = k.opis ? `<div class=exnote>${esc(k.opis)}</div>` : "";
    html += `<section class="cat sec"><h3><span>${esc(k.n || code)}</span>
      <span class=sub>${fmt(sub)} · ${items.length} szt</span></h3>
      ${opis}<div class=alist>${items.map(itemRow).join("")}</div></section>`;
  });
  $("#app").innerHTML = html || `<p class=empty>Brak kosmetyków dla tych filtrów.</p>`;
  $(".grandval").textContent = nAll;
  $(".gramval").textContent = fmt(gAll);
}

// ---------- bootstrap (na końcu: po deklaracjach const) ----------
fetch("data.json").then(r => r.json()).then(d => { DATA = d; init(); })
  .catch(e => { $("#app").innerHTML = "<p class=empty>Nie udało się wczytać data.json (" + e + ")</p>"; });
