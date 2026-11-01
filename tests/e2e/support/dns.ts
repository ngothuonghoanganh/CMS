import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * The zone file the API of an E2E run answers DNS questions from (`DOMAIN_DNS_ZONE_FILE`,
 * ADR-022): `{ "<name>": { "CNAME": [], "A": [], "TXT": [] } }`, read at every question.
 */
export const DNS_ZONE_FILE = resolve(import.meta.dirname, '../.dns/zone.json');

type Zone = Record<string, { CNAME?: string[]; A?: string[]; TXT?: string[] }>;

function readZone(): Zone {
  try {
    return JSON.parse(readFileSync(DNS_ZONE_FILE, 'utf8')) as Zone;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

/** Sets the records of `name`, as a customer does at their DNS provider. */
export function setDnsRecords(name: string, records: Zone[string]): void {
  const zone = readZone();
  zone[name] = records;
  mkdirSync(dirname(DNS_ZONE_FILE), { recursive: true });
  writeFileSync(DNS_ZONE_FILE, JSON.stringify(zone, null, 2));
}
