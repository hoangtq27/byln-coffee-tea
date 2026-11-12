import { useState } from "react";
import { CompareBars } from "../components/BarChart";
import { DateInput } from "../components/DateInput";
import { Page } from "../components/Layout";
import { useToast } from "../components/Toast";
import { ApiError, get } from "../lib/api";
import { formatVnd } from "../lib/format";

interface Period {
  label: string;
  tongDoanhThu: number;
  soDonHang: number;
}
interface Compare {
  ky1: Period;
  ky2: Period;
  chenhLech: number;
  tangTruong: number;
}

export default function RevenueCompare() {
  const toast = useToast();
  const [f1, setF1] = useState("");
  const [t1, setT1] = useState("");
  const [f2, setF2] = useState("");
  const [t2, setT2] = useState("");
  const [data, setData] = useState<Compare | null>(null);
  const [errs, setErrs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const run = async () => {
    const e = { f1: !f1, t1: !t1, f2: !f2, t2: !t2 };
    setErrs(e);
    if (Object.values(e).some(Boolean)) {
      toast.error("Vui lòng chọn đầy đủ khoảng thời gian!");
      return;
    }
    if (f1 > t1 || f2 > t2) {
      setErrs({ f1: f1 > t1, t1: f1 > t1, f2: f2 > t2, t2: f2 > t2 });
      toast.error("Ngày bắt đầu không được lớn hơn ngày kết thúc!");
      return;
    }
    setLoading(true);
    try {
      setData(await get<Compare>("/revenue/compare", { from1: f1, to1: t1, from2: f2, to2: t2 }));
    } catch (err) {
      setData(null);
      toast.error(err instanceof ApiError ? err.message : "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau!");
    } finally {
      setLoading(false);
    }
  };

  const up = data ? data.chenhLech >= 0 : true;
  const pct = data ? `${data.tangTruong >= 0 ? "+" : ""}${data.tangTruong.toFixed(1).replace(".", ",")}%` : "";

  return (
    <Page crumbs={["Quản lý doanh thu", "So sánh dữ liệu doanh thu"]} title="So sánh dữ liệu doanh thu">
      <section className="card">
        <div className="card-title">Thiết lập khoảng thời gian</div>
        <div className="filters">
          <div className="field-col">
            <label>Kỳ 1 · Từ ngày</label>
            <DateInput value={f1} onChange={setF1} error={errs.f1} />
          </div>
          <div className="field-col">
            <label>Đến ngày</label>
            <DateInput value={t1} onChange={setT1} error={errs.t1} />
          </div>
          <div className="field-col">
            <label>Kỳ 2 · Từ ngày</label>
            <DateInput value={f2} onChange={setF2} error={errs.f2} />
          </div>
          <div className="field-col">
            <label>Đến ngày</label>
            <DateInput value={t2} onChange={setT2} error={errs.t2} />
          </div>
          <button type="button" className="btn btn-primary" disabled={loading} onClick={run}>
            So sánh
          </button>
        </div>
      </section>

      {data && (
        <>
          <section className="card">
            <div className="card-title">Đối chiếu doanh thu</div>
            <CompareBars
              items={[
                { label: `Kỳ 1 · ${data.ky1.label}`, value: data.ky1.tongDoanhThu },
                { label: `Kỳ 2 · ${data.ky2.label}`, value: data.ky2.tongDoanhThu },
              ]}
            />
          </section>
          <div className="stat-grid">
            <div className="stat"><div className="stat-label">Kỳ 1 · {data.ky1.label}</div><div className="stat-value">{formatVnd(data.ky1.tongDoanhThu)}</div></div>
            <div className="stat"><div className="stat-label">Kỳ 2 · {data.ky2.label}</div><div className="stat-value">{formatVnd(data.ky2.tongDoanhThu)}</div></div>
            <div className="stat">
              <div className="stat-label">Chênh lệch</div>
              <div className={`stat-value ${up ? "text-green" : "text-red"}`}>{`${up ? "+" : "−"}${formatVnd(Math.abs(data.chenhLech))}`}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Tăng trưởng</div>
              <div className={`stat-value ${up ? "text-green" : "text-red"}`}>{pct}</div>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
