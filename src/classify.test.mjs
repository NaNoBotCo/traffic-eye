/** Real User-Agent strings, checked against what we claim about them. */
import { classify } from './classify.js';

const CASES = [
  // --- AI ------------------------------------------------------------------
  ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)', 'ai', 'ClaudeBot'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36; compatible; Claude-User/1.0; +Claude-User@anthropic.com', 'ai', 'Claude-User'],
  ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)', 'ai', 'GPTBot'],
  ['Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)', 'ai', 'OAI-SearchBot'],
  ['Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36 PerplexityBot/1.0', 'ai', 'PerplexityBot'],
  ['Mozilla/5.0 (compatible; Google-Extended/1.0)', 'ai', 'Google-Extended'],
  ['Mozilla/5.0 (compatible; CCBot/2.0; +https://commoncrawl.org/faq/)', 'ai', 'CCBot'],
  ['Mozilla/5.0 (Linux; Android 8.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/81 Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)', 'ai', 'Bytespider'],
  ['meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)', 'ai', 'meta-externalagent'],

  // Google-Extended must win over Googlebot; Applebot-Extended over Applebot.
  ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'search', 'Googlebot'],
  ['Mozilla/5.0 (compatible; Applebot-Extended/0.1; +http://www.apple.com/go/applebot)', 'ai', 'Applebot-Extended'],
  ['Mozilla/5.0 (compatible; Applebot/0.1; +http://www.apple.com/go/applebot)', 'search', 'Applebot'],

  // --- search --------------------------------------------------------------
  ['Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)', 'search', 'bingbot'],
  ['Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)', 'search', 'YandexBot'],
  ['Mozilla/5.0 (compatible; DuckDuckBot/1.1; https://duckduckgo.com/duckduckbot)', 'search', 'DuckDuckBot'],
  ['Mozilla/5.0 (compatible; archive.org_bot +http://archive.org/details/archive.org_bot)', 'search', 'Internet Archive'],

  // --- link previews -------------------------------------------------------
  ['facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'social', 'Facebook'],
  ['Twitterbot/1.0', 'social', 'Twitterbot'],
  ['Mozilla/5.0 (compatible; LINE-Poker/1.0)', 'social', 'LINE'],
  ['WhatsApp/2.23.20.0 A', 'social', 'WhatsApp'],

  // --- SEO -----------------------------------------------------------------
  ['Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)', 'seo', 'AhrefsBot'],
  ['Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)', 'seo', 'SemrushBot'],

  // --- monitors / tools ----------------------------------------------------
  ['Mozilla/5.0+(compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)', 'monitor', 'UptimeRobot'],
  ['curl/8.4.0', 'tool', 'curl'],
  ['python-requests/2.31.0', 'tool', 'python'],
  ['Go-http-client/2.0', 'tool', 'Go-http-client'],
  ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120 Safari/537.36', 'tool', 'headless'],

  // --- humans --------------------------------------------------------------
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1', 'human', 'Safari'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'human', 'Chrome'],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 Edg/120.0.0.0', 'human', 'Edge'],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0', 'human', 'Firefox'],
  // A phone opening a link from inside the LINE app — a person, not a crawler.
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/13.19.0', 'human', 'LINE in-app'],

  // --- edges ---------------------------------------------------------------
  ['', 'none', '(no user-agent)'],
  ['Mozilla/5.0 (compatible; SomeNewCrawler/1.0; +http://example.com)', 'other', 'SomeNewCrawler'],
];

let pass = 0;
const fails = [];
for (const [ua, wantCat, wantAgent] of CASES) {
  const got = classify(ua);
  if (got.category === wantCat && got.agent === wantAgent) pass++;
  else fails.push({ ua: ua.slice(0, 66), want: `${wantCat}/${wantAgent}`, got: `${got.category}/${got.agent}` });
}

console.log(`classify: ${pass}/${CASES.length} passed`);
if (fails.length) {
  console.log('\nFAILURES:');
  for (const f of fails) console.log(`  ${f.ua}\n     want ${f.want}\n      got ${f.got}`);
  process.exit(1);
}
