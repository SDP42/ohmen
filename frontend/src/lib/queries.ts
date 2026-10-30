import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useUi } from "./store";

export const useGraph = () => useQuery({ queryKey: ["graph"], queryFn: api.graph });
export const useRisk = () => useQuery({ queryKey: ["risk"], queryFn: api.risk });
export const useAsset = (id: string | null) => useQuery({ queryKey: ["asset", id], queryFn: () => api.asset(id!), enabled: Boolean(id) });
export const useTimeline = () => useQuery({ queryKey: ["timeline"], queryFn: api.timeline });
export const useSummary = () => {
  const live = useUi((s) => s.summary);
  const q = useQuery({ queryKey: ["summary"], queryFn: api.summary, enabled: !live });
  return live ?? q.data ?? null;
};

export function useFlagship() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.flagship, onSuccess: () => qc.invalidateQueries({ queryKey: ["summary"] }) });
}

export function useReset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.reset,
    onSuccess: (r) => {
      useUi.getState().setSummary(r.summary);
      useUi.getState().setScenario(null);
      qc.invalidateQueries();
    },
  });
}
