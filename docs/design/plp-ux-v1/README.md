# Thiết kế UX v1 — Payload Landing Page

Thư mục này là bản sao chỉ đọc của thiết kế sản phẩm. Dùng nó để tham chiếu cấu trúc màn hình, copy tiếng Việt và các trạng thái. Không copy markup vào code.

## Nguồn

- **Artifact:** "Payload Landing Page — Product Design", https://claude.ai/artifact/1zhYYRkfqj7xNUVf1WSn4k
- **Phiên bản đã nhập:** `1792838787-b170`, ngày 2026-10-24 (màn 01–12, Sidebar). Các board Phase 1 (màn 13–16, 15b, Sidebar v2) và hai ghi chú `phase1`, `phase1Decisions` của `canvas.json` nhập từ `1793503258-d63e`, ngày 2026-11-01. Các board D2 (màn 34–36), Sidebar v2 có trạng thái mở danh sách workspace, và hai ghi chú `d2`, `d2Decisions` nhập từ `1793546061-78b0`, ngày 2026-11-01. Các board Phase 2 (màn 17–21, ảnh thu nhỏ template) và hai ghi chú `phase2`, `phase2Decisions` nhập từ cùng phiên bản, ngày 2026-11-02. Các board Chuyển động (màn 37–40) và hai ghi chú `motion`, `motionDecisions` nhập từ `1793733435-70e7`, ngày 2026-11-04. Các board Phase 3 (màn 22–27) và hai ghi chú `phase3`, `phase3Decisions` nhập từ `1793751628-0501`, ngày 2026-11-04.
- **Nội dung:** `screens/*.dc.html` (một file một board) và `screens/canvas.json` (tên board, bố cục canvas, giả định thiết kế).
- **Không tìm thấy khi nhập:** `README` gốc (danh sách quy tắc UX cốt lõi), `proposal/` và `research/`. Artifact "Design System" cũng chưa có token.
  - Token admin vì vậy được trích từ inline style của các màn 01–08.
  - Nguồn sự thật của token là [`packages/ui/src/tokens.css`](../../../packages/ui/src/tokens.css).

File `.dc.html` cần runtime của artifact Design (`support.js`) để render tương tác. Mở trên artifact để xem đúng giao diện. Ảnh chụp so sánh được render bằng runtime đó trong thư mục tạm, không commit vào repo.

## Danh sách màn

| #   | Board                                 | File                 | MVP A                        |
| --- | ------------------------------------- | -------------------- | ---------------------------- |
| 01  | Bảng điều khiển — danh sách trang     | `Main.dc.html`       | Có (S1, S3, S4)              |
| 02  | Tạo trang — chọn mục tiêu & brief     | `Onboarding.dc.html` | Có (S6)                      |
| 03  | Editor — section builder có hướng dẫn | `Editor.dc.html`     | Có (S2)                      |
| 04  | Thêm section                          | `AddSection.dc.html` | Có (S2)                      |
| 05  | Xuất bản — kiểm tra trước khi live    | `Publish.dc.html`    | Có (S3); duyệt xuất bản (C4) |
| 06  | Lịch sử phiên bản & rollback          | `History.dc.html`    | Có (S4)                      |
| 07  | SEO & chia sẻ                         | `SEO.dc.html`        | Có (S5)                      |
| 08  | Tên miền                              | `Domain.dc.html`     | Thay bằng màn 13 (C3)        |
| 09  | Trang public trên mobile              | `PublicPage.dc.html` | Có, không có form (S3)       |
| 10  | Hộp thư lead                          | `Leads.dc.html`      | Không (MVP B)                |
| 11  | Hiệu quả trang                        | `Analytics.dc.html`  | Không (MVP B)                |
| 12  | Dữ liệu cá nhân & đồng ý              | `Consent.dc.html`    | Không (MVP B)                |
| —   | Sidebar điều hướng                    | `Sidebar.dc.html`    | Có (S1)                      |

**Phase 1 — Vận hành & đội nhóm** (ARCHITECTURE §5, ADR-020):

| #   | Board                         | File                    | Lát                                                                             |
| --- | ----------------------------- | ----------------------- | ------------------------------------------------------------------------------- |
| 13  | Quản lý tên miền              | `Domains.dc.html`       | C3                                                                              |
| 14  | Kết nối & xác minh tên miền   | `DomainConnect.dc.html` | C3                                                                              |
| 15  | Thành viên workspace          | `Members.dc.html`       | C2                                                                              |
| 15b | Nhận lời mời (mobile)         | `InviteAccept.dc.html`  | C2                                                                              |
| 16  | Vai trò & phân quyền          | `Roles.dc.html`         | C1 (ma trận và trạng thái bị từ chối), C4 (ô "Yêu cầu"), C5 (vai trò tùy chỉnh) |
| —   | Sidebar v2 (workspace + site) | `SidebarV2.dc.html`     | C1                                                                              |

**Tách database — địa chỉ workspace** (ARCHITECTURE §5, ADR-025):

| #   | Board                                         | File                      | Lát |
| --- | --------------------------------------------- | ------------------------- | --- |
| 34  | Đăng nhập (địa chỉ workspace / địa chỉ chung) | `WorkspaceLogin.dc.html`  | D2  |
| 35  | Chọn workspace (địa chỉ chung)                | `WorkspacePicker.dc.html` | D2  |
| 36  | Không thuộc workspace ở địa chỉ này           | `NotMember.dc.html`       | D2  |
| —   | Sidebar v2, bật `switcherOpen`                | `SidebarV2.dc.html`       | D2  |

**Phase 2 — Tạo trang nhanh** (ARCHITECTURE §5, ADR-030, ADR-031):

| #   | Board                       | File                         | Lát    |
| --- | --------------------------- | ---------------------------- | ------ |
| 17  | Thư viện template           | `TemplateLibrary.dc.html`    | G1, G2 |
| 18  | Chi tiết & preview template | `TemplateDetail.dc.html`     | G1, G3 |
| 19  | Template của workspace      | `WorkspaceTemplates.dc.html` | G2     |
| 20  | Tạo landing page bằng AI    | `AiCreate.dc.html`           | G4     |
| 21  | Trợ lý AI trong editor      | `AiAssistant.dc.html`        | G5     |
| —   | Ảnh thu nhỏ template        | `TemplateThumb.dc.html`      | G1     |

**Phase 3 — Chăm sóc khách** (ARCHITECTURE §5, ADR-033, ADR-034):

| #   | Board                   | File                       | Lát |
| --- | ----------------------- | -------------------------- | --- |
| 22  | Danh bạ khách hàng      | `Contacts.dc.html`         | K1  |
| 23  | Hồ sơ khách hàng        | `ContactProfile.dc.html`   | K2  |
| 24  | Pipeline cơ hội         | `Pipeline.dc.html`         | K3  |
| 25  | Danh sách automation    | `Automations.dc.html`      | A1  |
| 26  | Thiết lập automation    | `AutomationEditor.dc.html` | A2  |
| 27  | Lịch sử chạy automation | `AutomationRuns.dc.html`   | A3  |

**Chuyển động** (ARCHITECTURE §5, ADR-032):

| #   | Board                                   | File                    | Lát                                                   |
| --- | --------------------------------------- | ----------------------- | ----------------------------------------------------- |
| 37  | Cài đặt trang → Phong cách chuyển động  | `MotionPage.dc.html`    | M1 (hiển thị), M3                                     |
| 38  | Thuộc tính section → Hiệu ứng xuất hiện | `MotionSection.dc.html` | M3                                                    |
| 39  | Thư viện phong cách chuyển động         | `StyleLibrary.dc.html`  | M3                                                    |
| 40  | Bộ hiệu ứng mở rộng (34 hiệu ứng)       | `EffectCatalog.dc.html` | Tham chiếu; bản đầu giữ 10 hiệu ứng "đã có" (ADR-032) |

## Giả định thiết kế (từ `canvas.json`)

- ICP chính: SME marketing và agency nhỏ; một workspace agency quản lý nhiều site khách hàng.
- MVP A là publish-first; hàng CONVERT (màn 10–12) chỉ áp dụng cho MVP B.
- Editor là section builder có hướng dẫn.
- Nội dung mẫu dùng khách hàng giả định "Nha khoa Smile Care"; số liệu trong mockup là dữ liệu mẫu.
- Font: Be Vietnam Pro (giao diện) và JetBrains Mono (URL, đường dẫn).

## Màu trang mẫu (theme preset đầu tiên)

Lấy từ màn 03 và 09: brand teal `#0F5E55`, ink `#0B2E2A`, chữ thân `#2D4A46`, nền nhạt "Bạc hà" `#EAF6F3`, accent `#F2A33A`, viền `#B9CFCA`. Bốn color scheme của section là Sáng, Bạc hà, Thương hiệu, Tối.

## Cách hiểu thiết kế

Những chỗ thiết kế được diễn giải thành quy tắc nghiệp vụ, và những phần bị ẩn trong MVP A, nằm ở [`docs/ARCHITECTURE.md` §2.1](../../ARCHITECTURE.md#21-diễn-giải-thiết-kế-thành-quy-tắc). Tài liệu kiến trúc thắng khi mockup mâu thuẫn với quy tắc nghiệp vụ.
