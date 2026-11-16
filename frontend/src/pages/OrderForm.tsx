import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Page } from "../components/Layout";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";
import { ApiError, get, post, put } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatVnd, NGUON, PHUONG_THUC, TRANG_THAI_DON, type Dish, type OrderItem, type OrderSummary } from "../lib/format";

interface Line {
  maMon: string;
  tenMon: string;
  donGia: number;
  soLuong: string; // giữ chuỗi để hiện đúng giá trị người dùng nhập (rỗng / -1 / 1.5 ...)
}

/** Biểu tượng thùng rác (vẽ bằng SVG nội tuyến, không dùng file ảnh) */
function TrashIcon() {
  return (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}

const QTY_REQUIRED = "Vui lòng nhập số lượng!";
const QTY_INVALID = "Số lượng phải là số nguyên lớn hơn 0!";

function validQty(s: string): number | null {
  return /^\d+$/.test(s.trim()) && Number(s) > 0 && Number(s) <= 9999 ? Number(s) : null;
}

function Segmented<T extends number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          className={`seg-btn${value === o.value ? " on" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function OrderForm({ mode }: { mode: "create" | "edit" }) {
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { id } = useParams();

  const [dishes, setDishes] = useState<Dish[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [code, setCode] = useState("");
  const [nguon, setNguon] = useState(0);
  const [phuongThuc, setPhuongThuc] = useState(0);
  const [thanhToan, setThanhToan] = useState(0);
  const [trangThaiDon, setTrangThaiDon] = useState(1);
  const [giamGia, setGiamGia] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [meta, setMeta] = useState<OrderSummary | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<string[]>([]); // món được chọn để xóa (màn Sửa)
  const [pickerOpen, setPickerOpen] = useState(false); // hộp thoại Thêm món
  const [picked, setPicked] = useState<string[]>([]);
  const [pickQty, setPickQty] = useState<Record<string, string>>({}); // số lượng nhập trong hộp Thêm món

  // Nhân viên không được sửa đơn đã thanh toán, chỉ được chuyển trạng thái đơn sang "Hoàn thành"
  const lockedForStaff = mode === "edit" && user?.role === "staff" && meta?.thanhToan === 1;
  const delivery = nguon !== 0;

  const loadNewCode = useCallback(async () => {
    const r = await get<{ maDonHang: string }>("/orders/next-code");
    setCode(r.maDonHang);
  }, []);

  const loadOrder = useCallback(async () => {
    const r = await get<{ order: OrderSummary; items: OrderItem[] }>(`/orders/${id}`);
    setMeta(r.order);
    setCode(r.order.maDonHang);
    setNguon(r.order.nguon);
    setPhuongThuc(r.order.phuongThuc);
    setThanhToan(r.order.thanhToan);
    setTrangThaiDon(r.order.trangThaiDon);
    setGiamGia(r.order.giamGia ? String(r.order.giamGia) : "");
    setGhiChu(r.order.ghiChu);
    setLines(r.items.map((i) => ({ maMon: i.maMon, tenMon: i.tenMon, donGia: i.donGia, soLuong: String(i.soLuong) })));
  }, [id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await get<{ items: Dish[] }>("/dishes");
        if (!alive) return;
        setDishes(d.items);
        if (mode === "create") await loadNewCode();
        else await loadOrder();
      } catch (e) {
        if (!alive) return;
        toast.error(e instanceof ApiError ? e.message : "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau!");
        if (mode === "edit") nav("/orders", { replace: true });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [mode, loadNewCode, loadOrder, nav, toast]);

  const total = useMemo(
    () => lines.reduce((s, l) => (validQty(l.soLuong) ? s + (validQty(l.soLuong) as number) * l.donGia : s), 0),
    [lines],
  );
  const discountNum = giamGia.trim() === "" ? 0 : Number(giamGia);
  const discountValid = giamGia.trim() === "" || (/^\d+$/.test(giamGia.trim()) && discountNum >= 0);
  const payable = Math.max(0, total - (discountValid ? discountNum : 0));

  const toggleDish = (d: Dish) => {
    if (d.trangThai !== 1) return;
    setLines((ls) =>
      ls.some((l) => l.maMon === d.maMon)
        ? ls.filter((l) => l.maMon !== d.maMon)
        : [...ls, { maMon: d.maMon, tenMon: d.tenMon, donGia: d.giaBan, soLuong: "" }],
    );
    setErrs((e) => ({ ...e, items: "" }));
  };

  const setQty = (maMon: string, v: string) => {
    setLines((ls) => ls.map((l) => (l.maMon === maMon ? { ...l, soLuong: v } : l)));
    setErrs((e) => ({ ...e, [`q:${maMon}`]: "" }));
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!lines.length) e.items = "Đơn hàng phải có ít nhất 1 món!";
    for (const l of lines) {
      if (l.soLuong.trim() === "") e[`q:${l.maMon}`] = QTY_REQUIRED;
      else if (validQty(l.soLuong) === null) e[`q:${l.maMon}`] = QTY_INVALID;
    }
    if (!discountValid) e.giamGia = "Giảm giá phải là số nguyên không âm!";
    else if (discountNum > total) e.giamGia = "Giảm giá không được lớn hơn tổng tiền!";
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (busy) return;
    if (lockedForStaff) {
      setBusy(true);
      try {
        const r = await put<{ message: string }>(`/orders/${id}`, { trangThaiDon });
        toast.success(r.message);
        nav("/orders"); // cập nhật thành công -> quay về màn hình Quản lý đơn hàng ban đầu
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau!");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!validate()) {
      if (!lines.length) toast.error("Đơn hàng phải có ít nhất 1 món!");
      return;
    }
    const body = {
      items: lines.map((l) => ({ maMon: l.maMon, soLuong: Number(l.soLuong) })),
      nguon,
      phuongThuc: delivery ? 1 : phuongThuc,
      thanhToan,
      giamGia: discountNum,
      ghiChu: ghiChu.trim(),
      ...(mode === "edit" ? { trangThaiDon } : {}),
    };
    setBusy(true);
    try {
      if (mode === "create") {
        const r = await post<{ message: string }>("/orders", body);
        toast.success(r.message);
        // Hiển thị lại biểu mẫu trống để tạo đơn tiếp theo
        setLines([]);
        setNguon(0);
        setPhuongThuc(0);
        setThanhToan(0);
        setGiamGia("");
        setGhiChu("");
        setErrs({});
        await loadNewCode();
        const d = await get<{ items: Dish[] }>("/dishes");
        setDishes(d.items);
      } else {
        const r = await put<{ message: string }>(`/orders/${id}`, body);
        toast.success(r.message);
        nav("/orders"); // cập nhật thành công -> quay về màn hình Quản lý đơn hàng ban đầu
      }
    } catch (e) {
      if (e instanceof ApiError) {
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(e.fields)) {
          const m = /^items\.(\d+)\.(soLuong|maMon)$/.exec(k);
          if (m) mapped[`q:${lines[Number(m[1])]?.maMon}`] = v;
          else mapped[k] = v;
        }
        setErrs(mapped);
        toast.error(e.message);
      } else toast.error("Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau!");
    } finally {
      setBusy(false);
    }
  };

  const statusOptions = lockedForStaff ? [meta!.trangThaiDon, 2].filter((v, i, a) => a.indexOf(v) === i) : [1, 2, 0];
  const crumbs = ["Quản lý đơn hàng", mode === "create" ? "Tạo đơn hàng" : "Sửa thông tin đơn hàng"];

  if (loading)
    return (
      <Page crumbs={crumbs} title="Quản lý đơn hàng">
        <div className="muted">Đang tải...</div>
      </Page>
    );

  const editMode = mode === "edit";

  const linesTable = (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            {editMode && <th className="chk-col">Chọn</th>}
            <th>Mã món</th>
            <th>Tên món</th>
            <th>Số lượng</th>
            <th className="num">Giá bán</th>
            <th className="num">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const q = validQty(l.soLuong);
            const err = errs[`q:${l.maMon}`];
            return (
              <tr key={l.maMon}>
                {editMode && (
                  <td className="chk-col">
                    <input
                      type="checkbox"
                      className="chk"
                      disabled={lockedForStaff}
                      checked={checked.includes(l.maMon)}
                      aria-label={`Chọn ${l.tenMon}`}
                      onChange={(e) => setChecked((c) => (e.target.checked ? [...c, l.maMon] : c.filter((x) => x !== l.maMon)))}
                    />
                  </td>
                )}
                <td>{l.maMon}</td>
                <td>{l.tenMon}</td>
                <td className="qty-cell">
                  <input
                    className={`input qty${err ? " input-error" : ""}`}
                    value={l.soLuong}
                    placeholder="Nhập số lượng"
                    inputMode="numeric"
                    disabled={lockedForStaff}
                    aria-label={`Số lượng ${l.tenMon}`}
                    onChange={(e) => setQty(l.maMon, e.target.value)}
                  />
                  {err && <div className="err">{err}</div>}
                </td>
                <td className="num">{formatVnd(l.donGia)}</td>
                <td className="num">{q ? formatVnd(q * l.donGia) : ""}</td>
              </tr>
            );
          })}
          {!lines.length && (
            <tr>
              <td colSpan={editMode ? 6 : 5} className="empty">
                Chưa có món nào được chọn
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const discountField = (
    <div className="kv-row">
      <label htmlFor="giamgia">Giảm giá (đ)</label>
      <div>
        <input
          id="giamgia"
          className={`input${errs.giamGia ? " input-error" : ""}`}
          value={giamGia}
          placeholder="0"
          inputMode="numeric"
          disabled={lockedForStaff}
          onChange={(e) => {
            setGiamGia(e.target.value);
            setErrs((x) => ({ ...x, giamGia: "" }));
          }}
        />
        {errs.giamGia && <div className="err">{errs.giamGia}</div>}
      </div>
    </div>
  );

  const choiceFields = (
    <>
      <div className="kv-row">
        <label>Nguồn đơn hàng</label>
        <Segmented
          value={nguon}
          disabled={lockedForStaff}
          options={NGUON.map((label, value) => ({ value, label }))}
          onChange={(v) => {
            setNguon(v);
            if (v !== 0) setPhuongThuc(1);
          }}
        />
      </div>
      <div className="kv-row">
        <label>Phương thức thanh toán</label>
        <Segmented
          value={delivery ? 1 : phuongThuc}
          disabled={lockedForStaff || delivery}
          options={[
            { value: 0, label: "Tiền mặt" },
            { value: 1, label: "QR code" },
          ]}
          onChange={setPhuongThuc}
        />
      </div>
      <div className="kv-row">
        <label>Trạng thái thanh toán</label>
        <Segmented
          value={thanhToan}
          disabled={lockedForStaff}
          options={[
            { value: 0, label: "Chưa thanh toán" },
            { value: 1, label: "Đã thanh toán" },
          ]}
          onChange={setThanhToan}
        />
      </div>
    </>
  );

  const noteField = (
    <div className="kv-row top">
      <label htmlFor="ghichu">Ghi chú</label>
      <textarea id="ghichu" className="input" rows={2} maxLength={200} value={ghiChu} disabled={lockedForStaff} onChange={(e) => setGhiChu(e.target.value)} />
    </div>
  );

  // ---------- Sửa thông tin đơn hàng (Figma: một thẻ rộng, chọn món để xóa, nút "Thêm món") ----------
  if (editMode && meta) {
    return (
      <Page crumbs={crumbs} title="Quản lý đơn hàng">
        {lockedForStaff && (
          <div className="notice">Đơn hàng đã thanh toán: Nhân viên chỉ có thể chuyển trạng thái đơn hàng sang “Hoàn thành”.</div>
        )}
        <section className="card order-edit">
          <div className="oe-head">
            <h2>Đơn hàng {code}</h2>
            <span className="muted">
              Nguồn: {NGUON[meta.nguon]} · Nhân viên: {meta.maNhanVien} · Thanh toán: {PHUONG_THUC[meta.phuongThuc]}
            </span>
          </div>
          <div className="oe-tools">
            <button
              type="button"
              className="btn btn-light"
              disabled={lockedForStaff}
              onClick={() => {
                setPicked([]);
                setPickQty({});
                setPickerOpen(true);
              }}
            >
              <span aria-hidden="true">+</span> Thêm món
            </button>
            {checked.length > 0 && (
              <button
                type="button"
                className="btn btn-light btn-del"
                onClick={() => {
                  setLines((ls) => ls.filter((l) => !checked.includes(l.maMon)));
                  setChecked([]);
                }}
              >
                <TrashIcon /> Xóa món
              </button>
            )}
          </div>
          {linesTable}
          {errs.items && <div className="err">{errs.items}</div>}

          <div className="oe-fields">
            {choiceFields}
            <div className="kv-row">
              <label htmlFor="ttdon">Trạng thái đơn hàng</label>
              <select id="ttdon" className="input" value={trangThaiDon} onChange={(e) => setTrangThaiDon(Number(e.target.value))}>
                {statusOptions.map((v) => (
                  <option key={v} value={v}>
                    {TRANG_THAI_DON[v]}
                  </option>
                ))}
              </select>
            </div>
            {discountField}
            {noteField}
          </div>

          <div className="oe-sum">
            <div className="oe-pay">
              <span>Trạng thái thanh toán</span>
              <span className={`pill ${meta.thanhToan ? "pill-green" : "pill-red"}`}>{meta.thanhToan ? "Đã thanh toán" : "Chưa thanh toán"}</span>
            </div>
            <div className="oe-total">
              <span>Tổng tiền</span>
              <b>{formatVnd(total)}</b>
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-light" onClick={() => nav("/orders")}>
              Quay lại
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
              Lưu
            </button>
          </div>
        </section>

        {pickerOpen && (
          <Modal onClose={() => setPickerOpen(false)} wide>
            <div className="modal-head">
              <h3>Thêm món</h3>
            </div>
            <div className="table-scroll picker">
              <table className="table">
                <thead>
                  <tr>
                    <th className="chk-col">Chọn</th>
                    <th>Mã món</th>
                    <th>Tên món</th>
                    <th className="num">Giá bán</th>
                    <th>Số lượng</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {dishes.map((d) => {
                    const inOrder = lines.some((l) => l.maMon === d.maMon);
                    const off = d.trangThai !== 1;
                    return (
                      <tr key={d.maMon} className={off || inOrder ? "dim-row" : ""}>
                        <td className="chk-col">
                          <input
                            type="checkbox"
                            className="chk"
                            disabled={off || inOrder}
                            checked={inOrder || picked.includes(d.maMon)}
                            aria-label={`Chọn ${d.tenMon}`}
                            onChange={(e) => setPicked((p) => (e.target.checked ? [...p, d.maMon] : p.filter((x) => x !== d.maMon)))}
                          />
                        </td>
                        <td>{d.maMon}</td>
                        <td>{d.tenMon}</td>
                        <td className="num">{formatVnd(d.giaBan)}</td>
                        <td>
                          <input
                            className="input qty-sm"
                            placeholder="SL"
                            inputMode="numeric"
                            disabled={off || inOrder}
                            value={pickQty[d.maMon] ?? ""}
                            aria-label={`Số lượng ${d.tenMon}`}
                            onChange={(e) => {
                              const v = e.target.value;
                              setPickQty((q) => ({ ...q, [d.maMon]: v }));
                              // nhập số lượng thì tự chọn món
                              if (v.trim()) setPicked((p) => (p.includes(d.maMon) ? p : [...p, d.maMon]));
                            }}
                          />
                        </td>
                        <td>
                          <span className={`pill ${off ? "pill-red" : "pill-green"}`}>{off ? "Ngừng bán" : "Đang bán"}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-light" onClick={() => setPickerOpen(false)}>
                Hủy
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!picked.length}
                onClick={() => {
                  const add = dishes.filter((d) => picked.includes(d.maMon));
                  setLines((ls) => [...ls, ...add.map((d) => ({ maMon: d.maMon, tenMon: d.tenMon, donGia: d.giaBan, soLuong: (pickQty[d.maMon] ?? "").trim() }))]);
                  setErrs((e) => ({ ...e, items: "" }));
                  setPickerOpen(false);
                }}
              >
                <span aria-hidden="true">+</span> Thêm vào đơn
              </button>
            </div>
          </Modal>
        )}
      </Page>
    );
  }

  // ---------- Tạo đơn hàng (Figma: "Chọn món" bên trái, "Đơn hàng mới" bên phải) ----------
  return (
    <Page crumbs={crumbs} title="Quản lý đơn hàng">
      <div className="order-layout">
        <section className="card">
          <div className="card-title">Chọn món</div>
          <p className="muted small dish-hint">Bấm vào món để thêm vào đơn hàng</p>
          <div className="dish-grid">
            {dishes.map((d) => {
              const pickedNow = lines.some((l) => l.maMon === d.maMon);
              const off = d.trangThai !== 1;
              return (
                <button
                  key={d.maMon}
                  type="button"
                  disabled={off}
                  className={`dish-card${pickedNow ? " picked" : ""}${off ? " off" : ""}`}
                  onClick={() => toggleDish(d)}
                >
                  <span className="dish-code">{d.maMon}</span>
                  {pickedNow && (
                    <svg className="dish-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4.5 12.5l5 5L19.5 7" />
                    </svg>
                  )}
                  <span className="dish-name">{d.tenMon}</span>
                  <span className="dish-price">{formatVnd(d.giaBan)}</span>
                  {off && <span className="dish-off">Ngừng bán</span>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="card">
          <div className="card-title order-new-title">
            <span>Đơn hàng mới</span>
            <span className="muted small">Mã đơn hàng: {code}</span>
          </div>
          {linesTable}
          {errs.items && <div className="err">{errs.items}</div>}

          <div className="sum-row">
            <span>Tổng tiền</span>
            <b>{formatVnd(total)}</b>
          </div>
          {discountField}
          <div className="sum-row grand">
            <span>Tổng thanh toán</span>
            <b>{formatVnd(payable)}</b>
          </div>
          {choiceFields}
          {noteField}
          <div className="form-actions">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
              Lưu
            </button>
          </div>
        </section>
      </div>
    </Page>
  );
}
