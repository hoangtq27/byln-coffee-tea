const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const TOKEN_KEY = "byln_token";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

/*
 * Phiên đăng nhập gắn với tab: token lưu trong sessionStorage (mất khi đóng tab).
 * Trình duyệt có thể khôi phục sessionStorage khi mở lại tab vừa đóng (Ctrl+Shift+T),
 * nên khi rời trang (pagehide) ta ghi lại thời điểm; nếu trang được mở lại sau quá
 * RELOAD_GRACE_MS thì coi như tab đã bị đóng -> xóa token (đăng xuất). Tải lại trang (F5)
 * diễn ra trong vài giây nên không bị đăng xuất.
 */
const LEFT_AT_KEY = "byln_left_at";
const RELOAD_GRACE_MS = 5000;

const ss = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
  del: (k: string) => {
    try {
      sessionStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

/** Trả về true nếu phát hiện tab đã bị đóng rồi mở lại (và đã xóa token). */
function expireIfTabWasClosed(): boolean {
  const left = ss.get(LEFT_AT_KEY);
  ss.del(LEFT_AT_KEY);
  if (left && Date.now() - Number(left) > RELOAD_GRACE_MS && ss.get(TOKEN_KEY)) {
    ss.del(TOKEN_KEY);
    return true;
  }
  return false;
}

try {
  localStorage.removeItem(TOKEN_KEY); // token cũ từng lưu lâu dài -> bỏ
} catch {
  /* ignore */
}
expireIfTabWasClosed();
window.addEventListener("pagehide", () => ss.set(LEFT_AT_KEY, String(Date.now())));
window.addEventListener("pageshow", (e) => {
  if (!e.persisted) return; // trang được khôi phục từ bộ nhớ đệm (back/forward)
  if (expireIfTabWasClosed()) window.dispatchEvent(new CustomEvent("byln:unauthorized"));
});

export const tokenStore = {
  get: () => ss.get(TOKEN_KEY),
  set: (t: string) => ss.set(TOKEN_KEY, t),
  clear: () => ss.del(TOKEN_KEY),
};

type Query = Record<string, string | number | undefined | null>;

export async function api<T = any>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  opts: { body?: unknown; query?: Query } = {},
): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  const url = `${BASE}/api${path}${qs.toString() ? `?${qs}` : ""}`;
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau!");
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith("/auth/login")) {
      window.dispatchEvent(new CustomEvent("byln:unauthorized", { detail: data?.message }));
    }
    throw new ApiError(res.status, data?.message ?? "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau!", data?.fields ?? {});
  }
  return data as T;
}

export const get = <T = any>(path: string, query?: Query) => api<T>("GET", path, { query });
export const post = <T = any>(path: string, body?: unknown) => api<T>("POST", path, { body: body ?? {} });
export const put = <T = any>(path: string, body?: unknown) => api<T>("PUT", path, { body: body ?? {} });
export const del = <T = any>(path: string) => api<T>("DELETE", path);
