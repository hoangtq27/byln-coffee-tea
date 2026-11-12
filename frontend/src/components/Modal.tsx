import { useEffect, type ReactNode } from "react";

export function Modal({ children, onClose, wide }: { children: ReactNode; onClose?: () => void; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal${wide ? " modal-wide" : ""}`} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}

export interface ConfirmButton {
  label: string;
  variant?: "default" | "danger" | "primary";
  onClick: () => void;
  disabled?: boolean;
}

/** Hộp thoại xác nhận có biểu tượng "?" (nền đỏ nhạt) theo SDD. */
export function ConfirmDialog({
  title,
  detail,
  buttons,
  onClose,
}: {
  title: string;
  detail?: string;
  buttons: ConfirmButton[];
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose}>
      <div className="confirm">
        <div className="confirm-icon">?</div>
        <h3>{title}</h3>
        {detail && <p className="confirm-detail">{detail}</p>}
        <div className="confirm-actions">
          {buttons.map((b) => (
            <button
              key={b.label}
              type="button"
              disabled={b.disabled}
              className={`btn ${b.variant === "danger" ? "btn-danger" : b.variant === "primary" ? "btn-primary" : "btn-light"}`}
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
