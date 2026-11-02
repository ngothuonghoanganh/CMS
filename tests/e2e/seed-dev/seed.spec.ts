import { test } from '@playwright/test';
import { seedBoard } from '../support/board.js';
import { siteOrigin, urls } from '../urls.js';

test('seed the boards’ sample data into the development database', async ({ request }) => {
  const board = await seedBoard(request);
  console.log(
    [
      '',
      `Đăng nhập ${urls.admin}/login`,
      `  Email:     ${board.account.email}`,
      `  Mật khẩu:  ${board.account.password}`,
      `Site "${board.site.name}": ${urls.admin}/sites/${board.site.id}`,
      `Trang live: ${siteOrigin(board.site.subdomain)}/`,
      '',
    ].join('\n'),
  );
});
