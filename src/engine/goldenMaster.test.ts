import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeXml,
  reconcileSelectionState,
  resolveWorkspaceShortcut,
  serializeBlueprintToJson,
  serializeTopologyToSvg,
  toSafeDownloadSlug,
} from './exportEngine';
import { synthesizeDeterministicBlueprint } from './deterministicCompiler';
import { runFinOpsSimulation } from './finopsSimulator';
import type { ArchitectureBlueprint, SimulationParams } from '../types/architecture';

test('serializeTopologyToSvg produces standalone, XML-safe vector diagram with zero foreignObject elements', () => {
  const compiled = synthesizeDeterministicBlueprint({
    prompt:
      'Design a FinTech payment ledger & fraud clearing engine <PCI> "Tier-1" at 12k RPS',
    compliancePreset: 'PCI_DSS',
    cloudProfile: 'aws',
  });

  const simParams: SimulationParams = {
    peakRps: 12_000,
    readRatioPercent: 60,
    payloadSizeKb: 16,
    multiRegion: true,
    cloudProfile: 'aws',
  };
  const simulation = runFinOpsSimulation(
    compiled.nodes,
    compiled.edges,
    simParams
  );

  const svg = serializeTopologyToSvg({
    blueprintName: 'Global Clearing & Settlement <Core>',
    domainTag: 'FinTech & Banking · "PCI-DSS"',
    versionLabel: 'v1 · Baseline',
    nodes: compiled.nodes,
    edges: compiled.edges,
    simulation,
  });

  assert.ok(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(svg.includes('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.endsWith('</svg>'));
  assert.equal(
    svg.includes('<foreignObject'),
    false,
    'Standalone SVG must not rely on HTML foreignObject'
  );
  assert.ok(svg.includes('Global Clearing &amp; Settlement &lt;Core&gt;'));
  assert.ok(svg.includes('&quot;PCI-DSS&quot;'));
  assert.ok(svg.includes(`Sync P99: ${simulation.endToEndP99Ms} ms`));

  for (const node of compiled.nodes) {
    assert.ok(
      svg.includes(`data-node-id="${escapeXml(node.id)}"`),
      `Expected SVG to render node ${node.id}`
    );
  }
  for (const edge of compiled.edges) {
    assert.ok(
      svg.includes(`data-edge-id="${escapeXml(edge.id)}"`),
      `Expected SVG to render edge ${edge.id}`
    );
  }
});

test('serializeBlueprintToJson outputs valid 1.1.0 portable JSON schema with live FinOps snapshot', () => {
  const compiled = synthesizeDeterministicBlueprint({
    prompt: 'Enterprise multi-tenant AI RAG platform at 5k RPS',
    compliancePreset: 'SOC2_ISO27001',
    cloudProfile: 'gcp',
  });

  const simParams: SimulationParams = {
    peakRps: 5_000,
    readRatioPercent: 80,
    payloadSizeKb: 24,
    multiRegion: false,
    cloudProfile: 'gcp',
  };
  const simulation = runFinOpsSimulation(
    compiled.nodes,
    compiled.edges,
    simParams
  );

  const blueprint: ArchitectureBlueprint = {
    id: 'bp-rag-test',
    name: compiled.name,
    domainTag: compiled.domainTag,
    prompt: 'Enterprise multi-tenant AI RAG platform at 5k RPS',
    updatedAt: '2026-05-01T00:00:00.000Z',
    activeVersionId: 'v1',
    defaultSimulation: simParams,
    versions: [
      {
        versionId: 'v1',
        versionLabel: 'v1 · Initial Compile',
        createdAt: '2026-05-01T00:00:00.000Z',
        nodes: compiled.nodes,
        edges: compiled.edges,
        audit: compiled.audit,
        artifacts: compiled.artifacts,
        synthesisEngine: compiled.synthesisEngine,
      },
    ],
  };

  const jsonText = serializeBlueprintToJson(
    blueprint,
    blueprint.versions[0],
    simulation,
    simParams,
    '2026-05-01T00:00:00.000Z'
  );

  const parsed = JSON.parse(jsonText) as {
    schemaVersion: string;
    exportedBy: string;
    blueprint: { id: string; activeVersionId: string };
    revision: { nodes: unknown[]; edges: unknown[] };
    liveSimulationSnapshot: { endToEndP99Ms: number; finops: { totalMonthlyUsd: number } };
  };

  assert.equal(parsed.schemaVersion, '1.1.0');
  assert.equal(parsed.exportedBy, 'ArchForge AI');
  assert.equal(parsed.blueprint.id, 'bp-rag-test');
  assert.equal(parsed.revision.nodes.length, compiled.nodes.length);
  assert.equal(parsed.revision.edges.length, compiled.edges.length);
  assert.equal(parsed.liveSimulationSnapshot.endToEndP99Ms, simulation.endToEndP99Ms);
  assert.equal(
    parsed.liveSimulationSnapshot.finops.totalMonthlyUsd,
    simulation.finops.totalMonthlyUsd
  );
  assert.equal(
    toSafeDownloadSlug('Global High-Frequency FinTech Gateway!'),
    'global-high-frequency-fintech-gateway'
  );
});

test('resolveWorkspaceShortcut ignores browser modifier combinations while supporting Cmd/Ctrl+K and bare keys', () => {
  // Browser native shortcuts must never be intercepted
  assert.equal(resolveWorkspaceShortcut({ key: 'f', ctrlKey: true }), null);
  assert.equal(resolveWorkspaceShortcut({ key: 'f', metaKey: true }), null);
  assert.equal(resolveWorkspaceShortcut({ key: 'c', ctrlKey: true }), null);
  assert.equal(resolveWorkspaceShortcut({ key: 'r', metaKey: true }), null);
  assert.equal(resolveWorkspaceShortcut({ key: '1', ctrlKey: true }), null);
  assert.equal(resolveWorkspaceShortcut({ key: '1', altKey: true }), null);
  assert.equal(resolveWorkspaceShortcut({ key: 'o', altKey: true }), null);

  // Cmd/Ctrl+K focuses prompt even when inside an input, unless modal/busy
  assert.equal(
    resolveWorkspaceShortcut({ key: 'k', metaKey: true, isEditable: true }),
    'focus_prompt'
  );
  assert.equal(
    resolveWorkspaceShortcut({ key: 'K', ctrlKey: true }),
    'focus_prompt'
  );
  assert.equal(
    resolveWorkspaceShortcut({ key: 'k', metaKey: true, isModalOpen: true }),
    null
  );

  // Editable input suppresses single-character shortcuts except Escape
  assert.equal(resolveWorkspaceShortcut({ key: '/', isEditable: true }), null);
  assert.equal(resolveWorkspaceShortcut({ key: 'f', isEditable: true }), null);
  assert.equal(
    resolveWorkspaceShortcut({ key: 'Escape', isEditable: true }),
    'escape'
  );

  // Bare workspace shortcuts
  assert.equal(resolveWorkspaceShortcut({ key: '/' }), 'focus_prompt');
  assert.equal(resolveWorkspaceShortcut({ key: 'f' }), 'fit_canvas');
  assert.equal(resolveWorkspaceShortcut({ key: 'F' }), 'fit_canvas');
  assert.equal(resolveWorkspaceShortcut({ key: 'o' }), 'toggle_outage');
  assert.equal(resolveWorkspaceShortcut({ key: '1' }), 'tab_topology');
  assert.equal(resolveWorkspaceShortcut({ key: '2' }), 'tab_audit');
  assert.equal(resolveWorkspaceShortcut({ key: '3' }), 'tab_artifacts');
});

test('reconcileSelectionState resets stale outage and highlight states across blueprint and version switches', () => {
  const compiled = synthesizeDeterministicBlueprint({
    prompt: 'Global multiplayer game matchmaking at 80k RPS',
    compliancePreset: 'SOC2_ISO27001',
    cloudProfile: 'aws',
  });

  const criticalNode = compiled.nodes.find((n) => n.spofRisk === 'CRITICAL');
  assert.ok(criticalNode, 'Expected v1 gaming blueprint to contain a SPOF node');

  // Switching blueprints (resetAllTransientStates = true) clears active outage
  const afterBlueprintSwitch = reconcileSelectionState({
    nodes: compiled.nodes,
    previousSelectedNodeId: 'stale-foreign-node',
    previousOutageNodeId: criticalNode.id,
    resetAllTransientStates: true,
  });
  assert.equal(afterBlueprintSwitch.selectedNodeId, criticalNode.id);
  assert.equal(afterBlueprintSwitch.highlightedNodeId, null);
  assert.equal(afterBlueprintSwitch.outageNodeId, null);

  // Switching versions where outage node still exists preserves outage comparison
  const afterSameLineageVersion = reconcileSelectionState({
    nodes: compiled.nodes,
    previousSelectedNodeId: compiled.nodes[2].id,
    previousOutageNodeId: criticalNode.id,
    resetAllTransientStates: false,
  });
  assert.equal(afterSameLineageVersion.selectedNodeId, compiled.nodes[2].id);
  assert.equal(afterSameLineageVersion.outageNodeId, criticalNode.id);

  // Switching versions where outage node was removed clears stale outage
  const afterRemovedNodeVersion = reconcileSelectionState({
    nodes: compiled.nodes.filter((n) => n.id !== criticalNode.id),
    previousSelectedNodeId: criticalNode.id,
    previousOutageNodeId: criticalNode.id,
    resetAllTransientStates: false,
  });
  assert.equal(afterRemovedNodeVersion.outageNodeId, null);
  assert.notEqual(afterRemovedNodeVersion.selectedNodeId, criticalNode.id);
});
