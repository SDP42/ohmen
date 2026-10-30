import { Command } from "cmdk";
import { AnimatePresence, motion } from "motion/react";
import { Eye, Play, RotateCcw, Search } from "lucide-react";
import { useNavigate } from "react-router";
import { PriorityPill } from "../components/ui";
import { TYPE_LABEL } from "../lib/format";
import { useFlagship, useGraph, useReset } from "../lib/queries";
import { useUi } from "../lib/store";
import { NAV } from "./ConsoleLayout";

export default function CommandPalette() {
  const { paletteOpen, setPalette, select, ghost, setGhost } = useUi();
  const { data: graph } = useGraph();
  const navigate = useNavigate();
  const flagship = useFlagship();
  const reset = useReset();
  const run = (fn: () => void) => {
    fn();
    setPalette(false);
  };
  const item = "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-[13px] text-[#c3d2ee] data-[selected=true]:bg-volt/15 data-[selected=true]:text-white";
  return (
    <AnimatePresence>
      {paletteOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 pt-[14vh] backdrop-blur-sm" onClick={() => setPalette(false)}>
          <motion.div initial={{ scale: 0.96, y: -10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: -10 }} onClick={(e) => e.stopPropagation()} className="hud hud-brackets w-full max-w-xl overflow-hidden">
            <Command label="Command palette" loop>
              <div className="flex items-center gap-2 border-b border-line px-4">
                <Search className="size-4 text-dim" />
                <Command.Input autoFocus placeholder="Search assets, pages and actions…" className="h-12 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-dim" />
                <span className="kbd">esc</span>
              </div>
              <Command.List className="max-h-[52vh] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-6 text-center text-sm text-dim">Nothing matches.</Command.Empty>
                <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-dim [&_[cmdk-group-heading]]:uppercase">
                  <Command.Item className={item} onSelect={() => run(() => flagship.mutate())}>
                    <Play className="size-4 text-crit" /> Run flagship incident
                  </Command.Item>
                  <Command.Item className={item} onSelect={() => run(() => setGhost(!ghost))}>
                    <Eye className="size-4 text-cyber" /> {ghost ? "Leave" : "Enter"} adversary ghost mode
                  </Command.Item>
                  <Command.Item className={item} onSelect={() => run(() => reset.mutate())}>
                    <RotateCcw className="size-4 text-mute" /> Reset simulation to baseline
                  </Command.Item>
                </Command.Group>
                <Command.Group heading="Pages" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-dim [&_[cmdk-group-heading]]:uppercase">
                  {NAV.map((n) => (
                    <Command.Item key={n.to} className={item} onSelect={() => run(() => navigate(n.to))}>
                      <n.icon className="size-4 text-volt-2" /> {n.label}
                    </Command.Item>
                  ))}
                </Command.Group>
                <Command.Group heading="Assets" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-dim [&_[cmdk-group-heading]]:uppercase">
                  {graph?.nodes
                    .filter((n) => n.category !== "entry")
                    .map((n) => (
                      <Command.Item key={n.id} value={`${n.id} ${n.name} ${n.type}`} className={item} onSelect={() => run(() => select(n.id))}>
                        <span className="w-20 font-mono text-[12px] text-white">{n.id}</span>
                        <span className="flex-1 truncate text-[12px]">{n.name}</span>
                        <span className="text-[10.5px] text-dim">{TYPE_LABEL[n.type] ?? n.type}</span>
                        {n.risk && <PriorityPill priority={n.risk.priority} />}
                      </Command.Item>
                    ))}
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
