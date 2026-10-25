import { describe, expect, it } from 'vitest';
import { isCountableUserAgent } from './user-agents.js';

describe('isCountableUserAgent', () => {
  it('counts browsers, including the in-app browsers of Facebook and Zalo', () => {
    for (const userAgent of [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]',
      'Mozilla/5.0 (Linux; Android 14; SM-A556E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 Zalo android/12100541 ZaloTheme/light',
      // A phone whose maker's name contains "bot".
      'Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
    ]) {
      expect(isCountableUserAgent(userAgent)).toBe(true);
    }
  });

  it('does not count crawlers, link previews, HTTP libraries or headless browsers', () => {
    for (const userAgent of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'WhatsApp/2.24.20.79 A',
      'TelegramBot (like TwitterBot)',
      'Zalo-Crawler/1.0',
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0)',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0 Safari/537.36',
      'curl/8.7.1',
      'python-requests/2.32.3',
      'node-fetch/1.0 (+https://github.com/bitinn/node-fetch)',
      'Go-http-client/2.0',
      'Chrome-Lighthouse',
      '',
      '   ',
    ]) {
      expect(isCountableUserAgent(userAgent)).toBe(false);
    }
  });
});
