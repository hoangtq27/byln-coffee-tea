import { useCallback, useEffect, useMemo, useState } from "react";
import { DateInput } from "../components/DateInput";
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
const DOW = ["THỨ HAI", "THỨ BA", "THỨ TƯ", "THỨ NĂM", "THỨ SÁU", "THỨ BẢY", "CHỦ NHẬT"];
const SYS_ERR = "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau!";
const shiftLabel = (a: { maCaLam: number; tenCa: string; gioBatDau: string; gioKetThuc: string }) =>
  `CA${a.maCaLam} · ${a.tenCa} | ${a.gioBatDau} – ${a.gioKetThuc}`;

function rangeFor(view: View, date: string): [string, string] {
  if (view === "day") return [date, date];
  if (view === "week") {
    const m = mondayOf(date);
    return [m, addDaysIso(m, 6)];
  }
  return [mondayOf(monthStart(date)), addDaysIso(mondayOf(monthEnd(date)), 6)];
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

  useEffect(() => {
    Promise.all([get<{ items: ShiftType[] }>("/shifts/types"), get<{ items: Emp[] }>("/employees")])
      .then(([t, e]) => {
        setTypes(t.items);
        setEmps(e.items);
      })
      .catch((e) => toast.error(e instanceof ApiError ? e.message : SYS_ERR));
  }, [toast]);

  const shift = (delta: number) => {
    if (view === "day") setDate(addDaysIso(date, delta));
    else if (view === "week") setDate(addDaysIso(date, 7 * delta));
    else {
      const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7)) - 1 + delta;
      const ny = y + Math.floor(m / 12), nm = ((m % 12) + 12) % 12 + 1;
      setDate(`${ny}-${String(nm).padStart(2, "0")}-01`);
    }
  };

  const label =
    view === "day" ? formatDate(date) : view === "week" ? `${formatDate(from)} – ${formatDate(to)}` : `Tháng ${Number(date.slice(5, 7))}/${date.slice(0, 4)}`;

  return (
    <Page
      crumbs={["Quản lý nhân viên", "Quản lý ca làm"]}
      title="Quản lý ca làm"
      actions={
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          Lập lịch làm việc
        </button>
      }
    >
      <div className="toolbar">
        <div className="seg">
          {(["day", "week", "month"] as View[]).map((v) => (
            <button key={v} type="button" className={`seg-btn${view === v ? " on" : ""}`} onClick={() => setView(v)}>
              {v === "day" ? "Ngày" : v === "week" ? "Tuần" : "Tháng"}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-light btn-sm" onClick={() => shift(-1)} aria-label="Trước">‹</button>
        <div className="date-w">
          <DateInput value={date} onChange={(v) => v && setDate(v)} />
        </div>
        <button type="button" className="btn btn-light btn-sm" onClick={() => shift(1)} aria-label="Sau">›</button>
        <div className="range-label">{label}</div>
      </div>

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

      {creating && (
        <CreateDialog
          types={types}
          emps={emps}
          onClose={() => setCreating(false)}
          onDone={async (d) => {
            setCreating(false);
            toast.success("Lập lịch làm việc thành công");
            setDate(d);
            await Promise.all([load(), get<{ items: ShiftType[] }>("/shifts/types").then((t) => setTypes(t.items))]);
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
            await Promise.all([load(), get<{ items: ShiftType[] }>("/shifts/types").then((t) => setTypes(t.items))]);
          }}
        />
      )}
    </Page>
  );
}

function DayView({ items, loading, onOpen }: { items: Asg[]; loading: boolean; onOpen: (a: Asg) => void }) {
  return (
    <section className="card">
      <div className="card-title">Danh sách ca làm</div>
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
                <td className="strong">{a.maNhanVien}</td>
                <td>{a.tenNhanVien}</td>
                <td>CA{a.maCaLam}</td>
                <td>{formatDate(a.ngayLam)}</td>
                <td>{a.gioBatDau}</td>
                <td>{a.gioKetThuc}</td>
                <td>
                  <span className={`pill ${a.trangThai === 1 ? "pill-green" : a.trangThai === 2 ? "pill-amber" : "pill-red"}`}>{STATUS[a.trangThai]}</span>
                </td>
              </tr>
            ))}
            {!loading && !items.length && (
              <tr>
                <td colSpan={7} className="empty">Chưa có lịch làm việc trong ngày này</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WeekView({ items, types, from, onOpen }: { items: Asg[]; types: ShiftType[]; from: string; onOpen: (ma: number, ngay: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(from, i));
  const rows = useMemo(() => {
    const map = new Map<number, ShiftType>();
    types.forEach((t) => map.set(t.maCaLam, t));
    items.forEach((a) => !map.has(a.maCaLam) && map.set(a.maCaLam, { maCaLam: a.maCaLam, gioBatDau: a.gioBatDau, gioKetThuc: a.gioKetThuc, ten: a.tenCa }));
    return [...map.values()].sort((a, b) => a.gioBatDau.localeCompare(b.gioBatDau));
  }, [items, types]);

  return (
    <section className="card">
      <div className="card-title">Lịch làm việc theo tuần</div>
      <div className="table-scroll">
        <table className="table week">
          <thead>
            <tr>
              <th>CA LÀM</th>
              {days.map((d, i) => (
                <th key={d}>
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
                  <b>{`CA${r.maCaLam} · ${r.ten}`}</b>
                  <div className="muted small">{`${r.gioBatDau} – ${r.gioKetThuc}`}</div>
                </td>
                {days.map((d) => {
                  const here = items.filter((a) => a.maCaLam === r.maCaLam && a.ngayLam === d && a.trangThai === 1);
                  return (
                    <td key={d} className={here.length ? "cell-has" : ""} onClick={() => here.length && onOpen(r.maCaLam, d)}>
                      {here.map((a) => (
                        <div key={a.maNhanVien} className="chip">{a.tenNhanVien}</div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
    <section className="card">
      <div className="card-title">Lịch làm việc theo tháng</div>
      <div className="table-scroll">
        <div className="month-grid">
          {DOW.map((d) => (
            <div key={d} className="month-dow">{d}</div>
          ))}
          {cells.map((d) => {
            const s = stat.get(d);
            const inMonth = d.startsWith(month);
            return (
              <button key={d} type="button" className={`month-cell${inMonth ? "" : " out"}${d === today ? " today" : ""}`} onClick={() => onPick(d)}>
                <span className="month-day">{Number(d.slice(8, 10))}</span>
                {s && (
                  <>
                    <span className="month-line">{s.shifts.size} ca</span>
                    <span className="month-line">{s.n} lượt phân công</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CreateDialog({ types, emps, onClose, onDone }: { types: ShiftType[]; emps: Emp[]; onClose: () => void; onDone: (date: string) => void | Promise<void> }) {
  const [single, setSingle] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [shiftId, setShiftId] = useState<number>(types[0]?.maCaLam ?? 0);
  const [start, setStart] = useState(types[0]?.gioBatDau ?? "07:00");
  const [end, setEnd] = useState(types[0]?.gioKetThuc ?? "12:00");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [bad, setBad] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const active = emps.filter((e) => e.trangThai === 1);

  const pickShift = (id: number) => {
    setShiftId(id);
    const t = types.find((x) => x.maCaLam === id);
    if (t) {
      setStart(t.gioBatDau);
      setEnd(t.gioKetThuc);
    }
  };

  const submit = async () => {
    setError("");
    setBad("");
    setBusy(true);
    try {
      const f = from, t = single ? from : to;
      await post("/shifts", { from: f || undefined, to: t || undefined, gioBatDau: start, gioKetThuc: end, employees: picked });
      await onDone(f);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setBad(Object.keys(e.fields)[0] ?? "");
      } else setError(SYS_ERR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} wide>
      <div className="modal-head">
        <h3>Lập lịch làm việc</h3>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng">✕</button>
      </div>
      <div className="form-row">
        <label>Thời gian lập lịch</label>
        <div className="radios">
          <label><input type="radio" checked={single} onChange={() => setSingle(true)} /> Một ngày</label>
          <label><input type="radio" checked={!single} onChange={() => setSingle(false)} /> Khoảng thời gian</label>
        </div>
      </div>
      <div className="grid-2">
        <div className="form-row">
          <label>Từ ngày</label>
          <DateInput value={from} onChange={setFrom} error={bad === "from"} />
        </div>
        <div className="form-row">
          <label>Đến ngày</label>
          <DateInput value={single ? from : to} onChange={setTo} disabled={single} error={bad === "to"} />
        </div>
      </div>
      <div className="grid-3">
        <div className="form-row">
          <label>Ca làm</label>
          <select className="input" value={shiftId} onChange={(e) => pickShift(Number(e.target.value))}>
            {types.map((t) => (
              <option key={t.maCaLam} value={t.maCaLam}>{`CA${t.maCaLam} · ${t.ten}`}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Giờ bắt đầu</label>
          <input className={`input${bad === "gioBatDau" ? " input-error" : ""}`} value={start} maxLength={5} placeholder="HH:mm" onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Giờ kết thúc</label>
          <input className={`input${bad === "gioBatDau" ? " input-error" : ""}`} value={end} maxLength={5} placeholder="HH:mm" onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <label>Nhân viên phân công</label>
        <div className={`emp-list${bad === "employees" ? " input-error" : ""}`}>
          {active.map((e) => (
            <label key={e.maNhanVien} className="emp-opt">
              <input
                type="checkbox"
                checked={picked.includes(e.maNhanVien)}
                onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, e.maNhanVien] : p.filter((x) => x !== e.maNhanVien)))}
              />
              <b>{e.maNhanVien}</b> {e.tenNhanVien}
            </label>
          ))}
        </div>
      </div>
      {error && <div className="err banner">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="btn btn-light" onClick={onClose}>Hủy</button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>Xác nhận</button>
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
  const [sel, setSel] = useState("");
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

  const activeNow = (rows ?? []).filter((a) => a.trangThai === 1 && !removed.includes(a.maNhanVien));
  const taken = new Set([...(rows ?? []).filter((a) => a.trangThai === 1).map((a) => a.maNhanVien), ...added]);
  const options = emps.filter((e) => e.trangThai === 1 && !taken.has(e.maNhanVien));
  const nameOf = (ma: string) => emps.find((e) => e.maNhanVien === ma)?.tenNhanVien ?? ma;

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      await put(`/shifts/${target.maCaLam}/${target.ngay}`, { gioBatDau: start, gioKetThuc: end, remove: removed, add: added });
      await onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : SYS_ERR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} wide>
      <div className="modal-head">
        <h3>Chi tiết ca làm</h3>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng">✕</button>
      </div>
      {!rows ? (
        <div className="muted">{error || "Đang tải..."}</div>
      ) : (
        <>
          <div className="grid-2">
            <div className="form-row"><label>Mã ca làm</label><div className="plain">CA{target.maCaLam}</div></div>
            <div className="form-row"><label>Ngày làm</label><div className="plain">{formatDate(target.ngay)}</div></div>
          </div>
          <div className="grid-2">
            <div className="form-row"><label>Giờ bắt đầu</label><input className="input" value={start} maxLength={5} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="form-row"><label>Giờ kết thúc</label><input className="input" value={end} maxLength={5} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div className="form-row">
            <label>Nhân viên đã được phân công</label>
            <ul className="asg-list">
              {rows.map((a) => {
                const gone = removed.includes(a.maNhanVien);
                return (
                  <li key={a.maNhanVien} className={gone || a.trangThai !== 1 ? "dim" : ""}>
                    <span className="grow"><b>{a.maNhanVien}</b> {a.tenNhanVien}</span>
                    <span className={`pill ${a.trangThai === 1 && !gone ? "pill-green" : a.trangThai === 2 ? "pill-amber" : "pill-red"}`}>
                      {gone ? "Hủy" : STATUS[a.trangThai]}
                    </span>
                    {a.trangThai === 1 && (
                      <button type="button" className="link danger" onClick={() => setRemoved((r) => (gone ? r.filter((x) => x !== a.maNhanVien) : [...r, a.maNhanVien]))}>
                        {gone ? "Hoàn tác" : "Hủy"}
                      </button>
                    )}
                  </li>
                );
              })}
              {added.map((ma) => (
                <li key={ma}>
                  <span className="grow"><b>{ma}</b> {nameOf(ma)}</span>
                  <span className="pill pill-green">Thêm mới</span>
                  <button type="button" className="link danger" onClick={() => setAdded((x) => x.filter((m) => m !== ma))}>Bỏ</button>
                </li>
              ))}
            </ul>
          </div>
          <div className="form-row">
            <label>Thêm nhân viên vào ca</label>
            <div className="inline-add">
              <select className="input" value={sel} onChange={(e) => setSel(e.target.value)}>
                <option value="">— Chọn nhân viên —</option>
                {options.map((o) => (
                  <option key={o.maNhanVien} value={o.maNhanVien}>{`${o.maNhanVien} ${o.tenNhanVien}`}</option>
                ))}
              </select>
              <button type="button" className="btn btn-light" disabled={!sel} onClick={() => { setAdded((x) => [...x, sel]); setSel(""); }}>Thêm</button>
            </div>
          </div>
          {activeNow.length + added.length === 0 && <div className="muted small">Ca phải còn ít nhất một nhân viên.</div>}
          {error && <div className="err banner">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-light" onClick={onClose}>Hủy</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>Xác nhận</button>
          </div>
        </>
      )}
    </Modal>
  );
}
