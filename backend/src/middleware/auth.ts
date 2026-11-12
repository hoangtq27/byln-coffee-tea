import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { getDb } from "../db.js";
import { HttpError } from "../lib/http.js";

export type Role = "manager" | "staff";

export interface AuthUser {
  maTaiKhoan: string;
  tenDangNhap: string;
  maNhanVien: string;
  tenNhanVien: string;
  role: Role;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

export function signToken(maTaiKhoan: string): string {
  return jwt.sign({ sub: maTaiKhoan }, config.jwtSecret, { expiresIn: config.jwtExpires as any });
}

/** Xác thực JWT và nạp lại tài khoản từ DB (tài khoản bị khóa/xóa mất hiệu lực ngay). */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) throw new HttpError(401, "Vui lòng đăng nhập!");
    let sub: string;
    try {
      sub = (jwt.verify(h.slice(7), config.jwtSecret) as { sub: string }).sub;
    } catch {
      throw new HttpError(401, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!");
    }
    const { rows } = await getDb().query(
      `SELECT t."MaTaiKhoan", t."TenDangNhap", t."MaNhanVien", t."VaiTro", t."TrangThai", n."TenNhanVien"
       FROM taikhoan t JOIN nhanvien n ON n."MaNhanVien" = t."MaNhanVien"
       WHERE t."MaTaiKhoan" = $1`,
      [sub],
    );
    const a = rows[0];
    if (!a || a.TrangThai !== 1) throw new HttpError(401, "Phiên đăng nhập không còn hiệu lực!");
    req.user = {
      maTaiKhoan: a.MaTaiKhoan.trim(),
      tenDangNhap: a.TenDangNhap,
      maNhanVien: a.MaNhanVien.trim(),
      tenNhanVien: a.TenNhanVien,
      role: a.VaiTro === 0 ? "manager" : "staff",
    };
    next();
  } catch (e) {
    next(e);
  }
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, "Vui lòng đăng nhập!"));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, "Bạn không có quyền thực hiện chức năng này!"));
    next();
  };
