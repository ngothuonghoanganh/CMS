/**
 * Turns Vietnamese text into a URL-safe slug: "Nha khoa Smile Care" → "nha-khoa-smile-care".
 * Used for subdomain and page slug suggestions; validation stays with the schemas.
 */
export function slugify(input: string, maxLength = 60): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}

/**
 * Lowercase, without Vietnamese accents, spaces collapsed: "Nguyễn  Thu Hà" → "nguyen thu ha".
 * How searches compare names, so "ngoc" finds "Ngọc": the lead inbox (ADR-018) and the members
 * screen (ADR-021).
 */
export function foldVietnamese(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      // "đ" has no decomposed form.
      .replace(/[đĐ]/g, 'd')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  );
}
