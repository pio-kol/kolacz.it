/* Service worker — Travel assistant PWA.
 * Strategia: network-first dla wszystkich GET-ów z tego origin.
 * Online → zawsze najnowsza wersja (i odświeżenie cache'u na później).
 * Offline / błąd sieci → odpowiedź z cache'u (app-shell + data.json precache'owane
 * przy instalacji), więc apteczka i vademecum działają bez sieci.
 * Uwaga: przy słabym/kapryśnym zasięgu fetch może chwilę „wisieć", zanim spadnie
 * do cache'u — najpewniejszy fallback to wtedy tryb samolotowy (sieć pada od razu).
 * Ścieżki względne — działa zarówno na /life-manager/ (Pages), jak i /travel/. */
const CACHE = "travel-assistant-v2";

// App shell: nawigacje + rdzeń. Adres względem zasięgu (scope) SW.
const CORE = [
  "./",
  "./index.html",
  "./kosmetyczki.html",
  "./jedzenie.html",
  "./apteczka.html",
  "./vademecum.html",
  "./druk.html",
  "./manifest.webmanifest",
  "./data.json",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  // addAll jest atomowe — jeśli któryś plik padnie, cache'ujemy pojedynczo,
  // żeby instalacja nie wywaliła się przez jeden 404.
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(CORE.map((u) => c.add(u).catch(() => null)))
    )
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const resp = await fetch(req);
        if (resp && resp.status === 200 && resp.type === "basic") {
          cache.put(req, resp.clone());          // odśwież cache na potrzeby offline
        }
        return resp;
      } catch (_) {
        // offline / błąd → cache; nawigacja bez trafienia → index
        const cached = await cache.match(req);
        return (
          cached ||
          (req.mode === "navigate"
            ? await cache.match("./index.html")
            : Response.error())
        );
      }
    })
  );
});
