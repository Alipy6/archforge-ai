import type { ArchEdge, ArchNode, ArchTier, NodePosition } from '../types/architecture';

export const TIER_ORDER: readonly ArchTier[] = [
  'edge',
  'gateway',
  'compute',
  'messaging',
  'storage',
] as const;

export const TIER_METADATA: Record<
  ArchTier,
  { index: number; title: string; subtitle: string }
> = {
  edge: {
    index: 0,
    title: 'Edge & Client',
    subtitle: 'Ingress · WAF · CDN',
  },
  gateway: {
    index: 1,
    title: 'Gateway & Auth',
    subtitle: 'Zero-Trust · Rate Limit',
  },
  compute: {
    index: 2,
    title: 'Compute & Services',
    subtitle: 'Core Domain · Orchestration',
  },
  messaging: {
    index: 3,
    title: 'Async & Messaging',
    subtitle: 'Event Bus · Durable Queues',
  },
  storage: {
    index: 4,
    title: 'Cache, Storage & AI',
    subtitle: 'Consensus DB · Vector · Object',
  },
};

export const NODE_CARD_WIDTH = 216;
export const NODE_CARD_HEIGHT = 124;
export const COLUMN_X_STEP = 286;
export const ROW_Y_STEP = 162;
export const CANVAS_PADDING_X = 36;
export const CANVAS_PADDING_Y = 76;

export interface CanvasBounds {
  width: number;
  height: number;
}

export function computeTierLayout(nodes: ArchNode[]): {
  positions: Record<string, NodePosition>;
  bounds: CanvasBounds;
} {
  const grouped: Record<ArchTier, ArchNode[]> = {
    edge: [],
    gateway: [],
    compute: [],
    messaging: [],
    storage: [],
  };

  for (const node of nodes) {
    const tier = TIER_ORDER.includes(node.tier) ? node.tier : 'compute';
    grouped[tier].push(node);
  }

  const maxRows = Math.max(
    1,
    ...TIER_ORDER.map((tier) => grouped[tier].length)
  );

  const totalInnerHeight =
    maxRows * NODE_CARD_HEIGHT +
    Math.max(0, maxRows - 1) * (ROW_Y_STEP - NODE_CARD_HEIGHT);
  const canvasHeight = Math.max(580, totalInnerHeight + CANVAS_PADDING_Y * 2);
  const canvasWidth =
    CANVAS_PADDING_X * 2 +
    (TIER_ORDER.length - 1) * COLUMN_X_STEP +
    NODE_CARD_WIDTH;

  const positions: Record<string, NodePosition> = {};

  for (const tier of TIER_ORDER) {
    const tierNodes = grouped[tier];
    if (tierNodes.length === 0) continue;

    const colIndex = TIER_METADATA[tier].index;
    const x = CANVAS_PADDING_X + colIndex * COLUMN_X_STEP;

    const columnContentHeight =
      tierNodes.length * NODE_CARD_HEIGHT +
      Math.max(0, tierNodes.length - 1) * (ROW_Y_STEP - NODE_CARD_HEIGHT);

    const startY = Math.max(
      CANVAS_PADDING_Y,
      Math.round((canvasHeight - columnContentHeight) / 2)
    );

    tierNodes.forEach((node, rowIdx) => {
      positions[node.id] = {
        x,
        y: startY + rowIdx * ROW_Y_STEP,
      };
    });
  }

  return {
    positions,
    bounds: {
      width: canvasWidth,
      height: canvasHeight,
    },
  };
}

export interface EdgeGeometry {
  edge: ArchEdge;
  pathD: string;
  labelX: number;
  labelY: number;
}

function evalCubicBezier(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number
): number {
  const mt = 1 - t;
  return (
    mt * mt * mt * p0 +
    3 * mt * mt * t * p1 +
    3 * mt * t * t * p2 +
    t * t * t * p3
  );
}

export function computeEdgeGeometry(
  edge: ArchEdge,
  positions: Record<string, NodePosition>,
  sourcePortOffsetY = 0,
  targetPortOffsetY = 0,
  tParam = 0.5
): EdgeGeometry | null {
  const src = positions[edge.source];
  const dst = positions[edge.target];
  if (!src || !dst || edge.source === edge.target) return null;

  const srcCenterX = src.x + NODE_CARD_WIDTH / 2;
  const srcCenterY = src.y + NODE_CARD_HEIGHT / 2 + sourcePortOffsetY;
  const dstCenterX = dst.x + NODE_CARD_WIDTH / 2;
  const dstCenterY = dst.y + NODE_CARD_HEIGHT / 2 + targetPortOffsetY;

  const sameColumn = Math.abs(src.x - dst.x) < 28;

  if (sameColumn) {
    const startX = src.x + NODE_CARD_WIDTH;
    const startY = srcCenterY;
    const endX = dst.x + NODE_CARD_WIDTH;
    const endY = dstCenterY;
    const bulge = 44;
    const pathD = `M ${startX} ${startY} C ${startX + bulge} ${startY}, ${endX + bulge} ${endY}, ${endX} ${endY}`;
    return {
      edge,
      pathD,
      labelX: Math.round(startX + bulge * 0.76),
      labelY: Math.round((startY + endY) / 2),
    };
  }

  const goingRight = dstCenterX >= srcCenterX;
  const startX = goingRight ? src.x + NODE_CARD_WIDTH : src.x;
  const startY = srcCenterY;
  const endX = goingRight ? dst.x : dst.x + NODE_CARD_WIDTH;
  const endY = dstCenterY;

  const dx = Math.abs(endX - startX);
  const controlOffset = Math.max(48, dx * 0.44);
  const cp1x = goingRight ? startX + controlOffset : startX - controlOffset;
  const cp2x = goingRight ? endX - controlOffset : endX + controlOffset;

  const pathD = `M ${startX} ${startY} C ${cp1x} ${startY}, ${cp2x} ${endY}, ${endX} ${endY}`;

  // Multi-column jump (e.g. Col 3 -> Col 5): place label in the first inter-column gutter
  // rather than t=0.5 (which sits right on top of Col 4 node cards!)
  const effectiveT = dx > COLUMN_X_STEP * 1.15 ? 0.24 : tParam;

  const labelX = evalCubicBezier(startX, cp1x, cp2x, endX, effectiveT);
  const labelY = evalCubicBezier(startY, startY, endY, endY, effectiveT);

  return {
    edge,
    pathD,
    labelX: Math.round(labelX),
    labelY: Math.round(labelY),
  };
}

/**
 * Computes collision-free Bezier edge geometries with distributed source/target
 * port offsets and anti-overlapping protocol label vertical nudging.
 */
export function computeAllEdgeGeometries(
  edges: ArchEdge[],
  positions: Record<string, NodePosition>
): EdgeGeometry[] {
  const validEdges = edges.filter(
    (e) =>
      Boolean(positions[e.source]) &&
      Boolean(positions[e.target]) &&
      e.source !== e.target
  );

  const outboundByNode = new Map<string, ArchEdge[]>();
  const inboundByNode = new Map<string, ArchEdge[]>();

  for (const edge of validEdges) {
    const out = outboundByNode.get(edge.source) ?? [];
    out.push(edge);
    outboundByNode.set(edge.source, out);

    const inc = inboundByNode.get(edge.target) ?? [];
    inc.push(edge);
    inboundByNode.set(edge.target, inc);
  }

  const srcPortOffset = new Map<string, number>();
  const dstPortOffset = new Map<string, number>();

  for (const [, list] of outboundByNode) {
    list.sort(
      (a, b) => (positions[a.target]?.y ?? 0) - (positions[b.target]?.y ?? 0)
    );
    const count = list.length;
    list.forEach((edge, i) => {
      const offset =
        count === 1 ? 0 : Math.round(((i - (count - 1) / 2) / Math.max(1, count - 1)) * 36);
      srcPortOffset.set(edge.id, offset);
    });
  }

  for (const [, list] of inboundByNode) {
    list.sort(
      (a, b) => (positions[a.source]?.y ?? 0) - (positions[b.source]?.y ?? 0)
    );
    const count = list.length;
    list.forEach((edge, i) => {
      const offset =
        count === 1 ? 0 : Math.round(((i - (count - 1) / 2) / Math.max(1, count - 1)) * 32);
      dstPortOffset.set(edge.id, offset);
    });
  }

  const rawGeoms = validEdges
    .map((edge) =>
      computeEdgeGeometry(
        edge,
        positions,
        srcPortOffset.get(edge.id) ?? 0,
        dstPortOffset.get(edge.id) ?? 0,
        0.5
      )
    )
    .filter((item): item is EdgeGeometry => item !== null);

  // De-collide nearby protocol badges (minimum 24px vertical separation when X within 88px)
  const placed: Array<{ x: number; y: number }> = [];
  for (const geom of rawGeoms) {
    let candidateY = geom.labelY;
    let attempts = 0;
    while (
      attempts < 6 &&
      placed.some(
        (p) =>
          Math.abs(p.x - geom.labelX) < 88 && Math.abs(p.y - candidateY) < 24
      )
    ) {
      const dir = attempts % 2 === 0 ? -1 : 1;
      const step = Math.ceil((attempts + 1) / 2) * 24;
      candidateY = geom.labelY + dir * step;
      attempts += 1;
    }
    geom.labelY = candidateY;
    placed.push({ x: geom.labelX, y: candidateY });
  }

  return rawGeoms;
}
