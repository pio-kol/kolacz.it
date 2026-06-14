/* Service worker — Travel assistant PWA.
 * Strategia: stale-while-revalidate dla wszystkich GET-ów z tego origin.
 * Aplikacja jest statyczna (HTML/CSS/JS + data.json), więc działa w pełni
 * offline po pierwszym otwarciu. Cache-busting (?v=hash) na assetach sprawia,
 * że nowe wersje same wchodzą do cache'u przy kolejnym fetchu.
 * Ścieżki względne — działa zarówno na /life-manager/ (Pages), jak i /travel/. */
const CACHE = "travel-assistant-v1";

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
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type === "basic") {
            cache.put(req, resp.clone());
          }
          return resp;
        })
        .catch(() => null);
      // szybki cache, świeżość w tle; offline → cache; nawigacja bez cache → index
      return (
        cached ||
        (await network) ||
        (req.mode === "navigate" ? cache.match("./index.html") : undefined)
      );
    })
  );
});
