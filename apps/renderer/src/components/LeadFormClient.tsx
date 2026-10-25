'use client';

import { LEAD_ROUTE } from '@plp/contracts';
import {
  leadFieldId,
  type LeadFormErrorField,
  LeadFormSent,
  LeadFormView,
  type LeadFormViewProps,
} from '@plp/sections/react';
import { type SubmitEvent, useEffect, useRef, useState } from 'react';
import {
  checkLeadRequest,
  LEAD_FIELD_ORDER,
  leadProblemsOf,
  leadRequestCandidate,
  leadSourceFrom,
} from '../lib/lead-request';

const MESSAGES = {
  rateLimited: 'Bạn đã gửi nhiều lần, hãy thử lại sau ít phút.',
  failed: 'Chưa gửi được đăng ký. Kiểm tra kết nối rồi thử lại.',
} as const;

interface FormState {
  errors: Partial<Record<LeadFormErrorField, string>>;
  formError: string | null;
  submitting: boolean;
  sent: boolean;
}

const IDLE: FormState = { errors: {}, formError: null, submitting: false, sent: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The message of a refused relay: the route's own words, or a generic one. */
function messageOf(body: unknown): string {
  return isRecord(body) && typeof body['message'] === 'string' ? body['message'] : MESSAGES.failed;
}

function issuesOf(body: unknown) {
  return isRecord(body) && Array.isArray(body['issues'])
    ? body['issues'].filter(
        (issue): issue is { path: (string | number)[]; code: string; message: string } =>
          isRecord(issue) && Array.isArray(issue['path']) && typeof issue['message'] === 'string',
      )
    : [];
}

/**
 * The lead form with JavaScript (ADR-016): the server-rendered plain form, enhanced in place. It
 * checks fields as the API will, sends JSON to `/_lead`, and shows the confirmation in the section.
 * One submission id per form, kept across retries, so a retry is never a second lead.
 */
export function LeadFormClient(props: LeadFormViewProps) {
  const [state, setState] = useState<FormState>(IDLE);
  const shownAt = useRef<number | null>(null);
  const submissionId = useRef<string | null>(null);
  const sentHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    shownAt.current = performance.now();
  }, []);

  useEffect(() => {
    if (state.sent) {
      sentHeading.current?.focus();
    }
  }, [state.sent]);

  function showProblems(errors: FormState['errors'], formError: string | null) {
    setState({ errors, formError, submitting: false, sent: false });
    const first = LEAD_FIELD_ORDER.find((field) => errors[field] !== undefined);
    if (first !== undefined) {
      document.getElementById(leadFieldId(props.sectionId, first))?.focus();
    }
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.submitting) {
      return;
    }
    const data = new FormData(event.currentTarget);
    submissionId.current ??= crypto.randomUUID();
    const body = leadRequestCandidate(
      (name) => {
        const value = data.get(name);
        return typeof value === 'string' ? value : null;
      },
      {
        submissionId: submissionId.current,
        elapsedMs:
          shownAt.current === null ? null : Math.round(performance.now() - shownAt.current),
        source: leadSourceFrom(window.location.href, document.referrer),
      },
    );
    const check = checkLeadRequest(body);
    if (!check.ok) {
      const problems = leadProblemsOf(check.issues);
      showProblems(problems.fields, problems.other[0] ?? null);
      return;
    }
    setState({ ...IDLE, submitting: true });
    let response: Response;
    try {
      response = await fetch(LEAD_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      // Offline or the request was cut: the visitor can send again with the same submission id.
      showProblems({}, MESSAGES.failed);
      return;
    }
    const answer: unknown = await response.json().catch(() => null);
    if (response.ok) {
      setState({ ...IDLE, sent: true });
      return;
    }
    if (response.status === 422) {
      const problems = leadProblemsOf(issuesOf(answer));
      showProblems(problems.fields, problems.other[0] ?? null);
      return;
    }
    showProblems({}, response.status === 429 ? MESSAGES.rateLimited : messageOf(answer));
  }

  if (state.sent) {
    return <LeadFormSent content={props.content} headingRef={sentHeading} />;
  }
  return (
    <LeadFormView
      {...props}
      errors={state.errors}
      formError={state.formError}
      submitting={state.submitting}
      onSubmit={(event) => {
        void submit(event);
      }}
    />
  );
}
