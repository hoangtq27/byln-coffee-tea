import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

type ToastType = "success" | "error" | "info";
interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  leaving: boolean;
}
interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

const SHOW_MS = 4000; // thời gian hiển thị
const EXIT_MS = 320; // khớp với thời lượng animation toast-out trong CSS
const GAP = 12; // khoảng cách (px) giữa thông báo và nội dung bị đẩy xuống

/**
 * Không để thông báo đè lên nội dung: tìm phần tử đầu tiên (theo thứ tự trên trang) nằm cùng cột với
 * chồng thông báo — nút thao tác / thanh công cụ / thẻ của trang, hoặc hộp thoại đang mở — và đẩy nó
 * (cùng mọi thứ bên dưới) xuống vừa đủ. Thông báo biến mất thì trả về vị trí cũ.
 */
function useAvoidOverlap(stack: RefObject<HTMLDivElement>, active: boolean) {
  useEffect(() => {
    const pushed = new Map<HTMLElement, "margin" | "top">();
    const set = (el: HTMLElement, mode: "margin" | "top", px: number) => {
      el.dataset.toastPush = String(px);
      if (mode === "top") {
        el.style.position = "relative";
        el.style.top = px ? `${px}px` : "";
      } else {
        el.style.marginTop = px ? `calc(${el.dataset.toastBase} + ${px}px)` : "";
      }
    };
    const release = (el: HTMLElement, mode: "margin" | "top") => {
      set(el, mode, 0);
      setTimeout(() => {
        if (el.dataset.toastPush === "0") {
          delete el.dataset.toastPush;
          delete el.dataset.toastBase;
          if (mode === "top") el.style.position = "";
        }
      }, 300);
    };
    const adjust = () => {
      const box = stack.current;
      let target: HTMLElement | null = null;
      let mode: "margin" | "top" = "margin";
      let px = 0;
      if (box && box.children.length) {
        const sr = box.getBoundingClientRect();
        const modals = document.querySelectorAll<HTMLElement>(".modal-backdrop > .modal");
        const cands = modals.length
          ? [modals[modals.length - 1]]
          : Array.from(document.querySelectorAll<HTMLElement>(".content > .page-head > .page-actions, .content > :not(.page-head)"));
        if (modals.length) mode = "top";
        for (const el of cands) {
          const r = el.getBoundingClientRect();
          if (!r.height || r.right <= sr.left || r.left >= sr.right) continue;
          // độ đẩy thực tế lúc này (kể cả khi đang chuyển động) để tính vị trí gốc
          const cs = getComputedStyle(el);
          const cur = el.dataset.toastPush === undefined ? 0 : modals.length ? parseFloat(cs.top) || 0 : parseFloat(cs.marginTop) - parseFloat(el.dataset.toastBase ?? "0");
          const naturalTop = r.top - cur;
          px = Math.max(0, Math.ceil(sr.bottom + GAP - naturalTop));
          target = el;
          break;
        }
      }
      for (const [el, m] of pushed) {
        if (el !== target || !px) {
          release(el, m);
          pushed.delete(el);
        }
      }
      if (target && px) {
        if (!pushed.has(target)) {
          if (mode === "margin" && target.dataset.toastBase === undefined) target.dataset.toastBase = getComputedStyle(target).marginTop;
          pushed.set(target, mode);
        }
        if (Number(target.dataset.toastPush ?? -1) !== px) set(target, mode, px);
      }
    };
    adjust();
    if (!active) return () => pushed.forEach((m, el) => release(el, m));
    // Trang/hộp thoại có thể đổi khi thông báo đang hiện (chuyển trang, mở hộp thoại) -> kiểm tra định kỳ
    const t = setInterval(adjust, 120);
    window.addEventListener("resize", adjust);
    return () => {
      clearInterval(t);
      window.removeEventListener("resize", adjust);
      pushed.forEach((m, el) => release(el, m));
    };
  }, [stack, active]);
}

/** Thông báo ở góc trên bên phải: trượt ngang vào từ mép phải, tự trượt ra sau vài giây. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const stackRef = useRef<HTMLDivElement>(null);
  useAvoidOverlap(stackRef, items.length > 0);

  const dismiss = useCallback((id: number) => {
    setItems((s) => s.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = Date.now() + Math.random();
      setItems((s) => [...s.slice(-3), { id, type, message, leaving: false }]);
      setTimeout(() => dismiss(id), SHOW_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push("success", m), error: (m) => push("error", m), info: (m) => push("info", m) }),
    [push],
  );
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toast-stack" ref={stackRef} role="status" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.type}${t.leaving ? " leaving" : ""}`}
            onClick={() => dismiss(t.id)}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("ToastProvider missing");
  return c;
}
