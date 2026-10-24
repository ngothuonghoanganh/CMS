/**
 * Initials as on the boards: the first letters of the first two words ("Ngọc Anh" → "NA",
 * "Mây Xanh Agency" → "MX"); a single word gives one letter.
 */
export function initialsOf(name: string): string {
  const words = name.normalize('NFC').trim().split(/\s+/u).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toLocaleUpperCase('vi');
}
