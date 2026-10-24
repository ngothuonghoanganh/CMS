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
