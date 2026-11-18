import type {
  ArchEdge,
  ArchNode,
  CloudProfile,
  NodeSimulationMetrics,
  NodeStressStatus,
  SimulationParams,
  SimulationResult,
} from '../types/architecture';

const SECONDS_PER_MONTH = 2_592_000; // 30 days
const DIURNAL_AVERAGE_FACTOR = 0.42; // Average traffic is ~42% of peak RPS

const CLOUD_COST_MULTIPLIER: Record<CloudProfile, number> = {
  aws: 1.0,
  gcp: 0.94,
  hybrid: 1.08,
};

function safeFinite(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function detectCachePresence(nodes: ArchNode[], edges: ArchEdge[]): boolean {
  const hasRedisEdge = edges.some((e) => e.protocol === 'Redis RESP');
  if (hasRedisEdge) return true;
  return nodes.some((n) => {
    const tech = `${n.label} ${n.technology}`.toLowerCase();
    return (
      tech.includes('redis') ||
      tech.includes('dragonfly') ||
      tech.includes('memcached') ||
      tech.includes('cache')
    );
  });
}

function computeTierTrafficMultiplier(
  node: ArchNode,
  readFraction: number,
  writeFraction: number,
  hasCacheLayer: boolean
): number {
  const lowerTech = `${node.label} ${node.technology}`.toLowerCase();
  const isCacheNode =
    lowerTech.includes('redis') ||
    lowerTech.includes('dragonfly') ||
    lowerTech.includes('cache');

  switch (node.tier) {
    case 'edge':
      return 1.0;
    case 'gateway':
      return 0.96;
    case 'compute':
      return 0.88 + writeFraction * 0.24;
    case 'messaging':
      return 0.32 + writeFraction * 1.35;
    case 'storage':
    default: {
      if (isCacheNode) {
        return 0.45 + readFraction * 0.65;
      }
      const readHitLoad = readFraction * (hasCacheLayer ? 0.38 : 0.92);
      const writeHitLoad = writeFraction * 1.55;
      return readHitLoad + writeHitLoad;
    }
  }
}

function computeCriticalSynchronousPath(
  nodes: ArchNode[],
  edges: ArchEdge[],
  nodeMetrics: Record<string, NodeSimulationMetrics>,
  multiRegion: boolean
): { pathIds: string[]; totalP99Ms: number } {
  if (nodes.length === 0) {
    return { pathIds: [], totalP99Ms: 0 };
  }

  const nodeMap = new Map<string, ArchNode>(nodes.map((n) => [n.id, n]));
  const syncAdj = new Map<string, ArchEdge[]>();
  const incomingSyncCount = new Map<string, number>();

  for (const n of nodes) {
    syncAdj.set(n.id, []);
    incomingSyncCount.set(n.id, 0);
  }

  for (const e of edges) {
    if (e.isAsync) continue;
    if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) continue;
    if (e.source === e.target) continue;
    syncAdj.get(e.source)?.push(e);
    incomingSyncCount.set(e.target, (incomingSyncCount.get(e.target) ?? 0) + 1);
  }

  // Entry candidates: edge tier nodes or zero-indegree nodes; also ensure cyclic components are covered
  const entrySet = new Set<string>();
  for (const n of nodes) {
    if (n.tier === 'edge' || (incomingSyncCount.get(n.id) ?? 0) === 0) {
      entrySet.add(n.id);
    }
  }
  if (entrySet.size === 0) {
    for (const n of nodes) {
      entrySet.add(n.id);
    }
  }

  let bestLatency = 0;
  let bestPath: string[] = [];
  const globallyVisited = new Set<string>();

  const protocolHopOverheadMs = (protocol: ArchEdge['protocol']): number => {
    switch (protocol) {
      case 'gRPC':
        return 1.2;
      case 'Redis RESP':
        return 0.6;
      case 'SQL':
        return 1.8;
      case 'WebSocket':
        return 1.5;
      case 'HTTPS':
        return 2.8;
      case 'S3 API':
        return 4.5;
      case 'Kafka':
      default:
        return 3.0;
    }
  };

  const dfs = (
    currentId: string,
    visited: Set<string>,
    accLatency: number,
    path: string[]
  ): void => {
    globallyVisited.add(currentId);
    const outgoing = syncAdj.get(currentId) ?? [];
    let advanced = false;

    for (const edge of outgoing) {
      if (visited.has(edge.target)) continue;
      advanced = true;
      visited.add(edge.target);
      const targetLatency = nodeMetrics[edge.target]?.simulatedP99Ms ?? 0;
      const hopMs = protocolHopOverheadMs(edge.protocol);
      dfs(
        edge.target,
        visited,
        accLatency + hopMs + targetLatency,
        [...path, edge.target]
      );
      visited.delete(edge.target);
    }

    if (!advanced && accLatency >= bestLatency) {
      bestLatency = accLatency;
      bestPath = path;
    }
  };

  for (const rootId of entrySet) {
    const rootNode = nodeMap.get(rootId)!;
    const rootLatency =
      nodeMetrics[rootId]?.simulatedP99Ms ??
      Math.max(0.1, safeFinite(rootNode.baseLatencyMs, 5));
    dfs(rootId, new Set([rootId]), rootLatency, [rootId]);
  }

  // Cover any disconnected cyclic components not reached from initial entrySet
  for (const n of nodes) {
    if (!globallyVisited.has(n.id)) {
      const rootLatency =
        nodeMetrics[n.id]?.simulatedP99Ms ??
        Math.max(0.1, safeFinite(n.baseLatencyMs, 5));
      dfs(n.id, new Set([n.id]), rootLatency, [n.id]);
    }
  }

  const wanClientRttMs = multiRegion ? 11 : 26;

  return {
    pathIds: bestPath,
    totalP99Ms: Math.round((bestLatency + wanClientRttMs) * 10) / 10,
  };
}

export function runFinOpsSimulation(
  nodes: ArchNode[],
  edges: ArchEdge[],
  params: SimulationParams
): SimulationResult {
  const safeRps = clamp(safeFinite(params.peakRps, 1000), 10, 100_000);
  const safeReadPct = clamp(safeFinite(params.readRatioPercent, 70), 20, 95);
  const safePayloadKb = clamp(safeFinite(params.payloadSizeKb, 16), 2, 5120);
  const isMultiRegion = Boolean(params.multiRegion);

  const readFraction = safeReadPct / 100;
  const writeFraction = (100 - safeReadPct) / 100;
  const hasCacheLayer = detectCachePresence(nodes, edges);
  const cloudFactor = CLOUD_COST_MULTIPLIER[params.cloudProfile] ?? 1.0;

  // Monotonically anchored at 2 KB minimum slider value so every payload increment scales load smoothly
  const payloadStressFactor =
    1 + Math.log2(Math.max(1, safePayloadKb / 2)) * 0.11;

  const nodeMetrics: Record<string, NodeSimulationMetrics> = {};

  let computeUsd = 0;
  let storageUsd = 0;
  let networkUsd = 0;
  let aiQueueUsd = 0;

  let maxUtilizationPercent = 0;
  let bottleneckNodeId: string | null = null;
  let saturatedCount = 0;
  let elevatedCount = 0;

  for (const node of nodes) {
    const baseLatencyMs = Math.max(0.2, safeFinite(node.baseLatencyMs, 5));
    const baseMonthlyCostUsd = Math.max(
      10,
      safeFinite(node.baseMonthlyCostUsd, 500)
    );
    const maxCapacityRps = Math.max(50, safeFinite(node.maxCapacityRps, 10_000));

    const trafficShare = computeTierTrafficMultiplier(
      node,
      readFraction,
      writeFraction,
      hasCacheLayer
    );

    const effectiveRps = Math.max(
      1,
      Math.round(
        safeRps *
          trafficShare *
          (node.tier === 'edge'
            ? 0.92 + payloadStressFactor * 0.12
            : payloadStressFactor * 0.78)
      )
    );

    const regionCapacityMultiplier = isMultiRegion
      ? node.isStateful
        ? 1.65 - writeFraction * 0.28
        : 2.65
      : 1.0;

    const scalingBonus =
      node.scalingModel === 'Horizontal Auto-Scale' ||
      node.scalingModel === 'Serverless Elastic' ||
      node.scalingModel === 'Global Edge Anycast'
        ? 1.0
        : node.scalingModel === 'Partitioned Cluster'
          ? 1.05
          : 0.88;

    const effectiveCapacityRps = Math.max(
      50,
      Math.round(maxCapacityRps * regionCapacityMultiplier * scalingBonus)
    );

    const rawRho = effectiveRps / effectiveCapacityRps;
    const utilizationPercent = clamp(Math.round(rawRho * 100), 1, 199);

    let status: NodeStressStatus = 'nominal';
    if (utilizationPercent > 95) {
      status = 'saturated';
      saturatedCount += 1;
    } else if (utilizationPercent > 75) {
      status = 'elevated';
      elevatedCount += 1;
    }

    if (utilizationPercent > maxUtilizationPercent) {
      maxUtilizationPercent = utilizationPercent;
      bottleneckNodeId = node.id;
    }

    let latencyQueueMultiplier = 1.0;
    if (rawRho <= 0.7) {
      latencyQueueMultiplier = 1 + rawRho * 0.28;
    } else if (rawRho <= 0.95) {
      const norm = (rawRho - 0.7) / 0.25;
      latencyQueueMultiplier = 1.196 + norm * norm * 1.95;
    } else {
      const overload = Math.min(1.5, rawRho - 0.95);
      latencyQueueMultiplier = 3.146 + overload * 13.5;
    }

    const payloadSerializationMs =
      (safePayloadKb / 256) * (node.isStateful ? 2.4 : 1.1);

    const multiRegionConsensusMs =
      isMultiRegion && node.isStateful ? writeFraction * 34 : 0;

    const simulatedP99Ms =
      Math.round(
        (baseLatencyMs * latencyQueueMultiplier +
          payloadSerializationMs +
          multiRegionConsensusMs) *
          10
      ) / 10;

    const cpuPercent = clamp(
      Math.round(utilizationPercent * (node.isStateful ? 0.86 : 0.94) + 6),
      4,
      100
    );

    const blockCountPerOp = Math.max(1, Math.ceil(safePayloadKb / 16));
    const iopsEstimate = node.isStateful
      ? Math.round(effectiveRps * blockCountPerOp * (1 + writeFraction * 0.8))
      : Math.round(effectiveRps * 0.15);

    const regionalFootprintFactor = isMultiRegion ? 2.45 : 1.0;
    const dynamicScaleFactor =
      node.scalingModel === 'Horizontal Auto-Scale' ||
      node.scalingModel === 'Serverless Elastic'
        ? 1 + Math.max(0, rawRho - 0.35) * 1.45
        : 1 + Math.max(0, rawRho - 0.5) * 0.75;

    const storageIopsSurcharge = node.isStateful
      ? (iopsEstimate / 10_000) * 68 * (isMultiRegion ? 1.8 : 1.0)
      : 0;

    const nodeMonthlyUsd = Math.round(
      (baseMonthlyCostUsd * regionalFootprintFactor * dynamicScaleFactor +
        storageIopsSurcharge) *
        cloudFactor
    );

    if (node.costCategory === 'compute') {
      computeUsd += nodeMonthlyUsd;
    } else if (node.costCategory === 'storage') {
      storageUsd += nodeMonthlyUsd;
    } else if (node.costCategory === 'network') {
      networkUsd += nodeMonthlyUsd;
    } else {
      aiQueueUsd += nodeMonthlyUsd;
    }

    nodeMetrics[node.id] = {
      nodeId: node.id,
      effectiveRps,
      effectiveCapacityRps,
      utilizationPercent,
      cpuPercent,
      iopsEstimate,
      simulatedP99Ms,
      monthlyCostUsd: nodeMonthlyUsd,
      status,
    };
  }

  const monthlyRequests = safeRps * DIURNAL_AVERAGE_FACTOR * SECONDS_PER_MONTH;
  const monthlyRequestsMillions =
    Math.round((monthlyRequests / 1_000_000) * 100) / 100;

  const egressResponseRatio = 0.42 + readFraction * 0.35;
  const monthlyEgressGb =
    (monthlyRequests * safePayloadKb * egressResponseRatio) / (1024 * 1024);
  const crossRegionReplicationGb = isMultiRegion
    ? (monthlyRequests * safePayloadKb * writeFraction * 1.6) / (1024 * 1024)
    : 0;

  const totalTransferGb = monthlyEgressGb + crossRegionReplicationGb;
  const monthlyEgressTb = Math.round((totalTransferGb / 1024) * 100) / 100;

  const perGbRate = isMultiRegion ? 0.072 : 0.058;
  const variableEgressUsd = Math.round(totalTransferGb * perGbRate * cloudFactor);
  networkUsd += variableEgressUsd;

  const totalMonthlyUsd = computeUsd + storageUsd + networkUsd + aiQueueUsd;
  const costPerMillionRequestsUsd =
    monthlyRequestsMillions > 0
      ? Math.round((totalMonthlyUsd / monthlyRequestsMillions) * 100) / 100
      : 0;

  const criticalPath = computeCriticalSynchronousPath(
    nodes,
    edges,
    nodeMetrics,
    isMultiRegion
  );

  return {
    nodeMetrics,
    endToEndP99Ms: criticalPath.totalP99Ms,
    criticalPathNodeIds: criticalPath.pathIds,
    bottleneckNodeId,
    maxUtilizationPercent,
    saturatedCount,
    elevatedCount,
    finops: {
      computeUsd,
      storageUsd,
      networkUsd,
      aiQueueUsd,
      totalMonthlyUsd,
      costPerMillionRequestsUsd,
      monthlyRequestsMillions,
      monthlyEgressTb,
    },
  };
}
