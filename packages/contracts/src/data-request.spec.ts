import { describe, expect, it } from 'vitest';
import {
  createDataRequestRequestSchema,
  DATA_REQUEST_CONTACT_MESSAGE,
  DATA_REQUEST_LOG_MAX,
  DATA_REQUEST_MATCHES_MAX,
  dataRequestContactSchema,
  dataRequestDeadlines,
  receivedAtProblem,
} from './data-request.js';
import { LEAD_PHONE_MESSAGE } from './lead.js';
import { updateLeadContactRequestSchema } from './lead-inbox.js';

const RECEIVED = '2026-10-23T03:15:00.000Z';

describe('createDataRequestRequestSchema', () => {
  it('stores the phone number as E.164 and the email in lowercase, like a lead', () => {
    expect(
      createDataRequestRequestSchema.parse({
        name: '  Lê Mai Anh ',
        phone: '0987 106 223',
        email: ' Mai.Anh@Gmail.com ',
        type: 'delete',
        receivedAt: RECEIVED,
      }),
    ).toEqual({
      name: 'Lê Mai Anh',
      phone: '+84987106223',
      email: 'mai.anh@gmail.com',
      type: 'delete',
      receivedAt: RECEIVED,
    });
  });

  it('takes a request with an email only and no name', () => {
    expect(
      createDataRequestRequestSchema.parse({
        name: '',
        phone: '',
        email: 'thaovy.h@gmail.com',
        type: 'access',
        receivedAt: RECEIVED,
      }),
    ).toMatchObject({ name: null, phone: null, email: 'thaovy.h@gmail.com' });
  });

  it('needs a phone number or an email to find the person’s leads', () => {
    const result = createDataRequestRequestSchema.safeParse({
      name: 'Lê Mai Anh',
      phone: ' ',
      email: '',
      type: 'rectify',
      receivedAt: RECEIVED,
    });
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['phone'], message: DATA_REQUEST_CONTACT_MESSAGE }),
    ]);
  });

  it('refuses a phone number a form would refuse', () => {
    const result = dataRequestContactSchema.safeParse({
      name: '',
      phone: '12345',
      email: 'mai.anh@gmail.com',
    });
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['phone'], message: LEAD_PHONE_MESSAGE }),
    ]);
  });

  it('takes each of the four kinds of request', () => {
    for (const type of ['access', 'rectify', 'delete', 'withdraw_marketing']) {
      expect(
        createDataRequestRequestSchema.parse({
          name: '',
          phone: '0987106223',
          email: '',
          type,
          receivedAt: RECEIVED,
        }).type,
      ).toBe(type);
    }
  });

  it('takes a name of up to 100 characters and a phone number typed in up to 24', () => {
    const contact = { name: 'A'.repeat(100), phone: '(+84) (0)901 - 234 - 567', email: '' };
    expect(dataRequestContactSchema.parse(contact)).toEqual({
      name: 'A'.repeat(100),
      phone: '+84901234567',
      email: null,
    });
    expect(
      dataRequestContactSchema.safeParse({ ...contact, name: 'A'.repeat(101) }).error?.issues,
    ).toEqual([expect.objectContaining({ path: ['name'], message: 'Họ và tên tối đa 100 ký tự' })]);
    // The same number with one more space: 25 characters.
    expect(
      dataRequestContactSchema.safeParse({ ...contact, phone: '(+84) (0) 901 - 234 - 567' }).error
        ?.issues,
    ).toEqual([expect.objectContaining({ path: ['phone'], message: LEAD_PHONE_MESSAGE })]);
  });

  it('needs a phone number or an email in the contact form too', () => {
    expect(
      dataRequestContactSchema.safeParse({ name: 'Lê Mai Anh', phone: '', email: '' }).error
        ?.issues,
    ).toEqual([
      expect.objectContaining({ path: ['phone'], message: DATA_REQUEST_CONTACT_MESSAGE }),
    ]);
  });

  it('refuses an unknown type and a receipt time that is not an instant', () => {
    const result = createDataRequestRequestSchema.safeParse({
      name: '',
      phone: '0987106223',
      email: '',
      type: 'export',
      receivedAt: '23/10/2026',
    });
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(['type', 'receivedAt']);
  });
});

describe('updateLeadContactRequestSchema', () => {
  it('applies the rules of the form: a name, an E.164 phone number, an optional email', () => {
    expect(
      updateLeadContactRequestSchema.parse({
        name: 'Lê Mai Anh',
        phone: '+84 0987 106 223',
        email: '',
      }),
    ).toEqual({ name: 'Lê Mai Anh', phone: '+84987106223', email: null });
    expect(
      updateLeadContactRequestSchema.safeParse({ name: '', phone: '0987106223', email: '' }).error
        ?.issues[0]?.path,
    ).toEqual(['name']);
  });
});

describe('the deadlines of a request', () => {
  const vn = (text: string) => new Date(`${text}+07:00`);

  it('gives 2 working days to answer and 20 to complete', () => {
    expect(dataRequestDeadlines(vn('2026-10-23T10:15:00'))).toEqual({
      respondBy: vn('2026-10-27T23:59:59.999'),
      completeBy: vn('2026-11-20T23:59:59.999'),
    });
  });

  it('records a request received up to 30 days ago, never in the future', () => {
    const now = vn('2026-10-25T12:00:00');
    expect(receivedAtProblem(vn('2026-10-25T11:59:00'), now)).toBeNull();
    expect(receivedAtProblem(vn('2026-09-25T12:00:00'), now)).toBeNull();
    expect(receivedAtProblem(vn('2026-09-25T11:59:00'), now)).toBe(
      'Chỉ ghi nhận được yêu cầu nhận trong 30 ngày qua',
    );
    // A clock up to 5 minutes ahead is tolerated, not a millisecond more.
    expect(receivedAtProblem(vn('2026-10-25T12:04:00'), now)).toBeNull();
    expect(receivedAtProblem(vn('2026-10-25T12:05:00'), now)).toBeNull();
    expect(receivedAtProblem(vn('2026-10-25T12:05:00.001'), now)).toBe(
      'Thời điểm nhận yêu cầu không được ở tương lai',
    );
    expect(receivedAtProblem(vn('2026-10-25T12:06:00'), now)).toBe(
      'Thời điểm nhận yêu cầu không được ở tương lai',
    );
  });
});

describe('the limits of a request', () => {
  it('keeps 50 log entries (ADR-017) and lists 20 of the person’s leads', () => {
    expect(DATA_REQUEST_LOG_MAX).toBe(50);
    expect(DATA_REQUEST_MATCHES_MAX).toBe(20);
  });
});
