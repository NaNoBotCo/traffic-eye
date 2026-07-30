/**
 * traffic-eye dashboard — reads the Analytics Engine dataset back and renders
 * it as one page.
 *
 * Deliberately server-rendered plain HTML: the Analytics Engine SQL API needs
 * an account-scoped token, which can never go into client-side JavaScript, and
 * a page that arrives already-drawn is also the one that works on a slow phone.
 *
 * Type is set large and the contrast is high on purpose.
 */
const CATEGORY_LABEL = {
  human: 'People',
  ai: 'AI crawlers',
  search: 'Search engines',
  social: 'Link previews',
  seo: 'SEO scrapers',
  monitor: 'Uptime monitors',
  tool: 'Scripts & tools',
  other: 'Other bots',
  none: 'No user-agent',
};

const CATEGORY_COLOR = {
  human: '#1f6b57', ai: '#a3231c', search: '#14479b', social: '#7a5410',
  seo: '#6f6353', monitor: '#8a7a62', tool: '#4a4136', other: '#9b8b78',
  none: '#c4b28d',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!env.DASH_KEY) {
      return html(page('Not configured yet',
        `<p class="note">This dashboard has no <code>DASH_KEY</code> secret set, so it
         will not serve anything. Set one with:</p>
         <pre>npx wrangler secret put DASH_KEY --name traffic-eye-dashboard</pre>`), 503);
    }

    // One key, remembered in a cookie so it only ever gets typed once.
    const cookie = request.headers.get('cookie') || '';
    const fromCookie = /(?:^|;\s*)te_k=([^;]+)/.exec(cookie)?.[1];
    const given = url.searchParams.get('k') || fromCookie;
    if (given !== env.DASH_KEY) {
      return html(page('traffic-eye',
        `<p class="note">Add <code>?k=…</code> to the address to open this.</p>`), 401);
    }

    const days = clampDays(url.searchParams.get('days'));
    const headers = { 'content-type': 'text/html; charset=utf-8' };
    if (given !== fromCookie) {
      // 180 days, so the key survives until well after it stops being novel.
      headers['set-cookie'] =
        `te_k=${encodeURIComponent(given)}; Path=/; Max-Age=15552000; HttpOnly; Secure; SameSite=Lax`;
    }

    let body;
    try {
      body = render(await gather(env, days), days);
    } catch (err) {
      body = page('traffic-eye', `<p class="note">Could not read the data.</p>
        <pre>${esc(String(err && err.message || err))}</pre>`);
    }
    return new Response(body, { headers });
  },
};

function clampDays(raw) {
  const n = parseInt(raw || '7', 10);
  if (!Number.isFinite(n)) return 7;
  return Math.min(Math.max(n, 1), 90); // Analytics Engine keeps 90 days
}

/** Run one SQL statement against the Analytics Engine SQL API. */
async function sql(env, statement) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/analytics_engine/sql`,
    { method: 'POST', headers: { Authorization: `Bearer ${env.AE_TOKEN}` }, body: statement },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL API ${res.status}: ${text.slice(0, 400)}`);
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error(`Unparseable reply: ${text.slice(0, 200)}`); }
  return parsed.data || [];
}

const DS = 'traffic_eye';

async function gather(env, days) {
  const since = `timestamp >= NOW() - INTERVAL '${days}' DAY`;
  const [byCategory, aiAgents, bySite, topPaths, referrers, daily] = await Promise.all([
    sql(env, `SELECT blob1 AS site, blob2 AS category, SUM(double1) AS hits
              FROM ${DS} WHERE ${since} GROUP BY site, category ORDER BY hits DESC`),
    sql(env, `SELECT blob3 AS agent, blob1 AS site, SUM(double1) AS hits
              FROM ${DS} WHERE ${since} AND blob2 = 'ai'
              GROUP BY agent, site ORDER BY hits DESC LIMIT 40`),
    sql(env, `SELECT blob1 AS site, SUM(double1) AS hits FROM ${DS}
              WHERE ${since} GROUP BY site ORDER BY hits DESC`),
    sql(env, `SELECT blob4 AS path, blob2 AS category, SUM(double1) AS hits
              FROM ${DS} WHERE ${since} GROUP BY path, category ORDER BY hits DESC LIMIT 25`),
    sql(env, `SELECT blob7 AS ref, SUM(double1) AS hits FROM ${DS}
              WHERE ${since} AND blob2 = 'human' AND blob7 != '' AND blob7 != '(same site)'
              GROUP BY ref ORDER BY hits DESC LIMIT 15`),
    sql(env, `SELECT toDate(timestamp) AS day, blob2 AS category, SUM(double1) AS hits
              FROM ${DS} WHERE ${since} GROUP BY day, category ORDER BY day ASC`),
  ]);
  return { byCategory, aiAgents, bySite, topPaths, referrers, daily };
}

function render(d, days) {
  if (!d.bySite.length) {
    return page('traffic-eye', `
      <p class="note">No requests recorded yet in the last ${days} days.</p>
      <p class="note">That is expected until the collector Worker is attached to a
      site's routes and that site is proxied through Cloudflare (orange cloud).</p>`);
  }

  const totals = {};
  let grand = 0;
  for (const r of d.byCategory) {
    const n = Number(r.hits) || 0;
    totals[r.category] = (totals[r.category] || 0) + n;
    grand += n;
  }
  const humans = totals.human || 0;
  const machines = grand - humans;

  const order = Object.keys(CATEGORY_LABEL).filter(c => totals[c]);
  const bar = order.map(c =>
    `<span class="seg" style="width:${(totals[c] / grand * 100).toFixed(2)}%;background:${CATEGORY_COLOR[c]}"
           title="${esc(CATEGORY_LABEL[c])}: ${fmt(totals[c])}"></span>`).join('');

  // Per-site split, since "which of my sites do the AI crawlers actually read"
  // is the question a single grand total cannot answer.
  const siteRows = d.bySite.map(s => {
    const cats = d.byCategory.filter(r => r.site === s.site);
    const tot = Number(s.hits) || 0;
    const h = Number(cats.find(c => c.category === 'human')?.hits || 0);
    const ai = Number(cats.find(c => c.category === 'ai')?.hits || 0);
    return `<tr><td class="site">${esc(s.site)}</td>
      <td class="n">${fmt(tot)}</td>
      <td class="n">${fmt(h)}<span class="pct">${pct(h, tot)}</span></td>
      <td class="n">${fmt(ai)}<span class="pct">${pct(ai, tot)}</span></td>
      <td class="n">${fmt(tot - h)}<span class="pct">${pct(tot - h, tot)}</span></td></tr>`;
  }).join('');

  const aiRows = d.aiAgents.length
    ? d.aiAgents.map(a => `<tr><td>${esc(a.agent)}</td><td class="site">${esc(a.site)}</td>
        <td class="n">${fmt(a.hits)}</td></tr>`).join('')
    : `<tr><td colspan="3" class="note">No AI crawler has asked for anything yet.</td></tr>`;

  const pathRows = d.topPaths.map(p =>
    `<tr><td class="path">${esc(p.path)}</td>
     <td><span class="tag" style="background:${CATEGORY_COLOR[p.category] || '#888'}">${esc(CATEGORY_LABEL[p.category] || p.category)}</span></td>
     <td class="n">${fmt(p.hits)}</td></tr>`).join('');

  const refRows = d.referrers.length
    ? d.referrers.map(r => `<tr><td>${esc(r.ref)}</td><td class="n">${fmt(r.hits)}</td></tr>`).join('')
    : `<tr><td colspan="2" class="note">Nobody has arrived from another site yet.</td></tr>`;

  return page('traffic-eye', `
    <div class="picker">
      ${[1, 7, 30, 90].map(n =>
        `<a class="chip${n === days ? ' on' : ''}" href="?days=${n}">${n} day${n > 1 ? 's' : ''}</a>`).join('')}
    </div>

    <div class="big">
      <div class="stat"><b>${fmt(humans)}</b><span>from people</span></div>
      <div class="stat"><b>${fmt(machines)}</b><span>from machines</span></div>
      <div class="stat"><b>${pct(humans, grand)}</b><span>of all requests were human</span></div>
    </div>

    <div class="barwrap">${bar}</div>
    <ul class="legend">${order.map(c =>
      `<li><span class="dot" style="background:${CATEGORY_COLOR[c]}"></span>
       ${esc(CATEGORY_LABEL[c])} <b>${fmt(totals[c])}</b></li>`).join('')}</ul>

    <h2>By site</h2>
    <table><thead><tr><th>Site</th><th class="n">All</th><th class="n">People</th>
      <th class="n">AI</th><th class="n">Machines</th></tr></thead>
      <tbody>${siteRows}</tbody></table>

    <h2>Which AI is reading</h2>
    <p class="note">Self-declared: this is what each crawler says it is in its
    User-Agent. A scraper can claim any name it likes.</p>
    <table><thead><tr><th>Agent</th><th>Site</th><th class="n">Requests</th></tr></thead>
      <tbody>${aiRows}</tbody></table>

    <h2>Most-requested pages</h2>
    <table><thead><tr><th>Path</th><th>Asked by</th><th class="n">Requests</th></tr></thead>
      <tbody>${pathRows}</tbody></table>

    <h2>Where people came from</h2>
    <table><thead><tr><th>Referrer</th><th class="n">Visits</th></tr></thead>
      <tbody>${refRows}</tbody></table>

    <p class="note">Analytics Engine keeps 90 days. Counts are requests, not
    unique visitors — nothing here identifies anybody, and no cookie or
    fingerprint is set on the sites being measured.</p>`);
}

const fmt = n => Number(n || 0).toLocaleString('en-US');
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '—');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function html(body, status = 200) {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function page(title, inner) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)}</title><style>
:root{--paper:#f7f1e4;--ink:#241c15;--mute:#6f6353;--card:#fffdf8;--line:#ded0b2;--red:#a3231c}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:19px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:1000px;margin:0 auto;padding:1.5rem 1.2rem 4rem}
h1{font-size:1.9rem;margin:0 0 .2rem}
h2{font-size:1.35rem;margin:2.4rem 0 .6rem;border-bottom:2px solid var(--line);padding-bottom:.3rem}
a{color:#14479b}
.picker{display:flex;gap:.6rem;flex-wrap:wrap;margin:1.1rem 0}
.chip{display:inline-block;min-height:44px;line-height:44px;padding:0 1.1rem;border:1.5px solid var(--line);
border-radius:999px;background:var(--card);text-decoration:none;color:var(--ink);font-weight:600}
.chip.on{background:var(--ink);color:#e6c987;border-color:var(--ink)}
.big{display:flex;gap:1rem;flex-wrap:wrap;margin:1.4rem 0 1rem}
.stat{flex:1 1 200px;background:var(--card);border:2px solid var(--ink);border-radius:16px;
padding:1rem 1.2rem;box-shadow:0 3px 0 #e0d3b6}
.stat b{display:block;font-size:2.3rem;line-height:1.1;font-variant-numeric:tabular-nums}
.stat span{color:var(--mute);font-size:.95rem}
.barwrap{display:flex;height:30px;border-radius:8px;overflow:hidden;border:2px solid var(--ink)}
.seg{display:block;height:100%}
.legend{list-style:none;display:flex;flex-wrap:wrap;gap:.5rem 1.3rem;padding:0;margin:.8rem 0 0;font-size:.95rem}
.legend li{display:flex;align-items:center;gap:.45rem}
.dot{width:.85rem;height:.85rem;border-radius:50%;display:inline-block}
table{width:100%;border-collapse:collapse;margin-top:.5rem;background:var(--card);
border:2px solid var(--ink);border-radius:14px;overflow:hidden}
th,td{text-align:left;padding:.65rem .8rem;border-bottom:1px solid #ece0c8;font-size:.98rem}
th{background:#fbdc8e;font-size:.9rem}
tr:last-child td{border-bottom:0}
.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.pct{color:var(--mute);font-size:.8rem;margin-left:.45rem}
.site{font-weight:600}
.path{font:.88rem ui-monospace,monospace;word-break:break-all}
.tag{color:#fff;font-size:.78rem;padding:.1rem .55rem;border-radius:999px;white-space:nowrap}
.note{color:var(--mute);font-size:.93rem}
pre{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:.7rem;
overflow-x:auto;font-size:.85rem}
code{background:var(--card);padding:.05rem .3rem;border-radius:4px}
@media (max-width:600px){body{font-size:18px}.stat b{font-size:1.9rem}}
</style></head><body><main>
<h1>traffic-eye</h1>
<p class="note">Who is asking for these pages.</p>
${inner}
</main></body></html>`;
}
