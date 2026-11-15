self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const YOUTUBE_APP_PATH = /^\/(?:shorts\/|watch(?:\/|$)|results(?:\/|$)|feed(?:\/|$)|playlist(?:\/|$)|channel\/|@|c\/|user\/|embed\/|live\/|clip\/|post\/|hashtag\/)/;
const APP_THEME = /^(?:chrome|chromedark|gust|ink|slate|dusk|gold|copper|sky|frost|ice|lagoon|purple|wine|plum|rose|neko|matrix|moss|matcha|midnight|sunset|ember|aero|paper)$/;

function cleanSearch(search) {
  const params = new URLSearchParams(search || "");
  if (APP_THEME.test(params.get("theme") || "")) params.delete("theme");
  const next = params.toString();
  return next ? `?${next}` : "";
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin) return;
  if (!/(?:^|\.)(?:googlevideo\.com|youtube(?:-nocookie)?\.com|ytimg\.com|ggpht\.com|googleusercontent\.com|gstatic\.com)$/i.test(url.hostname)) return;
  const target = self.location.origin + "/up/" + url.hostname + url.pathname + url.search;
  event.respondWith(
    fetch(target, {
      method: event.request.method,
      headers: event.request.headers,
      body: event.request.method === "GET" || event.request.method === "HEAD" ? undefined : event.request.body,
      redirect: "follow",
    }),
  );
});
