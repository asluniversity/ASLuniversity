// ASL University - member login + subscription API (Cloudflare Worker + D1)
const enc = new TextEncoder();
const COOKIE = 'asl_session';
const SESSION_MS = 30 * 24 * 3600 * 1000;
// TEST_OPEN: true = Pro Markets open to everyone (testing only). Set to false to lock it again.
const TEST_OPEN = true;
const PLANS = { '1m': 1, '3m': 3, '12m': 12 };
// Every section needs a LOGIN first (visitors are sent to the sign-in box, then come back here).
// - LOGIN_ONLY: logged-in users can open it.
// - PREVIEW: logged-in users can open it, but uploading a statement needs an ACTIVE subscription.
const LOGIN_ONLY = new Set(['/member', '/asl-xauusd-analysis', '/growth-program']);
const PREVIEW = new Set(['/asl-account-journal']);
const loginRedirect = (url, key) =>
  Response.redirect(url.origin + '/?login=1&next=' + encodeURIComponent(key + '.html'), 302);

function uploadGate(user) {
  const text = user
    ? 'Your subscription is not active. Activate a plan to upload your statement and get your full account analysis.'
    : 'Uploading your statement is for subscribers. Subscribe to get your full account analysis.';
  const second = user ? '<a class="b2" href="/member">My account</a>' : '<a class="b2" href="/?login=1">Sign in</a>';
  return `<style>
#asl-gate{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(6,17,22,.66);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);font-family:system-ui,-apple-system,Segoe UI,sans-serif}
#asl-gate[hidden]{display:none}
#asl-gate .c{position:relative;max-width:380px;width:100%;text-align:center;padding:30px 24px;border-radius:10px;background:#122630;color:#dceef4;border:1px solid rgba(11,177,210,.35);border-top:3px solid #0BB1D2;box-shadow:0 20px 70px rgba(0,0,0,.55)}
#asl-gate .x{position:absolute;top:8px;right:10px;width:32px;height:32px;border:0;background:none;color:#9fc3cf;font-size:24px;cursor:pointer}
#asl-gate .k{font-size:34px;margin-bottom:6px}
#asl-gate h2{font-size:21px;margin:0 0 8px;color:#fff}
#asl-gate p{font-size:14px;line-height:1.6;margin:0 0 20px;color:#9fc3cf}
#asl-gate a{display:block;padding:13px;margin-top:9px;border-radius:5px;text-decoration:none;font-weight:700;font-size:14px}
#asl-gate .b1{background:linear-gradient(135deg,#0BB1D2,#1eb3cc);color:#061116}
#asl-gate .b2{border:1px solid rgba(11,177,210,.5);color:#0BB1D2}
</style>
<div id="asl-gate" hidden><div class="c"><button class="x" id="asl-gate-x" aria-label="Close">&times;</button><div class="k">🔒</div><h2>Subscription required</h2><p>${text}</p><a class="b1" href="/?plans=1">Subscribe now</a>${second}</div></div>
<script>(function(){
  var g=document.getElementById('asl-gate');
  function show(){g.hidden=false}
  function isFile(t){return t&&t.matches&&t.matches('input[type=file]')}
  document.addEventListener('click',function(e){if(isFile(e.target)){e.preventDefault();e.stopPropagation();show()}},true);
  document.addEventListener('change',function(e){if(isFile(e.target)){e.stopPropagation();e.stopImmediatePropagation();try{e.target.value=''}catch(x){}show()}},true);
  ['dragover','drop'].forEach(function(n){document.addEventListener(n,function(e){
    var ty=e.dataTransfer&&e.dataTransfer.types?Array.prototype.slice.call(e.dataTransfer.types):[];
    if(ty.indexOf('Files')>-1){e.preventDefault();e.stopPropagation();if(n==='drop')show()}
  },true)});
  document.getElementById('asl-gate-x').onclick=function(){g.hidden=true};
  g.addEventListener('click',function(e){if(e.target===g)g.hidden=true});
})();</script>`;
}

// Cinematic "Welcome <name>" intro (fade in, then the page is revealed). Shown once per tab per page.
function welcome(name) {
  const n = JSON.stringify(String(name || '')).replace(/</g, '\\u003c');
  return `<style>
#asl-wel{display:none;position:fixed;inset:0;z-index:2147483600;align-items:center;justify-content:center;flex-direction:column;text-align:center;cursor:pointer;
  background:radial-gradient(ellipse 60% 55% at 50% 50%,rgba(11,177,210,.20),transparent 70%),#050d11;animation:aslWelOut 1s ease 3.3s forwards}
#asl-wel .a{font:600 clamp(12px,2.6vw,16px) system-ui,sans-serif;color:#7fe6f7;text-transform:uppercase;opacity:0;letter-spacing:.7em;animation:aslWelA 1.5s ease .3s forwards}
#asl-wel .b{margin-top:16px;padding:0 20px;font:700 clamp(36px,9vw,84px) 'Space Grotesk',system-ui,sans-serif;line-height:1.15;color:#fff;max-width:100%;overflow-wrap:anywhere;
  opacity:0;filter:blur(12px);transform:translateY(16px) scale(.97);text-shadow:0 0 40px rgba(11,177,210,.55);animation:aslWelB 1.6s cubic-bezier(.2,.7,.2,1) 1s forwards}
#asl-wel .c{margin-top:26px;height:2px;width:0;background:linear-gradient(90deg,transparent,#0BB1D2,transparent);animation:aslWelC 1.4s ease 1.6s forwards}
@keyframes aslWelA{to{opacity:1;letter-spacing:.38em}}
@keyframes aslWelB{to{opacity:1;filter:blur(0);transform:none}}
@keyframes aslWelC{to{width:min(240px,60vw)}}
@keyframes aslWelOut{to{opacity:0;visibility:hidden}}
@media (prefers-reduced-motion:reduce){#asl-wel{display:none!important}}
</style>
<div id="asl-wel"><div class="a">Welcome</div><div class="b" id="asl-wel-n"></div><div class="c"></div></div>
<script>(function(){
  var el=document.getElementById('asl-wel'),k='asl-wel:'+location.pathname.replace(/\\.html$/,'');
  try{if(sessionStorage.getItem(k)||(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)){el.remove();return}sessionStorage.setItem(k,'1')}catch(e){}
  document.getElementById('asl-wel-n').textContent=${n};
  el.style.display='flex';
  function done(){if(el.parentNode)el.remove()}
  el.addEventListener('animationend',function(e){if(e.animationName==='aslWelOut')done()});
  el.addEventListener('click',function(){el.style.transition='opacity .5s';el.style.opacity='0';setTimeout(done,520)});
  setTimeout(done,5000);
})();</script>`;
}

function withExtras(res, user, gate) {
  return new HTMLRewriter()
    .on('body', {
      element(el) {
        el.prepend(welcome(user.display_name), { html: true });
        if (gate) el.append(uploadGate(user), { html: true });
      }
    })
    .transform(res);
}

// Always ask the static assets for an exact file (html_handling is "none"), so there are no redirect hops.
async function getAsset(env, request, url, p) {
  const r = await env.ASSETS.fetch(new Request(url.origin + p + url.search, request));
  if (r.status === 404) return new Response('404 - file not found in site assets: ' + p, { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  return r;
}

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }
  });
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));
const rand = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

async function hashPw(pw, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: 100000 }, key, 256);
  return hex(bits);
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function getCookie(request, name) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}
const setCookie = (token, maxAge) =>
  `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

async function getUser(request, env) {
  const token = getCookie(request, COOKIE);
  if (!token) return null;
  return await env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.plan, u.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`
  ).bind(await sha(token), Date.now()).first();
}
const isActive = (u) => !!(u && u.expires_at && u.expires_at > Date.now());
const publicUser = (u) => ({
  name: u.display_name, username: u.username, plan: u.plan || null,
  expires_at: u.expires_at || null, active: isActive(u)
});

async function startSession(env, userId) {
  const token = rand(32);
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha(token), userId, Date.now() + SESSION_MS).run();
  return setCookie(token, SESSION_MS / 1000);
}

async function isAdmin(request, env) {
  if (!env.ADMIN_KEY) return false;
  const given = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  return same(await sha(given), await sha(env.ADMIN_KEY));
}


/* ---------- Pro Markets (EUR/USD, GBP/USD, USD/JPY, Nasdaq 100, WTI oil): subscribers only ---------- */
const MKT = {
  eurusd: 'EURUSD=X', gbpusd: 'GBPUSD=X', usdjpy: 'JPY=X', nasdaq: 'NQ=F', oil: 'CL=F',
  dxy: 'DX-Y.NYB', sp500: '^GSPC', gold: 'GC=F', us10y: '^TNX',
  btc: 'BTC-USD', eth: 'ETH-USD', sol: 'SOL-USD', bnb: 'BNB-USD', xrp: 'XRP-USD'
};
const MKT_RANGE = { '1d': '1d', '2d': '5d', '5d': '5d', '1mo': '1mo', '3mo': '3mo', '6mo': '6mo', '1y': '1y', '2y': '2y', '5y': '5y' };
const MKT_INTERVAL = { '1m': '1m', '5m': '5m', '15m': '15m', '60m': '60m', '1h': '60m', '1d': '1d' };
const YH = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function yahoo(sym, range, interval, ttl) {
  let err;
  for (const host of YH) {
    try {
      const r = await fetch(`${host}/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}&includePrePost=false`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        cf: { cacheTtl: ttl, cacheEverything: true }
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const res = j && j.chart && j.chart.result && j.chart.result[0];
      if (!res) throw new Error('no data');
      return res;
    } catch (e) { err = e; }
  }
  throw err;
}
function yRows(res, daily) {
  const ts = res.timestamp || [];
  const q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
  const off = (res.meta && res.meta.gmtoffset) || 0;
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close && q.close[i];
    if (c == null || !isFinite(c)) continue;
    const o = q.open && q.open[i], h = q.high && q.high[i], l = q.low && q.low[i];
    const row = { o: o == null ? c : o, h: h == null ? c : h, l: l == null ? c : l, c };
    if (daily) row.d = new Date((ts[i] + off) * 1000).toISOString().slice(0, 10);
    else row.t = ts[i] * 1000;
    out.push(row);
  }
  return out;
}

// short in-memory cache so the 1-second price polling does not hit the database every time
const AUTH_CACHE = new Map();
async function cachedUser(request, env) {
  const token = getCookie(request, COOKIE);
  if (!token) return null;
  const hit = AUTH_CACHE.get(token);
  if (hit && hit.until > Date.now()) return hit.user;
  const user = await getUser(request, env);
  if (AUTH_CACHE.size > 500) AUTH_CACHE.clear();
  AUTH_CACHE.set(token, { user, until: Date.now() + 30000 });
  return user;
}

async function proMarketApi(request, env, url) {
  if (!TEST_OPEN) {
    const user = await cachedUser(request, env);
    if (!user) return json({ error: 'Sign in required.' }, 401);
    if (!isActive(user)) return json({ error: 'Subscription required.' }, 403);
  }
  const kind = url.pathname.slice('/api/mkt/'.length);
  const sym = MKT[String(url.searchParams.get('symbol') || '').toLowerCase()];
  if (!sym) return json({ error: 'Unknown symbol.' }, 400);
  try {
    if (kind === 'spot') {
      const res = await yahoo(sym, '1d', '1m', 3);
      const rows = yRows(res, false);
      const m = res.meta || {};
      const price = isFinite(m.regularMarketPrice) ? m.regularMarketPrice : (rows.length ? rows[rows.length - 1].c : NaN);
      if (!isFinite(price)) return json({ error: 'No price.' }, 502);
      return json({ spot_usd_oz: price, updated_at: new Date((m.regularMarketTime || Date.now() / 1000) * 1000).toISOString() });
    }
    if (kind === 'history') {
      const res = await yahoo(sym, '5y', '1d', 900);
      return json({ data: yRows(res, true) });
    }
    if (kind === 'chart') {
      const interval = MKT_INTERVAL[url.searchParams.get('interval')];
      const range = MKT_RANGE[url.searchParams.get('range')];
      if (!interval || !range) return json({ error: 'Bad range or interval.' }, 400);
      const res = await yahoo(sym, range, interval, interval === '1d' ? 900 : interval === '1m' ? 5 : 20);
      return json({ data: yRows(res, interval === '1d') });
    }
    if (kind === 'intraday') {
      const hours = Math.max(1, Math.min(120, parseInt(url.searchParams.get('hours'), 10) || 48));
      const res = await yahoo(sym, '5d', '1m', 15);
      const from = Date.now() - hours * 3600e3;
      return json({ data: yRows(res, false).filter((r) => r.t >= from).map((r) => ({ t: r.t, p: r.c })) });
    }
    return json({ error: 'Not found.' }, 404);
  } catch (e) {
    return json({ error: 'Market feed unavailable. Please try again.' }, 502);
  }
}

function proLock(user) {
  const second = user
    ? '<a class="b2" href="/member">My account</a>'
    : '<a class="b2" href="/?login=1&next=' + encodeURIComponent('asl-markets-pro.html') + '">Sign in</a>';
  const lead = user
    ? 'Your subscription is not active. Activate a plan to unlock the Pro Markets desk.'
    : 'Pro Markets is for subscribers. Sign in or subscribe to unlock it.';
  const cards = [['EUR/USD', 'Euro vs US Dollar'], ['GBP/USD', 'Pound vs US Dollar'], ['USD/JPY', 'Dollar vs Yen'], ['NASDAQ 100', 'US tech index'], ['WTI OIL', 'US crude oil']]
    .map(([a, b]) => `<div class="m"><div class="k">🔒</div><b>${a}</b><span>${b}</span></div>`).join('');
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ASL University — Pro Markets (members)</title><meta name="robots" content="noindex">
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#0A0A0B;color:#F5F7F8;font-family:system-ui,-apple-system,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;padding:22px;
background:radial-gradient(ellipse 60% 50% at 50% 0%,rgba(11,177,210,.16),transparent 70%),#0A0A0B}
.w{max-width:760px;width:100%;text-align:center}
.tag{font:600 12px ui-monospace,Menlo,monospace;letter-spacing:.32em;color:#0BB1D2}
h1{font-size:clamp(28px,6vw,44px);margin:12px 0 10px;line-height:1.1}
p{color:#9fb0b8;line-height:1.65;margin:0 auto 22px;max-width:560px;font-size:15px}
.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:0 0 26px}
.m{border:1px solid #24272B;background:#111214;padding:16px 10px;border-radius:6px;display:flex;flex-direction:column;gap:4px}
.m .k{font-size:20px}.m b{font-size:15px}.m span{font-size:12px;color:#8A9096}
a{display:block;max-width:340px;margin:10px auto 0;padding:14px;border-radius:5px;text-decoration:none;font-weight:700;font-size:15px}
.b1{background:linear-gradient(135deg,#0BB1D2,#1eb3cc);color:#061116}.b2{border:1px solid rgba(11,177,210,.5);color:#0BB1D2}
.f{margin-top:20px;font-size:13px}.f a{display:inline;margin:0 8px;padding:0;color:#8A9096;font-weight:500}
</style></head><body><div class="w">
<div class="tag">ASL UNIVERSITY · PRO MARKETS</div>
<h1>Forex, Nasdaq &amp; Oil desk</h1>
<p>${lead} Same live engine as Gold and Bitcoin: signal, indicators, trade plan, key levels, correlations, COT, backtest and position calculator.</p>
<div class="g">${cards}</div>
<a class="b1" href="/?plans=1">Subscribe now</a>${second}
<div class="f"><a href="/asl-xauusd-analysis.html">Gold desk</a><a href="/asl-btcusd-analysis.html">Bitcoin desk</a><a href="/">Home</a></div>
</div></body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      /* ---------- protected pages ---------- */
      const key = path.replace(/\.html$/, '').replace(/\/$/, '');
      if (LOGIN_ONLY.has(key)) {
        const user = await getUser(request, env);
        if (!user) return loginRedirect(url, key);
        const r = await getAsset(env, request, url, key + '.html');
        const h = new Headers(r.headers);
        h.set('Cache-Control', 'private, no-store');
        const isHtml1 = (r.headers.get('Content-Type') || '').includes('text/html');
        const res1 = new Response(r.body, { status: r.status, headers: h });
        return isHtml1 && r.status === 200 ? withExtras(res1, user, false) : res1;
      }
      if (key === '/asl-markets-pro') {
        const user = await getUser(request, env);
        if (!TEST_OPEN && !isActive(user)) return proLock(user);          // the page itself is never sent to non-subscribers
        const r = await getAsset(env, request, url, key + '.html');
        const h = new Headers(r.headers);
        h.set('Cache-Control', 'private, no-store');
        const res = new Response(r.body, { status: r.status, headers: h });
        return user && (r.headers.get('Content-Type') || '').includes('text/html') && r.status === 200 ? withExtras(res, user, false) : res;
      }
      if (PREVIEW.has(key)) {
        const user = await getUser(request, env);
        if (!user) return loginRedirect(url, key);
        const r = await getAsset(env, request, url, key + '.html');
        const h = new Headers(r.headers);
        h.set('Cache-Control', 'private, no-store');
        const isHtml = (r.headers.get('Content-Type') || '').includes('text/html');
        const res = new Response(r.body, { status: r.status, headers: h });
        if (!isHtml || r.status !== 200) return res;
        return withExtras(res, user, !isActive(user));
      }

      if (!path.startsWith('/api/')) return getAsset(env, request, url, path === '/' ? '/index.html' : path);

      /* ---------- API ---------- */
      if (path.startsWith('/api/mkt/') && request.method === 'GET') return proMarketApi(request, env, url);

      if (path === '/api/me' && request.method === 'GET') {
        const user = await getUser(request, env);
        return user ? json({ authenticated: true, user: publicUser(user) }) : json({ authenticated: false });
      }

      if (path === '/api/logout' && request.method === 'POST') {
        const token = getCookie(request, COOKIE);
        if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha(token)).run();
        return json({ ok: true }, 200, { 'Set-Cookie': setCookie('', 0) });
      }

      if (path === '/api/register' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const name = String(body.name || '').trim();
        const password = String(body.password || '');
        if (name.length < 2 || name.length > 80) return json({ error: 'Name must be 2-80 characters.' }, 400);
        if (password.length < 8 || password.length > 200) return json({ error: 'Password must be at least 8 characters.' }, 400);
        const username = name.toLowerCase();
        const salt = rand(16);
        const hash = await hashPw(password, salt);
        let id;
        try {
          const res = await env.DB.prepare(
            'INSERT INTO users (username, display_name, salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)'
          ).bind(username, name, salt, hash, Date.now()).run();
          id = res.meta.last_row_id;
        } catch (e) {
          return json({ error: 'This name is already taken. Please choose another or sign in.' }, 409);
        }
        const cookie = await startSession(env, id);
        return json({ user: { name, username, plan: null, expires_at: null, active: false } }, 200, { 'Set-Cookie': cookie });
      }

      if (path === '/api/login' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const username = String(body.username || '').trim().toLowerCase();
        const password = String(body.password || '');
        const u = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
        const ok = u && same(await hashPw(password, u.salt), u.password_hash);
        if (!ok) return json({ error: 'Wrong name or password.' }, 401);
        await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?').bind(u.id, Date.now()).run();
        const cookie = await startSession(env, u.id);
        return json({ user: publicUser(u) }, 200, { 'Set-Cookie': cookie });
      }

      /* ---------- admin (needs ADMIN_KEY secret) ---------- */
      if (path === '/api/admin/users' && request.method === 'GET') {
        if (!(await isAdmin(request, env))) return json({ error: 'Unauthorized.' }, 401);
        const { results } = await env.DB.prepare(
          'SELECT username, display_name, plan, expires_at, created_at FROM users ORDER BY created_at DESC LIMIT 200'
        ).all();
        return json({ users: results });
      }

      if (path === '/api/admin/activate' && request.method === 'POST') {
        if (!(await isAdmin(request, env))) return json({ error: 'Unauthorized.' }, 401);
        const body = await request.json().catch(() => ({}));
        const username = String(body.username || '').trim().toLowerCase();
        const plan = String(body.plan || '');
        const u = await env.DB.prepare('SELECT id, expires_at FROM users WHERE username = ?').bind(username).first();
        if (!u) return json({ error: 'User not found.' }, 404);
        if (plan === 'cancel') {
          await env.DB.prepare('UPDATE users SET plan = NULL, expires_at = NULL WHERE id = ?').bind(u.id).run();
          return json({ ok: true, username, plan: null, expires_at: null });
        }
        if (!PLANS[plan]) return json({ error: 'Plan must be 1m, 3m, 12m or cancel.' }, 400);
        const base = Math.max(Date.now(), u.expires_at || 0); // renewing extends the current period
        const d = new Date(base);
        d.setUTCMonth(d.getUTCMonth() + PLANS[plan]);
        await env.DB.prepare('UPDATE users SET plan = ?, expires_at = ? WHERE id = ?').bind(plan, d.getTime(), u.id).run();
        return json({ ok: true, username, plan, expires_at: d.getTime() });
      }

      return json({ error: 'Not found.' }, 404);
    } catch (e) {
      return json({ error: 'Server error. Please try again.' }, 500);
    }
  }
};
