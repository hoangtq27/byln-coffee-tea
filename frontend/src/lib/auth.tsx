import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { get, post, tokenStore } from "./api";

export type Role = "manager" | "staff";
export interface User {
  maTaiKhoan: string;
  tenDangNhap: string;
  maNhanVien: string;
  tenNhanVien: string;
  role: Role;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (u: User, token: string) => void;
  logout: () => Promise<void>;
  forceLogout: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    get<{ user: User }>("/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const forceLogout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    const h = () => forceLogout();
    window.addEventListener("byln:unauthorized", h);
    return () => window.removeEventListener("byln:unauthorized", h);
  }, [forceLogout]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login: (u, token) => {
        tokenStore.set(token);
        setUser(u);
      },
      logout: async () => {
        try {
          await post("/auth/logout");
        } catch {
          /* phiên có thể đã hết hạn */
        }
        forceLogout();
      },
      forceLogout,
    }),
    [user, loading, forceLogout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error("AuthProvider missing");
  return c;
}
