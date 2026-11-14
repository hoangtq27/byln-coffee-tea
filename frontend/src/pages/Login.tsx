import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ApiError, get, post } from "../lib/api";
import { useAuth, type User } from "../lib/auth";
import { useToast } from "../components/Toast";

export default function Login() {
  const { user, login } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [errs, setErrs] = useState<{ u?: string; p?: string }>({});
  const [bad, setBad] = useState(false); // sai thông tin / bị khóa -> viền đỏ cả hai ô
  const [busy, setBusy] = useState(false);

  // "Đánh thức" backend (Render Free ngủ sau ~15 phút) và CSDL ngay khi mở màn hình đăng nhập,
  // để lúc bấm "Đăng nhập" không phải chờ khởi động lạnh.
  useEffect(() => {
    get("/health").catch(() => undefined);
  }, []);

  if (user) return <Navigate to="/orders" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errs = {};
    if (!u.trim()) next.u = "Vui lòng nhập đầy đủ thông tin";
    if (!p) next.p = "Vui lòng nhập đầy đủ thông tin";
    setErrs(next);
    setBad(false);
    if (next.u || next.p) return;
    setBusy(true);
    try {
      const r = await post<{ token: string; user: User }>("/auth/login", { tenDangNhap: u.trim(), matKhau: p });
      login(r.user, r.token);
      nav("/orders", { replace: true });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau!";
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) setBad(true);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit} noValidate>
        <h1>Chào buổi sáng!</h1>
        <p className="login-sub">Đăng nhập để vào hệ thống quản lý</p>

        <label htmlFor="u">Tên đăng nhập</label>
        <input
          id="u"
          className={`input${errs.u || bad ? " input-error" : ""}`}
          value={u}
          autoComplete="username"
          maxLength={50}
          onChange={(e) => setU(e.target.value)}
        />
        {errs.u && <div className="err err-right">{errs.u}</div>}

        <label htmlFor="p">Mật khẩu</label>
        <input
          id="p"
          type="password"
          className={`input${errs.p || bad ? " input-error" : ""}`}
          value={p}
          autoComplete="current-password"
          maxLength={100}
          onChange={(e) => setP(e.target.value)}
        />
        {errs.p && <div className="err err-right">{errs.p}</div>}

        <button className="btn btn-primary btn-block" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : null}
          {busy ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
        <div className="login-foot">Bình Yên Là Nhà Coffee &amp; Tea</div>
      </form>
    </div>
  );
}
