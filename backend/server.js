const path = require('path');
const express = require('express');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';
const ROOT = __dirname;
const DATABASE_URL = process.env.DATABASE_URL;
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || 'https://asluniversity.github.io').replace(/\/$/, '');

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL. Configure a PostgreSQL database before starting the server.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30000
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false }));

// CORS for the GitHub Pages frontend.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin === FRONTEND_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(session({
  store: new PgStore({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    maxAge: 1000 * 60 * 60 * 24 * 30
  }
}));

function normalizeUsername(value) {
  return String(value || '').trim().toLocaleLowerCase();
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    createdAt: row.created_at
  };
}

function validName(name) {
  return name.length >= 2 && name.length <= 80 && !/[<>]/.test(name);
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect(`${FRONTEND_ORIGIN}/`);
  next();
}

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'asl-university-backend' });
  } catch (error) {
    res.status(503).json({ ok: false, error: 'database_unavailable' });
  }
});

app.get('/api/me', async (req, res) => {
  if (!req.session.userId) return res.json({ authenticated: false });
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
  const user = result.rows[0];
  if (!user) {
    req.session.destroy(() => {});
    return res.json({ authenticated: false });
  }
  res.json({ authenticated: true, user: publicUser(user) });
});

app.post('/api/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const password = String(req.body.password || '');
    const username = normalizeUsername(name);

    if (!validName(name)) return res.status(400).json({ error: 'Please enter a valid name.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rowCount) return res.status(409).json({ error: 'An account with this username already exists.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const inserted = await pool.query(
      'INSERT INTO users (name, username, password_hash) VALUES ($1, $2, $3) RETURNING *',
      [name, username, passwordHash]
    );
    const user = inserted.rows[0];

    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: 'Could not create session.' });
      req.session.userId = user.id;
      req.session.save(saveErr => {
        if (saveErr) return res.status(500).json({ error: 'Could not save session.' });
        res.status(201).json({ user: publicUser(user) });
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || '');
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });

    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: 'Could not create session.' });
      req.session.userId = user.id;
      req.session.save(saveErr => {
        if (saveErr) return res.status(500).json({ error: 'Could not save session.' });
        res.json({ user: publicUser(user) });
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed.' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    res.clearCookie('connect.sid', { httpOnly: true, sameSite: 'none', secure: true });
    if (err) return res.status(500).json({ error: 'Logout failed.' });
    res.json({ ok: true });
  });
});

// Backend-only private member pages. Put private HTML files in this project.
app.use((req, res, next) => {
  const pathname = decodeURIComponent(req.path);
  const protectedPage = pathname === '/member.html' || /^\/asl-account-journal[^/]*\.html$/i.test(pathname) || pathname === '/asl-xauusd-analysis.html';
  if (protectedPage) return requireAuth(req, res, next);
  next();
});

app.use(express.static(ROOT, { index: false, extensions: ['html'] }));

app.use((req, res) => res.status(404).send('Not found'));

initDb()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`ASL University backend running on port ${PORT}`);
    });
  })
  .catch(error => {
    console.error('Database initialization failed:', error);
    process.exit(1);
  });
