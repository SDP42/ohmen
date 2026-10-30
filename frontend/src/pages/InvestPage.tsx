import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeIndianRupee, CheckCircle2, ListChecks, TrendingDown } from "lucide-react";
import { useEffect, useState } from "react";
import { LineChart } from "../components/charts";
import { NumberTicker } from "../components/fx";
import { Badge, Button, Loading, Panel, PanelHeader } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/format";
import { useUi } from "../lib/store";

export default function InvestPage() {
  const { select } = useUi();
  const qc = useQueryClient();
  const [budget, setBudget] = useState(12);
  const [b, setB] = useState(12);
  useEffect(() => {
    const t = setTimeout(() => setB(budget), 300);
    return () => clearTimeout(t);
  }, [budget]);
  const { data, isFetching } = useQuery({ queryKey: ["optimize", b], queryFn: () => api.optimize(b), placeholderData: keepPreviousData });
  const tasks = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const [i, id] of ids.entries()) await api.createTask(id, 2 + i);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
  if (!data) return <Loading label="Optimising portfolio" />;
  const advantage = (data.reduction_pct - data.naive.reduction_pct).toFixed(1);

  return (
    <div className="space-y-4 p-4 lg:p-5">
      <Panel className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-72 flex-1">
            <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-volt-2 uppercase">
              <BadgeIndianRupee className="size-3.5" /> Security budget
            </div>
            <div className="mt-1 font-mono text-5xl font-semibold text-white">
              ₹{budget}
              <span className="ml-2 text-xl text-dim">lakh</span>
            </div>
            <input type="range" min={0} max={30} step={0.5} value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="mt-3 w-full max-w-xl accent-[#4f8dff]" aria-label="Budget in lakh rupees" />
          </div>
          <div className={cn("grid grid-cols-2 gap-3 transition-opacity md:grid-cols-4", isFetching && "opacity-60")}>
            {[
              ["Systemic risk", `${data.sri_before} → ${data.sri_after}`, "#ffffff"],
              ["Risk removed", `${data.reduction_pct}%`, "#22d3ee"],
              ["CVSS-first would remove", `${data.naive.reduction_pct}%`, "#93a3c4"],
              ["Spent", `₹${data.spent_lakh}L`, "#ffffff"],
            ].map(([l, v, c]) => (
              <div key={l} className="rounded-md bg-white/[0.03] px-4 py-3">
                <div className="font-mono text-xl font-semibold" style={{ color: c }}>
                  {v}
                </div>
                <div className="text-[10.5px] text-dim">{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-[13px] text-cyan">
          <TrendingDown className="size-4" /> Consequence-aware selection removes <span className="font-mono font-semibold"><NumberTicker value={Number(advantage)} decimals={1} /></span> more percentage points of systemic risk than patching by CVSS, for the same money.
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-7">
          <PanelHeader title="Efficiency frontier" sub="Systemic risk index against cumulative spend" />
          <div className="p-3">
            <LineChart
              series={[
                { name: "OHMEN optimiser", points: data.frontier.map((p: { cost: number; sri: number }) => ({ x: p.cost, y: p.sri })) },
                { name: "Patch by CVSS", points: data.naive.curve.map((p: { cost: number; sri: number }) => ({ x: p.cost, y: p.sri })) },
              ]}
              xLabel="₹ lakh"
              yLabel="systemic risk index"
              markers={[{ x: budget, label: `budget ₹${budget}L` }]}
              height={300}
            />
          </div>
        </Panel>
        <Panel className="xl:col-span-5">
          <PanelHeader
            title="Recommended portfolio"
            icon={<ListChecks className="size-3.5" />}
            sub={`${data.portfolio.length} actions chosen from ${data.pool_size} candidates`}
            right={
              <Button size="sm" variant="primary" onClick={() => tasks.mutate(data.portfolio.map((p: { id: string }) => p.id))} disabled={tasks.isPending || tasks.isSuccess || !data.portfolio.length}>
                {tasks.isSuccess ? <><CheckCircle2 className="size-3.5" /> Tasks created</> : "Create tasks"}
              </Button>
            }
          />
          <div className="max-h-[340px] space-y-1.5 overflow-y-auto p-3">
            {data.portfolio.map((p: { id: string; title: string; cost_lakh: number; sri_after: number; reduction: number; target: string; effort: string }, i: number) => (
              <button key={p.id} onClick={() => select(p.target)} className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-white/[0.04]">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-volt/15 font-mono text-[10.5px] text-volt-2">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] text-white">{p.title}</div>
                  <div className="text-[10.5px] text-dim">
                    ₹{p.cost_lakh}L · {p.effort} · −{p.reduction} SRI
                  </div>
                </div>
                <span className="font-mono text-[12px] text-cyan">{p.sri_after}</span>
              </button>
            ))}
          </div>
          {data.critical_assets_addressed.length > 0 && (
            <div className="border-t border-line p-3 text-[11.5px]">
              <span className="text-dim">Moves out of NOW: </span>
              {data.critical_assets_addressed.map((a: string) => (
                <Badge key={a} color="#34d399" className="mr-1">
                  {a}
                </Badge>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
