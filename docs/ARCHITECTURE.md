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

**MVP B (convert), đang làm:**

- Section Form đăng ký, thu lead có bằng chứng đồng ý, chống spam (ADR-016).
- Đồng ý và dữ liệu cá nhân: đơn vị thu thập dữ liệu, nội dung đồng ý có phiên bản, thời gian lưu, yêu cầu từ người gửi form (ADR-017).
- Hộp thư lead và email thông báo (ADR-018).
- Hiệu quả trang, đo không dùng cookie (ADR-019).
- Tương ứng màn 10–12, cộng các phần MVP A đang ẩn ở màn 01, 02, 04, 05, 09 và sidebar.

**Ngoài phạm vi MVP B:**

- Google Sheets, Meta Conversions API, Zalo OA; "Form + bản đồ", section Bảng giá, "Section đã lưu".
- Form có trường tùy ý, captcha của bên thứ ba, banner cookie, tạo trang chính sách từ mẫu.
- Custom domain, mời thành viên, billing, template library, AI.
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
   - Không free styling: chỉ variant, color scheme đã qua kiểm tra tương phản AA, và spacing preset.
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

Chỉ API được truy cập MongoDB. Renderer không import code admin và vẫn chạy khi admin tắt.

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

### ADR-003 — Tenancy: một database, scope theo workspace

- **Date:** 2026-10-24 · **Status:** Accepted
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

### ADR-005 — Mô hình miền Draft/Release và trạng thái suy ra

- **Date:** 2026-10-24 · **Status:** Accepted
- **Decision:**

  ```ts
  users       { email(unique, lowercase), passwordHash, name, createdAt }
  workspaces  { name, createdAt, createdBy }
  memberships { workspaceId, userId, role: 'owner'|'editor' }                 // unique(workspaceId,userId)
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

### ADR-010 — Preview link có chữ ký

- **Date:** 2026-10-24 · **Status:** Accepted
- **Decision:**
  - **Token:** JWS HS256 (jose) chứa `{ kind: 'draft', pageId } | { kind: 'release', releaseId }`, cộng `siteId`, `workspaceId`, `exp` (mặc định 7 ngày) và `kid`.
  - **URL:** `{subdomain}.{BASE_DOMAIN}/_preview/{token}`. Draft hiển thị **bản nháp mới nhất**.
  - **Header phản hồi:** `no-store`, `X-Robots-Tag: noindex, nofollow`, meta noindex, `Referrer-Policy: no-referrer`.
  - **Giao diện:** banner "Bản xem trước".
- **Reason:** Quy tắc 6; chia sẻ cho khách hàng mà không cần đăng nhập.
- **Consequences:** Link không thu hồi riêng lẻ được trước hạn; xoay khóa thì mọi link mất hiệu lực.

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

### ADR-012 — Asset

- **Date:** 2026-10-24 · **Status:** Accepted
- **Decision:**
  - **Upload:** đi qua API (multipart, ≤ 10 MB). Chỉ nhận `jpeg`, `png`, `webp`, `avif`, `gif`, nhận diện bằng magic bytes. Kích thước đọc bằng `sharp`.
  - **Lưu trữ:** storage tương thích S3; public chỉ prefix `public/`.
  - **Alt:** bắt buộc `alt` hoặc `decorative`.
  - Không có API xóa asset trong MVP A.
- **Reason:** Validate tập trung một chỗ.
- **Consequences:** Băng thông upload đi qua API; SVG bị loại để tránh script.

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

---

## 5. Lát cắt giao hàng

Mỗi lát gồm unit, integration, E2E Playwright cho luồng chính, và ảnh chụp so với thiết kế. Dừng để duyệt sau mỗi lát.

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
