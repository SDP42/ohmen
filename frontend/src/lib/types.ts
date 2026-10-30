export type Priority = "NOW" | "NEXT" | "MONITOR";
export type Persona = "analyst" | "operations" | "commissioner" | "auditor";
export type NodeState = "ok" | "impaired" | "degraded" | "on_backup" | "lost";

export interface RiskRow {
  id: string;
  name: string;
  type: string;
  site: string | null;
  zone: string;
  criticality: number;
  status: string;
  vulnerability_priority: number;
  likelihood: number;
  impact: number;
  score: number;
  priority: Priority;
  cvss_max: number;
  kev: boolean;
  exploit: string | null;
  top_advisory: string | null;
  activity: string | null;
  exposure: string;
  open_matches: number;
  rank: number;
  cvss_rank: number;
  rank_delta: number;
  ml_probability?: number;
  population_downstream?: number;
}

export interface ServiceRisk {
  likelihood: number;
  via: string;
  state: NodeState;
  cause: string;
}

export interface TwinNode {
  id: string;
  name: string;
  type: string;
  category: "cyber" | "physical" | "service" | "entry";
  site?: string | null;
  site_name?: string;
  lat: number | null;
  lon: number | null;
  zone: string;
  purdue_level: number | null;
  criticality: number;
  status: string;
  redundancy?: string;
  exposure?: string;
  auth?: string;
  monitoring?: number;
  internet_facing?: boolean;
  remote_access?: boolean;
  vendor?: string | null;
  model?: string | null;
  ip?: string | null;
  population?: number;
  facility_type?: string;
  backup_hours?: number;
  beds?: number | null;
  polygon?: [number, number][];
  description?: string;
  risk: RiskRow | null;
  service_risk: ServiceRisk | null;
  activity: string | null;
}

export interface CyberEdge {
  id: string;
  kind: "logical" | "physical" | "observed";
  source: string;
  target: string;
  protocol: string;
  port: number | null;
  purpose: string;
  policy: "allowed" | "legacy_exception" | "controlled";
  encrypted: boolean;
  authenticated: boolean;
  bidirectional: boolean;
  status: "active" | "inactive";
  monitored: boolean;
  crosses_zone?: boolean;
  last_observed_hours?: number;
  event_id?: string;
}

export interface OpsEdge {
  id: string;
  relation: "controls" | "telemetry" | "hosts" | "feeds" | "supplies" | "serves" | "water" | "comms";
  source: string;
  target: string;
  role: "primary" | "backup";
  capacity: number;
  description: string;
}

export interface Zone {
  id: string;
  name: string;
  purdue_level: number | null;
  members: string[];
}

export interface GraphData {
  nodes: TwinNode[];
  cyber_edges: CyberEdge[];
  ops_edges: OpsEdge[];
  observed_edges: CyberEdge[];
  zones: Zone[];
  systemic_risk_index: number;
  threat_level: string;
}

export interface TwinEvent {
  id: string;
  ts: string;
  asset_id: string | null;
  type: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  detail: string;
  source?: string | null;
  destination?: string | null;
  protocol?: string | null;
  advisory_id?: string | null;
  evidence?: string;
  actor?: string;
}

export interface ServiceSummary extends ServiceRisk {
  id: string;
  name: string;
  type: string;
  population?: number;
  backup_hours?: number;
}

export interface Summary {
  monitored_assets: number;
  cyber_assets: number;
  physical_assets: number;
  high_risk_assets: number;
  critical_dependencies: number;
  open_incidents: number;
  under_investigation: string[];
  systemic_risk_index: number;
  threat_level: string;
  counts: Record<Priority, number>;
  top: RiskRow[];
  services: ServiceSummary[];
  population_served: number;
  events_total: number;
  demo: { running: boolean; step: number; total: number };
  ambient: boolean;
  advisories_ingested: number;
  generated_at: string;
}

export interface Snapshot {
  index: number;
  ts: string;
  event_id: string | null;
  title: string;
  severity: string;
  asset_id: string | null;
  sri: number;
  threat_level: string;
  counts: Record<Priority, number>;
  top: { id: string; score: number; priority: Priority }[];
  scores: Record<string, number>;
}

export interface Factor {
  key: string;
  label: string;
  value: number;
  rating: string;
  detail: string;
  contribution: number | null;
}

export interface Consequence {
  node: string;
  name: string;
  type: string;
  state: string;
  via: string | null;
  path_likelihood: number | null;
  weight: number;
  population?: number;
}

export interface Facility {
  id: string;
  name: string;
  type: string;
  state: NodeState;
  cause: string;
  backup_hours?: number;
  time_to_harm_hours: number | null;
  population?: number;
  beds?: number | null;
}

export interface ImpactMetrics {
  citizens_without_power: number;
  zones_lost: string[];
  zones_degraded: string[];
  essential_services_affected: number;
  facilities: Facility[];
  hospitals_affected: number;
  hospital_beds_at_risk: number;
  water_population_at_risk: number;
  time_to_harm_hours: number | null;
  substations_affected: number;
}

export interface Explanation {
  asset: RiskRow;
  factors: Factor[];
  terms: Record<string, number>;
  formula: Record<string, string>;
  reasons: string[];
  consequences: Consequence[];
  blast_radius: { id: string; name: string; likelihood: number }[];
  attack_path: string[];
  direct_impact: ImpactMetrics | null;
}

export interface Mitigation {
  id: string;
  type: string;
  target: string;
  target_name: string;
  title: string;
  description: string;
  cost_lakh: number;
  effort: string;
  category: string;
}

export interface Counterfactual extends Mitigation {
  score_before: number;
  score_after: number;
  priority_after: Priority;
  sri_before: number;
  sri_after: number;
  sri_delta: number;
}

export interface Advisory {
  id: string;
  title: string;
  vendor: string;
  product: string;
  affected: string;
  fixed_version: string;
  cvss: number;
  cvss_vector: string;
  cwe: string;
  exploit_maturity: string;
  kev: boolean;
  epss: number;
  published: string;
  summary: string;
  remediation: string;
  source: string;
  ingested?: boolean;
}

export interface Match {
  advisory_id: string;
  status: "confirmed" | "potential" | "not_applicable";
  reason: string;
  software: { vendor: string; product: string; version: string; kind: string };
  advisory: Advisory;
}

export interface AssetDetail {
  asset: TwinNode & { software?: { vendor: string; product: string; version: string; kind: string }[]; owner?: string; recovery_hours?: number; tags?: string[]; criticality_label: string; last_assessment?: string };
  activity: { level?: string; events?: string[] } | null;
  matches: Match[];
  cyber_in: CyberEdge[];
  cyber_out: CyberEdge[];
  ops_in: OpsEdge[];
  ops_out: OpsEdge[];
  events: TwinEvent[];
  service_risk: ServiceRisk | null;
  risk?: Explanation;
  counterfactuals?: Counterfactual[];
  ml?: { probability: number; attribution: { feature: string; label: string; value: number; contribution: number }[] };
  impact_if_manipulated: ImpactMetrics | null;
}

export interface ScenarioNode {
  id: string;
  classification: "observed" | "initial" | "reachable" | "consequence";
  t: number;
  hop?: number;
  likelihood?: number;
  label: string;
  basis?: string;
  path?: string[];
  state?: NodeState;
  cause?: string;
  evidence?: string | null;
}

export interface AttckRow {
  technique_id: string;
  technique: string;
  tactic: string;
  stage: string;
  evidence: string[];
  t: number;
}

export interface MonteCarlo {
  runs: number;
  seed: number;
  reach_probability: { id: string; name: string; probability: number }[];
  citizens: { p10: number; p50: number; p90: number; mean: number; histogram: { start: number; end: number; count: number }[] };
  expected_digital_assets: number;
  p_hospital_impact: number;
  p_any_service_impact: number;
  p_detected: number;
  time_to_harm_p50: number | null;
}

export interface ScenarioConfig {
  type: string;
  asset?: string | null;
  vendor?: string | null;
  zone?: string | null;
  severity: "low" | "medium" | "high";
  reachability: "configured" | "observed" | "flat";
  depth: number;
  mitigations: string[];
  runs?: number;
  seed?: number;
  monte_carlo?: boolean;
}

export interface ScenarioResult {
  id: string;
  config: ScenarioConfig;
  seeds: string[];
  assumptions: string[];
  nodes: Record<string, ScenarioNode>;
  edges: { id: string; source: string; target: string; t: number; kind: string; likelihood: number; basis: string; protocol: string | null }[];
  stages: { id: string; t: number; label: string; detail: string }[];
  duration_minutes: number;
  attck: AttckRow[];
  projection: { hours: number; node: string; state: string; cause: string }[];
  impact: ImpactMetrics & { digital_assets_reachable: number; operational_assets_affected: number; highest_criticality: number; systemic_impact_score: number };
  mitigations_applied: Mitigation[];
  risk_after: number;
  risk_baseline: number;
  foothold_likelihood?: { before: number; after: number };
  expected_impact?: number;
  contained?: string[];
  baseline_impact?: ScenarioResult["impact"];
  monte_carlo?: MonteCarlo;
}

export interface AnalystReply {
  answer: string;
  tool_calls: { tool: string; input: Record<string, unknown>; summary: string }[];
  cited_assets: string[];
  engine: "claude" | "deterministic";
  persona: Persona;
  model?: string;
  note?: string | null;
  intent?: string;
}
