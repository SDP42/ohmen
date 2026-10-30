import { LayoutGroup, motion } from "motion/react";
import {
  Activity,
  ArrowRight,
  BadgeIndianRupee,
  Binary,
  Bot,
  BrainCircuit,
  Clock3,
  Dices,
  Fingerprint,
  GitBranch,
  Hospital,
  Layers3,
  Network,
  Radar,
  Scissors,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Split,
  TrendingUp,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Logo, Marquee, Reveal, SpotlightCard } from "../components/fx";
import { cn } from "../lib/format";

function SectionHead({ kicker, title, accent, sub }: { kicker: string; title: string; accent?: string; sub?: string }) {
  return (
    <Reveal className="mx-auto max-w-3xl text-center">
      <div className="font-mono text-[11px] tracking-[0.3em] text-volt-2 uppercase">{kicker}</div>
      <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] text-white sm:text-5xl">
        {title} {accent && <span className="font-serif font-normal italic text-gradient">{accent}</span>}
      </h2>
      {sub && <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-relaxed text-[#9fb0d1]">{sub}</p>}
    </Reveal>
  );
}

// --------------------------------------------------------------------------- CVSS vs consequence

const ASSETS = [
  { id: "PLC-003", name: "Air-gapped test-bench PLC", cvss: 9.8, score: 13, note: "isolated, controls nothing live" },
  { id: "GW-007", name: "Vendor VPN appliance", cvss: 9.1, score: 78, note: "internet-facing, known exploited" },
  { id: "SCADA-003", name: "Process historian (DMZ)", cvss: 8.6, score: 77, note: "pivot from corporate IT" },
  { id: "GW-008", name: "Cellular backup gateway", cvss: 8.6, score: 80, note: "default creds, wired to RTU-005" },
  { id: "GW-001", name: "Substation A gateway", cvss: 8.1, score: 86, note: "hospital, water and rail downstream" },
  { id: "GW-004", name: "Substation D gateway", cvss: 6.5, score: 39, note: "feeds the telecom exchange carrying SCADA" },
];

export function CvssVsConsequence() {
  const [mode, setMode] = useState<"cvss" | "ohmen">("cvss");
  useEffect(() => {
    const t = setInterval(() => setMode((m) => (m === "cvss" ? "ohmen" : "cvss")), 4200);
    return () => clearInterval(t);
  }, []);
  const rows = [...ASSETS].sort((a, b) => (mode === "cvss" ? b.cvss - a.cvss : b.score - a.score));
  return (
    <section id="why" className="relative px-6 py-32">
      <SectionHead
        kicker="Why consequence beats severity"
        title="CVSS measures the bug."
        accent="OHMEN measures the blast."
        sub="The same six assets, ranked two ways. The highest-CVSS device is air-gapped and controls nothing. A moderate gateway quietly feeds the exchange that carries the SCADA network."
      />
      <div className="mx-auto mt-14 max-w-4xl">
        <div className="mb-5 flex justify-center">
          <div className="relative inline-flex rounded-full bg-white/[0.04] p-1 shadow-[inset_0_0_0_1px_rgb(110,170,255,0.25)]">
            {(["cvss", "ohmen"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cn("relative z-10 rounded-full px-5 py-2 text-sm transition-colors", mode === m ? "text-white" : "text-dim")}>
                {mode === m && <motion.span layoutId="cvss-pill" className="absolute inset-0 -z-10 rounded-full bg-volt/30 shadow-[inset_0_0_0_1px_rgb(140,200,255,0.5)]" />}
                {m === "cvss" ? "Sort by CVSS" : "Sort by OHMEN priority"}
              </button>
            ))}
          </div>
        </div>
        <LayoutGroup>
          <div className="space-y-2">
            {rows.map((a, i) => (
              <motion.div layout key={a.id} transition={{ type: "spring", stiffness: 260, damping: 30 }} className="hud flex items-center gap-4 px-4 py-3">
                <span className="w-6 font-mono text-sm text-dim">#{i + 1}</span>
                <div className="w-44 min-w-0">
                  <div className="font-mono text-sm font-semibold text-white">{a.id}</div>
                  <div className="truncate text-[11px] text-dim">{a.name}</div>
                </div>
                <div className="hidden flex-1 text-[12px] text-[#9fb0d1] md:block">{a.note}</div>
                <div className="w-40">
                  <div className="flex justify-between font-mono text-[10px] text-dim">
                    <span>CVSS</span>
                    <span className="text-[#cbd8f2]">{a.cvss}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-[#7d8db0]" style={{ width: `${a.cvss * 10}%`, opacity: mode === "cvss" ? 1 : 0.35 }} />
                  </div>
                </div>
                <div className="w-40">
                  <div className="flex justify-between font-mono text-[10px] text-dim">
                    <span>Priority</span>
                    <span style={{ color: a.score >= 70 ? "#f43f5e" : a.score >= 38 ? "#fbbf24" : "#34d399" }}>{a.score}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${a.score}%`, background: a.score >= 70 ? "#f43f5e" : a.score >= 38 ? "#fbbf24" : "#34d399", opacity: mode === "ohmen" ? 1 : 0.35, boxShadow: mode === "ohmen" ? "0 0 10px currentColor" : undefined }}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </LayoutGroup>
        <p className="mt-6 text-center font-mono text-[11px] text-dim">Values computed by the OHMEN risk engine on the synthetic Mumbai network.</p>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------- bento

function MiniGraph() {
  const nodes = [
    [20, 50], [60, 22], [60, 78], [110, 50], [150, 20], [150, 80], [190, 50],
  ];
  const links = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 6], [5, 6]];
  return (
    <svg viewBox="0 0 210 100" className="h-full w-full">
      {links.map(([a, b], i) => (
        <g key={i}>
          <line x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} stroke="#3b5a8f" strokeWidth="1" />
          <circle r="2" fill="#8cc8ff">
            <animateMotion dur={`${2 + (i % 3)}s`} repeatCount="indefinite" path={`M${nodes[a][0]},${nodes[a][1]} L${nodes[b][0]},${nodes[b][1]}`} />
          </circle>
        </g>
      ))}
      {nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === 3 ? 6 : 4} fill={i === 3 ? "#f43f5e" : "#0a1528"} stroke={i === 3 ? "#ff8fa6" : "#4f8dff"} strokeWidth="1.5" />
      ))}
    </svg>
  );
}

function MiniGauge() {
  return (
    <svg viewBox="0 0 120 70" className="h-full w-full">
      <path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke="#1a2d4e" strokeWidth="9" strokeLinecap="round" />
      <motion.path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke="url(#gg)" strokeWidth="9" strokeLinecap="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 0.86 }} transition={{ duration: 1.6, ease: "easeOut" }} />
      <defs>
        <linearGradient id="gg">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="0.6" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#f43f5e" />
        </linearGradient>
      </defs>
      <text x="60" y="58" textAnchor="middle" fontFamily="Geist Mono" fontSize="20" fill="#fff" fontWeight="600">
        86
      </text>
    </svg>
  );
}

function MiniHistogram() {
  const bars = [3, 6, 4, 28, 9, 4, 5, 7, 3, 4, 2, 2];
  return (
    <div className="flex h-full items-end gap-1">
      {bars.map((b, i) => (
        <motion.div key={i} className="flex-1 rounded-t-[2px]" style={{ background: i === 3 ? "#f43f5e" : "#4f8dff" }} initial={{ height: 0 }} whileInView={{ height: `${(b / 28) * 100}%` }} transition={{ delay: i * 0.05, duration: 0.6 }} />
      ))}
    </div>
  );
}

function MiniTimeline() {
  return (
    <div className="relative flex h-full items-center">
      <div className="absolute inset-x-0 h-px bg-line-strong" />
      {["Normal", "Alert", "Reach", "Impact", "Mitigate"].map((s, i) => (
        <div key={s} className="relative flex flex-1 flex-col items-center">
          <motion.span className="size-2.5 rounded-full" style={{ background: ["#34d399", "#fbbf24", "#a78bfa", "#f43f5e", "#22d3ee"][i] }} animate={{ scale: [1, 1.6, 1] }} transition={{ duration: 2.5, delay: i * 0.5, repeat: Infinity }} />
          <span className="mt-2 font-mono text-[9px] text-dim">{s}</span>
        </div>
      ))}
    </div>
  );
}

function MiniPareto() {
  return (
    <svg viewBox="0 0 120 70" className="h-full w-full">
      <motion.path d="M5 65 C 25 20, 50 12, 115 8" fill="none" stroke="#22d3ee" strokeWidth="2" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} transition={{ duration: 1.4 }} />
      <motion.path d="M5 65 C 35 50, 70 35, 115 28" fill="none" stroke="#7d8db0" strokeWidth="1.5" strokeDasharray="3 3" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} transition={{ duration: 1.4, delay: 0.2 }} />
      <circle cx="62" cy="13" r="3.5" fill="#22d3ee" />
    </svg>
  );
}

function MiniChat() {
  return (
    <div className="space-y-1.5 font-mono text-[10px]">
      <div className="ml-auto w-fit rounded-md bg-volt/20 px-2 py-1 text-[#cfe0ff]">why is GW-001 ranked first?</div>
      <div className="w-fit rounded-md bg-white/5 px-2 py-1 text-mute">→ get_risk_assessment(GW-001)</div>
      <div className="w-fit max-w-[90%] rounded-md bg-white/5 px-2 py-1 text-[#cfe0ff]">KEV-listed auth bypass + legacy corporate path + hospital downstream…</div>
    </div>
  );
}

const BENTO = [
  { title: "Geographic digital twin", body: "MapLibre + deck.gl map of the network with risk skyline, power flow and cyber arcs. Click any asset to fly to it.", icon: Layers3, span: "md:col-span-2", visual: <MiniGraph /> },
  { title: "Explainable risk engine", body: "Three outputs, never collapsed: vulnerability priority, likelihood and systemic impact.", icon: BrainCircuit, visual: <MiniGauge /> },
  { title: "Scenario Lab", body: "Run hypothetical incidents on a sandbox twin, mapped to ATT&CK for ICS.", icon: Activity, visual: <MiniTimeline /> },
  { title: "Monte Carlo blast radius", body: "600 stochastic runs give P10/P50/P90 bands instead of one scary number.", icon: Dices, visual: <MiniHistogram /> },
  { title: "Budget Autopilot", body: "Picks the mitigation portfolio that buys the most risk reduction per rupee.", icon: BadgeIndianRupee, visual: <MiniPareto /> },
  { title: "Grounded AI analyst", body: "Claude with tools over the twin, or a deterministic offline engine. Every answer cites its evidence.", icon: Bot, span: "md:col-span-2", visual: <MiniChat /> },
];

export function Bento() {
  return (
    <section id="platform" className="relative px-6 py-28">
      <SectionHead kicker="The platform" title="Explore, investigate," accent="simulate and decide." sub="Every module works on the same live model of the network, so a click on the map, a CVE, a graph edge or a chat answer all lead to the same asset." />
      <div className="mx-auto mt-14 grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-4">
        {BENTO.map((b, i) => (
          <Reveal key={b.title} delay={i * 0.06} className={b.span}>
            <SpotlightCard className="h-full p-5">
              <div className="mb-4 h-24">{b.visual}</div>
              <div className="flex items-center gap-2 text-white">
                <b.icon className="size-4 text-volt-2" />
                <h3 className="text-[15px] font-medium">{b.title}</h3>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-[#9fb0d1]">{b.body}</p>
            </SpotlightCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------- unique

const UNIQUE = [
  { icon: Hospital, title: "Time-to-harm countdown", body: "Backup endurance of every hospital, pump and exchange turns a cyber event into hours left." },
  { icon: Scissors, title: "Min-cut chokepoints", body: "Max-flow/min-cut finds the fewest firewall rules that sever every modelled attack path." },
  { icon: Split, title: "Twin drift detection", body: "Flags connections seen on the wire that the model doesn't know about, and stale ones it does." },
  { icon: GitBranch, title: "Vendor compromise simulation", body: "Every asset from one supplier becomes a foothold. See supply-chain concentration risk." },
  { icon: TrendingUp, title: "14-day risk forecast", body: "Exploit maturity rises, evidence ages. Predicts which assets will cross into NOW." },
  { icon: Binary, title: "Counterfactual explanations", body: "\"Patch GW-001 and its priority moves 86 → 43.\" Every recommendation is computed, not guessed." },
  { icon: Fingerprint, title: "Tamper-evident audit", body: "Every decision is hash-chained. Edit history and the chain breaks visibly." },
  { icon: Users, title: "Persona lens", body: "The same evidence explained for the analyst, the grid operator, the commissioner or the auditor." },
  { icon: ShieldCheck, title: "CERT-In coverage map", body: "Scores the five guideline areas PS 03 names, with the asset-level gaps behind each score." },
  { icon: Radar, title: "Adversary's-eye ghost mode", body: "Flip the twin to see only what an attacker can see and reach from untrusted networks." },
  { icon: Clock3, title: "Digital twin time machine", body: "Scrub the event timeline and watch the risk of every asset rewind and replay." },
  { icon: Network, title: "Live CISA KEV sync", body: "Pull the public known-exploited catalogue and filter it to OT-relevant entries." },
];

export function Unique() {
  return (
    <section id="unique" className="relative px-6 py-28">
      <SectionHead kicker="Beyond the brief" title="Things your SOC dashboard" accent="can't do." />
      <div className="mx-auto mt-14 grid max-w-6xl grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {UNIQUE.map((u, i) => (
          <Reveal key={u.title} delay={(i % 4) * 0.05} className="group relative bg-ink-900 p-6 transition-colors hover:bg-ink-850">
            <u.icon className="size-5 text-volt-2 transition-transform group-hover:scale-110" />
            <h3 className="mt-4 text-[15px] font-medium text-white">{u.title}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-[#8fa1c5]">{u.body}</p>
            <span className="absolute top-5 right-5 font-mono text-[10px] text-ink-500">{String(i + 1).padStart(2, "0")}</span>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------- pipeline

const STEPS = ["Asset inventory", "Vulnerability matching", "Network activity", "Dependency assessment", "Risk prioritisation", "Impact simulation", "Preventive action"];

export function Pipeline() {
  return (
    <section id="how" className="relative px-6 py-28">
      <SectionHead kicker="How it works" title="From a CVE" accent="to a decision." sub="The complete workflow from the INFRAWATCH blueprint, running end to end on the backend." />
      <div className="relative mx-auto mt-16 max-w-6xl">
        <svg className="absolute top-7 left-0 hidden h-2 w-full md:block" preserveAspectRatio="none" viewBox="0 0 100 2">
          <line x1="0" y1="1" x2="100" y2="1" stroke="#1a2d4e" strokeWidth="0.4" />
          <motion.line x1="0" y1="1" x2="100" y2="1" stroke="url(#beam)" strokeWidth="0.6" strokeDasharray="12 88" animate={{ strokeDashoffset: [0, -100] }} transition={{ duration: 3.6, repeat: Infinity, ease: "linear" }} />
          <defs>
            <linearGradient id="beam">
              <stop offset="0" stopColor="#22d3ee" stopOpacity="0" />
              <stop offset="0.5" stopColor="#8cc8ff" />
              <stop offset="1" stopColor="#a78bfa" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-7">
          {STEPS.map((s, i) => (
            <Reveal key={s} delay={i * 0.08} className="relative flex flex-col items-center text-center">
              <div className="hud hud-brackets flex size-14 items-center justify-center font-mono text-sm text-volt-2">{String(i + 1).padStart(2, "0")}</div>
              <div className="mt-4 text-[13px] font-medium text-white">{s}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------- method

export function Method() {
  const cards = [
    { k: "P", t: "Likelihood of compromise", f: "σ(−3.0 + 2.4V + 1.4E + 1.6A + 2.0S + 0.9W − 1.3M)", d: "Vulnerability, exposure, attack-path reachability, suspicious activity, authentication, monitoring." },
    { k: "I", t: "Systemic impact", f: "(0.30C + 0.35D + 0.35S) × (1 − 0.35(1 − R))", d: "Criticality, dependency importance, service consequence and redundancy over the plausible blast radius." },
    { k: "Ω", t: "Priority", f: "100 · √(P · I)", d: "A geometric mean: an asset needs both likelihood and consequence to rank high." },
  ];
  return (
    <section id="method" className="relative px-6 py-28">
      <SectionHead kicker="Methodology" title="Transparent by design," accent="honest by default." sub="No black-box 'AI score'. Every number decomposes into evidence, and every simulation says what it assumes." />
      <div className="mx-auto mt-14 grid max-w-6xl gap-4 md:grid-cols-3">
        {cards.map((c, i) => (
          <Reveal key={c.k} delay={i * 0.08}>
            <div className="hud hud-brackets h-full p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-volt/15 font-serif text-2xl text-volt-2 italic">{c.k}</span>
                <h3 className="text-[15px] font-medium text-white">{c.t}</h3>
              </div>
              <code className="mt-5 block rounded-md border border-line bg-ink-950/70 px-3 py-2.5 font-mono text-[12px] text-cyan">{c.f}</code>
              <p className="mt-4 text-[13px] leading-relaxed text-[#9fb0d1]">{c.d}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal className="mx-auto mt-6 grid max-w-6xl gap-3 md:grid-cols-3">
        {[
          ["Observed vs hypothetical", "Evidence, candidate attack paths and potential consequences are always drawn differently."],
          ["Deterministic first", "Same scenario, same inputs, same result. Monte Carlo adds uncertainty bands on top."],
          ["Synthetic data, stated", "Assets, advisories and events are fictional. Real NVD / CISA KEV / CERT-In feeds plug into the same model."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-xl border border-line bg-ink-900/60 p-4">
            <div className="flex items-center gap-2 text-[13px] font-medium text-white">
              <Sparkles className="size-3.5 text-cyber" /> {t}
            </div>
            <p className="mt-1.5 text-[12.5px] text-[#8fa1c5]">{d}</p>
          </div>
        ))}
      </Reveal>
    </section>
  );
}

// --------------------------------------------------------------------------- personas & CTA

const PERSONAS = [
  { t: "Operations manager", d: "Which assets could disrupt essential services, and where is redundancy thin?", c: "#4ade80" },
  { t: "OT security analyst", d: "Which alerts matter operationally, and what could they reach?", c: "#60a5fa" },
  { t: "Municipal risk planner", d: "Where does a limited budget remove the most systemic exposure?", c: "#a78bfa" },
  { t: "Risk & compliance officer", d: "Evidence-based assessments and an auditable record of decisions.", c: "#fbbf24" },
];

export function Personas() {
  return (
    <section className="px-6 py-24">
      <SectionHead kicker="Built for" title="The people who keep" accent="the lights on." />
      <div className="mx-auto mt-12 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PERSONAS.map((p, i) => (
          <Reveal key={p.t} delay={i * 0.06}>
            <div className="h-full rounded-xl border border-line bg-gradient-to-b from-ink-800/80 to-ink-900/40 p-5">
              <span className="block h-1 w-10 rounded-full" style={{ background: p.c, boxShadow: `0 0 12px ${p.c}` }} />
              <h3 className="mt-4 text-[15px] font-medium text-white">{p.t}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[#8fa1c5]">{p.d}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <div className="mx-auto mt-16 max-w-6xl">
        <Marquee className="font-mono text-[12px] tracking-[0.2em] text-dim uppercase">
          {["FastAPI", "NetworkX", "scikit-learn", "SQLAlchemy", "React 19", "three.js", "react-three-fiber", "MapLibre", "deck.gl", "Motion", "Tailwind 4", "Claude tool use", "MITRE ATT&CK for ICS", "CISA KEV"].map((s) => (
            <span key={s} className="flex items-center gap-12">
              {s}
              <span className="size-1 rounded-full bg-ink-500" />
            </span>
          ))}
        </Marquee>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="relative overflow-hidden px-6 py-36">
      <div className="pointer-events-none absolute top-1/2 left-1/2 size-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgb(79_141_255/0.28),transparent_62%)] blur-2xl" />
      <motion.div className="pointer-events-none absolute top-1/2 left-1/2 size-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-volt/20" animate={{ rotate: 360 }} transition={{ duration: 40, repeat: Infinity, ease: "linear" }}>
        <span className="absolute -top-1 left-1/2 size-2 rounded-full bg-cyan shadow-[0_0_14px_#22d3ee]" />
      </motion.div>
      <Reveal className="relative mx-auto max-w-3xl text-center">
        <Logo withWord={false} size={64} className="justify-center" />
        <h2 className="mt-8 text-5xl font-semibold tracking-[-0.04em] text-white sm:text-6xl">
          Protect what matters, <span className="font-serif font-normal italic text-gradient">first.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[16px] text-[#9fb0d1]">Open the console, press "Run flagship incident", and watch the twin re-rank itself as evidence arrives.</p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link to="/app" className="group inline-flex h-12 items-center gap-2 rounded-lg bg-volt px-7 text-[15px] font-medium text-white shadow-[0_0_0_1px_rgb(160,215,255,0.5),0_12px_40px_-8px_rgb(79,141,255,0.9)]">
            Launch the console <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link to="/app/report" className="inline-flex h-12 items-center gap-2 rounded-lg bg-white/[0.04] px-6 text-[15px] text-[#d8e5ff] shadow-[inset_0_0_0_1px_rgb(120,180,255,0.3)]">
            <ScrollText className="size-4" /> Read a generated report
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-[12px] text-dim md:flex-row">
        <Logo size={22} />
        <p className="text-center">Built for D3COY · PS 03. Every asset, advisory and event is synthetic. Nothing here describes real infrastructure.</p>
        <span className="font-mono">v0.1 · 2026</span>
      </div>
    </footer>
  );
}
