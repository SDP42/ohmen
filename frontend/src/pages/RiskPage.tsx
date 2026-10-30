import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowDown, ArrowUp, BrainCircuit, CalendarClock, Crosshair, GitCompareArrows, SlidersHorizontal, Table2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BarList, LineChart, RiskMatrix, SERIES } from "../components/charts";
import { Badge, Loading, Meter, Panel, PanelHeader, PriorityPill, Segmented } from "../components/ui";
import { api } from "../lib/api";
import { cn, pct, scoreColor, THREAT_COLOR } from "../lib/format";
import { useUi } from "../lib/store";
import type { Explanation } from "../lib/types";

const WEIGHTS = [
  ["vulnerability", "Vulnerability severity"],
  ["known_exploitation", "Known exploitation"],
  ["exposure", "Network exposure"],
  ["reachability", "Attack-path reachability"],
  ["activity", "Suspicious activity"],
  ["criticality", "Asset criticality"],
  ["redundancy", "Low-redundancy penalty"],
] as const;
const DEFAULT = Object.fromEntries(WEIGHTS.map(([k]) => [k, 1])) as Record<string, number>;

function useDebounced<T>(value: T, ms = 280) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function CompareCard({ e, label }: { e: Explanation; label: string }) {
  const a = e.asset;
  return (
    <div className="hud p-4">
      <div className="font-mono text-[10px] tracking-widest text-dim uppercase">{label}</div>
      <div className="mt-1 flex items-center justify-between">
        <span className="font-mono text-lg font-semibold text-white">{a.id}</span>
        <PriorityPill priority={a.priority} />
      </div>
      <div className="text-[12px] text-mute">{a.name}</div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center font-mono">
        <div className="rounded bg-white/[0.03] py-1.5">
          <div className="text-lg text-white">{a.cvss_max || "—"}</div>
          <div className="text-[9.5px] text-dim">CVSS · #{a.cvss_rank}</div>
        </div>
        <div className="rounded bg-white/[0.03] py-1.5">
          <div className="text-lg text-white">{pct(a.impact)}</div>
          <div className="text-[9.5px] text-dim">impact</div>
        </div>
        <div className="rounded bg-white/[0.03] py-1.5">
          <div className="text-lg" style={{ color: scoreColor(a.score) }}>
            {a.score.toFixed(0)}
          </div>
          <div className="text-[9.5px] text-dim">priority · #{a.rank}</div>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {e.factors.slice(0, 6).map((f) => (
          <div key={f.key}>
            <div className="flex justify-between text-[11px]">
              <span className="text-[#c9d7f0]">{f.label}</span>
              <span className="font-mono text-dim">{f.rating}</span>
            </div>
            <Meter value={f.value} className="mt-0.5" height={3} />
          </div>
        ))}
      </div>
      <ul className="mt-3 space-y-1 text-[11.5px] text-[#b3c3df]">
        {e.reasons.slice(0, 3).map((r) => (
          <li key={r}>· {r}</li>
        ))}
      </ul>
    </div>
  );
}

export default function RiskPage() {
  const { select, selected } = useUi();
  const [weights, setWeights] = useState(DEFAULT);
  const [scope, setScope] = useState<"all" | "now">("all");
  const [pair, setPair] = useState<[string, string]>(["PLC-003", "GW-004"]);
  const w = useDebounced(weights);
  const custom = JSON.stringify(w) !== JSON.stringify(DEFAULT);
  const { data, isFetching } = useQuery({ queryKey: ["risk", w], queryFn: () => (custom ? api.recompute(w) : api.risk()), placeholderData: keepPreviousData });
  const { data: compare } = useQuery({ queryKey: ["compare", pair], queryFn: () => api.compare(pair[0], pair[1]) });
  const { data: forecast } = useQuery({ queryKey: ["forecast"], queryFn: api.forecast });
  const { data: card } = useQuery({ queryKey: ["model-card"], queryFn: api.modelCard });
  const rows = useMemo(() => (data?.assets ?? []).filter((r) => scope === "all" || r.priority !== "MONITOR"), [data, scope]);
  if (!data) return <Loading />;
  const tc = THREAT_COLOR[data.threat_level];

  return (
    <div className="space-y-4 p-4 lg:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Panel className="flex items-center gap-4 px-4 py-2.5">
          <span className="font-mono text-[10px] tracking-widest text-dim uppercase">Systemic risk</span>
          <span className="font-mono text-2xl font-semibold text-white">{data.systemic_risk_index}</span>
          <Badge color={tc}>{data.threat_level}</Badge>
        </Panel>
        {(["NOW", "NEXT", "MONITOR"] as const).map((p) => (
          <Panel key={p} className="flex items-center gap-3 px-4 py-2.5">
            <PriorityPill priority={p} />
            <span className="font-mono text-xl text-white">{data.counts[p]}</span>
          </Panel>
        ))}
        {custom && (
          <Badge color="#a78bfa" className="ml-auto">
            custom weights applied
          </Badge>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-7">
          <PanelHeader
            title="Priority register"
            icon={<Table2 className="size-3.5" />}
            sub="Consequence-aware rank versus CVSS rank"
            right={<Segmented value={scope} onChange={setScope} options={[{ value: "all", label: "All 27" }, { value: "now", label: "NOW + NEXT" }]} />}
          />
          <div className={cn("max-h-[560px] overflow-y-auto transition-opacity", isFetching && "opacity-60")}>
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 z-10 bg-ink-900/95 font-mono text-[10px] tracking-wider text-dim uppercase backdrop-blur">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">#</th>
                  <th className="py-2 text-left font-normal">Asset</th>
                  <th className="py-2 text-left font-normal">Priority</th>
                  <th className="py-2 text-left font-normal">Score</th>
                  <th className="py-2 text-right font-normal">P</th>
                  <th className="py-2 text-right font-normal">I</th>
                  <th className="py-2 text-right font-normal">CVSS</th>
                  <th className="py-2 text-right font-normal">vs CVSS</th>
                  <th className="px-3 py-2 text-right font-normal">ML</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <motion.tr layout key={r.id} onClick={() => select(r.id)} className={cn("cursor-pointer border-t border-white/[0.04] hover:bg-white/[0.03]", selected === r.id && "bg-volt/10")}>
                    <td className="px-3 py-2 font-mono text-dim">{r.rank}</td>
                    <td className="py-2">
                      <div className="font-mono font-medium text-white">{r.id}</div>
                      <div className="max-w-44 truncate text-[10.5px] text-dim">{r.name}</div>
                    </td>
                    <td className="py-2">
                      <PriorityPill priority={r.priority} />
                    </td>
                    <td className="w-32 py-2 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="w-7 font-mono" style={{ color: scoreColor(r.score) }}>
                          {r.score.toFixed(0)}
                        </span>
                        <Meter value={r.score / 100} color={scoreColor(r.score)} height={3} />
                      </div>
                    </td>
                    <td className="py-2 text-right font-mono text-mute">{pct(r.likelihood)}</td>
                    <td className="py-2 text-right font-mono text-mute">{pct(r.impact)}</td>
                    <td className="py-2 text-right font-mono text-mute">{r.cvss_max || "—"}</td>
                    <td className="py-2 text-right font-mono">
                      {r.rank_delta > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-crit">
                          <ArrowUp className="size-3" />
                          {r.rank_delta}
                        </span>
                      ) : r.rank_delta < 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-ok">
                          <ArrowDown className="size-3" />
                          {-r.rank_delta}
                        </span>
                      ) : (
                        <span className="text-dim">=</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-dim">{r.ml_probability != null ? pct(r.ml_probability) : "—"}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-3 py-2 text-[10.5px] text-dim">↑ ranked higher than CVSS alone would place it (consequence pulls it up) · ↓ ranked lower (isolated or redundant)</div>
        </Panel>

        <div className="flex flex-col gap-4 xl:col-span-5">
          <Panel>
            <PanelHeader title="Risk matrix" icon={<Crosshair className="size-3.5" />} sub="Bubble size: population downstream" />
            <div className="p-3">
              <RiskMatrix
                points={data.assets.map((r) => ({ id: r.id, x: r.likelihood, y: r.impact, priority: r.priority, size: Math.min(1, (r.population_downstream ?? 0) / 1_500_000) }))}
                selected={selected}
                onSelect={(id) => select(id)}
              />
            </div>
          </Panel>
          <Panel>
            <PanelHeader
              title="Prioritisation weights"
              icon={<SlidersHorizontal className="size-3.5" />}
              sub="Change the assumptions, watch the ranking move"
              right={
                custom && (
                  <button onClick={() => setWeights(DEFAULT)} className="text-[11px] text-mute hover:text-white">
                    Reset
                  </button>
                )
              }
            />
            <div className="grid grid-cols-1 gap-x-5 gap-y-2 p-3 sm:grid-cols-2">
              {WEIGHTS.map(([k, label]) => (
                <label key={k} className="text-[11.5px] text-[#c8d6f0]">
                  <span className="flex justify-between">
                    {label}
                    <span className="font-mono text-dim">×{weights[k].toFixed(1)}</span>
                  </span>
                  <input type="range" min={0} max={2} step={0.1} value={weights[k]} onChange={(e) => setWeights((wt) => ({ ...wt, [k]: Number(e.target.value) }))} className="w-full accent-[#4f8dff]" />
                </label>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <Panel>
        <PanelHeader
          title="CVSS versus consequence"
          icon={<GitCompareArrows className="size-3.5" />}
          sub="Why a moderate vulnerability can matter more than a critical one"
          right={
            <div className="flex gap-2">
              {[0, 1].map((i) => (
                <select key={i} value={pair[i]} onChange={(e) => setPair((p) => (i === 0 ? [e.target.value, p[1]] : [p[0], e.target.value]))} className="h-7 rounded-md bg-white/[0.04] px-2 font-mono text-[11px] text-white outline-none">
                  {data.assets.map((r) => (
                    <option key={r.id} value={r.id} className="bg-ink-900">
                      {r.id}
                    </option>
                  ))}
                </select>
              ))}
            </div>
          }
        />
        <div className="grid gap-4 p-4 md:grid-cols-2">
          {compare ? (
            <>
              <CompareCard e={compare.a} label="Asset A" />
              <CompareCard e={compare.b} label="Asset B" />
            </>
          ) : (
            <Loading />
          )}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-8">
          <PanelHeader title="14-day risk forecast" icon={<CalendarClock className="size-3.5" />} sub="Exploit maturity rises, evidence ages, remediation lands on its day" />
          <div className="p-3">
            {forecast ? (
              <>
                <LineChart
                  series={[
                    { name: "No action", points: forecast.series.no_action.map((p: { day: number; sri: number }) => ({ x: p.day, y: p.sri })) },
                    { name: "Your plan", points: forecast.series.planned.map((p: { day: number; sri: number }) => ({ x: p.day, y: p.sri })) },
                    { name: "Recommended", points: forecast.series.recommended.map((p: { day: number; sri: number }) => ({ x: p.day, y: p.sri })) },
                  ]}
                  xLabel="day"
                  yLabel="systemic risk index"
                  xFormat={(v) => `d${v}`}
                  height={240}
                />
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-1.5 font-mono text-[10px] tracking-widest text-dim uppercase">Predicted escalations</div>
                    {forecast.predicted_escalations.length === 0 && <div className="text-[12px] text-dim">No asset predicted to cross into NOW.</div>}
                    {forecast.predicted_escalations.map((p: { id: string; name: string; day: number; score_today: number }) => (
                      <button key={p.id} onClick={() => select(p.id)} className="flex w-full items-center justify-between border-b border-white/[0.04] py-1.5 text-left text-[12px] hover:text-white">
                        <span>
                          <span className="font-mono text-white">{p.id}</span> <span className="text-dim">today {p.score_today.toFixed(0)}</span>
                        </span>
                        <Badge color="#f43f5e">NOW in {p.day}d</Badge>
                      </button>
                    ))}
                  </div>
                  <div>
                    <div className="mb-1.5 font-mono text-[10px] tracking-widest text-dim uppercase">Recommended plan</div>
                    {forecast.recommended_plan.map((p: { day: number; id: string; title: string; cost_lakh: number }) => (
                      <div key={p.id} className="flex items-center justify-between border-b border-white/[0.04] py-1.5 text-[12px]">
                        <span className="text-[#c9d7f0]">
                          <span className="font-mono text-dim">d{p.day}</span> {p.title}
                        </span>
                        <span className="font-mono text-[11px] text-mute">₹{p.cost_lakh}L</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <Loading label="Forecasting" />
            )}
          </div>
        </Panel>
        <Panel className="xl:col-span-4">
          <PanelHeader title="ML likelihood model" icon={<BrainCircuit className="size-3.5" />} sub="Second opinion, trained on synthetic histories" />
          {card ? (
            <div className="space-y-4 p-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ["ROC-AUC", card.metrics.roc_auc],
                  ["Avg precision", card.metrics.average_precision],
                  ["Brier", card.metrics.brier],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-md bg-white/[0.03] py-2">
                    <div className="font-mono text-[15px] text-white">{v}</div>
                    <div className="text-[10px] text-dim">{l}</div>
                  </div>
                ))}
              </div>
              <div className="text-[11.5px] text-mute">
                Agreement with the transparent engine: <span className="font-mono text-white">r = {card.agreement.pearson}</span>
              </div>
              <BarList rows={card.feature_importance.slice(0, 7).map((f: { feature: string; label: string; importance: number }) => ({ id: f.feature, label: f.label, value: f.importance, color: SERIES[0] }))} format={(v) => v.toFixed(3)} />
              <p className="text-[10.5px] leading-relaxed text-dim">{card.limitations[0]}</p>
            </div>
          ) : (
            <Loading />
          )}
        </Panel>
      </div>
    </div>
  );
}
