import { Router } from "express";
import { z } from "zod";
import { getDb, type Executor } from "../db.js";
import { asyncHandler, HttpError, parse } from "../lib/http.js";
import { daysBetween, eachDay, hhmm, HHMM, isValidIsoDate, timeToMinutes } from "../lib/dates.js";
import { authenticate, requireRole } from "../middleware/auth.js";

export const shiftsRouter = Router();
shiftsRouter.use(authenticate, requireRole("manager"));

// BR01: lịch làm việc phải nằm trong giờ hoạt động của quán (7:00 - 22:00)
const OPEN = 7 * 60;
const CLOSE = 22 * 60;
const MAX_PER_SHIFT = 2; // SDD: mỗi ca làm có hai nhân viên
const MAX_RANGE_DAYS = 366;

const MSG = {
  noDate: "Vui lòng chọn thời gian cần lập lịch!",
  badTime: "Thời gian không hợp lệ. Vui lòng nhập lại!",
  noEmp: "Chưa có nhân viên được chọn!",
  overlap: "Lịch làm việc bị trùng!",
  full: "Mỗi ca làm chỉ có tối đa 2 nhân viên!",
};

function validTimes(start: unknown, end: unknown): [string, string] {
  if (typeof start !== "string" || typeof end !== "string" || !HHMM.test(start) || !HHMM.test(end))
    throw new HttpError(400, MSG.badTime, { gioBatDau: MSG.badTime });
  const s = timeToMinutes(start), e = timeToMinutes(end);
  if (s >= e || s < OPEN || e > CLOSE) throw new HttpError(400, MSG.badTime, { gioBatDau: MSG.badTime });
  return [start, end];
}

async function resolveShiftId(t: Executor, start: string, end: string): Promise<number> {
  const found = await t.query<{ MaCaLam: number }>(
    `SELECT "MaCaLam" FROM calam WHERE "GioBatDau"=$1::time AND "GioKetThuc"=$2::time`,
    [start, end],
  );
  if (found.rows[0]) return found.rows[0].MaCaLam;
  const ins = await t.query<{ MaCaLam: number }>(
    `INSERT INTO calam("GioBatDau","GioKetThuc") VALUES ($1::time,$2::time) RETURNING "MaCaLam"`,
    [start, end],
  );
  return ins.rows[0].MaCaLam;
}

/** Kiểm tra trùng giờ và giới hạn số nhân viên cho (ngày, ca) với danh sách nhân viên cuối cùng. */
async function assertSchedulable(
  t: Executor,
  date: string,
  shiftId: number,
  start: string,
  end: string,
  employees: string[],
  ignoreShiftId?: number,
) {
  for (const emp of employees) {
    const { rows } = await t.query(
      `SELECT 1 FROM phancongca p JOIN calam c ON c."MaCaLam"=p."MaCaLam"
       WHERE p."MaNhanVien"=$1 AND p."NgayLam"=$2::date AND p."TrangThai"=1
         AND p."MaCaLam"<>$3 AND ($6::int IS NULL OR p."MaCaLam"<>$6)
         AND c."GioBatDau" < $5::time AND c."GioKetThuc" > $4::time`,
      [emp, date, shiftId, start, end, ignoreShiftId ?? null],
    );
    if (rows.length) throw new HttpError(409, MSG.overlap);
  }
  const { rows } = await t.query<{ n: string }>(
    `SELECT "MaNhanVien" AS n FROM phancongca WHERE "MaCaLam"=$1 AND "NgayLam"=$2::date AND "TrangThai"=1`,
    [shiftId, date],
  );
  const union = new Set([...rows.map((r) => r.n.trim()), ...employees]);
  if (union.size > MAX_PER_SHIFT) throw new HttpError(409, MSG.full);
}

const shiftLabel = (start: string) => {
  const h = parseInt(start.slice(0, 2), 10);
  return h < 12 ? "Ca sáng" : h < 17 ? "Ca chiều" : "Ca tối";
};

shiftsRouter.get(
  "/types",
  asyncHandler(async (_req, res) => {
    const { rows } = await getDb().query(
      `SELECT "MaCaLam", to_char("GioBatDau",'HH24:MI') AS s, to_char("GioKetThuc",'HH24:MI') AS e FROM calam ORDER BY "GioBatDau","GioKetThuc"`,
    );
    res.json({
      items: rows.map((r: any) => ({ maCaLam: r.MaCaLam, gioBatDau: r.s, gioKetThuc: r.e, ten: shiftLabel(r.s) })),
    });
  }),
);

shiftsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const from = String(req.query.from ?? ""), to = String(req.query.to ?? "");
    if (!isValidIsoDate(from) || !isValidIsoDate(to) || from > to) throw new HttpError(400, MSG.noDate);
    if (daysBetween(from, to) > 62) throw new HttpError(400, "Khoảng thời gian xem quá dài!");
    const { rows } = await getDb().query(
      `SELECT p."MaNhanVien", n."TenNhanVien", p."MaCaLam", to_char(p."NgayLam",'YYYY-MM-DD') AS d,
              to_char(c."GioBatDau",'HH24:MI') AS s, to_char(c."GioKetThuc",'HH24:MI') AS e, p."TrangThai"
       FROM phancongca p JOIN nhanvien n ON n."MaNhanVien"=p."MaNhanVien" JOIN calam c ON c."MaCaLam"=p."MaCaLam"
       WHERE p."NgayLam" BETWEEN $1::date AND $2::date
       ORDER BY p."NgayLam", c."GioBatDau", p."MaNhanVien"`,
      [from, to],
    );
    res.json({
      items: rows.map((r: any) => ({
        maNhanVien: r.MaNhanVien.trim(),
        tenNhanVien: r.TenNhanVien,
        maCaLam: r.MaCaLam,
        tenCa: shiftLabel(r.s),
        ngayLam: r.d,
        gioBatDau: r.s,
        gioKetThuc: r.e,
        trangThai: r.TrangThai, // 1 Được phân công, 2 Đã đổi, 0 Hủy
      })),
    });
  }),
);

const createSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  gioBatDau: z.any(),
  gioKetThuc: z.any(),
  employees: z.array(z.string()).optional().default([]),
});

shiftsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const b = parse(createSchema, req.body ?? {});
    // Thứ tự kiểm tra theo SDD: thời gian lập lịch -> giờ -> nhân viên -> trùng lịch
    if (!b.from || !b.to || !isValidIsoDate(b.from) || !isValidIsoDate(b.to))
      throw new HttpError(400, MSG.noDate, { from: MSG.noDate });
    if (b.from > b.to) throw new HttpError(400, MSG.badTime, { to: MSG.badTime });
    if (daysBetween(b.from, b.to) + 1 > MAX_RANGE_DAYS) throw new HttpError(400, "Khoảng thời gian lập lịch quá dài!");
    const [start, end] = validTimes(b.gioBatDau, b.gioKetThuc);
    const employees = [...new Set(b.employees)];
    if (!employees.length) throw new HttpError(400, MSG.noEmp, { employees: MSG.noEmp });

    let created = 0;
    await getDb().tx(async (t) => {
      const act = await t.query<{ MaNhanVien: string }>(
        `SELECT "MaNhanVien" FROM nhanvien WHERE "MaNhanVien" = ANY($1::text[]) AND "TrangThai"=1`,
        [employees],
      );
      if (act.rows.length !== employees.length)
        throw new HttpError(400, "Chỉ có thể phân công nhân viên đang còn làm!", { employees: "Chỉ có thể phân công nhân viên đang còn làm!" });
      const shiftId = await resolveShiftId(t, start, end);
      for (const day of eachDay(b.from!, b.to!)) {
        await assertSchedulable(t, day, shiftId, start, end, employees);
        for (const emp of employees) {
          await t.query(
            `INSERT INTO phancongca("MaCaLam","MaNhanVien","NgayLam","TrangThai") VALUES ($1,$2,$3::date,1)
             ON CONFLICT ("MaCaLam","MaNhanVien","NgayLam") DO UPDATE SET "TrangThai"=1`,
            [shiftId, emp, day],
          );
          created++;
        }
      }
    });
    res.status(201).json({ created, message: "Lập lịch làm việc thành công" });
  }),
);

const editSchema = z.object({
  gioBatDau: z.any(),
  gioKetThuc: z.any(),
  remove: z.array(z.string()).optional().default([]),
  add: z.array(z.string()).optional().default([]),
});

/** Sửa một ca trong một ngày: đổi giờ, bỏ/thêm nhân viên. */
shiftsRouter.put(
  "/:maCaLam/:ngay",
  asyncHandler(async (req, res) => {
    const maCaLam = parseInt(req.params.maCaLam, 10);
    const ngay = req.params.ngay;
    if (!Number.isInteger(maCaLam) || !isValidIsoDate(ngay)) throw new HttpError(400, MSG.noDate);
    const b = parse(editSchema, req.body ?? {});
    const [start, end] = validTimes(b.gioBatDau, b.gioKetThuc);

    await getDb().tx(async (t) => {
      const cur = await t.query<{ MaNhanVien: string; TrangThai: number }>(
        `SELECT "MaNhanVien","TrangThai" FROM phancongca WHERE "MaCaLam"=$1 AND "NgayLam"=$2::date`,
        [maCaLam, ngay],
      );
      if (!cur.rows.length) throw new HttpError(404, "Không tìm thấy ca làm!");
      const active = new Set(cur.rows.filter((r) => r.TrangThai === 1).map((r) => r.MaNhanVien.trim()));
      const toAdd = [...new Set(b.add)].filter((e) => !active.has(e));
      const toRemove = [...new Set(b.remove)].filter((e) => active.has(e));
      const finalActive = [...active].filter((e) => !toRemove.includes(e)).concat(toAdd);
      if (!finalActive.length) throw new HttpError(400, MSG.noEmp, { employees: MSG.noEmp });

      if (toAdd.length) {
        const act = await t.query(
          `SELECT 1 FROM nhanvien WHERE "MaNhanVien" = ANY($1::text[]) AND "TrangThai"=1`,
          [toAdd],
        );
        if (act.rows.length !== toAdd.length)
          throw new HttpError(400, "Chỉ có thể phân công nhân viên đang còn làm!", { employees: "Chỉ có thể phân công nhân viên đang còn làm!" });
      }

      // Bỏ nhân viên: "Đã đổi" nếu có người thay thế, ngược lại "Hủy"
      for (const e of toRemove) {
        await t.query(
          `UPDATE phancongca SET "TrangThai"=$4 WHERE "MaCaLam"=$1 AND "NgayLam"=$2::date AND "MaNhanVien"=$3`,
          [maCaLam, ngay, e, toAdd.length ? 2 : 0],
        );
      }
      const newShiftId = await resolveShiftId(t, start, end);
      // Kiểm tra với trạng thái sau khi bỏ nhân viên (các ca khác trong ngày)
      await assertSchedulable(t, ngay, newShiftId, start, end, finalActive, maCaLam);
      if (newShiftId !== maCaLam) {
        const clash = await t.query(
          `SELECT 1 FROM phancongca WHERE "MaCaLam"=$1 AND "NgayLam"=$2::date AND "MaNhanVien" = ANY($3::text[])`,
          [newShiftId, ngay, finalActive],
        );
        if (clash.rows.length) throw new HttpError(409, MSG.overlap);
        await t.query(`UPDATE phancongca SET "MaCaLam"=$3 WHERE "MaCaLam"=$1 AND "NgayLam"=$2::date`, [
          maCaLam,
          ngay,
          newShiftId,
        ]);
      }
      for (const e of toAdd) {
        await t.query(
          `INSERT INTO phancongca("MaCaLam","MaNhanVien","NgayLam","TrangThai") VALUES ($1,$2,$3::date,1)
           ON CONFLICT ("MaCaLam","MaNhanVien","NgayLam") DO UPDATE SET "TrangThai"=1`,
          [newShiftId, e, ngay],
        );
      }
    });
    res.json({ message: "Đã sửa thành công" });
  }),
);

export { hhmm };
