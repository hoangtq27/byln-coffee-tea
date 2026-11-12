import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Page } from "../components/Layout";
import { ConfirmDialog } from "../components/Modal";
import { useToast } from "../components/Toast";
import { ApiError, del, get, post, put } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatVnd, type Dish } from "../lib/format";

interface Draft {
  maMon: string; // "" khi thêm mới (mã tự sinh)
  tenMon: string;
  giaBan: string;
  trangThai: number;
  isNew: boolean;
}
const SYS_ERR = "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau!";

export default function Dishes() {
  const { user } = useAuth();
  const isMgr = user?.role === "manager";
  const toast = useToast();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [searchErr, setSearchErr] = useState("");
  const [items, setItems] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [nextCode, setNextCode] = useState("");
  const [toDelete, setToDelete] = useState<Dish | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const load = useCallback(
    async (q: string) => {
      const id = ++seq.current;
      setLoading(true);
      try {
        const r = await get<{ items: Dish[] }>("/dishes", { q });
        if (id === seq.current) setItems(r.items);
      } catch (e) {
        if (id === seq.current) toast.error(e instanceof ApiError ? e.message : SYS_ERR);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    load(query);
  }, [query, load]);

  const search = (e: FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    // SRS 3.3: Quản lý bỏ trống -> báo lỗi; SDD màn Nhân viên: bỏ trống -> hiển thị toàn bộ món
    if (!q && isMgr) {
      setSearchErr("Vui lòng nhập tên món cần tìm!");
      return;
    }
    setSearchErr("");
    if (q === query) load(q);
    else setQuery(q);
  };

  const startAdd = async () => {
    try {
      const r = await get<{ maMon: string }>("/dishes/next-code");
      setNextCode(r.maMon);
    } catch {
      setNextCode("");
    }
    setErrs({});
    setDraft({ maMon: "", tenMon: "", giaBan: "", trangThai: 1, isNew: true });
  };

  const startEdit = (d: Dish) => {
    setErrs({});
    setDraft({ maMon: d.maMon, tenMon: d.tenMon, giaBan: String(d.giaBan), trangThai: d.trangThai, isNew: false });
  };

  const validate = (d: Draft) => {
    const e: Record<string, string> = {};
    if (!d.tenMon.trim()) e.tenMon = "Vui lòng nhập tên món!";
    if (!d.giaBan.trim()) e.giaBan = "Vui lòng nhập giá bán!";
    else if (!/^\d+(\.\d+)?$/.test(d.giaBan.trim()) || Number(d.giaBan) <= 0) e.giaBan = "Giá bán phải là số lớn hơn 0!";
    return e;
  };

  const save = async () => {
    if (!draft || busy) return;
    const e = validate(draft);
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const body = { tenMon: draft.tenMon.trim(), giaBan: draft.giaBan.trim(), trangThai: draft.trangThai };
      const r = draft.isNew ? await post<{ message: string }>("/dishes", body) : await put<{ message: string }>(`/dishes/${draft.maMon}`, body);
      toast.success(r.message);
      if (draft.isNew) {
        // biểu mẫu trống để thêm món tiếp theo
        await startAdd();
      } else setDraft(null);
      await load(query);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrs(err.fields);
      else toast.error(err instanceof ApiError ? err.message : SYS_ERR);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      const r = await del<{ message: string }>(`/dishes/${toDelete.maMon}`);
      toast.success(r.message);
      setToDelete(null);
      await load(query);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : SYS_ERR);
      setToDelete(null);
    } finally {
      setBusy(false);
    }
  };

  const discontinue = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      const r = await post<{ message: string }>(`/dishes/${toDelete.maMon}/discontinue`);
      toast.success(r.message);
      setToDelete(null);
      await load(query);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : SYS_ERR);
    } finally {
      setBusy(false);
    }
  };

  const crumbs = ["Quản lý món"];
  const editing = draft !== null;

  return (
    <Page crumbs={query ? ["Quản lý món", "Tìm kiếm món"] : crumbs} title="Quản lý món">
      <form className="toolbar" onSubmit={search} noValidate>
        <div className="field-inline top">
          <label htmlFor="dq">Tên món</label>
          <div>
            <input
              id="dq"
              className={`input${searchErr ? " input-error" : ""}`}
              placeholder="Nhập tên món cần tìm"
              value={input}
              maxLength={200}
              onChange={(e) => {
                setInput(e.target.value);
                setSearchErr("");
              }}
            />
            {searchErr && <div className="err">{searchErr}</div>}
          </div>
        </div>
        <button type="submit" className="btn btn-light">
          Tìm kiếm
        </button>
        {query && (
          <button
            type="button"
            className="btn btn-light"
            onClick={() => {
              setInput("");
              setQuery("");
              setSearchErr("");
            }}
          >
            Xóa tìm kiếm
          </button>
        )}
        <div className="spacer" />
        {isMgr && (
          <button type="button" className="btn btn-primary" disabled={editing} onClick={startAdd}>
            + Thêm món
          </button>
        )}
      </form>

      <section className="card">
        <div className="card-title">Danh sách món</div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>MÃ MÓN</th>
                <th>TÊN MÓN</th>
                <th className="num">GIÁ BÁN</th>
                <th>TRẠNG THÁI</th>
                {isMgr && <th>THAO TÁC</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((d) =>
                draft && !draft.isNew && draft.maMon === d.maMon ? (
                  <tr key={d.maMon} className="row-edit">
                    <td className="strong">{d.maMon}</td>
                    <td>
                      <input className={`input${errs.tenMon ? " input-error" : ""}`} value={draft.tenMon} maxLength={200} onChange={(e) => setDraft({ ...draft, tenMon: e.target.value })} />
                      {errs.tenMon && <div className="err">{errs.tenMon}</div>}
                    </td>
                    <td className="num">
                      <input className={`input num-in${errs.giaBan ? " input-error" : ""}`} inputMode="decimal" value={draft.giaBan} onChange={(e) => setDraft({ ...draft, giaBan: e.target.value })} />
                      {errs.giaBan && <div className="err">{errs.giaBan}</div>}
                    </td>
                    <td>
                      <select className="input" value={draft.trangThai} onChange={(e) => setDraft({ ...draft, trangThai: Number(e.target.value) })}>
                        <option value={1}>Đang bán</option>
                        <option value={0}>Ngừng bán</option>
                      </select>
                    </td>
                    <td className="actions">
                      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>Lưu</button>
                      <button type="button" className="btn btn-light btn-sm" onClick={() => setDraft(null)}>Hủy</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={d.maMon}>
                    <td className="strong">{d.maMon}</td>
                    <td>{d.tenMon}</td>
                    <td className="num">{formatVnd(d.giaBan)}</td>
                    <td>
                      <span className={`pill ${d.trangThai ? "pill-green" : "pill-red"}`}>{d.trangThai ? "Đang bán" : "Ngừng bán"}</span>
                    </td>
                    {isMgr && (
                      <td className="actions">
                        <button type="button" className="link" disabled={editing} onClick={() => startEdit(d)}>Sửa</button>
                        <span className="sep">·</span>
                        <button type="button" className="link danger" disabled={editing} onClick={() => setToDelete(d)}>Xóa</button>
                      </td>
                    )}
                  </tr>
                ),
              )}
              {draft?.isNew && (
                <tr className="row-edit">
                  <td className="strong">{nextCode}</td>
                  <td>
                    <input className={`input${errs.tenMon ? " input-error" : ""}`} placeholder="Tên món" value={draft.tenMon} maxLength={200} onChange={(e) => setDraft({ ...draft, tenMon: e.target.value })} />
                    {errs.tenMon && <div className="err">{errs.tenMon}</div>}
                  </td>
                  <td className="num">
                    <input className={`input num-in${errs.giaBan ? " input-error" : ""}`} placeholder="Giá bán" inputMode="decimal" value={draft.giaBan} onChange={(e) => setDraft({ ...draft, giaBan: e.target.value })} />
                    {errs.giaBan && <div className="err">{errs.giaBan}</div>}
                  </td>
                  <td>
                    <select className="input" value={draft.trangThai} onChange={(e) => setDraft({ ...draft, trangThai: Number(e.target.value) })}>
                      <option value={1}>Đang bán</option>
                      <option value={0}>Ngừng bán</option>
                    </select>
                  </td>
                  <td className="actions">
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>Lưu</button>
                    <button type="button" className="btn btn-light btn-sm" onClick={() => setDraft(null)}>Hủy</button>
                  </td>
                </tr>
              )}
              {!loading && !items.length && (
                <tr>
                  <td colSpan={isMgr ? 5 : 4} className="empty">Không tìm thấy món!</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {toDelete && (
        <ConfirmDialog
          title="Bạn có chắc chắn muốn xóa món này không?"
          detail={`${toDelete.tenMon} (${toDelete.maMon})`}
          onClose={() => setToDelete(null)}
          buttons={[
            { label: "Hủy", onClick: () => setToDelete(null) },
            { label: "Chuyển trạng thái ngừng bán", disabled: busy || toDelete.trangThai === 0, onClick: discontinue },
            { label: "Xác nhận", variant: "danger", disabled: busy, onClick: confirmDelete },
          ]}
        />
      )}
    </Page>
  );
}
