/**
 * Who is asking for the page.
 *
 * Cloudflare's own bot score is an Enterprise feature — on the free plan there
 * is no score and no bot analytics at all — so the classification has to be
 * ours. That turns out to be the better answer anyway: Cloudflare would tell us
 * "bot", and the question actually worth asking about these sites is *which*
 * bot. An AI crawler reading the wichaa corpus is the point of the project; an
 * SEO scraper hammering it is noise. A single "bot" bucket cannot tell those
 * apart.
 *
 * Matching is on User-Agent alone. That is spoofable, and anything here is a
 * claim rather than a proof — a scraper can say it is Googlebot. Verifying by
 * reverse DNS is possible but costs a lookup on every request, so this stays a
 * self-declaration and the numbers should be read as such.
 */

// Ordered most-specific first: Google-Extended must beat Googlebot, and
// Claude-User (a person asking Claude to fetch a page) is not ClaudeBot (the
// training crawler) even though both say "Claude".
const SIGNATURES = [
  // ---- AI: training crawlers, retrieval agents, and user-triggered fetches --
  ['ai', 'ClaudeBot', /ClaudeBot/i],
  ['ai', 'Claude-User', /Claude-User/i],
  ['ai', 'Claude-SearchBot', /Claude-SearchBot/i],
  ['ai', 'Claude-Web', /Claude-Web/i],
  ['ai', 'anthropic-ai', /anthropic-ai/i],
  ['ai', 'GPTBot', /GPTBot/i],
  ['ai', 'ChatGPT-User', /ChatGPT-User/i],
  ['ai', 'OAI-SearchBot', /OAI-SearchBot/i],
  ['ai', 'PerplexityBot', /PerplexityBot/i],
  ['ai', 'Perplexity-User', /Perplexity-User/i],
  ['ai', 'Google-Extended', /Google-Extended/i],
  ['ai', 'Applebot-Extended', /Applebot-Extended/i],
  ['ai', 'meta-externalagent', /meta-externalagent|meta-externalfetcher|FacebookBot/i],
  ['ai', 'Bytespider', /Bytespider/i],
  ['ai', 'Amazonbot', /Amazonbot/i],
  ['ai', 'CCBot', /CCBot/i],
  ['ai', 'cohere-ai', /cohere-ai|cohere-training-data-crawler/i],
  ['ai', 'AI2Bot', /AI2Bot/i],
  ['ai', 'Diffbot', /Diffbot/i],
  ['ai', 'YouBot', /YouBot/i],
  ['ai', 'Timpibot', /Timpibot/i],
  ['ai', 'Omgilibot', /omgili/i],
  ['ai', 'ImagesiftBot', /ImagesiftBot/i],
  ['ai', 'Kangaroo Bot', /Kangaroo Bot/i],
  ['ai', 'Webzio', /Webzio-Extended/i],
  ['ai', 'DuckAssistBot', /DuckAssistBot/i],
  ['ai', 'MistralAI-User', /MistralAI/i],

  // ---- search engines -----------------------------------------------------
  ['search', 'Googlebot', /Googlebot|Google-InspectionTool|Storebot-Google/i],
  ['search', 'bingbot', /bingbot|adidxbot|BingPreview/i],
  ['search', 'DuckDuckBot', /DuckDuckBot|DuckDuckGo-Favicons/i],
  ['search', 'YandexBot', /Yandex(Bot|Images|Mobile)/i],
  ['search', 'Baiduspider', /Baiduspider/i],
  ['search', 'Applebot', /Applebot/i],
  ['search', 'PetalBot', /PetalBot/i],
  ['search', 'SeznamBot', /SeznamBot/i],
  ['search', 'Sogou', /Sogou/i],
  ['search', 'Qwantify', /Qwantify|Qwantbot/i],
  ['search', 'Slurp', /Slurp/i],
  ['search', 'Internet Archive', /ia_archiver|archive\.org_bot|Wayback/i],
  ['search', 'Mojeek', /MojeekBot/i],
  ['search', 'Marginalia', /search\.marginalia\.nu/i],

  // ---- link previews. LINE matters here: these sites are shared LINE-first,
  // so LINE fetching an OG card is the shape of a real share, not noise. ------
  // Only LINE's own preview fetchers. Matching a bare "Line/13.19.0" here
  // would swallow the LINE in-app browser, which is a person on a phone who
  // tapped a shared link — the single most common way these sites get opened.
  ['social', 'LINE', /line-poker|Linespider/i],
  ['social', 'Facebook', /facebookexternalhit|facebookcatalog/i],
  ['social', 'Twitterbot', /Twitterbot/i],
  ['social', 'LinkedInBot', /LinkedInBot/i],
  ['social', 'Slackbot', /Slackbot|Slack-ImgProxy/i],
  ['social', 'Discordbot', /Discordbot/i],
  ['social', 'TelegramBot', /TelegramBot/i],
  ['social', 'WhatsApp', /WhatsApp/i],
  ['social', 'Pinterest', /Pinterest/i],
  ['social', 'redditbot', /redditbot/i],
  ['social', 'Skype', /SkypeUriPreview/i],
  ['social', 'VK', /vkShare/i],

  // ---- SEO / market-intelligence crawlers: mostly pure cost ---------------
  ['seo', 'AhrefsBot', /AhrefsBot/i],
  ['seo', 'SemrushBot', /Semrush/i],
  ['seo', 'MJ12bot', /MJ12bot/i],
  ['seo', 'DotBot', /DotBot/i],
  ['seo', 'DataForSeoBot', /DataForSeo/i],
  ['seo', 'BLEXBot', /BLEXBot/i],
  ['seo', 'Screaming Frog', /Screaming Frog/i],
  ['seo', 'Barkrowler', /Barkrowler/i],
  ['seo', 'ZoominfoBot', /ZoominfoBot/i],
  ['seo', 'serpstatbot', /serpstatbot/i],
  ['seo', 'SiteAuditBot', /SiteAuditBot/i],
  ['seo', 'Majestic', /MJ12|Majestic/i],

  // ---- uptime monitors ----------------------------------------------------
  ['monitor', 'UptimeRobot', /UptimeRobot/i],
  ['monitor', 'Pingdom', /Pingdom/i],
  ['monitor', 'StatusCake', /StatusCake/i],
  ['monitor', 'Site24x7', /Site24x7/i],
  ['monitor', 'BetterUptime', /Better ?Uptime|betteruptime/i],
  ['monitor', 'HetrixTools', /HetrixTools/i],
  ['monitor', 'GoogleStackdriver', /GoogleStackdriverMonitoring/i],

  // ---- scripts and headless browsers -------------------------------------
  ['tool', 'curl', /^curl\//i],
  ['tool', 'wget', /^Wget/i],
  ['tool', 'python', /python-requests|python-urllib|aiohttp|httpx/i],
  ['tool', 'Go-http-client', /Go-http-client/i],
  ['tool', 'Java', /^Java\//i],
  ['tool', 'okhttp', /okhttp/i],
  ['tool', 'node', /node-fetch|axios|undici/i],
  ['tool', 'perl', /libwww-perl|lwp-trivial/i],
  ['tool', 'Postman', /PostmanRuntime/i],
  ['tool', 'headless', /HeadlessChrome|PhantomJS|Playwright|Puppeteer|Selenium/i],
  ['tool', 'scrapy', /Scrapy/i],
  ['tool', 'http-client', /Apache-HttpClient|Guzzle|WinHttp|RestSharp/i],
];

// Only used to give humans a readable name; order matters (Edge before Chrome,
// Chrome before Safari) because every one of them still says "Safari".
const BROWSERS = [
  ['Edge', /\bEdg(e|A|iOS)?\//],
  ['Opera', /\bOPR\/|\bOpera\//],
  ['Samsung Internet', /SamsungBrowser\//],
  ['LINE in-app', /\bLine\/\d/i],
  ['Facebook in-app', /FBAN|FBAV/],
  ['Firefox', /\bFirefox\//],
  ['Chrome', /\bChrome\/|\bCriOS\//],
  ['Safari', /\bSafari\//],
];

/** Catches self-identifying crawlers that are not on the list above. */
const GENERIC_BOT = /bot\b|crawler|spider|crawl(ing|er)|\bfetch(er)?\b|scrape|feed(fetcher|parser)|monitor|preview/i;

/**
 * @param {string} ua raw User-Agent header
 * @returns {{category: string, agent: string}}
 *   category: ai | search | social | seo | monitor | tool | other | human | none
 */
export function classify(ua) {
  if (!ua || !ua.trim()) return { category: 'none', agent: '(no user-agent)' };

  for (const [category, agent, re] of SIGNATURES) {
    if (re.test(ua)) return { category, agent };
  }

  // A browser-shaped UA that also shouts "bot" is a bot wearing a browser
  // string, which is common and worth keeping separate from the named ones.
  if (GENERIC_BOT.test(ua)) {
    return { category: 'other', agent: unnamedBot(ua) };
  }

  if (/^Mozilla\//.test(ua)) {
    for (const [name, re] of BROWSERS) {
      if (re.test(ua)) return { category: 'human', agent: name };
    }
    return { category: 'human', agent: 'other browser' };
  }

  // Not a browser, not a known tool, does not call itself a bot.
  return { category: 'other', agent: 'unrecognised' };
}

/** Pull a plausible product token out of an unknown bot's UA, for grouping. */
function unnamedBot(ua) {
  const m = ua.match(/([A-Za-z0-9._-]*(?:bot|crawler|spider|fetcher)[A-Za-z0-9._-]*)/i);
  return m ? m[1].slice(0, 40) : 'unnamed bot';
}

/** True when this is a person rather than a machine. */
export function isHuman(category) {
  return category === 'human';
}

export const CATEGORIES = ['human', 'ai', 'search', 'social', 'seo', 'monitor', 'tool', 'other', 'none'];
