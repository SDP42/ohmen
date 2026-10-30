import { animate, motion, useInView, useMotionValue, useSpring, useTransform } from "motion/react";
import { type ReactNode, useEffect, useRef, useState, type MouseEvent } from "react";
import { cn } from "../../lib/format";

const GLYPHS = "ΩΣΔ#$%&*+=<>/\\|01ABCDEFX";

/** Decrypts text into place, character by character. */
export function ScrambleText({ text, className, delay = 0, duration = 900 }: { text: string; className?: string; delay?: number; duration?: number }) {
  const [out, setOut] = useState(text.replace(/\S/g, " "));
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / duration));
      const revealed = Math.floor(p * text.length);
      setOut(
        text
          .split("")
          .map((ch, i) => (i < revealed || ch === " " ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0]))
          .join(""),
      );
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, text, delay, duration]);
  return (
    <span ref={ref} className={className} aria-label={text}>
      {out}
    </span>
  );
}

/** Counts up to a value when scrolled into view (or whenever the value changes). */
export function NumberTicker({ value, decimals = 0, className, prefix = "", suffix = "", duration = 1.2 }: { value: number; decimals?: number; className?: string; prefix?: string; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const prev = useRef(0);
  useEffect(() => {
    if (!inView || !ref.current) return;
    const node = ref.current;
    const controls = animate(prev.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = `${prefix}${v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
      },
    });
    prev.current = value;
    return () => controls.stop();
  }, [inView, value, decimals, prefix, suffix, duration]);
  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {prefix}0{suffix}
    </span>
  );
}

export function Marquee({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("group relative flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]", className)}>
      <div className="flex shrink-0 animate-marquee items-center gap-12 pr-12 group-hover:[animation-play-state:paused]">
        {children}
        {children}
      </div>
    </div>
  );
}

/** Card with a light that follows the cursor and a tilt on hover. */
export function SpotlightCard({ children, className, color = "79 141 255" }: { children: ReactNode; className?: string; color?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [5, -5]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(mx, [0, 1], [-6, 6]), { stiffness: 200, damping: 20 });
  const bg = useTransform([mx, my], ([x, y]: number[]) => `radial-gradient(420px circle at ${x * 100}% ${y * 100}%, rgb(${color} / 0.16), transparent 45%)`);
  const onMove = (e: MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width);
    my.set((e.clientY - r.top) / r.height);
  };
  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={() => {
        mx.set(0.5);
        my.set(0.5);
      }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      className={cn("hud hud-brackets group relative overflow-hidden", className)}
    >
      <motion.div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: bg }} />
      {children}
    </motion.div>
  );
}

export function MagneticButton({ children, className, onClick, href }: { children: ReactNode; className?: string; onClick?: () => void; href?: string }) {
  const ref = useRef<HTMLAnchorElement & HTMLButtonElement>(null);
  const x = useSpring(0, { stiffness: 250, damping: 15 });
  const y = useSpring(0, { stiffness: 250, damping: 15 });
  const onMove = (e: MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    x.set((e.clientX - r.left - r.width / 2) * 0.25);
    y.set((e.clientY - r.top - r.height / 2) * 0.35);
  };
  const Comp = (href ? motion.a : motion.button) as typeof motion.a;
  return (
    <Comp
      ref={ref}
      href={href}
      onClick={onClick}
      onMouseMove={onMove}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
      style={{ x, y }}
      className={className}
    >
      {children}
    </Comp>
  );
}

export function Reveal({ children, className, delay = 0, y = 24 }: { children: ReactNode; className?: string; delay?: number; y?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Logo({ className, size = 28, withWord = true }: { className?: string; size?: number; withWord?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <defs>
          <linearGradient id="ohm-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#9fe0ff" />
            <stop offset="1" stopColor="#3b6cff" />
          </linearGradient>
          <filter id="ohm-glow">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect x="2" y="2" width="60" height="60" rx="15" fill="#070d1c" stroke="rgb(120 180 255 / 0.35)" />
        <path filter="url(#ohm-glow)" d="M14 46h10v-5.2A15 15 0 1 1 40 40.8V46h10v-6h-5.4a19 19 0 1 0-25.2 0H14z" fill="url(#ohm-g)" />
        <circle cx="32" cy="27" r="3.4" fill="#f43f5e">
          <animate attributeName="opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite" />
        </circle>
      </svg>
      {withWord && <span className="font-mono text-[15px] font-semibold tracking-[0.32em] text-white">OHMEN</span>}
    </span>
  );
}

/** A soft beam that travels around the border of its parent. */
export function BorderBeam({ duration = 7, color = "#8cc8ff" }: { duration?: number; color?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <motion.div
        className="absolute -inset-[150%]"
        style={{ background: `conic-gradient(from 0deg, transparent 0 82%, ${color} 88%, transparent 94%)` }}
        animate={{ rotate: 360 }}
        transition={{ duration, repeat: Infinity, ease: "linear" }}
      />
      <div className="absolute inset-px rounded-[inherit] bg-ink-900" />
    </div>
  );
}
