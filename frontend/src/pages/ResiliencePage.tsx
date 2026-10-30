import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Factory, GitMerge, Link2Off, Plus, Scissors, Split } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { BarList, RingGauge, SERIES } from "../components/charts";
import { Badge, Button, Loading, Panel, PanelHeader, StateBadge, Tabs } from "../components/ui";
import { api } from "../lib/api";
import { fmtPop } from "../lib/format";
import { useUi } from "../lib/store";

type Tab = "spof" | "chokepoints" | "drift" | "vendors";

export default function ResiliencePage() {
  const [tab, setTab] = useState<Tab>("chokepoints");
  const { select } = useUi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const spof = useQuery({ queryKey: ["spof"], queryFn: api.spof });
  const choke = useQuery({ queryKey: ["chokepoints"], queryFn: api.chokepoints });
  const drift = useQuery({ queryKey: ["drift"], queryFn: api.drift });
  const vendors = useQuery({ queryKey: ["vendors"], queryFn: api.vendors });
  const [alt, setAlt] = useState<Record<string, any>>({});
  const testAlt = useMutation({
    mutationFn: (b: { source: string; target: string; node: string }) => api.alternative(b),
    onSuccess: (r, b) => setAlt((a) => ({ ...a, [b.node]: r })),
  });
  const task = useMutation({ mutationFn: (id: string) => api.createTask(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }) });
  const accept = useMutation({
    mutationFn: (e: { source: string; target: string; protocol: string }) => api.addEdge({ source: e.source, target: e.target, protocol: e.protocol, purpose: "Accepted from observed traffic (twin drift)", policy: "controlled", monitored: true }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const [done, setDone] = useState<Set<string>>(new Set());

  return (
    <div className="space-y-4 p-4 lg:p-5">
      <Panel>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "chokepoints", label: "Attack-path chokepoints" },
            { value: "spof", label: "Single points of failure", count: spof.data?.filter((s: { is_spof: boolean }) => s.is_spof).length },
            { value: "drift", label: "Twin drift", count: drift.data ? drift.data.shadow_connections.length + drift.data.stale_connections.length : undefined },
            { value: "vendors", label: "Vendor concentration" },
          ]}
        />
      </Panel>

      {tab === "chokepoints" &&
        (choke.data ? (
          <div className="grid gap-4 xl:grid-cols-12">
            <Panel className="p-5 xl:col-span-4">
              <Scissors className="size-6 text-cyan" />
              <div className="mt-3 font-mono text-5xl font-semibold text-white">{choke.data.paths_eliminated_pct}%</div>
              <div className="mt-1 text-[13px] text-[#c9d7f0]">of modelled attack paths severed by {choke.data.cut.length} changes</div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-center font-mono">
                <div className="rounded bg-white/[0.03] py-2">
                  <div className="text-xl text-white">{choke.data.before.paths}</div>
                  <div className="text-[10px] text-dim">paths today</div>
                </div>
                <div className="rounded bg-white/[0.03] py-2">
                  <div className="text-xl text-cyan">{choke.data.after.paths}</div>
                  <div className="text-[10px] text-dim">after the cut</div>
                </div>
              </div>
              <div className="mt-4 space-y-1 text-[11.5px] text-mute">
                {Object.entries(choke.data.before.by_entry).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span>from {k}</span>
                    <span className="font-mono text-white">{v as number}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[11px] leading-relaxed text-dim">Max-flow / min-cut between untrusted entry points and the crown jewels: {choke.data.before.crown_jewels.join(", ")}.</p>
            </Panel>
            <Panel className="xl:col-span-8">
              <PanelHeader title="Minimum cut" icon={<Link2Off className="size-3.5" />} sub={choke.data.explanation} />
              <div className="space-y-2 p-3">
                {choke.data.cut.map((c: any) => (
                  <div key={c.edge_id} className="hud flex flex-wrap items-center gap-3 p-3">
                    <div className="flex items-center gap-2 font-mono text-[12.5px]">
                      <button onClick={() => select(c.source)} className="rounded bg-white/5 px-1.5 py-0.5 text-white hover:bg-white/10">
                        {c.source}
                      </button>
                      <ArrowRight className="size-3.5 text-crit" />
                      <button onClick={() => select(c.target)} className="rounded bg-white/5 px-1.5 py-0.5 text-white hover:bg-white/10">
                        {c.target}
                      </button>
                    </div>
                    <div className="min-w-40 flex-1">
                      <div className="text-[12px] text-[#c9d7f0]">{c.purpose}</div>
                      <div className="font-mono text-[10.5px] text-dim">
                        {c.edge_id} · {c.protocol} · hop likelihood {Math.round(c.likelihood * 100)}% {c.direction === "reverse" && "· reverse channel"}
                      </div>
                    </div>
                    <Badge color={c.mitigation.startsWith("diode") ? "#a78bfa" : "#22d3ee"}>{c.mitigation}</Badge>
                    <Button size="sm" onClick={() => (task.mutate(c.mitigation), setDone((d) => new Set(d).add(c.edge_id)))} disabled={done.has(c.edge_id)}>
                      <Plus className="size-3" /> {done.has(c.edge_id) ? "Task created" : "Create task"}
                    </Button>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        ) : (
          <Loading />
        ))}

      {tab === "spof" &&
        (spof.data ? (
          <Panel>
            <PanelHeader title="Single points of failure" icon={<GitMerge className="size-3.5" />} sub="Loss of one asset pushes an essential service onto backup or offline" />
            <div className="divide-y divide-white/[0.04]">
              {spof.data
                .filter((s: { is_spof: boolean }) => s.is_spof)
                .map((s: any) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                    <button onClick={() => select(s.id)} className="w-28 text-left">
                      <div className="font-mono text-[13px] font-semibold text-white">{s.id}</div>
                      <div className="truncate text-[10.5px] text-dim">{s.name}</div>
                    </button>
                    <div className="flex min-w-48 flex-1 flex-wrap gap-1.5">
                      {s.essential_services.map((f: any) => (
                        <span key={f.id} className="flex items-center gap-1 text-[11px] text-[#c9d7f0]">
                          {f.id} <StateBadge state={f.state} />
                        </span>
                      ))}
                      {s.zones_lost.map((z: string) => (
                        <Badge key={z} color="#f43f5e">
                          {z} lost
                        </Badge>
                      ))}
                    </div>
                    <div className="w-28 text-right font-mono text-[12px] text-white">
                      {fmtPop(s.citizens_without_power)}
                      <div className="text-[10px] text-dim">{s.time_to_harm_hours != null ? `harm in ${s.time_to_harm_hours}h` : "citizens"}</div>
                    </div>
                    {s.suggestion && (
                      <div className="w-64">
                        {alt[s.id] ? (
                          <div className="text-[11px] text-cyan">
                            {s.suggestion.label}: services affected {alt[s.id].before.essential_services_affected} → {alt[s.id].after.essential_services_affected}, citizens {fmtPop(alt[s.id].before.citizens_without_power)} → {fmtPop(alt[s.id].after.citizens_without_power)}
                          </div>
                        ) : (
                          <Button size="sm" onClick={() => testAlt.mutate({ source: s.suggestion.source, target: s.suggestion.target, node: s.id })}>
                            Test: {s.suggestion.label}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </Panel>
        ) : (
          <Loading />
        ))}

      {tab === "drift" &&
        (drift.data ? (
          <div className="grid gap-4 xl:grid-cols-12">
            <Panel className="flex flex-col items-center p-5 xl:col-span-3">
              <RingGauge value={drift.data.fidelity_score} color={drift.data.fidelity_score >= 80 ? "#34d399" : "#fbbf24"} label="twin fidelity" />
              <p className="mt-3 text-center text-[11.5px] leading-relaxed text-dim">How closely the model matches what the network actually does. Shadow connections and unknown firmware lower it.</p>
            </Panel>
            <div className="space-y-4 xl:col-span-9">
              <Panel>
                <PanelHeader title="Shadow connections" icon={<Split className="size-3.5" />} sub="Observed on the wire, missing from the model" />
                <div className="space-y-2 p-3">
                  {drift.data.shadow_connections.length === 0 && <div className="text-[12px] text-dim">None observed.</div>}
                  {drift.data.shadow_connections.map((s: any) => (
                    <div key={s.id} className="hud flex flex-wrap items-center gap-3 p-3">
                      <span className="font-mono text-[12.5px] text-white">
                        {s.source} → {s.target}
                      </span>
                      <Badge color={s.severity === "high" ? "#f43f5e" : "#fbbf24"}>{s.severity}</Badge>
                      {s.crosses_zone && <Badge color="#a78bfa">crosses zones</Badge>}
                      <div className="min-w-48 flex-1 text-[11.5px] text-mute">{s.detail}</div>
                      <Button size="sm" onClick={() => accept.mutate(s)} disabled={accept.isPending}>
                        Accept into model
                      </Button>
                    </div>
                  ))}
                </div>
              </Panel>
              <div className="grid gap-4 md:grid-cols-2">
                <Panel>
                  <PanelHeader title="Stale connections" sub="Modelled but not seen for over a week" />
                  <div className="space-y-2 p-3 text-[12px]">
                    {drift.data.stale_connections.map((s: any) => (
                      <div key={s.id} className="border-b border-white/[0.04] pb-2">
                        <div className="font-mono text-white">
                          {s.source} → {s.target} <span className="text-dim">({s.protocol})</span>
                        </div>
                        <div className="text-[11px] text-mute">Not seen for {Math.round(s.last_observed_hours / 24)} days · {s.recommendation}</div>
                      </div>
                    ))}
                  </div>
                </Panel>
                <Panel>
                  <PanelHeader title="Inventory uncertainty" sub="Partial firmware versions" />
                  <div className="space-y-2 p-3 text-[12px]">
                    {drift.data.inventory_uncertainty.map((u: any) => (
                      <button key={u.id} onClick={() => select(u.id)} className="block w-full border-b border-white/[0.04] pb-2 text-left">
                        <div className="font-mono text-white">
                          {u.id} <span className="text-dim">records "{u.recorded_version}"</span>
                        </div>
                        <div className="text-[11px] text-mute">
                          {u.software} · potential: {u.potential_matches.join(", ") || "none"}
                        </div>
                      </button>
                    ))}
                  </div>
                </Panel>
              </div>
            </div>
          </div>
        ) : (
          <Loading />
        ))}

      {tab === "vendors" &&
        (vendors.data ? (
          <div className="grid gap-4 xl:grid-cols-12">
            <Panel className="xl:col-span-5">
              <PanelHeader title="Citizens exposed by a vendor compromise" icon={<Factory className="size-3.5" />} />
              <div className="p-4">
                <BarList rows={vendors.data.map((v: any) => ({ id: v.vendor, label: v.vendor, value: v.compromise_citizens, color: SERIES[0], sub: `${v.count} assets · ${v.share_pct}% of the cyber fleet` }))} format={(v) => fmtPop(v)} onClick={(id) => navigate(`/app/scenarios?vendor=${encodeURIComponent(id)}`)} />
              </div>
            </Panel>
            <Panel className="xl:col-span-7">
              <PanelHeader title="Supply-chain concentration" sub="Click a vendor to simulate its compromise" />
              <table className="w-full text-[12px]">
                <thead className="font-mono text-[10px] tracking-wider text-dim uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left font-normal">Vendor</th>
                    <th className="py-2 text-right font-normal">Assets</th>
                    <th className="py-2 text-right font-normal">Avg crit.</th>
                    <th className="py-2 text-right font-normal">Open vulns</th>
                    <th className="py-2 text-right font-normal">Substations</th>
                    <th className="px-4 py-2 text-right font-normal">Risk mass</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.data.map((v: any) => (
                    <tr key={v.vendor} className="cursor-pointer border-t border-white/[0.04] hover:bg-white/[0.02]" onClick={() => navigate(`/app/scenarios?vendor=${encodeURIComponent(v.vendor)}`)}>
                      <td className="px-4 py-2 text-white">{v.vendor}</td>
                      <td className="py-2 text-right font-mono text-mute">{v.count}</td>
                      <td className="py-2 text-right font-mono text-mute">{v.avg_criticality}</td>
                      <td className="py-2 text-right font-mono text-mute">{v.open_vulnerabilities}</td>
                      <td className="py-2 text-right font-mono text-mute">{v.compromise_substations}</td>
                      <td className="px-4 py-2 text-right font-mono text-white">{v.risk_mass}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
        ) : (
          <Loading />
        ))}
    </div>
  );
}
