import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowUpRight, Building2, Clock3, Cpu, Droplets, Hospital, Layers, Link2, Radio, Siren, TrainFront, Users, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { LineChart, RingGauge, Sparkline } from "../components/charts";
import { NumberTicker } from "../components/fx";
import { Loading, Panel, PanelHeader, PriorityPill, StateBadge } from "../components/ui";
import { EventRow } from "../console/EventDrawer";
import { cn, fmtPop, fmtTime, pct, scoreColor, THREAT_COLOR } from "../lib/format";
import { useGraph, useSummary, useTimeline } from "../lib/queries";
import { useUi } from "../lib/store";
import GeoTwin from "../twin/GeoTwin";

const FACILITY_ICON: Record<string, typeof Hospital> = { hospital: Hospital, water: Droplets, rail: TrainFront, telecom: Radio, datacentre: Cpu, zone: Users, control_centre: Building2 };

function Kpi({ label, value, sub, color, icon: Icon, spark, delay }: { label: string; value: number; sub: string; color: string; icon: typeof Zap; spark?: number[]; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.5 }}>
      <Panel className="relative h-full overflow-hidden p-4">
        <div className="absolute -top-10 -right-10 size-28 rounded-full blur-2xl" style={{ background: `${color}22` }} />
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-[0.16em] text-dim uppercase">{label}</span>
          <Icon className="size-4" style={{ color }} />
        </div>
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="font-mono text-[32px] leading-none font-semibold text-white">
            <NumberTicker value={value} />
          </div>
          {spark && spark.length > 1 && <Sparkline values={spark} color={color} width={86} height={30} />}
        </div>
        <div className="mt-1.5 truncate text-[11.5px] text-mute">{sub}</div>
      </Panel>
    </motion.div>
  );
}

export default function CommandCentre() {
  const summary = useSummary();
  const { data: graph } = useGraph();
  const { data: snapshots } = useTimeline();
  const { select, selected, events } = useUi();
  const [scrub, setScrub] = useState<number | null>(null);
  const snap = scrub != null && snapshots ? snapshots[scrub] : null;
  const sriSeries = useMemo(() => (snapshots ?? []).map((s) => s.sri), [snapshots]);

  if (!summary || !graph) return <Loading />;
  const tc = THREAT_COLOR[summary.threat_level] ?? "#93a3c4";
  const services = summary.services.filter((s) => s.likelihood > 0.05).slice(0, 7);
  const sri = snap?.sri ?? summary.systemic_risk_index;
  const threat = snap?.threat_level ?? summary.threat_level;

  return (
    <div className="space-y-4 p-4 lg:p-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Monitored assets" value={summary.monitored_assets} sub={`${summary.cyber_assets} cyber · ${summary.physical_assets} physical`} color="#8cc8ff" icon={Layers} delay={0} />
        <Kpi label="Act now" value={summary.high_risk_assets} sub={`${summary.counts.NEXT} next · ${summary.counts.MONITOR} monitor`} color="#f43f5e" icon={Siren} spark={snapshots?.map((s) => s.counts.NOW)} delay={0.05} />
        <Kpi label="Single points of failure" value={summary.critical_dependencies} sub="assets whose loss pushes a service to backup" color="#fb923c" icon={Link2} delay={0.1} />
        <Kpi label="Open incidents" value={summary.open_incidents} sub={summary.under_investigation.length ? `evidence on ${summary.under_investigation.slice(0, 3).join(", ")}` : "no active evidence"} color="#fbbf24" icon={AlertTriangle} delay={0.15} />
        <Kpi label="Citizens served" value={Math.round(summary.population_served / 1000)} sub="thousand residents across 6 zones" color="#4ade80" icon={Users} delay={0.2} />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="relative overflow-hidden xl:col-span-8">
          <PanelHeader
            title="Infrastructure overview"
            icon={<Zap className="size-3.5" />}
            sub={snap ? `Time machine · ${fmtTime(snap.ts)} · ${snap.title}` : "Live · click any asset to inspect it"}
            right={
              <Link to="/app/twin" className="flex items-center gap-1 text-[11px] text-mute hover:text-white">
                Full twin <ArrowUpRight className="size-3" />
              </Link>
            }
          />
          <div className="relative h-[460px]">
            <GeoTwin graph={graph} selected={selected} onSelect={(id) => select(id)} scores={snap?.scores ?? null} compact flyOnSelect={false} />
            <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-2">
              {[
                ["Power flow", "#4ade80"],
                ["Cyber link", "#60a5fa"],
                ["Legacy rule", "#f43f5e"],
                ["Undocumented", "#fb923c"],
              ].map(([l, c]) => (
                <span key={l} className="flex items-center gap-1.5 rounded bg-ink-950/80 px-2 py-1 font-mono text-[10px] text-mute backdrop-blur">
                  <span className="h-0.5 w-3 rounded" style={{ background: c }} />
                  {l}
                </span>
              ))}
            </div>
            {snap && (
              <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-md border border-cyber/40 bg-ink-950/85 px-3 py-1.5 font-mono text-[11px] text-[#d6caff] backdrop-blur">
                <Clock3 className="mr-1.5 inline size-3.5" />
                Replaying {fmtTime(snap.ts)} · SRI {snap.sri}
              </div>
            )}
          </div>
        </Panel>

        <div className="flex flex-col gap-4 xl:col-span-4">
          <Panel className="p-4">
            <div className="flex items-center gap-5">
              <RingGauge value={sri} color={THREAT_COLOR[threat] ?? tc} label="systemic risk" size={132} />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[10px] tracking-[0.16em] text-dim uppercase">Threat level</div>
                <div className="font-mono text-2xl font-semibold" style={{ color: THREAT_COLOR[threat] ?? tc }}>
                  {threat}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {(["NOW", "NEXT", "MONITOR"] as const).map((p) => (
                    <div key={p} className="rounded-md bg-white/[0.03] py-1.5">
                      <div className="font-mono text-lg text-white">{(snap?.counts ?? summary.counts)[p]}</div>
                      <PriorityPill priority={p} className="mt-0.5" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-dim">Impact-weighted average likelihood of compromise across all 27 cyber assets.</p>
          </Panel>

          <Panel className="flex min-h-0 flex-1 flex-col">
            <PanelHeader title="Priority alerts" icon={<Siren className="size-3.5" />} sub="Consequence-aware ranking" />
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              <AnimatePresence initial={false}>
                {(snap ? snap.top.map((t) => summary.top.find((x) => x.id === t.id) ?? null).filter(Boolean) : summary.top).map((r, i) =>
                  r ? (
                    <motion.button
                      layout
                      key={r.id}
                      onClick={() => select(r.id)}
                      className={cn("flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition hover:bg-white/[0.04]", selected === r.id && "bg-volt/10")}
                    >
                      <span className="w-4 font-mono text-[11px] text-dim">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[12.5px] font-medium text-white">{r.id}</span>
                          <PriorityPill priority={r.priority} />
                          {r.activity && <span className="size-1.5 animate-pulse rounded-full bg-crit" title="activity evidence" />}
                        </div>
                        <div className="truncate text-[11px] text-dim">{r.name}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-[15px] font-semibold" style={{ color: scoreColor(r.score) }}>
                          {(snap?.scores[r.id] ?? r.score).toFixed(0)}
                        </div>
                        <div className="font-mono text-[9.5px] text-dim">CVSS #{r.cvss_rank}</div>
                      </div>
                    </motion.button>
                  ) : null,
                )}
              </AnimatePresence>
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-4">
          <PanelHeader title="Essential services at risk" icon={<Hospital className="size-3.5" />} sub="Disruption likelihood and backup endurance" />
          <div className="space-y-1 p-2">
            {services.map((s) => {
              const Icon = FACILITY_ICON[s.type] ?? Building2;
              return (
                <button key={s.id} onClick={() => select(s.id)} className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-white/[0.04]">
                  <Icon className="size-4 shrink-0 text-volt-2" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] text-[#dbe6ff]">{s.name}</div>
                    <div className="truncate text-[10.5px] text-dim">
                      via {s.via} · {s.population ? `${fmtPop(s.population)} people` : s.type}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-mono text-[12px] text-white">{pct(s.likelihood)}</span>
                    {s.backup_hours ? <span className="rounded bg-impact/15 px-1 font-mono text-[9.5px] text-[#ffd59a]">{s.backup_hours}h backup</span> : <StateBadge state={s.state} />}
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel className="flex flex-col xl:col-span-4">
          <PanelHeader title="Event stream" icon={<Radio className="size-3.5 text-crit" />} sub={`${summary.events_total} synthetic events recorded`} />
          <div className="max-h-[330px] min-h-0 flex-1 overflow-y-auto p-1.5">
            {events.slice(0, 14).map((e, i) => (
              <EventRow key={e.id} e={e} fresh={i === 0} onClick={() => e.asset_id && select(e.asset_id)} />
            ))}
          </div>
        </Panel>

        <Panel className="xl:col-span-4">
          <PanelHeader
            title="Time machine"
            icon={<Clock3 className="size-3.5" />}
            sub="Systemic risk after every risk-changing event"
            right={
              scrub != null && (
                <button onClick={() => setScrub(null)} className="rounded bg-volt/20 px-2 py-0.5 text-[10.5px] text-white">
                  Back to live
                </button>
              )
            }
          />
          <div className="p-3">
            {snapshots && snapshots.length > 1 ? (
              <>
                <LineChart series={[{ name: "Systemic risk index", points: sriSeries.map((y, x) => ({ x, y })) }]} height={170} xFormat={(v) => `#${v}`} xLabel="snapshot" markers={scrub != null ? [{ x: scrub, label: "replay" }] : []} />
                <input type="range" min={0} max={snapshots.length - 1} value={scrub ?? snapshots.length - 1} onChange={(e) => setScrub(Number(e.target.value) === snapshots.length - 1 ? null : Number(e.target.value))} className="mt-2 w-full accent-[#a78bfa]" aria-label="Scrub the risk timeline" />
                <div className="mt-1 truncate font-mono text-[10.5px] text-mute">{snap ? `${fmtTime(snap.ts)} · ${snap.title}` : `Live · ${snapshots.length} snapshots`}</div>
              </>
            ) : (
              <div className="py-10 text-center text-[12px] text-dim">Snapshots appear as events change risk.</div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
