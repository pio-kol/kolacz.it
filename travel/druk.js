// Offline / PDF — składa CAŁOŚĆ danych medycznych (leki po dolegliwościach, środki,
// skład apteczek, szczepienia, przewodniki/drzewka, pełne vademecum) w jeden
// dokument do druku. Otwórz przy zasięgu (pobiera najnowszy data.json), potem
// Drukuj → Zapisz jako PDF — zapisany plik działa w pełni offline.
"use strict";

let DATA = null;

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const APT_FALLBACK = { dom_tylko: "🏠 Dom" };
const aptName = (code) => (DATA.apt_nazwy && DATA.apt_nazwy[code]) || APT_FALLBACK[code] || code;

// grupowanie wg klucza z zadaną kolejnością (reszta alfabetycznie); w grupie sort po nazwie
function group(items, keyFn, order) {
  const g = {};
  items.forEach(it => { const k = keyFn(it); (g[k] = g[k] || []).push(it); });
  const ord = order || [];
  const keys = ord.filter(k => g[k])
    .concat(Object.keys(g).filter(k => !ord.includes(k)).sort((a, b) => a.localeCompare(b, "pl")));
  return keys.map(k => [k, g[k].sort((a, b) => a.n.localeCompare(b.n, "pl"))]);
}

// minimalny renderer Markdown (jak w apteczka.js / vademecum.js)
function mdToHtml(md) {
  const e = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const inl = s => e(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
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
      if (/^[\s:|-]+$/.test(ln)) continue;
      endL(); tbl.push(ln.trim().replace(/^\||\|$/g, "").split("|")); continue;
    }
    endT();
    let m;
    if ((m = ln.match(/^(#{1,6})\s+(.*)$/))) { endL(); const h = Math.min(m[1].length + 2, 6); html += `<h${h}>${inl(m[2])}</h${h}>`; }
    else if (/^---+\s*$/.test(ln)) { endL(); html += "<hr>"; }
    else if (/^\s*[-*]\s+/.test(ln)) { if (!list) { html += "<ul>"; list = true; } html += "<li>" + inl(ln.replace(/^\s*[-*]\s+/, "")) + "</li>"; }
    else if (/^\s*>\s?/.test(ln)) { endL(); html += "<blockquote>" + inl(ln.replace(/^\s*>\s?/, "")) + "</blockquote>"; }
    else if (ln.trim() === "") { endL(); }
    else { endL(); html += "<p>" + inl(ln) + "</p>"; }
  }
  endL(); endT(); if (inCode) html += "<pre>" + e(code) + "</pre>";
  return html;
}

// ---- sekcje dokumentu ----
// eksport = tylko leki POSIADANE; „do kupienia/do rozważenia" (l.kup/l.roz) pomijamy
// (nie ma sensu drukować ulotek leków, których się nie ma — po zakupie wrócą do katalogu)
const owned = (l) => !l.kup && !l.roz;
function lekBlock(l) {
  const badges = (l.rx ? " [Rx]" : "") + (l.kup ? " [do kupienia]" : "") + (l.roz ? " [do rozważenia]" : "");
  const apt = (l.apt || []).map(aptName).join(", ");
  const meta = [l.f, l.w ? "ważność " + l.w : "", apt ? "apteczka: " + apt : ""].filter(Boolean).join(" · ");
  const ulot = (DATA.ulotki && DATA.ulotki[l.n]) ? `<div class=ulotka>${mdToHtml(DATA.ulotki[l.n])}</div>` : "";
  return `<div class=lek><div class=lekname>${esc(l.n)}${esc(badges)}</div>` +
    (l.s ? `<div class=subst>🧪 ${esc(l.s)}</div>` : "") +
    (l.na ? `<div class=opis>${esc(l.na)}</div>` : "") +
    (meta ? `<div class=ameta>${esc(meta)}</div>` : "") +
    ulot + `</div>`;
}
function lekiSec() {
  const groups = group((DATA.leki || []).filter(owned), l => l.d || "Inne", DATA.dolegliwosci_order);
  if (!groups.length) return "";
  let s = `<section class=druk-sec><h2>💊 Leki po dolegliwościach</h2>`;
  for (const [k, its] of groups) {
    s += `<h3>${esc(k)}</h3>`;
    for (const l of its) s += lekBlock(l);
  }
  return s + `</section>`;
}
function srodkiSec() {
  const groups = group(DATA.srodki || [], s => s.k || "Inne", DATA.srodki_order);
  if (!groups.length) return "";
  let s = `<section class=druk-sec><h2>🩹 Środki wg kategorii</h2>`;
  for (const [k, its] of groups) {
    s += `<h3>${esc(k)}</h3><ul class=druk-list>`;
    for (const it of its) {
      const apt = (it.apt || []).map(aptName).join(", ");
      s += `<li>${esc(it.n)}${apt ? ` <span class=dim>— ${esc(apt)}</span>` : ""}</li>`;
    }
    s += `</ul>`;
  }
  return s + `</section>`;
}
function apteczkiSec() {
  const order = Object.keys(DATA.apt_nazwy || {});
  let s = `<section class=druk-sec><h2>🧰 Skład apteczek</h2>`, any = false;
  for (const code of order) {
    const L = (DATA.leki || []).filter(l => owned(l) && (l.apt || []).includes(code)).map(l => ({ n: l.n, typ: "lek", rx: l.rx }));
    const S = (DATA.srodki || []).filter(x => (x.apt || []).includes(code)).map(x => ({ n: x.n, typ: "środek", rx: false }));
    const its = L.concat(S).sort((a, b) => a.n.localeCompare(b.n, "pl"));
    if (!its.length) continue;
    any = true;
    s += `<h3>${esc(aptName(code))} <span class=dim>(${its.length})</span></h3><ul class=druk-list>`;
    for (const it of its) s += `<li>${esc(it.n)} <span class=dim>— ${esc(it.typ)}${it.rx ? ", Rx" : ""}</span></li>`;
    s += `</ul>`;
  }
  return any ? s + `</section>` : "";
}
function szczSec() {
  const Z = DATA.szczepienia || []; if (!Z.length) return "";
  const g = {}; Z.forEach(z => { const k = z.choroba || "Inne"; (g[k] = g[k] || []).push(z); });
  const ord = DATA.szczepienia_order || [];
  const keys = ord.filter(k => g[k]).concat(Object.keys(g).filter(k => !ord.includes(k)).sort((a, b) => a.localeCompare(b, "pl")));
  let s = `<section class=druk-sec><h2>💉 Szczepienia</h2>`;
  for (const k of keys) {
    const byName = {};
    g[k].forEach(z => { const r = (byName[z.n] = byName[z.n] || { n: z.n, dates: [] }); if (z.data) r.dates.push(z.data); });
    const rows = Object.values(byName); rows.forEach(r => r.dates.sort((a, b) => b.localeCompare(a)));
    s += `<h3>${esc(k)}</h3><ul class=druk-list>`;
    for (const r of rows) s += `<li>${esc(r.n)} <span class=dim>— ${r.dates.length ? r.dates.map(esc).join(", ") : "dzieciństwo"}</span></li>`;
    s += `</ul>`;
  }
  return s + `</section>`;
}
function guidesSec() {
  const P = DATA.przewodniki || {}, T = DATA.drzewka || {};
  const kP = Object.keys(P), kT = Object.keys(T);
  if (!kP.length && !kT.length) return "";
  let s = `<section class=druk-sec><h2>🧭 Przewodniki i drzewka decyzyjne</h2>`;
  for (const k of kP) s += `<h3>${esc(k)}</h3><div class=ulotka>${mdToHtml(P[k])}</div>`;
  for (const k of kT) s += `<h3>🌳 ${esc(k)}</h3><div class=ulotka>${mdToHtml(T[k])}</div>`;
  return s + `</section>`;
}
function vadSec() {
  if (!DATA.vademecum) return "";
  return `<section class="druk-sec vadwrap"><h2>🏔️ Vademecum chorób górskich</h2>` +
    `<div class=vad-md>${mdToHtml(DATA.vademecum)}</div></section>`;
}

function render() {
  const D = DATA;
  const tools = `<div class=noprint id=druktools>
    <button id=printBtn class=printbtn type=button>🖨️ Drukuj / Zapisz jako PDF</button>
    <p class=druknote>Otwórz tę stronę przy zasięgu, żeby pobrać najnowsze dane, potem
      <b>Drukuj → Zapisz jako PDF</b>. Zapisany plik działa w pełni offline:
      leki, środki, skład apteczek, szczepienia, przewodniki i całe vademecum.</p>
  </div>`;
  const head = `<header class=drukhead>
    <h1>🧭 Dane medyczne — wersja do druku / offline</h1>
    <p class=drukmeta>Wersja danych: ${esc(D.commit || "—")} · zbudowano ${esc(D.built || D.generated || "")}</p>
  </header>`;
  document.getElementById("druk").innerHTML =
    tools + head + lekiSec() + srodkiSec() + apteczkiSec() + szczSec() + guidesSec() + vadSec();
  document.getElementById("printBtn").onclick = () => window.print();
}

// ---------- bootstrap: odblokuj (szyfrowanie klienta) → render ----------
LM.unlock(d => { DATA = d; render(); });
