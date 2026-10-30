import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Fingerprint, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Logo, ScrambleText, SpotlightCard } from "../components/fx";
import { api } from "../lib/api";
import { type User, useAuth } from "../lib/auth";
import { useUi } from "../lib/store";

const CoreScene = lazy(() => import("./CoreScene"));

interface PersonaCard extends User {
  focus: string;
  home: string;
}

const FALLBACK: PersonaCard[] = [
  { id: "ops-manager", name: "Aarav Mehta", role: "Infrastructure Operations Manager", persona: "operations", clearance: "OPS-2", initials: "AM", color: "#4ade80", focus: "Service continuity, redundancy and backup endurance", home: "/app" },
  { id: "ot-analyst", name: "Riya Sharma", role: "OT Security Analyst", persona: "analyst", clearance: "SEC-3", initials: "RS", color: "#60a5fa", focus: "Vulnerabilities, attack paths and ATT&CK for ICS", home: "/app/risk" },
  { id: "risk-planner", name: "Vikram Rao", role: "Municipal Risk Planner", persona: "commissioner", clearance: "GOV-2", initials: "VR", color: "#a78bfa", focus: "Citizens affected, budgets and systemic exposure", home: "/app/invest" },
  { id: "compliance", name: "Neha Iyer", role: "Risk & Compliance Officer", persona: "auditor", clearance: "AUD-1", initials: "NI", color: "#fbbf24", focus: "Evidence, CERT-In coverage and the audit trail", home: "/app/compliance" },
];

const LOG = ["handshake · TLS 1.3 · ECDHE", "persona token issued", "clearance verified", "loading digital twin · 62 nodes", "risk engine warm · priority cache built"];

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const signIn = useAuth((s) => s.signIn);
  const setPersona = useUi((s) => s.setPersona);
  const { data } = useQuery({ queryKey: ["personas"], queryFn: () => fetch("/api/auth/personas").then((r) => r.json() as Promise<PersonaCard[]>), retry: 0 });
  const personas = data?.length ? data : FALLBACK;
  const [hover, setHover] = useState<PersonaCard | null>(null);
  const [busy, setBusy] = useState<PersonaCard | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const accent = busy?.color ?? hover?.color ?? "#4f8dff";

  useEffect(() => {
    if (!busy) return;
    if (step < LOG.length) {
      const t = setTimeout(() => setStep((s) => s + 1), 260);
      return () => clearTimeout(t);
    }
  }, [busy, step]);

  const enter = async (p: PersonaCard) => {
    if (busy) return;
    setBusy(p);
    setStep(0);
    setError(null);
    try {
      const [res] = await Promise.all([api.login(p.id), new Promise((r) => setTimeout(r, LOG.length * 260 + 500))]);
      signIn(res.token, res.user);
      setPersona(res.user.persona);
      navigate(params.get("next") || p.home || "/app", { replace: true });
    } catch {
      setError("The OHMEN API is not reachable. Start the backend on port 8010 and try again.");
      setBusy(null);
    }
  };

  return (
    <div className="grain relative min-h-dvh overflow-hidden bg-ink-950">
      <div className="absolute inset-0 lg:right-[42%]">
        <Suspense fallback={null}>
          <CoreScene accent={accent} pulse={busy ? 1 : 0} />
        </Suspense>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_30%_50%,transparent,rgb(3_6_13/0.75))]" />

      <div className="relative z-10 grid min-h-dvh lg:grid-cols-[58%_42%]">
        <div className="flex flex-col justify-between p-6 sm:p-10">
          <Link to="/" className="inline-flex w-fit items-center gap-2 text-[13px] text-mute hover:text-white">
            <ArrowLeft className="size-4" /> Back to site
          </Link>
          <div className="pointer-events-none max-w-lg">
            <div className="font-mono text-[11px] tracking-[0.3em] text-volt-2 uppercase">Secure access · demo mode</div>
            <h1 className="mt-4 text-5xl leading-[0.95] font-semibold tracking-[-0.04em] text-white sm:text-6xl">
              <ScrambleText text="Identity" />
              <span className="block font-serif font-normal italic text-gradient">shapes the view.</span>
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[#a5b6d6]">
              Each persona opens the same twin through a different lens: what an operator, an analyst, a planner or an auditor needs to decide.
            </p>
          </div>
          <div className="hidden gap-6 font-mono text-[10px] tracking-wider text-dim uppercase sm:flex">
            <span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-ok" /> Hash-chained audit</span>
            <span className="flex items-center gap-1.5"><Fingerprint className="size-3.5 text-volt-2" /> Actor attribution</span>
            <span className="flex items-center gap-1.5"><Lock className="size-3.5 text-cyber" /> Synthetic data only</span>
          </div>
        </div>

        <div className="flex items-center justify-center p-4 sm:p-8">
          <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="hud hud-brackets w-full max-w-md p-6 sm:p-7">
            <Logo />
            <h2 className="mt-6 text-2xl font-semibold tracking-tight text-white">Sign in to the twin</h2>
            <p className="mt-1.5 text-[13px] text-mute">Choose a persona. No password needed in the prototype.</p>

            <div className="mt-6 space-y-2.5">
              {personas.map((p, i) => (
                <motion.div key={p.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.07 }}>
                  <button
                    onMouseEnter={() => setHover(p)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(p)}
                    onClick={() => enter(p)}
                    disabled={Boolean(busy)}
                    className="block w-full text-left disabled:cursor-wait"
                  >
                    <SpotlightCard className="p-3.5 transition-shadow" color={hexTriplet(p.color)}>
                      <div className="flex items-center gap-3.5">
                        <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full font-mono text-sm font-semibold text-white" style={{ background: `radial-gradient(circle at 30% 30%, ${p.color}55, #07101f)`, boxShadow: `0 0 0 1px ${p.color}88, 0 0 22px -4px ${p.color}` }}>
                          {p.initials}
                          {busy?.id === p.id && <span className="absolute inset-0 animate-ping rounded-full" style={{ boxShadow: `0 0 0 2px ${p.color}` }} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[14px] font-medium text-white">{p.name}</span>
                            <span className="rounded px-1 font-mono text-[9px] tracking-wider" style={{ color: p.color, boxShadow: `inset 0 0 0 1px ${p.color}66` }}>
                              {p.clearance}
                            </span>
                          </span>
                          <span className="block truncate text-[12px] text-[#a9badb]">{p.role}</span>
                          <span className="block truncate text-[11px] text-dim">{p.focus}</span>
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-dim transition-all group-hover:translate-x-1 group-hover:text-white" />
                      </div>
                    </SpotlightCard>
                  </button>
                </motion.div>
              ))}
            </div>

            <AnimatePresence>
              {busy && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-5 overflow-hidden rounded-lg border border-line bg-ink-950/80 p-3 font-mono text-[11px]">
                  {LOG.slice(0, step).map((l) => (
                    <div key={l} className="text-[#8fb3e8]">
                      <span className="text-ok">✓</span> {l}
                    </div>
                  ))}
                  {step >= LOG.length && (
                    <div className="mt-1 font-semibold" style={{ color: busy.color }}>
                      <ScrambleText text={`ACCESS GRANTED · ${busy.name.toUpperCase()}`} duration={500} />
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {error && <div className="mt-4 rounded-md border border-crit/40 bg-crit/10 p-3 text-[12px] text-[#ffb3c1]">{error}</div>}

            <div className="mt-6 flex items-center gap-2 border-t border-line pt-4 text-[11px] text-dim">
              <KeyRound className="size-3.5" /> SSO, MFA and role-based access plug in here for production.
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function hexTriplet(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}
