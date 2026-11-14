import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { newMemoryDb, setDb } from "../src/db.js";
import { seedDatabase, DEMO_PASSWORDS } from "../db/seed.js";

process.env.NODE_ENV = "test";
const app = createApp();
let mgr = "";
let staff = "";
const A = (t: string) => ({ Authorization: `Bearer ${t}` });

async function login(u: string, p: string) {
  return request(app).post("/api/auth/login").send({ tenDangNhap: u, matKhau: p });
}

beforeAll(async () => {
  const db = newMemoryDb();
  setDb(db);
  await seedDatabase(db);
  mgr = (await login("quanly", DEMO_PASSWORDS.manager)).body.token;
  staff = (await login("lan.nv", DEMO_PASSWORDS.staff)).body.token;
}, 120000);

describe("Đăng nhập", () => {
  it("thiếu thông tin", async () => {
    const r = await login("", "");
    expect(r.status).toBe(400);
    expect(r.body.fields.tenDangNhap).toBe("Vui lòng nhập đầy đủ thông tin");
  });
  it("sai mật khẩu", async () => {
    const r = await login("quanly", "sai");
    expect(r.status).toBe(401);
    expect(r.body.message).toBe("Tên đăng nhập hoặc mật khẩu sai!");
  });
  it("tên đăng nhập không tồn tại -> 401 (không lỗi 500)", async () => {
    const r = await login("khong.ton.tai", "abc");
    expect(r.status).toBe(401);
    expect(r.body.message).toBe("Tên đăng nhập hoặc mật khẩu sai!");
  });
  it("vai trò", async () => {
    expect((await login("quanly", DEMO_PASSWORDS.manager)).body.user.role).toBe("manager");
    expect((await login("lan.nv", DEMO_PASSWORDS.staff)).body.user.role).toBe("staff");
  });
  it("tài khoản bị khóa", async () => {
    await request(app).post("/api/accounts").set(A(mgr)).send({ tenDangNhap: "khoa.nv", matKhau: "Abc@123", maNhanVien: "NV007", vaiTro: "staff", trangThai: 0 }).expect(201);
    const r = await login("khoa.nv", "Abc@123");
    expect(r.status).toBe(403);
    expect(r.body.message).toBe("Tài khoản này đã bị khóa. Không thể đăng nhập!");
  });
});

describe("Phân quyền", () => {
  it("không token -> 401", async () => {
    await request(app).get("/api/orders").expect(401);
  });
  it("nhân viên bị chặn các chức năng quản lý", async () => {
    for (const p of ["/api/revenue/report?from=2026-10-01&to=2026-10-31", "/api/employees", "/api/accounts", "/api/shifts?from=2026-11-01&to=2026-11-07"])
      await request(app).get(p).set(A(staff)).expect(403);
    await request(app).post("/api/dishes").set(A(staff)).send({ tenMon: "X", giaBan: 1000 }).expect(403);
    await request(app).put("/api/dishes/M001").set(A(staff)).send({ tenMon: "X", giaBan: 1 }).expect(403);
    await request(app).delete("/api/dishes/M001").set(A(staff)).expect(403);
  });
});

describe("Tìm kiếm món", () => {
  it("không phân biệt hoa/thường và dấu", async () => {
    for (const q of ["cà phê", "CA PHE", "ca phe sua", "  BẠC  xỉu ", "bac xiu", "matcha"]) {
      const r = await request(app).get("/api/dishes").query({ q }).set(A(staff)).expect(200);
      expect(r.body.items.length, q).toBeGreaterThan(0);
    }
    const r = await request(app).get("/api/dishes").query({ q: "tra dao" }).set(A(staff));
    expect(r.body.items.map((d: any) => d.maMon)).toEqual(["M004"]);
  });
  it("không có kết quả / ký tự đặc biệt không lỗi", async () => {
    for (const q of ["zzz", "%", "_", "'; DROP TABLE mon;--"]) {
      const r = await request(app).get("/api/dishes").query({ q }).set(A(staff)).expect(200);
      expect(r.body.items).toEqual([]);
    }
    expect((await request(app).get("/api/dishes").set(A(staff))).body.items).toHaveLength(6);
  });
});

describe("Quản lý món", () => {
  it("validate", async () => {
    let r = await request(app).post("/api/dishes").set(A(mgr)).send({ tenMon: " ", giaBan: "" });
    expect(r.body.fields).toEqual({ tenMon: "Vui lòng nhập tên món!", giaBan: "Vui lòng nhập giá bán!" });
    r = await request(app).post("/api/dishes").set(A(mgr)).send({ tenMon: "A", giaBan: "abc" });
    expect(r.body.fields.giaBan).toBe("Giá bán phải là số lớn hơn 0!");
    r = await request(app).post("/api/dishes").set(A(mgr)).send({ tenMon: "A", giaBan: -5 });
    expect(r.body.fields.giaBan).toBe("Giá bán phải là số lớn hơn 0!");
  });
  it("thêm / sửa / xóa; món đã có đơn không xóa được", async () => {
    const c = await request(app).post("/api/dishes").set(A(mgr)).send({ tenMon: "Trà vải", giaBan: "40000" }).expect(201);
    expect(c.body.item.maMon).toBe("M007");
    await request(app).put("/api/dishes/M007").set(A(mgr)).send({ tenMon: "Trà vải", giaBan: 41000, trangThai: 0 }).expect(200);
    await request(app).delete("/api/dishes/M007").set(A(mgr)).expect(200);
    await request(app).delete("/api/dishes/M001").set(A(mgr)).expect(409);
    const d = await request(app).post("/api/dishes/M002/discontinue").set(A(mgr)).expect(200);
    expect(d.body.item.trangThai).toBe(0);
    await request(app).put("/api/dishes/M002").set(A(mgr)).send({ tenMon: "Bạc xỉu", giaBan: 38000, trangThai: 1 }).expect(200);
  });
});

describe("Đơn hàng", () => {
  it("tìm kiếm theo mã (không phân biệt hoa/thường, khớp một phần)", async () => {
    const all = await request(app).get("/api/orders").set(A(staff)).expect(200);
    expect(all.body.total).toBeGreaterThan(3000);
    expect(all.body.items).toHaveLength(100);
    const one = await request(app).get("/api/orders").query({ q: "dh0000009" }).set(A(staff));
    expect(one.body.items.map((o: any) => o.maDonHang)).toEqual(["DH0000009"]);
    const part = await request(app).get("/api/orders").query({ q: "0000009" }).set(A(staff));
    expect(part.body.total).toBe(1);
    expect((await request(app).get("/api/orders").query({ q: "KHONG_CO" }).set(A(staff))).body.total).toBe(0);
    expect((await request(app).get("/api/orders").query({ q: "%" }).set(A(staff))).body.total).toBe(0);
    const page2 = await request(app).get("/api/orders").query({ limit: 100, offset: 100 }).set(A(staff));
    expect(page2.body.items[0].maDonHang).not.toBe(all.body.items[0].maDonHang);
  });

  it("dữ liệu mẫu nhất quán: tổng tiền = tổng chi tiết, giảm giá hợp lệ", async () => {
    const o = (await request(app).get("/api/orders").query({ q: "DH0001234" }).set(A(mgr))).body.items[0];
    const d = await request(app).get(`/api/orders/${o.maDonHang}`).set(A(mgr));
    const sum = d.body.items.reduce((s: number, i: any) => s + i.thanhTien, 0);
    expect(sum).toBe(o.tongTien);
    expect(o.tongThanhToan).toBe(o.tongTien - o.giamGia);
  });

  it("tạo đơn: validate số lượng", async () => {
    let r = await request(app).post("/api/orders").set(A(staff)).send({ items: [{ maMon: "M001", soLuong: "" }] });
    expect(r.body.fields["items.0.soLuong"]).toBe("Vui lòng nhập số lượng!");
    for (const q of [0, -1, 1.5, "abc"]) {
      r = await request(app).post("/api/orders").set(A(staff)).send({ items: [{ maMon: "M001", soLuong: q }] });
      expect(r.body.fields["items.0.soLuong"], String(q)).toBe("Số lượng phải là số nguyên lớn hơn 0!");
    }
    r = await request(app).post("/api/orders").set(A(staff)).send({ items: [] });
    expect(r.status).toBe(400);
    r = await request(app).post("/api/orders").set(A(staff)).send({ items: [{ maMon: "M004", soLuong: 1 }] });
    expect(r.body.message).toBe("Món đã ngừng kinh doanh. Vui lòng chọn món khác!");
  });

  let code = "";
  it("tạo đơn có giảm giá; giá lấy từ hệ thống", async () => {
    const next = (await request(app).get("/api/orders/next-code").set(A(staff))).body.maDonHang;
    const r = await request(app)
      .post("/api/orders")
      .set(A(staff))
      .send({ items: [{ maMon: "M001", soLuong: 2, donGia: 1 }, { maMon: "M005", soLuong: 1 }], giamGia: 9000, nguon: 0, phuongThuc: 0, thanhToan: 0 });
    expect(r.status).toBe(201);
    code = r.body.maDonHang;
    expect(code).toBe(next);
    const d = (await request(app).get(`/api/orders/${code}`).set(A(staff))).body;
    expect(d.order.tongTien).toBe(109000);
    expect(d.order.giamGia).toBe(9000);
    expect(d.order.tongThanhToan).toBe(100000);
    expect(d.order.maNhanVien).toBe("NV002");
    expect(d.order.trangThaiDon).toBe(1);
  });
  it("giảm giá không vượt tổng tiền", async () => {
    const r = await request(app).post("/api/orders").set(A(staff)).send({ items: [{ maMon: "M001", soLuong: 1 }], giamGia: 99999 });
    expect(r.status).toBe(400);
    expect(r.body.fields.giamGia).toBeTruthy();
  });
  it("đơn nền tảng ngoài luôn chuyển khoản", async () => {
    const r = await request(app).post("/api/orders").set(A(staff)).send({ items: [{ maMon: "M001", soLuong: 1 }], nguon: 1, phuongThuc: 0, thanhToan: 1 });
    const d = (await request(app).get(`/api/orders/${r.body.maDonHang}`).set(A(staff))).body;
    expect(d.order.phuongThuc).toBe(1);
  });

  it("nhân viên sửa đơn chưa thanh toán", async () => {
    await request(app).put(`/api/orders/${code}`).set(A(staff)).send({ items: [{ maMon: "M001", soLuong: 3 }], giamGia: 0, thanhToan: 1 }).expect(200);
    const d = (await request(app).get(`/api/orders/${code}`).set(A(staff))).body;
    expect(d.order.tongTien).toBe(96000);
    expect(d.order.thanhToan).toBe(1);
  });
  it("đơn đã thanh toán: nhân viên chỉ chuyển được sang Hoàn thành", async () => {
    await request(app).put(`/api/orders/${code}`).set(A(staff)).send({ items: [{ maMon: "M001", soLuong: 1 }] }).expect(403);
    await request(app).put(`/api/orders/${code}`).set(A(staff)).send({ trangThaiDon: 0 }).expect(400);
    await request(app).put(`/api/orders/${code}`).set(A(staff)).send({ trangThaiDon: 2 }).expect(200);
    expect((await request(app).get(`/api/orders/${code}`).set(A(staff))).body.order.trangThaiDon).toBe(2);
  });
  it("quản lý sửa được đơn đã thanh toán", async () => {
    await request(app).put(`/api/orders/${code}`).set(A(mgr)).send({ items: [{ maMon: "M001", soLuong: 1 }], thanhToan: 1, trangThaiDon: 2, giamGia: 2000 }).expect(200);
    const d = (await request(app).get(`/api/orders/${code}`).set(A(mgr))).body;
    expect(d.order.tongThanhToan).toBe(30000);
  });
  it("không tìm thấy", async () => {
    await request(app).get("/api/orders/DH9999999").set(A(staff)).expect(404);
  });
});

describe("Doanh thu", () => {
  it("báo cáo nhất quán: tổng = tiền mặt + chuyển khoản = tổng biểu đồ", async () => {
    const r = await request(app).get("/api/revenue/report").query({ from: "2026-10-01", to: "2026-10-31", granularity: "day" }).set(A(mgr)).expect(200);
    const b = r.body;
    expect(b.tongDoanhThu).toBe(b.tienMat + b.chuyenKhoan);
    expect(b.chart).toHaveLength(31);
    expect(b.chart.reduce((s: number, c: any) => s + c.value, 0)).toBe(b.tongDoanhThu);
    expect(b.monBanChay.length).toBe(5);
    const q = b.monBanChay.map((m: any) => m.soLuong);
    expect([...q].sort((x, y) => y - x)).toEqual(q);
    for (const g of ["week", "month", "year"]) {
      const x = await request(app).get("/api/revenue/report").query({ from: "2026-01-01", to: "2026-11-30", granularity: g }).set(A(mgr));
      expect(x.body.chart.reduce((s: number, c: any) => s + c.value, 0)).toBe(x.body.tongDoanhThu);
    }
  });
  it("tổng các tháng = tổng cả năm", async () => {
    let sum = 0;
    for (let m = 1; m <= 12; m++) {
      const last = new Date(Date.UTC(2026, m, 0)).getUTCDate();
      const r = await request(app).get("/api/revenue/report").query({ from: `2026-${String(m).padStart(2, "0")}-01`, to: `2026-${String(m).padStart(2, "0")}-${last}` }).set(A(mgr));
      sum += r.body.tongDoanhThu;
    }
    const y = await request(app).get("/api/revenue/report").query({ from: "2026-01-01", to: "2026-12-31", granularity: "month" }).set(A(mgr));
    expect(sum).toBe(y.body.tongDoanhThu);
  });
  it("món M004 không xuất hiện sau khi ngừng bán", async () => {
    const r = await request(app).get("/api/revenue/report").query({ from: "2026-10-01", to: "2026-11-12" }).set(A(mgr));
    expect(r.body.monBanChay.find((m: any) => m.maMon === "M004")).toBeUndefined();
  });
  it("validate ngày", async () => {
    const r = await request(app).get("/api/revenue/report").query({ from: "2026-10-27", to: "2026-10-12" }).set(A(mgr));
    expect(r.status).toBe(400);
    expect(r.body.message).toBe("Ngày bắt đầu không được lớn hơn ngày kết thúc!");
    expect((await request(app).get("/api/revenue/report").set(A(mgr))).status).toBe(400);
  });
  it("so sánh: chênh lệch = kỳ 2 - kỳ 1, tăng trưởng %", async () => {
    const r = await request(app).get("/api/revenue/compare").query({ from1: "2026-09-01", to1: "2026-09-30", from2: "2026-10-01", to2: "2026-10-31" }).set(A(mgr)).expect(200);
    const b = r.body;
    expect(b.ky1.label).toBe("Tháng 9");
    expect(b.ky2.label).toBe("Tháng 10");
    expect(b.chenhLech).toBe(b.ky2.tongDoanhThu - b.ky1.tongDoanhThu);
    expect(b.tangTruong).toBeCloseTo((b.chenhLech / b.ky1.tongDoanhThu) * 100, 6);
    const p1 = await request(app).get("/api/revenue/report").query({ from: "2026-09-01", to: "2026-09-30" }).set(A(mgr));
    expect(b.ky1.tongDoanhThu).toBe(p1.body.tongDoanhThu);
  });
  it("so sánh: thiếu dữ liệu / sai ngày", async () => {
    let r = await request(app).get("/api/revenue/compare").query({ from1: "2025-01-01", to1: "2025-01-31", from2: "2026-10-01", to2: "2026-10-31" }).set(A(mgr));
    expect(r.body.message).toBe("Không có đủ dữ liệu doanh thu để thực hiện so sánh!");
    r = await request(app).get("/api/revenue/compare").query({ from1: "2026-09-30", to1: "2026-09-01", from2: "2026-10-01", to2: "2026-10-31" }).set(A(mgr));
    expect(r.body.message).toBe("Ngày bắt đầu không được lớn hơn ngày kết thúc!");
    r = await request(app).get("/api/revenue/compare").query({ from1: "2026-09-01" }).set(A(mgr));
    expect(r.status).toBe(400);
  });
  it("đơn hủy / chưa thanh toán không tính doanh thu", async () => {
    const before = (await request(app).get("/api/revenue/report").query({ from: "2026-11-12", to: "2026-11-12" }).set(A(mgr))).body;
    const c = await request(app).post("/api/orders").set(A(staff)).send({ items: [{ maMon: "M001", soLuong: 1 }], thanhToan: 0 });
    const after = (await request(app).get("/api/revenue/report").query({ from: "2026-11-12", to: "2026-11-12" }).set(A(mgr))).body;
    expect(after.tongDoanhThu).toBe(before.tongDoanhThu);
    expect(c.status).toBe(201);
  });
});

describe("Nhân viên", () => {
  it("thêm: bắt buộc, trùng SĐT, sai định dạng", async () => {
    let r = await request(app).post("/api/employees").set(A(mgr)).send({ tenNhanVien: "", sdt: "" });
    expect(r.body.fields).toEqual({ tenNhanVien: "Vui lòng nhập đầy đủ thông tin!", sdt: "Vui lòng nhập đầy đủ thông tin!" });
    r = await request(app).post("/api/employees").set(A(mgr)).send({ tenNhanVien: "Test", sdt: "0901234567" });
    expect(r.body.message).toBe("Thông tin nhân viên không hợp lệ. Vui lòng kiểm tra lại!");
    r = await request(app).post("/api/employees").set(A(mgr)).send({ tenNhanVien: "Test", sdt: "09abc" });
    expect(r.status).toBe(400);
    r = await request(app).post("/api/employees").set(A(mgr)).send({ tenNhanVien: "Hồ Mới", sdt: "0911111111", diaChi: "Đà Nẵng", ngayVaoLam: "2026-11-12" });
    expect(r.status).toBe(201);
    expect(r.body.maNhanVien).toBe("NV009");
  });
  it("sửa: trùng SĐT nhân viên khác, giữ SĐT của chính mình", async () => {
    let r = await request(app).put("/api/employees/NV009").set(A(mgr)).send({ tenNhanVien: "Hồ Mới", sdt: "0902345678" });
    expect(r.status).toBe(409);
    r = await request(app).put("/api/employees/NV009").set(A(mgr)).send({ tenNhanVien: "Hồ Mới 2", sdt: "0911111111", trangThai: 1 });
    expect(r.status).toBe(200);
    r = await request(app).put("/api/employees/NV009").set(A(mgr)).send({ tenNhanVien: "", sdt: "0911111111" });
    expect(r.body.fields.tenNhanVien).toBe("Vui lòng nhập đầy đủ thông tin bắt buộc!");
  });
  it("xóa: chặn khi đã có đơn/tài khoản, chuyển nghỉ làm, xóa được khi chưa phát sinh", async () => {
    await request(app).delete("/api/employees/NV002").set(A(mgr)).expect(409);
    await request(app).post("/api/employees/NV008/deactivate").set(A(mgr)).expect(200);
    await request(app).delete("/api/employees/NV009").set(A(mgr)).expect(200);
  });
});

describe("Tài khoản", () => {
  it("validate", async () => {
    const mk = (o: object) => request(app).post("/api/accounts").set(A(mgr)).send({ tenDangNhap: "newacc", matKhau: "Abc@123", maNhanVien: "NV007", vaiTro: "staff", ...o });
    expect((await mk({ tenDangNhap: "" })).body.fields.tenDangNhap).toBe("Vui lòng nhập tên đăng nhập!");
    expect((await mk({ matKhau: "" })).body.fields.matKhau).toBe("Vui lòng nhập mật khẩu!");
    expect((await mk({ tenDangNhap: "quanly" })).body.fields.tenDangNhap).toBe("Tên đăng nhập đã tồn tại!");
    for (const p of ["abc", "abcdefg", "a@" + "x".repeat(60)]) expect((await mk({ matKhau: p })).body.fields.matKhau, p).toBe("Mật khẩu không đạt yêu cầu!");
    expect((await mk({ maNhanVien: "NV002" })).body.fields.maNhanVien).toBe("Nhân viên này đã có tài khoản!");
    expect((await mk({ tenDangNhap: "x".repeat(21) })).status).toBe(400);
  });
  it("tài khoản không thuộc nhân viên nào", async () => {
    const c = await request(app).post("/api/accounts").set(A(mgr)).send({ tenDangNhap: "khach.ql", matKhau: "Abc@123", maNhanVien: "", vaiTro: "manager" });
    expect(c.status).toBe(201);
    const c2 = await request(app).post("/api/accounts").set(A(mgr)).send({ tenDangNhap: "khach2", matKhau: "Abc@123", vaiTro: "staff" });
    expect(c2.status).toBe(201);
    const list = (await request(app).get("/api/accounts").set(A(mgr))).body.items;
    expect(list.find((a: any) => a.tenDangNhap === "khach.ql").maNhanVien).toBeNull();
    const l = await login("khach.ql", "Abc@123");
    expect(l.status).toBe(200);
    expect(l.body.user.maNhanVien).toBeNull();
    await request(app).get("/api/revenue/report").query({ from: "2026-10-01", to: "2026-10-31" }).set(A(l.body.token)).expect(200);
    const o = await request(app).post("/api/orders").set(A(l.body.token)).send({ items: [{ maMon: "M001", soLuong: 1 }] });
    expect(o.status).toBe(403);
    // gắn lại nhân viên rồi bỏ gắn khi sửa
    const ma = list.find((a: any) => a.tenDangNhap === "khach2").maTaiKhoan;
    await request(app).put(`/api/accounts/${ma}`).set(A(mgr)).send({ tenDangNhap: "khach2", maNhanVien: "NV008", vaiTro: "staff", trangThai: 1 }).expect(200);
    await request(app).put(`/api/accounts/${ma}`).set(A(mgr)).send({ tenDangNhap: "khach2", maNhanVien: null, vaiTro: "staff", trangThai: 1 }).expect(200);
    // khóa lại để "quanly" vẫn là Quản lý hoạt động duy nhất cho các test sau
    const qlMa = list.find((a: any) => a.tenDangNhap === "khach.ql").maTaiKhoan;
    await request(app).post(`/api/accounts/${qlMa}/lock`).set(A(mgr)).expect(200);
  });
  it("không xóa chính mình; sửa chính mình -> forceLogout; không bỏ quản lý cuối", async () => {
    const r = await request(app).delete("/api/accounts/TK001").set(A(mgr));
    expect(r.body.message).toBe("Không thể xóa tài khoản này!");
    const u = await request(app).put("/api/accounts/TK001").set(A(mgr)).send({ tenDangNhap: "quanly", maNhanVien: "NV001", vaiTro: "manager", trangThai: 1, matKhau: "Quanly@123" });
    expect(u.body.forceLogout).toBe(true);
    const d = await request(app).put("/api/accounts/TK001").set(A(mgr)).send({ tenDangNhap: "quanly", maNhanVien: "NV001", vaiTro: "staff", trangThai: 1 });
    expect(d.status).toBe(409);
  });
  it("khóa tài khoản làm token nhân viên mất hiệu lực", async () => {
    const t = (await login("my.nv", DEMO_PASSWORDS.staff)).body.token;
    await request(app).get("/api/orders").set(A(t)).expect(200);
    await request(app).post("/api/accounts/TK006/lock").set(A(mgr)).expect(200);
    await request(app).get("/api/orders").set(A(t)).expect(401);
  });
});

describe("Ca làm", () => {
  it("xem theo khoảng; mỗi ca 2 nhân viên, không trùng người trong ngày", async () => {
    const r = await request(app).get("/api/shifts").query({ from: "2026-11-09", to: "2026-11-15" }).set(A(mgr)).expect(200);
    expect(r.body.items.length).toBe(7 * 6);
    const key = new Map<string, number>();
    for (const i of r.body.items) key.set(`${i.ngayLam}|${i.maCaLam}`, (key.get(`${i.ngayLam}|${i.maCaLam}`) ?? 0) + 1);
    expect([...key.values()].every((n) => n === 2)).toBe(true);
  });
  it("lập lịch: validate theo thứ tự SDD", async () => {
    const mk = (o: object) => request(app).post("/api/shifts").set(A(mgr)).send({ from: "2026-11-20", to: "2026-11-20", gioBatDau: "07:00", gioKetThuc: "12:00", employees: ["NV003", "NV004"], ...o });
    expect((await mk({ from: undefined, to: undefined })).body.message).toBe("Vui lòng chọn thời gian cần lập lịch!");
    expect((await mk({ gioBatDau: "12:00", gioKetThuc: "08:00" })).body.message).toBe("Thời gian không hợp lệ. Vui lòng nhập lại!");
    expect((await mk({ gioBatDau: "06:00" })).body.message).toBe("Thời gian không hợp lệ. Vui lòng nhập lại!");
    expect((await mk({ gioKetThuc: "22:30" })).body.message).toBe("Thời gian không hợp lệ. Vui lòng nhập lại!");
    expect((await mk({ employees: [] })).body.message).toBe("Chưa có nhân viên được chọn!");
    expect((await mk({ employees: ["NV999"] })).status).toBe(400);
  });
  it("lập lịch, trùng lịch, quá 2 người, sửa ca", async () => {
    const mk = (o: object) => request(app).post("/api/shifts").set(A(mgr)).send({ from: "2026-11-20", to: "2026-11-21", gioBatDau: "07:00", gioKetThuc: "12:00", employees: ["NV003", "NV004"], ...o });
    expect((await mk({})).status).toBe(201);
    expect((await mk({ gioBatDau: "10:00", gioKetThuc: "14:00", employees: ["NV003"] })).body.message).toBe("Lịch làm việc bị trùng!");
    expect((await mk({ employees: ["NV005"] })).body.message).toBe("Mỗi ca làm chỉ có tối đa 2 nhân viên!");
    // ca 12-17 cùng người: không trùng (liền kề)
    expect((await mk({ gioBatDau: "12:00", gioKetThuc: "17:00", employees: ["NV003"] })).status).toBe(201);
    // sửa: thay NV004 bằng NV005 ở ca 1 ngày 20/11
    const e = await request(app).put("/api/shifts/1/2026-11-20").set(A(mgr)).send({ gioBatDau: "07:00", gioKetThuc: "12:00", remove: ["NV004"], add: ["NV005"] });
    expect(e.status).toBe(200);
    const v = (await request(app).get("/api/shifts").query({ from: "2026-11-20", to: "2026-11-20" }).set(A(mgr))).body.items;
    expect(v.find((i: any) => i.maNhanVien === "NV004" && i.maCaLam === 1).trangThai).toBe(2);
    expect(v.find((i: any) => i.maNhanVien === "NV005" && i.maCaLam === 1).trangThai).toBe(1);
  });
});
