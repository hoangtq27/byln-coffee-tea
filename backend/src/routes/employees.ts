import { Router } from "express";
import { z } from "zod";
import { getDb, type Executor } from "../db.js";
import { asyncHandler, HttpError, parse } from "../lib/http.js";
import { isValidIsoDate } from "../lib/dates.js";
import { authenticate, requireRole } from "../middleware/auth.js";

export const employeesRouter = Router();
employeesRouter.use(authenticate, requireRole("manager"));

const INVALID = "Thông tin nhân viên không hợp lệ. Vui lòng kiểm tra lại!";

interface EmpRow {
  MaNhanVien: string;
  TenNhanVien: string;
  SDT: string;
  DiaChi: string;
  nv: string | null;
  TrangThai: number;
  hasAccount?: boolean;
}
const SELECT = `SELECT n.*, to_char(n."NgayVaoLam",'YYYY-MM-DD') AS nv,
  EXISTS(SELECT 1 FROM taikhoan t WHERE t."MaNhanVien"=n."MaNhanVien") AS "hasAccount" FROM nhanvien n`;

const map = (r: EmpRow) => ({
  maNhanVien: r.MaNhanVien.trim(),
  tenNhanVien: r.TenNhanVien,
  sdt: r.SDT,
  diaChi: r.DiaChi,
  ngayVaoLam: r.nv,
  trangThai: r.TrangThai, // 1 Còn làm, 0 Nghỉ làm
  coTaiKhoan: !!r.hasAccount,
});

function bodySchema(requiredMsg: string) {
  return z.object({
    tenNhanVien: z
      .string({ required_error: requiredMsg, invalid_type_error: requiredMsg })
      .transform((s) => s.trim())
      .pipe(z.string().min(1, requiredMsg).max(100, "Tên nhân viên tối đa 100 ký tự!")),
    sdt: z
      .string({ required_error: requiredMsg, invalid_type_error: requiredMsg })
      .transform((s) => s.trim())
      .pipe(z.string().min(1, requiredMsg)),
    diaChi: z.string().max(200, "Địa chỉ tối đa 200 ký tự!").optional().default(""),
    ngayVaoLam: z
      .string()
      .nullable()
      .optional()
      .transform((s) => (s ? s : null))
      .refine((s) => s === null || isValidIsoDate(s), { message: "Ngày vào làm không hợp lệ!" }),
    trangThai: z.union([z.literal(0), z.literal(1)]).default(1),
  });
}

function checkPhone(sdt: string) {
  if (!/^\d{1,10}$/.test(sdt)) throw new HttpError(400, INVALID, { sdt: INVALID });
}

async function ensurePhoneFree(e: Executor, sdt: string, exceptCode?: string) {
  const { rows } = await e.query(`SELECT 1 FROM nhanvien WHERE "SDT"=$1 AND ($2::text IS NULL OR "MaNhanVien"<>$2)`, [
    sdt,
    exceptCode ?? null,
  ]);
  if (rows.length) throw new HttpError(409, INVALID, { sdt: INVALID });
}

async function nextCode(e: Executor): Promise<string> {
  const { rows } = await e.query<{ m: string | null }>(`SELECT MAX("MaNhanVien") AS m FROM nhanvien`);
  const n = rows[0]?.m ? parseInt(rows[0].m.slice(2), 10) : 0;
  return "NV" + String(n + 1).padStart(3, "0");
}

employeesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rows } = await getDb().query<EmpRow>(`${SELECT} ORDER BY n."MaNhanVien"`);
    res.json({ items: rows.map(map) });
  }),
);

employeesRouter.get(
  "/next-code",
  asyncHandler(async (_req, res) => {
    res.json({ maNhanVien: await nextCode(getDb()) });
  }),
);

employeesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const b = parse(bodySchema("Vui lòng nhập đầy đủ thông tin!"), req.body ?? {});
    checkPhone(b.sdt);
    const code = await getDb().tx(async (t) => {
      await t.query(`SELECT pg_advisory_xact_lock(103)`);
      await ensurePhoneFree(t, b.sdt);
      const code = await nextCode(t);
      await t.query(
        `INSERT INTO nhanvien("MaNhanVien","TenNhanVien","SDT","DiaChi","NgayVaoLam","TrangThai") VALUES ($1,$2,$3,$4,$5,$6)`,
        [code, b.tenNhanVien, b.sdt, b.diaChi.trim(), b.ngayVaoLam, b.trangThai],
      );
      return code;
    });
    res.status(201).json({ maNhanVien: code, message: "Thêm nhân viên thành công!" });
  }),
);

employeesRouter.put(
  "/:ma",
  asyncHandler(async (req, res) => {
    const b = parse(bodySchema("Vui lòng nhập đầy đủ thông tin bắt buộc!"), req.body ?? {});
    checkPhone(b.sdt);
    await getDb().tx(async (t) => {
      const ex = await t.query(`SELECT 1 FROM nhanvien WHERE "MaNhanVien"=$1`, [req.params.ma]);
      if (!ex.rows.length) throw new HttpError(404, "Không tìm thấy nhân viên!");
      await ensurePhoneFree(t, b.sdt, req.params.ma);
      await t.query(
        `UPDATE nhanvien SET "TenNhanVien"=$2,"SDT"=$3,"DiaChi"=$4,"NgayVaoLam"=$5,"TrangThai"=$6 WHERE "MaNhanVien"=$1`,
        [req.params.ma, b.tenNhanVien, b.sdt, b.diaChi.trim(), b.ngayVaoLam, b.trangThai],
      );
    });
    res.json({ message: "Cập nhật thông tin nhân viên thành công!" });
  }),
);

employeesRouter.post(
  "/:ma/deactivate",
  asyncHandler(async (req, res) => {
    const { rows } = await getDb().query(`UPDATE nhanvien SET "TrangThai"=0 WHERE "MaNhanVien"=$1 RETURNING "MaNhanVien"`, [
      req.params.ma,
    ]);
    if (!rows[0]) throw new HttpError(404, "Không tìm thấy nhân viên!");
    res.json({ message: "Đã chuyển trạng thái thành Nghỉ làm" });
  }),
);

employeesRouter.delete(
  "/:ma",
  asyncHandler(async (req, res) => {
    const db = getDb();
    const ma = req.params.ma;
    const ex = await db.query(`SELECT 1 FROM nhanvien WHERE "MaNhanVien"=$1`, [ma]);
    if (!ex.rows.length) throw new HttpError(404, "Không tìm thấy nhân viên!");
    const blockers = await db.query<{ o: boolean; a: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM donhang WHERE "MaNhanVien"=$1) AS o,
              EXISTS(SELECT 1 FROM taikhoan WHERE "MaNhanVien"=$1) AS a`,
      [ma],
    );
    const { o, a } = blockers.rows[0];
    if (o || a)
      throw new HttpError(
        409,
        "Không thể xóa nhân viên đã có tài khoản hoặc đã ghi nhận đơn hàng. Hãy chuyển trạng thái thành Nghỉ làm!",
      );
    await db.query(`DELETE FROM nhanvien WHERE "MaNhanVien"=$1`, [ma]); // lịch phân công cascade
    res.json({ message: "Xóa nhân viên thành công!" });
  }),
);
