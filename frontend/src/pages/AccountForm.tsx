import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../components/Modal";
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

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

/**
 * Hộp thoại Tạo / Sửa tài khoản (Figma: cửa sổ nổi trên nền làm mờ của màn Quản lý tài khoản).
 * `account` = null -> tạo mới.
 */
export default function AccountForm({ account, onClose, onSaved }: { account: Account | null; onClose: () => void; onSaved: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const { forceLogout } = useAuth();
  const edit = account !== null;

  const [emps, setEmps] = useState<Emp[]>([]);
  const [username, setUsername] = useState(account?.tenDangNhap ?? "");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [maNv, setMaNv] = useState(account?.maNhanVien ?? "");
  const [role, setRole] = useState<"staff" | "manager">(account?.vaiTro ?? "staff");
  const [status, setStatus] = useState(account?.trangThai ?? 1);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get<{ items: Emp[] }>("/employees")
      .then((e) => setEmps(e.items))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : SYS_ERR));
  }, [toast]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!username.trim()) e.tenDangNhap = "Vui lòng nhập tên đăng nhập!";
    if (!edit && !password) e.matKhau = "Vui lòng nhập mật khẩu!";
    else if (password && (password.length < 6 || password.length > 50 || !/[@#!]/.test(password))) e.matKhau = PW_MSG;
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (busy || !validate()) return;
    setBusy(true);
    try {
      const body = { tenDangNhap: username.trim(), matKhau: password, maNhanVien: maNv || null, vaiTro: role, trangThai: status };
      if (edit) {
        const r = await put<{ message: string; forceLogout?: boolean }>(`/accounts/${account.maTaiKhoan}`, body);
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
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrs(err.fields);
        if (!Object.keys(err.fields).length) toast.error(err.message);
      } else toast.error(SYS_ERR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="modal-head">
        <h3>{edit ? "Sửa thông tin tài khoản" : "Tạo tài khoản"}</h3>
      </div>
      <p className="modal-sub">{edit ? `Đang sửa tài khoản ${account.maTaiKhoan}` : "Cấp tài khoản đăng nhập cho nhân viên đã có trong hệ thống"}</p>

      {edit && (
        <div className="form-row">
          <label>Mã tài khoản</label>
          <input className="input" value={account.maTaiKhoan} readOnly />
        </div>
      )}

      <div className="form-row">
        <label htmlFor="tdn">
          Tên đăng nhập <span className="req">*</span>
        </label>
        <div className="count-wrap">
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
          <span className="count-in">{username.length}/20</span>
        </div>
        {errs.tenDangNhap ? <div className="err">{errs.tenDangNhap}</div> : <div className="hint-row"><span>Tối đa 20 kí tự</span></div>}
      </div>

      <div className="form-row">
        <label htmlFor="mk">Mật khẩu {!edit && <span className="req">*</span>}</label>
        <div className="pw-wrap">
          <input
            id="mk"
            className={`input${errs.matKhau ? " input-error" : ""}`}
            type={show ? "text" : "password"}
            value={password}
            maxLength={50}
            autoComplete="new-password"
            placeholder={edit ? "" : ""}
            onChange={(e) => {
              setPassword(e.target.value);
              setErrs((x) => ({ ...x, matKhau: "" }));
            }}
          />
          <button type="button" className="eye" onClick={() => setShow((s) => !s)} aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>
            <EyeIcon off={show} />
          </button>
        </div>
        {errs.matKhau ? (
          <div className="err">{errs.matKhau}</div>
        ) : (
          <div className="hint-row">
            <span>6-50 ký tự, có ít nhất 1 ký tự đặc biệt (@, #, !)</span>
          </div>
        )}
      </div>

      <div className="choice">
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
            <option value="">— Không thuộc nhân viên nào —</option>
            {emps.map((n) => {
              const taken = n.coTaiKhoan && n.maNhanVien !== (account?.maNhanVien ?? "");
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
      </div>

      <div className="form-row">
        <label>Trạng thái</label>
        <div className="choice">
          <button type="button" className={`choice-btn${status === 1 ? " on" : ""}`} onClick={() => setStatus(1)}>
            Hoạt động
          </button>
          <button type="button" className={`choice-btn${status === 0 ? " on" : ""}`} onClick={() => setStatus(0)}>
            Khóa
          </button>
        </div>
      </div>

      <div className="modal-actions">
        <button type="button" className="btn btn-light" onClick={onClose}>
          Hủy
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
          {edit ? "Lưu thay đổi" : "Tạo"}
        </button>
      </div>
    </Modal>
  );
}
