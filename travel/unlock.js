// Szyfrowanie po stronie klienta — cała aplikacja za hasłem.
// data.json bywa: (a) zwykłym obiektem (lokalnie / repo prywatne) → ładujemy wprost;
// (b) "kopertą" {v,kdf,iter,salt,iv,ct} (deploy publiczny) → ekran odblokowania +
// odszyfrowanie w przeglądarce: PBKDF2-SHA256 (klucz z hasła) + AES-256-GCM
// (format zgodny z generate.py:_encrypt_blob; hasło = sekret DATA_PASSPHRASE z CI).
//
// Sesja odblokowania: po udanym haśle stan "odblokowane" trzymamy w ciasteczku
// `lm_unlocked` z czasem życia 30 min, a odszyfrowane dane w localStorage (z tym
// samym terminem) + zapamiętujemy wersję buildu (`ver` z koperty). Sesja wygasa,
// gdy: minie 30 min, klikniesz 🔒, albo wdrożono NOWĄ wersję (inny `ver`).
// Ikona 🔒 w rogu = wyloguj/zablokuj na żądanie.
"use strict";
window.LM = (function () {
  const LS = window.localStorage;
  const DATA = "lm:data", EXP = "lm:exp", VER = "lm:ver", COOKIE = "lm_unlocked";
  const TTL = 30 * 60;                                  // 30 minut (w sekundach)
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const isEnv = (o) => !!(o && typeof o === "object" && o.ct && o.salt && o.iv);

  const setCookie = (maxAge) =>
    { document.cookie = COOKIE + "=1; max-age=" + maxAge + "; path=/; SameSite=Strict"; };
  const hasCookie = () =>
    document.cookie.split("; ").some(c => c.indexOf(COOKIE + "=") === 0);
  const clearSession = () => {
    try { LS.removeItem(DATA); LS.removeItem(EXP); LS.removeItem(VER); } catch (_) {}
    document.cookie = COOKIE + "=; max-age=0; path=/; SameSite=Strict";
  };

  async function deriveKey(pass, salt, iter) {
    const base = await crypto.subtle.importKey(
      "raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  }
  async function decryptEnv(env, pass) {
    const key = await deriveKey(pass, b64(env.salt), env.iter || 250000);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64(env.iv) }, key, b64(env.ct));
    return dec.decode(pt);                 // rzuci przy złym haśle (niezgodny tag GCM)
  }
  function remember(txt, ver) {
    const exp = Date.now() + TTL * 1000;
    try { LS.setItem(DATA, txt); LS.setItem(EXP, String(exp)); LS.setItem(VER, ver || ""); } catch (_) {}
    setCookie(TTL);
  }

  // mała ikona 🔒 w rogu — wyloguj/zablokuj na żądanie (tylko gdy dane są chronione)
  function addLockBtn() {
    if (document.getElementById("lmLock")) return;
    const b = document.createElement("button");
    b.id = "lmLock"; b.className = "lmlock"; b.type = "button";
    b.title = "Zablokuj (wyloguj)"; b.textContent = "🔒";
    b.onclick = () => lock();
    document.body.appendChild(b);
  }

  function lockScreen(env, onReady) {
    document.body.classList.add("locked");
    const ov = document.createElement("div");
    ov.className = "lockov";
    ov.innerHTML =
      '<form class=lockcard autocomplete=off>' +
      '  <div class=lockttl>🔒 Dane zaszyfrowane</div>' +
      '  <div class=locksub>Podaj hasło, aby odblokować aplikację.</div>' +
      '  <input id=lockpass type=password placeholder="Hasło" autocomplete="current-password">' +
      '  <button type=submit class=lockbtn>Odblokuj</button>' +
      '  <div id=lockerr class=lockerr></div>' +
      '</form>';
    document.body.appendChild(ov);
    const inp = ov.querySelector("#lockpass");
    const err = ov.querySelector("#lockerr");
    const btn = ov.querySelector(".lockbtn");
    ov.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      err.textContent = ""; btn.disabled = true; btn.textContent = "Odszyfrowywanie…";
      try {
        const txt = await decryptEnv(env, inp.value);
        const data = JSON.parse(txt);
        remember(txt, env.ver);
        ov.remove(); document.body.classList.remove("locked");
        addLockBtn();
        onReady(data);
      } catch (_) {
        err.textContent = "Błędne hasło.";
        btn.disabled = false; btn.textContent = "Odblokuj";
        inp.select();
      }
    };
    setTimeout(() => inp.focus(), 50);
  }

  async function unlock(onReady) {
    let raw;
    try { raw = await fetch("data.json", { cache: "no-cache" }).then(r => r.json()); }
    catch (e) { document.body.innerHTML = "<p style='padding:2rem'>Nie udało się wczytać danych (" + e + ").</p>"; return; }
    if (!isEnv(raw)) { onReady(raw); return; }          // plaintext (lokalnie / repo prywatne)
    // ważna sesja: ciasteczko (≤30 min) + dane w localStorage nieprzeterminowane
    // + ta sama wersja buildu (nowy deploy ⇒ sesja wygasa, pytamy o hasło ponownie)
    const exp = +(LS.getItem(EXP) || 0), cached = LS.getItem(DATA);
    const sameVer = LS.getItem(VER) === (raw.ver || "");
    if (hasCookie() && cached && sameVer && Date.now() < exp) {
      try { addLockBtn(); return onReady(JSON.parse(cached)); } catch (_) { clearSession(); }
    }
    clearSession();
    lockScreen(raw, onReady);
  }
  function lock() { clearSession(); location.reload(); }
  return { unlock, lock };
})();
