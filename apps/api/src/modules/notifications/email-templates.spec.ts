import { describe, expect, it } from 'vitest';
import { escapeHtml, renderEmail } from './email-templates.js';
import {
  accessDecisionEmail,
  accessRequestEmail,
  leadNotificationEmail,
  memberInvitationEmail,
  recipientConfirmationEmail,
} from './emails.js';

const lead = {
  name: 'Nguyễn Thu Hà <script>alert(1)</script>',
  phone: '+84901234567',
  email: 'thuha@example.com',
  message: 'Gọi sau 18h & cuối tuần',
  source: { source: 'facebook', medium: 'cpc', campaign: 'uu-dai-t11' },
  // 16:42:07 on 24 October 2026 in Vietnam.
  createdAt: new Date('2026-10-24T09:42:07.000Z'),
};

describe('escapeHtml', () => {
  it('escapes every character that means something in markup', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});

/** What SMTP sends: the same text and HTML as before ADR-023, from the template data. */
describe('lead-notification', () => {
  const email = renderEmail(
    leadNotificationEmail({
      leadId: '6724f0c2a1b2c3d4e5f60789',
      siteName: 'Nha khoa Smile Care',
      pageTitle: 'Ưu đãi niềng răng',
      releaseVersion: 12,
      lead,
      leadUrl: 'http://localhost:3100/sites/s1/leads?lead=l1&range=all',
    }),
  );

  it('names the site and the person in the subject', () => {
    expect(email.subject).toBe(
      '[Nha khoa Smile Care] Lead mới: Nguyễn Thu Hà <script>alert(1)</script>',
    );
  });

  it('lists the lead in plain text with a link to it in the inbox', () => {
    expect(email.text).toContain('Họ và tên: Nguyễn Thu Hà <script>alert(1)</script>');
    expect(email.text).toContain('Số điện thoại: 0901 234 567');
    expect(email.text).toContain('Email: thuha@example.com');
    expect(email.text).toContain('Lời nhắn: Gọi sau 18h & cuối tuần');
    expect(email.text).toContain('Trang: Ưu đãi niềng răng (v12)');
    expect(email.text).toContain('Nguồn: facebook / cpc / uu-dai-t11');
    expect(email.text).toContain('Lúc: 2026-10-24 16:42:07 (giờ Việt Nam)');
    expect(email.text).toContain(
      'Mở lead trong hộp thư: http://localhost:3100/sites/s1/leads?lead=l1&range=all',
    );
  });

  it('escapes what the visitor typed in the HTML part', () => {
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('Nguyễn Thu Hà &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(email.html).toContain('Gọi sau 18h &amp; cuối tuần');
    expect(email.html).toContain(
      'href="http://localhost:3100/sites/s1/leads?lead=l1&amp;range=all"',
    );
  });

  it('leaves out the email and the message the visitor did not give', () => {
    const plain = renderEmail(
      leadNotificationEmail({
        leadId: '6724f0c2a1b2c3d4e5f60789',
        siteName: 'Smile Care',
        pageTitle: 'Trang chủ',
        releaseVersion: 1,
        lead: {
          ...lead,
          email: null,
          message: null,
          source: { source: '(direct)', medium: '(none)', campaign: null },
        },
        leadUrl: 'http://admin/x',
      }),
    );
    expect(plain.text).not.toContain('Email:');
    expect(plain.text).not.toContain('Lời nhắn:');
    expect(plain.text).toContain('Nguồn: trực tiếp');
  });
});

describe('recipient-confirmation', () => {
  it('says who added the address, for which site, and how long the link works', () => {
    const email = renderEmail(
      recipientConfirmationEmail({
        recipientId: '6724f0c2a1b2c3d4e5f60789',
        linkExpiresAt: new Date('2026-11-08T00:00:00.000Z'),
        siteName: 'Nha khoa Smile Care',
        invitedBy: 'Ngọc Anh',
        confirmUrl: 'http://localhost:3100/lead-recipients/confirm#token=abc',
        validDays: 7,
      }),
    );
    expect(email.subject).toBe('Xác nhận nhận lead của Nha khoa Smile Care');
    expect(email.text).toContain(
      'Ngọc Anh đã thêm địa chỉ này vào "Nơi nhận lead" của Nha khoa Smile Care.',
    );
    expect(email.text).toContain(
      'Xác nhận tại: http://localhost:3100/lead-recipients/confirm#token=abc',
    );
    expect(email.text).toContain('Liên kết có hiệu lực 7 ngày.');
    expect(email.html).toContain('href="http://localhost:3100/lead-recipients/confirm#token=abc"');
  });
});

describe('member-invitation', () => {
  it('names the inviter, the role, the scope and how long the link works', () => {
    const email = renderEmail(
      memberInvitationEmail({
        invitationId: '6724f0c2a1b2c3d4e5f60789',
        linkExpiresAt: new Date('2026-11-08T00:00:00.000Z'),
        workspaceName: 'Mây Xanh Agency',
        invitedBy: 'Ngọc Anh',
        roleLabel: 'Biên tập viên',
        scope: 'site Nha khoa Smile Care',
        acceptUrl: 'http://localhost:3100/invite#token=abc',
        validDays: 7,
      }),
    );
    expect(email.subject).toBe('Ngọc Anh mời bạn vào Mây Xanh Agency');
    expect(email.text).toContain(
      'Bạn được mời làm Biên tập viên trên site Nha khoa Smile Care của Mây Xanh Agency.',
    );
    expect(email.text).toContain('Nhận lời mời tại: http://localhost:3100/invite#token=abc');
    expect(email.html).toContain('href="http://localhost:3100/invite#token=abc"');
  });
});

describe('access-request', () => {
  const input = {
    requestId: '6724f0c2a1b2c3d4e5f60789',
    workspaceName: 'Mây Xanh Agency',
    requesterName: 'Thu Trần',
    requesterEmail: 'thu.tran@example.com',
    currentRole: 'Cộng tác viên',
    requestedRole: 'Biên tập viên',
    scope: 'các site hiện tại',
    note: 'Em cần sửa trang <ưu đãi>',
    reviewUrl: 'http://localhost:3100/workspaces/w1/members?request=r1',
  };

  it('says who asks for which role, with their note', () => {
    const email = renderEmail(accessRequestEmail(input));
    expect(email.subject).toBe('Thu Trần xin đổi quyền trong Mây Xanh Agency');
    expect(email.text).toContain(
      'Thu Trần (thu.tran@example.com) đang là Cộng tác viên và xin làm Biên tập viên trên các site hiện tại.',
    );
    expect(email.text).toContain('Lời nhắn: Em cần sửa trang <ưu đãi>');
    expect(email.html).toContain('Lời nhắn: Em cần sửa trang &lt;ưu đãi&gt;');
  });

  it('leaves out an empty note', () => {
    const email = renderEmail(accessRequestEmail({ ...input, note: '' }));
    expect(email.text).not.toContain('Lời nhắn');
  });
});

describe('access-decision', () => {
  it('gives the role and sites decided when accepted, and only says no when declined', () => {
    const base = {
      requestId: '6724f0c2a1b2c3d4e5f60789',
      workspaceName: 'Mây Xanh Agency',
      openUrl: 'http://localhost:3100/',
    };
    const accepted = renderEmail(
      accessDecisionEmail({
        ...base,
        accepted: true,
        roleLabel: 'Biên tập viên',
        scope: 'toàn workspace',
      }),
    );
    expect(accepted.subject).toBe('Yêu cầu đổi quyền trong Mây Xanh Agency đã được chấp nhận');
    expect(accepted.text).toContain('Bạn là Biên tập viên trên toàn workspace.');
    const declined = renderEmail(accessDecisionEmail({ ...base, accepted: false }));
    expect(declined.subject).toBe('Yêu cầu đổi quyền trong Mây Xanh Agency chưa được chấp nhận');
    expect(declined.text).toContain('Chủ sở hữu đã từ chối yêu cầu.');
  });
});
