import { useEffect, useRef, useState } from "react";
import { formatDate, parseDisplayDate, toIso, todayIso } from "../lib/format";

const DOW = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function Chevron({ up }: { up?: boolean }) {
  return (
    <svg className="cal-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d={up ? "M7 14l5-5 5 5" : "M7 10l5 5 5-5"} />
    </svg>
  );
}

/**
 * Khung chọn lịch (Figma "Khung chọn thời gian"): mũi tên tháng trước/sau,
 * nút "Tháng n" và "năm" bấm để chọn nhanh, lưới ngày từ Thứ Hai (T2) đến Chủ nhật (CN).
 */
export function Calendar({ value, onPick }: { value: string; onPick: (iso: string) => void }) {
  const base = value || todayIso();
  const [y, setY] = useState(Number(base.slice(0, 4)));
  const [m, setM] = useState(Number(base.slice(5, 7)));
  const [mode, setMode] = useState<"day" | "month" | "year">("day");
  const [yearPage, setYearPage] = useState(Number(base.slice(0, 4)) - 5);

  const move = (delta: number) => {
    if (mode === "year") return setYearPage((p) => p + delta * 12);
    if (mode === "month") return setY((v) => v + delta);
    const t = m - 1 + delta;
    setY(y + Math.floor(t / 12));
    setM((((t % 12) + 12) % 12) + 1);
  };
  const first = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = todayIso();

  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" className="cal-nav" onClick={() => move(-1)} aria-label="Trước">
          ‹
        </button>
        <button type="button" className={`cal-pick${mode === "month" ? " on" : ""}`} onClick={() => setMode(mode === "month" ? "day" : "month")}>
          Tháng {m} <Chevron up={mode === "month"} />
        </button>
        <button
          type="button"
          className={`cal-pick${mode === "year" ? " on" : ""}`}
          onClick={() => {
            setYearPage(y - 5);
            setMode(mode === "year" ? "day" : "year");
          }}
        >
          {y} <Chevron up={mode === "year"} />
        </button>
        <button type="button" className="cal-nav" onClick={() => move(1)} aria-label="Sau">
          ›
        </button>
      </div>

      {mode === "month" && (
        <div className="cal-grid3">
          {Array.from({ length: 12 }, (_, i) => (
            <button
              type="button"
              key={i}
              className={`cal-cell${i + 1 === m ? " sel" : ""}`}
              onClick={() => {
                setM(i + 1);
                setMode("day");
              }}
            >
              Tháng {i + 1}
            </button>
          ))}
        </div>
      )}

      {mode === "year" && (
        <div className="cal-grid3">
          {Array.from({ length: 12 }, (_, i) => yearPage + i).map((yy) => (
            <button
              type="button"
              key={yy}
              className={`cal-cell${yy === y ? " sel" : ""}`}
              onClick={() => {
                setY(yy);
                setMode("day");
              }}
            >
              {yy}
            </button>
          ))}
        </div>
      )}

      {mode === "day" && (
        <div className="cal-grid">
          {DOW.map((d) => (
            <div key={d} className="cal-dow">
              {d}
            </div>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <div key={i} />;
            const iso = toIso(y, m, d);
            return (
              <button
                type="button"
                key={i}
                className={`cal-day${iso === value ? " sel" : ""}${iso === today ? " today" : ""}`}
                onClick={() => onPick(iso)}
              >
                {d}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

interface Props {
  value: string; // ISO yyyy-mm-dd hoặc ""
  onChange: (iso: string) => void;
  placeholder?: string;
  error?: boolean;
  disabled?: boolean;
  id?: string;
  /**
   * "default": gõ dd/mm/yyyy hoặc chọn từ lịch (có icon lịch).
   * "plain": chỉ hiển thị giá trị (trống thì không hiện gì, không icon) — bấm vào để mở khung chọn lịch.
   * "icon": chỉ là nút biểu tượng lịch (màn Quản lý ca làm).
   */
  variant?: "default" | "plain" | "icon";
  className?: string;
  /** variant "icon": chữ hiển thị sát bên phải icon (vd "Thứ Hai, 09/11/2026") */
  label?: string;
}

/** Ô ngày: gõ trực tiếp hoặc chọn từ khung lịch. */
export function DateInput({ value, onChange, placeholder = "dd/mm/yyyy", error, disabled, id, variant = "default", className, label }: Props) {
  const [text, setText] = useState(formatDate(value));
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setText(formatDate(value)), [value]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open]);

  const commit = (s: string) => {
    if (!s.trim()) return onChange("");
    const iso = parseDisplayDate(s);
    if (iso) onChange(iso);
    else setText(formatDate(value)); // giá trị gõ sai: trả về giá trị hợp lệ gần nhất
  };

  const pop = open && (
    <div className="cal-pop">
      <Calendar
        value={value}
        onPick={(iso) => {
          onChange(iso);
          setOpen(false);
        }}
      />
    </div>
  );

  if (variant === "icon")
    return (
      <div className={`date-input date-icon ${className ?? ""}`} ref={box}>
        <button type="button" className="date-icon-btn" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-label="Chọn ngày">
          <CalendarIcon />
          {label && <span className="date-icon-label">{label}</span>}
        </button>
        {pop}
      </div>
    );

  if (variant === "plain")
    return (
      <div className={`date-input date-plain ${className ?? ""}`} ref={box}>
        <button
          type="button"
          id={id}
          className={`input date-plain-btn${error ? " input-error" : ""}`}
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
        >
          {formatDate(value)}
        </button>
        {pop}
      </div>
    );

  return (
    <div className={`date-input ${className ?? ""}`} ref={box}>
      <input
        id={id}
        className={`input${error ? " input-error" : ""}`}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        inputMode="numeric"
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          commit(e.target.value);
          // rời khỏi ô (không phải bấm vào khung lịch) -> đóng khung lịch
          if (!box.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
        }}
        onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
        onFocus={() => !disabled && setOpen(true)}
      />
      <button type="button" className="date-btn" tabIndex={-1} disabled={disabled} onClick={() => setOpen((o) => !o)} aria-label="Chọn ngày">
        <CalendarIcon />
      </button>
      {pop}
    </div>
  );
}
