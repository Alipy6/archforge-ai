import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Cpu,
  Database,
  DollarSign,
  Flame,
  Gauge,
  Layers,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  ArchEdge,
  ArchNode,
  AuditFinding,
  NodeSimulationMetrics,
  OutageBlastRadiusResult,
} from '../types/architecture';
import { TIER_METADATA } from '../engine/layoutEngine';

interface NodeInspectorDrawerProps {
  node: ArchNode | null;
  metrics: NodeSimulationMetrics | undefined;
  edges: ArchEdge[];
  allNodes: ArchNode[];
  findings: AuditFinding[];
  outageBlastRadius: OutageBlastRadiusResult | null;
  onSelectNode: (nodeId: string) => void;
  onCloseSelection: () => void;
  onToggleNodeOutage: (nodeId: string) => void;
  onTriggerAutoHeal: () => void;
  isHealing: boolean;
}

export const NodeInspectorDrawer: React.FC<NodeInspectorDrawerProps> = ({
  node,
  metrics,
  edges,
  allNodes,
  findings,
  outageBlastRadius,
  onSelectNode,
  onCloseSelection,
  onToggleNodeOutage,
  onTriggerAutoHeal,
  isHealing,
}) => {
  const nodeNameById = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const n of allNodes) {
      map[n.id] = n.label;
    }
    return map;
  }, [allNodes]);

  if (!node) {
    return (
      <aside
        aria-label="Node Inspector"
        className="h-full bg-[#111114] border-l border-[#27272a] p-5 flex flex-col justify-between"
      >
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-zinc-500">Node Inspector</span>
            <button
              type="button"
              onClick={onCloseSelection}
              aria-label="Close node inspector"
              className="xl:hidden p-1 text-zinc-400 hover:text-zinc-100 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <h2 className="mt-1 text-sm font-semibold text-zinc-200">
            Select a Topology Component
          </h2>
          <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
            Click any node on the architecture canvas to inspect its chosen technology stack, scaling characteristics, Single Point of Failure (SPOF) exposure, Chaos outage blast radius, and real-time FinOps cost profile.
          </p>

          <div className="mt-6 border-t border-[#27272a] pt-4">
            <div className="text-xs font-medium text-zinc-300 mb-2.5">
              Quick Jump · Critical Components
            </div>
            <div className="space-y-1.5">
              {allNodes.slice(0, 6).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectNode(item.id)}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded bg-[#09090b] border border-[#27272a] hover:border-zinc-600 text-left transition-colors cursor-pointer"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-medium text-zinc-200 truncate">
                      {item.label}
                    </div>
                    <div className="text-[11px] text-zinc-500 truncate">
                      {item.technology}
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="text-[11px] text-zinc-500 border-t border-[#27272a] pt-3 font-mono">
          Shortcuts: [/] Prompt · [F] Fit · [O] Outage · [1-3] Views
        </div>
      </aside>
    );
  }

  const nodeFindings = findings.filter((f) => f.targetNodeId === node.id);
  const inboundEdges = edges.filter((e) => e.target === node.id);
  const outboundEdges = edges.filter((e) => e.source === node.id);

  const util = metrics?.utilizationPercent ?? 0;
  const status = metrics?.status ?? 'nominal';
  const isOutageActiveOnThisNode = outageBlastRadius?.failedNodeId === node.id;

  return (
    <aside
      aria-label="Node Inspector"
      className="h-full bg-[#111114] border-l border-[#27272a] flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#27272a] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <span>{TIER_METADATA[node.tier].title}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono truncate">{node.id}</span>
          </div>
          <h2 className="mt-0.5 text-base font-semibold text-zinc-100 truncate">
            {node.label}
          </h2>
        </div>
        <button
          type="button"
          onClick={onCloseSelection}
          aria-label="Close node inspector"
          className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors shrink-0 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Chaos / Blast-Radius Outage Action */}
        <div className="bg-[#09090b] border border-[#27272a] rounded-md p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-zinc-300">
              Chaos Fault Injection
            </span>
            <span className="text-[10px] font-mono text-zinc-500">
              {node.replicas} Replica{node.replicas === 1 ? '' : 's'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onToggleNodeOutage(node.id)}
            className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              isOutageActiveOnThisNode
                ? 'bg-red-500/20 border border-red-500/50 text-red-200 hover:bg-red-500/30'
                : 'bg-zinc-900 border border-[#27272a] hover:border-amber-500/50 text-zinc-200'
            }`}
          >
            {isOutageActiveOnThisNode ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 text-red-300" />
                Restore Node Health
              </>
            ) : (
              <>
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                Simulate Node Outage (O)
              </>
            )}
          </button>
          {isOutageActiveOnThisNode && outageBlastRadius && (
            <p className="text-[11px] text-zinc-400 leading-relaxed pt-1 border-t border-[#27272a]">
              {outageBlastRadius.engineeringSummary}
            </p>
          )}
        </div>

        {/* Chosen Technology & Justification */}
        <section>
          <div className="text-[11px] font-medium text-zinc-400">
            Selected Technology
          </div>
          <div className="mt-1 text-xs font-mono text-sky-300 bg-[#09090b] border border-[#27272a] rounded px-2.5 py-2">
            {node.technology}
          </div>
          <p className="mt-2 text-xs text-zinc-300 leading-relaxed">
            {node.justification}
          </p>
        </section>

        {/* SPOF & Scaling Posture */}
        <section className="pt-3.5 border-t border-[#27272a] space-y-2">
          <div className="flex items-center justify-between text-xs gap-2">
            <span className="text-zinc-400 flex items-center gap-1.5 shrink-0">
              <Layers className="w-3.5 h-3.5 text-zinc-500" />
              Scaling Model
            </span>
            <span className="font-mono text-zinc-200 text-right">
              {node.scalingModel}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs gap-2">
            <span className="text-zinc-400 shrink-0">Failure Domain</span>
            <span className="font-mono text-zinc-300 text-right">
              {node.failureDomain}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs gap-2">
            <span className="text-zinc-400 shrink-0">SPOF Risk Rating</span>
            {node.spofRisk === 'CRITICAL' ? (
              <span className="inline-flex items-center gap-1 font-mono font-semibold text-red-400">
                <ShieldAlert className="w-3.5 h-3.5" />
                CRITICAL SPOF
              </span>
            ) : node.spofRisk === 'MODERATE' ? (
              <span className="inline-flex items-center gap-1 font-mono font-medium text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                MODERATE RISK
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-mono text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                {node.spofRisk} ({node.replicas}x)
              </span>
            )}
          </div>
        </section>

        {/* Live Telemetry vs Baseline Grid */}
        <section className="pt-3.5 border-t border-[#27272a]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-200">
              Live Simulated Telemetry
            </span>
            <span
              className={`text-[11px] font-mono tabular-nums ${
                status === 'saturated'
                  ? 'text-red-400'
                  : status === 'elevated'
                    ? 'text-amber-400'
                    : 'text-emerald-400'
              }`}
            >
              {status.toUpperCase()} · {util}%
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 font-mono tabular-nums">
            <div className="bg-[#09090b] border border-[#27272a] rounded p-2.5">
              <div className="flex items-center gap-1 text-[10px] text-zinc-400 font-sans">
                <Gauge className="w-3 h-3 text-zinc-500" />
                P99 Contribution
              </div>
              <div className="mt-1 text-sm font-semibold text-zinc-100">
                {metrics?.simulatedP99Ms ?? node.baseLatencyMs} ms
              </div>
              <div className="text-[10px] text-zinc-500">
                Base: {node.baseLatencyMs} ms
              </div>
            </div>

            <div className="bg-[#09090b] border border-[#27272a] rounded p-2.5">
              <div className="flex items-center gap-1 text-[10px] text-zinc-400 font-sans">
                <DollarSign className="w-3 h-3 text-zinc-500" />
                Monthly Cloud Cost
              </div>
              <div className="mt-1 text-sm font-semibold text-zinc-100">
                ${(metrics?.monthlyCostUsd ?? node.baseMonthlyCostUsd).toLocaleString()}
              </div>
              <div className="text-[10px] text-zinc-500">
                Base: ${node.baseMonthlyCostUsd.toLocaleString()}/mo
              </div>
            </div>

            <div className="bg-[#09090b] border border-[#27272a] rounded p-2.5">
              <div className="flex items-center gap-1 text-[10px] text-zinc-400 font-sans">
                <Cpu className="w-3 h-3 text-zinc-500" />
                Effective Throughput
              </div>
              <div className="mt-1 text-xs font-semibold text-zinc-100">
                {(metrics?.effectiveRps ?? 0).toLocaleString()} RPS
              </div>
              <div className="text-[10px] text-zinc-500">
                Ceiling:{' '}
                {(
                  metrics?.effectiveCapacityRps ?? node.maxCapacityRps
                ).toLocaleString()}{' '}
                RPS
              </div>
            </div>

            <div className="bg-[#09090b] border border-[#27272a] rounded p-2.5">
              <div className="flex items-center gap-1 text-[10px] text-zinc-400 font-sans">
                <Database className="w-3 h-3 text-zinc-500" />
                CPU &amp; IOPS Load
              </div>
              <div className="mt-1 text-xs font-semibold text-zinc-100">
                {metrics?.cpuPercent ?? 12}% CPU
              </div>
              <div className="text-[10px] text-zinc-500">
                {(metrics?.iopsEstimate ?? 0).toLocaleString()} IOPS
              </div>
            </div>
          </div>
        </section>

        {/* Linked Adversarial Audit Findings */}
        {nodeFindings.length > 0 && (
          <section className="pt-3.5 border-t border-[#27272a]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-zinc-200">
                Linked Audit Findings ({nodeFindings.length})
              </span>
            </div>
            <div className="space-y-2">
              {nodeFindings.map((finding) => (
                <div
                  key={finding.id}
                  className="bg-[#09090b] border border-[#27272a] rounded p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span
                      className={
                        finding.severity === 'CRITICAL'
                          ? 'text-red-400 font-semibold'
                          : finding.severity === 'WARNING'
                            ? 'text-amber-400 font-medium'
                            : 'text-sky-400'
                      }
                    >
                      {finding.severity}
                    </span>
                    <span className="text-zinc-500 uppercase">
                      {finding.persona} agent
                    </span>
                  </div>
                  <div className="text-xs font-medium text-zinc-100">
                    {finding.title}
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    {finding.recommendation}
                  </p>
                </div>
              ))}
              <button
                type="button"
                disabled={isHealing}
                onClick={onTriggerAutoHeal}
                className="w-full mt-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-sky-400 hover:bg-sky-300 disabled:opacity-50 text-zinc-950 font-semibold text-xs transition-colors whitespace-nowrap cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isHealing
                  ? 'Synthesizing Remediation...'
                  : 'Auto-Heal Node Flaws'}
              </button>
            </div>
          </section>
        )}

        {/* Directional Neighbor Flows */}
        <section className="pt-3.5 border-t border-[#27272a] space-y-2">
          <div className="text-xs font-medium text-zinc-200">
            Connected Protocol Flows
          </div>
          {inboundEdges.length === 0 && outboundEdges.length === 0 ? (
            <div className="text-xs text-zinc-500">No connected edges.</div>
          ) : (
            <div className="space-y-1.5">
              {inboundEdges.map((edge) => (
                <button
                  key={edge.id}
                  type="button"
                  onClick={() => onSelectNode(edge.source)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-[#09090b] border border-[#27272a] hover:border-zinc-600 text-xs transition-colors cursor-pointer"
                >
                  <span className="text-zinc-300 truncate">
                    From: {nodeNameById[edge.source] ?? edge.source}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-400 shrink-0 ml-2">
                    {edge.protocol}
                  </span>
                </button>
              ))}
              {outboundEdges.map((edge) => (
                <button
                  key={edge.id}
                  type="button"
                  onClick={() => onSelectNode(edge.target)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-[#09090b] border border-[#27272a] hover:border-zinc-600 text-xs transition-colors cursor-pointer"
                >
                  <span className="text-zinc-300 truncate">
                    To: {nodeNameById[edge.target] ?? edge.target}
                  </span>
                  <span className="font-mono text-[11px] text-sky-400 shrink-0 ml-2">
                    {edge.protocol}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
};
