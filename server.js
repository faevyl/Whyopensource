import fs from "node:fs";
import http from "node:http";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { BUFFER_SIZE, MOTD } from "./policy.js";
import { WispSession } from "./session.js";
import { handleYouTubeProxy, isYouTubeProxyPath } from "./youtube-proxy.js";

const PORT = Number(process.env.PORT) || 8741;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_URL_FILE = process.env.WISP_PUBLIC_URL_FILE || "/tmp/wisp-public-url";
const MAX_CONNECTIONS = 150;
const MAX_PER_IP = 40;
const HTML_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "whyrevived.html");

const perIp = new Map();
let connections = 0;

function readPublicOrigin() {
  try {
    const text = fs.readFileSync(PUBLIC_URL_FILE, "utf8").trim();
    if (!text) return null;
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function blockedHosts() {
  const origin = readPublicOrigin();
  if (!origin) return [];
  try {
    return [new URL(origin).hostname];
  } catch {
    return [];
  }
}

function clientKey(req) {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && isIP(cf.trim())) return cf.trim();
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0].trim();
    if (isIP(first)) return first;
  }
  return req.socket.remoteAddress || "local";
}

function send(res, status, body, headers, method) {
  const payload = method === "HEAD" ? null : body;
  res.writeHead(status, {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(payload);
}

function statusBody() {
  const origin = readPublicOrigin();
  const websocket = origin ? `wss://${new URL(origin).host}/wisp/` : null;
  return JSON.stringify({
    service: "why-revived",
    wispPath: "/wisp/",
    versions: [1, "2.1"],
    bufferSize: BUFFER_SIZE,
    udp: true,
    motd: MOTD,
    publicOrigin: origin,
    publicWebSocket: websocket,
  });
}

const server = http.createServer((req, res) => {
  const method = req.method || "GET";
  let pathname = "/";
  try {
    pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
  } catch {
    send(res, 400, "Bad request\n", { "Content-Type": "text/plain; charset=utf-8" }, method);
    return;
  }
  const youtubeAppPath = /^\/(?:shorts\/|watch(?:\/|$)|results(?:\/|$)|feed\/|playlist(?:\/|$)|channel\/|@|c\/|user\/|embed\/|live\/|clip\/|post\/|hashtag\/)/.test(pathname);
  const iframeHome = req.headers["sec-fetch-dest"] === "iframe" && (pathname === "/" || pathname === "/yt" || youtubeAppPath);
  if (iframeHome || isYouTubeProxyPath(pathname)) {
    if (iframeHome) {
      const search = new URL(req.url || "/", "http://127.0.0.1").search;
      const suffix = pathname === "/" || pathname === "/yt" ? "/" : pathname;
      req.url = "/up/www.youtube.com" + suffix + search;
    }
    handleYouTubeProxy(req, res).catch(() => {
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("YouTube did not answer.\n");
      }
    });
    return;
  }
  if (method !== "GET" && method !== "HEAD") {
    send(res, 405, "Method not allowed\n", { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" }, method);
    return;
  }

  if (pathname === "/go") {
    const target = new URL(req.url || "/", "http://127.0.0.1").searchParams.get("u") || "";
    const embedded = JSON.stringify(target).replace(/</g, "\\u003c");
    const body = `<!doctype html><meta charset="utf-8"><title></title><script>(function(){var u=${embedded};if(!u)return;if(window.parent&&window.parent!==window){parent.postMessage({t:"nav",url:u},"*");return;}location.replace("/?open="+encodeURIComponent(u));})();</script>`;
    send(res, 200, body, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }, method);
    return;
  }
  if (pathname === "/sandstone.mjs") {
    const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "vendor", "sandstone", "sandstone.mjs");
    fs.readFile(filePath, (err, file) => {
      if (err) {
        send(res, 500, "Sandstone unavailable\n", { "Content-Type": "text/plain; charset=utf-8" }, method);
        return;
      }
      send(res, 200, file, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" }, method);
    });
    return;
  }
  if (pathname === "/sw.js") {
    fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "sw.js"), (err, file) => {
      if (err) {
        send(res, 500, "Service worker unavailable\n", { "Content-Type": "text/plain; charset=utf-8" }, method);
        return;
      }
      send(res, 200, file, { "Content-Type": "application/javascript; charset=utf-8", "Service-Worker-Allowed": "/" }, method);
    });
    return;
  }
  if (pathname === "/health") {
    send(res, 200, "ok\n", { "Content-Type": "text/plain; charset=utf-8" }, method);
    return;
  }
  if (pathname === "/status.json") {
    send(res, 200, statusBody(), { "Content-Type": "application/json; charset=utf-8" }, method);
    return;
  }
  if (pathname === "/" || pathname === "/index.html" || pathname === "/wisp.html" || pathname === "/whyrevived.html" || pathname === "/WhyRevived.html") {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pagePath = pathname === "/wisp.html"
      ? path.join(here, "wisp.html")
      : (pathname === "/whyrevived.html" || pathname === "/WhyRevived.html")
        ? HTML_PATH
        : path.join(here, "index.html");
    fs.readFile(pagePath, (err, html) => {
      if (err) {
        send(res, 500, "Page unavailable\n", { "Content-Type": "text/plain; charset=utf-8" }, method);
        return;
      }
      send(res, 200, html, { "Content-Type": "text/html; charset=utf-8" }, method);
    });
    return;
  }
  send(res, 404, "Not found\n", { "Content-Type": "text/plain; charset=utf-8" }, method);
});

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 1024 * 1024,
  handleProtocols(protocols) {
    return protocols.values().next().value || false;
  },
});

function rejectUpgrade(socket, status, reason) {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

server.on("upgrade", (req, socket, head) => {
  let pathname = "/";
  try {
    pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
  } catch {
    rejectUpgrade(socket, 400, "Bad Request");
    return;
  }
  if (pathname !== "/wisp" && pathname !== "/wisp/") {
    rejectUpgrade(socket, 404, "Not Found");
    return;
  }
  if (connections >= MAX_CONNECTIONS) {
    rejectUpgrade(socket, 503, "Service Unavailable");
    return;
  }
  const ip = clientKey(req);
  if ((perIp.get(ip) || 0) >= MAX_PER_IP) {
    rejectUpgrade(socket, 429, "Too Many Requests");
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    connections += 1;
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    const version = req.headers["sec-websocket-protocol"] ? 2 : 1;
    const session = new WispSession(ws, { version, blockedHosts });
    const ping = setInterval(() => {
      if (ws.readyState === 1) ws.ping();
    }, 25_000);

    const release = () => {
      clearInterval(ping);
      connections = Math.max(0, connections - 1);
      const left = (perIp.get(ip) || 1) - 1;
      if (left <= 0) perIp.delete(ip);
      else perIp.set(ip, left);
      session.destroy();
    };

    ws.on("message", (data, isBinary) => session.onMessage(data, isBinary));
    ws.on("error", () => ws.close());
    ws.once("close", release);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Why Revived listening on http://${HOST}:${PORT}`);
});
