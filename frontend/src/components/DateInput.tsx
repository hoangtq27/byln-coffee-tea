import { useEffect, useRef, useState } from "react";
import { formatDate, parseDisplayDate, toIso, todayIso } from "../lib/format";

const MONTHS = Array.from({ length: 12 }, (_, i) => `Tháng ${i + 1}`);
const DOW = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/** Khung chọn lịch: mũi tên tháng trước/sau, dropdown tháng/năm, lưới thứ Hai -> Chủ nhật. */
function Calendar({ value, onPick }: { value: string; onPick: (iso: string) => void }) {
  const base = value || todayIso();
  const [y, setY] = useState(Number(base.slice(0, 4)));
  const [m, setM] = useState(Number(base.slice(5, 7)));

  const move = (delta: number) => {
    const t = m - 1 + delta;
    setY(y + Math.floor(t / 12));
    setM(((t % 12) + 12) % 12 + 1);
  };
  const first = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const years = Array.from({ length: 21 }, (_, i) => new Date().getFullYear() - 10 + i);
  if (!years.includes(y)) years.push(y);
  years.sort((a, b) => a - b);
  const today = todayIso();

  return (
    <div className="cal" onMouseDown={(e) => e.preventDefault()}>
      <div className="cal-head">
        <button type="button" className="cal-nav" onClick={() => move(-1)} aria-label="Tháng trước">
          ‹
        </button>
        <select value={m} onChange={(e) => setM(Number(e.target.value))} aria-label="Tháng">
          {MONTHS.map((n, i) => (
            <option key={n} value={i + 1}>
              {n}
            </option>
          ))}
        </select>
        <select value={y} onChange={(e) => setY(Number(e.target.value))} aria-label="Năm">
          {years.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button type="button" className="cal-nav" onClick={() => move(1)} aria-label="Tháng sau">
          ›
        </button>
      </div>
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
    </div>
  );
}

interface Props {
  value: string; // ISO yyyy-mm-dd hoặc ""
  onChange: (iso: string) => void;
  placeholder?: string;
  error?: boolean;
  disabled?: boolean;
  id?: string;
}

/** Ô ngày dd/mm/yyyy: gõ trực tiếp hoặc chọn từ khung lịch. */
export function DateInput({ value, onChange, placeholder = "dd/mm/yyyy", error, disabled, id }: Props) {
  const [text, setText] = useState(formatDate(value));
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setText(formatDate(value)), [value]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const commit = (s: string) => {
    if (!s.trim()) return onChange("");
    const iso = parseDisplayDate(s);
    if (iso) onChange(iso);
    else setText(formatDate(value)); // giá trị gõ sai: trả về giá trị hợp lệ gần nhất
  };

  return (
    <div className="date-input" ref={box}>
      <input
        id={id}
        className={`input${error ? " input-error" : ""}`}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        inputMode="numeric"
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
        onFocus={() => !disabled && setOpen(true)}
      />
      <button type="button" className="date-btn" tabIndex={-1} disabled={disabled} onClick={() => setOpen((o) => !o)} aria-label="Chọn ngày">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </button>
      {open && (
        <div className="cal-pop">
          <Calendar
            value={value}
            onPick={(iso) => {
              onChange(iso);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
