import { motion } from "motion/react";
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn, fmtPop, PRIORITY_COLOR } from "../../lib/format";
import type { Priority } from "../../lib/types";

/** Categorical series palette, validated for the dark surface (blue, amber, violet). */
export const SERIES = ["#4f8dff", "#c98326", "#c26bd6"];
const DASH = [undefined, "6 4", "2 3"];
const GRID = "rgb(120 160 230 / 0.10)";
const AXIS = "#5d6d8f";

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.max(200, el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = (count * step) / span;
  const mult = err <= 0.15 ? 10 : err <= 0.35 ? 5 : err <= 0.75 ? 2 : 1;
  const s = step * mult;
  const out: number[] = [];
  for (let v = Math.ceil(min / s) * s; v <= max + 1e-9; v += s) out.push(Number(v.toFixed(6)));
  return out;
}

function Tooltip({ x, y, children, w }: { x: number; y: number; children: ReactNode; w: number }) {
  const left = x > w - 190 ? x - 180 : x + 14;
  return (
    <div className="pointer-events-none absolute z-20 min-w-36 rounded-md border border-line-strong bg-ink-900/95 px-2.5 py-2 text-[11px] shadow-xl backdrop-blur" style={{ left, top: Math.max(0, y - 10) }}>
      {children}
    </div>
  );
}

export interface Series {
  name: string;
  points: { x: number; y: number }[];
  color?: string;
}

/** Multi-series line chart: one y-axis, 2px lines, crosshair tooltip, legend and direct end labels. */
export function LineChart({ series, height = 220, xLabel, yLabel, xFormat = (v) => String(v), yFormat = (v) => v.toFixed(1), yDomain, markers }: {
  series: Series[];
  height?: number;
  xLabel?: string;
  yLabel?: string;
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  yDomain?: [number, number];
  markers?: { x: number; label: string }[];
}) {
  const { ref, w } = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 40, r: 88, t: 14, b: 30 };
  const all = series.flatMap((s) => s.points);
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = yDomain?.[0] ?? Math.max(0, Math.floor(Math.min(...ys) - 2));
  const yMax = yDomain?.[1] ?? Math.ceil(Math.max(...ys) + 2);
  const X = (v: number) => pad.l + ((v - xMin) / (xMax - xMin || 1)) * (w - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (height - pad.t - pad.b);
  const xVals = [...new Set(xs)].sort((a, b) => a - b);
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left;
    let best = xVals[0];
    for (const v of xVals) if (Math.abs(X(v) - mx) < Math.abs(X(best) - mx)) best = v;
    setHover(best);
  };
  return (
    <div ref={ref} className="relative w-full">
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-3 px-1 text-[11px] text-mute">
          {series.map((s, i) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <svg width="18" height="4">
                <line x1="0" y1="2" x2="18" y2="2" stroke={s.color ?? SERIES[i]} strokeWidth="2" strokeDasharray={DASH[i]} />
              </svg>
              {s.name}
            </span>
          ))}
        </div>
      )}
      <svg width={w} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} className="block">
        {niceTicks(yMin, yMax).map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} stroke={GRID} />
            <text x={pad.l - 8} y={Y(t) + 3} textAnchor="end" fontSize="10" fill={AXIS} fontFamily="Geist Mono">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {niceTicks(xMin, xMax, 6).map((t) => (
          <text key={t} x={X(t)} y={height - 10} textAnchor="middle" fontSize="10" fill={AXIS} fontFamily="Geist Mono">
            {xFormat(t)}
          </text>
        ))}
        {xLabel && (
          <text x={w - pad.r} y={height - 10} textAnchor="start" dx="6" fontSize="10" fill={AXIS}>
            {xLabel}
          </text>
        )}
        {yLabel && (
          <text x={pad.l} y={pad.t - 4} fontSize="10" fill={AXIS}>
            {yLabel}
          </text>
        )}
        {markers?.map((m) => (
          <g key={m.label}>
            <line x1={X(m.x)} x2={X(m.x)} y1={pad.t} y2={height - pad.b} stroke="#8cc8ff" strokeDasharray="2 4" strokeOpacity={0.5} />
            <text x={X(m.x) + 4} y={pad.t + 10} fontSize="9.5" fill="#93a3c4" fontFamily="Geist Mono">
              {m.label}
            </text>
          </g>
        ))}
        {series.map((s, i) => {
          const c = s.color ?? SERIES[i];
          const d = s.points.map((p, k) => `${k ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
          const last = s.points[s.points.length - 1];
          return (
            <g key={s.name}>
              <motion.path d={d} fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={DASH[i]} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: "easeOut" }} />
              {last && (
                <text x={X(last.x) + 8} y={Y(last.y) + 3} fontSize="10.5" fill="#c9d6ee">
                  {s.name.length > 12 ? `${s.name.slice(0, 11)}…` : s.name} · {yFormat(last.y)}
                </text>
              )}
            </g>
          );
        })}
        {hover != null && (
          <g>
            <line x1={X(hover)} x2={X(hover)} y1={pad.t} y2={height - pad.b} stroke="#8cc8ff" strokeOpacity={0.45} />
            {series.map((s, i) => {
              const p = s.points.find((q) => q.x === hover);
              return p ? <circle key={s.name} cx={X(p.x)} cy={Y(p.y)} r={4} fill={s.color ?? SERIES[i]} stroke="#07101f" strokeWidth={2} /> : null;
            })}
          </g>
        )}
      </svg>
      {hover != null && (
        <Tooltip x={X(hover)} y={20} w={w}>
          <div className="mb-1 font-mono text-[10px] text-dim">{xLabel ? `${xLabel} ` : ""}{xFormat(hover)}</div>
          {series.map((s, i) => {
            const p = s.points.find((q) => q.x === hover);
            return p ? (
              <div key={s.name} className="flex items-center justify-between gap-3 text-[#d8e4fb]">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: s.color ?? SERIES[i] }} />
                  {s.name}
                </span>
                <span className="font-mono">{yFormat(p.y)}</span>
              </div>
            ) : null;
          })}
        </Tooltip>
      )}
    </div>
  );
}

/** Histogram with hover per bar and optional percentile markers. */
export function Histogram({ bins, height = 150, format = fmtPop, markers = [] }: { bins: { start: number; end: number; count: number }[]; height?: number; format?: (v: number) => string; markers?: { value: number; label: string }[] }) {
  const { ref, w } = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bins.map((b) => b.count));
  const total = bins.reduce((a, b) => a + b.count, 0) || 1;
  const pad = { l: 8, r: 8, t: 16, b: 24 };
  const bw = (w - pad.l - pad.r) / Math.max(1, bins.length);
  const lo = bins[0]?.start ?? 0;
  const hi = bins[bins.length - 1]?.end ?? 1;
  const X = (v: number) => pad.l + ((v - lo) / (hi - lo || 1)) * (w - pad.l - pad.r);
  return (
    <div ref={ref} className="relative w-full">
      <svg width={w} height={height} className="block" onMouseLeave={() => setHover(null)}>
        {bins.map((b, i) => {
          const h = (b.count / max) * (height - pad.t - pad.b);
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={height - pad.t - pad.b} fill="transparent" />
              <motion.rect
                x={pad.l + i * bw + 1}
                width={Math.max(1, bw - 2)}
                rx={3}
                fill={hover === i ? "#8cc8ff" : "#4f8dff"}
                initial={{ height: 0, y: height - pad.b }}
                animate={{ height: h, y: height - pad.b - h }}
                transition={{ duration: 0.7, delay: i * 0.03 }}
              />
            </g>
          );
        })}
        <line x1={pad.l} x2={w - pad.r} y1={height - pad.b} y2={height - pad.b} stroke={GRID} />
        {markers.map((m) => (
          <g key={m.label}>
            <line x1={X(m.value)} x2={X(m.value)} y1={pad.t - 6} y2={height - pad.b} stroke="#e8eefc" strokeDasharray="3 3" strokeOpacity={0.6} />
            <text x={X(m.value)} y={pad.t - 8} textAnchor="middle" fontSize="9.5" fill="#c9d6ee" fontFamily="Geist Mono">
              {m.label}
            </text>
          </g>
        ))}
        <text x={pad.l} y={height - 6} fontSize="10" fill={AXIS} fontFamily="Geist Mono">
          {format(lo)}
        </text>
        <text x={w - pad.r} y={height - 6} textAnchor="end" fontSize="10" fill={AXIS} fontFamily="Geist Mono">
          {format(hi)}
        </text>
      </svg>
      {hover != null && bins[hover] && (
        <Tooltip x={pad.l + hover * bw + bw / 2} y={10} w={w}>
          <div className="font-mono text-[10px] text-dim">
            {format(bins[hover].start)} – {format(bins[hover].end)}
          </div>
          <div className="text-[#d8e4fb]">
            {bins[hover].count} runs · {((bins[hover].count / total) * 100).toFixed(1)}%
          </div>
        </Tooltip>
      )}
    </div>
  );
}

export interface MatrixPoint {
  id: string;
  x: number;
  y: number;
  size?: number;
  priority: Priority;
  label?: string;
}

/** Likelihood × impact scatter with quadrant shading, hover and click. */
export function RiskMatrix({ points, height = 340, selected, onSelect, labelTop = 6 }: { points: MatrixPoint[]; height?: number; selected?: string | null; onSelect?: (id: string) => void; labelTop?: number }) {
  const { ref, w } = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<MatrixPoint | null>(null);
  const pad = { l: 44, r: 16, t: 14, b: 34 };
  const X = (v: number) => pad.l + v * (w - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - v) * (height - pad.t - pad.b);
  const ranked = [...points].sort((a, b) => b.x * b.y - a.x * a.y);
  const labelled = new Set(ranked.slice(0, labelTop).map((p) => p.id));
  return (
    <div ref={ref} className="relative w-full">
      <svg width={w} height={height} className="block">
        <rect x={X(0.5)} y={Y(1)} width={X(1) - X(0.5)} height={Y(0.5) - Y(1)} fill="rgb(244 63 94 / 0.07)" />
        <rect x={X(0)} y={Y(1)} width={X(0.5) - X(0)} height={Y(0.5) - Y(1)} fill="rgb(251 191 36 / 0.04)" />
        <rect x={X(0.5)} y={Y(0.5)} width={X(1) - X(0.5)} height={Y(0) - Y(0.5)} fill="rgb(251 191 36 / 0.04)" />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={X(0)} x2={X(1)} y1={Y(t)} y2={Y(t)} stroke={GRID} />
            <line y1={Y(0)} y2={Y(1)} x1={X(t)} x2={X(t)} stroke={GRID} />
            <text x={X(0) - 8} y={Y(t) + 3} textAnchor="end" fontSize="10" fill={AXIS} fontFamily="Geist Mono">
              {Math.round(t * 100)}%
            </text>
            <text x={X(t)} y={height - 16} textAnchor="middle" fontSize="10" fill={AXIS} fontFamily="Geist Mono">
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        <text x={X(1)} y={height - 3} textAnchor="end" fontSize="10.5" fill="#93a3c4">
          Likelihood of compromise →
        </text>
        <text transform={`translate(11 ${Y(1)}) rotate(90)`} fontSize="10.5" fill="#93a3c4">
          Systemic impact →
        </text>
        <text x={X(0.98)} y={Y(0.97)} textAnchor="end" fontSize="10" fill="#f43f5e" fontFamily="Geist Mono" opacity={0.8}>
          ACT NOW
        </text>
        {points.map((p) => {
          const c = PRIORITY_COLOR[p.priority];
          const r = 5 + (p.size ?? 0.3) * 7;
          const sel = selected === p.id;
          return (
            <g key={p.id} className="cursor-pointer" onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onClick={() => onSelect?.(p.id)}>
              <circle cx={X(p.x)} cy={Y(p.y)} r={r + 8} fill="transparent" />
              {sel && <circle cx={X(p.x)} cy={Y(p.y)} r={r + 6} fill="none" stroke="#e8eefc" strokeWidth={1.5} strokeDasharray="3 3" />}
              <motion.circle
                initial={{ cx: X(0), cy: Y(0), opacity: 0 }}
                animate={{ cx: X(p.x), cy: Y(p.y), opacity: 1 }}
                transition={{ type: "spring", stiffness: 120, damping: 18 }}
                r={r}
                fill={c}
                fillOpacity={0.78}
                stroke="#07101f"
                strokeWidth={2}
              />
              {labelled.has(p.id) && (
                <text x={X(p.x) + r + 5} y={Y(p.y) + 3.5} fontSize="10.5" fill="#d8e4fb" fontFamily="Geist Mono">
                  {p.label ?? p.id}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover && (
        <Tooltip x={X(hover.x)} y={Y(hover.y) - 30} w={w}>
          <div className="font-mono text-[11px] font-semibold text-white">{hover.id}</div>
          <div className="text-[#c9d6ee]">Likelihood {(hover.x * 100).toFixed(0)}% · Impact {(hover.y * 100).toFixed(0)}%</div>
          <div className="mt-0.5 text-[10px] text-dim">Priority {hover.priority}</div>
        </Tooltip>
      )}
    </div>
  );
}

/** Horizontal bars with labels; values in text tokens, colour only on the mark. */
export function BarList({ rows, max, format = (v) => v.toFixed(0), onClick }: { rows: { id: string; label: ReactNode; value: number; color?: string; sub?: ReactNode }[]; max?: number; format?: (v: number) => string; onClick?: (id: string) => void }) {
  const m = max ?? Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={r.id} onClick={() => onClick?.(r.id)} className={cn("group", onClick && "cursor-pointer")}>
          <div className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className="truncate text-[#d3e0f7] group-hover:text-white">{r.label}</span>
            <span className="shrink-0 font-mono text-[11px] text-mute">{format(r.value)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
            <motion.div className="h-full rounded-full" style={{ background: r.color ?? "#4f8dff" }} initial={{ width: 0 }} animate={{ width: `${(Math.abs(r.value) / m) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.04 }} />
          </div>
          {r.sub && <div className="mt-0.5 text-[10.5px] text-dim">{r.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ values, color = "#4f8dff", height = 34, width = 120 }: { values: number[]; color?: string; height?: number; width?: number }) {
  const id = useMemo(() => `sp-${Math.random().toString(36).slice(2, 8)}`, []);
  if (values.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const X = (i: number) => (i / (values.length - 1)) * width;
  const Y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  const d = values.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} className="block overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={X(values.length - 1)} cy={Y(values[values.length - 1])} r={2.5} fill={color} />
    </svg>
  );
}

/** Headline number on a ring, for a single value like the systemic risk index. */
export function RingGauge({ value, max = 100, color, size = 150, label, sub }: { value: number; max?: number; color: string; size?: number; label: string; sub?: ReactNode }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, value / max));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(120 160 230 / 0.12)" strokeWidth={8} />
        {Array.from({ length: 40 }).map((_, i) => {
          const a = (i / 40) * Math.PI * 2;
          return <line key={i} x1={size / 2 + Math.cos(a) * (r + 7)} y1={size / 2 + Math.sin(a) * (r + 7)} x2={size / 2 + Math.cos(a) * (r + 9)} y2={size / 2 + Math.sin(a) * (r + 9)} stroke="rgb(140 180 255 / 0.25)" />;
        })}
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - frac) }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-mono text-[34px] leading-none font-semibold text-white tabular-nums">{value.toFixed(1)}</div>
        <div className="mt-1 font-mono text-[9.5px] tracking-[0.18em] text-dim uppercase">{label}</div>
        {sub && <div className="mt-1.5">{sub}</div>}
      </div>
    </div>
  );
}
