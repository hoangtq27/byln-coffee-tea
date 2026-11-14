import { useCallback, useState } from "react";
import { BarChart } from "../components/BarChart";
import { DateInput } from "../components/DateInput";
import { Page } from "../components/Layout";
import { useToast } from "../components/Toast";
import { ApiError, get } from "../lib/api";
import { formatVnd, monthEnd, monthStart, todayIso } from "../lib/format";

type Gran = "day" | "week" | "month" | "year";
const GRANS: { v: Gran; label: string }[] = [
  { v: "day", label: "Ngày" },
  { v: "week", label: "Tuần" },
  { v: "month", label: "Tháng" },
  { v: "year", label: "Năm" },
];

interface Report {
  tongDoanhThu: number;
  soDonHang: number;
  tienMat: number;
  chuyenKhoan: number;
  chart: { label: string; value: number }[];
  monBanChay: { maMon: string; tenMon: string; soLuong: number }[];
}

export default function RevenueReport() {
  const toast = useToast();
  const [gran, setGran] = useState<Gran>("day");
  const [from, setFrom] = useState(monthStart(todayIso()));
  const [to, setTo] = useState(monthEnd(todayIso()));
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(
    async (f: string, t: string, g: Gran) => {
      if (!f || !t) {
        toast.error("Vui lòng chọn đầy đủ khoảng thời gian!");
        return;
      }
      if (f > t) {
        toast.error("Ngày bắt đầu không được lớn hơn ngày kết thúc!");
        return;
      }
      setLoading(true);
      try {
        setData(await get<Report>("/revenue/report", { from: f, to: t, granularity: g }));
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau!");
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  // Kết quả báo cáo chỉ hiển thị sau khi người dùng bấm "Xem báo cáo" (UC 4.1 bước 5-6).

  return (
    <Page crumbs={["Quản lý doanh thu", "Báo cáo doanh thu"]} title="Báo cáo doanh thu">
      <section className="card">
        <div className="card-title">Khoảng thời gian</div>
        <div className="filters">
          <div className="seg">
            {GRANS.map((g) => (
              <button key={g.v} type="button" className={`seg-btn${gran === g.v ? " on" : ""}`} onClick={() => setGran(g.v)}>
                {g.label}
              </button>
            ))}
          </div>
          <div className="field-col">
            <label>Ngày bắt đầu</label>
            <DateInput value={from} onChange={setFrom} />
          </div>
          <div className="field-col">
            <label>Ngày kết thúc</label>
            <DateInput value={to} onChange={setTo} />
          </div>
          <button type="button" className="btn btn-primary" disabled={loading} onClick={() => run(from, to, gran)}>
            Xem báo cáo
          </button>
        </div>
      </section>

      {data && (
        <div className="reveal stack">
          <div className="stat-grid">
            <div className="stat"><div className="stat-label">Tổng doanh thu</div><div className="stat-value">{formatVnd(data.tongDoanhThu)}</div></div>
            <div className="stat"><div className="stat-label">Số đơn hàng</div><div className="stat-value">{data.soDonHang.toLocaleString("vi-VN")}</div></div>
            <div className="stat"><div className="stat-label">Tiền mặt</div><div className="stat-value">{formatVnd(data.tienMat)}</div></div>
            <div className="stat"><div className="stat-label">Chuyển khoản</div><div className="stat-value">{formatVnd(data.chuyenKhoan)}</div></div>
          </div>
          <div className="report-grid">
            <section className="card">
              <div className="card-title">Biểu đồ doanh thu</div>
              <BarChart data={data.chart} />
            </section>
            <section className="card">
              <div className="card-title">Món bán chạy</div>
              {data.monBanChay.length === 0 ? (
                <div className="muted">Chưa có dữ liệu</div>
              ) : (
                <ol className="top-list">
                  {data.monBanChay.map((m, i) => (
                    <li key={m.maMon}>
                      <span className="rank">{i + 1}</span>
                      <span className="grow">{m.tenMon}</span>
                      <b>{m.soLuong.toLocaleString("vi-VN")} ly</b>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
      )}
    </Page>
  );
}
