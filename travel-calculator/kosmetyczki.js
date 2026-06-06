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
  $("#app").addEventListener("click", onStep);
  STATE.qty = load();
  render();
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
  const ut = u ? u + " g" : "—";
  return `<tr class="row${q === 0 ? " off" : ""}" data-name="${esc(it.n)}" data-code="${esc(code)}" data-w="${u}">
    <td>${esc(it.n)}</td>
    <td class=qtycell><button type=button class=minus>−</button>
      <span class=qv>${q}</span><button type=button class=plus>+</button></td>
    <td class=n>${ut}</td><td class="n rt">${fmt(u * q)}</td></tr>`;
}

function render() {
  const gs = groups();
  const app = $("#app");
  if (!gs.length) { app.innerHTML = `<p class=empty>Brak kosmetyków dla tych filtrów.</p>`; recompute(); return; }
  app.innerHTML = `<div class=cats>` + gs.map(([code, k]) => {
    const items = (k.items || []).filter(it => matchQ(it.n));
    const opis = k.opis ? `<div class=exnote>${esc(k.opis)}</div>` : "";
    return `<section class="cat sec"><h3><span>${esc(k.n || code)}</span><span class=sub>—</span></h3>
      ${opis}<table><tr><th>Kosmetyk</th><th class=q>Ilość</th><th class=n>/szt</th><th class=n>Razem</th></tr>
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
fetch("data.json").then(r => r.json()).then(d => { DATA = d; init(); })
  .catch(e => { $("#app").innerHTML = "<p class=empty>Nie udało się wczytać data.json (" + e + ")</p>"; });
