import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  BadgeIndianRupee,
  Bell,
  Bot,
  Boxes,
  ChevronsLeft,
  FileText,
  FlaskConical,
  Gauge,
  Globe2,
  LogOut,
  Network,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  ShieldHalf,
  Share2,
  Bug,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router";
import { Logo } from "../components/fx";
import { Loading } from "../components/ui";
import { useAuth } from "../lib/auth";
import { cn, THREAT_COLOR } from "../lib/format";
import { useLiveTwin } from "../lib/live";
import { useFlagship, useReset, useSummary } from "../lib/queries";
import { useUi } from "../lib/store";
import type { Persona } from "../lib/types";
import AssetInspector from "./AssetInspector";
import CommandPalette from "./CommandPalette";
import EventDrawer from "./EventDrawer";

const CommandCentre = lazy(() => import("../pages/CommandCentre"));
const TwinPage = lazy(() => import("../pages/TwinPage"));
const NetworkPage = lazy(() => import("../pages/NetworkPage"));
const GraphPage = lazy(() => import("../pages/GraphPage"));
const RiskPage = lazy(() => import("../pages/RiskPage"));
const VulnsPage = lazy(() => import("../pages/VulnsPage"));
const ScenarioLab = lazy(() => import("../pages/ScenarioLab"));
const ResiliencePage = lazy(() => import("../pages/ResiliencePage"));
const InvestPage = lazy(() => import("../pages/InvestPage"));
const AnalystPage = lazy(() => import("../pages/AnalystPage"));
const CompliancePage = lazy(() => import("../pages/CompliancePage"));
const ReportPage = lazy(() => import("../pages/ReportPage"));

export const NAV = [
  { to: "/app", label: "Command Centre", icon: Gauge, end: true, group: "Monitor" },
  { to: "/app/twin", label: "Digital Twin", icon: Globe2, group: "Monitor" },
  { to: "/app/network", label: "Network Explorer", icon: Network, group: "Monitor" },
  { to: "/app/graph", label: "Dependency Graph", icon: Share2, group: "Monitor" },
  { to: "/app/risk", label: "Risk Intelligence", icon: Activity, group: "Analyse" },
  { to: "/app/vulns", label: "Vulnerabilities", icon: Bug, group: "Analyse" },
  { to: "/app/resilience", label: "Resilience", icon: Boxes, group: "Analyse" },
  { to: "/app/scenarios", label: "Scenario Lab", icon: FlaskConical, group: "Decide" },
  { to: "/app/invest", label: "Budget Autopilot", icon: BadgeIndianRupee, group: "Decide" },
  { to: "/app/analyst", label: "AI Analyst", icon: Bot, group: "Decide" },
  { to: "/app/compliance", label: "Compliance & Audit", icon: ShieldCheck, group: "Govern" },
  { to: "/app/report", label: "Risk Report", icon: FileText, group: "Govern" },
];

const PERSONA_LABEL: Record<Persona, string> = { analyst: "Analyst lens", operations: "Operations lens", commissioner: "Commissioner lens", auditor: "Auditor lens" };

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const groups = [...new Set(NAV.map((n) => n.group))];
  return (
    <aside className={cn("relative z-30 flex shrink-0 flex-col border-r border-line bg-ink-900/80 backdrop-blur-xl transition-[width] duration-300", collapsed ? "w-[64px]" : "w-[230px]")}>
      <div className="flex h-14 items-center justify-between px-4">
        <NavLink to="/" aria-label="Home">
          <Logo withWord={!collapsed} size={26} />
        </NavLink>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-3">
        {groups.map((g) => (
          <div key={g}>
            {!collapsed && <div className="mb-1.5 px-2.5 font-mono text-[9.5px] tracking-[0.22em] text-ink-500 uppercase">{g}</div>}
            <div className="space-y-0.5">
              {NAV.filter((n) => n.group === g).map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  title={n.label}
                  className={({ isActive }) =>
                    cn(
                      "group relative flex h-9 items-center gap-3 rounded-md px-2.5 text-[13px] transition-colors",
                      isActive ? "bg-volt/12 text-white shadow-[inset_0_0_0_1px_rgb(110,170,255,0.25)]" : "text-[#93a6c9] hover:bg-white/[0.04] hover:text-white",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <motion.span layoutId="nav-active" className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r bg-volt shadow-[0_0_10px_#4f8dff]" />}
                      <n.icon className={cn("size-[17px] shrink-0", isActive ? "text-volt-2" : "text-dim group-hover:text-mute")} />
                      {!collapsed && <span className="truncate">{n.label}</span>}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <button onClick={onToggle} className="m-2.5 flex h-8 items-center justify-center gap-2 rounded-md text-[12px] text-dim hover:bg-white/5 hover:text-mute">
        <ChevronsLeft className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
        {!collapsed && "Collapse"}
      </button>
    </aside>
  );
}

function Topbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const summary = useSummary();
  const { connected, persona, setPersona, setDrawer, setPalette, events } = useUi();
  const { user, signOut } = useAuth();
  const flagship = useFlagship();
  const reset = useReset();
  const [menu, setMenu] = useState(false);
  const seen = useRef(0);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const n = events.filter((e) => e.severity !== "info").length;
    if (n > seen.current) setUnread((u) => u + (n - seen.current));
    seen.current = n;
  }, [events]);
  const page = NAV.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)));
  const threat = summary?.threat_level ?? "—";
  const tc = THREAT_COLOR[threat] ?? "#93a3c4";
  const demo = summary?.demo;
  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-ink-900/70 px-4 backdrop-blur-xl">
      <div className="min-w-0 flex-1">
        <div className="hidden items-center gap-2 font-mono text-[10px] tracking-[0.2em] whitespace-nowrap text-dim uppercase 2xl:flex">
          OHMEN <span className="text-ink-500">/</span> Mumbai distribution · simulated
        </div>
        <div className="truncate text-[15px] font-medium text-white">{page?.label ?? "Console"}</div>
      </div>

      <button onClick={() => setPalette(true)} className="flex h-8 items-center gap-2 rounded-md bg-white/[0.03] px-2.5 text-[12px] whitespace-nowrap text-dim shadow-[inset_0_0_0_1px_rgb(110,170,255,0.18)] hover:text-mute 2xl:w-56">
        <Search className="size-3.5" /> <span className="hidden 2xl:inline">Search assets, pages, actions</span>
        <span className="kbd ml-auto">⌘K</span>
      </button>

      <div className="hidden items-center gap-2 rounded-md px-2.5 py-1 md:flex" style={{ background: `${tc}14`, boxShadow: `inset 0 0 0 1px ${tc}55` }}>
        <ShieldHalf className="size-3.5" style={{ color: tc }} />
        <span className="font-mono text-[10px] tracking-wider text-dim">THREAT</span>
        <span className="font-mono text-[12px] font-semibold" style={{ color: tc }}>
          {threat}
        </span>
        <span className="font-mono text-[11px] text-mute">{summary?.systemic_risk_index?.toFixed(1)}</span>
      </div>

      <div className="hidden items-center gap-1.5 font-mono text-[10px] tracking-wider text-dim xl:flex">
        <span className={cn("size-1.5 rounded-full", connected ? "bg-ok shadow-[0_0_8px_#34d399]" : "bg-crit")} />
        {connected ? "LIVE" : "OFFLINE"}
      </div>

      <select value={persona} onChange={(e) => setPersona(e.target.value as Persona)} className="hidden h-8 rounded-md border-0 bg-white/[0.03] px-2 text-[12px] text-mute shadow-[inset_0_0_0_1px_rgb(110,170,255,0.18)] outline-none xl:block">
        {(Object.keys(PERSONA_LABEL) as Persona[]).map((p) => (
          <option key={p} value={p} className="bg-ink-900">
            {PERSONA_LABEL[p]}
          </option>
        ))}
      </select>

      <button
        onClick={() => flagship.mutate()}
        disabled={demo?.running || flagship.isPending}
        className="relative flex h-8 items-center gap-2 overflow-hidden rounded-md bg-crit/15 px-3 text-[12px] font-medium text-[#ffc1cc] shadow-[inset_0_0_0_1px_rgb(244,63,94,0.5)] transition hover:bg-crit/25 disabled:opacity-90"
      >
        {demo?.running && <motion.span className="absolute inset-y-0 left-0 bg-crit/25" initial={{ width: 0 }} animate={{ width: `${(demo.step / Math.max(1, demo.total)) * 100}%` }} />}
        <Play className="relative size-3.5" />
        <span className="relative whitespace-nowrap">{demo?.running ? `Incident ${demo.step}/${demo.total}` : <><span className="hidden xl:inline">Run flagship </span>incident</>}</span>
      </button>

      <button onClick={() => reset.mutate()} title="Reset the simulation to its baseline" className="hidden size-8 items-center justify-center rounded-md text-dim hover:bg-white/5 hover:text-mute sm:flex">
        <RotateCcw className={cn("size-4", reset.isPending && "animate-spin")} />
      </button>

      <button
        onClick={() => {
          setDrawer(true);
          setUnread(0);
        }}
        className="relative flex size-8 items-center justify-center rounded-md text-mute hover:bg-white/5 hover:text-white"
        aria-label="Open event stream"
      >
        <Bell className="size-4" />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-crit px-1 font-mono text-[9px] text-white">{Math.min(unread, 99)}</span>}
      </button>

      <div className="relative">
        <button onClick={() => setMenu((m) => !m)} className="flex size-8 items-center justify-center rounded-full font-mono text-[11px] font-semibold text-white" style={{ background: `radial-gradient(circle at 30% 30%, ${user?.color ?? "#4f8dff"}66, #07101f)`, boxShadow: `0 0 0 1px ${user?.color ?? "#4f8dff"}99` }}>
          {user?.initials ?? "OP"}
        </button>
        <AnimatePresence>
          {menu && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="hud absolute top-10 right-0 w-60 p-3">
              <div className="text-sm text-white">{user?.name}</div>
              <div className="text-[11px] text-dim">{user?.role}</div>
              <div className="mt-2 font-mono text-[10px] text-mute">clearance {user?.clearance}</div>
              <button
                onClick={() => {
                  signOut();
                  navigate("/login");
                }}
                className="mt-3 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-mute hover:bg-white/5 hover:text-white"
              >
                <LogOut className="size-3.5" /> Sign out
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}

export default function ConsoleLayout() {
  useLiveTwin();
  const [collapsed, setCollapsed] = useState(false);
  const [params, setParams] = useSearchParams();
  const flagship = useFlagship();
  const setPalette = useUi((s) => s.setPalette);

  useEffect(() => {
    if (params.get("demo") === "flagship") {
      flagship.mutate();
      params.delete("demo");
      setParams(params, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPalette]);

  return (
    <div className="flex h-dvh overflow-hidden bg-ink-950 text-[#dbe6ff]">
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-30" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_70%_0%,rgb(79_141_255/0.10),transparent_70%)]" />
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="relative min-h-0 flex-1 overflow-y-auto">
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route index element={<CommandCentre />} />
              <Route path="twin" element={<TwinPage />} />
              <Route path="network" element={<NetworkPage />} />
              <Route path="graph" element={<GraphPage />} />
              <Route path="risk" element={<RiskPage />} />
              <Route path="vulns" element={<VulnsPage />} />
              <Route path="scenarios" element={<ScenarioLab />} />
              <Route path="resilience" element={<ResiliencePage />} />
              <Route path="invest" element={<InvestPage />} />
              <Route path="analyst" element={<AnalystPage />} />
              <Route path="compliance" element={<CompliancePage />} />
              <Route path="report" element={<ReportPage />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <AssetInspector />
      <EventDrawer />
      <CommandPalette />
    </div>
  );
}
