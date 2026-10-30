import { useQuery } from "@tanstack/react-query";
import { Share2 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Badge, Loading, Panel, PanelHeader, PriorityPill, Segmented } from "../components/ui";
import { api } from "../lib/api";
import { COLORS, scoreColor, TYPE_LABEL } from "../lib/format";
import { useGraph } from "../lib/queries";
import { useUi } from "../lib/store";

type Mode = "both" | "cyber" | "ops";
const REL_COLOR: Record<string, string> = { cyber: COLORS.cyber, feeds: COLORS.power, supplies: COLORS.power, serves: COLORS.power, telemetry: COLORS.comms, comms: COLORS.comms, controls: COLORS.control, hosts: "#8cc8ff", water: "#38bdf8" };
const TYPE_COLOR: Record<string, string> = { substation: "#8cc8ff", transformer: "#5d84c9", zone: "#4f8dff", facility: "#f59e0b", control_centre: "#8cc8ff", entry: "#fb923c" };

export default function GraphPage() {
  const { data: graph } = useGraph();
  const { data: spof } = useQuery({ queryKey: ["spof"], queryFn: api.spof });
  const { select, selected } = useUi();
  const [mode, setMode] = useState<Mode>("both");
  const [depth2, setDepth2] = useState(true);
  const [showSpof, setShowSpof] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const fg = useRef<any>(null);
  const [size, setSize] = useState({ w: 900, h: 600 });

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    if (!graph) return { nodes: [], links: [] };
    const links = [
      ...(mode !== "ops" ? graph.cyber_edges.filter((e) => e.kind === "logical" && e.status === "active").map((e) => ({ source: e.source, target: e.target, rel: "cyber", id: e.id })) : []),
      ...(mode !== "cyber" ? graph.ops_edges.map((e) => ({ source: e.source, target: e.target, rel: e.relation, id: e.id })) : []),
    ];
    const used = new Set(links.flatMap((l) => [l.source, l.target]));
    return { nodes: graph.nodes.filter((n) => used.has(n.id)).map((n) => ({ ...n })), links };
  }, [graph, mode]);

  const spofSet = useMemo(() => new Set((spof ?? []).filter((s: { is_spof: boolean }) => s.is_spof).map((s: { id: string }) => s.id)), [spof]);
  const highlight = useMemo(() => {
    if (!selected) return null;
    const first = new Set<string>([selected]);
    const raw = data.links.map((l: any) => [typeof l.source === "object" ? l.source.id : l.source, typeof l.target === "object" ? l.target.id : l.target]);
    raw.forEach(([a, b]) => {
      if (a === selected) first.add(b);
      if (b === selected) first.add(a);
    });
    const second = new Set(first);
    if (depth2) raw.forEach(([a, b]) => {
      if (first.has(a)) second.add(b);
      if (first.has(b)) second.add(a);
    });
    return { first, second };
  }, [selected, data, depth2]);

  useEffect(() => {
    const g = fg.current;
    if (!g) return;
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.w, size.h), 1.1, 0.6, 0.12);
    g.postProcessingComposer().addPass(bloom);
    return () => {
      g.postProcessingComposer().removePass(bloom);
    };
  }, [graph]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected || !fg.current) return;
    const node: any = data.nodes.find((n) => n.id === selected);
    if (!node || node.x == null) return;
    const dist = 90;
    const ratio = 1 + dist / Math.hypot(node.x, node.y, node.z || 1);
    fg.current.cameraPosition({ x: node.x * ratio, y: node.y * ratio, z: node.z * ratio }, node, 1400);
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!graph) return <Loading />;
  const sel = graph.nodes.find((n) => n.id === selected);
  const nodeColor = (n: any) => {
    if (highlight && !highlight.second.has(n.id)) return "#1b2a45";
    if (n.category === "cyber") return scoreColor(n.risk?.score);
    return TYPE_COLOR[n.type] ?? "#8cc8ff";
  };

  return (
    <div className="relative h-[calc(100dvh-56px)]">
      <div ref={box} className="absolute inset-0">
        <ForceGraph3D
          ref={fg}
          width={size.w}
          height={size.h}
          graphData={data}
          backgroundColor="#03060d"
          nodeLabel={(n: any) => `<div style="font:12px Geist;background:rgba(6,12,26,.92);padding:6px 8px;border:1px solid rgba(110,170,255,.3);border-radius:6px"><b>${n.id}</b> · ${n.name}${n.risk ? `<br/>priority ${Math.round(n.risk.score)} · ${n.risk.priority}` : ""}</div>`}
          nodeColor={nodeColor}
          nodeVal={(n: any) => (n.type === "zone" ? 6 : n.type === "facility" ? 5 : (n.criticality ?? 2) * 1.3)}
          nodeOpacity={0.95}
          nodeResolution={16}
          nodeThreeObjectExtend
          nodeThreeObject={(n: any) => {
            if (!showSpof || !spofSet.has(n.id)) return undefined as unknown as THREE.Object3D;
            const ring = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.35, 8, 40), new THREE.MeshBasicMaterial({ color: "#f43f5e" }));
            ring.rotation.x = Math.PI / 2;
            return ring;
          }}
          linkColor={(l: any) => {
            const a = typeof l.source === "object" ? l.source.id : l.source;
            const b = typeof l.target === "object" ? l.target.id : l.target;
            if (highlight && !(highlight.first.has(a) && highlight.second.has(b)) && !(highlight.first.has(b) && highlight.second.has(a))) return "#16233b";
            return REL_COLOR[l.rel] ?? "#4f8dff";
          }}
          linkOpacity={0.55}
          linkWidth={(l: any) => (l.rel === "cyber" ? 0.6 : 0.9)}
          linkDirectionalParticles={(l: any) => (l.rel === "cyber" ? 2 : ["feeds", "supplies", "serves"].includes(l.rel) ? 3 : 1)}
          linkDirectionalParticleWidth={1.6}
          linkDirectionalParticleSpeed={(l: any) => (l.rel === "cyber" ? 0.006 : 0.004)}
          linkDirectionalParticleColor={(l: any) => REL_COLOR[l.rel] ?? "#8cc8ff"}
          onNodeClick={(n: any) => select(n.id)}
          cooldownTicks={120}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 p-4">
        <div className="pointer-events-auto w-72">
          <Panel>
            <PanelHeader title="Dependency intelligence" icon={<Share2 className="size-3.5" />} sub="Cyber and operational relationships" />
            <div className="space-y-3 p-3">
              <Segmented value={mode} onChange={setMode} options={[{ value: "both", label: "Both" }, { value: "cyber", label: "Cyber" }, { value: "ops", label: "Operational" }]} />
              <label className="flex items-center justify-between text-[12px] text-[#c8d6f0]">
                Show second-order dependencies
                <input type="checkbox" checked={depth2} onChange={(e) => setDepth2(e.target.checked)} className="accent-[#4f8dff]" />
              </label>
              <label className="flex items-center justify-between text-[12px] text-[#c8d6f0]">
                Highlight single points of failure
                <input type="checkbox" checked={showSpof} onChange={(e) => setShowSpof(e.target.checked)} className="accent-[#f43f5e]" />
              </label>
              <div className="space-y-1 border-t border-line pt-2 text-[11px] text-mute">
                {[
                  ["Cyber communication", COLORS.cyber],
                  ["Power flow", COLORS.power],
                  ["Telemetry & comms", COLORS.comms],
                  ["Control", COLORS.control],
                  ["Water", "#38bdf8"],
                ].map(([l, c]) => (
                  <div key={l} className="flex items-center gap-2">
                    <span className="h-0.5 w-4 rounded" style={{ background: c }} />
                    {l}
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </div>
        {sel && highlight && (
          <div className="pointer-events-auto absolute right-4 bottom-4 w-80">
            <Panel className="p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-semibold text-white">{sel.id}</span>
                {sel.risk && <PriorityPill priority={sel.risk.priority} />}
                {spofSet.has(sel.id) && <Badge color="#f43f5e">single point of failure</Badge>}
              </div>
              <div className="text-[12px] text-mute">
                {sel.name} · {TYPE_LABEL[sel.type]}
              </div>
              <div className="mt-2 text-[11.5px] text-[#c8d6f0]">
                {highlight.first.size - 1} direct · {highlight.second.size - highlight.first.size} second-order
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {[...highlight.first].filter((x) => x !== sel.id).slice(0, 12).map((x) => (
                  <button key={x} onClick={() => select(x)} className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-[#c8d6f0] hover:text-white">
                    {x}
                  </button>
                ))}
              </div>
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}
