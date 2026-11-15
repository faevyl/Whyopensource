(function (root) {
  var enc = new TextEncoder();
  var dec = new TextDecoder();

  function concat(parts) {
    var n = 0;
    for (var i = 0; i < parts.length; i++) n += parts[i].length;
    var out = new Uint8Array(n);
    var o = 0;
    for (var j = 0; j < parts.length; j++) {
      out.set(parts[j], o);
      o += parts[j].length;
    }
    return out;
  }
  function u8(n) { return Uint8Array.of(n & 255); }
  function u16(n) { var b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n); return b; }
  function u24(n) { return Uint8Array.of((n >>> 16) & 255, (n >>> 8) & 255, n & 255); }
  function u32(n) { var b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; }
  function ascii(s) { return enc.encode(s); }
  function same(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    var n = 0;
    for (var i = 0; i < a.length; i++) n |= a[i] ^ b[i];
    return n === 0;
  }
  function b64ToU8(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 255;
    return out;
  }
  function bytesKey(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }

  function readTlv(buf, offset) {
    if (offset >= buf.length) throw new Error("truncated certificate");
    var tag = buf[offset];
    var i = offset + 1;
    var len = buf[i++];
    if (len === 0x80) throw new Error("bad certificate");
    if (len & 0x80) {
      var n = len & 0x7f;
      len = 0;
      for (var k = 0; k < n; k++) len = (len * 256) + buf[i++];
    }
    var end = i + len;
    if (end > buf.length) throw new Error("truncated certificate");
    return { tag: tag, header: offset, valueStart: i, end: end };
  }
  function children(buf, tlv) {
    var out = [];
    var i = tlv.valueStart;
    while (i < tlv.end) {
      var child = readTlv(buf, i);
      out.push(child);
      i = child.end;
    }
    return out;
  }
  function oidToString(bytes) {
    if (!bytes.length) return "";
    var parts = [Math.floor(bytes[0] / 40), bytes[0] % 40];
    var n = 0;
    for (var i = 1; i < bytes.length; i++) {
      n = n * 128 + (bytes[i] & 0x7f);
      if ((bytes[i] & 0x80) === 0) { parts.push(n); n = 0; }
    }
    return parts.join(".");
  }
  function bitBytes(buf, tlv) {
    return buf.subarray(tlv.valueStart + 1, tlv.end);
  }
  function parseTime(buf, tlv) {
    var s = dec.decode(buf.subarray(tlv.valueStart, tlv.end)).replace(/Z$/, "");
    var year;
    var rest;
    if (tlv.tag === 0x17) {
      year = Number(s.slice(0, 2));
      year += year >= 50 ? 1900 : 2000;
      rest = s.slice(2);
    } else {
      year = Number(s.slice(0, 4));
      rest = s.slice(4);
    }
    return Date.UTC(year, Number(rest.slice(0, 2)) - 1, Number(rest.slice(2, 4)), Number(rest.slice(4, 6)), Number(rest.slice(6, 8)), Number(rest.slice(8, 10)));
  }
  function parseCn(buf, subjectTlv) {
    var rdns = children(buf, subjectTlv);
    for (var i = 0; i < rdns.length; i++) {
      var at = children(buf, rdns[i]);
      for (var j = 0; j < at.length; j++) {
        var pair = children(buf, at[j]);
        var oid = oidToString(buf.subarray(pair[0].valueStart, pair[0].end));
        if (oid === "2.5.4.3") return dec.decode(buf.subarray(pair[1].valueStart, pair[1].end));
      }
    }
    return "";
  }
  function parseSan(octet) {
    var seq = readTlv(octet, 0);
    var names = children(octet, seq);
    var out = [];
    for (var i = 0; i < names.length; i++) {
      if (names[i].tag === 0x82) out.push(dec.decode(octet.subarray(names[i].valueStart, names[i].end)).toLowerCase());
    }
    return out;
  }
  function parseCa(octet) {
    var seq = readTlv(octet, 0);
    if (seq.valueStart >= seq.end) return false;
    var first = readTlv(octet, seq.valueStart);
    return first.tag === 0x01 && octet[first.valueStart] !== 0;
  }
  function parseCert(der) {
    var top = children(der, readTlv(der, 0));
    var tbsTlv = top[0];
    var algTlv = top[1];
    var tbs = der.subarray(tbsTlv.header, tbsTlv.end);
    var sig = bitBytes(der, top[2]);
    var sigOid = oidToString(der.subarray(children(der, algTlv)[0].valueStart, children(der, algTlv)[0].end));
    var body = children(der, tbsTlv);
    var i = 0;
    if (body[i] && body[i].tag === 0xa0) i++;
    i += 2;
    var issuerTlv = body[i++];
    var validity = children(der, body[i++]);
    var subjectTlv = body[i++];
    var spkiTlv = body[i++];
    var san = [];
    var isCa = false;
    while (i < body.length) {
      if (body[i].tag === 0xa3) {
        var wrap = children(der, body[i]);
        var exts = children(der, wrap[0]);
        for (var e = 0; e < exts.length; e++) {
          var parts = children(der, exts[e]);
          var oid = oidToString(der.subarray(parts[0].valueStart, parts[0].end));
          var val = der.subarray(parts[parts.length - 1].valueStart, parts[parts.length - 1].end);
          if (oid === "2.5.29.17") san = san.concat(parseSan(val));
          if (oid === "2.5.29.19") isCa = parseCa(val);
        }
      }
      i++;
    }
    return {
      tbs: tbs,
      spki: der.subarray(spkiTlv.header, spkiTlv.end),
      sig: sig,
      sigOid: sigOid,
      issuer: der.subarray(issuerTlv.header, issuerTlv.end),
      subject: der.subarray(subjectTlv.header, subjectTlv.end),
      notBefore: parseTime(der, validity[0]),
      notAfter: parseTime(der, validity[1]),
      san: san,
      cn: parseCn(der, subjectTlv),
      isCa: isCa
    };
  }
  function sigInfo(oid) {
    if (oid === "1.2.840.10045.4.3.2") return { kind: "ecdsa", hash: "SHA-256" };
    if (oid === "1.2.840.10045.4.3.3") return { kind: "ecdsa", hash: "SHA-384" };
    if (oid === "1.2.840.113549.1.1.11") return { kind: "rsa", hash: "SHA-256" };
    if (oid === "1.2.840.113549.1.1.12") return { kind: "rsa", hash: "SHA-384" };
    if (oid === "1.2.840.113549.1.1.13") return { kind: "rsa", hash: "SHA-512" };
    throw new Error("unsupported certificate signature");
  }
  function sigInfoBytes(hashByte, sigByte) {
    var hash = hashByte === 4 ? "SHA-256" : hashByte === 5 ? "SHA-384" : hashByte === 6 ? "SHA-512" : "";
    if (!hash) throw new Error("unsupported signature hash");
    if (sigByte === 3) return { kind: "ecdsa", hash: hash };
    if (sigByte === 1) return { kind: "rsa", hash: hash };
    throw new Error("unsupported signature type");
  }
  function curveOf(spki) {
    if (findBytes(spki, Uint8Array.of(0x2b, 0x81, 0x04, 0x00, 0x22)) >= 0) return "P-384";
    return "P-256";
  }
  function derSigToRaw(sig, size) {
    var seq = readTlv(sig, 0);
    var r = readTlv(sig, seq.valueStart);
    var s = readTlv(sig, r.end);
    function fixed(tlv) {
      var v = sig.subarray(tlv.valueStart, tlv.end);
      var i = 0;
      while (i < v.length - 1 && v[i] === 0) i++;
      v = v.subarray(i);
      if (v.length > size) throw new Error("signature integer is too wide");
      var out = new Uint8Array(size);
      out.set(v, size - v.length);
      return out;
    }
    return concat([fixed(r), fixed(s)]);
  }
  async function verifySig(info, spki, data, sig) {
    if (info.kind === "ecdsa") {
      var curve = curveOf(spki);
      var key = await crypto.subtle.importKey("spki", spki, { name: "ECDSA", namedCurve: curve }, false, ["verify"]);
      var raw = derSigToRaw(sig, curve === "P-384" ? 48 : 32);
      if (!await crypto.subtle.verify({ name: "ECDSA", hash: info.hash }, key, raw, data)) throw new Error("bad certificate signature");
      return;
    }
    var rsa = await crypto.subtle.importKey("spki", spki, { name: "RSASSA-PKCS1-v1_5", hash: info.hash }, false, ["verify"]);
    if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", rsa, sig, data)) throw new Error("bad certificate signature");
  }
  function hostOk(cert, host) {
    var name = host.toLowerCase();
    var names = cert.san.length ? cert.san : (cert.cn ? [cert.cn.toLowerCase()] : []);
    for (var i = 0; i < names.length; i++) {
      var pattern = names[i];
      if (pattern === name) return true;
      if (pattern.indexOf("*.") === 0) {
        var rest = pattern.slice(2);
        var dot = name.indexOf(".");
        if (dot > 0 && name.indexOf(".", 0) === dot && name.slice(dot + 1) === rest) return true;
      }
    }
    return false;
  }
  function datesOk(cert) {
    var now = Date.now();
    return now + 300000 >= cert.notBefore && now - 300000 <= cert.notAfter;
  }

  var roots = new Map();
  var caPem = "";
  var ready = null;

  function loadRoots(pem) {
    var map = new Map();
    var re = /-----BEGIN CERTIFICATE-----([A-Za-z0-9+/=\s]+)-----END CERTIFICATE-----/g;
    var m;
    while ((m = re.exec(pem))) {
      try {
        var cert = parseCert(b64ToU8(m[1].replace(/\s+/g, "")));
        var key = bytesKey(cert.subject);
        var list = map.get(key) || [];
        list.push(cert);
        map.set(key, list);
      } catch (e) {}
    }
    return map;
  }
  async function trustChain(certs, host) {
    if (!certs.length) throw new Error("the server sent no certificate");
    var nowCerts = certs;
    for (var i = 0; i < nowCerts.length; i++) {
      if (!datesOk(nowCerts[i])) throw new Error("a certificate is outside its dates");
    }
    if (!hostOk(nowCerts[0], host)) throw new Error("the certificate is not for " + host);
    for (var j = 0; j < nowCerts.length - 1; j++) {
      if (j > 0 && !nowCerts[j].isCa) throw new Error("an intermediate certificate is not a CA");
      await verifySig(sigInfo(nowCerts[j].sigOid), nowCerts[j + 1].spki, nowCerts[j].tbs, nowCerts[j].sig);
    }
    var last = nowCerts[nowCerts.length - 1];
    var self = roots.get(bytesKey(last.subject)) || [];
    for (var s = 0; s < self.length; s++) {
      if (same(self[s].spki, last.spki)) return;
    }
    var candidates = roots.get(bytesKey(last.issuer)) || [];
    for (var c = 0; c < candidates.length; c++) {
      try {
        await verifySig(sigInfo(last.sigOid), candidates[c].spki, last.tbs, last.sig);
        return;
      } catch (e) {}
    }
    throw new Error("the certificate chain is not trusted");
  }

  async function sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  }
  async function hmac(keyBytes, data) {
    var key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  }
  async function prf(secret, label, seed, length) {
    var material = concat([ascii(label), seed]);
    var out = new Uint8Array(0);
    var a = material;
    while (out.length < length) {
      a = await hmac(secret, a);
      var block = await hmac(secret, concat([a, material]));
      out = concat([out, block]);
    }
    return out.subarray(0, length);
  }

  function hs(type, body) {
    return concat([Uint8Array.of(type), u24(body.length), body]);
  }
  function record(type, payload) {
    return concat([Uint8Array.of(type, 3, 3), u16(payload.length), payload]);
  }
  function ext(type, payload) {
    return concat([u16(type), u16(payload.length), payload]);
  }

  function openTls(host, link) {
    var app = new Pipe();
    var incoming = new Uint8Array(0);
    var hsBuf = new Uint8Array(0);
    var transcript = new Uint8Array(0);
    var clientRandom = new Uint8Array(32);
    var serverRandom = new Uint8Array(32);
    var useEms = false;
    var receivingEncrypted = false;
    var recvSeq = 0;
    var sendSeq = 0;
    var recvKey = null;
    var sendKey = null;
    var failed = null;
    var helloDone, helloFail, finishedOk, finishedFail;
    var hello = new Promise(function (res, rej) { helloDone = res; helloFail = rej; });
    var finished = new Promise(function (res, rej) { finishedOk = res; finishedFail = rej; });
    hello.catch(function () {});
    finished.catch(function () {});
    var chain = Promise.resolve();
    var certs = [];
    var ske = null;

    function fail(err) {
      if (failed) return;
      failed = err;
      try { helloFail(err); } catch (e) {}
      try { finishedFail(err); } catch (e) {}
      app.end(err);
      try { link.close(); } catch (e) {}
    }

    async function onHandshake(msg) {
      var type = msg[0];
      if (type !== 20) transcript = concat([transcript, msg]);
      var body = msg.subarray(4);
      if (type === 2) {
        serverRandom = body.slice(2, 34);
        var o = 34;
        var sidLen = body[o]; o += 1 + sidLen;
        var cipher = (body[o] << 8) | body[o + 1]; o += 2;
        o += 1;
        if (cipher !== 0xc02b && cipher !== 0xc02f) throw new Error("the server picked a cipher this client does not speak");
        if (o + 2 <= body.length) {
          var extLen = (body[o] << 8) | body[o + 1]; o += 2;
          var end = o + extLen;
          while (o + 4 <= end) {
            var et = (body[o] << 8) | body[o + 1];
            var el = (body[o + 2] << 8) | body[o + 3];
            o += 4;
            if (et === 23) useEms = true;
            o += el;
          }
        }
      } else if (type === 11) {
        var p = 0;
        var listLen = (body[0] << 16) | (body[1] << 8) | body[2]; p = 3;
        var stop = 3 + listLen;
        certs = [];
        while (p + 3 <= stop) {
          var n = (body[p] << 16) | (body[p + 1] << 8) | body[p + 2]; p += 3;
          certs.push(parseCert(body.subarray(p, p + n)));
          p += n;
        }
      } else if (type === 12) {
        if (body[0] !== 3) throw new Error("unsupported key exchange");
        var curve = (body[1] << 8) | body[2];
        if (curve !== 0x0017) throw new Error("the server picked a curve this client does not speak");
        var pointLen = body[3];
        var point = body.slice(4, 4 + pointLen);
        var off = 4 + pointLen;
        ske = {
          point: point,
          params: body.slice(0, off),
          info: sigInfoBytes(body[off], body[off + 1]),
          sig: body.slice(off + 4, off + 4 + ((body[off + 2] << 8) | body[off + 3]))
        };
      } else if (type === 14) {
        if (!certs.length || !ske) throw new Error("the handshake left out a certificate");
        await trustChain(certs, host);
        var signed = concat([clientRandom, serverRandom, ske.params]);
        await verifySig(ske.info, certs[0].spki, signed, ske.sig);
        helloDone();
      } else if (type === 20) {
        var expect = await prf(recvKey.master, "server finished", await sha256(transcript), 12);
        if (!same(expect, body)) throw new Error("the server finished check failed");
        transcript = concat([transcript, msg]);
        finishedOk();
      }
    }

    async function decrypt(payload) {
      var explicit = payload.subarray(0, 8);
      var sealed = payload.subarray(8);
      var iv = concat([recvKey.iv, explicit]);
      var aad = new Uint8Array(13);
      var view = new DataView(aad.buffer);
      view.setUint32(4, recvSeq);
      aad[8] = recvKey.pendingType;
      aad[9] = 3; aad[10] = 3;
      view.setUint16(11, sealed.length - 16);
      var plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv, additionalData: aad, tagLength: 128 }, recvKey.crypto, sealed));
      recvSeq++;
      return plain;
    }

    async function handleRecord(type, payload) {
      if (type === 21) {
        if (payload[0] === 2) throw new Error("tls alert " + payload[1]);
        return;
      }
      if (!receivingEncrypted) {
        if (type === 22) await pushHandshake(payload);
        else if (type === 20) receivingEncrypted = true;
        return;
      }
      recvKey.pendingType = type;
      var plain = await decrypt(payload);
      if (type === 22) await pushHandshake(plain);
      else if (type === 23) app.push(plain);
    }
    async function pushHandshake(bytes) {
      hsBuf = concat([hsBuf, bytes]);
      while (hsBuf.length >= 4) {
        var len = (hsBuf[1] << 16) | (hsBuf[2] << 8) | hsBuf[3];
        if (hsBuf.length < 4 + len) return;
        var msg = hsBuf.slice(0, 4 + len);
        hsBuf = hsBuf.slice(4 + len);
        await onHandshake(msg);
      }
    }
    function feed(u8bytes) {
      chain = chain.then(async function () {
        incoming = concat([incoming, u8bytes]);
        while (incoming.length >= 5) {
          var len = (incoming[3] << 8) | incoming[4];
          if (incoming.length < 5 + len) return;
          var type = incoming[0];
          var payload = incoming.slice(5, 5 + len);
          incoming = incoming.slice(5 + len);
          await handleRecord(type, payload);
        }
      }).catch(fail);
    }

    async function encrypt(type, payload) {
      var explicit = new Uint8Array(8);
      new DataView(explicit.buffer).setUint32(4, sendSeq);
      var iv = concat([sendKey.iv, explicit]);
      var aad = new Uint8Array(13);
      var view = new DataView(aad.buffer);
      view.setUint32(4, sendSeq);
      aad[8] = type; aad[9] = 3; aad[10] = 3;
      view.setUint16(11, payload.length);
      var sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv, additionalData: aad, tagLength: 128 }, sendKey.crypto, payload));
      sendSeq++;
      link.send(record(type, concat([explicit, sealed])));
    }

    async function handshake() {
      crypto.getRandomValues(clientRandom);
      var pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
      var pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
      var sessionId = crypto.getRandomValues(new Uint8Array(32));
      var hostBytes = ascii(host);
      var sni = concat([u16(hostBytes.length + 3), u8(0), u16(hostBytes.length), hostBytes]);
      var groups = Uint8Array.of(0, 2, 0, 0x17);
      var points = Uint8Array.of(1, 0);
      var sigs = Uint8Array.of(0, 4, 4, 3, 4, 1);
      var extensions = concat([
        ext(0, sni),
        ext(10, groups),
        ext(11, points),
        ext(13, sigs),
        ext(23, new Uint8Array(0)),
        ext(0xff01, Uint8Array.of(0))
      ]);
      var body = concat([
        u16(0x0303),
        clientRandom,
        u8(32),
        sessionId,
        Uint8Array.of(0, 4, 0xc0, 0x2b, 0xc0, 0x2f),
        Uint8Array.of(1, 0),
        u16(extensions.length),
        extensions
      ]);
      var helloMsg = hs(1, body);
      transcript = helloMsg;
      link.send(record(22, helloMsg));
      await hello;
      if (failed) throw failed;
      var serverKey = await crypto.subtle.importKey("raw", ske.point, { name: "ECDH", namedCurve: "P-256" }, false, []);
      var shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: serverKey }, pair.privateKey, 256));
      var ckx = hs(16, concat([u8(pub.length), pub]));
      transcript = concat([transcript, ckx]);
      link.send(record(22, ckx));
      var sessionHash = await sha256(transcript);
      var master = useEms
        ? await prf(shared, "extended master secret", sessionHash, 48)
        : await prf(shared, "master secret", concat([clientRandom, serverRandom]), 48);
      var block = await prf(master, "key expansion", concat([serverRandom, clientRandom]), 40);
      sendKey = { iv: block.subarray(32, 36), master: master };
      recvKey = { iv: block.subarray(36, 40), master: master };
      sendKey.crypto = await crypto.subtle.importKey("raw", block.subarray(0, 16), { name: "AES-GCM" }, false, ["encrypt"]);
      recvKey.crypto = await crypto.subtle.importKey("raw", block.subarray(16, 32), { name: "AES-GCM" }, false, ["decrypt"]);
      var verify = await prf(master, "client finished", sessionHash, 12);
      var fin = hs(20, verify);
      transcript = concat([transcript, fin]);
      link.send(record(20, Uint8Array.of(1)));
      await encrypt(22, fin);
      await finished;
      if (failed) throw failed;
    }

    link.ondata = feed;
    link.onclose = function (err) { fail(err || new Error("the connection closed")); };
    var opened = handshake().catch(function (err) { fail(err); throw err; });
    return {
      opened: opened,
      pipe: app,
      write: async function (plain) {
        await opened;
        var off = 0;
        while (off < plain.length) {
          var chunk = plain.subarray(off, Math.min(plain.length, off + 8192));
          await encrypt(23, chunk);
          off += chunk.length;
        }
      },
      close: function () { try { link.close(); } catch (e) {} app.end(); }
    };
  }

  function Pipe() {
    this.buf = new Uint8Array(0);
    this.ended = false;
    this.err = null;
    this.wake = null;
  }
  Pipe.prototype.push = function (u8bytes) {
    if (!u8bytes || !u8bytes.length || this.ended) return;
    this.buf = concat([this.buf, u8bytes]);
    if (this.wake) { var w = this.wake; this.wake = null; w(); }
  };
  Pipe.prototype.end = function (err) {
    if (this.ended) return;
    this.ended = true;
    this.err = err || null;
    if (this.wake) { var w = this.wake; this.wake = null; w(); }
  };
  Pipe.prototype._waitMore = function () {
    var self = this;
    if (this.ended) return Promise.resolve();
    return new Promise(function (resolve) { self.wake = resolve; });
  };
  Pipe.prototype._take = async function (n) {
    while (this.buf.length < n) {
      if (this.ended) break;
      await this._waitMore();
    }
    var take = Math.min(n, this.buf.length);
    var out = this.buf.slice(0, take);
    this.buf = this.buf.slice(take);
    return out;
  };
  Pipe.prototype.read = async function (n) {
    var out = await this._take(n);
    if (out.length < n) throw this.err || new Error("the connection closed");
    return out;
  };
  Pipe.prototype.readUntil = async function (marker, limit) {
    while (true) {
      var at = findBytes(this.buf, marker);
      if (at >= 0) return this._take(at + marker.length);
      if (this.ended) throw this.err || new Error("the connection closed");
      if (this.buf.length > limit) throw new Error("the headers are too large");
      await this._waitMore();
    }
  };
  function findBytes(buf, marker) {
    if (buf.length < marker.length) return -1;
    for (var i = 0; i <= buf.length - marker.length; i++) {
      var ok = true;
      for (var j = 0; j < marker.length; j++) if (buf[i + j] !== marker[j]) { ok = false; break; }
      if (ok) return i;
    }
    return -1;
  }

  function packet(type, id, payload) {
    var out = new Uint8Array(5 + (payload ? payload.length : 0));
    out[0] = type;
    new DataView(out.buffer).setUint32(1, id, true);
    if (payload) out.set(payload, 5);
    return out;
  }

  function Wisp() {
    this.url = "";
    this.ws = null;
    this.opening = null;
    this.streams = new Map();
    this.nextId = 1;
    this.dead = false;
  }
  Wisp.prototype.open = function (url) {
    var self = this;
    if (this.ws && this.ws.readyState === 1 && this.url === url) return Promise.resolve();
    this.close();
    this.url = url;
    this.dead = false;
    this.opening = new Promise(function (resolve, reject) {
      var ws;
      try { ws = new WebSocket(url, ["wisp"]); }
      catch (e) { reject(e); return; }
      self.ws = ws;
      ws.binaryType = "arraybuffer";
      var timer = setTimeout(function () { reject(new Error("wisp did not answer")); try { ws.close(); } catch (e) {} }, 8000);
      ws.addEventListener("open", function () {});
      ws.addEventListener("error", function () { clearTimeout(timer); reject(new Error("wisp did not answer")); });
      ws.addEventListener("close", function () {
        clearTimeout(timer);
        self.dead = true;
        self.streams.forEach(function (stream) { stream.fail(new Error("wisp closed")); });
        self.streams.clear();
      });
      var settled = false;
      ws.addEventListener("message", function (ev) {
        self.onMessage(ev.data).then(function (ready) {
          if (ready && !settled) { settled = true; clearTimeout(timer); resolve(); }
        }, function (err) {
          if (!settled) { settled = true; clearTimeout(timer); reject(err); }
        });
      });
    });
    return this.opening;
  };
  Wisp.prototype.close = function () {
    this.dead = true;
    this.streams.forEach(function (stream) { stream.fail(new Error("wisp closed")); });
    this.streams.clear();
    if (this.ws) { try { this.ws.close(); } catch (e) {} this.ws = null; }
  };
  Wisp.prototype.send = function (bytes) {
    if (!this.ws || this.ws.readyState !== 1) throw new Error("wisp is not open");
    this.ws.send(bytes);
  };
  Wisp.prototype.onMessage = async function (data) {
    var u8bytes = await asBytes(data);
    if (u8bytes.length < 5) return false;
    var view = new DataView(u8bytes.buffer, u8bytes.byteOffset, u8bytes.byteLength);
    var type = u8bytes[0];
    var id = view.getUint32(1, true);
    var payload = u8bytes.subarray(5);
    if (type === 5 && id === 0) {
      if (payload[0] !== 2) throw new Error("wisp version is not 2");
      this.send(packet(5, 0, Uint8Array.of(2, 1)));
      return true;
    }
    var stream = this.streams.get(id);
    if (!stream) return false;
    if (type === 3) {
      stream.credit = view.getUint32(0, true);
      stream.flush();
      return false;
    }
    if (type === 2) {
      stream.got += 1;
      if (stream.got >= 32) {
        stream.got = 0;
        try { this.send(packet(3, id, u32(1024))); } catch (e) {}
      }
      if (stream.ondata) stream.ondata(payload);
      return false;
    }
    if (type === 4) {
      this.streams.delete(id);
      try { stream.fail(new Error("wisp closed the stream")); } catch (e) {}
    }
    return false;
  };
  Wisp.prototype.tcp = function (host, port) {
    var self = this;
    var id = this.nextId++;
    var stream = {
      id: id,
      credit: 32,
      queue: [],
      got: 0,
      ondata: null,
      fail: function (err) { try { if (stream.onend) stream.onend(err); } catch (e) {} },
      onend: null,
      send: function (bytes) {
        stream.queue.push(bytes);
        stream.flush();
      },
      flush: function () {
        while (stream.credit > 0 && stream.queue.length) {
          self.send(packet(2, id, stream.queue.shift()));
          stream.credit--;
        }
      },
      close: function () {
        self.streams.delete(id);
        try { self.send(packet(4, id, Uint8Array.of(0x02))); } catch (e) {}
      }
    };
    this.streams.set(id, stream);
    var hostBytes = ascii(host);
    var body = new Uint8Array(3 + hostBytes.length);
    body[0] = 1;
    new DataView(body.buffer).setUint16(1, port, true);
    body.set(hostBytes, 3);
    this.send(packet(1, id, body));
    return stream;
  };

  async function asBytes(data) {
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (typeof Blob !== "undefined" && data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
    return new Uint8Array(0);
  }

  var wispUrl = "";
  var wisp = new Wisp();

  async function dial(host, port, secure) {
    await wisp.open(wispUrl);
    var stream = wisp.tcp(host, port);
    if (!secure) {
      var raw = new Pipe();
      stream.ondata = function (bytes) { raw.push(bytes); };
      stream.onend = function (err) { raw.end(err); };
      return { pipe: raw, write: async function (bytes) { stream.send(bytes); }, close: function () { stream.close(); raw.end(); } };
    }
    var feed = null;
    var link = {
      send: function (bytes) { stream.send(bytes); },
      close: function () { stream.close(); },
      onclose: null,
      set ondata(fn) { feed = fn; }
    };
    var tls = openTls(host, link);
    stream.ondata = function (bytes) { if (feed) feed(bytes); };
    stream.onend = function (err) {
      tls.pipe.end(err);
      if (link.onclose) link.onclose(err);
    };
    await tls.opened;
    return tls;
  }

  var headerMark = ascii("\r\n\r\n");

  async function readHttp(pipe, method) {
    var head = await pipe.readUntil(headerMark, 65536);
    var text = dec.decode(head);
    var lines = text.split("\r\n");
    var statusLine = lines.shift() || "";
    var match = /^HTTP\/\d(?:\.\d)?\s+(\d{3})\s*(.*)$/.exec(statusLine);
    if (!match) throw new Error("the response was not http");
    if (match[1] === "100") return readHttp(pipe, method);
    var pairs = [];
    var joined = {};
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i]) continue;
      var cut = lines[i].indexOf(":");
      if (cut < 0) continue;
      var name = lines[i].slice(0, cut).trim();
      var value = lines[i].slice(cut + 1).trim();
      pairs.push([name, value]);
      var key = name.toLowerCase();
      if (key === "set-cookie") joined[key] = joined[key] ? (joined[key] + "\n" + value) : value;
      else joined[key] = joined[key] ? (joined[key] + ", " + value) : value;
    }
    var body;
    if (method === "HEAD" || match[1] === "204" || match[1] === "304") {
      body = new Uint8Array(0);
    } else if ((joined["transfer-encoding"] || "").toLowerCase().indexOf("chunked") >= 0) {
      var chunks = [];
      while (true) {
        var sizeLine = dec.decode(await readLine(pipe)).trim();
        var size = parseInt(sizeLine, 16);
        if (!size) {
          while (true) {
            var trailer = dec.decode(await readLine(pipe));
            if (trailer === "\r\n" || trailer === "\n") break;
          }
          break;
        }
        chunks.push(await pipe.read(size));
        await pipe.read(2);
      }
      body = concat(chunks);
    } else if (joined["content-length"]) {
      body = await pipe.read(Number(joined["content-length"]));
    } else if ((joined.connection || "").toLowerCase() === "close") {
      var rest = [];
      while (true) {
        if (pipe.ended && !pipe.buf.length) break;
        var more = await pipe._take(pipe.buf.length || 1);
        if (!more.length) break;
        rest.push(more);
        if (pipe.ended && !pipe.buf.length) break;
      }
      body = concat(rest);
    } else body = new Uint8Array(0);
    return { status: Number(match[1]), statusText: match[2] || "", pairs: pairs, headers: joined, body: body };
  }
  async function readLine(pipe) {
    var out = new Uint8Array(0);
    while (true) {
      var b = await pipe.read(1);
      out = concat([out, b]);
      if (b[0] === 10) return out;
    }
  }

  async function maybeInflate(body, encoding) {
    var encName = (encoding || "").toLowerCase();
    if (!encName || encName === "identity" || typeof DecompressionStream !== "function") return body;
    var format = "";
    var choices = ["gzip", "deflate", "br"];
    for (var i = 0; i < choices.length; i++) {
      if (encName.indexOf(choices[i]) < 0) continue;
      try { new DecompressionStream(choices[i]); format = choices[i]; break; } catch (e) {}
    }
    if (!format) return body;
    var stream = new Response(body).body.pipeThrough(new DecompressionStream(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function makeResponse(url, parsed) {
    var headers = new Headers();
    for (var i = 0; i < parsed.pairs.length; i++) {
      try { headers.append(parsed.pairs[i][0], parsed.pairs[i][1]); } catch (e) {}
    }
    var response = new Response(parsed.body, { status: parsed.status, statusText: parsed.statusText, headers: headers });
    try { Object.defineProperty(response, "url", { value: url }); } catch (e) {}
    response.raw_headers = parsed.pairs;
    return response;
  }

  function CookieJar() { this.items = new Map(); }
  CookieJar.prototype.store = function (line, url) {
    var parts = String(line).split(";");
    var first = parts.shift() || "";
    var eq = first.indexOf("=");
    if (eq < 0) return;
    var name = first.slice(0, eq).trim();
    var value = first.slice(eq + 1).trim();
    var u = new URL(url);
    var host = u.hostname.toLowerCase();
    var domain = host;
    var path = "/";
    var secure = false;
    var expires = 0;
    var hostOnly = true;
    for (var i = 0; i < parts.length; i++) {
      var bits = parts[i].split("=");
      var key = bits.shift().trim().toLowerCase();
      var val = bits.join("=").trim();
      if (key === "domain" && val) { domain = val.replace(/^\./, "").toLowerCase(); hostOnly = false; }
      else if (key === "path" && val) path = val;
      else if (key === "secure") secure = true;
      else if (key === "max-age" && val) expires = Date.now() + Number(val) * 1000;
      else if (key === "expires" && val) { var t = Date.parse(val); if (!isNaN(t)) expires = t; }
    }
    if (host !== domain && host.slice(-(domain.length + 1)) !== "." + domain) return;
    this.items.set(domain + "\n" + path + "\n" + name, { name: name, value: value, domain: domain, path: path, secure: secure, expires: expires, hostOnly: hostOnly });
  };
  CookieJar.prototype.header = function (url) {
    var u = new URL(url);
    var host = u.hostname.toLowerCase();
    var path = u.pathname || "/";
    var https = u.protocol === "https:";
    var now = Date.now();
    var pairs = [];
    this.items.forEach(function (cookie) {
      if (cookie.expires && cookie.expires < now) return;
      if (cookie.secure && !https) return;
      if (cookie.hostOnly ? host !== cookie.domain : (host !== cookie.domain && host.slice(-(cookie.domain.length + 1)) !== "." + cookie.domain)) return;
      if (path.indexOf(cookie.path) !== 0) return;
      pairs.push(cookie.name + "=" + cookie.value);
    });
    return pairs.join("; ");
  };

  function Session(cookies) {
    this.jar = cookies ? new CookieJar() : null;
    this.idle = new Map();
  }
  Session.prototype.close = function () {
    this.idle.forEach(function (conn) { try { conn.close(); } catch (e) {} });
    this.idle.clear();
  };
  Session.prototype.fetch = async function (input, init) {
    init = init || {};
    var current = new URL(typeof input === "string" ? input : String(input.url || input), this.base_url || undefined);
    var method = String(init.method || "GET").toUpperCase();
    var body = init.body == null ? null : await asBody(init.body);
    var hops = 0;
    while (hops++ < 8) {
      var secure = current.protocol === "https:";
      var port = Number(current.port || (secure ? 443 : 80));
      var key = (secure ? "s:" : "h:") + current.hostname + ":" + port;
      var conn = this.idle.get(key) || null;
      if (conn) this.idle.delete(key);
      if (!conn) conn = await dial(current.hostname, port, secure);
      var headers = collectHeaders(init.headers);
      if (!headers.host) headers.host = current.host;
      if (!headers["user-agent"]) headers["user-agent"] = (root.navigator && root.navigator.userAgent) || "WhyRevived";
      if (!headers.accept) headers.accept = "*/*";
      if (!headers["accept-encoding"] && typeof DecompressionStream === "function") {
        var supported = [];
        var formats = ["gzip", "deflate", "br"];
        for (var f = 0; f < formats.length; f++) {
          try { new DecompressionStream(formats[f]); supported.push(formats[f]); } catch (e) {}
        }
        if (supported.length) headers["accept-encoding"] = supported.join(", ");
      }
      var cookie = this.jar ? this.jar.header(current.href) : "";
      if (cookie) headers.cookie = cookie;
      var path = current.pathname + current.search;
      var lines = [method + " " + (path || "/") + " HTTP/1.1"];
      for (var name in headers) lines.push(name + ": " + headers[name]);
      lines.push("connection: keep-alive", "");
      var payload = ascii(lines.join("\r\n") + "\r\n");
      if (body && method !== "GET" && method !== "HEAD") payload = concat([payload, body]);
      try { await conn.write(payload); }
      catch (err) {
        conn = await dial(current.hostname, port, secure);
        await conn.write(payload);
      }
      var parsed = await readHttp(conn.pipe, method);
      if (this.jar && parsed.headers["set-cookie"]) {
        var setCookies = parsed.headers["set-cookie"].split("\n");
        for (var c = 0; c < setCookies.length; c++) this.jar.store(setCookies[c], current.href);
      }
      var redirect = parsed.status >= 300 && parsed.status < 400 && parsed.headers.location;
      var closeIt = (parsed.headers.connection || "").toLowerCase() === "close";
      if (!redirect && !closeIt) this.idle.set(key, conn);
      else if (!redirect) conn.close();
      if (!redirect) {
        parsed.body = await maybeInflate(parsed.body, parsed.headers["content-encoding"]);
        return makeResponse(current.href, parsed);
      }
      if (closeIt) conn.close();
      else this.idle.set(key, conn);
      var next = new URL(parsed.headers.location, current);
      if (parsed.status === 303 || ((parsed.status === 301 || parsed.status === 302) && method !== "GET" && method !== "HEAD")) {
        method = "GET";
        body = null;
      }
      current = next;
    }
    throw new Error("too many redirects");
  };

  function collectHeaders(input) {
    var out = {};
    if (!input) return out;
    if (typeof Headers !== "undefined" && input instanceof Headers) {
      input.forEach(function (value, key) { out[String(key).toLowerCase()] = value; });
      return out;
    }
    for (var key in input) out[String(key).toLowerCase()] = String(input[key]);
    return out;
  }
  async function asBody(body) {
    if (typeof body === "string") return ascii(body);
    if (body instanceof ArrayBuffer) return new Uint8Array(body);
    if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    if (typeof Blob !== "undefined" && body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
    return ascii(String(body));
  }

  function CurlSocket(host, port) {
    this.host = host;
    this.port = port || 443;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    this._conn = null;
    var self = this;
    dial(host, this.port, true).then(function (conn) {
      self._conn = conn;
      if (self.onopen) self.onopen();
      (async function () {
        try {
          while (true) {
            var chunk = await conn.pipe._take(conn.pipe.buf.length || 1);
            if (!chunk.length) break;
            if (self.onmessage) self.onmessage(chunk);
          }
        } catch (err) {
          if (self.onerror) self.onerror(err);
        }
        if (self.onclose) self.onclose();
      })();
    }, function (err) { if (self.onerror) self.onerror(err); });
  }
  CurlSocket.prototype.send = function (data) {
    if (!this._conn) return;
    var bytes = typeof data === "string" ? ascii(data) : data;
    this._conn.write(bytes);
  };
  CurlSocket.prototype.close = function () { if (this._conn) this._conn.close(); };

  function CurlWebSocket(url, protocols) {
    this.url = String(url);
    this.readyState = 0;
    this.binaryType = "blob";
    this._listeners = {};
    var parsed = new URL(this.url);
    var secure = parsed.protocol === "wss:";
    var port = Number(parsed.port || (secure ? 443 : 80));
    var self = this;
    this._ready = dial(parsed.hostname, port, secure).then(async function (conn) {
      self._conn = conn;
      var key = btoa(String.fromCharCode.apply(null, crypto.getRandomValues(new Uint8Array(16))));
      var lines = [
        "GET " + (parsed.pathname + parsed.search || "/") + " HTTP/1.1",
        "Host: " + parsed.host,
        "Upgrade: websocket",
        "Connection: Upgrade",
        "Sec-WebSocket-Key: " + key,
        "Sec-WebSocket-Version: 13"
      ];
      if (protocols && protocols.length) lines.push("Sec-WebSocket-Protocol: " + protocols.join(", "));
      lines.push("", "");
      await conn.write(ascii(lines.join("\r\n")));
      var head = dec.decode(await conn.pipe.readUntil(headerMark, 65536));
      if (head.indexOf("101") < 0) throw new Error("websocket upgrade failed");
      self.readyState = 1;
      self._emit("open", {});
      self._read(conn.pipe);
    }).catch(function (err) {
      self.readyState = 3;
      self._emit("error", { error: err });
      self._emit("close", { code: 1006 });
    });
  }
  CurlWebSocket.prototype.addEventListener = function (type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); };
  CurlWebSocket.prototype.removeEventListener = function (type, fn) {
    var list = this._listeners[type] || [];
    var at = list.indexOf(fn);
    if (at >= 0) list.splice(at, 1);
  };
  CurlWebSocket.prototype._emit = function (type, props) {
    var ev = { type: type };
    for (var k in props) ev[k] = props[k];
    var handler = this["on" + type];
    if (typeof handler === "function") { try { handler.call(this, ev); } catch (e) {} }
    var list = this._listeners[type] || [];
    for (var i = 0; i < list.length; i++) { try { list[i].call(this, ev); } catch (e) {} }
  };
  CurlWebSocket.prototype._read = async function (pipe) {
    var frag = [];
    var opcode = 0;
    try {
      while (this.readyState === 1) {
        var b0 = (await pipe.read(2));
        var fin = (b0[0] & 0x80) !== 0;
        var op = b0[0] & 0x0f;
        var len = b0[1] & 0x7f;
        var masked = (b0[1] & 0x80) !== 0;
        if (len === 126) len = new DataView((await pipe.read(2)).buffer).getUint16(0);
        else if (len === 127) { await pipe.read(4); var low = await pipe.read(4); len = new DataView(low.buffer).getUint32(0); }
        var mask = masked ? await pipe.read(4) : null;
        var payload = len ? await pipe.read(len) : new Uint8Array(0);
        if (mask) for (var i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
        if (op === 9) { await this._conn.write(frame(10, payload)); continue; }
        if (op === 8) { this.readyState = 3; this._emit("close", { code: payload.length >= 2 ? new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint16(0) : 1000 }); return; }
        if (op !== 0) opcode = op;
        frag.push(payload);
        if (!fin) continue;
        var data = concat(frag);
        frag = [];
        if (opcode === 1) this._emit("message", { data: dec.decode(data) });
        else this._emit("message", { data: this.binaryType === "arraybuffer" ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data });
      }
    } catch (err) {
      if (this.readyState === 1) { this.readyState = 3; this._emit("close", { code: 1006 }); }
    }
  };
  CurlWebSocket.prototype.send = function (data) {
    var self = this;
    this._ready.then(function () {
      if (self.readyState !== 1) return;
      if (typeof data === "string") return self._conn.write(frame(1, ascii(data)));
      var bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer || data, data.byteOffset || 0, data.byteLength || data.length);
      return self._conn.write(frame(2, bytes));
    });
  };
  CurlWebSocket.prototype.close = function () {
    this.readyState = 2;
    if (this._conn) this._conn.close();
  };
  function frame(opcode, payload) {
    var mask = crypto.getRandomValues(new Uint8Array(4));
    var len = payload.length;
    var headLen = len < 126 ? 2 : len < 65536 ? 4 : 10;
    var out = new Uint8Array(headLen + 4 + len);
    out[0] = 0x80 | opcode;
    if (len < 126) out[1] = 0x80 | len;
    else if (len < 65536) { out[1] = 0x80 | 126; new DataView(out.buffer).setUint16(2, len); }
    else { out[1] = 0x80 | 127; new DataView(out.buffer).setUint32(6, len); }
    out.set(mask, headLen);
    for (var i = 0; i < len; i++) out[headLen + 4 + i] = payload[i] ^ mask[i % 4];
    return out;
  }

  var shared = new Session(false);

  var api = {
    transport: "wisp",
    version: { lib: "why-revived" },
    logger: function (type, text) { if (root.console && root.console[type]) root.console[type](text); },
    set_websocket: function (url) {
      var next = String(url || "");
      if (next && next.charAt(next.length - 1) !== "/") next += "/";
      if (next === wispUrl) return;
      wispUrl = next;
      shared.close();
      wisp.close();
    },
    load_wasm: function () {
      if (ready) return ready;
      ready = (async function () {
        var pem = caPem;
        if (!pem) {
          var res = await fetch("/vendor/cacert.pem", { cache: "force-cache" });
          if (!res.ok) throw new Error("the certificate bundle did not load");
          pem = await res.text();
        }
        roots = loadRoots(pem);
        if (!roots.size) throw new Error("the certificate bundle was empty");
      })();
      return ready;
    },
    fetch: function (input, init) { return shared.fetch(input, init); },
    HTTPSession: function (options) {
      var session = new Session(!!(options && options.enable_cookies));
      session.base_url = "";
      return session;
    },
    WebSocket: CurlWebSocket,
    TLSSocket: CurlSocket,
    _setCaPem: function (pem) { caPem = pem; ready = null; },
    _parseCert: parseCert,
    _startTls: openTls
  };
  root.libcurl = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
