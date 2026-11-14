<?php
/**
 * nonstaic host fetch for why revived
 * upload this next to your index.html
 * UI:     fetch.php?url=  or  fetch.php?__pot=
 * Probe:  fetch.php?ping=1  /  fetch.php?ping=gif
 * WS:     pages connect from the browser
 * i recommend hosting b-cdn links and amazon web hosting services.
 */
error_reporting(0);
@set_time_limit(28);
@ini_set('memory_limit', '128M');

function cors() {
  header('Access-Control-Allow-Origin: *');
  header('Access-Control-Allow-Methods: *');
  header('Access-Control-Allow-Headers: *');
  $script = isset($_SERVER['SCRIPT_NAME']) ? basename($_SERVER['SCRIPT_NAME']) : '';
  if ($script === 'experimental.php') header('X-Why-Engine: experimental');
}
function b64e($s) { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64d($s) {
  $s = strtr((string)$s, '-_', '+/');
  $s .= str_repeat('=', (4 - strlen($s) % 4) % 4);
  $d = base64_decode($s, true);
  return $d === false ? null : $d;
}
function blocked_host($host) {
  $host = strtolower(trim($host, '[]'));
  if ($host === '' || $host === 'localhost' || $host === '0.0.0.0') return true;
  if (filter_var($host, FILTER_VALIDATE_IP)) {
    return !filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
  }
  $ips = @gethostbynamel($host);
  if (!$ips) return true;
  foreach ($ips as $ip) {
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return true;
  }
  return false;
}
function join_url($base, $rel) {
  $rel = trim($rel);
  if ($rel === '' || $rel[0] === '#') return null;
  if (preg_match('#^(data:|blob:|javascript:|about:|mailto:|tel:|ws:|wss:)#i', $rel)) return null;
  if (preg_match('#^https?://#i', $rel)) return $rel;
  if (strpos($rel, '//') === 0) return 'https:' . $rel;
  $p = parse_url($base);
  if (!$p || empty($p['host'])) return null;
  $origin = $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '');
  if ($rel[0] === '?') return $origin . (isset($p['path']) ? $p['path'] : '/') . $rel;
  if ($rel[0] === '/') return $origin . $rel;
  $dir = isset($p['path']) && $p['path'] !== '' ? $p['path'] : '/';
  if (substr($dir, -1) !== '/') $dir = preg_replace('#/[^/]*$#', '/', $dir);
  $out = array();
  foreach (explode('/', $dir . $rel) as $i => $seg) {
    if ($seg === '.' || $seg === '') { if ($seg === '' && empty($out)) $out[] = ''; continue; }
    if ($seg === '..') { array_pop($out); continue; }
    $out[] = $seg;
  }
  $path = implode('/', $out);
  if ($path === '' || $path[0] !== '/') $path = '/' . $path;
  return $origin . $path;
}
function proxy_prefix() {
  $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
    || (isset($_SERVER['SERVER_PORT']) && (string)$_SERVER['SERVER_PORT'] === '443');
  $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'localhost';
  $script = isset($_SERVER['SCRIPT_NAME']) ? $_SERVER['SCRIPT_NAME'] : '/fetch.php';
  if ($script === '' || $script[0] !== '/') $script = '/' . ltrim($script, '/');
  $q = (isset($_GET['overhaul']) && (string)$_GET['overhaul'] === '1') ? 'overhaul=1&' : '';
  return ($https ? 'https' : 'http') . '://' . $host . $script . '?' . $q . '__pot=';
}
function enc_url($abs, $prefix) { return $prefix . rawurlencode(b64e($abs)); }
function rewrite_attr($url, $base, $prefix) {
  $url = trim($url);
  if ($url === '' || $url[0] === '#' || preg_match('#^(javascript:|data:|blob:|about:|mailto:|tel:|ws:|wss:)#i', $url)) return null;
  if (strpos($url, '__pot=') !== false || strpos($url, 'fetch.php') !== false) return null;
  $abs = join_url($base, $url);
  return $abs ? enc_url($abs, $prefix) : null;
}
function rewrite_srcset($val, $base, $prefix) {
  $out = array();
  foreach (explode(',', $val) as $part) {
    $part = trim($part);
    if ($part === '') continue;
    if (preg_match('/^(\S+)(\s+.*)?$/', $part, $m)) {
      $n = rewrite_attr($m[1], $base, $prefix);
      $out[] = ($n ? $n : $m[1]) . (isset($m[2]) ? $m[2] : '');
    } else $out[] = $part;
  }
  return implode(', ', $out);
}
function rewrite_nav_attr($url, $base, $prefix) {
  return rewrite_attr($url, $base, $prefix);
}
function rewrite_css_urls($css, $base, $prefix) {
  return preg_replace_callback('/url\(\s*(["\']?)([^\'")\s]+)\1\s*\)/i', function ($m) use ($base, $prefix) {
    $url = trim($m[2]);
    if ($url === '' || preg_match('#^(data:|blob:|#|about:)#i', $url)) return $m[0];
    $abs = join_url($base, $url);
    if (!$abs) return $m[0];
    $kind = classify_dest($abs);
    $imgHost = strtolower((string)parse_url($abs, PHP_URL_HOST));
    if (scratch_host($imgHost) || ($kind === 'image' && hotlink_home($imgHost) !== '')) {
      $n = rewrite_attr($url, $base, $prefix);
      return $n ? "url('" . $n . "')" : $m[0];
    }
    if ($kind === 'image' || $kind === 'font' || $kind === 'video' || preg_match('#^https?:#i', $url)) {
      return "url('" . $abs . "')";
    }
    $n = rewrite_attr($url, $base, $prefix);
    return $n ? "url('" . $n . "')" : $m[0];
  }, $css);
}
function page_flags() {
  $css = '';
  if (!empty($_GET['css'])) {
    $d = b64d(rawurldecode((string)$_GET['css']));
    if ($d) {
      $d = preg_replace('/<\/style|<script/i', '', $d);
      if (strlen($d) < 20000) $css = $d;
    }
  }
  return array(
    'dark' => !empty($_GET['dark']),
    'ads' => !empty($_GET['block_ads']),
    'imgs' => !empty($_GET['strip_images']),
    'read' => !empty($_GET['readable']),
    'css' => $css,
  );
}
function page_filter_css($flags) {
  $out = '';
  if (!empty($flags['dark'])) {
    $out .= 'html{color-scheme:dark}html,body,img,video{filter:invert(1) hue-rotate(180deg)}img,video,picture,svg,[style*="background-image"]{filter:invert(1) hue-rotate(180deg) saturate(.9)}';
  }
  if (!empty($flags['imgs'])) $out .= 'img,picture,svg,video,source{display:none!important}';
  if (!empty($flags['ads'])) {
    $out .= 'iframe[src*="doubleclick"],iframe[src*="googlesyndication"],iframe[src*="adservice"],.ad,.ads,.advert,[id*="google_ads"],[class*="ad-slot"],[class*="adbanner"]{display:none!important}';
  }
  if (!empty($flags['read'])) {
    $out .= 'body{max-width:42rem;margin:0 auto;padding:24px;font-size:18px;line-height:1.6}nav,aside,footer,header,.sidebar,.nav{display:none!important}';
  }
  if (!empty($flags['css'])) $out .= $flags['css'];
  return $out;
}
function why_yt_unescape($s) {
  $s = str_replace(array('\\/', '\\"', '\\n'), array('/', '"', ' '), $s);
  return preg_replace_callback('/\\\\u([0-9a-fA-F]{4})/', function ($m) {
    $cp = hexdec($m[1]);
    if ($cp < 128) return chr($cp);
    return html_entity_decode('&#x' . $m[1] . ';', ENT_QUOTES, 'UTF-8');
  }, $s);
}
function is_browser_check($html) {
  if (!is_string($html) || $html === '') return false;
  if (preg_match('/This page needs JavaScript to function|flagged as being suspicious|schedule a captcha/i', $html)) return true;
  if (strlen($html) > 80000) return false;
  if (!preg_match('/<title[^>]*>[^<]{0,80}(Just a moment|Attention Required|Checking your browser)/i', $html)) return false;
  return (bool)preg_match('/cf-browser-verification|challenge-platform|cf-challenge|cf_chl_/i', $html);
}
function is_captcha_url($url) {
  $p = parse_url($url);
  if (!$p || empty($p['host'])) return false;
  $h = strtolower($p['host']);
  $path = isset($p['path']) ? strtolower($p['path']) : '';
  if ($h === 'hcaptcha.com' || substr($h, -13) === '.hcaptcha.com') return true;
  if (($h === 'www.google.com' || $h === 'google.com' || $h === 'www.recaptcha.net' || $h === 'recaptcha.net') && strpos($path, '/recaptcha') === 0) return true;
  if (($h === 'www.gstatic.com' || $h === 'gstatic.com') && strpos($path, '/recaptcha') === 0) return true;
  return false;
}
function abs_attr($url, $base) {
  $url = trim($url);
  if ($url === '' || $url[0] === '#' || preg_match('#^(javascript:|data:|blob:|about:|mailto:|tel:|ws:|wss:)#i', $url)) return null;
  if (strpos($url, '__pot=') !== false || strpos($url, 'fetch.php') !== false) return null;
  $abs = join_url($base, $url);
  return $abs && $abs !== $url ? $abs : null;
}
function rewrite_chunk($s, $base, $prefix) {
  $baseHost = strtolower((string)parse_url($base, PHP_URL_HOST));
  $directAssets = (bool)preg_match('/(^|\.)bing\.com$/', $baseHost);
  $s = preg_replace('/<base\b[^>]*>/i', '', $s);
  $s = preg_replace('/<meta\b[^>]*http-equiv=["\']Content-Security-Policy["\'][^>]*>/i', '', $s);
  $s = preg_replace('/\s(?:integrity|nonce)=("[^"]*"|\'[^\']*\')/i', '', $s);
  $nav = function ($m) use ($base, $prefix) {
    $n = rewrite_nav_attr($m[2], $base, $prefix);
    return $n ? $m[1] . $n . $m[3] : $m[0];
  };
  $absify = function ($m) use ($base) {
    $n = abs_attr($m[2], $base);
    return $n ? $m[1] . htmlspecialchars($n, ENT_QUOTES, 'UTF-8') . $m[3] : $m[0];
  };
  $s = preg_replace_callback('/(<(?:a|area)\b[^>]*\shref\s*=\s*")([^"]*)(")/i', $nav, $s);
  $s = preg_replace_callback('/(<(?:a|area)\b[^>]*\shref\s*=\s*\')([^\']*)(\')/i', $nav, $s);
  $s = preg_replace_callback('/(<(?:form)\b[^>]*\saction\s*=\s*")([^"]*)(")/i', $nav, $s);
  $s = preg_replace_callback('/(<(?:form)\b[^>]*\saction\s*=\s*\')([^\']*)(\')/i', $nav, $s);
  $s = preg_replace_callback('/(\s(?:formaction|data-href|data-url|data-link|data-target)\s*=\s*")([^"]*)(")/i', $nav, $s);
  $s = preg_replace_callback('/(\s(?:formaction|data-href|data-url|data-link|data-target)\s*=\s*\')([^\']*)(\')/i', $nav, $s);
  $frame = function ($m) use ($base, $prefix) {
    $abs = join_url($base, $m[2]);
    if ($abs && is_captcha_url($abs)) {
      return $m[1] . htmlspecialchars($abs, ENT_QUOTES, 'UTF-8') . $m[3];
    }
    if (!$abs || classify_dest($abs) !== 'document') {
      $n = abs_attr($m[2], $base);
      return $n ? $m[1] . htmlspecialchars($n, ENT_QUOTES, 'UTF-8') . $m[3] : $m[0];
    }
    if (preg_match('/doubleclick|googlesyndication|adservice|facebook\.com\/plugins|platform\.twitter/i', $abs)) return $m[0];
    $n = rewrite_nav_attr($m[2], $base, $prefix);
    return $n ? $m[1] . $n . $m[3] : $m[0];
  };
  $s = preg_replace_callback('/(<(?:iframe|frame)\b[^>]*\ssrc\s*=\s*")([^"]*)(")/i', $frame, $s);
  $s = preg_replace_callback('/(<(?:iframe|frame)\b[^>]*\ssrc\s*=\s*\')([^\']*)(\')/i', $frame, $s);
  $through = function ($m) use ($base, $prefix, $directAssets) {
    $abs = join_url($base, $m[2]);
    if (!$abs) return $m[0];
    if ($directAssets) {
      $n = abs_attr($m[2], $base);
      return $n ? $m[1] . htmlspecialchars($n, ENT_QUOTES, 'UTF-8') . $m[3] : $m[0];
    }
    if (is_captcha_url($abs)) {
      return $m[1] . htmlspecialchars($abs, ENT_QUOTES, 'UTF-8') . $m[3];
    }
    $kind = classify_dest($abs);
    $imgHost = strtolower((string)parse_url($abs, PHP_URL_HOST));
    if (scratch_host($imgHost)) {
      $n = rewrite_nav_attr($m[2], $base, $prefix);
      return $n ? $m[1] . $n . $m[3] : $m[0];
    }
    if ($kind === 'image' || $kind === 'font' || $kind === 'video') {
      $imgHost = strtolower((string)parse_url($abs, PHP_URL_HOST));
      if ($kind === 'image' && hotlink_home($imgHost) !== '') {
        $n = rewrite_nav_attr($m[2], $base, $prefix);
        return $n ? $m[1] . $n . $m[3] : $m[0];
      }
      return $m[1] . htmlspecialchars($abs, ENT_QUOTES, 'UTF-8') . $m[3];
    }
    $n = rewrite_nav_attr($m[2], $base, $prefix);
    return $n ? $m[1] . $n . $m[3] : $m[0];
  };
  $s = preg_replace_callback('/(\s(?:src|href|poster|data-src|data-lazy-src|cite|longdesc|background)\s*=\s*")([^"]*)(")/i', $through, $s);
  $s = preg_replace_callback('/(\s(?:src|href|poster|data-src|data-lazy-src|cite|longdesc|background)\s*=\s*\')([^\']*)(\')/i', $through, $s);
  $srcset = function ($m) use ($base, $prefix) {
    $out = array();
    foreach (explode(',', $m[2]) as $part) {
      $part = trim($part);
      if ($part === '') continue;
      if (preg_match('/^(\S+)(\s+.*)?$/', $part, $p)) {
        $abs = join_url($base, $p[1]);
        $imgHost = $abs ? strtolower((string)parse_url($abs, PHP_URL_HOST)) : '';
        if ($abs && (scratch_host($imgHost) || hotlink_home($imgHost) !== '')) {
          $n = rewrite_attr($p[1], $base, $prefix);
          $out[] = ($n ? $n : $p[1]) . (isset($p[2]) ? $p[2] : '');
        } else {
          $n = abs_attr($p[1], $base);
          $out[] = ($n ? $n : $p[1]) . (isset($p[2]) ? $p[2] : '');
        }
      } else $out[] = $part;
    }
    return $m[1] . implode(', ', $out) . $m[3];
  };
  $s = preg_replace_callback('/(\s(?:srcset|data-srcset)\s*=\s*")([^"]*)(")/i', $srcset, $s);
  $s = preg_replace_callback('/(\s(?:srcset|data-srcset)\s*=\s*\')([^\']*)(\')/i', $srcset, $s);
  $s = preg_replace_callback('/url\(\s*([\'"]?)([^\'")]+)\1\s*\)/i', function ($m) use ($base, $prefix) {
    $abs = join_url($base, $m[2]);
    $imgHost = $abs ? strtolower((string)parse_url($abs, PHP_URL_HOST)) : '';
    if ($abs && (scratch_host($imgHost) || (hotlink_home($imgHost) !== '' && classify_dest($abs) === 'image'))) {
      $n = rewrite_attr($m[2], $base, $prefix);
      return $n ? 'url(' . $m[1] . $n . $m[1] . ')' : $m[0];
    }
    $n = abs_attr($m[2], $base);
    return $n ? 'url(' . $m[1] . $n . $m[1] . ')' : $m[0];
  }, $s);
  $s = preg_replace_callback('/(<meta\b[^>]*http-equiv\s*=\s*["\']refresh["\'][^>]*content\s*=\s*["\'])([^"\']*)(["\'])/i', function ($m) use ($base, $prefix) {
    if (!preg_match('/^(.*url\s*=\s*)(.+)$/i', $m[2], $p)) return $m[0];
    $n = rewrite_nav_attr(trim($p[2]), $base, $prefix);
    return $n ? $m[1] . $p[1] . $n . $m[3] : $m[0];
  }, $s);
  return $s;
}

function req_hdr($name) {
  $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
  return isset($_SERVER[$key]) && $_SERVER[$key] !== '' ? trim((string)$_SERVER[$key]) : '';
}
function ua_ver($ua) {
  if (preg_match('/(?:Chrome|Chromium|Edg|OPR|Brave|Firefox|Version)\/(\d+)/i', $ua, $m)) return $m[1];
  return '141';
}
function ua_family($ua) {
  if (preg_match('/Firefox\//', $ua) && !preg_match('/Seamonkey/i', $ua)) return 'firefox';
  if (preg_match('/Edg\//', $ua)) return 'edge';
  if (preg_match('/OPR\/|Opera\//', $ua)) return 'opera';
  if (preg_match('/Safari\//', $ua) && !preg_match('/Chrome|Chromium|Edg|OPR|Brave/i', $ua)) return 'safari';
  return 'chromium';
}
function browser_ua($mode) {
  $ua = isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : '';
  if ($ua === '' || preg_match('/(?:^curl\/|^Wget\/|PHP\/|python-requests|Go-http-client|libwww|HttpClient)/i', $ua)) {
    $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
  }
  if ($mode === 'force_mobile') {
    $v = ua_ver($ua);
    return 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' . $v . '.0.0.0 Mobile Safari/537.36';
  }
  if ($mode === 'force_pc' && preg_match('/Mobile|Android|iPhone|iPad/i', $ua)) {
    $v = ua_ver($ua);
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' . $v . '.0.0.0 Safari/537.36';
  }
  return $ua;
}
function scratch_host($host) {
  $h = strtolower(preg_replace('/:\d+$/', '', (string)$host));
  return $h !== '' && (bool)preg_match('/(?:^|\.)scratch\.mit\.edu$/', $h);
}
function scratch_public_path($pageUrl) {
  $path = parse_url((string)$pageUrl, PHP_URL_PATH);
  if (!is_string($path) || $path === '') $path = '/';
  if (preg_match('#^/(?:fetch|experimental)\.php$#i', $path)) $path = '/';
  $q = parse_url((string)$pageUrl, PHP_URL_QUERY);
  $h = parse_url((string)$pageUrl, PHP_URL_FRAGMENT);
  if (is_string($q) && $q !== '') $path .= '?' . $q;
  if (is_string($h) && $h !== '') $path .= '#' . $h;
  return $path;
}
function scratch_json_body($body) {
  if (!is_string($body) || $body === '') return false;
  $lead = ltrim(substr($body, 0, 64));
  return $lead !== '' && ($lead[0] === '{' || $lead[0] === '[');
}
function scratch_file_kind($target) {
  $host = strtolower((string)parse_url($target, PHP_URL_HOST));
  $path = strtolower((string)parse_url($target, PHP_URL_PATH));
  if (preg_match('#/internalapi/asset/#', $path) || preg_match('/(?:^|\.)assets\.scratch\.mit\.edu$/', $host)) {
    if (preg_match('/\.(?:wav|mp3|m4a|ogg|aac)(?:\/|$)/', $path)) return 'sound';
    if (preg_match('/\.(?:png|jpe?g|gif|svg|webp|bmp)(?:\/|$)/', $path)) return 'image';
    return 'asset';
  }
  if (preg_match('/(?:^|\.)projects\.scratch\.mit\.edu$/', $host)) return 'project';
  return '';
}
function scratch_file_type($target) {
  $path = strtolower((string)parse_url($target, PHP_URL_PATH));
  if (preg_match('/\.wav(?:\/|$)/', $path)) return 'audio/wav';
  if (preg_match('/\.mp3(?:\/|$)/', $path)) return 'audio/mpeg';
  if (preg_match('/\.ogg(?:\/|$)/', $path)) return 'audio/ogg';
  if (preg_match('/\.m4a(?:\/|$)/', $path)) return 'audio/mp4';
  if (preg_match('/\.png(?:\/|$)/', $path)) return 'image/png';
  if (preg_match('/\.gif(?:\/|$)/', $path)) return 'image/gif';
  if (preg_match('/\.jpe?g(?:\/|$)/', $path)) return 'image/jpeg';
  if (preg_match('/\.svg(?:\/|$)/', $path)) return 'image/svg+xml';
  if (preg_match('/\.webp(?:\/|$)/', $path)) return 'image/webp';
  if (scratch_file_kind($target) === 'project') return 'application/json';
  return 'application/octet-stream';
}
function why_scratch_cache($target) {
  return rtrim(sys_get_temp_dir(), '/\\') . '/why_sc_' . hash('sha256', $target);
}
function classify_dest($target) {
  $path = strtolower((string)parse_url($target, PHP_URL_PATH));
  $host = strtolower((string)parse_url($target, PHP_URL_HOST));
  if (preg_match('/(?:^|\.)(?:api|projects|backpack)\.scratch\.mit\.edu$/', $host)) return 'empty';
  if (scratch_file_kind($target) !== '') return 'empty';
  if (cdn_image_host($host)) return 'image';
  if (preg_match('#(?:/get_video\b|/videoplayback\b)#i', $target)) return 'video';
  if (preg_match('/\.(?:m3u8|mp4|webm|mp3|aac|ogg|wav|m4a)(?:$|\.)/i', $path)) return 'video';
  if (preg_match('/\.(?:css)(?:$|\.)/i', $path)) return 'style';
  if (preg_match('/\.(?:js|mjs|cjs)(?:$|\.)/i', $path)) return 'script';
  if (preg_match('/\.(?:png|jpe?g|gif|webp|avif|svg|ico|bmp|tif?f)(?:$|\.)/i', $path)) return 'image';
  if (preg_match('/\.(?:woff2?|ttf|otf|eot)(?:$|\.)/i', $path)) return 'font';
  if (preg_match('/\.(?:json|xml)(?:$|\.)/i', $path)) return 'empty';
  return 'document';
}
function why_brotli_ok() {
  if (function_exists('brotli_uncompress')) return true;
  if (function_exists('Brotli\\uncompress')) return true;
  if (!defined('CURL_VERSION_BROTLI')) return false;
  $v = curl_version();
  return is_array($v) && !empty($v['features']) && ($v['features'] & CURL_VERSION_BROTLI);
}
function why_encoding_list() {
  $list = 'gzip, deflate';
  if (why_brotli_ok()) $list .= ', br';
  return $list;
}
function why_brotli_decode($body) {
  if (function_exists('brotli_uncompress')) {
    $out = @brotli_uncompress($body);
    if (is_string($out)) return $out;
  }
  if (function_exists('Brotli\\uncompress')) {
    $out = @\Brotli\uncompress($body);
    if (is_string($out)) return $out;
  }
  return false;
}
function why_decode_payload($body, &$hdrs) {
  if (!is_string($body) || $body === '') return $body;
  $enc = !empty($hdrs['content-encoding'][0]) ? strtolower($hdrs['content-encoding'][0]) : '';
  $layers = array_reverse(array_filter(array_map('trim', explode(',', $enc))));
  if (!$layers) return $body;
  foreach ($layers as $e) {
    if ($e === '' || $e === 'identity') continue;
    if ($e === 'br') {
      $next = why_brotli_decode($body);
      if (!is_string($next)) return $body;
      $body = $next;
    } elseif ($e === 'gzip' || $e === 'x-gzip') {
      $next = @gzdecode($body);
      if (!is_string($next)) return $body;
      $body = $next;
    } elseif ($e === 'deflate') {
      $next = @gzinflate($body);
      if (!is_string($next)) $next = @gzuncompress($body);
      if (!is_string($next)) return $body;
      $body = $next;
    }
  }
  unset($hdrs['content-encoding'], $hdrs['content-length']);
  return $body;
}
function human_accept($dest, $family) {
  if ($dest === 'style') return 'text/css,*/*;q=0.1';
  if ($dest === 'image') return 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
  if ($dest === 'font') return '*/*';
  if ($dest === 'script' || $dest === 'video' || $dest === 'empty') return '*/*';
  if ($family === 'firefox' || $family === 'safari') {
    return 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
  }
  return 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
}
function human_lang($raw) {
  $raw = trim((string)$raw);
  if ($raw !== '' && preg_match('/^[A-Za-z0-9*,.;=\s\-_]+$/', $raw) && strlen($raw) < 200) return $raw;
  return 'en-US,en;q=0.9';
}
function host_root($host) {
  $host = strtolower(preg_replace('/:\d+$/', '', (string)$host));
  if ($host === '' || filter_var($host, FILTER_VALIDATE_IP)) return $host;
  $parts = explode('.', $host);
  $n = count($parts);
  if ($n < 2) return $host;
  $two = array('co.uk','ac.uk','gov.uk','com.au','net.au','org.au','co.jp','com.br','co.nz','co.kr','com.mx','com.tr','co.in','com.tw');
  $last2 = $parts[$n - 2] . '.' . $parts[$n - 1];
  if ($n >= 3 && in_array($last2, $two, true)) return $parts[$n - 3] . '.' . $last2;
  return $last2;
}
function url_origin($url) {
  $p = parse_url($url);
  if (!$p || empty($p['host']) || empty($p['scheme'])) return '';
  return $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '');
}
function fetch_site($ref, $target) {
  if ($ref === '') return 'none';
  $ro = url_origin($ref);
  $to = url_origin($target);
  if ($ro === '' || $to === '') return 'none';
  if (strcasecmp($ro, $to) === 0) return 'same-origin';
  $rh = parse_url($ro, PHP_URL_HOST);
  $th = parse_url($to, PHP_URL_HOST);
  if ($rh && $th && host_root($rh) === host_root($th)) return 'same-site';
  return 'cross-site';
}
function referer_for($fromUrl, $toUrl) {
  if ($fromUrl === '') return '';
  $fp = parse_url($fromUrl);
  $tp = parse_url($toUrl);
  if (!$fp || !$tp || empty($fp['scheme']) || empty($tp['scheme']) || empty($fp['host'])) return '';
  if ($fp['scheme'] === 'https' && $tp['scheme'] === 'http') return '';
  $fo = $fp['scheme'] . '://' . $fp['host'] . (isset($fp['port']) ? ':' . $fp['port'] : '');
  $to = $tp['scheme'] . '://' . $tp['host'] . (isset($tp['port']) ? ':' . $tp['port'] : '');
  if (strcasecmp($fo, $to) === 0) return $fromUrl;
  return $fo . '/';
}
function yt_family($host) {
  $h = strtolower((string)$host);
  return (strpos($h, 'youtube') !== false || strpos($h, 'youtu.be') !== false || strpos($h, 'ytimg') !== false
    || strpos($h, 'googlevideo') !== false || strpos($h, 'ggpht') !== false || strpos($h, 'yt3.gg') !== false
    || strpos($h, 'yt3.google') !== false);
}
function why_proxy_youtube($target) {
  $p = parse_url($target);
  if (!$p || empty($p['host'])) return;
  $host = strtolower(preg_replace('/^www\./', '', $p['host']));
  $site = ($host === 'youtu.be' || $host === 'youtube.com' || $host === 'm.youtube.com' || $host === 'music.youtube.com');
  if (!$site) return;
  $path = isset($p['path']) ? $p['path'] : '/';
  if (preg_match('#/(?:youtubei|api|generate_204|videoplayback|ptracking|embed|s/)#', $path)) return;
  if (preg_match('#\.(?:js|mjs|css|png|jpe?g|gif|webp|ico|svg|json|m3u8|mp4|webm)$#i', $path)) return;
  $q = array();
  if (!empty($p['query'])) parse_str($p['query'], $q);
  $id = '';
  if ($host === 'youtu.be') $id = trim($path, '/');
  elseif (preg_match('#/(?:shorts|live|v)/([A-Za-z0-9_-]{11})#', $path, $m)) $id = $m[1];
  elseif (!empty($q['v']) && preg_match('/^[A-Za-z0-9_-]{11}$/', (string)$q['v'])) $id = (string)$q['v'];
  if ($id !== '' && !preg_match('/^[A-Za-z0-9_-]{11}$/', $id)) $id = '';
  $list = (!empty($q['list']) && preg_match('/^[A-Za-z0-9_-]{8,}$/', (string)$q['list'])) ? (string)$q['list'] : '';
  $search = '';
  if (!empty($q['search_query'])) $search = (string)$q['search_query'];
  if (function_exists('mb_substr')) $search = mb_substr($search, 0, 120);
  else $search = substr($search, 0, 120);
  $self = isset($_SERVER['SCRIPT_NAME']) ? $_SERVER['SCRIPT_NAME'] : 'fetch.php';
  $short = strpos($path, '/shorts/') !== false;
  $embed = '';
  if ($id !== '' && $list !== '') $embed = 'https://www.youtube-nocookie.com/embed/' . rawurlencode($id) . '?rel=0&list=' . rawurlencode($list);
  elseif ($id !== '') $embed = 'https://www.youtube-nocookie.com/embed/' . rawurlencode($id) . '?rel=0&playsinline=1';
  elseif ($list !== '') $embed = 'https://www.youtube-nocookie.com/embed/videoseries?list=' . rawurlencode($list);
  $h = function ($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); };
  cors();
  header('Content-Type: text/html; charset=utf-8');
  header('Cache-Control: no-store');
  header('X-Content-Type-Options: nosniff');
  echo '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YouTube</title>';
  echo '<style>html,body{margin:0;background:#0f0f0f;color:#fff;font-family:system-ui,sans-serif}form{display:flex;gap:8px;padding:12px;background:#181818}input{flex:1;min-width:0;background:#121212;color:#fff;border:1px solid #303030;border-radius:8px;padding:12px;font-size:15px}button{background:#ff0033;color:#fff;border:0;border-radius:8px;padding:0 16px;font-weight:700;cursor:pointer}iframe.wide{width:100%;height:56vw;max-height:70vh;border:0;background:#000;display:block}iframe.short{width:min(420px,100%);aspect-ratio:9/16;height:auto;max-height:85vh;border:0;background:#000;display:block;margin:0 auto}.short-wrap{display:flex;justify-content:center;background:#000}#list a{display:block;color:#fff;text-decoration:none;padding:10px 12px;border-bottom:1px solid #272727}#list span{display:block;color:#aaa;font-size:12px;margin-top:4px}</style></head><body>';
  echo '<form id="f"><input name="q" value="' . $h($search) . '" placeholder="Search videos" autocomplete="off"><button type="submit">Go</button></form>';
  if ($embed !== '') {
    $frame = '<iframe class="' . ($short ? 'short' : 'wide') . '" title="YouTube" src="' . $h($embed) . '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
    if ($short) echo '<div style="display:flex;justify-content:center;background:#000"><div style="width:min(420px,100%)">' . $frame . '</div></div>';
    else echo $frame;
  }
  echo '<div id="list"></div><script>var SELF=' . json_encode($self) . ';var Q=' . json_encode($search) . ';';
  echo 'document.getElementById("f").onsubmit=function(e){e.preventDefault();var q=this.q.value.trim();if(!q)return;var dest=/^[A-Za-z0-9_-]{11}$/.test(q)?("https://www.youtube.com/watch?v="+q):("https://www.youtube.com/results?search_query="+encodeURIComponent(q));location.href=SELF+"?url="+encodeURIComponent(dest);};';
  echo 'if(Q){fetch(SELF+"?ytsearch="+encodeURIComponent(Q),{cache:"no-store"}).then(function(r){return r.json()}).then(function(d){var box=document.getElementById("list");var items=(d&&d.items)||[];if(!items.length){box.textContent="No videos.";return}box.innerHTML=items.map(function(it){var href=it.kind==="playlist"?("https://www.youtube.com/playlist?list="+encodeURIComponent(it.id)):(it.kind==="short"?("https://www.youtube.com/shorts/"+encodeURIComponent(it.id)):("https://www.youtube.com/watch?v="+encodeURIComponent(it.id)));function e(s){return String(s||"").replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]})}return "<a href=\\""+SELF+"?url="+encodeURIComponent(href)+"\\"><b>"+e(it.title)+"</b><span>"+e([it.kind==="short"?"Short":"",it.author,it.len,it.count].filter(Boolean).join(" · "))+"</span></a>"}).join("")})}';
  echo '</script></body></html>';
  exit;
}
function hotlink_home($host) {
  $h = strtolower(preg_replace('/:\d+$/', '', (string)$host));
  if ($h === '') return '';
  if (preg_match('/(?:^|\.)(?:redd\.it|reddit\.com|redditmedia\.com|redditstatic\.com)$/', $h)) return 'https://www.reddit.com/';
  if (preg_match('/(?:^|\.)(?:twimg\.com|twitter\.com|x\.com)$/', $h)) return 'https://x.com/';
  if (preg_match('/(?:^|\.)(?:imgur\.com)$/', $h)) return 'https://imgur.com/';
  if (preg_match('/(?:^|\.)(?:discordapp\.net|discordapp\.com|discord\.com)$/', $h)) return 'https://discord.com/';
  if (preg_match('/(?:^|\.)(?:cdninstagram\.com|instagram\.com|fbcdn\.net)$/', $h)) return 'https://www.instagram.com/';
  return '';
}
function cdn_image_host($host) {
  $h = strtolower(preg_replace('/:\d+$/', '', (string)$host));
  return (bool)preg_match('/(?:^|\.)(?:i\.redd\.it|preview\.redd\.it|external-preview\.redd\.it|i\.imgur\.com|pbs\.twimg\.com|media\.discordapp\.net)$/', $h);
}
function family_home_referer($host) {
  $home = hotlink_home($host);
  if ($home !== '') return $home;
  $h = strtolower((string)$host);
  if (scratch_host($h)) return 'https://scratch.mit.edu/';
  if (yt_family($h)) return 'https://www.youtube.com/';
  if (strpos($h, 'kamtape') !== false) return 'https://www.kamtape.com/';
  return '';
}
function decode_proxy_hint($u) {
  $u = (string)$u;
  if (preg_match('/[?&]__pot=([^&]+)/', $u, $m)) {
    $d = b64d(rawurldecode($m[1]));
    if ($d && preg_match('#^https?://#i', $d)) return $d;
  }
  if (preg_match('/[?&]url=([^&]+)/', $u, $m)) {
    $d = rawurldecode($m[1]);
    if (preg_match('#^https?://#i', $d)) return $d;
    $d2 = b64d($d);
    if ($d2 && preg_match('#^https?://#i', $d2)) return $d2;
  }
  return '';
}
function ch_brand($ua, $family) {
  $v = ua_ver($ua);
  if ($family === 'edge') return '"Microsoft Edge";v="' . $v . '", "Chromium";v="' . $v . '", "Not:A-Brand";v="24"';
  if ($family === 'opera') return '"Opera";v="' . $v . '", "Chromium";v="' . $v . '", "Not:A-Brand";v="24"';
  if (stripos($ua, 'Edg/') !== false) return '"Microsoft Edge";v="' . $v . '", "Chromium";v="' . $v . '", "Not:A-Brand";v="24"';
  return '"Chromium";v="' . $v . '", "Not:A-Brand";v="24", "Brave";v="' . $v . '"';
}
function browser_req_headers($ua, $dest, $ref, $lang, $method, $target) {
  $family = ua_family($ua);
  $mobile = (stripos($ua, 'Mobile') !== false || stripos($ua, 'Android') !== false) && stripos($ua, 'iPad') === false;
  $site = fetch_site($ref, $target);
  $isDoc = ($dest === 'document');
  $method = strtoupper($method);
  $mode = 'no-cors';
  if ($isDoc) $mode = 'navigate';
  elseif ($dest === 'empty') $mode = 'cors';
  $out = array();
  if ($family === 'chromium' || $family === 'edge' || $family === 'opera') {
    $out[] = 'Sec-CH-UA: ' . (req_hdr('Sec-CH-UA') ?: ch_brand($ua, $family));
    $out[] = 'Sec-CH-UA-Mobile: ' . (req_hdr('Sec-CH-UA-Mobile') ?: ($mobile ? '?1' : '?0'));
    $plat = req_hdr('Sec-CH-UA-Platform');
    if ($plat === '') $plat = $mobile ? '"Android"' : '"Windows"';
    $out[] = 'Sec-CH-UA-Platform: ' . $plat;
    foreach (array('Sec-CH-UA-Full-Version-List', 'Sec-CH-UA-Arch', 'Sec-CH-UA-Bitness', 'Sec-CH-UA-Model', 'Sec-CH-UA-Platform-Version') as $extra) {
      $v = req_hdr($extra);
      if ($v !== '') $out[] = $extra . ': ' . $v;
    }
  }
  if ($isDoc) $out[] = 'Upgrade-Insecure-Requests: 1';
  $out[] = 'User-Agent: ' . $ua;
  $out[] = 'Accept: ' . human_accept($dest, $family);
  $out[] = 'Sec-Fetch-Site: ' . $site;
  $out[] = 'Sec-Fetch-Mode: ' . $mode;
  if ($isDoc) $out[] = 'Sec-Fetch-User: ?1';
  $out[] = 'Sec-Fetch-Dest: ' . $dest;
  $out[] = 'Accept-Language: ' . human_lang($lang);
  if ($isDoc) $out[] = 'Cache-Control: max-age=0';
  if ($ref !== '') $out[] = 'Referer: ' . $ref;
  if ($method !== 'GET' && $method !== 'HEAD') {
    $origin = $ref !== '' ? url_origin($ref) : url_origin($target);
    if ($origin !== '') $out[] = 'Origin: ' . $origin;
  }
  if ($family === 'chromium' || $family === 'edge' || $family === 'opera') {
    $gpc = req_hdr('Sec-GPC');
    if ($gpc === '' && $family === 'chromium') $gpc = '1';
    if ($gpc !== '') $out[] = 'Sec-GPC: ' . $gpc;
    if ($isDoc) $out[] = 'Priority: u=0, i';
    elseif ($dest === 'style' || $dest === 'script') $out[] = 'Priority: u=0';
    else $out[] = 'Priority: u=1, i';
  }
  $dnt = req_hdr('DNT');
  if ($dnt !== '') $out[] = 'DNT: ' . $dnt;
  return $out;
}
function why_sid() {
  if (!empty($_COOKIE['why_sid']) && preg_match('/^[a-f0-9]{32}$/', $_COOKIE['why_sid'])) {
    return $_COOKIE['why_sid'];
  }
  $sid = md5(uniqid((string)mt_rand(), true) . (isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : ''));
  if (!headers_sent()) {
    setcookie('why_sid', $sid, time() + 86400 * 30, '/', '', false, true);
  }
  $_COOKIE['why_sid'] = $sid;
  return $sid;
}
function why_db_note($set = null) {
  static $note = '';
  if ($set !== null) $note = substr((string)$set, 0, 160);
  return $note;
}
function why_db() {
  static $done = false;
  static $db = null;
  if ($done) return $db;
  $done = true;
  if (!function_exists('mysqli_init')) { why_db_note('php has no mysql'); return null; }
  $f = __DIR__ . '/why-db.php';
  if (!is_file($f)) { why_db_note('why-db.php is missing'); return null; }
  try {
    $c = include $f;
    if (!is_array($c)) { why_db_note('why-db.php is not a config'); return null; }
    $host = isset($c['host']) ? trim((string)$c['host']) : '';
    $user = isset($c['user']) ? trim((string)$c['user']) : '';
    $pass = isset($c['pass']) ? (string)$c['pass'] : '';
    $name = isset($c['name']) ? trim((string)$c['name']) : '';
    $port = isset($c['port']) ? (int)$c['port'] : 3306;
    if ($host === '' || $user === '' || $name === '' || $port < 1) { why_db_note('username is blank'); return null; }
    if (function_exists('mysqli_report')) mysqli_report(MYSQLI_REPORT_OFF);
    $m = mysqli_init();
    if (!$m) { why_db_note('mysql did not start'); return null; }
    @$m->options(MYSQLI_OPT_CONNECT_TIMEOUT, 4);
    if (!@$m->real_connect($host, $user, $pass, $name, $port)) {
      why_db_note(mysqli_connect_error() ? mysqli_connect_error() : 'login failed');
      return null;
    }
    @$m->set_charset('utf8mb4');
    $ok = @$m->query('CREATE TABLE IF NOT EXISTS why_ck (sid CHAR(64) NOT NULL PRIMARY KEY, body MEDIUMTEXT NOT NULL, updated INT UNSIGNED NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    if ($ok) @$m->query('DROP TABLE IF EXISTS why_chat');
    if (!$ok) { why_db_note($m->error ? $m->error : 'could not create tables'); @$m->close(); return null; }
    $db = $m;
  } catch (Exception $e) {
    why_db_note($e->getMessage());
    return null;
  }
  return $db;
}
function why_q($db, $sql) {
  try { return @$db->query($sql); } catch (Exception $e) { return false; }
}
function why_esc($db, $s) {
  return "'" . $db->real_escape_string((string)$s) . "'";
}
function ck_file() {
  return rtrim(sys_get_temp_dir(), '/\\') . '/why_ck_' . hash('sha256', why_sid() . dirname(__FILE__)) . '.json';
}
function ck_read() {
  $db = why_db();
  if ($db) {
    $sid = why_sid();
    $res = why_q($db, 'SELECT body FROM why_ck WHERE sid=' . why_esc($db, $sid) . ' LIMIT 1');
    if ($res && ($row = $res->fetch_assoc())) {
      $j = json_decode((string)$row['body'], true);
      $res->free();
      if (is_array($j)) return $j;
    }
    return array();
  }
  $f = ck_file();
  if (!is_file($f)) return array();
  $j = json_decode((string)@file_get_contents($f), true);
  return is_array($j) ? $j : array();
}
function ck_write($map) {
  $db = why_db();
  if ($db) {
    $sid = why_sid();
    $body = json_encode($map);
    if (!is_string($body)) $body = '{}';
    $updated = time();
    why_q($db, 'INSERT INTO why_ck (sid, body, updated) VALUES (' . why_esc($db, $sid) . ',' . why_esc($db, $body) . ',' . $updated . ') ON DUPLICATE KEY UPDATE body=VALUES(body), updated=VALUES(updated)');
    return;
  }
  @file_put_contents(ck_file(), json_encode($map), LOCK_EX);
}
function ck_pairs($map, $host) {
  $host = strtolower($host);
  $out = array();
  foreach ($map as $h => $pairs) {
    $h = strtolower(ltrim((string)$h, '.'));
    if ($h === '' || !is_array($pairs)) continue;
    if ($host === $h || substr($host, -strlen('.' . $h)) === '.' . $h) {
      foreach ($pairs as $n => $v) {
        if ($n !== '' && $n !== 'why_sid') $out[$n] = $v;
      }
    }
  }
  return $out;
}
function ck_eat($map, $host, $lines) {
  if (!$lines) return $map;
  foreach ($lines as $line) {
    $parts = explode(';', $line);
    $nv = trim($parts[0]);
    $eq = strpos($nv, '=');
    if ($eq < 1) continue;
    $name = trim(substr($nv, 0, $eq));
    $val = trim(substr($nv, $eq + 1));
    if ($name === '' || strcasecmp($name, 'why_sid') === 0) continue;
    $dom = strtolower($host);
    $gone = false;
    for ($i = 1; $i < count($parts); $i++) {
      $p = trim($parts[$i]);
      if (stripos($p, 'domain=') === 0) {
        $d = ltrim(trim(substr($p, 7)), '.');
        if ($d !== '') $dom = strtolower($d);
      }
      if (preg_match('/^max-age\s*=\s*0$/i', $p) || stripos($p, 'expires=Thu, 01 Jan 1970') === 0) $gone = true;
    }
    if (!isset($map[$dom]) || !is_array($map[$dom])) $map[$dom] = array();
    if ($gone) unset($map[$dom][$name]);
    else $map[$dom][$name] = $val;
    if (isset($map[$dom]) && !$map[$dom]) unset($map[$dom]);
  }
  return $map;
}
function nav_file() {
  return rtrim(sys_get_temp_dir(), '/\\') . '/why_nav_' . hash('sha256', why_sid() . dirname(__FILE__)) . '.json';
}
function nav_get() {
  $f = nav_file();
  if (!is_file($f)) return '';
  $j = json_decode((string)@file_get_contents($f), true);
  if (!is_array($j) || empty($j['url']) || !preg_match('#^https?://#i', $j['url'])) return '';
  if (!empty($j['t']) && (time() - (int)$j['t']) > 7200) return '';
  return $j['url'];
}
function nav_set($url) {
  if (!preg_match('#^https?://#i', (string)$url)) return;
  @file_put_contents(nav_file(), json_encode(array('url' => $url, 't' => time())), LOCK_EX);
}
function why_correct_browser_bar() {
  $path = '';
  if (!empty($_GET['__path'])) $path = (string)$_GET['__path'];
  else {
    $ru = isset($_SERVER['REQUEST_URI']) ? (string)$_SERVER['REQUEST_URI'] : '';
    $path = (string)parse_url($ru, PHP_URL_PATH);
  }
  $path = rawurldecode($path);
  $leaf = trim($path, '/');
  $qs = isset($_SERVER['QUERY_STRING']) ? (string)$_SERVER['QUERY_STRING'] : '';
  $qs = preg_replace('/(?:^|&)__(?:miss|rel|path)=[^&]*/', '', $qs);
  $qs = trim($qs, '&');
  $params = array();
  if ($qs !== '') parse_str($qs, $params);
  $q = '';
  if (!empty($_GET['q']) && is_string($_GET['q'])) $q = $_GET['q'];
  elseif (!empty($params['q']) && is_string($params['q'])) $q = $params['q'];
  if ($q !== '' && ($leaf === '' || preg_match('#^(search|s|find)$#i', $leaf))) {
    return 'https://search.brave.com/search?q=' . rawurlencode($q);
  }
  if (preg_match('#^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?)+(/.*)?$#i', $leaf)
    && !preg_match('#\.(php|html?|css|js|png|jpe?g|gif|svg|ico|woff2?)$#i', $leaf)) {
    return 'https://' . $leaf . ($qs !== '' ? '?' . $qs : '');
  }
  return '';
}
function miss_from_host() {
  $cands = array();
  if (!empty($_GET['__path'])) $cands[] = '/' . ltrim((string)$_GET['__path'], '/');
  foreach (array('REDIRECT_URL', 'REDIRECT_REQUEST_URI', 'REDIRECT_SCRIPT_URL') as $k) {
    if (!empty($_SERVER[$k])) $cands[] = (string)$_SERVER[$k];
  }
  $ru = isset($_SERVER['REQUEST_URI']) ? (string)$_SERVER['REQUEST_URI'] : '';
  if ($ru !== '' && stripos($ru, 'fetch.php') === false) $cands[] = $ru;
  $path = '';
  $qs = '';
  foreach ($cands as $c) {
    if ($c === '' || stripos($c, 'fetch.php') !== false) continue;
    $pp = parse_url($c);
    $p = isset($pp['path']) ? $pp['path'] : $c;
    if ($p === '' || $p === '/') continue;
    if (preg_match('#(?:WhyRevived|index\.php|index\.html)#i', $p)) continue;
    $path = $p;
    if (!empty($pp['query'])) $qs = $pp['query'];
    break;
  }
  if ($path === '') return '';
  if (preg_match('/\.[a-z0-9]{1,8}$/i', $path)) return '';
  if (preg_match('#^/(api|AS|cdn|_next|static|assets|chunks|webpack|ajax|graphql|__why)(/|$)#i', $path)) return '';
  if ($qs === '') {
    if (!empty($_SERVER['REDIRECT_QUERY_STRING'])) $qs = (string)$_SERVER['REDIRECT_QUERY_STRING'];
    else {
      $qs = isset($_SERVER['QUERY_STRING']) ? (string)$_SERVER['QUERY_STRING'] : '';
      $qs = preg_replace('/(?:^|&)__(?:miss|rel|path)=[^&]*/', '', $qs);
      $qs = trim($qs, '&');
    }
  }
  $last = nav_get();
  if ($last === '') return '';
  $origin = url_origin($last);
  if ($origin === '') return '';
  $path = '/' . ltrim(str_replace('\\', '/', $path), '/');
  if (strpos($path, '..') !== false || preg_match('#^[a-z][a-z0-9+.-]*:#i', $path)) return '';
  return $origin . $path . ($qs !== '' ? '?' . $qs : '');
}

function boot_script($pageUrl, $prefix, $anti) {
  $U = json_encode($pageUrl, JSON_UNESCAPED_SLASHES);
  $P = json_encode($prefix, JSON_UNESCAPED_SLASHES);
  $js = <<<'JS'
(function(){try{
var U=__U__,P=__P__;
var enc=function(s){return encodeURIComponent(btoa(unescape(encodeURIComponent(s))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""))};
var proxied=function(u){return typeof u==="string"&&u.indexOf("__pot=")>-1};
var abs=function(u){try{return new URL(u,U).href}catch(e){return u}};
var pr=function(u){if(!u||typeof u!=="string")return u;if(u.charAt(0)==="#"||/^(javascript:|data:|blob:|about:|mailto:|tel:|ws:|wss:)/i.test(u))return u;if(proxied(u))return u;try{return P+enc(abs(u))}catch(e){return u}};
__YT__
document.addEventListener("click",function(ev){var t=ev.target;if(!t||!t.closest)return;var a=t.closest("a[href],area[href]");if(!a)return;var h=a.getAttribute("href");if(!h||h.charAt(0)==="#"||/^(javascript:|mailto:|tel:)/i.test(h)||proxied(h))return;ev.preventDefault();location.href=pr(h)},true);
document.addEventListener("submit",function(ev){var f=ev.target;if(!f||f.tagName!=="FORM")return;var a=f.getAttribute("action")||"";if(proxied(a))return;if((f.method||"get").toLowerCase()!=="get"){f.setAttribute("action",pr(abs(a||U)));return}ev.preventDefault();try{var t=new URL(abs(a||U));var d=new FormData(f);d.forEach(function(v,k){if(k)t.searchParams.set(k,String(v))});location.href=pr(t.href)}catch(e){}},true);
try{parent.postMessage({type:"why:nav",url:U},"*")}catch(e){}
__SCRATCH__
}catch(e){}})();
JS;
  $scratch = '';
  if (scratch_host((string)parse_url($pageUrl, PHP_URL_HOST))) {
    $scratch = 'try{var su=new URL(U);var sp=window.__WHY_PATH||((su.pathname||"/")+(su.search||"")+(su.hash||""));if(sp.charAt(0)!=="/")sp="/"+sp;if(/^\\/(?:fetch|experimental)\\.php(?:$|\\?)/i.test(sp))sp="/";history.replaceState(null,"",sp);window.__WHY_PATH=sp;}catch(e){}'
      . 'var scratchHost=function(h){return /(^|\\.)scratch\\.mit\\.edu$/i.test(h||"")};'
      . 'var scratchUrl=function(u){try{return scratchHost(new URL(abs(u)).hostname)}catch(e){return false}};'
      . 'var route=function(u){if(!u||typeof u!=="string"||proxied(u))return u;if(!scratchUrl(u))return u;return pr(u)};'
      . 'if(window.fetch){var ofetch=window.fetch;window.fetch=function(input,init){try{var url=typeof input==="string"?input:(input&&input.url);if(url&&scratchUrl(url)){var next=route(url);if(next!==url){if(typeof input!=="string"&&!init)init={method:input.method,headers:input.headers,credentials:"same-origin",mode:"cors"};input=next;}}}catch(e){}return ofetch.call(this,input,init)};}'
      . 'var xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){try{if(typeof u==="string")arguments[1]=route(u)}catch(e){}return xo.apply(this,arguments)};'
      . 'var hookSrc=function(C){if(!C||!C.prototype)return;var d=Object.getOwnPropertyDescriptor(C.prototype,"src");if(!d||!d.set)return;Object.defineProperty(C.prototype,"src",{configurable:true,enumerable:d.enumerable,get:d.get,set:function(v){d.set.call(this,typeof v==="string"?route(v):v)}})};'
      . 'hookSrc(window.HTMLImageElement);hookSrc(window.HTMLMediaElement);hookSrc(window.HTMLSourceElement);hookSrc(window.HTMLScriptElement);'
      . 'var sa=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){if(typeof v==="string"&&/^(src|href|poster)$/i.test(String(n)))v=route(v);return sa.call(this,n,v)};'
      . 'if(navigator.serviceWorker&&navigator.serviceWorker.register){navigator.serviceWorker.register=function(){return Promise.reject(new Error("unavailable"))}};';
  }
  $yt = '';
  if (yt_family((string)parse_url($pageUrl, PHP_URL_HOST))) {
    $yt = 'try{Object.defineProperty(navigator,"onLine",{get:function(){return true},configurable:true})}catch(e){}'
      . 'try{Object.defineProperty(navigator,"connection",{get:function(){return{effectiveType:"4g",downlink:10,rtt:50,saveData:false}},configurable:true})}catch(e){}'
      . 'if(window.fetch){var yf=window.fetch;window.fetch=function(input,init){try{var url=typeof input==="string"?input:(input&&input.url)||"";if(typeof url==="string"&&(url.indexOf("generate_204")>-1||url.indexOf("check_connection")>-1))return Promise.resolve(new Response(null,{status:204}));var next=pr(url);if(typeof url==="string"&&next&&next!==url){if(typeof input==="string")input=next;else if(window.Request)input=new Request(next,input);}}catch(e){}return yf.call(this,input,init)};}'
      . 'var yxo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){try{if(typeof u==="string")arguments[1]=pr(u)}catch(e){}return yxo.apply(this,arguments)};'
      . 'var hookMedia=function(C){if(!C||!C.prototype)return;var d=Object.getOwnPropertyDescriptor(C.prototype,"src");if(!d||!d.set||!d.get)return;Object.defineProperty(C.prototype,"src",{configurable:true,enumerable:d.enumerable,get:d.get,set:function(v){d.set.call(this,typeof v==="string"?pr(v):v)}})};'
      . 'hookMedia(window.HTMLMediaElement);hookMedia(window.HTMLSourceElement);'
      . 'if(window.Audio){var YA=window.Audio;window.Audio=function(u){return new YA(typeof u==="string"?pr(u):u)};window.Audio.prototype=YA.prototype;}'
      . 'if(navigator.serviceWorker&&navigator.serviceWorker.register){navigator.serviceWorker.register=function(){return Promise.reject(new Error("unavailable"))}};';
  }
  $js = str_replace(array('__U__', '__P__', '__SCRATCH__', '__YT__'), array($U, $P, $scratch, $yt), $js);
  return '<script>' . $js . '</script>';
}
function strip_marked_script($html, $mark) {
  $at = strpos($html, $mark);
  if ($at === false) return $html;
  $open = strrpos(substr($html, 0, $at), '<script');
  if ($open === false) return $html;
  $close = stripos($html, '</script>', $at);
  if ($close === false) return $html;
  return substr($html, 0, $open) . substr($html, $close + 9);
}
function merge_request_query($target) {
  $skip = array(
    '__pot' => 1, 'url' => 1, '__raw' => 1, '__miss' => 1, '__rel' => 1, '__path' => 1,
    'css' => 1, 'dark' => 1, 'block_ads' => 1, 'strip_images' => 1, 'readable' => 1, 'overhaul' => 1,
    'anti_detect' => 1, 'mode' => 1, 'nav' => 1, 'ping' => 1, 'ytsearch' => 1,
    'chat' => 1, 'ws' => 1, 'cb' => 1, 'send' => 1, 'name' => 1, 'text' => 1,
    'session' => 1, 'stream' => 1, 'i' => 1
  );
  $extra = array();
  foreach ($_GET as $k => $v) {
    if ($k === '' || isset($skip[$k]) || is_array($v)) continue;
    $extra[$k] = $v;
  }
  if (!$extra) return $target;
  $p = parse_url($target);
  if (!$p || empty($p['scheme']) || empty($p['host'])) return $target;
  $q = array();
  if (!empty($p['query'])) parse_str($p['query'], $q);
  foreach ($extra as $k => $v) $q[$k] = $v;
  $built = $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '');
  $built .= isset($p['path']) ? $p['path'] : '/';
  $qs = http_build_query($q, '', '&', PHP_QUERY_RFC3986);
  if ($qs !== '') $built .= '?' . $qs;
  if (!empty($p['fragment'])) $built .= '#' . $p['fragment'];
  return $built;
}
function why_asset_cache($target) {
  return rtrim(sys_get_temp_dir(), '/\\') . '/why_css_' . hash('sha256', $target) . '.css';
}
function brave_search_kind($target) {
  $host = strtolower((string)parse_url($target, PHP_URL_HOST));
  if ($host !== 'search.brave.com') return '';
  $path = (string)parse_url($target, PHP_URL_PATH);
  if (preg_match('#^/(search|images|videos|news)(?:/|$)#', $path, $m)) return $m[1];
  return '';
}
function brave_plain($s) {
  $s = html_entity_decode(strip_tags((string)$s), ENT_QUOTES, 'UTF-8');
  $n = preg_replace('/\s+/', ' ', $s);
  return trim(is_string($n) ? $n : $s);
}
function brave_result_page($html, $target, $prefix) {
  $kind = brave_search_kind($target);
  if ($kind === '' || $kind === 'search') return '';
  $clean = preg_replace('/<script\b[\s\S]*?<\/script>/i', ' ', $html);
  $clean = preg_replace('/<style\b[\s\S]*?<\/style>/i', ' ', $clean);
  if (!is_string($clean) || $clean === '') return '';
  $items = array();
  $seen = array();
  if (!preg_match_all('/<a\b([^>]*)>([\s\S]*?)<\/a>/i', $clean, $ms, PREG_SET_ORDER)) return '';
  foreach ($ms as $m) {
    if (!preg_match('/\shref\s*=\s*"([^"]+)"/i', $m[1], $hm)) continue;
    if (!preg_match('/class="[^"]*(?:search-snippet-title|line-clamp-[12])[^"]*"[^>]*>([^<]+)/i', $m[2], $tm)) continue;
    $title = brave_plain($tm[1]);
    if ($title === '' || isset($seen[$title])) continue;
    $href = html_entity_decode($hm[1], ENT_QUOTES, 'UTF-8');
    if ($href === '' || $href[0] === '#' || preg_match('#^(javascript:|mailto:|tel:)#i', $href)) continue;
    if (strpos($href, '__pot=') !== false) {
      $link = $href;
    } else {
      $abs = join_url($target, $href);
      if (!$abs) continue;
      $link = enc_url($abs, $prefix);
    }
    $cite = '';
    if (preg_match('/<cite\b[^>]*>([\s\S]*?)<\/cite>/i', $m[2], $cm)) $cite = brave_plain($cm[1]);
    $seen[$title] = 1;
    $items[] = array('title' => $title, 'href' => $link, 'cite' => $cite);
    if (count($items) >= 20) break;
  }
  if (!$items) return '';
  $q = '';
  $qs = parse_url($target, PHP_URL_QUERY);
  if ($qs) {
    $pq = array();
    parse_str($qs, $pq);
    if (!empty($pq['q'])) $q = (string)$pq['q'];
  }
  $action = enc_url('https://search.brave.com/' . $kind, $prefix);
  $h = function ($s) { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); };
  $lis = '';
  foreach ($items as $it) {
    $lis .= '<article><a href="' . $h($it['href']) . '">' . $h($it['title']) . '</a>';
    if ($it['cite'] !== '') $lis .= '<cite>' . $h($it['cite']) . '</cite>';
    $lis .= '</article>';
  }
  $label = $kind === 'search' ? 'Search' : ucfirst($kind);
  if (isset($_GET['overhaul']) && (string)$_GET['overhaul'] === '1') {
    $action .= (strpos($action, '?') === false ? '?' : '&') . 'overhaul=1';
    $css = why_shell_css($kind === 'search' ? 'list' : 'grid');
  } else $css = 'html,body{margin:0;background:#f4f6f8;color:#1c1e21;font:15px/1.45 Georgia,Palatino,serif}'
    . 'header{background:#fff;border-bottom:1px solid #d9dee6;padding:18px 16px}'
    . 'form{max-width:680px;margin:0 auto;display:flex;gap:8px;align-items:center}'
    . 'input{flex:1;min-width:0;background:#fff;color:#1c1e21;border:1px solid #c5ccd6;border-radius:999px;padding:11px 16px;font:16px system-ui,sans-serif}'
    . 'button{background:#1a73e8;color:#fff;border:0;border-radius:999px;padding:0 18px;height:42px;font:600 14px system-ui,sans-serif}'
    . 'main{max-width:680px;margin:0 auto;padding:8px 16px 40px}'
    . 'article{padding:16px 2px;border-bottom:1px solid #e4e8ee}'
    . 'a{color:#1a0dab;font:18px/1.35 system-ui,sans-serif;text-decoration:none}'
    . 'a:hover{text-decoration:underline}'
    . 'cite{display:block;margin-top:4px;color:#0b7a32;font:13px/1.3 system-ui,sans-serif;font-style:normal}';
  if ($kind !== 'search' && !(isset($_GET['overhaul']) && (string)$_GET['overhaul'] === '1')) {
    $css = 'html,body{margin:0;background:#f7f7f8;color:#1c1e21;font:15px/1.45 system-ui,sans-serif}'
      . 'header{background:#fff;border-bottom:1px solid #e4e4e7;padding:14px 16px}'
      . 'form{max-width:860px;margin:0 auto;display:flex;gap:8px}'
      . 'input{flex:1;min-width:0;background:#fff;color:#1c1e21;border:1px solid #d4d4d8;border-radius:8px;padding:10px 12px;font-size:16px}'
      . 'button{background:#3f3f46;color:#fff;border:0;border-radius:8px;padding:0 14px;font-weight:650}'
      . 'main{max-width:860px;margin:0 auto;padding:12px 16px 32px;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}'
      . 'article{background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:12px}'
      . 'a{color:#1d4ed8;text-decoration:none;font-weight:650}'
      . 'cite{display:block;margin-top:6px;color:#71717a;font-style:normal;font-size:12px}';
  }
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    . '<title>' . $h($q !== '' ? $q . ' - Search' : 'Search') . '</title>'
    . '<style>' . $css . '</style></head><body>'
    . '<header><form method="get" action="' . $h($action) . '"><input name="q" value="' . $h($q) . '" placeholder="Search the web" autocomplete="off"><button type="submit">' . $h($label) . '</button></form></header>'
    . '<main>' . $lis . '</main></body></html>';
}

function rewrite_html($html, $baseUrl, $prefix, $anti) {
  $html = strip_marked_script($html, '__sveltekit_');
  $html = strip_marked_script($html, '/api/metrics/serp');
  $p = parse_url($baseUrl);
  $dir = isset($p['path']) ? $p['path'] : '/';
  if (strlen($dir) > 1 && substr($dir, -1) !== '/') $dir = substr($dir, 0, strrpos($dir, '/') + 1);
  $base = $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '') . $dir;
  $parts = preg_split('/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)/i', $html, -1, PREG_SPLIT_DELIM_CAPTURE);
  $isScratchPage = scratch_host(isset($p['host']) ? $p['host'] : '');
  foreach ($parts as $i => $part) {
    if (preg_match('/^<script\b/i', $part)) {
      if ($isScratchPage && preg_match('/\ssrc\s*=/i', $part)) {
        $parts[$i] = preg_replace_callback('/(\ssrc\s*=\s*)(["\'])([^"\']+)\2/i', function ($m) use ($base, $prefix) {
          $n = rewrite_attr(html_entity_decode($m[3], ENT_QUOTES, 'UTF-8'), $base, $prefix);
          if (!$n) return $m[0];
          return $m[1] . $m[2] . $n . $m[2];
        }, $part);
      }
      continue;
    }
    if (preg_match('/^<style\b/i', $part)) {
      $parts[$i] = rewrite_css_urls($part, $base, $prefix);
      continue;
    }
    $parts[$i] = rewrite_chunk($part, $base, $prefix);
  }
  $html = implode('', $parts);
  $boot = boot_script($baseUrl, $prefix, $anti);
  $isScratch = scratch_host(isset($p['host']) ? $p['host'] : '');
  $baseTag = '<base href="' . htmlspecialchars($base, ENT_QUOTES, 'UTF-8') . '">';
  $early = '';
  if ($isScratch) {
    $early = '<script>window.__WHY_PATH=' . json_encode(scratch_public_path($baseUrl), JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP)
      . ';try{history.replaceState(null,"",window.__WHY_PATH)}catch(e){}</script>';
  }
  $filt = page_filter_css(page_flags());
  $skin = $filt !== '' ? '<style id="why-gust-skin">' . $filt . '</style>' : '';
  $inject = $early . $baseTag . $boot . $skin;
  if (preg_match('/<head[^>]*>/i', $html)) $html = preg_replace('/<head[^>]*>/i', '$0' . $inject, $html, 1);
  else $html = $inject . $html;
  return $html;
}

if (!headers_sent()) header('Vary: Accept-Encoding');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { cors(); http_response_code(204); exit; }

$path = parse_url(isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '/', PHP_URL_PATH);

function why_api_get($url) {
  $ch = curl_init($url);
  curl_setopt_array($ch, array(
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_TIMEOUT => 14,
    CURLOPT_USERAGENT => 'WhyRevived/1.0 (search API)',
    CURLOPT_HTTPHEADER => array('Accept: application/json'),
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
  ));
  $raw = curl_exec($ch);
  curl_close($ch);
  $data = is_string($raw) ? json_decode($raw, true) : null;
  return is_array($data) ? $data : array();
}
function why_http_url($url) {
  $url = trim((string)$url);
  if ($url === '') return '';
  if (strpos($url, '//') === 0) return 'https:' . $url;
  if (preg_match('#^https?://#i', $url)) return $url;
  return '';
}
function why_split_title($text) {
  $text = trim((string)$text);
  $title = $text;
  $desc = '';
  $pos = strpos($text, ' - ');
  if ($pos !== false && $pos > 0 && $pos < 140) {
    $title = trim(substr($text, 0, $pos));
    $desc = trim(substr($text, $pos + 3));
  }
  return array($title, $desc);
}
function why_plain($html) {
  $text = preg_replace('/<[^>]+>/', ' ', (string)$html);
  if (!is_string($text)) $text = (string)$html;
  $text = html_entity_decode($text, ENT_QUOTES, 'UTF-8');
  $text = preg_replace('/\s*\[\d+\]/', '', $text);
  if (!is_string($text)) $text = '';
  $text = preg_replace('/\s+/', ' ', $text);
  if (!is_string($text)) return '';
  return trim($text);
}
function why_ddg_asset($url) {
  $url = trim((string)$url);
  if ($url === '') return '';
  if (strpos($url, '/i/') === 0 || strpos($url, '/assets/') === 0) return 'https://duckduckgo.com' . $url;
  return why_http_url($url);
}
function why_ddg_name($url) {
  $host = strtolower((string)parse_url($url, PHP_URL_HOST));
  $host = preg_replace('/^www\./', '', $host);
  if ($host !== 'duckduckgo.com') return '';
  $path = rawurldecode(trim((string)parse_url($url, PHP_URL_PATH), '/'));
  if ($path === '' || strpos($path, '/') !== false) return '';
  if (!preg_match('/^[A-Za-z0-9_.,()\'+-]{1,180}$/', $path)) return '';
  return $path;
}
function why_ddg_uddg($href) {
  $href = html_entity_decode((string)$href, ENT_QUOTES, 'UTF-8');
  if (strpos($href, '//') === 0) $href = 'https:' . $href;
  $query = parse_url($href, PHP_URL_QUERY);
  if (!is_string($query) || $query === '') return '';
  $q = array();
  parse_str($query, $q);
  if (empty($q['uddg']) || !is_string($q['uddg'])) return '';
  $dest = $q['uddg'];
  if (!preg_match('#^https?://#i', $dest)) return '';
  $host = strtolower((string)parse_url($dest, PHP_URL_HOST));
  $host = preg_replace('/^www\./', '', $host);
  if ($host === '' || $host === 'duckduckgo.com') return '';
  return $dest;
}
function why_yt_thumb($url) {
  $host = strtolower((string)parse_url($url, PHP_URL_HOST));
  $host = preg_replace('/^www\./', '', $host);
  $id = '';
  if ($host === 'youtu.be') $id = trim((string)parse_url($url, PHP_URL_PATH), '/');
  elseif ($host === 'youtube.com' || $host === 'm.youtube.com') {
    $q = array();
    parse_str((string)parse_url($url, PHP_URL_QUERY), $q);
    if (!empty($q['v']) && is_string($q['v'])) $id = $q['v'];
  } else return '';
  if (!preg_match('/^[A-Za-z0-9_-]{6,20}$/', $id)) return '';
  return 'https://i.ytimg.com/vi/' . $id . '/mqdefault.jpg';
}
function why_ddg_lite($q) {
  $ch = curl_init('https://lite.duckduckgo.com/lite/?q=' . rawurlencode($q));
  curl_setopt_array($ch, array(
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_TIMEOUT => 14,
    CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    CURLOPT_HTTPHEADER => array('Accept: text/html,application/xhtml+xml'),
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_ENCODING => '',
  ));
  $raw = curl_exec($ch);
  curl_close($ch);
  if (!is_string($raw) || strlen($raw) < 500) return array();
  if (!preg_match_all("/<a\\s[^>]*href=\"([^\"]+)\"[^>]*class='result-link'[^>]*>(.*?)<\\/a>/is", $raw, $links, PREG_SET_ORDER)) return array();
  preg_match_all("/<td class='result-snippet'>(.*?)<\\/td>/is", $raw, $snips);
  $items = array();
  $seen = array();
  foreach ($links as $i => $m) {
    $dest = why_ddg_uddg($m[1]);
    $title = why_plain($m[2]);
    if ($dest === '' || $title === '') continue;
    $key = strtolower($dest);
    if (isset($seen[$key])) continue;
    $seen[$key] = 1;
    $text = isset($snips[1][$i]) ? why_plain($snips[1][$i]) : '';
    if (function_exists('mb_substr')) $text = mb_substr($text, 0, 320);
    else $text = substr($text, 0, 320);
    $items[] = array('title' => $title, 'url' => $dest, 'text' => $text, 'image' => why_yt_thumb($dest));
    if (count($items) >= 10) break;
  }
  return $items;
}
function why_wiki_key($s) {
  return strtolower(trim(str_replace('_', ' ', (string)$s)));
}
function why_wiki_fill(&$items) {
  $want = array();
  foreach ($items as $it) {
    $name = why_ddg_name(isset($it['url']) ? $it['url'] : '');
    if ($name !== '') $want[$name] = 1;
  }
  if (!$want) return;
  $api = 'https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages|extracts|info&inprop=url&piprop=thumbnail&pithumbsize=120&exintro=1&explaintext=1&exchars=240&titles='
    . implode('|', array_map('rawurlencode', array_keys($want)));
  $data = why_api_get($api);
  $query = isset($data['query']) && is_array($data['query']) ? $data['query'] : array();
  $pages = isset($query['pages']) && is_array($query['pages']) ? $query['pages'] : array();
  $by = array();
  foreach ($pages as $p) {
    if (!is_array($p) || !empty($p['missing']) || empty($p['fullurl']) || empty($p['title'])) continue;
    $by[why_wiki_key($p['title'])] = $p;
  }
  if (!empty($query['redirects']) && is_array($query['redirects'])) {
    foreach ($query['redirects'] as $r) {
      if (empty($r['from']) || empty($r['to'])) continue;
      $to = why_wiki_key($r['to']);
      if (isset($by[$to])) $by[why_wiki_key($r['from'])] = $by[$to];
    }
  }
  foreach ($items as $i => $it) {
    $name = why_ddg_name(isset($it['url']) ? $it['url'] : '');
    $key = why_wiki_key($name);
    if ($name === '' || !isset($by[$key])) continue;
    $p = $by[$key];
    $items[$i]['url'] = $p['fullurl'];
    $items[$i]['title'] = $p['title'];
    if (!empty($p['extract'])) $items[$i]['text'] = $p['extract'];
    if (!empty($p['thumbnail']['source'])) $items[$i]['image'] = $p['thumbnail']['source'];
  }
}
function why_ddg_topics($topics, &$out, $limit) {
  if (!is_array($topics)) return;
  foreach ($topics as $t) {
    if (count($out) >= $limit) return;
    if (!is_array($t)) continue;
    if (!empty($t['Topics'])) {
      why_ddg_topics($t['Topics'], $out, $limit);
      continue;
    }
    $url = why_http_url(isset($t['FirstURL']) ? $t['FirstURL'] : '');
    $text = isset($t['Text']) ? $t['Text'] : '';
    if ($url === '' || $text === '') continue;
    $name = why_ddg_name($url);
    list($title, $desc) = why_split_title($text);
    if ($name !== '') {
      $label = str_replace('_', ' ', $name);
      if (stripos($text, $label) === 0) {
        $rest = trim(substr($text, strlen($label)));
        if ($rest !== '') {
          $title = $label;
          $desc = $rest;
        }
      }
    }
    $img = '';
    if (!empty($t['Icon']['URL'])) $img = why_ddg_asset($t['Icon']['URL']);
    $out[] = array('title' => $title, 'url' => $url, 'text' => $desc, 'image' => $img);
  }
}
function why_shell_css($kind) {
  $css = 'html,body{margin:0;background:#07080a;color:#f4f4f5;font:15px/1.45 ui-sans-serif,system-ui,"Segoe UI",sans-serif}'
    . 'header{padding:22px 16px 10px}'
    . 'form{max-width:680px;margin:0 auto;display:flex;height:52px;background:#101114;border:1px solid rgba(255,255,255,.08);border-radius:16px;overflow:hidden}'
    . 'input{flex:1;min-width:0;background:transparent;color:#f4f4f5;border:0;padding:0 18px;font:15px ui-sans-serif,system-ui,sans-serif;outline:none}'
    . 'button{background:#f4f4f5;color:#09090b;border:0;padding:0 22px;font:600 14px ui-sans-serif,system-ui,sans-serif;cursor:pointer}'
    . 'main{max-width:680px;margin:0 auto;padding:8px 16px 48px}'
    . 'article,.hit{display:flex;gap:14px;align-items:flex-start;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.08)}'
    . '.thumb{flex:0 0 56px;width:56px;height:56px;border-radius:12px;overflow:hidden;background:#16181c;display:block}'
    . '.thumb img{width:100%;height:100%;object-fit:contain;padding:10px;box-sizing:border-box;background:#101114;display:block}'
    . '.thumb.photo img{object-fit:cover;padding:0}'
    . 'a{color:#f4f4f5;font:16px/1.35 ui-sans-serif,system-ui,sans-serif;font-weight:600;text-decoration:none}'
    . 'cite{display:block;margin-top:4px;color:rgba(244,244,245,.52);font:12px/1.3 ui-sans-serif,system-ui,sans-serif;font-style:normal}'
    . 'p,.empty{margin:6px 0 0;color:rgba(244,244,245,.62);font:14px/1.45 ui-sans-serif,system-ui,sans-serif}';
  if ($kind === 'grid') {
    $css .= 'main{max-width:860px;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;padding-top:16px}'
      . 'article{background:#101114;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:12px}';
  }
  return $css;
}
function why_api_page($heading, $q, $items, $note, $formName, $hidden) {
  $h = function ($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); };
  $prefix = proxy_prefix();
  $body = '';
  foreach ($items as $it) {
    if (empty($it['url']) || empty($it['title'])) continue;
    $link = enc_url($it['url'], $prefix);
    $host = (string)parse_url($it['url'], PHP_URL_HOST);
    $photo = why_http_url(isset($it['image']) ? $it['image'] : '');
    $img = $photo;
    if ($img === '' && $host !== '') $img = 'https://www.google.com/s2/favicons?sz=64&domain=' . rawurlencode($host);
    $body .= '<article class="hit">';
    if ($img !== '') {
      $body .= '<a class="thumb' . ($photo !== '' ? ' photo' : '') . '" href="' . $h($link) . '"><img alt="" src="' . $h($img) . '" referrerpolicy="no-referrer" onerror="this.parentNode.style.display=\'none\'"></a>';
    }
    $body .= '<div><a href="' . $h($link) . '">' . $h($it['title']) . '</a>';
    if ($host !== '') $body .= '<cite>' . $h($host) . '</cite>';
    if (!empty($it['text'])) $body .= '<p>' . $h($it['text']) . '</p>';
    $body .= '</div></article>';
  }
  if ($body === '') $body = '<p class="empty">' . $h($note !== '' ? $note : 'No results.') . '</p>';
  if (isset($_GET['overhaul']) && (string)$_GET['overhaul'] === '1') $hidden['overhaul'] = '1';
  $hid = '';
  foreach ($hidden as $name => $val) {
    $hid .= '<input type="hidden" name="' . $h($name) . '" value="' . $h($val) . '">';
  }
  $self = preg_replace('/\?.*$/', '', $prefix);
  if (isset($_GET['overhaul']) && (string)$_GET['overhaul'] === '1') {
    $css = why_shell_css('list');
  } else {
    $css = 'html,body{margin:0;background:#f4f6f8;color:#1c1e21;font:15px/1.45 Georgia,Palatino,serif}'
      . 'header{background:#fff;border-bottom:1px solid #d9dee6;padding:18px 16px}'
      . 'form{max-width:680px;margin:0 auto;display:flex;gap:8px;align-items:center}'
      . 'input[type=text]{flex:1;min-width:0;background:#fff;color:#1c1e21;border:1px solid #c5ccd6;border-radius:999px;padding:11px 16px;font:16px system-ui,sans-serif}'
      . 'button{background:#1a73e8;color:#fff;border:0;border-radius:999px;padding:0 18px;height:42px;font:600 14px system-ui,sans-serif}'
      . 'main{max-width:680px;margin:0 auto;padding:8px 16px 40px}'
      . '.hit{display:flex;gap:14px;align-items:flex-start;padding:16px 2px;border-bottom:1px solid #e4e8ee}'
      . '.thumb{flex:0 0 72px;width:72px;height:72px;border-radius:10px;overflow:hidden;background:#e8ecf1;display:block}'
      . '.thumb img{width:100%;height:100%;object-fit:contain;padding:16px;box-sizing:border-box;background:#fff;display:block}'
      . '.thumb.photo img{object-fit:cover;padding:0}'
      . 'a{color:#1a0dab;font:18px/1.35 system-ui,sans-serif;text-decoration:none}'
      . 'a:hover{text-decoration:underline}'
      . 'cite{display:block;margin-top:4px;color:#0b7a32;font:13px/1.3 system-ui,sans-serif;font-style:normal}'
      . 'p{margin:6px 0 0;color:#3c4043;font:14px/1.45 system-ui,sans-serif}'
      . '.empty{padding:18px 2px}';
  }
  cors();
  header('Content-Type: text/html; charset=utf-8');
  header('Cache-Control: no-store');
  echo '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    . '<title>' . $h($q !== '' ? $q . ' - ' . $heading : $heading) . '</title><style>' . $css . '</style></head><body>'
    . '<header><form method="get" action="' . $h($self) . '">' . $hid
    . '<input type="text" name="' . $h($formName) . '" value="' . $h($q) . '" placeholder="Search" autocomplete="off">'
    . '<button type="submit">Search</button></form></header><main>' . $body . '</main></body></html>';
  exit;
}

if (isset($_GET['q']) && is_string($_GET['q']) && trim($_GET['q']) !== '' && !isset($_GET['ddg']) && !isset($_GET['gsearch'])) {
  $_GET['ddg'] = trim($_GET['q']);
}
if (isset($_GET['ddg'])) {
  $q = trim((string)$_GET['ddg']);
  if (function_exists('mb_substr')) $q = mb_substr($q, 0, 200);
  else $q = substr($q, 0, 200);
  $items = array();
  $note = 'DuckDuckGo did not return web results for that. Try another wording.';
  if ($q !== '') {
    $items = why_ddg_lite($q);
    if (!$items) {
      $url = 'https://api.duckduckgo.com/?format=json&no_html=1&t=whyrevived&q=' . rawurlencode($q);
      $data = why_api_get($url);
      if (!empty($data['AbstractURL'])) {
        $items[] = array(
          'title' => !empty($data['Heading']) ? $data['Heading'] : $q,
          'url' => why_http_url($data['AbstractURL']),
          'text' => isset($data['AbstractText']) ? $data['AbstractText'] : '',
          'image' => why_ddg_asset(isset($data['Image']) ? $data['Image'] : '')
        );
      } elseif (!empty($data['Answer'])) {
        $items[] = array(
          'title' => $data['Answer'],
          'url' => 'https://duckduckgo.com/?q=' . rawurlencode($q),
          'text' => isset($data['AbstractText']) ? $data['AbstractText'] : '',
          'image' => why_ddg_asset(isset($data['Image']) ? $data['Image'] : '')
        );
      }
      if (!empty($data['Results'])) why_ddg_topics($data['Results'], $items, 12);
      if (!empty($data['RelatedTopics'])) why_ddg_topics($data['RelatedTopics'], $items, 12);
      why_wiki_fill($items);
      $seen = array();
      $uniq = array();
      foreach ($items as $it) {
        if (empty($it['url'])) continue;
        $key = strtolower($it['url']);
        if (isset($seen[$key])) continue;
        $seen[$key] = 1;
        $uniq[] = $it;
      }
      $items = $uniq;
    }
  }
  why_api_page('DuckDuckGo', $q, $items, $note, 'ddg', array());
}

if (isset($_GET['gsearch'])) {
  $q = trim((string)$_GET['gsearch']);
  if (function_exists('mb_substr')) $q = mb_substr($q, 0, 200);
  else $q = substr($q, 0, 200);
  $key = isset($_GET['key']) ? (string)$_GET['key'] : '';
  $cx = isset($_GET['cx']) ? (string)$_GET['cx'] : '';
  $items = array();
  $note = 'Add a Google API key and search engine id in Settings. They come from Google Cloud credentials and Programmable Search Engine.';
  if ($q !== '' && $key !== '' && $cx !== '' && preg_match('/^[A-Za-z0-9_\-]+$/', $key) && preg_match('/^[A-Za-z0-9:_-]+$/', $cx)) {
    $url = 'https://www.googleapis.com/customsearch/v1?key=' . rawurlencode($key) . '&cx=' . rawurlencode($cx) . '&q=' . rawurlencode($q);
    $data = why_api_get($url);
    if (!empty($data['error']['message'])) $note = $data['error']['message'];
    if (!empty($data['items']) && is_array($data['items'])) {
      foreach ($data['items'] as $it) {
        if (empty($it['link']) || empty($it['title'])) continue;
        $img = '';
        if (!empty($it['pagemap']['cse_thumbnail'][0]['src'])) $img = $it['pagemap']['cse_thumbnail'][0]['src'];
        elseif (!empty($it['pagemap']['cse_image'][0]['src'])) $img = $it['pagemap']['cse_image'][0]['src'];
        elseif (!empty($it['pagemap']['metatags'][0]['og:image'])) $img = $it['pagemap']['metatags'][0]['og:image'];
        $desc = isset($it['snippet']) ? $it['snippet'] : '';
        if ($desc === '' && !empty($it['pagemap']['metatags'][0]['og:description'])) $desc = $it['pagemap']['metatags'][0]['og:description'];
        $items[] = array(
          'title' => $it['title'],
          'url' => $it['link'],
          'text' => $desc,
          'image' => $img
        );
        if (count($items) >= 10) break;
      }
      if (!$items) $note = 'No results.';
    }
  } elseif ($q !== '') {
    $note = 'Google search needs an API key and a CX id in Settings.';
  }
  why_api_page('Google', $q, $items, $note, 'gsearch', array('key' => $key, 'cx' => $cx));
}

if (isset($_GET['ytsearch'])) {
  $q = trim((string)$_GET['ytsearch']);
  if (function_exists('mb_substr')) $q = mb_substr($q, 0, 120);
  else $q = substr($q, 0, 120);
  $items = array();
  if ($q !== '') {
    $payload = json_encode(array(
      'context' => array('client' => array(
        'clientName' => 'WEB',
        'clientVersion' => '2.20250301.00.00',
        'hl' => 'en',
        'gl' => 'US'
      )),
      'query' => $q
    ));
    $ch = curl_init('https://www.youtube.com/youtubei/v1/search?prettyPrint=false');
    curl_setopt_array($ch, array(
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_POST => true,
      CURLOPT_POSTFIELDS => $payload,
      CURLOPT_HTTPHEADER => array(
        'Content-Type: application/json',
        'Accept: application/json',
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
      ),
      CURLOPT_CONNECTTIMEOUT => 8,
      CURLOPT_TIMEOUT => 14,
      CURLOPT_SSL_VERIFYPEER => true,
      CURLOPT_SSL_VERIFYHOST => 2,
    ));
    $raw = curl_exec($ch);
    curl_close($ch);
    if (is_string($raw) && $raw !== '' && preg_match_all('/"(videoRenderer|playlistRenderer)":\{"(videoId|playlistId)":"([A-Za-z0-9_-]{2,80})"/', $raw, $hits, PREG_OFFSET_CAPTURE)) {
      $seen = array();
      foreach ($hits[3] as $i => $hit) {
        $kind = $hits[1][$i][0] === 'playlistRenderer' ? 'playlist' : 'video';
        $id = $hit[0];
        $key = $kind . ':' . $id;
        if (isset($seen[$key])) continue;
        $seen[$key] = 1;
        $slice = substr($raw, $hit[1], $kind === 'playlist' ? 4500 : 2200);
        $title = '';
        $author = '';
        $len = '';
        $count = '';
        if (preg_match('/"title":\{"runs":\[\{"text":"((?:\\\\.|[^"\\\\])*)"/', $slice, $tm)) $title = why_yt_unescape($tm[1]);
        elseif (preg_match('/"title":\{"simpleText":"((?:\\\\.|[^"\\\\])*)"/', $slice, $tm)) $title = why_yt_unescape($tm[1]);
        if (preg_match('/"longBylineText":\{"runs":\[\{"text":"((?:\\\\.|[^"\\\\])*)"/', $slice, $am)) $author = why_yt_unescape($am[1]);
        elseif (preg_match('/"shortBylineText":\{"runs":\[\{"text":"((?:\\\\.|[^"\\\\])*)"/', $slice, $am)) $author = why_yt_unescape($am[1]);
        if (preg_match('/"lengthText":\{.*?"simpleText":"(\d+:\d+)"/', $slice, $lm)) $len = $lm[1];
        if (preg_match('/"videoCountText":\{"simpleText":"((?:\\\\.|[^"\\\\])*)"/', $slice, $cm)) $count = why_yt_unescape($cm[1]);
        elseif (preg_match('/"videoCountText":\{"runs":\[\{"text":"((?:\\\\.|[^"\\\\])*)"/', $slice, $cm)) $count = why_yt_unescape($cm[1]);
        elseif (preg_match('/"videoCount":"(\d+)"/', $slice, $cm)) $count = $cm[1];
        if ($title === '') continue;
        $thumb = '';
        if ($kind === 'video') $thumb = 'https://i.ytimg.com/vi/' . $id . '/mqdefault.jpg';
        elseif (preg_match('#i\.ytimg\.com/vi/([A-Za-z0-9_-]{11})/#', $slice, $im)) $thumb = 'https://i.ytimg.com/vi/' . $im[1] . '/mqdefault.jpg';
        $row = array('id' => $id, 'kind' => $kind, 'title' => $title, 'author' => $author, 'len' => $len, 'thumb' => $thumb);
        if ($kind === 'playlist') $row['count'] = $count;
        $items[] = $row;
        if (count($items) >= 24) break;
      }
    }
    if (is_string($raw) && $raw !== '' && count($items) < 24 && preg_match_all('/"(?:reelItemRenderer|shortsLockupViewModel)"\s*:\s*\{.{0,900}?"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"/s', $raw, $reels, PREG_OFFSET_CAPTURE)) {
      $seen = isset($seen) ? $seen : array();
      foreach ($reels[1] as $hit) {
        $id = $hit[0];
        $key = 'short:' . $id;
        if (isset($seen[$key]) || isset($seen['video:' . $id])) continue;
        $seen[$key] = 1;
        $slice = substr($raw, $hit[1], 1800);
        $title = '';
        $author = '';
        if (preg_match('/"headline"\s*:\s*\{\s*"simpleText"\s*:\s*"((?:\\\\.|[^"\\\\])*)"/', $slice, $tm)) $title = why_yt_unescape($tm[1]);
        elseif (preg_match('/"primaryText"\s*:\s*\{\s*"content"\s*:\s*"((?:\\\\.|[^"\\\\])*)"/', $slice, $tm)) $title = why_yt_unescape($tm[1]);
        elseif (preg_match('/"accessibilityText"\s*:\s*"((?:\\\\.|[^"\\\\])*)"/', $slice, $tm)) $title = why_yt_unescape($tm[1]);
        elseif (preg_match('/"label"\s*:\s*"((?:\\\\.|[^"\\\\])*)"/', $slice, $tm)) $title = why_yt_unescape($tm[1]);
        if (preg_match('/"shortBylineText"\s*:\s*\{\s*"runs"\s*:\s*\[\{\s*"text"\s*:\s*"((?:\\\\.|[^"\\\\])*)"/', $slice, $am)) $author = why_yt_unescape($am[1]);
        if ($title === '') $title = 'Short';
        $items[] = array(
          'id' => $id,
          'kind' => 'short',
          'title' => $title,
          'author' => $author,
          'len' => '',
          'thumb' => 'https://i.ytimg.com/vi/' . $id . '/mqdefault.jpg'
        );
        if (count($items) >= 24) break;
      }
    }
  }
  cors();
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  echo json_encode(array('ok' => count($items) > 0, 'items' => $items));
  exit;
}

if (isset($_GET['ping'])) {
  cors();
  header('Cache-Control: no-store');
  if ($_GET['ping'] === 'gif' || $_GET['ping'] === '1x1') {
    header('Content-Type: image/gif');
    echo base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
    exit;
  }
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(array('ok' => true, 'engine' => 'php', 'ws' => 'direct', 'mysql' => why_db() ? true : false, 'mysql_error' => why_db_note(), 'brotli' => why_brotli_ok(), 'encoding' => why_encoding_list()));
  exit;
}

if (isset($_GET['ws'])) {
  cors();
  header('Cache-Control: no-store');
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(array(
    'ok' => true,
    'engine' => 'php',
    'upgrade' => false,
    'mode' => 'direct',
    'brotli' => why_brotli_ok(),
    'encoding' => why_encoding_list(),
    'detail' => 'WebSocket connects from the browser to the page wss address. This PHP host does not keep a socket open.'
  ));
  exit;
}

$missed = isset($_GET['__miss']) || isset($_GET['__rel'])
  || (isset($_SERVER['REDIRECT_STATUS']) && (string)$_SERVER['REDIRECT_STATUS'] === '404');
$scriptPath = isset($_SERVER['SCRIPT_NAME']) ? $_SERVER['SCRIPT_NAME'] : '/fetch.php';
if (($path === $scriptPath || basename((string)$path) === basename($scriptPath)) && empty($_GET['url']) && empty($_GET['__pot']) && !$missed && !isset($_GET['ddg']) && !isset($_GET['gsearch']) && !isset($_GET['q'])) {
  why_api_page('Search', '', array(), 'Type a search above.', 'q', array());
}

$raw = isset($_GET['__pot']) ? $_GET['__pot'] : (isset($_GET['url']) ? $_GET['url'] : '');
$target = $raw;
if (!$target && $missed) {
  $target = why_correct_browser_bar();
  if ($target === '') $target = miss_from_host();
}
if ($target && !preg_match('#^https?://#i', $target)) {
  $d = b64d($target);
  if ($d && preg_match('#^https?://#i', $d)) $target = $d;
}
if (!$target) {
  cors();
  http_response_code(400);
  header('Content-Type: text/plain');
  echo 'missing url';
  exit;
}
if (!preg_match('#^https?://#i', $target)) $target = 'https://' . $target;
$parsed = parse_url($target);
if (!$parsed || empty($parsed['host']) || blocked_host($parsed['host'])) {
  cors();
  http_response_code(400);
  header('Content-Type: text/plain');
  echo 'bad host';
  exit;
}
$methodEarly = strtoupper(isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET');
if ($methodEarly === 'GET' || $methodEarly === 'HEAD') {
  $target = merge_request_query($target);
  $parsed = parse_url($target);
  if (!$parsed || empty($parsed['host']) || blocked_host($parsed['host'])) {
    cors();
    http_response_code(400);
    header('Content-Type: text/plain');
    echo 'bad host';
    exit;
  }
}
if (!empty($parsed['host']) && scratch_host($parsed['host'])) {
  $spath = isset($parsed['path']) ? $parsed['path'] : '/';
  if (preg_match('#^/(?:fetch|experimental)\.php$#i', $spath)) {
    $target = 'https://scratch.mit.edu/';
    $parsed = parse_url($target);
  }
}
$ytHost = !empty($parsed['host']) && yt_family($parsed['host']);

$anti = !isset($_GET['anti_detect']) || $_GET['anti_detect'] !== '0';
$prefix = proxy_prefix();
$devMode = isset($_GET['mode']) ? (string)$_GET['mode'] : '';
$ua = browser_ua($devMode);
$destEarly = classify_dest($target);
$scratchKindEarly = scratch_file_kind($target);
if (($scratchKindEarly === 'sound' || $scratchKindEarly === 'image') && empty($_GET['__raw'])) {
  $cached = why_scratch_cache($target);
  if (is_file($cached) && filesize($cached) > 32) {
    cors();
    header('Content-Type: ' . scratch_file_type($target));
    header('Cache-Control: public, max-age=604800');
    readfile($cached);
    exit;
  }
}
if (($destEarly === 'image' || $destEarly === 'font' || $destEarly === 'video') && empty($_GET['__raw']) && hotlink_home($parsed['host']) === '' && !scratch_host($parsed['host']) && empty($ytHost)) {
  cors();
  http_response_code(302);
  header('Cache-Control: public, max-age=86400');
  header('Location: ' . $target);
  exit;
}
if ($destEarly === 'style' && empty($_GET['__raw'])) {
  $cache = why_asset_cache($target);
  if (is_file($cache) && filesize($cache) > 20 && (time() - filemtime($cache)) < 86400) {
    cors();
    header('Content-Type: text/css; charset=utf-8');
    header('Cache-Control: public, max-age=86400');
    header('X-Content-Type-Options: nosniff');
    readfile($cache);
    exit;
  }
}
if ($destEarly === 'script' && empty($_GET['__raw']) && function_exists('curl_init') && !scratch_host($parsed['host']) && empty($ytHost)) {
  $head = curl_init($target);
  curl_setopt_array($head, array(
    CURLOPT_NOBODY => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_CONNECTTIMEOUT => 6,
    CURLOPT_TIMEOUT => 8,
    CURLOPT_USERAGENT => $ua,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
  ));
  curl_exec($head);
  $big = (float)curl_getinfo($head, CURLINFO_CONTENT_LENGTH_DOWNLOAD);
  curl_close($head);
  if ($big > 400000) {
    cors();
    http_response_code(302);
    header('Cache-Control: public, max-age=86400');
    header('Location: ' . $target);
    exit;
  }
}
if (!function_exists('curl_init')) {
  cors();
  http_response_code(502);
  echo 'curl off';
  exit;
}

$lang = human_lang(isset($_SERVER['HTTP_ACCEPT_LANGUAGE']) ? $_SERVER['HTTP_ACCEPT_LANGUAGE'] : '');
$isMedia = preg_match('#(?:/get_video\b|/videoplayback\b|\.m3u8(?:$|[?#])|\.mp4(?:$|[?#])|\.webm(?:$|[?#])|\.mp3(?:$|[?#]))#i', $target);
$typed = isset($_GET['nav']) && (string)$_GET['nav'] === '1';
$method = strtoupper(isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET');
if ($method !== 'POST' && $method !== 'PUT' && $method !== 'PATCH' && $method !== 'HEAD') $method = 'GET';
$postBody = null;
$postCt = isset($_SERVER['CONTENT_TYPE']) ? (string)$_SERVER['CONTENT_TYPE'] : '';
if ($method === 'POST' || $method === 'PUT' || $method === 'PATCH') {
  $postBody = file_get_contents('php://input');
  if (($postBody === '' || $postBody === false) && !empty($_POST)) $postBody = http_build_query($_POST);
}
$fromHint = '';
if (!empty($_SERVER['HTTP_REFERER'])) $fromHint = decode_proxy_hint($_SERVER['HTTP_REFERER']);
$last = nav_get();
$ckMap = ck_read();
$body = false;
$code = 0;
$err = '';
$hdrs_in = array();
$hops = 0;
$dest = classify_dest($target);

while ($hops < 4) {
  $dest = classify_dest($target);
  $isDoc = ($dest === 'document');
  $refRaw = '';
  if (!($isDoc && $typed && $hops === 0)) {
    if ($fromHint !== '') $refRaw = $fromHint;
    elseif ($last !== '') $refRaw = $last;
    else $refRaw = family_home_referer($parsed['host']);
  }
  $ref = $refRaw !== '' ? referer_for($refRaw, $target) : '';
  $reqHdrs = browser_req_headers($ua, $dest, $ref, $lang, $method, $target);
  $ckSend = ck_pairs($ckMap, $parsed['host']);
  if ($ckSend) {
    $bits = array();
    foreach ($ckSend as $n => $v) $bits[] = $n . '=' . $v;
    $reqHdrs[] = 'Cookie: ' . implode('; ', $bits);
  }
  if (scratch_host($parsed['host'])) {
    $token = str_replace(array("\r", "\n"), '', req_hdr('X-Token'));
    if ($token !== '') $reqHdrs[] = 'X-Token: ' . $token;
  }
  if ($postBody !== null && $postBody !== false && $postCt !== '') $reqHdrs[] = 'Content-Type: ' . $postCt;
  if (!empty($_SERVER['HTTP_RANGE']) && $hops === 0) $reqHdrs[] = 'Range: ' . $_SERVER['HTTP_RANGE'];
  $hdrs_in = array();
  $ch = curl_init($target);
  $curlOpts = array(
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => ((scratch_host($parsed['host']) || yt_family($parsed['host'])) ? 45 : ($dest === 'video' ? 45 : ($dest === 'style' ? 20 : 12))),
    CURLOPT_ENCODING => why_encoding_list(),
    CURLOPT_USERAGENT => $ua,
    CURLOPT_HTTPHEADER => $reqHdrs,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_NOSIGNAL => true,
    CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$hdrs_in) {
      $pos = strpos($line, ':');
      if ($pos !== false) $hdrs_in[strtolower(trim(substr($line, 0, $pos)))][] = trim(substr($line, $pos + 1));
      return strlen($line);
    },
  );
  if (defined('CURLPROTO_HTTP') && defined('CURLPROTO_HTTPS')) {
    $curlOpts[CURLOPT_PROTOCOLS] = CURLPROTO_HTTP | CURLPROTO_HTTPS;
    $curlOpts[CURLOPT_REDIR_PROTOCOLS] = CURLPROTO_HTTP | CURLPROTO_HTTPS;
  }
  if (defined('CURL_HTTP_VERSION_2TLS')) $curlOpts[CURLOPT_HTTP_VERSION] = CURL_HTTP_VERSION_2TLS;
  if ($method === 'POST') {
    $curlOpts[CURLOPT_POST] = true;
    $curlOpts[CURLOPT_POSTFIELDS] = $postBody === false ? '' : $postBody;
  } elseif ($method === 'PUT' || $method === 'PATCH' || $method === 'HEAD') {
    $curlOpts[CURLOPT_CUSTOMREQUEST] = $method;
    if ($method !== 'HEAD') $curlOpts[CURLOPT_POSTFIELDS] = $postBody === false ? '' : $postBody;
    if ($method === 'HEAD') $curlOpts[CURLOPT_NOBODY] = true;
  }
  curl_setopt_array($ch, $curlOpts);
  $body = curl_exec($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err = curl_error($ch);
  $finalUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
  if ($body === false && $hops === 0) {
    curl_close($ch);
    $ch = curl_init($target);
    curl_setopt_array($ch, $curlOpts);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    $finalUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
  }
  curl_close($ch);
  if (!empty($hdrs_in['set-cookie'])) {
    $ckMap = ck_eat($ckMap, $parsed['host'], $hdrs_in['set-cookie']);
    ck_write($ckMap);
  }
  if ($body === false) break;
  if ($code >= 300 && $code < 400 && !empty($hdrs_in['location'][0])) {
    $loc = join_url($target, $hdrs_in['location'][0]);
    if (!$loc) break;
    $next = parse_url($loc);
    if (!$next || empty($next['host']) || blocked_host($next['host'])) break;
    $isMediaHop = preg_match('#(?:/get_video\b|/videoplayback\b|\.m3u8(?:$|[?#])|\.mp4(?:$|[?#])|\.webm(?:$|[?#])|\.mp3(?:$|[?#]))#i', $loc);
    if ($isMedia || $dest === 'video' || $isMediaHop) break;
    $fromHint = $target;
    $typed = false;
    if ($code === 301 || $code === 302 || $code === 303) {
      $method = 'GET';
      $postBody = null;
      $postCt = '';
    }
    $target = $loc;
    $parsed = $next;
    $hops++;
    continue;
  }
  if ($finalUrl && preg_match('#^https?://#i', $finalUrl)) $target = $finalUrl;
  break;
}
if ($body !== false) $body = why_decode_payload($body, $hdrs_in);
if ($dest === 'document' && $body !== false && $code > 0 && $code < 400) nav_set($target);
if ($body === false) {
  cors();
  http_response_code(502);
  echo htmlspecialchars($err, ENT_QUOTES, 'UTF-8');
  exit;
}

cors();
if ($code >= 300 && $code < 400 && !empty($hdrs_in['location'][0])) {
  $loc = join_url($target, $hdrs_in['location'][0]);
  if ($loc) {
    if ($isMedia) {
      http_response_code($code);
      header('Location: ' . $loc);
      exit;
    }
    http_response_code($code);
    header('Location: ' . $prefix . rawurlencode(b64e($loc)));
    exit;
  }
}
$ct = isset($hdrs_in['content-type'][0]) ? strtolower($hdrs_in['content-type'][0]) : 'text/html';
$scratchKindNow = scratch_file_kind($target);
if ($scratchKindNow === 'sound' || $scratchKindNow === 'image' || $scratchKindNow === 'asset') {
  $type = scratch_file_type($target);
  if ($type === 'application/octet-stream' && $ct !== '' && strpos($ct, 'text/html') === false) $type = $hdrs_in['content-type'][0];
  @file_put_contents(why_scratch_cache($target), $body, LOCK_EX);
  http_response_code($code ? $code : 200);
  header('Content-Type: ' . $type);
  header('Cache-Control: public, max-age=604800');
  echo $body;
  exit;
}
$scratchHostNow = !empty($parsed['host']) && scratch_host($parsed['host']);
if ($scratchHostNow && scratch_json_body($body)) {
  http_response_code($code ? $code : 200);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  echo $body;
  exit;
}
http_response_code($code ? $code : 200);
header_remove('X-Frame-Options');
header_remove('Content-Security-Policy');
if (strpos($ct, 'text/html') !== false) {
  header('Content-Type: text/html; charset=utf-8');
  header('Cache-Control: no-store');
  if (preg_match('/used all available resources|free hosting account|Refresh the page once the amount of resources/i', $body)) {
    $busyBg = (isset($_GET['overhaul']) && (string)$_GET['overhaul'] === '1') ? '#07080a' : '#111';
    $busyFg = (isset($_GET['overhaul']) && (string)$_GET['overhaul'] === '1') ? '#f4f4f5' : '#eee';
    echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Host busy</title></head><body style="font-family:ui-sans-serif,system-ui,sans-serif;background:' . $busyBg . ';color:' . $busyFg . ';padding:28px;line-height:1.5">'
      . '<p>The free host ran out of CPU. Wait a few minutes. Do not keep refreshing.</p>'
      . '</body></html>';
    exit;
  }
  if (is_browser_check($body)) {
    $origin = '';
    $pp = parse_url($target);
    if ($pp && !empty($pp['scheme']) && !empty($pp['host'])) {
      $dir = isset($pp['path']) ? $pp['path'] : '/';
      if (strlen($dir) > 1 && substr($dir, -1) !== '/') $dir = substr($dir, 0, strrpos($dir, '/') + 1);
      $origin = $pp['scheme'] . '://' . $pp['host'] . (isset($pp['port']) ? ':' . $pp['port'] : '') . $dir;
    }
    if ($origin !== '' && !preg_match('/<base\b/i', $body)) {
      $tag = '<base href="' . htmlspecialchars($origin, ENT_QUOTES, 'UTF-8') . '">';
      if (preg_match('/<head[^>]*>/i', $body)) $body = preg_replace('/<head[^>]*>/i', '$0' . $tag, $body, 1);
      else $body = $tag . $body;
    }
    echo $body;
    exit;
  }
  if (!empty($_GET['__raw'])) {
    echo $body;
    exit;
  }
  $listed = brave_result_page($body, $target, $prefix);
  if ($listed !== '') {
    echo $listed;
    exit;
  }
  echo rewrite_html($body, $target, $prefix, $anti);
  exit;
}
if (strpos($ct, 'text/css') !== false) {
  header('Content-Type: text/css; charset=utf-8');
  header('Cache-Control: public, max-age=86400');
  header('X-Content-Type-Options: nosniff');
  $out = rewrite_css_urls($body, $target, $prefix);
  if (!is_string($out) || $out === '') $out = $body;
  @file_put_contents(why_asset_cache($target), $out, LOCK_EX);
  echo $out;
  exit;
}
if ($ct) header('Content-Type: ' . $hdrs_in['content-type'][0]);
if (!empty($hdrs_in['content-range'][0])) header('Content-Range: ' . $hdrs_in['content-range'][0]);
if (!empty($hdrs_in['accept-ranges'][0])) header('Accept-Ranges: ' . $hdrs_in['accept-ranges'][0]);
if (strpos($ct, 'image/') === 0) header('Cache-Control: public, max-age=3600');
echo $body;
