import type {
  ArchEdge,
  ArchitectureBlueprint,
  ArchitectureDiff,
  ArchitectureVersion,
  ArchNode,
  ArchTier,
  AuditPersonaId,
  CompilerSettings,
  CostCategory,
  FindingSeverity,
  GeminiModelOption,
  KeyVerificationResult,
  MultiAgentAudit,
  ProductionArtifacts,
  ProtocolType,
  ScalingModel,
  SpofRisk,
  SynthesisEngine,
} from '../types/architecture';
import { DEMO_BLUEPRINTS } from '../data/demoBlueprints';
import {
  synthesizeDeterministicAutoHeal,
  synthesizeDeterministicBlueprint,
} from '../engine/deterministicCompiler';

const BLUEPRINTS_STORAGE_KEY = 'archforge.blueprints.v1';
const SETTINGS_STORAGE_KEY = 'archforge.compiler_settings.v1';
const REQUEST_TIMEOUT_MS = 120_000;

export const DEFAULT_COMPILER_SETTINGS: CompilerSettings = {
  geminiModel: 'gemini-2.5-flash',
  customApiKey: '',
  thinkingLevel: 'LOW',
  compliancePreset: 'SOC2_ISO27001',
  cloudProfile: 'aws',
  autoFitOnCompile: true,
};

const VALID_TIERS: readonly ArchTier[] = [
  'edge',
  'gateway',
  'compute',
  'messaging',
  'storage',
];
const VALID_PROTOCOLS: readonly ProtocolType[] = [
  'HTTPS',
  'gRPC',
  'Kafka',
  'WebSocket',
  'SQL',
  'Redis RESP',
  'S3 API',
];
const VALID_SCALING: readonly ScalingModel[] = [
  'Horizontal Auto-Scale',
  'Serverless Elastic',
  'Vertical Primary-Replica',
  'Partitioned Cluster',
  'Global Edge Anycast',
];
const VALID_SPOF: readonly SpofRisk[] = ['NONE', 'LOW', 'MODERATE', 'CRITICAL'];
const VALID_COST_CATS: readonly CostCategory[] = [
  'compute',
  'storage',
  'network',
  'ai_queue',
];
const VALID_PERSONAS: readonly AuditPersonaId[] = ['security', 'sre', 'finops'];
const VALID_SEVERITIES: readonly FindingSeverity[] = [
  'CRITICAL',
  'WARNING',
  'OPTIMIZATION',
];

interface CompileApiResponse {
  name: string;
  domainTag: string;
  recommendedPeakRps: number;
  recommendedReadRatioPercent: number;
  recommendedPayloadSizeKb: number;
  nodes: ArchNode[];
  edges: ArchEdge[];
  audit: MultiAgentAudit;
  artifacts: ProductionArtifacts;
  synthesisEngine?: SynthesisEngine;
  synthesisModel?: string;
}

interface AutoHealApiResponse {
  nodes: ArchNode[];
  edges: ArchEdge[];
  audit: MultiAgentAudit;
  artifacts: ProductionArtifacts;
  diffFromPrevious: ArchitectureDiff;
  synthesisEngine?: SynthesisEngine;
  synthesisModel?: string;
}

function clampFinite(
  val: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export function sanitizeArtifacts(
  artifacts: Partial<ProductionArtifacts> | undefined | null,
  blueprintName = 'ArchForge System'
): ProductionArtifacts {
  const safeSql =
    typeof artifacts?.schemaSql === 'string' && artifacts.schemaSql.trim()
      ? artifacts.schemaSql
      : `-- ${blueprintName} · Generated PostgreSQL DDL\nCREATE TABLE IF NOT EXISTS system_records (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n`;

  const safeDocker =
    typeof artifacts?.dockerComposeYml === 'string' &&
    artifacts.dockerComposeYml.trim()
      ? artifacts.dockerComposeYml
      : `name: archforge-stack\nservices:\n  api:\n    image: alpine:3.20\n`;

  const safeOpenapi =
    typeof artifacts?.openapiYaml === 'string' && artifacts.openapiYaml.trim()
      ? artifacts.openapiYaml
      : `openapi: 3.1.0\ninfo:\n  title: ${blueprintName} API\n  version: 1.0.0\npaths: {}\n`;

  const safeRfc =
    typeof artifacts?.executiveRfcMd === 'string' &&
    artifacts.executiveRfcMd.trim()
      ? artifacts.executiveRfcMd
      : `# Technical Architecture RFC: ${blueprintName}\n\n## Overview\nCompiled production specification.\n`;

  return {
    schemaSql: safeSql,
    dockerComposeYml: safeDocker,
    openapiYaml: safeOpenapi,
    executiveRfcMd: safeRfc,
  };
}

/**
 * Deterministically self-heals LLM graph outputs: deduplicates node/edge IDs,
 * clamps invalid latencies/costs/capacities/scores, strips self-loops, and repairs
 * hallucinated targetNodeId references so rendering and simulation never fail.
 */
export function sanitizeGraphReferences(
  rawNodes: ArchNode[] | undefined | null,
  rawEdges: ArchEdge[] | undefined | null,
  rawAudit: Partial<MultiAgentAudit> | undefined | null
): {
  nodes: ArchNode[];
  edges: ArchEdge[];
  audit: MultiAgentAudit;
} {
  const seenNodeIds = new Set<string>();
  const sanitizedNodes: ArchNode[] = [];

  const inputNodes = Array.isArray(rawNodes) ? rawNodes : [];
  inputNodes.forEach((n, index) => {
    if (!n || typeof n !== 'object') return;
    const baseId =
      typeof n.id === 'string' && n.id.trim()
        ? n.id.trim().replace(/\s+/g, '-').toLowerCase()
        : `node-${index + 1}`;
    let uniqueId = baseId;
    let suffix = 2;
    while (seenNodeIds.has(uniqueId)) {
      uniqueId = `${baseId}-${suffix}`;
      suffix += 1;
    }
    seenNodeIds.add(uniqueId);

    const tier: ArchTier = VALID_TIERS.includes(n.tier) ? n.tier : 'compute';
    const scalingModel: ScalingModel = VALID_SCALING.includes(n.scalingModel)
      ? n.scalingModel
      : 'Horizontal Auto-Scale';
    const spofRisk: SpofRisk = VALID_SPOF.includes(n.spofRisk)
      ? n.spofRisk
      : 'LOW';
    const costCategory: CostCategory = VALID_COST_CATS.includes(n.costCategory)
      ? n.costCategory
      : 'compute';

    sanitizedNodes.push({
      id: uniqueId,
      label:
        typeof n.label === 'string' && n.label.trim()
          ? n.label.trim()
          : `Service ${index + 1}`,
      tier,
      technology:
        typeof n.technology === 'string' && n.technology.trim()
          ? n.technology.trim()
          : 'Managed Cloud Service',
      justification:
        typeof n.justification === 'string' && n.justification.trim()
          ? n.justification.trim()
          : 'Core domain workload component.',
      scalingModel,
      spofRisk,
      baseLatencyMs: clampFinite(n.baseLatencyMs, 0.2, 5000, 6.0),
      baseMonthlyCostUsd: Math.round(
        clampFinite(n.baseMonthlyCostUsd, 10, 500_000, 750)
      ),
      maxCapacityRps: Math.round(
        clampFinite(n.maxCapacityRps, 50, 5_000_000, 15_000)
      ),
      costCategory,
      isStateful: Boolean(n.isStateful),
      replicas: Math.round(clampFinite(n.replicas, 1, 128, 3)),
      failureDomain:
        typeof n.failureDomain === 'string' && n.failureDomain.trim()
          ? n.failureDomain.trim()
          : 'Multi-AZ Cluster',
    });
  });

  if (sanitizedNodes.length === 0) {
    sanitizedNodes.push({
      id: 'core-api-service',
      label: 'Core API Service',
      tier: 'compute',
      technology: 'Containerized Microservice',
      justification: 'Fallback service synthesized due to empty node list.',
      scalingModel: 'Horizontal Auto-Scale',
      spofRisk: 'LOW',
      baseLatencyMs: 8.5,
      baseMonthlyCostUsd: 850,
      maxCapacityRps: 20000,
      costCategory: 'compute',
      isStateful: false,
      replicas: 3,
      failureDomain: 'Multi-AZ Compute',
    });
    seenNodeIds.add('core-api-service');
  }

  const fallbackNodeId = sanitizedNodes[0].id;

  const seenEdgeIds = new Set<string>();
  const seenEdgePairs = new Set<string>();
  const validEdges: ArchEdge[] = [];

  const inputEdges = Array.isArray(rawEdges) ? rawEdges : [];
  inputEdges.forEach((e, idx) => {
    if (!e || typeof e !== 'object') return;
    if (!seenNodeIds.has(e.source) || !seenNodeIds.has(e.target)) return;
    if (e.source === e.target) return;

    const protocol: ProtocolType = VALID_PROTOCOLS.includes(e.protocol)
      ? e.protocol
      : 'HTTPS';
    const pairKey = `${e.source}->${e.target}:${protocol}`;
    if (seenEdgePairs.has(pairKey)) return;
    seenEdgePairs.add(pairKey);

    const baseEdgeId =
      typeof e.id === 'string' && e.id.trim() ? e.id.trim() : `e-${idx + 1}`;
    let uniqueEdgeId = baseEdgeId;
    let suffix = 2;
    while (seenEdgeIds.has(uniqueEdgeId)) {
      uniqueEdgeId = `${baseEdgeId}-${suffix}`;
      suffix += 1;
    }
    seenEdgeIds.add(uniqueEdgeId);

    validEdges.push({
      id: uniqueEdgeId,
      source: e.source,
      target: e.target,
      protocol,
      label:
        typeof e.label === 'string' && e.label.trim()
          ? e.label.trim()
          : protocol,
      isAsync: Boolean(e.isAsync),
      encrypted: e.encrypted !== false,
    });
  });

  const rawFindings = Array.isArray(rawAudit?.findings)
    ? rawAudit.findings
    : [];
  const sanitizedFindings = rawFindings
    .filter((f) => Boolean(f && typeof f === 'object'))
    .map((f, idx) => ({
      id:
        typeof f.id === 'string' && f.id.trim()
          ? f.id.trim()
          : `finding-${idx + 1}`,
      persona: VALID_PERSONAS.includes(f.persona) ? f.persona : 'sre',
      severity: VALID_SEVERITIES.includes(f.severity) ? f.severity : 'WARNING',
      title:
        typeof f.title === 'string' && f.title.trim()
          ? f.title.trim()
          : 'Architectural Trade-off Identified',
      analysis:
        typeof f.analysis === 'string' && f.analysis.trim()
          ? f.analysis.trim()
          : 'Component requires engineering review under peak load.',
      recommendation:
        typeof f.recommendation === 'string' && f.recommendation.trim()
          ? f.recommendation.trim()
          : 'Harden redundancy and enforce strict timeouts.',
      targetNodeId: seenNodeIds.has(f.targetNodeId)
        ? f.targetNodeId
        : fallbackNodeId,
      estimatedImpact:
        typeof f.estimatedImpact === 'string' && f.estimatedImpact.trim()
          ? f.estimatedImpact.trim()
          : 'Improves availability and tail latency stability',
    }));

  return {
    nodes: sanitizedNodes,
    edges: validEdges,
    audit: {
      securityScore: Math.round(
        clampFinite(rawAudit?.securityScore, 0, 100, 75)
      ),
      resilienceScore: Math.round(
        clampFinite(rawAudit?.resilienceScore, 0, 100, 75)
      ),
      costEfficiencyScore: Math.round(
        clampFinite(rawAudit?.costEfficiencyScore, 0, 100, 75)
      ),
      executiveSummary:
        typeof rawAudit?.executiveSummary === 'string' &&
        rawAudit.executiveSummary.trim()
          ? rawAudit.executiveSummary.trim()
          : 'Automated multi-agent review completed across Security, SRE, and FinOps dimensions.',
      findings: sanitizedFindings,
    },
  };
}

export function isValidBlueprint(bp: unknown): bp is ArchitectureBlueprint {
  if (!bp || typeof bp !== 'object') return false;
  const candidate = bp as Partial<ArchitectureBlueprint>;
  if (typeof candidate.id !== 'string' || !candidate.id) return false;
  if (typeof candidate.name !== 'string' || !candidate.name) return false;
  if (!Array.isArray(candidate.versions) || candidate.versions.length === 0) {
    return false;
  }
  const hasValidVersions = candidate.versions.every(
    (v) =>
      v &&
      typeof v.versionId === 'string' &&
      Array.isArray(v.nodes) &&
      v.nodes.length > 0 &&
      Array.isArray(v.edges) &&
      v.audit &&
      typeof v.audit === 'object' &&
      v.artifacts &&
      typeof v.artifacts === 'object'
  );
  return hasValidVersions && Boolean(candidate.defaultSimulation);
}

export function loadPersistedBlueprints(): ArchitectureBlueprint[] {
  try {
    const raw = localStorage.getItem(BLUEPRINTS_STORAGE_KEY);
    if (!raw) return DEMO_BLUEPRINTS;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEMO_BLUEPRINTS;

    const validPersisted = parsed.filter(isValidBlueprint);
    if (validPersisted.length === 0) return DEMO_BLUEPRINTS;

    const existingIds = new Set(validPersisted.map((b) => b.id));
    const merged = [...validPersisted];
    for (const demo of DEMO_BLUEPRINTS) {
      if (!existingIds.has(demo.id)) {
        merged.push(demo);
      }
    }
    return merged;
  } catch {
    return DEMO_BLUEPRINTS;
  }
}

export function savePersistedBlueprints(
  blueprints: ArchitectureBlueprint[]
): void {
  try {
    localStorage.setItem(BLUEPRINTS_STORAGE_KEY, JSON.stringify(blueprints));
  } catch {
    // Ignore storage quota limits in restricted environments
  }
}

export function loadCompilerSettings(): CompilerSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_COMPILER_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<CompilerSettings>;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_COMPILER_SETTINGS;
    return {
      geminiModel:
        parsed.geminiModel === 'gemini-2.5-flash' ||
        parsed.geminiModel === 'gemini-2.5-pro'
          ? parsed.geminiModel
          : DEFAULT_COMPILER_SETTINGS.geminiModel,
      customApiKey:
        typeof parsed.customApiKey === 'string' ? parsed.customApiKey : '',
      thinkingLevel:
        parsed.thinkingLevel === 'LOW' ||
        parsed.thinkingLevel === 'MEDIUM' ||
        parsed.thinkingLevel === 'HIGH' ||
        parsed.thinkingLevel === 'XHIGH'
          ? parsed.thinkingLevel
          : DEFAULT_COMPILER_SETTINGS.thinkingLevel,
      compliancePreset:
        parsed.compliancePreset === 'PCI_DSS' ||
        parsed.compliancePreset === 'HIPAA' ||
        parsed.compliancePreset === 'SOC2_ISO27001' ||
        parsed.compliancePreset === 'GENERAL'
          ? parsed.compliancePreset
          : DEFAULT_COMPILER_SETTINGS.compliancePreset,
      cloudProfile:
        parsed.cloudProfile === 'aws' ||
        parsed.cloudProfile === 'gcp' ||
        parsed.cloudProfile === 'hybrid'
          ? parsed.cloudProfile
          : DEFAULT_COMPILER_SETTINGS.cloudProfile,
      autoFitOnCompile:
        typeof parsed.autoFitOnCompile === 'boolean'
          ? parsed.autoFitOnCompile
          : true,
    };
  } catch {
    return DEFAULT_COMPILER_SETTINGS;
  }
}

export function saveCompilerSettings(settings: CompilerSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota limits
  }
}

function buildGeminiHeaders(
  customApiKey?: string,
  geminiModel?: GeminiModelOption
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const trimmedKey = customApiKey?.trim();
  if (trimmedKey) {
    headers['x-gemini-api-key'] = trimmedKey;
  }
  if (geminiModel) {
    headers['x-gemini-model'] = geminiModel;
  }
  return headers;
}

async function postJsonSafely<T>(
  url: string,
  body: unknown,
  headers: Record<string, string> = { 'Content-Type': 'application/json' },
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const rawText = await response.text();
    let parsed: (T & { error?: string }) | null = null;

    if (rawText.trim()) {
      try {
        parsed = JSON.parse(rawText) as T & { error?: string };
      } catch {
        throw new Error(
          `Server returned non-JSON HTTP ${response.status} (${
            response.statusText || 'Gateway Error'
          }).`
        );
      }
    }

    if (!response.ok || parsed?.error) {
      throw new Error(
        parsed?.error ||
          `Request failed with HTTP ${response.status} (${
            response.statusText || 'Error'
          }).`
      );
    }

    if (!parsed) {
      throw new Error('Server returned an empty response payload.');
    }

    return parsed;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        `Architecture synthesis timed out after ${Math.round(
          timeoutMs / 1000
        )} seconds.`
      );
    }
    throw err;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export async function verifyGeminiApiKey(
  customApiKey: string,
  model: GeminiModelOption
): Promise<KeyVerificationResult> {
  try {
    return await postJsonSafely<KeyVerificationResult>(
      '/api/verify-key',
      { model },
      buildGeminiHeaders(customApiKey, model),
      25_000
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return {
      valid: false,
      configured: Boolean(customApiKey.trim()),
      model,
      keySource: customApiKey.trim() ? 'custom' : 'none',
      latencyMs: 0,
      message: `Unable to verify key (${msg}). Built-in Deterministic Engine remains active.`,
    };
  }
}

export async function compileArchitectureViaGemini(
  prompt: string,
  settings: CompilerSettings
): Promise<ArchitectureBlueprint> {
  let payload: CompileApiResponse;

  try {
    payload = await postJsonSafely<CompileApiResponse>(
      '/api/compile',
      {
        prompt,
        compliancePreset: settings.compliancePreset,
        cloudProfile: settings.cloudProfile,
        thinkingLevel: settings.thinkingLevel,
        model: settings.geminiModel,
      },
      buildGeminiHeaders(settings.customApiKey, settings.geminiModel)
    );
  } catch {
    payload = synthesizeDeterministicBlueprint({
      prompt,
      compliancePreset: settings.compliancePreset,
      cloudProfile: settings.cloudProfile,
    });
  }

  const safeName =
    typeof payload.name === 'string' && payload.name.trim()
      ? payload.name.trim()
      : 'Compiled System Architecture';

  const sanitized = sanitizeGraphReferences(
    payload.nodes,
    payload.edges,
    payload.audit
  );
  const safeArtifacts = sanitizeArtifacts(payload.artifacts, safeName);
  const engine: SynthesisEngine =
    payload.synthesisEngine === 'deterministic-fallback'
      ? 'deterministic-fallback'
      : 'gemini-live';

  const nowIso = new Date().toISOString();
  const v1: ArchitectureVersion = {
    versionId: 'v1',
    versionLabel: 'v1 · Initial Compiled',
    createdAt: nowIso,
    nodes: sanitized.nodes,
    edges: sanitized.edges,
    audit: sanitized.audit,
    artifacts: safeArtifacts,
    synthesisEngine: engine,
    synthesisModel: payload.synthesisModel,
  };

  return {
    id: `bp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: safeName,
    domainTag:
      typeof payload.domainTag === 'string' && payload.domainTag.trim()
        ? payload.domainTag.trim()
        : `${settings.compliancePreset} · Production`,
    prompt,
    isDemo: false,
    updatedAt: nowIso,
    activeVersionId: 'v1',
    versions: [v1],
    synthesisEngine: engine,
    defaultSimulation: {
      peakRps: Math.round(
        clampFinite(payload.recommendedPeakRps, 10, 100_000, 4500)
      ),
      readRatioPercent: Math.round(
        clampFinite(payload.recommendedReadRatioPercent, 20, 95, 75)
      ),
      payloadSizeKb: Math.round(
        clampFinite(payload.recommendedPayloadSizeKb, 2, 5120, 16)
      ),
      multiRegion: false,
      cloudProfile: settings.cloudProfile,
    },
  };
}

export function computeNextVersionId(versions: ArchitectureVersion[]): string {
  let maxRev = versions.length;
  for (const v of versions) {
    const match = /^v(\d+)$/i.exec(v.versionId.trim());
    if (match) {
      maxRev = Math.max(maxRev, Number(match[1]));
    }
  }
  return `v${maxRev + 1}`;
}

export async function autoHealArchitectureViaGemini(
  blueprint: ArchitectureBlueprint,
  currentVersion: ArchitectureVersion,
  settings: CompilerSettings
): Promise<ArchitectureVersion> {
  let payload: AutoHealApiResponse;

  try {
    payload = await postJsonSafely<AutoHealApiResponse>(
      '/api/auto-heal',
      {
        prompt: blueprint.prompt,
        blueprintName: blueprint.name,
        currentVersion: {
          versionId: currentVersion.versionId,
          nodes: currentVersion.nodes,
          edges: currentVersion.edges,
          audit: currentVersion.audit,
        },
        compliancePreset: settings.compliancePreset,
        cloudProfile: settings.cloudProfile,
        thinkingLevel: settings.thinkingLevel,
        model: settings.geminiModel,
      },
      buildGeminiHeaders(settings.customApiKey, settings.geminiModel)
    );
  } catch {
    payload = synthesizeDeterministicAutoHeal({
      prompt: blueprint.prompt,
      blueprintName: blueprint.name,
      currentVersion,
      compliancePreset: settings.compliancePreset,
      cloudProfile: settings.cloudProfile,
    });
  }

  const sanitized = sanitizeGraphReferences(
    payload.nodes,
    payload.edges,
    payload.audit
  );
  const safeArtifacts = sanitizeArtifacts(payload.artifacts, blueprint.name);
  const versionId = computeNextVersionId(blueprint.versions);
  const engine: SynthesisEngine =
    payload.synthesisEngine === 'deterministic-fallback'
      ? 'deterministic-fallback'
      : 'gemini-live';

  const rawDiff = payload.diffFromPrevious;
  const safeDiff: ArchitectureDiff = {
    addedNodes: Array.isArray(rawDiff?.addedNodes) ? rawDiff.addedNodes : [],
    upgradedProtocols: Array.isArray(rawDiff?.upgradedProtocols)
      ? rawDiff.upgradedProtocols
      : [],
    remediatedRisks: Array.isArray(rawDiff?.remediatedRisks)
      ? rawDiff.remediatedRisks
      : [],
    securityScoreDelta: Math.round(
      clampFinite(
        rawDiff?.securityScoreDelta,
        -100,
        100,
        sanitized.audit.securityScore - currentVersion.audit.securityScore
      )
    ),
    resilienceScoreDelta: Math.round(
      clampFinite(
        rawDiff?.resilienceScoreDelta,
        -100,
        100,
        sanitized.audit.resilienceScore - currentVersion.audit.resilienceScore
      )
    ),
    costEfficiencyScoreDelta: Math.round(
      clampFinite(
        rawDiff?.costEfficiencyScoreDelta,
        -100,
        100,
        sanitized.audit.costEfficiencyScore -
          currentVersion.audit.costEfficiencyScore
      )
    ),
    baseMonthlyCostDeltaUsd: Math.round(
      clampFinite(rawDiff?.baseMonthlyCostDeltaUsd, -200_000, 200_000, 0)
    ),
    summary:
      typeof rawDiff?.summary === 'string' && rawDiff.summary.trim()
        ? rawDiff.summary.trim()
        : 'Synthesized hardened architecture remediating critical security, SRE, and FinOps findings.',
  };

  return {
    versionId,
    versionLabel: `${versionId} · Auto-Healed`,
    createdAt: new Date().toISOString(),
    nodes: sanitized.nodes,
    edges: sanitized.edges,
    audit: sanitized.audit,
    artifacts: safeArtifacts,
    diffFromPrevious: safeDiff,
    synthesisEngine: engine,
    synthesisModel: payload.synthesisModel,
  };
}
