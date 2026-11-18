import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Globe,
  RotateCcw,
  Server,
} from 'lucide-react';
import type {
  ArchNode,
  SimulationParams,
  SimulationResult,
} from '../types/architecture';

interface FinOpsSimulatorDockProps {
  params: SimulationParams;
  defaultParams: SimulationParams;
  simulation: SimulationResult;
  nodes: ArchNode[];
  onChangeParams: (next: SimulationParams) => void;
  onSelectNode: (nodeId: string) => void;
}

const RPS_PRESETS = [500, 6500, 18000, 45000, 85000] as const;

export const FinOpsSimulatorDock: React.FC<FinOpsSimulatorDockProps> = ({
  params,
  defaultParams,
  simulation,
  nodes,
  onChangeParams,
  onSelectNode,
}) => {
  // Default expanded on tablet/desktop (>= 768px) and compact on narrow mobile (< 768px)
  // so mobile viewports preserve generous vertical canvas height
  const [isExpanded, setIsExpanded] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 767px)');
    const handleChange = (e: MediaQueryListEvent) => {
      setIsExpanded(!e.matches);
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const writePercent = 100 - params.readRatioPercent;

  const bottleneckNode = React.useMemo(
    () => nodes.find((n) => n.id === simulation.bottleneckNodeId) ?? null,
    [nodes, simulation.bottleneckNodeId]
  );

  const { finops } = simulation;
  const total = Math.max(1, finops.totalMonthlyUsd);
  const computePct = Math.round((finops.computeUsd / total) * 100);
  const storagePct = Math.round((finops.storageUsd / total) * 100);
  const networkPct = Math.round((finops.networkUsd / total) * 100);
  const aiQueuePct = Math.max(0, 100 - computePct - storagePct - networkPct);

  return (
    <section
      aria-label="Live Deterministic Load, Latency & FinOps Simulator"
      className="bg-[#111114] border-t border-[#27272a] px-3 sm:px-4 py-2.5 shrink-0 space-y-2.5"
    >
      {/* Row 1: Always-Visible High-Signal Telemetry, Cost Bar & Expand/Collapse Toggle */}
      <div className="bg-[#09090b] border border-[#27272a] rounded-md px-3 py-2 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center justify-between sm:justify-start gap-3 min-w-0">
          <div className="flex items-center gap-3.5">
            <div>
              <div className="text-[10px] text-zinc-400">
                Est. Monthly Cloud Spend
              </div>
              <div className="text-sm font-mono font-semibold text-zinc-100 tabular-nums whitespace-nowrap">
                ${finops.totalMonthlyUsd.toLocaleString()}
                <span className="text-xs font-normal text-zinc-400">/mo</span>
                <span className="hidden sm:inline ml-1.5 text-[11px] font-normal text-zinc-500">
                  (${finops.costPerMillionRequestsUsd}/1M req)
                </span>
              </div>
            </div>

            <div className="h-6 w-px bg-[#27272a]" />

            <div>
              <div className="text-[10px] text-zinc-400 flex items-center gap-1">
                <Activity className="w-3 h-3 text-sky-400" />
                Sync P99
              </div>
              <div
                className={`text-sm font-mono font-semibold tabular-nums whitespace-nowrap ${
                  simulation.endToEndP99Ms > 180
                    ? 'text-red-400'
                    : simulation.endToEndP99Ms > 95
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                }`}
              >
                {simulation.endToEndP99Ms} ms
              </div>
            </div>
          </div>

          {bottleneckNode && (
            <button
              type="button"
              onClick={() => onSelectNode(bottleneckNode.id)}
              className={`max-w-full inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-mono tabular-nums transition-colors cursor-pointer ${
                simulation.maxUtilizationPercent > 95
                  ? 'bg-red-500/10 border-red-500/40 text-red-300 hover:bg-red-500/20'
                  : simulation.maxUtilizationPercent > 75
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/20'
                    : 'bg-zinc-900 border-[#27272a] text-zinc-300 hover:border-zinc-600'
              }`}
            >
              {simulation.maxUtilizationPercent > 75 ? (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              )}
              <span className="truncate max-w-[210px] sm:max-w-[260px]">
                Bottleneck: {bottleneckNode.label} ({simulation.maxUtilizationPercent}%)
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 flex-1 lg:max-w-2xl min-w-0">
          {/* Horizontal Cost Breakdown Bar */}
          <div className="flex-1 min-w-0">
            <div className="w-full h-2 bg-zinc-900 rounded-sm overflow-hidden flex">
              <div
                style={{ width: `${computePct}%` }}
                className="bg-sky-400 h-full"
                title={`Compute: $${finops.computeUsd.toLocaleString()}/mo`}
              />
              <div
                style={{ width: `${storagePct}%` }}
                className="bg-violet-400 h-full"
                title={`Database & Storage: $${finops.storageUsd.toLocaleString()}/mo`}
              />
              <div
                style={{ width: `${networkPct}%` }}
                className="bg-amber-400 h-full"
                title={`Network Egress: $${finops.networkUsd.toLocaleString()}/mo`}
              />
              <div
                style={{ width: `${aiQueuePct}%` }}
                className="bg-emerald-400 h-full"
                title={`Managed AI & Messaging: $${finops.aiQueueUsd.toLocaleString()}/mo`}
              />
            </div>

            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] font-mono tabular-nums text-zinc-400">
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <span className="w-2 h-2 rounded-xs bg-sky-400 shrink-0" />
                Compute ${finops.computeUsd.toLocaleString()}
              </span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <span className="w-2 h-2 rounded-xs bg-violet-400 shrink-0" />
                DB ${finops.storageUsd.toLocaleString()}
              </span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <span className="w-2 h-2 rounded-xs bg-amber-400 shrink-0" />
                Egress ${finops.networkUsd.toLocaleString()}
              </span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <span className="w-2 h-2 rounded-xs bg-emerald-400 shrink-0" />
                AI/Queue ${finops.aiQueueUsd.toLocaleString()}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            aria-expanded={isExpanded}
            aria-label={
              isExpanded
                ? 'Collapse FinOps simulation sliders'
                : 'Expand FinOps simulation sliders'
            }
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-zinc-900 border border-[#27272a] hover:border-zinc-500 text-[11px] font-mono text-zinc-200 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isExpanded ? (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Hide Sliders</span>
              </>
            ) : (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-sky-400" />
                <span>Sliders ({(params.peakRps / 1000).toFixed(1)}k RPS)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Row 2: Collapsible 4-Column Interactive Sliders & Replication Toggle */}
      {isExpanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
          {/* 1. Peak RPS Slider */}
          <div className="bg-[#09090b] border border-[#27272a] rounded-md px-3 py-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <label
                htmlFor="sim-peak-rps"
                className="text-[11px] font-medium text-zinc-300 whitespace-nowrap"
              >
                Peak Traffic (RPS)
              </label>
              <span className="text-xs font-mono font-semibold text-sky-400 tabular-nums whitespace-nowrap">
                {params.peakRps.toLocaleString()} RPS
              </span>
            </div>
            <input
              id="sim-peak-rps"
              type="range"
              min={10}
              max={100000}
              step={10}
              value={params.peakRps}
              onChange={(e) =>
                onChangeParams({
                  ...params,
                  peakRps: Number(e.target.value),
                })
              }
              className="w-full arch-slider"
            />
            <div className="mt-1.5 flex items-center justify-between gap-1">
              {RPS_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onChangeParams({ ...params, peakRps: preset })}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono tabular-nums transition-colors whitespace-nowrap cursor-pointer ${
                    params.peakRps === preset
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      : 'text-zinc-400 hover:text-zinc-100 bg-zinc-900'
                  }`}
                >
                  {preset >= 1000 ? `${preset / 1000}k` : preset}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Read / Write Ratio Slider */}
          <div className="bg-[#09090b] border border-[#27272a] rounded-md px-3 py-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <label
                htmlFor="sim-read-ratio"
                className="text-[11px] font-medium text-zinc-300 whitespace-nowrap"
              >
                Read / Write Ratio
              </label>
              <span className="text-xs font-mono font-semibold text-zinc-100 tabular-nums whitespace-nowrap">
                {params.readRatioPercent}% Read / {writePercent}% Write
              </span>
            </div>
            <input
              id="sim-read-ratio"
              type="range"
              min={20}
              max={95}
              step={5}
              value={params.readRatioPercent}
              onChange={(e) =>
                onChangeParams({
                  ...params,
                  readRatioPercent: Number(e.target.value),
                })
              }
              className="w-full arch-slider"
            />
            <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-zinc-500">
              <span className="whitespace-nowrap">20/80 Write-Heavy</span>
              <span className="whitespace-nowrap">95/5 Read-Heavy</span>
            </div>
          </div>

          {/* 3. Average Payload Size (KB) */}
          <div className="bg-[#09090b] border border-[#27272a] rounded-md px-3 py-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <label
                htmlFor="sim-payload-kb"
                className="text-[11px] font-medium text-zinc-300 whitespace-nowrap"
              >
                Avg Payload Size
              </label>
              <span className="text-xs font-mono font-semibold text-zinc-100 tabular-nums whitespace-nowrap">
                {params.payloadSizeKb.toLocaleString()} KB
              </span>
            </div>
            <input
              id="sim-payload-kb"
              type="range"
              min={2}
              max={5120}
              step={2}
              value={params.payloadSizeKb}
              onChange={(e) =>
                onChangeParams({
                  ...params,
                  payloadSizeKb: Number(e.target.value),
                })
              }
              className="w-full arch-slider"
            />
            <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-zinc-500">
              <span className="whitespace-nowrap">Range: 2 KB – 5,120 KB</span>
              <span className="whitespace-nowrap">
                {finops.monthlyEgressTb} TB/mo egress
              </span>
            </div>
          </div>

          {/* 4. Multi-Region Active-Active Toggle */}
          <div className="bg-[#09090b] border border-[#27272a] rounded-md px-3 py-2 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-zinc-300 whitespace-nowrap">
                Multi-Region Replication
              </span>
              <button
                type="button"
                onClick={() => onChangeParams(defaultParams)}
                aria-label="Reset simulation parameters to blueprint defaults"
                className="inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-100 transition-colors whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            </div>

            <div
              role="group"
              aria-label="Multi-region replication topology"
              className="mt-1.5 grid grid-cols-2 gap-1 p-0.5 bg-zinc-900 border border-[#27272a] rounded"
            >
              <button
                type="button"
                onClick={() =>
                  onChangeParams({ ...params, multiRegion: false })
                }
                className={`flex items-center justify-center gap-1.5 py-1 px-2 rounded text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  !params.multiRegion
                    ? 'bg-[#1f1f24] text-zinc-100 border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Server className="w-3 h-3 shrink-0" />
                Single Region
              </button>
              <button
                type="button"
                onClick={() => onChangeParams({ ...params, multiRegion: true })}
                className={`flex items-center justify-center gap-1.5 py-1 px-2 rounded text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  params.multiRegion
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Globe className="w-3 h-3 shrink-0" />
                3-Region Global
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
