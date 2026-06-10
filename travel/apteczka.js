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

// ---------- stan w URL (zapamiętywanie po refresh / link) ----------
function writeUrl() {
  const p = new URLSearchParams();
  if (STATE.tab && STATE.tab !== "leki") p.set("tab", STATE.tab);
  if (STATE.apt) p.set("apt", STATE.apt);
  if (STATE.rx && STATE.rx !== "all") p.set("rx", STATE.rx);
  if (STATE.loc && STATE.loc !== "mam") p.set("loc", STATE.loc);
  if (STATE.q) p.set("q", STATE.q);
  const qs = p.toString();
  history.replaceState(null, "", (qs ? "?" + qs : location.pathname) + location.hash);
}
function readUrl() {
  const p = new URLSearchParams(location.search);
  if (p.has("tab")) STATE.tab = p.get("tab");
  if (p.has("apt")) STATE.apt = p.get("apt");
  if (p.has("rx")) STATE.rx = p.get("rx");
  if (p.has("loc")) STATE.loc = p.get("loc");
  if (p.has("q")) STATE.q = p.get("q");
}

function init() {
  const leki = DATA.leki || [], srodki = DATA.srodki || [], szcz = DATA.szczepienia || [];
  $("#meta").textContent =
    `${leki.length} leków · ${srodki.length} środków · ${szcz.length} szczepień · ${DATA.built || DATA.generated} · ${DATA.commit || ""}`;

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
    setTab(b.dataset.tab);
  };
  $("#aptFilter").onchange = e => { STATE.apt = e.target.value; render(); };
  $("#rxFilter").onchange = e => { STATE.rx = e.target.value; render(); };
  $("#locFilter").onchange = e => { STATE.loc = e.target.value; render(); };
  let t;
  $("#search").oninput = e => {
    STATE.q = e.target.value.trim();
    clearTimeout(t); t = setTimeout(render, 120);
  };
  // przewodniki (drzewka decyzyjne, interakcje) — przyciski + modal
  const guides = DATA.przewodniki || {};
  $("#guides").innerHTML = Object.keys(guides)
    .map(tytul => `<button class="btn docbtn" data-doc="g:${esc(tytul)}">${esc(tytul)}</button>`).join("");
  document.addEventListener("click", e => {
    const b = e.target.closest(".docbtn"); if (!b) return;
    const d = b.dataset.doc, i = d.indexOf(":"), kind = d.slice(0, i), keyv = d.slice(i + 1);
    if (kind === "g") openDoc(keyv, (DATA.przewodniki || {})[keyv]);
    else if (kind === "u") openDoc(keyv, (DATA.ulotki || {})[keyv]);
    else if (kind === "d") openDoc("🌳 Drzewko — " + keyv, (DATA.drzewka || {})[keyv]);
  });
  $("#catnav").onclick = (e) => {
    const a = e.target.closest(".catchip"); if (!a) return;
    e.preventDefault();
    history.replaceState(null, "", location.pathname + location.search + "#" + a.dataset.sec);
    scrollToSec(a.dataset.sec);
  };
  const fbody = $("#ctlbody"), ftog = $("#filtToggle");
  if (fbody && ftog) ftog.onclick = () => {
    const open = fbody.classList.toggle("collapsed");      // toggle zwraca stan po zmianie
    ftog.textContent = open ? "▾" : "▴";
    ftog.setAttribute("aria-expanded", String(!open));
  };
  $("#docClose").onclick = () => $("#docDlg").close();
  $("#docDlg").addEventListener("click", e => { if (e.target.id === "docDlg") $("#docDlg").close(); });
  readUrl();
  $("#aptFilter").value = STATE.apt;
  $("#rxFilter").value = STATE.rx;
  $("#locFilter").value = STATE.loc;
  $("#search").value = STATE.q;
  setTab(STATE.tab);
  // głęboki link z Vademecum: apteczka.html?lek=<nazwa> → odfiltruj i otwórz ulotkę
  const lek = new URLSearchParams(location.search).get("lek");
  if (lek) {
    STATE.tab = "leki"; STATE.loc = "all";
    $("#locFilter").value = "all";
    STATE.q = lek; $("#search").value = lek;
    setTab("leki");
    if (DATA.ulotki && DATA.ulotki[lek]) openDoc(lek, DATA.ulotki[lek]);
  }
  if (location.hash) requestAnimationFrame(() => scrollToSec(location.hash.slice(1)));
}

function openDoc(title, md) {
  if (!md) return;
  $("#docTitle").textContent = title;
  $("#docBody").innerHTML = mdToHtml(md);
  $("#docBody").scrollTop = 0;
  $("#docDlg").showModal();
}

// minimalny renderer Markdown (nagłówki, **bold**, `code`, listy, ```blok```, tabele |, ---, > , linki)
function mdToHtml(md) {
  const e = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const inl = s => e(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target=_blank rel=noopener>$1</a>');
  let html = "", inCode = false, code = "", list = false, tbl = [];
  const endL = () => { if (list) { html += "</ul>"; list = false; } };
  const endT = () => {
    if (!tbl.length) return;
    html += "<table class=mdt>" + tbl.map((r, ri) => "<tr>" + r.map(c =>
      `<${ri ? "td" : "th"}>${inl(c.trim())}</${ri ? "td" : "th"}>`).join("") + "</tr>").join("") + "</table>";
    tbl = [];
  };
  for (const ln of md.split("\n")) {
    if (ln.trim().startsWith("```")) {
      if (inCode) { html += "<pre>" + e(code) + "</pre>"; code = ""; inCode = false; }
      else { endL(); endT(); inCode = true; }
      continue;
    }
    if (inCode) { code += ln + "\n"; continue; }
    if (/^\s*\|/.test(ln)) {
      if (/^[\s:|-]+$/.test(ln)) continue;            // wiersz separatora :-:
      endL(); tbl.push(ln.trim().replace(/^\||\|$/g, "").split("|")); continue;
    }
    endT();
    let m;
    if ((m = ln.match(/^(#{1,6})\s+(.*)$/))) { endL(); const h = Math.min(m[1].length + 1, 5); html += `<h${h}>${inl(m[2])}</h${h}>`; }
    else if (/^---+\s*$/.test(ln)) { endL(); html += "<hr>"; }
    else if (/^\s*[-*]\s+/.test(ln)) { if (!list) { html += "<ul>"; list = true; } html += "<li>" + inl(ln.replace(/^\s*[-*]\s+/, "")) + "</li>"; }
    else if (/^\s*>\s?/.test(ln)) { endL(); html += "<blockquote>" + inl(ln.replace(/^\s*>\s?/, "")) + "</blockquote>"; }
    else if (ln.trim() === "") { endL(); }
    else { endL(); html += "<p>" + inl(ln) + "</p>"; }
  }
  endL(); endT(); if (inCode) html += "<pre>" + e(code) + "</pre>";
  return html;
}

// Filtr "Apteczka" tylko dla Środków; "Lokalizacja"/"Recepta" tylko dla Leków
// (na Lekach Lokalizacja i tak zawiera wszystkie apteczki — bez dublowania).
function setTab(tab) {
  STATE.tab = tab;
  $$(".tab").forEach(t => t.classList.toggle("on", t.dataset.tab === tab));
  const lek = tab === "leki";
  $("#rxWrap").style.display = lek ? "" : "none";
  $("#locWrap").style.display = lek ? "" : "none";
  $("#aptWrap").style.display = tab === "srodki" ? "" : "none";   // filtr apteczki tylko dla środków
  if (tab !== "srodki") { STATE.apt = ""; $("#aptFilter").value = ""; }
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
  if (l.roz) return "rozw";                // do rozważenia (rozważam zakup) — też nie ma
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
  return [l.n, l.na, l.d, l.f, l.s, extra].some(x => x && dePL(x).includes(q));
}
function searchSr(s) {
  const q = dePL(STATE.q); if (!q) return true;
  return [s.n, s.k].some(x => x && dePL(x).includes(q));
}
function searchSzcz(s) {
  const q = dePL(STATE.q); if (!q) return true;
  return [s.n, s.choroba, s.data].some(x => x && dePL(x).includes(q));
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
  const inf = (DATA.ulotki && DATA.ulotki[l.n])
    ? ` <button class="docbtn ibtn" data-doc="u:${esc(l.n)}" title="Ulotka">📖</button>` : "";
  const rx = l.rx ? '<span class="badge rx">Rx</span>' : "";
  const kup = l.kup ? '<span class="badge kup">🛒 do kupienia</span>' : "";
  const roz = l.roz ? '<span class="badge roz">🤔 do rozważenia</span>' : "";
  const f = l.f ? `<span class=forma>${esc(l.f)}</span>` : "";
  const opis = l.na ? `<div class=opis>${esc(l.na)}</div>` : "";
  const subst = l.s ? `<div class=subst>🧪 ${esc(l.s)}</div>` : "";
  // referencje do Vademecum chorób górskich
  const vad = (l.vad || []).map(v =>
    `<a class=vadref href="vademecum.html#${esc(v.slug)}" title="Vademecum: ${esc(v.label)}">🏔️ ${esc(v.label)}</a>`).join("");
  const vadrow = vad ? `<div class=vadrow>${vad}</div>` : "";
  return `<div class="arow${l.kup || l.roz ? " tobuy" : ""}"><div class=aname>${esc(l.n)}${inf}${rx}${kup}${roz}</div>
    ${subst}${opis}<div class=ameta>${f}${wazBadge(l.w)}${aptChips(l.apt)}</div>${vadrow}</div>`;
}
function srRow(s) {
  return `<div class=arow><div class=aname>${esc(s.n)}</div>
    <div class=ameta>${aptChips(s.apt)}</div></div>`;
}
// jeden wiersz na szczepionkę; jeśli było kilka dawek — kilka dat (znaczników) w wierszu
function szczRow(s) {
  const dates = (s.dates && s.dates.length)
    ? s.dates.map(d => `<span class=waz title="data szczepienia">📅 ${esc(d)}</span>`).join("")
    : `<span class="waz" title="data nieznana">📅 —</span>`;
  const cnt = s.dates.length > 1 ? ` <span class=sub>${s.dates.length}× dawki</span>` : "";
  return `<div class=arow><div class=aname>${esc(s.n)}${cnt}</div>
    <div class=ameta>${dates}</div></div>`;
}
const secId = (s) => "sec-" + dePL(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function renderCatnav(groups) {
  const nav = $("#catnav"); if (!nav) return;
  nav.innerHTML = (groups || []).map(([k]) =>
    `<a class=catchip href="#${secId(k)}" data-sec="${secId(k)}">${esc(k)}</a>`).join("");
}
function scrollToSec(id) {
  const sec = document.getElementById(id); if (!sec) return;
  const off = ($("#controls").offsetHeight || 0) + 6;
  window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY - off, behavior: "smooth" });
}
function sections(groups, rowFn, withTree) {
  return groups.map(([k, its]) => {
    const tree = (withTree && DATA.drzewka && DATA.drzewka[k])
      ? ` <button class="docbtn dtree" data-doc="d:${esc(k)}" title="Drzewko decyzyjne">🌳</button>` : "";
    return `<section class="cat sec" id="${secId(k)}"><h3><span>${esc(k)}${tree}</span><span class=sub>${its.length}</span></h3>
     <div class=alist>${its.map(rowFn).join("")}</div></section>`;
  }).join("");
}

function render() {
  writeUrl();
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
    const groups = group(L, l => l.d, DATA.dolegliwosci_order);
    renderCatnav(groups);
    html = sections(groups, lekRow, true);
  } else if (STATE.tab === "szczepienia") {
    const Z = (DATA.szczepienia || []).filter(searchSzcz);
    // grupuj po chorobie/celu; w grupie scal po nazwie (kilka dawek → jeden wiersz, kilka dat)
    const g = {};
    Z.forEach(z => { const k = z.choroba || "Inne"; (g[k] = g[k] || []).push(z); });
    const ord = DATA.szczepienia_order || [];
    const keys = ord.filter(k => g[k])
      .concat(Object.keys(g).filter(k => !ord.includes(k)).sort((a, b) => a.localeCompare(b, "pl")));
    const groups = keys.map(k => {
      const byName = {};
      g[k].forEach(z => {
        const r = (byName[z.n] = byName[z.n] || { n: z.n, dates: [] });
        if (z.data) r.dates.push(z.data);
      });
      const rows = Object.values(byName);
      rows.forEach(r => r.dates.sort((a, b) => b.localeCompare(a)));   // najnowsza data pierwsza
      rows.sort((a, b) => (b.dates[0] || "").localeCompare(a.dates[0] || ""));
      return [k, rows];
    });
    n = groups.reduce((a, [, rows]) => a + rows.length, 0);
    renderCatnav(groups);
    html = sections(groups, szczRow);
  } else {
    const S = (DATA.srodki || []).filter(s => matchApt(s.apt) && searchSr(s));
    n = S.length;
    const groups = group(S, s => s.k, DATA.srodki_order);
    renderCatnav(groups);
    html = sections(groups, srRow);
  }
  $("#app").innerHTML = html || `<p class=empty>Brak pozycji dla tych filtrów.</p>`;
  $(".grandval").textContent = n;
}

// ---------- bootstrap (na końcu: po deklaracjach const) ----------
LM.unlock(d => { DATA = d; init(); });          // szyfrowanie klienta: odblokuj → init()
