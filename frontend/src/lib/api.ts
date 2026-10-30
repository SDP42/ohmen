import type {
  AnalystReply,
  AssetDetail,
  Counterfactual,
  Explanation,
  GraphData,
  Mitigation,
  Persona,
  RiskRow,
  ScenarioConfig,
  ScenarioResult,
  Snapshot,
  Summary,
  TwinEvent,
} from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export interface RiskRanking {
  weights: Record<string, number>;
  systemic_risk_index: number;
  threat_level: string;
  counts: Record<string, number>;
  assets: RiskRow[];
}

export const api = {
  summary: () => request<Summary>("/twin/summary"),
  graph: () => request<GraphData>("/graph"),
  asset: (id: string) => request<AssetDetail>(`/assets/${id}`),
  updateAsset: (id: string, patch: Record<string, unknown>) => request<{ asset: unknown; changes: Record<string, unknown>; summary: Summary }>(`/assets/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  addEdge: (edge: Record<string, unknown>) => post<{ edge: unknown }>("/graph/edges", edge),
  removeEdge: (id: string) => request<{ removed: string }>(`/graph/edges/${id}`, { method: "DELETE" }),
  dependencies: (id: string) => request<{ first_order: string[]; second_order: string[]; upstream: string[] }>(`/graph/dependencies/${id}`),
  events: (limit = 60) => request<TwinEvent[]>(`/events?limit=${limit}`),
  timeline: () => request<Snapshot[]>("/timeline"),
  risk: () => request<RiskRanking>("/risk"),
  recompute: (weights: Record<string, number>) => post<RiskRanking>("/risk/recompute", weights),
  compare: (a: string, b: string) => request<{ a: Explanation; b: Explanation }>(`/risk/compare?a=${a}&b=${b}`),
  forecast: () => request<any>("/risk/forecast"),
  modelCard: () => request<any>("/ml/model-card"),
  vulnerabilities: () => request<any[]>("/vulnerabilities"),
  feed: () => request<any>("/intel/feed"),
  syncKev: () => post<any>("/intel/sync-kev", {}),
  templates: () => request<{ templates: { id: string; name: string; description: string; defaults: Record<string, string> }[]; vendors: string[]; zones: string[] }>("/scenarios/templates"),
  runScenario: (cfg: ScenarioConfig) => post<ScenarioResult>("/scenarios/run", cfg),
  compareScenarios: (a: ScenarioConfig, b: ScenarioConfig) => post<any>("/scenarios/compare", { a, b }),
  scenarios: () => request<any[]>("/scenarios"),
  catalog: (id: string) => request<Mitigation[]>(`/mitigations/catalog/${id}`),
  evaluate: (mitigations: string[], scenario?: ScenarioConfig) => post<any>("/mitigations/evaluate", { mitigations, scenario }),
  optimize: (budget: number) => post<any>("/mitigations/optimize", { budget }),
  spof: () => request<any[]>("/resilience/spof"),
  alternative: (body: { source: string; target: string; node: string }) => post<any>("/resilience/alternative", body),
  chokepoints: () => request<any>("/resilience/chokepoints"),
  drift: () => request<any>("/resilience/drift"),
  vendors: () => request<any[]>("/resilience/vendors"),
  exposure: () => request<any>("/exposure"),
  certin: () => request<any>("/compliance/certin"),
  attck: () => request<any>("/compliance/attck"),
  audit: () => request<any>("/audit"),
  tasks: () => request<any[]>("/tasks"),
  createTask: (mitigation_id: string, due_days?: number) => post<any>("/tasks", { mitigation_id, due_days }),
  updateTask: (id: string, status: string) => request<any>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  analystStatus: () => request<any>("/analyst/status"),
  ask: (question: string, persona: Persona, history: { role: string; content: string }[]) => post<AnalystReply>("/analyst/ask", { question, persona, history }),
  report: () => request<any>("/reports/risk"),
  flagship: () => post<{ started: boolean }>("/demo/flagship", {}),
  reset: () => post<{ reset: boolean; summary: Summary }>("/demo/reset", {}),
  ambient: (enabled: boolean) => post<{ ambient: boolean }>("/demo/ambient", { enabled }),
};

export type { Counterfactual };
