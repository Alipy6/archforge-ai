import test from 'node:test';
import assert from 'node:assert/strict';
import { runFinOpsSimulation } from './finopsSimulator';
import { analyzeNodeOutage } from './chaosEngine';
import {
  computeTierLayout,
  computeEdgeGeometry,
  computeAllEdgeGeometries,
} from './layoutEngine';
import {
  computeNextVersionId,
  isValidBlueprint,
  sanitizeArtifacts,
  sanitizeGraphReferences,
} from '../services/compilerClient';
import { DEMO_BLUEPRINTS } from '../data/demoBlueprints';
import type { ArchEdge, ArchNode } from '../types/architecture';

test('demo blueprints load cleanly with valid node and edge references', () => {
  assert.equal(DEMO_BLUEPRINTS.length, 2);

  for (const blueprint of DEMO_BLUEPRINTS) {
    assert.equal(isValidBlueprint(blueprint), true);
    assert.ok(blueprint.versions.length >= 1);
    for (const version of blueprint.versions) {
      assert.ok(version.nodes.length >= 6);
      const nodeIds = new Set(version.nodes.map((n) => n.id));

      for (const edge of version.edges) {
        assert.ok(
          nodeIds.has(edge.source),
          `Edge ${edge.id} references missing source ${edge.source}`
        );
        assert.ok(
          nodeIds.has(edge.target),
          `Edge ${edge.id} references missing target ${edge.target}`
        );
      }

      for (const finding of version.audit.findings) {
        assert.ok(
          nodeIds.has(finding.targetNodeId),
          `Finding ${finding.id} references missing node ${finding.targetNodeId}`
        );
      }

      assert.ok(version.artifacts.schemaSql.includes('CREATE TABLE'));
      assert.ok(version.artifacts.dockerComposeYml.includes('services:'));
      assert.ok(version.artifacts.openapiYaml.includes('openapi: 3.1.0'));
      assert.ok(version.artifacts.executiveRfcMd.startsWith('# '));
    }
  }
});

test('simulator scales utilization, latency, and monthly cost monotonically across boundary slider values', () => {
  const fintechV1 = DEMO_BLUEPRINTS[0].versions[0];

  const minBoundary = runFinOpsSimulation(fintechV1.nodes, fintechV1.edges, {
    peakRps: 10,
    readRatioPercent: 95,
    payloadSizeKb: 2,
    multiRegion: false,
    cloudProfile: 'aws',
  });

  const midPayload = runFinOpsSimulation(fintechV1.nodes, fintechV1.edges, {
    peakRps: 10,
    readRatioPercent: 95,
    payloadSizeKb: 16,
    multiRegion: false,
    cloudProfile: 'aws',
  });

  const maxBoundary = runFinOpsSimulation(fintechV1.nodes, fintechV1.edges, {
    peakRps: 100_000,
    readRatioPercent: 20,
    payloadSizeKb: 5120,
    multiRegion: true,
    cloudProfile: 'hybrid',
  });

  // Verify 2KB -> 16KB strictly increases serialization latency / egress
  assert.ok(
    midPayload.endToEndP99Ms > minBoundary.endToEndP99Ms,
    'Expected 16 KB payload to incur higher P99 than 2 KB payload'
  );
  assert.equal(minBoundary.saturatedCount, 0);
  assert.ok(maxBoundary.saturatedCount >= 1);
  assert.ok(Number.isFinite(maxBoundary.endToEndP99Ms));
  assert.ok(Number.isFinite(maxBoundary.finops.totalMonthlyUsd));
  assert.ok(maxBoundary.finops.totalMonthlyUsd > minBoundary.finops.totalMonthlyUsd);
  assert.equal(
    maxBoundary.finops.totalMonthlyUsd,
    maxBoundary.finops.computeUsd +
      maxBoundary.finops.storageUsd +
      maxBoundary.finops.networkUsd +
      maxBoundary.finops.aiQueueUsd
  );
});

test('simulator resists NaN/Infinity propagation on malformed numeric inputs and cyclic graphs', () => {
  const cyclicNodes: ArchNode[] = [
    {
      id: 'svc-a',
      label: 'Service A',
      tier: 'compute',
      technology: 'Go',
      justification: 'Cycle test A',
      scalingModel: 'Horizontal Auto-Scale',
      spofRisk: 'LOW',
      baseLatencyMs: Number.NaN,
      baseMonthlyCostUsd: -500,
      maxCapacityRps: 0,
      costCategory: 'compute',
      isStateful: false,
      replicas: 3,
      failureDomain: '3-AZ',
    },
    {
      id: 'svc-b',
      label: 'Service B',
      tier: 'storage',
      technology: 'Postgres',
      justification: 'Cycle test B',
      scalingModel: 'Partitioned Cluster',
      spofRisk: 'NONE',
      baseLatencyMs: 8,
      baseMonthlyCostUsd: 900,
      maxCapacityRps: 12000,
      costCategory: 'storage',
      isStateful: true,
      replicas: 3,
      failureDomain: '3-AZ',
    },
  ];

  const cyclicEdges: ArchEdge[] = [
    {
      id: 'c1',
      source: 'svc-a',
      target: 'svc-b',
      protocol: 'gRPC',
      label: 'A->B',
      isAsync: false,
      encrypted: true,
    },
    {
      id: 'c2',
      source: 'svc-b',
      target: 'svc-a',
      protocol: 'gRPC',
      label: 'B->A',
      isAsync: false,
      encrypted: true,
    },
  ];

  const result = runFinOpsSimulation(cyclicNodes, cyclicEdges, {
    peakRps: Number.POSITIVE_INFINITY,
    readRatioPercent: Number.NaN,
    payloadSizeKb: -40,
    multiRegion: false,
    cloudProfile: 'unknown' as 'aws',
  });

  assert.ok(Number.isFinite(result.endToEndP99Ms) && result.endToEndP99Ms > 0);
  assert.ok(
    Number.isFinite(result.finops.totalMonthlyUsd) &&
      result.finops.totalMonthlyUsd > 0
  );
  assert.equal(result.criticalPathNodeIds.length, 2);
});

test('auto-healed v2 Fintech architecture achieves lower saturation and P99 under heavy load than v1', () => {
  const v1 = DEMO_BLUEPRINTS[0].versions[0];
  const v2 = DEMO_BLUEPRINTS[0].versions[1];

  const stressParams = {
    peakRps: 18000,
    readRatioPercent: 55,
    payloadSizeKb: 16,
    multiRegion: false,
    cloudProfile: 'aws' as const,
  };

  const simV1 = runFinOpsSimulation(v1.nodes, v1.edges, stressParams);
  const simV2 = runFinOpsSimulation(v2.nodes, v2.edges, stressParams);

  assert.ok(simV1.maxUtilizationPercent > 95);
  assert.ok(simV2.maxUtilizationPercent < simV1.maxUtilizationPercent);
  assert.ok(simV2.endToEndP99Ms < simV1.endToEndP99Ms);
});

test('chaos blast-radius engine distinguishes v1 CRITICAL SPOF hard outage from v2 resilient Raft quorum', () => {
  const v1 = DEMO_BLUEPRINTS[0].versions[0];
  const v2 = DEMO_BLUEPRINTS[0].versions[1];

  const v1LedgerOutage = analyzeNodeOutage(v1.nodes, v1.edges, 'ledger-postgres');
  assert.ok(v1LedgerOutage !== null);
  assert.equal(v1LedgerOutage.verdict, 'hard_outage');
  assert.equal(v1LedgerOutage.survivingReplicas, 0);
  assert.equal(v1LedgerOutage.estimatedAvailabilityPercent, 0.0);
  assert.ok(
    v1LedgerOutage.upstreamBlockedNodeIds.includes('payment-orchestrator'),
    'Expected Payment Orchestrator to be synchronously blocked by v1 ledger outage'
  );
  assert.ok(
    v1LedgerOutage.upstreamBlockedNodeIds.includes('edge-waf'),
    'Expected synchronous failure to cascade back to Edge WAF in v1'
  );

  const v2LedgerOutage = analyzeNodeOutage(v2.nodes, v2.edges, 'ledger-postgres');
  assert.ok(v2LedgerOutage !== null);
  assert.equal(v2LedgerOutage.verdict, 'resilient_quorum');
  assert.equal(v2LedgerOutage.survivingReplicas, 8);
  assert.equal(v2LedgerOutage.estimatedAvailabilityPercent, 99.99);
  assert.equal(v2LedgerOutage.upstreamBlockedNodeIds.length, 0);
});

test('tier layout engine positions all nodes distinctly and de-collides fan-out protocol badges', () => {
  const fintechV1 = DEMO_BLUEPRINTS[0].versions[0];
  const { positions, bounds } = computeTierLayout(fintechV1.nodes);

  assert.ok(bounds.width > 1200);
  assert.ok(bounds.height >= 580);

  const coordSet = new Set<string>();
  for (const node of fintechV1.nodes) {
    const pos = positions[node.id];
    assert.ok(pos, `Missing position for node ${node.id}`);
    const key = `${pos.x}:${pos.y}`;
    assert.equal(coordSet.has(key), false, `Overlapping node coordinate ${key}`);
    coordSet.add(key);
  }

  const allGeoms = computeAllEdgeGeometries(fintechV1.edges, positions);
  assert.equal(allGeoms.length, fintechV1.edges.length);

  for (let i = 0; i < allGeoms.length; i++) {
    assert.ok(computeEdgeGeometry(fintechV1.edges[i], positions) !== null);
    for (let j = i + 1; j < allGeoms.length; j++) {
      const dx = Math.abs(allGeoms[i].labelX - allGeoms[j].labelX);
      const dy = Math.abs(allGeoms[i].labelY - allGeoms[j].labelY);
      assert.equal(
        dx < 88 && dy < 24,
        false,
        `Protocol badges collided between ${allGeoms[i].edge.id} and ${allGeoms[j].edge.id}`
      );
    }
  }
});

test('LLM graph & artifact sanitizer repairs duplicate IDs, self-edges, hallucinated targets, and version increments', () => {
  const dirtyNodes = [
    {
      id: 'dup-node',
      label: 'Primary API',
      tier: 'invalid-tier' as 'compute',
      technology: 'Node.js',
      justification: 'API',
      scalingModel: 'Horizontal Auto-Scale' as const,
      spofRisk: 'LOW' as const,
      baseLatencyMs: -15,
      baseMonthlyCostUsd: Number.NaN,
      maxCapacityRps: 10,
      costCategory: 'compute' as const,
      isStateful: false,
      replicas: 0,
      failureDomain: 'AZ-1',
    },
    {
      id: 'dup-node',
      label: 'Database',
      tier: 'storage' as const,
      technology: 'PostgreSQL',
      justification: 'DB',
      scalingModel: 'Partitioned Cluster' as const,
      spofRisk: 'NONE' as const,
      baseLatencyMs: 9,
      baseMonthlyCostUsd: 1200,
      maxCapacityRps: 25000,
      costCategory: 'storage' as const,
      isStateful: true,
      replicas: 3,
      failureDomain: '3-AZ',
    },
  ];

  const dirtyEdges: ArchEdge[] = [
    {
      id: 'self-loop',
      source: 'dup-node',
      target: 'dup-node',
      protocol: 'HTTPS',
      label: 'Loop',
      isAsync: false,
      encrypted: true,
    },
    {
      id: 'valid-hop',
      source: 'dup-node',
      target: 'dup-node-2',
      protocol: 'SQL',
      label: 'Query',
      isAsync: false,
      encrypted: true,
    },
  ];

  const sanitized = sanitizeGraphReferences(dirtyNodes, dirtyEdges, {
    securityScore: 145,
    resilienceScore: -20,
    costEfficiencyScore: Number.NaN,
    executiveSummary: '',
    findings: [
      {
        id: 'f1',
        persona: 'security',
        severity: 'CRITICAL',
        title: 'Hallucinated node ref',
        analysis: 'Test',
        recommendation: 'Fix',
        targetNodeId: 'non-existent-ghost-node',
        estimatedImpact: 'High',
      },
    ],
  });

  assert.equal(sanitized.nodes.length, 2);
  assert.notEqual(sanitized.nodes[0].id, sanitized.nodes[1].id);
  assert.equal(sanitized.edges.length, 1, 'Self-loop should be stripped');
  assert.equal(sanitized.audit.securityScore, 100);
  assert.equal(sanitized.audit.resilienceScore, 0);
  assert.equal(sanitized.audit.costEfficiencyScore, 75);
  assert.equal(sanitized.audit.findings[0].targetNodeId, 'dup-node');

  const repairedArtifacts = sanitizeArtifacts({}, 'Test Blueprint');
  assert.ok(repairedArtifacts.schemaSql.includes('CREATE TABLE'));
  assert.ok(repairedArtifacts.openapiYaml.includes('openapi: 3.1.0'));

  const nextVer = computeNextVersionId(DEMO_BLUEPRINTS[0].versions);
  assert.equal(nextVer, 'v3');
});
