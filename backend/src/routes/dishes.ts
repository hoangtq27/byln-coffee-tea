import { Router } from "express";
import { z } from "zod";
import { getDb, type Executor } from "../db.js";
import { asyncHandler, HttpError, parse } from "../lib/http.js";
import { normalizeText } from "../lib/text.js";
import { priceSchema, trimmedString } from "../lib/validators.js";
import { authenticate, requireRole } from "../middleware/auth.js";

export const dishesRouter = Router();
dishesRouter.use(authenticate);

interface DishRow {
  MaMon: string;
  TenMon: string;
  GiaBan: number;
  TrangThai: number;
}
const map = (r: DishRow) => ({
  maMon: r.MaMon.trim(),
  tenMon: r.TenMon,
  giaBan: r.GiaBan,
  trangThai: r.TrangThai, // 1 = Đang bán, 0 = Ngừng bán
});

const body = z.object({
  tenMon: trimmedString(200, "Vui lòng nhập tên món!", "Tên món tối đa 200 ký tự!"),
  giaBan: priceSchema("Vui lòng nhập giá bán!", "Giá bán phải là số lớn hơn 0!"),
  trangThai: z.union([z.literal(0), z.literal(1)]).default(1),
});

/** Tìm kiếm không phân biệt hoa/thường và dấu (lọc ở tầng ứng dụng, danh mục món nhỏ). */
dishesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await getDb().query<DishRow>(`SELECT * FROM mon ORDER BY "MaMon"`);
    let list = rows.map(map);
    const q = typeof req.query.q === "string" ? normalizeText(req.query.q) : "";
    if (q) list = list.filter((d) => normalizeText(d.tenMon).includes(q));
    res.json({ items: list });
  }),
);

async function nextCode(e: Executor): Promise<string> {
  const { rows } = await e.query<{ m: string | null }>(`SELECT MAX("MaMon") AS m FROM mon`);
  const n = rows[0]?.m ? parseInt(rows[0].m.slice(1), 10) : 0;
  if (n >= 999) throw new HttpError(409, "Đã đạt số lượng món tối đa!");
  return "M" + String(n + 1).padStart(3, "0");
}

dishesRouter.get(
  "/next-code",
  requireRole("manager"),
  asyncHandler(async (_req, res) => {
    res.json({ maMon: await nextCode(getDb()) });
  }),
);

dishesRouter.post(
  "/",
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const b = parse(body, req.body ?? {});
    const created = await getDb().tx(async (t) => {
      await t.query(`SELECT pg_advisory_xact_lock(101)`);
      const code = await nextCode(t);
      const { rows } = await t.query<DishRow>(
        `INSERT INTO mon("MaMon","TenMon","GiaBan","TrangThai") VALUES ($1,$2,$3,$4) RETURNING *`,
        [code, b.tenMon, b.giaBan, b.trangThai],
      );
      return rows[0];
    });
    res.status(201).json({ item: map(created), message: "Thêm món thành công!" });
  }),
);

dishesRouter.put(
  "/:ma",
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const b = parse(body, req.body ?? {});
    const { rows } = await getDb().query<DishRow>(
      `UPDATE mon SET "TenMon"=$2,"GiaBan"=$3,"TrangThai"=$4 WHERE "MaMon"=$1 RETURNING *`,
      [req.params.ma, b.tenMon, b.giaBan, b.trangThai],
    );
    if (!rows[0]) throw new HttpError(404, "Không tìm thấy món!");
    res.json({ item: map(rows[0]), message: "Cập nhật thông tin món thành công!" });
  }),
);

dishesRouter.post(
  "/:ma/discontinue",
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const { rows } = await getDb().query<DishRow>(`UPDATE mon SET "TrangThai"=0 WHERE "MaMon"=$1 RETURNING *`, [
      req.params.ma,
    ]);
    if (!rows[0]) throw new HttpError(404, "Không tìm thấy món!");
    res.json({ item: map(rows[0]), message: "Đã chuyển trạng thái của món thành Ngừng bán" });
  }),
);

dishesRouter.delete(
  "/:ma",
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const used = await db.query(`SELECT 1 FROM chitiet_donhang WHERE "MaMon"=$1 LIMIT 1`, [req.params.ma]);
    if (used.rows.length)
      throw new HttpError(409, "Món đã phát sinh trong đơn hàng nên không thể xóa. Hãy chuyển trạng thái ngừng bán!");
    const { rows } = await db.query(`DELETE FROM mon WHERE "MaMon"=$1 RETURNING "MaMon"`, [req.params.ma]);
    if (!rows[0]) throw new HttpError(404, "Không tìm thấy món!");
    res.json({ message: "Xóa món thành công!" });
  }),
);
