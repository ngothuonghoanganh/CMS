import { readFileSync } from 'node:fs';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import type { EmailTemplate } from '../src/modules/notifications/emails.js';

/*
 * The data contract of each plp-mailer template, checked the way plp-mailer checks it before
 * rendering (`src/templates/renderer.ts`): the schemas in `mail-templates/` are verbatim copies of
 * `plp-mailer/templates/emails/<template>/schema.json` (ADR-023).
 */

const TEMPLATES: readonly EmailTemplate[] = [
  'lead-notification',
  'recipient-confirmation',
  'member-invitation',
  'access-request',
  'access-decision',
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only web links: an escaped `javascript:` URL is still a working link in an `href`. */
function isHttpUrl(value: string): boolean {
  if (!URL.canParse(value)) {
    return false;
  }
  const { protocol } = new URL(value);
  return protocol === 'https:' || protocol === 'http:';
}

function compileAll(): Map<EmailTemplate, ValidateFunction> {
  // strictRequired is off so `then: { required: [...] }` may name properties declared at the root.
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true,
  });
  ajv.addFormat('email', EMAIL);
  ajv.addFormat('http-url', isHttpUrl);
  return new Map(
    TEMPLATES.map((template) => {
      const file = new URL(`./mail-templates/${template}.schema.json`, import.meta.url);
      return [template, ajv.compile(JSON.parse(readFileSync(file, 'utf8')) as object)];
    }),
  );
}

let validators: Map<EmailTemplate, ValidateFunction> | null = null;

/** What plp-mailer would refuse in `data` for this template; empty when it renders. */
export function templateDataProblems(template: EmailTemplate, data: unknown): string[] {
  validators ??= compileAll();
  const validate = validators.get(template);
  if (validate === undefined) {
    return [`no schema for template "${template}"`];
  }
  return validate(data)
    ? []
    : (validate.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message ?? ''}`);
}
