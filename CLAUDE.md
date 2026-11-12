\# Project: Cafe Sales Management System



\## Project Context

Hãy thực hiện xây dựng một website hoàn chỉnh theo mô tả rõ ràng trong tất cả các tài liệu. Ưu tiên tính chính xác tuyệt đối của màn hình trong figma (về bố cục, mã màu, vị trí nút bấm) trước rồi mới đến đặc tả use case.

Frontend: Vercel Hobby.



Backend: Render Free (Node.js/TypeScript).



Database: Neon PostgreSQL Free.

\## Source of Truth

\- SRS.md: Functional requirements and business rules.

\- SDD.md: System architecture and database design.

\- Figma: UI/UX design reference.



\## Development Rules

\- Follow SRS and SDD strictly.

\- Do not invent business requirements.

\- Do not remove existing requirements.

\- Keep frontend and backend separated.

\- Use reusable components.

\- Use TypeScript.

\- Validate all user inputs.

\- Implement role-based access control.



\## Business Constraints

\- Staff can create orders and process payments.

\- Staff cannot change product prices.

\- Staff cannot view revenue reports.

\- Manager can manage products and employees.

\- External delivery orders are entered manually.

\- No direct bank or delivery platform API integration.



\## Workflow

\- Work on one module at a time.

\- Review before changing architecture.

\- Test after implementing each module.

\- Never overwrite existing files without reviewing them.



















Lưu ý các yêu cầu bên dưới:

1\. Loại bỏ toàn bộ file dạng hình ảnh có trong web. không có logo nào là của quán và món cũng không có hình ảnh nào cả. (tự đối chiếu lại thiết kế màn hình trong figma cho đến khi thấy giống)

2\. Chỗ tạo đơn hàng cho thêm nhập giảm giá

3\. Chỗ sửa thông tin đơn hàng, nếu đơn là đã thanh toán thì vẫn có thể chỉnh trạng thái đơn hàng thành "Hoàn thành"

4\. Danh sách "Quản lý đơn hàng" là dạng bảng có thể scroll xuống nếu nhiều dòng chứ không phải bấm nút để xuống dòng dưới, và có thể scroll ngang vì có 3 trang.

5\. Nút "Xem báo cáo doanh thu", "So sánh dữ liệu doanh thu", "Quản lý thông tin nhân viên", "Quản lý ca làm" để dạng sổ xuống ở toggle bên trái, sổ xuống từ mục "Quản lý doanh thu", "Quản lý nhân viên" giống như trong thiết kế figma chứ không phải bấm nút như hiện tại.

6\. Dữ liệu tạo sẵn phải logic với nhau, đặc biệt là phần "Báo cáo doanh thu", "Dữ liệu doanh thu"
7. Phải đảm bảo các tính năng "Tìm kiếm" hoạt động đúng và ổn định theo đặc tả.

