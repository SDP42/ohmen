import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Bug, Cable, Dices, Factory, FlaskConical, Pause, Pin, Play, RotateCcw, ShieldCheck, Siren, Unplug, UserX, Waves } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Histogram } from "../components/charts";
import { Badge, Button, Empty, Loading, Panel, PanelHeader, Segmented, StateBadge } from "../components/ui";
import { api } from "../lib/api";
import { cn, COLORS, fmtPop, pct, STATE_COLOR } from "../lib/format";
import { useGraph } from "../lib/queries";
import { useUi } from "../lib/store";
import type { GraphData, ScenarioConfig, ScenarioResult } from "../lib/types";
import GeoTwin from "../twin/GeoTwin";

const TEMPLATE_ICON: Record<string, typeof Bug> = { exploitation: Bug, unavailability: Unplug, isolation: Cable, suspicious_access: UserX, vendor_compromise: Factory };
const CLASS_COLOR = { observed: COLORS.crit, initial: COLORS.crit, reachable: COLORS.cyber, consequence: COLORS.impact };
const fmtT = (m: number) => `T+${String(Math.floor(m)).padStart(2, "0")}:${String(Math.round((m % 1) * 60)).padStart(2, "0")}`;

function PropagationCanvas({ result, graph, clock, onSelect }: { result: ScenarioResult; graph: GraphData; clock: number; onSelect: (id: string) => void }) {
  const layout = useMemo(() => {
    const nodes = Object.values(result.nodes);
    const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
    const cols: Record<string, string[]> = {};
    for (const n of nodes) {
      const g = byId[n.id];
      let col: string;
      if (n.classification === "initial" || n.classification === "observed") col = "0";
      else if (n.classification === "reachable") col = String(Math.min(n.hop ?? 1, 3));
      else col = g?.category === "service" || g?.type === "control_centre" ? "9" : "8";
      (cols[col] ??= []).push(n.id);
    }
    const order = Object.keys(cols).sort((a, b) => Number(a) - Number(b));
    const W = 980;
    const H = Math.max(380, Math.max(...Object.values(cols).map((c) => c.length)) * 52 + 60);
    const pos: Record<string, { x: number; y: number }> = {};
    order.forEach((c, ci) => {
      const ids = cols[c].sort((a, b) => (result.nodes[b].likelihood ?? 0) - (result.nodes[a].likelihood ?? 0));
      ids.forEach((id, i) => {
        pos[id] = { x: 70 + (ci * (W - 140)) / Math.max(1, order.length - 1), y: 40 + ((i + 0.5) * (H - 60)) / ids.length };
      });
    });
    const edges: { a: string; b: string; t: number; kind: string }[] = result.edges.map((e) => ({ a: e.source, b: e.target, t: e.t, kind: "cyber" }));
    for (const e of graph.ops_edges) {
      if (pos[e.source] && pos[e.target] && result.nodes[e.target]?.classification === "consequence") {
        edges.push({ a: e.source, b: e.target, t: result.nodes[e.target].t, kind: e.relation });
      }
    }
    const headers = order.map((c) => ({ c, x: pos[cols[c][0]].x, label: c === "0" ? "Foothold" : c === "8" ? "Physical impact" : c === "9" ? "Services" : `Hop ${c}${c === "3" ? "+" : ""}` }));
    return { pos, edges, W, H, headers };
  }, [result, graph]);

  return (
    <svg viewBox={`0 0 ${layout.W} ${layout.H}`} className="h-full w-full">
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {layout.headers.map((h) => (
        <text key={h.c} x={h.x} y={18} textAnchor="middle" fontSize="10" fill="#5d6d8f" fontFamily="Geist Mono" letterSpacing="2">
          {h.label.toUpperCase()}
        </text>
      ))}
      {layout.edges.map((e, i) => {
        const a = layout.pos[e.a];
        const b = layout.pos[e.b];
        if (!a || !b) return null;
        const on = clock >= e.t;
        const color = e.kind === "cyber" ? COLORS.cyber : ["feeds", "supplies", "serves"].includes(e.kind) ? COLORS.power : e.kind === "telemetry" || e.kind === "comms" ? COLORS.comms : COLORS.control;
        const mx = (a.x + b.x) / 2;
        return (
          <path
            key={i}
            d={`M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`}
            fill="none"
            stroke={color}
            strokeWidth={on ? 1.6 : 0.8}
            strokeOpacity={on ? 0.85 : 0.08}
            strokeDasharray={e.kind === "cyber" ? "5 4" : undefined}
            className={on && e.kind === "cyber" ? "animate-dash" : undefined}
          />
        );
      })}
      {Object.values(result.nodes).map((n) => {
        const p = layout.pos[n.id];
        if (!p) return null;
        const visible = clock >= n.t;
        const c = n.classification === "consequence" ? STATE_COLOR[n.state ?? "degraded"] : CLASS_COLOR[n.classification];
        const op = n.classification === "reachable" ? 0.45 + 0.55 * (n.likelihood ?? 0.5) : 1;
        return (
          <g key={n.id} transform={`translate(${p.x},${p.y})`} className="cursor-pointer" onClick={() => onSelect(n.id)} style={{ opacity: visible ? op : 0.12, transition: "opacity .4s" }}>
            {visible && (n.classification === "initial" || n.classification === "observed") && (
              <circle r="22" fill="none" stroke={c} strokeOpacity="0.5">
                <animate attributeName="r" values="14;30;14" dur="2s" repeatCount="indefinite" />
                <animate attributeName="stroke-opacity" values="0.7;0;0.7" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
            <rect x={-46} y={-14} width={92} height={28} rx={6} fill="#07101f" stroke={c} strokeWidth={visible ? 1.5 : 0.8} filter={visible ? "url(#glow)" : undefined} strokeDasharray={n.classification === "reachable" ? "4 3" : undefined} />
            <text y={4} textAnchor="middle" fontSize="11" fontFamily="Geist Mono" fill="#e8eefc" fontWeight="600">
              {n.id}
            </text>
            {n.classification === "reachable" && visible && (
              <text y={25} textAnchor="middle" fontSize="9" fontFamily="Geist Mono" fill="#a78bfa">
                {Math.round((n.likelihood ?? 0) * 100)}%
              </text>
            )}
            {n.classification === "consequence" && visible && (
              <text y={25} textAnchor="middle" fontSize="9" fontFamily="Geist Mono" fill={c}>
                {n.state?.replace("_", " ")}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function ScenarioLab() {
  const [params] = useSearchParams();
  const { data: graph } = useGraph();
  const { data: templates } = useQuery({ queryKey: ["templates"], queryFn: api.templates });
  const { setScenario, select } = useUi();
  const [cfg, setCfg] = useState<ScenarioConfig>({ type: "exploitation", asset: params.get("asset") ?? "GW-001", severity: "high", reachability: "configured", depth: 4, mitigations: [], monte_carlo: true, runs: 600 });
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [pinned, setPinned] = useState<ScenarioResult | null>(null);
  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<"flow" | "map">("flow");
  const raf = useRef(0);
  const { data: catalog } = useQuery({ queryKey: ["catalog", cfg.asset], queryFn: () => api.catalog(cfg.asset!), enabled: Boolean(cfg.asset) && cfg.type !== "vendor_compromise" && cfg.type !== "isolation" });
  const run = useMutation({
    mutationFn: (c: ScenarioConfig) => api.runScenario(c),
    onSuccess: (r) => {
      setResult(r);
      setScenario(r);
      setClock(0);
      setPlaying(true);
    },
  });

  useEffect(() => {
    if (!graph || result || run.isPending) return;
    run.mutate(cfg);
  }, [graph]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing || !result) return;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setClock((c) => {
        const next = c + dt * (result.duration_minutes / 9);
        if (next >= result.duration_minutes) {
          setPlaying(false);
          return result.duration_minutes;
        }
        return next;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, result]);

  if (!graph || !templates) return <Loading />;
  const cyberAssets = graph.nodes.filter((n) => n.category === "cyber").sort((a, b) => (b.risk?.score ?? 0) - (a.risk?.score ?? 0));
  const set = (patch: Partial<ScenarioConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const toggleMit = (id: string) => set({ mitigations: cfg.mitigations.includes(id) ? cfg.mitigations.filter((m) => m !== id) : [...cfg.mitigations, id] });
  const imp = result?.impact;
  const mc = result?.monte_carlo;

  return (
    <div className="grid gap-4 p-4 lg:p-5 xl:grid-cols-[290px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)_340px]">
      {/* Builder */}
      <Panel className="self-start">
        <PanelHeader title="Scenario builder" icon={<FlaskConical className="size-3.5" />} sub="Sandbox copy · baseline untouched" />
        <div className="space-y-4 p-3.5">
          <div className="grid grid-cols-1 gap-1.5">
            {templates.templates.map((t) => {
              const Icon = TEMPLATE_ICON[t.id] ?? Bug;
              return (
                <button
                  key={t.id}
                  onClick={() => set({ type: t.id, asset: t.defaults.asset ?? cfg.asset, vendor: t.defaults.vendor ?? null, zone: t.defaults.zone ?? null, severity: (t.defaults.severity as ScenarioConfig["severity"]) ?? cfg.severity, mitigations: [] })}
                  className={cn("flex items-start gap-2.5 rounded-md p-2 text-left transition", cfg.type === t.id ? "bg-volt/15 shadow-[inset_0_0_0_1px_rgb(120,180,255,0.45)]" : "hover:bg-white/[0.04]")}
                >
                  <Icon className={cn("mt-0.5 size-4 shrink-0", cfg.type === t.id ? "text-volt-2" : "text-dim")} />
                  <span>
                    <span className="block text-[12.5px] text-white">{t.name}</span>
                    <span className="block text-[10.5px] leading-snug text-dim">{t.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {cfg.type === "vendor_compromise" ? (
            <label className="block text-[11px] text-mute">
              Vendor
              <select value={cfg.vendor ?? ""} onChange={(e) => set({ vendor: e.target.value })} className="mt-1 h-8 w-full rounded-md bg-white/[0.04] px-2 text-[12.5px] text-white outline-none">
                {templates.vendors.map((v) => (
                  <option key={v} className="bg-ink-900">
                    {v}
                  </option>
                ))}
              </select>
            </label>
          ) : cfg.type === "isolation" ? (
            <label className="block text-[11px] text-mute">
              Network segment
              <select value={cfg.zone ?? ""} onChange={(e) => set({ zone: e.target.value })} className="mt-1 h-8 w-full rounded-md bg-white/[0.04] px-2 text-[12.5px] text-white outline-none">
                {templates.zones.filter((z) => z.startsWith("sub")).map((z) => (
                  <option key={z} className="bg-ink-900">
                    {z}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block text-[11px] text-mute">
              Initial asset
              <select value={cfg.asset ?? ""} onChange={(e) => set({ asset: e.target.value, mitigations: [] })} className="mt-1 h-8 w-full rounded-md bg-white/[0.04] px-2 font-mono text-[12.5px] text-white outline-none">
                {cyberAssets.map((n) => (
                  <option key={n.id} value={n.id} className="bg-ink-900">
                    {n.id} · {Math.round(n.risk?.score ?? 0)} · {n.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div>
            <div className="mb-1 text-[11px] text-mute">Severity</div>
            <Segmented value={cfg.severity} onChange={(v) => set({ severity: v })} options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }]} />
          </div>
          <div>
            <div className="mb-1 text-[11px] text-mute">Reachability assumption</div>
            <Segmented value={cfg.reachability} onChange={(v) => set({ reachability: v })} options={[{ value: "configured", label: "Configured" }, { value: "observed", label: "+Observed" }, { value: "flat", label: "Flat" }]} />
          </div>
          <label className="block text-[11px] text-mute">
            Blast radius · {cfg.depth === 6 ? "full network" : `${cfg.depth} hops`}
            <input type="range" min={1} max={6} value={cfg.depth} onChange={(e) => set({ depth: Number(e.target.value) })} className="mt-1 w-full accent-[#a78bfa]" />
          </label>
          {catalog && catalog.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] text-mute">Mitigations to test</div>
              <div className="flex flex-wrap gap-1.5">
                {catalog.map((m) => (
                  <button key={m.id} onClick={() => toggleMit(m.id)} title={m.description} className={cn("rounded-md px-2 py-1 text-[10.5px] transition", cfg.mitigations.includes(m.id) ? "bg-cyan/20 text-cyan shadow-[inset_0_0_0_1px_rgb(34,211,238,0.5)]" : "bg-white/[0.04] text-mute hover:text-white")}>
                    {m.title.replace(cfg.asset ?? "", "").trim() || m.title} · ₹{m.cost_lakh}L
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="flex items-center justify-between text-[12px] text-[#c8d6f0]">
            <span className="flex items-center gap-1.5">
              <Dices className="size-3.5 text-cyber" /> Monte Carlo ({cfg.runs} runs)
            </span>
            <input type="checkbox" checked={cfg.monte_carlo} onChange={(e) => set({ monte_carlo: e.target.checked })} className="accent-[#4f8dff]" />
          </label>
          <Button variant="primary" size="lg" className="w-full" onClick={() => run.mutate(cfg)} disabled={run.isPending}>
            <Play className="size-4" /> {run.isPending ? "Simulating…" : cfg.mitigations.length ? "Re-run with mitigations" : "Run scenario"}
          </Button>
          {run.isError && <div className="text-[11px] text-crit">{(run.error as Error).message}</div>}
        </div>
      </Panel>

      {/* Canvas */}
      <div className="flex min-w-0 flex-col gap-4">
        <Panel className="flex min-h-[520px] flex-col overflow-hidden">
          <PanelHeader
            title={result ? `Scenario ${result.id}` : "Scenario"}
            icon={<Waves className="size-3.5" />}
            sub={result ? `${result.seeds.join(", ")} · ${result.config.type.replace("_", " ")} · severity ${result.config.severity}` : "Configure and run"}
            right={<Segmented value={view} onChange={setView} options={[{ value: "flow", label: "Propagation" }, { value: "map", label: "Map" }]} />}
          />
          <div className="relative min-h-0 flex-1">
            {!result ? (
              <Empty>{run.isPending ? "Simulating on a sandbox copy of the twin…" : "Run a scenario to see propagation."}</Empty>
            ) : view === "flow" ? (
              <div className="h-full min-h-[440px] p-2">
                <PropagationCanvas result={result} graph={graph} clock={clock} onSelect={(id) => select(id)} />
              </div>
            ) : (
              <div className="h-[460px]">
                <GeoTwin graph={graph} scenario={result} onSelect={(id) => select(id)} compact flyOnSelect={false} />
              </div>
            )}
            <div className="pointer-events-none absolute right-3 bottom-3 flex flex-wrap justify-end gap-2 font-mono text-[10px]">
              {[
                ["Observed evidence / foothold", COLORS.crit, false],
                ["Potentially reachable (hypothesis)", COLORS.cyber, true],
                ["Potential consequence", COLORS.impact, false],
              ].map(([l, c, dashed]) => (
                <span key={l as string} className="flex items-center gap-1.5 rounded bg-ink-950/85 px-2 py-1 text-mute">
                  <span className="h-2.5 w-4 rounded-sm border" style={{ borderColor: c as string, borderStyle: dashed ? "dashed" : "solid" }} />
                  {l as string}
                </span>
              ))}
            </div>
          </div>
        </Panel>

        {result && (
          <Panel className="p-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (clock >= result.duration_minutes) setClock(0);
                  setPlaying(!playing);
                }}
                className="flex size-9 items-center justify-center rounded-full bg-volt text-white shadow-[0_0_20px_-4px_#4f8dff]"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>
              <button onClick={() => (setClock(0), setPlaying(false))} className="text-dim hover:text-white" aria-label="Rewind">
                <RotateCcw className="size-4" />
              </button>
              <div className="font-mono text-[13px] text-white tabular-nums">{fmtT(clock)}</div>
              <input type="range" min={0} max={result.duration_minutes} step={0.1} value={clock} onChange={(e) => (setClock(Number(e.target.value)), setPlaying(false))} className="flex-1 accent-[#a78bfa]" aria-label="Scenario timeline" />
              <span className="font-mono text-[11px] text-dim">{fmtT(result.duration_minutes)}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
              {result.stages.map((s) => {
                const active = clock >= s.t;
                const color = s.id === "normal" ? COLORS.ok : s.id === "initial" ? COLORS.crit : s.id === "analysis" ? COLORS.cyber : s.id === "impact" ? COLORS.impact : COLORS.cyan;
                return (
                  <button key={s.id} onClick={() => (setClock(s.t), setPlaying(false))} className={cn("rounded-md border p-2 text-left transition", active ? "bg-white/[0.04]" : "opacity-50")} style={{ borderColor: active ? `${color}88` : "rgb(96 150 255 / 0.12)" }}>
                    <div className="font-mono text-[10px]" style={{ color }}>
                      {fmtT(s.t)}
                    </div>
                    <div className="mt-0.5 text-[12px] text-white">{s.label}</div>
                    <div className="truncate text-[10.5px] text-dim">{s.detail}</div>
                  </button>
                );
              })}
            </div>
          </Panel>
        )}

        {result && result.attck.length > 0 && (
          <Panel>
            <PanelHeader title="MITRE ATT&CK for ICS" icon={<Siren className="size-3.5" />} sub="Simulated stages mapped to recognised techniques" />
            <div className="flex flex-wrap gap-2 p-3">
              {result.attck.map((a) => (
                <div key={a.technique_id} className={cn("rounded-md border px-2.5 py-1.5 transition", clock >= a.t ? "border-cyber/50 bg-cyber/10" : "border-line opacity-50")}>
                  <div className="font-mono text-[9.5px] tracking-wider text-dim uppercase">{a.tactic}</div>
                  <div className="text-[12px] text-white">
                    <span className="font-mono text-cyber">{a.technique_id}</span> {a.technique}
                  </div>
                  <div className="font-mono text-[9.5px] text-dim">{a.evidence.slice(0, 3).join(", ")}</div>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>

      {/* Impact */}
      <div className="grid gap-4 xl:col-span-2 xl:grid-cols-2 2xl:col-span-1 2xl:flex 2xl:flex-col">
        {imp ? (
          <>
            <Panel className="p-4">
              <div className="font-mono text-[10px] tracking-[0.16em] text-dim uppercase">Systemic impact</div>
              <div className="mt-1 flex items-end gap-3">
                <span className="font-mono text-5xl font-semibold text-white">{imp.systemic_impact_score.toFixed(0)}</span>
                {result.foothold_likelihood && <span className="mb-2 text-[12px] text-mute">× foothold {pct(result.foothold_likelihood.after)} = expected {result.expected_impact}</span>}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  ["Digital assets reachable", imp.digital_assets_reachable, COLORS.cyber],
                  ["Operational assets", imp.operational_assets_affected, COLORS.impact],
                  ["Citizens without power", fmtPop(imp.citizens_without_power), COLORS.crit],
                  ["Essential services", imp.essential_services_affected, COLORS.high],
                ].map(([l, v, c]) => (
                  <div key={l as string} className="rounded-md bg-white/[0.03] p-2.5">
                    <div className="font-mono text-xl text-white">{v}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-dim">
                      <span className="size-1.5 rounded-full" style={{ background: c as string }} />
                      {l}
                    </div>
                  </div>
                ))}
              </div>
              {imp.time_to_harm_hours != null && (
                <div className="mt-3 rounded-md border border-crit/40 bg-crit/10 p-2.5">
                  <div className="font-mono text-[10px] tracking-widest text-[#ffb3c1] uppercase">Time to harm</div>
                  <div className="font-mono text-2xl font-semibold text-white">{imp.time_to_harm_hours}h</div>
                  <div className="text-[11px] text-[#ffc8d2]">until the first essential service exhausts backup power</div>
                </div>
              )}
            </Panel>

            {imp.facilities.length > 0 && (
              <Panel>
                <PanelHeader title="Essential services" icon={<ShieldCheck className="size-3.5" />} sub="Backup endurance after supply loss" />
                <div className="space-y-2.5 p-3">
                  {imp.facilities.map((f) => (
                    <button key={f.id} onClick={() => select(f.id)} className="block w-full text-left">
                      <div className="flex items-center justify-between gap-2 text-[12px]">
                        <span className="truncate text-[#dbe6ff]">{f.name}</span>
                        <StateBadge state={f.state} />
                      </div>
                      {f.backup_hours ? (
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (f.backup_hours / 24) * 100)}%`, background: f.backup_hours <= 4 ? COLORS.crit : COLORS.impact }} />
                          </div>
                          <span className="font-mono text-[10.5px] text-mute">{f.backup_hours}h</span>
                        </div>
                      ) : (
                        <div className="mt-0.5 text-[10.5px] text-dim">{f.cause}</div>
                      )}
                    </button>
                  ))}
                </div>
              </Panel>
            )}

            {result.contained && (
              <Panel glow="#22d3ee">
                <PanelHeader title="Mitigation effect" icon={<ShieldCheck className="size-3.5 text-cyan" />} sub={result.mitigations_applied.map((m) => m.title).join(" · ")} />
                <div className="space-y-2 p-3 text-[12px]">
                  {result.baseline_impact && (
                    <div className="grid grid-cols-3 gap-2 text-center font-mono">
                      <div>
                        <div className="text-[10px] text-dim">reachable</div>
                        {result.baseline_impact.digital_assets_reachable} → <span className="text-cyan">{imp.digital_assets_reachable}</span>
                      </div>
                      <div>
                        <div className="text-[10px] text-dim">citizens</div>
                        {fmtPop(result.baseline_impact.citizens_without_power)} → <span className="text-cyan">{fmtPop(imp.citizens_without_power)}</span>
                      </div>
                      <div>
                        <div className="text-[10px] text-dim">SRI</div>
                        {result.risk_baseline} → <span className="text-cyan">{result.risk_after}</span>
                      </div>
                    </div>
                  )}
                  {result.foothold_likelihood && (
                    <div className="text-mute">
                      Foothold likelihood {pct(result.foothold_likelihood.before)} → <span className="text-cyan">{pct(result.foothold_likelihood.after)}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {result.contained.map((c) => (
                      <Badge key={c} color="#22d3ee">
                        {c} contained
                      </Badge>
                    ))}
                  </div>
                </div>
              </Panel>
            )}

            {mc && (
              <Panel>
                <PanelHeader title="Monte Carlo blast radius" icon={<Dices className="size-3.5" />} sub={`${mc.runs} stochastic runs · seed ${mc.seed}`} />
                <div className="p-3">
                  <Histogram bins={mc.citizens.histogram} markers={[{ value: mc.citizens.p50, label: "P50" }, { value: mc.citizens.p90, label: "P90" }]} />
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="font-mono text-[13px] text-white">{fmtPop(mc.citizens.p10)}</div>
                      <div className="text-[10px] text-dim">P10 citizens</div>
                    </div>
                    <div>
                      <div className="font-mono text-[13px] text-white">{fmtPop(mc.citizens.p50)}</div>
                      <div className="text-[10px] text-dim">P50</div>
                    </div>
                    <div>
                      <div className="font-mono text-[13px] text-white">{fmtPop(mc.citizens.p90)}</div>
                      <div className="text-[10px] text-dim">P90</div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 text-[11.5px]">
                    <div className="flex justify-between text-mute">
                      <span>Hospital affected</span>
                      <span className="font-mono text-white">{pct(mc.p_hospital_impact)}</span>
                    </div>
                    <div className="flex justify-between text-mute">
                      <span>Detected along the way</span>
                      <span className="font-mono text-white">{pct(mc.p_detected)}</span>
                    </div>
                    <div className="flex justify-between text-mute">
                      <span>Expected assets compromised</span>
                      <span className="font-mono text-white">{mc.expected_digital_assets}</span>
                    </div>
                  </div>
                  <div className="mt-3 font-mono text-[10px] tracking-widest text-dim uppercase">Reach probability</div>
                  <div className="mt-1 space-y-1">
                    {mc.reach_probability.slice(0, 6).map((r) => (
                      <div key={r.id} className="flex items-center gap-2 text-[11px]">
                        <span className="w-20 font-mono text-[#d6caff]">{r.id}</span>
                        <div className="h-1 flex-1 rounded-full bg-white/5">
                          <div className="h-full rounded-full bg-cyber" style={{ width: `${r.probability * 100}%` }} />
                        </div>
                        <span className="w-9 text-right font-mono text-mute">{pct(r.probability)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>
            )}

            <Panel className="p-3">
              <div className="flex items-center justify-between">
                <div className="font-mono text-[10px] tracking-widest text-dim uppercase">Compare scenarios</div>
                <button onClick={() => setPinned(result)} className="flex items-center gap-1 rounded bg-white/5 px-2 py-0.5 text-[11px] text-mute hover:text-white">
                  <Pin className="size-3" /> Pin as A
                </button>
              </div>
              <AnimatePresence>
                {pinned && pinned.id !== result.id && (
                  <motion.table initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 w-full text-[11.5px]">
                    <thead>
                      <tr className="text-dim">
                        <th className="text-left font-normal" />
                        <th className="text-right font-normal">A · {pinned.seeds[0]}</th>
                        <th className="text-right font-normal">B · {result.seeds[0]}</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {(
                        [
                          ["Reachable", "digital_assets_reachable"],
                          ["Operational", "operational_assets_affected"],
                          ["Services", "essential_services_affected"],
                          ["Impact score", "systemic_impact_score"],
                        ] as const
                      ).map(([l, k]) => (
                        <tr key={k} className="border-t border-white/[0.04]">
                          <td className="py-1 font-sans text-mute">{l}</td>
                          <td className="text-right text-white">{pinned.impact[k]}</td>
                          <td className="text-right text-white">{result.impact[k]}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-white/[0.04]">
                        <td className="py-1 font-sans text-mute">Citizens</td>
                        <td className="text-right text-white">{fmtPop(pinned.impact.citizens_without_power)}</td>
                        <td className="text-right text-white">{fmtPop(result.impact.citizens_without_power)}</td>
                      </tr>
                    </tbody>
                  </motion.table>
                )}
              </AnimatePresence>
              {!pinned && <div className="mt-1 text-[11px] text-dim">Pin this run, change the setup, run again and compare.</div>}
            </Panel>

            <details className="hud p-3 text-[11.5px] text-mute">
              <summary className="cursor-pointer font-mono text-[10px] tracking-widest text-dim uppercase">Assumptions</summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {result.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </details>
          </>
        ) : (
          <Panel className="p-6">
            <Loading label="Simulating" />
          </Panel>
        )}
      </div>
    </div>
  );
}
