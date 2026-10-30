import { motion } from "motion/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn, PRIORITY_COLOR, SEVERITY_COLOR, STATE_COLOR, scoreColor } from "../../lib/format";
import type { Priority } from "../../lib/types";

export function Panel({ children, className, brackets = true, glow }: { children: ReactNode; className?: string; brackets?: boolean; glow?: string }) {
  return (
    <div
      className={cn("hud", brackets && "hud-brackets", className)}
      style={glow ? { boxShadow: `inset 0 1px 0 rgb(140 200 255 / 0.06), 0 0 0 1px ${glow}33, 0 0 40px -10px ${glow}66` } : undefined}
    >
      {children}
    </div>
  );
}

export function PanelHeader({ title, icon, right, sub }: { title: ReactNode; icon?: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="text-volt-2">{icon}</span>}
        <div className="min-w-0">
          <div className="truncate font-mono text-[11px] font-medium tracking-[0.14em] text-volt-2 uppercase">{title}</div>
          {sub && <div className="truncate text-[11px] text-dim">{sub}</div>}
        </div>
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

export function PriorityPill({ priority, className }: { priority: Priority; className?: string }) {
  const c = PRIORITY_COLOR[priority];
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider", className)}
      style={{ color: c, background: `${c}1a`, boxShadow: `inset 0 0 0 1px ${c}55` }}
    >
      {priority === "NOW" && <span className="size-1.5 animate-pulse rounded-full" style={{ background: c }} />}
      {priority}
    </span>
  );
}

export function Badge({ children, color = "#8cc8ff", className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] tracking-wide whitespace-nowrap", className)}
      style={{ color, background: `${color}14`, boxShadow: `inset 0 0 0 1px ${color}40` }}
    >
      {children}
    </span>
  );
}

export function StateBadge({ state }: { state: string }) {
  return <Badge color={STATE_COLOR[state] ?? "#8cc8ff"}>{state.replace("_", " ")}</Badge>;
}

export function SeverityDot({ severity, pulse }: { severity: string; pulse?: boolean }) {
  const c = SEVERITY_COLOR[severity] ?? "#5d6d8f";
  return (
    <span className="relative inline-flex size-2">
      {pulse && <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: c }} />}
      <span className="relative inline-flex size-2 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
    </span>
  );
}

type Variant = "primary" | "ghost" | "danger" | "outline";
export function Button({ variant = "outline", size = "md", className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const base = "relative inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none select-none";
  const sizes = { sm: "h-7 px-2.5 text-xs", md: "h-9 px-3.5 text-sm", lg: "h-12 px-6 text-[15px]" };
  const variants: Record<Variant, string> = {
    primary: "bg-volt text-white shadow-[0_0_0_1px_rgb(140,200,255,0.4),0_8px_30px_-8px_rgb(79,141,255,0.8)] hover:bg-[#6a9fff] hover:shadow-[0_0_0_1px_rgb(160,215,255,0.6),0_10px_40px_-6px_rgb(79,141,255,0.9)]",
    ghost: "text-mute hover:text-white hover:bg-white/5",
    danger: "bg-crit/15 text-crit shadow-[inset_0_0_0_1px_rgb(244,63,94,0.45)] hover:bg-crit/25",
    outline: "bg-white/[0.03] text-[#cfe0ff] shadow-[inset_0_0_0_1px_rgb(110,170,255,0.25)] hover:bg-white/[0.07] hover:shadow-[inset_0_0_0_1px_rgb(140,200,255,0.5)]",
  };
  return (
    <button className={cn(base, sizes[size], variants[variant], className)} {...rest}>
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn("relative inline-flex rounded-md bg-white/[0.03] p-0.5 shadow-[inset_0_0_0_1px_rgb(110,170,255,0.2)]", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn("relative z-10 rounded-[5px] px-2.5 py-1 text-xs transition-colors", value === o.value ? "text-white" : "text-dim hover:text-mute")}
        >
          {value === o.value && (
            <motion.span layoutId={`seg-${options.map((x) => x.value).join("")}`} className="absolute inset-0 -z-10 rounded-[5px] bg-volt/25 shadow-[inset_0_0_0_1px_rgb(120,180,255,0.5)]" transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Meter({ value, color, className, height = 4 }: { value: number; color?: string; className?: string; height?: number }) {
  const c = color ?? scoreColor(value * 100);
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-white/[0.06]", className)} style={{ height }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${c}88, ${c})`, boxShadow: `0 0 10px ${c}aa` }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

export function Stat({ label, value, sub, color, icon }: { label: string; value: ReactNode; sub?: ReactNode; color?: string; icon?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-dim uppercase">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums" style={{ color: color ?? "#eef4ff" }}>
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-mute">{sub}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-4 animate-spin rounded-full border-2 border-volt/30 border-t-volt", className)} />;
}

export function Loading({ label = "Loading the twin" }: { label?: string }) {
  return (
    <div className="flex h-full min-h-40 items-center justify-center gap-3 text-sm text-dim">
      <Spinner />
      <span className="font-mono text-xs tracking-widest uppercase">{label}</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="flex min-h-24 items-center justify-center px-6 text-center text-sm text-dim">{children}</div>;
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="flex gap-1 border-b border-line px-2">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn("relative px-3 py-2.5 text-xs transition-colors", value === t.value ? "text-white" : "text-dim hover:text-mute")}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 rounded bg-white/5 px-1 font-mono text-[10px] text-mute">{t.count}</span>}
          {value === t.value && <motion.span layoutId="tab-underline" className="absolute inset-x-2 -bottom-px h-px bg-volt shadow-[0_0_10px_#4f8dff]" />}
        </button>
      ))}
    </div>
  );
}

export function Kv({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.04] py-1.5 text-xs last:border-0">
      <span className="text-dim">{k}</span>
      <span className="text-right text-[#d4e2ff]">{v}</span>
    </div>
  );
}
