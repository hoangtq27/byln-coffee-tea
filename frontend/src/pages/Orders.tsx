import { useCallback, useEffect, useRef, useState, type FormEvent, type UIEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Page } from "../components/Layout";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";
import { ApiError, get } from "../lib/api";
import {
  formatDateTime,
  formatVnd,
  NGUON,
  PHUONG_THUC,
  TRANG_THAI_DON,
  type OrderItem,
  type OrderSummary,
} from "../lib/format";

const PAGE = 100;

export default function Orders() {
  const nav = useNavigate();
  const toast = useToast();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<OrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (q: string, offset: number) => {
      const id = ++seq.current;
      setLoading(true);
      try {
        const r = await get<{ items: OrderSummary[]; total: number }>("/orders", { q, limit: PAGE, offset });
        if (id !== seq.current) return; // bỏ kết quả của truy vấn cũ
        setItems((prev) => (offset === 0 ? r.items : [...prev, ...r.items]));
        setTotal(r.total);
        setError("");
      } catch (e) {
        if (id !== seq.current) return;
        const msg = e instanceof ApiError ? e.message : "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau!";
        setError(msg);
        toast.error(msg);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    load(query, 0);
  }, [query, load]);

  const search = (e: FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (q === query) load(q, 0);
    else setQuery(q);
  };

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (!loading && items.length < total && el.scrollTop + el.clientHeight >= el.scrollHeight - 200) load(query, items.length);
  };

  return (
    <Page crumbs={["Quản lý đơn hàng"]} title="Quản lý đơn hàng">
      <form className="toolbar" onSubmit={search}>
        <div className="field-inline">
          <label htmlFor="q">Mã đơn</label>
          <input
            id="q"
            className="input"
            placeholder="Nhập mã đơn cần tìm"
            value={input}
            maxLength={20}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-light">
          Tìm kiếm
        </button>
        <div className="spacer" />
        <button type="button" className="btn btn-primary" onClick={() => nav("/orders/new")}>
          + Tạo đơn
        </button>
      </form>

      <section className="card">
        <div className="card-title">
          Danh sách đơn hàng
          <span className="muted">
            {" "}
            ({items.length}/{total})
          </span>
        </div>
        <div className="table-scroll orders-scroll" onScroll={onScroll}>
          <table className="table">
            <thead>
              <tr>
                <th>MÃ ĐƠN</th>
                <th>THỜI GIAN TẠO</th>
                <th className="num">TỔNG THANH TOÁN</th>
                <th>PHƯƠNG THỨC</th>
                <th>TRẠNG THÁI</th>
                <th>MÃ NHÂN VIÊN</th>
                <th className="num">TỔNG TIỀN</th>
                <th className="num">GIẢM GIÁ</th>
                <th>NGUỒN ĐƠN HÀNG</th>
                <th>TRẠNG THÁI ĐƠN</th>
                <th>GHI CHÚ</th>
                <th className="sticky-right">THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.maDonHang}>
                  <td className="strong">{o.maDonHang}</td>
                  <td>{formatDateTime(o.thoiGianTao)}</td>
                  <td className="num strong">{formatVnd(o.tongThanhToan)}</td>
                  <td>{PHUONG_THUC[o.phuongThuc]}</td>
                  <td>
                    <span className={o.thanhToan ? "text-green" : "text-red"}>{o.thanhToan ? "Đã thanh toán" : "Chưa thanh toán"}</span>
                  </td>
                  <td>{o.maNhanVien}</td>
                  <td className="num">{formatVnd(o.tongTien)}</td>
                  <td className="num">{formatVnd(o.giamGia)}</td>
                  <td>{NGUON[o.nguon]}</td>
                  <td>
                    <span className={`pill pill-s${o.trangThaiDon}`}>{TRANG_THAI_DON[o.trangThaiDon]}</span>
                  </td>
                  <td className="note">{o.ghiChu}</td>
                  <td className="sticky-right">
                    <button type="button" className="link" onClick={() => setDetail(o.maDonHang)}>
                      Xem
                    </button>
                    <span className="sep">·</span>
                    <button type="button" className="link" onClick={() => nav(`/orders/${o.maDonHang}/edit`)}>
                      Sửa
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && !items.length && (
                <tr>
                  <td colSpan={12} className="empty">
                    {error || "Không tìm thấy đơn hàng"}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={12} className="empty">
                    Đang tải...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {detail && <OrderDetail id={detail} onClose={() => setDetail(null)} onEdit={() => nav(`/orders/${detail}/edit`)} />}
    </Page>
  );
}

function OrderDetail({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: () => void }) {
  const [data, setData] = useState<{ order: OrderSummary; items: OrderItem[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    get(`/orders/${id}`)
      .then(setData)
      .catch((e) => setErr(e instanceof ApiError ? e.message : "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau!"));
  }, [id]);

  return (
    <Modal onClose={onClose} wide>
      <div className="modal-head">
        <h3>Chi tiết đơn hàng {id}</h3>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng">
          ✕
        </button>
      </div>
      {err && <div className="err">{err}</div>}
      {!data && !err && <div className="muted">Đang tải...</div>}
      {data && (
        <>
          <dl className="kv">
            <dt>Mã đơn hàng</dt><dd>{data.order.maDonHang}</dd>
            <dt>Mã nhân viên</dt><dd>{data.order.maNhanVien}</dd>
            <dt>Thời gian tạo</dt><dd>{formatDateTime(data.order.thoiGianTao)}</dd>
            <dt>Nguồn đơn hàng</dt><dd>{NGUON[data.order.nguon]}</dd>
            <dt>Phương thức thanh toán</dt><dd>{PHUONG_THUC[data.order.phuongThuc]}</dd>
            <dt>Trạng thái thanh toán</dt><dd>{data.order.thanhToan ? "Đã thanh toán" : "Chưa thanh toán"}</dd>
            <dt>Trạng thái đơn hàng</dt><dd>{TRANG_THAI_DON[data.order.trangThaiDon]}</dd>
            <dt>Ghi chú</dt><dd>{data.order.ghiChu || "—"}</dd>
          </dl>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>MÃ MÓN</th>
                  <th>TÊN MÓN</th>
                  <th className="num">SỐ LƯỢNG</th>
                  <th className="num">ĐƠN GIÁ</th>
                  <th className="num">THÀNH TIỀN</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.maMon}>
                    <td>{i.maMon}</td>
                    <td>{i.tenMon}</td>
                    <td className="num">{i.soLuong}</td>
                    <td className="num">{formatVnd(i.donGia)}</td>
                    <td className="num">{formatVnd(i.thanhTien)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="totals">
            <div><span>Tổng tiền</span><b>{formatVnd(data.order.tongTien)}</b></div>
            <div><span>Giảm giá</span><b>{formatVnd(data.order.giamGia)}</b></div>
            <div className="grand"><span>Tổng thanh toán</span><b>{formatVnd(data.order.tongThanhToan)}</b></div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-light" onClick={onClose}>
              Đóng
            </button>
            <button type="button" className="btn btn-primary" onClick={onEdit}>
              Chỉnh sửa
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
