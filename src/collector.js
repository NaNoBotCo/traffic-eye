/**
 * traffic-eye collector — sits in front of a site and writes one row per
 * request to Analytics Engine.
 *
 * This runs on every request to a live site, so the contract is: it must be
 * impossible for this Worker to break the site. The origin fetch happens first
 * and is never wrapped in anything that can reject the response; all recording
 * is inside a try/catch whose failure path is to do nothing. If Analytics
 * Engine is down, or the binding is missing, or the classifier throws on some
 * UA nobody predicted, the visitor still gets their page.
 *
 * It also does not touch the response body — no rewriting, no buffering — so
 * caching and streaming behave exactly as they did without it.
 */
import { classify } from './classify.js';

export default {
  async fetch(request, env, ctx) {
    const started = Date.now();

    // The one thing that matters. Nothing above this line can fail.
    const response = await fetch(request);

    try {
      ctx.waitUntil(record(request, response, env, Date.now() - started));
    } catch {
      // Recording is never worth an error page.
    }
    return response;
  },
};

async function record(request, response, env, ms) {
  if (!env.TRAFFIC) return; // not bound yet — nothing to do

  const url = new URL(request.url);
  const ua = request.headers.get('user-agent') || '';
  const { category, agent } = classify(ua);

  // Referrer host only. The full referring URL can carry search terms and
  // other things that are the visitor's business, not ours; the host answers
  // "where do people come from" without keeping any of that.
  let refHost = '';
  const ref = request.headers.get('referer');
  if (ref) {
    try {
      const r = new URL(ref);
      refHost = r.host === url.host ? '(same site)' : r.host;
    } catch {
      refHost = '(unparseable)';
    }
  }

  env.TRAFFIC.writeDataPoint({
    // blob1..blob8 — keep the order stable, the dashboard reads by position.
    blobs: [
      url.host,                       // 1 site
      category,                       // 2 human | ai | search | social | seo | monitor | tool | other | none
      agent,                          // 3 ClaudeBot, Chrome, …
      trimPath(url.pathname),         // 4 path
      request.cf?.country || 'XX',    // 5 country
      String(response.status),        // 6 status
      refHost,                        // 7 referrer host
      request.method,                 // 8 method
    ],
    // double1 is deliberately a literal 1 so SUM(double1) survives sampling,
    // which COUNT(*) would silently under-report if volume ever grows.
    doubles: [1, response.status, ms],
    // The sampling key. Per-site, so a busy site cannot starve a quiet one.
    indexes: [url.host],
  });
}

/**
 * Paths are high-cardinality by design here — mot-dang alone publishes ten
 * thousand of them — which Analytics Engine handles, but there is no reason to
 * store a query string or an unbounded string.
 */
function trimPath(pathname) {
  return pathname.length > 96 ? pathname.slice(0, 96) + '…' : pathname;
}
