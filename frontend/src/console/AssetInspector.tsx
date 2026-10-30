import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Cpu, ExternalLink, FlaskConical, Plus, Radio, X, Zap } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Badge, Kv, Loading, Meter, PriorityPill, SeverityDot, StateBadge, Tabs } from "../components/ui";
import { RingGauge } from "../components/charts";
import { api } from "../lib/api";
import { fmtPop, pct, scoreColor, timeAgo, TYPE_LABEL } from "../lib/format";
import { useAsset } from "../lib/queries";
import { useUi } from "../lib/store";

type Tab = "overview" | "risk" | "vulns" | "network" | "events" | "actions";
const MATCH_COLOR = { confirmed: "#f43f5e", potential: "#fbbf24", not_applicable: "#5d6d8f" };

export default function AssetInspector() {
  const { selected, inspectorOpen, closeInspector, select, setScenario } = useUi();
  const { data, isLoading } = useAsset(inspectorOpen ? selected : null);
  const [tab, setTab] = useState<Tab>("overview");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.updateAsset(selected!, body),
    onSuccess: () => qc.invalidateQueries(),
  });
  const task = useMutation({ mutationFn: (id: string) => api.createTask(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }) });
  const a = data?.asset;
  const r = data?.risk;

  return (
    <AnimatePresence>
      {inspectorOpen && (
        <motion.aside
          initial={{ x: 480, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 480, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
          className="fixed top-14 right-0 bottom-0 z-40 flex w-full max-w-[460px] flex-col border-l border-line-strong bg-ink-900/95 shadow-[-30px_0_80px_-20px_rgb(0,0,0,0.8)] backdrop-blur-2xl"
        >
          {isLoading || !a ? (
            <Loading label="Opening asset" />
          ) : (
            <>
              <div className="relative border-b border-line p-4">
                <button onClick={closeInspector} className="absolute top-3 right-3 rounded-md p-1 text-dim hover:bg-white/5 hover:text-white" aria-label="Close inspector">
                  <X className="size-4" />
                </button>
                <div className="flex items-start gap-4">
                  {r ? (
                    <RingGauge value={r.asset.score} color={scoreColor(r.asset.score)} size={96} label="priority" />
                  ) : (
                    <div className="flex size-24 items-center justify-center rounded-full border border-line-strong">
                      <Zap className="size-7 text-volt-2" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-lg font-semibold text-white">{a.id}</span>
                      {r && <PriorityPill priority={r.asset.priority} />}
                      {data.activity?.level && <Badge color="#f43f5e">activity: {data.activity.level}</Badge>}
                    </div>
                    <div className="mt-0.5 text-[13px] text-[#c4d3ee]">{a.name}</div>
                    <div className="mt-1 text-[11px] text-dim">
                      {TYPE_LABEL[a.type] ?? a.type} · {a.site_name ?? "—"} {a.zone && a.category === "cyber" ? `· zone ${a.zone}` : ""}
                    </div>
                    {r && (
                      <div className="mt-2 flex gap-3 font-mono text-[10.5px] text-mute">
                        <span>rank #{r.asset.rank}</span>
                        <span>CVSS rank #{r.asset.cvss_rank}</span>
                        <span>P {pct(r.asset.likelihood)}</span>
                        <span>I {pct(r.asset.impact)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: "overview", label: "Overview" },
                  ...(r ? [{ value: "risk" as Tab, label: "Risk" }] : []),
                  ...(data.matches.length ? [{ value: "vulns" as Tab, label: "CVEs", count: data.matches.filter((m) => m.status !== "not_applicable").length }] : []),
                  { value: "network", label: "Network" },
                  { value: "events", label: "Events", count: data.events.length },
                  ...(data.counterfactuals?.length ? [{ value: "actions" as Tab, label: "Actions" }] : []),
                ]}
              />
              <div className="min-h-0 flex-1 overflow-y-auto p-4 text-[13px]">
                {tab === "overview" && (
                  <div className="space-y-4">
                    {a.description && <p className="leading-relaxed text-[#b3c3df]">{a.description}</p>}
                    <div className="hud p-3">
                      <Kv k="Criticality" v={a.criticality_label} />
                      {a.category === "cyber" && <Kv k="Exposure" v={a.exposure} />}
                      {a.category === "cyber" && <Kv k="Authentication" v={a.auth} />}
                      {a.category === "cyber" && <Kv k="Monitoring" v={pct(a.monitoring)} />}
                      <Kv k="Redundancy" v={a.redundancy} />
                      {a.software?.map((s) => <Kv key={s.product} k={s.kind === "application" ? "Software" : "Firmware"} v={`${s.vendor} ${s.product} ${s.version}`} />)}
                      {a.ip && <Kv k="Address" v={<span className="font-mono">{a.ip}</span>} />}
                      {a.population != null && <Kv k="Population served" v={a.population.toLocaleString("en-IN")} />}
                      {a.backup_hours != null && a.backup_hours > 0 && <Kv k="Backup endurance" v={`${a.backup_hours} h`} />}
                      {a.owner && <Kv k="Owner" v={a.owner} />}
                    </div>
                    {data.service_risk && (
                      <div className="hud p-3">
                        <div className="mb-1 font-mono text-[10px] tracking-widest text-dim uppercase">Disruption risk</div>
                        <div className="flex items-center justify-between">
                          <span className="text-white">{pct(data.service_risk.likelihood)}</span>
                          <StateBadge state={data.service_risk.state} />
                        </div>
                        <div className="mt-1 text-[11px] text-mute">
                          via {data.service_risk.via} · {data.service_risk.cause}
                        </div>
                      </div>
                    )}
                    {data.impact_if_manipulated && (
                      <div className="hud p-3">
                        <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-dim uppercase">
                          <Radio className="size-3" /> If manipulated
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <div className="font-mono text-lg text-white">{fmtPop(data.impact_if_manipulated.citizens_without_power)}</div>
                            <div className="text-[10px] text-dim">citizens off supply</div>
                          </div>
                          <div>
                            <div className="font-mono text-lg text-white">{data.impact_if_manipulated.essential_services_affected}</div>
                            <div className="text-[10px] text-dim">essential services</div>
                          </div>
                          <div>
                            <div className="font-mono text-lg text-white">{data.impact_if_manipulated.time_to_harm_hours ?? "—"}{data.impact_if_manipulated.time_to_harm_hours != null && "h"}</div>
                            <div className="text-[10px] text-dim">time to harm</div>
                          </div>
                        </div>
                      </div>
                    )}
                    {a.category === "cyber" && (
                      <div className="hud p-3">
                        <div className="mb-2 font-mono text-[10px] tracking-widest text-dim uppercase">Twin controls · changes persist and re-score</div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] text-mute">Status</span>
                          {["active", "unavailable", "isolated"].map((s) => (
                            <button key={s} disabled={patch.isPending} onClick={() => patch.mutate({ status: s })} className={`rounded px-2 py-0.5 text-[11px] ${a.status === s ? "bg-volt/25 text-white shadow-[inset_0_0_0_1px_rgb(120,180,255,0.5)]" : "bg-white/5 text-mute hover:text-white"}`}>
                              {s}
                            </button>
                          ))}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-[11px] text-mute">Criticality</span>
                          {[1, 2, 3, 4, 5].map((c) => (
                            <button key={c} disabled={patch.isPending} onClick={() => patch.mutate({ criticality: c })} className={`size-6 rounded font-mono text-[11px] ${a.criticality === c ? "bg-volt/25 text-white shadow-[inset_0_0_0_1px_rgb(120,180,255,0.5)]" : "bg-white/5 text-mute hover:text-white"}`}>
                              {c}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {tab === "risk" && r && (
                  <div className="space-y-4">
                    <div>
                      <div className="mb-2 font-mono text-[10px] tracking-widest text-dim uppercase">Why it ranks here</div>
                      <ul className="space-y-1.5">
                        {r.reasons.map((x) => (
                          <li key={x} className="flex gap-2 text-[#c9d7f0]">
                            <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-volt-2" />
                            {x}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-2.5">
                      {r.factors.map((f) => (
                        <div key={f.key}>
                          <div className="flex items-baseline justify-between text-[12px]">
                            <span className="text-[#d3e0f7]">{f.label}</span>
                            <span className="font-mono text-[11px] text-mute">{f.rating}</span>
                          </div>
                          <Meter value={f.value} className="mt-1" />
                          <div className="mt-0.5 text-[10.5px] text-dim">{f.detail}</div>
                        </div>
                      ))}
                    </div>
                    {r.consequences.length > 0 && (
                      <div>
                        <div className="mb-2 font-mono text-[10px] tracking-widest text-dim uppercase">Downstream consequences</div>
                        {r.consequences.map((c) => (
                          <button key={c.node + c.state} onClick={() => select(c.node.split("@")[0])} className="flex w-full items-center justify-between border-b border-white/[0.04] py-1.5 text-left text-[12px] hover:text-white">
                            <span className="text-[#c9d7f0]">
                              {c.node} <span className="text-dim">{c.name}</span>
                            </span>
                            <span className="font-mono text-[10.5px] text-mute">{c.state}{c.via ? ` · via ${c.via}` : ""}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {r.attack_path.length > 1 && (
                      <div>
                        <div className="mb-2 font-mono text-[10px] tracking-widest text-dim uppercase">Candidate attack path (hypothesis)</div>
                        <div className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
                          {r.attack_path.map((n, i) => (
                            <span key={n} className="flex items-center gap-1">
                              <span className="rounded bg-cyber/15 px-1.5 py-0.5 text-[#d6caff]">{n}</span>
                              {i < r.attack_path.length - 1 && <ArrowRight className="size-3 text-dim" />}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {data.ml && (
                      <div className="hud p-3">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-dim uppercase">
                            <Cpu className="size-3" /> ML second opinion
                          </span>
                          <span className="font-mono text-[12px] text-white">{pct(data.ml.probability)}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-mute">Rule-based likelihood {pct(r.asset.likelihood)}. Gradient-boosted model trained on synthetic incident histories.</div>
                        <div className="mt-2 space-y-1">
                          {data.ml.attribution.slice(0, 4).map((x) => (
                            <div key={x.feature} className="flex justify-between text-[11px]">
                              <span className="text-[#bfcde8]">{x.label}</span>
                              <span className="font-mono" style={{ color: x.contribution >= 0 ? "#fb923c" : "#34d399" }}>
                                {x.contribution >= 0 ? "+" : ""}
                                {(x.contribution * 100).toFixed(1)} pts
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="rounded-md border border-line bg-ink-950/60 p-3 font-mono text-[10.5px] leading-relaxed text-[#8fb3e8]">
                      {Object.values(r.formula).map((f) => (
                        <div key={f}>{f}</div>
                      ))}
                    </div>
                  </div>
                )}

                {tab === "vulns" && (
                  <div className="space-y-2.5">
                    {data.matches.map((m) => (
                      <div key={m.advisory_id} className="hud p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[12px] text-white">{m.advisory_id}</span>
                          <Badge color={MATCH_COLOR[m.status]}>{m.status.replace("_", " ")}</Badge>
                        </div>
                        <div className="mt-1 text-[12px] text-[#c9d7f0]">{m.advisory.title}</div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <Badge color={scoreColor(m.advisory.cvss * 10)}>CVSS {m.advisory.cvss}</Badge>
                          <Badge>{m.advisory.exploit_maturity} exploit</Badge>
                          {m.advisory.kev && <Badge color="#f43f5e">known exploited</Badge>}
                          <Badge>EPSS {m.advisory.epss}</Badge>
                        </div>
                        <div className="mt-2 text-[11px] text-mute">{m.reason}</div>
                        {m.status !== "not_applicable" && <div className="mt-1.5 text-[11px] text-[#9fe3c0]">Fix: {m.advisory.remediation}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {tab === "network" && (
                  <div className="space-y-4">
                    {[
                      ["Inbound communication", data.cyber_in, "source"],
                      ["Outbound communication", data.cyber_out, "target"],
                    ].map(([title, rows, key]) =>
                      (rows as typeof data.cyber_in).length ? (
                        <div key={title as string}>
                          <div className="mb-1.5 font-mono text-[10px] tracking-widest text-dim uppercase">{title as string}</div>
                          {(rows as typeof data.cyber_in).map((e) => (
                            <button key={e.id} onClick={() => select(e[key as "source" | "target"])} className="flex w-full items-center justify-between gap-2 border-b border-white/[0.04] py-1.5 text-left text-[12px] hover:text-white">
                              <span className="text-[#c9d7f0]">{e[key as "source" | "target"]}</span>
                              <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-mute">
                                {e.protocol}
                                {e.policy === "legacy_exception" && <Badge color="#f43f5e">legacy rule</Badge>}
                                {e.policy === "controlled" && <Badge color="#22d3ee">controlled</Badge>}
                                {e.status !== "active" && <Badge color="#5d6d8f">inactive</Badge>}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null,
                    )}
                    {[...data.ops_in.map((e) => ({ ...e, dir: "in" })), ...data.ops_out.map((e) => ({ ...e, dir: "out" }))].length > 0 && (
                      <div>
                        <div className="mb-1.5 font-mono text-[10px] tracking-widest text-dim uppercase">Operational dependencies</div>
                        {[...data.ops_in.map((e) => ({ ...e, dir: "in" })), ...data.ops_out.map((e) => ({ ...e, dir: "out" }))].map((e) => (
                          <button key={e.id} onClick={() => select(e.dir === "in" ? e.source : e.target)} className="flex w-full items-center justify-between border-b border-white/[0.04] py-1.5 text-left text-[12px] hover:text-white">
                            <span className="text-[#c9d7f0]">{e.dir === "in" ? `← ${e.source}` : `→ ${e.target}`}</span>
                            <span className="font-mono text-[10.5px] text-mute">
                              {e.relation} · {e.role}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tab === "events" && (
                  <div className="space-y-2">
                    {data.events.length === 0 && <div className="text-dim">No events recorded for this asset.</div>}
                    {data.events.map((e) => (
                      <div key={e.id} className="flex gap-2.5 border-b border-white/[0.04] pb-2">
                        <div className="pt-1">
                          <SeverityDot severity={e.severity} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[12px] text-[#dbe6ff]">{e.title}</div>
                          <div className="text-[11px] text-dim">{e.detail}</div>
                          <div className="mt-0.5 font-mono text-[10px] text-ink-500">
                            {e.id} · {timeAgo(e.ts)} · {e.evidence}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {tab === "actions" && data.counterfactuals && (
                  <div className="space-y-2">
                    <div className="text-[11px] text-dim">Each option is re-scored on a sandbox copy of the twin.</div>
                    {data.counterfactuals.map((c) => (
                      <div key={c.id} className="hud p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-[12.5px] text-white">{c.title}</div>
                            <div className="text-[11px] text-dim">
                              ₹{c.cost_lakh}L · {c.effort} · {c.category}
                            </div>
                          </div>
                          <div className="text-right font-mono text-[12px]">
                            <span className="text-mute">{c.score_before.toFixed(0)}</span> <ArrowRight className="inline size-3 text-dim" /> <span style={{ color: scoreColor(c.score_after) }}>{c.score_after.toFixed(0)}</span>
                            <div className="text-[10px] text-dim">SRI {c.sri_delta > 0 ? "+" : ""}{c.sri_delta}</div>
                          </div>
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button onClick={() => task.mutate(c.id)} className="flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-[11px] text-mute hover:text-white">
                            <Plus className="size-3" /> Create task
                          </button>
                        </div>
                      </div>
                    ))}
                    {task.isSuccess && <div className="text-[11px] text-ok">Task created. Track it in Compliance & Audit.</div>}
                  </div>
                )}
              </div>
              {a.category === "cyber" && (
                <div className="flex gap-2 border-t border-line p-3">
                  <button
                    onClick={() => {
                      setScenario(null);
                      navigate(`/app/scenarios?asset=${a.id}`);
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-volt/20 py-2 text-[12px] text-white shadow-[inset_0_0_0_1px_rgb(120,180,255,0.4)] hover:bg-volt/30"
                  >
                    <FlaskConical className="size-3.5" /> Simulate compromise
                  </button>
                  <button onClick={() => navigate(`/app/twin`)} className="flex items-center gap-1.5 rounded-md bg-white/5 px-3 text-[12px] text-mute hover:text-white">
                    <ExternalLink className="size-3.5" /> On map
                  </button>
                </div>
              )}
            </>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
