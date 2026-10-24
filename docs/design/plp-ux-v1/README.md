# Thiết kế UX v1 — Payload Landing Page

Thư mục này là bản sao chỉ đọc của thiết kế sản phẩm. Dùng nó để tham chiếu cấu trúc màn hình, copy tiếng Việt và các trạng thái. Không copy markup vào code.

## Nguồn

- **Artifact:** "Payload Landing Page — Product Design", https://claude.ai/artifact/1zhYYRkfqj7xNUVf1WSn4k
- **Phiên bản đã nhập:** `1792838787-b170`, ngày 2026-10-24
- **Nội dung:** `screens/*.dc.html` (một file một board) và `screens/canvas.json` (tên board, bố cục canvas, giả định thiết kế).
- **Không tìm thấy khi nhập:** `README` gốc (danh sách quy tắc UX cốt lõi), `proposal/` và `research/`. Artifact "Design System" cũng chưa có token.
  - Token admin vì vậy được trích từ inline style của các màn 01–08.
  - Nguồn sự thật của token là [`packages/ui/src/tokens.css`](../../../packages/ui/src/tokens.css).

File `.dc.html` cần runtime của artifact Design (`support.js`) để render tương tác. Mở trên artifact để xem đúng giao diện. Ảnh chụp so sánh được render bằng runtime đó trong thư mục tạm, không commit vào repo.

## Danh sách màn

| #   | Board                                 | File                 | MVP A                      |
| --- | ------------------------------------- | -------------------- | -------------------------- |
| 01  | Bảng điều khiển — danh sách trang     | `Main.dc.html`       | Có (S1, S3, S4)            |
| 02  | Tạo trang — chọn mục tiêu & brief     | `Onboarding.dc.html` | Có (S6)                    |
| 03  | Editor — section builder có hướng dẫn | `Editor.dc.html`     | Có (S2)                    |
| 04  | Thêm section                          | `AddSection.dc.html` | Có (S2)                    |
| 05  | Xuất bản — kiểm tra trước khi live    | `Publish.dc.html`    | Có (S3)                    |
| 06  | Lịch sử phiên bản & rollback          | `History.dc.html`    | Có (S4)                    |
| 07  | SEO & chia sẻ                         | `SEO.dc.html`        | Có (S5)                    |
| 08  | Tên miền                              | `Domain.dc.html`     | Chỉ tên miền mặc định (S5) |
| 09  | Trang public trên mobile              | `PublicPage.dc.html` | Có, không có form (S3)     |
| 10  | Hộp thư lead                          | `Leads.dc.html`      | Không (MVP B)              |
| 11  | Hiệu quả trang                        | `Analytics.dc.html`  | Không (MVP B)              |
| 12  | Dữ liệu cá nhân & đồng ý              | `Consent.dc.html`    | Không (MVP B)              |
| —   | Sidebar điều hướng                    | `Sidebar.dc.html`    | Có (S1)                    |

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
