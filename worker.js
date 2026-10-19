// ASL University - member login + subscription API (Cloudflare Worker + D1)
const enc = new TextEncoder();
const COOKIE = 'asl_session';
const SESSION_MS = 30 * 24 * 3600 * 1000;
const PLANS = { '1m': 1, '3m': 3, '12m': 12 };
// pages that need a login (member.html) or an ACTIVE subscription (the rest)
const LOGIN_ONLY = new Set(['/member']);
const MEMBERS_ONLY = new Set(['/growth-program', '/asl-xauusd-analysis', '/asl-account-journal']);

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

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      /* ---------- protected pages ---------- */
      const key = path.replace(/\.html$/, '').replace(/\/$/, '');
      if (LOGIN_ONLY.has(key) || MEMBERS_ONLY.has(key)) {
        const user = await getUser(request, env);
        if (!user) return Response.redirect(url.origin + '/?login=1', 302);
        if (MEMBERS_ONLY.has(key) && !isActive(user)) return Response.redirect(url.origin + '/member', 302);
        const r = await env.ASSETS.fetch(request);
        const h = new Headers(r.headers);
        h.set('Cache-Control', 'private, no-store');
        return new Response(r.body, { status: r.status, headers: h });
      }

      if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);

      /* ---------- API ---------- */
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
