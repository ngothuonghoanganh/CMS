import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  leadNotificationEmail,
  recipientConfirmationEmail,
} from './email-templates.js';

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

describe('leadNotificationEmail', () => {
  const email = leadNotificationEmail({
    siteName: 'Nha khoa Smile Care',
    pageTitle: 'Ưu đãi niềng răng',
    releaseVersion: 12,
    lead,
    leadUrl: 'http://localhost:3100/sites/s1/leads?lead=l1&range=all',
  });

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
    const plain = leadNotificationEmail({
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
    });
    expect(plain.text).not.toContain('Email:');
    expect(plain.text).not.toContain('Lời nhắn:');
    expect(plain.text).toContain('Nguồn: trực tiếp');
  });
});

describe('recipientConfirmationEmail', () => {
  it('says who added the address, for which site, and how long the link works', () => {
    const email = recipientConfirmationEmail({
      siteName: 'Nha khoa Smile Care',
      invitedBy: 'Ngọc Anh',
      confirmUrl: 'http://localhost:3100/lead-recipients/confirm#token=abc',
      validDays: 7,
    });
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
