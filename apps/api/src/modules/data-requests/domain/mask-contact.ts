import { formatLeadPhone } from '@plp/contracts';
import type { DataRequestContact } from '../data-request.schema.js';

const characters = new Intl.Segmenter('vi', { granularity: 'grapheme' });

/** The first `count` characters as people see them: "Ư" with its marks is one. */
function leading(text: string, count: number): string {
  let kept = '';
  let taken = 0;
  for (const { segment } of characters.segment(text)) {
    if (taken === count) {
      break;
    }
    kept += segment;
    taken += 1;
  }
  return kept;
}

/** "Lê Mai Anh" → "L. M. A.": the request stays recognisable in the list, the person does not. */
export function maskName(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word !== '')
    .map((word) => `${leading(word, 1)}.`)
    .join(' ');
}

/**
 * "+84987106223" → "0987 *** 223" (ADR-017): the first and last groups of the number as people
 * read it. A number of another country keeps its first four and last three characters.
 */
export function maskPhone(phone: string): string {
  const groups = formatLeadPhone(phone).split(' ');
  const first = groups[0];
  const last = groups.at(-1);
  if (groups.length >= 3 && first !== undefined && last !== undefined) {
    return [first, ...groups.slice(1, -1).map((group) => '*'.repeat(group.length)), last].join(' ');
  }
  return `${phone.slice(0, 4)}${'*'.repeat(Math.max(3, phone.length - 7))}${phone.slice(-3)}`;
}

/** "thaovy.h@gmail.com" → "th***@gmail.com". */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  const local = at === -1 ? email : email.slice(0, at);
  const domain = at === -1 ? '' : email.slice(at);
  return `${leading(local, local.length > 2 ? 2 : 1)}***${domain}`;
}

/** What a completed deletion keeps of the person: enough to show it was handled, nothing more. */
export function maskContact(contact: DataRequestContact): DataRequestContact {
  return {
    name: contact.name === null ? null : maskName(contact.name),
    phone: contact.phone === null ? null : maskPhone(contact.phone),
    email: contact.email === null ? null : maskEmail(contact.email),
  };
}
