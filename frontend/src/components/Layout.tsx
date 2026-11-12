import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth, type Role } from "../lib/auth";
import { ConfirmDialog } from "./Modal";

const I = {
  orders: (
    <path d="M6 3h12a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1zM9 8h6M9 12h6" />
  ),
  dish: <path d="M5 8h12v6a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V8zM17 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2" />,
  revenue: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  staff: <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M17 11a2.5 2.5 0 1 0 0-5M21 19a5 5 0 0 0-4-4.9" />,
  account: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21a7 7 0 0 1 14 0" />,
  logout: <path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9" />,
};

const Icon = ({ d }: { d: ReactNode }) => (
  <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  roles: Role[];
  to?: string;
  children?: { label: string; to: string }[];
}

const NAV: NavItem[] = [
  { key: "orders", label: "Quản lý đơn hàng", icon: I.orders, roles: ["manager", "staff"], to: "/orders" },
  { key: "dishes", label: "Quản lý món", icon: I.dish, roles: ["manager", "staff"], to: "/dishes" },
  {
    key: "revenue",
    label: "Quản lý doanh thu",
    icon: I.revenue,
    roles: ["manager"],
    children: [
      { label: "Báo cáo doanh thu", to: "/revenue/report" },
      { label: "So sánh doanh thu", to: "/revenue/compare" },
    ],
  },
  {
    key: "employees",
    label: "Quản lý nhân viên",
    icon: I.staff,
    roles: ["manager"],
    children: [
      { label: "Quản lý thông tin nhân viên", to: "/employees" },
      { label: "Quản lý ca làm", to: "/shifts" },
    ],
  },
  { key: "accounts", label: "Quản lý tài khoản", icon: I.account, roles: ["manager"], to: "/accounts" },
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
                  <Icon d={it.icon} />
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
                <Icon d={it.icon} />
                <span>{it.label}</span>
              </NavLink>
            ),
          )}
        </nav>
        <button type="button" className="nav-item logout" onClick={() => setConfirm(true)}>
          <Icon d={I.logout} />
          <span>Đăng xuất</span>
        </button>
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
      <div className="main">
        <Outlet />
      </div>
      {confirm && (
        <ConfirmDialog
          title="Bạn có chắc chắn muốn đăng xuất?"
          onClose={() => setConfirm(false)}
          buttons={[
            { label: "Không", onClick: () => setConfirm(false) },
            {
              label: "Có",
              variant: "primary",
              onClick: async () => {
                await logout();
                nav("/login", { replace: true });
              },
            },
          ]}
        />
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
          {crumbs.map((c, i) => (
            <span key={i} className={i === crumbs.length - 1 ? "crumb-last" : ""}>
              {c}
              {i < crumbs.length - 1 || crumbs.length === 1 ? " /" : ""}{" "}
            </span>
          ))}
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
