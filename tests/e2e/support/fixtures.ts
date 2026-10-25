/** A 96 × 64 teal PNG, small enough to keep inline; uploads accept it by its magic bytes. */
const CLINIC_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAGAAAABACAIAAABqVuVZAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAaklEQVR42u3QMQ0AAAgDsDlAHS/+ZeCAm6NJFTQ1zSEKBAkSJEiQIEGCECRIkCBBggQJQpAgQYIECRIkCEGCBAkSJEiQIEEIEiRIkCBBggQhSJAgQYIECRKEIEGCBAkSJEiQIAQJEiTonwU5ejEPvImqTgAAAABJRU5ErkJggg==';

/** A file for `setInputFiles`. */
export const clinicImage = {
  name: 'phong-kham.png',
  mimeType: 'image/png',
  buffer: Buffer.from(CLINIC_PNG_BASE64, 'base64'),
};
