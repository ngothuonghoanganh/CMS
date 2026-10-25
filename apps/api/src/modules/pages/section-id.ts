import { randomInt } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const LENGTH = 12;

/** A fresh section instance id: 12 lowercase alphanumerics, matching `sectionIdSchema`. */
export function newSectionId(): string {
  let id = '';
  for (let index = 0; index < LENGTH; index += 1) {
    id += ALPHABET.charAt(randomInt(ALPHABET.length));
  }
  return id;
}
