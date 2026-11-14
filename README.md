# Why Revived
Currently the most advanced web proxy with anti-detect, tls handshaking, browser headers and etc. Big creds to ading2210 who made sandstone, and 
Nautilus Labs who made gust
also use public [Wisp](https://github.com/MercuryWorkshop/wisp-protocol/blob/v2/protocol.md) server behind it (v2, and v1 for libcurl.js). Use Cloudflare, it publishes the page and the websocket, so both stay reachable without a console attached.

The websocket endpoint is `/wisp/` and always ends with a slash. Clients that send `Sec-WebSocket-Protocol` are in v2. Clients that omit it get v1.

Private, loopback, link-local, and metadata addresses are refused. Mail ports 25, 465, and 587 are refused too.

`fetch.php` is a backend for Why.html and is optinal. `__pot=` value opens a page. Currently `fetch.php` is in brave and is not required, if you use it without `fetch.php` on a static host use `Why.html but singlefile`.

## Run

```bash
npm install
npm run public
```

That starts the server and a Cloudflare quick tunnel. The page should show the public `wss://…/wisp/` address once the tunnel is up. Restarting the tunnel gives a new address.

To run only the server:

```bash
npm start
```

Then check the handshake, a blocked destination, and a real TCP stream:

```bash
npm run check
```

Open the site at the local server root, or at the `https://….trycloudflare.com` address printed by the tunnel.
