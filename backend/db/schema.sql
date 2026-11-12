-- Schema theo SDD (chuyển từ SQL Server sang PostgreSQL / Neon).
-- Ghi chú khác biệt so với SDD:
--  * MatKhau lưu bcrypt hash nên dài hơn VARCHAR(50).
--  * PHANCONGCA: khóa chính (MaCaLam, MaNhanVien, NgayLam) vì một nhân viên làm cùng ca nhiều ngày.
--  * Các cột BIT/TINYINT dùng SMALLINT + CHECK, giữ nguyên quy ước giá trị của SDD.

CREATE TABLE IF NOT EXISTS nhanvien (
  "MaNhanVien"  CHAR(5) PRIMARY KEY,
  "TenNhanVien" VARCHAR(100) NOT NULL,
  "SDT"         VARCHAR(12) NOT NULL UNIQUE,
  "DiaChi"      VARCHAR(200) NOT NULL DEFAULT '',
  "NgayVaoLam"  DATE NULL,
  "TrangThai"   SMALLINT NOT NULL DEFAULT 1 CHECK ("TrangThai" IN (0,1)) -- 0=Nghỉ làm, 1=Còn làm
);

CREATE TABLE IF NOT EXISTS taikhoan (
  "MaTaiKhoan"  CHAR(5) PRIMARY KEY,
  "TenDangNhap" VARCHAR(20) NOT NULL UNIQUE,
  "MatKhau"     VARCHAR(100) NOT NULL,
  "MaNhanVien"  CHAR(5) NOT NULL UNIQUE REFERENCES nhanvien("MaNhanVien"),
  "VaiTro"      SMALLINT NOT NULL CHECK ("VaiTro" IN (0,1)),     -- 0=Quản lý, 1=Nhân viên
  "TrangThai"   SMALLINT NOT NULL DEFAULT 1 CHECK ("TrangThai" IN (0,1)) -- 0=Khóa, 1=Hoạt động
);

CREATE TABLE IF NOT EXISTS calam (
  "MaCaLam"     SERIAL PRIMARY KEY,
  "GioBatDau"   TIME NOT NULL,
  "GioKetThuc"  TIME NOT NULL,
  CHECK ("GioBatDau" < "GioKetThuc"),
  UNIQUE ("GioBatDau", "GioKetThuc")
);

CREATE TABLE IF NOT EXISTS phancongca (
  "MaCaLam"     INT NOT NULL REFERENCES calam("MaCaLam"),
  "MaNhanVien"  CHAR(5) NOT NULL REFERENCES nhanvien("MaNhanVien") ON DELETE CASCADE,
  "NgayLam"     DATE NOT NULL,
  "TrangThai"   SMALLINT NOT NULL DEFAULT 1 CHECK ("TrangThai" IN (0,1,2)), -- 1=Được phân công, 2=Đã đổi, 0=Hủy
  PRIMARY KEY ("MaCaLam", "MaNhanVien", "NgayLam")
);
CREATE INDEX IF NOT EXISTS idx_phancongca_ngay ON phancongca("NgayLam");

CREATE TABLE IF NOT EXISTS mon (
  "MaMon"     CHAR(4) PRIMARY KEY,
  "TenMon"    VARCHAR(200) NOT NULL,
  "GiaBan"    NUMERIC(18,2) NOT NULL CHECK ("GiaBan" >= 0),
  "TrangThai" SMALLINT NOT NULL DEFAULT 1 CHECK ("TrangThai" IN (0,1)) -- 1=Đang bán, 0=Ngừng bán
);

CREATE TABLE IF NOT EXISTS donhang (
  "MaDonHang"           CHAR(9) PRIMARY KEY,
  "MaNhanVien"          CHAR(5) NOT NULL REFERENCES nhanvien("MaNhanVien"),
  "ThoiGianTao"         TIMESTAMP NOT NULL,  -- giờ Việt Nam (không múi giờ)
  "NguonDonHang"        SMALLINT NOT NULL DEFAULT 0 CHECK ("NguonDonHang" IN (0,1,2)), -- 0=Trực tiếp,1=GrabFood,2=ShopeeFood
  "PhuongThucThanhToan" SMALLINT NOT NULL DEFAULT 0 CHECK ("PhuongThucThanhToan" IN (0,1)), -- 0=Tiền mặt,1=Chuyển khoản
  "TrangThaiThanhToan"  SMALLINT NOT NULL DEFAULT 0 CHECK ("TrangThaiThanhToan" IN (0,1)), -- 0=Chưa,1=Đã
  "TrangThaiDonHang"    SMALLINT NOT NULL DEFAULT 1 CHECK ("TrangThaiDonHang" IN (0,1,2)), -- 1=Đang thực hiện,2=Hoàn thành,0=Hủy
  "TongTien"            NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK ("TongTien" >= 0),
  "GiamGia"             NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK ("GiamGia" >= 0),
  "TongThanhToan"       NUMERIC(18,2) GENERATED ALWAYS AS ("TongTien" - "GiamGia") STORED,
  "GhiChu"              VARCHAR(200) NULL,
  CHECK ("GiamGia" <= "TongTien")
);
CREATE INDEX IF NOT EXISTS idx_donhang_time ON donhang("ThoiGianTao");

CREATE TABLE IF NOT EXISTS chitiet_donhang (
  "MaDonHang" CHAR(9) NOT NULL REFERENCES donhang("MaDonHang") ON DELETE CASCADE,
  "MaMon"     CHAR(4) NOT NULL REFERENCES mon("MaMon"),
  "SoLuong"   SMALLINT NOT NULL CHECK ("SoLuong" > 0),
  "DonGia"    NUMERIC(18,2) NOT NULL CHECK ("DonGia" >= 0),
  "ThanhTien" NUMERIC(18,2) GENERATED ALWAYS AS ("SoLuong" * "DonGia") STORED,
  PRIMARY KEY ("MaDonHang", "MaMon")
);
