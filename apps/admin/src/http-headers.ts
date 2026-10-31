export interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

export interface ResponseHeaderOptions {
  /** The admin is served over HTTPS (`COOKIE_SECURE`): browsers may then insist on it. */
  https: boolean;
}

/**
 * Response headers set by next.config.ts. The admin shows personal data (leads) to signed-in
 * members: it is never framed (clickjacking), its addresses (lead ids, searched phone numbers)
 * never leave it in a Referer, and no browser or proxy keeps a copy of a page, so Back after
 * "Đăng xuất" asks the server again, which answers with the login page.
 *
 * Next does not add these to responses of the `/api` rewrite (an external proxy): the API sets
 * its own headers there (`Cache-Control: no-store` on lead data and exports).
 */
export function responseHeaderRules({ https }: ResponseHeaderOptions): HeaderRule[] {
  return [
    {
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        // For browsers without `frame-ancestors`.
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'same-origin' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        // Ignored over plain HTTP; sent there, it would only pin a local admin to HTTPS.
        ...(https ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] : []),
      ],
    },
    {
      // Every page, whether Next renders it per request or not. Build files keep their long cache.
      source: '/((?!_next/static/).*)',
      headers: [{ key: 'Cache-Control', value: 'no-store' }],
    },
  ];
}
