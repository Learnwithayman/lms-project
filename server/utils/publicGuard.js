// 🛡️ W2 Phase A: protection for the PUBLIC website endpoints (the free-trial form, and later the
// free-times and booking endpoints). These are the only routes anyone on the internet can call
// without logging in, and every call sends WhatsApp messages (one message every 20 seconds, so a
// flood would delay real class reminders for hours) and will soon write a real Google Calendar
// event. Nothing here asks a parent to prove they are human: no CAPTCHA, no puzzle.
//
// Four layers, decided with Ayman on 26 Nov:
//   1. ipLimit      – a few requests per hour from the same internet address (kept in memory).
//   2. isHoneypot   – a hidden field that only a bot fills in.
//   3. originOk     – if the request says which website it came from, it must be ours.
//   4. secretOk     – optional shared password in a header (only when TRIAL_FORM_SECRET is set in Render).
// The "one trial per WhatsApp number per day" rule is NOT here: it is a database check, because it
// must survive a restart (see leadController).

// --- 1. how many requests one internet address may send -----------------------------------------
const WINDOW_MS = 60 * 60 * 1000; // one hour
const MAX_PER_WINDOW = 5;         // a real parent needs 1; 5 leaves room for mistakes and retries
const hits = new Map();           // internet address -> [times of its recent requests]

// Render sits behind a proxy, so the real address is in x-forwarded-for (first one in the list).
const clientIp = (req) => {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  return req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
};

// true = this address has asked too many times in the last hour. Old times are dropped as we go,
// so the map cannot grow for ever.
const tooManyFrom = (ip, now = Date.now()) => {
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) { // housekeeping: forget addresses that went quiet
    for (const [key, times] of hits) {
      if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(key);
    }
  }
  return false;
};

// --- 2. the hidden field ------------------------------------------------------------------------
// The website form carries an input that is hidden with CSS. A parent never sees it, so it stays
// empty. Many bots fill in every field they find.
const HONEYPOT_FIELD = 'website';
const isHoneypot = (req) => {
  const v = req.body && req.body[HONEYPOT_FIELD];
  return typeof v === 'string' && v.trim() !== '';
};

// --- 3. which website the request came from -----------------------------------------------------
// A browser always tells us (Origin, or Referer). A script can leave it out, so an empty one is
// allowed through and is caught by the limits above instead; a WRONG one is refused.
const OUR_HOSTS = [
  'learnwithayman.com',
  'www.learnwithayman.com',
  'lms.learnwithayman.com',
  'localhost',
  '127.0.0.1'
];
const hostOf = (value) => {
  try { return new URL(value).hostname.toLowerCase(); } catch (e) { return ''; }
};
const originOk = (req) => {
  const said = req.headers.origin || req.headers.referer || '';
  if (!said) return true; // no website named: the rate limit and the number check still apply
  const host = hostOf(said);
  return OUR_HOSTS.includes(host);
};

// --- 4. optional shared password ----------------------------------------------------------------
// If TRIAL_FORM_SECRET is set in the Render settings, the website must send the same value in the
// x-trial-secret header. While it is NOT set, this check is off and nothing changes.
const secretOk = (req) => {
  const expected = process.env.TRIAL_FORM_SECRET;
  if (!expected) return true;
  return req.headers['x-trial-secret'] === expected;
};

// --- the guard the routes use -------------------------------------------------------------------
// Put this in front of a public route. A bot that filled the hidden field gets a normal-looking
// "thank you" and nothing happens, so it does not learn that it was caught.
const publicGuard = (req, res, next) => {
  if (!secretOk(req) || !originOk(req)) {
    return res.status(403).json({ message: 'This request did not come from our website.' });
  }
  if (isHoneypot(req)) {
    console.log(`🛡️ Trial form: hidden field was filled in (bot) from ${clientIp(req)}. Ignored.`);
    return res.status(201).json({ message: 'Thank you! We received your request.' });
  }
  if (tooManyFrom(clientIp(req))) {
    console.log(`🛡️ Trial form: too many requests from ${clientIp(req)}. Refused.`);
    return res.status(429).json({ message: 'Too many requests. Please try again later, or message us on WhatsApp.' });
  }
  return next();
};

module.exports = {
  WINDOW_MS, MAX_PER_WINDOW, HONEYPOT_FIELD, OUR_HOSTS,
  clientIp, tooManyFrom, isHoneypot, originOk, secretOk, publicGuard,
  _resetForTests: () => hits.clear()
};
