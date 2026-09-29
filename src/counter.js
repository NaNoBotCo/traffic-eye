/**
 * traffic-eye counter — a 1997 hit counter for a static site, split in two:
 * humans and bots.
 *
 *   <img src="https://bbq-counter.nanobotco.workers.dev/carolina-barbecue.svg">
 *
 * Every fetch of the picture is one hit. The fleet classifier (classify.js,
 * the same one the collector and mot-dang use) sorts it: a browser is a human,
 * everything else a bot. The picture comes back with both totals drawn as
 * seven-segment digits.
 *
 * A GitHub Pages site has no edge of its own to count at, so this only sees
 * what loads the picture. Most crawlers read the HTML and never ask for it, so
 * the bot number runs low; the page's own tooltip says as much.
 *
 * Totals live in one Durable Object per site. A counter that fails draws
 * dashes instead of numbers; the page around it is never affected.
 */
import { DurableObject } from 'cloudflare:workers';
import { classify } from './classify.js';

// The sites allowed a counter. Anything else is a 404, so nobody can mint
// Durable Objects by inventing names.
const SITES = new Set(['carolina-barbecue']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/([a-z0-9-]+)\.svg$/);
    if (!m || !SITES.has(m[1])) {
      return new Response('not a counter\n', { status: 404, headers: { 'content-type': 'text/plain' } });
    }
    const site = m[1];

    let counts = null;
    try {
      const { category } = classify(request.headers.get('user-agent') || '', {
        asn: request.cf?.asn,
        headers: request.headers,
      });
      const kind = category === 'human' ? 'human' : 'bot';
      // HEAD and prefetches still draw, but only a GET counts.
      const count = request.method === 'GET' && request.headers.get('sec-purpose') == null;
      const stub = env.COUNTER.get(env.COUNTER.idFromName(site));
      counts = await stub.hit(count ? kind : null);
    } catch {
      // drawn as dashes below
    }

    return new Response(request.method === 'HEAD' ? null : svg(counts), {
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        // every page load has to reach us, or it is not a counter
        'cache-control': 'no-store, max-age=0',
        'access-control-allow-origin': '*',
        'x-robots-tag': 'noindex',
      },
    });
  },
};

export class Counter extends DurableObject {
  /** Add one to `kind` (or nothing, when null) and return both totals. */
  async hit(kind) {
    const s = this.ctx.storage;
    const now = { human: (await s.get('human')) || 0, bot: (await s.get('bot')) || 0 };
    if (kind) {
      now[kind] += 1;
      await s.put(kind, now[kind]);
    }
    return now;
  }
}

// ---------------------------------------------------------------- drawing

const DIGITS = 7;
// segments a b c d e f g, lit per digit
const LIT = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
const SEG = {
  a: [1.6, 0.4, 4.8, 1.4],
  b: [6.4, 1.6, 1.4, 4.6],
  c: [6.4, 7.2, 1.4, 4.6],
  d: [1.6, 11.8, 4.8, 1.4],
  e: [0.2, 7.2, 1.4, 4.6],
  f: [0.2, 1.6, 1.4, 4.6],
  g: [1.6, 6.1, 4.8, 1.4],
};

function digitBox(x, n, lit, dim) {
  const w = DIGITS * 10 + 4;
  const s = n == null ? null : String(Math.min(n, 10 ** DIGITS - 1)).padStart(DIGITS, '0');
  let out = `<rect x="${x}" y="1" width="${w}" height="18" rx="1.5" fill="#0b0b0b" stroke="#555" stroke-width=".8"/>`;
  for (let i = 0; i < DIGITS; i++) {
    const cx = x + 3 + i * 10;
    const on = s == null ? 'g' : LIT[+s[i]];
    for (const [k, [sx, sy, sw, sh]] of Object.entries(SEG)) {
      out += `<rect x="${(cx + sx).toFixed(1)}" y="${(3.4 + sy).toFixed(1)}" width="${sw}" height="${sh}" rx=".5" fill="${on.includes(k) ? lit : dim}"/>`;
    }
  }
  return { out, w };
}

function svg(counts) {
  const label = (x, t) => `<text x="${x}" y="13.6" class="l">${t}</text>`;
  const h = digitBox(46, counts?.human, '#ff3b1f', '#2a0c08');
  const b = digitBox(46 + h.w + 38, counts?.bot, '#39ff14', '#0c2408');
  const W = 46 + h.w + 38 + b.w + 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="20" viewBox="0 0 ${W} 20">` +
    `<style>.l{font:bold 8.5px "Courier New",Courier,monospace;letter-spacing:.6px;fill:#6b6257}` +
    `@media (prefers-color-scheme:dark){.l{fill:#a79d90}}</style>` +
    label(2, 'HUMANS') + h.out + label(46 + h.w + 8, 'BOTS') + b.out + `</svg>`;
}
