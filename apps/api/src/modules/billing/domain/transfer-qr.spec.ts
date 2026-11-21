import { describe, expect, it } from 'vitest';
import { crc16, qrSvgDataUrl, vietQrPayload } from './transfer-qr.js';

describe('the QR code of a transfer (ADR-035, T3)', () => {
  it('is an SVG drawn here, for an <img>', () => {
    const url = qrSvgDataUrl('PLP HD-2026-000001');
    expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true);
    const svg = Buffer.from(url.slice('data:image/svg+xml;base64,'.length), 'base64').toString();
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 (\d+) \1"/);
    expect(svg).toContain('<path fill="#000" d="M4 4h1v1h-1z');
    expect(svg).not.toContain('<script');
  });

  it('carries a VietQR payload with its checksum', () => {
    expect(crc16('123456789')).toBe('29B1');
    const payload = vietQrPayload({
      bankBin: '970000',
      accountNumber: '0000000000',
      amount: 599_000,
      content: 'PLP HD-2026-000001',
    });
    expect(payload).toBe(
      '000201010212' +
        '3854' +
        '0010A000000727' +
        '0124' +
        '0006970000' +
        '01100000000000' +
        '0208QRIBFTTA' +
        '5303704' +
        '5406599000' +
        '5802VN' +
        '62220818PLP HD-2026-000001' +
        `6304${crc16(payload.slice(0, -4))}`,
    );
  });
});
