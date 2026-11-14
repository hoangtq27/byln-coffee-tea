import { formatVnd } from "../lib/format";

const BROWN = "#402b21";
const TAN = "#d9c9b4";

function shortMoney(n: number): string {
  if (n >= 1e9) return `${+(n / 1e9).toFixed(1)} tỷ`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)} tr`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

/** Biểu đồ cột (SVG). Cột cao nhất tô nâu đậm; cuộn ngang khi có nhiều mốc. */
export function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 0);
  const maxIdx = max > 0 ? data.findIndex((d) => d.value === max) : -1;
  const n = data.length;
  // Figma: cột rộng 44px; nhiều mốc thì thu hẹp cột để vừa khung, quá nhiều thì cuộn ngang
  const barW = n <= 10 ? 44 : n <= 16 ? 32 : 22, gap = n <= 10 ? 54 : barW * 0.6, padL = 70, padB = 44, padT = 16, h = 320;
  const w = padL + data.length * (barW + gap) + gap;
  const plotH = h - padB - padT;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = Math.max(1, Math.ceil(data.length / 16));
  const vw = Math.max(w, 820);
  const fit = vw <= 1250; // vừa khung: co giãn theo chiều rộng thẻ

  return (
    <div className="chart-scroll">
      <svg viewBox={`0 0 ${vw} ${h}`} style={fit ? { width: "100%", height: "auto" } : { width: vw, height: h }} role="img" aria-label="Biểu đồ doanh thu">
        {ticks.map((t) => {
          const y = padT + plotH * (1 - t);
          return (
            <g key={t}>
              <line x1={padL} x2={vw} y1={y} y2={y} stroke="#e3dbd1" strokeDasharray={t === 0 ? "" : "3 3"} />
              <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="16" fill="#7a7066">
                {shortMoney(max * t)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const bh = max > 0 ? (d.value / max) * plotH : 0;
          const x = padL + gap + i * (barW + gap);
          return (
            <g key={i}>
              <rect x={x} y={padT + plotH - bh} width={barW} height={bh} rx="3" fill={i === maxIdx ? BROWN : TAN}>
                <title>{`${d.label}: ${formatVnd(d.value)}`}</title>
              </rect>
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={h - 14} textAnchor="middle" fontSize="16" fill="#7a7066">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Biểu đồ thanh ngang đối chiếu 2 kỳ. */
export function CompareBars({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const top = items.findIndex((i) => i.value === Math.max(...items.map((x) => x.value)));
  return (
    <div className="hbars">
      {items.map((it, i) => (
        <div className="hbar-row" key={it.label}>
          <div className="hbar-label">{it.label}</div>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${(it.value / max) * 100}%`, background: i === top ? BROWN : TAN }} />
          </div>
          <div className="hbar-value">{formatVnd(it.value)}</div>
        </div>
      ))}
    </div>
  );
}
