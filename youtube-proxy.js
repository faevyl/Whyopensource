import https from "node:https";
import { resolveDestination } from "./policy.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const HOST_RE = /^(?:[a-z0-9-]+\.)*(?:youtube(?:-nocookie)?\.com|googlevideo\.com|ytimg\.com|ggpht\.com|googleusercontent\.com|gstatic\.com)$/i;

export const YOUTUBE_APP_PATH = /^\/(?:shorts\/|watch(?:\/|$)|results(?:\/|$)|feed(?:\/|$)|playlist(?:\/|$)|channel\/|@|c\/|user\/|embed\/|live\/|clip\/|post\/|hashtag\/)/;

const APP_THEMES = new Set([
  "chrome", "chromedark", "gust", "ink", "slate", "dusk", "gold", "copper", "sky", "frost",
  "ice", "lagoon", "purple", "wine", "plum", "rose", "neko", "matrix", "moss", "matcha",
  "midnight", "sunset", "ember", "aero", "paper",
]);

export function cleanYouTubeSearch(search) {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const theme = params.get("theme");
  if (theme && APP_THEMES.has(theme)) params.delete("theme");
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function youtubeAppRedirect(pathname, search) {
  if (!YOUTUBE_APP_PATH.test(pathname)) return "";
  return "/up/www.youtube.com" + pathname + cleanYouTubeSearch(search);
}

export function isYouTubeProxyPath(pathname) {
  if (pathname.startsWith("/up/")) return true;
  if (YOUTUBE_APP_PATH.test(pathname)) return true;
  return (
    pathname === "/iframe_api" ||
    pathname.startsWith("/youtubei/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/s/") ||
    pathname.startsWith("/generate_204") ||
    pathname === "/error_204" ||
    pathname.startsWith("/error_204") ||
    pathname.startsWith("/ptracking") ||
    pathname.startsWith("/api/stats") ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/opensearch")
  );
}

function allowedHost(host) {
  return HOST_RE.test(host);
}

function targetFromPath(pathname, search) {
  if (pathname.startsWith("/up/")) {
    const rest = pathname.slice(4);
    const slash = rest.indexOf("/");
    const host = slash === -1 ? rest : rest.slice(0, slash);
    const path = slash === -1 ? "/" : rest.slice(slash);
    return { host, path: path + cleanYouTubeSearch(search) };
  }
  return { host: "www.youtube.com", path: pathname + cleanYouTubeSearch(search) };
}

function rewriteLocation(value) {
  try {
    const url = new URL(value, "https://www.youtube.com");
    if (!allowedHost(url.hostname)) return value;
    return "/up/" + url.hostname + url.pathname + url.search;
  } catch {
    return value;
  }
}

function rewriteCookie(value, secure) {
  let next = value.replace(/;\s*domain=[^;]*/gi, "");
  if (!secure) next = next.replace(/;\s*secure/gi, "");
  return next;
}

function rewriteText(text, origin) {
  const abs = String(origin || "").replace(/\/$/, "");
  const absEsc = abs.replace(/\//g, "\\/");
  return text
    .replace(/https:\\\/\\\/([a-z0-9.-]+\.googlevideo\.com)/gi, absEsc + "\\/up\\/$1")
    .replace(/https:\/\/([a-z0-9.-]+\.googlevideo\.com)/gi, abs + "/up/$1")
    .replace(/https:\\\/\\\/([a-z0-9.-]+\.(?:youtube(?:-nocookie)?\.com|ytimg\.com|ggpht\.com|googleusercontent\.com|gstatic\.com))/gi, "\\/up\\/$1")
    .replace(/https:\/\/([a-z0-9.-]+\.(?:youtube(?:-nocookie)?\.com|ytimg\.com|ggpht\.com|googleusercontent\.com|gstatic\.com))/gi, "/up/$1")
    .replace(/(["'])\/(?!up\/)(shorts\/|watch\b|results\b|feed\b|playlist\b|channel\/|youtubei\/|api\/|s\/|embed\/|generate_204\b|iframe_api\b|opensearch)/gi, "$1/up/www.youtube.com/$2");
}

function shouldRewrite(type) {
  const lower = type.toLowerCase();
  return lower.includes("html") || lower.includes("css");
}

function rewriteAssetUrls(text) {
  return text
    .replace(/https:\\\/\\\/([a-z0-9.-]+\.(?:gstatic\.com|ytimg\.com|ggpht\.com|googleusercontent\.com|googlevideo\.com))/gi, "\\/up\\/$1")
    .replace(/https:\/\/([a-z0-9.-]+\.(?:gstatic\.com|ytimg\.com|ggpht\.com|googleusercontent\.com|googlevideo\.com))/gi, "/up/$1");
}

function rewriteMediaUrls(text, origin) {
  const abs = String(origin || "").replace(/\/$/, "");
  const absEsc = abs.replace(/\//g, "\\/");
  return text
    .replace(/https:\\\/\\\/([a-z0-9.-]+\.(?:googlevideo\.com|gstatic\.com|ytimg\.com|ggpht\.com|googleusercontent\.com))/gi, absEsc + "\\/up\\/$1")
    .replace(/https:\/\/([a-z0-9.-]+\.(?:googlevideo\.com|gstatic\.com|ytimg\.com|ggpht\.com|googleusercontent\.com))/gi, abs + "/up/$1");
}

const CLICK_GUARD = `<script>(function(){
if(navigator.serviceWorker){try{var realRegister=navigator.serviceWorker.register.bind(navigator.serviceWorker);realRegister("/sw.js").catch(function(){});navigator.serviceWorker.register=function(){return Promise.resolve({})}}catch(e){}}
var APP=/^\\/(?:shorts\\/|watch(?:\\/|$)|results(?:\\/|$)|feed(?:\\/|$)|playlist(?:\\/|$)|channel\\/|@|c\\/|user\\/|embed\\/|live\\/|clip\\/|post\\/|hashtag\\/)/;
var THEME=/^(?:chrome|chromedark|gust|ink|slate|dusk|gold|copper|sky|frost|ice|lagoon|purple|wine|plum|rose|neko|matrix|moss|matcha|midnight|sunset|ember|aero|paper)$/;
function stripTheme(u){
  try{ if(THEME.test(u.searchParams.get("theme")||"")) u.searchParams.delete("theme"); }catch(e){}
  return u;
}
function retarget(url){
  var u;
  try{ u=new URL(url, location.href); }catch(e){ return null; }
  if(u.origin!==location.origin){
    var host=u.hostname, path=u.pathname, search=u.search;
    if(host==="youtu.be"){ host="www.youtube.com"; path="/watch"; search="?v="+encodeURIComponent(u.pathname.replace(/^\\//,"")); }
    if(!/(^|\\.)youtube(-nocookie)?\\.com$/i.test(host)) return null;
    try{ var q=new URL(location.origin+path+search); stripTheme(q); path=q.pathname; search=q.search; }catch(e){}
    return location.origin+"/up/"+host+path+search+u.hash;
  }
  if(u.pathname.indexOf("/up/")===0){ stripTheme(u); return u.origin+u.pathname+u.search+u.hash; }
  if(u.pathname==="/"||u.pathname==="/yt"||APP.test(u.pathname)){
    stripTheme(u);
    var p=u.pathname==="/yt"?"/":u.pathname;
    return location.origin+"/up/www.youtube.com"+p+u.search+u.hash;
  }
  return null;
}
function sameHere(url){
  try{
    var a=new URL(location.href), b=new URL(url, location.href);
    return a.pathname===b.pathname&&a.search===b.search&&a.hash===b.hash;
  }catch(e){ return false; }
}
function pageKey(u){
  var path=u.pathname||"/";
  var cut=path.match(/^\\/up\\/[^/]+(\\/.*)?$/);
  if(cut) path=cut[1]||"/";
  return path+"|"+(u.searchParams.get("v")||"")+"|"+(u.searchParams.get("search_query")||u.searchParams.get("q")||"")+"|"+(u.searchParams.get("list")||"");
}
function samePage(url){
  try{
    return pageKey(new URL(location.href))===pageKey(new URL(url, location.href));
  }catch(e){ return false; }
}
var storm=false, navCount=0, navStamp=0;
try{
  var mark=pageKey(new URL(location.href));
  var prev=String(sessionStorage.getItem("why_yt_load")||"").split("~");
  var then=Number(prev[0])||0, count=Number(prev[1])||0, old=prev.slice(2).join("~");
  var now=Date.now();
  count=(old===mark && now-then<8000)?count+1:1;
  sessionStorage.setItem("why_yt_load", now+"~"+count+"~"+mark);
  if(count>2) storm=true;
}catch(e){}
function tooMany(){
  var now=Date.now();
  if(now-navStamp>5000){ navCount=0; navStamp=now; }
  navCount++;
  return storm||navCount>2;
}
function follow(url){
  var next=retarget(url);
  if(!next) return false;
  if(sameHere(next)) return true;
  if(samePage(next)||tooMany()){
    try{ history.replaceState(history.state,"", next); }catch(e){}
    return true;
  }
  location.replace(next);
  return true;
}
function armLocation(win){
  if(!win) return;
  try{
    var proto=win.Location&&win.Location.prototype;
    if(!proto||proto.__whyLoc) return;
    var hrefDesc=Object.getOwnPropertyDescriptor(proto,"href");
    var nativeAssign=proto.assign, nativeReplace=proto.replace;
    if(hrefDesc&&hrefDesc.set){
      Object.defineProperty(proto,"href",{
        configurable:true,
        get:hrefDesc.get,
        set:function(v){
          try{ if(follow(v)) return; }catch(e){}
          hrefDesc.set.call(this,v);
        }
      });
    }
    proto.assign=function(v){
      try{ if(follow(v)) return; }catch(e){}
      return nativeAssign.call(this,v);
    };
    proto.replace=function(v){
      try{ if(follow(v)) return; }catch(e){}
      return nativeReplace.call(this,v);
    };
    proto.__whyLoc=true;
  }catch(e){}
}
armLocation(window);
var MEDIA=/(^|\\.)(?:gstatic\\.com|ytimg\\.com|ggpht\\.com|googleusercontent\\.com|googlevideo\\.com)$/i;
function localMedia(url){
  try{
    var u=new URL(url, location.href);
    if(u.origin===location.origin||!MEDIA.test(u.hostname)) return url;
    return location.origin+"/up/"+u.hostname+u.pathname+u.search+u.hash;
  }catch(e){ return url; }
}
if(window.fetch){
  var origFetch=window.fetch;
  window.fetch=function(input, init){
    try{
      if(typeof input==="string"||input instanceof URL) input=localMedia(String(input));
      else if(input&&input.url) input=new Request(localMedia(input.url), input);
    }catch(e){}
    return origFetch.call(this, input, init);
  };
}
try{
  var xhrOpen=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(method, url){
    try{ if(typeof url==="string"&&arguments.length>1) arguments[1]=localMedia(url); }catch(e){}
    return xhrOpen.apply(this, arguments);
  };
}catch(e){}
try{
  var srcDesc=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,"src");
  if(srcDesc&&srcDesc.set){
    Object.defineProperty(HTMLImageElement.prototype,"src",{
      configurable:true,
      get:srcDesc.get,
      set:function(v){ srcDesc.set.call(this, localMedia(v)); }
    });
  }
}catch(e){}
function armHistory(win){
  if(!win) return;
  try{
    var HP=win.History&&win.History.prototype;
    if(!HP||HP.__whyArm) return;
    var push=HP.pushState, replace=HP.replaceState;
    function rewrite(url){ if(url==null) return url; try{ return retarget(url)||url; }catch(e){ return url; } }
    function leaveTop(hist){ try{ return window.top&&window.top!==window&&hist===window.top.history; }catch(e){ return false; } }
    HP.pushState=function(s,t,url){ if(leaveTop(this)) return; if(arguments.length<3||url==null) return push.apply(this,arguments); return push.call(this,s,t,rewrite(url)); };
    HP.replaceState=function(s,t,url){ if(leaveTop(this)) return; if(arguments.length<3||url==null) return replace.apply(this,arguments); return replace.call(this,s,t,rewrite(url)); };
    HP.__whyArm=true;
  }catch(e){}
}
armHistory(window);
try{
  function armFrame(node){ try{ if(node&&node.tagName==="IFRAME"){ armHistory(node.contentWindow); armLocation(node.contentWindow); } }catch(e){} }
  var origCreate=document.createElement;
  document.createElement=function(){
    var el=origCreate.apply(this, arguments);
    try{ if(String(arguments[0]||"").toLowerCase()==="iframe"){ armHistory(el.contentWindow); armLocation(el.contentWindow); } }catch(e){}
    return el;
  };
  var origAppend=Node.prototype.appendChild, origInsert=Node.prototype.insertBefore;
  Node.prototype.appendChild=function(node){ var out=origAppend.call(this, node); armFrame(node); return out; };
  Node.prototype.insertBefore=function(node, ref){ var out=origInsert.call(this, node, ref); armFrame(node); return out; };
}catch(e){}
try{
  var nativeOpen=window.open;
  window.open=function(url,target,features){
    var next=url? (retarget(url)||url) : url;
    if(next&&target&&/^_(top|parent)$/i.test(String(target))){ follow(next); return null; }
    return nativeOpen.call(window, next, target, features);
  };
}catch(e){}
function linkOf(ev){
  var path=ev.composedPath?ev.composedPath():[ev.target];
  for(var i=0;i<path.length;i++){var n=path[i];if(n&&(n.tagName==="A"||n.tagName==="AREA"))return n}
  return null;
}
document.addEventListener("click",function(ev){
  var a=linkOf(ev); if(!a) return;
  var raw=a.getAttribute("href")||"";
  if(!raw||raw.charAt(0)==="#"||/^(javascript:|mailto:|tel:)/i.test(raw)) return;
  var next=retarget(a.href);
  if(next){
    ev.preventDefault(); ev.stopImmediatePropagation();
    follow(a.href);
    return;
  }
  var u; try{ u=new URL(a.href, location.href); }catch(e){ return; }
  if(u.origin===location.origin) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
  if(window.parent&&window.parent!==window){ try{ window.parent.postMessage({t:"nav",url:u.href},"*"); }catch(e){} }
},true);
document.addEventListener("submit",function(ev){
  var f=ev.target; if(!f||f.tagName!=="FORM") return;
  var next=retarget(f.action||location.href); if(!next) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
  try{
    var u=new URL(next);
    if(String(f.method||"get").toLowerCase()!=="post"){
      var q=new URLSearchParams(new FormData(f));
      q.forEach(function(v,k){ u.searchParams.append(k,v); });
      stripTheme(u);
      follow(u.href);
    }
  }catch(e){}
},true);
try{
  var fixed=retarget(location.href);
  if(fixed&&!sameHere(fixed)) history.replaceState(history.state,"",fixed);
}catch(e){}
})();</script>`;

function rewriteHtmlOnly(html, origin) {
  const parts = html.split(/(<script\b[\s\S]*?<\/script>)/gi);
  return parts.map((part, index) => (index % 2 === 1 ? rewriteMediaUrls(part, origin) : rewriteText(part, origin))).join("");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 2_000_000) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function handleYouTubeProxy(req, res) {
  const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
  const target = targetFromPath(requestUrl.pathname, requestUrl.search);
  if (!allowedHost(target.host)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("That host is not part of YouTube.\n");
    return;
  }
  const decision = await resolveDestination(target.host, 443);
  if (!decision.ok) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("That address is blocked.\n");
    return;
  }

  let body = Buffer.alloc(0);
  if (req.method === "POST" || req.method === "PUT") {
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(413, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Request is too large.\n");
      return;
    }
  }

  const headers = {
    Host: target.host,
    Referer: "https://" + (target.host.endsWith("youtube.com") || target.host.endsWith("youtube-nocookie.com") ? "www.youtube.com/" : target.host + "/"),
    Origin: "https://" + (target.host.endsWith("youtube.com") || target.host.endsWith("youtube-nocookie.com") ? "www.youtube.com" : target.host),
  };
  const drop = new Set(["host", "connection", "content-length", "transfer-encoding", "keep-alive", "origin", "referer", "cookie", "accept-encoding"]);
  for (const [key, value] of Object.entries(req.headers)) {
    if (drop.has(key) || value == null) continue;
    headers[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  if (req.headers.cookie) headers.Cookie = req.headers.cookie;

  const secure = (req.headers["x-forwarded-proto"] || "").includes("https");
  const upstream = https.request(
    {
      host: decision.address,
      servername: target.host,
      port: 443,
      method: req.method || "GET",
      path: target.path || "/",
      headers,
    },
    (up) => {
      const responseHeaders = {};
      const cookies = [];
      for (let i = 0; i < up.rawHeaders.length; i += 2) {
        const key = up.rawHeaders[i];
        const value = up.rawHeaders[i + 1];
        const lower = key.toLowerCase();
        if (lower === "set-cookie") cookies.push(rewriteCookie(value, secure));
        else if (["content-security-policy", "content-security-policy-report-only", "x-frame-options", "content-security-policy-report-only", "transfer-encoding", "content-encoding", "content-length"].includes(lower)) continue;
        else if (lower === "location") responseHeaders.Location = rewriteLocation(value);
        else responseHeaders[key] = value;
      }
      if (cookies.length) responseHeaders["set-cookie"] = cookies;
      const type = String(up.headers["content-type"] || "");
      const origin = ((req.headers["x-forwarded-proto"] || "http").split(",")[0].trim() || "http") + "://" + (req.headers["x-forwarded-host"] || req.headers.host || "127.0.0.1");
      if (!shouldRewrite(type)) {
        res.writeHead(up.statusCode || 200, responseHeaders);
        up.pipe(res);
        return;
      }
      const chunks = [];
      let size = 0;
      up.on("data", (chunk) => {
        size += chunk.length;
        if (size < 12_000_000) chunks.push(chunk);
      });
      up.on("end", () => {
        let text = Buffer.concat(chunks).toString("utf8");
        if (type.includes("css")) text = rewriteAssetUrls(text);
        else {
          text = rewriteHtmlOnly(text, origin);
          if (text.includes("<head")) text = text.replace(/<head([^>]*)>/i, `<head$1>${CLICK_GUARD}`);
        }
        const payload = Buffer.from(text);
        responseHeaders["Content-Length"] = payload.length;
        res.writeHead(up.statusCode || 200, responseHeaders);
        res.end(payload);
      });
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("YouTube did not answer.\n");
    }
  });
  upstream.setTimeout(20000, () => upstream.destroy());
  if (body.length) upstream.write(body);
  upstream.end();
}
