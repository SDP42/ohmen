import { AnimatePresence, motion } from "motion/react";
import { Pause, Play, Radio, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SeverityDot } from "../components/ui";
import { api } from "../lib/api";
import { cn, fmtTime } from "../lib/format";
import { useUi } from "../lib/store";
import type { TwinEvent } from "../lib/types";

export function EventRow({ e, onClick, fresh }: { e: TwinEvent; onClick?: () => void; fresh?: boolean }) {
  return (
    <motion.button
      layout
      initial={fresh ? { opacity: 0, x: 20, backgroundColor: "rgba(79,141,255,0.18)" } : false}
      animate={{ opacity: 1, x: 0, backgroundColor: "rgba(0,0,0,0)" }}
      transition={{ duration: 0.5 }}
      onClick={onClick}
      className="flex w-full gap-2.5 rounded-md px-2 py-2 text-left hover:bg-white/[0.03]"
    >
      <div className="pt-1.5">
        <SeverityDot severity={e.severity} pulse={fresh && e.severity !== "info"} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn("truncate text-[12.5px]", e.severity === "info" ? "text-[#a8b8d6]" : "text-[#e3ecff]")}>{e.title}</span>
          <span className="shrink-0 font-mono text-[10px] text-dim">{fmtTime(e.ts)}</span>
        </div>
        <div className="truncate text-[11px] text-dim">{e.detail}</div>
        <div className="mt-0.5 flex gap-2 font-mono text-[9.5px] text-ink-500">
          <span>{e.id}</span>
          {e.asset_id && <span className="text-volt-2/70">{e.asset_id}</span>}
          <span>{e.type}</span>
        </div>
      </div>
    </motion.button>
  );
}

export default function EventDrawer() {
  const { drawerOpen, setDrawer, events, setEvents, select } = useUi();
  const { data } = useQuery({ queryKey: ["events"], queryFn: () => api.events(80), enabled: drawerOpen });
  const [ambient, setAmbient] = useState(true);
  const [mountedAt] = useState(() => Date.now());
  useEffect(() => {
    if (data && events.length < data.length) setEvents(data);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <AnimatePresence>
      {drawerOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
          <motion.aside initial={{ x: 420 }} animate={{ x: 0 }} exit={{ x: 420 }} transition={{ type: "spring", stiffness: 280, damping: 32 }} className="fixed top-0 right-0 bottom-0 z-50 flex w-full max-w-[400px] flex-col border-l border-line-strong bg-ink-900/95 backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="flex items-center gap-2">
                <Radio className="size-4 text-crit" />
                <span className="font-mono text-[11px] tracking-[0.16em] text-volt-2 uppercase">Live event stream</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setAmbient(!ambient);
                    api.ambient(!ambient);
                  }}
                  title="Toggle ambient telemetry"
                  className="rounded-md p-1.5 text-dim hover:bg-white/5 hover:text-white"
                >
                  {ambient ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                </button>
                <button onClick={() => setDrawer(false)} className="rounded-md p-1.5 text-dim hover:bg-white/5 hover:text-white" aria-label="Close">
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {events.map((e) => (
                <EventRow
                  key={e.id}
                  e={e}
                  fresh={new Date(e.ts).getTime() > mountedAt - 4000}
                  onClick={() => {
                    if (e.asset_id) select(e.asset_id);
                    setDrawer(false);
                  }}
                />
              ))}
            </div>
            <div className="border-t border-line px-4 py-2 font-mono text-[10px] text-dim">Synthetic event records · click an event to inspect its asset</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
