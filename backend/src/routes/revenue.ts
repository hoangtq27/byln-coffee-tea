import { Router } from "express";
import { getDb } from "../db.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { addDays, daysBetween, eachDay, isValidIsoDate, mondayOf } from "../lib/dates.js";
import { authenticate, requireRole } from "../middleware/auth.js";

export const revenueRouter = Router();
revenueRouter.use(authenticate, requireRole("manager"));

/**
 * Quy ước doanh thu (dùng thống nhất cho báo cáo và so sánh):
 * chỉ tính đơn ĐÃ THANH TOÁN và KHÔNG bị hủy; doanh thu = Tổng thanh toán (sau giảm giá).
 */
const REVENUE_WHERE = `d."TrangThaiThanhToan"=1 AND d."TrangThaiDonHang"<>0`;

const MSG_ORDER = "Ngày bắt đầu không được lớn hơn ngày kết thúc!";
const MSG_MISSING = "Vui lòng chọn đầy đủ khoảng thời gian!";

function range(from: unknown, to: unknown): [string, string] {
  if (typeof from !== "string" || typeof to !== "string" || !isValidIsoDate(from) || !isValidIsoDate(to))
    throw new HttpError(400, MSG_MISSING);
  if (from > to) throw new HttpError(400, MSG_ORDER);
  return [from, to];
}

interface DayRow {
  d: string;
  total: number;
  cash: number;
  transfer: number;
  orders: number;
}

async function perDay(from: string, to: string): Promise<DayRow[]> {
  const { rows } = await getDb().query<DayRow>(
    `SELECT to_char(d."ThoiGianTao",'YYYY-MM-DD') AS d,
            COALESCE(SUM(d."TongThanhToan"),0) AS total,
            COALESCE(SUM(CASE WHEN d."PhuongThucThanhToan"=0 THEN d."TongThanhToan" ELSE 0 END),0) AS cash,
            COALESCE(SUM(CASE WHEN d."PhuongThucThanhToan"=1 THEN d."TongThanhToan" ELSE 0 END),0) AS transfer,
            COUNT(*) AS orders
     FROM donhang d
     WHERE ${REVENUE_WHERE} AND d."ThoiGianTao" >= $1::date AND d."ThoiGianTao" < ($2::date + 1)
     GROUP BY 1 ORDER BY 1`,
    [from, to],
  );
  return rows;
}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

type Gran = "day" | "week" | "month" | "year";

function bucketKey(day: string, g: Gran, from: string): { key: string; label: string } {
  if (g === "day") return { key: day, label: dm(day) };
  if (g === "week") {
    const mon = mondayOf(day);
    const start = mon < from ? from : mon;
    return { key: mon, label: dm(start) };
  }
  if (g === "month") return { key: day.slice(0, 7), label: `T${parseInt(day.slice(5, 7), 10)}/${day.slice(0, 4)}` };
  return { key: day.slice(0, 4), label: day.slice(0, 4) };
}

revenueRouter.get(
  "/report",
  asyncHandler(async (req, res) => {
    const [from, to] = range(req.query.from, req.query.to);
    const g = (["day", "week", "month", "year"].includes(String(req.query.granularity))
      ? String(req.query.granularity)
      : "day") as Gran;
    if (daysBetween(from, to) > 3660) throw new HttpError(400, "Khoảng thời gian quá dài!");

    const days = await perDay(from, to);
    const byDay = new Map(days.map((r) => [r.d, r]));

    // Gom các ngày (kể cả ngày doanh thu 0) vào bucket để biểu đồ liên tục
    const buckets = new Map<string, { label: string; value: number }>();
    for (const day of eachDay(from, to)) {
      const { key, label } = bucketKey(day, g, from);
      const b = buckets.get(key) ?? { label, value: 0 };
      b.value += byDay.get(day)?.total ?? 0;
      buckets.set(key, b);
    }

    const sum = (f: (r: DayRow) => number) => days.reduce((s, r) => s + f(r), 0);
    const top = await getDb().query<{ MaMon: string; TenMon: string; qty: number }>(
      `SELECT c."MaMon", m."TenMon", SUM(c."SoLuong") AS qty
       FROM chitiet_donhang c JOIN donhang d ON d."MaDonHang"=c."MaDonHang" JOIN mon m ON m."MaMon"=c."MaMon"
       WHERE ${REVENUE_WHERE} AND d."ThoiGianTao" >= $1::date AND d."ThoiGianTao" < ($2::date + 1)
       GROUP BY c."MaMon", m."TenMon" ORDER BY qty DESC, c."MaMon" LIMIT 5`,
      [from, to],
    );

    res.json({
      from,
      to,
      granularity: g,
      tongDoanhThu: sum((r) => r.total),
      soDonHang: sum((r) => r.orders),
      tienMat: sum((r) => r.cash),
      chuyenKhoan: sum((r) => r.transfer),
      chart: [...buckets.values()],
      monBanChay: top.rows.map((r) => ({ maMon: r.MaMon.trim(), tenMon: r.TenMon, soLuong: r.qty })),
    });
  }),
);

async function periodTotal(from: string, to: string): Promise<{ total: number; orders: number }> {
  const rows = await perDay(from, to);
  return { total: rows.reduce((s, r) => s + r.total, 0), orders: rows.reduce((s, r) => s + r.orders, 0) };
}

function periodLabel(from: string, to: string): string {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (fy === ty && fm === tm && fd === 1 && td === lastDay(ty, tm)) return `Tháng ${fm}`;
  if (fy === ty && fm === 1 && fd === 1 && tm === 12 && td === 31) return `Năm ${fy}`;
  if (from === to) return `${dm(from)}/${fy}`;
  return `${dm(from)}/${fy} – ${dm(to)}/${ty}`;
}

revenueRouter.get(
  "/compare",
  asyncHandler(async (req, res) => {
    const q = req.query;
    if (![q.from1, q.to1, q.from2, q.to2].every((v) => typeof v === "string" && v !== ""))
      throw new HttpError(400, MSG_MISSING);
    const [f1, t1] = range(q.from1, q.to1);
    const [f2, t2] = range(q.from2, q.to2);
    const [p1, p2] = await Promise.all([periodTotal(f1, t1), periodTotal(f2, t2)]);
    if (p1.total <= 0 || p2.total <= 0)
      throw new HttpError(404, "Không có đủ dữ liệu doanh thu để thực hiện so sánh!");
    const diff = p2.total - p1.total; // BR01: kỳ 2 trừ kỳ 1
    res.json({
      ky1: { from: f1, to: t1, label: periodLabel(f1, t1), tongDoanhThu: p1.total, soDonHang: p1.orders },
      ky2: { from: f2, to: t2, label: periodLabel(f2, t2), tongDoanhThu: p2.total, soDonHang: p2.orders },
      chenhLech: diff,
      tangTruong: (diff / p1.total) * 100, // % tăng trưởng so với kỳ 1
    });
  }),
);

export { addDays };
