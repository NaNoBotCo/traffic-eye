# traffic-eye

Who is asking for your pages — people, AI crawlers, search engines, scrapers —
across all your sites, in one place.

**Dashboard:** `https://traffic-eye-dashboard.<your-subdomain>.workers.dev/?k=YOUR_KEY`
(deployed; refuses to serve until you set a key — step 2 below)

---

## Why it works this way

Cloudflare's own bot score is Enterprise-only. On the free plan there is no bot
score and no bot analytics at all, so the classification is ours, done from the
User-Agent in `src/classify.js`.

That turns out to be the better answer. Cloudflare would tell you "bot"; the
question worth asking about *your* sites is **which** bot. ClaudeBot reading the
wichaa corpus is the entire point of that project. AhrefsBot scraping it is pure
cost. One "bot" bucket cannot tell those apart — this does, across nine
categories, with the AI crawlers broken out by name.

Caveat, stated plainly on the dashboard too: User-Agent is self-declared. A
scraper can call itself Googlebot. These are claims, not proof.

---

## Setup

### 1. Turn on Analytics Engine (once, ~10 seconds)

It is off by default and the collector will not deploy without it.

https://dash.cloudflare.com/fe332688b1b25b543f8429d7f08292a3/workers/analytics-engine

Free plan: **100,000 writes/day and 10,000 read queries/day**, 90-day retention.
(The 10M/month and 1M/month figures are the *paid* Workers plan.) 100k/day is
still far more than these sites will use — motdang.net's whole page count is
ten thousand.

Note: you do **not** need to click "Create Dataset". Datasets are created on
first write; `wrangler.collector.toml` already names one (`traffic_eye`). The
only thing that matters on this page is that the product itself is enabled.

### 2. Give the dashboard a key and a token

```bash
cd "/Users/annikapeacock/Developer/claude code projects/traffic-eye"
npx wrangler secret put DASH_KEY -c wrangler.dashboard.toml
```

Type any passphrase you like. That becomes `?k=…` in the dashboard address, and
it is remembered in a cookie afterwards so you only type it once.

Then a read token — **already minted, nothing to do.** The fleet token in
`~/.config/nanobotco/keys.json` (`cloudflare.api_token`, "nanobotco-fleet")
carries Account Analytics Read and was verified against the SQL API on
2026-09-08. Read it out of the key store rather than making another one:

```bash
python3 -c "import json,pathlib;print(json.loads((pathlib.Path.home()/'.config/nanobotco/keys.json').read_text())['cloudflare']['api_token'])" \
  | npx wrangler secret put AE_TOKEN -c wrangler.dashboard.toml
```

(Wrangler's own OAuth login still cannot be reused for this — the SQL API takes
a bearer token and the OAuth flow does not expose one. That part of the older
instruction was right; "so you must create a token" was not.)
4. Account resources: your account
5. Create, copy the token, then:

```bash
npx wrangler secret put AE_TOKEN -c wrangler.dashboard.toml
```

### 3. Deploy the collector

```bash
npx wrangler deploy -c wrangler.collector.toml
```

This deploys it with **no routes**, so it is inert — attached to nothing,
measuring nothing, unable to affect any site.

### 4. Attach it to one site

Uncomment the `hakfarang.net` routes in `wrangler.collector.toml`, redeploy, and
watch it:

```bash
npx wrangler deploy -c wrangler.collector.toml
npx wrangler tail traffic-eye-collector
```

Load the site in a browser. You should see the request in the tail, and the site
should behave exactly as before. Give it a few minutes, then open the dashboard.

Do the sites **one at a time**, not in a batch.

---

## Which of your sites can be measured today

Checked 2026-07-30:

| Site | State | What it needs |
| --- | --- | --- |
| **hakfarang.net** | Proxied through Cloudflare (`cf-ray` present) | Nothing — attach the route |
| **defiant.to** | On Cloudflare DNS but **grey cloud** — traffic goes straight to GitHub Pages | Flip the DNS record to proxied (orange cloud) in the Cloudflare dashboard |
| **wichaa.net** | Namecheap DNS → GitHub Pages | Move nameservers to Cloudflare |
| **motdang.net** | Namecheap DNS → GitHub Pages | Move nameservers to Cloudflare |
| **poplucky.net** | Namecheap DNS → GitHub Pages | Move nameservers to Cloudflare |

A Worker route only fires for a **proxied** hostname. On a grey-cloud or
non-Cloudflare record the route sits there doing nothing and gives you no error
to say so — which is why the table above exists. Check any host with:

```bash
curl -sI https://example.com/ | grep -i cf-ray
```

A `cf-ray` header means proxied. No `cf-ray` means the Worker will never run.

### Moving a domain to Cloudflare

For the three on Namecheap: add the site in Cloudflare (it will read the
existing records), then change the nameservers at Namecheap to the pair
Cloudflare gives you. That part needs your registrar login, so it is yours to do.

**The one gotcha that matters for GitHub Pages:** set SSL/TLS mode to **Full**,
not Flexible. GitHub Pages forces HTTPS, and Flexible mode makes Cloudflare talk
to it over HTTP — the result is an infinite redirect loop and a dead site.
`hakfarang.net` is already proxied and working, so that zone is a good reference
for the settings.

Keep the `CNAME` file in the repo and the existing DNS records as they are; this
adds Cloudflare in front, it does not change who serves the pages.

---

## What it records

One row per request, into the `traffic_eye` dataset:

| | |
| --- | --- |
| site | hostname |
| category | human · ai · search · social · seo · monitor · tool · other · none |
| agent | ClaudeBot, Googlebot, Chrome, … |
| path | truncated to 96 characters |
| country | Cloudflare's two-letter code |
| status, method, duration | |
| referrer | **host only** |

Referrer is reduced to its host on purpose: a full referring URL can carry
search terms and other things that are the visitor's business. Nothing here
identifies a person, and the collector sets no cookie and no fingerprint on the
sites being measured.

## Safety

The collector runs in front of live sites, so it is written so that it cannot
break one:

- The origin fetch happens **first** and its response is returned no matter what.
- All recording is inside `try`/`catch` whose failure path is to do nothing.
- The response body is never read, buffered, or rewritten — caching and
  streaming behave exactly as they did without it.
- If the Analytics Engine binding is missing, it silently records nothing.

To detach from a site: comment the route out and redeploy. To stop everything:
`npx wrangler delete traffic-eye-collector`.

## Tests

```bash
node src/classify.test.mjs
```

34 real User-Agent strings. The interesting ones are the near-misses it has to
get right: `Google-Extended` (AI training) must not read as `Googlebot`
(search); `Applebot-Extended` must not read as `Applebot`; and `Line/13.19.0` is
a **person** on a phone who tapped a shared link, not LINE's preview crawler —
which matters more here than anywhere, because these sites are shared LINE-first.
