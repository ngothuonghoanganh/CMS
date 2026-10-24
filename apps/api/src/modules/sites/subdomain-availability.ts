import { type SubdomainAvailability, subdomainFormatSchema, subdomainSchema } from '@plp/contracts';

export const SUBDOMAIN_TAKEN_MESSAGE = 'Tên miền con này đã có người dùng';

/** Whether a normalized (lowercase) subdomain already belongs to a site. */
export type SubdomainTakenLookup = (subdomain: string) => Promise<boolean>;

function firstMessage(issues: readonly { message: string }[]): string {
  const issue = issues[0];
  if (!issue) {
    throw new Error('A failed subdomain validation reported no issue');
  }
  return issue.message;
}

/**
 * Answers "can I use this subdomain?" while the user types. Checks run from cheapest to most
 * expensive: format (contract message), reserved names, then the database.
 */
export async function checkSubdomainAvailability(
  input: string,
  isTaken: SubdomainTakenLookup,
): Promise<SubdomainAvailability> {
  const format = subdomainFormatSchema.safeParse(input);
  if (!format.success) {
    return {
      subdomain: input.trim().toLowerCase(),
      available: false,
      reason: 'invalid',
      message: firstMessage(format.error.issues),
    };
  }
  const subdomain = format.data;
  const reserved = subdomainSchema.safeParse(subdomain);
  if (!reserved.success) {
    return {
      subdomain,
      available: false,
      reason: 'reserved',
      message: firstMessage(reserved.error.issues),
    };
  }
  if (await isTaken(subdomain)) {
    return { subdomain, available: false, reason: 'taken', message: SUBDOMAIN_TAKEN_MESSAGE };
  }
  return { subdomain, available: true, reason: null, message: null };
}
