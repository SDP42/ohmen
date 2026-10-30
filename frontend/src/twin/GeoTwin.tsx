import { MapboxOverlay, type MapboxOverlayProps } from "@deck.gl/mapbox";
import { ArcLayer, ColumnLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { TripsLayer } from "@deck.gl/geo-layers";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import Map, { type MapRef, NavigationControl, useControl } from "react-map-gl/maplibre";
import maplibregl from "./maplibre";
import { COLORS, hexToRgb, scoreColor, STATE_COLOR } from "../lib/format";
import type { GraphData, ScenarioResult, TwinNode } from "../lib/types";

export interface TwinLayers {
  zones: boolean;
  power: boolean;
  cyber: boolean;
  skyline: boolean;
  labels: boolean;
  drift: boolean;
}

export const DEFAULT_LAYERS: TwinLayers = { zones: true, power: true, cyber: true, skyline: true, labels: true, drift: true };

const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const OFFLINE_STYLE = { version: 8 as const, sources: {}, layers: [{ id: "bg", type: "background" as const, paint: { "background-color": "#03060d" } }] };
const GLYPH: Record<string, string> = { hospital: "H", water: "W", rail: "R", telecom: "T", datacentre: "D" };

function DeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

type RGBA = [number, number, number, number];
const rgba = (hex: string, a = 255): RGBA => [...hexToRgb(hex), a] as RGBA;

export default function GeoTwin({
  graph,
  layers = DEFAULT_LAYERS,
  selected,
  onSelect,
  scenario,
  scores,
  ghost,
  exposure,
  compact,
  flyOnSelect = true,
}: {
  graph: GraphData;
  layers?: TwinLayers;
  selected?: string | null;
  onSelect?: (id: string) => void;
  scenario?: ScenarioResult | null;
  scores?: Record<string, number> | null;
  ghost?: boolean;
  exposure?: { reachable: { id: string; likelihood: number }[] } | null;
  compact?: boolean;
  flyOnSelect?: boolean;
}) {
  const mapRef = useRef<MapRef>(null);
  const [style, setStyle] = useState<string | typeof OFFLINE_STYLE>(DARK_STYLE);
  const [time, setTime] = useState(0);
  const [zoom, setZoom] = useState(compact ? 11.2 : 11.7);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 33) {
        setTime(t / 1000);
        last = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const byId = useMemo(() => Object.fromEntries(graph.nodes.map((n) => [n.id, n])), [graph]);
  const located = useMemo(() => graph.nodes.filter((n) => n.lat != null && n.lon != null), [graph]);

  useEffect(() => {
    if (!selected || !flyOnSelect) return;
    const n = byId[selected];
    if (n?.lat != null && n.lon != null) mapRef.current?.flyTo({ center: [n.lon, n.lat], zoom: Math.max(zoom, 13.6), pitch: 55, duration: 1500, essential: true });
  }, [selected, byId, flyOnSelect]); // eslint-disable-line react-hooks/exhaustive-deps

  const scoreOf = (n: TwinNode) => scores?.[n.id] ?? n.risk?.score ?? null;
  const scen = scenario?.nodes ?? {};
  const reachSet = useMemo(() => new Set(exposure?.reachable.map((r) => r.id) ?? []), [exposure]);

  const powerPaths = useMemo(() => {
    return graph.ops_edges
      .filter((e) => ["feeds", "supplies", "serves"].includes(e.relation))
      .map((e) => ({ e, a: byId[e.source], b: byId[e.target] }))
      .filter(({ a, b }) => a?.lat != null && b?.lat != null)
      .map(({ e, a, b }) => ({ id: e.id, role: e.role, path: [[a.lon!, a.lat!], [b.lon!, b.lat!]] as [number, number][], target: e.target }));
  }, [graph, byId]);

  const cyberArcs = useMemo(
    () =>
      graph.cyber_edges
        .filter((e) => e.kind === "logical")
        .map((e) => ({ e, a: byId[e.source], b: byId[e.target] }))
        .filter(({ a, b }) => a?.lat != null && b?.lat != null),
    [graph, byId],
  );
  const driftArcs = useMemo(
    () => graph.observed_edges.map((e) => ({ e, a: byId[e.source], b: byId[e.target] })).filter(({ a, b }) => a?.lat != null && b?.lat != null),
    [graph, byId],
  );

  const nodeColor = (n: TwinNode): RGBA => {
    const s = scen[n.id];
    if (scenario) {
      if (!s) return [70, 90, 130, 120];
      if (s.classification === "observed") return rgba(COLORS.crit);
      if (s.classification === "initial") return rgba(COLORS.crit);
      if (s.classification === "reachable") return rgba(COLORS.cyber);
      return rgba(STATE_COLOR[s.state ?? "degraded"] ?? COLORS.impact);
    }
    if (ghost) return reachSet.has(n.id) ? rgba(COLORS.crit) : [60, 75, 105, 90];
    if (n.category === "cyber") return rgba(scoreColor(scoreOf(n)));
    if (n.type === "facility") return rgba(n.service_risk ? STATE_COLOR[n.service_risk.state] ?? COLORS.impact : "#8cc8ff");
    if (n.type === "substation" || n.type === "control_centre") return rgba("#8cc8ff");
    return rgba("#5d84c9", 220);
  };
  const radius = (n: TwinNode) => (n.type === "substation" || n.type === "control_centre" ? 150 : n.type === "facility" ? 120 : n.type === "transformer" ? 60 : 55);

  const pulse = (time * 0.9) % 1;
  const hot = located.filter((n) => n.risk?.priority === "NOW" || (n.activity && n.category === "cyber"));
  const zoneNodes = graph.nodes.filter((n) => n.type === "zone" && n.polygon);

  const deckLayers = [
    layers.zones &&
      new PolygonLayer({
        id: "zones",
        data: zoneNodes,
        getPolygon: (d: TwinNode) => d.polygon!,
        getFillColor: (d: TwinNode) => {
          const s = scen[d.id];
          if (s?.state) return rgba(STATE_COLOR[s.state], 70);
          if (ghost) return [20, 30, 50, 40];
          const sr = d.service_risk;
          return sr ? [...hexToRgb(COLORS.volt), 18 + sr.likelihood * 50] as RGBA : [79, 141, 255, 18];
        },
        getLineColor: (d: TwinNode) => (scen[d.id]?.state ? rgba(STATE_COLOR[scen[d.id].state!], 220) : [90, 150, 255, 120]),
        lineWidthMinPixels: 1,
        stroked: true,
        filled: true,
        pickable: true,
        updateTriggers: { getFillColor: [scenario?.id, ghost], getLineColor: [scenario?.id] },
      }),
    layers.power &&
      new PathLayer({
        id: "power",
        data: powerPaths,
        getPath: (d: { path: [number, number][] }) => d.path,
        getColor: (d: { role: string; target: string }) => (scen[d.target]?.state === "lost" ? rgba(COLORS.crit, 200) : d.role === "backup" ? [74, 222, 128, 90] : [74, 222, 128, 170]),
        getWidth: (d: { role: string }) => (d.role === "backup" ? 1.2 : 2),
        widthUnits: "pixels",
        updateTriggers: { getColor: [scenario?.id] },
      }),
    layers.power &&
      new TripsLayer({
        id: "power-pulse",
        data: powerPaths,
        getPath: (d: { path: [number, number][] }) => d.path,
        getTimestamps: () => [0, 1],
        getColor: [140, 255, 180],
        widthMinPixels: 3,
        trailLength: 0.35,
        currentTime: (time * 0.45) % 1.4,
        fadeTrail: true,
      }),
    layers.cyber &&
      new ArcLayer({
        id: "cyber",
        data: cyberArcs,
        getSourcePosition: (d: any) => [d.a.lon, d.a.lat],
        getTargetPosition: (d: any) => [d.b.lon, d.b.lat],
        getSourceColor: (d: any) => (d.e.status !== "active" ? [90, 100, 120, 60] : d.e.policy === "legacy_exception" ? rgba(COLORS.crit, 230) : d.e.policy === "controlled" ? rgba(COLORS.cyan, 200) : rgba(COLORS.comms, 170)),
        getTargetColor: (d: any) => (d.e.status !== "active" ? [90, 100, 120, 60] : d.e.policy === "legacy_exception" ? rgba(COLORS.crit, 230) : rgba(COLORS.cyber, 170)),
        getWidth: (d: any) => (selected && (d.e.source === selected || d.e.target === selected) ? 3.5 : 1.4),
        getHeight: 0.35,
        greatCircle: false,
        pickable: true,
        updateTriggers: { getWidth: [selected] },
      }),
    layers.drift &&
      new ArcLayer({
        id: "drift",
        data: driftArcs,
        getSourcePosition: (d: any) => [d.a.lon, d.a.lat],
        getTargetPosition: (d: any) => [d.b.lon, d.b.lat],
        getSourceColor: [255, 170, 60, 230],
        getTargetColor: [255, 120, 60, 230],
        getWidth: 2.2,
        getHeight: 0.8,
        getTilt: 15,
      }),
    layers.skyline &&
      !compact &&
      new ColumnLayer({
        id: "skyline",
        data: located.filter((n) => n.category === "cyber"),
        getPosition: (d: TwinNode) => [d.lon!, d.lat!],
        getElevation: (d: TwinNode) => (scoreOf(d) ?? 0) * 14,
        getFillColor: (d: TwinNode) => [...nodeColor(d).slice(0, 3), 190] as RGBA,
        radius: 45,
        diskResolution: 6,
        extruded: true,
        pickable: true,
        updateTriggers: { getElevation: [scores], getFillColor: [scores, scenario?.id, ghost] },
      }),
    new ScatterplotLayer({
      id: "halo",
      data: scenario ? located.filter((n) => scen[n.id]?.classification === "initial" || scen[n.id]?.classification === "observed") : hot,
      getPosition: (d: TwinNode) => [d.lon!, d.lat!],
      getRadius: () => 120 + pulse * 520,
      getFillColor: [0, 0, 0, 0],
      getLineColor: [255, 70, 100, Math.round(255 * (1 - pulse))],
      lineWidthMinPixels: 2,
      stroked: true,
      filled: false,
      updateTriggers: { getRadius: [pulse], getLineColor: [pulse] },
    }),
    new ScatterplotLayer({
      id: "assets",
      data: located.filter((n) => n.type !== "zone"),
      getPosition: (d: TwinNode) => [d.lon!, d.lat!],
      getRadius: radius,
      radiusMinPixels: compact ? 3 : 4,
      radiusMaxPixels: 22,
      getFillColor: nodeColor,
      getLineColor: (d: TwinNode) => (d.id === selected ? [255, 255, 255, 255] : [5, 10, 22, 255]),
      lineWidthMinPixels: 1.5,
      stroked: true,
      pickable: true,
      updateTriggers: { getFillColor: [scores, scenario?.id, ghost, reachSet], getLineColor: [selected] },
    }),
    new TextLayer({
      id: "glyphs",
      data: located.filter((n) => n.type === "facility"),
      getPosition: (d: TwinNode) => [d.lon!, d.lat!],
      getText: (d: TwinNode) => GLYPH[d.facility_type ?? ""] ?? "•",
      getSize: 11,
      getColor: [5, 10, 22, 255],
      fontFamily: "Geist Mono, monospace",
      fontWeight: 700,
      characterSet: "HWRTD•",
    }),
    layers.labels &&
      zoom > (compact ? 12.4 : 12.1) &&
      new TextLayer({
        id: "labels",
        data: located.filter((n) => n.category !== "service" || n.type === "facility"),
        getPosition: (d: TwinNode) => [d.lon!, d.lat!],
        getText: (d: TwinNode) => d.id,
        getSize: 10.5,
        getPixelOffset: [0, -16],
        getColor: (d: TwinNode) => (d.id === selected ? [255, 255, 255, 255] : [190, 210, 245, 220]),
        fontFamily: "Geist Mono, monospace",
        background: true,
        getBackgroundColor: [4, 9, 20, 200],
        backgroundPadding: [3, 1],
        updateTriggers: { getColor: [selected] },
      }),
  ].filter(Boolean);

  return (
    <Map
      ref={mapRef}
      mapLib={maplibregl}
      initialViewState={{ longitude: 72.868, latitude: 19.058, zoom: compact ? 11.2 : 11.7, pitch: compact ? 40 : 50, bearing: -16 }}
      mapStyle={style}
      onError={() => setStyle(OFFLINE_STYLE)}
      onZoom={(e) => setZoom(e.viewState.zoom)}
      attributionControl={{ compact: true }}
      style={{ width: "100%", height: "100%" }}
    >
      {!compact && <NavigationControl position="bottom-right" visualizePitch />}
      <DeckOverlay
        interleaved={false}
        layers={deckLayers as any}
        onClick={(info: any) => {
          const id = info?.object?.id ?? info?.object?.e?.target;
          if (id && onSelect) onSelect(id);
        }}
        getCursor={({ isHovering }: { isHovering: boolean }) => (isHovering ? "pointer" : "grab")}
        getTooltip={(info: any) => {
          const o = info?.object;
          if (!o) return null;
          if (o.e) return { html: `<b>${o.e.source} → ${o.e.target}</b><br/>${o.e.protocol} · ${o.e.purpose}${o.e.policy === "legacy_exception" ? "<br/><span style='color:#f43f5e'>legacy firewall exception</span>" : ""}`, style: tooltipStyle };
          if (o.name) {
            const r = o.risk ? `<br/>priority <b>${Math.round(o.risk.score)}</b> · ${o.risk.priority}` : o.service_risk ? `<br/>disruption risk ${(o.service_risk.likelihood * 100).toFixed(0)}% via ${o.service_risk.via}` : "";
            const pop = o.population ? `<br/>${o.population.toLocaleString("en-IN")} people` : "";
            return { html: `<b>${o.id}</b> · ${o.name}${r}${pop}`, style: tooltipStyle };
          }
          return null;
        }}
      />
    </Map>
  );
}

const tooltipStyle = {
  background: "rgba(6,12,26,0.94)",
  border: "1px solid rgba(110,170,255,0.3)",
  borderRadius: "6px",
  color: "#dbe6ff",
  fontFamily: "Geist, sans-serif",
  fontSize: "11.5px",
  padding: "6px 9px",
};
