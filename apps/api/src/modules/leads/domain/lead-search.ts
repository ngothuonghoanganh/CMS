/** Lowercase, without Vietnamese accents, spaces collapsed: "Nguyễn  Thu Hà" → "nguyen thu ha". */
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

/** What inbox search matches on (ADR-018), stored with each lead and indexed. */
export interface LeadSearchKeys {
  /** Digits of the E.164 number without "+": "84901234567". */
  phone: string;
  email: string | null;
  name: string;
}

export function leadSearchKeys(fields: {
  name: string;
  phone: string;
  email: string | null;
}): LeadSearchKeys {
  return {
    phone: fields.phone.replace(/\D/g, ''),
    email: fields.email?.toLowerCase() ?? null,
    name: foldVietnamese(fields.name),
  };
}

/**
 * A search of the inbox: the start of a phone number or of an email (matched on the index), or
 * part of a name (matched within the other filters).
 */
export type LeadQuery =
  | { kind: 'phone'; prefixes: string[] }
  | { kind: 'email'; prefix: string }
  | { kind: 'name'; text: string };

/** Digits a phone search starts with, in the stored form (`LeadSearchKeys.phone`). */
function phonePrefixes(text: string, digits: string): string[] {
  if (text.startsWith('+')) {
    return [digits];
  }
  if (digits.startsWith('00')) {
    return [digits.slice(2)];
  }
  if (digits.startsWith('0')) {
    // The national form "0901…" is stored as "84901…".
    return [`84${digits.slice(1)}`];
  }
  // "901 234" without its leading 0 or "84…" with the country code.
  return digits.startsWith('84') ? [digits] : [digits, `84${digits}`];
}

/** How the inbox reads `q`; null when there is nothing to search for. */
export function parseLeadQuery(q: string): LeadQuery | null {
  const text = q.trim();
  if (text.includes('@')) {
    return { kind: 'email', prefix: text.toLowerCase() };
  }
  const digits = text.replace(/\D/g, '');
  if (digits !== '' && /^[\d\s.()+-]+$/.test(text)) {
    return { kind: 'phone', prefixes: phonePrefixes(text, digits) };
  }
  const name = foldVietnamese(text);
  return name === '' ? null : { kind: 'name', text: name };
}
