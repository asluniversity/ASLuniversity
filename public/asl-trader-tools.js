/* ============ SETTINGS ============
   Tools marked remote:true (copycat, news, pelosi, analyst) need a server because
   SEC, the House Clerk and news feeds block calls straight from a browser.
   Put your Worker address here once it serves  /api/<tool-id>  as JSON. */
const API_BASE = "";

/* ============ HELPERS ============ */
const $ = s => document.querySelector(s);
const money = n => "$" + Number(n).toLocaleString("en-US", {maximumFractionDigits: 2});
const lines = t => t.split("\n").map(s => s.trim()).filter(Boolean);
const list = t => t.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
const tbl = (head, rows) => `<div class="scroll"><table><tr>${head.map(x => `<th>${x}</th>`).join("")}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</table></div>`;
const note = t => `<div class="note">${t}</div>`;
const pf = v => `<span class="${v ? "ok" : "no"}">${v ? "PASS" : "BLOCK"}</span>`;

/* Split a budget across weights: cap per stock, drop slices under the minimum, share the rest out. */
function size(rows, inv, cap, min) {
  const capped = {}; let act = rows.slice();
  for (let g = 0; g < 60; g++) {
    const free = act.filter(r => !(r.t in capped));
    if (!free.length) break;
    const room = inv - Object.values(capped).reduce((a, b) => a + b, 0);
    const s = free.reduce((a, r) => a + r.w, 0);
    const over = free.filter(r => room * r.w / s > cap + 1e-9);
    if (over.length) { over.forEach(r => capped[r.t] = cap); continue; }
    const small = free.filter(r => room * r.w / s < min);
    if (small.length) { act = act.filter(r => !small.includes(r)); continue; }
    return act.map(r => ({...r, usd: r.t in capped ? capped[r.t] : room * r.w / s}));
  }
  return act.map(r => ({...r, usd: capped[r.t] || 0}));
}
const weights = (t, blocked = []) => lines(t).map(l => l.split(/[=,\s]+/)).map(([t, x]) => ({t: t.toUpperCase(), w: +x})).filter(r => r.w > 0 && !blocked.includes(r.t));

/* ============ TOOLS ============
   To add an option, push one more object into TOOLS:
   { id, icon, title, sub, fields:[{k,label,v,t:"num|text|area|sel|chk",o:[...],wide:true}], run: values => html }
   Set remote:true to call API_BASE + "/api/" + id instead of running in the browser. */
const common = [
  {k: "buf", label: "Cash buffer %", v: 10, t: "num"},
  {k: "cap", label: "Max per stock %", v: 25, t: "num"},
  {k: "min", label: "Min order $", v: 5, t: "num"},
  {k: "max", label: "Max order $", v: 2000, t: "num"}
];

const TOOLS = [
{ id: "copycat", icon: "🧬", title: "Copycat", sub: "Rebuild an investor from their 13F", remote: true,
  fields: [{k: "investor", label: "Investor or fund", v: "Berkshire Hathaway", t: "text"}, {k: "top", label: "Top N holdings", v: 5, t: "num"}] },

{ id: "news", icon: "📰", title: "News Monitor", sub: "Headlines and 8-K filings for your stocks", remote: true,
  fields: [{k: "tickers", label: "Tickers", v: "AAPL AXP GOOGL KO BAC", t: "text"}, {k: "hours", label: "Last N hours", v: 24, t: "num"}] },

{ id: "budget", icon: "💵", title: "Budget", sub: "Size every position to your budget",
  fields: [{k: "budget", label: "Budget $", v: 5000, t: "num"}, ...common.slice(0, 3), {k: "blocked", label: "Blocked tickers", v: "", t: "text"},
    {k: "w", label: "Target weights (TICKER weight, one per line)", v: "AAPL 22.04\nAXP 17.14\nGOOGL 12.62\nKO 10.86\nBAC 9.20", t: "area", wide: true}],
  run: v => {
    const B = +v.budget, inv = B * (1 - v.buf / 100), rows = size(weights(v.w, list(v.blocked)), inv, B * v.cap / 100, +v.min);
    const used = rows.reduce((a, r) => a + r.usd, 0), tot = rows.reduce((a, r) => a + r.w, 0);
    return tbl(["Ticker", "Weight kept", "Amount", "% of budget"], rows.map(r => [r.t, (r.w / tot * 100).toFixed(2) + "%", money(r.usd), (r.usd / B * 100).toFixed(1) + "%"]))
      + note(`Invested ${money(used)}. Cash ${money(B - used)} (buffer ${money(B - inv)}${inv - used > 0.5 ? `, plus ${money(inv - used)} left idle because every stock hit its cap` : ""}). These are proposals only.`);
  } },

{ id: "pelosi", icon: "🏛️", title: "Congress Tracker", sub: "Stock trades members of Congress disclose", remote: true,
  fields: [{k: "member", label: "Member", v: "pelosi", t: "text"}] },

{ id: "analyst", icon: "📈", title: "Earnings Analyst", sub: "Revenue, EPS and margins from SEC filings", remote: true,
  fields: [{k: "ticker", label: "Ticker", v: "AAPL", t: "text"}] },

{ id: "screener", icon: "🔎", title: "Screener", sub: "Rank stocks against your own rules",
  fields: [{k: "rules", label: "Rules (one per line)", v: "pe<25\ngrowth>5\nmargin>15", t: "area"},
    {k: "data", label: "Data (first line = column names)", v: "ticker pe growth margin\nAAPL 28 8 26\nKO 24 4 22\nBAC 12 6 28\nAXP 19 9 15", t: "area"}],
  run: v => {
    const L = lines(v.data).map(l => l.split(/\s+/)), cols = L[0].map(c => c.toLowerCase());
    const R = lines(v.rules).map(r => r.match(/^(\w+)\s*(<=|>=|<|>|=)\s*(-?[\d.]+)$/)).filter(Boolean).map(m => ({f: m[1].toLowerCase(), o: m[2], n: +m[3]}));
    const ok = (x, r) => ({"<": x < r.n, ">": x > r.n, "<=": x <= r.n, ">=": x >= r.n, "=": x == r.n})[r.o];
    const res = L.slice(1).map(row => {
      const o = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
      const failed = R.filter(r => !ok(+o[r.f], r));
      return {t: row[0].toUpperCase(), pass: !failed.length, failed: failed.map(r => r.f + r.o + r.n), score: R.length - failed.length};
    }).sort((a, b) => b.score - a.score);
    return tbl(["Ticker", "Result", "Rules passed", "Failed"], res.map(r => [r.t, pf(r.pass), r.score + "/" + R.length, r.failed.join(", ") || "-"]));
  } },

{ id: "risk", icon: "🛡️", title: "Risk Check", sub: "PASS or BLOCK for every proposed order",
  fields: [{k: "acct", label: "Account value $", v: 5000, t: "num"}, {k: "cash", label: "Cash now $", v: 5000, t: "num"}, ...common, {k: "blocked", label: "Blocked tickers", v: "", t: "text"},
    {k: "o", label: "Orders (BUY or SELL, ticker, dollars)", v: "BUY AAPL 1250\nBUY AXP 1119\nBUY GOOGL 823\nBUY KO 708\nBUY BAC 600", t: "area", wide: true}],
  run: v => {
    let cash = +v.cash; const A = +v.acct, bl = list(v.blocked), seen = new Set();
    const rows = lines(v.o).map(l => {
      const [side, t0, n0] = l.split(/\s+/), t = (t0 || "").toUpperCase(), usd = +n0, S = (side || "").toUpperCase(), why = [];
      if (!["BUY", "SELL"].includes(S) || !t || !(usd > 0)) why.push("format: use BUY or SELL, a ticker and dollars");
      else {
        if (bl.includes(t)) why.push("ticker is blocked");
        if (usd < v.min) why.push("under min order");
        if (usd > v.max) why.push("over max order");
        if (S == "BUY" && usd / A * 100 > v.cap) why.push(`position over ${v.cap}% of account`);
        if (S == "BUY" && cash - usd < A * v.buf / 100) why.push("dips into the cash buffer");
        if (seen.has(S + t)) why.push("duplicate in this batch");
      }
      seen.add(S + t);
      if (!why.length) cash += S == "BUY" ? -usd : usd;
      return [S, t, money(usd || 0), pf(!why.length), why.join("; ") || "-"];
    });
    return tbl(["Side", "Ticker", "Amount", "Verdict", "Reason"], rows) + note(`Orders are checked in order as if each PASS had filled. Cash left after passing orders: ${money(cash)}.`);
  } },

{ id: "broker", icon: "🎫", title: "Order Ticket", sub: "Prepare a ticket; it never sends anything",
  fields: [{k: "side", label: "Side", v: "buy", t: "sel", o: ["buy", "sell"]}, {k: "sym", label: "Ticker", v: "AAPL", t: "text"}, {k: "usd", label: "Amount $", v: 1250, t: "num"},
    {k: "tif", label: "Time in force", v: "day", t: "sel", o: ["day", "gtc"]}, {k: "yes", label: "Yes, I approve this exact order", v: false, t: "chk", wide: true}],
  run: v => {
    const ticket = {symbol: v.sym.toUpperCase(), side: v.side, notional: String(+v.usd), type: "market", time_in_force: v.tif, paper: true};
    return `<pre>${JSON.stringify(ticket, null, 2)}</pre>` + (v.yes
      ? note(`<span class="ok">Approved by you.</span> Copy this ticket into your broker's paper account yourself. This page cannot place orders.`)
      : note(`<span class="no">Not ready.</span> Run it through Risk Check first, then tick the approval box.`));
  } },

{ id: "tax", icon: "🧾", title: "Tax Lots", sub: "Gains, losses and harvest candidates (US rules)",
  fields: [{k: "min", label: "Min loss to harvest $", v: 100, t: "num"},
    {k: "lots", label: "Lots (ticker, buy date, shares, cost per share)", v: "AAPL 2025-03-01 10 150\nAAPL 2026-10-10 2 185\nKO 2026-02-15 20 70", t: "area", wide: true},
    {k: "px", label: "Prices now (ticker price)", v: "AAPL 140\nKO 62", t: "area", wide: true}],
  run: v => {
    const P = Object.fromEntries(lines(v.px).map(l => l.split(/\s+/)).map(([t, p]) => [t.toUpperCase(), +p])), now = Date.now(), D = 864e5;
    const L = lines(v.lots).map(l => l.split(/\s+/)).map(([t, d, s, c]) => ({t: t.toUpperCase(), d: new Date(d), s: +s, c: +c}));
    const rows = L.map(l => {
      const g = (P[l.t] - l.c) * l.s, age = (now - l.d) / D, recent = L.some(o => o !== l && o.t == l.t && (now - o.d) / D <= 30);
      return {l, g, term: age > 365 ? "long" : "short", harvest: g <= -v.min, wash: recent};
    });
    return tbl(["Ticker", "Bought", "Shares", "Gain / loss", "Term", "Harvest?"], rows.map(r => [r.l.t, r.l.d.toISOString().slice(0, 10), r.l.s, `<span class="${r.g < 0 ? "no" : "ok"}">${money(r.g)}</span>`, r.term,
      r.harvest ? (r.wash ? "yes, but a buy within 30 days risks a wash sale" : "yes") : "-"]))
      + note("After selling at a loss, do not rebuy the same stock for 30 days (US wash-sale rule). This is arithmetic, not tax advice.");
  } },

{ id: "alerts", icon: "🔔", title: "Price Alerts", sub: "Targets, stops and the NYSE clock",
  fields: [{k: "a", label: "Alerts (ticker above|below price)", v: "AAPL above 200\nKO below 60", t: "area"}, {k: "px", label: "Prices now (ticker price)", v: "AAPL 205\nKO 62", t: "area"}],
  run: v => {
    const P = Object.fromEntries(lines(v.px).map(l => l.split(/\s+/)).map(([t, p]) => [t.toUpperCase(), +p]));
    const rows = lines(v.a).map(l => l.split(/\s+/)).map(([t, dir, n]) => {
      const p = P[t.toUpperCase()], hit = dir.toLowerCase() == "above" ? p >= +n : p <= +n;
      return [t.toUpperCase(), dir + " " + n, (p === undefined ? "no price" : p), hit ? `<span class="ok">TRIGGERED</span>` : "waiting"];
    });
    const ny = new Date(new Date().toLocaleString("en-US", {timeZone: "America/New_York"})), m = ny.getHours() * 60 + ny.getMinutes();
    const hol = ["2026-11-26", "2026-12-25", "2027-01-01", "2027-01-18", "2027-02-15"], iso = ny.toLocaleDateString("en-CA");
    const open = ny.getDay() % 6 && !hol.includes(iso) && m >= 570 && m < 960;
    return tbl(["Ticker", "Alert", "Price", "Status"], rows) + note(`NYSE is ${open ? "<b class=ok>open</b>" : "<b class=no>closed</b>"} (New York time ${ny.toTimeString().slice(0, 5)}, regular hours 09:30-16:00, Mon-Fri). Holiday list covers late 2026 to early 2027 only.`);
  } },

{ id: "rebalance", icon: "⚖️", title: "Rebalancer", sub: "Trades that bring you back to target",
  fields: [{k: "cash", label: "Cash $", v: 500, t: "num"}, {k: "band", label: "Drift band (points)", v: 5, t: "num"}, ...common,
    {k: "h", label: "Holdings (ticker shares price)", v: "AAPL 20 190\nAXP 4 280\nKO 30 64", t: "area"},
    {k: "t", label: "Targets (ticker weight)", v: "AAPL 40\nAXP 30\nKO 30", t: "area"}],
  run: v => {
    const H = lines(v.h).map(l => l.split(/\s+/)).map(([t, s, p]) => ({t: t.toUpperCase(), val: s * p})), cur = t => (H.find(h => h.t == t) || {val: 0}).val;
    const A = +v.cash + H.reduce((a, h) => a + h.val, 0), sleeve = A * (1 - v.buf / 100);
    const tg = size(weights(v.t), sleeve, A * v.cap / 100, 0);
    const T = tg.map(r => {
      const drift = (cur(r.t) - r.usd) / A * 100; let d = r.usd - cur(r.t);
      const trade = Math.abs(drift) > v.band && Math.abs(d) >= v.min;
      return {t: r.t, drift, d: Math.sign(d) * Math.min(Math.abs(d), +v.max), trade};
    });
    const sells = T.filter(x => x.trade && x.d < 0), buys = T.filter(x => x.trade && x.d > 0);
    const avail = Math.max(0, +v.cash - A * v.buf / 100) + sells.reduce((a, x) => a - x.d, 0), need = buys.reduce((a, x) => a + x.d, 0), k = need > avail ? avail / need : 1;
    const rows = T.map(x => [x.t, (x.drift > 0 ? "+" : "") + x.drift.toFixed(1) + " pts", !x.trade ? "inside band" : x.d < 0 ? `<span class="no">SELL ${money(-x.d)}</span>` : `<span class="ok">BUY ${money(x.d * k)}</span>`]);
    return tbl(["Ticker", "Drift", "Proposed trade"], rows) + note(`Account value ${money(A)}. Sells are done first so the cash is there${k < 1 ? "; buys were scaled down to stay above your cash buffer" : ""}.`);
  } }
];

/* ============ RENDERING ============ */
TOOLS.sort((a, b) => !!a.remote - !!b.remote); /* working tools first, server tools last */
const nav = $("#nav"), main = $("#main");
TOOLS.forEach((t, i) => {
  const b = document.createElement("button");
  b.role = "tab"; b.dataset.i = i;
  b.innerHTML = `<span class="ic">${t.icon}</span><b>${t.title}</b><small>${t.sub}${t.remote && !API_BASE ? " (needs server)" : ""}</small>`;
  b.onclick = () => { open(i); main.scrollIntoView({behavior: "smooth", block: "start"}); };
  nav.appendChild(b);
});

function open(i) {
  const t = TOOLS[i];
  nav.querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-selected", i == j));
  const f = t.fields.map(x => {
    const w = x.wide || x.t == "area" ? " wide" : "";
    if (x.t == "area") return `<label class="${w}">${x.label}<textarea name="${x.k}">${x.v}</textarea></label>`;
    if (x.t == "sel") return `<label>${x.label}<select name="${x.k}">${x.o.map(o => `<option ${o == x.v ? "selected" : ""}>${o}</option>`).join("")}</select></label>`;
    if (x.t == "chk") return `<label class="chk wide"><input type="checkbox" name="${x.k}">${x.label}</label>`;
    return `<label class="${w}">${x.label}<input name="${x.k}" type="${x.t == "num" ? "number" : "text"}" step="any" value="${x.v}"></label>`;
  }).join("");
  main.innerHTML = `<h1>${t.icon} ${t.title}</h1><p class="sub">${t.sub}</p><form>${f}<button class="go" type="button">Run</button></form><div id="out"></div>`;
  const form = main.querySelector("form");
  const go = async () => {
    const v = {}; Array.prototype.forEach.call(form.elements, el => { if (el.name) v[el.name] = el.type == "checkbox" ? el.checked : el.value; });
    const out = $("#out");
    try {
      if (t.remote) {
        if (!API_BASE) { out.innerHTML = note(`<b class=no>Not connected yet.</b> This tool reads SEC, House Clerk or news data, which browsers cannot fetch directly. The other tools work without a server. Set <code>API_BASE</code> at the top of asl-trader-tools.js to a Worker that answers <code>/api/${t.id}</code> with JSON.`); return; }
        out.textContent = "Loading...";
        const r = await fetch(`${API_BASE}/api/${t.id}?` + new URLSearchParams(v)); if (!r.ok) throw new Error("Server answered " + r.status);
        out.innerHTML = `<pre>${JSON.stringify(await r.json(), null, 2).replace(/</g, "&lt;")}</pre>`;
      } else out.innerHTML = t.run(v);
    } catch (err) { out.innerHTML = note(`<span class="no">Could not run:</span> ${String(err.message || err).replace(/</g, "&lt;")}. Check the inputs and try again.`); }
  };
  form.addEventListener("submit", e => { e.preventDefault(); go(); });
  form.querySelector(".go").addEventListener("click", e => { e.preventDefault(); go(); });
  go();
}
window.addEventListener("error", e => { const m = $("#main"); if (m) m.insertAdjacentHTML("afterbegin", note(`<span class="no">Script error:</span> ${String(e.message).replace(/</g, "&lt;")}`)); });
open(0);

/* theme toggle, same saved choice as the main site */
(function () {
  const set = m => { document.documentElement.setAttribute("data-theme", m); try { localStorage.setItem("asl-theme", m); } catch (e) {} document.querySelectorAll("[data-theme-btn]").forEach(b => b.setAttribute("aria-pressed", b.dataset.themeBtn == m)); };
  document.querySelectorAll("[data-theme-btn]").forEach(b => b.addEventListener("click", () => set(b.dataset.themeBtn)));
  set(document.documentElement.getAttribute("data-theme") || "dark");
})();
