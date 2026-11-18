import type {
  ArchEdge,
  ArchitectureDiff,
  ArchitectureVersion,
  ArchNode,
  AuditFinding,
  MultiAgentAudit,
  ProductionArtifacts,
} from '../types/architecture';

export type DetectedDomainId =
  | 'gaming'
  | 'iot'
  | 'telemedicine'
  | 'fintech'
  | 'ai_rag'
  | 'ecommerce'
  | 'media'
  | 'saas';

export interface DeterministicCompileInput {
  prompt: string;
  compliancePreset?: string;
  cloudProfile?: string;
}

export interface DeterministicCompileOutput {
  name: string;
  domainTag: string;
  detectedDomain: DetectedDomainId;
  recommendedPeakRps: number;
  recommendedReadRatioPercent: number;
  recommendedPayloadSizeKb: number;
  nodes: ArchNode[];
  edges: ArchEdge[];
  audit: MultiAgentAudit;
  artifacts: ProductionArtifacts;
  synthesisEngine: 'deterministic-fallback';
}

export interface DeterministicAutoHealInput {
  prompt: string;
  blueprintName?: string;
  currentVersion: Pick<
    ArchitectureVersion,
    'versionId' | 'nodes' | 'edges' | 'audit'
  > & {
    artifacts?: Partial<ProductionArtifacts>;
  };
  compliancePreset?: string;
  cloudProfile?: string;
}

export interface DeterministicAutoHealOutput {
  nodes: ArchNode[];
  edges: ArchEdge[];
  audit: MultiAgentAudit;
  artifacts: ProductionArtifacts;
  diffFromPrevious: ArchitectureDiff;
  synthesisEngine: 'deterministic-fallback';
}

interface DomainDetectionResult {
  domain: DetectedDomainId;
  title: string;
  domainTag: string;
  peakRps: number;
  readRatioPercent: number;
  payloadSizeKb: number;
}

const DOMAIN_KEYWORDS: Record<DetectedDomainId, readonly string[]> = {
  gaming: [
    'game',
    'gaming',
    'multiplayer',
    'matchmaking',
    'anti-cheat',
    'anticheat',
    'leaderboard',
    'fps',
    'mmorpg',
    'tick',
    'esports',
    'lobby',
    'player',
  ],
  iot: [
    'iot',
    'telemetry',
    'vehicle',
    'vehicles',
    'fleet',
    'mqtt',
    'sensor',
    'sensors',
    'time-series',
    'timeseries',
    'predictive maintenance',
    'scada',
    'industrial',
    'connected devices',
  ],
  telemedicine: [
    'hipaa',
    'telemedicine',
    'telehealth',
    'webrtc',
    'clinical',
    'patient',
    'consultation',
    'consultations',
    'ehr',
    'fhir',
    'medical',
    'hospital',
    'phi',
    'healthcare',
  ],
  fintech: [
    'fintech',
    'payment',
    'payments',
    'ledger',
    'pci',
    'settlement',
    'clearing',
    'trading',
    'exchange',
    'fraud',
    'banking',
    'wallet',
    'remittance',
  ],
  ai_rag: [
    'rag',
    'agent',
    'agentic',
    'llm',
    'vector',
    'embedding',
    'embeddings',
    'inference',
    'copilot',
    'knowledge base',
    'semantic search',
    'genai',
  ],
  ecommerce: [
    'ecommerce',
    'e-commerce',
    'checkout',
    'cart',
    'inventory',
    'flash sale',
    'marketplace',
    'catalog',
    'fulfillment',
    'order',
    'retail',
  ],
  media: [
    'streaming',
    'transcode',
    'transcoding',
    'hls',
    'broadcast',
    'cdn',
    'vod',
    'podcast',
    'creator',
    'social feed',
    'live video',
  ],
  saas: [
    'saas',
    'multi-tenant',
    'b2b',
    'crm',
    'erp',
    'workflow',
    'analytics',
    'collaboration',
    'workspace',
    'billing',
  ],
};

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.round(Math.min(max, Math.max(min, value)));
}

function parseNumericToken(numStr: string, suffix?: string): number {
  const clean = Number(numStr.replace(/,/g, ''));
  if (!Number.isFinite(clean) || clean <= 0) return 0;
  const mult = (suffix ?? '').toLowerCase();
  if (mult === 'k' || mult === 'thousand') return clean * 1_000;
  if (mult === 'm' || mult === 'million') return clean * 1_000_000;
  return clean;
}

function extractTargetRps(prompt: string, defaultRps: number): number {
  const lower = prompt.toLowerCase();

  // 1. Explicit RPS / req/s / QPS / TPS
  const rpsMatch =
    /(\d[\d,.]*)\s*(k|m|thousand|million)?\s*(?:concurrent\s+)?(?:rps|req\/s|requests\/s|qps|tps|events\/s|msg\/s)/i.exec(
      lower
    );
  if (rpsMatch) {
    const parsed = parseNumericToken(rpsMatch[1], rpsMatch[2]);
    if (parsed > 0) return clampInt(parsed, 500, 95_000);
  }

  // 2. Daily consultations / daily events / DAU
  const dailyMatch =
    /(\d[\d,.]*)\s*(k|m|thousand|million)?\s*(?:daily|per\s+day|\/day)/i.exec(
      lower
    );
  if (dailyMatch) {
    const dailyTotal = parseNumericToken(dailyMatch[1], dailyMatch[2]);
    if (dailyTotal > 0) {
      // Peak concurrency + burst multiplier (~6x average RPS + active session telemetry)
      const estimatedPeak = Math.max(1200, Math.round((dailyTotal / 86_400) * 55 + 1500));
      return clampInt(estimatedPeak, 800, 90_000);
    }
  }

  // 3. Connected vehicles / devices / concurrent users / players
  const entityMatch =
    /(\d[\d,.]*)\s*(k|m|thousand|million)?\s*(?:connected\s+)?(?:vehicles|devices|sensors|concurrent\s+players|concurrent\s+users|players|users|tenants)/i.exec(
      lower
    );
  if (entityMatch) {
    const count = parseNumericToken(entityMatch[1], entityMatch[2]);
    if (count > 0) {
      // Assume ~1 heartbeat/event every 10s at fleet scale, or higher for small counts
      const estimated = count >= 50_000 ? Math.round(count * 0.1) : Math.round(count * 0.4);
      return clampInt(Math.max(1500, estimated), 1000, 90_000);
    }
  }

  return defaultRps;
}

function formatComplianceLabel(preset?: string, domain?: DetectedDomainId): string {
  if (domain === 'telemedicine' || preset === 'HIPAA') return 'HIPAA / HITECH';
  if (domain === 'fintech' || preset === 'PCI_DSS') return 'PCI-DSS Level 1';
  if (preset === 'GENERAL') return 'Production Cloud SLA';
  return 'SOC2 Type II';
}

function buildTailoredTitle(prompt: string, fallbackTitle: string): string {
  const cleaned = prompt
    .trim()
    .replace(/^(design|build|architect|compile|create)\s+(a|an|the)\s+/i, '')
    .replace(/\s+for\s+\d.*$/i, '')
    .replace(/\s+at\s+\d.*$/i, '')
    .replace(/\s+with\s+\d.*$/i, '')
    .replace(/[.?!]+$/, '')
    .trim();

  if (cleaned.length >= 14 && cleaned.length <= 72) {
    return cleaned
      .split(/\s+/)
      .map((word) => {
        if (/^(ai|iot|rag|hipaa|pci|fps|webrtc|api|cdn|sql|llm|saas|b2b|hls)$/i.test(word)) {
          return word.toUpperCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }
  return fallbackTitle;
}

export function detectPromptDomainAndScale(
  prompt: string,
  compliancePreset = 'SOC2_ISO27001'
): DomainDetectionResult {
  const lower = prompt.toLowerCase();

  let bestDomain: DetectedDomainId = 'saas';
  let bestScore = 0;

  (Object.keys(DOMAIN_KEYWORDS) as DetectedDomainId[]).forEach((domain) => {
    let score = 0;
    for (const kw of DOMAIN_KEYWORDS[domain]) {
      if (lower.includes(kw)) {
        score += kw.includes(' ') ? 3 : 2;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  });

  if (bestScore === 0) {
    if (compliancePreset === 'HIPAA') bestDomain = 'telemedicine';
    else if (compliancePreset === 'PCI_DSS') bestDomain = 'fintech';
  }

  const defaults: Record<
    DetectedDomainId,
    {
      fallbackTitle: string;
      tagSuffix: string;
      rps: number;
      readRatio: number;
      payloadKb: number;
    }
  > = {
    gaming: {
      fallbackTitle: 'Global Multiplayer Matchmaking & Anti-Cheat Engine',
      tagSuffix: 'Low-Latency Gaming & Matchmaking',
      rps: 45_000,
      readRatio: 55,
      payloadKb: 8,
    },
    iot: {
      fallbackTitle: 'Connected Fleet IoT Telemetry & Predictive Maintenance',
      tagSuffix: 'MQTT Stream & Time-Series IoT',
      rps: 25_000,
      readRatio: 30,
      payloadKb: 6,
    },
    telemedicine: {
      fallbackTitle: 'HIPAA Telemedicine WebRTC & Clinical AI Platform',
      tagSuffix: 'Zero-PHI Leak Clinical Media',
      rps: 3_800,
      readRatio: 65,
      payloadKb: 32,
    },
    fintech: {
      fallbackTitle: 'High-Frequency Clearing & Double-Entry Ledger',
      tagSuffix: 'ACID Clearing & Real-Time Risk',
      rps: 12_000,
      readRatio: 60,
      payloadKb: 12,
    },
    ai_rag: {
      fallbackTitle: 'Enterprise Multi-Tenant RAG & Agentic Orchestrator',
      tagSuffix: 'Tenant-Isolated Hybrid AI',
      rps: 4_500,
      readRatio: 78,
      payloadKb: 28,
    },
    ecommerce: {
      fallbackTitle: 'Global Flash-Sale Commerce & Inventory Reservation',
      tagSuffix: 'High-Concurrency Checkout',
      rps: 22_000,
      readRatio: 80,
      payloadKb: 18,
    },
    media: {
      fallbackTitle: 'Global Live Video Transcoding & Edge Distribution',
      tagSuffix: 'Adaptive Bitrate Media Pipeline',
      rps: 30_000,
      readRatio: 88,
      payloadKb: 64,
    },
    saas: {
      fallbackTitle: 'Multi-Tenant Enterprise Cloud Control Plane',
      tagSuffix: 'Multi-Region SaaS Architecture',
      rps: 8_500,
      readRatio: 75,
      payloadKb: 16,
    },
  };

  const cfg = defaults[bestDomain];
  const peakRps = extractTargetRps(prompt, cfg.rps);
  const complianceLabel = formatComplianceLabel(compliancePreset, bestDomain);

  return {
    domain: bestDomain,
    title: buildTailoredTitle(prompt, cfg.fallbackTitle),
    domainTag: `${complianceLabel} · ${cfg.tagSuffix}`,
    peakRps,
    readRatioPercent: cfg.readRatio,
    payloadSizeKb: cfg.payloadKb,
  };
}

function scaleCapacity(baseCap: number, targetPeakRps: number, nominalRps: number): number {
  const ratio = Math.max(0.5, Math.min(4.5, targetPeakRps / Math.max(1000, nominalRps)));
  return Math.round((baseCap * ratio) / 100) * 100;
}

function buildDomainTopology(
  domain: DetectedDomainId,
  peakRps: number
): {
  nodes: ArchNode[];
  edges: ArchEdge[];
  audit: MultiAgentAudit;
  sqlTables: string;
  openapiPaths: string;
} {
  if (domain === 'gaming') {
    const cap = (n: number) => scaleCapacity(n, peakRps, 45_000);
    const nodes: ArchNode[] = [
      {
        id: 'anycast-ddos-edge',
        label: 'Anycast UDP/TCP DDoS Shield',
        tier: 'edge',
        technology: 'Cloudflare Spectrum + eBPF XDP Filter',
        justification: 'Absorbs volumetric UDP amplification attacks and routes player packets via nearest PoP.',
        scalingModel: 'Global Edge Anycast',
        spofRisk: 'NONE',
        baseLatencyMs: 1.8,
        baseMonthlyCostUsd: 1150,
        maxCapacityRps: cap(140_000),
        costCategory: 'network',
        isStateful: false,
        replicas: 16,
        failureDomain: 'Global Anycast Edge PoPs',
      },
      {
        id: 'session-auth-gateway',
        label: 'Player Session & Fleet Gateway',
        tier: 'gateway',
        technology: 'Envoy + Agones Session Router',
        justification: 'Terminates player WebSocket/gRPC auth tokens and assigns regional game-server tickets.',
        scalingModel: 'Horizontal Auto-Scale',
        spofRisk: 'LOW',
        baseLatencyMs: 3.4,
        baseMonthlyCostUsd: 1420,
        maxCapacityRps: cap(85_000),
        costCategory: 'compute',
        isStateful: false,
        replicas: 8,
        failureDomain: '3-AZ Ingress Fleet',
      },
      {
        id: 'mmr-matchmaker',
        label: 'Skill-Based MMR Matchmaker',
        tier: 'compute',
        technology: 'Rust + OpenMatch (Kubernetes)',
        justification: 'Computes sub-10ms ELO/Glicko-2 skill brackets and party latency constraints.',
        scalingModel: 'Horizontal Auto-Scale',
        spofRisk: 'LOW',
        baseLatencyMs: 6.2,
        baseMonthlyCostUsd: 2180,
        maxCapacityRps: cap(70_000),
        costCategory: 'compute',
        isStateful: false,
        replicas: 8,
        failureDomain: '3-AZ Compute Pool',
      },
      {
        id: 'anticheat-analyzer',
        label: 'Inline Anti-Cheat Telemetry Scorer',
        tier: 'compute',
        technology: 'C++20 SIMD + ONNX Inference Pods',
        justification: 'Evaluates movement kinematics and aim-vector anomalies in real time.',
        scalingModel: 'Horizontal Auto-Scale',
        spofRisk: 'MODERATE',
        baseLatencyMs: 14.5,
        baseMonthlyCostUsd: 2890,
        maxCapacityRps: cap(42_000),
        costCategory: 'ai_queue',
        isStateful: false,
        replicas: 2,
        failureDomain: '2-AZ GPU/SIMD Workers',
      },
      {
        id: 'telemetry-kafka-bus',
        label: 'Combat & Telemetry Event Bus',
        tier: 'messaging',
        technology: 'Redpanda / Kafka (3-Broker NVMe)',
        justification: 'Buffers high-velocity tick telemetry, match replays, and anti-cheat audit streams.',
        scalingModel: 'Partitioned Cluster',
        spofRisk: 'LOW',
        baseLatencyMs: 4.1,
        baseMonthlyCostUsd: 1640,
        maxCapacityRps: cap(110_000),
        costCategory: 'ai_queue',
        isStateful: true,
        replicas: 3,
        failureDomain: '3-AZ Partition Quorum',
      },
      {
        id: 'leaderboard-redis-spof',
        label: 'Global Leaderboard & Lobby State',
        tier: 'storage',
        technology: 'Redis 7.4 Single-Primary Sorted Sets',
        justification: 'Maintains real-time ZSET player rankings and ephemeral party lobby state.',
        scalingModel: 'Vertical Primary-Replica',
        spofRisk: 'CRITICAL',
        baseLatencyMs: 2.6,
        baseMonthlyCostUsd: 1580,
        maxCapacityRps: cap(38_000),
        costCategory: 'storage',
        isStateful: true,
        replicas: 1,
        failureDomain: 'Single Primary Node (us-east-1a)',
      },
      {
        id: 'player-inventory-db',
        label: 'Player Progression & Economy DB',
        tier: 'storage',
        technology: 'PostgreSQL 17 Primary + Read Replica',
        justification: 'Stores ACID cosmetic entitlements, battle-pass progression, and ban ledgers.',
        scalingModel: 'Vertical Primary-Replica',
        spofRisk: 'MODERATE',
        baseLatencyMs: 11.4,
        baseMonthlyCostUsd: 2150,
        maxCapacityRps: cap(34_000),
        costCategory: 'storage',
        isStateful: true,
        replicas: 2,
        failureDomain: 'Primary + Async Standby',
      },
    ];

    const edges: ArchEdge[] = [
      { id: 'e1', source: 'anycast-ddos-edge', target: 'session-auth-gateway', protocol: 'WebSocket', label: 'WSS Lobby Stream', isAsync: false, encrypted: true },
      { id: 'e2', source: 'session-auth-gateway', target: 'mmr-matchmaker', protocol: 'gRPC', label: 'Match Ticket RPC', isAsync: false, encrypted: true },
      { id: 'e3', source: 'session-auth-gateway', target: 'anticheat-analyzer', protocol: 'gRPC', label: 'Tick Kinematics', isAsync: false, encrypted: false },
      { id: 'e4', source: 'mmr-matchmaker', target: 'leaderboard-redis-spof', protocol: 'Redis RESP', label: 'ZADD Rank / Lobby', isAsync: false, encrypted: true },
      { id: 'e5', source: 'mmr-matchmaker', target: 'player-inventory-db', protocol: 'SQL', label: 'MMR & Loadout', isAsync: false, encrypted: true },
      { id: 'e6', source: 'anticheat-analyzer', target: 'telemetry-kafka-bus', protocol: 'Kafka', label: 'Anomaly Events', isAsync: true, encrypted: true },
      { id: 'e7', source: 'telemetry-kafka-bus', target: 'player-inventory-db', protocol: 'SQL', label: 'Match Settlement', isAsync: true, encrypted: true },
    ];

    const findings: AuditFinding[] = [
      {
        id: 'game-sre-1',
        persona: 'sre',
        severity: 'CRITICAL',
        title: 'Single-Primary Redis Leaderboard & Lobby Store Is a Global SPOF',
        analysis: 'Losing leaderboard-redis-spof drops active matchmaking queues and party state for all connected players simultaneously.',
        recommendation: 'Migrate to a 6-node multi-AZ Redis Cluster with hash-tag sharding and automatic Raft/Sentinel failover.',
        targetNodeId: 'leaderboard-redis-spof',
        estimatedImpact: 'Eliminates lobby wipeouts; raises state ceiling 3.2x',
      },
      {
        id: 'game-sec-1',
        persona: 'security',
        severity: 'CRITICAL',
        title: 'Unencrypted East-West gRPC Telemetry Between Gateway & Anti-Cheat',
        analysis: 'Plaintext internal gRPC frames expose player session tokens and anti-cheat heuristic thresholds to lateral pod sniffing.',
        recommendation: 'Enforce SPIFFE/SPIRE short-lived mTLS workload certificates across all gateway-to-compute gRPC channels.',
        targetNodeId: 'anticheat-analyzer',
        estimatedImpact: 'Closes lateral replay & cheat-signature extraction vector',
      },
      {
        id: 'game-sre-2',
        persona: 'sre',
        severity: 'WARNING',
        title: '2-Replica Anti-Cheat Scorer Saturates During Tournament Bursts',
        analysis: 'Synchronous kinematics scoring with only 2 replicas creates tail-latency spikes above 42k RPS.',
        recommendation: 'Decouple heavy ML replay verification onto async worker pools and auto-scale inline INT8 SIMD pods across 3 AZs.',
        targetNodeId: 'anticheat-analyzer',
        estimatedImpact: '-44% P99 matchmaking latency during season launches',
      },
      {
        id: 'game-fin-1',
        persona: 'finops',
        severity: 'OPTIMIZATION',
        title: 'On-Demand Compute Allocation on Stateless Matchmaker Fleet',
        analysis: 'Player concurrency follows strong diurnal peaks; fixed on-demand compute overpays during off-peak hours.',
        recommendation: 'Adopt 70% Graviton4 Spot + 30% Savings Plan mix with Agones predictive warm-buffer scaling.',
        targetNodeId: 'mmr-matchmaker',
        estimatedImpact: 'Saves ~$740/mo (-34% compute spend)',
      },
    ];

    return {
      nodes,
      edges,
      audit: {
        securityScore: 67,
        resilienceScore: 58,
        costEfficiencyScore: 74,
        executiveSummary:
          'Sub-25ms matchmaking pipeline is well-tiered with Rust/Envoy, but single-primary Redis lobby state and unencrypted anti-cheat gRPC introduce critical tournament-scale risks.',
        findings,
      },
      sqlTables: `CREATE TABLE player_profiles (
  player_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_handle VARCHAR(64) NOT NULL UNIQUE,
  mmr_rating INTEGER NOT NULL DEFAULT 1200,
  trust_score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  region_code VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE matchmaking_tickets (
  ticket_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES player_profiles(player_id),
  playlist_id VARCHAR(48) NOT NULL,
  party_size SMALLINT NOT NULL DEFAULT 1,
  target_mmr INTEGER NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'QUEUED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tickets_playlist_mmr ON matchmaking_tickets (playlist_id, status, target_mmr);

CREATE TABLE anticheat_flags (
  flag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES player_profiles(player_id),
  match_id UUID NOT NULL,
  anomaly_score NUMERIC(5,4) NOT NULL,
  telemetry_digest BYTEA NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (detected_at);`,
      openapiPaths: `  /v1/matchmaking/tickets:
    post:
      summary: Enqueue party for skill-based matchmaking
      operationId: createMatchTicket
      responses:
        '201':
          description: Ticket queued with estimated wait window
  /v1/leaderboards/{seasonId}:
    get:
      summary: Query top ranked players and caller percentile
      operationId: getSeasonLeaderboard
      parameters:
        - name: seasonId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Ranked leaderboard page`,
    };
  }

  if (domain === 'iot') {
    const cap = (n: number) => scaleCapacity(n, peakRps, 25_000);
    const nodes: ArchNode[] = [
      {
        id: 'iot-anycast-lb',
        label: 'Global mTLS MQTT Edge NLB',
        tier: 'edge',
        technology: 'AWS NLB + Cloudflare IoT Spectrum',
        justification: 'Terminates millions of persistent cellular MQTT-over-TLS 1.3 vehicle connections.',
        scalingModel: 'Global Edge Anycast',
        spofRisk: 'NONE',
        baseLatencyMs: 2.4,
        baseMonthlyCostUsd: 980,
        maxCapacityRps: cap(95_000),
        costCategory: 'network',
        isStateful: false,
        replicas: 12,
        failureDomain: 'Multi-Region Anycast Edge',
      },
      {
        id: 'emqx-mqtt-gateway',
        label: 'MQTT 5.0 Broker & Device Auth',
        tier: 'gateway',
        technology: 'EMQX Enterprise Cluster + X.509 CRL',
        justification: 'Validates per-vehicle TPM client certificates and multiplexes QoS-1 telemetry topics.',
        scalingModel: 'Partitioned Cluster',
        spofRisk: 'LOW',
        baseLatencyMs: 4.8,
        baseMonthlyCostUsd: 1650,
        maxCapacityRps: cap(60_000),
        costCategory: 'compute',
        isStateful: true,
        replicas: 4,
        failureDomain: '3-AZ Broker Mesh',
      },
      {
        id: 'stream-ingestor',
        label: 'CAN-Bus Telemetry Normalizer',
        tier: 'compute',
        technology: 'Apache Flink + Go 1.24 Consumers',
        justification: 'Decodes Protobuf vehicle CAN frames, deduplicates retries, and computes rolling window aggregates.',
        scalingModel: 'Horizontal Auto-Scale',
        spofRisk: 'LOW',
        baseLatencyMs: 7.5,
        baseMonthlyCostUsd: 1920,
        maxCapacityRps: cap(52_000),
        costCategory: 'compute',
        isStateful: false,
        replicas: 6,
        failureDomain: '3-AZ Stateful Stream Pool',
      },
      {
        id: 'predictive-ml-engine',
        label: 'Predictive Maintenance Anomaly Engine',
        tier: 'compute',
        technology: 'Python Ray + LightGBM / ONNX Workers',
        justification: 'Scores battery thermal drift, inverter harmonics, and brake wear probabilities.',
        scalingModel: 'Horizontal Auto-Scale',
        spofRisk: 'MODERATE',
        baseLatencyMs: 16.2,
        baseMonthlyCostUsd: 2450,
        maxCapacityRps: cap(26_000),
        costCategory: 'ai_queue',
        isStateful: false,
        replicas: 2,
        failureDomain: '2-AZ Inference Pool',
      },
      {
        id: 'iot-kafka-backbone',
        label: 'Telemetry Ingestion Log',
        tier: 'messaging',
        technology: 'Apache Kafka (MSK Tiered Storage)',
        justification: 'Provides durable replayable commit log decoupling bursty cellular reconnect storms from storage.',
        scalingModel: 'Partitioned Cluster',
        spofRisk: 'LOW',
        baseLatencyMs: 5.2,
        baseMonthlyCostUsd: 1790,
        maxCapacityRps: cap(75_000),
        costCategory: 'ai_queue',
        isStateful: true,
        replicas: 3,
        failureDomain: '3-AZ Broker Quorum',
      },
      {
        id: 'timeseries-primary-spof',
        label: 'Time-Series Telemetry Historian',
        tier: 'storage',
        technology: 'TimescaleDB Single-Writer Instance',
        justification: 'Stores high-cardinality sensor hypertables and downsampled fleet health rollups.',
        scalingModel: 'Vertical Primary-Replica',
        spofRisk: 'CRITICAL',
        baseLatencyMs: 15.8,
        baseMonthlyCostUsd: 2680,
        maxCapacityRps: cap(21_000),
        costCategory: 'storage',
        isStateful: true,
        replicas: 1,
        failureDomain: 'Single Writer Instance (AZ-1)',
      },
      {
        id: 'cold-parquet-lake',
        label: 'Raw Telemetry Parquet Lake',
        tier: 'storage',
        technology: 'Amazon S3 + Apache Iceberg',
        justification: 'Retains compressed historical fleet drive cycles for ML model retraining and compliance.',
        scalingModel: 'Serverless Elastic',
        spofRisk: 'NONE',
        baseLatencyMs: 18.0,
        baseMonthlyCostUsd: 620,
        maxCapacityRps: cap(80_000),
        costCategory: 'storage',
        isStateful: true,
        replicas: 6,
        failureDomain: '11-Nines Regional Object Store',
      },
    ];

    const edges: ArchEdge[] = [
      { id: 'e1', source: 'iot-anycast-lb', target: 'emqx-mqtt-gateway', protocol: 'HTTPS', label: 'MQTT/TLS 1.3', isAsync: false, encrypted: true },
      { id: 'e2', source: 'emqx-mqtt-gateway', target: 'iot-kafka-backbone', protocol: 'Kafka', label: 'QoS-1 Frames', isAsync: true, encrypted: true },
      { id: 'e3', source: 'iot-kafka-backbone', target: 'stream-ingestor', protocol: 'Kafka', label: 'Partition Stream', isAsync: true, encrypted: true },
      { id: 'e4', source: 'stream-ingestor', target: 'timeseries-primary-spof', protocol: 'SQL', label: 'Batch Hypertable Copy', isAsync: false, encrypted: true },
      { id: 'e5', source: 'stream-ingestor', target: 'predictive-ml-engine', protocol: 'gRPC', label: 'Window Features', isAsync: false, encrypted: false },
      { id: 'e6', source: 'predictive-ml-engine', target: 'timeseries-primary-spof', protocol: 'SQL', label: 'Maintenance Alerts', isAsync: false, encrypted: true },
      { id: 'e7', source: 'iot-kafka-backbone', target: 'cold-parquet-lake', protocol: 'S3 API', label: 'Iceberg Compaction', isAsync: true, encrypted: true },
    ];

    const findings: AuditFinding[] = [
      {
        id: 'iot-sre-1',
        persona: 'sre',
        severity: 'CRITICAL',
        title: 'Single-Writer TimescaleDB Historian Saturates Under Write-Heavy Cellular Bursts',
        analysis: '70%+ write ratio from connected vehicles overwhelms single-node WAL locks during regional cellular reconnect storms.',
        recommendation: 'Migrate hot time-series ingestion to a sharded ClickHouse / multi-node Timescale distributed cluster with replicated Keeper quorum.',
        targetNodeId: 'timeseries-primary-spof',
        estimatedImpact: 'Eliminates write SPOF; increases ingest ceiling 3.5x',
      },
      {
        id: 'iot-sec-1',
        persona: 'security',
        severity: 'CRITICAL',
        title: 'Missing OCSP Stapling & Plaintext East-West Feature RPC',
        analysis: 'Compromised edge gateways cannot be revoked sub-minute without cached CRL/OCSP checks, and Flink->ML gRPC lacks mTLS.',
        recommendation: 'Add Redis-backed hardware certificate revocation cache at EMQX ingress and enforce SPIFFE mTLS on internal gRPC.',
        targetNodeId: 'emqx-mqtt-gateway',
        estimatedImpact: 'Sub-second stolen-device quarantine + zero-trust east-west',
      },
      {
        id: 'iot-sre-2',
        persona: 'sre',
        severity: 'WARNING',
        title: 'Predictive ML Worker Pool Lacks Backpressure Isolation',
        analysis: 'Only 2 inference replicas process synchronous gRPC feature windows, risking Flink checkpoint stalls.',
        recommendation: 'Auto-scale stateless ONNX workers across 3 AZs and emit alerts asynchronously via Kafka.',
        targetNodeId: 'predictive-ml-engine',
        estimatedImpact: 'Prevents stream consumer lag under fleet spike',
      },
      {
        id: 'iot-fin-1',
        persona: 'finops',
        severity: 'OPTIMIZATION',
        title: 'High Hot-SSD Retention Cost on Time-Series Historian',
        analysis: 'Retaining 90 days of raw 10Hz vehicle frames on provisioned IOPS SSD inflates storage spend.',
        recommendation: 'Enforce 7-day hot NVMe TTL with automated zstd downsampling to S3 Iceberg.',
        targetNodeId: 'timeseries-primary-spof',
        estimatedImpact: 'Reduces monthly storage spend by ~$820/mo',
      },
    ];

    return {
      nodes,
      edges,
      audit: {
        securityScore: 69,
        resilienceScore: 59,
        costEfficiencyScore: 73,
        executiveSummary:
          'Kafka-buffered MQTT pipeline cleanly absorbs bursty vehicle telemetry, but single-writer TimescaleDB storage and unrevoked X.509 session caching create critical production bottlenecks.',
        findings,
      },
      sqlTables: `CREATE TABLE registered_vehicles (
  vehicle_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vin VARCHAR(17) NOT NULL UNIQUE,
  tpm_cert_thumbprint CHAR(64) NOT NULL UNIQUE,
  firmware_version VARCHAR(32) NOT NULL,
  fleet_org_id UUID NOT NULL,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vehicle_telemetry_frames (
  vehicle_id UUID NOT NULL REFERENCES registered_vehicles(vehicle_id),
  recorded_at TIMESTAMPTZ NOT NULL,
  speed_kph NUMERIC(5,2) NOT NULL,
  pack_temp_celsius NUMERIC(5,2) NOT NULL,
  soc_percent NUMERIC(5,2) NOT NULL,
   diagnostic_flags INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (vehicle_id, recorded_at)
) PARTITION BY RANGE (recorded_at);

CREATE TABLE predictive_maintenance_alerts (
  alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES registered_vehicles(vehicle_id),
  component_code VARCHAR(48) NOT NULL,
  failure_probability NUMERIC(5,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
      openapiPaths: `  /v1/vehicles/{vehicleId}/telemetry:
    get:
      summary: Query downsampled time-series telemetry window
      operationId: getVehicleTelemetry
      parameters:
        - name: vehicleId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Time-series sensor rollups
  /v1/alerts/predictive:
    get:
      summary: List active high-probability fleet maintenance alerts
      operationId: listPredictiveAlerts
      responses:
        '200':
          description: Prioritized maintenance queue`,
    };
  }

  if (domain === 'telemedicine') {
    const cap = (n: number) => scaleCapacity(n, peakRps, 3_800);
    const nodes: ArchNode[] = [
      {
        id: 'hipaa-edge-waf',
        label: 'HIPAA Edge WAF & TURN Anycast',
        tier: 'edge',
        technology: 'Cloudflare Spectrum + Coturn DTLS-SRTP',
        justification: 'Relays encrypted WebRTC media streams across hospital NAT firewalls with TLS 1.3 enforcement.',
        scalingModel: 'Global Edge Anycast',
        spofRisk: 'NONE',
        baseLatencyMs: 2.9,
        baseMonthlyCostUsd: 890,
        maxCapacityRps: cap(35_000),
        costCategory: 'network',
        isStateful: false,
        replicas: 10,
        failureDomain: 'Global HIPAA BAA Edge',
      },
      {
        id: 'fhir-auth-gateway',
        label: 'SMART-on-FHIR OIDC Gateway',
        tier: 'gateway',
        technology: 'Kong Enterprise + Okta HIPAA OIDC',
        justification: 'Enforces clinician MFA, patient consent scopes, and audit-logged API rate limits.',
        scalingModel: 'Horizontal Auto-Scale',
        spofRisk: 'LOW',
        baseLatencyMs: 4.5,
        baseMonthlyCostUsd: 1120,
        maxCapacityRps: cap(22_000),
        costCategory: 'compute',
        isStateful: false,
        replicas: 4,
        failureDomain: '3-AZ Ingress',
      },
      {
        id: 'webrtc-sfu-cluster',
        label: 'WebRTC Selective Forwarding Unit',
        tier: 'compute',
        technology: 'LiveKit / Mediasoup SFU Fleet',
        justification: 'Routes multi-party HD clinical video/audio tracks and forks encrypted audio to transcription.',
        scalingModel: 'Horizontal Auto-Scale',
        spofRisk: 'LOW',
        baseLatencyMs: 8.4,
        baseMonthlyCostUsd: 2150,
        maxCapacityRps: cap(14_000),
        costCategory: 'compute',
        isStateful: true,
        replicas: 6,
        failureDomain: '3-AZ Media Nodes',
      },
      {
        id: 'clinical-asr-scribe',
        label: 'Real-Time Clinical AI Scribe',
        tier: 'compute',
        technology: 'Whisper-Large-v3 TensorRT + SOAP Summarizer',
        justification: 'Streams sub-second medical speech-to-text and drafts structured ICD-10 / SOAP clinical notes.',
        scalingModel: 'Horizontal Auto-Scale',
        spofRisk: 'MODERATE',
        baseLatencyMs: 24.0,
        baseMonthlyCostUsd: 3280,
        maxCapacityRps: cap(5_200),
        costCategory: 'ai_queue',
        isStateful: false,
        replicas: 2,
        failureDomain: '2-AZ GPU Nodes',
      },
      {
        id: 'hl7-audit-bus',
        label: 'PHI Audit & HL7/FHIR Event Bus',
        tier: 'messaging',
        technology: 'Amazon MSK (HIPAA Encrypted Kafka)',
        justification: 'Streams immutable HIPAA access logs, EHR sync webhooks, and async clinical coding tasks.',
        scalingModel: 'Partitioned Cluster',
        spofRisk: 'LOW',
        baseLatencyMs: 5.1,
        baseMonthlyCostUsd: 1340,
        maxCapacityRps: cap(28_000),
        costCategory: 'ai_queue',
        isStateful: true,
        replicas: 3,
        failureDomain: '3-AZ MSK Cluster',
      },
      {
        id: 'ehr-postgres-spof',
        label: 'Primary Clinical EHR & PHI Store',
        tier: 'storage',
        technology: 'PostgreSQL 17 Single-Primary (KMS Encrypted)',
        justification: 'Stores patient encounters, signed SOAP notes, prescriptions, and FHIR R4 resources.',
        scalingModel: 'Vertical Primary-Replica',
        spofRisk: 'CRITICAL',
        baseLatencyMs: 13.6,
        baseMonthlyCostUsd: 2390,
        maxCapacityRps: cap(4_800),
        costCategory: 'storage',
        isStateful: true,
        replicas: 1,
        failureDomain: 'Single Primary AZ (us-east-1a)',
      },
      {
        id: 'worm-recording-vault',
        label: 'HIPAA WORM Media & Consent Archive',
        tier: 'storage',
        technology: 'S3 Object Lock + Customer-Managed KMS',
        justification: 'Provides 7-year tamper-evident retention for encrypted consultation transcripts and consent PDFs.',
        scalingModel: 'Serverless Elastic',
        spofRisk: 'NONE',
        baseLatencyMs: 16.5,
        baseMonthlyCostUsd: 540,
        maxCapacityRps: cap(40_000),
        costCategory: 'storage',
        isStateful: true,
        replicas: 6,
        failureDomain: 'Multi-AZ Object Lock',
      },
    ];

    const edges: ArchEdge[] = [
      { id: 'e1', source: 'hipaa-edge-waf', target: 'fhir-auth-gateway', protocol: 'HTTPS', label: 'TLS 1.3 FHIR/REST', isAsync: false, encrypted: true },
      { id: 'e2', source: 'hipaa-edge-waf', target: 'webrtc-sfu-cluster', protocol: 'WebSocket', label: 'DTLS-SRTP Media', isAsync: false, encrypted: true },
      { id: 'e3', source: 'fhir-auth-gateway', target: 'ehr-postgres-spof', protocol: 'SQL', label: 'Encounter CRUD', isAsync: false, encrypted: true },
      { id: 'e4', source: 'webrtc-sfu-cluster', target: 'clinical-asr-scribe', protocol: 'gRPC', label: 'PCM Audio Stream', isAsync: false, encrypted: false },
      { id: 'e5', source: 'clinical-asr-scribe', target: 'ehr-postgres-spof', protocol: 'SQL', label: 'SOAP Note Commit', isAsync: false, encrypted: true },
      { id: 'e6', source: 'clinical-asr-scribe', target: 'hl7-audit-bus', protocol: 'Kafka', label: 'PHI Access Audit', isAsync: true, encrypted: true },
      { id: 'e7', source: 'hl7-audit-bus', target: 'worm-recording-vault', protocol: 'S3 API', label: 'WORM Archive', isAsync: true, encrypted: true },
    ];

    const findings: AuditFinding[] = [
      {
        id: 'med-sre-1',
        persona: 'sre',
        severity: 'CRITICAL',
        title: 'Single-AZ PostgreSQL Clinical EHR Store Violates HIPAA Emergency Availability',
        analysis: 'An AZ outage on ehr-postgres-spof halts live patient chart lookups and blocks AI clinical note commits.',
        recommendation: 'Deploy a 3-AZ synchronous Aurora / CockroachDB cluster with PgBouncer pooling and automated sub-15s failover.',
        targetNodeId: 'ehr-postgres-spof',
        estimatedImpact: 'Achieves 99.99% clinical chart availability',
      },
      {
        id: 'med-sec-1',
        persona: 'security',
        severity: 'CRITICAL',
        title: 'Unencrypted East-West Audio Fork & Missing Envelope PHI Redaction',
        analysis: 'Live audio streamed from SFU to Clinical AI Scribe lacks mutual TLS and per-tenant KMS envelope encryption.',
        recommendation: 'Enforce SPIFFE mTLS on gRPC audio streams and insert a PII/PHI tokenizer vault with per-clinic KMS DEKs.',
        targetNodeId: 'clinical-asr-scribe',
        estimatedImpact: 'Eliminates plaintext PHI exposure in transit and GPU memory',
      },
      {
        id: 'med-sre-2',
        persona: 'sre',
        severity: 'WARNING',
        title: 'GPU Clinical Scribe Pool Saturates During Morning Clinic Peaks',
        analysis: '2 GPU replicas saturate near 5.2k RPS equivalent audio frames, delaying real-time captions.',
        recommendation: 'Enable FP8 quantized continuous batching across 4+ multi-AZ L4 GPU workers.',
        targetNodeId: 'clinical-asr-scribe',
        estimatedImpact: '-48% transcription tail latency',
      },
      {
        id: 'med-fin-1',
        persona: 'finops',
        severity: 'OPTIMIZATION',
        title: 'Idle Dedicated GPU Instances Overnight Outside Clinic Hours',
        analysis: 'Consultation volume drops 82% overnight while dedicated GPU nodes remain provisioned.',
        recommendation: 'Configure Karpenter scheduled scale-down + Spot fallback for async post-visit coding.',
        targetNodeId: 'clinical-asr-scribe',
        estimatedImpact: 'Saves ~$1,120/mo (-34% AI compute cost)',
      },
    ];

    return {
      nodes,
      edges,
      audit: {
        securityScore: 65,
        resilienceScore: 57,
        costEfficiencyScore: 72,
        executiveSummary:
          'WebRTC SFU and WORM archival establish a strong telehealth core, but HIPAA compliance requires immediate remediation of single-AZ EHR storage and unencrypted east-west audio gRPC.',
        findings,
      },
      sqlTables: `CREATE TABLE clinical_consultations (
  consultation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_clinic_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  provider_id UUID NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'IN_PROGRESS',
  kms_key_arn TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);
ALTER TABLE clinical_consultations ENABLE ROW LEVEL SECURITY;

CREATE TABLE phi_transcript_segments (
  segment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL REFERENCES clinical_consultations(consultation_id),
  speaker_role VARCHAR(16) NOT NULL,
  encrypted_utterance BYTEA NOT NULL,
  icd10_codes TEXT[] NOT NULL DEFAULT '{}',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE phi_transcript_segments ENABLE ROW LEVEL SECURITY;`,
      openapiPaths: `  /v1/consultations:
    post:
      summary: Provision HIPAA-isolated WebRTC room and AI scribe session
      operationId: createConsultation
      responses:
        '201':
          description: Encrypted TURN/SFU credentials issued
  /v1/consultations/{consultationId}/soap-note:
    get:
      summary: Retrieve clinician-reviewed AI SOAP summary
      operationId: getClinicalSoapNote
      parameters:
        - name: consultationId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Structured FHIR DocumentReference`,
    };
  }

  // Domain-parameterized blueprint for fintech, ai_rag, ecommerce, media, saas
  const cap = (n: number) => scaleCapacity(n, peakRps, 10_000);
  const domainLabels: Record<
    Exclude<DetectedDomainId, 'gaming' | 'iot' | 'telemedicine'>,
    {
      edgeLabel: string;
      edgeTech: string;
      gwLabel: string;
      gwTech: string;
      coreLabel: string;
      coreTech: string;
      auxLabel: string;
      auxTech: string;
      busLabel: string;
      busTech: string;
      cacheLabel: string;
      cacheTech: string;
      dbLabel: string;
      dbTech: string;
      tablePrefix: string;
      endpointSlug: string;
    }
  > = {
    fintech: {
      edgeLabel: 'Anycast WAF & mTLS Edge',
      edgeTech: 'Cloudflare Enterprise WAF + TLS 1.3',
      gwLabel: 'Zero-Trust Payment API Gateway',
      gwTech: 'Envoy Proxy + HMAC / OAuth2',
      coreLabel: 'Clearing & Ledger Orchestrator',
      coreTech: 'Go 1.24 Microservices (EKS)',
      auxLabel: 'Real-Time Fraud Risk Scorer',
      auxTech: 'ONNX Runtime Inference Workers',
      busLabel: 'Settlement & Webhook Outbox Bus',
      busTech: 'Apache Kafka (3-Broker MSK)',
      cacheLabel: 'Idempotency & Velocity Cache',
      cacheTech: 'Redis 7.4 Primary-Replica',
      dbLabel: 'Primary Double-Entry Ledger DB',
      dbTech: 'PostgreSQL 17 Single-Writer',
      tablePrefix: 'ledger_entries',
      endpointSlug: 'payments/authorizations',
    },
    ai_rag: {
      edgeLabel: 'Global Edge CDN & Token Limiter',
      edgeTech: 'Cloudflare Enterprise + Bot Shield',
      gwLabel: 'Tenant-Scoped AI API Gateway',
      gwTech: 'Envoy + JWT / RBAC Policy Engine',
      coreLabel: 'Agentic DAG & Tool Orchestrator',
      coreTech: 'TypeScript / Temporal Worker Fleet',
      auxLabel: 'Hybrid Reranker & LLM Router',
      auxTech: 'vLLM / Triton GPU Inference Pool',
      busLabel: 'Async Document Ingestion Queue',
      busTech: 'Apache Kafka + Schema Registry',
      cacheLabel: 'Semantic Prompt & Embedding Cache',
      cacheTech: 'Redis Stack Vector Cache',
      dbLabel: 'Primary Tenant Vector & Metadata DB',
      dbTech: 'PostgreSQL 17 + pgvector Single Primary',
      tablePrefix: 'knowledge_chunks',
      endpointSlug: 'agents/completions',
    },
    ecommerce: {
      edgeLabel: 'Global Edge CDN & Waiting Room',
      edgeTech: 'Cloudflare CDN + Edge Queue-It',
      gwLabel: 'GraphQL & Checkout API Gateway',
      gwTech: 'Apollo Router + Envoy Rate Limiter',
      coreLabel: 'Cart & Flash-Inventory Service',
      coreTech: 'Go 1.24 + gRPC Domain Services',
      auxLabel: 'Dynamic Pricing & Recommendation',
      auxTech: 'Rust + TensorRT Ranking Service',
      busLabel: 'Order Fulfillment & ERP Event Bus',
      busTech: 'Apache Kafka (MSK 3-AZ)',
      cacheLabel: 'Atomic SKU Inventory Counter Cache',
      cacheTech: 'Redis 7.4 Primary-Replica',
      dbLabel: 'Orders & Customer Transactional DB',
      dbTech: 'PostgreSQL 17 Single-Primary',
      tablePrefix: 'commerce_orders',
      endpointSlug: 'checkout/reservations',
    },
    media: {
      edgeLabel: 'Multi-CDN Anycast HLS/DASH Edge',
      edgeTech: 'Cloudflare + Fastly Origin Shield',
      gwLabel: 'Ingest & Entitlement API Gateway',
      gwTech: 'Envoy + Signed Token Verifier',
      coreLabel: 'Manifest Packager & DRM Service',
      coreTech: 'Go 1.24 + Widevine/FairPlay Packager',
      auxLabel: 'Live ABR GPU Transcoding Pool',
      auxTech: 'FFmpeg NVENC L4 GPU Fleet',
      busLabel: 'Segment Lifecycle & Analytics Bus',
      busTech: 'Apache Kafka (3-Broker NVMe)',
      cacheLabel: 'Hot Segment & Viewer Session Cache',
      cacheTech: 'Redis 7.4 Cluster Cache',
      dbLabel: 'Catalog & Rights Metadata DB',
      dbTech: 'PostgreSQL 17 Single-Primary',
      tablePrefix: 'media_streams',
      endpointSlug: 'streams/manifests',
    },
    saas: {
      edgeLabel: 'Global Anycast WAF & CDN',
      edgeTech: 'Cloudflare Enterprise WAF + TLS 1.3',
      gwLabel: 'Multi-Tenant OIDC API Gateway',
      gwTech: 'Envoy + OpenPolicyAgent RBAC',
      coreLabel: 'Core Domain Workflow Service',
      coreTech: 'Go / TypeScript Stateless Services',
      auxLabel: 'Async Automation & Search Worker',
      auxTech: 'Rust / Node Worker Pool',
      busLabel: 'Domain Events & Webhook Bus',
      busTech: 'Apache Kafka (3-Broker MSK)',
      cacheLabel: 'Tenant Session & Rate-Limit Cache',
      cacheTech: 'Redis 7.4 Primary-Replica',
      dbLabel: 'Primary Multi-Tenant Relational DB',
      dbTech: 'PostgreSQL 17 Single-Primary',
      tablePrefix: 'tenant_workspaces',
      endpointSlug: 'workspaces/operations',
    },
  };

  const spec = domainLabels[domain];

  const nodes: ArchNode[] = [
    {
      id: 'edge-shield',
      label: spec.edgeLabel,
      tier: 'edge',
      technology: spec.edgeTech,
      justification: 'Terminates TLS 1.3 at edge PoPs, absorbs L7 floods, and caches static/idempotent responses.',
      scalingModel: 'Global Edge Anycast',
      spofRisk: 'NONE',
      baseLatencyMs: 2.2,
      baseMonthlyCostUsd: 780,
      maxCapacityRps: cap(90_000),
      costCategory: 'network',
      isStateful: false,
      replicas: 12,
      failureDomain: 'Global Anycast PoPs',
    },
    {
      id: 'ingress-gateway',
      label: spec.gwLabel,
      tier: 'gateway',
      technology: spec.gwTech,
      justification: 'Enforces tenant authentication, per-tenant token-bucket limits, and request schema validation.',
      scalingModel: 'Horizontal Auto-Scale',
      spofRisk: 'LOW',
      baseLatencyMs: 4.0,
      baseMonthlyCostUsd: 1050,
      maxCapacityRps: cap(50_000),
      costCategory: 'compute',
      isStateful: false,
      replicas: 6,
      failureDomain: '3-AZ Ingress Fleet',
    },
    {
      id: 'core-domain-svc',
      label: spec.coreLabel,
      tier: 'compute',
      technology: spec.coreTech,
      justification: 'Executes core transactional domain workflows with bounded retries and structured observability.',
      scalingModel: 'Horizontal Auto-Scale',
      spofRisk: 'LOW',
      baseLatencyMs: 7.8,
      baseMonthlyCostUsd: 1750,
      maxCapacityRps: cap(42_000),
      costCategory: 'compute',
      isStateful: false,
      replicas: 6,
      failureDomain: '3-AZ Compute Pool',
    },
    {
      id: 'specialized-worker',
      label: spec.auxLabel,
      tier: 'compute',
      technology: spec.auxTech,
      justification: 'Handles compute-intensive scoring, ranking, or transformation workloads.',
      scalingModel: 'Horizontal Auto-Scale',
      spofRisk: 'MODERATE',
      baseLatencyMs: 17.5,
      baseMonthlyCostUsd: 2650,
      maxCapacityRps: cap(14_000),
      costCategory: 'ai_queue',
      isStateful: false,
      replicas: 2,
      failureDomain: '2-AZ Compute Pool',
    },
    {
      id: 'event-backbone',
      label: spec.busLabel,
      tier: 'messaging',
      technology: spec.busTech,
      justification: 'Decouples downstream webhooks, analytics, and audit projections via durable partitions.',
      scalingModel: 'Partitioned Cluster',
      spofRisk: 'LOW',
      baseLatencyMs: 4.9,
      baseMonthlyCostUsd: 1420,
      maxCapacityRps: cap(65_000),
      costCategory: 'ai_queue',
      isStateful: true,
      replicas: 3,
      failureDomain: '3-AZ Broker Quorum',
    },
    {
      id: 'hot-state-cache',
      label: spec.cacheLabel,
      tier: 'storage',
      technology: spec.cacheTech,
      justification: 'Serves sub-2ms hot lookups, idempotency locks, and burst rate-limit counters.',
      scalingModel: 'Vertical Primary-Replica',
      spofRisk: 'MODERATE',
      baseLatencyMs: 1.9,
      baseMonthlyCostUsd: 890,
      maxCapacityRps: cap(48_000),
      costCategory: 'storage',
      isStateful: true,
      replicas: 2,
      failureDomain: 'Primary + Async Replica',
    },
    {
      id: 'primary-store-spof',
      label: spec.dbLabel,
      tier: 'storage',
      technology: spec.dbTech,
      justification: 'Authoritative ACID system of record storing tenant state and transactional history.',
      scalingModel: 'Vertical Primary-Replica',
      spofRisk: 'CRITICAL',
      baseLatencyMs: 13.8,
      baseMonthlyCostUsd: 2350,
      maxCapacityRps: cap(11_500),
      costCategory: 'storage',
      isStateful: true,
      replicas: 1,
      failureDomain: 'Single Primary Instance (AZ-1)',
    },
  ];

  const edges: ArchEdge[] = [
    { id: 'e1', source: 'edge-shield', target: 'ingress-gateway', protocol: 'HTTPS', label: 'TLS 1.3 Ingress', isAsync: false, encrypted: true },
    { id: 'e2', source: 'ingress-gateway', target: 'core-domain-svc', protocol: 'gRPC', label: 'Domain RPC', isAsync: false, encrypted: true },
    { id: 'e3', source: 'core-domain-svc', target: 'specialized-worker', protocol: 'HTTPS', label: 'Internal Sync Call', isAsync: false, encrypted: false },
    { id: 'e4', source: 'core-domain-svc', target: 'hot-state-cache', protocol: 'Redis RESP', label: 'Hot State Lookup', isAsync: false, encrypted: true },
    { id: 'e5', source: 'core-domain-svc', target: 'primary-store-spof', protocol: 'SQL', label: 'ACID Read/Write', isAsync: false, encrypted: true },
    { id: 'e6', source: 'core-domain-svc', target: 'event-backbone', protocol: 'Kafka', label: 'Transactional Outbox', isAsync: true, encrypted: true },
    { id: 'e7', source: 'specialized-worker', target: 'event-backbone', protocol: 'Kafka', label: 'Async Telemetry', isAsync: true, encrypted: true },
  ];

  const findings: AuditFinding[] = [
    {
      id: 'gen-sre-1',
      persona: 'sre',
      severity: 'CRITICAL',
      title: `Single-Writer ${spec.dbLabel} Creates Regional Availability SPOF`,
      analysis: 'Single-instance primary storage saturates connection pools under burst writes and lacks zero-RPO automatic multi-AZ failover.',
      recommendation: 'Upgrade to a multi-AZ Raft/distributed SQL cluster (CockroachDB / Aurora Multi-AZ) with PgBouncer transaction pooling.',
      targetNodeId: 'primary-store-spof',
      estimatedImpact: 'Eliminates storage SPOF; expands write ceiling 3.1x',
    },
    {
      id: 'gen-sec-1',
      persona: 'security',
      severity: 'CRITICAL',
      title: 'Unencrypted East-West Service Hop & Missing Workload Identity mTLS',
      analysis: 'Internal calls between core-domain-svc and specialized-worker traverse cluster networking without mutual TLS or cryptographic tenant claims.',
      recommendation: 'Deploy SPIFFE/SPIRE mTLS workload identities across all service-to-service gRPC channels and enforce PostgreSQL RLS.',
      targetNodeId: 'specialized-worker',
      estimatedImpact: 'Enforces zero-trust east-west isolation',
    },
    {
      id: 'gen-sre-2',
      persona: 'sre',
      severity: 'WARNING',
      title: `2-Replica ${spec.auxLabel} Bottlenecks Tail Latency Under Surge`,
      analysis: 'Under-provisioned compute worker replicas queue requests steeply above 75% utilization.',
      recommendation: 'Auto-scale worker pool across 3 AZs (6+ replicas) with circuit-breaker hedged timeouts.',
      targetNodeId: 'specialized-worker',
      estimatedImpact: '-42% P99 latency under peak traffic',
    },
    {
      id: 'gen-fin-1',
      persona: 'finops',
      severity: 'OPTIMIZATION',
      title: 'Unoptimized Compute Instance Mix & Uncompressed Cross-AZ Payloads',
      analysis: 'Stateless services run 100% On-Demand x86 instances and emit uncompressed JSON payloads.',
      recommendation: 'Shift stateless pools to Graviton4 Savings Plans + Spot mix and enable Protobuf zstd framing.',
      targetNodeId: 'core-domain-svc',
      estimatedImpact: 'Reduces monthly compute & egress spend by ~24%',
    },
  ];

  return {
    nodes,
    edges,
    audit: {
      securityScore: 68,
      resilienceScore: 59,
      costEfficiencyScore: 75,
      executiveSummary: `5-tier ${domain.toUpperCase()} topology provides clean ingress and async Kafka decoupling, but single-writer database storage and unencrypted east-west compute hops require architectural hardening before peak production cutover.`,
      findings,
    },
    sqlTables: `CREATE TABLE ${spec.tablePrefix} (
  record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'COMMITTED',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_${spec.tablePrefix}_tenant_created
  ON ${spec.tablePrefix} (tenant_id, created_at DESC);
ALTER TABLE ${spec.tablePrefix} ENABLE ROW LEVEL SECURITY;`,
    openapiPaths: `  /v1/${spec.endpointSlug}:
    post:
      summary: Execute primary idempotent domain transaction
      operationId: createDomainOperation
      parameters:
        - name: Idempotency-Key
          in: header
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Deterministic transaction receipt`,
  };
}

function generateArtifactsForGraph(params: {
  title: string;
  domainTag: string;
  prompt: string;
  versionLabel: string;
  peakRps: number;
  cloudProfile: string;
  nodes: ArchNode[];
  edges: ArchEdge[];
  audit: MultiAgentAudit;
  sqlTables: string;
  openapiPaths: string;
}): ProductionArtifacts {
  const {
    title,
    domainTag,
    prompt,
    versionLabel,
    peakRps,
    cloudProfile,
    nodes,
    edges,
    audit,
    sqlTables,
    openapiPaths,
  } = params;

  const schemaSql = `-- ============================================================================
-- ArchForge AI · Production PostgreSQL 17 DDL
-- System: ${title} (${versionLabel})
-- Posture: ${domainTag}
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

${sqlTables}

CREATE TABLE IF NOT EXISTS transactional_outbox_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id UUID NOT NULL,
  topic VARCHAR(96) NOT NULL,
  payload JSONB NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outbox_unpublished
  ON transactional_outbox_events (created_at) WHERE published = FALSE;
`;

  const composeServices = nodes
    .map((node) => {
      const svcName = node.id.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
      const image =
        node.tier === 'storage' && node.technology.toLowerCase().includes('redis')
          ? 'redis:7.4-alpine'
          : node.tier === 'storage' &&
              (node.technology.toLowerCase().includes('postgres') ||
                node.technology.toLowerCase().includes('timescale') ||
                node.technology.toLowerCase().includes('cockroach'))
            ? 'postgres:17-alpine'
            : node.tier === 'messaging'
              ? 'redpandadata/redpanda:v24.2.8'
              : node.tier === 'gateway' || node.tier === 'edge'
                ? 'envoyproxy/envoy:v1.31-latest'
                : 'ghcr.io/archforge/runtime-service:1.24-alpine';

      return `  ${svcName}:
    image: ${image}
    deploy:
      replicas: ${Math.min(node.replicas, 6)}
    environment:
      NODE_ROLE: "${node.tier}"
      TECH_STACK: "${node.technology.replace(/"/g, "'")}"
      MAX_CAPACITY_RPS: "${node.maxCapacityRps}"
      FAILURE_DOMAIN: "${node.failureDomain.replace(/"/g, "'")}"
    restart: unless-stopped`;
    })
    .join('\n\n');

  const dockerComposeYml = `# ArchForge AI · Synthesized Container Topology (${versionLabel})
name: ${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 42) || 'archforge-system'}

services:
${composeServices}
`;

  const openapiYaml = `openapi: 3.1.0
info:
  title: ${title.replace(/:/g, ' -')} API
  version: ${versionLabel.startsWith('v2') ? '2.0.0' : '1.0.0'}
  description: >
    Compiled API specification for ${title} (${domainTag}).
    Target Peak Load: ${peakRps.toLocaleString()} RPS on ${cloudProfile.toUpperCase()}.
servers:
  - url: https://api.archforge.internal
    description: Zero-Trust Global Edge Ingress
security:
  - bearerAuth: []
paths:
${openapiPaths}
  /healthz/ready:
    get:
      summary: Deep quorum readiness probe
      operationId: getReadiness
      security: []
      responses:
        '200':
          description: All upstream consensus dependencies healthy
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
`;

  const totalBaseCost = nodes.reduce((sum, n) => sum + n.baseMonthlyCostUsd, 0);
  const nodeRows = nodes
    .map(
      (n) =>
        `| **${n.label}** | \`${n.tier}\` | ${n.technology} | ${n.replicas}x (${n.spofRisk}) | ${n.maxCapacityRps.toLocaleString()} RPS | $${n.baseMonthlyCostUsd.toLocaleString()}/mo |`
    )
    .join('\n');

  const executiveRfcMd = `# Technical Architecture RFC: ${title} (${versionLabel})

- **Compliance & Domain:** ${domainTag}
- **Target Peak Scale:** ${peakRps.toLocaleString()} RPS · Cloud Benchmark: ${cloudProfile.toUpperCase()}
- **Audit Scorecard:** Security **${audit.securityScore}/100** · Resilience **${audit.resilienceScore}/100** · FinOps **${audit.costEfficiencyScore}/100**
- **Baseline Topology Monthly Spend:** $${totalBaseCost.toLocaleString()}/month across ${nodes.length} components & ${edges.length} protocol flows

## 1. Source Engineering Requirement
> ${prompt.trim()}

## 2. Executive Architecture Summary
${audit.executiveSummary}

## 3. 5-Tier Component Matrix
| Component | Tier | Stack | Replicas & SPOF | Capacity Ceiling | Base Cost |
| :--- | :--- | :--- | :--- | :--- | :--- |
${nodeRows}

## 4. Adversarial Council Findings
${audit.findings
  .map(
    (f) =>
      `- **[${f.severity} · ${f.persona.toUpperCase()}] ${f.title}** (\`${f.targetNodeId}\`): ${f.recommendation} *(${f.estimatedImpact})*`
  )
  .join('\n')}
`;

  return {
    schemaSql,
    dockerComposeYml,
    openapiYaml,
    executiveRfcMd,
  };
}

/**
 * Deterministic Zero-Downtime Architecture Synthesizer.
 * Compiles any natural-language architecture prompt into a complete 5-tier graph,
 * 3-persona adversarial audit, and 4 production engineering artifacts.
 */
export function synthesizeDeterministicBlueprint(
  input: DeterministicCompileInput
): DeterministicCompileOutput {
  const compliancePreset = input.compliancePreset || 'SOC2_ISO27001';
  const cloudProfile = input.cloudProfile || 'aws';
  const detected = detectPromptDomainAndScale(input.prompt, compliancePreset);

  const built = buildDomainTopology(detected.domain, detected.peakRps);
  const artifacts = generateArtifactsForGraph({
    title: detected.title,
    domainTag: detected.domainTag,
    prompt: input.prompt,
    versionLabel: 'v1 · Initial Compiled',
    peakRps: detected.peakRps,
    cloudProfile,
    nodes: built.nodes,
    edges: built.edges,
    audit: built.audit,
    sqlTables: built.sqlTables,
    openapiPaths: built.openapiPaths,
  });

  return {
    name: detected.title,
    domainTag: detected.domainTag,
    detectedDomain: detected.domain,
    recommendedPeakRps: detected.peakRps,
    recommendedReadRatioPercent: detected.readRatioPercent,
    recommendedPayloadSizeKb: detected.payloadSizeKb,
    nodes: built.nodes,
    edges: built.edges,
    audit: built.audit,
    artifacts,
    synthesisEngine: 'deterministic-fallback',
  };
}

/**
 * Deterministic Zero-Downtime Self-Healing Engine.
 * Eliminates CRITICAL/MODERATE SPOFs via Multi-AZ Raft/sharded failover, enforces
 * SPIFFE/SPIRE mTLS east-west encryption, injects zero-trust security/caching
 * resilience, updates artifacts, and computes an exact ArchitectureDiff.
 */
export function synthesizeDeterministicAutoHeal(
  input: DeterministicAutoHealInput
): DeterministicAutoHealOutput {
  const { currentVersion, prompt } = input;
  const compliancePreset = input.compliancePreset || 'SOC2_ISO27001';
  const cloudProfile = input.cloudProfile || 'aws';
  const detected = detectPromptDomainAndScale(
    prompt || input.blueprintName || 'Enterprise Distributed System',
    compliancePreset
  );
  const title = input.blueprintName || detected.title;

  const remediatedRisks: string[] = [];
  const addedNodes: ArchitectureDiff['addedNodes'] = [];
  const upgradedProtocols: ArchitectureDiff['upgradedProtocols'] = [];

  const prevCost = currentVersion.nodes.reduce(
    (sum, n) => sum + n.baseMonthlyCostUsd,
    0
  );

  // 1. Remediate existing nodes (eliminate SPOFs, harden scaling & replicas, right-size FinOps)
  const healedNodes: ArchNode[] = currentVersion.nodes.map((node) => {
    if (node.spofRisk === 'CRITICAL' || (node.tier === 'storage' && node.replicas < 3)) {
      const isRedis = node.technology.toLowerCase().includes('redis');
      const isTimeseries =
        node.technology.toLowerCase().includes('timescale') ||
        node.technology.toLowerCase().includes('clickhouse');
      const upgradedTech = isRedis
        ? 'Redis 7.4 Enterprise 6-Shard Multi-AZ Cluster'
        : isTimeseries
          ? 'ClickHouse 6-Node Replicated Keeper Quorum'
          : 'CockroachDB 24.2 9-Node Multi-AZ Raft Cluster';
      const upgradedReplicas = isRedis || isTimeseries ? 6 : 9;

      remediatedRisks.push(
        `Eliminated CRITICAL SPOF on ${node.label} via ${upgradedTech} (${upgradedReplicas}-replica consensus quorum)`
      );

      return {
        ...node,
        technology: upgradedTech,
        scalingModel: 'Partitioned Cluster',
        spofRisk: 'NONE',
        replicas: upgradedReplicas,
        maxCapacityRps: Math.round(node.maxCapacityRps * 3.1),
        baseLatencyMs: Number(Math.max(1.4, node.baseLatencyMs * 0.72).toFixed(1)),
        baseMonthlyCostUsd: Math.round(node.baseMonthlyCostUsd * 1.14),
        failureDomain: '3-AZ Synchronous Raft Quorum',
      };
    }

    if (node.spofRisk === 'MODERATE' || node.replicas < 3) {
      remediatedRisks.push(
        `Scaled ${node.label} from ${node.replicas}x to ${Math.max(6, node.replicas * 3)}x Multi-AZ auto-scaled pool with INT8/Graviton4 optimization`
      );
      return {
        ...node,
        technology: node.technology.includes('mTLS')
          ? node.technology
          : `${node.technology} (Multi-AZ + Graviton4/FP8)`,
        scalingModel:
          node.tier === 'storage' ? 'Partitioned Cluster' : 'Horizontal Auto-Scale',
        spofRisk: 'NONE',
        replicas: Math.max(6, node.replicas * 3),
        maxCapacityRps: Math.round(node.maxCapacityRps * 2.5),
        baseLatencyMs: Number(Math.max(1.5, node.baseLatencyMs * 0.68).toFixed(1)),
        baseMonthlyCostUsd: Math.round(node.baseMonthlyCostUsd * 0.84),
        failureDomain: '3-AZ Auto-Scaled Pool',
      };
    }

    if (node.tier === 'gateway' && !node.technology.includes('SPIFFE')) {
      remediatedRisks.push(
        `Hardened ${node.label} with SPIFFE/SPIRE short-lived X.509 workload mTLS identities`
      );
      return {
        ...node,
        technology: `${node.technology} + SPIFFE mTLS`,
        spofRisk: 'NONE',
        replicas: Math.max(6, node.replicas),
        maxCapacityRps: Math.round(node.maxCapacityRps * 1.35),
      };
    }

    if (node.costCategory === 'compute') {
      return {
        ...node,
        spofRisk: 'NONE',
        baseMonthlyCostUsd: Math.round(node.baseMonthlyCostUsd * 0.88),
        maxCapacityRps: Math.round(node.maxCapacityRps * 1.3),
      };
    }

    return {
      ...node,
      spofRisk: node.spofRisk === 'LOW' ? 'NONE' : node.spofRisk,
    };
  });

  // 2. Inject a dedicated Zero-Trust / Edge Resilience node if graph has < 9 nodes
  const existingIds = new Set(healedNodes.map((n) => n.id));
  const healedEdges: ArchEdge[] = currentVersion.edges.map((edge) => {
    if (!edge.encrypted || (edge.protocol === 'HTTPS' && edge.source !== healedNodes[0]?.id)) {
      const nextProto = edge.protocol === 'HTTPS' ? 'gRPC' : edge.protocol;
      upgradedProtocols.push({
        edgeLabel: edge.label,
        from: `${edge.protocol}${edge.encrypted ? '' : ' (Plaintext)'}`,
        to: `${nextProto} (SPIFFE mTLS)`,
        rationale: 'Enforced zero-trust mutual TLS and binary Protobuf framing across east-west hops.',
      });
      return {
        ...edge,
        protocol: nextProto,
        label: edge.label.includes('mTLS') ? edge.label : `${edge.label} · mTLS`,
        encrypted: true,
      };
    }
    return edge;
  });

  if (healedNodes.length < 9 && !existingIds.has('spiffe-kms-vault')) {
    const vaultNode: ArchNode = {
      id: 'spiffe-kms-vault',
      label: 'Zero-Trust KMS & Tokenization Enclave',
      tier: 'gateway',
      technology: 'AWS Nitro Enclaves + HashiCorp Vault KMS',
      justification:
        'Issues hardware-attested SVID mTLS certificates, rotates tenant DEKs, and isolates sensitive payload tokens.',
      scalingModel: 'Horizontal Auto-Scale',
      spofRisk: 'NONE',
      baseLatencyMs: 2.4,
      baseMonthlyCostUsd: 690,
      maxCapacityRps: Math.max(65_000, detected.peakRps * 2),
      costCategory: 'compute',
      isStateful: false,
      replicas: 6,
      failureDomain: '3-AZ Attested Enclave Mesh',
    };
    healedNodes.push(vaultNode);
    addedNodes.push({
      id: vaultNode.id,
      label: vaultNode.label,
      technology: vaultNode.technology,
      reason: 'Closes zero-trust compliance & cryptographic key-isolation findings across east-west services.',
    });

    const gatewayPeer =
      healedNodes.find((n) => n.tier === 'gateway' && n.id !== vaultNode.id) ??
      healedNodes[0];
    const computePeer =
      healedNodes.find((n) => n.tier === 'compute') ?? healedNodes[1];

    if (gatewayPeer) {
      healedEdges.push({
        id: `heal-e-${healedEdges.length + 1}`,
        source: gatewayPeer.id,
        target: vaultNode.id,
        protocol: 'gRPC',
        label: 'SVID & Envelope KMS',
        isAsync: false,
        encrypted: true,
      });
    }
    if (computePeer && computePeer.id !== gatewayPeer?.id) {
      healedEdges.push({
        id: `heal-e-${healedEdges.length + 2}`,
        source: vaultNode.id,
        target: computePeer.id,
        protocol: 'gRPC',
        label: 'Attested Claims',
        isAsync: false,
        encrypted: true,
      });
    }
  }

  if (remediatedRisks.length === 0) {
    remediatedRisks.push(
      'Hardened all tiers with multi-AZ quorum policies, SPIFFE mTLS, and Graviton4 CUD cost right-sizing'
    );
  }

  const nextSecurity = Math.min(98, Math.max(93, currentVersion.audit.securityScore + 25));
  const nextResilience = Math.min(98, Math.max(94, currentVersion.audit.resilienceScore + 34));
  const nextFinops = Math.min(96, Math.max(90, currentVersion.audit.costEfficiencyScore + 16));

  const targetVerifyNode =
    healedNodes.find((n) => n.tier === 'storage')?.id ?? healedNodes[0].id;

  const healedAudit: MultiAgentAudit = {
    securityScore: nextSecurity,
    resilienceScore: nextResilience,
    costEfficiencyScore: nextFinops,
    executiveSummary:
      'Auto-healed revision eliminates all single-point-of-failure storage bottlenecks via multi-AZ Raft consensus, enforces zero-trust SPIFFE/SPIRE mutual TLS across every internal service hop, and right-sizes compute pools onto Graviton4/quantized workers.',
    findings: [
      {
        id: 'healed-verify-1',
        persona: 'finops',
        severity: 'OPTIMIZATION',
        title: 'Evaluate 1-Year Committed Use / Savings Plan Lock-In After 30-Day Burn-In',
        analysis:
          'All critical security and single-writer availability risks are resolved. Multi-AZ Raft consensus replicas can save an additional 14% once steady-state IOPS stabilize.',
        recommendation:
          'Convert baseline consensus storage nodes to 1-year Reserved capacity following production traffic validation.',
        targetNodeId: targetVerifyNode,
        estimatedImpact: 'Optional ~$380/mo incremental FinOps savings',
      },
    ],
  };

  const baseBuilt = buildDomainTopology(detected.domain, detected.peakRps);
  const healedArtifacts = generateArtifactsForGraph({
    title,
    domainTag: detected.domainTag,
    prompt: prompt || title,
    versionLabel: 'v2 · Auto-Healed',
    peakRps: detected.peakRps,
    cloudProfile,
    nodes: healedNodes,
    edges: healedEdges,
    audit: healedAudit,
    sqlTables: baseBuilt.sqlTables,
    openapiPaths: baseBuilt.openapiPaths,
  });

  const nextCost = healedNodes.reduce((sum, n) => sum + n.baseMonthlyCostUsd, 0);

  return {
    nodes: healedNodes,
    edges: healedEdges,
    audit: healedAudit,
    artifacts: healedArtifacts,
    diffFromPrevious: {
      addedNodes,
      upgradedProtocols,
      remediatedRisks,
      securityScoreDelta: nextSecurity - currentVersion.audit.securityScore,
      resilienceScoreDelta: nextResilience - currentVersion.audit.resilienceScore,
      costEfficiencyScoreDelta:
        nextFinops - currentVersion.audit.costEfficiencyScore,
      baseMonthlyCostDeltaUsd: nextCost - prevCost,
      summary:
        'Upgraded stateful SPOFs to multi-AZ Raft consensus clusters, enforced SPIFFE/SPIRE mutual TLS across internal hops, isolated cryptographic keys via Nitro/Vault enclaves, and right-sized compute pools.',
    },
    synthesisEngine: 'deterministic-fallback',
  };
}
