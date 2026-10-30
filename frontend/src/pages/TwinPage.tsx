import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Box, Eye, EyeOff, Layers, Map as MapIcon, X } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Badge, Loading, Panel, PriorityPill } from "../components/ui";
import { api } from "../lib/api";
import { cn, fmtPop, TYPE_LABEL } from "../lib/format";
import { useGraph } from "../lib/queries";
import { useUi } from "../lib/store";
import GeoTwin, { DEFAULT_LAYERS, type TwinLayers } from "../twin/GeoTwin";

const SubstationTwin = lazy(() => import("../twin/SubstationTwin"));
const SITES = [
  { id: "SUB-A", name: "Substation A · Dadar" },
  { id: "SUB-B", name: "Substation B · Andheri" },
  { id: "SUB-C", name: "Substation C · Kurla" },
  { id: "SUB-D", name: "Substation D · Worli" },
  { id: "SUB-E", name: "Substation E · Ghatkopar" },
  { id: "CC", name: "Control Centre · BKC" },
];

export default function TwinPage() {
  const { data: graph } = useGraph();
  const { select, selected, ghost, setGhost, scenario } = useUi();
  const [layers, setLayers] = useState<TwinLayers>(DEFAULT_LAYERS);
  const [site, setSite] = useState<string | null>(null);
  const { data: exposure } = useQuery({ queryKey: ["exposure"], queryFn: api.exposure, enabled: ghost });
  if (!graph) return <Loading />;
  const sel = graph.nodes.find((n) => n.id === selected);
  const scenarioStates = scenario ? Object.fromEntries(Object.entries(scenario.nodes).filter(([, v]) => v.state).map(([k, v]) => [k, v.state!])) : undefined;

  return (
    <div className="relative h-[calc(100dvh-56px)]">
      <GeoTwin graph={graph} layers={layers} selected={selected} onSelect={(id) => select(id)} ghost={ghost} exposure={exposure} scenario={scenario} />

      <div className="pointer-events-none absolute inset-0 p-4">
        <div className="pointer-events-auto flex w-64 flex-col gap-3">
          <Panel className="p-3">
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-volt-2 uppercase">
              <Layers className="size-3.5" /> Layers
            </div>
            {(Object.keys(layers) as (keyof TwinLayers)[]).map((k) => (
              <label key={k} className="flex cursor-pointer items-center justify-between py-1 text-[12.5px] text-[#c8d6f0]">
                <span className="capitalize">{k === "skyline" ? "Risk skyline (3D)" : k === "drift" ? "Undocumented links" : k}</span>
                <button onClick={() => setLayers((l) => ({ ...l, [k]: !l[k] }))} className={cn("relative h-4 w-7 rounded-full transition-colors", layers[k] ? "bg-volt" : "bg-white/10")}>
                  <span className={cn("absolute top-0.5 size-3 rounded-full bg-white transition-all", layers[k] ? "left-3.5" : "left-0.5")} />
                </button>
              </label>
            ))}
          </Panel>

          <Panel className="p-3" glow={ghost ? "#f43f5e" : undefined}>
            <button onClick={() => setGhost(!ghost)} className="flex w-full items-center justify-between text-left">
              <span className="flex items-center gap-2 text-[13px] text-white">
                {ghost ? <EyeOff className="size-4 text-crit" /> : <Eye className="size-4 text-cyber" />}
                Adversary ghost mode
              </span>
              <Badge color={ghost ? "#f43f5e" : "#93a3c4"}>{ghost ? "ON" : "OFF"}</Badge>
            </button>
            <p className="mt-1.5 text-[11px] leading-relaxed text-dim">Shows only what an attacker can reach from the internet, corporate IT or vendor networks.</p>
            {ghost && exposure && (
              <div className="mt-2 space-y-1">
                {exposure.reachable.slice(0, 6).map((r: { id: string; likelihood: number; first_hop_from: string }) => (
                  <button key={r.id} onClick={() => select(r.id)} className="flex w-full justify-between font-mono text-[11px] text-[#ffc1cc] hover:text-white">
                    <span>{r.id}</span>
                    <span className="text-dim">
                      {Math.round(r.likelihood * 100)}% · from {r.first_hop_from}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Panel>

          <Panel className="p-3">
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-volt-2 uppercase">
              <Box className="size-3.5" /> 3D site inspection
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {SITES.map((s) => (
                <button key={s.id} onClick={() => setSite(s.id)} className="rounded-md bg-white/[0.04] px-2 py-1.5 text-left text-[11px] text-[#c8d6f0] hover:bg-volt/15 hover:text-white">
                  {s.name.split(" · ")[0].replace("Substation", "Sub")}
                  <span className="block text-[10px] text-dim">{s.name.split(" · ")[1]}</span>
                </button>
              ))}
            </div>
          </Panel>
        </div>

        {scenario && (
          <div className="pointer-events-auto absolute top-4 left-1/2 -translate-x-1/2 rounded-md border border-cyber/40 bg-ink-950/85 px-3 py-1.5 text-[12px] text-[#d6caff] backdrop-blur">
            Scenario overlay · {scenario.id} · <span className="text-cyber">violet = potentially reachable</span> · <span className="text-impact">amber/red = potential consequence</span>
          </div>
        )}

        <AnimatePresence>
          {sel && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="pointer-events-auto absolute right-4 bottom-4 w-72">
              <Panel className="p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold text-white">{sel.id}</span>
                  {sel.risk && <PriorityPill priority={sel.risk.priority} />}
                </div>
                <div className="text-[12px] text-[#c4d3ee]">{sel.name}</div>
                <div className="mt-1 text-[11px] text-dim">
                  {TYPE_LABEL[sel.type]} {sel.population ? `· ${fmtPop(sel.population)} people` : ""}
                </div>
                {sel.site && SITES.some((s) => s.id === sel.site) && (
                  <button onClick={() => setSite(sel.site!)} className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md bg-volt/20 py-1.5 text-[12px] text-white shadow-[inset_0_0_0_1px_rgb(120,180,255,0.4)] hover:bg-volt/30">
                    <Box className="size-3.5" /> Open {sel.site} in 3D
                  </button>
                )}
              </Panel>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {site && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 bg-ink-950/70 p-4 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96 }} className="hud hud-brackets relative h-full overflow-hidden">
              <div className="absolute top-0 right-0 left-0 z-10 flex items-center justify-between border-b border-line bg-ink-950/60 px-4 py-2.5 backdrop-blur">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.16em] text-volt-2 uppercase">Physical asset twin</div>
                  <div className="text-[14px] text-white">{SITES.find((s) => s.id === site)?.name}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden text-[11px] text-dim md:block">Drag to orbit · click equipment to inspect</span>
                  <button onClick={() => setSite(null)} className="flex items-center gap-1 rounded-md bg-white/5 px-2.5 py-1.5 text-[12px] text-mute hover:text-white">
                    <MapIcon className="size-3.5" /> Back to map <X className="size-3.5" />
                  </button>
                </div>
              </div>
              <Suspense fallback={<Loading label="Building 3D site" />}>
                <SubstationTwin site={site} nodes={graph.nodes} selected={selected} onSelect={(id) => select(id)} states={scenarioStates} />
              </Suspense>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
