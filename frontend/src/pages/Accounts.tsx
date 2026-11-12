import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Page } from "../components/Layout";
import { ConfirmDialog } from "../components/Modal";
import { useToast } from "../components/Toast";
import { ApiError, del, get, post } from "../lib/api";
import { useAuth } from "../lib/auth";

export interface Account {
  maTaiKhoan: string;
  tenDangNhap: string;
  maNhanVien: string;
  tenNhanVien: string;
  vaiTro: "manager" | "staff";
  trangThai: number;
}
const SYS_ERR = "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau!";

export default function Accounts() {
  const nav = useNavigate();
  const toast = useToast();
  const { user, forceLogout } = useAuth();
  const [items, setItems] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [toDelete, setToDelete] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await get<{ items: Account[] }>("/accounts")).items);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : SYS_ERR);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async () => {
    if (!toDelete) return;
    if (toDelete.maTaiKhoan === user?.maTaiKhoan) {
      toast.error("Không thể xóa tài khoản này!");
      setToDelete(null);
      return;
    }
    setBusy(true);
    try {
      const r = await del<{ message: string }>(`/accounts/${toDelete.maTaiKhoan}`);
      toast.success(r.message);
      setToDelete(null);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : SYS_ERR);
      setToDelete(null);
    } finally {
      setBusy(false);
    }
  };

  const lock = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      const r = await post<{ message: string; forceLogout?: boolean }>(`/accounts/${toDelete.maTaiKhoan}/lock`);
      toast.success(r.message);
      setToDelete(null);
      if (r.forceLogout) {
        forceLogout();
        nav("/login", { replace: true });
        return;
      }
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : SYS_ERR);
      setToDelete(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      crumbs={["Quản lý tài khoản"]}
      title="Quản lý tài khoản"
      actions={
        <button type="button" className="btn btn-primary" onClick={() => nav("/accounts/new")}>
          + Tạo tài khoản
        </button>
      }
    >
      <section className="card">
        <div className="card-title">Danh sách tài khoản</div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>MÃ TÀI KHOẢN</th>
                <th>TÊN ĐĂNG NHẬP</th>
                <th>MẬT KHẨU</th>
                <th>MÃ NHÂN VIÊN</th>
                <th>VAI TRÒ</th>
                <th>TRẠNG THÁI</th>
                <th>THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.maTaiKhoan}>
                  <td className="strong">{a.maTaiKhoan}</td>
                  <td>{a.tenDangNhap}</td>
                  <td>••••••••</td>
                  <td>{a.maNhanVien}</td>
                  <td>{a.vaiTro === "manager" ? "Quản lý" : "Nhân viên"}</td>
                  <td>
                    <span className={`pill ${a.trangThai ? "pill-green" : "pill-red"}`}>{a.trangThai ? "Hoạt động" : "Khóa"}</span>
                  </td>
                  <td className="actions">
                    <button type="button" className="link" onClick={() => nav(`/accounts/${a.maTaiKhoan}/edit`)}>Sửa</button>
                    <span className="sep">·</span>
                    <button type="button" className="link danger" onClick={() => setToDelete(a)}>Xóa</button>
                  </td>
                </tr>
              ))}
              {!loading && !items.length && (
                <tr>
                  <td colSpan={7} className="empty">Chưa có tài khoản</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {toDelete && (
        <ConfirmDialog
          title="Bạn có chắc chắn muốn xóa tài khoản này không?"
          detail={`${toDelete.tenDangNhap} (${toDelete.maTaiKhoan})`}
          onClose={() => setToDelete(null)}
          buttons={[
            { label: "Hủy", onClick: () => setToDelete(null) },
            { label: "Khóa tài khoản này", disabled: busy || toDelete.trangThai === 0, onClick: lock },
            { label: "Xác nhận", variant: "danger", disabled: busy, onClick: remove },
          ]}
        />
      )}
    </Page>
  );
}
