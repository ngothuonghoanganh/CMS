# Payload Landing Page — Architecture

**Status:** CANONICAL · **Version:** v1 rebuild · **Date:** 2026-10-24

Tài liệu này là nguồn sự thật duy nhất về sản phẩm, kiến trúc và quyết định kỹ thuật của repository.
Mọi agent và contributor đọc `AGENTS.md` rồi đọc tài liệu này trước khi sửa code.

- Thiết kế UX: [`docs/design/plp-ux-v1/`](design/plp-ux-v1/README.md).
- Source cũ chỉ để tra cứu: tag `legacy-v0`, nhánh `legacy/v0`. Không copy code từ đó.
- Chỉ sửa tài liệu này khi một quyết định kiến trúc thực sự thay đổi. Ghi quyết định mới dưới dạng ADR, không âm thầm viết lại để hợp thức hóa code.

---

## 1. Sản phẩm và phạm vi

**Payload Landing Page** giúp SME, marketer và agency tạo landing page bằng section có hướng dẫn rồi xuất bản an toàn. Một agency là một workspace quản lý nhiều site khách hàng.

**MVP A (publish-first), đã xong:**

- Auth, workspace, site có subdomain mặc định `{site}.{BASE_DOMAIN}`.
- Page và section builder có hướng dẫn (7 section), asset, autosave.
- Preview, publish, lịch sử release, rollback/undo, gỡ trang.
- SEO, redirect, sitemap/robots, màn tên miền mặc định, tạo trang theo mục tiêu.
- Tương ứng màn 01–09 trong thiết kế.

**MVP B (convert), đã xong:**

- Section Form đăng ký, thu lead có bằng chứng đồng ý, chống spam (ADR-016).
- Đồng ý và dữ liệu cá nhân: đơn vị thu thập dữ liệu, nội dung đồng ý có phiên bản, thời gian lưu, yêu cầu từ người gửi form (ADR-017).
- Hộp thư lead và email thông báo (ADR-018).
- Hiệu quả trang, đo không dùng cookie (ADR-019).
- Tương ứng màn 10–12, cộng các phần MVP A đang ẩn ở màn 01, 02, 04, 05, 09 và sidebar.

**Phase 1 (vận hành & đội nhóm), đã xong** (chủ sản phẩm yêu cầu ngày 2026-11-01, theo board Phase 1 của artifact thiết kế):

- Sáu vai trò cố định, phạm vi site, kiểm tra quyền ở mọi endpoint (ADR-020).
- Thành viên và lời mời, đổi quyền, gỡ, chuyển quyền sở hữu.
- Tên miền riêng: xác minh DNS, địa chỉ chính và chuyển hướng 301.
- Tương ứng màn 13–16, 15b và Sidebar v2. Lát và trạng thái ở §5.

**Hoàn thiện trước Phase 2** (chủ sản phẩm yêu cầu ngày 2026-11-02, sau khi đối chiếu mọi màn đã làm với thiết kế):

- Tài khoản: xác nhận email khi đăng ký, quên mật khẩu, đổi mật khẩu (ADR-026).
- Xóa trang và xóa site (ADR-027).
- Màn Sites của workspace, số đếm ở Sidebar v2 (ADR-028).
- Bốn thẻ còn thiếu của màn 04, link chính sách ở chân trang (ADR-007).
- Những chỗ còn lệch thiết kế ở màn 01, 05, 06, 13, 14, 15, 15b (ADR-005, 006, 021, 022).

**Phase 2 (tạo trang nhanh), đã xong** (chủ sản phẩm yêu cầu ngày 2026-11-02, theo board Phase 2 của artifact thiết kế). Template và AI đều chỉ ghi vào bản nháp:

- Thư viện template: mẫu hệ thống, tạo trang từ mẫu, xem trước (ADR-030).
- Template của workspace: lưu trang thành template, phiên bản bất biến, phạm vi site, lưu trữ (ADR-030).
- Áp dụng mẫu vào bản nháp đang sửa, hoàn tác được (ADR-030).
- Tạo trang bằng AI từ brief, và trợ lý AI viết lại chữ trong editor. AI chạy qua một cổng có adapter; bản đầu nối AI local qua API tương thích OpenAI, có hạn mức lượt mỗi tháng (ADR-031).
- Tương ứng màn 17–21 và mục Templates của Sidebar v2. Lát và trạng thái ở §5.

**Chuyển động, đang làm** (chủ sản phẩm yêu cầu ngày 2026-11-04, theo board 37–40 của artifact thiết kế). Cấu hình nằm trong bản nháp và đi theo release (ADR-032):

- 6 phong cách chuyển động của trang, mức độ, điểm nhấn, giảm chuyển động trên điện thoại.
- Ghi đè hiệu ứng xuất hiện từng section, thư viện so sánh phong cách, chạy thử trong editor.
- Section Số liệu nổi bật cho điểm nhấn "Số liệu đếm lên".
- AI tạo trang đề xuất phong cách; người dùng đổi được (ADR-031).
- Tương ứng màn 37–39; màn 40 là danh mục tham chiếu, bản đầu giữ 10 hiệu ứng. Lát và trạng thái ở §5.

**Ngoài phạm vi MVP B, Phase 1 và Phase 2:**

- Google Sheets, Meta Conversions API, Zalo OA; "Form + bản đồ", section Bảng giá, "Section đã lưu".
- Form có trường tùy ý, captcha của bên thứ ba, banner cookie, tạo trang chính sách từ mẫu.
- CRM và automation (Phase 3), gói, thanh toán và marketplace (Phase 4): chưa có quyết định phạm vi. Mọi phần của màn 17–21 nói tới Marketplace hay gói thuộc Phase 4.
- Vai trò tùy chỉnh, luồng "yêu cầu xuất bản" của Cộng tác viên (ADR-020).
- Free styling, điểm lưu bản nháp, rich text, màu thương hiệu tự nhập.

**Nguyên tắc:**

1. Ngăn trạng thái sai thay vì báo lỗi sau khi người dùng đã thao tác.
2. Mỗi state có một nguồn sự thật; trạng thái trang luôn suy ra phía server.
3. Mỗi property có một editor chính thức; các lối tắt gọi cùng command.
4. Lưu ≠ xuất bản. Trang live chỉ đổi khi publish, rollback, undo hoặc gỡ trang.
5. Không trừu tượng hóa cho tính năng tương lai; không `any`; không nuốt lỗi.

---

## 2. Quy tắc nghiệp vụ bất biến

1. **Lưu ≠ xuất bản.** Autosave chỉ cập nhật draft và tăng `revision`.
2. **Trạng thái trang suy ra phía server, không lưu trùng:**
   - `draft`: chưa từng có release.
   - `live`: `draft.revision` bằng `sourceRevision` của release đang trỏ.
   - `live_with_changes`: hai giá trị khác nhau; kèm số thay đổi và tóm tắt.
   - `unpublished` ("Đã gỡ"): đã có release nhưng pointer là `null`.
3. **Publish:**
   - Chạy kiểm tra, trả về lỗi chặn và cảnh báo; mỗi mục có đường dẫn tới field cần sửa.
   - Còn lỗi chặn thì từ chối.
   - Cảnh báo được bỏ qua theo từng mục.
   - Tạo release và dời pointer atomic, có kiểm tra revision và release hiện tại, có idempotency key.
4. **Rollback:** chỉ dời pointer, không sửa release, không đụng draft; lý do ghi vào activity. Undo cũng chỉ dời pointer.
5. **Renderer:**
   - Phân giải host → site → slug → release.
   - Không có release thì trả 404, không bao giờ fallback sang draft.
   - Cache được làm mới khi publish, rollback, undo hoặc gỡ trang.
6. **Preview:** link có chữ ký, có hạn, `noindex`, có banner "Bản xem trước".
7. **SEO thuộc draft.** Đổi slug của trang đang live thì khi publish tạo redirect từ slug cũ. Sinh sitemap và robots.
8. **Editor:**
   - Không free styling: chỉ variant, color scheme đã qua kiểm tra tương phản AA, spacing preset và preset chuyển động (ADR-032).
   - Có undo/redo và cảnh báo khi rời trang còn thay đổi chưa lưu.
   - Sắp xếp bằng kéo thả, nút lên/xuống và phím tắt (WCAG 2.5.7).
   - Nội dung giống nhau trên mọi thiết bị; chỉ ẩn/hiện và thứ tự trên mobile được tùy chỉnh.
9. **Chất lượng:** mọi thay đổi hành vi phải có test. Không nuốt lỗi. Không dùng `any`.
10. **Lead và đồng ý:**
    - Ô đồng ý không bao giờ được tick sẵn. Thiếu đồng ý bắt buộc thì API từ chối lead.
    - Form trên trang live hiện nội dung đồng ý của release đang trỏ; lead lưu tham chiếu tới release đó làm bằng chứng.
    - Phiên bản nội dung đồng ý bất biến; sửa là tạo phiên bản mới.
    - Lead tự xóa theo thời gian lưu của site. Xóa dữ liệu một người là xóa thật.
    - Dữ liệu cá nhân của lead không vào log, activity hay số liệu Hiệu quả.
11. **Đo lường:** không đặt cookie, không lưu IP, không tính lượt xem preview.

### 2.1 Diễn giải thiết kế thành quy tắc

1. **Thứ tự trên điện thoại** là thứ tự bên trong một section: `mobileOrder: 'auto' | 'media-first'` (chữ trước hoặc ảnh trước). Nó không đổi thứ tự giữa các section.
2. **Thiết bị:**
   - Xem trước có Máy tính, Máy tính bảng (768 px) và Điện thoại (390 px).
   - Ẩn/hiện có hai cờ `desktop`/`mobile`; breakpoint mobile là `< 768px`.
   - Nút mắt và "Ẩn section" đổi cờ của nhóm thiết bị đang xem, qua cùng command `setVisibility`.
3. **Alt ảnh** theo từng lần dùng: field ảnh là `{ assetId, alt, decorative }`.
   - Asset bắt buộc có alt mặc định hoặc cờ "trang trí" lúc upload; giá trị được chép vào field khi chọn ảnh.
   - Thiếu alt khi publish là **cảnh báo**.
4. **Link CTA:** `section | page | url | phone | zalo`. Link tới trang khác được phân giải lúc render sang slug đang live.
5. **Nội dung mẫu:** `samplePaths` đánh dấu field còn chữ mẫu; còn chữ mẫu khi publish là cảnh báo.
6. **"Quay về bản live" và "Sao chép vào bản nháp"** cùng là `restoreDraftFromRelease`: ghi đè draft, tăng revision, không đổi release hay pointer.
7. **"Xem bản này"** của release là preview có chữ ký. Không có permalink public cho phiên bản cũ.
8. **Sau rollback,** trạng thái theo quy tắc 2, thường là `live_with_changes`. Dòng phụ "Đã khôi phục về vN" lấy từ activity.
9. **Ẩn trong MVP A:**
   - Sidebar: Leads, Hiệu quả, Dữ liệu & đồng ý.
   - Màn 01: lead 7 ngày, các mục checklist ngoài phạm vi.
   - Màn 04: nhóm Bảng giá/Form, "Section đã lưu".
   - Màn 05: lỗi nơi nhận lead.
   - Màn 07: tùy chỉnh riêng mạng xã hội.
   - Màn 08: "Thêm tên miền".
   - Màn 02: "Duyệt thư viện mẫu", AI.
   - **MVP B mở lại:** ba mục sidebar, lead 7 ngày và mục checklist "Chọn nơi nhận lead" ở màn 01, nhóm Form ở màn 04, lỗi nơi nhận lead ở màn 05. Vẫn ẩn: nhóm Bảng giá và "Form + bản đồ" ở màn 04, "Section đã lưu", và các nơi nhận Google Sheets, Meta ở màn 10.
10. **Theme preset:** mỗi preset có 4 color scheme (Sáng, Nhạt/"Bạc hà", Thương hiệu, Tối), tất cả qua test AA. Site có logo và ảnh chia sẻ mặc định.

---

## 3. Topology và repository

```text
Browser ──> apps/admin (Next.js :3100) ──/api rewrite──> apps/api (NestJS :4100) ──> MongoDB (replica set)
                                                              │                    └─> S3-compatible storage
Visitor ──> apps/renderer (Next.js :3101) ──public endpoints──┘
              ▲ POST /api/revalidate (HMAC) ◄── apps/api
```

Chỉ API được truy cập MongoDB: một master DB và một database cho mỗi workspace, trên cùng một cluster (ADR-025). Renderer không import code admin và vẫn chạy khi admin tắt.

```text
apps/admin            Next.js App Router: quản trị và editor
apps/api              NestJS + Mongoose + Zod
apps/renderer         Next.js: chỉ render Release và preview
packages/config       tsconfig preset
packages/contracts    Zod schema và type dùng chung
packages/sections     registry section: entry `schema` (thuần Zod), entry `react`, themes, blueprints (từ S2)
packages/ui           token và component nền của admin
tests/e2e             Playwright
docs/design/plp-ux-v1 thiết kế UX (chỉ đọc)
```

**Chiều phụ thuộc:**

- `contracts ← sections/schema ← api`
- `contracts ← sections/react ← {admin, renderer}`
- `ui ← admin`
- `sections` không dùng `ui`, vì theme của site độc lập với token admin.
- Các app không import lẫn nhau.

`pnpm governance` (dependency-cruiser cộng `scripts/check-governance.mjs`) cưỡng chế các quy tắc này.

---

## 4. Architecture Decision Records

### ADR-001 — Dựng lại từ đầu, thay thế Rebaseline 1.0

- **Date:** 2026-10-24 · **Status:** Accepted
- **Decision:**
  - Thay toàn bộ source bằng monorepo mới (nhánh `rebuild/v1`). Source cũ giữ nguyên ở tag `legacy-v0` và nhánh `legacy/v0`, chỉ để tra cứu.
  - Tài liệu này thay thế "Architecture Rebaseline 1.0" và ADR-001…006 cũ.
  - Không còn `CURRENT_PHASE` hay roadmap phase; tiến độ theo lát cắt (§5).
- **Reason:**
  - Bản cũ mang DB-per-tenant, GrapesJS, Ant Design, nhiều thế hệ payload và nhiều nguồn trạng thái trang. Chi phí gỡ những thứ đó lớn hơn chi phí dựng lại cho một MVP nhỏ.
  - Khảo sát không thấy deployment, domain hay dữ liệu production nào cần giữ.
- **Consequences:**
  - Không tương thích dữ liệu, API hay URL cũ; không có migration.
  - `docs/_archive/` không được mang sang.
  - Không copy code cũ; chỉ mang ý tưởng: optimistic revision, release bất biến, pointer có điều kiện, contract Zod dùng chung.

### ADR-002 — Stack và chính sách phiên bản

- **Date:** 2026-10-24 · **Status:** Accepted
- **Decision:** Node 24 LTS (`.nvmrc` = `24`), pnpm workspace + Turborepo, TypeScript strict. Dùng bản stable mới nhất tại thời điểm cài; mọi ngoại lệ phải có lý do. Phiên bản đã cài ngày 2026-10-24:

  | Thành phần                                                                        | Phiên bản                                                           |
  | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
  | pnpm · turbo                                                                      | 12.15.0 · 2.11.10                                                   |
  | TypeScript                                                                        | 6.0.3 (ngoại lệ, xem bên dưới)                                      |
  | next · react · react-dom                                                          | 16.4.3 · 19.3.1 · 19.3.1                                            |
  | @nestjs/core · common · platform-express · testing · cli                          | 12.2.0 · 12.2.0 · 12.2.0 · 12.2.0 · 12.0.10                         |
  | @nestjs/mongoose · mongoose · mongodb driver                                      | 12.0.0 · 9.11.3 · 7.7.0                                             |
  | zod                                                                               | 4.6.7                                                               |
  | pino · pino-http · nestjs-pino                                                    | 10.4.0 · 11.0.0 · 5.3.1                                             |
  | vitest · unplugin-swc · @swc/core                                                 | 5.0.5 · 2.0.0 · 1.16.20                                             |
  | @playwright/test · supertest                                                      | 1.64.1 · 7.3.1                                                      |
  | eslint · typescript-eslint · @next/eslint-plugin-next · eslint-plugin-react-hooks | 10.13.0 · 8.72.0 · 16.4.3 · 7.1.1                                   |
  | prettier · dependency-cruiser                                                     | 3.9.10 · 18.7.0                                                     |
  | MongoDB server                                                                    | `mongo:9.0.4` (replica set một node)                                |
  | S3-compatible storage (dev/CI)                                                    | `rustfs/rustfs:1.0.3`; khởi tạo bucket bằng `amazon/aws-cli:2.38.5` |
  | nodemailer (API, MVP B)                                                           | 10.2.1 (kèm type, không cần `@types/nodemailer`)                    |
  | SMTP cho dev/CI (MVP B)                                                           | `axllent/mailpit:v1.32.0` (SMTP :1125, web và API :8125)            |

  Thêm vào ở các lát sau, cũng theo bản mới nhất lúc cài: argon2, jose, @aws-sdk/client-s3, file-type, sharp, zustand, immer, @tanstack/react-query, @dnd-kit, radix-ui (chỉ trong admin), qrcode.

  MVP B thêm `nodemailer` (API, ADR-018) và Mailpit trong docker compose cho dev và CI; phiên bản ở bảng trên (cài ngày 2026-10-25).

- **Reason và ngoại lệ:**
  - **TypeScript 6.0.3, không 7.0.2.** TS 7 là bản native port; typescript-eslint 8.72 khai báo peer `typescript <6.1.0`. Tắt lint có type thì vi phạm quality gate.
  - **mongoose 9.11.3, không 9.11.4.** Chính sách supply-chain mặc định của pnpm 12 giữ lại bản phát hành dưới 24 giờ.
  - **RustFS thay MinIO.** Image `minio/minio` không còn được phát hành trên Docker Hub. RustFS 1.0.3 (Apache-2.0) tương thích S3 và đã được kiểm tra bucket policy chỉ cho đọc công khai prefix `public/`.
  - **MongoDB 9.0.4** là bản stable mới nhất; integration test xác nhận replica set `rs0`.
- **Consequences:**
  - API là ESM (NestJS 12 là ESM) và build bằng `tsc` (decorators chạy tốt với TS 6). `nest start --watch` cho dev.
  - Vitest của API dùng `unplugin-swc`, vì esbuild không phát decorator metadata mà DI của NestJS cần.
  - Nâng TS 7 bằng một PR riêng khi typescript-eslint hỗ trợ.
  - Styling dùng CSS Modules + CSS custom properties. Không Tailwind, không Ant Design, không GrapesJS hay builder tự do nào.
  - Radix chỉ dùng trong admin cho a11y của dialog, menu, popover, tabs, switch.
  - Production có thể dùng bất kỳ storage tương thích S3 nào.
- **Amended 2026-10-26 (test toàn dự án):**
  - `docker compose` chỉ mở cổng trên `127.0.0.1`. MongoDB chạy không xác thực, còn Mailpit giữ thư thông báo lead và link xác nhận, nên không dịch vụ nào được nghe thấy từ mạng. `localhost` vẫn dùng được như cũ.
  - `multer` được ép lên 2.5.0 (`overrides` của pnpm), để vá lỗi DoS GHSA-q7qp-rjg7-q26m. `@nestjs/platform-express` 12.2.0 vẫn khai báo 2.4.0. Bỏ override khi Nest khai báo bản đã vá.
- **Amended 2026-10-31 (vòng test thứ ba):** `minimatch` được ép lên 11.0.3 (`overrides` của pnpm) để vá GHSA-g3hv-75wg-m249 (DoS khi tiền xử lý glob, mức trung bình).
  - Chỉ bản 11 có bản vá; eslint, typescript-eslint và `@nestjs/cli` vẫn khai báo 10.x.
  - Đây là công cụ dev, pattern lấy từ chính repo. Chúng chỉ gọi `minimatch()` và `new Minimatch().match()`, hai API bản 11 giữ nguyên, và ESLint vẫn lint đúng các file như trước.
  - Bản 11 kéo theo `@isaacs/nonrecursive-glob-match` 1.0.3 (cùng tác giả). Bỏ override khi các gói này khai báo bản 11.
- **Amended 2026-10-31 (vòng test thứ ba, E2E):** `@axe-core/playwright` 4.14.0 (kèm `axe-core` 4.14.0), dev dependency của `tests/e2e`, để E2E quét WCAG 2.2 AA (ADR-013). Đây là bộ quét của Deque dùng trực tiếp với Playwright đang có; không thêm trình chạy test nào khác.
- **Amended 2026-11-01 (ADR-029):**
  - `@aws-sdk/client-sqs` 3.1161.0 (API) gửi email vào hàng đợi của plp-mailer khi `MAIL_TRANSPORT=sqs`. Cùng họ SDK v3 với `@aws-sdk/client-s3`.
  - `ajv` 8.20.0 (dev dependency của API) kiểm `data` của email theo `schema.json` của các template trong plp-mailer. Đó là JSON Schema 2020-12 có `if`/`then`, và plp-mailer kiểm bằng chính Ajv; Zod không đọc JSON Schema.

### ADR-003 — Tenancy: một database, scope theo workspace

- **Date:** 2026-10-24 · **Status:** Superseded by ADR-025 (2026-11-01): master DB và một database cho mỗi workspace. `WorkspaceScope`, `workspaceId` trên mọi document và 404 khi truy cập chéo vẫn giữ.
- **Decision:**
  - Một database MongoDB. Mọi document thuộc tenant có `workspaceId`. Workspace không bao giờ lấy từ input của client.
  - API nạp tài nguyên theo id, rồi kiểm tra membership của user trong `resource.workspaceId`.
  - Endpoint list nhận `workspaceId` hoặc `siteId` trên path nhưng luôn đối chiếu membership.
  - Repository chỉ nhận `WorkspaceScope`, một branded type chỉ `AccessService` tạo được, và tự gắn `workspaceId` vào mọi filter.
  - Index bắt đầu bằng `workspaceId` hoặc `siteId`.
  - Truy cập chéo workspace trả 404, không trả 403.
- **Reason:** Vận hành đơn giản; cách ly dựa vào một cơ chế duy nhất, kiểm thử được.
- **Consequences:**
  - Mỗi endpoint có integration test cross-workspace.
  - Governance cấm import `mongoose`/`@nestjs/mongoose` ngoài `*.repository.ts`, `*.schema.ts`, `*.module.ts` và health check.

### ADR-004 — Auth, session, quyền

- **Date:** 2026-10-24 · **Status:** Accepted
- **Decision:**
  - **Đăng ký:** tự đăng ký bằng email + mật khẩu (argon2id), chưa xác minh email trong MVP A. Một transaction tạo user, workspace và membership `owner`.
  - **Session:** lưu phía server trong collection `sessions`. Token ngẫu nhiên 32 byte, DB chỉ lưu sha256, có TTL index.
  - **Cookie:** `httpOnly; SameSite=Lax; Secure` (trừ dev) trên origin admin. Admin proxy `/api/*` sang API qua Next rewrites, nên cookie là first-party.
  - **CSRF và rate limit:** request thay đổi dữ liệu phải có `Origin` khớp `ADMIN_ORIGIN`; `/auth/*` có rate limit.
  - **Quyền:**
    - `owner`: mọi thao tác.
    - `editor`: sửa trang, preview, publish, rollback, undo, gỡ trang, upload asset.
    - Chỉ `owner` được tạo site và sửa cài đặt site (tên, logo, theme, ảnh chia sẻ mặc định).
- **Reason:** Thu hồi session được ngay; không tự viết JWT.
- **Consequences:** Không có quên mật khẩu, OAuth hay mời thành viên trong MVP A.
- **Amended 2026-10-25 (sau review MVP A):**
  - Rate limit của `/auth/*` tính theo địa chỉ client. Mọi request của trình duyệt tới API qua rewrite `/api` của admin, nên địa chỉ socket luôn là của admin và mọi người dùng từng chung một bucket: một client ẩn danh khóa được đăng nhập của cả hệ thống.
  - API đặt Express `trust proxy` bằng `TRUST_PROXY_HOPS` và đọc client từ `X-Forwarded-For`.
  - Rewrite của Next không thêm và không ghi đè `X-Forwarded-For`; nó chuyển nguyên giá trị nhận được từ trình duyệt.
  - **Mặc định là 0:** không tin header nào. Mọi trình duyệt chung một bucket, nhưng client không thể tự chọn bucket để vượt rate limit (brute-force).
  - Production **bắt buộc** có một edge proxy (TLS, load balancer) trước admin, nối địa chỉ socket vào `X-Forwarded-For`, và đặt `TRUST_PROXY_HOPS=1`. Đặt 1 mà không có edge như vậy thì client tự gửi header là chọn được bucket của mình.
  - **Giới hạn theo tài khoản (chủ sản phẩm chốt ngày 2026-10-25):** ngoài giới hạn theo IP, mỗi email chỉ được `LOGIN_FAILURE_LIMIT` lần đăng nhập sai trong `LOGIN_FAILURE_WINDOW_MINUTES` phút (mặc định 5 lần trong 15 phút).
    - Vượt giới hạn thì trả 429 `rate_limited`, kể cả khi mật khẩu đúng, cho tới khi hết cửa sổ.
    - Lần thử được đếm nguyên tử trong collection `login_attempts` **trước** khi kiểm mật khẩu, nên các request song song không lọt quá giới hạn. Đăng nhập thành công thì xóa bộ đếm.
    - Khóa đếm là sha256 của email đã chuẩn hóa. Email chưa có tài khoản cũng bị đếm như nhau, nên không lộ email nào đã đăng ký. Collection có TTL index theo `expiresAt`.
    - Hệ quả:
      - Giới hạn này đúng với mọi cách deploy và giữ được qua nhiều instance API.
      - Người khác biết email có thể khóa đăng nhập của tài khoản đó tối đa một cửa sổ. Đây là đánh đổi có chủ đích để chặn dò mật khẩu.
- **Amended 2026-10-25 (MVP B):** quyền với lead, cài đặt dữ liệu cá nhân và yêu cầu về dữ liệu nằm ở ADR-017. Editor xem và xử lý lead; chỉ Owner sửa cài đặt, xuất và xóa dữ liệu.
- **Amended 2026-10-26 (test toàn dự án):** session hết hiệu lực đúng lúc `expiresAt`. Guard so với thời điểm của từng request, không đợi TTL monitor của MongoDB (chạy khoảng mỗi phút) xóa bản ghi. Integration test giữ điều này.
- **Amended 2026-10-31 (vòng test thứ ba):**
  - **Khóa đếm đăng nhập** là HMAC-SHA256 của email đã chuẩn hóa với `LOGIN_ATTEMPT_SECRET` (bắt buộc, ít nhất 32 ký tự), thay cho sha256. Băm một danh sách email là đảo ngược được sha256, nên trước đây một bản sao database cho biết email nào đã thử đăng nhập. Đổi secret thì mọi bộ đếm bắt đầu lại.
  - **Lỗi phía hệ thống không tốn lượt:**
    - Lần thử vẫn được đếm trước khi kiểm mật khẩu.
    - Khi tra tài khoản, kiểm mật khẩu, xóa bộ đếm hoặc tạo session ném lỗi, API trả lại lần thử đó: giảm 1 trong đúng cửa sổ đã đếm, không xuống dưới 0, không chạm cửa sổ đã hết hay cửa sổ sau.
    - Trả lại cũng lỗi thì log cả hai lỗi.
    - Chỉ mật khẩu sai mới tiêu lượt của tài khoản.
  - **Nhiều instance API:**
    - Rate limit theo địa chỉ của `/auth/*` (`@nestjs/throttler`) đếm trong bộ nhớ của từng tiến trình, nên N instance cho một địa chỉ tối đa N × `AUTH_RATE_LIMIT_PER_MINUTE` lần mỗi phút.
    - Giới hạn theo tài khoản nằm trong MongoDB, đúng với mọi số instance, và là lớp chặn dò mật khẩu thật.
    - Integration test chạy hai instance trên một database giữ cả hai điều này.
- **Amended 2026-11-01 (Phase 1, C1):** phần **Quyền** ở trên được thay bằng sáu vai trò và bảng quyền của ADR-020. Quản trị cũng tạo site và sửa cài đặt site.
- **Amended 2026-10-31 (vòng test thứ ba, rate limit `/auth/*`):** throttle theo địa chỉ đếm theo cùng khóa với giới hạn khách của ADR-016 (`addressNetwork`, trong `shared/`): một địa chỉ IPv4, hoặc một mạng IPv6 /64, và mỗi địa chỉ chỉ có một cách viết. Trước đây một client IPv6 đổi địa chỉ trong /64 của mình là có bucket mới.
  - Sau proxy tin cậy (`TRUST_PROXY_HOPS` ≥ 1), Express lấy `req.ip` từ `X-Forwarded-For` mà không kiểm tra. Địa chỉ không phải IP được đếm vào bucket của địa chỉ socket (proxy): mọi người gửi chuỗi rác chung một bucket, không đổi chuỗi để thoát được. Chỉ khi cả hai địa chỉ đều không phải IP thì mới ném lỗi. Trước đây `X-Forwarded-For: foo` làm `/auth/login` trả 500.
  - Một số load balancer ghi cả cổng vào `X-Forwarded-For` (`ip:port`, `[v6]:port`). Trước khi kiểm tra địa chỉ, API bỏ cổng của IPv4, bỏ ngoặc vuông và cổng của IPv6 (`withoutPort`, trong `shared/`), nên `203.0.113.7:51234` và `203.0.113.7` là một bucket. Chỉ giá trị vẫn không phải IP sau bước đó mới đếm vào bucket của proxy. Trước đây mọi client sau một load balancer như vậy chung bucket của proxy.

### ADR-005 — Mô hình miền Draft/Release và trạng thái suy ra

- **Date:** 2026-10-24 · **Status:** Accepted
- **Decision:**

  ```ts
  users       { email(unique, lowercase), passwordHash, name, createdAt }
  workspaces  { name, createdAt, createdBy }
  memberships { workspaceId, userId, role: Role,                              // unique(workspaceId,userId)
                siteIds: ObjectId[]|null }                                       // ADR-020
  sites       { workspaceId, name, subdomain(unique global), themePresetId,
                logoAssetId|null, defaultShareImageAssetId|null, createdAt,
                privacy|null,                                                     // ADR-017
                leadRecipients: [{ email, confirmedAt|null, tokenHash|null,
                                   tokenExpiresAt|null }] }                       // ADR-018, ≤ 5
  assets      { workspaceId, siteId, storageKey, mimeType, bytes, width, height,
                alt: string|null, decorative: boolean, uploadedBy, createdAt }  // alt≠rỗng XOR decorative
  pages       { workspaceId, siteId, title, goal|null,
                draft: { slug, composition, seo, revision, updatedAt, updatedBy },
                publishedReleaseId|null, publishedSlug|null,                    // chỉ movePointer được ghi
                releaseSeq, createdAt, createdBy }
  releases    { workspaceId, siteId, pageId, version, slug, composition, seo,
                sitePresentation: { name, themePresetId, logoAssetId|null,
                                    defaultShareImageAssetId|null },              // ADR-015
                leadCapture|null,                                                 // ADR-017
                sourceRevision, createdBy, createdAt, note, changeSummary, checks,
                idempotencyKey }                                                  // BẤT BIẾN
  redirects   { workspaceId, siteId, fromSlug, pageId, createdAt }               // unique(siteId,fromSlug)
  activity    { workspaceId, siteId, pageId|null, actorId, type, data, reason|null, createdAt }
  sessions    { tokenHash, userId, expiresAt, createdAt }
  ```

  - Collection của MVP B: `leads`, `lead_limits` (ADR-016); `consent_versions`, `data_requests` (ADR-017); `analytics_daily`, `analytics_seen`, `analytics_salts` (ADR-019).
  - **Index:**
    - `pages`: unique(siteId, draft.slug); unique-partial(siteId, publishedSlug).
    - `releases`: unique(pageId, version); unique(pageId, idempotencyKey).
  - Repository của release chỉ có `insert` và `find*`.
  - `seo = { title, description, shareImageAssetId|null, noindex }`. Title để trống thì dùng heading của Hero, rồi tên site; ảnh chia sẻ để trống thì dùng ảnh mặc định của site. Với trang live, tên site và ảnh mặc định lấy từ `sitePresentation` của release (ADR-015).
  - Activity `type`: `site.created`, `page.created`, `page.published`, `page.rolled_back`, `page.rollback_undone`, `page.unpublished`, `page.draft_restored`, `asset.uploaded`. MVP B thêm `privacy.updated`, `consent.version_created`, `lead.recipients_changed`, `lead.exported`, `lead.person_deleted`, `data_request.created`, `data_request.completed` (ADR-017, ADR-018); `data` của chúng chỉ chứa id và số lượng, không chứa dữ liệu cá nhân.
  - **`derivePageStatus`** là hàm thuần, chạy phía server (quy tắc 2).
  - **`diffSnapshots`** so theo section instance id (thêm, xóa, sửa, đổi chỗ), từng field SEO và slug. Kết quả là các chip như "Sửa: Hero", dùng cho trạng thái, hộp thoại publish và `changeSummary`.
  - **`evaluateDraft`** = trạng thái + checks. Autosave, màn danh sách và editor đều dùng hàm này. Màn danh sách nạp các release đang trỏ bằng một truy vấn `$in`, phân trang ≤ 50.
  - **Autosave:** `PUT /pages/:id/draft { baseRevision, slug, composition, seo }`.
    - Update có điều kiện `draft.revision === baseRevision`, rồi `$inc`. Lệch thì trả 409.
    - Phản hồi gồm `{ revision, status, checks }`.
  - **`restoreDraftFromRelease`** dùng cùng cơ chế `baseRevision`.

- **Reason:** Đúng quy tắc 1–2; mỗi trạng thái có đúng một nguồn.
- **Consequences:**
  - `publishedSlug` là projection của pointer, chỉ ghi trong `movePointer`. Ngoài ra không lưu bản sao trạng thái nào.
  - Không có điểm lưu bản nháp.
- **Amended 2026-10-26 (test toàn dự án):** "Sao chép vào bản nháp" (lịch sử) đọc bản nháp ngay khi hộp thoại mở.
  - Hộp thoại báo đúng số thay đổi sẽ mất, và gửi chính revision đó làm `baseRevision`.
  - Bản nháp được lưu ở nơi khác sau lúc đó sẽ làm server trả 409 `revision_conflict`. Hộp thoại đọc lại và cho xác nhận lần nữa, không bao giờ ghi đè mà người dùng không biết.
  - Số thay đổi sẽ mất nằm trong một vùng `role="status"`, nên trình đọc màn hình đọc nó khi có kết quả. Mỗi lần mở hộp thoại bắt đầu lại từ "Đang kiểm tra bản nháp hiện tại…".
- **Amended 2026-11-02 (khớp thiết kế màn 01):** tìm trang theo tên hoặc đường dẫn không phân biệt dấu và hoa thường, cùng cách chuẩn hóa với hộp thư lead (ADR-018): "uu dai" tìm ra "Ưu đãi tháng 11".
- **Amended 2026-11-02 (ADR-027):** activity có thêm `page.deleted`, và các sự kiện tên miền của ADR-022.
- **Amended 2026-11-02 (ADR-030, lát G1):** activity có thêm `page.created_from_template`; trang có thêm `createdFrom`.
- **Amended 2026-11-02 (ADR-030, lát G2, G3):** activity có thêm `template.saved` và `page.template_applied`.

### ADR-006 — Kiểm tra, publish, rollback, gỡ trang

- **Date:** 2026-10-24 · **Status:** Accepted
- **Decision:**
  - MongoDB chạy replica set; mọi thao tác dời pointer chạy trong `connection.transaction()`.
  - **Checks** trả `{ revision, blocking[], warnings[], passed[] }`.
    - Mỗi mục: `{ code, fingerprint, title, description, target }`.
    - `target` là `{ kind:'section', sectionId, fieldPath } | { kind:'seo', field } | { kind:'slug' }`.
    - **Blocking:** field bắt buộc trống; asset không tồn tại; slug sai định dạng hoặc trùng trang khác đang live; link tới section đã xóa; một nhóm thiết bị không còn section nào hiển thị.
    - **Warning:** ảnh thiếu mô tả; còn nội dung mẫu; thiếu hoặc quá dài tiêu đề SEO (> 60) hay mô tả (> 160); link tới trang chưa live; section ẩn trên mọi thiết bị.
  - **Publish:** `POST /pages/:id/releases`, header `Idempotency-Key`, body `{ expectedRevision, expectedPublishedReleaseId, acknowledgedWarnings, note }`.
    1. Đã có release `(pageId, idempotencyKey)` thì trả lại release đó.
    2. Revision hoặc pointer lệch thì trả 409.
    3. Chạy lại checks; còn blocking hay còn warning chưa bỏ qua thì trả 422.
    4. Transaction: đọc site để chụp `sitePresentation` (ADR-015), insert release (`version = releaseSeq + 1`), rồi `movePointer`.
    5. Sau khi commit, revalidate renderer.
  - **`movePointer(page, expectedCurrent, target|null, reason)`** là đường duy nhất được ghi `publishedReleaseId`/`publishedSlug`:
    1. Update có điều kiện `publishedReleaseId === expectedCurrent`.
    2. Trang khác đang live ở slug đích thì trả 409.
    3. Slug live đổi thì upsert redirect `slugCũ → pageId`.
    4. Xóa redirect có `fromSlug` bằng slug mới.
    5. Ghi activity.
  - **Rollback** = `movePointer` tới release cũ, lý do bắt buộc.
  - **Undo** = `POST /activity/:id/undo`, chỉ hợp lệ khi pointer vẫn là đích của lần rollback đó.
  - **Gỡ trang** = `movePointer(..., null, reason)`.
- **Reason:** Đúng quy tắc 3–4; không có release mồ côi, không ghi đè, không publish trùng.
- **Consequences:**
  - Production bắt buộc chạy MongoDB replica set.
  - Redirect trỏ theo `pageId` và phân giải lúc request, nên không có chuỗi hay vòng redirect.
- **Amended 2026-10-25 (MVP B):**
  - Blocking thêm `consent_not_configured` (ADR-016, ADR-017) và `lead_destination_missing` (ADR-018). Cả hai chỉ áp dụng cho trang có section form.
  - Bước 4 của publish đọc thêm cài đặt dữ liệu cá nhân và phiên bản đồng ý để chụp `leadCapture` (ADR-017) trong cùng transaction.
- **Amended 2026-11-02 (khớp thiết kế màn 05, 06):**
  - **Mục đã đạt về địa chỉ** (màn 05), theo địa chỉ chính của site:
    - Địa chỉ mặc định: "HTTPS hoạt động" (`https_active`), vì nó dùng chứng chỉ wildcard (§6).
    - Tên miền riêng đang `active`: "Tên miền {host} đã xác minh" (`domain_verified`) và "HTTPS hoạt động".
    - Trạng thái khác: không có hai mục này. Đây không phải lỗi chặn hay cảnh báo, vì trang vẫn được phục vụ ở địa chỉ mặc định (ADR-022), và màn 13 đã báo lỗi.
    - Trạng thái tên miền được đọc một lần cho mỗi request, không theo từng trang.
  - **Màn 06:**
    - Bỏ nút chuyển chỉ còn một lựa chọn: không có điểm lưu bản nháp (ADR-005), nên chỉ để tiêu đề "Đã xuất bản · N".
    - Panel rollback thêm dòng "Form trong vN gửi lead về cùng nơi nhận như hiện tại" khi release đích có form, vì nơi nhận lead là cài đặt của site (ADR-018), không nằm trong release.

### ADR-007 — Section registry, composition, theme

- **Date:** 2026-10-24 · **Status:** Accepted
- **Decision:**

  ```ts
  Composition     = { version: 1, sections: SectionInstance[] }
  SectionInstance = { id, type, variant, colorScheme, spacing: 'compact'|'normal'|'spacious',
                      visibility: { desktop: boolean, mobile: boolean },
                      mobileOrder: 'auto'|'media-first', content, samplePaths: string[] }
  defineSection({ type, label, description, category, contentSchema, sampleContent,
                  variants: [{ id, label, hasMedia }], limits, fields, Component })
  ```

  - **Field kinds:** `text`, `textarea`, `link`, `image`, `select`, `boolean`, `list{min,max}`.
  - **Không có HTML trong content:** text là chuỗi thuần; URL chỉ chấp nhận `http:`/`https:`.
  - **7 section:**

    | Section               | Variant                           |
    | --------------------- | --------------------------------- |
    | Thanh điều hướng      | logo/tên site + 1 nút             |
    | Hero                  | Chữ · Ảnh, Căn giữa, Ảnh nền      |
    | Lợi ích               | Lưới 3–6, Xen kẽ ảnh và chữ       |
    | Cảm nhận khách hàng   | Thẻ 3–6, Trích dẫn nổi bật        |
    | Câu hỏi thường gặp    | Hỏi đáp mở rộng, dùng `<details>` |
    | Dải kêu gọi hành động | —                                 |
    | Chân trang            | —                                 |

  - Component là presentational thuần (không fetch, không state). Admin canvas và renderer dùng **cùng** component.
  - Entry `schema` không import React, để API dùng validate.
  - **Theme preset:**
    - Mỗi preset gồm font pair và 4 color scheme.
    - Unit test kiểm tra mọi cặp chữ/nền và nút đạt WCAG AA (4.5:1; 3:1 cho chữ lớn và thành phần UI).
    - Preset đầu tiên lấy màu trang mẫu (teal `#0F5E55`, ink `#0B2E2A`, accent `#F2A33A`).

- **Reason:** Không free styling; một định nghĩa điều khiển validate, property panel, canvas và renderer.
- **Consequences:** Release cũ phải luôn render được. Đổi schema theo kiểu phá vỡ cần `upgrade(content, fromVersion)` áp lúc đọc; release không bao giờ bị viết lại.
- **Amended 2026-10-24 (khi dựng MVP A):**
  - **Đóng gói:** `@plp/sections` được biên dịch bằng `tsc` sang `dist`, và CSS Module được chép kèm. Turbopack không phân giải import `./x.js` → `x.ts` trong source của workspace package, nên cả API, admin và renderer đều dùng `dist`. Hai entry là `@plp/sections/schema` (không React) và `@plp/sections/react`.
  - **Vị trí cố định:** Thanh điều hướng có `position: 'first'`, Chân trang có `position: 'last'`. `validateComposition` từ chối sai vị trí, còn editor không cho kéo hai section này. Nhờ vậy trang luôn có landmark `header`/`main`/`footer`.
  - **Màu và theme:** component chỉ dùng biến CSS `--plp-*` lấy từ color scheme. Theme preset gồm `mint` (Bạc hà), `indigo` (Chàm) và `sunset` (Hoàng hôn); id nằm trong contracts, màu nằm trong sections.
- **Amended 2026-10-25 (sau review MVP A):**
  - **Số mục tối thiểu theo variant:** `list.min` là mức sàn của field; variant có thể nâng lên bằng `listMin`. Lợi ích: Lưới 3–6, Xen kẽ 2–6. Cảm nhận khách hàng: Thẻ 3–6, Trích dẫn nổi bật từ 1 (hiện mục đầu). `validateComposition` cưỡng chế, nên lưu và publish đều từ chối; đổi sang variant cần nhiều mục hơn thì editor thêm mục mẫu.
  - **Field bị variant ẩn vẫn là dữ liệu:** đổi variant giữ giá trị của chúng, nên `collectLeaves(section, { includeHidden: true })` là cách duy nhất để tìm asset được tham chiếu và đánh dấu nội dung mẫu. Kiểm tra publish và panel chỉ xét field variant hiện tại hiển thị.
- **Amended 2026-10-25 (MVP B):** thêm section thứ 8 là Form đăng ký (`lead_form`, nhóm "Form & liên hệ"), mỗi trang tối đa một. Nội dung đồng ý không nằm trong content của section mà được truyền vào component từ `leadCapture` (ADR-016, ADR-017).
- **Amended 2026-10-25 (B2):**
  - Tên type là `lead_form`, theo quy ước snake_case của `sectionTypes`.
  - Section có cờ `capturesLeads`; `RenderContext` có thêm `leadCapture` (bắt buộc) và `leadSubmission` (chỉ trang live).
  - Mỗi color scheme có thêm màu `danger` cho lỗi của form; `themes.spec` kiểm AA trên nền và surface.
- **Amended 2026-10-26 (test toàn dự án):** chữ gợi ý của ô trống trên canvas (tên field) dùng màu `muted`, không làm mờ, nên đạt AA như mọi màu chữ khác (`themes.spec`).
  - Trong nút và trên ảnh của Hero, chữ gợi ý giữ màu của chữ thật ở đó, vì `muted` không đạt AA trên nền đó.
  - Chữ gợi ý in nghiêng, để ô trống không bị nhầm với nội dung đã nhập.
  - `styles.spec.ts` kiểm các quy tắc CSS này.
- **Amended 2026-10-31 (vòng test thứ ba):** server lưu composition đã kiểm tra, không lưu input thô.
  - **`parseComposition`** trả composition đã parse:
    - content của mỗi section là kết quả parse của schema section đó, nên key lạ trong content, nút, link hay mục danh sách bị bỏ;
    - `samplePaths` chỉ giữ đường dẫn tới field chữ và nhãn nút có trong section (kể cả field variant ẩn), mỗi đường dẫn một lần.
  - Autosave, trang tạo theo mục tiêu và publish lưu kết quả này. Publish parse lại bản nháp, nên bản nháp lưu trước thay đổi này cũng không đưa key lạ vào release hay JSON public.
  - **`validateComposition`** chỉ trả danh sách lỗi, không dựng composition đã parse hay `samplePaths`, vì store của editor gọi nó sau mỗi command, kể cả mỗi lần gõ phím. Hai hàm dùng chung một bộ quy tắc (`checkSections`), và test kiểm chúng báo cùng lỗi trên mọi mẫu section, mọi trang tạo theo mục tiêu và các ca lỗi.
  - **Key lạ bị bỏ chứ không bị từ chối,** như mọi body khác của API (mặc định của Zod), nên bản nháp cũ vẫn autosave được. Field bị variant ẩn vẫn được kiểm như mọi field (URL, độ dài, ảnh thuộc site) và vẫn được giữ.
  - Release cũ không bị viết lại; chỉ database dev local có thể còn release mang key lạ.
- **Amended 2026-10-31 (vòng test thứ ba, renderer):**
  - **Breakpoint:** mọi container/media query theo độ rộng dùng cú pháp khoảng (`width < 768px` / `width >= 768px`).
    - Cặp `max-width: 767px` / `min-width: 768px` để hở một khoảng: ở độ rộng lẻ (zoom, thanh cuộn) như 767,5 px, section ẩn trên một loại thiết bị lại hiện trên cả hai.
    - Unit test cấm `min-width`/`max-width` trong CSS của sections và renderer.
  - **Ảnh đầu trang:** ảnh đầu tiên của section đầu tiên trong thân trang (sau thanh điều hướng) tải ngay với `fetchpriority="high"`; mọi ảnh khác giữ `loading="lazy"`. Canvas của admin không đổi.
- **Amended 2026-11-02 (khớp thiết kế màn 04, 09):** chủ sản phẩm yêu cầu làm các thẻ của màn 04 chưa có và chưa ADR nào ghi bỏ.

  | Thẻ ở màn 04     | Cách làm                                       | Nhóm              | Nội dung                                                                                                                                            |
  | ---------------- | ---------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Quy trình 3 bước | variant `steps` của Lợi ích                    | Lợi ích           | Tiêu đề, mở đầu, 3–5 bước đánh số (tiêu đề, mô tả). Ẩn biểu tượng và ảnh của mục                                                                    |
  | Logo đối tác     | section `logos`, variant `row`                 | Bằng chứng xã hội | Tiêu đề (không bắt buộc), 3–12 logo, mỗi logo một ảnh bắt buộc và tên đối tác làm mô tả ảnh. Hiện đơn sắc, tự xuống dòng trên điện thoại            |
  | Trước & sau      | section `before_after`, variant `side_by_side` | Bằng chứng xã hội | Tiêu đề, ảnh trước và ảnh sau (bắt buộc, mỗi ảnh một chú thích), dòng lưu ý (ví dụ "Kết quả có thể khác nhau tùy từng người"). Điện thoại xếp chồng |
  | Gọi / Zalo nhanh | section `quick_contact`, variant `buttons`     | Form & liên hệ    | Tiêu đề, mô tả ngắn, nút gọi (link `phone`) và nút Zalo (link `zalo`), ít nhất một nút                                                              |
  - Logo đơn sắc bằng CSS (`filter: grayscale`), không xử lý ảnh. Mọi màu chữ vẫn qua kiểm tra AA của theme.
  - Ảnh của Trước & sau và Logo đối tác đi qua kiểm tra như mọi ảnh: thiếu ảnh bắt buộc là lỗi chặn, thiếu mô tả là cảnh báo (ADR-006).
  - Vẫn ẩn (§2.1, quy tắc 9): nhóm Bảng giá, "Form + bản đồ", "Section đã lưu".
  - **Chân trang có link chính sách:** release có `leadCapture` (trang có form, ADR-017) thì chân trang luôn hiện "Chính sách quyền riêng tư" trỏ tới `leadCapture.policyUrl`, sau các link người dùng tự thêm và không lặp nếu trùng URL. Canvas dùng cài đặt hiện tại của site, như form. Trang không có form không có link tự động.
  - **Chi tiết khi làm (lát E5):**
    - Variant có `listMax`, cưỡng chế như `listMin` (`too_big`). Variant không chứa nổi số mục hiện có thì bị vô hiệu kèm lý do; không bao giờ bỏ mục.
    - `sampleContent` và `newItem` nhận id variant, nên quy trình mới có chữ mẫu của bước. Mục tiêu "Sản phẩm" dùng variant `steps` như board 02; trang đã tạo không đổi.
    - Nút chỉ gọi, chỉ Zalo: `CtaField.linkKinds` cùng `phoneLinkSchema`, `zaloLinkSchema` trong contracts. `oneButtonRequired` dùng lại mã `required_field_empty`. Một nút "đang dùng" khi nhãn không trống, như mọi nút không bắt buộc.
    - Trước & sau: tiêu đề và hai chú thích bắt buộc, lưu ý không bắt buộc. Logo đối tác: tiêu đề không bắt buộc, ô mô tả ảnh ghi "Tên đối tác" (`ImageField.altLabel`). Logo vẫn đánh dấu "trang trí" được như mọi ảnh.
    - Logo và Trước & sau có `hasMedia: false`, nên không có thứ tự trên điện thoại.
    - Link chính sách ở chân trang mở tab mới, như link của form, và được suy ra từ `leadCapture` lúc render: trang có form đang live hiện nó mà không phải xuất bản lại, không release nào bị viết lại. Chỉ so trùng với link tuyệt đối người dùng thêm.
    - `styles.spec` thêm quy tắc: màu chữ của section chỉ lấy từ vai trò màu đã kiểm AA.
  - **Sửa 2026-11-02 (review giao diện):** variant đặt được tên riêng cho mục danh sách (`SectionVariant.listLabels`): "Quy trình 3 bước" gọi mục là "Bước" ở panel, kiểm tra hợp lệ, kiểm tra xuất bản và tóm tắt ("3 bước"). Danh sách bước giữ `role="list"` và một "Bước N:" ẩn cho trình đọc màn hình. Ảnh bắt buộc chưa chọn có nhắc "Cần chọn ảnh trước khi xuất bản." ngay trong panel; logo thiếu tên báo "chưa có tên đối tác". Variant bị chặn vì số mục có kiểu vô hiệu và lý do ở tooltip.
  - **Sửa 2026-11-02:** `hasMedia` nghĩa là ảnh nằm cạnh chữ và đổi chỗ trên điện thoại. Hero "Ảnh nền" có `hasMedia: false`, nên không còn tùy chọn thứ tự trên điện thoại vốn không có tác dụng. `renderSectionContent` trả `ReactElement | null`, nên thiếu một loại section là lỗi biên dịch.
  - **Sửa 2026-11-02 (review giao diện vòng 2):** thông báo thêm section nói cả loại section và thẻ đã chọn: "Đã thêm Cảm nhận khách hàng “Trích dẫn nổi bật” ở vị trí 3.". Thẻ trùng tên với loại thì chỉ nói một lần.

- **Amended 2026-11-04 (ADR-032, chuyển động):**
  - `Composition` có thêm `motion` (phong cách chuyển động của trang, default "Không hiệu ứng"), và `SectionInstance` có thêm `motion?` (ghi đè của section). Thêm field có default nên `version` vẫn là 1 và release cũ render như trước.
  - `parseComposition` giữ hai field này, bỏ ghi đè rỗng. `SectionVariant` có thêm năng lực chuyển động (`motion: { grid?, accents? }`).
  - Section thứ 12 là Số liệu nổi bật (`stats`, variant `row`, nhóm "Bằng chứng xã hội" của màn 04): tiêu đề không bắt buộc, 2–4 ô { con số tối đa 12 ký tự, ý nghĩa }.
    - Con số là sự thật chỉ doanh nghiệp biết: nó bắt đầu trống và là field bắt buộc, nên xuất bản bị chặn tới khi nhập đủ ("Số liệu 1 … chưa có con số"). AI chỉ viết tiêu đề và ý nghĩa (`AI_NEVER_WRITES`, ADR-031).
    - Ngoài canvas, mỗi con số được vẽ hai lần: một bản `aria-hidden` để nhìn (bản này đếm lên khi trang chuyển động, ADR-032) và một bản ẩn cho trình đọc màn hình, luôn là giá trị thật.
    - Con số đếm lên được khi nó là một số, có thể chia nhóm nghìn, có phần thập phân và chữ trước, sau ("8.000+", "4,9/5", "Top 3", "24/7"); con số khác chỉ xuất hiện như mọi phần.

### ADR-008 — Editor: một store, mọi thay đổi qua command

- **Date:** 2026-10-24 · **Status:** Accepted
- **Decision:**
  - Một Zustand + Immer store giữ `{ draft, baseRevision, selection, device, history, saveState, evaluation }`.
  - **Command:** `addSection`, `removeSection`, `duplicateSection`, `moveSection`, `updateContent`, `setVariant`, `setColorScheme`, `setSpacing`, `setVisibility`, `setMobileOrder`, `updateSeo`, `setSlug`, `select`, `setDevice`. Command được validate với registry trước khi áp.
  - **Bố cục:** cấu trúc trang (trái), canvas (giữa), property panel sinh từ `fields` (phải).
  - **Canvas:** render `PageView` (cùng component với renderer) trong một khung rộng 390/768/100%. Section co giãn bằng **CSS container query** (`container-name: plp-page`) thay cho media query, nên khung hẹp trong admin hiển thị đúng như trên điện thoại.
    - Đã bỏ phương án `<iframe>` + portal: không phải sao chép stylesheet vào iframe, và store vẫn là một.
    - Sửa chữ trực tiếp trên canvas là chữ thuần và gọi cùng `updateContent` với panel.
  - **Sắp xếp và phím tắt:** dnd-kit (keyboard sensor), nút lên/xuống, `Alt+↑/↓`. Undo/redo bằng `Ctrl/⌘+Z` và `Ctrl/⌘+Shift+Z`, tối đa 100 bước.
  - **Autosave:** debounce 1.5 giây.
  - **Rời trang và xung đột:** chặn rời trang khi chưa lưu; khi gặp 409, hiện hộp thoại tải lại, không tự merge.
  - TanStack Query chỉ dùng cho dữ liệu server khác, không nhân bản draft.
- **Reason:** Quy tắc 8; Canvas, cấu trúc trang và panel đọc cùng một store.
- **Consequences:** Một trang chỉ có một người sửa tại một thời điểm.
- **Amended 2026-10-25 (sau review MVP A):**
  - **Back/Forward của trình duyệt** là điều hướng phía client: không có `beforeunload`. Một listener `popstate` được gắn khi module providers gốc nạp, trước khi App Router gắn listener của nó, nên chạy trước. Khi còn thay đổi chưa lưu, editor chặn sự kiện, đặt lại history entry của editor (giữ state của router) và mở hộp thoại rời trang sẵn có.
  - Editor unmount thì lưu ngay thay đổi đang chờ, trừ khi người dùng chọn "Rời trang, bỏ thay đổi".
  - Back/Forward dựng lại màn từ payload router đã cache, có thể cũ hơn server. Editor và màn SEO đọc lại trang một lần khi mount và thay draft khi người dùng chưa sửa gì; đã sửa thì để 409 của lần lưu sau báo xung đột.
- **Amended 2026-10-26 (test toàn dự án):**
  - **Lần đọc lại khi mount chờ các lần lưu đang chạy:** editor và màn SEO đọc lại trang sau khi mọi lần lưu của cùng trang đang chạy trong tab kết thúc, dù thành công hay lỗi.
    - Màn vừa rời (ví dụ Back từ "SEO & chia sẻ") lưu thay đổi đang chờ lúc unmount.
    - Trước đây lần đọc có thể đi trước lần lưu đó và giữ revision cũ, nên lần lưu sau báo xung đột giả.
  - **Canvas hiện đúng chữ của bản nháp sau mỗi lần commit,** kể cả khi giá trị trong store không đổi:
    - chữ gõ quá giới hạn của field bị cắt;
    - khoảng trắng được chuẩn hóa;
    - field bị xóa hết hiện lại chữ gợi ý (Chromium để lại một `<br>`).
    - Trừ khi field vẫn giữ focus (cửa sổ mất focus): chữ đang gõ ở lại tới lần blur thật.
  - **Dữ liệu server trong cache (TanStack Query):**
    - TanStack bỏ qua `initialData` khi key đã có dữ liệu. Vì vậy màn được server render lại (link ở sidebar, mũi tên quay lại của editor) ghi dữ liệu của lần render đó vào cache khi cache cũ hơn (`adoptServerRender`).
    - Quy tắc này áp dụng cho:
      - danh sách trang và hoạt động gần đây (màn 01);
      - trang và lịch sử phiên bản;
      - danh sách lead và lead đang mở;
      - danh sách yêu cầu dữ liệu;
      - số đếm lead và báo cáo "Hiệu quả" (đã có từ trước).
    - Danh sách được thay bắt đầu lại từ trang đầu. Server render lại khi màn vẫn đang hiện (`router.refresh()`) thì giữ các trang "Xem thêm" đã nạp và đọc lại chúng (`adoptServerRenderKeepingPages`). (Sửa 2026-11-02, review vòng 2.)
    - Màn 01 được key theo site, không theo `loadedAt`. Một lần server render với bộ lọc khác bộ lọc đang hiện là một lần điều hướng (link "Trang" ở sidebar khi đang lọc), nên màn bắt đầu lại. Refresh thì màn giữ focus, chữ đang gõ và các trang đã nạp. Refresh sau "Xóa trang" render bộ lọc lúc xóa; bộ lọc người dùng chọn trong lúc chờ vẫn được giữ. Chuỗi tìm kiếm được chuẩn hóa sao cho chuẩn hóa lại không đổi (không kết thúc bằng khoảng trắng hay nửa emoji), để lần đọc lại từ URL khớp với màn.
    - "Xem thêm" và "Tải thêm" chờ lần đọc lại cả danh sách đang chạy rồi mới tải trang tiếp (`fetchNextPageAfterRead`). Mặc định TanStack hủy lần đọc lại đó và nối trang mới vào các dòng cũ, nên một dòng vừa xóa sẽ còn trên màn.
    - Quy tắc so `dataUpdatedAt` của cache (đồng hồ trình duyệt) với `loadedAt` của server, nên đồng hồ trình duyệt lệch nhiều thì có thể chọn sai.
    - Mỗi lần lưu bản nháp thành công, và "Quay về bản live", đánh dấu danh sách trang và các màn của trang đó là cũ. Đổi giao diện site trong editor đánh dấu danh sách trang và màn của mọi trang.
      - Màn đang hiện được đọc lại ngay; màn khác được đọc lại khi hiện ra, kể cả khi nút Back của trình duyệt dựng lại một bản render cũ hơn cache.
      - Editor và màn SEO không hiện các màn đó, nên lưu ở đó không đọc thêm gì.
  - **Màn SEO lưu xong rồi mới cho rời đi,** như các link ở header của nó:
    - Mọi link trên trang (kể cả sidebar, nằm ngoài màn) và nút Back/Forward của trình duyệt đều chờ lần lưu.
    - Lưu lỗi thì ở lại, thay đổi vẫn còn, kèm thông báo có nút "Rời trang, bỏ thay đổi", vì có lần lưu không bao giờ thành công (đã đăng xuất ở tab khác, bị hạ quyền). Xung đột revision thì mở hộp thoại tải lại, không báo lỗi.
    - Mỗi màn chỉ giữ một lần rời trang đang chờ: bấm thêm link, Back hay Forward trong lúc lưu chỉ đổi đích, nên người dùng rời đi đúng một lần, tới nơi được chọn sau cùng. Màn bị unmount trước khi lưu xong thì không theo lần rời trang cũ nữa.
    - Màn chỉ chặn hành vi mặc định của link, không chặn sự kiện lan tiếp: handler của chính link vẫn chạy (drawer điều hướng trên điện thoại tự đóng), còn `Link` của Next thấy `defaultPrevented` nên không tự điều hướng.
    - Click có phím bổ trợ, link mở tab mới, link tải xuống, link sang origin khác và link `#` trong cùng trang đi như bình thường, không chờ lưu.
    - Lý do: lần lưu gửi lúc unmount tới sau khi màn kế tiếp đã đọc trang, nên màn đó hiện trạng thái cũ; và nếu lần lưu đó lỗi thì thay đổi mất mà không ai biết.
    - Sidebar có bốn chỗ điều hướng bằng code, không qua link: đổi workspace, đổi site, "Tạo site mới" và "Đăng xuất". Ba chỗ đầu vẫn lưu thay đổi đang chờ lúc unmount như trước. Với "Đăng xuất", session đã bị xóa trước khi màn unmount, nên lần lưu đó trả 401 và thay đổi đang chờ bị mất.
    - Khi đọc lại trang (sau xung đột lúc gỡ xuất bản, hoặc sau khi đổi giao diện site trong editor) mà thấy bản nháp đã đổi trên server và màn không còn gì để lưu, store chuyển sang trạng thái xung đột để hộp thoại tải lại mở ngay, thay vì chờ một lần lưu có thể không bao giờ tới.
- **Amended 2026-10-31 (vòng test thứ ba):**
  - **Đường dẫn đang được kiểm tra cũng là thay đổi chưa lưu.**
    - Đường dẫn gõ ở màn SEO chỉ vào bản nháp sau 400 ms nghỉ gõ và khi server xác nhận còn trống; trước đó store vẫn ở trạng thái đã lưu.
    - Khi rời màn (link, Back/Forward, đóng tab), đường dẫn mà ô đang giữ nhưng chưa vào bản nháp được coi là chưa lưu. Màn kiểm tra ngay (không chờ hết 400 ms), chờ kết quả và lần lưu, rồi mới rời đi.
    - Đường dẫn bị từ chối hoặc không kiểm tra được thì ở lại, báo "Chưa lưu được đường dẫn trang", kèm nút "Rời trang, bỏ thay đổi".
    - Wizard tạo trang và hộp thoại "Bắt đầu trống" gửi đường dẫn cùng yêu cầu tạo trang và server kiểm tra lại, nên không cần chờ.
  - **Điều hướng bằng code ở sidebar cũng lưu trước** (thay câu về bốn chỗ điều hướng bằng code ở trên):
    - Đổi workspace, đổi site, "Tạo site mới" và "Đăng xuất" rời màn qua màn đang hiện (`screen-leave`). Màn lưu xong mới cho đi, và vẫn chỉ giữ một lần rời trang đang chờ.
    - Lưu lỗi thì ở lại, kèm nút bỏ thay đổi ("Đăng xuất, bỏ thay đổi" khi đăng xuất).
    - Cookie chọn workspace chỉ được ghi khi người dùng thật sự rời đi. Đăng xuất nhận 401 (phiên đã hết) vẫn mở trang đăng nhập.
  - **Đổi workspace tải lại cả trang** (`window.location.assign('/')`, sau khi màn đang hiện lưu xong và cookie chọn workspace đã ghi): không dữ liệu nào của các site thuộc workspace cũ (lead, "N mới") còn trong bộ nhớ hay hiện lại từ cache khi quay lại.
    - Trước đây sidebar gọi `queryClient.clear()` rồi `router.push('/')` trong khi màn cũ còn mount: các query đang mount dựng lại và tải lại dữ liệu của workspace cũ, nên màn nháy lên trước khi rời đi.
    - Đổi site vẫn là điều hướng phía client và giữ cache của workspace.
    - **Không hộp thoại "Rời khỏi trang?" nào hiện sau khi cookie chọn workspace đã ghi:** màn chỉ cho sidebar đi khi đã lưu xong hoặc khi người dùng chọn rời trang không lưu, và lúc đó `beforeunload` không hỏi (amendment 2026-11-01, rời trang không lưu). Trước đây hộp thoại đó vẫn hiện; người dùng bấm ở lại thì vẫn ở workspace cũ trong khi cookie đã chọn workspace mới.
  - **Đọc lại tóm tắt trang** (sau khi đổi giao diện site, sau xung đột lúc gỡ xuất bản):
    - lấy cả tóm tắt và checks từ cùng một lần đọc;
    - chờ các lần lưu đang chạy của trang;
    - bỏ qua câu trả lời cũ hơn store thay vì báo xung đột.
- **Amended 2026-10-31 (vòng test thứ ba, a11y):** thanh công cụ của section đang chọn và nhãn "Thiếu mô tả ảnh" nằm đè lên nội dung của section. Ở 1440 px thanh công cụ che nút của thanh điều hướng; trên khung thu nhỏ (điện thoại) chúng che cả dòng chữ.
  - Khi một chữ của section đang được sửa (focus trong ô sửa trên canvas), hai thứ này trong suốt và không nhận click, nên chữ đang sửa luôn hiện ra (WCAG 2.4.11).
  - Chúng vẫn ở trong thứ tự Tab: Shift+Tab từ chữ đưa focus lên thanh công cụ và nó hiện lại.
- **Amended 2026-11-01 (vòng test thứ ba):** link trong cùng trang không phải là rời màn.
  - Chromium, Firefox và WebKit đều bắn `popstate` khi bấm link `#…` trong trang (skip link "Bỏ qua điều hướng" tới `#main-content`), và khi Back giữa hai mục chỉ khác fragment.
  - Guard của Back/Forward chỉ coi `popstate` là rời màn khi đường dẫn hoặc query khác với entry của màn (URL ghi lại khi màn bắt đầu có thay đổi chưa lưu). Cùng đường dẫn và query thì, dù fragment là gì, người dùng vẫn ở tài liệu này và guard để sự kiện đi qua (`isSameDocument`).
  - Trước đây, ở màn SEO hay editor còn thay đổi chưa lưu, skip link bị coi là Back: guard đẩy lại entry của màn, lưu rồi `history.back()`. Kết quả là thừa một entry lịch sử, và nếu lưu lỗi thì có cả toast "Rời trang, bỏ thay đổi".
  - E2E kiểm trên màn SEO còn thay đổi chưa lưu (lưu đang lỗi):
    - skip link thêm đúng một entry và đưa focus vào nội dung chính;
    - Back về URL của màn không có fragment: lịch sử không tăng, entry của skip link vẫn ở phía trước (Forward về lại `#main-content`), không hộp thoại, không toast;
    - sau "Thử lại", thay đổi được lưu.
- **Amended 2026-11-01 (vòng test thứ ba, rời trang không lưu):**
  - **"Rời trang, bỏ thay đổi"** (hộp thoại của editor, nút trên toast của màn SEO, kể cả "Đăng xuất, bỏ thay đổi") nghĩa là: lần rời trang này không chờ lưu, không hỏi và không lưu trên đường đi những thay đổi đang có lúc bấm. Không hơn.
  - **Store ghi phiên bản bản nháp bị bỏ, `leavingWithoutSaving`:** `draftVersion` lúc bấm, hoặc `null`. Cờ chỉ có hiệu lực khi `draftVersion` vẫn bằng nó (`isLeavingWithoutSaving`).
    - `discardFor(leave)` của saver ghi phiên bản khi lần rời trang bắt đầu, và xóa khi lần đó báo `'stayed'` hoặc ném lỗi. Lần rời trang báo `'leaving'` thì phiên bản giữ nguyên, kể cả khi màn không unmount (nút bỏ thay đổi trên toast của màn SEO trỏ tới chính URL đang mở).
    - Thay đổi mới tăng `draftVersion` nên tự kết thúc cờ: thay đổi đó được hỏi, autosave và lưu lúc unmount như thường. Lần lưu đó gửi cả bản nháp, gồm cả các thay đổi đã bỏ trước đó.
    - Khi cờ có hiệu lực, `leavingLoses` trả false: `beforeunload` không hỏi, guard của Back/Forward để sự kiện đi qua, màn SEO và editor cho mọi lần rời trang khác đi ngay, kể cả khi đường dẫn còn đang chờ kiểm tra.
    - Saver không lưu lúc dừng (màn unmount) khi cờ có hiệu lực.
  - **Hẹn giờ của saver:**
    - `discardFor` hủy hẹn giờ debounce và hẹn giờ thử lại khi bắt đầu, và saver không hẹn lần thử lại nào khi cờ có hiệu lực: lần thử lại không ghi các thay đổi đã bỏ vào bản nháp trong lúc đăng xuất chậm.
    - Lần rời trang báo `'stayed'` hoặc ném lỗi thì saver hẹn lại một lần lưu nếu còn thay đổi chưa lưu, với đủ số lần thử lại, nên autosave chạy tiếp mà không cần sửa gì thêm. Chính bản nháp server đã từ chối hẳn (422, 401, 403, 404…) thì không gửi lại, vì sẽ lỗi y như vậy; bản nháp đã đổi kể từ lần từ chối đó thì được gửi. Lỗi 408 được thử lại như lỗi server; 429 thì không, vì các lần thử lại không chờ theo `Retry-After`. Ngoài lúc rời trang cũng vậy: thay đổi gõ trong lúc một lần lưu đang chạy, nếu lần lưu đó bị từ chối hẳn, được gửi ngay sau đó, không đợi lần sửa kế tiếp.
  - **Lần lưu đang chạy lúc bấm thì chạy tới hết,** kể cả phần thay đổi đến trong lúc nó chạy, và bản nháp giữ các thay đổi đó. Chấp nhận được: đó là bản nháp, trang live không đổi (quy tắc 1), và không mất dữ liệu.
  - `ensureSaved`, "Thử lại", xuất bản, xem trước và "Quay về bản live" không xét cờ: chúng luôn lưu.
  - Tab của chính màn đang mở (tab có `aria-current`, kể cả khi URL có `?focus=`) và link tới đúng tài liệu đang mở (cùng đường dẫn và query, `isSameDocument`) không phải là rời trang: không lưu trước, không có lối thoát bỏ thay đổi. Lần rời trang khác đang chờ lưu bị hủy, vì nơi người dùng chọn sau cùng là màn này. Link tới cùng màn với query khác (`?focus=title`) vẫn được đi, sau khi lưu.
  - Màn SEO vẫn giữ một lần rời trang đang chờ lưu. Nút bỏ thay đổi trên toast xóa lần đang chờ đó rồi mới rời đi, nên người dùng rời đi một lần, tới đích của nút vừa bấm.
  - **Kết quả của "Đăng xuất"** (`useLogout`):
    - Chỉ lỗi của chính request đăng xuất (session vẫn còn) là `'stayed'`, kèm toast "Chưa đăng xuất được".
    - Sau khi request thành công: xóa cache, `router.replace('/login')`, rồi `router.refresh()`. Bước nào lỗi thì được báo (`reportUnexpected`) và không cản việc mở trang đăng nhập.
    - `router.replace('/login')` ném lỗi thì báo lỗi rồi tải lại cả trang tới `/login` (`loadPage`); kết quả vẫn là `'leaving'`.
    - Tải trang cũng lỗi thì báo lỗi, hiện toast danger "Bạn đã đăng xuất" ("Không mở được trang đăng nhập. Hãy tải lại trang.") và trả `'stayed'`: màn giữ thay đổi, lưu và hỏi lại như thường.
  - **Chấp nhận như hiện tại:**
    - Các lần rời trang chồng nhau dùng chung cờ: lần nào báo `'stayed'` cũng xóa cờ của các lần kia và cho autosave chạy lại. Hệ quả: trình duyệt có thể hỏi một lần trước khi lần kia tải lại trang; bản nháp có thể giữ các thay đổi lần kia định bỏ; một lần lưu lúc unmount sau khi đã đăng xuất có thể nhận 401. Trang live không đổi.
    - Thay đổi gõ trong lúc request đăng xuất đang chạy không thuộc phần đã bỏ, nên màn lưu nó lúc unmount; khi đăng xuất đã xong, lần lưu đó nhận 401 và thay đổi đó mất. Cửa sổ này chỉ dài bằng một request.
    - Khi cả `router.replace` lẫn `loadPage` đều lỗi, tải lại trang như toast hướng dẫn có thể gặp hộp thoại rời trang của trình duyệt, vì màn vẫn còn thay đổi không lưu được.
    - Fallback `loadPage('/login')` có thể làm trình duyệt hiện hộp thoại rời trang của nó khi đăng xuất không đi qua `discardFor` mà màn còn thay đổi chưa lưu.
    - `refocus` của `Alt+↑/↓` (`use-editor-shortcuts.ts`) chỉ trả focus khi focus đã rơi về `body`: trình duyệt đưa focus về đó khi phần tử đang focus bị gỡ hoặc bị vô hiệu hóa.

### ADR-009 — Renderer: phân giải, cache, revalidation

- **Date:** 2026-10-24 · **Status:** Accepted
- **Decision:**
  - **Phân giải:**
    - Renderer đọc `Host`; chỉ tin `x-forwarded-host` khi `TRUST_PROXY=true`.
    - Cắt `{subdomain}.{BASE_DOMAIN}`, rồi gọi `GET /public/sites/:subdomain/pages?slug=`.
    - API trả DTO public, chỉ lấy từ release mà `publishedSlug` trỏ tới, không có trường nội bộ.
    - Không có trang thì tra redirect và trả 308; không có cả hai thì trả 404.
  - **Cache:**
    - `'use cache'` + `cacheTag(siteCacheTag(subdomain))` trên lớp lấy dữ liệu, cộng `cacheLife` làm TTL an toàn 5 phút.
    - Tag theo subdomain, vì subdomain bất biến và kết quả 404 cũng phải được làm mới khi một trang mới lên live. Mỗi lần dời pointer làm mới cả site, gồm redirect, link nội bộ và sitemap.
    - Renderer gọi `revalidateTag(tag, { expire: 0 })`. Profile `'max'` sẽ trả nội dung cũ cho request đầu tiên sau publish, vi phạm quy tắc 5.
    - Sau mỗi lần dời pointer, API gọi `POST {renderer}/api/revalidate`, ký HMAC-SHA256 với timestamp có cửa sổ 5 phút.
  - **Lỗi revalidate:** retry một lần. Vẫn lỗi thì log, ghi activity và trả `revalidation: 'failed'` để UI báo rõ.
- **Reason:** Quy tắc 5.
- **Consequences:** Cache nằm trong từng instance renderer; scale ngang sẽ cần shared cache handler.
- **Amended 2026-10-25 (khi tích hợp MVP A):**
  - Next 16 render `notFound()` ném ra trong page thành một tài liệu lỗi rỗng; giao diện 404 chỉ hiện sau khi hydrate, nên khách tắt JavaScript thấy trang trắng.
  - Vì vậy `proxy` của renderer hỏi `GET /public/sites/:subdomain/path-status?path=` trước khi render. Endpoint này nhẹ, không cache và không trả dữ liệu trang. Không có trang live hay redirect thì proxy rewrite sang trang not-found dựng sẵn, giữ status 404.
  - Page vẫn tự quyết định từ `getResolved` có cache. Bước kiểm tra lỗi thì proxy log rồi để page render, nên API lỗi không làm hỏng trang đang có trong cache.
  - Hệ quả: mỗi lượt xem trang public tốn thêm một truy vấn nhẹ tới API.
  - **Khóa cache theo release đang live:**
    - E2E cho thấy request ngay sau rollback hoặc undo đôi khi nhận bản cũ, dù webhook đã chạy xong và API đã trả bản mới. `'use cache'` của Next 16 có đường dùng lại kết quả mà không đối chiếu tag, chẳng hạn khi một request "nhập" vào lần đọc cùng khóa còn dang dở.
    - Vì vậy `path-status` trả thêm `releaseId` của trang live. Proxy chuyển giá trị này cho page qua request header nội bộ `x-plp-live-release` và luôn xóa header cùng tên do client gửi. `getResolved` nhận nó làm một phần khóa cache.
    - Pointer dời thì khóa đổi, nên nội dung trang không phụ thuộc thời điểm revalidate. Tag theo subdomain vẫn làm mới phần dùng chung: link nội bộ, redirect và sitemap. Theme, logo và tên site nằm trong release (ADR-015), nên đi theo khóa này.
    - Hệ quả: khi bước kiểm tra của proxy lỗi, page quay về khóa chỉ theo tag như trước. Sitemap và robots vẫn chỉ dùng tag, nên vẫn có thể cũ trong khoảnh khắc nếu đúng lúc đó có một lần đọc sitemap còn dang dở.
  - **Redirect cũng do proxy trả (sau review MVP A):**
    - Next 16 chỉ render page ở chế độ blocking cho request có `User-Agent` (`htmlLimitedBots` bị bỏ qua khi thiếu header này). Không có nó, `permanentRedirect` trong page thành một shell 200 không có `Location`.
    - Vì vậy `path-status` trả thêm `location` cho `kind: 'redirect'`, và proxy trả 308 trước khi render, chung một truy vấn với kiểm tra 404.
    - `permanentRedirect` trong page chỉ còn là đường dự phòng khi bước kiểm tra của proxy lỗi.
- **Amended 2026-10-25 (MVP B):**
  - DTO public có thêm `releaseId` để form gửi kèm release khách đang xem (ADR-016). Id không mở quyền truy cập nào (ADR-003).
  - Renderer có thêm hai route không cache: `POST /_lead` (gửi form, ADR-016) và `POST /_e` (beacon, ADR-019). Cả hai gọi API qua kênh ký HMAC của ADR-016.
- **Amended 2026-10-31 (vòng test thứ ba):**
  - **API lỗi hoặc treo:**
    - Đo trên renderer thật, mọi request trang (đã cache hay chưa, có hay không User-Agent) đều treo không kết thúc.
    - Nguyên nhân: bước kiểm tra của proxy lỗi nên page render với khóa `''`, khóa này không có trong cache. Lookup lỗi, và Next 16 gửi status 500 nhưng không đóng body khi metadata và page cùng chờ một lời gọi `'use cache'` ném lỗi.
    - Vì vậy câu "API lỗi không làm hỏng trang đang có trong cache" của amendment 2026-10-25 không đúng.
  - **Proxy trả 503** kèm `Retry-After: 60`, `Cache-Control: no-store` và trang HTML tiếng Việt dựng sẵn ("Trang tạm thời chưa mở được") khi không hỏi được `path-status`; trang không render.
  - **Hàm `'use cache'` không bao giờ ném lỗi:** lỗi được log rồi trả về dưới dạng giá trị với `cacheLife` bằng 0, hàm gọi bên ngoài ném lỗi. Page kết thúc bằng 500 ngay; request kế tiếp hỏi lại API.
  - **Hệ quả:**
    - Khi API không trả lời `path-status`, trang không được phục vụ từ cache.
    - Khi `path-status` trả lời mà `resolve` lỗi, entry còn trong `revalidate` (5 phút) vẫn được phục vụ. Quá hạn đó Next tạo lại ngay trong request nên khách nhận 500, vì page không tự trả 503 được.
  - **Thời gian chờ:** kiểm tra của proxy 3 giây; lookup của page, sitemap và robots 5 giây. Khách chờ API tối đa 8 giây (trước đây 10 + 10).
  - **sitemap.xml và robots.txt:** API lỗi thì trả 503 kèm `Retry-After` (trước đây 500, body rỗng).
  - **User-Agent:** proxy đặt `User-Agent: unknown` cho request không có header này, nên Next luôn render chế độ blocking: status lỗi là thật, không còn shell 200.
  - **404 của proxy** render với cùng header như trang. Trước đây request không có User-Agent nhận bản tĩnh `Cache-Control: s-maxage=31536000`, nên cache dùng chung sẽ giữ 404 cả năm sau khi trang được publish.
- **Amended 2026-11-02 (vòng test sau D2):** `sitemap.xml` đọc thẳng API, không cache.
  - Không có gì khóa sitemap theo nội dung đang live như trang (amendment 2026-10-25), nên entry gắn tag có thể sống qua một lần publish khi webhook revalidate bị mất hoặc một lần đọc cũ còn dang dở. E2E bắt được: sau khi publish bản `noindex`, sitemap vẫn còn trang đó trong khoảng 2/10 lượt chạy toàn bộ.
  - Crawler ít hỏi sitemap, và API trả nó bằng truy vấn có giới hạn. Robots vẫn cache theo tag: nó chỉ đổi khi địa chỉ chính đổi.
- **Amended 2026-10-31 (vòng test thứ ba, E2E):** trang live gọi `await connection()` trước khi sinh `submissionId` của form (ADR-016).
  - Với `cacheComponents`, Next render trang thêm một lần dưới dạng prerender và gặp `crypto.randomUUID()` ở đó, nên mỗi lượt xem trang có form ghi một dòng lỗi "unstable value … while prerendering" vào log. Trang preview đã làm như vậy từ trước.
  - Mỗi lần phục vụ trang vẫn có id riêng.
  - E2E chạy thêm một renderer ở cổng 3102, cùng bản build, trỏ tới một địa chỉ API không có gì lắng nghe. Spec kiểm trang, preview (`noindex`), sitemap và robots trả 503 kèm `Retry-After: 60`.

### ADR-010 — Preview link có chữ ký

- **Date:** 2026-10-24 · **Status:** Accepted
- **Decision:**
  - **Token:** JWS HS256 (jose) chứa `{ kind: 'draft', pageId } | { kind: 'release', releaseId }`, cộng `siteId`, `workspaceId`, `exp` (mặc định 7 ngày) và `kid`.
  - **URL:** `{subdomain}.{BASE_DOMAIN}/_preview/{token}`. Draft hiển thị **bản nháp mới nhất**.
  - **Header phản hồi:** `no-store`, `X-Robots-Tag: noindex, nofollow`, meta noindex, `Referrer-Policy: no-referrer`.
  - **Giao diện:** banner "Bản xem trước".
- **Reason:** Quy tắc 6; chia sẻ cho khách hàng mà không cần đăng nhập.
- **Consequences:** Link không thu hồi riêng lẻ được trước hạn; xoay khóa thì mọi link mất hiệu lực.
- **Amended 2026-10-31 (vòng test thứ ba):** proxy kiểm tra token trước khi render (`previewStatusForHost`: token hợp lệ và thuộc site của host).
  - Token hết hạn, sai `kid`, sai chữ ký hay của site khác: rewrite sang trang not-found dựng sẵn, status 404, `X-Robots-Tag: noindex, nofollow`. Câu tiếng Việt có sẵn trong HTML nên đọc được khi tắt JavaScript.
  - Trước đây thông báo chỉ hiện sau hydrate, và request không có User-Agent nhận 200.
  - Lượt kiểm tra trạng thái của proxy lỗi (API không trả lời, hết giờ, 5xx): 503 `noindex` kèm `Retry-After: 60`, do proxy dựng.
  - **Proxy chỉ hỏi trạng thái của token:** `GET /public/preview/:token/status` (contract `publicPreviewStatusResponseSchema`, thêm mới, không đổi contract cũ) kiểm token, site của token và việc trang hay release còn thuộc site đó (chỉ đọc `siteId`), rồi trả `{ kind, subdomain }`. Không nạp bản nháp, release hay asset. Cùng 404, `no-store` và `noindex` như endpoint đầy đủ.
    - Page nạp preview đầy đủ đúng một lần (`GET /public/preview/:token`) khi lần nạp đó thành công.
    - Trước đây mỗi lần xem preview gọi endpoint đầy đủ hai lần (proxy rồi page): gấp đôi việc của API.
  - **Lần nạp đầy đủ của page lỗi sau khi kiểm tra trạng thái đã qua thì trả 500, không phải 503:** page của Next không đặt được status 503. Phản hồi 500 đó vẫn có `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store` và `Referrer-Policy: no-referrer` (header của `next.config.ts` theo đường dẫn `/_preview/…`), cùng `<meta name="robots" content="noindex">` do Next tự thêm vào trang lỗi. Đã kiểm bằng bản build của renderer với một API giả trả lời lượt kiểm tra trạng thái và trả 500 cho lần nạp đầy đủ. Khi lỗi như vậy, Next gọi lần nạp đầy đủ hai lần.

### ADR-011 — SEO, slug, redirect, sitemap, robots, tên miền mặc định

- **Date:** 2026-10-24 · **Status:** Accepted
- **Decision:**
  - **Slug:** chữ thường không dấu, số và `-`; `""` là trang chủ. Cấm `_preview`, `api`, `sitemap.xml`, `robots.txt`.
  - **Sitemap và robots:** sinh theo host, chỉ gồm trang live không noindex.
  - **Meta:** OG/Twitter lấy từ `release.seo`, tên site và ảnh chia sẻ mặc định lấy từ `release.sitePresentation` (ADR-015); canonical là `{subdomain}.{BASE_DOMAIN}/{slug}`.
  - **Màn 08:** chỉ hiển thị tên miền mặc định. Subdomain không đổi được sau khi tạo.
- **Reason:** Quy tắc 7.
- **Consequences:** Custom domain sẽ cần bảng `domains` và mở rộng phân giải host.
- **Amended 2026-10-25 (sau review MVP A):**
  - Slug bị cấm là mọi đường dẫn mà renderer hoặc Next tự trả lời: `_preview`, `_next`, `api`, `healthz`, `index` (Next coi là `/`), `404`, `500`, `sitemap.xml`, `robots.txt`, `favicon.ico`. Một trang publish ở các slug này sẽ không bao giờ hiện ở URL của nó.
  - Unit test của renderer đối chiếu danh sách này với các route cấp một của app, nên route mới không thể che một slug publish được.
- **Amended 2026-10-25 (MVP B):** thêm `_lead` và `_e` vào danh sách slug bị cấm (ADR-016, ADR-019).
- **Amended 2026-10-26 (test toàn dự án):**
  - **Redirect 308 của slug cũ giữ query của khách** (utm, `gclid`, `fbclid`), ở proxy và ở trang dự phòng. Quảng cáo và link đã chia sẻ trước khi đổi slug vẫn giữ nguồn chiến dịch.
  - **`lastmod` trong sitemap** là lúc nội dung đó bắt đầu live:
    - Với publish: lúc tạo release.
    - Với rollback hoặc undo đưa trang về một release cũ hơn: lúc con trỏ được chuyển.
    - Đọc sự kiện con trỏ mới nhất của mọi trang live trong một aggregation, nên `lastmod` không bao giờ lùi lại.
  - **"Xem site live"** mở trang chủ khi trang có slug rỗng đang live, nếu không thì mở trang được publish gần nhất. Nút ẩn khi site chưa có trang nào live. API trả địa chỉ này trong `liveSiteUrl` của danh sách trang.
  - **Tra trang live theo slug** (renderer phân giải trang, mỗi lượt xem được chuyển tiếp) truy vấn kèm `$type: 'string'`.
    - MongoDB chỉ dùng index partial khi truy vấn kéo theo điều kiện của index đó. Nhờ vậy `pages_published_slug_unique` phục vụ tra cứu bằng một lần dò.
    - Trước đây tra cứu đọc mọi trang của site.

### ADR-012 — Asset

- **Date:** 2026-10-24 · **Status:** Accepted
- **Decision:**
  - **Upload:** đi qua API (multipart, ≤ 10 MB). Chỉ nhận `jpeg`, `png`, `webp`, `avif`, `gif`, nhận diện bằng magic bytes. Kích thước đọc bằng `sharp`.
  - **Lưu trữ:** storage tương thích S3; public chỉ prefix `public/`.
  - **Alt:** bắt buộc `alt` hoặc `decorative`.
  - Không có API xóa asset trong MVP A.
- **Reason:** Validate tập trung một chỗ.
- **Consequences:** Băng thông upload đi qua API; SVG bị loại để tránh script.
- **Amended 2026-10-26 (test toàn dự án):** ảnh tải lên được mã hóa lại trước khi lưu.
  - Bỏ hết metadata: EXIF, XMP, IPTC, tức vị trí GPS, máy chụp, tác giả, thời gian chụp. Ai cũng tải được ảnh public, nên ảnh không được tiết lộ chụp ở đâu, khi nào, bởi ai.
  - Ảnh được xoay theo hướng EXIF, giữ ICC profile và mọi khung của ảnh động.
  - JPEG chất lượng 90 (mozjpeg), WebP 90, AVIF 70. PNG không mất dữ liệu; màu của GIF có thể lệch rất nhẹ khi bảng màu được tính lại.
  - Ảnh có cạnh dài hơn 2560 px được thu nhỏ, giữ tỉ lệ (như ngưỡng "big image" của WordPress). Đủ cho ảnh tràn màn hình lớn, và trang nhẹ hơn vì renderer phục vụ đúng file đã lưu.
  - `bytes`, `width`, `height` là của ảnh đã lưu.
  - JPEG thiếu phần cuối, mà trình duyệt vẫn hiển thị được, vẫn được nhận.
  - **Giới hạn pixel:** tối đa 25 megapixel, tính cả mọi khung của ảnh động.
    - Số pixel đọc từ header. Ảnh vượt giới hạn trả 413 trước khi được giải mã.
    - Lý do: giải mã tốn bộ nhớ theo số pixel, không theo dung lượng file. Một file AVIF 1 KB có thể mô tả 64 triệu pixel và làm API dùng hơn 1,5 GB.
  - **Mỗi tiến trình API mã hóa lại một ảnh một lúc;** tối đa 8 ảnh chờ, ảnh tiếp theo nhận 429.
    - AVIF 25 megapixel vẫn tốn khoảng 0,5 GB lúc giải mã, nên production cần ít nhất 1 GB RAM cho API.
    - Một ảnh JPEG 12 MP mất dưới 1 giây; AVIF có thể mất vài giây.
- **Amended 2026-10-31 (vòng test thứ ba):** integration test kiểm bucket đang chạy bằng client ẩn danh.
  - Đọc được object dưới `public/`, không đọc được object ngoài `public/`.
  - Không liệt kê được: ListObjects v1/v2, prefix, versions, uploads, HEAD bucket.
  - Không đọc được policy, ACL, CORS, location.
  - Không PUT hay DELETE được, kể cả dưới `public/`.
  - Storage production phải giữ đúng chính sách này.
- **Amended 2026-11-02 (ADR-030, lát G2):** ảnh của template của workspace nằm ở `public/{workspaceId}/templates/`, ngoài tiền tố của mọi site, và được chép bằng `CopyObject` (`AssetStorage.copy`), không tải lại qua API. Trang tạo từ mẫu và bản nháp áp mẫu nhận bản chép thành asset của chính site đó.

### ADR-013 — Boundary, lỗi, logging, quality gate

- **Date:** 2026-10-24 · **Status:** Accepted
- **Decision:**
  - **API module:** `auth`, `workspaces`, `sites`, `pages`, `publishing`, `assets`, `activity`, `preview`, `public-delivery`, `health`, `shared`. Controller mỏng.
  - **Validate:** Zod ở mọi boundary (body, query, params, env, phản hồi public). Env của mỗi app được validate lúc khởi động (fail fast).
  - **Lỗi:** `application/problem+json { code, title, status, detail, issues[{ path, code, message }], requestId }`.
  - **Logging:** nestjs-pino; `x-request-id` được nhận hoặc sinh mới và trả lại; cookie và authorization bị redact.
  - **Gate:** `format:check`, `lint`, `typecheck`, `test:unit`, `test:int`, `build`, `test:e2e`, `governance`.
- **Reason:** Quy tắc 9.
- **Consequences:** Integration test chạy trên MongoDB replica set thật từ docker compose (local và CI); mỗi file test dùng một database riêng rồi xóa.
- **Amended 2026-10-25 (MVP B):**
  - Thêm module `privacy`, `leads`, `notifications`, `analytics`.
  - Log redaction phủ cả body của `POST /public/sites/:subdomain/leads` và route `/_lead` của renderer; test kiểm tra không có trường nào của lead xuất hiện trong log.
- **Amended 2026-10-26 (test toàn dự án):**
  - **Log của request:** test dùng chính cấu hình logger của app và ghi log vào bộ nhớ.
    - Test kiểm các giá trị sau đều bị che: cookie và `set-cookie`, `authorization`, `x-plp-client-ip`, `x-plp-client-ua`, chữ ký renderer, token preview trong đường dẫn, và `q` trong URL, query và `Referer`.
    - Không giá trị nào của lead xuất hiện trong log.
  - **TTL index:** một integration test liệt kê đúng tập collection có TTL index trên `expiresAt`: `sessions`, `login_attempts`, `leads`, `lead_limits`, `analytics_salts`, `analytics_seen`, `analytics_daily`.
    - Thêm collection tự xóa thì phải sửa test này cùng lúc.
    - TTL index lỡ thêm vào collection không được xóa (release, activity…) cũng bị phát hiện.
  - **Governance:** dependency-cruiser phân giải các package của workspace về source qua `tsconfig.governance.json`. Nhờ vậy import qua tên `@plp/*` không còn biến mất khỏi đồ thị.
    - `scripts/check-governance.mjs` kiểm:
      - cấu hình trỏ đúng file đó;
      - mọi export vào `dist/` có path tới đúng file nguồn;
      - không có file `.tsx` trong `packages/sections/src/schema`.
    - Quy tắc "API không có React" và "schema không có React" xét cả chuỗi import, cả import chỉ lấy type và cả file `.tsx`.
    - `@plp/contracts` không import package nào khác của workspace; chỉ admin và renderer import `@plp/sections/react`.
  - **Lint:** luật React hooks áp dụng cả cho code React dùng chung (`packages/sections/src/react`, `packages/ui`).
- **Amended 2026-10-31 (vòng test thứ ba):** header của admin (`next.config.ts`, `http-headers.ts`).
  - Mọi phản hồi có `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin` và `X-Content-Type-Options: nosniff`; không gửi `X-Powered-By`.
  - `Strict-Transport-Security: max-age=31536000` chỉ khi `COOKIE_SECURE=true` (đọc lúc build như rewrite, mặc định true như API).
  - Trang gửi `Cache-Control: no-store` (trừ `/_next/static`), nên Back sau khi đăng xuất phải hỏi lại server.
  - Next không gắn header của admin vào phản hồi của rewrite `/api` (proxy ra ngoài). Vì vậy API tự gửi `X-Content-Type-Options: nosniff` trên mọi phản hồi, kể cả file CSV và lỗi 400/413 của body parser (middleware này đứng đầu, trước body parser), và `no-store` cho dữ liệu cá nhân.
  - Chưa có CSP đầy đủ (`script-src` với nonce): cần nonce sinh trong middleware, để sau.
- **Amended 2026-10-31 (vòng test thứ ba, a11y và đa trình duyệt):**
  - **Quét WCAG 2.2 AA trong E2E:** `@axe-core/playwright` với tag `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, ở 1440 và 375 px. Vi phạm làm E2E đỏ; không loại trừ rule nào.
    - Admin: đăng nhập, đăng ký, tạo site, bảng điều khiển (trang ở mọi trạng thái, menu), các bước tạo trang, editor có section đang chọn, "Thêm section", hộp thoại xuất bản (kiểm tra và đã live), lịch sử với panel khôi phục, SEO, tên miền, cài đặt site, hộp thư có lead đang mở, "Nơi nhận lead", "Dữ liệu & đồng ý" có yêu cầu, "Hiệu quả" có số liệu, trang xác nhận nơi nhận lead.
    - Public: trang live ở 4 color scheme của cả 3 theme (mọi section và variant, kèm lỗi của form), preview, trang kết quả `/_lead` (đã nhận và lỗi), các trang 404.
    - Dữ liệu giống board được gieo qua API (`tests/e2e/support/board.ts`). E2E đặt `LEAD_LIMIT_PER_CLIENT=100`, vì renderer của E2E không tin proxy nào nên mọi khách chung một bucket; giới hạn này có integration test riêng.
    - Axe đợi animation hữu hạn chạy xong: dialog đang hiện dần làm màu bị trộn và báo sai tương phản.
  - **Thứ axe không xét được** có spec riêng (`a11y-layout.spec.ts`):
    - Reflow ở 320 px: mọi màn admin và trang public không cuộn ngang (1.4.10).
    - Tab qua mọi màn admin và trang live ở 1440 và 375 px, cả khi có toast: control đang focus không bao giờ bị che hoàn toàn (2.4.11).
    - Kích thước target 24 px (2.5.8) là rule `target-size` của axe trong các lần quét trên.
  - **Sửa từ các lần quét:** menu (DropdownMenu của `@plp/ui`) không còn modal, vì Radix gắn `aria-hidden` lên phần còn lại của trang trong khi link và nút ở đó vẫn focus được (Tab vẫn bị giữ trong menu, click ra ngoài vẫn đóng menu). Nút đổi workspace, đổi site và chọn bảng màu lấy tên từ chữ hiện trên nút (2.5.3). Bảng của "Hiệu quả" cuộn ngang được bằng bàn phím (2.1.1): khi bảng rộng hơn khung (đo lại bằng `ResizeObserver` khi khung hay bảng đổi kích thước), khung là region có tên và nhận focus; khi bảng vừa khung (màn desktop) khung không có role, tên hay `tabindex`, nên không thêm điểm dừng Tab vô ích. Khung đang giữ focus thì giữ role và `tabindex` tới khi focus sang chỗ khác trong trang, kể cả khi bảng đã vừa khung; cửa sổ hay tab mất focus không tính, vì khung vẫn là phần tử đang active (2.4.3).
  - **Toast không che control đang focus (2.4.11):** chồng toast ở góc dưới phải, và chuyển lên góc trên phải khi control đang focus nằm dưới góc dưới (ví dụ "Chuyển vào spam" của lead đang mở ở 1440 × 900), rồi về chỗ cũ khi focus rời đi. Hàm thuần `toastPlacement` trong `@plp/ui` quyết định góc. Góc được chọn lại mỗi khi focus đổi, chồng toast đổi kích thước (`ResizeObserver` trên viewport, ví dụ toast thứ hai) hay trang cuộn (cả vùng cuộn bên trong) hoặc đổi kích thước, vì mỗi điều đó đều có thể đưa chồng toast lên control.
    - Không còn control nào giữ focus (focus rơi về `body` vì control bị gỡ, hoặc click vào chỗ không có control) thì chồng toast về góc dưới phải. Focus rời đi không bắn `focusin`, nên chồng toast nghe cả `focusout`. Chromium bắn `focusout` cả khi control đang focus bị gỡ; Firefox và Safari không bắn gì, nên chồng toast về góc dưới ở lần đổi kế tiếp (cuộn, đổi kích thước, toast thêm hay bớt). Trước đây nó ở lại góc trên. Focus nằm trong chồng toast thì chồng toast đứng yên.
  - **Đa trình duyệt:** hai project WebKit và Firefox chỉ chạy `cross-browser.spec.ts`: trang live, FAQ `<details>`, ẩn/hiện theo thiết bị quanh 768 px, form tải lười (lỗi tại chỗ, focus vào ô lỗi, gửi), lượt xem được đếm, form không JavaScript, gõ và dán (chữ có định dạng, nhiều đoạn) trên canvas của editor. Phần còn lại của E2E chỉ chạy Chromium để giữ thời gian chạy.
- **Amended 2026-11-01 (vòng test thứ ba):** index có trước khi API phục vụ.
  - `IndexBuilder` (trong `PersistenceModule`, một chỗ chung cho mọi repository) tạo collection và mọi index mà các schema khai báo trong `onModuleInit`, nên API chỉ nhận request sau khi chúng có. Mongoose không tự dựng index ở nền nữa (`autoIndex: false`).
  - Lý do: nhiều index unique là chốt chặn của bất biến (email người dùng, session, lượt đăng nhập, membership, subdomain, slug bản nháp và slug đã xuất bản, phiên bản và khóa idempotency của release, redirect, phiên bản đồng ý, lead theo `submissionId`, bộ đếm giới hạn, salt và bộ đếm của analytics); TTL index xóa dữ liệu hết hạn; một số truy vấn có `hint`. Dựng ở nền thì trên database mới, request đầu tiên tới trước index: bản trùng lọt vào (lần dựng index sau đó thất bại, và Mongoose bỏ qua lỗi), truy vấn có `hint` bị từ chối.
  - Không dựng được một index (ví dụ dữ liệu đã có bản trùng) thì API không khởi động; lỗi nêu tên model.
  - Integration test: sau khi khởi động không model nào thiếu index (`diffIndexes`); một index unique gặp dữ liệu trùng làm khởi động thất bại; index của lead bị xóa được dựng lại ở lần khởi động sau, trước lượt kiểm tra đầu tiên.
  - **Quy tắc vận hành** (hệ quả của việc dựng index lúc khởi động, xem §6):
    - Đổi option của một index đã có (`expireAfterSeconds` của TTL, `partialFilterExpression`, unique) là một bước migration chạy trước khi deploy: xóa rồi tạo lại index, hoặc `collMod` với TTL. Thiếu bước này thì phiên bản mới không khởi động được, MongoDB báo `IndexOptionsConflict`.
    - Index mới trên collection lớn được dựng trước khi deploy, để lúc khởi động index đã có sẵn.
    - Không xóa hay đổi tên index khi API đang chạy. Lượt kiểm tra gửi lại của lead công khai dùng `hint` (ADR-016), nên thất bại trong lúc thiếu index của nó; chỉ lần khởi động sau mới tạo lại index.
- **Amended 2026-11-02 (vòng sửa lỗi sau E1–E6):**
  - Integration test thất bại khi Mongoose phát cảnh báo (`test/mongoose-warnings.ts`), nên option đã bị bỏ như `new: true` không quay lại; mọi `findOneAndUpdate` dùng `returnDocument: 'after'`.
  - Route của renderer bọc API theo request trong `try/catch` gọi `unstable_rethrow` đầu khối `catch`, để lỗi điều khiển của Next (prerender lúc build) không bị ghi log như lỗi tra cứu.
  - MongoDB của docker compose giới hạn bộ nhớ đệm 1 GB (`--wiredTigerCacheSizeGB 1`). Mỗi lượt integration test tạo hàng trăm database workspace (ADR-025); hai lượt chạy cùng lúc trên một máy 16 GB làm mongod bị kill vì hết bộ nhớ.
- **Sửa 2026-11-02 (chụp màn hình):** link "Xem vai trò & quyền" của màn Thành viên mang màu xanh mặc định của trình duyệt, vì nó không có class nào.
  - Admin có màu link cơ bản của board (`a{color:#3730A3}`, hover `#26208A`) trong `globals.css`, viết bằng `:where(a)` nên mọi class vẫn thắng, kể cả lúc hover. Link trong mô tả của tiêu đề trang đậm 600 và giữ gạch chân (1.4.1).
  - `expectAccessible` kiểm thêm: không link nào mang màu mặc định của trình duyệt (`rgb(0, 0, 238)`, `rgb(85, 26, 139)`). Axe không bắt lỗi này, vì màu đó vẫn đủ tương phản với nền trắng.

### ADR-014 — Giới hạn và quyết định triển khai MVP A

- **Date:** 2026-10-24 · **Status:** Accepted
- **Decision:**
  - **Giới hạn trang:** mỗi site tối đa `MAX_PAGES_PER_SITE = 200` trang, và mỗi trang tối đa 30 section. Mọi phép tính theo site (đếm trạng thái, thẻ "Cần chú ý") vì vậy luôn có chặn trên.
  - **Bước "Phong cách" của màn 02** chọn nhịp màu của trang (`calm` / `bold` / `minimal`, tức cách xen kẽ color scheme giữa các section), không đổi theme của site. Theme là cài đặt toàn site và chỉ Owner được sửa (ADR-004).
  - **Thông báo lỗi validate** viết bằng tiếng Việt ngay trong schema của contracts, để form admin và API trả cùng một câu.
  - **Tài liệu Next 16 đi kèm package** (`node_modules/next/dist/docs/`) là nguồn tham chiếu API của Next khi triển khai.
- **Reason:** Giữ giới hạn có chủ đích (không có danh sách vô hạn) và tôn trọng phân quyền.
- **Consequences:** Tạo trang thứ 201 trả `page_limit_reached`. Muốn nâng giới hạn thì cần phân trang lại các phép tính theo site.
- **Amended 2026-10-25 (sau review MVP A):**
  - **Giới hạn chịu được request đồng thời:** giới hạn được kiểm tra bên trong transaction tạo mới, sau một lần ghi vào document cha (`site.pageSeq` cho trang, `workspace.siteSeq` cho site). Hai lần tạo đồng thời ghi cùng một document nên MongoDB thử lại lần sau, và lần đó đếm được bản ghi của lần trước.
  - **Đọc vượt giới hạn thì báo lỗi:** các phép đọc theo site và theo workspace lấy thêm một bản ghi; dữ liệu vượt giới hạn thì trả 500 và log, không âm thầm cắt bớt.
  - **Giới hạn site:** mỗi workspace tối đa `MAX_SITES_PER_WORKSPACE = 100` site, vì mọi màn trong workspace nạp danh sách site cho bộ chuyển site. Tạo site thứ 101 trả `site_limit_reached`. Chủ sản phẩm đã xác nhận con số này ngày 2026-10-25.

### ADR-015 — Cài đặt site được chụp vào release

- **Date:** 2026-10-25 · **Status:** Accepted
- **Decision:**
  - **Snapshot:** mọi thứ cấp site hiện trên trang live được chụp vào release lúc publish: `sitePresentation = { name, themePresetId, logoAssetId|null, defaultShareImageAssetId|null }`.
    - Publish đọc site **bên trong** transaction tạo release và dời pointer. Release vẫn bất biến.
    - Asset id lưu dạng chuỗi, như `seo.shareImageAssetId`; asset được tra lúc phục vụ. MVP A không xóa asset (ADR-012), nên snapshot luôn trỏ tới asset còn tồn tại.
  - **Nguồn của từng màn:**
    - Resolve public của trang live và preview của một release dùng snapshot của release đó.
    - Preview bản nháp và canvas của editor dùng site hiện tại, vì chúng cho thấy lần publish tới sẽ tạo ra gì.
    - Fallback SEO (ảnh chia sẻ của trang → ảnh mặc định của site; tiêu đề → heading Hero → tên site) và `og:site_name` của trang live đều lấy từ snapshot.
  - **Trạng thái không đổi (quy tắc 2):** vẫn chỉ so `draft.revision` với `sourceRevision`. Site khác snapshot thì trang vẫn `live` (hoặc `live_with_changes` nếu nháp có sửa).
  - **Nhắc việc:** `PageSummary.siteChanges: ChangeItem[]` (kind `site`) là các cài đặt site khác snapshot của release đang live.
    - Suy ra phía server, không lưu. Rỗng khi không có gì live hoặc không có gì khác.
    - `evaluateDraft` so các release đang trỏ (đã nạp bằng một `$in`) với site đã nạp, nên không thêm truy vấn nào.
    - Chip theo thứ tự cố định: "Giao diện site: giao diện", "Giao diện site: logo", "Giao diện site: tên site", "Giao diện site: ảnh chia sẻ".
    - Admin hiện nhắc ở dòng phụ của dashboard ("Giao diện site đã đổi · xuất bản lại để áp dụng" cho trang `live`; trang `live_with_changes` giữ số thay đổi), ở dòng trạng thái và dải thông báo của editor, thành chip trong hộp thoại publish, và trong ghi chú sau khi lưu cài đặt site.
  - **Chốt khi publish:** request publish gửi `acknowledgedSiteChanges`, là nhãn các chip site mà hộp thoại đã hiện. Trong transaction, nếu cài đặt site vừa đọc cho ra chip khác thì publish trả 409 `site_changed` và không tạo release; hộp thoại tải lại rồi người dùng xem lại. Như vậy release không bao giờ đưa lên live một giao diện chưa ai xem, giống chốt revision và pointer (ADR-006). Bản tóm tắt trả về sau publish so với site đọc trong chính transaction đó.
  - **`changeSummary`** của release gồm chip site khi snapshot khác snapshot của release live trước đó. Lần publish đầu, hoặc sau khi gỡ trang, không có chip site. Publish lại bản nháp không đổi chỉ để áp dụng cài đặt site là hợp lệ; release đó chỉ có chip site.
  - **Sửa cài đặt site** không revalidate renderer: thay đổi không tới trang live nào (trừ release cũ, xem bên dưới).
  - **Release cũ (trước ADR-015)** không có `sitePresentation`. Chúng chỉ có trong database dev local; MVP A không có dữ liệu production.
    - `releasePresentation(release, site)` đọc chúng như site hiện tại, đúng cách chúng được phục vụ trước đây. Chỉ trường bị thiếu mới đi đường này, không có catch-all.
    - Vì vậy chúng không có nhắc việc, và lần publish kế tiếp không có chip site.
    - Schema bắt buộc trường này cho mọi release mới.
- **Reason:** Quy tắc 1 và nguyên tắc 4: trang live chỉ đổi khi publish, rollback, undo hoặc gỡ trang. Trước đây API lấy tên, theme, logo và ảnh chia sẻ từ bản ghi site hiện tại, nên đổi cài đặt site làm mọi trang live đổi theo ở lần làm mới cache kế tiếp mà không cần publish.
- **Consequences:**
  - Rollback về release cũ cũng đưa giao diện site lúc đó trở lại.
  - Áp dụng cài đặt site mới cho cả site cần publish lại từng trang.
  - Owner đổi cài đặt site đúng lúc người khác đang publish thì lần publish đó bị từ chối một lần và phải xem lại.
  - Release cũ trong database dev vẫn đổi theo site, và chỉ thấy thay đổi khi cache renderer tự làm mới, vì sửa site không revalidate. Publish lại một lần thì trang có snapshot.

### ADR-016 — Form đăng ký và thu lead

- **Date:** 2026-10-25 · **Status:** Accepted
- **Decision:**
  - **Section `lead_form`** ("Form đăng ký", nhóm "Form & liên hệ"): `singleton`, không có vị trí cố định, một variant.
    - Trường cố định: Họ và tên, Số điện thoại (bắt buộc, `phoneSchema`). Email và Lời nhắn bật/tắt được; khi bật thì không bắt buộc. Không có trường tùy ý.
    - Content sửa được: tiêu đề, mô tả, chữ trên nút, tiêu đề và lời nhắn sau khi gửi.
    - Ô đồng ý và link chính sách không nằm trong content; component nhận chúng qua props từ `leadCapture` (ADR-017).
  - **Component vẫn chỉ hiển thị (ADR-007):** render `<form method="post" action="/_lead">` thuần, có label, ô ẩn `releaseId` và một ô honeypot.
    - Renderer bọc form bằng một client component, truyền qua context của `@plp/sections/react`, để validate tại chỗ, gửi bằng `fetch` và hiện trạng thái "Đã nhận đăng ký" ngay trong section.
    - Canvas của admin dùng cùng component, không gắn phần gửi.
    - Không có JavaScript thì form vẫn POST được; renderer trả một trang kết quả đơn giản (đã nhận, hoặc lỗi kèm link quay lại), `noindex`, `no-store`.
  - **Đường gửi:** trình duyệt → `POST /_lead` cùng origin trên renderer → API `POST /public/sites/:subdomain/leads`.
    - Cùng origin nên không cần CORS, và trang public vẫn cache như cũ.
    - **Kênh renderer → API:** renderer chuyển IP và user agent của khách bằng header nội bộ, ký HMAC-SHA256 kèm timestamp (cửa sổ 5 phút) bằng `RENDERER_API_SECRET`. API chỉ tin các header này khi chữ ký đúng. Renderer xóa header cùng tên do client gửi.
  - **API nhận lead:**
    1. Nạp release theo `releaseId` trong site của subdomain. Trang của release đó phải đang live (pointer khác `null`), nếu không thì 404. Release có thể cũ hơn release đang trỏ khi khách mở trang trước một lần publish; lead lưu đúng release khách đã thấy.
    2. Validate bằng Zod theo cấu hình form của release đó, không theo draft. Thiếu đồng ý bắt buộc thì 422 (quy tắc 10).
    3. Rate limit trong MongoDB (`lead_limits`, TTL index), cách làm như `login_attempts`: mỗi IP 5 lead trong 10 phút cho một site, mỗi site 300 lead trong một giờ. Vượt thì 429 và không lưu.
    4. `submissionId` do script sinh, unique theo site: gửi lại vì mạng chập chờn thì trả kết quả cũ, không tạo lead trùng.
  - **Spam:** ô honeypot có giá trị, hoặc từ lúc mở form tới lúc gửi dưới 3 giây (thời điểm do script đặt; không có script thì bỏ qua bước này).
    - Lead vẫn được lưu với `spam.suspected = true` và lý do, nằm trong thư mục "Nghi ngờ spam".
    - Lead nghi ngờ spam không được gửi email (ADR-018) và không tính vào số lead.
    - Không dùng captcha của bên thứ ba.
  - **Nguồn và thiết bị:**
    - Script chép `utm_source`, `utm_medium`, `utm_campaign` và `document.referrer` vào ô ẩn. Không có script thì đọc utm từ header `Referer` của request POST.
    - Chuẩn hóa thành `source / medium`, chữ thường, tối đa 40 ký tự: có utm thì dùng utm; referrer từ công cụ tìm kiếm thành `{tên} / organic`; referrer ngoài site khác thành `{domain} / referral`; không có gì thì "trực tiếp".
    - Thiết bị là `mobile` hoặc `desktop`, suy từ user agent bằng một hàm thuần trong API, không thêm thư viện.
  - **Mô hình:**

    ```ts
    leads { workspaceId, siteId, pageId, releaseId, releaseVersion, submissionId|null,
            fields: { name, phone, email|null, message|null },
            consent: { marketing: boolean, at, marketingWithdrawnAt|null },          // ADR-017
            source: { source, medium, campaign|null }, device: 'mobile'|'desktop',
            status: 'new'|'contacted'|'scheduled'|'unreachable'|'won', note,
            spam: { suspected: boolean, reasons: string[] },
            notification: { status, attempts, lastErrorCode|null, sentAt|null },   // ADR-018
            createdAt, expiresAt|null }                                           // ADR-017
    ```

    - Index bắt đầu bằng `siteId`; unique-partial `(siteId, submissionId)`; TTL trên `expiresAt`.
    - Đồng ý bắt buộc không có cờ riêng: lead chỉ tồn tại khi khách đã đồng ý.

  - **Check:** blocking `consent_not_configured` khi trang có form mà site thiếu tên doanh nghiệp, link chính sách hoặc phiên bản đồng ý (ADR-017).
  - **Tạo trang theo mục tiêu:** `lead`, `promo`, `event`, `waitlist` đặt section form ở vị trí của thiết kế, thay cho dải kêu gọi hành động; nút chính của Hero trỏ tới section form. Trang đã tạo không đổi.
- **Reason:** Màn 09, 04, 05 và 02 của thiết kế; quy tắc 10. Gửi qua renderer giữ form chạy được khi không có JavaScript, không mở CORS cho API và cho API biết IP thật của khách để rate limit.
- **Consequences:**
  - Renderer có route mới `/_lead` (ADR-009, ADR-011) và cần `RENDERER_API_SECRET`, API cũng vậy.
  - Rate limit ở MongoDB nên đúng khi có nhiều instance API.
  - Mục tiêu "Danh sách chờ" vẫn bắt buộc số điện thoại; muốn chỉ thu email cần quyết định mới.
  - Rollback về một release không có form thì form biến mất khỏi trang live; lead cũ vẫn trỏ đúng release của chúng.
- **Amended 2026-10-25 (B2):**
  - **Địa chỉ của khách:** renderer chỉ tin phần tử cuối của `X-Forwarded-For` khi `TRUST_PROXY=true`, tức có edge proxy phía trước nối địa chỉ vào. Không có thì không gửi địa chỉ nào, và mọi khách của một site chung một bucket (5 lead mỗi 10 phút cho cả site), cùng mặc định an toàn như ADR-004. Production phải đặt `TRUST_PROXY=true` sau edge proxy.
    - **Amended 2026-10-25 (B6):** bucket của một địa chỉ dùng HMAC theo site (`addressKey`, khóa suy ra từ `RENDERER_API_SECRET`) thay cho SHA-256 thường. Chỉ đọc database hoặc bản sao lưu thì không thử được một địa chỉ đoán trước với khóa này, vì khóa bí mật nằm ngoài database. Hash khách duy nhất cũng vậy (ADR-019).
  - **Chữ ký:** HMAC phủ timestamp, method, path, địa chỉ, user agent và đúng các byte của body, nối bằng xuống dòng (`rendererSignaturePayload` trong contracts). API bật `rawBody` để kiểm đúng các byte đó. Một chữ ký không dùng lại được cho route khác.
  - **Kênh renderer:** decorator `@RendererRequest()` gộp `@Public()`, metadata và guard kiểm chữ ký. `OriginGuard` chỉ bỏ qua kiểm Origin khi có metadata đó.
  - **Số điện thoại:** `leadPhoneSchema` nhận 10 số bắt đầu bằng 0, hoặc +84 và 9 số; khoảng trắng, dấu chấm, gạch ngang được bỏ; lưu dạng 10 số bắt đầu bằng 0.
  - **Nguồn:** không có utm và không có referrer ngoài site thì lưu `(direct) / (none)`, admin hiển thị là "trực tiếp".
  - **Check:** target mới `{ kind: 'privacy', sectionId }`; "Sửa ngay" mở màn "Dữ liệu & đồng ý". Mục passed "Có liên kết chính sách quyền riêng tư" chỉ có trên trang có form.
  - **Không có JavaScript:** form POST urlencoded tới `/_lead`. Nhận xong thì 303 sang `GET /_lead?status=received&back=/slug` (post/redirect/get); lỗi thì trả trang HTML kèm thông báo. Trang kết quả không chứa nội dung của site và chỉ cho link quay về một đường dẫn trong site.
  - **Không lưu những gì form không hỏi:** email, lời nhắn và đồng ý ưu đãi bị bỏ khi form của release không có các ô đó.
  - Đổi thời gian lưu thì tính lại `expiresAt` sau khi lưu cài đặt, ngoài transaction. Lệnh này idempotent: lưu lại lần nữa sẽ sửa những lead còn sót nếu lần trước lỗi.
- **Amended 2026-10-25 (B2.1, chủ sản phẩm chốt):**
  - **Số điện thoại của lead lưu dạng E.164**, mã quốc gia mặc định là Việt Nam (+84):
    - Số không có mã quốc gia là số Việt Nam: 0 rồi 9 chữ số (di động) hoặc 10 chữ số (máy bàn, ví dụ 028 3822 1234). Lưu thành `+84…`.
    - Số có mã quốc gia (`+`, `00` hoặc `84`) được nhận cho mọi nước. Sau +84 phải là 9–10 chữ số; số 0 thường bị giữ lại ("+84 0901…") thì được bỏ.
    - Thay cho quy tắc "10 chữ số bắt đầu bằng 0" của bản B2.
  - **Nút của thanh điều hướng** trên trang tạo theo mục tiêu vẫn gọi số điện thoại trong brief. Người dùng đổi đích của nút trong editor ("Khi bấm, đưa tới"), giống mọi nút khác.
- **Amended 2026-10-26 (test toàn dự án):**
  - **Form không JavaScript:** trang báo lỗi giữ `utm_source`, `utm_medium` và `utm_campaign` của trang trên link "Quay lại form", nên lead gửi lại vẫn đúng nguồn. Ngoài ba tham số này, link không giữ gì khác của địa chỉ.
  - **Form có JavaScript:** nút gửi không bị `disabled` trong lúc gửi, chỉ có `aria-disabled` và `aria-busy`, ghi "Đang gửi…" và mờ đi. Gửi bị từ chối (429, 404, mất mạng) thì focus vẫn ở nút, cạnh thông báo lỗi.
  - **Thời gian điền** (spam "gửi quá nhanh") tính từ lúc trang bắt đầu tải: `performance.now()` của script lúc gửi. Trước đây tính từ lúc script của form mount.
    - Form do server vẽ điền được trong lúc script còn tải, nhiều giây trên mạng chậm. Đo từ lúc mount vì vậy làm người thật bị coi là spam. Cách đo mới không bao giờ đo một người nhanh hơn thực tế.
    - Đánh đổi: bot điều khiển trình duyệt, đợi trang tải xong rồi điền ngay, có thể qua bước này. Honeypot vẫn bắt bot điền mọi ô; rate limit giới hạn số lead (5 mỗi địa chỉ trong 10 phút, 300 mỗi site mỗi giờ).
    - Giá trị gửi tối đa là 24 giờ; tab để mở lâu hơn vẫn gửi được.
  - **Bước 4 chạy trước bước 3:** gửi lại cùng `submissionId` của một lead đã nhận trả 200, kể cả khi khách đã vượt giới hạn, và không tính vào giới hạn.
    - Lệnh kiểm truy vấn kèm `$type: 'string'`, để index unique-partial phục vụ. Nhờ vậy lệnh kiểm chỉ là một lần dò index, dù site có bao nhiêu lead.
  - **User agent dài:** renderer cắt user agent ở 512 ký tự, rồi ký đúng giá trị header gửi đi. Headers bỏ khoảng trắng ở hai đầu, nên phần cắt kết thúc bằng khoảng trắng tới API mất các khoảng trắng đó. Trước đây chữ ký không khớp và lead bị từ chối.
- **Amended 2026-10-31 (vòng test thứ ba):**
  - **Form không JavaScript có `submissionId`:**
    - Renderer sinh id mới cho mỗi lần phục vụ trang, đặt trong ô ẩn `submissionId`. `/_lead` chuyển tiếp id nếu hợp lệ theo `submissionIdSchema`, không thì gửi `null`.
    - Gửi lại sau khi relay hết giờ, hoặc tải lại trang kết quả, được API trả như lần đầu, không tạo lead hay email thứ hai.
    - Trang live không bao giờ được cache dùng chung (`private, no-store`) nên hai khách không chung id. Script của trang vẫn dùng id riêng cho mỗi form.
    - Giới hạn: link "Quay lại trang" trên trang lỗi mở trang mới với id mới.
    - **Khóa chống trùng là id cộng nội dung khách nhập** (`submissionKey`): sha256 của `submissionId`, họ tên, số điện thoại, email, lời nhắn và lựa chọn nhận tin, sau khi contract chuẩn hóa.
      - Cùng id, cùng nội dung là gửi lại, trả như lần đầu. Cùng id, nội dung khác là lead mới: khách không có JavaScript gửi form, bấm Back (bfcache giữ form và id), sửa số điện thoại rồi gửi lại. Trước đây lead thứ hai bị coi là gửi lại và mất. Gửi lại lead thứ hai đó vẫn là gửi lại.
      - Thời gian điền không thuộc khóa, nên script gửi lại với `elapsedMs` lớn hơn vẫn là cùng lead, như trước.
      - Khóa lưu vào trường `submissionId` của lead, nên index unique-partial `(siteId, submissionId)` không đổi. Lượt kiểm tra gửi lại là một phép so bằng đúng khóa đó (kèm `$type: 'string'`, không `$in`), có `hint` tới index đó: một lần dò index. Không có `hint`, lượt thử của planner có thể thấy index `siteId, createdAt` ngang ngửa và cache plan đó, rồi các lần kiểm tra sau của một site lớn đọc mọi lead của site. `hint` không bao giờ gặp database thiếu index, vì index có trước khi API phục vụ (ADR-013, 2026-11-01).
      - Lead lưu trước thay đổi này giữ id thô. Chúng chỉ có trong database dev local; MVP A/B không có dữ liệu production (ADR-001, §6). Một lần gửi lại vắt qua thay đổi này không được nối: nó thành lead mới.
      - Id ngẫu nhiên không được lưu, nên khóa không cho suy ra nội dung.
  - **Relay lỗi** (API không tới được, hết giờ, 5xx): `/_lead` trả 503 kèm `Retry-After: 60` thay cho 502.
  - **Địa chỉ khách:**
    - Phần tử cuối của `X-Forwarded-For` được chuẩn hóa: IPv4 trong IPv6 (`::ffff:a.b.c.d`) thành IPv4, IPv6 viết gọn chữ thường, bỏ cổng và ngoặc vuông. Một khách chỉ có một bucket.
    - Đã kiểm end-to-end qua proxy nối `X-Forwarded-For`: hai địa chỉ có giới hạn riêng, header giả không chọn được bucket.
- **Amended 2026-10-31 (vòng test thứ ba, API):** địa chỉ của khách sau proxy tin cậy.
  - **Một địa chỉ, một cách viết** (`canonicalAddress`) trước khi tạo khóa rate limit hay hash khách:
    - Địa chỉ IPv4 đi qua socket IPv6 (`::ffff:203.0.113.7`) là chính địa chỉ IPv4 đó.
    - Địa chỉ IPv6 viết đủ 8 nhóm, chữ thường, bỏ số 0 đầu mỗi nhóm; bỏ zone (`%eth0`).
    - Trước đây hai cách viết của cùng một địa chỉ là hai bucket và hai khách.
  - **Giới hạn theo địa chỉ tính theo mạng /64 với IPv6** (`addressNetwork`): 5 lead mỗi 10 phút và 60 lượt xem mỗi 10 phút (ADR-019), cho mỗi địa chỉ IPv4 hoặc mỗi mạng IPv6 /64.
    - Lý do: một thuê bao (điện thoại, router gia đình) giữ cả một /64 và tự chọn địa chỉ trong đó, nên giới hạn theo từng địa chỉ IPv6 không giới hạn được ai.
    - Đánh đổi: các máy chung một /64 chung một bucket, như các máy chung một IPv4 sau NAT.
    - Khách duy nhất (ADR-019) vẫn tính theo địa chỉ đầy đủ: hai điện thoại trong một /64 là hai khách.
  - **Integration test** chạy với `TRUST_PROXY_HOPS=1`, địa chỉ do renderer ký và giới hạn mặc định.
    - Kiểm: 5 lead và 60 lượt xem cho mỗi địa chỉ; hai địa chỉ cùng trình duyệt là hai khách; IPv6 và IPv4-mapped.
    - Route relay không đọc `X-Forwarded-For`, kể cả khi header có phần tử giả ở đầu.
- **Sửa 2026-11-04 (test giao diện của Chuyển động):** chữ khách gõ vào form vẽ sẵn trên server trước khi script của form tới không còn bị mất.
  - Nguyên nhân: khi script tới, React thay form của server bằng form của nó, form mới bắt đầu trống. Trên điện thoại mạng chậm, script tới sau vài giây, nên khách gõ trước đó sẽ mất hết. E2E phát hiện lỗi này khi gói script của trang lớn thêm.
  - Cách sửa: `LeadFormSlot` theo dõi form của server từ lúc hydrate, giữ những gì khách gõ, tick, cùng ô và vị trí con trỏ (`typed-form.ts`). Form của client ghi lại các giá trị đó trước khi trình duyệt vẽ nó. Trường ẩn của trang (release, mã gửi) không bị chép.
  - Thời gian điền form vẫn tính từ lúc mở trang, không phải lúc script tới, nên khách vẫn không bị coi là bot.

### ADR-017 — Đồng ý, dữ liệu cá nhân, thời gian lưu và yêu cầu về dữ liệu

- **Date:** 2026-10-25 · **Status:** Accepted
- **Decision:**
  - **Cài đặt của site** (`sites.privacy`; chỉ Owner sửa, Editor xem):
    - `{ controllerName, requestEmail, policyUrl, retentionMonths: 6|12|24|null }`.
    - `controllerName` là đơn vị thu thập dữ liệu; `policyUrl` chỉ nhận `http:`/`https:`; `retentionMonths = null` là không tự xóa, mặc định 12.
  - **Phiên bản đồng ý** (`consent_versions`, bất biến, repository chỉ có `insert` và `find*`):
    - `{ workspaceId, siteId, version, requiredText, marketingText|null, createdBy, createdAt }`, unique(siteId, version).
    - `requiredText` được chứa `{Tên doanh nghiệp}`, thay bằng `controllerName` khi hiển thị. `marketingText = null` là form không có ô nhận ưu đãi; ô này luôn tách riêng và không bắt buộc.
    - Lưu là tạo `version + 1`; phiên bản hiện hành là bản có version lớn nhất.
    - Site mới chưa có phiên bản nào. Màn 12 gợi ý nội dung của thiết kế, kèm lưu ý "không phải tư vấn pháp lý".
  - **Snapshot vào release (cùng cơ chế với ADR-015):**
    - Release có section form thì có `leadCapture = { consentVersionId, consentVersion, controllerName, policyUrl, requiredText, marketingText|null }`, trong đó `requiredText` đã thay tên doanh nghiệp. Release không có form thì `leadCapture = null`.
    - Publish đọc `sites.privacy` và phiên bản đồng ý hiện hành trong cùng transaction với `sitePresentation`.
    - Form của trang live và preview của một release dùng snapshot. Canvas và preview bản nháp dùng cài đặt hiện tại.
    - **Nhắc việc:** khi release đang live có form và snapshot khác cài đặt hiện tại, `siteChanges` thêm chip theo thứ tự cố định: "Dữ liệu cá nhân: nội dung đồng ý", "Dữ liệu cá nhân: tên doanh nghiệp", "Dữ liệu cá nhân: chính sách". `acknowledgedSiteChanges` và 409 `site_changed` áp dụng như ADR-015.
  - **Bằng chứng đồng ý** của một lead là `releaseId` (chứa đúng chữ khách đã thấy), `consent.at` và lựa chọn ô ưu đãi. Màn 10 hiện "Nội dung đồng ý bản N · lúc HH:MM:SS · Xem nội dung".
  - **Thời gian lưu:**
    - `leads.expiresAt = createdAt + retentionMonths`; TTL index của MongoDB tự xóa.
    - Đổi thời gian lưu thì một lệnh `updateMany` tính lại `expiresAt` cho mọi lead của site.
    - Xóa lead là xóa cả bằng chứng trong lead. Release vẫn giữ nội dung đồng ý, vì nội dung đó không chứa dữ liệu cá nhân.
  - **Quyền với lead (mở rộng ADR-004):**
    - Owner và Editor: xem hộp thư, đổi trạng thái, ghi chú, chuyển vào hoặc ra khỏi spam.
    - Chỉ Owner: cài đặt dữ liệu cá nhân, phiên bản đồng ý, nơi nhận lead, xuất CSV, xuất và xóa dữ liệu một người, xử lý yêu cầu về dữ liệu.
  - **Yêu cầu từ người gửi form** (`data_requests`):
    - `{ workspaceId, siteId, contact: { name, phone|null, email|null }, type: 'access'|'rectify'|'delete'|'withdraw_marketing', receivedAt, respondBy, completeBy, status: 'open'|'responded'|'completed', log[≤ 50], createdBy }`.
    - Owner ghi nhận yêu cầu bằng tay (nhận qua email hay điện thoại). Lead liên quan được tìm theo số điện thoại hoặc email đã chuẩn hóa, trong site.
    - Xử lý bằng các thao tác của hộp thư: xuất dữ liệu (JSON và CSV), sửa trường, xóa thật, rút đồng ý nhận ưu đãi (`consent.marketingWithdrawnAt`).
    - **Hạn:** phản hồi trong 2 ngày làm việc, hoàn tất trong 20 ngày làm việc. Ngày làm việc là thứ Hai tới thứ Sáu theo giờ Việt Nam, chưa trừ ngày lễ. Hai con số lấy từ mockup, là hằng số trong contracts, và phải được người phụ trách pháp lý xác nhận trước khi ra mắt.
    - Yêu cầu xóa đã hoàn tất chỉ giữ `contact` ở dạng che (`0987 *** 223`): đủ chứng minh đã xử lý mà không giữ lại dữ liệu.
- **Reason:** Màn 12, quy tắc 1 và quy tắc 10. Nội dung đồng ý là thứ khách thấy trên trang live, nên chỉ đổi khi publish. Lead trỏ về đúng release, nên bằng chứng không bao giờ lệch với chữ khách đã đồng ý.
- **Consequences:**
  - Đổi nội dung đồng ý phải publish lại từng trang có form. Trang chưa publish lại vẫn dùng bản cũ, và lead ghi đúng bản đó.
  - Dữ liệu đã gửi đi qua email (ADR-018) không bị xóa theo; màn 12 nói rõ điều này.
  - Không có trang chính sách tạo từ mẫu: site phải có link chính sách trước khi publish trang có form.
- **Amended 2026-10-25 (B1):**
  - Lưu cài đặt cần tên doanh nghiệp và link chính sách; email nhận yêu cầu không bắt buộc. Không có API xóa cài đặt, nên cài đặt đã đủ thì luôn đủ.
  - Tạo phiên bản gửi kèm `baseVersion`. Đã có bản mới hơn thì trả 409 `conflict` kèm `currentVersion`; hai request tranh cùng số cũng vậy, vì unique index `(siteId, version)` quyết định.
  - Chip dữ liệu cá nhân có change kind riêng là `privacy`, để admin ghi "Dữ liệu cá nhân đã đổi" thay vì "Giao diện site đã đổi". Hai loại chip cùng đi qua `acknowledgedSiteChanges` và 409 `site_changed`.
  - Nội dung đồng ý được so theo id phiên bản, không theo chữ đã điền tên: đổi tên doanh nghiệp chỉ ra chip "tên doanh nghiệp".
  - Có hai phép so:
    - Nhắc việc so snapshot của release đang live với cài đặt hiện tại.
    - `changeSummary` so snapshot của release live trước đó với snapshot của release mới, nên gỡ form khỏi trang thì release mới không có chip dữ liệu cá nhân.
  - Section thu dữ liệu cá nhân được đánh dấu `capturesLeads` trong registry; publish và nhắc việc dựa vào cờ này.
  - `PageEvaluator` chỉ đọc phiên bản đồng ý khi site đã có cài đặt hoặc có trang chứa form, nên thêm tối đa một truy vấn.
  - Màn "Dữ liệu & đồng ý" chỉ có ô link chính sách; lựa chọn "Tạo trang chính sách từ mẫu" của thiết kế nằm ngoài phạm vi (§1).
- **Amended 2026-10-25 (B5):**
  - **Ghi nhận yêu cầu:**
    - Cần số điện thoại hoặc email, hoặc cả hai; họ tên không bắt buộc. Người viết thư mà không ghi tên thì bảng hiện email ở chỗ tên, và dòng dưới ghi "qua email".
    - Số điện thoại và email được chuẩn hóa như của lead (E.164, chữ thường). Yêu cầu lưu kèm khóa tìm `search { phone, email }` theo dạng của lead.
    - `receivedAt` nằm trong 30 ngày qua và không ở tương lai, cho phép đồng hồ trình duyệt nhanh tối đa 5 phút. Form và API dùng chung `receivedAtProblem` trong contracts.
    - Hai hạn được tính một lần lúc ghi nhận (`dataRequestDeadlines` trong contracts) và lưu lại. Sau này đổi hằng số thì yêu cầu cũ giữ hạn cũ.
  - **Lead của người yêu cầu:** cùng quy tắc "một người" của hộp thư: cùng số điện thoại hoặc cùng email, so trực tiếp, nhưng không có lead xuất phát. Danh sách đếm lead cho cả trang kết quả bằng một aggregation. Mỗi người được đếm bằng một pipeline con (`$unionWith`) dùng index tìm kiếm và dừng ở 1.000, nên số hiện ra dừng ở "999+" mà không đọc hết lead.
  - **Các bước:**
    - "Đã phản hồi người yêu cầu": `open` → `responded`, chỉ một lần.
    - "Xuất dữ liệu" chỉ có ở yêu cầu xem dữ liệu chưa hoàn tất. File JSON hoặc CSV giống "Xuất dữ liệu người này". Mỗi lần xuất ghi vào nhật ký của yêu cầu và activity `lead.exported`.
    - "Hoàn tất" từ `open` hoặc `responded`; hoàn tất cũng tính là đã phản hồi. Theo loại yêu cầu:
      - Xóa: xóa mọi lead của người đó, che thông tin liên hệ và bỏ khóa tìm, ghi `lead.person_deleted` và `data_request.completed`, tất cả trong một transaction. Thông tin che: họ tên còn chữ cái đầu ("L. M. A."), số điện thoại còn nhóm đầu và nhóm cuối ("0987 *** 223"), email còn hai ký tự đầu và tên miền.
      - Các yêu cầu khác của cùng người trong site (theo cùng quy tắc so trực tiếp, kể cả yêu cầu đang mở) cũng bị che và bỏ khóa tìm, trong cùng transaction: dữ liệu đã xóa thì không yêu cầu nào giữ lại. "Xóa dữ liệu người này" ở hộp thư làm đúng như vậy. Yêu cầu đang mở vẫn mở để Owner trả lời, nhưng không còn lead nào để xuất hay sửa.
      - Rút đồng ý nhận ưu đãi: đặt `consent.marketingWithdrawnAt` cho các lead của người đó đã chọn nhận ưu đãi và chưa rút. Lead và bằng chứng đồng ý được giữ.
      - Xem dữ liệu, sửa thông tin: Owner xác nhận đã gửi bản sao hoặc đã sửa xong.
    - Xóa và rút đồng ý phải bấm xác nhận thêm một lần; nút "Xác nhận" đọc kèm hậu quả. Dialog không đóng khi một bước đang chạy, và mỗi lần mở là một trạng thái mới, nên một xác nhận đã bấm không mang sang yêu cầu khác.
    - Hạn được so với đồng hồ, cập nhật mỗi 30 giây khi màn hình vẫn mở, nên "Quá hạn" hiện ra mà không cần tải lại.
    - Hai lần hoàn tất cùng lúc thì một lần nhận 409. Lần thua không để lại gì, vì nó nằm trong transaction.
  - **Nhật ký:** mỗi mục là `{ at, actor, action, count }`, không có dữ liệu cá nhân, nên vẫn giữ sau khi xóa. Tối đa 50 mục (`$slice`). Lệnh hoàn tất là update pipeline; mọi giá trị do người gõ được bọc `$literal`, để không bao giờ bị đọc thành biểu thức.
  - **Sửa thông tin (Owner):** chi tiết lead có nút "Sửa thông tin", gọi `PATCH /leads/:leadId/contact`.
    - Họ tên, số điện thoại và email theo đúng quy tắc của form. Khóa tìm được cập nhật theo.
    - Bằng chứng đồng ý không đổi.
  - **Quyền:** chỉ Owner xem và xử lý yêu cầu. Editor không thấy phần này; màn 12 ghi rõ.
  - **Danh sách:** yêu cầu ghi nhận gần nhất ở trên, 20 mục mỗi trang. Index `data_requests_site (siteId, createdAt, _id)`.
  - **Chưa có thời gian lưu cho yêu cầu:** yêu cầu là bằng chứng đã xử lý nên không tự xóa. Yêu cầu xóa chỉ giữ thông tin đã che. Thời gian giữ yêu cầu cần người phụ trách pháp lý xác nhận trước khi ra mắt.
- **Amended 2026-10-26 (test toàn dự án):** thời gian lưu luôn theo cài đặt cuối cùng, kể cả khi có thay đổi đúng lúc.
  - Lead tới trong lúc Owner đổi thời gian lưu: sau khi lưu lead, phần nhận lead đọc lại thời gian lưu hiện tại và sửa `expiresAt` nếu khác. Cài đặt được commit trước khi tính lại mọi lead, nên hoặc lần tính lại đó đã gồm lead này, hoặc lần đọc lại thấy giá trị mới.
  - Hai lần lưu cùng lúc: sau khi tính lại, lần lưu đọc lại giá trị đã lưu và tính lại lần nữa nếu khác. Lead theo giá trị được lưu sau cùng.
- **Amended 2026-10-31 (vòng test thứ ba):** nhật ký 50 mục bỏ mục cũ nhất trước, kể cả mục "Ghi nhận".
  - Thời điểm ghi nhận, phản hồi và hoàn tất vẫn nằm trên yêu cầu (`createdAt`, `respondedAt`, `completedAt`).
  - Integration test đi qua API: ghi nhận cộng 49 lần xuất là 50 mục, và lần xuất thứ 50 đẩy mục ghi nhận ra. Phản hồi và hoàn tất (update pipeline) giữ 50 mục, cũ nhất trước.
- **Amended 2026-10-31 (vòng test thứ ba, admin):**
  - Với Editor, hộp thoại xuất bản không có "Sửa ngay" cho `consent_not_configured` và `lead_destination_missing`. Thay vào đó, hộp thoại ghi rõ chỉ Owner của workspace làm được và đề nghị nhờ Owner.
  - Checklist "Thiết lập site" của màn 01 ghi "Owner của workspace làm bước này" cho các bước của Owner, thay vì link tới màn chỉ đọc.

### ADR-018 — Hộp thư lead và email thông báo

- **Date:** 2026-10-25 · **Status:** Accepted
- **Decision:**
  - **Hộp thư (màn 10):**
    - Hai thư mục: Hộp thư (không spam) và Nghi ngờ spam. Sắp theo `createdAt` giảm dần, phân trang bằng cursor, 50 mục mỗi trang.
    - Lọc theo trang, trạng thái và khoảng thời gian (7 ngày, 30 ngày, hoặc tùy chọn tối đa 365 ngày).
    - Tìm theo số điện thoại hoặc email đã chuẩn hóa (khớp đầu chuỗi, có index), và theo tên (chữ thường, bỏ dấu) trong phạm vi đã lọc.
    - Chi tiết lead: trang và version, nguồn, thiết bị, bằng chứng đồng ý, trạng thái gửi thông báo, ghi chú nội bộ (tối đa 1000 ký tự).
    - "N mới" ở sidebar và "Lead 7 ngày" ở màn 01 đếm lead không spam bằng truy vấn trên index, có chặn trên.
  - **Xuất CSV (Owner):**
    - UTF-8 có BOM để Excel đọc đúng tiếng Việt.
    - Ô bắt đầu bằng `=`, `+`, `-`, `@`, tab hoặc CR được thêm `'` phía trước, chống formula injection.
    - Theo bộ lọc đang chọn, tối đa 10.000 dòng mỗi lần, stream thay vì nạp hết vào bộ nhớ. Ghi activity `lead.exported` kèm số dòng.
  - **Nơi nhận lead:** `sites.leadRecipients`, tối đa 5 email.
    - Mỗi địa chỉ mới nhận một email xác nhận. Token ngẫu nhiên, DB chỉ lưu sha256, hết hạn sau 7 ngày. Chỉ địa chỉ đã xác nhận mới nhận lead, nên form không thể dùng để gửi thư tới một hộp thư chưa đồng ý nhận.
    - Blocking `lead_destination_missing` khi trang có form mà site không có địa chỉ nào đã xác nhận. Badge "Chưa chọn nơi nhận lead" trong editor dùng cùng check.
    - Thêm hoặc bỏ địa chỉ ghi activity `lead.recipients_changed`.
  - **Gửi email:**
    - SMTP qua `nodemailer`, cấu hình bằng `SMTP_URL` và `LEAD_EMAIL_FROM`. Dev, integration test và E2E dùng Mailpit trong docker compose.
    - API trả lời khách ngay sau khi lưu lead, rồi gửi email ở nền. Thử tối đa 3 lần: ngay, sau 1 phút, sau 5 phút.
    - `lead.notification.status`: `pending` → `sending` → `sent` hoặc `failed`, kèm mã lỗi, không kèm nội dung. Mỗi lần gửi giành lead bằng update có điều kiện trên status, nên nhiều instance không gửi trùng.
    - `failed` hiện "Lỗi đồng bộ" ở màn 10, có nút "Gửi lại".
    - Khi API khởi động, quét một lần các lead còn `pending` hoặc `sending` quá 10 phút (tối đa 500, cũ nhất trước) để gửi lại. Không có vòng lặp polling hay hàng đợi riêng.
    - Email gồm tên, số điện thoại, email, lời nhắn, trang, nguồn và link tới lead trong admin. Log chỉ ghi id lead và mã lỗi.
- **Reason:** Màn 10, 05 và 01. Email là nơi nhận đơn giản nhất mà vẫn báo ngay cho người bán. Xác nhận địa chỉ ngăn việc dùng form để gửi thư rác tới người khác.
- **Consequences:**
  - Lịch thử lại nằm trong bộ nhớ của instance API: instance tắt giữa chừng thì lead chờ tới lần khởi động sau. Scale ngang hoặc cần giao nhận chắc chắn hơn thì phải có hàng đợi thật.
  - Production cần nhà cung cấp SMTP có SPF và DKIM cho domain gửi; chọn khi deploy.
  - Google Sheets, Meta Conversions API hay Zalo OA là nơi nhận mới, mỗi cái cần ADR riêng.
- **Amended 2026-10-25 (quyết định trước B3):** hộp thư mặc định lọc "7 ngày qua" như thiết kế, và có thêm lựa chọn "Toàn bộ thời gian". Badge "N mới" ở sidebar và dòng "chưa xử lý" ở dashboard mở hộp thư với trạng thái "Mới" và "Toàn bộ thời gian", để số trên badge khớp với danh sách mở ra.
- **Amended 2026-10-25 (B3):**
  - **Ngày:** "7 ngày qua" là hôm nay và 6 ngày trước theo lịch Việt Nam (UTC+7), "30 ngày qua" tương tự. Khoảng tùy chọn gồm cả ngày đầu và ngày cuối, tối đa 365 ngày. API và admin dùng chung các hàm lịch trong contracts (`calendar.ts`), nên badge, thẻ dashboard, cột "LEAD 7 NGÀY" và hộp thư ra cùng một số.
  - **Tìm kiếm:** khi nhận lead, API lưu thêm `search { phone, email, name }`: chữ số của số E.164, email chữ thường, tên chữ thường bỏ dấu. Số gõ dạng `0…` được đổi sang `84…`; số không có 0 đầu được thử cả hai dạng. Lead nhận trước B3 không có `search` (chỉ có ở DB dev) nên không tìm được bằng ô tìm.
  - **Index:** `leads_inbox` (siteId, spam, createdAt, _id), `leads_inbox_page`, `leads_inbox_status`, `leads_search_phone`, `leads_search_email`, đều bắt đầu bằng `siteId`.
  - **Đếm:** số trên thư mục, badge và thẻ dashboard dừng ở 999 ("999+"), nên một lệnh đếm không quét quá 1.000 lead. Cột "LEAD 7 NGÀY" đếm đúng bằng một aggregate cho mọi trang của site. Lead nghi ngờ spam, kể cả lead được chuyển vào spam bằng tay, không được tính ở đâu cả.
  - **Một người** là lead đang xem cùng mọi lead trong site có cùng số điện thoại hoặc cùng email với nó (so trực tiếp, không bắc cầu). "Xuất dữ liệu người này" cho file JSON (kèm nội dung đồng ý của từng lead) hoặc CSV, tối đa 1.000 lead; "Xóa dữ liệu người này" xóa tất cả.
  - **Xuất và xóa:** mỗi lần xuất ghi `lead.exported`, mỗi lần xóa ghi `lead.person_deleted`, kèm số lead và không kèm dữ liệu cá nhân. Activity của lần xóa nằm cùng transaction với lệnh xóa. CSV dùng giờ Việt Nam dạng `2026-10-24 16:42:07` và số Việt Nam dạng `0901 234 567`.
  - **Ô tìm kiếm không bao giờ nằm trong URL:** từ khóa là dữ liệu cá nhân (số điện thoại, email, tên).
    - Danh sách không tìm kiếm dùng `GET /sites/:siteId/leads`; schema của query từ chối tham số lạ như `q`.
    - Có từ khóa thì gửi `POST /sites/:siteId/leads/search` với từ khóa trong body. CSV cũng nhận từ khóa trong body.
    - URL của màn hộp thư giữ các bộ lọc và lead đang mở, nhưng không giữ từ khóa: tải lại trang thì ô tìm trống.
    - Lý do: URL đi vào lịch sử trình duyệt, header `Referer`, access log của proxy, và dòng log "Failed to proxy" của rewrite `/api` khi API không trả lời.
    - Log của API vẫn che `q` trong URL, query và header `Referer`, phòng khi có trang khác dùng `q`.
    - Từ khóa tối đa 80 ký tự, không chứa ký tự điều khiển. Admin đổi các ký tự đó (ví dụ khi dán) thành khoảng trắng.
  - **Truyền dữ liệu:** file tải về đi bằng `POST` qua proxy `/api`, nên vẫn qua kiểm tra Origin. Phản hồi có dữ liệu lead gửi `Cache-Control: no-store`. Tải CSV bị bỏ dở (người dùng rời trang) thì cursor MongoDB được đóng ngay, không đợi hết hạn.
  - **Số trên badge:** trang hộp thư và dashboard nạp số đếm cùng lúc với dữ liệu của chúng và ghi đè số cũ hơn trong cache, nên badge ở sidebar (layout giữ dữ liệu lần đầu) khớp với trang vừa mở.
  - **Liên kết tới một lead:** `/sites/{siteId}/leads?lead={leadId}`; email thông báo của B4 dùng liên kết này. Phần "Đã gửi tới", nút "Nơi nhận lead" và badge "Lỗi đồng bộ" thuộc B4.
- **Amended 2026-10-25 (B4):**
  - **Địa chỉ nhận lead** nằm trong `sites.leadRecipients[]`: `{ email, addedAt, invitedAt, confirmedAt, tokenHash, tokenExpiresAt }`.
    - Thêm địa chỉ bằng một lệnh cập nhật có điều kiện (chưa có địa chỉ đó, chưa đủ 5), nên giới hạn đúng cả khi thêm cùng lúc.
    - Trạng thái suy ra, không lưu: `confirmed`, `pending` (liên kết còn hạn), `expired`, `unsent` (thư xác nhận chưa gửi được, bấm "Gửi lại").
    - Thêm địa chỉ không thất bại khi thư xác nhận không gửi được. Địa chỉ ở trạng thái `unsent` cho tới khi gửi lại.
    - "Gửi lại" tạo liên kết mới; liên kết cũ hết tác dụng.
    - **Giới hạn thư xác nhận:** trong 24 giờ, mỗi cặp site và địa chỉ nhận tối đa 5 thư, mỗi địa chỉ tối đa 30 thư từ mọi site, mỗi workspace gửi tối đa 50 thư. Vượt giới hạn thì trả 429 và không lưu hay gửi gì.
      - Lý do: thư xác nhận đi tới người chưa đồng ý, kèm tên site do Owner tự đặt, nên không được để thành công cụ gửi thư hàng loạt hay lừa đảo.
      - Agency thêm cùng một email cho nhiều site khách vẫn nằm dưới giới hạn.
      - Bộ đếm dùng chung bảng `lead_limits`, khóa chứa sha256 của địa chỉ. Bỏ rồi thêm lại một địa chỉ không đặt lại bộ đếm.
  - **Xác nhận:** liên kết `{ADMIN_ORIGIN}/lead-recipients/confirm#token=…`. Bí mật nằm trong fragment nên không tới server hay log nào.
    - Trang xác nhận không cần đăng nhập. Người nhận phải bấm nút: mở liên kết (kể cả bằng trình quét link) không xác nhận gì.
    - Mỗi liên kết dùng một lần. Sau khi xác nhận, trang xóa bí mật khỏi thanh địa chỉ.
    - `POST /public/lead-recipients/confirm` không cần session nhưng vẫn qua kiểm tra Origin. Liên kết sai, đã dùng hay hết hạn đều trả 404.
  - **Gửi:** lead nghi ngờ spam có `notification.status = skipped`, không gửi.
    - Lúc gửi mà site không còn địa chỉ đã xác nhận: `failed` với mã `no_recipients`, không thử lại.
    - Các mã lỗi khác: `smtp_unavailable`, `smtp_rejected`, `timeout`, `unknown`.
    - Mỗi lần thử giành lead bằng điều kiện `pending` → `sending` và tăng `attempts`; kết quả chỉ ghi khi `attempts` còn khớp lần giành đó.
    - "Gửi lại" (Owner và Editor) đưa lead `failed` về `pending` với `attempts = 0`. Admin đọc lại lead một lần sau 3 giây, không polling.
    - **Spam không bao giờ được gửi email**, kể cả lead một thành viên chuyển vào spam sau khi nhận. Lần thử kế tiếp giành lead xong thì đánh dấu `skipped`. "Gửi lại" không áp dụng cho lead trong spam, và badge "Lỗi đồng bộ" không hiện cho chúng.
    - **Một phần địa chỉ bị từ chối**, ví dụ hộp thư đã bị xóa: lead vẫn là `sent`. `recipients` là số địa chỉ máy chủ nhận, `rejectedRecipients` là số bị từ chối, `lastErrorCode` ghi lý do. Chi tiết lead nhắc kiểm tra "Nơi nhận lead". Gửi lại sẽ lặp thư tới những địa chỉ đã nhận, nên không gửi lại.
    - **Database lỗi giữa chừng:**
      - Lỗi sau khi giành lead mà trước khi gửi: ghi một lần thử thất bại (`unknown`) và hẹn lần sau. Nếu ghi cũng lỗi, thử ghi thêm một lần; sau đó lượt quét lúc khởi động xử lý.
      - Thư đã gửi mà ghi kết quả lỗi: thử ghi lại một lần và không gửi lại.
  - **Email:** gửi tới mọi địa chỉ đã xác nhận trong một thư.
    - Chủ đề: `[{tên site}] Lead mới: {họ tên}`. Nội dung có số điện thoại dạng Việt Nam, email và lời nhắn nếu có, trang và phiên bản, nguồn, giờ Việt Nam, và liên kết `…/leads?lead={id}&range=all`.
    - Phần HTML escape mọi giá trị khách nhập.
  - **Check:** blocking `lead_destination_missing`, target `{ kind: 'lead_recipients', sectionId }`. "Sửa ngay" mở hộp thư lead với "Nơi nhận lead" đang mở (`?recipients=open`). Badge trên dòng section trong editor ghi "Chưa chọn nơi nhận lead".
    - Mục passed "Có nơi nhận lead" chỉ có trên trang có form.
    - Site trả thêm `confirmedLeadRecipients` và `privacyConfigured`. Checklist của màn 01 dùng hai trường này cho "Thêm chính sách quyền riêng tư" và "Chọn nơi nhận lead (email)". Bước "Kết nối tên miền riêng" vẫn ẩn.
  - **Activity** `lead.recipients_changed` ghi số địa chỉ còn lại sau mỗi lần thêm hoặc bỏ, không ghi email.
  - **Index ngoại lệ:** `leads_notification_sweep (notification.status, notification.updatedAt)` không bắt đầu bằng `siteId`, vì lượt quét lúc khởi động đi qua mọi site.
  - **Thử nghiệm:** integration test thay SMTP bằng bộ ghi thư và rút ngắn thời gian chờ giữa các lần thử. Một test gửi thật qua Mailpit. E2E đọc thư qua HTTP API của Mailpit.
- **Amended 2026-10-26 (test toàn dự án):** **giành lead lỗi**, tức database không trả lời lúc chuyển `pending` → `sending`.
  - Không tính lần thử; lead vẫn `pending`.
  - Thử giành lại một lần sau lần chờ đầu (1 phút). Lỗi nữa thì lượt quét lúc khởi động xử lý.
  - Trước đây lead kẹt ở `pending` tới lần khởi động sau, và không có nút "Gửi lại".
- **Amended 2026-10-31 (vòng test thứ ba):**
  - **Giới hạn thư xác nhận đếm thư đã gửi đi,** không đếm yêu cầu.
    - Request bị từ chối (429; 409 vì địa chỉ đã có hoặc site đã đủ 5 địa chỉ; 404) và thư không gửi được (địa chỉ `unsent`) được trả lại ở cả ba bộ đếm.
    - Trước đây 5 lần bấm "Gửi lại" lúc SMTP lỗi khóa địa chỉ đó cả ngày, và bấm quá giới hạn của một địa chỉ tiêu hết 50 thư của workspace.
    - Vẫn đếm trước khi gửi (nguyên tử), nên các request đồng thời không vượt giới hạn. Trả lại là giảm 1 trong đúng cửa sổ đã đếm (khớp `expiresAt` của cửa sổ đó), không xuống dưới 0, không chạm cửa sổ đã hết hay cửa sổ sau, như lần thử đăng nhập của ADR-004.
    - Trả lại lỗi thì thư vẫn bị đếm (phía an toàn: cửa sổ hết trong một ngày) và lỗi được ghi log mức error kèm tên các bộ đếm và id của site, workspace (không kèm hash của địa chỉ, vì log không chứa dữ liệu cá nhân, kể cả dạng bí danh) và nguyên nhân. Request giữ kết quả của chính nó: vẫn là 429, 409 hay 404 như cũ, hoặc địa chỉ `unsent` được thêm thành công. Lý do: dọn bộ đếm không được đổi điều người dùng được báo. Trả 500 sẽ mất thông báo họ làm theo được, và báo lỗi cho một lần thêm hay gửi lại đã lưu thật.
    - Ba bộ đếm tăng song song. Một bộ đếm lỗi thì các bộ đếm đã tăng được trả lại, rồi request thất bại (500) với lỗi đó làm `cause`.
    - Lỗi đó (ví dụ lỗi trùng khóa của MongoDB) có thể nêu khóa bộ đếm, tức hash của địa chỉ, và `ProblemFilter` ghi cả lỗi. Lưới an toàn ở log redaction của API: serializer `err` của pino thay mọi chuỗi từ 64 chữ số hex trở lên bằng `[hash]` trong lỗi được ghi (message, stack, `errmsg`, `keyValue`, `cause` và `errors` lồng nhau, có chặn vòng lặp). Không log nào cần giá trị sha256.
      - Bổ sung 2026-11-01: serializer `err` và việc che token preview trong `params` của serializer `req` dùng chung một hàm duyệt chuỗi (`mapStrings`). Hàm chặn vòng lặp, kể cả vòng lặp qua giá trị `toJSON()` trả về (một object mới trỏ lại chính nó): trước đây việc duyệt tràn stack ngay trong `logger.error` của `ProblemFilter`, nên log mất lỗi gốc, và `params` tự trỏ lại mình cũng làm tràn stack.
  - **Lỗi SMTP thật,** thử bằng một SMTP stub trên `node:net` qua `SmtpEmailSender` và nodemailer:
    - kết nối bị từ chối → `smtp_unavailable`;
    - máy chủ không chào hoặc không trả lời DATA → `timeout`;
    - 550 cho một trong hai địa chỉ → `sent` với `recipients` 1, `rejectedRecipients` 1 và mã `smtp_rejected`, không thử lại;
    - 550 cho mọi địa chỉ → `smtp_rejected`.
    - Timeout của nodemailer đặt được bằng query của `SMTP_URL` (`?socketTimeout=…`).
  - **Lịch thử lại:** test chỉ giả lập `setTimeout` (database, HTTP và `Date` vẫn thật) giữ đúng lịch production: thử ngay, sau 1 phút, sau 5 phút, rồi `failed`.
  - **Nhiều instance API:**
    - Giành lead và lượt quét lúc khởi động đúng như đã ghi. Hai instance cùng thử 40 lead thì mỗi lead đi một thư, một lần thử. Hai lượt quét chạy cùng lúc nhận backlog một lần. Lead đang `sending` dưới 10 phút được để lại.
    - Lịch 0/1/5 phút chỉ đúng trong một instance.
      - Lượt quét của một instance khởi động lại nhận cả lead `pending` mà instance khác đang chờ thử lại, và thử ngay. Lần thử đã hẹn của instance kia sau đó thấy lead đã xử lý và không gửi gì.
      - Thư không bao giờ trùng, nhưng ba lần thử có thể dồn sát nhau khi deploy cuốn chiếu.
    - "Lần khởi động sau" ở Consequences nghĩa là lần khởi động sau của bất kỳ instance nào.
  - **Phân trang hộp thư** (170 lead ở 7 thời điểm): qua nhiều trang 50 và 20 mục, không lead nào lặp hay bị bỏ. Điều này đúng cả khi lọc trang + trạng thái, trong thư mục spam, khi tìm theo số điện thoại và theo tên. Số trên thư mục, các trang và file CSV giữ cùng các lead theo cùng thứ tự.
  - **Lọc trang + trạng thái** dùng `leads_inbox_page` hoặc `leads_inbox_status`, không quét collection và không sort trong bộ nhớ.
    - Đo bằng `explain` trên 54.000 lead có trạng thái lệch.
    - Lệnh đếm tệ nhất quét 3.200 key.
- **Amended 2026-11-01 (ADR-029):** đường gửi email chọn bằng `MAIL_TRANSPORT`: SMTP như trên (mặc định), hoặc plp-mailer qua SQS. Với SQS, `sent` nghĩa là thư đã vào hàng đợi của plp-mailer.

### ADR-019 — Hiệu quả trang, đo không dùng cookie

- **Date:** 2026-10-25 · **Status:** Accepted
- **Decision:**
  - **Thu:** trang live (không phải preview, không phải 404) chạy một script nhỏ, gửi `navigator.sendBeacon('/_e', { path, referrer, utm })` một lần mỗi lần tải trang.
    - Renderer chuyển tiếp tới API `POST /public/sites/:subdomain/events` qua kênh ký HMAC của ADR-016. API phân giải `path` sang trang đang live; không có thì không đếm.
    - Request không có user agent, hoặc user agent là bot đã biết, không được đếm.
    - Beacon có rate limit theo IP như lead. Vượt giới hạn thì trả 204 và không đếm, vì đây là số liệu chứ không phải thao tác của người dùng.
  - **Khách duy nhất:** `sha256(salt của ngày + siteId + IP + user agent)`.
    - Salt ngẫu nhiên, đổi mỗi ngày theo giờ Việt Nam (`analytics_salts`), tự xóa sau 2 ngày. Không lưu IP hay user agent; salt bị xóa thì không còn cách nối hash với một người.
    - `analytics_seen { siteId, pageId|null, day, hash }`, unique, TTL 2 ngày, đánh dấu "đã thấy hôm nay" ở cấp site và cấp trang. Lần đầu thấy thì tăng `visitors`.
    - Số khách của nhiều ngày là tổng khách từng ngày; một người quay lại vào ngày khác được tính là khách mới. Màn 11 ghi rõ cách tính.
  - **Tổng hợp:** `analytics_daily { workspaceId, siteId, pageId|null, day, source, medium, device, views, visitors }`, cập nhật bằng upsert `$inc`, giữ 13 tháng (TTL). `pageId = null` là dòng cấp site.
    - Nguồn chuẩn hóa như lead (ADR-016). Mỗi site mỗi ngày có tối đa 50 cặp nguồn/kênh; vượt thì gộp vào "khác".
    - Không lưu sự kiện thô.
  - **Lead và tỷ lệ chuyển đổi** đếm thẳng từ `leads` không spam, bằng aggregate trên index `(siteId, createdAt)`. Chuyển lead vào hoặc ra khỏi spam được phản ánh ngay. Tỷ lệ chuyển đổi = lead ÷ khách duy nhất.
  - **Màn 11:** khoảng 7, 30 hoặc 90 ngày, so với kỳ ngay trước; lọc theo trang; biểu đồ khách theo ngày; bảng nguồn; theo trang; thiết bị.
  - **Người trong workspace:** link "Xem trang live" trong admin thêm tham số `plp_internal=1`. Script lưu cờ này vào `localStorage` của trình duyệt, xóa tham số khỏi URL, và từ đó không gửi beacon. Lượt xem của thành viên từ trình duyệt khác vẫn được tính; màn 11 ghi rõ.
- **Reason:** Màn 11 và quy tắc 11. Hash theo ngày không cần cookie, nên không cần banner đồng ý cookie.
- **Consequences:**
  - Số khách duy nhất của khoảng nhiều ngày cao hơn số người thật, và không so được với công cụ đo bằng cookie.
  - Lượt xem không chạy JavaScript không được tính.
  - Lead bị xóa theo thời gian lưu thì số lead của kỳ cũ giảm theo. Thời gian lưu ngắn nhất (6 tháng) dài hơn khoảng xem lớn nhất cộng kỳ so sánh (180 ngày), nên màn 11 không bị ảnh hưởng.
  - Renderer có route mới `/_e` (ADR-009, ADR-011).
- **Amended 2026-10-25 (quyết định trước B6):**
  - **Rate limit của beacon:** khi biết địa chỉ khách thì 60 lần mỗi 10 phút cho mỗi địa chỉ trên một site. Không biết địa chỉ (renderer không có proxy tin cậy) thì bỏ giới hạn theo địa chỉ, chỉ giữ giới hạn 20.000 lần mỗi giờ cho cả site, vì một bucket chung sẽ làm mất gần hết lượt xem thật.
  - **Bot:** không đếm user agent của crawler, công cụ xem trước link (Facebook, Zalo…), thư viện HTTP và trình duyệt headless (`HeadlessChrome`). E2E đặt user agent của trình duyệt thật.
- **Amended 2026-10-25 (B6):**
  - **Thu:**
    - Script chỉ chạy ở trang live (không ở preview, không ở trang 404). Nó gửi `navigator.sendBeacon('/_e', JSON)` một lần mỗi lần tải trang, kèm `path` và nguồn (utm, referrer).
    - Route `/_e` của renderer luôn trả 204. Nó bỏ qua view từ site khác, body không phải JSON hợp lệ hoặc lớn hơn 2 KB, rồi chuyển tiếp có ký tới `POST /public/sites/:subdomain/events`; API cũng luôn trả 204.
    - Không bao giờ log nội dung view, chỉ log status.
  - **Bot:** danh sách trong `isCountableUserAgent`. Trình duyệt trong app Facebook và Zalo là người thật nên vẫn được đếm. Tên hãng điện thoại có chữ "bot" (CUBOT) không bị coi là bot.
  - **Khách duy nhất:** hash là HMAC-SHA256 của salt trong ngày, `siteId`, địa chỉ và user agent (`visitorHash`). Khóa bí mật suy ra từ `RENDERER_API_SECRET` bằng HKDF, với nhãn riêng, khác khóa của rate limit.
    - Lý do: salt nằm ngay trong database, cạnh các hash. Nếu hash không có khóa, ai đọc được database hoặc bản sao lưu có thể thử từng địa chỉ IPv4 với vài trăm user agent phổ biến, và tìm ra người xem cùng những trang họ mở trong ngày.
    - Salt theo ngày vẫn được giữ lại: khi salt hết hạn, ngay cả người có khóa cũng không nối được một hash với ai.
  - **Rate limit:** biến môi trường `PAGE_VIEW_LIMIT_PER_CLIENT` (60), `PAGE_VIEW_LIMIT_PER_CLIENT_WINDOW_MINUTES` (10), `PAGE_VIEW_LIMIT_PER_SITE_PER_HOUR` (20.000). Dùng chung bảng `lead_limits`.
    - Khóa địa chỉ là HMAC-SHA256 của `siteId` và địa chỉ (`addressKey`). Khóa bí mật suy ra từ `RENDERER_API_SECRET` bằng HKDF, nên không nằm trong database.
    - Lý do: SHA-256 thường của một địa chỉ IPv4 bị dò ngược trong vài phút bằng cách hash cả 2^32 địa chỉ. Khóa theo site nên một người cũng không bị nối giữa các site.
    - Khóa rate limit của lead (ADR-016) đổi theo cách này.
  - **Lưu trữ:**
    - `analytics_salts` mỗi ngày Việt Nam một bản, unique theo ngày, tự xóa sau 2 ngày.
    - `analytics_seen` unique `(siteId, pageId, day, hash)`. Chèn bằng upsert, nên lần thấy đầu tiên cộng một khách.
    - `analytics_daily` unique `(siteId, pageId, day, source, medium, device)`, cộng bằng `bulkWrite` upsert cho dòng cấp site và dòng cấp trang. TTL 400 ngày.
    - Mọi báo cáo đọc theo prefix của index unique này, kể cả "Theo trang": `pageId: {$ne: null}` quét ngày của từng trang và bỏ qua dòng cấp site. Không cần index `(siteId, day)` riêng; đo bằng `explain` thì số key quét bằng số dòng khớp.
  - **Trần cặp nguồn:** giữ trong bộ nhớ của mỗi instance API. View đầu tiên trong ngày của một site đọc các cặp đã lưu. Các view tới trong lúc đang đọc chờ chính lần đọc đó, nên một loạt request dồn dập không vượt được trần; nếu lần đọc lỗi, view kế tiếp đọc lại. Một view của hôm qua tới trễ, sau view đầu tiên của hôm nay, được so với các cặp của hôm qua và không thay chỗ các cặp của hôm nay. Cặp thứ 51 trở đi trong ngày ghi vào `(other) / (other)`, màn 11 hiện là "khác". Khi chạy nhiều instance, một site có thể lưu nhiều hơn 50 cặp một chút.
    - Truy cập trực tiếp `(direct)/(none)` và lượt tìm kiếm tự nhiên của các công cụ tìm kiếm (`google`, `bing`, `coccoc`, `yahoo`, `duckduckgo`, `yandex` với kênh `organic`) luôn giữ tên và không chiếm chỗ trong 50 cặp. Nhờ vậy utm bịa ra không đẩy được chúng vào "khác".
    - Cặp của chiến dịch vẫn có thể bị đẩy vào "khác" nếu ai đó gửi đủ 50 cặp utm rác trong một ngày. Đây là giới hạn được chấp nhận, vì beacon vốn giả mạo được.
    - Giá trị nguồn bỏ ký tự điều khiển: xuống dòng thành một khoảng trắng. Khi cắt ở 40 đơn vị UTF-16, chỉ cắt ở ranh giới ký tự mà người đọc thấy: emoji, cờ hay emoji ghép bằng ZWJ hoặc được giữ nguyên, hoặc bị bỏ cả. Khóa của một cặp là `JSON.stringify([source, medium])`, nên hai cặp khác nhau không bao giờ trùng khóa.
  - **Báo cáo** (mọi thành viên):
    - Khoảng 7, 30 hoặc 90 ngày gồm hôm nay, so với cùng số ngày ngay trước đó.
    - Ba aggregation: view của site hoặc của trang, khách theo trang, lead. Thêm một lần đọc tiêu đề trang.
    - Bảng nguồn ghép lead theo cặp nguồn đã chuẩn hóa như lead, tối đa 20 dòng, nhiều khách trước.
    - "Theo trang" chỉ có khi xem tất cả trang. Lọc theo một trang của site khác thì ra số 0.
  - **Màn 11:**
    - Biểu đồ cột một chuỗi (màu `--chart-bar`, cột đang chọn `--chart-bar-emphasis`) và thanh thiết bị hai màu `--chart-series-1/2`. Các màu được kiểm bằng validator của skill dataviz: mọi mark ≥ 3:1, hai màu thiết bị CVD ΔE 26.
    - Mỗi ngày là một nút: rê chuột hoặc phím mũi tên đều hiện tooltip, và có chế độ "Xem dạng bảng".
    - Bộ lọc nằm trên URL. Khi tải lại số liệu, số cũ được làm mờ thay vì hiện khung trống. Số cũ vẫn mang nhãn khoảng thời gian và trang của chính nó, vì cache giữ báo cáo cùng bộ lọc đã tạo ra nó.
    - Biểu đồ không dựng lại khi báo cáo mới tới, nên focus trên nút và trên cột vẫn được giữ.
      - Điểm dừng Tab và tooltip gắn với ngày, không gắn với vị trí cột. Ngày đó không còn trong báo cáo mới thì cột hôm nay nhận cả điểm dừng lẫn focus.
      - Lựa chọn "Xem dạng bảng" được giữ khi đổi bộ lọc.
    - Quay lại màn bằng sidebar: bản render mới của server thay báo cáo cũ trong cache. Chuyển lead vào hoặc ra khỏi spam, hay xóa dữ liệu một người, thì báo cáo được đọc lại.
    - Tooltip đóng bằng Escape, dù mở bằng chuột hay bàn phím, và focus không đổi chỗ (WCAG 1.4.13). Tooltip không ra khỏi vùng biểu đồ.
    - Trên màn cảm ứng:
      - Chạm vào cột bằng ngón tay hoặc bút thì tooltip ở lại.
      - Vuốt để cuộn thì tooltip không ở lại.
      - Dòng gợi ý đổi thành "Chạm vào cột".
    - Nhãn ngày theo độ rộng thật của biểu đồ (container query):
      - Rộng: một dòng.
      - Biểu đồ dưới 661 px: khoảng 30 và 90 ngày bỏ một nửa số nhãn, để nhãn hôm nay (căn mép phải) không chạm nhãn trước nó.
      - Dưới 561 px: thứ nằm trên ngày.
      - Dưới 401 px (điện thoại): khoảng 7 ngày chỉ có thứ; 30 và 90 ngày chỉ có ngày.
      - Nhãn hôm nay không tràn khỏi biểu đồ.
      - Đã quét bằng script trên build production: 14 ngày kết thúc khác nhau, 3 khoảng, cửa sổ 320–1440 px. Không có nhãn đè nhau hay tràn ra ngoài. Riêng cửa sổ 320–326 px với khoảng 90 ngày, hai nhãn chỉ cách nhau khoảng 2 px.
  - **Thành viên:** "Xem site live", "Xem trang live" và "Mở trang live" trong admin thêm `?plp_internal=1` (`internalVisitUrl`). Mã QR và nút sao chép giữ địa chỉ gốc.
  - **Trọng lượng trang live:**
    - Script đếm view chỉ import `@plp/contracts/page-view`, một module không có zod.
    - Script của form được tải lười (`React.lazy`, fallback là form tĩnh vẽ ở server, vẫn gửi được khi tắt JavaScript).
    - Kết quả đo trên build production: trang không có form không còn tải chunk 38 KB gzip của schema và form. Chỉ còn phần nền của framework và khoảng 1 KB của script đếm view.
- **Amended 2026-10-31 (vòng test thứ ba):** sửa câu "Khi chạy nhiều instance, một site có thể lưu nhiều hơn 50 cặp một chút".
  - Mỗi instance đọc các cặp đã lưu một lần, ở lượt xem có chiến dịch đầu tiên trong ngày, rồi đếm riêng. Với N instance, một site lưu được gần N × 50 cặp mỗi ngày; test với hai instance ra 99 cặp.
  - Số khách duy nhất và số lượt xem cộng đúng qua các instance.

### ADR-020 — Vai trò cố định, phạm vi site và kiểm tra quyền

- **Date:** 2026-11-01 · **Status:** Accepted
- **Context:**
  - Chủ sản phẩm yêu cầu triển khai Phase 1 của artifact thiết kế ("Vận hành & đội nhóm", màn 13–16, 15b, Sidebar v2) ngày 2026-11-01.
  - Lấy các giả định của ghi chú "Phase 1 · Giả định đang vẽ" làm quyết định, trừ những mục ghi ở **Ngoài phạm vi**.
  - Lát này là C1; thành viên và lời mời ở C2, tên miền riêng ở C3.
- **Decision:**
  - **Sáu vai trò cố định:** `owner` (Chủ sở hữu), `admin` (Quản trị), `editor` (Biên tập), `contributor` (Cộng tác viên), `support` (Chăm sóc khách hàng), `viewer` (Chỉ xem). Không sửa được.
  - **Quyền** là một dòng của màn 16. Bảng quyền nằm trong `@plp/contracts` (`can`, `rolesWith`, `holdersOf`). API kiểm tra bằng bảng này, admin ẩn thao tác bằng chính bảng này.

    | Quyền                                                            | Chủ sở hữu | Quản trị | Biên tập | Cộng tác viên | CSKH | Chỉ xem |
    | ---------------------------------------------------------------- | ---------- | -------- | -------- | ------------- | ---- | ------- |
    | `pages.view`: xem trang, bản nháp, hiệu quả, xem trước           | ✓          | ✓        | ✓        | ✓             | ✓    | ✓       |
    | `pages.edit`: sửa bản nháp, section, SEO, tạo trang, tải ảnh     | ✓          | ✓        | ✓        | ✓             |      |         |
    | `pages.publish`: xuất bản                                        | ✓          | ✓        | ✓        |               |      |         |
    | `pages.manageLive`: rollback, hoàn tác, gỡ trang                 | ✓          | ✓        | ✓        |               |      |         |
    | `leads.view`: hộp thư lead, số lead, nơi nhận lead               | ✓          | ✓        |          |               | ✓    |         |
    | `leads.handle`: trạng thái, ghi chú, spam, "Gửi lại"             | ✓          | ✓        |          |               | ✓    |         |
    | `leads.export`: xuất CSV                                         | ✓          | ✓        |          |               |      |         |
    | `personalData.manage`: yêu cầu dữ liệu, sửa và xóa một người     | ✓          | ✓        |          |               |      |         |
    | `privacy.manage`: cài đặt dữ liệu cá nhân, đồng ý, nơi nhận lead | ✓          | ✓        |          |               |      |         |
    | `sites.manage`: tạo site, tên, logo, giao diện                   | ✓          | ✓        |          |               |      |         |
    | `domains.manage`: tên miền                                       | ✓          | ✓        |          |               |      |         |
    | `members.manage`: vai trò & quyền, thành viên                    | ✓          | ✓        |          |               |      |         |
    | `accessRequests.decide`: duyệt yêu cầu đổi quyền (ADR-021)       | ✓          |          |          |               |      |         |
    | `workspace.transferOwnership`: chuyển quyền sở hữu (ADR-021)     | ✓          |          |          |               |      |         |
    - "Xem lead" và "Xuất / xóa dữ liệu cá nhân" là hai quyền riêng, như ghi chú Phase 1.
    - Cài đặt dữ liệu cá nhân và phiên bản đồng ý vẫn đọc được với `pages.view`, vì chúng hiện trên trang live và Biên tập cần biết form sẽ hiện gì.
    - `sites.manage` không có trên màn 16. Nó thay quy tắc "chỉ Owner tạo site và sửa cài đặt site" của ADR-004, và màn 16 có thêm dòng "Site".

  - **Phạm vi:** `memberships.siteIds` là danh sách site, hoặc `null` cho toàn workspace kể cả site tạo sau. Chủ sở hữu và Quản trị luôn là `null`. Membership cũ không có trường này được đọc như `null`.
  - **Kiểm tra ở API:**
    - `SitesService.access(user, siteId, permission)` và các lối vào theo trang, lead, asset, yêu cầu dữ liệu, activity bắt buộc nhận quyền. Một endpoint quên khai báo quyền là lỗi biên dịch.
    - Thứ tự: site không tồn tại, của workspace khác, hoặc ngoài phạm vi của thành viên thì 404 (ADR-003). Vai trò thiếu quyền thì 403 `forbidden`, tiêu đề "Chỉ {các vai trò có quyền} được thực hiện thao tác này".
    - Danh sách site của workspace chỉ có các site trong phạm vi. `GET /auth/me` trả `siteIds` của từng membership.
    - Endpoint cấp workspace (tạo site, `GET /workspaces/:id/role-counts`) kiểm tra membership rồi quyền qua `AccessService.require`.
  - **Admin:**
    - Sidebar v2: nhóm WORKSPACE ("Vai trò & quyền"), bộ đổi site, các mục của site. Mỗi mục chỉ hiện với vai trò có quyền của nó. "Cài đặt site" hiện với `pages.edit` (chỉ đọc khi thiếu `sites.manage`), "Dữ liệu & đồng ý" với `privacy.manage`, "Tên miền" với `domains.manage`.
    - Màn 16 ở `/workspaces/:id/roles`: danh sách vai trò với số thành viên, ma trận quyền là một `<table>`. Vai trò thiếu `members.manage` thấy trạng thái "Bạn chưa có quyền xem vai trò & quyền".
    - Màn của workspace dùng khung sidebar như màn của site, với site mở gần nhất. Site đó nhớ bằng cookie `plp_site`, chỉ là tùy chọn giao diện; API vẫn kiểm tra mọi request.
    - Vai trò thiếu `pages.edit` mở trang ở "Lịch sử phiên bản": xem các phiên bản và bản xem trước, không có nút thay đổi. Editor và "SEO & chia sẻ" chuyển hướng về đó; "Tạo trang" và hộp thư lead hiện trạng thái thiếu quyền.
    - Cộng tác viên mở hộp thoại xuất bản để xem kiểm tra, nút "Xuất bản" bị khóa với lý do "Chỉ Chủ sở hữu, Quản trị và Biên tập được xuất bản trang".
    - Chữ "Owner"/"Editor" trên giao diện đổi thành tên vai trò tiếng Việt; ghi chú "ai làm bước này" lấy từ bảng quyền.
  - **Thay đổi so với MVP B:** Biên tập không còn xem và xử lý lead (màn 16); việc đó thuộc Chăm sóc khách hàng. Chưa có dữ liệu thật (§6), nên không cần migration.
- **Ngoài phạm vi** (chọn mặc định, chờ chủ sản phẩm chốt):
  - Luồng "Yêu cầu xuất bản" của Cộng tác viên (ô "Yêu cầu" trên màn 16). Hiện Cộng tác viên chỉ lưu bản nháp.
  - Vai trò tùy chỉnh và nút "Vai trò tùy chỉnh"; "Nhờ … cấp quyền" ở trạng thái thiếu quyền.
  - Nhãn "Theo gói" và "Nâng cấp" (Phase 4); các dòng AI, template, automation, thanh toán, "Chuyển quyền sở hữu" của màn 16 có cùng tính năng của chúng.
  - Trong C1, Quản trị làm được mọi việc của Chủ sở hữu. Khác biệt (chuyển quyền sở hữu, thanh toán) đến ở C2 và Phase 4.
  - `domains.manage` chỉ ẩn/hiện mục "Tên miền" cho tới C3.
- **Amended 2026-11-01 (chủ sản phẩm chốt sau C1):**
  - Luồng "Yêu cầu xuất bản" của Cộng tác viên được làm, là một luồng duyệt: Cộng tác viên gửi yêu cầu, Chủ sở hữu và Quản trị duyệt (lát C4, ADR-023). Nút "Xuất bản" bị khóa của Cộng tác viên đổi thành "Gửi duyệt".
  - Vai trò tùy chỉnh được làm (lát C5).
  - Quản trị vẫn làm được mọi việc của Chủ sở hữu, trừ những gì ADR-021 giữ cho Chủ sở hữu.
  - Nhãn "Theo gói", "Nâng cấp" và các dòng AI, template, automation, thanh toán của màn 16 vẫn đến cùng tính năng của chúng (Phase 2–4): chưa có gói hay tính năng nào để gắn nhãn.
- **Reason:** Một bảng quyền dùng chung, kiểm tra ở một lối vào duy nhất mà trình biên dịch buộc phải dùng; giao diện không thể cho phép điều API từ chối.
- **Consequences:**
  - `role-matrix.int.spec.ts` gọi mọi endpoint có session với sáu vai trò, một thành viên chỉ được vào site khác và người ngoài workspace. Lời gọi bị từ chối không đổi dữ liệu.
  - Thêm một endpoint theo site mà không chọn quyền thì không biên dịch được. Thêm một quyền thì phải thêm dòng của nó trên màn 16 (`permissionGroups`) và vào ma trận test.
  - E2E của các vai trò khác Chủ sở hữu chờ lời mời (C2); C1 có E2E của màn 16 và test giao diện theo từng vai trò.
- **Amended 2026-11-02 (ADR-030, lát G2):** bảng quyền có thêm `templates.manage` ("Lưu và quản lý template của workspace", nhóm Nội dung): Chủ sở hữu, Quản trị và Biên tập.

### ADR-021 — Thành viên, lời mời, yêu cầu đổi quyền và chuyển quyền sở hữu

- **Date:** 2026-11-01 · **Status:** Accepted
- **Context:** Lát C2 của Phase 1 (màn 15, 15b). Chủ sản phẩm chốt ngày 2026-11-01:
  - Chỉ Chủ sở hữu và Quản trị đổi quyền của thành viên.
  - Thành viên cấp dưới muốn đổi quyền thì gửi yêu cầu; email về Chủ sở hữu để duyệt.
  - Chuyển quyền sở hữu chỉ do Chủ sở hữu làm, có hiệu lực ngay, không cần người nhận đồng ý qua email.
  - Màn "Thành viên" chỉ dành cho Chủ sở hữu và Quản trị.
- **Decision:**
  - **Quyền mới** (ADR-020): `accessRequests.decide` (duyệt yêu cầu đổi quyền) và `workspace.transferOwnership`, chỉ Chủ sở hữu. `members.manage` (Chủ sở hữu, Quản trị) mời, đổi quyền, gỡ thành viên.
  - **Đổi quyền:** `PATCH /workspaces/:id/members/:userId { role, siteIds }`.
    - Không giao vai trò Chủ sở hữu, không đổi hay gỡ Chủ sở hữu. Quản trị đổi được Quản trị khác.
    - Quản trị luôn có `siteIds = null`. Vai trò khác có `null` (toàn workspace) hoặc 1–100 site của chính workspace đó.
    - Quyền mới có hiệu lực ở request kế tiếp, vì mọi request đều đọc lại membership (ADR-020).
  - **Gỡ thành viên:** `DELETE /workspaces/:id/members/:userId`. Gỡ luôn yêu cầu đổi quyền đang chờ của người đó. Chủ sở hữu không bị gỡ (409); muốn rời workspace thì chuyển quyền sở hữu trước.
  - **Chuyển quyền sở hữu:** `POST /workspaces/:id/ownership { toUserId, confirmName }`.
    - Chỉ Chủ sở hữu; người nhận phải đang là Quản trị; `confirmName` phải đúng tên workspace.
    - Một transaction: người nhận thành Chủ sở hữu, người chuyển thành Quản trị. Mỗi workspace luôn có đúng một Chủ sở hữu.
  - **Lời mời** (collection `invitations`):
    - `{ workspaceId, email, role, siteIds, tokenHash, expiresAt, invitedBy, createdAt, sentAt|null, status: pending|accepted|revoked|declined, closedAt|null, purgeAt }`.
    - Mỗi lần mời tối đa 10 email; vai trò không là Chủ sở hữu. Mỗi workspace tối đa 100 người, tính cả thành viên và lời mời đang chờ.
    - Link `{ADMIN_ORIGIN}/invite#token=…`: token 32 byte, DB chỉ giữ sha256, như link xác nhận nơi nhận lead (ADR-018).
    - Link có hạn 7 ngày, chỉ dùng một lần, chỉ cho đúng email được mời. "Gửi lại" tạo token mới và tính lại 7 ngày; link cũ hết tác dụng.
    - Email đã là thành viên thì không mời. Mỗi email chỉ có một lời mời đang chờ trong một workspace (unique partial index).
    - Giới hạn email mỗi 24 giờ, đếm trước khi gửi và trả lại khi không gửi được, như ADR-018 (cùng một `EmailQuota` với thư xác nhận nơi nhận lead): 50 lời mời mỗi workspace, 5 lời mời cho một hộp thư từ mọi workspace. Vượt giới hạn thì cả request bị từ chối (429), không tạo lời mời nào, và mọi email đã đếm được trả lại.
    - Sửa ngày 2026-11-01 sau vòng test Phase 1:
      - Giới hạn theo hộp thư: bỏ phần `+tag` và chữ hoa; với Gmail, bỏ cả dấu chấm. Trước đó `an+1@`, `an+2@`… mỗi địa chỉ có 5 lời mời riêng nhưng cùng vào một hộp thư.
      - Kiểm tra giới hạn 100 người và tạo lời mời nằm trong một transaction có tăng `inviteSeq` của workspace (như `siteSeq` của ADR-014). Hai lượt mời cùng lúc không thể cùng vừa giới hạn.
      - Nhận hoặc từ chối lời mời đóng nó theo cả `tokenHash`, nên link cũ không dùng được nữa kể cả khi "Gửi lại" xảy ra cùng lúc.
    - Email gửi lỗi thì lời mời vẫn còn, `sentAt = null`, và "Gửi lại" thử lại.
    - Lời mời đã đóng (nhận, thu hồi, từ chối) và lời mời hết hạn tự xóa sau 30 ngày (TTL `purgeAt`).
  - **Nhận lời mời** (màn 15b):
    - Trang `/invite` của admin mở được khi chưa đăng nhập, như trang xác nhận nơi nhận lead.
    - `POST /public/invitations/lookup { token }` (không cần session, có rate limit như `/auth/*`): trả trạng thái, tên workspace, người mời, email, vai trò, tên các site và `accountExists`. Token nằm trong body, không nằm trong URL của API.
    - Chưa có tài khoản: `POST /auth/signup/invited { token, name, password }`. Một transaction tạo user với email của lời mời, membership và đóng lời mời, rồi đăng nhập. Không tạo workspace riêng.
    - Đã đăng nhập đúng email: `POST /invitations/accept` hoặc `/decline { token }`. Sai email thì 403, admin mời đăng xuất rồi dùng email được mời.
    - Nhận lời mời và tạo membership nằm trong một transaction, có điều kiện lời mời còn `pending` và chưa hết hạn, nên một link không dùng được hai lần.
  - **Yêu cầu đổi quyền** (collection `access_requests`):
    - Thành viên không có `members.manage` gửi `{ role, wholeWorkspace, note }` từ menu tài khoản hoặc từ trạng thái thiếu quyền.
    - Mỗi người có tối đa một yêu cầu đang chờ trong một workspace; gửi tối đa 5 yêu cầu mỗi 24 giờ.
    - Email tới Chủ sở hữu có link mở yêu cầu trên màn Thành viên. Link chỉ mở màn, không tự duyệt: chuyển tiếp email không cấp được quyền.
    - Chủ sở hữu duyệt bằng chính hộp thoại "Đổi quyền", điền sẵn theo yêu cầu và sửa được vai trò, site trước khi lưu. Hoặc từ chối.
    - Người yêu cầu nhận email kết quả. Yêu cầu đã quyết tự xóa sau 30 ngày.
  - **Admin:**
    - Màn 15 ở `/workspaces/:id/members`: tab "Đang hoạt động", "Lời mời đang chờ" và, với Chủ sở hữu, "Yêu cầu đổi quyền".
    - Lọc theo vai trò, site, tìm theo tên hoặc email, trên danh sách đã nạp (tối đa 100 người).
    - Hộp thoại mời thành viên, đổi quyền, gỡ, chuyển quyền sở hữu.
    - Cột "Hoạt động" của board đổi thành "Tham gia" (ngày vào workspace): hệ thống không lưu lần hoạt động cuối.
    - Sidebar v2 thêm "Thành viên" trước "Vai trò & quyền".
- **Ngoài phạm vi:**
  - Thông báo "Quyền của bạn vừa thay đổi" khi đang sửa trang (màn 16). Lần lưu kế tiếp nhận 403/404 như hiện nay.
  - Nhật ký thay đổi thành viên: activity hiện gắn với site (ADR-005), còn thay đổi thành viên thuộc workspace.
  - Thành viên tự rời workspace.
- **Reason:** Quyền chỉ đổi qua người có `members.manage` hoặc qua duyệt của Chủ sở hữu. Lời mời là một bí mật dùng một lần, có hạn và gắn với email. Mọi giới hạn và trạng thái nằm trong MongoDB, nên đúng với nhiều instance API.
- **Consequences:**
  - Integration test cho mọi endpoint mới với sáu vai trò, người ngoài workspace và trường hợp chạy song song (hai lần nhận cùng một link, hai lời mời cùng email).
  - E2E: mời qua Mailpit, đăng ký từ link, đổi quyền, yêu cầu và duyệt, chuyển quyền sở hữu, thu hồi.
- **Amended 2026-11-01 (vòng test sau Phase 1):**
  - Không ai tự đổi quyền hay tự gỡ mình (409), vì đó là "tự rời workspace", vẫn ngoài phạm vi. Màn 15 không có "Đổi quyền" trên dòng của chính mình.
  - Lời mời không sống lâu hơn quyền mời.
    - Gỡ một thành viên, đổi họ sang vai trò không có `members.manage`, hoặc chấp nhận một yêu cầu làm việc đó: các lời mời họ gửi còn chờ bị thu hồi, trong cùng transaction.
    - Mời và "Gửi lại" ghi lên membership của người mời (`inviteSeq`), chỉ khi họ còn `members.manage`. Một lần đổi quyền cùng lúc vì thế xung đột với đợt mời, và đợt mời thấy vai trò mới.
    - "Gửi lại" ghi người gửi lại làm người mời.
  - Đổi một thành viên thành Quản trị, hoặc chuyển quyền sở hữu cho họ, thì đóng yêu cầu đổi quyền đang chờ của họ. Họ tự đổi được quyền, và Chủ sở hữu không duyệt yêu cầu của chính mình.
  - Nhận lời mời khi đã là thành viên thì đóng lời mời và giữ vai trò cũ.
    - Membership được đọc trong transaction.
    - Không bắt lỗi khóa trùng bên trong transaction. MongoDB đã hủy transaction đó, nên lần commit sau sẽ được thử lại tới 120 giây.
  - Việc đọc thông tin để gửi email (Chủ sở hữu, workspace) là một phần của việc gửi. Lỗi ở bước này chỉ được log; yêu cầu đã lưu thì không trả 500.
  - `/workspaces/:id` chuyển tới "Thành viên", hoặc trang chủ với vai trò không quản lý thành viên. Đây là nơi người dùng quay về khi đăng nhập lại từ một màn workspace. (Từ 2026-11-02 chuyển tới màn Sites, ADR-028.)
  - Trang bắt đầu (`/`) mở workspace đã chọn (cookie `plp_ws`, đặt bởi bộ chuyển workspace và trang nhận lời mời), kể cả khi workspace đó chưa có site. Chưa chọn workspace nào (lần đăng nhập đầu) mà workspace đầu tiên không có site và người dùng không tạo được site ở đó, thì trang mở site đầu tiên của một workspace khác, hoặc trang tạo site ở workspace mà họ được tạo. Cookie trỏ tới một workspace họ đã rời không tính là đã chọn. Không còn nơi nào như vậy thì trang tạo site của workspace đầu tiên giải thích rằng chỉ Chủ sở hữu và Quản trị tạo được site.
- **Amended 2026-11-02 (khớp thiết kế màn 15, 15b):**
  - **Hộp thoại mời:**
    - Email tách thành thẻ khi gõ dấu phẩy, khoảng trắng hoặc Enter, và khi dán.
    - Mỗi thẻ báo ngay "Đã là thành viên", "Đang có lời mời" hay "Email không hợp lệ", dựa trên danh sách màn 15 đã nạp. Nút gửi đếm các email mời được. API vẫn là nơi quyết định.
  - **Đổi quyền:** có câu "Tóm tắt thay đổi" nói vai trò cũ → mới và các site thêm, gỡ.
  - **Bộ lọc** vai trò, site và tìm kiếm áp dụng cho cả tab "Lời mời đang chờ".
  - **Màn 15b:**
    - Lời mời hết hạn có nút "Nhờ {người mời} gửi lại", là link `mailto:` tới email người mời.
    - `lookup` trả `inviterEmail` chỉ khi lời mời đã hết hạn. Người cầm link chính là người được mời, và email đó đã gửi thư cho họ.
    - Có ô chữ cái đầu của workspace, và dòng cuối "Không biết người mời? Bạn có thể bỏ qua email này. Lời mời tự hết hạn sau 7 ngày."
  - **Chi tiết khi làm (lát E2):**
    - Màn 06: "Đã xuất bản · N" là nhãn chữ cạnh tiêu đề "Phiên bản đã xuất bản", không phải tiêu đề thứ hai. Tóm tắt release có `capturesLeads` (suy ra từ `leadCapture`), để panel rollback biết release đích có form.
    - Hộp thoại mời:
      - Dấu chấm phẩy và xuống dòng cũng tách email. Email đang gõ được tính, và thành thẻ khi rời ô hay khi gửi.
      - Thẻ "Email không hợp lệ" chặn gửi cho tới khi bị bỏ. Thành viên và email đang có lời mời được bỏ qua, không gửi. Không còn email nào mời được thì báo "Các email này đã là thành viên hoặc đang có lời mời".
      - Giới hạn 10 email áp cho số email mời được.
    - "Tóm tắt thay đổi" thêm các câu board không có: đổi vai trò, toàn workspace, "Chưa có thay đổi."; site màn hình không biết được đếm là "N site khác".
    - Dòng cuối của màn 15b hiện ở mọi trạng thái của lời mời.
    - Tìm thành viên và lời mời bỏ dấu và không phân biệt hoa thường, bằng cùng `foldVietnamese` (nay ở `@plp/contracts`) với hộp thư lead; lời mời chỉ tìm theo email.
    - Dán danh bạ dạng `Tên <email>` (Gmail, Outlook) lấy địa chỉ trong ngoặc nhọn. Email có lời mời đã hết hạn báo "Lời mời đã hết hạn — dùng Gửi lại". Lỗi chặn gửi được đọc qua vùng live và focus về ô email.
    - Màn 15b: link `mailto:` có tiêu đề và nội dung, và hiện email người mời. Từ chối hay tham gia hiện kết quả của chính lựa chọn đó.
  - **Sửa 2026-11-02 (review giao diện vòng 2):**
    - "Tóm tắt thay đổi" chỉ so các site còn trong workspace: hộp thoại chưa sửa gì của thành viên giữ một site đã xóa ghi "Chưa có thay đổi.".
    - Kết quả từ chối hay tham gia, và lỗi của hai nút đó, thuộc về link đã chọn: mở link mời khác trong cùng tab thì hiện lời mời của link đó.
    - Thẻ "đã từ chối" có "Về trang chủ".

### ADR-022 — Tên miền riêng: on-demand TLS, không trùng tên miền, địa chỉ chính

- **Date:** 2026-11-01 · **Status:** Accepted
- **Context:**
  - Lát C3 của Phase 1 (màn 13, 14, cập nhật màn 08).
  - Chủ sản phẩm chốt ngày 2026-11-01: khách gắn được tên miền tùy ý, nhưng không bao giờ có hai site cùng một tên miền.
- **Decision:**
  - **HTTPS: on-demand TLS ở biên (Caddy).**
    - Caddy xin chứng chỉ Let's Encrypt ở lần bắt tay TLS đầu tiên của một host. Trước đó nó hỏi `GET /public/tls/allowed?domain=…` của API.
    - API chỉ trả 200 cho tên miền riêng đã xác minh, đang trỏ đúng; mọi host khác là 404. Người lạ trỏ DNS về hệ thống không làm Caddy xin chứng chỉ.
    - Địa chỉ mặc định `{subdomain}.{BASE_DOMAIN}` dùng chung một chứng chỉ wildcard `*.{BASE_DOMAIN}` (DNS-01, §6), không qua `ask`. Sửa ngày 2026-11-01 sau vòng test Phase 1: trước đó mọi site có thật đều được xin chứng chỉ riêng, nên ai tạo hàng loạt site là dùng hết giới hạn chứng chỉ của CA cho `BASE_DOMAIN` (Let's Encrypt: 50 chứng chỉ mỗi tuần).
    - Không mất phí theo tên miền, không phụ thuộc nhà cung cấp, nên khách gắn tên miền tự do.
    - Cấu hình Caddy và IP tĩnh nằm ở §6.
  - **Tên miền** (collection `domains`):
    - `{ workspaceId, siteId, hostname, token, addedBy, createdAt, verifiedAt|null, check, activeSince|null, lostSince|null, nextCheckAt|null }`.
    - `hostname` được chuẩn hóa: chữ thường, IDN thành punycode, không cổng, không dấu chấm cuối, tối đa 253 ký tự.
    - Bị từ chối: tên miền dưới `BASE_DOMAIN`, địa chỉ IP, `localhost`, tên chỉ một nhãn.
    - Mỗi site tối đa 5 tên miền riêng, mỗi tên miền một lần (unique `siteId, hostname`).
  - **Không trùng tên miền:**
    - Một tên miền chỉ có một chủ: unique partial index `hostname` trên các bản ghi đã xác minh (`verifiedAt` khác null).
    - Site khác thêm cùng tên miền thì thấy "đang được một site khác dùng", không biết là site nào. Tên miền chỉ chuyển sang site mới khi bản ghi TXT chứa đúng token của site mới.
    - Việc chuyển chạy trong một transaction: bản ghi cũ bị gỡ (nếu đang là địa chỉ chính thì site cũ quay về địa chỉ mặc định), bản ghi mới thành chủ. Người đã thêm tên miền ở site cũ nhận email.
    - Index bảo đảm hai lần xác minh chạy song song không tạo ra hai chủ.
  - **Bản ghi DNS:**
    - Tên miền phụ: CNAME tới `CUSTOM_DOMAIN_CNAME_TARGET`. Tên miền gốc: A tới `CUSTOM_DOMAIN_IPV4` (một hoặc nhiều IP).
    - Xác minh quyền sở hữu: TXT `_payload.{hostname}` = `payload-verify={token}`. Token 16 byte ngẫu nhiên, riêng cho từng bản ghi.
    - Phân biệt tên miền phụ hay gốc chỉ để hướng dẫn (hai nhãn, hoặc ba nhãn với hậu tố như `com.vn`). Khi kiểm tra, CNAME đúng hoặc mọi bản ghi A thuộc IP của hệ thống đều được chấp nhận.
  - **Kiểm tra DNS và HTTPS:**
    - Interface `DomainDns`: production dùng `node:dns/promises` (timeout 5 giây). `DOMAIN_DNS_ZONE_FILE` đọc câu trả lời từ một file JSON, chỉ cho phát triển và E2E; production từ chối biến này.
    - `DOMAIN_TLS_CHECK=on` (production): mở kết nối 443 tới IPv4 đầu tiên của biên (`CUSTOM_DOMAIN_IPV4`) với SNI là tên miền; chứng chỉ phải hợp lệ, đọc hạn dùng. `off` khi phát triển và E2E, vì không có biên TLS.
    - Không kết nối tới nơi DNS của khách trỏ: một tên miền có thể trỏ vào mạng nội bộ (SSRF). API không khởi động khi bật kiểm tra mà thiếu `CUSTOM_DOMAIN_IPV4` (sửa ngày 2026-11-01 sau vòng test Phase 1).
  - **Trạng thái** (hàm thuần, từ lần kiểm tra gần nhất), khớp chú thích màn 13:
    - `taken`: chưa xác minh, site khác đang là chủ.
    - `pending_dns` "Chờ DNS": chưa thấy bản ghi.
    - `misconfigured` "Cấu hình sai": thấy bản ghi nhưng sai giá trị.
    - `issuing` "Đang cấp chứng chỉ": đã xác minh, DNS đúng, chưa có HTTPS hợp lệ.
    - `active` "Hoạt động".
    - `lost` "Mất kết nối": từng hoạt động, nay DNS không còn trỏ đúng.
    - `needs_attention` "Cần can thiệp": DNS đúng mà HTTPS không hợp lệ quá 1 giờ.
  - **Tự kiểm tra:**
    - Mỗi instance API mỗi phút lấy tối đa 50 tên miền tới hạn (`nextCheckAt`), 5 kiểm tra cùng lúc (chỗ trong vòng được giữ trước khi nhận, nên không vượt 50), và thôi nhận thêm sau 60 giây. Mỗi tên miền được giữ bằng một update có điều kiện, tính theo giờ lúc nhận nó, nên hai instance không kiểm tra cùng lúc.
    - Chưa xác minh: mỗi phút trong giờ đầu, rồi mỗi 10 phút, dừng sau 7 ngày ("Kiểm tra ngay" chạy lại), kể cả khi DNS không trả lời. Đã xác minh: mỗi 10 phút; đang cấp chứng chỉ: mỗi phút.
    - Kết quả DNS của tên miền vừa trỏ đúng được lưu trước lượt kiểm tra HTTPS đầu tiên, để `ask` của biên cho phép xin chứng chỉ ngay lượt đó.
    - Email "đã hoạt động" và "mất kết nối" chỉ do lượt kiểm tra đặt được `activeSince` hoặc `lostSince` (update có điều kiện) gửi, nên hai lượt kiểm tra cùng lúc không gửi hai lần. Lần xác minh không thành thì hủy cả transaction chuyển chủ.
    - Email cho người thêm tên miền khi tên miền bắt đầu hoạt động và khi mất kết nối.
    - `DOMAIN_MONITOR_INTERVAL_MS=0` tắt vòng tự kiểm tra (integration test gọi trực tiếp).
  - **Địa chỉ chính:**
    - `sites.primaryDomainId` (null là địa chỉ mặc định). Chỉ tên miền `active` mới được đặt làm chính; không ngắt được địa chỉ chính.
    - Đặt địa chỉ chính và ngắt tên miền chạy trong transaction. Đặt địa chỉ chính ghi cả bản ghi tên miền (`primarySetAt`), nên ngắt hoặc chuyển chủ cùng lúc sẽ xung đột thay vì để site trỏ tới một tên miền đã mất.
    - Renderer chuyển hướng 301 mọi host khác của site (mặc định và tên miền riêng khác) về địa chỉ chính, giữ đường dẫn và query, chỉ khi địa chỉ chính đang `active`. Khi nó mất kết nối, mọi host phục vụ như thường, và admin báo "Tạm dùng địa chỉ mặc định".
    - Canonical, sitemap, robots, `liveUrl` dùng địa chỉ công khai của site: địa chỉ chính (`CUSTOM_DOMAIN_ORIGIN_TEMPLATE`, mặc định `https://{host}`), nếu không thì địa chỉ mặc định. Link xem trước vẫn ở địa chỉ mặc định.
    - Đổi địa chỉ chính, thêm, gỡ, hay một tên miền đổi trạng thái đều revalidate site.
  - **Renderer:**
    - Host dưới `BASE_DOMAIN` là subdomain như trước. Host khác hỏi `GET /public/hosts/:host` để biết subdomain (chỉ tên miền đã xác minh và đang trỏ đúng).
    - `GET /public/sites/:subdomain/address` trả host chính đang hoạt động. Cả hai được cache dưới tag của site; host lạ cache 60 giây.
    - Form và đếm lượt xem trên tên miền riêng đi qua cùng phân giải. Nguồn truy cập coi mọi host của site là nội bộ.
  - **Quyền:** `domains.manage` (Chủ sở hữu, Quản trị) cho mọi endpoint tên miền.
- **Ngoài phạm vi:**
  - Tab "Đăng nhập nhà cung cấp" (Domain Connect).
  - "Sao chép link hướng dẫn" cho người không có tài khoản.
  - Tên miền wildcard, bản ghi AAAA cho tên miền gốc.
- **Reason:** Chi phí bằng 0 theo tên miền và không khóa nhà cung cấp. Không trùng tên miền nhờ index của MongoDB và bằng chứng TXT, chứ không nhờ thứ tự request. Renderer không đổi cách phục vụ trang; nó chỉ phân giải host thành site.
- **Consequences:**
  - Integration test cho chuẩn hóa tên miền, giới hạn, chuyển chủ (kể cả hai lần xác minh song song), trạng thái, tự kiểm tra trên nhiều instance, `tls/allowed`, phân giải host và quyền.
  - E2E: kết nối một tên miền `*.e2e.test` (Chromium ánh xạ về máy, DNS từ zone file), đặt làm địa chỉ chính, trang mở ở tên miền riêng và địa chỉ mặc định chuyển hướng 301.
- **Amended 2026-11-01 (vòng test sau Phase 1):**
  - Email trạng thái tên miền gửi người đã thêm tên miền nếu họ còn `domains.manage` trên site. Nếu không còn, email gửi Chủ sở hữu: người đã bị gỡ không nhận gì, nhưng tin vẫn tới một người phụ trách. Việc đọc người nhận cũng là một phần của email: lỗi ở đó chỉ được log, kết quả kiểm tra vẫn được lưu.
  - Giới hạn 5 tên miền mỗi site được kiểm tra trong transaction tăng `domainSeq` của site, như `pageSeq` (ADR-014). Hai lần thêm cùng lúc không vượt giới hạn.
- **Amended 2026-11-02 (khớp thiết kế màn 01, 13, 14):**
  - **Activity của tên miền** (activity của site, ADR-005), `data` chỉ có `hostname`:
    - `domain.added`, `domain.removed`, `domain.primary_changed`: người làm là người dùng.
    - `domain.activated` (đã xác minh và có HTTPS) và `domain.lost`: do vòng tự kiểm tra ghi, `actorId` null, admin ghi "Hệ thống".
    - Chúng được ghi bởi đúng lần update có điều kiện đặt `activeSince` hay `lostSince`, như email, nên không ghi hai lần.
    - "Hoạt động gần đây" ở màn 01 hiện chúng cùng các sự kiện xuất bản.
  - **Kiểm tra trước khi thêm:** `GET /sites/:siteId/domains/availability?hostname=…` (`domains.manage`) trả `{ hostname, state }`.
    - `state` là `invalid` (kèm lý do), `already_added` (site này đã có), `taken` (một site khác đã xác minh) hoặc `available`. Không bao giờ nói site nào.
    - Màn 14 báo trùng ngay ở ô nhập, với "Tiếp tục để xác minh quyền sở hữu" như board.
  - **Màn 01:**
    - Checklist "Thiết lập site" có bước "Kết nối tên miền riêng", xong khi site có một tên miền `active`.
    - Thẻ "Địa chỉ live" ghi "Đã kết nối · HTTPS" khi địa chỉ chính là tên miền riêng đang hoạt động, và báo lỗi kèm link tới màn 13 khi nó mất kết nối.
  - **Màn 13 và 14:**
    - Mỗi dòng của màn 13 có dòng chẩn đoán như màn 14.
    - Tiêu đề bước của màn 14 đi theo trạng thái.
    - Hộp "Đặt làm chính" nêu số trang đang live sẽ đổi địa chỉ và một địa chỉ ví dụ.
  - **Chi tiết khi làm (lát E1):**
    - Màn 01 đọc `GET /sites/:siteId/address-status` (`pages.view`) → `{ primaryStatus, customDomainActive }`, một truy vấn ở master. Tên miền chính đang cấp chứng chỉ (`issuing`) không có "Xem cách sửa": không ai phải làm gì.
    - `DomainListResponse.livePages { count, exampleSlug }` cho hộp "Đặt làm chính" ở màn 13 và 14: một truy vấn có giới hạn; ví dụ là slug đầu tiên không phải trang chủ.
    - Sự kiện tên miền hiện với mọi vai trò có `pages.view`; chúng không có dữ liệu cá nhân. `actorId` null chỉ được nhận cho `domain.activated` và `domain.lost` (validator của schema); mọi nơi cần người làm (lịch sử, đánh giá trang) đi qua `pointerActorOf`.
    - `domain.primary_changed` chỉ ghi khi địa chỉ chính thật sự đổi; quay về địa chỉ mặc định thì `hostname` là host mặc định. `domain.activated` chỉ ghi lần hoạt động đầu (`activeSince` không bao giờ bị xóa); `domain.lost` ghi mỗi lần `lostSince` được đặt. Tên miền bị chuyển sang site khác không ghi gì ở site mất nó.
    - Vòng kiểm tra ghi sự kiện cùng transaction với update có điều kiện đặt mốc (master và workspace DB), và bỏ qua transaction khi bản ghi đã có mốc.
    - Kiểm tra trước khi thêm: `already_added` thắng `taken`; màn 14 hỏi sau 400 ms, request mới hủy request cũ, kết quả đọc qua vùng live.
    - Tiêu đề bước cho trạng thái board không vẽ: taken → "Xác minh quyền sở hữu", lost → "Sửa bản ghi DNS", needs_attention → "Chưa bật được HTTPS".
    - Tìm trang so cả slug với dấu gạch ngang là khoảng trắng: "khuyen mai" tìm ra `khuyen-mai`.
    - "Đặt làm chính" cho địa chỉ mặc định không hứa chuyển hướng 301: renderer chỉ chuyển hướng về tên miền riêng đang là địa chỉ chính. Hộp thoại nói tên miền riêng vẫn mở các trang, còn sitemap và canonical chuyển sang địa chỉ mặc định.

### ADR-023 — Duyệt xuất bản: Cộng tác viên gửi yêu cầu, Chủ sở hữu và Quản trị duyệt

- **Date:** 2026-11-01 · **Status:** Accepted
- **Context:**
  - Lát C4 của Phase 1 (màn 05, 16). Trên màn 16, Cộng tác viên có ô "Yêu cầu · Phải được duyệt" ở dòng "Xuất bản, cập nhật trang live".
  - Chủ sản phẩm chốt ngày 2026-11-01 (ADR-020, phần sửa đổi): Cộng tác viên gửi yêu cầu; Chủ sở hữu và Quản trị duyệt.
- **Decision:**
  - **Quyền mới** (ADR-020):
    - `pages.requestPublish`: Cộng tác viên. Quyền này chỉ dành cho vai trò không tự xuất bản được, nên Chủ sở hữu, Quản trị và Biên tập không có. Màn 16 hiện nó thành ô "Yêu cầu" trên dòng `pages.publish`, như board, không thành một dòng riêng.
    - `publishApprovals.decide`: Chủ sở hữu và Quản trị, ở dòng "Duyệt hoặc từ chối yêu cầu xuất bản". Người có quyền này nhận email yêu cầu và thấy nút "Từ chối".
  - **Duyệt chính là xuất bản:**
    - Người duyệt mở hộp thoại xuất bản như thường. Mọi bước giữ nguyên như ADR-006: kiểm tra, bỏ qua cảnh báo, xác nhận cài đặt site, idempotency key. Chỉ có nút đổi thành "Duyệt và xuất bản v{n}".
    - Yêu cầu không có bản chụp riêng. Người duyệt xuất bản đúng bản nháp họ đang xem; nếu bản nháp đã đổi sau khi gửi yêu cầu, hộp thoại báo điều đó.
    - Mọi lần xuất bản trang đều đóng yêu cầu đang chờ của trang, dù người xuất bản là người duyệt hay Biên tập. Yêu cầu chuyển thành `published`, ghi `decidedBy` và `releaseId`, trong cùng transaction tạo release (bước 4 của ADR-006).
  - **Yêu cầu** (collection `publish_approvals`):
    - `{ workspaceId, siteId, pageId, requestedBy, revision, note, status: pending|published|rejected|withdrawn, createdAt, sentAt, decidedAt|null, decidedBy|null, reason|null, releaseId|null, releaseSeq|null, purgeAt|null }`. `releaseSeq` là số bản phát hành của trang lúc bị từ chối.
    - Mỗi trang có tối đa một yêu cầu đang chờ (unique partial index `pageId`).
    - Gửi: `POST /pages/:pageId/approval { expectedRevision, expectedPublishedReleaseId, approvalId, note }`. Bản live đã đổi kể từ lúc người gửi xem thì 409 `pointer_conflict`, như publish: không ai xin xuất bản thứ vừa live.
      - Yêu cầu được lưu trong một transaction ghi lên trang (`approvalAskedAt`) với điều kiện đúng revision và con trỏ người gửi đã thấy. Publish cũng ghi lên trang, nên một lần publish cùng lúc hoặc đóng yêu cầu, hoặc làm yêu cầu nhận 409; không bao giờ còn một yêu cầu chờ cho bản nháp đã live.
      - Revision lệch với bản nháp thì 409. Có lỗi chặn thì 422 `publish_blocked` kèm kết quả kiểm tra.
      - Cảnh báo không chặn việc gửi, vì người duyệt mới là người quyết định về cảnh báo.
    - Gửi lại khi chính mình đang có yêu cầu chờ: cập nhật revision và ghi chú, rồi gửi email lại. Nếu trang đang có yêu cầu của người khác thì 409 `approval_pending`.
    - `approvalId` là yêu cầu của chính người gửi mà họ đang thấy (null khi gửi mới). Yêu cầu đó đã được trả lời, hoặc có yêu cầu khác của họ mà họ chưa thấy, thì 409 `approval_changed`. Hộp thoại tải lại thay vì mở lại yêu cầu cho một trang vừa live (sửa ngày 2026-11-01 sau vòng test Phase 1).
    - Rút: `DELETE /pages/:pageId/approval`, chỉ người gửi.
    - Từ chối: `POST /pages/:pageId/approval/reject { approvalId, revision, reason }`, lý do 1–500 ký tự, cần quyền `publishApprovals.decide`. `revision` là bản người duyệt đã xem; yêu cầu đã được gửi lại cho revision khác thì 404.
    - Từ chối và xuất bản cùng lúc: chỉ một bên đổi được yêu cầu đang chờ. Nếu xuất bản thắng, lời từ chối nhận 404. Nếu từ chối thắng, trang vẫn được xuất bản như thường.
    - Mỗi thành viên gửi tối đa 20 lần mỗi 24 giờ trong một workspace, kể cả gửi lại, đếm bằng `EmailQuota` như ADR-021.
    - Yêu cầu đã đóng tự xóa sau 30 ngày (TTL `purgeAt`).
  - **Email:**
    - Khi gửi hoặc gửi lại: một email tới mọi Chủ sở hữu và Quản trị của workspace. Email có tên trang, tên site, người gửi, ghi chú và link mở editor của trang. Link chỉ mở trang; quyền vẫn được kiểm tra như thường.
    - Khi trang được xuất bản: người gửi nhận email kèm địa chỉ live. Khi bị từ chối: người gửi nhận email kèm lý do.
    - Email gửi lỗi thì chỉ ghi log, thao tác vẫn thành công (như ADR-021).
  - **Trên trang:** `PageSummary.approval` được suy ra, không lưu trên trang.
    - Đó là yêu cầu mới nhất của trang, nếu nó đang chờ, hoặc bị từ chối mà trang chưa được xuất bản lại sau lời từ chối (`releaseSeq` của trang chưa vượt `releaseSeq` lưu lúc từ chối). Bản nháp chỉ tăng, nên lần xuất bản đó luôn mới ít nhất bằng bản bị từ chối. So bằng số bản phát hành, không bằng giờ, vì các instance API có thể lệch đồng hồ.
    - Gỡ trang hay rollback sau đó không làm lời từ chối hiện lại. Một bản xuất bản trước lời từ chối (trang rollback rồi được xin lại đúng bản nháp đó) không ẩn nó.
    - Hộp thoại xuất bản đọc trang từ server mỗi lần mở, nên thấy yêu cầu mà người khác vừa gửi, trả lời hay từ chối.
    - Một truy vấn lấy cho mọi trang của danh sách.
  - **Admin:**
    - Editor:
      - Cộng tác viên thấy nút "Gửi duyệt" thay cho "Xuất bản", và "Đang chờ duyệt" khi đang có yêu cầu.
      - Mọi vai trò thấy nhãn "Chờ duyệt" cạnh trạng thái của trang.
    - Hộp thoại của Cộng tác viên:
      - Phần kiểm tra giống người xuất bản, nhưng cảnh báo chỉ hiện, không bỏ qua được.
      - Có ô "Ghi chú cho người duyệt" và các nút "Gửi yêu cầu duyệt", "Gửi lại yêu cầu", "Rút yêu cầu".
      - Yêu cầu bị từ chối hiện lý do.
    - Hộp thoại của người xuất bản:
      - Một khung cho biết ai gửi yêu cầu, lúc nào, kèm ghi chú. Khung báo khi bản nháp đã đổi sau khi gửi.
      - Ghi chú phiên bản được điền sẵn bằng ghi chú của yêu cầu.
      - Người có `publishApprovals.decide` thấy "Duyệt và xuất bản v{n}" và "Từ chối"; từ chối bắt nhập lý do.
    - Danh sách trang (màn 01): nhãn "Chờ duyệt" ở cột trạng thái.
    - Màn 16: ô "Yêu cầu" kèm chú thích "Yêu cầu · Phải được duyệt", và dòng "Duyệt hoặc từ chối yêu cầu xuất bản".
- **Ngoài phạm vi:**
  - Bộ lọc "Chờ duyệt" trên danh sách trang, và hộp thư yêu cầu chung cho cả workspace.
  - Ghi tên người yêu cầu vào release và Lịch sử phiên bản.
  - Duyệt theo từng thay đổi, duyệt nhiều cấp, hẹn giờ xuất bản.
  - Gỡ một thành viên không đóng yêu cầu của người đó; người duyệt vẫn xuất bản hoặc từ chối được.
- **Reason:**
  - Chỉ có một đường xuất bản, nên mọi bất biến của ADR-006 vẫn giữ: revision, con trỏ, idempotency, kiểm tra.
  - Yêu cầu chỉ là một tín hiệu có trạng thái. Nó đóng trong cùng transaction với release, nên hai bên không lệch nhau.
- **Consequences:**
  - Integration test:
    - gửi yêu cầu: quyền, phạm vi site, lỗi chặn, revision, một yêu cầu mỗi trang, gửi lại, giới hạn;
    - email tới người duyệt; xuất bản đóng yêu cầu và gửi email cho người gửi;
    - từ chối, rút, và từ chối song song với xuất bản;
    - ma trận quyền.
  - E2E: Cộng tác viên được mời qua Mailpit và gửi yêu cầu. Chủ sở hữu nhận email, duyệt và xuất bản; Cộng tác viên nhận email. Thêm một lần từ chối kèm lý do.
- **Amended 2026-11-01 (vòng test sau Phase 1):**
  - Email kết quả chỉ gửi người gửi yêu cầu khi họ còn mở được site của trang. Email nói "đã duyệt và xuất bản" khi người xuất bản có `publishApprovals.decide`, và "đã xuất bản" khi đó là một Biên tập.
  - `PageSummary.approval` lấy yêu cầu đang chờ trước, rồi mới tới yêu cầu mới nhất theo `createdAt`, vì đồng hồ của các instance có thể lệch nhau.

### ADR-024 — Vai trò tùy chỉnh

- **Date:** 2026-11-01 · **Status:** Accepted
- **Context:**
  - Lát C5 của Phase 1 (màn 16, trạng thái "Vai trò tùy chỉnh": nhân bản từ vai trò có sẵn rồi bật/tắt quyền; màn 15 khi mời và đổi quyền).
  - Chủ sản phẩm chốt ngày 2026-11-01 (ADR-020, phần sửa đổi): làm vai trò tùy chỉnh.
- **Decision:**
  - **Vai trò tùy chỉnh** (collection `custom_roles`):
    - `{ workspaceId, name, basedOn, permissions, wholeWorkspace, createdBy, createdAt, updatedAt }`.
    - `name`: 1–40 ký tự, chuẩn hóa Unicode NFC, không trùng trong workspace (không phân biệt hoa thường) và không trùng tên vai trò hệ thống. Mỗi workspace tối đa 10 vai trò tùy chỉnh.
    - `basedOn`: vai trò hệ thống đã dùng làm điểm bắt đầu ("Bắt đầu từ"). Chỉ để so sánh "Thêm"/"Bỏ" trên màn 16; quyền thật là `permissions`.
    - `wholeWorkspace`: "Phạm vi khi giao vai trò này". `true` thì người được giao luôn có toàn workspace, như Quản trị. `false` thì người giao chọn phạm vi lúc giao, như các vai trò khác.
  - **Quyền chọn được** (các dòng của editor trên board):
    - `pages.edit`, `pages.publish` hoặc `pages.requestPublish` ("Yêu cầu"), `pages.manageLive`, `publishApprovals.decide`, `leads.view`, `leads.handle`, `leads.export`, `personalData.manage`.
    - `pages.view` luôn có.
    - Không chọn được quyền quản trị site và workspace: `sites.manage`, `domains.manage`, `privacy.manage`, `members.manage`, `accessRequests.decide`, `workspace.transferOwnership`. Những quyền này vẫn chỉ của Chủ sở hữu và Quản trị, nên một vai trò tùy chỉnh không thể tự nâng quyền mình hay người khác.
    - Ràng buộc:
      - `pages.publish`, `pages.requestPublish` và `pages.manageLive` cần `pages.edit`; `pages.publish` và `pages.requestPublish` loại trừ nhau.
      - `publishApprovals.decide` cần `pages.publish`.
      - `leads.handle`, `leads.export` và `personalData.manage` cần `leads.view`.
  - **Giao vai trò:**
    - Vai trò được chọn khi mời, đổi quyền, và trong lời mời, viết là một vai trò hệ thống (`editor`, …) hoặc `custom:{id}`.
    - Membership và lời mời lưu `role: 'custom'` cùng `customRoleId`.
    - Mọi lần giao (đổi quyền, duyệt yêu cầu đổi quyền, mời) ghi lên vai trò (`grantSeq`) trong cùng transaction với việc giao. Xóa vai trò, hoặc chuyển nó sang "Toàn workspace" (kiểm tra và ghi trong một transaction), cùng lúc với một lần giao sẽ xung đột với lần giao đó, nên không ai giữ một vai trò đã mất.
  - **Kiểm tra quyền:**
    - `WorkspaceScope.access` là vai trò hệ thống, hoặc `{ customRoleId, name, permissions }` đọc lại ở mỗi request. `can(access, permission)` của `@plp/contracts` dùng chung cho API và admin.
    - Đổi quyền của vai trò tùy chỉnh có hiệu lực ngay ở request kế tiếp của mọi người đang giữ nó.
    - Một giá trị lạ mặc định không có quyền gì: membership `custom` mà thiếu vai trò thì chỉ còn 404/403.
  - **Xóa:** chỉ khi không thành viên nào và không lời mời đang chờ nào giữ vai trò (409 kèm số người). Phải đổi quyền những người đó trước.
  - **Endpoint** (`members.manage`, tức Chủ sở hữu và Quản trị): `GET`/`POST /workspaces/:id/custom-roles`, `PATCH`/`DELETE /workspaces/:id/custom-roles/:roleId`.
  - **Admin:**
    - Màn 16:
      - Danh sách vai trò thêm các vai trò tùy chỉnh kèm số thành viên; nút "Vai trò tùy chỉnh".
      - Editor gồm: tên, "Bắt đầu từ", các nhóm quyền bật/tắt (dòng xuất bản có ba mức Không, Yêu cầu, Được phép), nhãn "Thêm"/"Bỏ" so với vai trò gốc, "Tóm tắt trước khi lưu", phạm vi, số người đang giữ, "Lưu vai trò" và "Xóa vai trò".
      - Ma trận vẫn chỉ gồm sáu vai trò hệ thống.
    - Màn 15: chọn được vai trò tùy chỉnh khi mời và đổi quyền; danh sách và bộ lọc hiện tên vai trò tùy chỉnh. Vai trò hiện tại của thành viên không có trong danh sách thì "Đổi quyền" bắt chọn lại, không tự thay bằng vai trò khác.
    - Sidebar, menu tài khoản và trạng thái thiếu quyền dùng tên vai trò tùy chỉnh.
- **Ngoài phạm vi:**
  - "Mời thành viên (tới Biên tập)": cần quy tắc chống nâng quyền riêng (chỉ giao được vai trò có ít quyền hơn mình).
  - Các dòng "Dùng trợ lý AI" và "Lưu và quản lý template": chưa có tính năng.
  - Yêu cầu đổi quyền sang một vai trò tùy chỉnh: yêu cầu vẫn chỉ chọn vai trò hệ thống, Chủ sở hữu có thể giao vai trò tùy chỉnh khi duyệt.
  - Thông báo "Quyền của bạn vừa thay đổi" khi đang làm việc.
- **Reason:**
  - Quyền vẫn là một tập hợp kiểm tra ở một lối vào duy nhất (ADR-020); vai trò tùy chỉnh chỉ là một tập hợp khác.
  - Giữ quản trị workspace ngoài vai trò tùy chỉnh thì không có đường nâng quyền.
- **Consequences:**
  - Integration test:
    - tạo, sửa, xóa vai trò; các ràng buộc;
    - giao vai trò khi mời, khi nhận lời mời, khi đổi quyền;
    - quyền hiệu lực ở request kế tiếp sau khi sửa;
    - không xóa được khi còn người giữ;
    - phạm vi toàn workspace;
    - người giữ vai trò tùy chỉnh đi qua ma trận endpoint đúng theo quyền của nó.
  - E2E: Chủ sở hữu tạo vai trò từ Biên tập (xuất bản đổi thành "Yêu cầu", thêm xem lead) rồi mời một người. Người đó thấy Leads và nút "Gửi duyệt".
- **Amended 2026-11-01 (vòng test sau Phase 1):** giao diện hiện từng thao tác theo đúng quyền của nó, không theo vai trò hệ thống:
  - Không có `leads.handle` thì lead chỉ để xem: có trạng thái và ghi chú, không có spam và "Gửi lại".
  - Có `personalData.manage` thì thấy "Dữ liệu & đồng ý", nơi có yêu cầu dữ liệu.
  - "Khôi phục v{n}" sau khi xuất bản cần `pages.manageLive`.
  - Cột "LEAD 7 NGÀY" chỉ có với `leads.view`; API trả `leadsLast7Days: null` cho các vai trò khác, như thẻ "Lead 7 ngày qua". "Hiệu quả" vẫn theo `pages.view` (ADR-019).
  - Nhật ký hoạt động của site chỉ trả sự kiện `lead.*` cho vai trò có `leads.view`, và `data_request.*` cho vai trò có `personalData.manage`: chúng mang số lead và việc xử lý dữ liệu cá nhân.
  - Thông báo từ chối (`holdersOf`) vẫn chỉ nêu vai trò hệ thống, kể cả với quyền chọn được cho vai trò tùy chỉnh.
- **Amended 2026-11-02 (ADR-030, lát G2):** dòng "Lưu và quản lý template" (`templates.manage`) nay là quyền chọn được, không ràng buộc với quyền nào khác. Dòng "Dùng trợ lý AI" vẫn chờ tính năng của nó (ADR-031).

### ADR-025 — Master DB và một database cho mỗi workspace

- **Date:** 2026-11-01 · **Status:** Accepted · **Thay thế:** ADR-003
- **Context:**
  - Chủ sản phẩm chốt ngày 2026-11-01: mỗi chủ sở hữu có một database riêng. Người được mời vào workspace nào thì được gắn với database đó. Đăng nhập ở địa chỉ của workspace nào thì vào workspace đó; không thì chọn.
  - Chốt thêm cùng ngày:
    - Database gắn với **workspace**, không gắn với người. Chuyển quyền sở hữu (ADR-021) không phải dời dữ liệu.
    - Mỗi workspace có một **địa chỉ admin riêng**, cộng một địa chỉ chung để chọn workspace.
    - Dưới 500 workspace trong 1–2 năm tới, nên mọi database nằm trong **một cluster**.
    - Chưa có dữ liệu production, nên không có bước chuyển dữ liệu.
- **Decision:**
  - **Master DB** (database của `MONGODB_URI`): tài khoản, quyền và bảng định tuyến.
    - `users`, `sessions`, `login_attempts`, `workspaces`, `memberships`, `custom_roles`, `invitations`, `access_requests`.
    - `domains` (ADR-022): hostname là duy nhất trên mọi site, một lần xác minh có thể chuyển tên miền giữa hai workspace, vòng tự kiểm tra lấy tên miền tới hạn của mọi workspace, và renderer phân giải host trước khi biết workspace.
    - `site_addresses { _id: siteId, workspaceId, subdomain }` (mới): `subdomain` duy nhất trên mọi workspace; định tuyến `siteId` và `subdomain` tới workspace.
    - Bộ đếm dùng chung: `lead_limits`, `analytics_salts`.
  - **Workspace DB** `{tên master}_ws_{workspaceId}`: mọi dữ liệu của khách.
    - `sites`, `pages`, `releases`, `redirects`, `assets`, `leads`, `activity`, `consent_versions`, `data_requests`, `publish_approvals`, `analytics_daily`, `analytics_seen`.
    - Tên master tối đa 35 ký tự, để tên workspace DB dưới 64 byte như MongoDB yêu cầu; API không khởi động nếu dài hơn.
  - **Gắn người với workspace** là membership ở master, như trước. Không thêm danh sách workspace trên `users`: hai nguồn sẽ lệch nhau khi gỡ thành viên hay chuyển quyền sở hữu.
  - **Một cluster, một client:**
    - Workspace DB mở bằng `connection.useDb(name, { useCache: true })`, dùng chung pool kết nối của master.
    - Một transaction ghi được cả master và workspace DB (MongoDB cho phép trên một replica set). Tạo site (`site_addresses` + `sites`), thêm và xác minh tên miền (`domains` + `domainSeq`, `primaryDomainId` của site) vẫn là một transaction.
  - **Cách ly** (giữ nguyên tinh thần ADR-003):
    - Workspace DB chỉ được chọn từ một `WorkspaceScope` (do `AccessService` tạo sau khi đọc membership ở master), hoặc từ bản ghi định tuyến ở master. Không bao giờ từ input của client.
    - Repository của dữ liệu khách lấy model theo scope, và vẫn gắn `workspaceId` vào mọi filter. Document vẫn mang `workspaceId`: một lỗi định tuyến không đọc được dữ liệu workspace khác.
    - Truy cập chéo workspace vẫn trả 404.
  - **Endpoint mang `siteId`:**
    - Mọi tài nguyên trong workspace DB được gọi qua site hoặc workspace của nó: `/sites/:siteId/pages/:pageId/…`, `/sites/:siteId/leads/:leadId/…`, `/sites/:siteId/data-requests/:requestId/…`, `/sites/:siteId/activity/:activityId/undo`, `/sites/:siteId/assets/:assetId`.
    - API đọc `site_addresses` để biết workspace, kiểm tra membership và phạm vi site, rồi tìm tài nguyên trong workspace DB với cả `siteId` lẫn `workspaceId`.
    - Trước đây API nạp tài nguyên theo id trần rồi mới kiểm tra membership. Với nhiều database, id trần không cho biết phải tìm ở đâu.
  - **Đường công khai:**
    - `/public/sites/:subdomain/…` đọc `site_addresses`; `/public/hosts/:host` và `/public/tls/allowed` đọc `domains`.
    - Link xem trước đã mang `workspaceId` trong token (ADR-010).
    - Link xác nhận nơi nhận lead mang thêm `siteId` cạnh token (ADR-018).
  - **Tạo workspace DB:**
    - Lúc đăng ký, API sinh id workspace, tạo collection và index của workspace DB, rồi mới chạy transaction ghi user, workspace và membership (ADR-004).
    - Transaction lỗi thì xóa database vừa tạo; xóa cũng lỗi thì log cả hai lỗi. Một database rỗng còn sót không chứa dữ liệu và không được định tuyến tới.
  - **Index** (ADR-013): lúc khởi động, API dựng index của master và của từng workspace DB (theo danh sách `workspaces`, tối đa 8 database cùng lúc). Không dựng được một index thì không khởi động.
  - **Việc chạy nền:** vòng tự kiểm tra tên miền đọc `domains` ở master. Lượt nhận lại thông báo lead lúc khởi động (ADR-018) đi qua từng workspace DB.
  - **Địa chỉ admin** (lát D2, màn 34–36 và Sidebar v2 của canvas, phiên bản `1793546061-78b0`):
    - `workspaces.slug`: duy nhất (unique index), 3–40 ký tự `[a-z0-9-]`, không bắt đầu hay kết thúc bằng `-`. Tạo từ tên workspace lúc đăng ký: bỏ dấu (`đ` thành `d`), chữ thường, mọi ký tự khác thành `-`; ngắn hơn 3 ký tự thì thêm `-ws`. Trùng một workspace khác, hoặc trùng tên dành riêng (`app`, `www`, `api`, `admin`, `mail`, `static`, `cdn`, `assets`, `help`, `status`, `docs`), thì thêm `-2`, `-3`, …
    - **Hai chế độ**, theo `ADMIN_WORKSPACE_ORIGIN_TEMPLATE` (đặt cho cả API và admin, chứa `{slug}`, ví dụ `https://{slug}.app.example.vn`):
      - Có biến này: mỗi workspace mở ở địa chỉ của nó; `ADMIN_ORIGIN` là địa chỉ chung.
      - Không có: một địa chỉ như trước, chọn workspace trong admin. Dành cho phát triển local và bộ E2E chính, vì WebKit không phân giải được tên miền con của `localhost`.
    - **Cookie session** đặt `Domain` bằng `SESSION_COOKIE_DOMAIN` (API), nên một lần đăng nhập dùng được cho mọi địa chỉ. API không khởi động khi có template mà thiếu biến này, hay khi địa chỉ chung hoặc mẫu địa chỉ không nằm dưới miền đó. Miền admin khác `BASE_DOMAIN` của trang công khai (§6).
    - **Kiểm tra `Origin`** (ADR-004) chấp nhận địa chỉ chung và mọi địa chỉ khớp mẫu.
    - **Địa chỉ của một workspace:**
      - Thành viên vào thẳng workspace đó, như trang bắt đầu hiện nay nhưng chỉ trong workspace này.
      - Người không phải thành viên, hay địa chỉ không có workspace nào, cùng thấy màn 36 "Tài khoản này không thuộc workspace ở địa chỉ này", không lộ tên workspace.
      - Đăng nhập (màn 34) nói đang mở địa chỉ nào. "Tạo workspace mới" và đăng ký xong dẫn về địa chỉ chung.
    - **Địa chỉ chung:** thuộc một workspace thì chuyển tới địa chỉ của nó; nhiều thì chọn (màn 35); không thuộc workspace nào thì báo như vậy.
    - **Mọi màn của site hay workspace** (khung workspace, editor, tạo trang, tạo site) mở ở địa chỉ của workspace sở hữu nó. Mở ở địa chỉ khác (chung hay của workspace khác) thì chuyển sang đúng địa chỉ, giữ đường dẫn. Proxy của admin chuyển đường dẫn của request cho trang qua một header để làm việc này.
    - **Đổi workspace** ở Sidebar mở địa chỉ của workspace kia; cookie workspace ưu tiên chỉ dùng ở chế độ một địa chỉ.
    - **Email** (lời mời, lead, duyệt xuất bản, yêu cầu đổi quyền, tên miền) dẫn tới địa chỉ của workspace. Thư xác nhận nơi nhận lead vẫn dẫn tới địa chỉ chung: người nhận không cần là thành viên.
    - **E2E:** `addresses.config.ts` chạy Chromium ở `app.e2e.test` và `{slug}.app.e2e.test` (ánh xạ về máy như tên miền riêng của ADR-022), với API, admin và database riêng; `pnpm test:e2e` chạy cả hai cấu hình.
- **Ngoài phạm vi:**
  - Đổi địa chỉ admin sau khi tạo; tên miền riêng cho admin.
  - Xóa workspace và database của nó.
  - Nhiều cluster, hay credential riêng cho từng database.
  - Công cụ backup và khôi phục theo workspace (dùng `mongodump --db`, việc vận hành).
- **Reason:**
  - Dữ liệu của mỗi khách nằm trong database của họ: backup, khôi phục, xuất hay xóa theo khách mà không chạm khách khác.
  - Master giữ một tài khoản cho mỗi người dù họ thuộc nhiều workspace.
  - Một cluster giữ được transaction như cũ; định tuyến chỉ qua scope và bảng ở master nên vẫn kiểm thử được ở một lối vào.
- **Consequences:**
  - Integration test:
    - dữ liệu của workspace nằm đúng trong database của nó, master không có collection của khách;
    - người của workspace A không đọc hay ghi được tài nguyên của B qua bất kỳ endpoint nào, kể cả khi đưa `siteId` của B;
    - đăng ký tạo workspace DB với đủ index, và dọn database khi transaction lỗi;
    - API khởi động dựng index cho mọi workspace DB;
    - đường công khai, xem trước, xác nhận nơi nhận lead và vòng kiểm tra tên miền tìm đúng database.
  - Mỗi workspace thêm 12 collection và khoảng 45 index (kể cả `_id`). Trên khoảng 1.000 workspace trong một cluster phải xem lại (ADR mới), vì MongoDB chậm dần khi số collection và index lên hàng chục nghìn.
  - Dữ liệu local từ trước D1 nằm hết trong một database, nên API không còn thấy site và trang của nó. Xóa database phát triển rồi đăng ký lại: `docker compose exec mongo mongosh --port 27117 --quiet --eval 'db.getSiblingDB("plp").dropDatabase()'`.
- **Amended 2026-11-02 (vòng test sau D2):**
  - **Địa chỉ trống:** tìm theo lô 20 dạng (`base`, `base-2`, … đã cắt cho vừa 40 ký tự) bằng truy vấn khớp đúng, không đọc mọi workspace cùng tiền tố. Trước đây dạng đã cắt không được thấy, nên tên dài trùng nhau từ lần thứ ba trở đi luôn lỗi 500. Đăng ký cùng lúc giành một địa chỉ thử tối đa 10 lần.
  - **Tên dành riêng** nằm ở `@plp/contracts`. Host mang tên dành riêng không bao giờ là địa chỉ workspace: không cho kiểm tra `Origin`, không cho admin. Địa chỉ chung vì vậy đặt được ngang hàng với workspace (`app.example.vn` cạnh `{slug}.example.vn`), và admin không bao giờ coi địa chỉ chung là của workspace.
  - **Miền cookie chỉ dành cho admin:** mọi host dưới `SESSION_COOKIE_DOMAIN` nhận cookie phiên, và mọi tên không dành riêng dưới mẫu được kiểm tra `Origin` tin là một workspace. Vì vậy miền đó (ví dụ `app.example.vn` của `{slug}.app.example.vn`, hay một tên miền riêng cho admin) không được có host nào khác: không blog, mail hay dịch vụ bên thứ ba. API không tự kiểm tra được điều này.
  - **API không khởi động** khi mẫu địa chỉ có `{slug}` ngoài host hay có đường dẫn, khi địa chỉ chung đọc ra một workspace, khi `SESSION_COOKIE_DOMAIN` đặt mà không có mẫu, hoặc khi miền cookie và `BASE_DOMAIN` chứa nhau.
  - **Cookie hai phạm vi** (host-only và miền cha, khi đổi chế độ): mỗi phiên lưu miền cookie lúc tạo (`cookieDomain`), và chỉ được nhận khi API đang đặt cookie đúng như vậy; đổi chế độ thì mọi người đăng nhập lại một lần, không cookie cũ nào đứng thay ai. API xét tối đa 4 cookie phiên khác nhau trong một request bằng một truy vấn, và admin chuyển cho API nguyên header `Cookie` (bảng cookie đã phân tích chỉ giữ một trong hai cookie cùng tên). Đăng xuất kết thúc mọi phiên được gửi; có miền cookie thì xóa cả hai phạm vi, không có thì chỉ xóa cookie host-only (cookie miền cha còn lại không còn phiên). Đăng nhập có miền cookie thì xóa cookie host-only cùng tên.
  - **Đăng ký lỗi** chỉ xóa database khi workspace không có ở master: một commit mất câu trả lời vẫn giữ dữ liệu. Log lỗi không mang thông báo của lỗi gốc (có thể chứa email).
  - **Nhận lại email lead lúc khởi động** lấy 500 cái cũ nhất trên mọi workspace, như khi có một database; workspace nào lỗi thì log và bỏ qua, không chặn khởi động.
  - **Nhận lời mời** trả thêm `slug`; admin mở workspace vừa tham gia ở địa chỉ của nó, kể cả khi link được mở ở địa chỉ chung.
  - **Admin:** thành viên không tạo được site có lối ra ở màn tạo site: quay về site đầu tiên nếu workspace có site; một địa chỉ thì nút "Mở {workspace}" cho từng workspace khác; có địa chỉ workspace thì "Xem tất cả workspace" khi còn workspace khác; workspace chưa có site thì "Đăng xuất". Sidebar chỉ có "Xem tất cả workspace" khi thuộc từ hai workspace; thẻ "Chưa có workspace" có "Đăng xuất". Màn 35 và 36 có tiêu đề trang; màn 35 ghi "· toàn workspace" như board.
- **Amended 2026-11-02 (ADR-026):** đăng ký có hai bước. Database của workspace chỉ được tạo khi email đã xác nhận, lúc `POST /auth/signup/verify`, theo đúng thứ tự ở trên.
- **Amended 2026-11-02 (ADR-030, lát G2):** workspace DB có thêm `templates` và `template_versions`; `workspaces` ở master có thêm bộ đếm `templateSeq`.

### ADR-026 — Tài khoản: xác nhận email khi đăng ký, quên mật khẩu, đổi mật khẩu

- **Date:** 2026-11-02 · **Status:** Accepted
- **Context:**
  - Chủ sản phẩm yêu cầu ngày 2026-11-02 làm xong các việc trước Phase 2, trong đó có tài khoản cơ bản. API mới chỉ có đăng ký, đăng nhập, đăng xuất và `me`.
  - §6 yêu cầu xác minh email hoặc giới hạn số workspace trước khi mở đăng ký, vì mỗi lần đăng ký tạo một database (ADR-025).
  - Thiết kế không có board cho các màn này. Giao diện theo màn 34 (đăng nhập) và token của `@plp/ui`.
- **Decision:**
  - **Đăng ký hai bước:**
    1. `POST /auth/signup { name, email, password, workspaceName }` chưa tạo tài khoản.
       - API băm mật khẩu, ghi `pending_signups` ở master, rồi gửi email xác nhận. Trả 202 `{ email }`, không đặt cookie.
       - `pending_signups { email (unique), name, passwordHash, workspaceName, tokenHash, expiresAt, createdAt }`, TTL index theo `expiresAt`. Token 32 byte, DB chỉ giữ sha256, như link mời (ADR-021). Link có hạn 24 giờ.
       - Đăng ký lại cùng email thì thay bản ghi cũ, nên link cũ hết tác dụng.
       - Email đã có tài khoản: không ghi gì, gửi thư "Email này đã có tài khoản" kèm link đăng nhập và quên mật khẩu. Phản hồi giống hệt, nên không lộ email nào đã đăng ký.
    2. Link `{ADMIN_ORIGIN}/signup/verify#token=…` mở màn "Xác nhận email".
       - Người dùng bấm "Xác nhận và tạo workspace", admin gọi `POST /auth/signup/verify { token }`. Token ở fragment và chỉ gửi bằng POST, nên trình quét link của hộp thư không tiêu nó.
       - API tạo database của workspace, rồi trong một transaction tạo user, workspace, membership Chủ sở hữu và xóa bản ghi chờ, như đăng ký một bước trước đây (ADR-025). Xong thì đặt cookie và trả `MeResponse`.
       - Token sai, đã dùng hay hết hạn: 410 `signup_link_invalid`, kèm hướng dẫn đăng ký lại.
       - Email đã có tài khoản trong lúc chờ (ví dụ đã nhận lời mời): 409 `email_taken`, và bản ghi chờ bị xóa.
    - `POST /auth/signup/resend { email }`: còn bản ghi chờ thì đổi token, tính lại 24 giờ và gửi lại. Luôn trả 202.
    - Đăng ký từ lời mời vẫn một bước (ADR-021): link mời đã chứng minh email.
    - Tài khoản đã có không đổi gì. User chỉ được tạo sau khi email được xác nhận, nên không cần cờ `emailVerified`.
  - **Quên mật khẩu:**
    - `POST /auth/password/forgot { email }` luôn trả 202.
      - Email có tài khoản thì ghi `password_resets { userId (unique), tokenHash, expiresAt, createdAt }` (TTL index) và gửi link `{ADMIN_ORIGIN}/reset-password#token=…`, hiệu lực 60 phút.
      - Mỗi user một link: link mới thay link cũ.
    - `POST /auth/password/reset { token, password }`:
      - Một transaction đổi `passwordHash`, xóa link và xóa **mọi** phiên của user.
      - Bộ đếm đăng nhập sai của email đó được xóa (ADR-004).
      - Rồi đăng nhập như đăng nhập thường.
      - Token sai, đã dùng hay hết hạn: 410 `reset_link_invalid`.
  - **Đổi mật khẩu:** `POST /auth/password { currentPassword, newPassword }`, cần phiên và `Origin` hợp lệ như mọi request ghi.
    - Mật khẩu hiện tại sai thì tốn một lượt của giới hạn đăng nhập sai theo tài khoản (ADR-004), nên một phiên bị lấy cắp không dò được mật khẩu.
    - Đúng thì đổi hash và xóa mọi phiên khác của user, giữ phiên đang dùng. Trả 204.
  - **Đổi tên hiển thị:** `PATCH /auth/me { name }`, cùng giới hạn độ dài với đăng ký.
  - **Giới hạn email:**
    - Mỗi email nhận tối đa 3 thư tài khoản trong 60 phút, gồm thư xác nhận, gửi lại, quên mật khẩu và "đã có tài khoản".
    - Đếm trong `auth_email_limits { key, count, expiresAt }` (master, TTL index). `key` là HMAC của email đã chuẩn hóa với `LOGIN_ATTEMPT_SECRET`, như `login_attempts`.
    - Vượt giới hạn thì 429 `rate_limited`, như nhau dù email có tài khoản hay không. Rate limit theo địa chỉ của `/auth/*` vẫn áp dụng.
  - **Gửi email lỗi:**
    - SMTP không nhận thư thì 503 `email_unavailable` "Chưa gửi được email, thử lại sau ít phút", và lượt gửi được trả lại.
    - Bản ghi chờ hay link vẫn được giữ, và "Gửi lại" dùng được.
  - **Mật khẩu mới** dùng cùng `passwordSchema` với đăng ký.
  - **Email** đi qua `EmailSender` của ADR-018, mẫu tiếng Việt cùng bố cục với thư mời. Link dẫn tới địa chỉ chung `ADMIN_ORIGIN`, vì người nhận chưa có workspace hoặc chưa đăng nhập.
  - **Admin:**
    - Đăng ký: gửi xong thì hiện "Kiểm tra email" với địa chỉ đã gửi, "Gửi lại" và "Đổi email".
    - `/signup/verify`: "Xác nhận và tạo workspace"; thành công thì mở workspace như đăng ký trước đây.
    - Đăng nhập (màn 34) có link "Quên mật khẩu?" tới `/forgot-password`. Gửi xong thì báo "Nếu email này có tài khoản, chúng tôi đã gửi link đặt lại mật khẩu".
    - `/reset-password`: mật khẩu mới và nhập lại; thành công thì vào admin.
    - `/account` "Tài khoản": email (chỉ xem), tên hiển thị, đổi mật khẩu (hiện tại, mới, nhập lại). Mở từ menu tài khoản ở Sidebar.
- **Ngoài phạm vi:** đổi email, xóa tài khoản, đăng nhập bằng Google hay OAuth, xác thực hai lớp, danh sách phiên đang đăng nhập.
- **Reason:**
  - Không có database nào được tạo cho một email chưa ai xác nhận, và không ai chiếm được email của người khác.
  - Link một lần, có hạn, chỉ lưu hash, như mọi link bí mật khác của hệ thống.
  - Đặt lại mật khẩu xóa mọi phiên, vì người quên mật khẩu có thể đang bị người khác giữ phiên.
- **Consequences:**
  - Integration test:
    - đăng ký không tạo user hay database trước khi xác nhận;
    - xác nhận tạo đủ user, workspace, database; link dùng một lần, hết hạn;
    - email đã có tài khoản nhận thư khác mà phản hồi giống hệt;
    - quên và đặt lại mật khẩu xóa mọi phiên; đổi mật khẩu giữ phiên hiện tại; mật khẩu sai tốn lượt;
    - giới hạn 3 thư mỗi giờ; SMTP lỗi trả 503 và trả lượt.
  - E2E: đăng ký qua form, mở thư trong Mailpit, xác nhận; quên mật khẩu; đổi mật khẩu.
  - Helper đăng ký của integration test và E2E đi qua bước xác nhận.
- **Chi tiết khi làm (lát E3):**
  - **Mã trả về:**
    - verify: 201 kèm `MeResponse`; reset: 200 kèm `MeResponse`.
    - resend và forgot: 202, cùng body `{ email }` với đăng ký.
    - Đổi mật khẩu: 204. `PATCH /auth/me`: 200 kèm `MeResponse`.
  - **Mật khẩu hiện tại sai** trả 422 `invalid_credentials` kèm lỗi ở `currentPassword`, vì 401 đã có nghĩa là không có phiên. Vượt giới hạn trả 429, dùng chung bộ đếm với đăng nhập. Mật khẩu đúng xóa bộ đếm, như đăng nhập thành công.
  - **Giới hạn email** đếm mọi request có thể gửi thư tài khoản, kể cả forgot cho email không có tài khoản và resend khi không có gì đang chờ, để 429 không lộ email nào có tài khoản.
  - **Resend hay forgot lỗi 503** vẫn giữ token mới chưa gửi được, nên link cũ hết tác dụng; "Gửi lại" gửi link dùng được.
  - **Token** là chuỗi không rỗng tối đa 200 ký tự. Sai định dạng là link không hợp lệ (410); thiếu hoặc rỗng là 422.
  - **Reset** xóa bộ đếm đăng nhập sai ngay trong transaction.
  - **Index:** `sessions` có thêm index `userId`, để xóa phiên của một user không quét cả collection. Ba collection mới có TTL index (ADR-013).
  - **Admin:**
    - Sau xác nhận, admin mở `/` như đăng ký trước đây; `?next=` của trang đăng ký không đi qua email.
    - `/signup/verify` mở ở địa chỉ workspace thì chuyển về địa chỉ chung, giữ fragment.
    - `/account` là trang riêng ngoài khung workspace, mở được ở mọi địa chỉ. Mục menu ghi "Cài đặt tài khoản", vì menu đã tên là "Tài khoản".
  - **Giới hạn đã biết:**
    - Body của forgot giống hệt nhau, nhưng thời gian trả lời có thể khác, vì chỉ email có tài khoản mới ghi bản ghi và gửi thư.
    - Khi SMTP hỏng, chỉ email có tài khoản mới nhận 503, nên lúc đó forgot lộ được email nào có tài khoản. Chấp nhận, vì chỉ xảy ra khi SMTP hỏng và vẫn có rate limit.
- **Amended 2026-11-02 (review bảo mật sau E1–E6):**
  - **Mật khẩu đặt ở trang của link, không ở form đăng ký.** Trước đây người đăng ký chọn mật khẩu ở bước 1, còn ai mở link thì được đăng nhập: kẻ gian đăng ký bằng email của người khác, người đó bấm link, và kẻ gian vẫn biết mật khẩu của tài khoản vừa tạo.
    - `POST /auth/signup { name, email, workspaceName }`: có `password` thì 422; `pending_signups` không còn `passwordHash`.
    - Trang `/signup/verify` gọi `POST /auth/signup/lookup { token }` (rate limit như `/auth/*`, không tiêu link) → `{ email, name, workspaceName }` hoặc 410, rồi hiện email (chỉ xem), tên và tên workspace (sửa được), mật khẩu và nhập lại, nút "Tạo tài khoản và workspace".
    - `POST /auth/signup/verify { token, password, name, workspaceName }` tạo tài khoản với mật khẩu và tên do người mở link nhập, rồi đăng nhập.
    - Link không còn dùng được thì có "Đăng ký lại" và "Đăng nhập", kèm "Nếu bạn đã xác nhận email này, hãy đăng nhập."
    - Đăng ký hộ email người khác vì vậy không cho người đăng ký gì; đăng ký lại chỉ gửi một link mới tới hộp thư đó.
  - **Phiên bản thông tin đăng nhập:** `users.credentialsVersion` (thiếu là 0) tăng khi đặt lại và khi đổi mật khẩu, trong cùng transaction.
    - Mỗi phiên lưu phiên bản lúc tạo (thiếu là 0); guard trả 401 khi phiên bản khác của user. Đăng nhập dùng phiên bản đọc cùng hash đã kiểm. Một lượt đăng nhập đã đọc hash cũ trước khi đặt lại vì vậy không giữ được phiên.
    - Đổi mật khẩu chỉ ghi khi user còn đúng hash và phiên bản nó đã kiểm; không thì 409 `password_changed` "Mật khẩu vừa được đổi ở nơi khác. Đăng nhập lại.". Thành công thì phiên đang dùng chuyển sang phiên bản mới, các phiên khác bị xóa.
  - **Giới hạn email theo hộp thư:** khóa của `auth_email_limits` là HMAC của `mailboxOf(email)` (bỏ `+tag`, chữ hoa, và dấu chấm với Gmail), dùng chung helper với giới hạn lời mời (ADR-021, nay ở `shared/`). `login_attempts` vẫn theo địa chỉ.
- **Amended 2026-11-02 (review vòng 2):**
  - Đăng ký lại hay gửi lại link xóa `passwordHash` mà một bản ghi `pending_signups` đã lưu trước sửa đổi ở trên, để không bản ghi nào còn giữ mật khẩu do người đăng ký chọn.
  - **Admin:**
    - Email chỉ xem ở `/signup/verify` và ở form đăng ký của lời mời là username của form (`autoComplete="username"`): trình quản lý mật khẩu lưu mật khẩu dưới email, không dưới tên workspace.
    - `lookup` chỉ đọc một lần. Một lần đọc lại bị lỗi không lấy mất form và những gì đã nhập. Màn lỗi của `lookup` có "Đăng ký lại" và "Đăng nhập".
    - Lỗi "nhập lại mật khẩu không khớp" được đọc qua vùng live ở cả ba form đặt mật khẩu, vì Enter để focus ở lại ô đó.
    - 409 `password_changed` ở trang tài khoản có nút "Đăng nhập lại" (đăng xuất rồi mở `/login`).
    - Giới hạn đã biết: trang đặt lại mật khẩu không có ô username, vì admin không biết email của link đặt lại. Hiện email cần một endpoint tra link, tức là đổi API.

### ADR-027 — Xóa trang và xóa site

- **Date:** 2026-11-02 · **Status:** Accepted
- **Context:**
  - §6 để ngỏ câu hỏi "MVP có cần xóa trang hay không". Chủ sản phẩm chọn làm ngày 2026-11-02, cùng với xóa site.
  - Trang và site đã tạo không xóa được, chỉ gỡ xuất bản được.
- **Decision:**
  - **Xóa trang:** `DELETE /sites/:siteId/pages/:pageId`, quyền `pages.manageLive` (Chủ sở hữu, Quản trị, Biên tập).
    - Chỉ xóa được trang không live (`publishedReleaseId` null): bản nháp chưa xuất bản, hoặc trang đã gỡ. Trang đang live trả 409 `page_live` "Gỡ trang khỏi live trước khi xóa". Nhờ vậy trang live vẫn chỉ đổi qua publish, rollback, undo và gỡ trang (nguyên tắc 4).
    - Một transaction:
      1. Xóa page có điều kiện `publishedReleaseId: null`. Xuất bản chạy cùng lúc thì một trong hai thua; không bao giờ còn release live mà mất page.
      2. Xóa redirect của trang và yêu cầu duyệt xuất bản của trang.
      3. Xóa các release **không** được lead nào tham chiếu.
      4. Ghi activity `page.deleted { title, slug }`.
    - **Release được lead tham chiếu thì giữ:** nó là bằng chứng đồng ý của lead (quy tắc 10). Renderer chỉ đi từ page tới release, nên release còn lại không bao giờ được phục vụ, và không bị sửa.
    - **Lead, số liệu Hiệu quả và activity cũ của trang được giữ.** Admin ghi "Trang đã xóa" ở nơi cần tên một trang không còn: hộp thư lead, Hiệu quả theo trang, hoạt động gần đây.
    - Không cần revalidate, vì trang không live.
    - **Admin:**
      - Mục "Xóa trang" trong menu "⋯" của dòng trang (màn 01) và ở đầu trang chi tiết.
      - Với trang đang live, mục bị vô hiệu và ghi "Gỡ xuất bản trước khi xóa".
      - Hộp xác nhận nêu những gì bị xóa (bản nháp, lịch sử phiên bản, chuyển hướng) và những gì còn (lead đã nhận).
  - **Xóa site:** `DELETE /sites/:siteId { confirmName }`.
    - Cần cả `sites.manage` và `personalData.manage` (Chủ sở hữu, Quản trị), vì xóa cả lead. `confirmName` phải đúng tên site (so sau chuẩn hóa NFC); sai thì 422.
    - **Một transaction ghi cả master và workspace DB** (ADR-025):
      - Master: xóa `site_addresses` (subdomain được giải phóng) và mọi `domains` của site (biên không cấp chứng chỉ cho chúng nữa). Bỏ `siteId` khỏi `memberships.siteIds` và `invitations.siteIds`.
      - Workspace DB: xóa `sites` và mọi document có `siteId` đó trong `pages`, `releases`, `redirects`, `assets`, `leads`, `activity`, `consent_versions`, `data_requests`, `publish_approvals`, `analytics_daily`, `analytics_seen`, `ai_jobs`.
      - Bộ đếm ở master (`lead_limits`, `analytics_salts`) tự hết hạn.
    - **Phạm vi còn rỗng:**
      - Thành viên có phạm vi chỉ gồm site đó vẫn ở workspace, nhưng không thấy site nào. Chủ sở hữu đổi quyền hoặc gỡ họ.
      - Lời mời đang chờ có phạm vi rỗng bị thu hồi trong cùng transaction.
    - **Sau commit:**
      - Xóa file ảnh của site trên storage (tiền tố của site), và revalidate renderer để trang đã cache không còn.
      - Một trong hai lỗi thì log (kèm `siteId`, không có dữ liệu cá nhân), không hoàn tác việc xóa. Ảnh còn sót là file công khai không còn ai tham chiếu.
    - **Không có thùng rác hay khôi phục:** lead bị xóa thật như một yêu cầu xóa dữ liệu (quy tắc 10). Hộp xác nhận nhắc xuất lead trước.
    - **Giới hạn của transaction MongoDB** (60 giây, 16 MB mỗi lần ghi oplog) đủ cho quy mô pilot. Site rất lớn cần xóa theo lô, khi đó cần một ADR mới.
    - **Admin:**
      - Cài đặt site có thẻ "Xóa site" ở cuối, kèm số trang, số trang đang live, số lead và tên miền riêng sẽ bị xóa.
      - Nhập tên site để xác nhận.
      - Xong thì mở màn Sites của workspace (ADR-028).
- **Ngoài phạm vi:** thùng rác và khôi phục, xóa workspace (ADR-025), nhân bản trang.
- **Reason:**
  - Xóa không bao giờ là một cách đổi trang live: trang phải được gỡ trước.
  - Bằng chứng đồng ý sống cùng lead chứ không cùng trang.
  - Site là đơn vị dữ liệu của một khách hàng; xóa nó phải xóa hết, trong một transaction, không để lại định tuyến tới dữ liệu đã mất.
- **Consequences:**
  - Integration test:
    - xóa trang không live; từ chối trang live; xuất bản và xóa cùng lúc;
    - release có lead được giữ, release khác bị xóa;
    - lead và Hiệu quả của trang đã xóa vẫn đọc được;
    - xóa site xóa đủ mọi collection và bản ghi ở master, giải phóng subdomain và tên miền;
    - phạm vi thành viên và lời mời; quyền; người ngoài workspace nhận 404.
  - E2E: gỡ rồi xóa một trang; xóa một site.
- **Chi tiết khi làm (lát E4):**
  - **Bất biến của release và phiên bản đồng ý:**
    - Guard của schema vẫn từ chối mọi update. Lệnh xóa chỉ được nhận khi mang `ERASURE_COMMENT` (`shared/persistence/erasure.ts`).
    - Xóa release đi qua `ReleaseErasureRepository` riêng; `ReleasesRepository` vẫn chỉ có `insert` và `find*`.
    - `releases` có thêm index `siteId`.
  - **Release được giữ của trang đã xóa** không bao giờ được phục vụ, kể cả qua link xem trước đã ký trước đó: cả hai endpoint xem trước kiểm tra page còn tồn tại.
  - **Xóa trang mà update có điều kiện trượt:** API đọc lại page sau transaction, trả 404 nếu đã mất, 409 nếu đã live.
  - **Sau commit của xóa site:**
    - Quét lại cùng các lệnh xóa, để bắt lead hay lượt xem được ghi trong lúc transaction chạy.
    - Xóa tiền tố storage bằng `AssetStorage.deletePrefix`, rồi revalidate.
    - Nhận lead đọc lại cài đặt site sau khi lưu: site đã mất thì xóa lead đó và trả 404.
  - **Đọc dữ liệu của trang đã xóa:**
    - Tên trang của lead là `null` trong contract. Admin ghi "Trang đã xóa"; CSV, JSON xuất ra và email lead do API ghi.
    - "Theo trang" của Hiệu quả giữ dòng của trang đã xóa.
    - Activity mang cờ `page.deleted`, suy ra bằng một truy vấn. "Hoạt động gần đây" có `page.deleted`, và không dẫn link tới lịch sử của trang đã xóa.
  - **Xóa site không ghi activity,** vì nhật ký của site bị xóa cùng nó; chỉ log "Site deleted {siteId}".
  - **`GET /sites/:siteId/deletion-summary`** `{ pages, livePages, leads, domains[] }`: cùng quyền với xóa site, bốn truy vấn, số chính xác.
  - **So tên** phân biệt hoa thường, bỏ khoảng trắng hai đầu, NFC cả hai phía.
  - **Ca biên:**
    - Hoàn tác trên trang đã xóa trả 409 `undo_not_available`; gửi duyệt cho trang đã xóa trả 404.
    - Hai lần xóa site cùng lúc: một 204, một 404.
    - Thành viên chỉ có site đó giữ `siteIds: []`.
  - Không có toast sau khi xóa site: màn workspace có khung riêng, toast sẽ mất ngay khi chuyển màn.
  - Xóa trang xong thì bỏ các query của trang đó trước khi làm mới danh sách, rồi `router.refresh()` để số trang ở Sidebar (render phía server) cập nhật. Mục "Xóa trang" bị vô hiệu vẫn nhận focus (`aria-disabled`, mẫu menu của APG) và không làm gì khi chọn. Ô xác nhận tên của "Xóa site" chỉ đọc khi đang xóa, nên focus không rời hộp thoại.
    - Sửa 2026-11-02 (review vòng 2): `router.refresh()` không dựng lại màn 01, nên focus ở "Tìm trang", chữ đang gõ và các trang đã nạp vẫn còn (ADR-008).
    - Sửa 2026-11-02 (kiểm trên trình duyệt):
      - Hộp thoại đóng trước khi danh sách đọc lại xong. Focus về nút menu của dòng, rồi rơi xuống `<body>` khi dòng biến mất.
      - Hộp thoại của `@plp/ui` vì vậy theo dõi nút mở sau khi đóng. Nút bị gỡ khi còn giữ focus thì focus chuyển sang ô dự phòng: "Tìm trang" ở màn 01, cả khi "Gỡ xuất bản" làm dòng rời bộ lọc "Live".
      - Hộp thoại không có ô dự phòng (thu hồi lời mời, ngắt tên miền) đưa focus về `<main>` của trang, như skip link.
- **Amended 2026-11-02 (vòng sửa lỗi sau E1–E6):** lead tới đúng lúc trang bị gỡ rồi xóa.
  - Nhận lead đọc lại release của lead sau khi lưu; release đã mất thì xóa lead và trả 404 "Form này không còn nhận đăng ký", như khi site bị xóa.
  - Lead được lưu trong lúc transaction xóa trang còn mở vẫn có thể giữ một release đã mất. Đọc lead khi đó không lỗi:
    - Bằng chứng đồng ý có `consent.snapshot` (phiên bản, đơn vị, link chính sách, nội dung) là `null`.
    - Admin, CSV và JSON xuất dữ liệu một người ghi "Không còn bản lưu nội dung đồng ý (trang bị xóa đúng lúc khách gửi form)".
    - Contract: các trường của release trong bằng chứng đồng ý nằm dưới `consent.snapshot`.
- **Amended 2026-11-02 (review toàn vẹn dữ liệu sau E1–E6):** mọi việc ghi dữ liệu của một site đều xung đột với việc xóa site đó.
  - Transaction nào lưu một document của site mà không ghi gì việc xóa cũng ghi, thì trước hết tăng `sites.dataSeq`; site đã mất thì trả 404 "Không tìm thấy site". Gồm: ghi nhận yêu cầu dữ liệu, tải ảnh lên, tạo phiên bản đồng ý, "Xóa dữ liệu người này", và activity `lead.exported` (nay ghi trong một transaction ngắn). Việc xóa site vì vậy hoặc chờ rồi xóa luôn document đó, hoặc làm việc ghi thất bại.
  - Ảnh bị từ chối thì file vừa lưu bị xóa (`AssetStorage.delete`); xóa lỗi thì log.
  - Tạo trang và thêm tên miền trên site vừa bị xóa trả 404, không 500. Hoàn tất yêu cầu dữ liệu của site vừa bị xóa trả 404.
  - **Quyền theo site:** lưu một lần giao quyền (đổi quyền, mời, duyệt yêu cầu đổi quyền) tăng `grantSeq` của `site_addresses` các site đó trong cùng transaction; site đã mất thì 422 `site_not_found`. Nhận lời mời dựng membership từ lời mời đúng như lúc `claim` đóng nó. "Đổi quyền" chỉ lưu các site còn trong workspace; cột phạm vi bỏ qua id đã mất.
  - `sites.dataSeq` và `site_addresses.grantSeq` có ở document cũ từ lần `$inc` đầu; không cần migration.
  - Chấp nhận: lượt xem (`analytics_daily`, `analytics_seen`) ghi sau lượt quét vẫn còn tới khi TTL xóa; chúng chỉ có số đếm và hash.
  - Hai test chạy đua giữa xuất bản và xóa trang kiểm "đúng một bên thắng, không bao giờ có release mất trang", vì MongoDB có thể hủy tạm transaction đang giữ trang và chạy lại nó.
- **Amended 2026-11-02 (ADR-030, lát G2):** xóa site bỏ site đó khỏi `scope.siteIds` của các template của workspace trong cùng transaction. Template, phiên bản và ảnh của chúng (tiền tố `templates/` của workspace) không bị xóa.
- **Amended 2026-11-02 (sửa sau review Phase 2, ADR-031):** `ai_jobs` của site bị xóa cùng site.
  - Bắt đầu một lần "Viết nội dung" tăng `sites.dataSeq` trong transaction giữ lượt và ghi job; site đã mất thì 404 "Không tìm thấy site", không tốn lượt.
  - Transaction xóa site trả lượt của các job của site còn chạy lần đầu (`running`, chưa có bản nháp, chưa trả lượt), gộp theo tháng đã giữ, rồi xóa mọi job của site.
    - Lượt chạy của các job đó kết thúc sau không khớp job nào, nên không trả lượt lần nữa. Một lượt chạy kết thúc đúng lúc đó ghi cùng document job, nên một trong hai transaction chạy lại và thấy việc của bên kia: mỗi lượt được trả đúng một lần.
    - Lượt quét sau commit chỉ xóa, không trả lượt: không job nào được ghi cho site đã mất.
  - Lượt chạy đang viết dừng ở lần ghi kế tiếp của nó và không gọi AI thêm (ADR-031).
  - Template ghi `scope.siteIds` trong transaction tăng `dataSeq` của các site đó, nên xung đột với `$pull` ở trên (ADR-030).

### ADR-028 — Màn Sites của workspace và số đếm ở Sidebar v2

- **Date:** 2026-11-02 · **Status:** Accepted
- **Context:**
  - Sidebar v2 có mục "Sites" mang số đếm, đứng đầu nhóm WORKSPACE, và mục "Thành viên" mang số đếm.
  - Lần đối chiếu thiết kế ngày 2026-11-02 thấy cả hai chưa làm, và không ADR nào ghi bỏ chúng. Agency quản lý nhiều site khách chỉ có dropdown chuyển site.
- **Decision:**
  - **Màn Sites** ở `/workspaces/[workspaceId]/sites`:
    - Danh sách các site người dùng thấy được (phạm vi site, ADR-020): tên, địa chỉ công khai, số trang, số trang đang live, và lead 7 ngày.
    - Lead 7 ngày chỉ có với `leads.view`, như cột ở màn 01 (ADR-024).
    - Mỗi dòng mở danh sách trang của site.
    - "Tạo site" với `sites.manage`. Chưa có site thì trạng thái trống có "Tạo site".
  - **`GET /workspaces/:id/sites`** trả thêm `summary { pages, livePages, leadsLast7Days|null }` cho mỗi site. Dùng một aggregate cho trang và một cho lead, nhóm theo `siteId`, không truy vấn theo từng site.
  - **`/workspaces/[id]`** mở màn Sites, thay cho Thành viên (sửa ADR-021).
  - **Sidebar v2,** nhóm WORKSPACE:
    - "Sites" đứng đầu, với mọi vai trò; số đếm là số site người dùng thấy được.
    - "Thành viên" có số thành viên của workspace, và vẫn chỉ hiện với `members.manage`.
- **Ngoài phạm vi:** Templates, Marketplace, Gói & thanh toán, Khách hàng, Automation của Sidebar v2 (Phase 2–4).
- **Reason:** Đúng board Sidebar v2; một màn tổng quan cho agency. Số liệu theo site lấy bằng aggregate, nên chi phí không tăng theo số site.
- **Consequences:**
  - Integration test cho `summary` theo phạm vi site và quyền `leads.view`.
  - E2E: mở Sites từ Sidebar, mở một site.
- **Chi tiết khi làm (lát E6):**
  - `GET /workspaces/:id/role-counts` trả thêm `members`, là nguồn của số đếm "Thành viên". Chỉ đếm thành viên, không đếm lời mời, như "Đang hoạt động · N" của màn 15.
  - `summary` luôn có trong danh sách site, nên bộ chuyển site ở mọi màn chạy cả hai aggregate. Index mới `pages_site_live { workspaceId, siteId, publishedReleaseId }` giúp aggregate của trang chỉ đọc index. Mỗi workspace DB thêm một index (khoảng 46, ADR-025).
  - `livePages` đếm trang có pointer (`live` và `live_with_changes`). `leadsLast7Days` dùng cùng cửa sổ và quy tắc spam với thẻ "Lead 7 ngày qua", và là số chính xác.
  - Màn Sites dùng danh sách site khung workspace đã nạp, không gọi thêm. Nút ở đầu màn là "Tạo site"; trạng thái trống là "Tạo site đầu tiên". Thành viên không tạo được site thấy lời giải thích theo phạm vi của họ.

### ADR-029 — Gửi email qua plp-mailer (SQS), sửa ADR-018

- **Date:** 2026-11-01; đưa vào `main` và phủ 14 email ngày 2026-11-02 · **Status:** Accepted
- **Context:**
  - ADR-018 gửi email bằng SMTP (`nodemailer`). ADR-021, ADR-022, ADR-023 và ADR-026 dùng cùng đường gửi cho thư của chúng. API tự dựng chủ đề, phần chữ và phần HTML.
  - Ngày 2026-11-01, chủ sản phẩm yêu cầu một dịch vụ gửi thư riêng: repo `plp-mailer`, gồm AWS Lambda và Amazon SES, dựng và test bằng SAM.
    - Nhận `{ template, to[], replyTo?, data, idempotencyKey }` qua hàng đợi SQS, có dead-letter queue, và chống trùng bằng idempotency trên DynamoDB trong 14 ngày.
    - Template Handlebars nằm trong `templates/emails/<template>/` của chính repo đó, mỗi template có một `schema.json` cho `data`. Repo `plp-mail-templates` riêng lúc đầu đã được gộp vào đây.
  - Chưa deploy được: tài khoản AWS đang bị tạm khóa và domain gửi chưa được chọn. Vì vậy SMTP vẫn là mặc định.
  - Quyết định này được viết trên nhánh `feat/mailer-sqs-transport` với số ADR-023, khi API mới gửi 5 loại email. Lúc đưa vào `main`, số ADR-023 đã thuộc về duyệt xuất bản và API gửi 14 loại email, nên ADR này mang số ADR-029 và phủ cả 14.
- **Decision:**
  - **Công tắc `MAIL_TRANSPORT`:** `smtp` (mặc định) hoặc `sqs`, validate bằng Zod lúc khởi động.
    - `smtp` cần `SMTP_URL` và `LEAD_EMAIL_FROM` như ADR-018. Dev, integration test và E2E vẫn dùng Mailpit.
    - `sqs` cần `MAIL_QUEUE_URL` (http hoặc https) và `MAIL_QUEUE_REGION`, và không đọc `SMTP_URL`, `LEAD_EMAIL_FROM`. Địa chỉ gửi do plp-mailer quyết (`SenderDomain`).
    - Credentials lấy theo chuỗi mặc định của AWS SDK, tức role của máy chạy API, được gắn `MailProducerPolicy`. Không có biến môi trường riêng cho key.
  - **Một dạng thư cho cả hai đường:** mọi nơi gửi email (tài khoản, thành viên, tên miền, duyệt xuất bản, nơi nhận lead, thông báo lead) dựng `{ to, template, data, idempotencyKey }` (`notifications/emails.ts`) và gửi qua cùng một `EmailSender`.
    - `template` là tên một thư mục trong `templates/emails/` của plp-mailer.
    - `data` khớp `schema.json` của template đó. Mọi giá trị đã được định dạng để hiển thị: số điện thoại dạng Việt Nam, giờ Việt Nam, nhãn nguồn, nhãn vai trò và phạm vi. Lời nhắn hay ghi chú trống là `null`. Phần thư đổi theo tình huống là cờ boolean mà template đọc: `accepted`, `resent`, `approved`.
    - Với `smtp`, `SmtpTemplateSender` dựng chủ đề, phần chữ và phần HTML từ `data` (`email-templates.ts`), rồi giao cho `SmtpEmailSender`, vẫn là lớp gửi qua SMTP như trước. Nội dung thư giữ nguyên từng byte; test gửi qua SMTP (`smtp-email-sender.int.spec.ts`, `smtp-failures.int.spec.ts`) không đổi, và test chữ của thư (`email-templates.spec.ts`) giữ mọi kỳ vọng cũ.
    - Với `sqs`, API gửi một message SQS cho mỗi email. Body là request của plp-mailer, được kiểm bằng một schema Zod chép từ `plp-mailer/src/contracts.ts` trước khi gửi.
  - **14 template**, mỗi loại email một template, chữ tiếng Việt giống thư SMTP:

    | Template                 | Email                                         | ADR     | Idempotency key                               |
    | ------------------------ | --------------------------------------------- | ------- | --------------------------------------------- |
    | `lead-notification`      | lead mới, tới các địa chỉ đã xác nhận         | ADR-018 | `lead-notification:{leadId}`                  |
    | `recipient-confirmation` | xác nhận một địa chỉ nhận lead                | ADR-018 | `recipient-confirmation:{recipientId}:{hạn}`  |
    | `member-invitation`      | lời mời vào workspace                         | ADR-021 | `member-invitation:{invitationId}:{hạn}`      |
    | `access-request`         | yêu cầu đổi quyền, tới Chủ sở hữu             | ADR-021 | `access-request:{requestId}`                  |
    | `access-decision`        | kết quả yêu cầu đổi quyền                     | ADR-021 | `access-decision:{requestId}`                 |
    | `domain-active`          | tên miền riêng đã hoạt động                   | ADR-022 | `domain-active:{domainId}`                    |
    | `domain-lost`            | tên miền riêng mất kết nối                    | ADR-022 | `domain-lost:{domainId}:{lostSince}`          |
    | `domain-moved`           | tên miền chuyển sang site khác                | ADR-022 | `domain-moved:{domainId}`                     |
    | `approval-request`       | yêu cầu xuất bản, tới người duyệt             | ADR-023 | `approval-request:{approvalId}:{sentAt}`      |
    | `approval-published`     | trang đã được xuất bản, tới người gửi yêu cầu | ADR-023 | `approval-published:{approvalId}`             |
    | `approval-rejected`      | yêu cầu bị từ chối, kèm lý do                 | ADR-023 | `approval-rejected:{approvalId}`              |
    | `signup-confirmation`    | xác nhận email khi đăng ký                    | ADR-026 | `signup-confirmation:{pendingSignupId}:{hạn}` |
    | `account-exists`         | email đăng ký đã có tài khoản                 | ADR-026 | `account-exists:{userId}:{lúc yêu cầu}`       |
    | `password-reset`         | link đặt lại mật khẩu                         | ADR-026 | `password-reset:{userId}:{hạn}`               |

  - **Idempotency key** không chứa dữ liệu cá nhân, token hay hash của token: id của bản ghi, cộng thời điểm (mili giây) của liên kết hay sự kiện khi một bản ghi gửi được nhiều thư.
    - `lead-notification:{leadId}` giữ nguyên qua mọi lần thử, kể cả "Gửi lại". Một lần thử tưởng là lỗi (timeout) nhưng thực ra message đã vào hàng đợi sẽ không thành thư thứ hai.
    - Mỗi liên kết một key (`{hạn}` là `expiresAt` của liên kết), vì "Gửi lại", đăng ký lại hay quên mật khẩu lần nữa tạo liên kết mới và phải đi một thư mới. `pending_signups` trả id của bản ghi khi ghi, để có key này.
    - `domain-active` và `domain-moved` một lần cho mỗi bản ghi tên miền: `activeSince` không bao giờ bị xóa, và bản ghi mất tên miền bị gỡ. Một tên miền mất kết nối được nhiều lần, nên `domain-lost` mang `lostSince`.
    - `approval-request` mang `sentAt`, vì "Gửi lại yêu cầu" là một thư mới. Một yêu cầu chỉ được xuất bản hay từ chối một lần.
    - `account-exists` không có liên kết nào: mỗi lần đăng ký là một thư.
  - **Liên kết mang token** (xác nhận nơi nhận lead, lời mời, xác nhận đăng ký, đặt lại mật khẩu) chỉ nằm trong `data` của message.
    - Không log nào của API ghi người nhận, `data` hay body của message. Lỗi gửi chỉ ghi mã, tên lỗi của AWS hoặc mã lỗi mạng, và request id (ADR-013); lỗi kiểm request trước khi gửi chỉ ghi tên trường.
    - plp-mailer cũng không log người nhận hay `data`. Hàng đợi của nó mã hóa message (`SqsManagedSseEnabled`) và giữ tối đa 14 ngày.
  - **Kết quả gửi với `sqs`:** SQS nhận message là gửi thành công. Lead thành `sent`, với `recipients` bằng số địa chỉ và `rejectedRecipients` bằng 0.
  - **Lỗi gửi message** dùng các mã sẵn có:
    - timeout → `timeout`;
    - không kết nối được, lỗi 5xx, throttling → `smtp_unavailable`;
    - lỗi 4xx khác, ví dụ thiếu quyền hay queue không tồn tại → `smtp_rejected`;
    - còn lại → `unknown`.
    - Tên mã giữ nguyên vì đó là giá trị đã lưu và nằm trong contract. Nhãn ở màn 10 nói "máy chủ gửi thư", vẫn đúng.
    - Mọi chỗ ADR-021, ADR-022, ADR-023 và ADR-026 nói "SMTP không nhận thư" nay là "đường gửi không nhận thư": hàng đợi từ chối thì thư tài khoản trả 503 `email_unavailable` và trả lượt, lời mời và địa chỉ nhận lead ở trạng thái chưa gửi, email duyệt xuất bản, yêu cầu đổi quyền và tên miền chỉ được log.
  - **Không đổi:** `EmailQuota` và các giới hạn thư (đếm trước khi gửi, trả lại khi không gửi được), lịch thử lại 0/1/5 phút, cách giành lead, và lượt quét lúc khởi động.
  - **Thư viện:** `@aws-sdk/client-sqs` cho API, `ajv` chỉ dùng trong test (ADR-002).
- **Reason:**
  - Hai đường gửi dùng chung một dạng thư (template và data), nên đổi đường gửi chỉ là đổi biến môi trường. Test đối chiếu `data` với `schema.json` phủ cả hai đường.
  - Idempotency key ổn định nối lịch thử lại của API với cơ chế chống trùng của plp-mailer.
- **Consequences:**
  - Với `sqs`, `sent` nghĩa là plp-mailer đã nhận thư vào hàng đợi.
    - Lỗi của SES, thư bị trả lại hay địa chỉ nằm trong suppression list không báo về hộp thư lead. Chúng nằm ở dead-letter queue và alarm của plp-mailer.
    - Badge "Lỗi đồng bộ" chỉ phủ lỗi lúc gửi message.
  - plp-mailer từ chối một key được dùng lại cho payload khác (`IdempotencyValidationError`), và message đó vào dead-letter queue.
    - Việc này chỉ xảy ra khi một lần thử tưởng là lỗi thực ra đã vào hàng đợi, rồi nơi nhận lead đổi trước lần thử sau.
    - Thư đầu đã đi, nên người nhận không bị trùng thư.
  - Template trong API (cho `smtp`) và template trong plp-mailer là hai bản phải giữ khớp nhau.
    - `apps/api/test/mail-templates/*.schema.json` (14 file) được chép nguyên từ `plp-mailer/templates/emails/*/schema.json`, nhánh `feat/cms-emails` (commit `169d6dd`, PR plp-mailer#1). Prettier bỏ qua thư mục này để bản chép giữ đúng từng byte.
    - Unit test kiểm `data` của mọi email, ở mọi dạng (có và không có ghi chú, chấp nhận và từ chối…), theo các schema đó. Bộ ghi thư của integration test kiểm mọi thư mà test gửi, và test app thất bại lúc đóng nếu có thư plp-mailer sẽ từ chối.
    - Integration test chạy cả API với `MAIL_TRANSPORT=sqs` qua AWS SDK thật và một SQS stub: 14 loại thư vào hàng đợi, mỗi key một lần, và không log nào chứa liên kết.
    - Đổi một schema ở plp-mailer thì chép lại file và sửa mapping trong cùng một PR.
  - Ví dụ giờ trong `lead-notification/schema.json` ("09:15 01/11/2026") khác định dạng giờ Việt Nam của ADR-018 ("2026-10-24 16:42:07"). Schema chỉ yêu cầu một chuỗi không rỗng, nên API giữ định dạng của ADR-018.
  - Bật `sqs` ở production cần tài khoản AWS hoạt động, PR plp-mailer#1 đã merge, và plp-mailer đã deploy (domain gửi, DKIM, quyền gửi production của SES), rồi gắn `MailProducerPolicy` cho role của API (§6).

### ADR-030 — Template: mẫu hệ thống, template của workspace, áp dụng mẫu

- **Date:** 2026-11-02 · **Status:** Accepted
- **Context:**
  - Board 17–19 của Phase 2 và ghi chú `phase2Decisions`. Chủ sản phẩm yêu cầu làm toàn bộ Phase 2 ngày 2026-11-02, nên các giả định của ghi chú được chốt như dưới đây.
  - Tạo trang hôm nay chỉ có "trang trắng" và "theo mục tiêu" (blueprint, S6). Agency muốn dùng lại trang đã chạy tốt cho khách khác.
- **Decision:**
  - **Một template** là một composition (section, variant, color scheme, spacing, hiển thị, nội dung, `samplePaths`, ADR-007) cùng tên, mô tả, mục tiêu, ngành và cờ "có form".
    - Template không mang theo lead, tên miền, nơi nhận lead, nội dung đồng ý, slug hay SEO riêng của trang.
    - Theme thuộc site và chỉ Chủ sở hữu đổi (ADR-004), nên trang tạo từ mẫu dùng theme của site đích. Chữ "Theme" ở màn 18 là theme mẫu được vẽ trong preview.
  - **Mẫu hệ thống** nằm trong code, ở `@plp/sections/schema` cạnh blueprint của mục tiêu: không nằm trong database, đổi qua code review.
    - Mỗi mẫu có `id` ổn định và `version` tăng khi nội dung đổi.
    - Mọi chữ là chữ mẫu và không có ảnh (khung ảnh trống). Checklist xuất bản nhắc thay chữ như hôm nay.
    - Bộ đầu có 12 mẫu, phủ các mục tiêu và ngành của bộ lọc màn 17. Unit test kiểm mỗi mẫu qua `parseComposition` của registry.
  - **Template của workspace** nằm trong workspace DB (ADR-025):
    - `templates { workspaceId, name, description, goal, industry, scope, currentVersion, archivedAt, createdBy, updatedAt }`.
      - `scope` là `{ kind: 'workspace' }` hoặc `{ kind: 'sites', siteIds }`.
    - `template_versions { workspaceId, templateId, version, composition, note, source: { pageId, kind: 'live' | 'draft' }, createdBy, createdAt }`.
      - Phiên bản bất biến như release (ADR-005).
      - "Dùng lại v1" tạo một phiên bản mới có nội dung của v1.
    - **Lưu trang thành template:**
      - Lấy từ bản live hoặc bản nháp hiện tại.
      - Lưu thành template mới, hoặc thành phiên bản mới của một template có sẵn.
      - Chọn giữa "Đánh dấu toàn bộ chữ là chữ mẫu" (`samplePaths` gồm mọi field chữ) và "Giữ chữ và ảnh như hiện tại".
    - Menu "…" có Sửa thông tin, Nhân bản, Lưu trữ và Khôi phục.
      - Không có xóa: trang đã tạo vẫn ghi mẫu nguồn của nó.
      - Lưu trữ chỉ ẩn mẫu khỏi thư viện.
    - Giới hạn: 100 template mỗi workspace, 50 phiên bản mỗi template, nên mọi danh sách có chặn trên.
  - **Ảnh:** asset thuộc một site (ADR-012). Composition của một trang chỉ được trỏ tới asset của chính site đó.
    - Lưu một phiên bản template chép các ảnh mà composition dùng thành asset của template, ở một prefix storage của workspace. Xóa site nguồn vì vậy không làm hỏng mẫu.
    - Tạo trang hay áp mẫu chép các ảnh đó thành asset mới của site đích (`CopyObject` trên storage, không tải xuống).
  - **Tạo trang từ mẫu:**
    - Gọi `POST /sites/:siteId/pages` với `start: { kind: 'template', source: 'system' | 'workspace', templateId, version }`.
    - Server đọc mẫu, cấp id mới cho từng section và parse composition bằng registry.
    - Trang ghi `createdFrom { kind: 'template', source, templateId, version }`, là nguồn của số "Đã dùng N trang".
    - Mẫu có form mà site chưa cài nơi nhận lead hay nội dung đồng ý thì vẫn tạo được. Hộp tạo có ghi chú như board 18, và checklist xuất bản chặn như hiện tại (ADR-016, 017).
  - **Áp dụng mẫu vào bản nháp đang sửa:**
    - Chỉ có "Thay toàn bộ section". Trang live, tên trang, đường dẫn và SEO giữ nguyên.
    - Từ màn 18 ("Áp dụng vào trang đang sửa…"), đó là một lần lưu bản nháp có `baseRevision` như autosave, rồi editor mở ra. "Quay về bản live" vẫn có.
    - Trong editor, đó là một command của store (ADR-008), tức một bước hoàn tác.
    - "Chỉ đổi theme" của board không làm, vì theme thuộc site (ADR-004).
  - **Quyền:**
    - Thư viện: mọi thành viên thấy mẫu hệ thống, và template của workspace nào có phạm vi chứa một site họ thấy được.
    - Tạo trang từ mẫu và áp mẫu: `pages.edit` trên site đích, như tạo trang hôm nay.
    - Lưu trang thành template, sửa thông tin, nhân bản, lưu trữ và dùng lại phiên bản cần quyền mới `templates.manage`, cộng `pages.view` trên site nguồn.
      - Chủ sở hữu, Quản trị và Biên tập có quyền này.
      - Board 16 có thêm hàng "Lưu và quản lý template của workspace" trong nhóm Nội dung; vai trò tùy chỉnh bật tắt được hàng này (ADR-024).
    - Template giới hạn site chỉ dùng được cho các site đó. Workspace khác nhận 404 như mọi tài nguyên (ADR-025).
  - **Màn:**
    - `/workspaces/[id]/templates` là màn 17:
      - tab "Tất cả", "Hệ thống" và "Của workspace";
      - tìm không dấu; lọc theo mục tiêu, ngành và "Có form thu lead";
      - "Tạo trang cho" chọn site đích; nút "Tạo bằng AI" (ADR-031).
    - Màn 18 là chi tiết một mẫu:
      - preview máy tính và điện thoại bằng chính component của `@plp/sections`;
      - danh sách section; mục "Cần có trước khi xuất bản" theo site đã chọn; phiên bản và số trang đã dùng.
    - Tab "Của workspace" là màn 19: bảng, menu "…", hộp lưu và lịch sử phiên bản.
    - Sidebar v2 có mục "Templates" trong nhóm WORKSPACE, với mọi vai trò.
    - Menu "…" của editor có "Lưu thành template" và "Áp dụng mẫu…".
    - Ảnh thu nhỏ được vẽ từ composition (loại section và color scheme), như thành phần TemplateThumb. Chưa có "Tải ảnh khác".
  - **Activity:** "tạo trang từ mẫu", "lưu template, phiên bản N" và "áp dụng mẫu vào bản nháp".
- **Ngoài phạm vi (Phase 4):** tab "Đã sở hữu từ Marketplace", mẫu trả phí, "Tìm trên Marketplace" và "Xem gói".
- **Reason:**
  - Template chỉ ghi vào bản nháp, nên không bất biến nào của ADR-005 đổi.
  - Mẫu hệ thống trong code có review và test như blueprint.
  - Phiên bản bất biến giữ cho trang đã tạo và lịch sử không đổi khi mẫu đổi.
- **Consequences:**
  - Thêm một quyền: ma trận vai trò, test role-matrix và màn 16 đổi theo.
  - Thêm hai collection và index của chúng trong mỗi workspace DB.
  - Integration test:
    - cô lập workspace và phạm vi site;
    - quyền;
    - phiên bản bất biến;
    - chép ảnh sang site khác;
    - tạo trang và áp mẫu với `baseRevision` cũ (409).
  - E2E:
    - tạo trang từ mẫu hệ thống;
    - lưu trang thành template rồi tạo trang ở site khác;
    - áp mẫu trong editor rồi hoàn tác.
- **Chi tiết khi làm (lát G1):**
  - **Mẫu hệ thống** (`systemTemplates` trong `@plp/sections/schema`):
    - `id` kebab-case luôn có dấu gạch ngang (`systemTemplateIdSchema`), nên không bao giờ đọc như ObjectId: một đoạn đường dẫn gọi được cả mẫu hệ thống lẫn template của workspace (G2). `version` bắt đầu từ 1; `updatedOn` là ngày của phiên bản.
    - Ngành nằm trong contracts (`templateIndustries`, 6 ngành của bộ lọc màn 17), mục tiêu là `pageGoalIds`. Mỗi ngành 2 mẫu, mục tiêu nào cũng có mẫu.
    - Mỗi mẫu có một nhịp màu (`PageStyle` của S6) thay cho color scheme ghi tay. Ảnh thu nhỏ và preview vẽ bằng theme của site chọn ở "Tạo trang cho" (ADR-004); không có site thì theme mặc định.
    - Nút của thanh điều hướng và nút chính của Hero dẫn tới form của trang, không có form thì tới "Gọi / Zalo nhanh", như blueprint (ADR-016).
    - Helper chữ mẫu (`benefit`, `faq`, `testimonial`, `SampleSection`) tách ra `sample-sections.ts`, dùng chung với blueprint, không export khỏi package.
  - **API:**
    - `GET /workspaces/:id/templates` trả `{ items }`, mỗi mục có `source: 'system'`. Không phân trang: danh sách có chặn trên (12 mẫu hệ thống, 100 template của workspace).
    - `GET /workspaces/:id/templates/:templateId?siteId=` trả composition để preview (id section cố định, đã parse bằng registry), `sections` (loại, variant, color scheme, nhãn), `usedCount` và `site`.
      - `usedCount` đếm trang có `createdFrom` của mẫu, mọi phiên bản, trong các site thành viên mở được (ADR-020). Index mới `pages_created_from_template { workspaceId, createdFrom.templateId, createdFrom.source, siteId }` trả lời mà không đọc trang; mỗi workspace DB thêm một index (khoảng 47, ADR-025, ADR-028).
      - `site` là `{ confirmedRecipients, recipientEmail, consentVersion, consentGaps }`. Email nhận lead chỉ trả cho vai trò có `leads.view`; vai trò khác thấy số lượng. Site ngoài phạm vi hay của workspace khác: 404.
      - Cả hai endpoint cần membership rồi `pages.view` (mọi vai trò); người ngoài: 404. Mẫu không có: 404 "Không tìm thấy mẫu".
    - **Tạo trang:** kiểm tra `pages.edit` trên site trước, rồi mẫu (404), rồi phiên bản.
      - Phiên bản khác phiên bản hiện tại: 409 `template_changed` kèm `currentVersion`. Người dùng không bao giờ nhận một phiên bản chưa xem trước.
      - Server cấp id section mới (`newSectionId`) và parse bằng registry. Trang mang `goal` của mẫu ("Hợp mục tiêu" ở "Thêm section").
    - `pages.createdFrom { kind: 'template', source, templateId, version }`: null với trang trắng và trang theo mục tiêu, trang cũ không có trường này. Chưa có trong contract của trang vì chưa màn nào đọc.
    - Activity `page.created_from_template` thay cho `page.created`: `data.version` là phiên bản mẫu, `data.template` là tên mẫu lúc đó. Câu hiển thị: "tạo trang “…” từ mẫu “Ưu đãi dịch vụ nha khoa” v1".
  - **Admin:**
    - **Màn 17:**
      - Tab là link (`?source=system`). G2 thêm "Của workspace" bằng một mục của `libraryTabs`.
      - Tìm không dấu: mỗi từ phải có trong tên, mô tả, ngành hoặc mục tiêu.
      - Số cạnh mỗi lựa chọn lọc đếm theo lựa chọn của các nhóm khác. Bỏ một chip thì focus tới chip kế tiếp, hết chip thì về ô tìm. Số mẫu đang hiện nằm trong một `role="status"`.
      - Nhãn mục tiêu là tên mục tiêu của màn 02 (`goalDefinitions`), không phải nhãn của board ("Webinar", "Bán sản phẩm"), vì mục tiêu là `pageGoalIds`.
      - "Tạo trang cho" chỉ hiện với `pages.edit`, gồm các site của thành viên; mặc định là site của `?site=`, rồi site mở gần nhất. Vai trò không sửa trang chỉ xem, kèm ghi chú ai được tạo.
      - "Dùng mẫu" mở hộp "Tạo trang từ mẫu" ngay trên thư viện; "Xem trước" mở màn 18.
    - **Màn 18:**
      - Preview là `PageView` ở chế độ edit không có `onTextChange`: chữ thuần, nút không dẫn đi đâu, khung ảnh trống. Trang dựng ở độ rộng thiết bị rồi thu nhỏ như canvas (`frameLayout`). Vùng cuộn nhận focus để cuộn bằng bàn phím.
      - "Cần có trước khi xuất bản" có thêm "Ảnh của bạn" khi mẫu có khung ảnh hiển thị; ảnh bắt buộc (Trước & sau) được ghi là bắt buộc.
      - "Đã dùng" ghi "trong các site của bạn" với thành viên bị giới hạn site.
    - **Hộp "Tạo trang từ mẫu":**
      - Đổi site thì đọc lại site cần gì.
      - Ghi chú createNeedsSetup dẫn tới "Dữ liệu & đồng ý" và "Nơi nhận lead" với vai trò có `privacy.manage`; vai trò khác thấy ai cần thiết lập.
      - 409 `template_changed` khóa nút tạo và có "Xem phiên bản mới", đọc lại màn.
    - **Sidebar v2:** "Templates" (`GridIcon`) ngay sau "Sites", với mọi vai trò; `aria-current="true"` trên màn 18.
  - **Để lại cho G2–G4:** tab "Của workspace", `templates.manage` và hàng của màn 16; "Áp dụng vào trang đang sửa…"; "Tạo bằng AI"; mọi phần Marketplace.
- **Chi tiết khi làm (lát G2):**
  - **Dữ liệu** (workspace DB, ADR-025):
    - `templates` có thêm `createdAt` và `updatedBy` (cột "CẬP NHẬT": ngày và người). `scope` lưu `{ kind: 'workspace' }` hoặc `{ kind: 'sites', siteIds }` với ObjectId.
    - `template_versions` có thêm `source.siteId` và `source.pageTitle` (tên trang lúc lưu), `reusedFrom` ("Dùng lại vN"), `assets` (ảnh của phiên bản), `sections` và `hasForm` (suy ra lúc lưu, để danh sách không đọc composition).
    - Index `templates_list { workspaceId, updatedAt, _id }` và `template_versions_version_unique { templateId, version }`: mỗi workspace DB thêm 2 collection và 4 index kể cả `_id` (khoảng 51, ADR-025).
    - Phiên bản bất biến: guard của schema từ chối mọi update và mọi delete, như release (ADR-005). Không có lối xóa template hay phiên bản.
    - **Giới hạn:** 100 template mỗi workspace, tính cả template lưu trữ, đếm trong transaction tăng `workspaces.templateSeq` ở master (như vai trò tùy chỉnh, ADR-024): 409 `template_limit_reached`, kể cả khi "Nhân bản". 50 phiên bản mỗi template: 409 `template_version_limit_reached`.
    - Phiên bản mới ghi có điều kiện `currentVersion = baseVersion`; lệch thì 409 `template_changed` kèm `currentVersion`, như khi tạo trang.
  - **Lưu trang thành template:**
    - `POST /workspaces/:id/workspace-templates` (template mới, v1) và `POST …/workspace-templates/:templateId/versions` (phiên bản mới; tên đổi được cùng lúc).
    - Thứ tự kiểm tra: membership (404), `templates.manage` (403), site nguồn trong phạm vi của thành viên và `pages.view` (404), trang thuộc site đó (404), rồi bản live (409 `page_not_live` khi trang không live) hoặc bản nháp.
    - "Đánh dấu toàn bộ chữ là chữ mẫu": `samplePaths` của mỗi section là `samplePathsOf` (mọi field chữ và nhãn nút có nội dung, kể cả field variant đang ẩn), và khung ảnh để trống, như mẫu hệ thống: hai lựa chọn của board khác nhau đúng ở "chữ và ảnh". "Giữ chữ và ảnh như hiện tại" giữ nguyên chữ, dấu chữ mẫu và ảnh.
    - Không bao giờ lưu: lead, tên miền, nơi nhận lead, nội dung đồng ý, slug, SEO (không nằm trong composition), và đích của nút dẫn tới một trang khác của site: nút thành "chưa chọn đích", vì trang thuộc một site như ảnh (ADR-012), và checklist xuất bản nhắc chọn lại.
    - Composition được parse bằng registry. Activity `template.saved` ("lưu template “X”, phiên bản N từ trang “…”") ghi ở site nguồn, trong transaction tăng `sites.dataSeq`, nên xung đột với xóa site (ADR-027).
  - **Ảnh:**
    - Lưu một phiên bản chép mỗi asset composition dùng (kể cả field ẩn) bằng `CopyObject` (`AssetStorage.copy`, không tải xuống) sang `public/{workspaceId}/templates/{id}.{ext}`, ngoài tiền tố của mọi site (`templates` không bao giờ là id site). Phiên bản ghi `assets` (key, loại, kích thước, mô tả mặc định), và composition của nó trỏ tới id ảnh của mẫu, không bao giờ tới asset của site.
    - Tạo trang và áp mẫu chép lại các ảnh đó thành asset mới của site đích (`public/{workspaceId}/{siteId}/…`), ghi trong cùng transaction với trang hay bản nháp. Transaction lỗi thì xóa các object vừa chép; xóa lỗi thì chỉ log, như ảnh tải lên bị từ chối.
    - "Nhân bản" và "Dùng lại" dùng chung object của mẫu: ảnh của mẫu không bao giờ đổi hay bị xóa.
    - Xóa site (ADR-027) bỏ site đó khỏi `scope.siteIds` của mọi template trong cùng transaction; template, phiên bản và ảnh của nó còn nguyên.
  - **Phạm vi site:**
    - Thành viên toàn workspace thấy mọi template, để quản lý được cả template không còn site nào. Thành viên bị giới hạn thấy template toàn workspace và template có một site của họ; template khác: 404.
    - Template giới hạn site chỉ dùng được ở các site đó, kể cả với Chủ sở hữu: tạo trang hay áp mẫu ở site khác trả 404 "Không tìm thấy mẫu".
    - API chỉ nêu các site thành viên thấy được trong `scope` và `siteIds`. "Sửa thông tin" của thành viên bị giới hạn giữ các site họ không thấy; chọn một site không phải của họ: 422.
    - Template lưu trữ không có trong thư viện nhưng vẫn xem được ở màn 18 và 19; tạo trang hay áp mẫu trả 409 `template_archived`. Lưu trữ và khôi phục lặp lại không đổi gì.
  - **API khác:** `GET /workspaces/:id/workspace-templates` (màn 19, có template lưu trữ, số trang đã tạo trong các site của thành viên bằng một aggregation trên index `pages_created_from_template`); `PATCH …/:templateId` (Sửa thông tin); `POST …/:templateId/duplicate` ("… (bản sao)", v1 là nội dung phiên bản hiện tại); `POST …/archive`, `…/restore`; `GET …/versions` (mới nhất trước, số trang đã tạo của từng phiên bản); `POST …/versions/:version/reuse { baseVersion }`. Danh sách và lịch sử phiên bản cần `pages.view`; mọi thao tác khác `templates.manage`.
  - **Thư viện và chi tiết:**
    - `GET /workspaces/:id/templates` thêm các template của workspace chưa lưu trữ mà thành viên thấy, sau 12 mẫu hệ thống, mới đổi trước. `goal` và `industry` của thẻ có thể null (template của workspace); `siteIds` là các site được dùng (null: mọi site).
    - `GET …/templates/:templateId` nhận id 24 hex là template của workspace, kèm `?version=` cho phiên bản cũ; trả thêm `currentVersion`, `archived` và `images` (bản chép ảnh của mẫu, công khai như ảnh của trang).
  - **Quyền `templates.manage`:** Chủ sở hữu, Quản trị và Biên tập (bảng ADR-020 thêm một hàng); hàng "Lưu và quản lý template của workspace" ở nhóm Nội dung của màn 16; vai trò tùy chỉnh bật tắt được, không phụ thuộc quyền nào khác (ADR-024).
  - **Admin:**
    - Tab "Của workspace · N" của màn 17 là `?source=workspace`, tức màn 19; `&archived=1` là tab "Lưu trữ".
    - Màn 19: bảng (ảnh thu nhỏ, tên, mục tiêu · ngành, phiên bản, "Ai được dùng", "Đã tạo", "Cập nhật"), "Phiên bản" cho mọi thành viên; menu "…" (Sửa thông tin, Nhân bản, Lưu trữ hoặc Khôi phục) và "Lưu trang thành template" chỉ với `templates.manage`. Bảng cuộn ngang trong vùng của nó ở màn hẹp.
    - Hộp lưu chọn site và trang nguồn, "Lấy từ" (bản live mặc định khi có), "Lưu thành" (template mới hoặc phiên bản mới của một template đang dùng). Template mới có thêm "Mô tả ngắn", "Mục tiêu" (mặc định mục tiêu của trang) và "Ngành", vì thẻ thư viện và bộ lọc của màn 17 cần chúng. Ảnh thu nhỏ vẽ từ bản nháp; với bản live nó được vẽ khi lưu. "Tải ảnh khác" vẫn chưa có.
    - Lịch sử phiên bản: "Xem trước" mở màn 18 ở `?version=N` (không tạo trang hay áp mẫu từ phiên bản cũ, có link về phiên bản đang dùng); "Dùng lại vN" với `templates.manage`.
    - Thẻ thư viện của template của workspace có chip "WORKSPACE" và meta "… · {tên workspace}". Khi site ở "Tạo trang cho" không được dùng mẫu, thẻ không có "Dùng mẫu" và ghi "Mẫu này chỉ dùng cho các site đã chọn khi lưu."; hộp tạo trang chỉ liệt kê các site được dùng.
    - Menu "…" của editor có "Lưu thành template" (với `templates.manage`): lưu bản nháp đang mở trước, rồi mở hộp lưu với trang này làm nguồn.
- **Chi tiết khi làm (lát G3):**
  - **Từ màn 18:** `POST /sites/:siteId/pages/:pageId/draft/template { baseRevision, template }`, quyền `pages.edit`.
    - Revision lệch trả 409 `revision_conflict` trước khi chép ảnh; lần ghi trong transaction kiểm lại, như autosave.
    - Chỉ thay `composition`: slug, SEO, tên trang và trang live giữ nguyên. Ảnh của mẫu thành asset của site; activity `page.template_applied` ("áp dụng mẫu “X” vào bản nháp của “…”") trong cùng transaction.
    - Hộp thoại chọn site (khi có nhiều), trang của site với trạng thái, và đọc bản nháp của trang được chọn: "Thay toàn bộ section" ghi số section thật của bản nháp và của mẫu; "Giữ nguyên" ghi phiên bản live thật.
    - **Lệch board:** bản nháp được lưu trên server trước khi editor mở, nên Ctrl+Z của editor không lấy lại nó. Ô thứ hai vì vậy ghi đúng đường quay lại: "Quay về bản live" với trang đang live, "Sao chép vào bản nháp" ở Lịch sử phiên bản với trang đã gỡ, và "Không hoàn tác được" với trang chưa từng xuất bản.
    - 409 `revision_conflict` đọc lại bản nháp và cho xác nhận lần nữa; 409 `template_changed` có "Xem phiên bản mới".
  - **"Chỉ đổi theme" của board không làm:** theme thuộc site và chỉ người có `sites.manage` đổi (ADR-004).
  - **Trong editor ("Áp dụng mẫu…"):**
    - `POST /sites/:siteId/pages/:pageId/template-composition` (`pages.edit`) kiểm mẫu như khi tạo trang, chép ảnh thành asset của site và trả composition cùng các asset đó; không ghi bản nháp.
    - Activity `page.template_applied` ghi lúc này, khi mẫu đến bản nháp; hoàn tác trong editor là một lần sửa như mọi lần sửa khác, không xóa activity hay ảnh đã chép.
    - Store có thêm một command, `applyTemplate(composition)`: id section mới (duy nhất trong trang, nút dẫn tới section của mẫu theo id mới, `withFreshSectionIds` của `@plp/sections/schema` dùng chung với API), kiểm bằng registry, rồi đúng một bước hoàn tác. Autosave lưu như mọi command.
    - Hộp thoại liệt kê mẫu hệ thống và template của workspace dùng được cho site, với ảnh thu nhỏ và số section thật.
- **Sửa sau review Phase 2 (2026-11-02), admin:**
  - "Xem trước vN" đọc `?version=` và gửi nó tới API; màn 18 mở ở chế độ "Bạn đang xem vN", không tạo trang hay áp mẫu. Trước đây màn luôn hiện phiên bản đang dùng.
  - **409 `template_archived`** (mẫu bị lưu trữ sau khi hiện):
    - "Tạo trang từ mẫu" và "Áp dụng vào trang đang sửa…" báo, tắt nút, đánh dấu `templateQueryKeys.all` là cũ và đọc lại màn. Hộp đang mở vẫn ở lại để nói lý do, kể cả khi thư viện đọc lại không còn thẻ của mẫu.
    - "Áp dụng mẫu…" của editor đọc lại thư viện và để trống lựa chọn, không tự chọn mẫu khác thay người dùng.
    - Chỉ vai trò có `templates.manage` được nhắc "Khôi phục"; vai trò khác được biết ai khôi phục được. Ghi chú mẫu lưu trữ của màn 18 cũng vậy.
  - "Áp dụng mẫu…" của editor không đóng được khi đang chuẩn bị mẫu, như các hộp mẫu khác: đóng giữa chừng thì kết quả vẫn thay mọi section của bản nháp.
  - **Menu "…" của màn 19:**
    - Nút "…" không bị tắt khi một thao tác chạy (nút bị tắt làm rơi focus); các mục thao tác chờ, mỗi lần một thao tác.
    - Lưu trữ hay khôi phục xong, refresh bỏ dòng đó: focus tới "…" của dòng kế, rồi dòng trước, rồi tab đang chọn.
    - Mọi thao tác đánh dấu `templateQueryKeys.all` là cũ, nên "Phiên bản mới của …" và "Áp dụng mẫu…" không còn đưa ra mẫu đã lưu trữ.
  - 422 có lỗi ở chỗ form không có field (composition bị registry từ chối, site không được chọn) được nói trong callout (`problemBesideFields`). Trước đây chỉ cần một lỗi nằm ở field là callout ẩn.
  - "Sửa thông tin" bắt đầu từ các site của phạm vi mà admin còn biết, nên lần lưu không gửi lại id của site đã xóa.
  - **Bố cục hẹp:**
    - `RadioCardGroup` không bao giờ rộng hơn nhóm (`minmax(min(w, 100%), 1fr)`), nên hộp áp mẫu không cuộn ngang ở 320 và 375 px.
    - Ô "Đường dẫn" (`PageSlugField`, `Input` với `wrapPrefix`) cho địa chỉ site xuống dòng riêng khi đường dẫn còn chưa tới 12rem bên cạnh nó. Trước đây đường dẫn chỉ còn vài ký tự.
- **Sửa sau review Phase 2 (2026-11-02), API:**
  - **Thu hẹp phạm vi:** thành viên bị giới hạn site không đổi được template toàn workspace thành template giới hạn site, vì việc đó lấy mẫu khỏi mọi site họ không thấy.
    - API trả 422 `narrows_workspace` ở `scope.siteIds`: "Mẫu này đang dùng cho mọi site. Chỉ thành viên của toàn workspace mới giới hạn được nó." Admin hiện lỗi dưới ô "Ai được dùng".
    - Chọn từ chối thay vì lặng lẽ giữ toàn workspace, như khi chọn một site không phải của họ (G2): người dùng thấy vì sao lựa chọn của họ không được lưu.
    - Họ vẫn mở rộng được sang toàn workspace, vẫn tạo template mới giới hạn ở site của họ, và vẫn sửa phạm vi của template đã giới hạn.
  - **Lịch sử phiên bản:** `source.pageId` và `source.pageTitle` là `null` khi thành viên không mở được site của trang nguồn (ADR-020). Admin ghi "Lưu từ một trang ở site khác".
  - **Site bị xóa trong lúc lưu template:** tạo template, "Sửa thông tin" và "Nhân bản" ghi template trong transaction tăng `sites.dataSeq` của mọi site trong `scope.siteIds` (một `updateMany`), nên xung đột với `$pull` của việc xóa site (ADR-027).
    - Site thành viên vừa chọn mà đã mất: 422 `site_not_found` "Có site không còn trong workspace".
    - Site giữ từ trước (site họ không thấy, phạm vi của template được nhân bản) mà đã mất thì rời phạm vi.
    - Nhờ vậy `scope.siteIds` không bao giờ giữ site đã xóa, và "Sửa thông tin" sau đó không còn 422.
  - **Đích của nút với "Đánh dấu toàn bộ chữ là chữ mẫu":**
    - Số điện thoại, Zalo và đường dẫn ngoài của nút thành "chưa chọn đích", như link tới trang khác. Nút chỉ nhận một loại đích (nút gọi và nút Zalo của "Gọi / Zalo nhanh") giữ loại đó với số trống. Nút tới một section của trang giữ nguyên.
    - "Giữ chữ và ảnh như hiện tại" giữ các đích này: agency đã chọn dùng lại nội dung của doanh nghiệp đó, gồm chữ, ảnh, số điện thoại và đường dẫn. Checklist xuất bản vẫn nhắc như mọi trang.
  - **Commit không rõ kết quả:** ảnh vừa chép chỉ bị xóa khi transaction lỗi trước commit.
    - Lỗi mang nhãn `UnknownTransactionCommitResult` (driver thôi thử lại commit) có thể đã ghi trang, bản nháp, asset hay phiên bản trỏ tới các ảnh đó, nên ảnh được giữ (`commitMayHaveApplied`, `shared/persistence/transaction.ts`).
    - Commit đó không ghi thì ảnh là file công khai không ai trỏ tới, như ảnh tải lên bị từ chối (ADR-027).
- **Amended 2026-11-04 (ADR-032, chuyển động):**
  - Mỗi mẫu hệ thống có một phong cách chuyển động theo ngành, ghi vào `composition.motion` của trang tạo từ mẫu; nội dung đổi nên `version` của mẫu tăng.
  - Template của workspace mang `motion` trong composition của phiên bản. Áp mẫu vào bản nháp thay cả `motion`, cùng một bước hoàn tác.
  - Editor nhắc phong cách mẫu đã chọn sẵn ("Template đã dùng chọn sẵn phong cách …") cho trang tạo từ mẫu hệ thống, với nút tắt toàn bộ và dùng lại.

### ADR-031 — AI: cổng adapter, tạo trang từ brief, trợ lý trong editor

- **Date:** 2026-11-02 · **Status:** Accepted
- **Context:**
  - Board 20–21 và ghi chú `phase2Decisions`.
  - Chủ sản phẩm quyết định ngày 2026-11-02:
    - trước mắt nối một AI local bằng API key;
    - làm adapter để sau này nối các nhà cung cấp phổ biến;
    - hạn mức 100 lượt mỗi workspace mỗi tháng.
- **Decision:**
  - **Cổng `AiTextModel`** nằm trong module `ai` của API. Nó có một hàm: nhận lời dặn hệ thống, prompt, JSON Schema của kết quả, số token tối đa và `AbortSignal`, rồi trả chữ cùng số token đã dùng. Adapter:
    - `openai-compatible`:
      - gọi `POST {AI_BASE_URL}/chat/completions` bằng `fetch`, không thêm thư viện;
      - gửi `Authorization: Bearer {AI_API_KEY}` và `model: AI_MODEL`, và yêu cầu kết quả JSON;
      - chạy được với AI local (Ollama, LM Studio, vLLM, LiteLLM) và mọi dịch vụ có API tương thích.
    - `fake`: kết quả xác định, chỉ dùng cho test và E2E; API từ chối khởi động với adapter này khi `NODE_ENV=production`.
    - Adapter khác (Anthropic, Gemini…) cắm vào cùng cổng về sau. Mỗi adapter cần một bổ sung ADR, vì nó đổi nơi nhận dữ liệu.
    - Env:
      - `AI_PROVIDER`: `none`, `openai-compatible` hoặc `fake`;
      - `AI_BASE_URL`, `AI_API_KEY` (secret, không vào log), `AI_MODEL`;
      - `AI_TIMEOUT_MS`, mặc định 60000;
      - `AI_MONTHLY_QUOTA`, mặc định 100.
    - Với `none` (mặc định khi thiếu cấu hình), mọi lối vào AI hiện "AI chưa được bật" và gợi ý dùng template.
  - **Kết quả của AI là dữ liệu không tin cậy:**
    - Chỉ nhận JSON, parse bằng schema của section trong registry.
    - AI chỉ viết field chữ và nhãn nút. Nó không viết đích của link, số điện thoại, ảnh hay variant.
    - Độ dài theo giới hạn của field; không có HTML.
    - Sai schema thì thử lại một lần, rồi coi phần đó là chưa viết được.
  - **Dữ liệu gửi đi:**
    - Có: brief người dùng nhập, tên site, và chữ của bản nháp trong phạm vi được chọn.
    - Không bao giờ: lead, nội dung đồng ý, nơi nhận lead, dữ liệu cá nhân.
    - Prompt và kết quả không vào log (redact như body của lead, ADR-013).
  - **Hạn mức:**
    - Một lượt là một lần "Viết nội dung" của cả trang ở màn 20, hoặc một yêu cầu thành công của trợ lý.
    - Một bộ đếm mỗi workspace mỗi tháng lịch theo giờ Việt Nam, trong workspace DB. Lượt được giữ chỗ nguyên tử (`$inc` có điều kiện) trước khi gọi AI, và trả lại khi không có gì được ghi: lỗi, quá tải hay người dùng hủy.
    - Thử lại section lỗi trong cùng một lần tạo không tốn thêm lượt, tối đa 2 lần.
    - Thêm giới hạn 10 yêu cầu AI mỗi phút cho mỗi người dùng.
    - Board vẽ hai hạn mức riêng (20 lượt tạo trang, 50 lượt sửa). Chủ sản phẩm chọn một hạn mức chung là 100. Phase 4 sẽ gắn con số theo gói.
  - **Tạo trang bằng AI** (màn 20, `/sites/[siteId]/pages/new/ai`):
    - Brief gồm:
      - sản phẩm hoặc dịch vụ, khách hàng mục tiêu, mục tiêu trang (các mục tiêu của S6), điểm khác biệt;
      - giọng văn (Thân thiện, Chuyên nghiệp, Năng động) và ngôn ngữ (Tiếng Việt, English);
      - "Nội dung bạn đã có" dạng chữ dán vào. Chưa nhận tệp.
    - **Cấu trúc đề xuất không gọi AI và không tốn lượt:**
      - Nó lấy từ blueprint của mục tiêu; người dùng sắp xếp, bỏ hay thêm section.
      - Dòng gợi ý của mỗi section là mô tả của section đó, không viết theo brief như board.
      - Nhờ vậy bước này không tốn chi phí AI ngoài hạn mức.
    - **"Viết nội dung" là một job trên server:**
      - Job nằm ở `ai_jobs` trong workspace DB: brief, cấu trúc, trạng thái từng section và lượt đã giữ. API viết các section song song, có giới hạn đồng thời.
      - Admin nhận tiến độ qua response streaming (NDJSON) của chính request khởi chạy, không polling.
      - Người dùng rời màn thì job vẫn chạy tới cuối, và bản nháp xuất hiện trong danh sách trang.
      - Job có hạn chạy. Job quá hạn (ví dụ API khởi động lại giữa chừng) được đánh dấu thất bại và lượt được trả.
    - **Kết thúc:**
      - Có ít nhất một section viết được thì tạo trang (bản nháp) với tên và đường dẫn người dùng nhập. Section chưa viết được giữ chữ mẫu.
      - Không section nào viết được thì không tạo trang và lượt được trả.
  - **Câu cần kiểm tra:**
    - AI đánh dấu các câu nêu số liệu, giá hay cam kết, nhất là về y tế.
    - Section lưu các đường dẫn đó ở `reviewPaths`, cạnh `samplePaths`.
    - Checklist xuất bản có cảnh báo `ai_review` ("Câu do AI viết cần kiểm tra").
    - Sửa field nào thì đường dẫn của field đó rời `reviewPaths`.
  - **Trợ lý trong editor** (màn 21) là tab "Trợ lý AI" cạnh "Thuộc tính":
    - Phạm vi: đoạn chữ đang chọn, section, hoặc toàn trang.
    - Tác vụ: Viết lại, Rút gọn, Đổi giọng văn, Gợi ý tiêu đề, Gợi ý CTA, Viết nội dung section, Gợi ý SEO, hoặc yêu cầu tự do (tối đa 300 ký tự).
    - `POST /sites/:siteId/pages/:pageId/ai/suggestions` không đổi bản nháp.
      - Nó trả các thay đổi `{ sectionId, path, before, after, review }` đã parse.
      - Nó tốn một lượt khi có ít nhất một thay đổi hợp lệ.
    - "Áp dụng" là một command của store, tức một bước hoàn tác, rồi autosave như mọi sửa đổi. "Bỏ" không đổi gì.
    - **Xung đột:** request mang chữ hiện tại của phạm vi. Nếu bản nháp trong editor đã đổi phạm vi đó khi kết quả về, panel báo "đã thay đổi trong lúc AI chạy" với hai lựa chọn:
      - "Tạo lại với nội dung mới", một yêu cầu mới;
      - "Vẫn xem gợi ý": áp dụng sẽ ghi đè thay đổi đó.
    - Hủy giữa chừng thì hủy request và trả lượt.
  - **Quyền:** `pages.edit` trên site, cho cả hai luồng.
  - **Mức dùng:**
    - Hiện "Còn N/100 lượt tháng này".
    - Khi hết lượt: nút bị tắt, brief được giữ, và màn ghi "Lượt mới có vào 01/MM".
    - Chưa có "Xem gói" (Phase 4).
- **Ngoài phạm vi:**
  - Tạo ảnh và đọc tệp đính kèm (PDF, ảnh).
  - Dịch trang có sẵn.
  - Adapter Anthropic và Gemini. OpenAI chạy qua `openai-compatible`, nhưng dùng nó cho dữ liệu thật vẫn cần bổ sung ADR và xác nhận ở §6.
  - AI không bao giờ xuất bản.
- **Reason:**
  - AI chỉ ghi vào bản nháp qua command hay qua lần lưu có `baseRevision`, nên mọi bất biến của ADR-005 giữ nguyên.
  - Cổng adapter tách code sản phẩm khỏi nhà cung cấp.
  - Kết quả được parse bằng registry như dữ liệu từ client.
  - Hạn mức có giữ chỗ, nên lỗi không làm mất lượt.
- **Consequences:**
  - Composition thêm `reviewPaths`. Bản nháp cũ đọc vào có `[]`, và release giữ nguyên field này như `samplePaths`.
  - Integration test:
    - hạn mức (đồng thời, trả lượt, đổi tháng);
    - job dở dang;
    - cô lập workspace;
    - quyền;
    - kết quả AI sai schema;
    - không có dữ liệu cá nhân trong prompt, kiểm qua adapter giả ghi lại request;
    - không có prompt trong log.
  - E2E dùng `AI_PROVIDER=fake`: tạo trang bằng AI rồi mở editor; trợ lý viết lại Hero, áp dụng rồi hoàn tác.
- **Chi tiết khi làm (lát G4):**
  - **Endpoint** (đều cần `pages.edit` trên site):
    - `GET /sites/:siteId/ai/usage`: `{ enabled, month, limit, used, remaining, resetsOn }`. Đọc mức dùng cũng kết thúc các job quá hạn của workspace trước.
    - `POST /sites/:siteId/ai/page-jobs` (brief, tên trang, đường dẫn, cấu trúc) và `POST …/page-jobs/:jobId/retry` trả 200 với luồng NDJSON (`application/x-ndjson`): `started` (job), `section` (tiến độ từng section), `heartbeat`, rồi `finished` (job).
    - `GET …/page-jobs/:jobId` để đọc lại job khi luồng bị đứt (màn có nút "Xem tiến độ", không polling); `POST …/page-jobs/:jobId/cancel` cho "Hủy".
    - Từ chối trước khi luồng bắt đầu, nên chưa tốn lượt: 409 `ai_disabled`, 429 `rate_limited`, 422 cấu trúc sai (đường dẫn `structure.N…`) hay không có gì để viết, 409 `slug_taken` hoặc `page_limit_reached`, 429 `ai_quota_exhausted` (kèm `resetsOn`).
  - **Luồng NDJSON:** `heartbeat` mỗi 10 giây, vì rewrite `/api` của Next cắt kết nối im lặng quá 30 giây và một section có thể lâu hơn. `Cache-Control: no-store, no-transform`, vì nén gzip của Next giữ các dòng lại tới khi đủ khối.
  - **AI không viết** (bổ sung quy tắc "chỉ field chữ và nhãn nút"):
    - tên hiển thị của thanh điều hướng (trống là tên site);
    - mọi nhận xét của Cảm nhận khách hàng: đó là lời và tên của khách thật, AI chỉ viết tiêu đề;
    - chú thích ảnh của Trước & sau, vì AI không thấy ảnh;
    - cả Chân trang: tên doanh nghiệp, địa chỉ, số điện thoại, giờ làm việc, liên kết, bản quyền.
    - Nhãn của nút đang không dùng (nhãn trống) cũng không được viết, để không tạo nút không dẫn tới đâu.
    - Section không còn gì để viết có trạng thái `kept` ("Bạn tự điền"), không tính là viết được hay lỗi. Cấu trúc chỉ có các section như vậy bị từ chối (422).
  - **Danh sách:** AI chọn số mục trong giới hạn của variant; prompt gợi ý bằng số mục hiện có. Mục thêm lấy từ `newItem` của field, nên biểu tượng và ảnh giữ mặc định.
  - **Kết quả của AI** là JSON (chấp nhận khung code bao quanh), mỗi field là chuỗi trong giới hạn, không có thẻ HTML, không có chữ Hán, Kana hay Hangul (model nhỏ hay lẫn sang), rồi được registry parse.
    - Câu trả lời bị cắt ở giới hạn token cũng tính là sai.
    - Lần thử lại duy nhất kèm danh sách lỗi, không bao giờ kèm câu trả lời đã bị từ chối.
  - **`reviewPaths`** = câu AI đánh dấu, cộng mọi câu AI viết có chữ số, vì model nhỏ hiếm khi đánh dấu đủ.
    - Cảnh báo `ai_review` mỗi section một mục: "Câu do AI viết cần kiểm tra trong section “Hero”", fingerprint `ai_review:section:{id}`, đích là đường dẫn đầu tiên, không có mục "đã đạt" tương ứng.
    - Panel thuộc tính ghi "AI viết · cần kiểm tra" cạnh nhãn field.
  - **Bản nháp ban đầu** dựng từ cấu trúc: section trùng (loại, variant) với blueprint của mục tiêu lấy chữ mẫu của blueprint, section khác lấy chữ mẫu của chính nó; màu theo nhịp "Nhẹ nhàng"; nút chính của Hero dẫn tới form khi trang có form, như trang theo mục tiêu (ADR-016).
  - **Kết thúc một lượt chạy** luôn là update có điều kiện theo `run.id` khi job còn `running`, nên chỉ một cách kết thúc thắng và lượt chỉ được trả một lần:
    - viết được: tạo trang và kết thúc job trong cùng một transaction;
    - không viết được gì, "Hủy", hay quá hạn: lượt đầu trả lượt trong cùng transaction;
    - lượt chạy thua (bị hủy hay hết hạn trước khi kịp ghi) không ghi gì: transaction tạo trang bị bỏ.
    - "Hủy" kết thúc job ngay và trả lượt; lượt chạy ở instance khác ghi muộn thì không khớp `run.id`.
  - **"Thử lại"** chỉ ghi khi bản nháp còn đúng revision job đã ghi, bằng `baseRevision` như autosave; bản nháp đã bị sửa thì trả 409 `revision_conflict` trước khi gọi AI, và nếu bị sửa trong lúc chạy thì các section đó là `draft_changed`.
  - **Hạn chạy:** ngân sách = số vòng (`AI_CONCURRENCY` section một vòng, mặc định 3) × 2 lần × `AI_TIMEOUT_MS`. Runner tự dừng ở ngân sách; hạn lưu trong job thêm 60 giây cho bước ghi. Job quá hạn được kết thúc khi đọc mức dùng hay job, và lúc khởi động (mọi workspace), với lỗi `interrupted`. Khi API dừng, các lượt chạy bị dừng và vẫn tạo bản nháp với những section đã viết.
  - **Hạn mức:** `ai_usage { workspaceId, month }` (unique), bộ đếm được tạo trước transaction; lượt được giữ bằng `$inc` có điều kiện trong chính transaction ghi job. Trả lượt về đúng tháng đã giữ. Giới hạn 10 yêu cầu mỗi phút tính theo người dùng trên mọi workspace, trong `lead_limits` ở master, và tính cả yêu cầu bị từ chối.
  - **`ai_jobs` tự xóa sau 30 ngày** (TTL theo `expiresAt`): job chỉ là bản ghi công việc, brief không cần giữ lâu hơn.
  - **Prompt:** lời dặn bằng tiếng Anh, ngôn ngữ của chữ theo brief và được nhắc lại ở cuối (model nhỏ viết theo ngôn ngữ của brief). Prompt có tên site, mục tiêu, brief, tên các section theo thứ tự, mô tả section, các field kèm giới hạn và chữ hiện có của đúng các field đó; không có link, ảnh, mô tả ảnh hay số điện thoại.
  - **Log:** `brief`, `system`, `prompt`, `messages`, `output` bị che ở object được log (và một cấp bên trong) và ở mọi độ sâu của lỗi được log. `AiError` không bao giờ chứa prompt hay câu trả lời; adapter không đọc body lỗi của dịch vụ.
  - **Adapter `openai-compatible`:** `response_format` là `json_schema`, `max_tokens` theo độ dài các field (tối đa 4096), `stream: false`. HTTP 429, 503, 529 là quá tải; 408, 504 là hết giờ; 5xx khác là không dùng được; 4xx khác là bị từ chối.
  - **Màn 20:**
    - Bước Brief có thêm "Tên trang" và "Đường dẫn" (board không vẽ chỗ nhập); tên trang theo sản phẩm cho tới khi được sửa.
    - "Tạo bằng AI" nằm ở header của màn 02 (cạnh "Bắt đầu trống"), và ở màn 17 như board: cạnh "Tạo trang cho" (cho site đang chọn) và ở trạng thái không có mẫu nào khớp.
    - "Chọn template thay vì AI" và "Dùng template" mở thư viện template cho site đó. Màn "AI chưa được bật" có thêm "Tạo trang theo mục tiêu".
    - Viết đủ mọi section thì mở thẳng editor; viết được một phần thì hiện "Gần xong" với số section viết được trên số section AI viết. "Hủy" đưa về bước cấu trúc.
  - **Kiểm thử thật với Ollama `qwen3:4b-instruct`** (2026-11-02): cả 6 section của trang thu lead viết và qua registry ngay lần đầu, mỗi section 3–40 giây chạy lần lượt; FAQ chậm nhất. Model vẫn bịa chi tiết (chính sách hủy, thời gian điều trị) và hay đánh dấu thừa: cảnh báo `ai_review` là lưới an toàn, không thay người đọc lại.
- **Chi tiết khi làm (lát G5):**
  - **Quy tắc "AI được viết gì"** (`copyPlanOf`, `AI_NEVER_WRITES`) chuyển từ API sang `@plp/sections/schema` (`ai-copy.ts`), cùng `aiWritablePaths` (mọi đường dẫn chữ AI được viết của section lúc này, kể cả từng mục danh sách đang có) và `aiActionPaths` (phần tác vụ viết: tất cả, chỉ `heading` cho "Gợi ý tiêu đề", chỉ nhãn nút đang dùng và `submitLabel` của form cho "Gợi ý CTA"). Editor chỉ gửi những đường dẫn này; API từ chối mọi đường dẫn khác.
  - **Endpoint** `POST /sites/:siteId/pages/:pageId/ai/suggestions` (`pages.edit`):
    - Body: `scope` (`field` gồm `sectionId` và `path`, `section`, `page`), `action` (`rewrite`, `shorten`, `change_tone` kèm `tone`, `suggest_heading`, `suggest_cta`, `write_section`, `suggest_seo`, `custom` cho yêu cầu tự do), `instruction` (≤ 300 ký tự, bắt buộc với `custom`, kèm theo được mọi chip), `sections` (chữ của phạm vi: mỗi section `{ id, type, variant, texts: { path: chữ } }`, gồm thay đổi chưa lưu), `seo` cho "Gợi ý SEO".
    - "Đoạn chữ" và "Section" gửi cả section, vì API dựng lại section bằng registry: chữ mẫu của variant, danh sách đúng số mục editor đang có, mọi chữ AI được viết thay bằng chữ editor gửi (thiếu là trống, nên nút không dùng vẫn không dùng). Đường dẫn AI không được viết là 422 `not_writable`; registry parse kết quả như mọi bản nháp.
    - "Viết nội dung section" chỉ cho phạm vi Section; "Gợi ý SEO" chỉ cho Toàn trang. Không có gì để viết thì 422 `nothing_to_write`. Mọi lần từ chối đều trước khi giữ lượt; giới hạn 10 yêu cầu mỗi phút tính cả yêu cầu bị từ chối, như G4.
    - Trả 200 với luồng NDJSON như G4: `heartbeat` mỗi 10 giây rồi một dòng `result` `{ changes, charged, failure, usage }`. Mỗi thay đổi là `ok` `{ sectionId | 'seo', path, before, after, review }` hoặc `failed` `{ …, failure }`; chữ AI để nguyên thì không thành thay đổi.
  - **Gọi AI:** mỗi section có chữ trong phạm vi là một request (`AI_CONCURRENCY` request cùng lúc, mặc định 3), "Gợi ý SEO" là một request đọc chữ của trang (tối đa 4.000 ký tự). Danh sách giữ đúng số mục (gợi ý đổi chữ, không thêm bớt mục). Câu trả lời không vừa thì thử lại một lần kèm danh sách lỗi; sau đó field nào qua được thì giữ, field còn lại là `failed` ("Chưa viết được phần này"). Ngôn ngữ theo chữ của phạm vi (có chữ cái riêng của tiếng Việt thì tiếng Việt). SEO được hỏi theo độ dài khuyến nghị (60, 160) và kiểm theo giới hạn của `seoSchema`.
  - **Hạn mức:** giữ lượt trong transaction trước khi gọi AI; trả lượt khi không có thay đổi `ok` nào (lỗi, trả lời sai, chữ không đổi) hoặc khi client đã đi (đóng request trước khi có kết quả, kể cả lúc đang giữ lượt). API nghe `close` của response từ đầu request. Chấp nhận: API dừng giữa chừng thì lượt đó mất, vì không có bản ghi giữ lượt như `ai_jobs`.
  - **Log:** một dòng "AI suggestion ended" chỉ có số đếm, token và thời gian; lỗi của từng request ghi loại lỗi, không có prompt, chữ hay câu trả lời.
  - **Admin:**
    - Cột phải có hai tab "Thuộc tính" và "Trợ lý AI" (tablist, phím mũi tên); hai panel giữ nguyên khi đổi tab, trợ lý chỉ đọc mức dùng khi mở lần đầu. "Sửa" từ checklist mở lại tab "Thuộc tính".
    - "Đoạn chữ" là ô chữ được focus sau cùng của section đang chọn, trên canvas (`data-content-path` của chữ trên canvas) hoặc trong bảng thuộc tính; chưa có thì tùy chọn này tắt. Phạm vi đã chọn mà không còn dùng được thì lùi về phạm vi rộng hơn.
    - Chip không dùng được ở phạm vi đang chọn có `aria-disabled` và lý do đọc được. "Đổi giọng văn" mở menu ba giọng văn của brief. Ctrl+Enter gửi yêu cầu tự do.
    - Board vẽ "Phương án 1 2 3"; lát này trả một phương án.
    - **Áp dụng** là command `applyAiChanges`: một bước hoàn tác, chỉ ghi vào đường dẫn AI được viết của section còn tồn tại, bỏ chữ mẫu ở đó, đặt `reviewPaths` cho câu được đánh dấu. SEO đi qua chính quy tắc của command SEO (`seoRecipe`, dùng chung với `updateSeo`). Autosave lưu như mọi sửa đổi.
    - "Đã áp dụng N thay đổi vào bản nháp" nằm ở chân canvas với "Hoàn tác", chỉ khi bản nháp vẫn là bản lần áp dụng tạo ra; sửa tiếp thì nút đó biến mất và Ctrl+Z lùi từng bước.
    - **Xung đột:** khi kết quả về, so chữ của phạm vi lúc gửi với bản nháp hiện tại ("Đoạn chữ" chỉ so ô đó; phạm vi khác so mọi chữ, bố cục và mục danh sách). Bấm "Áp dụng" cũng so lại; khác thì hiện xung đột thay vì ghi đè.
    - "Thử lại" của một phần lỗi là một yêu cầu "Đoạn chữ" (SEO thì hỏi lại SEO), nên tốn một lượt nếu viết được.
    - Trình đọc màn hình nghe trạng thái qua announcer của editor; thất bại và xung đột là `role="alert"`. Focus chỉ chuyển khi control đang giữ focus biến mất hoặc nằm trong panel trợ lý, nên người đang gõ trên canvas lúc AI chạy không bị cướp focus.
  - **Kiểm thử thật với Ollama `qwen3:4b-instruct`** (2026-11-02): "Viết lại" Hero 4,6–6 giây, FAQ 2 câu 9 giây, "Rút gọn" một ô 2,4 giây, "Gợi ý SEO" 5,2 giây; JSON hợp lệ và qua registry ngay lần đầu. Lời dặn ban đầu làm model trả nguyên 3 trên 4 ô của Hero, nên "Viết lại" nói rõ không trả lại ô không đổi. Model vẫn chỉ đổi cách viết hoa ở vài ô và thêm khẳng định về sức khỏe không có số ("không cảm thấy đau gì cả") mà không đánh dấu; người dùng vẫn phải đọc gợi ý trước khi áp dụng.
- **Sửa sau review Phase 2 (2026-11-02), admin:**
  - **Trợ lý:**
    - Phần lỗi được "Thử lại" và viết được thì focus tới checkbox của phần đó, rồi tới tiêu đề kết quả. Nút "Thử lại" đó tắt khi hết lượt, như nút của trạng thái thất bại.
    - Focus không bao giờ tới control nằm trong panel đang ẩn: "Hoàn tác" trên canvas khi tab "Thuộc tính" mở đưa focus tới tab "Trợ lý AI".
    - Cột phải rộng 320 px, hẹp hơn board 21: nhãn phạm vi không xuống dòng giữa chữ, các lựa chọn xuống hàng.
  - **Màn 20:**
    - "Thử lại", "Thử lại N section" và "Xem tiến độ" đổi lượt chạy trong cùng một bước. Khi focus bị mất, tiêu đề nhận focus.
    - Dời một section làm tắt mũi tên đang giữ focus (cạnh thanh điều hướng hay chân trang): focus sang mũi tên kia, rồi nút "Bỏ" của dòng.
    - Danh sách tiến độ không còn là live region ("Xong" không kèm tên section). Một vùng status đọc một câu cho mỗi thay đổi.
    - Thất bại thì ẩn danh sách, như board. Mất kết nối thì giữ trạng thái cuối đã biết, không ghi "Chờ" cho mọi section.
    - Mức dùng ở header được đọc lại khi lượt chạy bắt đầu (`started`), nên hiện lượt đã giữ. Khi lượt chạy kết thúc, mức dùng được đọc lại lần nữa (lượt được trả khi không viết được gì hoặc khi hủy).
- **Sửa sau review Phase 2 (2026-11-02), API:**
  - **Lượt chạy bị kết thúc ở nơi khác thôi gọi AI:** "Hủy" tới một instance khác (ADR-004), "Hủy" rơi vào giữa lúc ghi job và lúc runner nhận lượt chạy, hay job bị xóa cùng site (ADR-027).
    - Mỗi lần ghi tiến độ là update có điều kiện theo `run.id` khi job còn `running`. Không khớp thì lượt chạy dừng (`superseded`): nó không ghi được gì nữa.
    - Trạng thái `writing` được ghi trước khi gọi AI cho mỗi section, và trước lần thử lại của một section runner đọc lại job. Vì vậy không section nào, không lần thử lại nào được gửi sau khi job đã kết thúc; request đang chờ thì xong rồi bị bỏ.
  - **"Thử lại" dừng giữa chừng:** lượt chạy ghi các section nó viết (`run.sectionIds`). Lượt "Thử lại" kết thúc mà không ghi bản nháp ("Hủy", quá hạn, lỗi) đặt lại `failed` mọi section của nó, kể cả section đã `done`, vì chữ đó chưa tới bản nháp. Chúng thử lại được; lần "Thử lại" đó vẫn được tính vào giới hạn 2 lần.
  - **Xóa site:** job thuộc site như mọi dữ liệu của site (ADR-027). Bắt đầu job tăng `sites.dataSeq`; xóa site trả lượt của job còn chạy lần đầu đúng một lần và xóa `ai_jobs` của site.
  - **Trợ lý chỉ tính lượt khi kết quả tới client:** lượt được giữ lại khi dòng `result` đã được gửi hết và response kết thúc (`finish`).
    - Client đi trước đó, kể cả lúc API đang đọc mức dùng cho kết quả, thì lượt được trả, một lần, và log ghi "AI suggestion not delivered".
    - Lỗi khi dựng kết quả cũng trả lượt.
  - **`AI_CONCURRENCY`** (1 đến 8, mặc định 3): số section job tạo trang và trợ lý viết cùng lúc, và số section một vòng của ngân sách chạy. Ollama local trả lời từng yêu cầu một nếu không đặt `OLLAMA_NUM_PARALLEL`, nên đặt `AI_CONCURRENCY=1` ở đó.
- **Amended 2026-11-04 (ADR-032, chuyển động):**
  - **Bước cấu trúc** có thêm khối "Chuyển động": mặc định "AI chọn", kèm phong cách dự kiến từ bảng ngành (ngành đoán theo từ khóa của brief) hoặc giọng văn (Chuyên nghiệp → Tinh tế, Năng động → Năng động, Thân thiện → Mượt mà; không có gì → Mượt mà). Người dùng chọn được một trong 6 phong cách. Bước này vẫn không gọi AI và không tốn lượt.
  - **Job:** khi người dùng để "AI chọn", runner gọi AI thêm một lần sau khi viết các section, trước khi tạo bản nháp. Kết quả là phong cách cùng tối đa 3 ghi đè section, theo JSON Schema có `enum`.
    - Kết quả được làm sạch bằng `resolveSectionMotion`: bỏ section bị khóa, điểm nhấn section không có, "Theo hàng" ở section không phải lưới.
    - Lỗi, quá hạn hay kết quả sai thì dùng phong cách dự kiến; job không thất bại vì bước này, không thử lại, không tốn thêm lượt.
    - Người dùng đã chọn phong cách thì không gọi AI cho chuyển động và không có ghi đè section.
    - Dữ liệu gửi đi là brief và danh sách loại, variant của section, không thêm gì.
  - "Thử lại N section" không chọn lại chuyển động. Trợ lý trong editor không đổi chuyển động.

### ADR-032 — Chuyển động: phong cách trang, hiệu ứng xuất hiện của section

- **Date:** 2026-11-04 · **Status:** Accepted
- **Context:**
  - Board 37–40 và ghi chú `motion`, `motionDecisions` của artifact thiết kế (nhập từ phiên bản `1793733435-70e7`).
  - Chủ sản phẩm quyết định ngày 2026-11-04:
    - bản đầu chỉ có 10 hiệu ứng "đã có" của màn 40: 6 cách xuất hiện và 4 điểm nhấn. 24 hiệu ứng còn lại để sau;
    - làm màn 37, 38 và 39;
    - thêm section Số liệu nổi bật để điểm nhấn "Số liệu đếm lên" có chỗ chạy;
    - AI tạo trang đề xuất phong cách, người dùng đổi được (ADR-031).
- **Decision:**
  - **Ba lớp, đều là preset** (không free styling, §2 quy tắc 8):
    1. Phong cách của cả trang: Không hiệu ứng (mặc định trang mới), Tinh tế, Mượt mà, Năng động, Sang trọng, Vui tươi. Mỗi phong cách quy định cách xuất hiện, thứ tự và điểm nhấn mặc định.
    2. Tùy chỉnh thêm: mức độ Nhẹ / Vừa / Rõ, bật tắt từng điểm nhấn, và "Giảm chuyển động trên điện thoại".
    3. Ghi đè từng section: cách xuất hiện, thứ tự, điểm nhấn. Không ghi đè là "theo cài đặt trang". Trang để "Không hiệu ứng" thì không section nào chuyển động, kể cả section có ghi đè: tắt toàn bộ luôn là một lựa chọn.
  - **Hiệu ứng:**

    | Nhóm           | Id                                            | Tên                                                                                     |
    | -------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- |
    | Cách xuất hiện | `fade`, `up`, `side`, `zoom`, `pop`, `reveal` | Hiện dần, Trượt lên, Trượt từ bên (chữ từ trái, ảnh từ phải), Phóng nhẹ, Bật lên, Hé lộ |
    | Thứ tự         | `together`, `stagger`, `rows`                 | Cùng lúc, Lần lượt, Theo hàng (chỉ section dạng lưới)                                   |
    | Điểm nhấn      | `lines`, `image`, `count`, `steps`            | Tiêu đề từng dòng, Ảnh hé lộ, Số liệu đếm lên, Các bước nối nhau                        |

    | Phong cách | Xuất hiện | Thứ tự   | Điểm nhấn           | Thời lượng | Bước   |
    | ---------- | --------- | -------- | ------------------- | ---------- | ------ |
    | Tinh tế    | `fade`    | together | —                   | 320 ms     | 60 ms  |
    | Mượt mà    | `up`      | stagger  | lines, count, steps | 360 ms     | 70 ms  |
    | Năng động  | `side`    | stagger  | count, steps        | 280 ms     | 55 ms  |
    | Sang trọng | `reveal`  | stagger  | lines, image        | 480 ms     | 110 ms |
    | Vui tươi   | `pop`     | rows     | count, steps        | 380 ms     | 70 ms  |
    - "Bước" là khoảng cách giữa hai phần khi thứ tự là Lần lượt (Tinh tế dùng nó khi một section chọn Lần lượt); Theo hàng nghỉ hai bước giữa hai hàng. Quy trình có "Các bước nối nhau" luôn hiện từng bước, cách nhau ít nhất 180 ms (ba bước của phong cách), để đường nối kịp vẽ.
    - Mức độ: khoảng trượt 8 / 12 / 16 px, thu nhỏ ban đầu .98 / .96 / .94 (Bật lên .94 / .9 / .86), thời lượng × .85 / 1 / 1.15.
    - Thời lượng theo khung 250–400 ms của ghi chú thiết kế, không theo mockup (380–750 ms cho dễ xem). Sang trọng 480 ms để giữ "hé lộ chậm". Các con số nằm ở một bảng (`MOTION_STYLES`) và cần thử lại trên thiết bị thật.

  - **Dữ liệu nằm trong composition** (ADR-007), nên đi theo bản nháp, release, JSON công khai và template:

    ```ts
    Composition     = { version: 1, motion?: PageMotion, sections: SectionInstance[] }
    PageMotion      = { style, level: 'low'|'mid'|'high', accents: Partial<Record<Accent, boolean>>,
                        reduceOnMobile: boolean }
    SectionInstance = { …, motion?: { enter?, order?, accents?: Partial<Record<Accent, boolean>> } }
    ```

    - `motion` của trang vắng nghĩa là `DEFAULT_PAGE_MOTION`, `{ style: 'none', level: 'mid', accents: {}, reduceOnMobile: false }`, nên composition và release cũ đọc ra "Không hiệu ứng". `parseComposition` bỏ `motion` bằng giá trị đó, nên trang cũ và trang được đặt lại "Không hiệu ứng" giống hệt nhau. `version` vẫn là 1, không cần `upgrade()`.
    - `accents` của trang chỉ chứa điểm nhấn người dùng đã chỉnh khác phong cách ("đã chỉnh" / "theo phong cách"). Đổi phong cách xóa các chỉnh này, như board 37.
    - `motion` của section vắng nghĩa là theo trang. `parseComposition` bỏ ghi đè rỗng, nên một thay đổi không có tác dụng không thành chip.
    - Mỗi variant khai báo năng lực chuyển động (`SectionVariant.motion`): dạng lưới hay không, và các điểm nhấn có nội dung tương ứng. `resolveSectionMotion` (`@plp/sections/schema`, thuần) gộp phong cách, ghi đè, năng lực và khóa; renderer, canvas, panel, chip xuất bản và AI dùng chung hàm này.

  - **Quy tắc:**
    - Thanh điều hướng và section đầu tiên sau nó luôn hiện ngay; panel ghi "Luôn hiện ngay" và lý do.
    - Mỗi section chạy một lần khi vào vùng nhìn. Section đã nằm trong vùng nhìn lúc tải hiện ngay, không chạy, nên trang không nháy.
    - Chỉ `transform` và `opacity`, không đổi bố cục. Hiệu ứng lặp, gắn với cuộn hay parallax không có.
    - Nội dung luôn đủ khi JavaScript lỗi: chỉ runtime mới ẩn phần chưa chạy. Số liệu có giá trị thật trong HTML.
    - Thiết bị bật giảm chuyển động (`prefers-reduced-motion`) thấy nội dung ngay, số liệu ở giá trị thật. "Giảm chuyển động trên điện thoại": dưới 768 px chỉ còn hiện dần, cùng lúc; số liệu vẫn đếm.
    - Editor đứng yên. Hiệu ứng chạy khi bấm "Chạy thử" (cả trang, một section, ¼ tốc độ, như thiết bị bật giảm chuyển động) và ở link xem trước.
    - Hover nút, mở câu hỏi, gửi form là phản hồi của hệ thống, giống nhau ở mọi phong cách; chuyển động không đổi chúng.
  - **Hiển thị** (`@plp/sections/react`):
    - `SectionFrame` gắn cách xuất hiện, thứ tự, điểm nhấn và thời lượng đã phân giải thành thuộc tính `data-motion-enter|order|accents` và biến CSS `--plp-m-dur`, `--plp-m-step`. Gốc của trang có `data-motion-root` và khoảng trượt, tỉ lệ của mức độ.
    - Section đánh dấu các phần chuyển động bằng `data-m="text"` hay `data-m="media"` (`Text`, `CtaButton` nhận `part`); một phần không chứa phần khác. CSS Module `motion.module.css` chứa keyframes, và chỉ ẩn phần của section đang `data-motion="wait"`.
    - `MotionRuntime` là client component nhỏ, chỉ có ở trang có phong cách khác "Không hiệu ứng", trên trang live và xem trước. Sau hydration nó:
      - để nguyên section đang nằm trong vùng nhìn; đặt `wait` cho section khác và chạy chúng (`run`) khi đỉnh của chúng qua 85% chiều cao vùng nhìn, hoặc khi 95% của section đã hiện. Điều kiện sau cho section ngắn ở cuối trang (chân trang thấp hơn 15% màn hình), vốn không bao giờ có đỉnh qua mốc đó;
      - ghi thứ tự của từng phần (`--plp-m-i`): thứ tự trong trang, hay hàng theo vị trí;
      - với "Tiêu đề từng dòng", tách từng từ của tiêu đề (`h1`, `h2`) vào khung che và đánh số dòng theo vị trí, đặt `aria-label` là cả tiêu đề, rồi trả lại đúng các text node cũ khi chạy xong;
      - chạy xong thì bỏ `data-motion`, nên section trở về như chưa từng có hiệu ứng.
      - Nó chỉ ghi những thuộc tính và biến CSS mà React không render. Không có `IntersectionObserver` hay thiết bị giảm chuyển động thì nó không làm gì.
    - In trang luôn hiện hết. Không đổi header hay CSP của renderer.
  - **Chip thay đổi:** đổi `motion` của trang là chip "Chuyển động: <phong cách>" (kind `motion`); đổi `motion` của section là "Sửa: <section>".
  - **Template:** mẫu hệ thống có phong cách theo ngành. Template của workspace mang `motion` trong composition của nó. Áp mẫu vào bản nháp thay cả `motion`, hoàn tác được.
  - **Ngành và phong cách** (nhãn "Hợp ngành", gợi ý của AI):

    | Ngành           | Hợp ngành           |
    | --------------- | ------------------- |
    | Nha khoa & y tế | Tinh tế, Mượt mà    |
    | Spa & làm đẹp   | Sang trọng, Tinh tế |
    | Giáo dục        | Năng động, Mượt mà  |
    | Bất động sản    | Sang trọng, Mượt mà |
    | Nhà hàng & F&B  | Vui tươi, Năng động |
    | Thể hình        | Năng động, Vui tươi |

    Nhãn chỉ hiện khi biết ngành: trang tạo từ mẫu hệ thống.
- **Editor (lát M3, màn 37–39):**
  - Không chọn section nào thì cột phải là "Cài đặt trang · Áp dụng cho cả trang", có hai tab: **Chuyển động** (màn 37) và **SEO & chia sẻ** (dẫn sang màn SEO như trước). Panel cấu trúc trang có thêm nút "Chuyển động · <phong cách>" mở tab này.
  - Store có các command, mỗi lần đổi là một bước hoàn tác và đi qua `validateComposition`:
    - `setMotionStyle`, `setMotionLevel`, `setMotionAccent`, `setMotionReduceOnMobile` cho trang;
    - `setSectionEnter`, `setSectionOrder`, `setSectionAccent` cho section, với `null` là theo trang. Bị từ chối ở section bị khóa, "Theo hàng" ở section không phải lưới, và điểm nhấn section không có.
  - Bật một điểm nhấn về đúng giá trị của phong cách (ở trang) hay của trang (ở section) thì nó thôi là thay đổi riêng ("theo phong cách", "Theo cài đặt trang").
  - Trang để "Không hiệu ứng" thì nhóm "Hiệu ứng xuất hiện" của section chỉ nói vì sao không có gì chuyển động và mở Cài đặt trang.
  - Thư viện phong cách (màn 39) đổi phong cách bằng cùng command với màn 37. Mức độ trong thư viện chỉ đổi các mẫu xem thử; mức độ của trang chỉ có một editor chính thức là màn 37.
  - Quy trình có "Các bước nối nhau" đang bật luôn hiện từng bước theo đường nối, nên nhóm của nó không cho chọn thứ tự mà chỉ nói lý do.
  - Section Số liệu nổi bật có đúng 3 con số thì trên điện thoại cũng xếp một hàng, chữ số 24 px, như board.
  - Banner "Chạy thử" được ghim ở đầu canvas, vì canvas tự cuộn tới cuối trang khi chạy; trong lúc chạy không có nút "Thêm section ở đây".
  - **Chạy thử** là trạng thái của editor, không phải của bản nháp: không có bước hoàn tác, không lưu.
    - Chạy cả trang thì canvas cuộn lên đầu rồi tự cuộn xuống (1,4 giây mỗi màn hình), mọi section có chuyển động chạy khi vào khung, kể cả section đang hiện. Chạy một section thì cuộn tới nó rồi chạy.
    - "Xem chậm" nhân thời gian với 4 (`--plp-m-speed`). "Như thiết bị bật giảm chuyển động" hiện mọi thứ ngay.
    - Trong lúc chạy, chữ trên canvas không sửa được và mỗi section có nhãn hiệu ứng của nó. "Quay lại chỉnh sửa", hay bất kỳ thay đổi nào của bản nháp, dừng chạy thử và trả section về như cũ.
    - Canvas dùng chính runtime và keyframes của trang công khai (`playMotion`); thẻ phong cách và thư viện dùng `MotionSample` với cùng keyframes.
  - **Template:** `GET` chi tiết trang trả thêm `createdFrom` (template và phiên bản trang được tạo từ đó, `null` nếu không có). Editor dùng nó cho nhãn "Hợp ngành" và dòng "Template đã dùng chọn sẵn phong cách …", chỉ với mẫu hệ thống.
  - Không làm phần demo "Phản hồi khi thao tác" của màn 37 (di chuột lên nút, mở câu hỏi, gửi form); panel chỉ giữ dòng giải thích.
- **Reason:** Chuyển động làm trang sinh động hơn mà không mở free styling. Preset cùng một hàm phân giải giữ admin, renderer và AI khớp nhau, và quy tắc giảm chuyển động, không JavaScript giữ trang đọc được với mọi khách.
- **Consequences:**
  - Trang có hiệu ứng tải thêm một client component nhỏ; trang "Không hiệu ứng" không đổi.
  - Thêm hiệu ứng (24 hiệu ứng còn lại của màn 40) là thêm id vào contracts và keyframes, cần bổ sung ADR này.
  - Release cũ không có `motion` vẫn render như trước.
- **Lát:** M0 tài liệu; M1 mô hình và hiển thị; M2 section Số liệu nổi bật; M3 editor (màn 37–39); M4 AI chọn chuyển động (§5).

---

## 5. Lát cắt giao hàng

Mỗi lát gồm unit, integration, E2E Playwright cho luồng chính, và một lần so màn hình với thiết kế. Dừng để duyệt sau mỗi lát.

**So màn hình với thiết kế** (sửa ngày 2026-10-31, vòng test thứ ba) là bước làm bằng tay, không phải quality gate tự động:

- `pnpm --filter @plp/e2e visual:capture` (sau `pnpm build` và `pnpm infra:up`) chạy các app đã build trên database riêng `plp_visual`, gieo dữ liệu mẫu của board qua API (workspace "Mây Xanh Agency", site "Nha khoa Smile Care", 6 trang ở mọi trạng thái, lead, lượt xem, yêu cầu dữ liệu), rồi chụp mỗi màn đã làm ở kích thước board của nó vào `tests/e2e/visual-captures/` (gitignore). Công cụ dùng cổng của E2E, nên không chạy cùng `pnpm test:e2e`.
- Người làm lát đặt từng ảnh cạnh board tương ứng trong `docs/design/plp-ux-v1/screens` và sửa chỗ lệch rõ. Chỗ khác có chủ đích nằm ở §2.1 và các ADR.
- Không có `toHaveScreenshot`: board chỉ render được bằng runtime của artifact Design, không nằm trong repo; và pixel của trình duyệt khác nhau giữa các hệ điều hành, nên một baseline ảnh sẽ báo lỗi giả.

| Lát      | Nội dung                                                        | Màn         | Trạng thái |
| -------- | --------------------------------------------------------------- | ----------- | ---------- |
| Nền móng | Monorepo, docker compose, CI, tài liệu                          | —           | Xong       |
| S1       | Auth, workspace, site, khung admin, dashboard                   | 01, Sidebar | Xong       |
| S2       | Registry 7 section, theme, editor ba vùng, autosave, asset      | 03, 04      | Xong       |
| S3       | Preview, kiểm tra, publish, renderer, revalidate                | 05, 09      | Xong       |
| S4       | Lịch sử, rollback, undo, gỡ trang, khôi phục nháp, activity     | 06, 01      | Xong       |
| S5       | SEO, redirect, sitemap, robots, cài đặt site, tên miền mặc định | 07, 08      | Xong       |
| S6       | Tạo trang theo mục tiêu                                         | 02          | Xong       |

**Hoàn thành MVP A** khi một E2E chạy xanh toàn bộ chuỗi:

1. Đăng ký → tạo site → tạo trang theo mục tiêu → sửa nội dung → preview.
2. Publish v1 → URL public đúng nội dung v1.
3. Sửa nháp → trang live không đổi.
4. Publish v2 → rollback về v1.
5. Undo → trang live là v2.

**MVP B:**

| Lát        | Nội dung                                                                                                              | Màn             | Trạng thái |
| ---------- | --------------------------------------------------------------------------------------------------------------------- | --------------- | ---------- |
| Quyết định | ADR-016…019, quy tắc 10–11                                                                                            | —               | Xong       |
| B1         | Cài đặt dữ liệu cá nhân, phiên bản đồng ý, snapshot `leadCapture`, mục sidebar                                        | 12 (phần trên)  | Xong       |
| B2         | Section Form, gửi form qua renderer, lưu lead, chống spam, rate limit, blueprint                                      | 02, 04, 05, 09  | Xong       |
| B2.1       | Sửa sau QA: số điện thoại E.164 (+84 mặc định), nút lưu không bị hụt khi validate, nhãn "Thêm section", icon xác nhận | 03, 04, 09, 12  | Xong       |
| B3         | Hộp thư lead, trạng thái, ghi chú, spam, xuất CSV, xuất và xóa dữ liệu một người                                      | 10, 01, Sidebar | Xong       |
| B4         | Nơi nhận lead có xác nhận, email thông báo, gửi lại, Mailpit                                                          | 10, 05, 03      | Xong       |
| B5         | Yêu cầu từ người gửi form, hạn xử lý, nhật ký                                                                         | 12 (phần dưới)  | Xong       |
| B6         | Beacon, khách duy nhất theo ngày, tổng hợp, màn Hiệu quả                                                              | 11              | Xong       |

**Hoàn thành MVP B** khi một E2E chạy xanh toàn bộ chuỗi:

1. Owner nhập đơn vị thu thập dữ liệu, link chính sách, nội dung đồng ý và một email nhận lead, rồi xác nhận email đó trong Mailpit.
2. Tạo trang theo mục tiêu "Thu lead" → publish.
3. Khách mở trang live và gửi form có tick đồng ý.
4. Email thông báo tới Mailpit.
5. Lead có trong hộp thư, với bằng chứng đồng ý đúng bản đã publish.
6. Màn Hiệu quả có lượt xem và 1 lead.
7. Owner ghi nhận yêu cầu xóa và xóa dữ liệu người đó: lead biến mất và số lead về 0.

**Phase 1 — Vận hành & đội nhóm:**

| Lát | Nội dung                                                                                                                           | Màn            | Trạng thái |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------- |
| C1  | Sáu vai trò, phạm vi site, kiểm tra quyền ở mọi endpoint, Sidebar v2, màn Vai trò & quyền (ADR-020)                                | 16, Sidebar v2 | Xong       |
| C2  | Thành viên, lời mời qua email, nhận lời mời, đổi quyền, gỡ, yêu cầu đổi quyền và duyệt, chuyển quyền sở hữu (ADR-021)              | 15, 15b        | Xong       |
| C3  | Tên miền riêng: on-demand TLS, không trùng tên miền (ADR-022), bản ghi DNS và TXT, xác minh, địa chỉ chính, 301, renderer, sitemap | 13, 14, 08     | Xong       |
| C4  | Duyệt xuất bản: Cộng tác viên gửi yêu cầu, Chủ sở hữu và Quản trị duyệt (ADR-023)                                                  | 05, 16         | Xong       |
| C5  | Vai trò tùy chỉnh (ADR-024)                                                                                                        | 16, 15         | Xong       |

**Tách database (ADR-025):**

| Lát | Nội dung                                                                                                        | Màn                    | Trạng thái |
| --- | --------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------- |
| D1  | Master DB và workspace DB, endpoint mang `siteId`, tạo DB lúc đăng ký, index mọi DB, đường công khai qua master | —                      | Xong       |
| D2  | Địa chỉ admin riêng mỗi workspace, cookie dùng chung, chọn workspace ở địa chỉ chung, link email theo workspace | 34, 35, 36, Sidebar v2 | Xong       |

**Hoàn thiện trước Phase 2** (chủ sản phẩm yêu cầu ngày 2026-11-02):

| Lát | Nội dung                                                                                                                                                                               | Màn              | Trạng thái |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------- |
| E1  | Khớp thiết kế: bước tên miền và trạng thái địa chỉ ở màn 01, tìm trang không dấu, sự kiện tên miền, chẩn đoán và kiểm tra trùng ở màn 13–14, mục đã đạt về địa chỉ (ADR-005, 006, 022) | 01, 05, 13, 14   | Xong       |
| E2  | Khớp thiết kế: lịch sử, thành viên, nhận lời mời (ADR-006, 021)                                                                                                                        | 06, 15, 15b      | Xong       |
| E3  | Tài khoản: xác nhận email khi đăng ký, quên và đổi mật khẩu (ADR-026)                                                                                                                  | 34               | Xong       |
| E4  | Xóa trang, xóa site (ADR-027)                                                                                                                                                          | 01, Cài đặt site | Xong       |
| E5  | Quy trình 3 bước, Logo đối tác, Trước & sau, Gọi / Zalo nhanh, link chính sách ở chân trang (ADR-007)                                                                                  | 04, 09           | Xong       |
| E6  | Màn Sites, số đếm ở Sidebar v2 (ADR-028)                                                                                                                                               | Sidebar v2       | Xong       |

**Phase 2 — Tạo trang nhanh** (chủ sản phẩm yêu cầu ngày 2026-11-02):

| Lát | Nội dung                                                                                                               | Màn                | Trạng thái |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------- |
| G1  | 12 mẫu hệ thống, thư viện, chi tiết và preview, tạo trang từ mẫu, mục Templates của Sidebar v2 (ADR-030)               | 17, 18, Sidebar v2 | Xong       |
| G2  | Template của workspace: lưu trang thành template, phiên bản, phạm vi site, lưu trữ, chép ảnh, quyền `templates.manage` | 19, 17, 16         | Xong       |
| G3  | Áp dụng mẫu vào bản nháp: từ màn 18 và từ editor, một bước hoàn tác (ADR-030)                                          | 18, 03             | Xong       |
| G4  | Cổng AI và adapter `openai-compatible`/`fake`, hạn mức, job, tạo trang bằng AI, `reviewPaths` và cảnh báo `ai_review`  | 20, 05             | Xong       |
| G5  | Trợ lý AI trong editor: phạm vi, tác vụ, gợi ý có so sánh, áp dụng là một bước hoàn tác, xung đột (ADR-031)            | 21, 03             | Xong       |

**Hoàn thành Phase 2** khi một E2E chạy xanh toàn bộ chuỗi:

1. Tạo trang từ một mẫu hệ thống → sửa chữ mẫu → xuất bản.
2. Lưu trang đó thành template của workspace → tạo trang từ template ở site khác, ảnh đã được chép sang.
3. Áp một mẫu vào bản nháp trong editor → hoàn tác → trang live không đổi.
4. Tạo trang bằng AI (adapter giả) → bản nháp có cảnh báo `ai_review` → trợ lý viết lại Hero → áp dụng → hoàn tác.
5. Số lượt AI còn lại giảm đúng số lượt đã dùng.

**Chuyển động** (chủ sản phẩm yêu cầu ngày 2026-11-04, ADR-032):

| Lát | Nội dung                                                                                                          | Màn            | Trạng thái |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------------- | ---------- |
| M0  | Nhập board 37–40, ADR-032, bổ sung ADR-007, 030, 031                                                              | —              | Xong       |
| M1  | `motion` trong composition, hàm phân giải, CSS và runtime của renderer, chip thay đổi, mẫu hệ thống có phong cách | 09, 05         | Xong       |
| M2  | Section Số liệu nổi bật, điểm nhấn đếm lên, AI không viết con số                                                  | 04, 09         | Xong       |
| M3  | Editor: phong cách của trang, hiệu ứng của section, thư viện phong cách, chạy thử                                 | 37, 38, 39, 03 | Xong       |
| M4  | AI tạo trang: khối Chuyển động ở bước cấu trúc, AI chọn phong cách và ghi đè section, dự phòng theo bảng ngành    | 20             | Chưa làm   |

**Hoàn thành Chuyển động** khi một E2E chạy xanh toàn bộ chuỗi:

1. Tạo trang bằng AI (adapter giả) để "AI chọn" → bản nháp có phong cách AI chọn.
2. Trong editor đổi phong cách, ghi đè một section, chạy thử → publish.
3. Trang live: section dưới màn hình chạy hiệu ứng khi cuộn tới; thiết bị giảm chuyển động thấy nội dung ngay.
4. Rollback về bản trước → trang live trở lại phong cách cũ.

## 6. Trước khi phát hành

Các điều kiện dưới đây nằm ngoài code. Mỗi mục trỏ về ADR quy định nó. Chưa đủ hết thì không đưa dữ liệu thật của khách vào.

**Hạ tầng production**

- Edge proxy (TLS, load balancer) đứng trước admin và renderer, nối địa chỉ socket vào `X-Forwarded-For`. Đặt `TRUST_PROXY_HOPS=1` cho API (ADR-004) và `TRUST_PROXY=true` cho renderer (ADR-016). Thiếu edge này thì mọi người dùng chung một bucket rate limit.
- MongoDB chạy replica set (ADR-006). Storage tương thích S3 chỉ cho đọc công khai prefix `public/` (ADR-012).
- Mỗi workspace có database riêng `{master}_ws_{workspaceId}` (ADR-025):
  - User MongoDB của API cần quyền đọc, ghi và tạo index trên mọi database đó (`readWriteAnyDatabase` và `dbAdminAnyDatabase`, hoặc vai trò tương đương), vì MongoDB không cấp quyền theo tiền tố tên database. Quyền này xóa được mọi database của cluster, nên cluster chỉ dành cho hệ thống này.
  - **Backup** chụp cùng một thời điểm cho master và mọi workspace DB (snapshot của cluster). `mongodump --db` từng database không nhất quán với master, vì tạo site và xác minh tên miền ghi cả hai trong một transaction.
  - **Khôi phục một workspace** từ snapshot thì khôi phục cả các dòng của nó ở master cùng thời điểm: `site_addresses`, `domains`, `memberships`, `custom_roles`, `invitations`, `access_requests`. Khôi phục master mà thiếu workspace DB thì API tạo database rỗng cho workspace đó lúc khởi động.
  - Lúc khởi động, API dựng index cho mọi workspace DB (8 database cùng lúc); số workspace tăng thì thời gian khởi động tăng theo. Một workspace DB không dựng được index thì API không khởi động, như ADR-013.
  - **Index mới hay đổi của collection trong workspace DB:** sau khi mọi instance cũ đã dừng, khởi động lại instance mới một lần, để workspace nào đăng ký trên instance cũ trong lúc chuyển cũng có index đó. Đổi option của index đã có vẫn là bước migration chạy trước khi deploy, trên mọi workspace DB.
  - **Đăng ký mở** tạo một database cho mỗi email đã xác nhận (ADR-026). ADR-025 tính cho dưới 500 workspace trên một cluster: theo dõi số workspace, và giới hạn đăng ký nếu cần.
- Địa chỉ admin của workspace (ADR-025):
  - Bản ghi DNS wildcard và chứng chỉ wildcard `*.{miền admin}` qua DNS-01, cùng lý do với `*.{BASE_DOMAIN}` (giới hạn chứng chỉ của CA).
  - API và admin cùng đặt `ADMIN_ORIGIN` và `ADMIN_WORKSPACE_ORIGIN_TEMPLATE`; API đặt thêm `SESSION_COOKIE_DOMAIN`. Hai cách đặt:
    - địa chỉ chung ở miền cha: `https://app.example.vn` với `https://{slug}.app.example.vn`, miền cookie `app.example.vn`;
    - địa chỉ chung ngang hàng, mang tên dành riêng `app`: `https://app.admin-domain.vn` với `https://{slug}.admin-domain.vn`, miền cookie `admin-domain.vn`. Chỉ dùng khi cả tên miền đó là của admin.
  - Mọi host dưới miền cookie là admin: không đặt blog, mail hay dịch vụ bên thứ ba ở đó, vì chúng nhận cookie phiên và được kiểm tra `Origin` tin. Miền cookie và `BASE_DOMAIN` không chứa nhau; API kiểm tra điều này lúc khởi động.
  - Admin được build và chạy với cùng các biến này.
  - Biên chuyển nguyên header `Host` cho admin: admin đọc nó để biết đang mở workspace nào. Host bị viết lại thì mọi màn của workspace chuyển hướng không dứt.
- API có ít nhất 1 GB RAM, đủ để giải mã ảnh lớn (ADR-012).
- Nhà cung cấp SMTP có SPF và DKIM cho domain gửi của `LEAD_EMAIL_FROM`, cấu hình qua `SMTP_URL` (ADR-018). Hoặc `MAIL_TRANSPORT=sqs` (ADR-029): plp-mailer có đủ 14 template (PR plp-mailer#1 đã merge) và đã deploy với domain gửi đã xác minh (DKIM) và quyền gửi production của SES, `MAIL_QUEUE_URL` và `MAIL_QUEUE_REGION` lấy từ stack của nó, và `MailProducerPolicy` được gắn cho role của API.
- Mọi secret trong `.env.example` được sinh mới cho production, và `COOKIE_SECURE=true`.
- GitHub Actions chạy lại được, hiện đang bị khóa do billing của tài khoản, và CI xanh trên `main`.
- Tên miền riêng (ADR-022):
  - Caddy ở biên bật on-demand TLS, với `ask` trỏ tới `GET /public/tls/allowed` của API, và chuyển mọi host về renderer.
  - Chứng chỉ wildcard `*.{BASE_DOMAIN}` qua DNS-01 (plugin DNS của nhà cung cấp tên miền) cho địa chỉ mặc định của các site.
  - Biên có IPv4 tĩnh, đặt vào `CUSTOM_DOMAIN_IPV4`; tên miền gốc của khách trỏ bản ghi A về đó.
  - Bản ghi DNS của `CUSTOM_DOMAIN_CNAME_TARGET` trỏ về biên.
  - `CUSTOM_DOMAIN_ORIGIN_TEMPLATE=https://{host}`, `DOMAIN_TLS_CHECK=on` và không đặt `DOMAIN_DNS_ZONE_FILE`.
- API dựng index lúc khởi động và không khởi động khi một index không dựng được (ADR-013). Vì vậy:
  - đổi option của index đã có (`expireAfterSeconds` của TTL, `partialFilterExpression`, unique) là bước migration chạy trước khi deploy (xóa rồi tạo lại, hoặc `collMod` với TTL); thiếu bước này thì bản mới dừng ở `IndexOptionsConflict`;
  - index mới trên collection lớn được dựng trước khi deploy;
  - không xóa hay đổi tên index khi API đang chạy.

- AI (ADR-031): đặt `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` cho dịch vụ AI của production. Không dùng `fake`.
  - Một job viết `AI_CONCURRENCY` section cùng lúc (mặc định 3). AI tự host xếp hàng các yêu cầu (Ollama mặc định), nên đặt cho nó xử lý song song ít nhất bằng số đó (`OLLAMA_NUM_PARALLEL`), hạ `AI_CONCURRENCY` (1 cho một Ollama không đặt `OLLAMA_NUM_PARALLEL`), hoặc tăng `AI_TIMEOUT_MS`: thời gian chờ trong hàng cũng tính vào hạn của mỗi yêu cầu.

**Chủ sản phẩm cần quyết**

- `BASE_DOMAIN` của production, tức domain của địa chỉ mặc định `{subdomain}.{BASE_DOMAIN}`.
- Dịch vụ AI của production (ADR-031): AI tự host, hay một nhà cung cấp bên ngoài. Bên ngoài thì cần adapter và bổ sung ADR.

**Người phụ trách pháp lý cần xác nhận** (ADR-017)

- Hạn xử lý yêu cầu dữ liệu: 2 và 20 ngày làm việc, chưa trừ ngày lễ.
- Thời gian lưu lead mặc định 12 tháng, và nội dung đồng ý mặc định.
- Thời gian giữ chính các yêu cầu dữ liệu.
- Nếu AI của production không tự host (ADR-031): việc gửi brief và chữ của bản nháp (không có dữ liệu cá nhân) cho nhà cung cấp, và điều khoản xử lý dữ liệu của họ.
