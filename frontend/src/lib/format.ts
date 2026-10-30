import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { NodeState, Priority } from "./types";

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

export const COLORS = {
  volt: "#4f8dff",
  cyan: "#22d3ee",
  ok: "#34d399",
  elevated: "#fbbf24",
  high: "#fb923c",
  crit: "#f43f5e",
  cyber: "#a78bfa",
  impact: "#f59e0b",
  power: "#4ade80",
  comms: "#60a5fa",
  control: "#facc15",
  mute: "#93a3c4",
  dim: "#5d6d8f",
};

export const PRIORITY_COLOR: Record<Priority, string> = { NOW: COLORS.crit, NEXT: COLORS.high, MONITOR: COLORS.ok };

export const STATE_COLOR: Record<NodeState | string, string> = {
  ok: COLORS.ok,
  impaired: COLORS.elevated,
  degraded: COLORS.high,
  on_backup: COLORS.impact,
  lost: COLORS.crit,
};

export const SEVERITY_COLOR: Record<string, string> = {
  info: COLORS.dim,
  low: COLORS.comms,
  medium: COLORS.elevated,
  high: COLORS.high,
  critical: COLORS.crit,
};

/** Colour for a 0–100 priority score on the blueprint's status scale. */
export function scoreColor(score: number | null | undefined): string {
  if (score == null) return COLORS.dim;
  if (score >= 70) return COLORS.crit;
  if (score >= 55) return COLORS.high;
  if (score >= 38) return COLORS.elevated;
  return COLORS.ok;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const pct = (v: number | null | undefined, digits = 0) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);

export function fmtPop(n: number | null | undefined): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export function fmtTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function timeAgo(ts: string): string {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export const TYPE_LABEL: Record<string, string> = {
  control_centre: "Control centre",
  substation: "Substation",
  transformer: "Transformer",
  scada: "SCADA",
  gateway: "Gateway",
  remote_access: "Remote access",
  rtu: "RTU",
  plc: "PLC",
  workstation: "Workstation",
  switch: "Switch",
  zone: "Distribution zone",
  facility: "Critical facility",
  entry: "Untrusted network",
};

export const THREAT_COLOR: Record<string, string> = { SEVERE: COLORS.crit, HIGH: COLORS.high, ELEVATED: COLORS.elevated, GUARDED: COLORS.ok };
