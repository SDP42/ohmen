import { create } from "zustand";
import type { Persona } from "./types";

export interface User {
  id: string;
  name: string;
  role: string;
  persona: Persona;
  clearance: string;
  initials: string;
  color: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
}

const KEY = "ohmen.session";

function load(): { token: string | null; user: User | null } {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : { token: null, user: null };
  } catch {
    return { token: null, user: null };
  }
}

export const useAuth = create<AuthState>((set) => ({
  ...load(),
  signIn: (token, user) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ token, user }));
    } catch {
      /* storage unavailable: session lasts for this tab only */
    }
    set({ token, user });
  },
  signOut: () => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    set({ token: null, user: null });
  },
}));
