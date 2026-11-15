import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Modal({ children, onClose, wide }: { children: ReactNode; onClose?: () => void; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  // Portal ra <body>: tránh bị cắt khi phần tử cha có transform (hiệu ứng chuyển trang)
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal${wide ? " modal-wide" : ""}`} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmButton {
  label: string;
  /** cancel/warn/ok: màu nút hộp xác nhận xóa theo Figma (đỏ AD4A40 / cam AD7A38 / xanh 4F7559) */
  variant?: "default" | "danger" | "primary" | "cancel" | "warn" | "ok";
  onClick: () => void;
  disabled?: boolean;
}

/** Hộp thoại xác nhận có biểu tượng "?" (nền đỏ nhạt) theo SDD. */
export function ConfirmDialog({
  title,
  detail,
  buttons,
  onClose,
  stacked,
  className,
}: {
  className?: string;
  title: string;
  detail?: string;
  /** Bố cục dọc (Figma "Xóa món"): biểu tượng trên, câu hỏi dưới, hàng nút bên dưới */
  stacked?: boolean;
  buttons: ConfirmButton[];
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose}>
      <div className={`confirm${stacked ? " stacked" : ""}${className ? ` ${className}` : ""}`}>
        <div className="confirm-icon">?</div>
        <h3>{title}</h3>
        {detail && <p className="confirm-detail">{detail}</p>}
        <div className="confirm-actions">
          {buttons.map((b) => (
            <button
              key={b.label}
              type="button"
              disabled={b.disabled}
              className={`btn ${b.variant === "danger" ? "btn-danger" : b.variant === "primary" ? "btn-primary" : b.variant === "cancel" || b.variant === "warn" || b.variant === "ok" ? `btn-c-${b.variant}` : "btn-light"}`}
              onClick={b.onClick}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
