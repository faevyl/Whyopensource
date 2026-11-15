import dgram from "node:dgram";
import net from "node:net";
import { BUFFER_SIZE, Close, MOTD, resolveDestination } from "./policy.js";

const MAX_STREAMS = 128;
const CONNECT_TIMEOUT_MS = 8_000;
const IDLE_TIMEOUT_MS = 120_000;
const UDP_PER_SECOND = 200;
const CONTINUE_EVERY = 64;

const textDecoder = new TextDecoder("utf-8", { fatal: true });

export function encodePacket(type, streamId, payload = Buffer.alloc(0)) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const out = Buffer.allocUnsafe(5 + body.length);
  out.writeUInt8(type, 0);
  out.writeUInt32LE(streamId >>> 0, 1);
  body.copy(out, 5);
  return out;
}

export function decodePacket(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (buf.length < 5) return null;
  return {
    type: buf.readUInt8(0),
    streamId: buf.readUInt32LE(1),
    payload: buf.subarray(5),
  };
}

function extension(id, data = Buffer.alloc(0)) {
  const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const head = Buffer.alloc(5);
  head.writeUInt8(id, 0);
  head.writeUInt32LE(body.length, 1);
  return Buffer.concat([head, body]);
}

function parseExtensions(buf) {
  const found = [];
  let offset = 0;
  while (offset + 5 <= buf.length) {
    const id = buf.readUInt8(offset);
    const length = buf.readUInt32LE(offset + 1);
    offset += 5;
    if (length < 0 || offset + length > buf.length) throw new Error("bad extension");
    found.push(id);
    offset += length;
  }
  if (offset !== buf.length) throw new Error("trailing extension bytes");
  return found;
}

function codeFor(err) {
  if (err?.code === "ECONNREFUSED") return Close.REFUSED;
  if (err?.code === "ETIMEDOUT" || err?.code === "EAI_AGAIN") return Close.TIMEOUT;
  if (
    err?.code === "ENOTFOUND" ||
    err?.code === "EAI_NODATA" ||
    err?.code === "EHOSTUNREACH" ||
    err?.code === "ENETUNREACH"
  ) {
    return Close.UNREACHABLE;
  }
  return Close.NETWORK;
}

function destroySocket(socket) {
  if (!socket) return;
  try {
    if (typeof socket.destroy === "function") socket.destroy();
    else socket.close();
  } catch {
    // Already gone.
  }
}

export class WispSession {
  constructor(ws, { version, blockedHosts }) {
    this.ws = ws;
    this.version = version;
    this.blockedHosts = blockedHosts;
    this.streams = new Map();
    this.dead = false;
    this.handshakeDone = version === 1;
    this.clientExtensions = new Set();
    if (version === 1) this.sendContinue(0, BUFFER_SIZE);
    else this.send(serverInfoPacket());
  }

  send(packet) {
    if (this.dead || this.ws.readyState !== 1) return;
    this.ws.send(packet, { binary: true, compress: false });
  }

  sendContinue(streamId, remaining) {
    const payload = Buffer.alloc(4);
    payload.writeUInt32LE(Math.max(0, remaining) >>> 0, 0);
    this.send(encodePacket(0x03, streamId, payload));
  }

  sendClose(streamId, reason) {
    this.send(encodePacket(0x04, streamId, Buffer.from([reason & 0xff])));
  }

  queued(stream) {
    return stream.queue.length - stream.qHead;
  }

  freeSlots(stream) {
    return Math.max(0, BUFFER_SIZE - this.queued(stream));
  }

  enqueue(stream, payload) {
    stream.queue.push(payload);
    if (stream.qHead > 48 && stream.qHead * 2 > stream.queue.length) {
      stream.queue = stream.queue.slice(stream.qHead);
      stream.qHead = 0;
    }
  }

  dequeue(stream) {
    const chunk = stream.queue[stream.qHead];
    stream.queue[stream.qHead] = undefined;
    stream.qHead += 1;
    return chunk;
  }

  onMessage(data, isBinary) {
    if (this.dead || !isBinary) return;
    const packet = decodePacket(data);
    if (!packet) return;

    if (this.version === 2 && !this.handshakeDone) {
      if (packet.type === 0x05 && packet.streamId === 0) {
        this.onInfo(packet.payload);
        return;
      }
      if (packet.type === 0x04 && packet.streamId === 0) {
        this.shutdown();
        return;
      }
      this.sendClose(0, Close.UNSPECIFIED);
      this.shutdown();
      return;
    }

    switch (packet.type) {
      case 0x01:
        if (packet.streamId === 0) {
          this.sendClose(0, Close.INVALID);
          return;
        }
        this.onConnect(packet.streamId, packet.payload);
        break;
      case 0x02:
        this.onData(packet.streamId, packet.payload);
        break;
      case 0x03:
        break;
      case 0x04:
        if (packet.streamId === 0) this.shutdown();
        else this.onClientClose(packet.streamId);
        break;
      default:
        if (packet.streamId === 0) {
          this.sendClose(0, Close.UNSPECIFIED);
          this.shutdown();
        }
        break;
    }
  }

  onInfo(payload) {
    if (payload.length < 2) {
      this.sendClose(0, Close.UNSPECIFIED);
      this.shutdown();
      return;
    }
    if (payload[0] !== 2) {
      this.sendClose(0, Close.INCOMPATIBLE);
      this.shutdown();
      return;
    }
    try {
      this.clientExtensions = new Set(parseExtensions(payload.subarray(2)));
    } catch {
      this.sendClose(0, Close.UNSPECIFIED);
      this.shutdown();
      return;
    }
    this.handshakeDone = true;
    this.sendContinue(0, BUFFER_SIZE);
  }

  onConnect(streamId, payload) {
    if (this.streams.has(streamId)) return;
    if (payload.length < 3) {
      this.sendClose(streamId, Close.INVALID);
      return;
    }
    const type = payload[0];
    const port = payload.readUInt16LE(1);
    if (type !== 0x01 && type !== 0x02) {
      this.sendClose(streamId, Close.INVALID);
      return;
    }
    if (this.version === 2 && type === 0x02 && !this.clientExtensions.has(0x01)) {
      this.sendClose(streamId, Close.INVALID);
      return;
    }
    let host;
    try {
      host = textDecoder.decode(payload.subarray(3));
    } catch {
      this.sendClose(streamId, Close.INVALID);
      return;
    }
    if (!host) {
      this.sendClose(streamId, Close.INVALID);
      return;
    }
    if (this.streams.size >= MAX_STREAMS) {
      this.sendClose(streamId, Close.THROTTLED);
      return;
    }

    const stream = {
      id: streamId,
      type,
      port,
      address: null,
      queue: [],
      qHead: 0,
      ready: false,
      closed: false,
      receivedSinceContinue: 0,
      drainWait: false,
      socket: null,
      hits: [],
    };
    this.streams.set(streamId, stream);
    this.beginConnect(stream, host, port);
  }

  async beginConnect(stream, host, port) {
    let decision;
    try {
      const extra = this.blockedHosts?.() ?? [];
      decision = await resolveDestination(host, port, extra);
    } catch {
      if (!stream.closed) this.finish(stream, Close.NETWORK);
      return;
    }
    if (stream.closed || this.dead) return;
    if (!decision.ok) {
      this.finish(stream, decision.reason);
      return;
    }
    stream.address = decision.address;
    stream.port = port;
    stream.family = decision.family;
    if (stream.type === 0x02) this.openUdp(stream);
    else this.openTcp(stream);
  }

  openTcp(stream) {
    const socket = net.connect({
      host: stream.address,
      port: stream.port,
      family: stream.family,
      allowHalfOpen: false,
    });
    stream.socket = socket;
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30_000);
    socket.setTimeout(CONNECT_TIMEOUT_MS);

    socket.once("error", (err) => {
      if (!stream.closed) this.finish(stream, codeFor(err));
    });
    socket.once("timeout", () => {
      if (!stream.closed) this.finish(stream, stream.ready ? Close.TRANSFER_TIMEOUT : Close.TIMEOUT);
    });
    socket.once("connect", () => {
      if (stream.closed) {
        socket.destroy();
        return;
      }
      stream.ready = true;
      socket.setTimeout(IDLE_TIMEOUT_MS);
      this.flush(stream);
      this.sendContinue(stream.id, this.freeSlots(stream));
    });
    socket.on("data", (chunk) => this.sendData(stream, chunk));
    socket.once("close", (hadError) => {
      if (!stream.closed) this.finish(stream, hadError ? Close.NETWORK : Close.VOLUNTARY);
    });
  }

  openUdp(stream) {
    const socket = dgram.createSocket(stream.address.includes(":") ? "udp6" : "udp4");
    stream.socket = socket;
    stream.ready = true;
    socket.once("error", () => {
      if (!stream.closed) this.finish(stream, Close.NETWORK);
    });
    socket.on("message", (message) => this.sendData(stream, message));
    this.flush(stream);
  }

  onData(streamId, payload) {
    const stream = this.streams.get(streamId);
    if (!stream || stream.closed) return;
    if (stream.type === 0x02) {
      if (payload.length > 65507) {
        this.finish(stream, Close.INVALID);
        return;
      }
      const now = Date.now();
      stream.hits = stream.hits.filter((stamp) => now - stamp < 1000);
      if (stream.hits.length >= UDP_PER_SECOND) {
        this.finish(stream, Close.THROTTLED);
        return;
      }
      stream.hits.push(now);
    }
    if (this.queued(stream) >= BUFFER_SIZE) {
      this.finish(stream, Close.THROTTLED);
      return;
    }
    this.enqueue(stream, payload);
    this.flush(stream);
    if (stream.type === 0x01) {
      stream.receivedSinceContinue += 1;
      if (
        stream.receivedSinceContinue >= BUFFER_SIZE ||
        stream.receivedSinceContinue >= CONTINUE_EVERY
      ) {
        this.sendContinue(stream.id, this.freeSlots(stream));
        stream.receivedSinceContinue = 0;
      }
    }
  }

  flush(stream) {
    if (!stream.ready || stream.closed || !stream.socket) return;
    if (stream.type === 0x02) {
      while (stream.qHead < stream.queue.length) {
        const chunk = this.dequeue(stream);
        stream.socket.send(chunk, stream.port, stream.address, (err) => {
          if (err && !stream.closed) this.finish(stream, Close.NETWORK);
        });
      }
      return;
    }

    const socket = stream.socket;
    if (socket.destroyed) return;
    while (stream.qHead < stream.queue.length && !socket.writableNeedDrain) {
      const chunk = this.dequeue(stream);
      const ok = socket.write(chunk);
      if (!ok) {
        if (!stream.drainWait) {
          stream.drainWait = true;
          socket.once("drain", () => {
            stream.drainWait = false;
            if (stream.closed) return;
            this.flush(stream);
            this.sendContinue(stream.id, this.freeSlots(stream));
            stream.receivedSinceContinue = 0;
          });
        }
        break;
      }
    }
  }

  sendData(stream, chunk) {
    if (stream.closed || this.dead || this.ws.readyState !== 1) return;
    this.ws.send(encodePacket(0x02, stream.id, chunk), { binary: true, compress: false }, () => {
      const socket = stream.socket;
      if (!socket || stream.closed || stream.type !== 0x01) return;
      if (this.ws.bufferedAmount < 256 * 1024 && socket.isPaused()) socket.resume();
    });
    if (stream.type === 0x01 && stream.socket && this.ws.bufferedAmount > 1024 * 1024) {
      stream.socket.pause();
    }
  }

  onClientClose(streamId) {
    const stream = this.streams.get(streamId);
    if (!stream || stream.closed) return;
    stream.closed = true;
    this.streams.delete(streamId);
    destroySocket(stream.socket);
  }

  finish(stream, reason) {
    if (stream.closed) return;
    stream.closed = true;
    this.streams.delete(stream.id);
    destroySocket(stream.socket);
    this.sendClose(stream.id, reason);
  }

  shutdown() {
    this.dead = true;
    this.destroy();
    if (this.ws.readyState === 1) this.ws.close();
  }

  destroy() {
    this.dead = true;
    for (const stream of this.streams.values()) {
      stream.closed = true;
      destroySocket(stream.socket);
    }
    this.streams.clear();
  }
}

function serverInfoPacket() {
  const payload = Buffer.concat([
    Buffer.from([2, 1]),
    extension(0x01),
    extension(0x04, Buffer.from(MOTD, "utf8")),
    extension(0x05),
  ]);
  return encodePacket(0x05, 0, payload);
}
