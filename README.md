# Bình Yên Là Nhà Coffee & Tea – Hệ thống quản lý bán hàng

Tài liệu nguồn: `docs/SRS.txt`, `docs/SDD.txt`, Figma (`designs/linkFigma.txt`).

```
frontend/   React + Vite + TypeScript (Vercel)
backend/    Node.js + Express + TypeScript (Render)
backend/db/ schema.sql, seed.ts (dữ liệu mẫu)
```

## Chạy local

Yêu cầu: Node.js 20+.

```bash
# Backend (không cần cài PostgreSQL: khi DATABASE_URL trống sẽ dùng PGlite lưu ở backend/.data)
cd backend
npm install
npm run db:seed        # tạo bảng + nạp dữ liệu mẫu
npm run dev            # http://localhost:4000

# Frontend
cd frontend
npm install
npm run dev            # http://localhost:5173 (proxy /api -> :4000)
```

Tài khoản mẫu:

| Vai trò   | Tên đăng nhập                              | Mật khẩu       |
|-----------|--------------------------------------------|----------------|
| Quản lý   | `quanly`                                   | `Quanly@123`   |
| Nhân viên | `lan.nv`, `minh.nv`, `hoa.nv`, `tuan.nv`, `my.nv` | `Nhanvien@123` |

Kiểm thử backend: `cd backend && npm test` (36 test: phân quyền, validate theo SRS, tìm kiếm, đơn hàng, doanh thu, ca làm).

## Triển khai

1. **Neon**: tạo project PostgreSQL, lấy `DATABASE_URL`. Từ máy local chạy
   `DATABASE_URL=... npm run db:seed` (trong `backend/`) để tạo bảng và nạp dữ liệu mẫu
   (lệnh này **xóa sạch dữ liệu hiện có**; bỏ qua nếu muốn bắt đầu với CSDL trống – server tự tạo bảng khi khởi động).
2. **Render** (Web Service, Free): dùng `render.yaml` hoặc đặt root `backend`, build `npm ci && npm run build`,
   start `npm start`. Biến môi trường: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` (URL Vercel), `NODE_ENV=production`.
3. **Vercel** (Hobby): root `frontend`, biến `VITE_API_URL` = URL Render (không có dấu `/` cuối). `vercel.json` đã có rewrite SPA.

## Quy ước nghiệp vụ đã áp dụng

- **Doanh thu** = tổng "Tổng thanh toán" (sau giảm giá) của đơn **đã thanh toán và không bị hủy**; báo cáo và so sánh dùng chung quy tắc này.
- **Chênh lệch** = Kỳ 2 − Kỳ 1; **Tăng trưởng** = (Kỳ 2 − Kỳ 1) / Kỳ 1 × 100%.
- Đơn giá chi tiết đơn hàng luôn lấy từ danh mục món ở server (nhân viên không thể thay đổi giá).
- Đơn nhập thủ công từ GrabFood/ShopeeFood mặc định phương thức "Chuyển khoản (QR code)".
- Đơn đã thanh toán: Nhân viên chỉ được chuyển trạng thái đơn sang "Hoàn thành"; Quản lý sửa được toàn bộ.
- Mỗi ca làm tối đa 2 nhân viên; lịch phải nằm trong 07:00–22:00; không trùng giờ trong cùng ngày.
- Mật khẩu lưu dạng bcrypt (cột `MatKhau` rộng hơn SDD); không thể xóa/khóa/hạ quyền Quản lý cuối cùng.
