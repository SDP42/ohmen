import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Logo } from "../components/fx";
import { cn } from "../lib/format";
import { Bento, CvssVsConsequence, FinalCta, Footer, Method, Personas, Pipeline, Unique } from "./sections";
import Story from "./Story";

function Nav() {
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  useMotionValueEvent(scrollY, "change", (v) => setSolid(v > 40));
  const links = [
    ["Story", "#story"],
    ["Why", "#why"],
    ["Platform", "#platform"],
    ["Unique", "#unique"],
    ["Method", "#method"],
  ];
  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className={cn("fixed inset-x-0 top-0 z-50 transition-all duration-500", solid ? "bg-ink-950/70 backdrop-blur-xl" : "bg-transparent")}
    >
      <div className={cn("mx-auto flex h-16 max-w-7xl items-center justify-between px-6", solid && "border-b border-line")}>
        <Link to="/" aria-label="OHMEN home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map(([l, h]) => (
            <a key={h} href={h} className="rounded-md px-3 py-1.5 text-[13px] text-[#a9b9d8] transition-colors hover:bg-white/5 hover:text-white">
              {l}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login" className="hidden rounded-md px-3 py-1.5 text-[13px] text-[#a9b9d8] hover:text-white sm:block">
            Sign in
          </Link>
          <Link to="/login" className="group inline-flex h-9 items-center gap-1.5 rounded-md bg-white px-3.5 text-[13px] font-medium text-ink-950 transition-transform hover:scale-[1.03]">
            Launch console <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
      </div>
    </motion.header>
  );
}

export default function Landing() {
  return (
    <ReactLenis root options={{ lerp: 0.09, smoothWheel: true }}>
      <div className="grain relative bg-ink-950">
        <Nav />
        <Story />
        <div className="relative bg-ink-950">
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
          <CvssVsConsequence />
          <Bento />
          <Unique />
          <Pipeline />
          <Method />
          <Personas />
          <FinalCta />
          <Footer />
        </div>
      </div>
    </ReactLenis>
  );
}
