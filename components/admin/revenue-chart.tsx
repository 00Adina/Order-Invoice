"use client";
import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/money";

export interface DailyPoint {
  day: string;
  revenue: number;
  orders: number;
}

function niceMax(v: number) {
  if (v <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

const W = 720;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 56 };

/** Single-series daily revenue bars: one hue, 2px gaps, 4px rounded tops, per-bar hover tooltip. */
export function RevenueChart({ data, currency }: { data: DailyPoint[]; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = useMemo(() => niceMax(Math.max(...data.map((d) => d.revenue), 0)), [data]);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(data.length, 1);
  const gap = 2;
  const barW = Math.max(slot - gap, 1);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const short = (d: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(d));
  const compact = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(v);

  const hovered = hover !== null ? data[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Daily revenue bar chart" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
              {compact(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD.left + i * slot + gap / 2;
          const top = y(d.revenue);
          const h = PAD.top + innerH - top;
          const r = Math.min(4, barW / 2, h);
          const base = PAD.top + innerH;
          const path =
            h <= 0
              ? ""
              : `M${x},${base} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + barW - r},${top} Q${x + barW},${top} ${x + barW},${top + r} L${x + barW},${base} Z`;
          return (
            <g key={d.day}>
              {path && <path d={path} className={hover === i ? "fill-primary" : "fill-primary/75"} />}
              {/* hit target taller and wider than the mark */}
              <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          );
        })}
        {data.length > 0 &&
          [0, Math.floor((data.length - 1) / 2), data.length - 1].map((i) => (
            <text
              key={i}
              x={PAD.left + i * slot + slot / 2}
              y={H - 6}
              textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
              className="fill-muted-foreground text-[11px]"
            >
              {short(data[i].day)}
            </text>
          ))}
      </svg>
      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
          style={{ left: `${((PAD.left + hover * slot + slot / 2) / W) * 100}%` }}
        >
          <p className="font-medium">{short(hovered.day)}</p>
          <p className="tabular-nums">{formatMoney(hovered.revenue, currency)}</p>
          <p className="text-muted-foreground">
            {hovered.orders} order{hovered.orders === 1 ? "" : "s"}
          </p>
        </div>
      )}
      <table className="sr-only">
        <caption>Daily revenue</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Revenue</th>
            <th>Orders</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td>{formatMoney(d.revenue, currency)}</td>
              <td>{d.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
