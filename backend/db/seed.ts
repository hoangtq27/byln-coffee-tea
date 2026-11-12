/**
 * Dữ liệu mẫu có tính nhất quán logic:
 *  - Đơn hàng sinh theo lịch phân công ca (người tạo đơn là nhân viên đang trực ca đó, có tài khoản).
 *  - TongTien = tổng ThanhTien chi tiết; giảm giá <= tổng tiền.
 *  - Đơn nền tảng ngoài (GrabFood/ShopeeFood) luôn thanh toán chuyển khoản.
 *  - Đơn quá khứ đều đã thanh toán + Hoàn thành, hoặc Hủy (chưa thanh toán).
 *  - Món "Trà đào cam sả" (M004) chỉ xuất hiện trong đơn trước khi ngừng bán (01/10/2026).
 *  - Báo cáo / so sánh doanh thu được tính trực tiếp từ bảng đơn hàng nên luôn khớp dữ liệu.
 */
import bcrypt from "bcryptjs";
import { fileURLToPath } from "node:url";
import { getDb, initSchema, type Database } from "../src/db.js";
import { addDays, eachDay } from "../src/lib/dates.js";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SEED_TODAY = process.env.SEED_TODAY ?? "2026-11-12";
const START = "2026-01-01";
const SCHEDULE_END = "2026-11-15"; // hết tuần hiện tại; các tuần sau để trống cho Quản lý lập lịch
const M004_STOP = "2026-10-01";

export const DEMO_PASSWORDS = { manager: "Quanly@123", staff: "Nhanvien@123" };

const EMPLOYEES = [
  ["NV001", "Nguyễn Văn An", "0901234567", "12 Lê Duẩn, Hải Châu, Đà Nẵng", "2024-03-01"],
  ["NV002", "Lê Thị Lan", "0902345678", "45 Nguyễn Văn Linh, Hải Châu, Đà Nẵng", "2024-06-15"],
  ["NV003", "Trần Văn Minh", "0903456789", "78 Hoàng Diệu, Hải Châu, Đà Nẵng", "2024-09-01"],
  ["NV004", "Phạm Thị Hoa", "0904567890", "23 Ông Ích Khiêm, Hải Châu, Đà Nẵng", "2025-02-10"],
  ["NV005", "Võ Văn Tuấn", "0905678901", "9 Lý Thường Kiệt, Thanh Khê, Đà Nẵng", "2025-06-01"],
  ["NV006", "Lê Ngọc My", "0906789012", "56 Trần Phú, Hải Châu, Đà Nẵng", "2025-10-15"],
  ["NV007", "Trần Thị Mai", "0907890123", "31 Núi Thành, Hải Châu, Đà Nẵng", "2026-11-10"],
  ["NV008", "Phạm Thu Hà", "0908901234", "88 Điện Biên Phủ, Thanh Khê, Đà Nẵng", "2026-11-11"],
] as const;

const ACCOUNTS = [
  ["TK001", "quanly", "NV001", 0, DEMO_PASSWORDS.manager],
  ["TK002", "lan.nv", "NV002", 1, DEMO_PASSWORDS.staff],
  ["TK003", "minh.nv", "NV003", 1, DEMO_PASSWORDS.staff],
  ["TK004", "hoa.nv", "NV004", 1, DEMO_PASSWORDS.staff],
  ["TK005", "tuan.nv", "NV005", 1, DEMO_PASSWORDS.staff],
  ["TK006", "my.nv", "NV006", 1, DEMO_PASSWORDS.staff],
] as const;

const DISHES = [
  ["M001", "Cà phê sữa đá", 32000, 1],
  ["M002", "Bạc xỉu", 38000, 1],
  ["M003", "Americano", 35000, 1],
  ["M004", "Trà đào cam sả", 42000, 0],
  ["M005", "Matcha latte", 45000, 1],
  ["M006", "Cacao đá", 39000, 1],
] as const;
const PRICE = new Map<string, number>(DISHES.map((d) => [d[0], d[2]]));

const SHIFTS = [
  [1, "07:00", "12:00"],
  [2, "12:00", "17:00"],
  [3, "17:00", "22:00"],
] as const;

// Hệ số theo tháng (tạo xu hướng để báo cáo/so sánh có ý nghĩa)
const MONTH_FACTOR = [0.95, 0.85, 1.0, 1.02, 1.08, 1.12, 1.1, 1.05, 1.0, 1.12, 1.18];

const NOTES_DIRECT = ["Ít đường", "Không đá", "Thêm đá", "Ít ngọt", "Mang đi", "Ít sữa"];
const NOTES_DELIVERY = ["Giao nhanh giúp quán", "Đóng gói cẩn thận", "Khách yêu cầu thêm ống hút"];

type Assign = { shift: number; emp: string };

function buildSchedule(): Map<string, Assign[]> {
  const sched = new Map<string, Assign[]>();
  const slots = [2, 1, 1, 2, 3, 3]; // thứ tự ca của 6 vị trí (2 người/ca)
  let idx = 0;
  for (const day of eachDay(START, SCHEDULE_END)) {
    const pool = day >= "2026-11-13" ? ["NV002", "NV003", "NV004", "NV005", "NV006", "NV007", "NV008"] : ["NV002", "NV003", "NV004", "NV005", "NV006"];
    const off = (idx * 2) % pool.length;
    sched.set(
      day,
      slots.map((shift, i) => ({ shift, emp: pool[(off + i) % pool.length] })),
    );
    idx++;
  }
  return sched;
}

interface GenOrder {
  time: string; // YYYY-MM-DD HH:MM:SS
  emp: string;
  nguon: number;
  pt: number;
  tt: number;
  status: number;
  discount: number;
  note: string | null;
  items: { ma: string; qty: number; price: number }[];
}

function generateOrders(sched: Map<string, Assign[]>): GenOrder[] {
  const rnd = mulberry32(20261112);
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
  const out: GenOrder[] = [];

  for (const day of eachDay(START, SEED_TODAY)) {
    const month = parseInt(day.slice(5, 7), 10) - 1;
    const dow = (new Date(day + "T00:00:00Z").getUTCDay() + 6) % 7; // Mon=0
    const weekend = dow >= 5;
    const count = Math.max(6, Math.round((13 + (weekend ? 5 : 0)) * MONTH_FACTOR[month] + (rnd() * 6 - 3)));
    const isToday = day === SEED_TODAY;
    const todayLimit = 14 * 60; // đơn hôm nay chỉ phát sinh đến 14:00
    const todays = sched.get(day)!;

    const dayOrders: GenOrder[] = [];
    const n = isToday ? Math.round(count * 0.55) : count;
    for (let i = 0; i < n; i++) {
      const r = rnd();
      const shift = r < 0.35 ? 1 : r < 0.65 ? 2 : 3;
      const [, s, e] = SHIFTS[shift - 1];
      const sMin = parseInt(s.slice(0, 2), 10) * 60;
      const eMin = parseInt(e.slice(0, 2), 10) * 60;
      let minute = sMin + Math.floor(rnd() * (eMin - sMin));
      if (isToday) {
        if (sMin >= todayLimit) { i--; continue; }
        minute = Math.min(minute, todayLimit - 1 - Math.floor(rnd() * 30));
      }
      const hh = String(Math.floor(minute / 60)).padStart(2, "0");
      const mm = String(minute % 60).padStart(2, "0");
      const ss = String(Math.floor(rnd() * 60)).padStart(2, "0");

      // Người tạo: nhân viên đang trực ca (có tài khoản), thỉnh thoảng Quản lý
      const onShift = todays.filter((a) => a.shift === (minute < 12 * 60 ? 1 : minute < 17 * 60 ? 2 : 3)).map((a) => a.emp);
      const emp = rnd() < 0.06 ? "NV001" : pick(onShift);

      const sr = rnd();
      const nguon = sr < 0.8 ? 0 : sr < 0.92 ? 1 : 2;
      const pt = nguon === 0 ? (rnd() < 0.55 ? 0 : 1) : 1;

      const lines = new Map<string, number>();
      const kinds = rnd() < 0.5 ? 1 : rnd() < 0.6 ? 2 : rnd() < 0.7 ? 3 : 4;
      const menu: [string, number][] = [["M001", 30], ["M002", 18], ["M003", 14], ["M005", 14], ["M006", 12]];
      if (day < M004_STOP) menu.push(["M004", 12]);
      for (let k = 0; k < kinds; k++) {
        const tot = menu.reduce((a, m) => a + m[1], 0);
        let x = rnd() * tot;
        let code = menu[0][0];
        for (const [c, w] of menu) { if ((x -= w) < 0) { code = c; break; } }
        const qty = rnd() < 0.7 ? 1 : rnd() < 0.8 ? 2 : 3;
        lines.set(code, Math.min(3, (lines.get(code) ?? 0) + qty));
      }
      const items = [...lines].map(([ma, qty]) => ({ ma, qty, price: PRICE.get(ma)! }));
      const total = items.reduce((a, it) => a + it.qty * it.price, 0);

      let discount = 0;
      if (rnd() < 0.08) discount = Math.min(total, rnd() < 0.5 ? 5000 : Math.round((total * 0.1) / 1000) * 1000);

      const cancelled = !isToday && rnd() < 0.04;
      dayOrders.push({
        time: `${day} ${hh}:${mm}:${ss}`,
        emp,
        nguon,
        pt,
        tt: cancelled ? 0 : 1,
        status: cancelled ? 0 : 2,
        discount,
        note: rnd() < 0.1 ? pick(nguon === 0 ? NOTES_DIRECT : NOTES_DELIVERY) : null,
        items,
      });
    }
    dayOrders.sort((a, b) => a.time.localeCompare(b.time));
    // Hôm nay: các đơn gần nhất còn đang thực hiện (đã thanh toán, đang pha chế) hoặc chưa thanh toán
    if (isToday) {
      const l = dayOrders.length;
      dayOrders.forEach((o, i) => {
        if (i >= l - 1) { o.status = 1; o.tt = 0; if (o.nguon !== 0) { o.nguon = 0; } }
        else if (i >= l - 3) { o.status = 1; o.tt = 1; }
        else { o.status = 2; o.tt = 1; }
      });
    }
    out.push(...dayOrders);
  }
  return out;
}

async function bulkInsert(db: Database, table: string, cols: string[], rows: unknown[][], chunk = 400) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params: unknown[] = [];
    const values = part
      .map((r) => `(${r.map((v) => { params.push(v); return `$${params.length}`; }).join(",")})`)
      .join(",");
    await db.query(`INSERT INTO ${table}(${cols.map((c) => `"${c}"`).join(",")}) VALUES ${values}`, params);
  }
}

export async function seedDatabase(db: Database, log: (s: string) => void = () => {}) {
  await initSchema(db);
  await db.exec(
    `TRUNCATE chitiet_donhang, donhang, phancongca, taikhoan, nhanvien, mon, calam RESTART IDENTITY CASCADE`,
  );

  await bulkInsert(db, "nhanvien", ["MaNhanVien", "TenNhanVien", "SDT", "DiaChi", "NgayVaoLam", "TrangThai"],
    EMPLOYEES.map((e) => [...e, 1]));
  const hashes = new Map<string, string>();
  for (const pw of new Set(ACCOUNTS.map((a) => a[4]))) hashes.set(pw, await bcrypt.hash(pw, 10));
  await bulkInsert(db, "taikhoan", ["MaTaiKhoan", "TenDangNhap", "MatKhau", "MaNhanVien", "VaiTro", "TrangThai"],
    ACCOUNTS.map((a) => [a[0], a[1], hashes.get(a[4])!, a[2], a[3], 1]));
  await bulkInsert(db, "mon", ["MaMon", "TenMon", "GiaBan", "TrangThai"], DISHES.map((d) => [...d]));
  await bulkInsert(db, "calam", ["MaCaLam", "GioBatDau", "GioKetThuc"], SHIFTS.map((s) => [...s]));
  await db.query(`SELECT setval(pg_get_serial_sequence('calam','MaCaLam'), 3)`);

  const sched = buildSchedule();
  const assignRows: unknown[][] = [];
  for (const [day, list] of sched) for (const a of list) assignRows.push([a.shift, a.emp, day, 1]);
  await bulkInsert(db, "phancongca", ["MaCaLam", "MaNhanVien", "NgayLam", "TrangThai"], assignRows, 800);
  log(`phancongca: ${assignRows.length}`);

  const orders = generateOrders(sched);
  const orderRows: unknown[][] = [];
  const itemRows: unknown[][] = [];
  orders.forEach((o, i) => {
    const code = "DH" + String(i + 1).padStart(7, "0");
    const total = o.items.reduce((a, it) => a + it.qty * it.price, 0);
    orderRows.push([code, o.emp, o.time, o.nguon, o.pt, o.tt, o.status, total, o.discount, o.note]);
    for (const it of o.items) itemRows.push([code, it.ma, it.qty, it.price]);
  });
  await bulkInsert(db, "donhang",
    ["MaDonHang", "MaNhanVien", "ThoiGianTao", "NguonDonHang", "PhuongThucThanhToan", "TrangThaiThanhToan", "TrangThaiDonHang", "TongTien", "GiamGia", "GhiChu"],
    orderRows, 500);
  await bulkInsert(db, "chitiet_donhang", ["MaDonHang", "MaMon", "SoLuong", "DonGia"], itemRows, 800);
  log(`donhang: ${orderRows.length}, chitiet: ${itemRows.length}`);
}

// Chạy trực tiếp: npm run db:seed
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const db = getDb();
  seedDatabase(db, console.log)
    .then(async () => {
      console.log("Seed hoàn tất.");
      console.log(`Quản lý: quanly / ${DEMO_PASSWORDS.manager}`);
      console.log(`Nhân viên: lan.nv (hoặc minh.nv, hoa.nv, tuan.nv, my.nv) / ${DEMO_PASSWORDS.staff}`);
      await db.close();
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

export { addDays };
