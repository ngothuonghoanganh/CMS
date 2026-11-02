import { describe, expect, it } from 'vitest';
import { escapeHtml, renderEmail } from './email-templates.js';
import {
  accessDecisionEmail,
  accessRequestEmail,
  accountExistsEmail,
  approvalPublishedEmail,
  approvalRejectedEmail,
  approvalRequestEmail,
  domainActiveEmail,
  domainLostEmail,
  domainMovedEmail,
  leadNotificationEmail,
  memberInvitationEmail,
  passwordResetEmail,
  recipientConfirmationEmail,
  signupConfirmationEmail,
} from './emails.js';

/* What SMTP sends: the text and HTML the API rendered before ADR-029, now from template data. */

const ID = '6724f0c2a1b2c3d4e5f60789';
const LINK_EXPIRES_AT = new Date('2026-11-08T00:00:00.000Z');

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

describe('lead-notification', () => {
  const email = renderEmail(
    leadNotificationEmail({
      leadId: ID,
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
        leadId: ID,
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
        recipientId: ID,
        linkExpiresAt: LINK_EXPIRES_AT,
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
        invitationId: ID,
        linkExpiresAt: LINK_EXPIRES_AT,
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
    requestId: ID,
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
      requestId: ID,
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

describe('domain emails (ADR-022)', () => {
  const input = {
    domainId: ID,
    hostname: 'go.smilecare.vn',
    siteName: 'Nha khoa <Smile> Care',
    domainsUrl: `http://localhost:3100/sites/${ID}/domain`,
  };

  it('says the domain is live, lost or taken by another site, with the site escaped', () => {
    const active = renderEmail(domainActiveEmail(input));
    expect(active.subject).toBe('go.smilecare.vn đã hoạt động');
    expect(active.text).toContain('Các trang đang live của Nha khoa <Smile> Care mở được qua');
    expect(active.html).toContain('Nha khoa &lt;Smile&gt; Care');
    expect(active.html).toContain(`href="http://localhost:3100/sites/${ID}/domain"`);
    const lost = renderEmail(domainLostEmail({ ...input, lostSince: LINK_EXPIRES_AT }));
    expect(lost.subject).toBe('go.smilecare.vn đang không truy cập được');
    expect(lost.html).toContain('Xem cách sửa');
    const moved = renderEmail(domainMovedEmail(input));
    expect(moved.subject).toBe('go.smilecare.vn đã chuyển khỏi Nha khoa <Smile> Care');
    expect(moved.text).toContain('bằng bản ghi TXT ở một site khác');
  });
});

describe('approval emails (ADR-023)', () => {
  const pageUrl = 'http://localhost:3100/sites/s1/pages/p1';
  const request = { approvalId: ID, sentAt: LINK_EXPIRES_AT, pageUrl };

  it('asks the approvers, with the note, escaped', () => {
    const email = renderEmail(
      approvalRequestEmail({
        ...request,
        requesterName: 'Minh',
        pageTitle: 'Ưu đãi <b>tháng 11</b>',
        siteName: 'Nha khoa Smile Care',
        note: 'Đổi giá & ảnh hero',
        resent: false,
      }),
    );
    expect(email.subject).toBe('Minh gửi yêu cầu xuất bản "Ưu đãi <b>tháng 11</b>"');
    expect(email.text).toContain('đang chờ bạn duyệt');
    expect(email.text).toContain('Ghi chú: Đổi giá & ảnh hero');
    expect(email.html).toContain('Ưu đãi &lt;b&gt;tháng 11&lt;/b&gt;');
    expect(email.html).toContain(`href="${pageUrl}"`);
    expect(
      renderEmail(
        approvalRequestEmail({
          ...request,
          requesterName: 'Minh',
          pageTitle: 'Ưu đãi',
          siteName: 'Smile Care',
          note: '',
          resent: true,
        }),
      ),
    ).toMatchObject({ subject: 'Minh gửi lại yêu cầu xuất bản "Ưu đãi"' });
  });

  it('tells the sender the version went live, or why not', () => {
    const published = {
      approvalId: ID,
      pageTitle: 'Ưu đãi',
      version: 3,
      liveUrl: 'https://go.smilecare.vn/uu-dai',
    };
    expect(
      renderEmail(
        approvalPublishedEmail({ ...published, publisherName: 'Ngọc Anh', approved: true }),
      ).text,
    ).toContain('Ngọc Anh đã duyệt và xuất bản phiên bản v3.');
    // A Biên tập publishes without approving.
    expect(
      renderEmail(
        approvalPublishedEmail({ ...published, publisherName: 'Minh Khoa', approved: false }),
      ).text,
    ).toContain('Minh Khoa đã xuất bản phiên bản v3.');
    const rejected = renderEmail(
      approvalRejectedEmail({
        approvalId: ID,
        pageTitle: 'Ưu đãi',
        rejecterName: 'Ngọc Anh',
        reason: 'Giá chưa đúng',
        pageUrl,
      }),
    );
    expect(rejected.subject).toBe('Yêu cầu xuất bản "Ưu đãi" chưa được duyệt');
    expect(rejected.text).toContain('Lý do: Giá chưa đúng');
  });
});

describe('account emails (ADR-026)', () => {
  it('asks to confirm a sign-up, naming its workspace, escaped', () => {
    const email = renderEmail(
      signupConfirmationEmail({
        signupId: ID,
        linkExpiresAt: LINK_EXPIRES_AT,
        workspaceName: 'Mây Xanh <b>Agency</b>',
        confirmUrl: 'http://localhost:3100/signup/verify#token=abc',
        validHours: 24,
      }),
    );
    expect(email.subject).toBe('Xác nhận email để tạo workspace');
    expect(email.text).toContain('tạo workspace "Mây Xanh <b>Agency</b>"');
    // The password is chosen on the link's page, not in the form (ADR-026).
    expect(email.text).toContain('xác nhận email và đặt mật khẩu');
    expect(email.text).toContain('Xác nhận tại: http://localhost:3100/signup/verify#token=abc');
    expect(email.text).toContain('Link có hiệu lực 24 giờ và chỉ dùng được một lần.');
    expect(email.html).toContain('Mây Xanh &lt;b&gt;Agency&lt;/b&gt;');
    expect(email.html).toContain('href="http://localhost:3100/signup/verify#token=abc"');
    expect(email.html).toContain('Xác nhận và tạo workspace');
  });

  it('tells an email with an account how to sign in or reset, with no link that acts', () => {
    const email = renderEmail(
      accountExistsEmail({
        userId: ID,
        requestedAt: LINK_EXPIRES_AT,
        loginUrl: 'http://localhost:3100/login',
        forgotUrl: 'http://localhost:3100/forgot-password',
      }),
    );
    expect(email.subject).toBe('Email này đã có tài khoản');
    expect(email.text).toContain('Đăng nhập: http://localhost:3100/login');
    expect(email.text).toContain('Quên mật khẩu: http://localhost:3100/forgot-password');
    expect(email.text).not.toContain('#token=');
    expect(email.html).toContain('href="http://localhost:3100/forgot-password"');
  });

  it('sends a reset link that says how long it works and that devices sign out', () => {
    const email = renderEmail(
      passwordResetEmail({
        userId: ID,
        linkExpiresAt: LINK_EXPIRES_AT,
        resetUrl: 'http://localhost:3100/reset-password#token=abc',
        validMinutes: 60,
      }),
    );
    expect(email.subject).toBe('Đặt lại mật khẩu');
    expect(email.text).toContain('mọi thiết bị đang đăng nhập sẽ bị đăng xuất');
    expect(email.text).toContain(
      'Đặt lại mật khẩu tại: http://localhost:3100/reset-password#token=abc',
    );
    expect(email.text).toContain('Link có hiệu lực 60 phút');
    expect(email.html).toContain('href="http://localhost:3100/reset-password#token=abc"');
  });
});
