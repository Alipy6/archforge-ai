import type {
  ArchEdge,
  ArchNode,
  ChaosVerdict,
  OutageBlastRadiusResult,
} from '../types/architecture';

/**
 * Deterministically evaluates the blast radius, upstream synchronous caller failures,
 * downstream pipeline starvation, and availability SLA impact when a single instance
 * or primary of `failedNodeId` experiences an unplanned outage.
 */
export function analyzeNodeOutage(
  nodes: ArchNode[],
  edges: ArchEdge[],
  failedNodeId: string | null
): OutageBlastRadiusResult | null {
  if (!failedNodeId) return null;
  const target = nodes.find((n) => n.id === failedNodeId);
  if (!target) return null;

  const nodeIds = new Set(nodes.map((n) => n.id));
  const validEdges = edges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target) && e.source !== e.target
  );

  const totalReplicas = Math.max(1, Math.round(target.replicas || 1));
  const survivingReplicas = Math.max(0, totalReplicas - 1);

  let verdict: ChaosVerdict;
  if (target.spofRisk === 'CRITICAL' || totalReplicas <= 1) {
    verdict = 'hard_outage';
  } else if (target.spofRisk === 'MODERATE' || totalReplicas === 2) {
    verdict = 'degraded_failover';
  } else {
    verdict = 'resilient_quorum';
  }

  // Trace upstream synchronous callers that depend on `failedNodeId`
  const upstreamBlocked = new Set<string>();
  const impactedEdges = new Set<string>();

  if (verdict !== 'resilient_quorum') {
    const reverseQueue: string[] = [target.id];
    const visitedUp = new Set<string>([target.id]);

    while (reverseQueue.length > 0) {
      const curr = reverseQueue.shift()!;
      for (const edge of validEdges) {
        if (edge.target === curr && !edge.isAsync) {
          impactedEdges.add(edge.id);
          if (!visitedUp.has(edge.source)) {
            visitedUp.add(edge.source);
            upstreamBlocked.add(edge.source);
            reverseQueue.push(edge.source);
          }
        }
      }
    }
  } else {
    // Resilient quorum only marks direct incident edges as active failover links
    for (const edge of validEdges) {
      if (edge.target === target.id || edge.source === target.id) {
        impactedEdges.add(edge.id);
      }
    }
  }

  // Trace downstream nodes starved of events/writes when hard_outage occurs
  const downstreamStarved = new Set<string>();
  if (verdict === 'hard_outage') {
    const forwardQueue: string[] = [target.id];
    const visitedDown = new Set<string>([target.id]);

    while (forwardQueue.length > 0) {
      const curr = forwardQueue.shift()!;
      for (const edge of validEdges) {
        if (edge.source === curr) {
          impactedEdges.add(edge.id);
          if (!visitedDown.has(edge.target)) {
            visitedDown.add(edge.target);
            downstreamStarved.add(edge.target);
            forwardQueue.push(edge.target);
          }
        }
      }
    }
  } else if (verdict === 'degraded_failover') {
    for (const edge of validEdges) {
      if (edge.source === target.id) {
        impactedEdges.add(edge.id);
        downstreamStarved.add(edge.target);
      }
    }
  }

  const reachesEdgeIngress =
    target.tier === 'edge' ||
    Array.from(upstreamBlocked).some(
      (id) => nodes.find((n) => n.id === id)?.tier === 'edge'
    );

  let estimatedAvailabilityPercent: number;
  let p99PenaltyMultiplier: number;
  let headline: string;
  let engineeringSummary: string;

  if (verdict === 'hard_outage') {
    estimatedAvailabilityPercent = reachesEdgeIngress ? 0.0 : 68.5;
    p99PenaltyMultiplier = 4.5;
    headline = `CRITICAL SPOF OUTAGE · 0/${totalReplicas} Active`;
    engineeringSummary = reachesEdgeIngress
      ? `${target.label} is a single-point-of-failure (${target.failureDomain}). Losing this node cascades synchronously upstream to ${upstreamBlocked.size} caller(s), causing a total availability outage on the primary request path.`
      : `${target.label} has no active failover replica (${target.failureDomain}), halting ${downstreamStarved.size} downstream pipeline(s) and dropping subsystem availability to 68.5%.`;
  } else if (verdict === 'degraded_failover') {
    estimatedAvailabilityPercent = 99.15;
    p99PenaltyMultiplier = 1.65;
    headline = `DEGRADED FAILOVER · ${survivingReplicas}/${totalReplicas} Replica Surviving`;
    engineeringSummary = `${target.label} survives via standby promotion (${survivingReplicas}/${totalReplicas} active), but incurs a 15–35s failover brownout and +65% tail latency spike across ${upstreamBlocked.size + 1} path component(s).`;
  } else {
    estimatedAvailabilityPercent = 99.99;
    p99PenaltyMultiplier = 1.06;
    headline = `RESILIENT QUORUM SURVIVED · ${survivingReplicas}/${totalReplicas} Replicas Healthy`;
    engineeringSummary = `${target.label} (${target.scalingModel}, ${target.failureDomain}) absorbs single-node failure seamlessly across ${survivingReplicas} remaining replicas with 99.99% SLA continuity and zero RPO.`;
  }

  return {
    failedNodeId: target.id,
    failedNodeLabel: target.label,
    verdict,
    survivingReplicas,
    totalReplicas,
    upstreamBlockedNodeIds: Array.from(upstreamBlocked),
    downstreamStarvedNodeIds: Array.from(downstreamStarved),
    impactedEdgeIds: Array.from(impactedEdges),
    estimatedAvailabilityPercent,
    p99PenaltyMultiplier,
    headline,
    engineeringSummary,
  };
}
