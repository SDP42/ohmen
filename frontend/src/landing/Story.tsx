import { AnimatePresence, motion, useScroll, useSpring } from "motion/react";
import { ArrowRight, Play, ShieldCheck, Siren, Waypoints } from "lucide-react";
import { lazy, Suspense, useRef, useState } from "react";
import { Link } from "react-router";
import { MagneticButton, NumberTicker, ScrambleText } from "../components/fx";
import { CHAPTER_BOUNDS } from "./scene/chapters";

const HeroScene = lazy(() => import("./scene/HeroScene"));

const CHAPTERS = ["Overview", "The city", "Inside Substation A", "Two graphs", "The cascade", "The fix", "Consequence intelligence"];

function Legend() {
  const rows = [
    { label: "Power flow", color: "#4ade80", style: "solid" },
    { label: "Communication", color: "#60a5fa", style: "dashed" },
    { label: "Control signal", color: "#facc15", style: "dashed" },
    { label: "Hypothetical attack path", color: "#ff4d6d", style: "solid" },
  ];
  return (
    <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2.5 text-[13px] text-[#c9d7f2]">
          <svg width="34" height="6">
            <line x1="0" y1="3" x2="34" y2="3" stroke={r.color} strokeWidth="2.5" strokeDasharray={r.style === "dashed" ? "5 4" : undefined} style={{ filter: `drop-shadow(0 0 4px ${r.color})` }} />
          </svg>
          {r.label}
        </div>
      ))}
    </div>
  );
}

function ChapterCard({ chapter }: { chapter: number }) {
  const common = "max-w-xl";
  switch (chapter) {
    case 0:
      return (
        <div className={common}>
          <div className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-ink-900/60 px-3 py-1 font-mono text-[11px] tracking-wider text-volt-2 backdrop-blur">
            <span className="size-1.5 animate-pulse rounded-full bg-crit shadow-[0_0_8px_#f43f5e]" />
            D3COY · PS 03 · CRITICAL-INFRASTRUCTURE CYBER-RISK PREDICTION
          </div>
          <h1 className="mt-6 text-5xl leading-[0.95] font-semibold tracking-[-0.04em] text-white sm:text-7xl lg:text-[88px]">
            <ScrambleText text="See the cascade" />
            <br />
            <span className="font-serif font-normal tracking-[-0.02em] italic text-gradient">before it happens.</span>
          </h1>
          <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-[#aebfdf]">
            OHMEN is a cyber-risk digital twin for critical infrastructure. It connects vulnerabilities, network exposure and operational
            dependencies to predict which assets matter most, simulate what fails next and prove which fix removes the most risk.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <MagneticButton href="/app" className="group inline-flex h-12 items-center gap-2 rounded-lg bg-volt px-6 text-[15px] font-medium text-white shadow-[0_0_0_1px_rgb(160,215,255,0.5),0_12px_40px_-8px_rgb(79,141,255,0.9)]">
              Launch the console <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </MagneticButton>
            <MagneticButton href="/app?demo=flagship" className="inline-flex h-12 items-center gap-2 rounded-lg bg-white/[0.04] px-5 text-[15px] text-[#d8e5ff] shadow-[inset_0_0_0_1px_rgb(120,180,255,0.3)] backdrop-blur">
              <Play className="size-4 text-crit" /> Run the flagship incident
            </MagneticButton>
          </div>
          <div className="mt-10 grid max-w-lg grid-cols-4 gap-4 border-t border-line pt-5">
            {[
              { v: 45, l: "assets twinned" },
              { v: 2.15, l: "M citizens served", d: 2 },
              { v: 313, l: "attack paths found" },
              { v: 53, l: "% risk cut, same ₹", s: "%" },
            ].map((s) => (
              <div key={s.l}>
                <div className="font-mono text-2xl font-semibold text-white">
                  <NumberTicker value={s.v} decimals={s.d ?? 0} />
                </div>
                <div className="mt-1 text-[11px] leading-tight text-dim">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      );
    case 1:
      return (
        <div className={common}>
          <Kicker n="01" label="The city" />
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">
            One region. Five substations.
            <span className="block font-serif font-normal italic text-volt-2">2.2 million people.</span>
          </h2>
          <p className="mt-5 text-[16px] leading-relaxed text-[#aebfdf]">
            A simulated electricity distribution network inspired by Mumbai: 45 cyber and physical assets, six distribution zones, three hospitals,
            two water pumping stations, a rail signalling hub and the telecom exchange that carries the SCADA network itself.
          </p>
          <Chips items={["27 cyber assets", "18 physical assets", "8 critical facilities", "3 untrusted entry points"]} />
        </div>
      );
    case 2:
      return (
        <div className={common}>
          <Kicker n="02" label="The twin" />
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">
            Inside Substation A,
            <span className="block font-serif font-normal italic text-volt-2">every object is a live record.</span>
          </h2>
          <p className="mt-5 text-[16px] leading-relaxed text-[#aebfdf]">
            Transformers, gateways, RTUs and PLCs carry firmware versions, advisory matches, exposure, criticality and redundancy. Version-range
            matching separates confirmed vulnerabilities from potential ones, so "2.4" never becomes a false positive.
          </p>
          <Chips items={["Version-interval CVE matching", "Purdue levels 0 – 3.5", "Edit any field, risk recalculates"]} />
        </div>
      );
    case 3:
      return (
        <div className={common}>
          <Kicker n="03" label="Two graphs" />
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">
            Cyber reachability and operational dependency.
            <span className="block font-serif font-normal italic text-volt-2">Never confused.</span>
          </h2>
          <p className="mt-5 text-[16px] leading-relaxed text-[#aebfdf]">
            A hospital needing a substation's power does not make the hospital's systems reachable. OHMEN models who can talk to whom and what
            depends on what as separate graphs, then joins them only where a controller can actually move physical equipment.
          </p>
          <Legend />
        </div>
      );
    case 4:
      return (
        <div className={common}>
          <Kicker n="04" label="The cascade" color="#ff4d6d" />
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">
            An advisory lands.
            <span className="block font-serif font-normal italic text-[#ff8fa6]">Watch what it touches.</span>
          </h2>
          <div className="mt-6 space-y-2.5 font-mono text-[12.5px]">
            {[
              ["T+00:00", "SIM-2026-0417 matched to GW-001 (confirmed)", "#fbbf24"],
              ["T+00:05", "Corporate IT → GW-001:8443 · 14 failed logins", "#fb923c"],
              ["T+00:11", "Unexpected IEC-104 session GW-001 → SCADA-001", "#ff4d6d"],
              ["T+00:14", "Zone A · 410k residents · hospital on 8h backup", "#ff4d6d"],
            ].map(([t, m, c]) => (
              <motion.div key={t} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + Number(t.slice(-2)) * 0.03 }} className="flex gap-3">
                <span className="text-dim">{t}</span>
                <span style={{ color: c }}>{m}</span>
              </motion.div>
            ))}
          </div>
          <div className="mt-6 flex items-end gap-4">
            <div>
              <div className="font-mono text-[10px] tracking-widest text-dim uppercase">GW-001 priority</div>
              <div className="font-mono text-5xl font-semibold text-crit">
                43 → <NumberTicker value={93} />
              </div>
            </div>
            <div className="mb-2 flex items-center gap-2 text-sm text-[#ffb3c1]">
              <Siren className="size-4" /> rank #12 → #1
            </div>
          </div>
        </div>
      );
    case 5:
      return (
        <div className={common}>
          <Kicker n="05" label="The fix" color="#22d3ee" />
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">
            One ₹1 lakh firewall change.
            <span className="block font-serif font-normal italic text-cyan">Risk 86 → 32.</span>
          </h2>
          <p className="mt-5 text-[16px] leading-relaxed text-[#aebfdf]">
            Remove legacy rule FW-CORP-117, segment the substation LAN, patch the gateway. The scenario re-runs on a sandbox copy of the twin and
            shows which attack paths disappeared, never touching the baseline.
          </p>
          <div className="mt-6 space-y-3">
            {[
              { l: "Before", v: 86, c: "#f43f5e" },
              { l: "After", v: 32, c: "#34d399" },
            ].map((b) => (
              <div key={b.l} className="flex items-center gap-3">
                <span className="w-12 font-mono text-xs text-dim">{b.l}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
                  <motion.div className="h-full rounded-full" style={{ background: b.c, boxShadow: `0 0 12px ${b.c}` }} initial={{ width: 0 }} animate={{ width: `${b.v}%` }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} />
                </div>
                <span className="w-8 font-mono text-sm" style={{ color: b.c }}>
                  {b.v}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-2 text-sm text-cyan">
            <ShieldCheck className="size-4" /> 4 connections sever 100% of modelled attack paths
          </div>
        </div>
      );
    default:
      return (
        <div className={common}>
          <Kicker n="06" label="Consequence intelligence" />
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-6xl">
            Not another dashboard.
            <span className="block font-serif font-normal italic text-gradient">A decision engine for the grid.</span>
          </h2>
          <p className="mt-5 text-[16px] leading-relaxed text-[#aebfdf]">
            What is vulnerable, what it touches, what to fix first, and what that fix buys. Explained, simulated and auditable.
          </p>
          <div className="mt-8 flex gap-3">
            <Link to="/app" className="inline-flex h-11 items-center gap-2 rounded-lg bg-volt px-5 text-sm font-medium text-white shadow-[0_10px_30px_-8px_#4f8dff]">
              Open the twin <Waypoints className="size-4" />
            </Link>
          </div>
        </div>
      );
  }
}

function Kicker({ n, label, color = "#8cc8ff" }: { n: string; label: string; color?: string }) {
  return (
    <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.2em] uppercase" style={{ color }}>
      <span className="rounded border px-1.5 py-0.5" style={{ borderColor: `${color}66` }}>
        {n}
      </span>
      {label}
      <span className="h-px w-16" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      {items.map((i) => (
        <span key={i} className="rounded-md border border-line bg-ink-900/60 px-2.5 py-1 font-mono text-[11px] text-[#bcd0f2] backdrop-blur">
          {i}
        </span>
      ))}
    </div>
  );
}

export default function Story() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const bar = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  const [chapter, setChapter] = useState(0);
  const jump = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const start = el.offsetTop;
    const span = el.offsetHeight - window.innerHeight;
    const p = i === 0 ? 0 : (CHAPTER_BOUNDS[i - 1] + (CHAPTER_BOUNDS[i] ?? 1)) / 2;
    window.scrollTo({ top: start + span * p, behavior: "smooth" });
  };
  return (
    <section ref={ref} id="story" className="relative" style={{ height: "760vh" }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <div className="absolute inset-0">
          <Suspense fallback={<div className="h-full w-full bg-ink-950" />}>
            <HeroScene progress={scrollYProgress} onChapter={setChapter} />
          </Suspense>
        </div>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_15%_55%,rgb(3_6_13/0.82),transparent_62%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink-950 to-transparent" />
        <div className="relative z-10 flex h-full items-center px-6 sm:px-12 lg:px-20">
          <AnimatePresence mode="wait">
            <motion.div
              key={chapter}
              className="pointer-events-auto"
              initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -24, filter: "blur(8px)" }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <ChapterCard chapter={chapter} />
            </motion.div>
          </AnimatePresence>
        </div>
        <nav className="absolute top-1/2 right-5 z-10 hidden -translate-y-1/2 flex-col gap-3 md:flex" aria-label="Story chapters">
          {CHAPTERS.map((c, i) => (
            <button key={c} onClick={() => jump(i)} className="group flex items-center justify-end gap-3">
              <span className={`font-mono text-[10px] tracking-wider uppercase transition-all ${chapter === i ? "text-white opacity-100" : "text-dim opacity-0 group-hover:opacity-100"}`}>{c}</span>
              <span className={`h-px transition-all ${chapter === i ? "w-10 bg-volt shadow-[0_0_8px_#4f8dff]" : "w-4 bg-dim"}`} />
            </button>
          ))}
        </nav>
        <motion.div className="absolute bottom-0 left-0 z-10 h-[2px] origin-left bg-gradient-to-r from-volt via-cyan to-cyber" style={{ scaleX: bar, width: "100%" }} />
        {chapter === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }} className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 font-mono text-[10px] tracking-[0.3em] text-dim uppercase">
            Scroll to descend
            <span className="flex h-9 w-5 justify-center rounded-full border border-line-strong pt-1.5">
              <motion.span className="size-1 rounded-full bg-volt-2" animate={{ y: [0, 14, 0] }} transition={{ duration: 1.8, repeat: Infinity }} />
            </span>
          </motion.div>
        )}
      </div>
    </section>
  );
}
