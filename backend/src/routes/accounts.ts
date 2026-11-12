import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getDb, type Executor } from "../db.js";
import { asyncHandler, HttpError, parse } from "../lib/http.js";
import { checkPassword, passwordMsg } from "../lib/validators.js";
import { authenticate, requireRole } from "../middleware/auth.js";

export const accountsRouter = Router();
accountsRouter.use(authenticate, requireRole("manager"));

interface AccRow {
  MaTaiKhoan: string;
  TenDangNhap: string;
  MaNhanVien: string;
  VaiTro: number;
  TrangThai: number;
  TenNhanVien: string;
}
const SELECT = `SELECT t."MaTaiKhoan",t."TenDangNhap",t."MaNhanVien",t."VaiTro",t."TrangThai",n."TenNhanVien"
  FROM taikhoan t JOIN nhanvien n ON n."MaNhanVien"=t."MaNhanVien"`;
const map = (r: AccRow) => ({
  maTaiKhoan: r.MaTaiKhoan.trim(),
  tenDangNhap: r.TenDangNhap,
  maNhanVien: r.MaNhanVien.trim(),
  tenNhanVien: r.TenNhanVien,
  vaiTro: r.VaiTro === 0 ? "manager" : "staff",
  trangThai: r.TrangThai, // 1 Hoạt động, 0 Khóa
});

const LAST_MANAGER = "Hệ thống phải có ít nhất một tài khoản Quản lý đang hoạt động!";

const base = {
  tenDangNhap: z
    .string({ required_error: "Vui lòng nhập tên đăng nhập!", invalid_type_error: "Vui lòng nhập tên đăng nhập!" })
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Vui lòng nhập tên đăng nhập!").max(20, "Tên đăng nhập tối đa 20 ký tự!")),
  maNhanVien: z
    .string({ required_error: "Vui lòng chọn nhân viên!", invalid_type_error: "Vui lòng chọn nhân viên!" })
    .min(1, "Vui lòng chọn nhân viên!"),
  vaiTro: z.enum(["manager", "staff"], { errorMap: () => ({ message: "Vui lòng chọn vai trò!" }) }),
  trangThai: z.union([z.literal(0), z.literal(1)]).default(1),
};
const createSchema = z.object({
  ...base,
  matKhau: z.string({ required_error: "Vui lòng nhập mật khẩu!", invalid_type_error: "Vui lòng nhập mật khẩu!" }).min(1, "Vui lòng nhập mật khẩu!"),
});
const updateSchema = z.object({ ...base, matKhau: z.string().optional().default("") });

async function nextCode(e: Executor): Promise<string> {
  const { rows } = await e.query<{ m: string | null }>(`SELECT MAX("MaTaiKhoan") AS m FROM taikhoan`);
  const n = rows[0]?.m ? parseInt(rows[0].m.slice(2), 10) : 0;
  return "TK" + String(n + 1).padStart(3, "0");
}

async function checkUnique(e: Executor, b: { tenDangNhap: string; maNhanVien: string }, exceptCode?: string) {
  const fields: Record<string, string> = {};
  const ex = exceptCode ?? null;
  const u = await e.query(`SELECT 1 FROM taikhoan WHERE "TenDangNhap"=$1 AND ($2::text IS NULL OR "MaTaiKhoan"<>$2)`, [b.tenDangNhap, ex]);
  if (u.rows.length) fields.tenDangNhap = "Tên đăng nhập đã tồn tại!";
  const n = await e.query(`SELECT 1 FROM taikhoan WHERE "MaNhanVien"=$1 AND ($2::text IS NULL OR "MaTaiKhoan"<>$2)`, [b.maNhanVien, ex]);
  if (n.rows.length) fields.maNhanVien = "Nhân viên này đã có tài khoản!";
  const emp = await e.query(`SELECT 1 FROM nhanvien WHERE "MaNhanVien"=$1`, [b.maNhanVien]);
  if (!emp.rows.length) fields.maNhanVien = "Nhân viên không tồn tại!";
  if (Object.keys(fields).length) throw new HttpError(409, Object.values(fields)[0], fields);
}

async function activeManagersExcluding(e: Executor, code: string): Promise<number> {
  const { rows } = await e.query<{ c: number }>(
    `SELECT COUNT(*) AS c FROM taikhoan WHERE "VaiTro"=0 AND "TrangThai"=1 AND "MaTaiKhoan"<>$1`,
    [code],
  );
  return rows[0].c;
}

accountsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rows } = await getDb().query<AccRow>(`${SELECT} ORDER BY t."MaTaiKhoan"`);
    res.json({ items: rows.map(map) });
  }),
);

accountsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const b = parse(createSchema, req.body ?? {});
    if (!checkPassword(b.matKhau)) throw new HttpError(400, passwordMsg, { matKhau: passwordMsg });
    const hash = await bcrypt.hash(b.matKhau, 10);
    const code = await getDb().tx(async (t) => {
      await t.query(`SELECT pg_advisory_xact_lock(104)`);
      await checkUnique(t, b);
      const code = await nextCode(t);
      await t.query(
        `INSERT INTO taikhoan("MaTaiKhoan","TenDangNhap","MatKhau","MaNhanVien","VaiTro","TrangThai") VALUES ($1,$2,$3,$4,$5,$6)`,
        [code, b.tenDangNhap, hash, b.maNhanVien, b.vaiTro === "manager" ? 0 : 1, b.trangThai],
      );
      return code;
    });
    res.status(201).json({ maTaiKhoan: code, message: "Tạo tài khoản thành công" });
  }),
);

accountsRouter.put(
  "/:ma",
  asyncHandler(async (req, res) => {
    const b = parse(updateSchema, req.body ?? {});
    if (b.matKhau !== "" && !checkPassword(b.matKhau)) throw new HttpError(400, passwordMsg, { matKhau: passwordMsg });
    const ma = req.params.ma;
    const forceLogout = await getDb().tx(async (t) => {
      const cur = (await t.query<any>(`SELECT * FROM taikhoan WHERE "MaTaiKhoan"=$1`, [ma])).rows[0];
      if (!cur) throw new HttpError(404, "Không tìm thấy tài khoản!");
      await checkUnique(t, b, ma);
      const newRole = b.vaiTro === "manager" ? 0 : 1;
      const wasActiveManager = cur.VaiTro === 0 && cur.TrangThai === 1;
      const stillActiveManager = newRole === 0 && b.trangThai === 1;
      if (wasActiveManager && !stillActiveManager && (await activeManagersExcluding(t, ma)) === 0)
        throw new HttpError(409, LAST_MANAGER);
      const hash = b.matKhau ? await bcrypt.hash(b.matKhau, 10) : cur.MatKhau;
      await t.query(
        `UPDATE taikhoan SET "TenDangNhap"=$2,"MatKhau"=$3,"MaNhanVien"=$4,"VaiTro"=$5,"TrangThai"=$6 WHERE "MaTaiKhoan"=$1`,
        [ma, b.tenDangNhap, hash, b.maNhanVien, newRole, b.trangThai],
      );
      const isSelf = ma === req.user!.maTaiKhoan;
      return isSelf && (b.tenDangNhap !== cur.TenDangNhap || b.matKhau !== "" || b.trangThai !== 1 || newRole !== 0);
    });
    res.json({ message: "Cập nhật thông tin tài khoản thành công!", forceLogout });
  }),
);

accountsRouter.post(
  "/:ma/lock",
  asyncHandler(async (req, res) => {
    const ma = req.params.ma;
    const db = getDb();
    const cur = (await db.query<any>(`SELECT * FROM taikhoan WHERE "MaTaiKhoan"=$1`, [ma])).rows[0];
    if (!cur) throw new HttpError(404, "Không tìm thấy tài khoản!");
    if (cur.VaiTro === 0 && cur.TrangThai === 1 && (await activeManagersExcluding(db, ma)) === 0)
      throw new HttpError(409, LAST_MANAGER);
    await db.query(`UPDATE taikhoan SET "TrangThai"=0 WHERE "MaTaiKhoan"=$1`, [ma]);
    res.json({ message: "Đã khóa tài khoản này", forceLogout: ma === req.user!.maTaiKhoan });
  }),
);

accountsRouter.delete(
  "/:ma",
  asyncHandler(async (req, res) => {
    const ma = req.params.ma;
    if (ma === req.user!.maTaiKhoan) throw new HttpError(400, "Không thể xóa tài khoản này!");
    const db = getDb();
    const cur = (await db.query<any>(`SELECT * FROM taikhoan WHERE "MaTaiKhoan"=$1`, [ma])).rows[0];
    if (!cur) throw new HttpError(404, "Không tìm thấy tài khoản!");
    if (cur.VaiTro === 0 && cur.TrangThai === 1 && (await activeManagersExcluding(db, ma)) === 0)
      throw new HttpError(409, LAST_MANAGER);
    await db.query(`DELETE FROM taikhoan WHERE "MaTaiKhoan"=$1`, [ma]);
    res.json({ message: "Xóa tài khoản thành công!" });
  }),
);
