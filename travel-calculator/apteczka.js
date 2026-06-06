// Apteczka — przeglądarka leków (po dolegliwościach) i środków (po kategoriach).
// Źródło danych: data.json (generowane z YAML przez `python generate.py app`).
"use strict";

let DATA = null;
const STATE = { tab: "leki", apt: "", rx: "all", loc: "mam", q: "" };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dePL = (s) => String(s || "").toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");

const APT_FALLBACK = { dom_tylko: "🏠 Dom" };
const aptName = (code) => (DATA.apt_nazwy && DATA.apt_nazwy[code]) || APT_FALLBACK[code] || code;

function init() {
  const leki = DATA.leki || [], srodki = DATA.srodki || [];
  $("#meta").textContent =
    `${leki.length} leków · ${srodki.length} środków · zaktualizowano ${DATA.generated}`;

  // apteczki do filtra: wszystkie kody występujące w lekach/środkach
  const codes = new Set();
  leki.forEach(l => (l.apt || []).forEach(c => codes.add(c)));
  srodki.forEach(s => (s.apt || []).forEach(c => codes.add(c)));
  const order = Object.keys(DATA.apt_nazwy || {});
  const sorted = [...codes].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || aptName(a).localeCompare(aptName(b), "pl");
  });
  $("#aptFilter").innerHTML = '<option value="">— wszystkie —</option>' +
    sorted.map(c => `<option value="${esc(c)}">${esc(aptName(c))}</option>`).join("");

  $("#tabs").onclick = e => {
    const b = e.target.closest(".tab"); if (!b) return;
    STATE.tab = b.dataset.tab;
    $$(".tab").forEach(t => t.classList.toggle("on", t === b));
    const lek = STATE.tab === "leki";
    $("#rxWrap").style.display = lek ? "" : "none";
    $("#locWrap").style.display = lek ? "" : "none";
    render();
  };
  $("#aptFilter").onchange = e => { STATE.apt = e.target.value; render(); };
  $("#rxFilter").onchange = e => { STATE.rx = e.target.value; render(); };
  $("#locFilter").onchange = e => { STATE.loc = e.target.value; render(); };
  let t;
  $("#search").oninput = e => {
    STATE.q = e.target.value.trim();
    clearTimeout(t); t = setTimeout(render, 120);
  };
  render();
}

// ważność "YYYY-MM" → liczba miesięcy od teraz (ujemne = przeterminowane)
function monthsTo(waz) {
  const m = String(waz || "").match(/(\d{4})-(\d{2})/); if (!m) return null;
  const now = new Date(DATA.generated || Date.now());
  return (+m[1] - now.getFullYear()) * 12 + (+m[2] - (now.getMonth() + 1));
}
function wazBadge(waz) {
  if (!waz) return "";
  const d = monthsTo(waz);
  if (d == null) return `<span class=waz>${esc(waz)}</span>`;
  const cls = d < 0 ? "bad" : d <= 3 ? "warn" : "ok";
  const tip = d < 0 ? "przeterminowane" : d <= 3 ? "wygasa wkrótce" : "ważne";
  return `<span class="waz ${cls}" title="${tip}">⏳ ${esc(waz)}</span>`;
}
const aptChips = (apt) => (apt || []).map(c => `<span class=aptchip>${esc(aptName(c))}</span>`).join("");

const matchApt = (apt) => !STATE.apt || (apt || []).includes(STATE.apt);
// lokalizacja leku: do kupienia > konkretny pojemnik (apteczka/organizer) > w domu
function lekBucket(l) {
  if (l.kup) return "kup";                 // do kupienia (zdecydowane) — nie ma w apteczce
  if (l.roz) return "rozw";                // do rozważenia (rozważam zakup) — też nie w apteczce
  const apt = l.apt || [];
  if (apt.includes("mountain_leader_pro")) return "mlp";
  if (apt.includes("forclaz")) return "forclaz";
  if (apt.includes("solognac_czarny")) return "sol-czarny";
  if (apt.includes("solognac_zielony")) return "sol-zielony";
  if (apt.includes("solognac")) return "sol";
  return "dom";
}
function searchLek(l) {
  const q = dePL(STATE.q); if (!q) return true;
  const extra = (l.kup ? "do kupienia kupic " : "") + (l.roz ? "do rozwazenia rozwazam" : "");
  return [l.n, l.na, l.d, l.f, l.s, l.syt, extra].some(x => x && dePL(x).includes(q));
}
function searchSr(s) {
  const q = dePL(STATE.q); if (!q) return true;
  return [s.n, s.k].some(x => x && dePL(x).includes(q));
}

function group(items, keyFn, order) {
  const g = {};
  items.forEach(it => { const k = keyFn(it); (g[k] = g[k] || []).push(it); });
  const ord = order || [];
  const keys = ord.filter(k => g[k])
    .concat(Object.keys(g).filter(k => !ord.includes(k)).sort((a, b) => a.localeCompare(b, "pl")));
  return keys.map(k => [k, g[k].sort((a, b) => a.n.localeCompare(b.n, "pl"))]);
}

function lekRow(l) {
  const rx = l.rx ? '<span class="badge rx">Rx</span>' : "";
  const kup = l.kup ? '<span class="badge kup">🛒 do kupienia</span>' : "";
  const na = l.na ? ` <span class=sub2>${esc(l.na)}</span>` : "";
  const f = l.f ? `<span class=forma>${esc(l.f)}</span>` : "";
  const syt = l.syt ? `<div class=syt>📍 ${esc(l.syt)}</div>` : "";
  return `<div class="arow${l.kup ? " tobuy" : ""}"><div class=aname>${esc(l.n)}${rx}${kup}${na}</div>
    ${syt}<div class=ameta>${f}${wazBadge(l.w)}${aptChips(l.apt)}</div></div>`;
}
function srRow(s) {
  return `<div class=arow><div class=aname>${esc(s.n)}</div>
    <div class=ameta>${aptChips(s.apt)}</div></div>`;
}
function sections(groups, rowFn) {
  return groups.map(([k, its]) =>
    `<section class="cat sec"><h3><span>${esc(k)}</span><span class=sub>${its.length}</span></h3>
     <div class=alist>${its.map(rowFn).join("")}</div></section>`).join("");
}

function render() {
  let html = "", n = 0;
  if (STATE.tab === "leki") {
    let L = (DATA.leki || []).filter(l => matchApt(l.apt) && searchLek(l));
    if (STATE.rx === "rx") L = L.filter(l => l.rx);
    else if (STATE.rx === "otc") L = L.filter(l => !l.rx);
    if (STATE.loc === "mam") {            // domyślnie: tylko posiadane (bez do kupienia / do rozważenia)
      L = L.filter(l => { const b = lekBucket(l); return b !== "kup" && b !== "rozw"; });
    } else if (STATE.loc !== "all") {
      L = L.filter(l => lekBucket(l) === STATE.loc);
    }
    n = L.length;
    html = sections(group(L, l => l.d, DATA.dolegliwosci_order), lekRow);
  } else {
    const S = (DATA.srodki || []).filter(s => matchApt(s.apt) && searchSr(s));
    n = S.length;
    html = sections(group(S, s => s.k, DATA.srodki_order), srRow);
  }
  $("#app").innerHTML = html || `<p class=empty>Brak pozycji dla tych filtrów.</p>`;
  $(".grandval").textContent = n;
}

// ---------- bootstrap (na końcu: po deklaracjach const) ----------
fetch("data.json").then(r => r.json()).then(d => { DATA = d; init(); })
  .catch(e => { $("#app").innerHTML = "<p class=empty>Nie udało się wczytać data.json (" + e + ")</p>"; });
