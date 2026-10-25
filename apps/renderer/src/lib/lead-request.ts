import {
  leadFormFieldNames as names,
  type ProblemIssue,
  type PublicLeadRequest,
  publicLeadRequestSchema,
} from '@plp/contracts';
import type { LeadFormErrorField } from '@plp/sections/react';

// Shared by the `/_lead` route and the page script, so both check and word problems the same way.

/** A request as read from a form, before validation: the consent box may be unticked. */
export type LeadRequestCandidate = Omit<PublicLeadRequest, 'consent'> & { consent: boolean };

export type LeadSourceInput = PublicLeadRequest['source'];

const NO_SOURCE: LeadSourceInput = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  referrer: null,
};

/**
 * Campaign tags from the address of the page that showed the form, and where the visitor came
 * from (the page script knows `document.referrer`; a form sent without script does not).
 */
export function leadSourceFrom(pageUrl: string | null, referrer: string | null): LeadSourceInput {
  if (pageUrl === null || !URL.canParse(pageUrl)) {
    return { ...NO_SOURCE, referrer: referrer === '' ? null : referrer };
  }
  const query = new URL(pageUrl).searchParams;
  return {
    utmSource: query.get('utm_source'),
    utmMedium: query.get('utm_medium'),
    utmCampaign: query.get('utm_campaign'),
    referrer: referrer === null || referrer === '' ? null : referrer,
  };
}

export interface CandidateExtras {
  submissionId: string | null;
  elapsedMs: number | null;
  source: LeadSourceInput;
}

/** The request a form's controls describe; `read` returns a control's value, null when absent. */
export function leadRequestCandidate(
  read: (name: string) => string | null,
  extras: CandidateExtras,
): LeadRequestCandidate {
  const text = (name: string) => read(name) ?? '';
  return {
    releaseId: text(names.releaseId),
    submissionId: extras.submissionId,
    name: text(names.name),
    phone: text(names.phone),
    email: text(names.email),
    message: text(names.message),
    consent: read(names.consent) === 'yes',
    marketing: read(names.marketing) === 'yes',
    honeypot: text(names.honeypot),
    elapsedMs: extras.elapsedMs,
    source: extras.source,
  };
}

export type LeadCheck = { ok: true } | { ok: false; issues: ProblemIssue[] };

/** The same check the API runs, with the same Vietnamese messages. */
export function checkLeadRequest(value: unknown): LeadCheck {
  const result = publicLeadRequestSchema.safeParse(value);
  if (result.success) {
    return { ok: true };
  }
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.filter((part) => typeof part !== 'symbol'),
      code: issue.code,
      message: issue.message,
    })),
  };
}

const ERROR_FIELDS: ReadonlySet<string> = new Set<LeadFormErrorField>([
  'name',
  'phone',
  'email',
  'message',
  'consent',
]);

function isErrorField(value: unknown): value is LeadFormErrorField {
  return typeof value === 'string' && ERROR_FIELDS.has(value);
}

export interface LeadProblems {
  /** First message per field, shown under it. */
  fields: Partial<Record<LeadFormErrorField, string>>;
  /** Messages about anything else, shown above the button. */
  other: string[];
}

export function leadProblemsOf(issues: readonly ProblemIssue[]): LeadProblems {
  const problems: LeadProblems = { fields: {}, other: [] };
  for (const issue of issues) {
    const field = issue.path[0];
    if (isErrorField(field)) {
      problems.fields[field] ??= issue.message;
    } else {
      problems.other.push(issue.message);
    }
  }
  return problems;
}

/** Fields in form order, so focus goes to the first one with a problem. */
export const LEAD_FIELD_ORDER: readonly LeadFormErrorField[] = [
  'name',
  'phone',
  'email',
  'message',
  'consent',
];
