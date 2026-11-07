// ASL University - Growth Program logic. Runs ONLY on the Worker, so the plan is never sent to non-subscribers.
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const TR = { P: 'Patience', T: 'Decision speed', C: 'Emotional control', D: 'Discipline', R: 'Risk appetite' };
const FL = { revenge: 'Revenge trading', fomo: 'FOMO / chasing price', overtrade: 'Overtrading', movesStop: 'Moves the stop-loss', cutsWinners: 'Cuts winners early', holdsLosers: 'Holds / averages losers', newsChaser: 'Gambles on news', overconfident: 'Overconfidence after wins', noPlan: 'No fixed plan' };

/* each option: [text, trait deltas, behaviour flag points] */
const Q = [
  { k: 'exp', s: 'About you', t: 'How long have you been trading?', o: [['I have not started yet'], ['Under 6 months'], ['6 to 24 months'], ['More than 2 years']] },
  { k: 'hours', s: 'About you', t: 'How much time can you realistically watch the charts on a normal day?', o: [['Less than 1 hour'], ['1 to 3 hours'], ['3 to 6 hours'], ['Most of the day']] },
  { k: 'goal', s: 'About you', t: 'What is your main goal right now?', o: [['Pass a prop firm challenge'], ['A steady side income'], ['Grow my own account'], ['Make trading my full-time career']] },
  { s: 'Your reactions', t: 'Your trade hits the stop-loss for a full loss. What do you do next?', o: [
    ['Step away from the screen for a while', { C: 2, D: 1 }], ['Review the trade calmly and wait for the next valid setup', { C: 2, D: 2 }],
    ['Open another trade right away to win it back', { C: -2, D: -2, T: 1 }, { revenge: 2 }], ['Carry on but stay angry or shaky for the rest of the day', { C: -1 }, { revenge: 1 }]] },
  { s: 'Your reactions', t: 'Price is moving fast and you missed your entry. What do you do?', o: [
    ['Let it go and wait for a pullback', { P: 2, D: 2 }], ['Chase it with a smaller size', { D: -1, T: 1 }, { fomo: 1 }],
    ['Chase it at full size', { D: -2, R: 1 }, { fomo: 2 }], ['Look at other markets for a new chance', { T: 1 }, { overtrade: 1 }]] },
  { s: 'Your reactions', t: 'Your trade is up 1R and starts to pull back. What do you do?', o: [
    ['Close at once to lock the profit', { P: -2, C: -1 }, { cutsWinners: 2 }], ['Move the stop to breakeven and let it run', { P: 1, D: 2 }],
    ['Hold to the target whatever happens', { P: 1, D: 1, R: 1 }], ['Add to the position', { R: 2, D: -1 }, { overconfident: 1 }]] },
  { s: 'Your reactions', t: 'Your trade goes against you and nears the stop-loss. What do you do?', o: [
    ['Nothing — the stop will do its job', { D: 2, C: 1 }], ['Move the stop further away to give it room', { D: -2 }, { movesStop: 2, holdsLosers: 1 }],
    ['Close early before the stop is hit', { C: -1, T: 1 }], ['Add to the position to average down', { R: 2, D: -2 }, { holdsLosers: 2 }]] },
  { s: 'Your reactions', t: 'You win three trades in a row. What happens next?', o: [
    ['Same size, same routine', { D: 2, C: 1 }], ['I increase my size because I am on a roll', { R: 2, D: -1 }, { overconfident: 2 }],
    ['I take more trades than usual', { T: 1, D: -1 }, { overtrade: 2 }], ['I get nervous it will end and close trades early', { C: -1 }, { cutsWinners: 1 }]] },
  { s: 'Your reactions', t: 'Major news (NFP, CPI, FOMC) is due in 10 minutes. What do you do?', o: [
    ['Stay out and wait for the dust to settle', { D: 2, C: 1, P: 1 }], ['Trade the spike as fast as I can', { R: 2, T: 2 }, { newsChaser: 2 }],
    ['Keep my open trade through it', { R: 1, D: -1 }], ['Place pending orders on both sides', { R: 1, T: 1 }, { newsChaser: 1 }]] },
  { s: 'Your reactions', t: 'The market is slow and nothing has happened for hours.', o: [
    ['I wait — doing nothing is also a position', { P: 2, D: 2 }], ['I drop to a lower timeframe to find action', { P: -2, T: 1 }, { overtrade: 2 }],
    ['I take a setup that is "close enough"', { D: -2 }, { overtrade: 1 }], ['I leave and check back later', { P: 1, C: 1 }]] },
  { s: 'Your reactions', t: 'How do you feel about holding a trade overnight or over the weekend?', o: [
    ['Comfortable — I plan for it', { P: 2, C: 1 }], ['Fine as long as the stop is set', { P: 1, C: 1 }],
    ['Anxious — I keep checking my phone', { P: -1, C: -2 }], ['I always close before the end of the session', { P: -2, T: 1 }]] },
  { s: 'Your style', t: 'How do you usually make a trading decision?', o: [
    ['Fast, on instinct and momentum', { T: 2, D: -1 }], ['Quick checklist, then execute', { T: 1, D: 2 }],
    ['Deep analysis on several timeframes, taking my time', { P: 2, T: -2, D: 1 }], ['I rely on signals or opinions from others', { D: -2 }, { noPlan: 2 }]] },
  { s: 'Your style', t: 'How often do you break your own rules?', o: [
    ['Almost never', { D: 2 }], ['Sometimes, when I feel confident', {}, { overconfident: 1 }],
    ['Often, when emotions rise', { D: -2, C: -1 }], ['I do not have fixed rules yet', { D: -1 }, { noPlan: 2 }]] },
  { s: 'Your style', t: 'Your losses for the day reach your daily limit (or the limit you should have).', o: [
    ['I stop trading for the day', { D: 2, C: 2 }], ['I take one more trade to get back to zero', { D: -2 }, { revenge: 2 }],
    ['I keep going — I can still recover', { R: 1, D: -2 }, { revenge: 1 }], ['I do not have a daily limit', { D: -1, R: 1 }, { noPlan: 1 }]] },
  { s: 'Your style', t: 'How many trades per day feel normal to you?', o: [
    ['1 to 2 high-quality trades', { P: 2, T: -1 }], ['3 to 6 trades', { T: 1 }],
    ['7 to 15 trades', { T: 2 }, { overtrade: 1 }], ['As many as I can find', { T: 2, P: -2 }, { overtrade: 2 }]] },
  { s: 'Your style', t: 'You have several losing trades in one week. How do you react?', o: [
    ['Calm — it is part of the math', { C: 2 }], ['Discouraged, but I keep following my rules', { C: 1, D: 1 }],
    ['I keep changing my strategy', { D: -2, C: -1 }, { noPlan: 1 }], ['I raise my risk to catch up', { R: 2, D: -2 }, { revenge: 2 }]] },
  { s: 'Your style', t: 'A 5-minute setup appears that goes against the daily trend.', o: [
    ['Skip it — the bigger trend comes first', { P: 1, D: 2 }], ['Take a quick scalp with a tight stop', { T: 2, R: 1 }],
    ['Take it at full size', { R: 2, D: -1 }], ['Watch and wait', { P: 2 }]] },
  { s: 'Your style', t: 'How much do you risk per trade without losing sleep?', o: [
    ['0.5% of the account or less', { R: -2, C: 1 }], ['About 1%', { R: 0 }],
    ['2% to 3%', { R: 1 }], ['5% or more, or "whatever feels right"', { R: 2, D: -1 }]] },
  { s: 'Your style', t: 'How does watching your live profit and loss tick up and down affect you?', o: [
    ['It does not affect me', { C: 2 }], ['A little tension, but I stay on plan', { C: 1 }],
    ['It tempts me to act', { C: -1, T: 1 }], ['It causes anxiety and I cannot focus', { C: -2 }]] }
];

/* free-text keyword patterns (English + Persian) — flag points and trait nudges */
const PAT = [
  [/revenge|win (it|them|money) back|get (it|my money|money) back|make (it )?back|انتقام|جبران/i, 'revenge', 'Re-entering to win losses back'],
  [/fomo|miss(ed|ing)? (out|the (move|trade|entry))|chas(e|ed|ing)|afraid.{0,20}miss|فومو|از دست دادن فرصت|دنبال قیمت/i, 'fomo', 'Chasing price / fear of missing out'],
  [/overtrad|too many trades|can'?t stop trading|addict|اوور ?ترید|زیاد معامله/i, 'overtrade', 'Trading too much'],
  [/mov(e|ed|ing) (my )?(stop|sl)|widen(ed)? (my )?stop|remov(e|ed) (my )?stop|حد ضرر.{0,15}(جابه|عوض|برداشت|دور)/i, 'movesStop', 'Moving the stop-loss'],
  [/clos(e|ed|ing) (too )?(early|soon)|cut (my )?(profit|winner)s?|take profit too (soon|early)|زود.{0,12}(سود|می.?بندم)/i, 'cutsWinners', 'Closing winners too early'],
  [/hold(ing)? (my )?(loss|loser)|hope (it|price)|average (down|in)|مارتینگل|میانگین/i, 'holdsLosers', 'Holding or averaging losers'],
  [/(trade|trading|gambl\w*) (the )?news|news (spike|trade)|معامله.{0,10}اخبار/i, 'newsChaser', 'Trading news spikes'],
  [/overconfiden|too confident|doubl(e|ed) (my )?(size|lot)|increas(e|ed) (my )?(size|lot)/i, 'overconfident', 'Increasing size after wins'],
  [/no (trading )?plan|without (a )?plan|random(ly)?|gut feeling|بدون پلن|بی.?برنامه/i, 'noPlan', 'Trading without a plan'],
  [/impatient|restless|bored|بی.?حوصله|صبر ندارم/i, null, 'Impatience', { P: -10 }],
  [/anxious|anxiety|panic|scared|nervous|stress|ترس|استرس|اضطراب/i, null, 'Stress under pressure', { C: -8 }],
  [/emotional|tilt|angry|frustrat|عصبی|عصبانی/i, null, 'Emotional reactions', { C: -8 }]
];

const STY = {
  scalp: { name: 'Scalping', noun: 'Scalper', ideal: { P: 25, T: 90, C: 80, D: 85, R: 55 }, w: { P: 1, T: 2, C: 2.5, D: 2.5, R: 0.5 }, base: 0.5,
    tf: 'M1–M5 for entries, M15 for the trend', hold: 'Seconds to about 30 minutes', freq: (o) => 'Up to ' + (o ? 6 : 10) + ' trades a day, then stop',
    when: 'London/NY overlap 13:00–17:00 GMT, plus the first hour after the London open',
    setups: ['Liquidity sweep of a session high/low, then a reclaim', 'Momentum pullback to the EMA 20 / VWAP in the trend direction', 'Opening-range breakout with a retest'],
    entry: ['Trade only in the direction of the M15 trend', 'Enter after the candle closes — never in the middle of a candle', 'Skip when the spread is wide (news, rollover, thin liquidity)'],
    exit: ['Stop beyond the sweep or last swing: roughly 0.5–1× the M5 ATR', 'Take half at 1R, move the stop to breakeven, aim for 1.5–2R on the rest', 'If price has not moved within about 10 candles, exit at breakeven'],
    req: [['T', 'hi', 'Your fast decision speed ({v}) suits quick execution'], ['C', 'hi', 'Your emotional control ({v}) helps you survive rapid wins and losses'], ['D', 'hi', 'Your discipline ({v}) keeps a high trade frequency inside the rules'], ['P', 'lo', 'You prefer short holding times (patience {v})']],
    watch: 'Scalping punishes emotional mistakes and costs add up quickly. Prove the plan on a demo or micro size first.',
    routine: ['Before the session: mark the previous-day high/low, the daily pivot and the session range', 'Pick the one or two setups you will take today and write them down', 'During: take only A-grade setups, log every trade right after it closes', 'Stop at your daily trade cap or daily loss limit — whichever comes first', 'After: 10 minutes in the journal — grade each trade for plan adherence'] },
  day: { name: 'Day trading', noun: 'Day Trader', ideal: { P: 45, T: 70, C: 65, D: 75, R: 50 }, w: { P: 1, T: 1.5, C: 2, D: 2.5, R: 0.5 }, base: 0.5,
    tf: 'H1 for the bias, M15 for entries', hold: 'Minutes to a few hours — flat before the session ends', freq: (o) => 'Up to ' + (o ? 2 : 4) + ' trades a day',
    when: 'London open 08:00–11:00 GMT and the New York open 13:00–16:00 GMT',
    setups: ['Reaction to the previous-day high/low or the daily pivot', 'Trend pullback to the EMA 20/50 on M15', 'Range breakout with a retest'],
    entry: ['Define the H1 bias first: only trade with it', 'Wait for a confirmation candle at your level', 'No new trades after the main session window closes'],
    exit: ['Stop beyond the structure: about 1–1.5× the M15 ATR', 'Target the next level for 1.5–3R; trail behind M15 structure', 'Close everything before the end of your session'],
    req: [['D', 'hi', 'Your discipline ({v}) fits a rule-based daily routine'], ['T', 'hi', 'Your decision speed ({v}) matches intraday pace'], ['C', 'hi', 'Your emotional control ({v}) supports intraday swings'], ['P', 'mid', 'A balanced patience level ({v}) works for waiting on a few good setups']],
    watch: 'The risk is drifting into overtrading. Keep the trade cap and the session window fixed.',
    routine: ['Evening before: mark levels on H1 and write the bias for tomorrow', 'Check the economic calendar for high-impact news', 'During the window: wait for your setup — no setup, no trade', 'Close or protect everything before the session ends', 'After: log trades and a one-line note on how you felt'] },
  swing: { name: 'Swing trading', noun: 'Swing Trader', ideal: { P: 75, T: 40, C: 55, D: 65, R: 50 }, w: { P: 2.5, T: 1.5, C: 1.5, D: 2, R: 0.5 }, base: 0.75,
    tf: 'D1 for the bias, H4 for entries', hold: '2 to 10 days', freq: () => '2–3 new trades a week at most',
    when: 'No need to watch screens all day — analyse once a day after the daily close (around 22:00 GMT)',
    setups: ['Trend pullback to the EMA 20/50 at a support or resistance zone', 'Rejection of a daily or weekly level', 'Breakout of a daily range with a retest'],
    entry: ['Confirm the D1 trend, then wait for an H4 reversal candle at your level', 'Place the order and the stop together, then leave it alone', 'Skip trades right before major news unless the stop is safe'],
    exit: ['Stop beyond the swing point: about 1.5–2× the D1 ATR', 'Target 2–3R; trail the stop behind H4/D1 structure', 'Reassess once a day, after the close — not every hour'],
    req: [['P', 'hi', 'Your patience ({v}) lets trades develop over days'], ['T', 'lo', 'You do not need fast decisions (speed {v}), which suits slower charts'], ['C', 'mid', 'Your emotional control ({v}) is enough for holding through noise'], ['D', 'hi', 'Your discipline ({v}) helps you leave a trade alone']],
    watch: 'Overnight and weekend gaps are the risk. Size small enough that a gap through your stop is survivable.',
    routine: ['Once a day after the daily close: scan D1 and H4, update your levels', 'Place orders with stops, then close the charts', 'Check open trades once a day only', 'Sunday: a 30-minute weekly review of trades and the journal', 'Never move a stop against the trade'] },
  pos: { name: 'Position trading', noun: 'Position Trader', ideal: { P: 92, T: 20, C: 60, D: 70, R: 40 }, w: { P: 3, T: 1.5, C: 1.5, D: 2, R: 0.5 }, base: 1,
    tf: 'W1 for the bias, D1 for entries', hold: 'Weeks to months', freq: () => '1–3 new trades a month',
    when: 'A weekly review is enough — about 1–2 hours at the weekend',
    setups: ['Weekly trend continuation after a pullback', 'Breakout from a multi-month range', 'A macro theme (rates, dollar trend) confirmed by price'],
    entry: ['Trade only when the weekly and daily trend agree', 'Scale in over days rather than all at once', 'Do not react to daily noise'],
    exit: ['Stop beyond the weekly swing point — wide, so size is small', 'Trail behind the weekly structure; aim for 3R or more', 'Review the thesis every weekend and exit if it has broken'],
    req: [['P', 'hi', 'Your patience ({v}) fits holding for weeks'], ['T', 'lo', 'You prefer slow decisions (speed {v})'], ['C', 'mid', 'Your emotional control ({v}) copes with long drawdowns on open trades'], ['D', 'hi', 'Your discipline ({v}) keeps you from fiddling with the trade']],
    watch: 'Capital is tied up for a long time and results come slowly. This style needs a larger account to be meaningful.',
    routine: ['Weekend: review W1 and D1 charts and the macro picture', 'Update the thesis for each open position in one sentence', 'Midweek: a quick look at open trades only', 'Add or trim only on your plan, never on emotion', 'Monthly: review the journal for plan adherence'] }
};

const FIX = {
  revenge: ['Stop revenge trades', 'After any loss, no new order for 30 minutes (15 for scalping). After 2 losses in a row, you are done for the session.', 'Measure: zero re-entries within 15 minutes of a loss.'],
  fomo: ['Stop chasing price', 'If price has already moved more than half an ATR from your level, skip it or wait for the pullback. Write it as "missed trade" in the journal — not as a loss.', 'Measure: zero entries without a pre-defined level.'],
  overtrade: ['Cap your trades', 'Set a hard daily trade cap and pre-write the setups you may take. Anything outside the list is a no.', 'Measure: never exceed the daily cap.'],
  movesStop: ['Never widen a stop', 'The stop goes in with the order. It may only move in your favour (breakeven or trailing).', 'Measure: zero stop widenings in the journal.'],
  cutsWinners: ['Let planned winners work', 'Decide before entry: take half at 1R, move the stop to breakeven, let the rest reach your target.', 'Measure: average winner at least 1.5× the average loser.'],
  holdsLosers: ['Exit on invalidation', 'Hard stop on every trade, plus a time-stop: if the setup has not worked within the planned candles, exit.', 'Measure: no averaging down, ever.'],
  newsChaser: ['Stay flat around news', 'No new trades 15 minutes before and after high-impact news. Protect or close open trades before it.', 'Measure: zero trades inside the news window.'],
  overconfident: ['Keep size fixed', 'Risk the same percent after a win streak. After 3 wins in a row, re-read your rules before the next trade.', 'Measure: risk per trade never changes within a week.'],
  noPlan: ['Write a one-page plan first', 'Setups, entry, stop, target, risk and daily limits on one page. No plan, no live trade.', 'Measure: every trade tagged with a setup name.']
};

function compute(ans, text) {
  const sum = {}, mn = {}, mx = {}, f = {}, fmx = {}, meta = {};
  Q.forEach((q, i) => {
    if (q.k) { meta[q.k] = ans[i]; return; }
    const tk = new Set(), fk = new Set();
    q.o.forEach(o => { Object.keys(o[1] || {}).forEach(k => tk.add(k)); Object.keys(o[2] || {}).forEach(k => fk.add(k)); });
    tk.forEach(k => { const v = q.o.map(o => (o[1] || {})[k] || 0); mn[k] = (mn[k] || 0) + Math.min(...v); mx[k] = (mx[k] || 0) + Math.max(...v); sum[k] = (sum[k] || 0) + ((q.o[ans[i]][1] || {})[k] || 0); });
    fk.forEach(k => { fmx[k] = (fmx[k] || 0) + Math.max(...q.o.map(o => (o[2] || {})[k] || 0)); f[k] = (f[k] || 0) + ((q.o[ans[i]][2] || {})[k] || 0); });
  });
  const t = {};
  Object.keys(TR).forEach(k => { t[k] = mx[k] > mn[k] ? Math.round(((sum[k] || 0) - mn[k]) / (mx[k] - mn[k]) * 100) : 50; });
  const picked = [];
  (text || '').split(/\n/).join(' ');
  PAT.forEach(p => {
    if (!p[0].test(text || '')) return;
    picked.push(p[2]);
    if (p[1]) f[p[1]] = (f[p[1]] || 0) + 2;
    if (p[3]) Object.keys(p[3]).forEach(k => { t[k] = clamp(t[k] + p[3][k], 0, 100); });
  });
  const sev = {};
  Object.keys(f).forEach(k => { sev[k] = clamp(f[k] / (fmx[k] || 2), 0, 1); });
  /* style fit */
  const fit = {};
  Object.keys(STY).forEach(key => {
    const s = STY[key]; let d = 0, w = 0;
    Object.keys(s.ideal).forEach(k => { d += s.w[k] * Math.abs(t[k] - s.ideal[k]); w += s.w[k]; });
    let v = 100 - (d / w) * 1.15;
    const h = meta.hours, e = meta.exp, g = k => sev[k] || 0;
    if (key === 'scalp') { if (h < 2) v -= 30; else if (h === 2) v -= 8; if (e === 0) v -= 15; else if (e === 1) v -= 8; v -= 12 * g('revenge') + 10 * g('overtrade') + 6 * g('fomo') + 14 * g('noPlan'); }
    if (key === 'day') { if (h === 0) v -= 20; if (e === 0) v -= 6; v -= 8 * g('revenge') + 6 * g('overtrade') + 8 * g('noPlan'); }
    if (key === 'swing') { v -= 6 * g('movesStop') + 5 * g('holdsLosers'); }
    if (key === 'pos') { v -= 6 * g('movesStop') + 5 * g('holdsLosers'); if (e === 0) v -= 4; }
    fit[key] = Math.round(clamp(v, 5, 97));
  });
  const order = Object.keys(fit).sort((a, b) => fit[b] - fit[a]);
  const flags = Object.keys(sev).filter(k => sev[k] >= 0.4).sort((a, b) => sev[b] - sev[a]);
  const hi = Object.keys(sev).filter(k => sev[k] >= 0.6).length;
  const ready = Math.round(clamp((t.C + t.D) / 2 - 12 * hi, 0, 100));
  return { t, sev, flags, hi, fit, order, top: order[0], second: order[1], meta, picked, ready };
}

function build(res) {
  const s = STY[res.top], T = res.t, F = res.sev, M = res.meta, S = (k) => F[k] || 0;
  const score = (T.C + T.D) / 2;
  let risk = (score < 40 || res.hi >= 2) ? 0.25 : (score < 60 || res.hi >= 1) ? Math.min(s.base, 0.5) : s.base;
  const notes = [];
  if (M.goal === 0) { if (risk > 0.5) risk = 0.5; notes.push('Prop challenge: most firms have a daily and a total drawdown limit, so risk stays at 0.5% or less.'); }
  if (M.exp === 0) { risk = Math.min(risk, 0.25); notes.push('You have not started yet: trade demo first, then micro size.'); }
  const daily = +Math.min(risk * 3, 2).toFixed(2), weekly = +Math.min(risk * 6, 5).toFixed(2);
  const streak = (S('revenge') >= 0.5 || T.C < 45) ? 2 : 3;
  const over = S('overtrade') >= 0.5;
  const reasons = [];
  s.req.forEach(r => {
    const v = T[r[0]], ok = r[1] === 'hi' ? v >= 60 : r[1] === 'lo' ? v <= 45 : (v >= 40 && v <= 70);
    if (ok) reasons.push(r[2].replace('{v}', v));
  });
  if (res.top === 'scalp' && M.hours >= 2) reasons.push('You have the screen time that scalping demands');
  if ((res.top === 'swing' || res.top === 'pos') && M.hours <= 1) reasons.push('Your limited screen time is not a problem for this style');
  if (!reasons.length) reasons.push('It is the closest match to your answers overall');
  const watch = [s.watch];
  if (T.C < 45) watch.push('Your emotional control score is low (' + T.C + '): hide the floating P/L, use orders and alerts instead of staring at the screen.');
  if (T.D < 45) watch.push('Your discipline score is low (' + T.D + '): trade only from a written checklist.');
  if (res.fit[res.top] < 60) watch.push('No style fits you strongly yet — that is normal at an early stage. Use the first weeks to build the habits below.');
  const sec = STY[res.second];
  const close = res.fit[res.top] - res.fit[res.second] <= 6;
  const fixes = res.flags.map(k => FIX[k]);
  const exp = M.exp, newb = exp <= 1;
  const roadmap = [
    ['Weeks 1–2', 'Foundation', 'Write your one-page plan (setups, risk, limits). Learn to recognise your ' + s.name.toLowerCase() + ' setups on past charts. Start the trade journal on day one.', 'KPI: plan written; 30 past setups marked.'],
    ['Weeks 3–6', newb ? 'Demo execution' : 'Rule execution', (newb ? 'Trade on a demo account' : 'Trade at the smallest live size') + ' following the plan exactly. Goal: process, not profit.', 'KPI: 40 trades logged; plan adherence 90% or better.'],
    ['Weeks 7–10', 'Small live risk', 'Trade live at ' + Math.min(risk, 0.25) + '% risk per trade. Review the journal every week for the behaviours below.', 'KPI: adherence 85%+; max drawdown under ' + (daily * 2).toFixed(1) + '%; zero broken stops.'],
    ['Weeks 11–12', 'Review and scale', 'Raise risk to ' + risk + '% only if you have 50+ trades, a positive expectancy and adherence of 85% or better. Otherwise repeat the previous phase.', 'KPI: scale-up decision written down, with the numbers.']
  ];
  const archAdj = Object.keys(T).sort((a, b) => T[b] - T[a])[0], adjs = { P: 'Patient', T: 'Fast-moving', C: 'Cool-headed', D: 'Disciplined', R: 'Bold' };
  const arche = 'The ' + (T[archAdj] >= 55 ? adjs[archAdj] : 'Developing') + ' ' + s.noun;
  const rules = [
    ['Risk per trade', risk + '% of the account'], ['Daily loss limit', daily + '% — stop for the day'], ['Weekly loss limit', weekly + '% — stop for the week'],
    ['Stop after losses in a row', streak + ' losses — end the session'], ['Trade frequency', s.freq(over)]
  ];
  return { s, risk, daily, weekly, streak, reasons, watch, sec, close, fixes, roadmap, arche, rules, notes };
}

function toText(res, p) {
  const L = [];
  L.push('ASL UNIVERSITY — GROWTH PROGRAM', p.arche, 'Recommended style: ' + p.s.name + ' (' + res.fit[res.top] + '% fit)' + (p.close ? ' — close second: ' + p.sec.name : ''), '');
  L.push('PROFILE'); Object.keys(TR).forEach(k => L.push('- ' + TR[k] + ': ' + res.t[k] + '/100'));
  L.push('', 'BEHAVIOURS TO WORK ON'); L.push(...(res.flags.length ? res.flags.map(k => '- ' + FL[k]) : ['- none flagged']));
  L.push('', 'WHY THIS STYLE'); p.reasons.forEach(r => L.push('- ' + r));
  L.push('', 'BLUEPRINT', 'Timeframes: ' + p.s.tf, 'Holding time: ' + p.s.hold, 'Best window: ' + p.s.when, 'Setups:'); p.s.setups.forEach(x => L.push('- ' + x));
  L.push('Entry rules:'); p.s.entry.forEach(x => L.push('- ' + x)); L.push('Exit and management:'); p.s.exit.forEach(x => L.push('- ' + x));
  L.push('', 'RISK RULES'); p.rules.forEach(r => L.push('- ' + r[0] + ': ' + r[1]));
  L.push('', 'BEHAVIOUR FIXES'); p.fixes.forEach(f => L.push('- ' + f[0] + ': ' + f[1]));
  L.push('', '12-WEEK ROADMAP'); p.roadmap.forEach(r => L.push('- ' + r[0] + ' ' + r[1] + ': ' + r[2] + ' ' + r[3]));
  L.push('', 'DAILY ROUTINE'); p.s.routine.forEach(x => L.push('- ' + x));
  L.push('', 'Educational self-assessment, not investment advice.');
  return L.join('\n');
}

const pub = (s) => ({ name: s.name, noun: s.noun, tf: s.tf, hold: s.hold, when: s.when, setups: s.setups, entry: s.entry, exit: s.exit, watch: s.watch, routine: s.routine });

/* Validates the answers and builds the full personal program. Returns null for bad input. */
export function validAnswers(ans) {
  if (!Array.isArray(ans) || ans.length !== Q.length) return false;
  for (let i = 0; i < Q.length; i++) { const v = ans[i]; if (!Number.isInteger(v) || v < 0 || v >= Q[i].o.length) return false; }
  return true;
}
export function runGrowth(ans, text) {
  if (!validAnswers(ans)) return null;
  text = typeof text === 'string' ? text.slice(0, 3000) : '';
  const res = compute(ans, text), p = build(res);
  const names = {}; Object.keys(STY).forEach((k) => { names[k] = STY[k].name; });
  return {
    res, TR, FL, names, text: toText(res, p),
    p: { risk: p.risk, daily: p.daily, weekly: p.weekly, streak: p.streak, reasons: p.reasons, watch: p.watch, close: p.close, fixes: p.fixes, roadmap: p.roadmap, arche: p.arche, rules: p.rules, notes: p.notes, s: pub(p.s), sec: pub(p.sec) }
  };
}

