import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPromptDomainAndScale,
  synthesizeDeterministicAutoHeal,
  synthesizeDeterministicBlueprint,
} from './deterministicCompiler';
import { runFinOpsSimulation } from './finopsSimulator';
import { analyzeNodeOutage } from './chaosEngine';
import { DEFAULT_COMPILER_SETTINGS } from '../services/compilerClient';

function assertValidSynthesizedTopology(
  output: ReturnType<typeof synthesizeDeterministicBlueprint>
): void {
  assert.equal(output.synthesisEngine, 'deterministic-fallback');
  assert.ok(output.nodes.length >= 7 && output.nodes.length <= 9);
  assert.ok(output.edges.length >= 6);

  const tiers = new Set(output.nodes.map((n) => n.tier));
  for (const expectedTier of [
    'edge',
    'gateway',
    'compute',
    'messaging',
    'storage',
  ] as const) {
    assert.equal(
      tiers.has(expectedTier),
      true,
      `Expected topology to include tier ${expectedTier}`
    );
  }

  const nodeIds = new Set(output.nodes.map((n) => n.id));
  for (const edge of output.edges) {
    assert.ok(nodeIds.has(edge.source), `Missing edge source ${edge.source}`);
    assert.ok(nodeIds.has(edge.target), `Missing edge target ${edge.target}`);
    assert.notEqual(edge.source, edge.target);
  }

  const personas = new Set(output.audit.findings.map((f) => f.persona));
  assert.ok(personas.has('security'));
  assert.ok(personas.has('sre'));
  assert.ok(personas.has('finops'));

  for (const finding of output.audit.findings) {
    assert.ok(
      nodeIds.has(finding.targetNodeId),
      `Finding ${finding.id} references unknown node ${finding.targetNodeId}`
    );
  }

  assert.ok(output.artifacts.schemaSql.includes('CREATE TABLE'));
  assert.ok(output.artifacts.dockerComposeYml.includes('services:'));
  assert.ok(output.artifacts.openapiYaml.includes('openapi: 3.1.0'));
  assert.ok(output.artifacts.executiveRfcMd.startsWith('# Technical Architecture RFC:'));
}

test('default compiler settings use portable gemini-2.5-flash and LOW thinkingLevel', () => {
  assert.equal(DEFAULT_COMPILER_SETTINGS.geminiModel, 'gemini-2.5-flash');
  assert.equal(DEFAULT_COMPILER_SETTINGS.thinkingLevel, 'LOW');
  assert.equal(DEFAULT_COMPILER_SETTINGS.customApiKey, '');
});

test('deterministic compiler & auto-healer synthesize and harden Multiplayer Gaming architecture at 80k RPS', () => {
  const prompt =
    'Design a global multiplayer game matchmaking, anti-cheat telemetry, and leaderboard engine for 80k concurrent RPS';

  const compiled = synthesizeDeterministicBlueprint({
    prompt,
    compliancePreset: 'SOC2_ISO27001',
    cloudProfile: 'aws',
  });

  assert.equal(compiled.detectedDomain, 'gaming');
  assert.equal(compiled.recommendedPeakRps, 80_000);
  assertValidSynthesizedTopology(compiled);
  assert.ok(compiled.artifacts.schemaSql.includes('matchmaking_tickets'));
  assert.ok(compiled.artifacts.schemaSql.includes('anticheat_flags'));

  // Verify v1 SPOF triggers hard_outage in Chaos Engine
  const v1Outage = analyzeNodeOutage(
    compiled.nodes,
    compiled.edges,
    'leaderboard-redis-spof'
  );
  assert.ok(v1Outage !== null);
  assert.equal(v1Outage.verdict, 'hard_outage');

  // Auto-heal Gaming v1 -> v2
  const healed = synthesizeDeterministicAutoHeal({
    prompt,
    blueprintName: compiled.name,
    currentVersion: {
      versionId: 'v1',
      nodes: compiled.nodes,
      edges: compiled.edges,
      audit: compiled.audit,
      artifacts: compiled.artifacts,
    },
    compliancePreset: 'SOC2_ISO27001',
    cloudProfile: 'aws',
  });

  assert.equal(healed.synthesisEngine, 'deterministic-fallback');
  assert.ok(healed.nodes.every((n) => n.spofRisk !== 'CRITICAL'));
  assert.ok(healed.edges.every((e) => e.encrypted === true));
  assert.ok(healed.audit.securityScore >= 92);
  assert.ok(healed.audit.resilienceScore >= 94);
  assert.ok(healed.diffFromPrevious.remediatedRisks.length >= 2);
  assert.ok(healed.diffFromPrevious.addedNodes.length >= 1);

  const v2Outage = analyzeNodeOutage(
    healed.nodes,
    healed.edges,
    'leaderboard-redis-spof'
  );
  assert.ok(v2Outage !== null);
  assert.equal(v2Outage.verdict, 'resilient_quorum');
});

test('deterministic compiler & auto-healer synthesize and harden IoT Connected Vehicle Telemetry architecture', () => {
  const prompt =
    'Design an IoT fleet telemetry ingestion and predictive maintenance time-series platform for 250k connected vehicles';

  const compiled = synthesizeDeterministicBlueprint({
    prompt,
    compliancePreset: 'SOC2_ISO27001',
    cloudProfile: 'gcp',
  });

  assert.equal(compiled.detectedDomain, 'iot');
  assert.equal(compiled.recommendedPeakRps, 25_000);
  assertValidSynthesizedTopology(compiled);
  assert.ok(compiled.artifacts.schemaSql.includes('vehicle_telemetry_frames'));

  const healed = synthesizeDeterministicAutoHeal({
    prompt,
    blueprintName: compiled.name,
    currentVersion: {
      versionId: 'v1',
      nodes: compiled.nodes,
      edges: compiled.edges,
      audit: compiled.audit,
      artifacts: compiled.artifacts,
    },
    compliancePreset: 'SOC2_ISO27001',
    cloudProfile: 'gcp',
  });

  const simV1 = runFinOpsSimulation(compiled.nodes, compiled.edges, {
    peakRps: 25_000,
    readRatioPercent: 30,
    payloadSizeKb: 8,
    multiRegion: false,
    cloudProfile: 'gcp',
  });
  const simV2 = runFinOpsSimulation(healed.nodes, healed.edges, {
    peakRps: 25_000,
    readRatioPercent: 30,
    payloadSizeKb: 8,
    multiRegion: false,
    cloudProfile: 'gcp',
  });

  assert.ok(
    simV2.maxUtilizationPercent < simV1.maxUtilizationPercent,
    'Expected auto-healed IoT v2 to reduce peak utilization bottleneck'
  );
  assert.ok(simV2.endToEndP99Ms < simV1.endToEndP99Ms);
});

test('deterministic compiler & auto-healer synthesize and harden HIPAA Telemedicine WebRTC & Clinical AI architecture', () => {
  const prompt =
    'Design a HIPAA-compliant telemedicine WebRTC video & real-time AI transcription platform for 50k daily consultations';

  const compiled = synthesizeDeterministicBlueprint({
    prompt,
    compliancePreset: 'HIPAA',
    cloudProfile: 'aws',
  });

  assert.equal(compiled.detectedDomain, 'telemedicine');
  assert.ok(compiled.domainTag.includes('HIPAA'));
  assertValidSynthesizedTopology(compiled);
  assert.ok(compiled.artifacts.schemaSql.includes('clinical_consultations'));
  assert.ok(compiled.artifacts.schemaSql.includes('ENABLE ROW LEVEL SECURITY'));

  const healed = synthesizeDeterministicAutoHeal({
    prompt,
    blueprintName: compiled.name,
    currentVersion: {
      versionId: 'v1',
      nodes: compiled.nodes,
      edges: compiled.edges,
      audit: compiled.audit,
      artifacts: compiled.artifacts,
    },
    compliancePreset: 'HIPAA',
    cloudProfile: 'aws',
  });

  assert.ok(healed.diffFromPrevious.securityScoreDelta > 0);
  assert.ok(healed.diffFromPrevious.resilienceScoreDelta > 0);
  assert.ok(healed.artifacts.openapiYaml.includes('version: 2.0.0'));
});

test('domain detector covers FinTech, AI RAG, E-Commerce, Media Streaming, and General SaaS prompts', () => {
  assert.equal(
    detectPromptDomainAndScale('Global PCI payment clearing ledger at 15k RPS')
      .domain,
    'fintech'
  );
  assert.equal(
    detectPromptDomainAndScale('Enterprise multi-tenant RAG vector copilot')
      .domain,
    'ai_rag'
  );
  assert.equal(
    detectPromptDomainAndScale('Flash sale e-commerce checkout and cart engine')
      .domain,
    'ecommerce'
  );
  assert.equal(
    detectPromptDomainAndScale('Live HLS video transcoding and CDN streaming')
      .domain,
    'media'
  );
  assert.equal(
    detectPromptDomainAndScale('Multi-tenant B2B project workflow platform')
      .domain,
    'saas'
  );
});
