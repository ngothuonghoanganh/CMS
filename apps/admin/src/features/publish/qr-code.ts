import { toString as renderQrCode } from 'qrcode';

/** A QR code of `text` as an SVG data URL, for `<img src>` ("Quét mã để kiểm tra trên điện thoại"). */
export async function qrCodeDataUrl(text: string): Promise<string> {
  const svg = await renderQrCode(text, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
