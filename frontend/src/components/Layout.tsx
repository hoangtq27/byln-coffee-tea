import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth, type Role } from "../lib/auth";
import { Modal } from "./Modal";

/** Biểu tượng đăng xuất (boxicons "bx:log-out" như trên Figma), vẽ bằng SVG nội tuyến — không dùng file ảnh. */
export function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16 13v-2H7V8l-5 4 5 4v-3z" />
      <path d="M20 3h-9c-1.103 0-2 .897-2 2v4h2V5h9v14h-9v-4H9v4c0 1.103.897 2 2 2h9c1.103 0 2-.897 2-2V5c0-1.103-.897-2-2-2z" />
    </svg>
  );
}

interface NavItem {
  key: string;
  label: string;
  glyph: string; // biểu tượng ký tự theo Figma
  roles: Role[];
  to?: string;
  children?: { label: string; to: string }[];
}

const NAV: NavItem[] = [
  { key: "orders", label: "Quản lý đơn hàng", glyph: "▤", roles: ["manager", "staff"], to: "/orders" },
  { key: "dishes", label: "Quản lý món", glyph: "◈", roles: ["manager", "staff"], to: "/dishes" },
  {
    key: "revenue",
    label: "Quản lý doanh thu",
    glyph: "▥",
    roles: ["manager"],
    children: [
      { label: "Báo cáo doanh thu", to: "/revenue/report" },
      { label: "So sánh doanh thu", to: "/revenue/compare" },
    ],
  },
  {
    key: "employees",
    label: "Quản lý nhân viên",
    glyph: "♙",
    roles: ["manager"],
    children: [
      { label: "Quản lý thông tin nhân viên", to: "/employees" },
      { label: "Quản lý ca làm", to: "/shifts" },
    ],
  },
  { key: "accounts", label: "Quản lý tài khoản", glyph: "⚙", roles: ["manager"], to: "/accounts" },
];

export function Shell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [confirm, setConfirm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const inGroup = (it: NavItem) => !!it.children?.some((c) => loc.pathname.startsWith(c.to));

  // Mở nhóm chứa trang hiện tại; đóng drawer mobile khi chuyển trang
  useEffect(() => {
    setOpen((o) => {
      const next = { ...o };
      for (const it of NAV) if (inGroup(it)) next[it.key] = true;
      return next;
    });
    setMenuOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname]);

  useEffect(() => {
    const h = () => setMenuOpen(true);
    window.addEventListener("byln:menu", h);
    return () => window.removeEventListener("byln:menu", h);
  }, []);

  if (!user) return null;
  const items = NAV.filter((n) => n.roles.includes(user.role));

  return (
    <div className="shell">
      <aside className={`sidebar${menuOpen ? " open" : ""}`}>
        <div className="brand">
          <div className="brand-name">BÌNH YÊN LÀ NHÀ</div>
          <div className="brand-sub">COFFEE &amp; TEA</div>
        </div>
        <nav className="nav">
          {items.map((it) =>
            it.children ? (
              <div key={it.key} className="nav-group">
                <button
                  type="button"
                  className={`nav-item${inGroup(it) ? " active" : ""}`}
                  aria-expanded={!!open[it.key]}
                  onClick={() => {
                    if (!inGroup(it)) nav(it.children![0].to);
                    else setOpen((o) => ({ ...o, [it.key]: !o[it.key] }));
                  }}
                >
                  <span className="nav-glyph" aria-hidden="true">{it.glyph}</span>
                  <span>{it.label}</span>
                  <span className={`chev${open[it.key] ? " up" : ""}`}>▾</span>
                </button>
                {open[it.key] && (
                  <div className="nav-sub">
                    {it.children.map((c) => (
                      <NavLink key={c.to} to={c.to} className={({ isActive }) => `nav-subitem${isActive ? " active" : ""}`}>
                        {c.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <NavLink key={it.key} to={it.to!} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
                <span className="nav-glyph" aria-hidden="true">{it.glyph}</span>
                <span>{it.label}</span>
              </NavLink>
            ),
          )}
        </nav>
        <button type="button" className="nav-item logout" onClick={() => setConfirm(true)}>
          <LogoutIcon />
          <span>Đăng xuất</span>
        </button>
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
      <div className="main">
        {/* key = location.key: bấm lại mục menu (kể cả cùng trang) sẽ đưa màn hình về trạng thái ban đầu */}
        <div key={loc.key} style={{ display: "contents" }}>
          <Outlet />
        </div>
      </div>
      {confirm && (
        <Modal onClose={() => setConfirm(false)}>
          <div className="logout-dialog">
            <div className="logout-icon">
              <LogoutIcon />
            </div>
            <h3>Đăng xuất</h3>
            <p>Bạn có chắc chắn muốn đăng xuất?</p>
            <div className="two">
              <button type="button" className="btn btn-light" onClick={() => setConfirm(false)}>
                Không
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  await logout();
                  nav("/login", { replace: true });
                }}
              >
                Có
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Khung trang: thanh tiêu đề (breadcrumb + vai trò) và nội dung. */
export function Page({ crumbs, title, actions, children }: { crumbs: string[]; title?: string; actions?: ReactNode; children: ReactNode }) {
  const { user } = useAuth();
  const isMgr = user?.role === "manager";
  return (
    <>
      <header className="topbar">
        <button type="button" className="hamburger" aria-label="Mở menu" onClick={() => window.dispatchEvent(new Event("byln:menu"))}>
          ☰
        </button>
        <div className="crumbs">
          {crumbs.length === 1 ? `${crumbs[0]} /` : crumbs.join(" / ")}
        </div>
        <div className="who">
          <span className="avatar">{isMgr ? "QL" : "NV"}</span>
          <span className="who-text">Đang đăng nhập với vai trò {isMgr ? "Quản lý" : "Nhân viên"}.</span>
        </div>
      </header>
      <div className="content">
        {(title || actions) && (
          <div className="page-head">
            {title && <h1>{title}</h1>}
            {actions && <div className="page-actions">{actions}</div>}
          </div>
        )}
        {children}
      </div>
    </>
  );
}
