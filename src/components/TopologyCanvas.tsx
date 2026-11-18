import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Crosshair,
  Download,
  Flame,
  LayoutGrid,
  Lock,
  PanelRightOpen,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  ArchEdge,
  ArchNode,
  NodePosition,
  OutageBlastRadiusResult,
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
} from '../engine/layoutEngine';
import {
  serializeTopologyToSvg,
  toSafeDownloadSlug,
} from '../engine/exportEngine';

interface TopologyCanvasProps {
  blueprintName?: string;
  domainTag?: string;
  versionLabel?: string;
  nodes: ArchNode[];
  edges: ArchEdge[];
  simulation: SimulationResult;
  selectedNodeId: string | null;
  highlightedNodeId: string | null;
  outageBlastRadius: OutageBlastRadiusResult | null;
  onSelectNode: (nodeId: string) => void;
  onOpenInspectorDrawer: () => void;
  onToggleOutageSimulation: (nodeId?: string) => void;
  onClearOutageSimulation: () => void;
  layoutResetKey: string;
  fitTriggerCounter: number;
}

const PROTOCOL_STROKE: Record<ArchEdge['protocol'], string> = {
  HTTPS: '#38bdf8',
  gRPC: '#818cf8',
  Kafka: '#f59e0b',
  WebSocket: '#34d399',
  SQL: '#c084fc',
  'Redis RESP': '#fb7185',
  'S3 API': '#94a3b8',
};

export const TopologyCanvas: React.FC<TopologyCanvasProps> = ({
  blueprintName = 'System Architecture',
  domainTag = 'Distributed Cloud Topology',
  versionLabel = 'v1',
  nodes,
  edges,
  simulation,
  selectedNodeId,
  highlightedNodeId,
  outageBlastRadius,
  onSelectNode,
  onOpenInspectorDrawer,
  onToggleOutageSimulation,
  onClearOutageSimulation,
  layoutResetKey,
  fitTriggerCounter,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const userManuallyAdjustedViewRef = useRef<boolean>(false);

  const baseLayout = useMemo(() => computeTierLayout(nodes), [nodes]);

  const [customPositions, setCustomPositions] = useState<
    Record<string, NodePosition>
  >({});
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 16, y: 44 });
  const [zoom, setZoom] = useState<number>(0.72);
  const [isPanning, setIsPanning] = useState<boolean>(false);

  const dragStateRef = useRef<{
    mode: 'pan' | 'node' | null;
    nodeId?: string;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    moved: boolean;
  }>({
    mode: null,
    startClientX: 0,
    startClientY: 0,
    originX: 0,
    originY: 0,
    moved: false,
  });

  const positions = useMemo(() => {
    const merged: Record<string, NodePosition> = {};
    for (const node of nodes) {
      merged[node.id] =
        customPositions[node.id] ??
        baseLayout.positions[node.id] ?? { x: 80, y: 80 };
    }
    return merged;
  }, [nodes, customPositions, baseLayout]);

  const fitCanvasToViewport = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) return;

    const toolbarTopReserve = outageBlastRadius ? 92 : 46;
    const availWidth = Math.max(120, rect.width - 24);
    const availHeight = Math.max(120, rect.height - toolbarTopReserve - 14);

    const scaleX = availWidth / baseLayout.bounds.width;
    const scaleY = availHeight / baseLayout.bounds.height;
    const targetZoom = Math.max(0.32, Math.min(1.05, Math.min(scaleX, scaleY)));

    const centeredX = Math.round(
      (rect.width - baseLayout.bounds.width * targetZoom) / 2
    );
    const centeredY = Math.round(
      toolbarTopReserve +
        (availHeight - baseLayout.bounds.height * targetZoom) / 2
    );

    setZoom(Number(targetZoom.toFixed(2)));
    setPan({
      x: Math.max(6, centeredX),
      y: Math.max(toolbarTopReserve - 8, centeredY),
    });
  }, [baseLayout.bounds.height, baseLayout.bounds.width, outageBlastRadius]);

  useEffect(() => {
    userManuallyAdjustedViewRef.current = false;
    setCustomPositions({});
    const frame = requestAnimationFrame(() => {
      fitCanvasToViewport();
    });
    return () => cancelAnimationFrame(frame);
  }, [layoutResetKey, fitCanvasToViewport]);

  useEffect(() => {
    if (fitTriggerCounter > 0) {
      userManuallyAdjustedViewRef.current = false;
      fitCanvasToViewport();
    }
  }, [fitTriggerCounter, fitCanvasToViewport]);

  // Re-center cleanly when container geometry changes (e.g. dock collapse/expand or viewport resize)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (!userManuallyAdjustedViewRef.current) {
        fitCanvasToViewport();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fitCanvasToViewport]);

  const handleResetLayout = () => {
    userManuallyAdjustedViewRef.current = false;
    setCustomPositions({});
    fitCanvasToViewport();
  };

  const handleExportSvg = useCallback(() => {
    const svgMarkup = serializeTopologyToSvg({
      blueprintName,
      domainTag,
      versionLabel,
      nodes,
      edges,
      positions,
      simulation,
    });
    const blob = new Blob([svgMarkup], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${toSafeDownloadSlug(blueprintName)}-${toSafeDownloadSlug(versionLabel)}-topology.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [
    blueprintName,
    domainTag,
    edges,
    nodes,
    positions,
    simulation,
    versionLabel,
  ]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    userManuallyAdjustedViewRef.current = true;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.06 : 0.06;
      setZoom((prev) =>
        Number(Math.max(0.3, Math.min(1.65, prev + delta)).toFixed(2))
      );
    } else {
      setPan((prev) => ({
        x: prev.x - e.deltaX * 0.6,
        y: prev.y - e.deltaY * 0.6,
      }));
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest('[data-arch-node="true"]') ||
      target.closest('[data-canvas-toolbar="true"]')
    ) {
      return;
    }
    dragStateRef.current = {
      mode: 'pan',
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: pan.x,
      originY: pan.y,
      moved: false,
    };
    setIsPanning(true);
  };

  const handleNodeMouseDown = (
    e: React.MouseEvent<HTMLButtonElement>,
    nodeId: string
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const currentPos = positions[nodeId] ?? { x: 0, y: 0 };
    dragStateRef.current = {
      mode: 'node',
      nodeId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: currentPos.x,
      originY: currentPos.y,
      moved: false,
    };
  };

  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state.mode) return;

      const dx = e.clientX - state.startClientX;
      const dy = e.clientY - state.startClientY;

      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        state.moved = true;
        userManuallyAdjustedViewRef.current = true;
      }

      if (state.mode === 'pan') {
        setPan({
          x: state.originX + dx,
          y: state.originY + dy,
        });
      } else if (state.mode === 'node' && state.nodeId && state.moved) {
        const nodeId = state.nodeId;
        setCustomPositions((prev) => ({
          ...prev,
          [nodeId]: {
            x: Math.round(state.originX + dx / zoom),
            y: Math.round(state.originY + dy / zoom),
          },
        }));
      }
    };

    const releaseDragOrPan = () => {
      if (dragStateRef.current.mode !== null) {
        dragStateRef.current.mode = null;
        setIsPanning(false);
      }
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', releaseDragOrPan);
    window.addEventListener('pointerup', releaseDragOrPan);
    window.addEventListener('pointercancel', releaseDragOrPan);
    window.addEventListener('blur', releaseDragOrPan);
    document.addEventListener('mouseleave', releaseDragOrPan);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', releaseDragOrPan);
      window.removeEventListener('pointerup', releaseDragOrPan);
      window.removeEventListener('pointercancel', releaseDragOrPan);
      window.removeEventListener('blur', releaseDragOrPan);
      document.removeEventListener('mouseleave', releaseDragOrPan);
    };
  }, [zoom]);

  const edgeGeometries = useMemo(
    () => computeAllEdgeGeometries(edges, positions),
    [edges, positions]
  );

  const criticalSet = useMemo(
    () => new Set(simulation.criticalPathNodeIds),
    [simulation.criticalPathNodeIds]
  );

  const upstreamBlockedSet = useMemo(
    () => new Set(outageBlastRadius?.upstreamBlockedNodeIds ?? []),
    [outageBlastRadius]
  );
  const downstreamStarvedSet = useMemo(
    () => new Set(outageBlastRadius?.downstreamStarvedNodeIds ?? []),
    [outageBlastRadius]
  );
  const impactedEdgeSet = useMemo(
    () => new Set(outageBlastRadius?.impactedEdgeIds ?? []),
    [outageBlastRadius]
  );

  return (
    <div
      ref={containerRef}
      data-testid="topology-canvas"
      onWheel={handleWheel}
      onMouseDown={handleCanvasMouseDown}
      className={`relative w-full h-full overflow-hidden arch-canvas-grid select-none ${
        isPanning ? 'cursor-grabbing' : 'cursor-grab'
      }`}
    >
      {/* Floating Canvas Controls & Chaos Mode Toolbar */}
      <div
        data-canvas-toolbar="true"
        className="absolute top-2.5 left-2.5 right-2.5 z-20 flex flex-col gap-2 pointer-events-none"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="pointer-events-auto flex items-center gap-2.5 bg-[#111114]/95 border border-[#27272a] rounded-md px-3 py-1.5 text-xs text-zinc-400 max-w-full overflow-x-auto">
            <span className="text-zinc-200 font-medium whitespace-nowrap">
              5-Tier Topology
            </span>
            <span aria-hidden="true" className="text-zinc-700">
              ·
            </span>
            <span className="font-mono tabular-nums whitespace-nowrap">
              {nodes.length} Nodes
            </span>
            <span aria-hidden="true" className="text-zinc-700">
              ·
            </span>
            <span className="font-mono tabular-nums whitespace-nowrap">
              {edges.length} Flows
            </span>
            {simulation.saturatedCount > 0 && (
              <>
                <span aria-hidden="true" className="text-zinc-700">
                  ·
                </span>
                <span className="inline-flex items-center gap-1 text-red-400 font-mono tabular-nums whitespace-nowrap">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {simulation.saturatedCount} Saturated
                </span>
              </>
            )}
          </div>

          <div className="pointer-events-auto flex flex-wrap items-center gap-1 max-w-full bg-[#111114]/95 border border-[#27272a] rounded-md p-1">
            {/* Chaos / Outage Blast-Radius Trigger */}
            <button
              type="button"
              onClick={() => onToggleOutageSimulation()}
              aria-pressed={Boolean(outageBlastRadius)}
              className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                outageBlastRadius
                  ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                  : 'text-zinc-300 hover:text-white hover:bg-zinc-800/70'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              {outageBlastRadius ? (
                <span>Outage Active</span>
              ) : (
                <span>
                  <span className="hidden sm:inline">Simulate </span>Outage
                </span>
              )}
              <kbd className="hidden sm:inline text-[10px] font-mono text-zinc-500 ml-0.5">
                O
              </kbd>
            </button>

            <div className="w-px h-4 bg-[#27272a] mx-0.5" />

            <button
              type="button"
              onClick={() => {
                userManuallyAdjustedViewRef.current = true;
                setZoom((z) => Number(Math.max(0.3, z - 0.1).toFixed(2)));
              }}
              aria-label="Zoom out topology canvas"
              className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 rounded transition-colors cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-xs font-mono tabular-nums text-zinc-300 min-w-[44px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => {
                userManuallyAdjustedViewRef.current = true;
                setZoom((z) => Number(Math.min(1.65, z + 0.1).toFixed(2)));
              }}
              aria-label="Zoom in topology canvas"
              className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 rounded transition-colors cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-4 bg-[#27272a] mx-0.5" />

            <button
              type="button"
              onClick={() => {
                userManuallyAdjustedViewRef.current = false;
                fitCanvasToViewport();
              }}
              aria-label="Fit architecture graph to viewport"
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800/70 rounded transition-colors whitespace-nowrap cursor-pointer"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>Fit</span>
              <kbd className="hidden md:inline text-[10px] font-mono text-zinc-500">
                F
              </kbd>
            </button>
            <button
              type="button"
              onClick={handleResetLayout}
              aria-label="Auto-layout nodes by architectural tier"
              className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800/70 rounded transition-colors whitespace-nowrap cursor-pointer"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Auto-Tier
            </button>

            <div className="w-px h-4 bg-[#27272a] mx-0.5" />

            <button
              type="button"
              onClick={handleExportSvg}
              aria-label="Export architecture topology as SVG"
              title="Download standalone vector SVG architecture diagram"
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-sky-300 hover:text-sky-200 hover:bg-sky-500/10 rounded transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Export SVG</span>
            </button>

            {selectedNodeId && (
              <button
                type="button"
                onClick={onOpenInspectorDrawer}
                aria-label="Open node inspector drawer"
                className="xl:hidden inline-flex items-center gap-1 px-2 py-1 text-xs text-sky-300 hover:text-sky-200 bg-sky-500/10 border border-sky-500/30 rounded transition-colors whitespace-nowrap cursor-pointer"
              >
                <PanelRightOpen className="w-3.5 h-3.5" />
                Inspect
              </button>
            )}
          </div>
        </div>

        {/* Active Chaos / Blast-Radius Telemetry Banner */}
        {outageBlastRadius && (
          <div
            role="region"
            aria-label="Chaos Outage Blast Radius Report"
            className={`pointer-events-auto flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded-md border text-xs bg-[#111114]/95 ${
              outageBlastRadius.verdict === 'hard_outage'
                ? 'border-red-500/60'
                : outageBlastRadius.verdict === 'degraded_failover'
                  ? 'border-amber-500/60'
                  : 'border-emerald-500/50'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              {outageBlastRadius.verdict === 'hard_outage' ? (
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
              ) : outageBlastRadius.verdict === 'degraded_failover' ? (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span
                className={`font-mono font-semibold whitespace-nowrap ${
                  outageBlastRadius.verdict === 'hard_outage'
                    ? 'text-red-400'
                    : outageBlastRadius.verdict === 'degraded_failover'
                      ? 'text-amber-300'
                      : 'text-emerald-400'
                }`}
              >
                {outageBlastRadius.headline}
              </span>
              <span aria-hidden="true" className="text-zinc-700 hidden md:inline">
                ·
              </span>
              <span className="font-mono text-zinc-200 whitespace-nowrap">
                Est. SLA: {outageBlastRadius.estimatedAvailabilityPercent}%
              </span>
              <span aria-hidden="true" className="text-zinc-700 hidden md:inline">
                ·
              </span>
              <span className="font-mono text-zinc-400 whitespace-nowrap hidden md:inline">
                {outageBlastRadius.upstreamBlockedNodeIds.length} Callers Blocked ·{' '}
                {outageBlastRadius.downstreamStarvedNodeIds.length} Downstream Starved
              </span>
            </div>

            <button
              type="button"
              onClick={onClearOutageSimulation}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 border border-[#27272a] hover:border-zinc-500 text-xs font-mono text-zinc-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Restore Healthy State
            </button>
          </div>
        )}
      </div>

      {/* Transformed Graph Plane */}
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          width: `${baseLayout.bounds.width}px`,
          height: `${baseLayout.bounds.height}px`,
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
        }}
      >
        {/* Architectural Tier Lane Headers */}
        {TIER_ORDER.map((tier) => {
          const meta = TIER_METADATA[tier];
          const laneX = CANVAS_PADDING_X + meta.index * COLUMN_X_STEP;
          return (
            <div
              key={tier}
              className="absolute top-3 pointer-events-none border-b border-[#27272a] pb-1.5"
              style={{
                left: `${laneX}px`,
                width: `${NODE_CARD_WIDTH}px`,
              }}
            >
              <div className="text-xs font-semibold text-zinc-200 tracking-tight truncate">
                0{meta.index + 1}. {meta.title}
              </div>
              <div className="text-[10px] text-zinc-500 truncate">
                {meta.subtitle}
              </div>
            </div>
          );
        })}

        {/* SVG Directional Data-Flow Layer */}
        <svg
          width={baseLayout.bounds.width}
          height={baseLayout.bounds.height}
          className="absolute inset-0 pointer-events-none overflow-visible"
        >
          <defs>
            {Object.entries(PROTOCOL_STROKE).map(([proto, color]) => {
              const safeId = proto.replace(/\s+/g, '-').toLowerCase();
              return (
                <marker
                  key={proto}
                  id={`arrow-${safeId}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill={color} />
                </marker>
              );
            })}
            <marker
              id="arrow-outage"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#ef4444" />
            </marker>
          </defs>

          {edgeGeometries.map(({ edge, pathD, labelX, labelY }) => {
            const isOutageEdge =
              outageBlastRadius !== null &&
              impactedEdgeSet.has(edge.id) &&
              outageBlastRadius.verdict !== 'resilient_quorum';

            const color = isOutageEdge
              ? '#ef4444'
              : (PROTOCOL_STROKE[edge.protocol] ?? '#38bdf8');
            const markerKey = isOutageEdge
              ? 'outage'
              : edge.protocol.replace(/\s+/g, '-').toLowerCase();

            const isConnectedToSelected =
              selectedNodeId === edge.source || selectedNodeId === edge.target;
            const isCriticalHop =
              !edge.isAsync &&
              criticalSet.has(edge.source) &&
              criticalSet.has(edge.target);

            const dimmedByOutage =
              outageBlastRadius !== null && !impactedEdgeSet.has(edge.id);

            return (
              <g key={edge.id} opacity={dimmedByOutage ? 0.35 : 1}>
                <path
                  d={pathD}
                  fill="none"
                  stroke={color}
                  strokeOpacity={
                    isOutageEdge ? 0.55 : isConnectedToSelected ? 0.42 : 0.18
                  }
                  strokeWidth={
                    isOutageEdge || isConnectedToSelected ? 2.6 : 1.6
                  }
                />
                <path
                  d={pathD}
                  fill="none"
                  stroke={color}
                  strokeOpacity={
                    isOutageEdge
                      ? 0.95
                      : isConnectedToSelected
                        ? 0.95
                        : isCriticalHop
                          ? 0.8
                          : 0.62
                  }
                  strokeWidth={isOutageEdge || isConnectedToSelected ? 2.1 : 1.5}
                  markerEnd={`url(#arrow-${markerKey})`}
                  className="arch-edge-animated"
                />

                <foreignObject
                  x={labelX - 58}
                  y={labelY - 12}
                  width={116}
                  height={24}
                  className="overflow-visible"
                >
                  <div className="flex items-center justify-center">
                    <div
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#09090b]/95 border text-[10px] font-mono leading-none whitespace-nowrap ${
                        isOutageEdge
                          ? 'border-red-500/70 text-red-300'
                          : !edge.encrypted
                            ? 'border-amber-500/60 text-amber-300'
                            : isConnectedToSelected
                              ? 'border-sky-400/60 text-zinc-100'
                              : 'border-[#27272a] text-zinc-300'
                      }`}
                    >
                      {edge.encrypted ? (
                        <Lock className="w-2.5 h-2.5 text-zinc-500 shrink-0" />
                      ) : (
                        <Unlock className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                      )}
                      <span>{edge.protocol}</span>
                      {edge.isAsync && (
                        <span className="text-zinc-500">· async</span>
                      )}
                    </div>
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>

        {/* Interactive HTML Node Cards */}
        {nodes.map((node) => {
          const pos = positions[node.id] ?? { x: 80, y: 80 };
          const metrics = simulation.nodeMetrics[node.id];
          const util = metrics?.utilizationPercent ?? 0;
          const status = metrics?.status ?? 'nominal';
          const p99Ms = metrics?.simulatedP99Ms ?? node.baseLatencyMs;
          const monthlyUsd = metrics?.monthlyCostUsd ?? node.baseMonthlyCostUsd;

          const isSelected = selectedNodeId === node.id;
          const isAuditHighlighted = highlightedNodeId === node.id;

          const isFailedTarget = outageBlastRadius?.failedNodeId === node.id;
          const isUpstreamBlocked = upstreamBlockedSet.has(node.id);
          const isDownstreamStarved = downstreamStarvedSet.has(node.id);

          let borderClass = 'border-[#27272a] hover:border-zinc-600';
          if (isFailedTarget) {
            borderClass =
              outageBlastRadius?.verdict === 'resilient_quorum'
                ? 'border-emerald-400 ring-2 ring-emerald-400/30'
                : 'border-red-500 ring-2 ring-red-500/40 animate-pulse';
          } else if (isUpstreamBlocked) {
            borderClass = 'border-red-400/85 ring-1 ring-red-400/30';
          } else if (isDownstreamStarved) {
            borderClass = 'border-amber-500/80';
          } else if (status === 'saturated') {
            borderClass =
              'border-red-500/90 shadow-[0_0_0_1px_rgba(239,68,68,0.35)] animate-pulse';
          } else if (status === 'elevated') {
            borderClass = 'border-amber-500/80';
          } else if (isSelected) {
            borderClass = 'border-sky-400 ring-2 ring-sky-400/25';
          } else if (isAuditHighlighted) {
            borderClass = 'border-amber-400 ring-2 ring-amber-400/30';
          }

          const barColorClass =
            isFailedTarget && outageBlastRadius?.verdict !== 'resilient_quorum'
              ? 'bg-red-500'
              : status === 'saturated'
                ? 'bg-red-500'
                : status === 'elevated'
                  ? 'bg-amber-500'
                  : 'bg-sky-400';

          const statusLabel = isFailedTarget
            ? outageBlastRadius?.verdict === 'resilient_quorum'
              ? `QUORUM ${outageBlastRadius.survivingReplicas}/${outageBlastRadius.totalReplicas}`
              : outageBlastRadius?.verdict === 'degraded_failover'
                ? `BROWNOUT ${outageBlastRadius.survivingReplicas}/${outageBlastRadius.totalReplicas}`
                : 'NODE DOWN 0%'
            : isUpstreamBlocked
              ? 'CALLER 503'
              : isDownstreamStarved
                ? 'STARVED'
                : status === 'saturated'
                  ? `SATURATED ${util}%`
                  : status === 'elevated'
                    ? `ELEVATED ${util}%`
                    : `LOAD ${util}%`;

          const statusTextClass =
            isFailedTarget && outageBlastRadius?.verdict === 'resilient_quorum'
              ? 'text-emerald-400 font-semibold'
              : isFailedTarget || isUpstreamBlocked || status === 'saturated'
                ? 'text-red-400 font-semibold'
                : isDownstreamStarved || status === 'elevated'
                  ? 'text-amber-400'
                  : 'text-zinc-400';

          return (
            <button
              key={node.id}
              type="button"
              data-arch-node="true"
              aria-label={`Inspect node ${node.label} (${statusLabel})`}
              onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
              onClick={() => {
                if (!dragStateRef.current.moved) {
                  onSelectNode(node.id);
                }
              }}
              style={{
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                width: `${NODE_CARD_WIDTH}px`,
                height: `${NODE_CARD_HEIGHT}px`,
              }}
              className={`absolute text-left bg-[#111114] border rounded-lg p-3 flex flex-col justify-between transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${borderClass}`}
            >
              <div>
                <div className="flex items-center justify-between gap-1 text-[10px] font-mono text-zinc-400">
                  <span className="truncate">
                    {node.replicas}x · {node.isStateful ? 'Stateful' : 'Stateless'}
                  </span>
                  {node.spofRisk === 'CRITICAL' ? (
                    <span className="inline-flex items-center gap-1 text-red-400 font-medium shrink-0">
                      <ShieldAlert className="w-3 h-3" />
                      SPOF
                    </span>
                  ) : node.spofRisk === 'MODERATE' ? (
                    <span className="text-amber-400 shrink-0">Risk: Mod</span>
                  ) : (
                    <span className="text-emerald-400/90 shrink-0">HA</span>
                  )}
                </div>

                <div
                  title={node.label}
                  className="mt-1 text-[13px] font-semibold text-zinc-100 leading-snug truncate"
                >
                  {node.label}
                </div>
                <div
                  title={node.technology}
                  className="mt-0.5 text-[11px] text-zinc-400 truncate"
                >
                  {node.technology}
                </div>
              </div>

              <div className="pt-2 border-t border-[#27272a]/80">
                <div className="flex items-center justify-between text-[10px] font-mono tabular-nums mb-1 gap-1">
                  <span className={`truncate ${statusTextClass}`}>
                    {statusLabel}
                  </span>
                  <span className="text-zinc-300 shrink-0">
                    {p99Ms}ms · ${monthlyUsd.toLocaleString()}/m
                  </span>
                </div>
                <div className="w-full h-1.5 bg-zinc-800 rounded-sm overflow-hidden">
                  <div
                    className={`h-full transition-transform duration-150 origin-left ${barColorClass}`}
                    style={{
                      transform: `scaleX(${
                        isFailedTarget &&
                        outageBlastRadius?.verdict === 'hard_outage'
                          ? 1
                          : Math.min(1, util / 100)
                      })`,
                    }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
