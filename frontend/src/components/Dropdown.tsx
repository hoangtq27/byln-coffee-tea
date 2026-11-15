import { useEffect, useRef, useState, type ReactNode } from "react";

export interface DropOption {
  value: string;
  /** Nội dung hiển thị trong danh sách (mặc định = label) */
  node?: ReactNode;
  /** Chữ hiển thị trên ô khi đã chọn */
  label: string;
}

function ChevronDown() {
  return (
    <svg className="dd-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M8 10l4 4 4-4" />
    </svg>
  );
}

function Check() {
  return (
    <svg className="dd-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/**
 * Ô chọn dạng danh sách thả xuống (Figma "Drop list"): placeholder màu 7A7066, mũi tên xuống,
 * danh sách nổi có dấu tích ở mục đang chọn và thanh cuộn khi dài.
 */
export function Dropdown({
  value,
  options,
  placeholder,
  onChange,
  error,
  id,
  listWidth,
}: {
  value: string;
  options: DropOption[];
  placeholder: string;
  onChange: (v: string) => void;
  error?: boolean;
  id?: string;
  /** Độ rộng danh sách (đơn vị px thiết kế); mặc định bằng ô chọn */
  listWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const cur = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), setOpen(false));
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k, true);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k, true);
    };
  }, [open]);

  return (
    <div className="dd" ref={box}>
      <button
        type="button"
        id={id}
        className={`input dd-btn${error ? " input-error" : ""}${cur ? "" : " dd-ph"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="dd-text">{cur ? cur.label : placeholder}</span>
        <ChevronDown />
      </button>
      {open && (
        <ul className="dd-list" role="listbox" style={listWidth ? { width: `calc(${listWidth} * var(--u))` } : undefined}>
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`dd-opt${o.value === value ? " sel" : ""}`}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span className="dd-tick">{o.value === value && <Check />}</span>
                {o.node ?? o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
