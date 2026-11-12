import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getDb } from "../db.js";
import { asyncHandler, HttpError, parse } from "../lib/http.js";
import { authenticate, signToken } from "../middleware/auth.js";

export const authRouter = Router();

const loginSchema = z.object({
  tenDangNhap: z.string().optional().default(""),
  matKhau: z.string().optional().default(""),
});

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = parse(loginSchema, req.body ?? {});
    const fields: Record<string, string> = {};
    if (!body.tenDangNhap.trim()) fields.tenDangNhap = "Vui lòng nhập đầy đủ thông tin";
    if (!body.matKhau) fields.matKhau = "Vui lòng nhập đầy đủ thông tin";
    if (Object.keys(fields).length) throw new HttpError(400, "Vui lòng nhập đầy đủ thông tin", fields);

    const { rows } = await getDb().query(
      `SELECT t.*, n."TenNhanVien" FROM taikhoan t JOIN nhanvien n ON n."MaNhanVien" = t."MaNhanVien"
       WHERE t."TenDangNhap" = $1`,
      [body.tenDangNhap.trim()],
    );
    const acc = rows[0];
    // So sánh hash cả khi không có tài khoản để thời gian phản hồi không lộ thông tin
    const hash = acc?.MatKhau ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi";
    const ok = await bcrypt.compare(body.matKhau, hash);
    if (!acc || !ok) throw new HttpError(401, "Tên đăng nhập hoặc mật khẩu sai!");
    if (acc.TrangThai !== 1) throw new HttpError(403, "Tài khoản này đã bị khóa. Không thể đăng nhập!");

    res.json({
      token: signToken(acc.MaTaiKhoan.trim()),
      user: {
        maTaiKhoan: acc.MaTaiKhoan.trim(),
        tenDangNhap: acc.TenDangNhap,
        maNhanVien: acc.MaNhanVien.trim(),
        tenNhanVien: acc.TenNhanVien,
        role: acc.VaiTro === 0 ? "manager" : "staff",
      },
    });
  }),
);

authRouter.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});

// JWT là stateless: đăng xuất phía server chỉ xác nhận phiên hợp lệ; client xóa token.
authRouter.post("/logout", authenticate, (_req, res) => {
  res.json({ ok: true });
});
