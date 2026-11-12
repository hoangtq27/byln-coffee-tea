import { Router } from "express";
import { z } from "zod";
import { getDb, type Executor } from "../db.js";
import { asyncHandler, HttpError, parse } from "../lib/http.js";
import { escapeLike } from "../lib/text.js";
import { toNumber } from "../lib/validators.js";
import { authenticate } from "../middleware/auth.js";

export const ordersRouter = Router();
ordersRouter.use(authenticate);

const TS = `to_char(d."ThoiGianTao",'YYYY-MM-DD"T"HH24:MI:SS')`;
const NOW_VN = `(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')`;

interface OrderRow {
  MaDonHang: string;
  MaNhanVien: string;
  ts: string;
  NguonDonHang: number;
  PhuongThucThanhToan: number;
  TrangThaiThanhToan: number;
  TrangThaiDonHang: number;
  TongTien: number;
  GiamGia: number;
  TongThanhToan: number;
  GhiChu: string | null;
}

const mapOrder = (r: OrderRow) => ({
  maDonHang: r.MaDonHang.trim(),
  maNhanVien: r.MaNhanVien.trim(),
  thoiGianTao: r.ts,
  nguon: r.NguonDonHang, // 0 Trực tiếp, 1 GrabFood, 2 ShopeeFood
  phuongThuc: r.PhuongThucThanhToan, // 0 Tiền mặt, 1 Chuyển khoản
  thanhToan: r.TrangThaiThanhToan, // 0 Chưa, 1 Đã
  trangThaiDon: r.TrangThaiDonHang, // 1 Đang thực hiện, 2 Hoàn thành, 0 Hủy
  tongTien: r.TongTien,
  giamGia: r.GiamGia,
  tongThanhToan: r.TongThanhToan,
  ghiChu: r.GhiChu ?? "",
});

const SELECT = `SELECT d.*, ${TS} AS ts FROM donhang d`;

// ---------- Validation ----------
const QTY_REQUIRED = "Vui lòng nhập số lượng!";
const QTY_INVALID = "Số lượng phải là số nguyên lớn hơn 0!";

const itemSchema = z.object({
  maMon: z.string({ required_error: "Vui lòng chọn món!" }).min(1, "Vui lòng chọn món!"),
  soLuong: z.any().transform((v, ctx) => {
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
      ctx.addIssue({ code: "custom", message: QTY_REQUIRED });
      return z.NEVER;
    }
    const n = toNumber(v);
    if (!Number.isInteger(n) || n <= 0 || n > 9999) {
      ctx.addIssue({ code: "custom", message: QTY_INVALID });
      return z.NEVER;
    }
    return n;
  }),
});

const discountSchema = z.any().transform((v, ctx) => {
  if (v === undefined || v === null || v === "") return 0;
  const n = toNumber(v);
  if (!Number.isFinite(n) || n < 0 || n > 1e12) {
    ctx.addIssue({ code: "custom", message: "Giảm giá phải là số không âm!" });
    return z.NEVER;
  }
  return n;
});

const orderBody = z.object({
  items: z
    .array(itemSchema, { required_error: "Đơn hàng phải có ít nhất 1 món!" })
    .min(1, "Đơn hàng phải có ít nhất 1 món!"),
  nguon: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(0),
  phuongThuc: z.union([z.literal(0), z.literal(1)]).default(0),
  thanhToan: z.union([z.literal(0), z.literal(1)]).default(0),
  giamGia: discountSchema,
  ghiChu: z.string().max(200, "Ghi chú tối đa 200 ký tự!").optional().default(""),
  trangThaiDon: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
});

const statusOnlyBody = z.object({
  trangThaiDon: z.union([z.literal(1), z.literal(2)], { errorMap: () => ({ message: "Trạng thái đơn hàng không hợp lệ!" }) }),
});

// ---------- Helpers ----------
async function nextCode(e: Executor): Promise<string> {
  const { rows } = await e.query<{ m: string | null }>(`SELECT MAX("MaDonHang") AS m FROM donhang`);
  const n = rows[0]?.m ? parseInt(rows[0].m.slice(2), 10) : 0;
  return "DH" + String(n + 1).padStart(7, "0");
}

async function writeLines(
  t: Executor,
  code: string,
  items: { maMon: string; soLuong: number }[],
  existing: Map<string, number>,
  isEdit: boolean,
): Promise<number> {
  const seen = new Set<string>();
  const errs: Record<string, string> = {};
  const lines: { maMon: string; soLuong: number; donGia: number }[] = [];
  for (const [i, it] of items.entries()) {
    if (seen.has(it.maMon)) throw new HttpError(400, "Món bị trùng trong đơn hàng!");
    seen.add(it.maMon);
    const { rows } = await t.query<{ GiaBan: number; TrangThai: number }>(
      `SELECT "GiaBan","TrangThai" FROM mon WHERE "MaMon"=$1`,
      [it.maMon],
    );
    const dish = rows[0];
    if (!dish) throw new HttpError(400, "Món không tồn tại!", { [`items.${i}.maMon`]: "Món không tồn tại!" });
    const kept = existing.get(it.maMon);
    if (dish.TrangThai !== 1 && kept === undefined) {
      const msg = isEdit ? "Món đã ngừng kinh doanh!" : "Món đã ngừng kinh doanh. Vui lòng chọn món khác!";
      errs[`items.${i}.maMon`] = msg;
      continue;
    }
    // Đơn giá luôn lấy từ hệ thống (giữ giá cũ cho dòng đã có) — không tin giá từ client
    lines.push({ maMon: it.maMon, soLuong: it.soLuong, donGia: kept ?? dish.GiaBan });
  }
  if (Object.keys(errs).length) throw new HttpError(400, Object.values(errs)[0], errs);

  await t.query(`DELETE FROM chitiet_donhang WHERE "MaDonHang"=$1`, [code]);
  let total = 0;
  for (const l of lines) {
    await t.query(`INSERT INTO chitiet_donhang("MaDonHang","MaMon","SoLuong","DonGia") VALUES ($1,$2,$3,$4)`, [
      code,
      l.maMon,
      l.soLuong,
      l.donGia,
    ]);
    total += l.soLuong * l.donGia;
  }
  return total;
}

function checkDiscount(giamGia: number, total: number) {
  if (giamGia > total)
    throw new HttpError(400, "Giảm giá không được lớn hơn tổng tiền!", {
      giamGia: "Giảm giá không được lớn hơn tổng tiền!",
    });
}

// ---------- Routes ----------
ordersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "100"), 10) || 100, 1), 500);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const where = q ? `WHERE d."MaDonHang" ILIKE $1 ESCAPE '\\'` : "";
    const params: unknown[] = q ? [`%${escapeLike(q)}%`] : [];
    const db = getDb();
    const total = (await db.query<{ c: number }>(`SELECT COUNT(*) AS c FROM donhang d ${where}`, params)).rows[0].c;
    const { rows } = await db.query<OrderRow>(
      `${SELECT} ${where} ORDER BY d."ThoiGianTao" DESC, d."MaDonHang" DESC LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    res.json({ items: rows.map(mapOrder), total });
  }),
);

ordersRouter.get(
  "/next-code",
  asyncHandler(async (_req, res) => {
    res.json({ maDonHang: await nextCode(getDb()) });
  }),
);

ordersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const db = getDb();
    const { rows } = await db.query<OrderRow>(`${SELECT} WHERE d."MaDonHang"=$1`, [req.params.id]);
    if (!rows[0]) throw new HttpError(404, "Không tìm thấy đơn hàng");
    const items = await db.query(
      `SELECT c."MaMon", m."TenMon", c."SoLuong", c."DonGia", c."ThanhTien"
       FROM chitiet_donhang c JOIN mon m ON m."MaMon"=c."MaMon" WHERE c."MaDonHang"=$1 ORDER BY c."MaMon"`,
      [req.params.id],
    );
    res.json({
      order: mapOrder(rows[0]),
      items: items.rows.map((r: any) => ({
        maMon: r.MaMon.trim(),
        tenMon: r.TenMon,
        soLuong: r.SoLuong,
        donGia: r.DonGia,
        thanhTien: r.ThanhTien,
      })),
    });
  }),
);

ordersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const b = parse(orderBody, req.body ?? {});
    const phuongThuc = b.nguon !== 0 ? 1 : b.phuongThuc; // đơn nền tảng ngoài: không thu tiền mặt tại quầy
    const created = await getDb().tx(async (t) => {
      await t.query(`SELECT pg_advisory_xact_lock(102)`);
      const code = await nextCode(t);
      await t.query(
        `INSERT INTO donhang("MaDonHang","MaNhanVien","ThoiGianTao","NguonDonHang","PhuongThucThanhToan",
           "TrangThaiThanhToan","TrangThaiDonHang","TongTien","GiamGia","GhiChu")
         VALUES ($1,$2,${NOW_VN},$3,$4,$5,1,0,0,$6)`,
        [code, req.user!.maNhanVien, b.nguon, phuongThuc, b.thanhToan, b.ghiChu.trim() || null],
      );
      const total = await writeLines(t, code, b.items, new Map(), false);
      checkDiscount(b.giamGia, total);
      await t.query(`UPDATE donhang SET "TongTien"=$2,"GiamGia"=$3 WHERE "MaDonHang"=$1`, [code, total, b.giamGia]);
      return code;
    });
    res.status(201).json({ maDonHang: created, message: "Tạo đơn hàng thành công!" });
  }),
);

ordersRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const db = getDb();
    const id = req.params.id;
    const cur = (await db.query<OrderRow>(`${SELECT} WHERE d."MaDonHang"=$1`, [id])).rows[0];
    if (!cur) throw new HttpError(404, "Không tìm thấy đơn hàng");

    const staffOnPaid = req.user!.role === "staff" && cur.TrangThaiThanhToan === 1;
    if (staffOnPaid) {
      // Đơn đã thanh toán: Nhân viên chỉ được chuyển trạng thái đơn sang "Hoàn thành"
      const keys = Object.keys(req.body ?? {});
      if (keys.some((k) => k !== "trangThaiDon"))
        throw new HttpError(403, "Nhân viên không được chỉnh sửa đơn hàng đã thanh toán!");
      const b = parse(statusOnlyBody, req.body ?? {});
      if (b.trangThaiDon !== 2 && b.trangThaiDon !== cur.TrangThaiDonHang)
        throw new HttpError(403, "Nhân viên chỉ được chuyển đơn hàng đã thanh toán sang trạng thái Hoàn thành!");
      await db.query(`UPDATE donhang SET "TrangThaiDonHang"=$2 WHERE "MaDonHang"=$1`, [id, b.trangThaiDon]);
      return res.json({ message: "Cập nhật đơn hàng thành công!" });
    }

    const b = parse(orderBody, req.body ?? {});
    const phuongThuc = b.nguon !== 0 ? 1 : b.phuongThuc;
    await db.tx(async (t) => {
      const old = await t.query<{ MaMon: string; DonGia: number }>(
        `SELECT "MaMon","DonGia" FROM chitiet_donhang WHERE "MaDonHang"=$1`,
        [id],
      );
      const existing = new Map(old.rows.map((r) => [r.MaMon.trim(), r.DonGia]));
      const total = await writeLines(t, id, b.items, existing, true);
      checkDiscount(b.giamGia, total);
      await t.query(
        `UPDATE donhang SET "NguonDonHang"=$2,"PhuongThucThanhToan"=$3,"TrangThaiThanhToan"=$4,
           "TrangThaiDonHang"=$5,"TongTien"=$6,"GiamGia"=$7,"GhiChu"=$8 WHERE "MaDonHang"=$1`,
        [id, b.nguon, phuongThuc, b.thanhToan, b.trangThaiDon ?? cur.TrangThaiDonHang, total, b.giamGia, b.ghiChu.trim() || null],
      );
    });
    res.json({ message: "Cập nhật đơn hàng thành công!" });
  }),
);
