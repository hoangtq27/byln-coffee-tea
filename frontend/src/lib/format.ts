export const formatVnd = (n: number): string => `${Math.round(n).toLocaleString("vi-VN")} đ`;

/** "2026-11-12" -> "12/11/2026" */
export const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

/** "2026-11-12T09:05:03" -> "09:05:03 12/11/2026" */
export const formatDateTime = (iso: string): string => `${iso.slice(11, 19)} ${formatDate(iso)}`;

/** "12/11/2026" -> "2026-11-12" (null nếu không hợp lệ) */
export function parseDisplayDate(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export const pad2 = (n: number) => String(n).padStart(2, "0");
export const toIso = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

export function todayIso(): string {
  const d = new Date();
  return toIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
export const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
export function monthEnd(iso: string): string {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7));
  return toIso(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate());
}
export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
export function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDaysIso(iso, -dow);
}

export const NGUON = ["Trực tiếp", "GrabFood", "ShopeeFood"] as const;
export const PHUONG_THUC = ["Tiền mặt", "Chuyển khoản"] as const;
export const TRANG_THAI_DON: Record<number, string> = { 1: "Đang thực hiện", 2: "Hoàn thành", 0: "Hủy" };

export interface OrderSummary {
  maDonHang: string;
  maNhanVien: string;
  thoiGianTao: string;
  nguon: number;
  phuongThuc: number;
  thanhToan: number;
  trangThaiDon: number;
  tongTien: number;
  giamGia: number;
  tongThanhToan: number;
  ghiChu: string;
}
export interface OrderItem {
  maMon: string;
  tenMon: string;
  soLuong: number;
  donGia: number;
  thanhTien: number;
}
export interface Dish {
  maMon: string;
  tenMon: string;
  giaBan: number;
  trangThai: number;
}
