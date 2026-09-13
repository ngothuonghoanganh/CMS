# Phase 24 — Hướng dẫn kiểm thử

Tài liệu này là runbook để kiểm thử Phase 24 từ contract và CMS unit test đến
Builder, Preview, Publish và public renderer. Chạy lệnh từ root repository.

Phase 24 dùng GrapesJS làm editor model duy nhất, V8 làm persisted contract và
Playwright tự khởi động API, CMS, renderer cho E2E. Vì vậy các bước authoring
trong release journey phải thao tác qua UI; API chỉ dùng để chuẩn bị fixture và
kiểm tra trạng thái hỗ trợ.

## 1. Chuẩn bị môi trường

Kiểm tra runtime theo `.nvmrc` và `package.json`:

```bash
node -v
pnpm --version
pnpm install --frozen-lockfile
```

Runtime được hỗ trợ là Node `24.x` (repository hiện ghim `24.19.0`) và pnpm
`10.15.0` trở lên.

E2E cần một MongoDB local riêng cho test. Không trỏ `MONGODB_URI` vào database
development hoặc production đang chứa dữ liệu cần giữ. Ví dụ nếu chưa có
MongoDB local:

```bash
docker run --name phase24-mongodb -p 27018:27017 -d mongo:7
```

Sau đó dùng một database name riêng:

```bash
export MONGODB_URI=mongodb://127.0.0.1:27018/phase24_e2e
```

Nếu port `27018` đã được dùng, giữ MongoDB hiện có hoặc chọn port khác và sửa
URI tương ứng. Không xóa database để làm sạch test; fixture sẽ tạo môi trường
canonical và dọn các resource tạm có prefix `__e2e__`.

Tài khoản mặc định của fixture là `admin@example.com` / `change-me-in-development`.
Nếu môi trường dùng tài khoản khác, đặt:

```bash
export AUTH_EMAIL=your-test-admin@example.com
export AUTH_PASSWORD='your-test-password'
```

## 2. Tránh xung đột server và port

Playwright tự chạy ba server. Không cần chạy thêm `pnpm dev` khi dùng các lệnh
E2E bên dưới. Để không đụng server đang mở ở port mặc định, dùng một bộ port
riêng trong cùng shell:

```bash
export E2E_API_PORT=3801
export E2E_CMS_PORT=3800
export E2E_RENDERER_PORT=3802
```

Kiểm tra API trước khi chạy nếu cần:

```bash
curl -fsS "http://127.0.0.1:${E2E_API_PORT}/api/v1/health/live"
```

Nếu Playwright báo không bind được port, kiểm tra process đang chiếm port:

```bash
lsof -nP -iTCP:3800 -sTCP:LISTEN
lsof -nP -iTCP:3801 -sTCP:LISTEN
lsof -nP -iTCP:3802 -sTCP:LISTEN
```

`playwright.config.ts` dùng một worker ở local và không retry test. Đây là chủ ý
để lỗi race hoặc lỗi môi trường không bị che bởi retry tự động.

## 3. Quality gates tĩnh và unit

Chạy nhóm này trước browser test:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm check:cms-design-system
pnpm test
pnpm build
git diff --check
```

Hoặc dùng shortcut tương đương cho các gate trừ E2E và `git diff --check`:

```bash
pnpm verify
```

Build Next có thể cập nhật các file `next-env.d.ts` do toolchain sinh ra. Sau
build luôn kiểm tra `git status` và chỉ giữ thay đổi đó nếu nó thực sự thuộc
source change đang làm.

### 3.1. Phase 24 focused unit suite

Đây là nhóm test nhanh nhất cho contract, preset, adapter, command boundary và
renderer:

```bash
pnpm exec vitest run \
  packages/contracts/src/open-composition.spec.ts \
  apps/cms/builder/builder-block/block-presets.spec.ts \
  apps/cms/builder/builder-block/builder-adapter.spec.ts \
  apps/cms/builder/editor-commands.spec.ts \
  apps/renderer/app/renderer.spec.tsx
```

Khi một test fail, sửa root cause rồi chạy lại file liên quan trước khi chạy
toàn bộ `pnpm test`. Không đổi expected, giảm assertion hoặc thêm `.skip`,
`.only`, `test.fixme` để làm suite xanh.

## 4. Phase 24 browser release journey

Spec chính là
`tests/e2e/phase-24-native-open-composition.spec.ts`. Spec này dùng fixture
canonical, tạo một page tạm và author bằng UI thật.

Sau khi đã export `MONGODB_URI` và ba port ở trên, chạy:

```bash
pnpm exec playwright test \
  tests/e2e/phase-24-native-open-composition.spec.ts
```

Journey này kiểm tra:

- List: thêm preset, sửa nhiều item, thêm/xóa/reorder, Bullets ↔ Numbers,
  Undo/Redo và giữ stable item IDs.
- FAQ: sửa question và answer, thêm/duplicate/reorder/remove question, managed
  layers và semantic trigger/panel structure.
- Tabs: rename, thêm/duplicate/reorder/remove tab, sửa panel content và đổi
  hướng horizontal/vertical.
- Gallery: thêm recipe 3 cột, kiểm tra Grid + Image primitives, sửa image
  source, columns, thêm/reorder/remove image và mobile overflow.
- Save → reload Builder → so sánh persisted payload.
- Preview → Publish qua UI → public renderer.
- FAQ interaction, Tabs ARIA/keyboard, Gallery render và uncaught console
  errors.

Khi cần quan sát browser:

```bash
pnpm test:e2e:headed -- \
  tests/e2e/phase-24-native-open-composition.spec.ts
```

Hoặc dùng Playwright UI mode:

```bash
pnpm test:e2e:ui -- \
  tests/e2e/phase-24-native-open-composition.spec.ts
```

Config hiện tại không khai báo project name `chromium`; không thêm
`--project=chromium` vào lệnh.

## 5. Checklist kiểm tra thủ công trong journey

Nếu cần review bằng mắt ngoài assertion tự động, xác nhận các điểm sau:

### List

- Inspector chỉ hiện Bullets/Numbers, item text, Add, Remove và Move.
- Luôn còn ít nhất một item; nút xóa item cuối bị chặn.
- Đổi text không làm mất focus hoặc remount toàn bộ row.
- Sau save/reload thứ tự, text và ordered state vẫn giữ nguyên.
- Renderer dùng `<ul>` cho Bullets và `<ol>` cho Numbers.

### FAQ / Disclosure

- UI gọi là FAQ/Question/Answer, không lộ node ID hoặc target ID.
- Một Question luôn bao gồm managed question control và answer panel.
- Có thể sửa nội dung bên trong Answer như content bình thường.
- Không thể xóa, reparent hoặc move riêng trigger/panel shell qua Layers hoặc
  command boundary.
- Khi không cho mở nhiều câu, bật câu mới sẽ tự đóng default-open của câu cũ.
- Public runtime có focus nhìn thấy, keyboard activation và answer region đúng.

### Tabs

- Layers hiển thị Tabs và từng tab logical, không biến tab-list/trigger/panel
  thành các sibling generic để user tự kéo tách.
- Một tab luôn có đúng một trigger và một panel.
- Xóa, duplicate hoặc move tab cập nhật cả pair và relation.
- Public markup có `tablist`, `tab`, `tabpanel`, `aria-selected`,
  `aria-controls`, `aria-labelledby`.
- Horizontal dùng Left/Right/Home/End; vertical dùng Up/Down/Home/End.

### Gallery recipe

- Add panel chỉ tạo Grid + Image nodes cho Gallery mới.
- Không có node semantic `gallery` mới trong payload.
- User có thể sửa columns/gap/responsive style và từng image như primitive.
- Save/reload, Preview và public renderer đều hiển thị cùng số lượng image.

### Permission và responsive

- Content-only user chỉ sửa text/question/answer/tab label và panel content;
  không có structural controls.
- Designer mới có Add/Remove/Reorder compound items và Tabs orientation.
- Kiểm tra desktop và viewport mobile/tablet: Inspector/Canvas dùng được, không
  có page-level horizontal overflow lớn.

## 6. Regression browser suites

Sau focused Phase 24 journey, chạy các regression trực tiếp liên quan semantic
compound và authoring guardrails:

```bash
pnpm exec playwright test \
  tests/e2e/phase-16-compound-components.spec.ts \
  tests/e2e/phase-23.2-semantic-integrity.spec.ts \
  tests/e2e/phase-23.3-authoring-guardrails.spec.ts \
  tests/e2e/phase-23.3.1-release-gate.spec.ts
```

Các suite này giúp phát hiện việc Phase 24 làm hỏng runtime legacy, semantic
ownership hoặc prevention ở command/placement boundary.

## 7. Full E2E release gate

Release gate đầy đủ, bao gồm cả test có tag tenancy:

```bash
pnpm test:e2e:full
```

Các biến môi trường đã export ở mục 2 sẽ được Playwright truyền cho API, CMS
và renderer. Nếu chỉ muốn suite không có tag tenancy, dùng:

```bash
pnpm test:e2e
```

Chỉ chạy nhóm tenancy bằng:

```bash
pnpm test:e2e:tenancy
```

Không coi một lần chạy `pnpm test:e2e` là full release evidence vì lệnh đó cố
ý loại test `@tenancy`.

## 8. Kiểm tra dữ liệu test và cleanup

Fixture `canonical-environment.ts` tự tạo hoặc tái sử dụng:

```text
E2E Development / E2E Workspace / E2E Builder Site
```

Page tạm, layout, integration, template, reusable và collection do E2E tạo có
prefix `__e2e__` và được dọn trong lifecycle của fixture.

Nếu một run bị dừng giữa chừng, dùng cleanup script ở chế độ dry-run trước:

```bash
pnpm test:data:cleanup
```

Chỉ sau khi review danh sách và chắc chắn API đang trỏ vào database E2E riêng
mới dùng apply mode:

```bash
pnpm test:data:cleanup -- --apply
```

Script này không phải database reset: legacy organization/site và public route
không bị xóa tự động. Không chạy apply mode trên shared hoặc production data.

## 9. Triage khi E2E fail

1. Đọc lỗi đầu tiên, không chỉ lỗi teardown cuối cùng.
2. Xác nhận API health URL trả `200` và xem log của server do Playwright khởi
   động.
3. Nếu lỗi là login/context/route timeout, kiểm tra credential, MongoDB, port
   isolation và database name; sau đó chạy lại đúng spec bị fail trên database
   sạch.
4. Nếu lỗi là assertion về payload hoặc semantics, xem trace và xác minh model
   sau Save/Reload trước khi kết luận là renderer lỗi.
5. Nếu lỗi chỉ xảy ra ở full suite nhưng spec chạy riêng thành công, kiểm tra
   state pollution, server reuse hoặc teardown race. Không thêm sleep, timeout
   lớn hoặc retry để che lỗi.

Artifact của test fail nằm dưới `test-results/`. Mở trace bằng:

```bash
pnpm exec playwright show-trace \
  test-results/<failed-test-directory>/trace.zip
```

Một số API integration test có thể `skip` theo baseline repository khi thiếu
external service. Khi báo cáo kết quả phải ghi riêng số `passed`, `failed` và
`skipped`; không gọi skipped là passed.

## 10. Evidence và tiêu chí đạt

Một lần verification Phase 24 đầy đủ cần lưu lại:

- Node/pnpm version và `MONGODB_URI` đã dùng (không ghi secret/password).
- Kết quả focused Vitest.
- Kết quả focused Phase 24 Playwright.
- Kết quả regression browser và `pnpm test:e2e:full`.
- `format:check`, lint, typecheck, design-system check, build và diff check.
- Screenshot/trace hoặc log liên quan nếu có failure.
- Xác nhận Builder, Save/Reload, Preview, Publish và public renderer đều giữ
  cùng semantic state.

Chỉ đóng release khi không còn P0/P1, không có uncaught console error mới,
không có semantic invalid state, không có Builder/Renderer mismatch và không
che failure bằng cách sửa assertion hoặc bỏ test.

Các file tham chiếu chính:

- [`package.json`](../package.json) — scripts và runtime requirements.
- [`playwright.config.ts`](../playwright.config.ts) — server, port, retry và
  artifact policy.
- [`tests/e2e/fixtures/canonical-environment.ts`](../tests/e2e/fixtures/canonical-environment.ts)
  — canonical fixture và cleanup.
- [`tests/e2e/phase-24-native-open-composition.spec.ts`](../tests/e2e/phase-24-native-open-composition.spec.ts)
  — release journey chính.
- [`docs/phase-24.md`](./phase-24.md) — architecture, ownership và non-goals.
- [`docs/continuity/phase-24-final-handoff.md`](./continuity/phase-24-final-handoff.md)
  — kết quả closure và các limitation đã biết.
