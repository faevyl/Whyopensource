import { BlockList, isIP } from "node:net";
import { Resolver } from "node:dns/promises";

export const BUFFER_SIZE = 128;

export const MOTD =
  "why Revived. this wisp endpoint is public on cloudflare. Private networks and mail ports are closed.";

export const Close = {
  UNSPECIFIED: 0x01,
  VOLUNTARY: 0x02,
  NETWORK: 0x03,
  INCOMPATIBLE: 0x04,
  INVALID: 0x41,
  UNREACHABLE: 0x42,
  TIMEOUT: 0x43,
  REFUSED: 0x44,
  TRANSFER_TIMEOUT: 0x47,
  BLOCKED: 0x48,
  THROTTLED: 0x49,
};

const MAIL_PORTS = new Set([25, 465, 587]);

const block = new BlockList();
block.addSubnet("0.0.0.0", 8, "ipv4");
block.addSubnet("10.0.0.0", 8, "ipv4");
block.addSubnet("100.64.0.0", 10, "ipv4");
block.addSubnet("127.0.0.0", 8, "ipv4");
block.addSubnet("169.254.0.0", 16, "ipv4");
block.addSubnet("172.16.0.0", 12, "ipv4");
block.addSubnet("192.0.0.0", 24, "ipv4");
block.addSubnet("192.0.2.0", 24, "ipv4");
block.addSubnet("192.168.0.0", 16, "ipv4");
block.addSubnet("198.18.0.0", 15, "ipv4");
block.addSubnet("198.51.100.0", 24, "ipv4");
block.addSubnet("203.0.113.0", 24, "ipv4");
block.addSubnet("224.0.0.0", 4, "ipv4");
block.addSubnet("240.0.0.0", 4, "ipv4");
block.addSubnet("::", 128, "ipv6");
block.addSubnet("::1", 128, "ipv6");
block.addSubnet("2001:db8::", 32, "ipv6");
block.addSubnet("fc00::", 7, "ipv6");
block.addSubnet("fe80::", 10, "ipv6");
block.addSubnet("ff00::", 8, "ipv6");

const RESERVED_NAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google.com",
]);

const RESERVED_SUFFIXES = [
  ".localhost",
  ".local",
  ".localdomain",
  ".internal",
  ".home.arpa",
  ".intranet",
];

export function isBlockedIp(ip) {
  let address = ip;
  let family = isIP(address);
  if (family === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped && isIP(mapped[1]) === 4) {
      address = mapped[1];
      family = 4;
    }
  }
  if (family !== 4 && family !== 6) return true;
  return block.check(address, family === 4 ? "ipv4" : "ipv6");
}

export function normalizeHost(raw) {
  let host = String(raw ?? "").trim().toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (host.endsWith(".")) host = host.slice(0, -1);
  return host;
}

function validDnsName(host) {
  if (!host || host.length > 253 || host.includes("..")) return false;
  return host.split(".").every((label) => {
    if (label.length < 1 || label.length > 63) return false;
    return /^[a-z0-9]$/i.test(label) || /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/i.test(label);
  });
}

function lookupAll(host) {
  const resolver = new Resolver();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error("dns timeout");
      err.code = "ETIMEOUT";
      reject(err);
    }, 5000);
    timer.unref?.();
  });
  const work = (async () => {
    const [v4, v6] = await Promise.allSettled([resolver.resolve4(host), resolver.resolve6(host)]);
    const addresses = [];
    if (v4.status === "fulfilled") {
      for (const address of v4.value) addresses.push({ address, family: 4 });
    }
    if (v6.status === "fulfilled") {
      for (const address of v6.value) addresses.push({ address, family: 6 });
    }
    if (addresses.length === 0) {
      const reason = [v4, v6].find((item) => item.status === "rejected")?.reason;
      const err = reason instanceof Error ? reason : new Error("not found");
      if (!err.code) err.code = "ENOTFOUND";
      throw err;
    }
    return addresses;
  })();
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export async function resolveDestination(hostname, port, extraBlockedHosts = []) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, reason: Close.INVALID };
  }
  if (MAIL_PORTS.has(port)) return { ok: false, reason: Close.BLOCKED };

  const host = normalizeHost(hostname);
  if (!host || /[\s/%\\]/.test(host) || host.includes("@")) {
    return { ok: false, reason: Close.INVALID };
  }

  const blockedNames = new Set(RESERVED_NAMES);
  for (const name of extraBlockedHosts) blockedNames.add(normalizeHost(name));
  if (blockedNames.has(host) || RESERVED_SUFFIXES.some((suffix) => host.endsWith(suffix) || host === suffix.slice(1))) {
    return { ok: false, reason: Close.BLOCKED };
  }

  const family = isIP(host);
  if (family) {
    if (isBlockedIp(host)) return { ok: false, reason: Close.BLOCKED };
    return { ok: true, address: host, family };
  }

  if (/^\d+$/.test(host) || (/^\d+(\.\d+){3}$/.test(host) && !isIP(host))) {
    return { ok: false, reason: Close.INVALID };
  }
  if (!validDnsName(host)) return { ok: false, reason: Close.INVALID };

  try {
    const addresses = await lookupAll(host);
    if (addresses.some((item) => isBlockedIp(item.address))) {
      return { ok: false, reason: Close.BLOCKED };
    }
    const picked = addresses.find((item) => item.family === 4) || addresses[0];
    return { ok: true, address: picked.address, family: picked.family };
  } catch (err) {
    if (err?.code === "ETIMEOUT") return { ok: false, reason: Close.TIMEOUT };
    return { ok: false, reason: Close.UNREACHABLE };
  }
}
