# Why Revived

Why revived is the most advanced web proxy you can find, funded by nothing but spite of surveillance

- Also with three diffrent web engines, Wisp, Fetch.php (does not bypass cors sadly), libcurl.js (does bypass cors.)
Big creds to [ading2210](https://github.com/ading2210), who made [Sandstone](https://github.com/ading2210/sandstone), and to Nautilus Labs, who made Gust.

The public copy of this branch is [WWWWWHHHHHYYYYY](https://github.com/faevyl/Whyopensource/tree/WWWWWHHHHHYYYYY).

## What you can do with it

- Store downloads.
- Search with Brave unblocked with fully privacy.
- Customize!
- Watch YouTube? (still in wip)
- Run it on a Node machine with a Cloudflare tunnel, or drop the HTML and `fetch.php` on a PHP host such as InfinityFree, byte host or any nonstatic host
Nothing the proxy decrypts is collected, given away, or sold. On the Libcurl transport the page is read in the tab so it can be shown. The tunnel still only carries the locked bytes.



## Transports

The settings menu has these engines. Auto is the one to leave on.


| Engine           | What it does                                                                                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auto             | Wisp first. If that socket never answers, Libcurl. If Libcurl never answers, `fetch.php`. An HTTP error page is a real answer and does not count as a failure.                                                             |
| Wisp             | Opens the site from this server’s public tunnel. The socket is `wss://…/wisp/` and the slash at the end is required. If the tunnel is quiet it tries `wss://wisp.mercurywork.shop/` and stays with whichever one answered. |
| Libcurl          | A separate [libcurl.js](https://github.com/ading2210/libcurl.js) session in the browser. It finishes TLS in the tab, keeps its own cookie jar, and reads the page there.                                                   |
| fetch.php        | The PHP backend. A `__pot=` value opens a page.                                                                                                                                                                            |
| Legacy           | The older `fetch.php?url=` form.                                                                                                                                                                                           |
| Experimental PHP | Another `__pot=` path, with a different request shape.                                                                                                                                                                     |
| WASM             | Encodes the `__pot=` value in the browser before `fetch.php` sees it.                                                                                                                                                      |
| Legacy + WASM    | Sends both the plain `url` and the encoded `__pot=`.                                                                                                                                                                       |


Wisp itself speaks two versions on that one path. A client that sends `Sec-WebSocket-Protocol` gets v2. A client that leaves it off, which is what libcurl.js does, gets v1.

`fetch.php` is optional. The Wisp-only page does not need it. On a static host that has no PHP, use that page. On a nonstatic host, upload `fetch.php` next to the HTML you actually open.

## What stays closed

The server resolves the name before it connects. These never get a socket:

- Loopback, private, link-local, and cloud metadata addresses.
- Mail ports 25, 465, and 587.

A blocked destination closes the Wisp stream with code `0x48`.

## Files

The first name is the one on [the public branch](https://github.com/faevyl/Whyopensource/tree/WWWWWHHHHHYYYYY). The second is the name in a working checkout.


| Published name           | Local name               | Role                                                                                                   |
| ------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `Why.html`               | `whyrevived.html`        | The main page.                                                                                         |
| `Why.html but wisp only` | `wisp.html`              | Same page but the transport is only wisp                                                               |
| —                        | `index.html`             | The open page, served at `/` by the Node server.                                                       |
| `fetch.php`              | `fetch.php`              | Another server backend.                                                                                |
| `server.js`              | `server.js`              | The Node server. Serves the page, accepts `/wisp/`, and proxies YouTube under `/up/`.                  |
| `session.js`             | `session.js`             | One Wisp connection: streams, windows, and the packet queue.                                           |
| `policy.js`              | `policy.js`              | DNS, the address block list, and the mail-port block.                                                  |
| `youtube-proxy.js`       | `youtube-proxy.js`       | Fetches YouTube and rewrites the links.                                                                |
| `sw.js`                  | `sw.js`                  | Service worker. Sends YouTube and `gstatic` media through `/up/` when the page asks for them directly. |
| `check-wisp.mjs`         | `scripts/check-wisp.mjs` | Checks tls handshake, the name should be self explantory                                               |
| `run.public.sh`          | `scripts/run-public.sh`  | Starts the server and a Cloudflare quick tunnel.                                                       |
| `vendor/sandstone/`      | `vendor/sandstone/`      | Sandstone, under the AGPL-3.0. Served at `/sandstone.mjs`.                                             |


`server.js` has to be the Node program. On the public branch the file under that name is currently the service worker: about 1.4 KB, and it starts with `self.addEventListener`. Put the real `server.js` back under that name before `npm start`.

## Run

```bash
npm install
npm run public
```

That starts the server and a Cloudflare quick tunnel. The page shows the public `wss://…/wisp/` address once the tunnel is up. Restarting the tunnel gives a new address. Closing the tunnel does not keep the old address alive.

To run only the server:

```bash
npm start
```

The server listens on `127.0.0.1` and port `8741` unless `HOST` or `PORT` is set. `GET /health` returns `ok`.

Then check the handshake, a blocked destination, and a real TCP stream:

```bash
npm run check
```

`package.json` expects the check and the tunnel script under `scripts/`. The public branch has them at the repo root instead, as `check-wisp.mjs` and `run.public.sh`. Move those two into `scripts/` and name the tunnel script `run-public.sh`, or `npm run check` and `npm run public` will not find them.

Open the site at the local server root, or at the `https://….trycloudflare.com` address the tunnel prints.

## Credits

- [Sandstone](https://github.com/ading2210/sandstone) by [ading2210](https://github.com/ading2210). The bundled copy is [AGPL-3.0](vendor/sandstone/LICENSE). If you run it or hand the bundle to someone else, keep that license with it and ship your changes to it under the same terms.
- [Wisp](https://github.com/MercuryWorkshop/wisp-protocol/blob/v2/protocol.md) by Mercury Workshop. v2 on the protocol header, v1 when the header is absent. Without this, it wouldnt be unblockable
- [libcurl.js](https://github.com/ading2210/libcurl.js) by [ading2210](https://github.com/ading2210), Inspired the libcurl transport, orginally

 <img width="4096" height="1883" alt="image" src="https://github.com/user-attachments/assets/ed0ae687-fcee-4999-8caf-82cf5b4c7e02" />




## License

See [LICENSE](LICENSE). You can modify it and distribute it for private or public use. Do not sell it.
