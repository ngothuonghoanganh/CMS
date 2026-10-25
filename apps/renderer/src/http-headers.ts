export interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

/** Response headers set by next.config.ts for every route, plus the preview rules of ADR-010. */
export function responseHeaderRules(): HeaderRule[] {
  return [
    {
      source: '/:path*',
      headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }],
    },
    {
      // A preview is unpublished content: never indexed, cached or leaked through Referer.
      source: '/_preview/:token*',
      headers: [
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Cache-Control', value: 'no-store' },
      ],
    },
    {
      // The lead route answers one visitor: never indexed or cached, no Referer onwards (ADR-016).
      source: '/_lead',
      headers: [
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Cache-Control', value: 'no-store' },
      ],
    },
  ];
}
