import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Page } from "../components/Layout";
import { useToast } from "../components/Toast";
import { ApiError, get, post, put } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Account } from "./Accounts";

interface Emp {
  maNhanVien: string;
  tenNhanVien: string;
  coTaiKhoan: boolean;
}
const SYS_ERR = "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau!";
const PW_MSG = "Mật khẩu không đạt yêu cầu!";

export default function AccountForm({ mode }: { mode: "create" | "edit" }) {
  const nav = useNavigate();
  const toast = useToast();
  const { forceLogout } = useAuth();
  const { ma } = useParams();
  const edit = mode === "edit";

  const [emps, setEmps] = useState<Emp[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [maNv, setMaNv] = useState("");
  const [role, setRole] = useState<"staff" | "manager">("staff");
  const [status, setStatus] = useState(1);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const e = await get<{ items: Emp[] }>("/employees");
        setEmps(e.items);
        if (edit) {
          const list = await get<{ items: Account[] }>("/accounts");
          const a = list.items.find((x) => x.maTaiKhoan === ma);
          if (!a) {
            toast.error("Không tìm thấy tài khoản!");
            nav("/accounts", { replace: true });
            return;
          }
          setUsername(a.tenDangNhap);
          setMaNv(a.maNhanVien);
          setRole(a.vaiTro);
          setStatus(a.trangThai);
        }
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : SYS_ERR);
      } finally {
        setReady(true);
      }
    })();
  }, [edit, ma, nav, toast]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!username.trim()) e.tenDangNhap = "Vui lòng nhập tên đăng nhập!";
    if (!edit && !password) e.matKhau = "Vui lòng nhập mật khẩu!";
    else if (password && (password.length < 6 || password.length > 50 || !/[@#!]/.test(password))) e.matKhau = PW_MSG;
    if (!maNv) e.maNhanVien = "Vui lòng chọn nhân viên!";
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (busy || !validate()) return;
    setBusy(true);
    try {
      const body = { tenDangNhap: username.trim(), matKhau: password, maNhanVien: maNv, vaiTro: role, trangThai: status };
      if (edit) {
        const r = await put<{ message: string; forceLogout?: boolean }>(`/accounts/${ma}`, body);
        toast.success(r.message);
        if (r.forceLogout) {
          // Đổi thông tin đăng nhập của chính tài khoản đang dùng -> đăng xuất
          forceLogout();
          nav("/login", { replace: true });
          return;
        }
      } else {
        const r = await post<{ message: string }>("/accounts", body);
        toast.success(r.message);
      }
      nav("/accounts");
    } catch (err) {
      if (err instanceof ApiError) {
        setErrs(err.fields);
        if (!Object.keys(err.fields).length) toast.error(err.message);
      } else toast.error(SYS_ERR);
    } finally {
      setBusy(false);
    }
  };

  const title = edit ? "Sửa thông tin tài khoản" : "Tạo tài khoản";
  return (
    <Page crumbs={["Quản lý tài khoản", title]} title={title}>
      <section className="card form-card">
        <p className="muted">{edit ? `Đang sửa tài khoản ${ma}` : "Cấp tài khoản đăng nhập cho nhân viên đã có trong hệ thống"}</p>
        {!ready ? (
          <div className="muted">Đang tải...</div>
        ) : (
          <>
            {edit && (
              <div className="form-row">
                <label>Mã tài khoản</label>
                <input className="input" value={ma} readOnly />
              </div>
            )}
            <div className="form-row">
              <label htmlFor="tdn">
                Tên đăng nhập <span className="req">*</span>
              </label>
              <input
                id="tdn"
                className={`input${errs.tenDangNhap ? " input-error" : ""}`}
                value={username}
                maxLength={20}
                autoComplete="off"
                onChange={(e) => {
                  setUsername(e.target.value);
                  setErrs((x) => ({ ...x, tenDangNhap: "" }));
                }}
              />
              <div className="hint-row">
                <span>Tối đa 20 kí tự</span>
                <span>{username.length}/20</span>
              </div>
              {errs.tenDangNhap && <div className="err">{errs.tenDangNhap}</div>}
            </div>

            <div className="form-row">
              <label htmlFor="mk">
                Mật khẩu {!edit && <span className="req">*</span>}
              </label>
              <div className="pw-wrap">
                <input
                  id="mk"
                  className={`input${errs.matKhau ? " input-error" : ""}`}
                  type={show ? "text" : "password"}
                  value={password}
                  maxLength={50}
                  autoComplete="new-password"
                  placeholder={edit ? "Để trống nếu không đổi mật khẩu" : ""}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrs((x) => ({ ...x, matKhau: "" }));
                  }}
                />
                <button type="button" className="eye" onClick={() => setShow((s) => !s)} aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>
                  {show ? "Ẩn" : "Hiện"}
                </button>
              </div>
              <div className="hint-row">
                <span>6-50 ký tự, có ít nhất 1 ký tự đặc biệt (@, #, !)</span>
              </div>
              {errs.matKhau && <div className="err">{errs.matKhau}</div>}
            </div>

            <div className="form-row">
              <label htmlFor="mnv">Mã nhân viên</label>
              <select
                id="mnv"
                className={`input${errs.maNhanVien ? " input-error" : ""}`}
                value={maNv}
                onChange={(e) => {
                  setMaNv(e.target.value);
                  setErrs((x) => ({ ...x, maNhanVien: "" }));
                }}
              >
                <option value="">— Chọn nhân viên —</option>
                {emps.map((n) => {
                  const taken = n.coTaiKhoan && n.maNhanVien !== maNv;
                  return (
                    <option key={n.maNhanVien} value={n.maNhanVien} disabled={taken}>
                      {n.maNhanVien} {n.tenNhanVien}
                      {taken ? " — Đã có tài khoản" : ""}
                    </option>
                  );
                })}
              </select>
              {errs.maNhanVien && <div className="err">{errs.maNhanVien}</div>}
            </div>

            <div className="form-row">
              <label htmlFor="vt">
                Vai trò <span className="req">*</span>
              </label>
              <select id="vt" className="input" value={role} onChange={(e) => setRole(e.target.value as "staff" | "manager")}>
                <option value="staff">Nhân viên</option>
                <option value="manager">Quản lý</option>
              </select>
            </div>

            <div className="form-row">
              <label>Trạng thái</label>
              <div className="seg">
                <button type="button" className={`seg-btn${status === 1 ? " on" : ""}`} onClick={() => setStatus(1)}>
                  Hoạt động
                </button>
                <button type="button" className={`seg-btn${status === 0 ? " on" : ""}`} onClick={() => setStatus(0)}>
                  Khóa
                </button>
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-light" onClick={() => nav("/accounts")}>
                Hủy
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
                {edit ? "Lưu thay đổi" : "Tạo"}
              </button>
            </div>
          </>
        )}
      </section>
    </Page>
  );
}
