#!/usr/bin/env node
import { Close, resolveDestination } from "../policy.js";

const port = Number(process.env.PORT) || 8741;
const httpBase = process.env.WISP_HTTP || `http://127.0.0.1:${port}`;
const wsUrl = process.env.WISP_URL || `ws://127.0.0.1:${port}/wisp/`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function encode(type, id, payload = Buffer.alloc(0)) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const out = Buffer.alloc(5 + body.length);
  out.writeUInt8(type, 0);
  out.writeUInt32LE(id >>> 0, 1);
  body.copy(out, 5);
  return out;
}

function decode(buf) {
  assert(buf.length >= 5, "short packet");
  return {
    type: buf.readUInt8(0),
    id: buf.readUInt32LE(1),
    payload: buf.subarray(5),
  };
}

function connect(url, protocols) {
  return new Promise((resolve, reject) => {
    const ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`open timed out for ${url}`));
    }, 15000);
    ws.binaryType = "arraybuffer";
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve(ws);
    }, { once: true });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(`socket error for ${url}`));
    }, { once: true });
  });
}

function demux(ws) {
  const queue = [];
  const waiters = [];
  ws.addEventListener("message", (event) => {
    const buf = Buffer.from(event.data);
    if (waiters.length) waiters.shift()(buf);
    else queue.push(buf);
  });
  return function next(ms = 8000) {
    if (queue.length) return Promise.resolve(queue.shift());
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for a packet")), ms);
      waiters.push((buf) => {
        clearTimeout(timer);
        resolve(buf);
      });
    });
  };
}

function parseExtensions(buf) {
  const found = [];
  let offset = 0;
  while (offset + 5 <= buf.length) {
    const id = buf.readUInt8(offset);
    const length = buf.readUInt32LE(offset + 1);
    offset += 5;
    const data = buf.subarray(offset, offset + length);
    offset += length;
    found.push({ id, data });
  }
  return found;
}

function clientInfo() {
  const udp = Buffer.from([0x01, 0, 0, 0, 0]);
  const confirm = Buffer.from([0x05, 0, 0, 0, 0]);
  return encode(0x05, 0, Buffer.concat([Buffer.from([2, 1]), udp, confirm]));
}

function connectPacket(id, type, host, port) {
  const name = Buffer.from(host);
  const payload = Buffer.alloc(3 + name.length);
  payload.writeUInt8(type, 0);
  payload.writeUInt16LE(port, 1);
  name.copy(payload, 3);
  return encode(0x01, id, payload);
}

async function expectClose(next, id, reason) {
  const packet = decode(await next());
  assert(packet.type === 0x04, `expected CLOSE, got type ${packet.type}`);
  assert(packet.id === id, `expected close on stream ${id}, got ${packet.id}`);
  assert(packet.payload[0] === reason, `expected reason 0x${reason.toString(16)}, got 0x${packet.payload[0]?.toString(16)}`);
}

async function policyChecks() {
  const loopback = await resolveDestination("127.0.0.1", 80);
  assert(!loopback.ok && loopback.reason === Close.BLOCKED, "loopback should be blocked");
  const mapped = await resolveDestination("::ffff:127.0.0.1", 80);
  assert(!mapped.ok && mapped.reason === Close.BLOCKED, "mapped loopback should be blocked");
  const priv = await resolveDestination("10.1.2.3", 443);
  assert(!priv.ok && priv.reason === Close.BLOCKED, "private address should be blocked");
  const mail = await resolveDestination("example.com", 25);
  assert(!mail.ok && mail.reason === Close.BLOCKED, "mail port should be blocked");
  const junk = await resolveDestination("not a host", 80);
  assert(!junk.ok && junk.reason === Close.INVALID, "bad hostname should be invalid");
  const meta = await resolveDestination("metadata.google.internal", 80);
  assert(!meta.ok && meta.reason === Close.BLOCKED, "metadata host should be blocked");
  const example = await resolveDestination("example.com", 80);
  assert(example.ok && example.family === 4, "example.com should resolve to a public IPv4 address");
}

async function httpChecks() {
  const page = await fetch(httpBase + "/");
  assert(page.status === 200, "home page status");
  const html = await page.text();
  assert(html.includes("<title>Why Revived</title>"), "missing title");
  assert(html.includes("<h1>Why Revived</h1>"), "missing heading");
  const status = await fetch(httpBase + "/status.json");
  const body = await status.json();
  assert(body.wispPath === "/wisp/", "status path");
  assert(body.udp === true, "udp flag");
  const health = await fetch(httpBase + "/health");
  assert((await health.text()).trim() === "ok", "health");
}

async function v2Checks(url) {
  const ws = await connect(url, ["wisp"]);
  const next = demux(ws);
  try {
    const info = decode(await next());
    assert(info.type === 0x05 && info.id === 0, "server should send INFO on stream 0");
    assert(info.payload[0] === 2 && info.payload[1] === 1, "server should announce 2.1");
    const extensions = parseExtensions(info.payload.subarray(2));
    const ids = extensions.map((item) => item.id).sort((a, b) => a - b);
    assert(ids.join(",") === "1,4,5", `unexpected extensions ${ids}`);
    const motd = extensions.find((item) => item.id === 4).data.toString("utf8");
    assert(motd.includes("Why Revived"), "motd");

    ws.send(clientInfo());
    const ready = decode(await next());
    assert(ready.type === 0x03 && ready.id === 0, "expected initial CONTINUE");
    assert(ready.payload.readUInt32LE(0) >= 1, "buffer size");

    ws.send(connectPacket(7, 1, "127.0.0.1", 9));
    await expectClose(next, 7, 0x48);
    ws.send(connectPacket(8, 1, "example.com", 25));
    await expectClose(next, 8, 0x48);
    ws.send(connectPacket(9, 1, "not a host", 80));
    await expectClose(next, 9, 0x41);

    ws.send(connectPacket(11, 1, "example.com", 80));
    ws.send(encode(0x02, 11, Buffer.from("GET / HTTP/1.0\r\nHost: example.com\r\nConnection: close\r\n\r\n")));
    const started = Date.now();
    let sawHttp = false;
    while (Date.now() - started < 12000) {
      const packet = decode(await next(12000));
      if (packet.id !== 11) continue;
      if (packet.type === 0x02 && packet.payload.includes("HTTP/")) {
        sawHttp = true;
        break;
      }
      if (packet.type === 0x04) {
        throw new Error(`example.com closed early with 0x${packet.payload[0]?.toString(16)}`);
      }
    }
    assert(sawHttp, "expected an HTTP response through the stream");
  } finally {
    ws.close();
  }
}

async function v1Checks(url) {
  const ws = await connect(url);
  const next = demux(ws);
  try {
    const first = decode(await next());
    assert(first.type === 0x03 && first.id === 0, "v1 should start with CONTINUE on stream 0");
    assert(first.payload.readUInt32LE(0) >= 1, "v1 buffer");
  } finally {
    ws.close();
  }
}

function dnsQuery() {
  const question = Buffer.concat([
    Buffer.from([7]),
    Buffer.from("example"),
    Buffer.from([3]),
    Buffer.from("com"),
    Buffer.from([0, 0, 1, 0, 1]),
  ]);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0x1234, 0);
  header.writeUInt16BE(0x0100, 2);
  header.writeUInt16BE(1, 4);
  return Buffer.concat([header, question]);
}

async function udpDirect() {
  const dgram = await import("node:dgram");
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const timer = setTimeout(() => {
      socket.close();
      resolve(false);
    }, 3000);
    socket.once("message", () => {
      clearTimeout(timer);
      socket.close();
      resolve(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    socket.send(dnsQuery(), 53, "1.1.1.1");
  });
}

async function udpChecks(url) {
  const direct = await udpDirect();
  if (!direct) {
    console.log("udp: skipped, this network did not answer 1.1.1.1:53");
    return;
  }
  const ws = await connect(url, ["wisp"]);
  const next = demux(ws);
  try {
    decode(await next());
    ws.send(clientInfo());
    decode(await next());
    ws.send(connectPacket(21, 2, "1.1.1.1", 53));
    ws.send(encode(0x02, 21, dnsQuery()));
    const started = Date.now();
    while (Date.now() - started < 8000) {
      const packet = decode(await next(8000));
      if (packet.id !== 21) continue;
      if (packet.type === 0x02 && packet.payload.length > 12) return;
      if (packet.type === 0x04) throw new Error(`udp closed 0x${packet.payload[0]?.toString(16)}`);
    }
    throw new Error("udp response missing");
  } finally {
    ws.close();
  }
}

const steps = [
  ["policy", policyChecks],
  ["http", httpChecks],
  ["v2", () => v2Checks(wsUrl)],
  ["v1", () => v1Checks(wsUrl)],
  ["udp", () => udpChecks(wsUrl)],
];

if (process.env.WISP_PUBLIC_ORIGIN) {
  const origin = process.env.WISP_PUBLIC_ORIGIN.replace(/\/$/, "");
  const publicWs = origin.replace(/^http/, "ws") + "/wisp/";
  steps.push(["public-http", async () => {
    const response = await fetch(origin + "/");
    assert(response.status === 200, "public page");
    assert((await response.text()).includes("<h1>Why Revived</h1>"), "public heading");
  }]);
  steps.push(["public-v2", () => v2Checks(publicWs)]);
}

try {
  for (const [name, fn] of steps) {
    await fn();
    console.log(`ok ${name}`);
  }
} catch (err) {
  console.error(err?.stack || err);
  process.exit(1);
}
