import { create } from 'qrcode';

/** Light modules around the code, as the QR standard asks for a scanner to find it. */
const QUIET_ZONE = 4;

/**
 * The QR code of a bank transfer as an SVG data URL for `<img src>` (ADR-035, T3), drawn here: no
 * outside service sees the account or the amount. Medium error correction, as on printed bills.
 */
export function qrSvgDataUrl(payload: string): string {
  const { modules } = create(payload, { errorCorrectionLevel: 'M' });
  const full = modules.size + QUIET_ZONE * 2;
  let path = '';
  for (let row = 0; row < modules.size; row += 1) {
    for (let column = 0; column < modules.size; column += 1) {
      if (modules.get(row, column) === 1) {
        path += `M${column + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" shape-rendering="crispEdges"><rect width="${full}" height="${full}" fill="#fff"/><path fill="#000" d="${path}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/** One EMVCo field: id, length on two digits, value. */
function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), as EMVCo QR codes end with. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(text, 'utf8')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * A VietQR payload (EMVCo merchant-presented QR over NAPAS 247): a banking app that scans it fills
 * in the bank, account, amount and content of the transfer. `bankBin` is the bank's 6-digit BIN.
 */
export function vietQrPayload(transfer: {
  bankBin: string;
  accountNumber: string;
  amount: number;
  content: string;
}): string {
  const account = field(
    '38',
    field('00', 'A000000727') +
      field('01', field('00', transfer.bankBin) + field('01', transfer.accountNumber)) +
      field('02', 'QRIBFTTA'),
  );
  const body =
    field('00', '01') +
    field('01', '12') +
    account +
    field('53', '704') +
    field('54', String(transfer.amount)) +
    field('58', 'VN') +
    field('62', field('08', transfer.content)) +
    '6304';
  return `${body}${crc16(body)}`;
}
