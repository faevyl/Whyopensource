self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const YOUTUBE_APP_PATH = /^\/(?:shorts\/|watch(?:\/|$)|results(?:\/|$)|feed\/|playlist(?:\/|$)|channel\/|@|c\/|user\/|embed\/|live\/|clip\/|post\/|hashtag\/)/;

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin) {
    if (event.request.mode === "navigate" && YOUTUBE_APP_PATH.test(url.pathname)) {
      event.respondWith(Response.redirect(self.location.origin + "/up/www.youtube.com" + url.pathname + url.search + url.hash, 302));
    }
    return;
  }
  if (!/(?:^|\.)(?:googlevideo\.com|youtube(?:-nocookie)?\.com|ytimg\.com|ggpht\.com|googleusercontent\.com)$/i.test(url.hostname)) return;
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
