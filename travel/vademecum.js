// Vademecum — choroby górskie. Pełny dokument (wysokościowe AMS/HACE/HAPE,
// aklimatyzacja, ślepota śnieżna, odmrożenia…) renderowany z Markdown.
// Źródło prawdy: ulotki/VADEMECUM-CHOROBY-GORSKIE.md → data.json (`generate.py app`).
"use strict";

let DATA = null;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const dePL = (s) => String(s || "").toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// slug do kotwic (#sekcja) — diakrytyki PL → ascii
function slugify(s) {
  return dePL(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "sek";
}

// Renderer Markdown (nagłówki z id, **bold**, `code`, listy, ```blok```, tabele |, ---, >, linki, obrazki).
// Wspólny z apteczka.js, rozszerzony o id nagłówków i <img>.
function mdToHtml(md) {
  const e = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const inl = s => e(s)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading=lazy>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target=_blank rel=noopener>$1</a>')
    // gołe adresy http(s) (np. sekcja Literatura) → klikalne; pomija URL-e już w atrybutach/anchorach
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target=_blank rel=noopener>$2</a>');
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
    if ((m = ln.match(/^(#{1,6})\s+(.*)$/))) {
      endL();
      const lvl = m[1].length, h = Math.min(lvl + 1, 5), txt = m[2].trim();
      const id = lvl === 1 ? ` id="${slugify(txt)}"` : "";
      html += `<h${h}${id}>${inl(txt)}</h${h}>`;
    }
    else if (/^---+\s*$/.test(ln)) { endL(); html += "<hr>"; }
    else if (/^\s*[-*]\s+/.test(ln)) { if (!list) { html += "<ul>"; list = true; } html += "<li>" + inl(ln.replace(/^\s*[-*]\s+/, "")) + "</li>"; }
    else if (/^\s*>\s?/.test(ln)) { endL(); html += "<blockquote>" + inl(ln.replace(/^\s*>\s?/, "")) + "</blockquote>"; }
    else if (ln.trim() === "") { endL(); }
    else { endL(); html += "<p>" + inl(ln) + "</p>"; }
  }
  endL(); endT(); if (inCode) html += "<pre>" + e(code) + "</pre>";
  return html;
}

function buildToc() {
  const heads = $$("#doc h2[id]");
  const toc = $("#toc"), sel = $("#tocSel");
  toc.innerHTML = heads.map(h =>
    `<a href="#${h.id}" data-id="${h.id}">${h.textContent}</a>`).join("");
  sel.innerHTML = '<option value="">— spis treści —</option>' +
    heads.map(h => `<option value="${h.id}">${h.textContent}</option>`).join("");
  $(".grandval").textContent = heads.length;
  return heads;
}

function jumpTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Pod nagłówkiem sekcji wstaw "Powiązane leki". Pełna ulotka (jeśli jest w
// data.json) otwiera się W TYM MIEJSCU w modalu (offline, bez przeskoku);
// dodatkowy link "↗" przenosi na stronę Apteczka w kontekście leku.
function injectLeki() {
  const map = DATA.vademecum_leki || {}, ulotki = DATA.ulotki || {};
  $$("#doc h2[id]").forEach(h => {
    const leki = map[h.id];
    if (!leki || !leki.length) return;
    const chips = leki.map(l => {
      const rx = l.rx ? '<span class="badge rx">Rx</span>' : "";
      // posiadane vs do rozważenia / do kupienia — w terenie liczy się to, co masz
      const tag = l.roz ? '<span class="vbadge roz">🤔 do rozważenia</span>'
                : l.kup ? '<span class="vbadge kup">🛒 do kupienia</span>' : "";
      const cls = "vadleki-lek" + (l.roz || l.kup ? " mam-nie" : "");
      const apt = `<a class=vadleki-go href="apteczka.html?lek=${encodeURIComponent(l.n)}" title="Otwórz w Apteczce">↗</a>`;
      // jest ulotka → klik otwiera pełną treść w modalu; brak → sam link do Apteczki
      return ulotki[l.n]
        ? `<span class="${cls}"><button type=button class=ulobtn data-lek="${esc(l.n)}">📖 ${esc(l.n)}${rx}${tag}</button>${apt}</span>`
        : `<span class="${cls}"><a href="apteczka.html?lek=${encodeURIComponent(l.n)}">💊 ${esc(l.n)}${rx}${tag}</a></span>`;
    }).join("");
    const box = document.createElement("div");
    box.className = "vadleki";
    box.innerHTML = `<span class=vadleki-lbl>Powiązane leki:</span> ${chips}`;
    h.insertAdjacentElement("afterend", box);
  });
}

// Modal z pełną ulotką leku (treść markdown z data.json — działa offline).
function openDoc(title, md) {
  if (!md) return;
  $("#docTitle").textContent = title;
  $("#docBody").innerHTML = mdToHtml(md);
  $("#docBody").scrollTop = 0;
  $("#docDlg").showModal();
}

// ---- szukajka: podświetla dopasowania w treści (TreeWalker, bez psucia tagów) ----
let HILITE = [];
function clearHilite() {
  HILITE.forEach(m => { const t = document.createTextNode(m.textContent); m.replaceWith(t); t.parentNode.normalize(); });
  HILITE = [];
}
function highlight(q) {
  clearHilite();
  if (!q) return 0;
  const needle = dePL(q);
  const doc = $("#doc");
  const walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentNode && /^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName))
      ? NodeFilter.FILTER_REJECT
      : (dePL(n.nodeValue).includes(needle) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
  });
  const targets = [];
  let n; while ((n = walker.nextNode())) targets.push(n);
  for (const node of targets) {
    const hay = dePL(node.nodeValue), raw = node.nodeValue;
    const frag = document.createDocumentFragment();
    let i = 0, idx;
    while ((idx = hay.indexOf(needle, i)) !== -1) {
      if (idx > i) frag.appendChild(document.createTextNode(raw.slice(i, idx)));
      const mark = document.createElement("mark");
      mark.textContent = raw.slice(idx, idx + needle.length);
      frag.appendChild(mark); HILITE.push(mark);
      i = idx + needle.length;
    }
    if (i < raw.length) frag.appendChild(document.createTextNode(raw.slice(i)));
    node.replaceWith(frag);
  }
  if (HILITE.length) HILITE[0].scrollIntoView({ behavior: "smooth", block: "center" });
  return HILITE.length;
}

function init() {
  const md = DATA.vademecum;
  if (!md) { $("#doc").innerHTML = "<p class=empty>Brak dokumentu w data.json.</p>"; return; }
  $("#meta").textContent = `Vademecum chorób górskich · wersja ${DATA.commit || DATA.generated}`;
  $("#doc").innerHTML = mdToHtml(md);
  buildToc();
  injectLeki();

  $("#toc").onclick = e => {
    const a = e.target.closest("a[data-id]"); if (!a) return;
    e.preventDefault(); jumpTo(a.dataset.id); history.replaceState(null, "", "#" + a.dataset.id);
  };
  $("#tocSel").onchange = e => { if (e.target.value) { jumpTo(e.target.value); history.replaceState(null, "", "#" + e.target.value); } };

  // klik w "📖 <lek>" → pełna ulotka w modalu (offline)
  $("#doc").addEventListener("click", e => {
    const b = e.target.closest(".ulobtn"); if (!b) return;
    openDoc(b.dataset.lek, (DATA.ulotki || {})[b.dataset.lek]);
  });
  $("#docClose").onclick = () => $("#docDlg").close();
  $("#docDlg").addEventListener("click", e => { if (e.target.id === "docDlg") $("#docDlg").close(); });

  let t;
  $("#search").oninput = e => {
    const q = e.target.value.trim();
    clearTimeout(t);
    t = setTimeout(() => {
      const hits = highlight(q);
      $(".grandval").textContent = q ? `${hits} trafień` : $$("#doc h2[id]").length;
    }, 160);
  };

  if (location.hash) setTimeout(() => jumpTo(location.hash.slice(1)), 60);
}

LM.unlock(d => { DATA = d; init(); });          // szyfrowanie klienta: odblokuj → init()
