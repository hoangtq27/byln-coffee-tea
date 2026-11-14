import { useCallback, useEffect, useState } from "react";
import { DateInput } from "../components/DateInput";
import { Page } from "../components/Layout";
import { ConfirmDialog } from "../components/Modal";
import { useToast } from "../components/Toast";
import { ApiError, del, get, post, put } from "../lib/api";
import { formatDate } from "../lib/format";

interface Emp {
  maNhanVien: string;
  tenNhanVien: string;
  sdt: string;
  diaChi: string;
  ngayVaoLam: string | null;
  trangThai: number;
}
interface Draft {
  isNew: boolean;
  maNhanVien: string;
  tenNhanVien: string;
  sdt: string;
  diaChi: string;
  ngayVaoLam: string;
  trangThai: number;
}
const SYS_ERR = "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau!";
const INVALID = "Thông tin nhân viên không hợp lệ. Vui lòng kiểm tra lại!";

export default function Employees() {
  const toast = useToast();
  const [items, setItems] = useState<Emp[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [toDelete, setToDelete] = useState<Emp | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await get<{ items: Emp[] }>("/employees")).items);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : SYS_ERR);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const startAdd = async () => {
    try {
      const r = await get<{ maNhanVien: string }>("/employees/next-code");
      setErrs({});
      setDraft({ isNew: true, maNhanVien: r.maNhanVien, tenNhanVien: "", sdt: "", diaChi: "", ngayVaoLam: "", trangThai: 1 });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : SYS_ERR);
    }
  };
  const startEdit = (e: Emp) => {
    setErrs({});
    setDraft({ isNew: false, maNhanVien: e.maNhanVien, tenNhanVien: e.tenNhanVien, sdt: e.sdt, diaChi: e.diaChi, ngayVaoLam: e.ngayVaoLam ?? "", trangThai: e.trangThai });
  };

  const save = async () => {
    if (!draft || busy) return;
    const reqMsg = draft.isNew ? "Vui lòng nhập đầy đủ thông tin!" : "Vui lòng nhập đầy đủ thông tin bắt buộc!";
    const e: Record<string, string> = {};
    if (!draft.tenNhanVien.trim()) e.tenNhanVien = reqMsg;
    if (!draft.sdt.trim()) e.sdt = reqMsg;
    setErrs(e);
    if (Object.keys(e).length) return;
    if (!/^\d{1,10}$/.test(draft.sdt.trim())) {
      setErrs({ sdt: " " });
      toast.error(INVALID);
      return;
    }
    setBusy(true);
    try {
      const body = {
        tenNhanVien: draft.tenNhanVien.trim(),
        sdt: draft.sdt.trim(),
        diaChi: draft.diaChi.trim(),
        ngayVaoLam: draft.ngayVaoLam || null,
        trangThai: draft.trangThai,
      };
      const r = draft.isNew ? await post<{ message: string }>("/employees", body) : await put<{ message: string }>(`/employees/${draft.maNhanVien}`, body);
      toast.success(r.message);
      await load();
      if (draft.isNew) await startAdd();
      else setDraft(null);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409 || (err.fields.sdt && err.message === INVALID)) setErrs({ sdt: " " });
        else if (Object.keys(err.fields).length) setErrs(err.fields);
        toast.error(err.message);
      } else toast.error(SYS_ERR);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      const r = await del<{ message: string }>(`/employees/${toDelete.maNhanVien}`);
      toast.success(r.message);
      setToDelete(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Đã xảy ra lỗi!");
      setToDelete(null);
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      const r = await post<{ message: string }>(`/employees/${toDelete.maNhanVien}/deactivate`);
      toast.success(r.message);
      setToDelete(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : SYS_ERR);
    } finally {
      setBusy(false);
    }
  };

  const crumbs = ["Quản lý nhân viên", "Quản lý thông tin nhân viên", ...(draft ? [draft.isNew ? "Thêm nhân viên mới" : "Sửa thông tin nhân viên"] : [])];

  const editCells = (d: Draft) => (
    <>
      <td>
        <input className={`input${errs.tenNhanVien ? " input-error err-bg" : ""}`} placeholder="Tên nhân viên" maxLength={100} value={d.tenNhanVien} onChange={(e) => setDraft({ ...d, tenNhanVien: e.target.value })} />
        {errs.tenNhanVien && <div className="err">{errs.tenNhanVien}</div>}
      </td>
      <td>
        <input className={`input${errs.sdt ? " input-error err-bg" : ""}`} placeholder="Số điện thoại" maxLength={10} inputMode="numeric" value={d.sdt} onChange={(e) => setDraft({ ...d, sdt: e.target.value })} />
        {errs.sdt?.trim() && <div className="err">{errs.sdt}</div>}
      </td>
      <td>
        <input className="input" placeholder="Địa chỉ" maxLength={200} value={d.diaChi} onChange={(e) => setDraft({ ...d, diaChi: e.target.value })} />
      </td>
      <td>
        <DateInput value={d.ngayVaoLam} onChange={(v) => setDraft({ ...d, ngayVaoLam: v })} />
      </td>
      <td>
        <select className="input" value={d.trangThai} onChange={(e) => setDraft({ ...d, trangThai: Number(e.target.value) })}>
          <option value={1}>Còn làm</option>
          <option value={0}>Nghỉ làm</option>
        </select>
      </td>
      <td />
    </>
  );

  return (
    <Page
      crumbs={crumbs}
      title="Quản lý thông tin nhân viên"
      actions={
        draft ? (
          <>
            <button type="button" className="btn btn-light" onClick={() => setDraft(null)}>
              Hủy
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
              Lưu
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={startAdd}>
            + Thêm nhân viên
          </button>
        )
      }
    >
      <section className="card">
        <div className="card-title">Danh sách nhân viên</div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>MÃ NV</th>
                <th>TÊN NHÂN VIÊN</th>
                <th>SỐ ĐIỆN THOẠI</th>
                <th>ĐỊA CHỈ</th>
                <th>NGÀY VÀO LÀM</th>
                <th>TRẠNG THÁI</th>
                <th>THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) =>
                draft && !draft.isNew && draft.maNhanVien === e.maNhanVien ? (
                  <tr key={e.maNhanVien} className="row-edit">
                    <td className="strong">{e.maNhanVien}</td>
                    {editCells(draft)}
                  </tr>
                ) : (
                  <tr key={e.maNhanVien}>
                    <td className="strong">{e.maNhanVien}</td>
                    <td>{e.tenNhanVien}</td>
                    <td>{e.sdt}</td>
                    <td>{e.diaChi}</td>
                    <td>{formatDate(e.ngayVaoLam)}</td>
                    <td>
                      <span className={`pill ${e.trangThai ? "pill-green" : "pill-red"}`}>{e.trangThai ? "Còn làm" : "Nghỉ làm"}</span>
                    </td>
                    <td className="actions">
                      <button type="button" className="link" disabled={!!draft} onClick={() => startEdit(e)}>Sửa</button>
                      <span className="sep">·</span>
                      <button type="button" className="link danger" disabled={!!draft} onClick={() => setToDelete(e)}>Xóa</button>
                    </td>
                  </tr>
                ),
              )}
              {draft?.isNew && (
                <tr className="row-edit">
                  <td className="strong">{draft.maNhanVien}</td>
                  {editCells(draft)}
                </tr>
              )}
              {!loading && !items.length && !draft && (
                <tr>
                  <td colSpan={7} className="empty">Chưa có nhân viên</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {toDelete && (
        <ConfirmDialog
          title="Bạn có chắc chắn muốn xóa nhân viên này không?"
          detail={`${toDelete.tenNhanVien} (${toDelete.maNhanVien})`}
          onClose={() => setToDelete(null)}
          buttons={[
            { label: "Hủy", onClick: () => setToDelete(null) },
            { label: "Chuyển trạng thái thành nghỉ làm", disabled: busy || toDelete.trangThai === 0, onClick: deactivate },
            { label: "Xác nhận", variant: "danger", disabled: busy, onClick: remove },
          ]}
        />
      )}
    </Page>
  );
}
