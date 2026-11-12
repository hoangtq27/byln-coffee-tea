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

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* ignore */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
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
