export type ArchTier = 'edge' | 'gateway' | 'compute' | 'messaging' | 'storage';

export type ProtocolType =
  | 'HTTPS'
  | 'gRPC'
  | 'Kafka'
  | 'WebSocket'
  | 'SQL'
  | 'Redis RESP'
  | 'S3 API';

export type ScalingModel =
  | 'Horizontal Auto-Scale'
  | 'Serverless Elastic'
  | 'Vertical Primary-Replica'
  | 'Partitioned Cluster'
  | 'Global Edge Anycast';

export type SpofRisk = 'NONE' | 'LOW' | 'MODERATE' | 'CRITICAL';

export type CostCategory = 'compute' | 'storage' | 'network' | 'ai_queue';

export interface ArchNode {
  id: string;
  label: string;
  tier: ArchTier;
  technology: string;
  justification: string;
  scalingModel: ScalingModel;
  spofRisk: SpofRisk;
  baseLatencyMs: number;
  baseMonthlyCostUsd: number;
  maxCapacityRps: number;
  costCategory: CostCategory;
  isStateful: boolean;
  replicas: number;
  failureDomain: string;
}

export interface ArchEdge {
  id: string;
  source: string;
  target: string;
  protocol: ProtocolType;
  label: string;
  isAsync: boolean;
  encrypted: boolean;
}

export type AuditPersonaId = 'security' | 'sre' | 'finops';

export type FindingSeverity = 'CRITICAL' | 'WARNING' | 'OPTIMIZATION';

export interface AuditFinding {
  id: string;
  persona: AuditPersonaId;
  severity: FindingSeverity;
  title: string;
  analysis: string;
  recommendation: string;
  targetNodeId: string;
  estimatedImpact: string;
}

export interface MultiAgentAudit {
  securityScore: number;
  resilienceScore: number;
  costEfficiencyScore: number;
  executiveSummary: string;
  findings: AuditFinding[];
}

export interface ProductionArtifacts {
  schemaSql: string;
  dockerComposeYml: string;
  openapiYaml: string;
  executiveRfcMd: string;
}

export interface ArchitectureDiff {
  addedNodes: Array<{
    id: string;
    label: string;
    technology: string;
    reason: string;
  }>;
  upgradedProtocols: Array<{
    edgeLabel: string;
    from: string;
    to: string;
    rationale: string;
  }>;
  remediatedRisks: string[];
  securityScoreDelta: number;
  resilienceScoreDelta: number;
  costEfficiencyScoreDelta: number;
  baseMonthlyCostDeltaUsd: number;
  summary: string;
}

export type SynthesisEngine = 'gemini-live' | 'deterministic-fallback';

export type GeminiModelOption = 'gemini-2.5-flash' | 'gemini-2.5-pro';

export interface ArchitectureVersion {
  versionId: string;
  versionLabel: string;
  createdAt: string;
  nodes: ArchNode[];
  edges: ArchEdge[];
  audit: MultiAgentAudit;
  artifacts: ProductionArtifacts;
  diffFromPrevious?: ArchitectureDiff;
  synthesisEngine?: SynthesisEngine;
  synthesisModel?: string;
}

export type CloudProfile = 'aws' | 'gcp' | 'hybrid';

export interface SimulationParams {
  peakRps: number;
  readRatioPercent: number;
  payloadSizeKb: number;
  multiRegion: boolean;
  cloudProfile: CloudProfile;
}

export interface ArchitectureBlueprint {
  id: string;
  name: string;
  domainTag: string;
  prompt: string;
  isDemo?: boolean;
  updatedAt: string;
  activeVersionId: string;
  versions: ArchitectureVersion[];
  defaultSimulation: SimulationParams;
  synthesisEngine?: SynthesisEngine;
}

export type NodeStressStatus = 'nominal' | 'elevated' | 'saturated';

export interface NodeSimulationMetrics {
  nodeId: string;
  effectiveRps: number;
  effectiveCapacityRps: number;
  utilizationPercent: number;
  cpuPercent: number;
  iopsEstimate: number;
  simulatedP99Ms: number;
  monthlyCostUsd: number;
  status: NodeStressStatus;
}

export interface FinOpsBreakdown {
  computeUsd: number;
  storageUsd: number;
  networkUsd: number;
  aiQueueUsd: number;
  totalMonthlyUsd: number;
  costPerMillionRequestsUsd: number;
  monthlyRequestsMillions: number;
  monthlyEgressTb: number;
}

export interface SimulationResult {
  nodeMetrics: Record<string, NodeSimulationMetrics>;
  endToEndP99Ms: number;
  criticalPathNodeIds: string[];
  bottleneckNodeId: string | null;
  maxUtilizationPercent: number;
  saturatedCount: number;
  elevatedCount: number;
  finops: FinOpsBreakdown;
}

export type ThinkingLevelOption = 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';

export type CompliancePreset = 'PCI_DSS' | 'HIPAA' | 'SOC2_ISO27001' | 'GENERAL';

export interface CompilerSettings {
  geminiModel: GeminiModelOption;
  customApiKey: string;
  thinkingLevel: ThinkingLevelOption;
  compliancePreset: CompliancePreset;
  cloudProfile: CloudProfile;
  autoFitOnCompile: boolean;
}

export interface KeyVerificationResult {
  valid: boolean;
  configured: boolean;
  model: string;
  keySource: 'custom' | 'env' | 'none';
  latencyMs: number;
  message: string;
}

export interface NodePosition {
  x: number;
  y: number;
}

export type ChaosVerdict =
  | 'hard_outage'
  | 'degraded_failover'
  | 'resilient_quorum';

export interface OutageBlastRadiusResult {
  failedNodeId: string;
  failedNodeLabel: string;
  verdict: ChaosVerdict;
  survivingReplicas: number;
  totalReplicas: number;
  upstreamBlockedNodeIds: string[];
  downstreamStarvedNodeIds: string[];
  impactedEdgeIds: string[];
  estimatedAvailabilityPercent: number;
  p99PenaltyMultiplier: number;
  headline: string;
  engineeringSummary: string;
}

