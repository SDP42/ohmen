import { AnimatePresence, motion } from "motion/react";
import { Filter, Network, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Kv, Loading, Panel, PanelHeader } from "../components/ui";
import { cn, COLORS, scoreColor } from "../lib/format";
import { useGraph } from "../lib/queries";
import { useUi } from "../lib/store";
import type { CyberEdge, TwinNode } from "../lib/types";

const LEVELS = [
  { level: 5, label: "L5 · Internet & vendors", zones: ["internet", "vendor"] },
  { level: 4, label: "L4 · Corporate IT", zones: ["corporate"] },
  { level: 3.5, label: "L3.5 · Industrial DMZ", zones: ["dmz"] },
  { level: 3, label: "L3 · Supervisory control", zones: ["supervisory", "dr"] },
  { level: 2, label: "L2 · Substation LANs", zones: [] },
  { level: 1, label: "L1 · Field controllers", zones: [] },
];
const SITE_ORDER = ["SUB-A", "SUB-B", "SUB-C", "SUB-D", "SUB-E"];
const POLICY_COLOR: Record<string, string> = { allowed: COLORS.comms, legacy_exception: COLORS.crit, controlled: COLORS.cyan };

function rowOf(n: TwinNode): number {
  if (n.category === "entry") return n.zone === "corporate" ? 1 : 0;
  const l = n.purdue_level ?? 2;
  if (l >= 3.5) return 2;
  if (l >= 3) return 3;
  if (l >= 2) return 4;
  return 5;
}

export default function NetworkPage() {
  const { data: graph } = useGraph();
  const { select, selected } = useUi();
  const [edge, setEdge] = useState<CyberEdge | null>(null);
  const [showBounds, setShowBounds] = useState(true);
  const [showPhysical, setShowPhysical] = useState(false);
  const [unexpected, setUnexpected] = useState(false);
  const [critical, setCritical] = useState(false);
  const [proto, setProto] = useState<string | null>(null);

  const layout = useMemo(() => {
    if (!graph) return null;
    const W = 1300;
    const rowH = 120;
    const nodes = graph.nodes.filter((n) => n.category === "cyber" || n.category === "entry");
    const rows: TwinNode[][] = LEVELS.map(() => []);
    nodes.forEach((n) => rows[rowOf(n)].push(n));
    const pos: Record<string, { x: number; y: number }> = {};
    rows.forEach((row, ri) => {
      const y = 60 + ri * rowH;
      if (ri >= 4) {
        const bySite: Record<string, TwinNode[]> = {};
        row.forEach((n) => (bySite[n.site ?? "x"] ??= []).push(n));
        SITE_ORDER.forEach((s, si) => {
          const list = bySite[s] ?? [];
          const cx = 150 + (si * (W - 260)) / (SITE_ORDER.length - 1);
          list.forEach((n, i) => (pos[n.id] = { x: cx + (i - (list.length - 1) / 2) * 96, y: y + (i % 2) * 14 }));
        });
      } else {
        row.sort((a, b) => a.id.localeCompare(b.id)).forEach((n, i) => (pos[n.id] = { x: 150 + ((i + 0.5) * (W - 260)) / row.length, y }));
      }
    });
    const zones: Record<string, string[]> = {};
    nodes.forEach((n) => (zones[n.zone] ??= []).push(n.id));
    return { W, H: 60 + LEVELS.length * rowH, pos, zones, nodes };
  }, [graph]);

  if (!graph || !layout) return <Loading />;
  const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
  const protocols = [...new Set(graph.cyber_edges.filter((e) => e.kind === "logical").map((e) => e.protocol))];
  const neighbours = new Set(selected ? graph.cyber_edges.filter((e) => e.source === selected || e.target === selected).flatMap((e) => [e.source, e.target]) : []);
  const edges = [...graph.cyber_edges.filter((e) => e.kind === "logical" || (showPhysical && e.kind === "physical")), ...graph.observed_edges].filter((e) => {
    if (!layout.pos[e.source] || !layout.pos[e.target]) return false;
    if (proto && e.protocol !== proto) return false;
    if (unexpected && !(e.kind === "observed" || e.policy === "legacy_exception")) return false;
    if (critical && Math.max(byId[e.source].criticality, byId[e.target].criticality) < 4) return false;
    return true;
  });

  return (
    <div className="grid gap-4 p-4 lg:p-5 xl:grid-cols-[1fr_300px]">
      <Panel className="overflow-hidden">
        <PanelHeader
          title="Network topology · Purdue model"
          icon={<Network className="size-3.5" />}
          sub="Communication flows with live particles · click a device or a connection"
          right={
            <div className="flex flex-wrap gap-1.5">
              {[
                ["Boundaries", showBounds, setShowBounds],
                ["Physical links", showPhysical, setShowPhysical],
                ["Unexpected only", unexpected, setUnexpected],
                ["Critical only", critical, setCritical],
              ].map(([l, v, f]) => (
                <button key={l as string} onClick={() => (f as (b: boolean) => void)(!(v as boolean))} className={cn("rounded-md px-2 py-1 text-[10.5px]", v ? "bg-volt/20 text-white shadow-[inset_0_0_0_1px_rgb(120,180,255,0.45)]" : "bg-white/[0.04] text-mute hover:text-white")}>
                  {l as string}
                </button>
              ))}
            </div>
          }
        />
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${layout.W} ${layout.H}`} className="min-w-[900px]" style={{ width: "100%" }}>
            {LEVELS.map((l, i) => (
              <g key={l.label}>
                <rect x={0} y={i * 120 + 8} width={layout.W} height={112} fill={i % 2 ? "rgb(79 141 255 / 0.025)" : "transparent"} />
                <text x={14} y={i * 120 + 26} fontSize="10.5" fill="#5d6d8f" fontFamily="Geist Mono" letterSpacing="1.5">
                  {l.label.toUpperCase()}
                </text>
              </g>
            ))}
            {showBounds &&
              Object.entries(layout.zones).map(([zone, ids]) => {
                const pts = ids.map((id) => layout.pos[id]).filter(Boolean);
                if (pts.length < 2) return null;
                const xs = pts.map((p) => p.x);
                const ys = pts.map((p) => p.y);
                return (
                  <g key={zone}>
                    <rect x={Math.min(...xs) - 54} y={Math.min(...ys) - 26} width={Math.max(...xs) - Math.min(...xs) + 108} height={Math.max(...ys) - Math.min(...ys) + 54} rx={10} fill="none" stroke="#3b5f9e" strokeOpacity={0.6} strokeDasharray="6 5" />
                    <text x={Math.min(...xs) - 48} y={Math.min(...ys) - 30} fontSize="9.5" fill="#6f86b5" fontFamily="Geist Mono">
                      {zone}
                    </text>
                  </g>
                );
              })}
            {edges.map((e) => {
              const a = layout.pos[e.source];
              const b = layout.pos[e.target];
              const color = e.kind === "observed" ? COLORS.high : e.kind === "physical" ? "#3a4b6b" : e.status !== "active" ? "#3a4b6b" : POLICY_COLOR[e.policy];
              const lit = !selected || e.source === selected || e.target === selected;
              const d = `M${a.x},${a.y} C${a.x},${(a.y + b.y) / 2} ${b.x},${(a.y + b.y) / 2} ${b.x},${b.y}`;
              const pid = `p-${e.id.replace(/[^a-zA-Z0-9]/g, "")}`;
              return (
                <g key={e.id} className="cursor-pointer" onClick={() => setEdge(e)} opacity={lit ? 1 : 0.15}>
                  <path id={pid} d={d} fill="none" stroke="transparent" strokeWidth={12} />
                  <path d={d} fill="none" stroke={color} strokeWidth={edge?.id === e.id ? 2.6 : e.kind === "physical" ? 0.8 : 1.4} strokeDasharray={e.kind === "observed" || e.policy === "controlled" || e.status !== "active" ? "5 4" : undefined} strokeOpacity={0.85} />
                  {e.kind !== "physical" && e.status === "active" && (
                    <circle r={2.6} fill={color}>
                      <animateMotion dur={`${2.2 + (e.id.charCodeAt(e.id.length - 1) % 5) * 0.4}s`} repeatCount="indefinite">
                        <mpath href={`#${pid}`} />
                      </animateMotion>
                    </circle>
                  )}
                </g>
              );
            })}
            {layout.nodes.map((n) => {
              const p = layout.pos[n.id];
              const c = n.category === "entry" ? COLORS.high : scoreColor(n.risk?.score);
              const dim = selected && selected !== n.id && !neighbours.has(n.id);
              return (
                <g key={n.id} transform={`translate(${p.x},${p.y})`} className="cursor-pointer" onClick={() => select(n.id)} opacity={dim ? 0.3 : 1}>
                  {n.activity && <circle r={22} fill="none" stroke={COLORS.crit} strokeOpacity={0.5}><animate attributeName="r" values="16;26;16" dur="1.8s" repeatCount="indefinite" /></circle>}
                  <rect x={-42} y={-15} width={84} height={30} rx={7} fill="#07101f" stroke={selected === n.id ? "#ffffff" : c} strokeWidth={selected === n.id ? 2 : 1.3} />
                  <circle cx={-31} cy={0} r={3.5} fill={c} />
                  <text x={-23} y={1} fontSize="10.5" fontFamily="Geist Mono" fill="#e8eefc" fontWeight="600">
                    {n.id}
                  </text>
                  <text x={-23} y={11} fontSize="7.5" fontFamily="Geist" fill="#6f86b5">
                    {(n.model ?? n.name).slice(0, 16)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </Panel>

      <div className="flex flex-col gap-4">
        <Panel>
          <PanelHeader title="Filters" icon={<Filter className="size-3.5" />} />
          <div className="flex flex-wrap gap-1.5 p-3">
            <button onClick={() => setProto(null)} className={cn("rounded px-2 py-1 font-mono text-[10.5px]", !proto ? "bg-volt/20 text-white" : "bg-white/[0.04] text-mute")}>
              all protocols
            </button>
            {protocols.map((p) => (
              <button key={p} onClick={() => setProto(p === proto ? null : p)} className={cn("rounded px-2 py-1 font-mono text-[10.5px]", proto === p ? "bg-volt/20 text-white" : "bg-white/[0.04] text-mute hover:text-white")}>
                {p}
              </button>
            ))}
          </div>
          <div className="space-y-1.5 border-t border-line p-3 text-[11.5px]">
            {[
              ["Allowed flow", COLORS.comms, false],
              ["Legacy firewall exception", COLORS.crit, false],
              ["Controlled conduit", COLORS.cyan, true],
              ["Undocumented (observed)", COLORS.high, true],
            ].map(([l, c, d]) => (
              <div key={l as string} className="flex items-center gap-2 text-mute">
                <svg width="26" height="4">
                  <line x1="0" y1="2" x2="26" y2="2" stroke={c as string} strokeWidth="2" strokeDasharray={d ? "4 3" : undefined} />
                </svg>
                {l as string}
              </div>
            ))}
          </div>
        </Panel>
        <AnimatePresence mode="wait">
          {edge && (
            <motion.div key={edge.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Panel>
                <PanelHeader title={`Connection ${edge.id}`} right={<button onClick={() => setEdge(null)} className="text-dim hover:text-white"><X className="size-4" /></button>} />
                <div className="p-3">
                  <div className="mb-2 font-mono text-[13px] text-white">
                    {edge.source} → {edge.target}
                  </div>
                  <Kv k="Protocol" v={`${edge.protocol}${edge.port ? ` / ${edge.port}` : ""}`} />
                  <Kv k="Purpose" v={edge.purpose} />
                  <Kv k="Policy" v={<Badge color={POLICY_COLOR[edge.policy] ?? COLORS.high}>{edge.kind === "observed" ? "not in model" : edge.policy.replace("_", " ")}</Badge>} />
                  <Kv k="Direction" v={edge.bidirectional ? "bidirectional" : "source initiates"} />
                  <Kv k="Encrypted" v={edge.encrypted ? "yes" : "no"} />
                  <Kv k="Authenticated" v={edge.authenticated ? "yes" : "no"} />
                  <Kv k="Monitored" v={edge.monitored ? "yes" : "no"} />
                  <Kv k="Status" v={edge.status} />
                  {edge.last_observed_hours != null && <Kv k="Last observed" v={edge.last_observed_hours > 48 ? `${Math.round(edge.last_observed_hours / 24)} days ago` : `${Math.round(edge.last_observed_hours * 60)} min ago`} />}
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => select(edge.source)} className="flex-1 rounded bg-white/5 py-1 text-[11px] text-mute hover:text-white">
                      Inspect {edge.source}
                    </button>
                    <button onClick={() => select(edge.target)} className="flex-1 rounded bg-white/5 py-1 text-[11px] text-mute hover:text-white">
                      Inspect {edge.target}
                    </button>
                  </div>
                </div>
              </Panel>
            </motion.div>
          )}
        </AnimatePresence>
        <Panel className="p-3 text-[11.5px] leading-relaxed text-dim">
          Same assets as the map, seen as a communication network. Paths here feed the attack-path engine; switch links (physical) are display-only.
        </Panel>
      </div>
    </div>
  );
}
