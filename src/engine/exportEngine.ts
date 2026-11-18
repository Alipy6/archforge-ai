import type {
  ArchEdge,
  ArchitectureBlueprint,
  ArchitectureVersion,
  ArchNode,
  NodePosition,
  SimulationParams,
  SimulationResult,
} from '../types/architecture';
import {
  CANVAS_PADDING_X,
  COLUMN_X_STEP,
  computeAllEdgeGeometries,
  computeTierLayout,
  NODE_CARD_HEIGHT,
  NODE_CARD_WIDTH,
  TIER_METADATA,
  TIER_ORDER,
} from './layoutEngine';

const PROTOCOL_STROKE: Record<ArchEdge['protocol'], string> = {
  HTTPS: '#38bdf8',
  gRPC: '#818cf8',
  Kafka: '#f59e0b',
  WebSocket: '#34d399',
  SQL: '#c084fc',
  'Redis RESP': '#fb7185',
  'S3 API': '#94a3b8',
};

export function escapeXml(raw: string): string {
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

export function toSafeDownloadSlug(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'archforge-blueprint';
}

export interface TopologySvgExportOptions {
  blueprintName: string;
  domainTag: string;
  versionLabel: string;
  nodes: ArchNode[];
  edges: ArchEdge[];
  positions?: Record<string, NodePosition>;
  simulation: SimulationResult;
}

/**
 * Serializes the active 5-tier system architecture into a standalone, portable SVG
 * vector diagram using pure SVG primitives (zero foreignObject dependencies) so it
 * renders crisply in GitHub READMEs, Notion, Confluence, Figma, and browsers.
 */
export function serializeTopologyToSvg(
  options: TopologySvgExportOptions
): string {
  const {
    blueprintName,
    domainTag,
    versionLabel,
    nodes,
    edges,
    positions: customPositions,
    simulation,
  } = options;

  const baseLayout = computeTierLayout(nodes);
  const mergedPositions: Record<string, NodePosition> = {};

  let maxRight = baseLayout.bounds.width;
  let maxBottom = baseLayout.bounds.height;

  for (const node of nodes) {
    const pos =
      customPositions?.[node.id] ??
      baseLayout.positions[node.id] ?? { x: 80, y: 80 };
    mergedPositions[node.id] = pos;
    maxRight = Math.max(maxRight, pos.x + NODE_CARD_WIDTH + CANVAS_PADDING_X);
    maxBottom = Math.max(maxBottom, pos.y + NODE_CARD_HEIGHT + 44);
  }

  const headerHeight = 76;
  const svgWidth = Math.max(1420, Math.ceil(maxRight));
  const svgHeight = Math.ceil(maxBottom + headerHeight);

  const edgeGeoms = computeAllEdgeGeometries(edges, mergedPositions);
  const criticalSet = new Set(simulation.criticalPathNodeIds);

  const markerDefs = Object.entries(PROTOCOL_STROKE)
    .map(([proto, color]) => {
      const safeId = proto.replace(/\s+/g, '-').toLowerCase();
      return `<marker id="arrow-${safeId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="${color}" /></marker>`;
    })
    .join('\n      ');

  const tierHeadersSvg = TIER_ORDER.map((tier) => {
    const meta = TIER_METADATA[tier];
    const laneX = CANVAS_PADDING_X + meta.index * COLUMN_X_STEP;
    const laneY = headerHeight + 16;
    return [
      `<g transform="translate(${laneX}, ${laneY})">`,
      `  <text x="0" y="12" fill="#e4e4e7" font-family="Plus Jakarta Sans, Inter, system-ui, sans-serif" font-size="12" font-weight="600">0${meta.index + 1}. ${escapeXml(meta.title)}</text>`,
      `  <text x="0" y="27" fill="#71717a" font-family="Plus Jakarta Sans, Inter, system-ui, sans-serif" font-size="10">${escapeXml(meta.subtitle)}</text>`,
      `  <line x1="0" y1="35" x2="${NODE_CARD_WIDTH}" y2="35" stroke="#27272a" stroke-width="1" />`,
      `</g>`,
    ].join('\n    ');
  }).join('\n    ');

  const edgesSvg = edgeGeoms
    .map(({ edge, pathD, labelX, labelY }) => {
      const color = PROTOCOL_STROKE[edge.protocol] ?? '#38bdf8';
      const markerKey = edge.protocol.replace(/\s+/g, '-').toLowerCase();
      const isCriticalHop =
        !edge.isAsync &&
        criticalSet.has(edge.source) &&
        criticalSet.has(edge.target);

      const badgeText = `${edge.encrypted ? 'TLS' : 'PLAIN'} · ${edge.protocol}${edge.isAsync ? ' · async' : ''}`;
      const badgeWidth = Math.max(84, badgeText.length * 6.1 + 16);
      const pillStroke = !edge.encrypted
        ? '#f59e0b'
        : isCriticalHop
          ? '#38bdf8'
          : '#27272a';
      const pillTextFill = !edge.encrypted ? '#fcd34d' : '#d4d4d8';

      return [
        `<g data-edge-id="${escapeXml(edge.id)}">`,
        `  <path d="${pathD}" fill="none" stroke="${color}" stroke-opacity="0.22" stroke-width="2.2" />`,
        `  <path d="${pathD}" fill="none" stroke="${color}" stroke-opacity="${isCriticalHop ? '0.9' : '0.72'}" stroke-width="${isCriticalHop ? '2' : '1.5'}" ${edge.isAsync ? 'stroke-dasharray="5 4"' : ''} marker-end="url(#arrow-${markerKey})" />`,
        `  <rect x="${Math.round(labelX - badgeWidth / 2)}" y="${Math.round(labelY - 10)}" width="${Math.round(badgeWidth)}" height="20" rx="4" fill="#09090b" fill-opacity="0.96" stroke="${pillStroke}" stroke-width="1" />`,
        `  <text x="${Math.round(labelX)}" y="${Math.round(labelY + 3.5)}" text-anchor="middle" fill="${pillTextFill}" font-family="JetBrains Mono, ui-monospace, monospace" font-size="9.5">${escapeXml(badgeText)}</text>`,
        `</g>`,
      ].join('\n      ');
    })
    .join('\n      ');

  const nodesSvg = nodes
    .map((node) => {
      const pos = mergedPositions[node.id] ?? { x: 80, y: 80 };
      const metrics = simulation.nodeMetrics[node.id];
      const util = metrics?.utilizationPercent ?? 0;
      const status = metrics?.status ?? 'nominal';
      const p99Ms = metrics?.simulatedP99Ms ?? node.baseLatencyMs;
      const monthlyUsd = metrics?.monthlyCostUsd ?? node.baseMonthlyCostUsd;

      const cardStroke =
        status === 'saturated'
          ? '#ef4444'
          : status === 'elevated'
            ? '#f59e0b'
            : '#27272a';

      const spofText =
        node.spofRisk === 'CRITICAL'
          ? 'SPOF'
          : node.spofRisk === 'MODERATE'
            ? 'Risk: Mod'
            : 'HA';
      const spofColor =
        node.spofRisk === 'CRITICAL'
          ? '#f87171'
          : node.spofRisk === 'MODERATE'
            ? '#fbbf24'
            : '#34d399';

      const statusLabel =
        status === 'saturated'
          ? `SATURATED ${util}%`
          : status === 'elevated'
            ? `ELEVATED ${util}%`
            : `LOAD ${util}%`;
      const statusColor =
        status === 'saturated'
          ? '#f87171'
          : status === 'elevated'
            ? '#fbbf24'
            : '#a1a1aa';

      const barFill =
        status === 'saturated'
          ? '#ef4444'
          : status === 'elevated'
            ? '#f59e0b'
            : '#38bdf8';

      const innerBarMax = NODE_CARD_WIDTH - 24;
      const barWidth = Math.max(
        2,
        Math.round(innerBarMax * Math.min(1, Math.max(0, util / 100)))
      );

      return [
        `<g transform="translate(${pos.x}, ${pos.y})" data-node-id="${escapeXml(node.id)}">`,
        `  <title>${escapeXml(node.label)} — ${escapeXml(node.technology)}</title>`,
        `  <rect x="0" y="0" width="${NODE_CARD_WIDTH}" height="${NODE_CARD_HEIGHT}" rx="8" fill="#111114" stroke="${cardStroke}" stroke-width="1.25" />`,
        `  <text x="12" y="21" fill="#a1a1aa" font-family="JetBrains Mono, ui-monospace, monospace" font-size="10">${node.replicas}x · ${node.isStateful ? 'Stateful' : 'Stateless'}</text>`,
        `  <text x="${NODE_CARD_WIDTH - 12}" y="21" text-anchor="end" fill="${spofColor}" font-family="JetBrains Mono, ui-monospace, monospace" font-size="10" font-weight="600">${escapeXml(spofText)}</text>`,
        `  <text x="12" y="43" fill="#f4f4f5" font-family="Plus Jakarta Sans, Inter, system-ui, sans-serif" font-size="13" font-weight="600">${escapeXml(truncateText(node.label, 25))}</text>`,
        `  <text x="12" y="61" fill="#a1a1aa" font-family="Plus Jakarta Sans, Inter, system-ui, sans-serif" font-size="11">${escapeXml(truncateText(node.technology, 30))}</text>`,
        `  <line x1="12" y1="80" x2="${NODE_CARD_WIDTH - 12}" y2="80" stroke="#27272a" stroke-width="1" />`,
        `  <text x="12" y="96" fill="${statusColor}" font-family="JetBrains Mono, ui-monospace, monospace" font-size="10">${escapeXml(statusLabel)}</text>`,
        `  <text x="${NODE_CARD_WIDTH - 12}" y="96" text-anchor="end" fill="#d4d4d8" font-family="JetBrains Mono, ui-monospace, monospace" font-size="10">${p99Ms}ms · $${monthlyUsd.toLocaleString()}/m</text>`,
        `  <rect x="12" y="105" width="${innerBarMax}" height="6" rx="2" fill="#27272a" />`,
        `  <rect x="12" y="105" width="${barWidth}" height="6" rx="2" fill="${barFill}" />`,
        `</g>`,
      ].join('\n      ');
    })
    .join('\n      ');

  const summaryRight = `Sync P99: ${simulation.endToEndP99Ms} ms · Est. Cloud Spend: $${simulation.finops.totalMonthlyUsd.toLocaleString()}/mo · ${nodes.length} Nodes · ${edges.length} Flows`;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}" role="img" aria-label="${escapeXml(blueprintName)} Architecture Topology">`,
    `  <defs>`,
    `    <pattern id="arch-grid" width="24" height="24" patternUnits="userSpaceOnUse">`,
    `      <circle cx="1" cy="1" r="1" fill="#27272a" fill-opacity="0.65" />`,
    `    </pattern>`,
    `    ${markerDefs}`,
    `  </defs>`,
    `  <rect width="${svgWidth}" height="${svgHeight}" fill="#09090b" />`,
    `  <rect y="${headerHeight}" width="${svgWidth}" height="${svgHeight - headerHeight}" fill="url(#arch-grid)" />`,
    `  <rect width="${svgWidth}" height="${headerHeight}" fill="#111114" />`,
    `  <line x1="0" y1="${headerHeight}" x2="${svgWidth}" y2="${headerHeight}" stroke="#27272a" stroke-width="1" />`,
    `  <text x="${CANVAS_PADDING_X}" y="31" fill="#f4f4f5" font-family="Plus Jakarta Sans, Inter, system-ui, sans-serif" font-size="16" font-weight="700">${escapeXml(blueprintName)}</text>`,
    `  <text x="${CANVAS_PADDING_X}" y="53" fill="#a1a1aa" font-family="JetBrains Mono, ui-monospace, monospace" font-size="11">ArchForge AI · ${escapeXml(versionLabel)} · ${escapeXml(domainTag)}</text>`,
    `  <text x="${svgWidth - CANVAS_PADDING_X}" y="44" text-anchor="end" fill="#38bdf8" font-family="JetBrains Mono, ui-monospace, monospace" font-size="11.5" font-weight="600">${escapeXml(summaryRight)}</text>`,
    `  ${tierHeadersSvg}`,
    `  <g transform="translate(0, ${headerHeight})">`,
    `    ${edgesSvg}`,
    `    ${nodesSvg}`,
    `  </g>`,
    `</svg>`,
  ].join('\n');
}

export interface ExportedBlueprintBundle {
  schemaVersion: '1.1.0';
  exportedBy: 'ArchForge AI';
  exportedAt: string;
  blueprint: {
    id: string;
    name: string;
    domainTag: string;
    prompt: string;
    activeVersionId: string;
  };
  revision: {
    versionId: string;
    versionLabel: string;
    createdAt: string;
    synthesisEngine: string;
    nodes: ArchNode[];
    edges: ArchEdge[];
    audit: ArchitectureVersion['audit'];
    diffFromPrevious?: ArchitectureVersion['diffFromPrevious'];
  };
  liveSimulationSnapshot: {
    parameters: SimulationParams;
    endToEndP99Ms: number;
    bottleneckNodeId: string | null;
    maxUtilizationPercent: number;
    saturatedCount: number;
    finops: SimulationResult['finops'];
  };
}

export function serializeBlueprintToJson(
  blueprint: ArchitectureBlueprint,
  activeVersion: ArchitectureVersion,
  simulation: SimulationResult,
  simulationParams: SimulationParams,
  exportedAt = new Date().toISOString()
): string {
  const bundle: ExportedBlueprintBundle = {
    schemaVersion: '1.1.0',
    exportedBy: 'ArchForge AI',
    exportedAt,
    blueprint: {
      id: blueprint.id,
      name: blueprint.name,
      domainTag: blueprint.domainTag,
      prompt: blueprint.prompt,
      activeVersionId: activeVersion.versionId,
    },
    revision: {
      versionId: activeVersion.versionId,
      versionLabel: activeVersion.versionLabel,
      createdAt: activeVersion.createdAt,
      synthesisEngine: activeVersion.synthesisEngine ?? 'gemini-live',
      nodes: activeVersion.nodes,
      edges: activeVersion.edges,
      audit: activeVersion.audit,
      ...(activeVersion.diffFromPrevious
        ? { diffFromPrevious: activeVersion.diffFromPrevious }
        : {}),
    },
    liveSimulationSnapshot: {
      parameters: simulationParams,
      endToEndP99Ms: simulation.endToEndP99Ms,
      bottleneckNodeId: simulation.bottleneckNodeId,
      maxUtilizationPercent: simulation.maxUtilizationPercent,
      saturatedCount: simulation.saturatedCount,
      finops: simulation.finops,
    },
  };

  return JSON.stringify(bundle, null, 2);
}

export type WorkspaceShortcutAction =
  | 'focus_prompt'
  | 'escape'
  | 'fit_canvas'
  | 'toggle_outage'
  | 'tab_topology'
  | 'tab_audit'
  | 'tab_artifacts';

export interface ShortcutEventDescriptor {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isEditable?: boolean;
  isBusy?: boolean;
  isModalOpen?: boolean;
}

/**
 * Resolves global keyboard shortcuts while strictly ignoring browser/OS modifier
 * combinations (Ctrl/Cmd+F, Ctrl/Cmd+C, Ctrl/Cmd+R, Alt+1, etc.), except Cmd/Ctrl+K.
 */
export function resolveWorkspaceShortcut(
  event: ShortcutEventDescriptor
): WorkspaceShortcutAction | null {
  const {
    key,
    ctrlKey = false,
    metaKey = false,
    altKey = false,
    isEditable = false,
    isBusy = false,
    isModalOpen = false,
  } = event;

  if ((metaKey || ctrlKey) && !altKey && key.toLowerCase() === 'k') {
    if (isBusy || isModalOpen) return null;
    return 'focus_prompt';
  }

  // Never intercept browser shortcuts when any modifier key is held
  if (ctrlKey || metaKey || altKey) {
    return null;
  }

  if (key === 'Escape') {
    return 'escape';
  }

  if (isEditable || isBusy || isModalOpen) {
    return null;
  }

  if (key === '/') return 'focus_prompt';
  if (key === 'f' || key === 'F') return 'fit_canvas';
  if (key === 'o' || key === 'O') return 'toggle_outage';
  if (key === '1') return 'tab_topology';
  if (key === '2') return 'tab_audit';
  if (key === '3') return 'tab_artifacts';

  return null;
}

export interface SelectionStateInput {
  nodes: ArchNode[];
  previousSelectedNodeId: string | null;
  previousOutageNodeId: string | null;
  resetAllTransientStates?: boolean;
}

export interface ReconciledSelectionState {
  selectedNodeId: string | null;
  highlightedNodeId: null;
  outageNodeId: string | null;
}

/**
 * Reconciles selected node, audit highlight, and Chaos outage state when switching
 * blueprints or versions so stale node IDs never persist across topology changes.
 */
export function reconcileSelectionState(
  input: SelectionStateInput
): ReconciledSelectionState {
  const {
    nodes,
    previousSelectedNodeId,
    previousOutageNodeId,
    resetAllTransientStates = false,
  } = input;

  const nodeIds = new Set(nodes.map((n) => n.id));
  const defaultNodeId =
    nodes.find((n) => n.spofRisk === 'CRITICAL')?.id ?? nodes[0]?.id ?? null;

  if (resetAllTransientStates) {
    return {
      selectedNodeId: defaultNodeId,
      highlightedNodeId: null,
      outageNodeId: null,
    };
  }

  const selectedNodeId =
    previousSelectedNodeId && nodeIds.has(previousSelectedNodeId)
      ? previousSelectedNodeId
      : defaultNodeId;

  const outageNodeId =
    previousOutageNodeId && nodeIds.has(previousOutageNodeId)
      ? previousOutageNodeId
      : null;

  return {
    selectedNodeId,
    highlightedNodeId: null,
    outageNodeId,
  };
}
