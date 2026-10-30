import { create } from "zustand";
import type { Persona, ScenarioResult, Snapshot, Summary, TwinEvent } from "./types";

interface UiState {
  selected: string | null;
  inspectorOpen: boolean;
  drawerOpen: boolean;
  paletteOpen: boolean;
  persona: Persona;
  connected: boolean;
  summary: Summary | null;
  events: TwinEvent[];
  lastSnapshot: Snapshot | null;
  flash: { id: string; at: number } | null;
  scenario: ScenarioResult | null;
  ghost: boolean;
  select: (id: string | null, open?: boolean) => void;
  closeInspector: () => void;
  setDrawer: (open: boolean) => void;
  setPalette: (open: boolean) => void;
  setPersona: (p: Persona) => void;
  setConnected: (c: boolean) => void;
  setSummary: (s: Summary) => void;
  pushEvent: (e: TwinEvent) => void;
  setEvents: (e: TwinEvent[]) => void;
  setSnapshot: (s: Snapshot) => void;
  setScenario: (r: ScenarioResult | null) => void;
  setGhost: (g: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  selected: null,
  inspectorOpen: false,
  drawerOpen: false,
  paletteOpen: false,
  persona: "analyst",
  connected: false,
  summary: null,
  events: [],
  lastSnapshot: null,
  flash: null,
  scenario: null,
  ghost: false,
  select: (id, open = true) => set({ selected: id, inspectorOpen: Boolean(id) && open }),
  closeInspector: () => set({ inspectorOpen: false }),
  setDrawer: (drawerOpen) => set({ drawerOpen }),
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setPersona: (persona) => set({ persona }),
  setConnected: (connected) => set({ connected }),
  setSummary: (summary) => set({ summary }),
  pushEvent: (e) =>
    set((s) => ({
      events: [e, ...s.events.filter((x) => x.id !== e.id)].slice(0, 120),
      flash: e.asset_id && e.severity !== "info" ? { id: e.asset_id, at: Date.now() } : s.flash,
    })),
  setEvents: (events) => set({ events }),
  setSnapshot: (lastSnapshot) => set({ lastSnapshot }),
  setScenario: (scenario) => set({ scenario }),
  setGhost: (ghost) => set({ ghost }),
}));
