import {
  LEAD_FILL_MS_MAX,
  LEAD_ROUTE,
  LEAD_SPAM_MIN_FILL_MS,
  publicLeadRequestSchema,
} from '@plp/contracts';
import type { LeadFormInteraction, LeadFormViewProps } from '@plp/sections/react';
import type { SubmitEvent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeadFormClient } from './LeadFormClient';

// These tests run without a DOM: the view keeps the props the client component gives it, so a
// test can send the form through the component's own handler.
const view = vi.hoisted(() => {
  const state: { props: (LeadFormViewProps & LeadFormInteraction) | null } = { props: null };
  return state;
});

vi.mock(import('@plp/sections/react'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    LeadFormView: (props: LeadFormViewProps & LeadFormInteraction) => {
      view.props = props;
      return <actual.LeadFormView {...props} />;
    },
  };
});

const RELEASE_ID = 'c'.repeat(24);

const PROPS: LeadFormViewProps = {
  sectionId: 'form00000001',
  content: {
    heading: 'Đặt lịch tư vấn',
    description: '',
    showEmail: false,
    showMessage: false,
    submitLabel: 'Gửi đăng ký',
    successTitle: 'Đã nhận đăng ký',
    successMessage: 'Smile Care sẽ gọi lại cho bạn trong hôm nay.',
  },
  capture: {
    requiredText: 'Tôi đồng ý để Smile Care liên hệ tư vấn.',
    marketingText: null,
    policyUrl: 'https://smilecare.vn/chinh-sach',
  },
  releaseId: RELEASE_ID,
};

/** What `new FormData(form)` reads from the controls of a form a visitor filled in. */
class FilledForm {
  private readonly values = new Map([
    ['releaseId', RELEASE_ID],
    ['website', ''],
    ['name', 'Nguyễn Thu Hà'],
    ['phone', '0901 234 567'],
    ['consent', 'yes'],
  ]);

  get(name: string): string | null {
    return this.values.get(name) ?? null;
  }
}

const fetchMock = vi.fn<typeof fetch>();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
  view.props = null;
});

/**
 * Draws the form with its script `scriptAtMs` after the page's navigation began, then sends it at
 * `sentAtMs`; both are what `performance.now()` returns at that moment.
 */
function send({ scriptAtMs, sentAtMs }: { scriptAtMs: number; sentAtMs: number }) {
  const now = vi.spyOn(performance, 'now').mockReturnValue(scriptAtMs);
  renderToStaticMarkup(<LeadFormClient {...PROPS} />);
  const onSubmit = view.props?.onSubmit;
  if (onSubmit === undefined) {
    throw new Error('The client component gave the form no submit handler');
  }
  vi.stubGlobal('window', { location: { href: 'http://smilecare.localhost:3101/uu-dai' } });
  vi.stubGlobal('document', { referrer: '' });
  vi.stubGlobal('FormData', FilledForm);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));
  now.mockReturnValue(sentAtMs);
  onSubmit({
    preventDefault: () => undefined,
    currentTarget: {},
  } as unknown as SubmitEvent<HTMLFormElement>);
}

/** The lead the script sent to `/_lead`, read as the API reads it. */
function sentLead() {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  if (url !== LEAD_ROUTE || typeof init?.body !== 'string') {
    throw new Error('The form sent no JSON to /_lead');
  }
  return publicLeadRequestSchema.parse(JSON.parse(init.body));
}

describe('LeadFormClient', () => {
  // On a slow connection the script arrives seconds after the form drawn on the server, which the
  // visitor can already fill in: the fill time counts from the page's navigation instead.
  it('does not take a visitor who filled the form while its script loaded for a bot', () => {
    send({ scriptAtMs: 9_000, sentAtMs: 10_000 });
    const lead = sentLead();
    expect(lead.elapsedMs).toBe(10_000);
    expect(lead.elapsedMs).toBeGreaterThanOrEqual(LEAD_SPAM_MIN_FILL_MS);
  });

  it('still reports a form sent within seconds of opening the page as too fast', () => {
    send({ scriptAtMs: 400, sentAtMs: 1_200 });
    const lead = sentLead();
    expect(lead.elapsedMs).toBe(1_200);
    expect(lead.elapsedMs).toBeLessThan(LEAD_SPAM_MIN_FILL_MS);
  });

  it('still sends from a tab left open for more than a day', () => {
    send({ scriptAtMs: 400, sentAtMs: LEAD_FILL_MS_MAX + 3_600_000 });
    expect(sentLead().elapsedMs).toBe(LEAD_FILL_MS_MAX);
  });
});
