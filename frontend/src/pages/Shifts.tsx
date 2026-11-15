import { useCallback, useEffect, useMemo, useState } from "react";
import { DateInput } from "../components/DateInput";
import { Dropdown } from "../components/Dropdown";
import { Page } from "../components/Layout";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";
import { ApiError, get, post, put } from "../lib/api";
import { addDaysIso, formatDate, mondayOf, monthEnd, monthStart, todayIso } from "../lib/format";

interface Asg {
  maNhanVien: string;
  tenNhanVien: string;
  maCaLam: number;
  tenCa: string;
  ngayLam: string;
  gioBatDau: string;
  gioKetThuc: string;
  trangThai: number; // 1 Được phân công, 2 Đã đổi, 0 Hủy
}
interface ShiftType {
  maCaLam: number;
  gioBatDau: string;
  gioKetThuc: string;
  ten: string;
}
interface Emp {
  maNhanVien: string;
  tenNhanVien: string;
  trangThai: number;
}
type View = "day" | "week" | "month";
const STATUS: Record<number, string> = { 1: "Được phân công", 2: "Đã đổi", 0: "Hủy" };
const STATUS_PILL: Record<number, string> = { 1: "pill-green", 2: "pill-amber", 0: "pill-red" };
const DOW = ["THỨ HAI", "THỨ BA", "THỨ TƯ", "THỨ NĂM", "THỨ SÁU", "THỨ BẢY", "CHỦ NHẬT"];
const DOW_NAME = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const SYS_ERR = "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau!";
/** Mã ca hiển thị dạng CA01, CA02, ... */
export const caCode = (n: number) => `CA${String(n).padStart(2, "0")}`;
const shiftName = (start: string) => {
  const h = Number(start.slice(0, 2));
  return h < 12 ? "Ca sáng" : h < 17 ? "Ca chiều" : "Ca tối";
};
/** "2026-11-09" -> "Thứ Hai, 09/11/2026" */
const dayLong = (iso: string) => `${DOW_NAME[new Date(`${iso}T00:00:00Z`).getUTCDay()]}, ${formatDate(iso)}`;

function rangeFor(view: View, date: string): [string, string] {
  if (view === "day") return [date, date];
  if (view === "week") {
    const m = mondayOf(date);
    return [m, addDaysIso(m, 6)];
  }
  return [mondayOf(monthStart(date)), addDaysIso(mondayOf(monthEnd(date)), 6)];
}

function ClockIcon() {
  return (
    <svg className="in-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export default function Shifts() {
  const toast = useToast();
  const [view, setView] = useState<View>("day");
  const [date, setDate] = useState(todayIso());
  const [items, setItems] = useState<Asg[]>([]);
  const [types, setTypes] = useState<ShiftType[]>([]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<{ maCaLam: number; ngay: string } | null>(null);

  const [from, to] = useMemo(() => rangeFor(view, date), [view, date]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await get<{ items: Asg[] }>("/shifts", { from, to });
      setItems(r.items);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : SYS_ERR);
    } finally {
      setLoading(false);
    }
  }, [from, to, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const loadTypes = useCallback(() => get<{ items: ShiftType[] }>("/shifts/types").then((t) => setTypes(t.items)), []);

  useEffect(() => {
    Promise.all([loadTypes(), get<{ items: Emp[] }>("/employees").then((e) => setEmps(e.items))]).catch((e) =>
      toast.error(e instanceof ApiError ? e.message : SYS_ERR),
    );
  }, [toast, loadTypes]);

  // Tiêu đề khung lịch (Figma: "Lịch làm việc tuần 09/11 – 15/11/2026")
  const title =
    view === "day"
      ? `Lịch làm việc ngày ${formatDate(date)}`
      : view === "week"
        ? `Lịch làm việc tuần ${formatDate(from).slice(0, 5)} – ${formatDate(to)}`
        : `Lịch làm việc tháng ${date.slice(5, 7)}/${date.slice(0, 4)}`;

  return (
    <Page crumbs={["Quản lý nhân viên", "Quản lý ca làm"]} title="Quản lý ca làm">
      <div className="toolbar shift-toolbar">
        <div className="view-box">
          {(["day", "week", "month"] as View[]).map((v) => (
            <button key={v} type="button" className={`view-btn${view === v ? " on" : ""}`} onClick={() => setView(v)}>
              {v === "day" ? "Ngày" : v === "week" ? "Tuần" : "Tháng"}
            </button>
          ))}
        </div>
        <DateInput variant="icon" value={date} onChange={(v) => v && setDate(v)} />
        <div className="spacer" />
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          + Lập lịch làm việc
        </button>
      </div>

      <section className="card">
        <div className="card-title">{title}</div>
        {view === "day" && <DayView items={items} loading={loading} onOpen={(a) => setEditing({ maCaLam: a.maCaLam, ngay: a.ngayLam })} />}
        {view === "week" && <WeekView items={items} types={types} from={from} onOpen={(ma, ngay) => setEditing({ maCaLam: ma, ngay })} />}
        {view === "month" && (
          <MonthView
            items={items}
            from={from}
            month={date.slice(0, 7)}
            onPick={(d) => {
              setDate(d);
              setView("day");
            }}
          />
        )}
      </section>

      {creating && (
        <CreateDialog
          types={types}
          emps={emps}
          onClose={() => setCreating(false)}
          onDone={async (d) => {
            setCreating(false);
            toast.success("Lập lịch làm việc thành công");
            setDate(d);
            await Promise.all([load(), loadTypes()]);
          }}
        />
      )}
      {editing && (
        <EditDialog
          key={`${editing.maCaLam}|${editing.ngay}`}
          target={editing}
          emps={emps}
          onClose={() => setEditing(null)}
          onDone={async () => {
            setEditing(null);
            toast.success("Đã sửa thành công");
            await Promise.all([load(), loadTypes()]);
          }}
        />
      )}
    </Page>
  );
}

function DayView({ items, loading, onOpen }: { items: Asg[]; loading: boolean; onOpen: (a: Asg) => void }) {
  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th>MÃ NHÂN VIÊN</th>
            <th>TÊN NHÂN VIÊN</th>
            <th>MÃ CA LÀM</th>
            <th>NGÀY LÀM</th>
            <th>GIỜ BẮT ĐẦU</th>
            <th>GIỜ KẾT THÚC</th>
            <th>TRẠNG THÁI</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={`${a.maCaLam}${a.maNhanVien}`} className="clickable" onClick={() => onOpen(a)}>
              <td>{a.maNhanVien}</td>
              <td>{a.tenNhanVien}</td>
              <td>{caCode(a.maCaLam)}</td>
              <td>{formatDate(a.ngayLam)}</td>
              <td>{a.gioBatDau}</td>
              <td>{a.gioKetThuc}</td>
              <td>
                <span className={`pill ${STATUS_PILL[a.trangThai]}`}>{STATUS[a.trangThai]}</span>
              </td>
            </tr>
          ))}
          {!loading && !items.length && (
            <tr>
              <td colSpan={7} className="empty">
                Chưa lập lịch
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function WeekView({ items, types, from, onOpen }: { items: Asg[]; types: ShiftType[]; from: string; onOpen: (ma: number, ngay: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(from, i));
  const rows = useMemo(() => {
    const map = new Map<number, ShiftType>();
    types.forEach((t) => map.set(t.maCaLam, t));
    items.forEach((a) => !map.has(a.maCaLam) && map.set(a.maCaLam, { maCaLam: a.maCaLam, gioBatDau: a.gioBatDau, gioKetThuc: a.gioKetThuc, ten: a.tenCa }));
    // Chỉ hiển thị ca chuẩn + ca có phân công trong tuần
    const used = new Set(items.map((a) => a.maCaLam));
    return [...map.values()].filter((t) => t.maCaLam <= 3 || used.has(t.maCaLam)).sort((a, b) => a.gioBatDau.localeCompare(b.gioBatDau) || a.maCaLam - b.maCaLam);
  }, [items, types]);

  return (
    <div className="table-scroll">
      <table className="table week">
        <thead>
          <tr>
            <th>CA LÀM</th>
            {days.map((d, i) => (
              <th key={d} className="center">
                {DOW[i]}
                <div className="sub">{formatDate(d).slice(0, 5)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.maCaLam}>
              <td className="shift-cell">
                <b>{`${caCode(r.maCaLam)} · ${r.ten}`}</b>
                <div className="muted small">{`${r.gioBatDau} – ${r.gioKetThuc}`}</div>
              </td>
              {days.map((d) => {
                const here = items.filter((a) => a.maCaLam === r.maCaLam && a.ngayLam === d && a.trangThai !== 0);
                return (
                  <td key={d} className={here.length ? "cell-has" : ""} onClick={() => here.length && onOpen(r.maCaLam, d)}>
                    {here.length ? (
                      here.map((a) => (
                        <div key={a.maNhanVien} className={`chip chip-s${a.trangThai}`}>
                          {a.tenNhanVien}
                        </div>
                      ))
                    ) : (
                      <span className="unassigned">Chưa phân công</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthView({ items, from, month, onPick }: { items: Asg[]; from: string; month: string; onPick: (d: string) => void }) {
  const weeks = Math.ceil((new Date(`${monthEnd(`${month}-01`)}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000 / 7 + 0.001);
  const cells = Array.from({ length: Math.max(weeks, 4) * 7 }, (_, i) => addDaysIso(from, i));
  const stat = useMemo(() => {
    const m = new Map<string, { shifts: Set<number>; n: number }>();
    for (const a of items) {
      if (a.trangThai !== 1) continue;
      const s = m.get(a.ngayLam) ?? { shifts: new Set<number>(), n: 0 };
      s.shifts.add(a.maCaLam);
      s.n++;
      m.set(a.ngayLam, s);
    }
    return m;
  }, [items]);
  const today = todayIso();

  return (
    <div className="table-scroll">
      <div className="month-grid">
        {DOW.map((d) => (
          <div key={d} className="month-dow">
            {d}
          </div>
        ))}
        {cells.map((d) => {
          const s = stat.get(d);
          const inMonth = d.startsWith(month);
          return (
            <button key={d} type="button" className={`month-cell${inMonth ? "" : " out"}${d === today ? " today" : ""}`} onClick={() => onPick(d)}>
              <span className="month-day">{Number(d.slice(8, 10))}</span>
              {inMonth &&
                (s ? <span className="month-badge">{`${s.shifts.size} ca · ${s.n} lượt`}</span> : <span className="month-none">Chưa lập lịch</span>)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const MSG_NO_DATE = "Vui lòng chọn thời gian cần lập lịch!";
const MSG_NO_SHIFT = "Vui lòng chọn ca làm!";
const MSG_BAD_TIME = "Thời gian không hợp lệ. Vui lòng nhập lại!";
const MSG_NO_EMP = "Chưa có nhân viên được chọn!";
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Giờ hợp lệ: đúng HH:mm, bắt đầu < kết thúc, trong giờ hoạt động 07:00 - 22:00 (BR01). */
const validRange = (s: string, e: string) => HHMM.test(s) && HHMM.test(e) && toMin(s) < toMin(e) && toMin(s) >= 420 && toMin(e) <= 1320;

/** Nhãn trường bắt buộc (dấu * đỏ như Figma). */
const Req = ({ children }: { children: string }) => (
  <label>
    {children}
    <span className="req">*</span>
  </label>
);

/** Ô giờ HH:mm có biểu tượng đồng hồ (Figma). */
function TimeInput({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: boolean }) {
  return (
    <div className="time-in">
      <input className={`input${error ? " input-error" : ""}`} value={value} maxLength={5} placeholder="HH:mm" onChange={(e) => onChange(e.target.value)} />
      <ClockIcon />
    </div>
  );
}

function CreateDialog({ types, emps, onClose, onDone }: { types: ShiftType[]; emps: Emp[]; onClose: () => void; onDone: (date: string) => void | Promise<void> }) {
  const [single, setSingle] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [shiftId, setShiftId] = useState(""); // "" = chưa chọn (bắt buộc chọn)
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  // Lỗi theo vùng: "date" (thời gian lập lịch), "shift" (ca làm / giờ), "employees"
  const [err, setErr] = useState<{ where: "" | "date" | "shift" | "employees" | "other"; field?: string; msg: string }>({ where: "", msg: "" });
  const [busy, setBusy] = useState(false);
  const active = emps.filter((e) => e.trangThai === 1);
  const chosen = types.find((x) => String(x.maCaLam) === shiftId);
  const customTime = !!chosen && HHMM.test(start) && HHMM.test(end) && (start !== chosen.gioBatDau || end !== chosen.gioKetThuc);

  const pickShift = (id: string) => {
    setShiftId(id);
    const t = types.find((x) => String(x.maCaLam) === id);
    if (t) {
      setStart(t.gioBatDau);
      setEnd(t.gioKetThuc);
    }
    if (err.where === "shift") setErr({ where: "", msg: "" });
  };

  const fail = (where: "date" | "shift" | "employees" | "other", msg: string, field?: string) => setErr({ where, msg, field });

  const submit = async () => {
    setErr({ where: "", msg: "" });
    const f = from, t = single ? from : to;
    // Kiểm tra các trường bắt buộc theo thứ tự trên biểu mẫu
    if (!f) return fail("date", MSG_NO_DATE, "from");
    if (!t) return fail("date", MSG_NO_DATE, "to");
    if (f > t) return fail("date", MSG_BAD_TIME, "to");
    if (!shiftId) return fail("shift", MSG_NO_SHIFT, "shift");
    if (!validRange(start.trim(), end.trim())) return fail("shift", MSG_BAD_TIME, "time");
    if (!picked.length) return fail("employees", MSG_NO_EMP);
    setBusy(true);
    try {
      await post("/shifts", { from: f, to: t, gioBatDau: start.trim(), gioKetThuc: end.trim(), employees: picked });
      await onDone(f);
    } catch (e) {
      if (e instanceof ApiError) {
        const k = Object.keys(e.fields)[0] ?? "";
        if (k === "from" || k === "to") fail("date", e.message, k);
        else if (k === "gioBatDau") fail("shift", e.message, "time");
        else if (k === "employees") fail("employees", e.message);
        else fail("other", e.message);
      } else fail("other", SYS_ERR);
    } finally {
      setBusy(false);
    }
  };

  const msgAt = (where: string) => (err.where === where ? <div className="err">{err.msg}</div> : null);

  return (
    <Modal onClose={onClose}>
      <div className="shift-form">
        <div className="modal-head">
          <h3>Lập lịch làm việc</h3>
        </div>
        <div className="form-row">
          <Req>Thời gian lập lịch</Req>
          <div className="radios">
            <label>
              <input type="radio" checked={single} onChange={() => setSingle(true)} /> Một ngày
            </label>
            <label>
              <input type="radio" checked={!single} onChange={() => setSingle(false)} /> Khoảng thời gian
            </label>
          </div>
        </div>
        <div className="grid-2">
          <div className="form-row">
            <label>Từ ngày</label>
            <DateInput value={from} onChange={setFrom} error={err.field === "from"} />
          </div>
          <div className="form-row">
            <label>Đến ngày</label>
            <DateInput value={single ? from : to} onChange={setTo} disabled={single} error={err.field === "to"} />
          </div>
        </div>
        {msgAt("date")}
        <div className="grid-3">
          <div className="form-row">
            <Req>Ca làm</Req>
            <Dropdown
              value={shiftId}
              placeholder="Chọn ca làm"
              error={err.field === "shift"}
              options={types.map((t) => ({ value: String(t.maCaLam), label: `${caCode(t.maCaLam)} · ${t.ten}` }))}
              onChange={pickShift}
            />
          </div>
          <div className="form-row">
            <Req>Giờ bắt đầu</Req>
            <TimeInput value={start} onChange={setStart} error={err.field === "time"} />
          </div>
          <div className="form-row">
            <Req>Giờ kết thúc</Req>
            <TimeInput value={end} onChange={setEnd} error={err.field === "time"} />
          </div>
        </div>
        {msgAt("shift")}
        {customTime && !err.msg && (
          <div className="hint-row">
            <span>Khung giờ khác {caCode(Number(shiftId))} — hệ thống sẽ tạo mã ca mới cho khung giờ này.</span>
          </div>
        )}
        <div className="form-row">
          <Req>Nhân viên phân công</Req>
          <div className={`emp-list${err.where === "employees" ? " input-error" : ""}`}>
            {active.map((e) => {
              const on = picked.includes(e.maNhanVien);
              return (
                <label key={e.maNhanVien} className={`emp-opt${on ? " on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(ev) => {
                      setPicked((p) => (ev.target.checked ? [...p, e.maNhanVien] : p.filter((x) => x !== e.maNhanVien)));
                      if (err.where === "employees") setErr({ where: "", msg: "" });
                    }}
                  />
                  <span className="emp-code">{e.maNhanVien}</span> {e.tenNhanVien}
                </label>
              );
            })}
          </div>
          {msgAt("employees")}
        </div>
        {msgAt("other")}
        <div className="modal-actions">
          <button type="button" className="btn btn-light" onClick={onClose}>
            Hủy
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
            Xác nhận
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EditDialog({ target, emps, onClose, onDone }: { target: { maCaLam: number; ngay: string }; emps: Emp[]; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [rows, setRows] = useState<Asg[] | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get<{ items: Asg[] }>("/shifts", { from: target.ngay, to: target.ngay })
      .then((r) => {
        const mine = r.items.filter((a) => a.maCaLam === target.maCaLam);
        setRows(mine);
        if (mine[0]) {
          setStart(mine[0].gioBatDau);
          setEnd(mine[0].gioKetThuc);
        }
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : SYS_ERR));
  }, [target]);

  const taken = new Set([...(rows ?? []).filter((a) => a.trangThai === 1).map((a) => a.maNhanVien), ...added]);
  const options = emps.filter((e) => e.trangThai === 1 && !taken.has(e.maNhanVien));
  const nameOf = (ma: string) => emps.find((e) => e.maNhanVien === ma)?.tenNhanVien ?? ma;

  const submit = async () => {
    setError("");
    if (!validRange(start.trim(), end.trim())) return setError(MSG_BAD_TIME);
    setBusy(true);
    try {
      await put(`/shifts/${target.maCaLam}/${target.ngay}`, { gioBatDau: start.trim(), gioKetThuc: end.trim(), remove: removed, add: added });
      await onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : SYS_ERR);
    } finally {
      setBusy(false);
    }
  };

  const first = rows?.[0];
  const timeChanged = !!first && (start !== first.gioBatDau || end !== first.gioKetThuc);

  return (
    <Modal onClose={onClose}>
      <div className="shift-form">
        <div className="modal-head">
          <h3>Chi tiết ca làm</h3>
        </div>
        {!rows ? (
          <div className="muted">{error || "Đang tải..."}</div>
        ) : (
          <>
            <div className="grid-2">
              <div className="form-row">
                <label>Mã ca làm</label>
                <input className="input" readOnly value={first ? `${caCode(target.maCaLam)} · ${shiftName(first.gioBatDau)}` : caCode(target.maCaLam)} />
              </div>
              <div className="form-row">
                <label>Ngày làm</label>
                <input className="input" readOnly value={dayLong(target.ngay)} />
              </div>
            </div>
            <div className="grid-2">
              <div className="form-row">
                <Req>Giờ bắt đầu</Req>
                <TimeInput value={start} onChange={setStart} error={error === MSG_BAD_TIME} />
              </div>
              <div className="form-row">
                <Req>Giờ kết thúc</Req>
                <TimeInput value={end} onChange={setEnd} error={error === MSG_BAD_TIME} />
              </div>
            </div>
            {error === MSG_BAD_TIME && <div className="err">{error}</div>}
            {timeChanged && error !== MSG_BAD_TIME && (
              <div className="hint-row">
                <span>Đổi khung giờ: ca sẽ chuyển sang mã ca của khung giờ mới (tạo mã ca mới nếu chưa có).</span>
              </div>
            )}
            <div className="form-row">
              <label>Nhân viên đã được phân công</label>
              <div className="asg-box">
                {rows.map((a) => {
                  const gone = removed.includes(a.maNhanVien);
                  const st = gone ? (added.length ? 2 : 0) : a.trangThai;
                  return (
                    <div key={a.maNhanVien} className={`asg-row${gone || a.trangThai !== 1 ? " dim" : ""}`}>
                      <span className="emp-code">{a.maNhanVien}</span>
                      <span className="grow">{a.tenNhanVien}</span>
                      <span className={`pill ${STATUS_PILL[st]}`}>{STATUS[st]}</span>
                      {a.trangThai === 1 ? (
                        <button
                          type="button"
                          className="btn btn-light btn-xs"
                          onClick={() => setRemoved((r) => (gone ? r.filter((x) => x !== a.maNhanVien) : [...r, a.maNhanVien]))}
                        >
                          {gone ? "Hoàn tác" : "Hủy"}
                        </button>
                      ) : (
                        <span className="btn-xs-space" />
                      )}
                    </div>
                  );
                })}
                {added.map((ma) => (
                  <div key={ma} className="asg-row">
                    <span className="emp-code">{ma}</span>
                    <span className="grow">{nameOf(ma)}</span>
                    <span className="pill pill-green">Được phân công</span>
                    <button type="button" className="btn btn-light btn-xs" onClick={() => setAdded((x) => x.filter((m) => m !== ma))}>
                      Hủy
                    </button>
                  </div>
                ))}
                {adding ? (
                  <div className="asg-add">
                    <Dropdown
                      value=""
                      placeholder="Chọn nhân viên"
                      options={options.map((o) => ({
                        value: o.maNhanVien,
                        label: `${o.maNhanVien} ${o.tenNhanVien}`,
                        node: (
                          <>
                            <span className="dd-code">{o.maNhanVien}</span>
                            <span className="dd-name">{o.tenNhanVien}</span>
                          </>
                        ),
                      }))}
                      onChange={(v) => {
                        setAdded((x) => [...x, v]);
                        setAdding(false);
                      }}
                    />
                  </div>
                ) : (
                  <button type="button" className="asg-add-btn" disabled={!options.length} onClick={() => setAdding(true)}>
                    + Thêm nhân viên
                  </button>
                )}
              </div>
            </div>
            {error && error !== MSG_BAD_TIME && <div className="err">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn btn-light" onClick={onClose}>
                Hủy
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
                Xác nhận
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
