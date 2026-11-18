import React, { useMemo, useState } from 'react';
import {
  Braces,
  Check,
  Copy,
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  ServerCog,
} from 'lucide-react';
import type {
  ArchitectureBlueprint,
  ArchitectureVersion,
  ProductionArtifacts,
  SimulationParams,
  SimulationResult,
} from '../types/architecture';
import { serializeBlueprintToJson } from '../engine/exportEngine';

interface ArtifactStudioProps {
  blueprint: ArchitectureBlueprint;
  activeVersion: ArchitectureVersion;
  blueprintName: string;
  versionLabel: string;
  artifacts: ProductionArtifacts;
  simulation: SimulationResult;
  simulationParams: SimulationParams;
}

type ArtifactTabId = 'sql' | 'docker' | 'openapi' | 'rfc' | 'json';

const ARTIFACT_TABS: ReadonlyArray<{
  id: ArtifactTabId;
  filename: string;
  subtitle: string;
  mimeType: string;
  icon: React.FC<{ className?: string }>;
}> = [
  {
    id: 'sql',
    filename: 'schema.sql',
    subtitle: 'PostgreSQL 17 DDL · Partitioning & Indexes',
    mimeType: 'application/sql',
    icon: FileSpreadsheet,
  },
  {
    id: 'docker',
    filename: 'docker-compose.yml',
    subtitle: 'Local Runnable Infrastructure Stack',
    mimeType: 'text/yaml',
    icon: ServerCog,
  },
  {
    id: 'openapi',
    filename: 'openapi.yaml',
    subtitle: 'OpenAPI 3.1 REST & Webhook Contract',
    mimeType: 'text/yaml',
    icon: FileCode2,
  },
  {
    id: 'rfc',
    filename: 'Executive_RFC_Proposal.md',
    subtitle: 'Client-Ready Technical & FinOps Proposal',
    mimeType: 'text/markdown',
    icon: FileText,
  },
  {
    id: 'json',
    filename: 'blueprint.json',
    subtitle: 'Portable Architecture Graph, Audit & FinOps Schema',
    mimeType: 'application/json',
    icon: Braces,
  },
];

export const ArtifactStudio: React.FC<ArtifactStudioProps> = ({
  blueprint,
  activeVersion,
  blueprintName,
  versionLabel,
  artifacts,
  simulation,
  simulationParams,
}) => {
  const [activeTab, setActiveTab] = useState<ArtifactTabId>('sql');
  const [copiedId, setCopiedId] = useState<ArtifactTabId | null>(null);

  const enrichedRfcMarkdown = useMemo(() => {
    const { finops } = simulation;
    const appendix = `\n\n---\n## Live FinOps & Capacity Simulation Appendix (${versionLabel})
- **Simulated Workload**: ${simulationParams.peakRps.toLocaleString()} Peak RPS · ${simulationParams.readRatioPercent}/${100 - simulationParams.readRatioPercent} Read/Write · ${simulationParams.payloadSizeKb} KB Payload · ${simulationParams.multiRegion ? 'Global 3-Region Active-Active' : 'Single Region Multi-AZ'}
- **Estimated Synchronous Critical Path P99**: ${simulation.endToEndP99Ms} ms
- **Monthly Cloud Estimate**: **$${finops.totalMonthlyUsd.toLocaleString()}/mo** ($${finops.costPerMillionRequestsUsd} per 1M requests)
  - Compute & Containers: $${finops.computeUsd.toLocaleString()}/mo
  - Database, Cache & Storage IOPS: $${finops.storageUsd.toLocaleString()}/mo
  - Network Egress (${finops.monthlyEgressTb} TB/mo): $${finops.networkUsd.toLocaleString()}/mo
  - Managed AI & Messaging Buses: $${finops.aiQueueUsd.toLocaleString()}/mo
`;
    return `${artifacts.executiveRfcMd.trim()}${appendix}`;
  }, [artifacts.executiveRfcMd, simulation, simulationParams, versionLabel]);

  const blueprintJsonContent = useMemo(
    () =>
      serializeBlueprintToJson(
        blueprint,
        activeVersion,
        simulation,
        simulationParams,
        activeVersion.createdAt
      ),
    [activeVersion, blueprint, simulation, simulationParams]
  );

  const activeContent = useMemo(() => {
    switch (activeTab) {
      case 'sql':
        return artifacts.schemaSql;
      case 'docker':
        return artifacts.dockerComposeYml;
      case 'openapi':
        return artifacts.openapiYaml;
      case 'rfc':
        return enrichedRfcMarkdown;
      case 'json':
        return blueprintJsonContent;
    }
  }, [activeTab, artifacts, blueprintJsonContent, enrichedRfcMarkdown]);

  const currentTabMeta =
    ARTIFACT_TABS.find((t) => t.id === activeTab) ?? ARTIFACT_TABS[0];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeContent);
      setCopiedId(activeTab);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Fallback copy via temporary textarea
      const textarea = document.createElement('textarea');
      textarea.value = activeContent;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(activeTab);
      setTimeout(() => setCopiedId(null), 1800);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([activeContent], {
      type: `${currentTabMeta.mimeType};charset=utf-8`,
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = currentTabMeta.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const lines = useMemo(() => activeContent.split('\n'), [activeContent]);

  return (
    <div className="h-full flex flex-col bg-[#09090b] overflow-hidden">
      {/* Studio Top Bar */}
      <div className="px-6 py-4 bg-[#111114] border-b border-[#27272a] flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
            <span>Production Artifact &amp; Client Proposal Studio</span>
            <span aria-hidden="true">·</span>
            <span className="text-zinc-200">{blueprintName}</span>
            <span aria-hidden="true">·</span>
            <span>{versionLabel}</span>
          </div>
          <h2 className="mt-1 text-base font-semibold text-zinc-100">
            Exportable DDL, Infrastructure-as-Code, OpenAPI 3.1, Executive RFC &amp; Blueprint JSON
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#09090b] border border-[#27272a] hover:border-zinc-600 text-xs font-mono text-zinc-200 transition-colors whitespace-nowrap cursor-pointer"
          >
            {copiedId === activeTab ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied to Clipboard</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-zinc-400" />
                <span>Copy {currentTabMeta.filename}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-sky-400 hover:bg-sky-300 text-zinc-950 font-semibold text-xs transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download {currentTabMeta.filename}</span>
          </button>
        </div>
      </div>

      {/* File Selector Tabs */}
      <div
        role="tablist"
        aria-label="Engineering Artifacts"
        className="px-6 bg-[#111114] border-b border-[#27272a] flex items-center gap-3 overflow-x-auto"
      >
        {ARTIFACT_TABS.map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-2.5 px-3.5 border-b-2 text-xs font-mono transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selected
                  ? 'border-sky-400 text-zinc-100 bg-[#09090b]/60'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5 text-zinc-400" />
              <span>{tab.filename}</span>
            </button>
          );
        })}
      </div>

      {/* Syntax-Styled Line-Numbered Viewer */}
      <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-6">
        <div className="max-w-6xl mx-auto bg-[#111114] border border-[#27272a] rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-[#09090b] border-b border-[#27272a] flex items-center justify-between text-[11px] font-mono text-zinc-400">
            <span>
              {currentTabMeta.filename}{' '}
              <span className="text-zinc-500">· {currentTabMeta.subtitle}</span>
            </span>
            <span>{lines.length} lines · UTF-8</span>
          </div>

          <pre className="p-4 text-xs font-mono leading-relaxed overflow-x-auto text-zinc-200">
            <code>
              {lines.map((line, index) => {
                const trimmed = line.trimStart();
                let lineColor = 'text-zinc-200';
                if (
                  trimmed.startsWith('--') ||
                  trimmed.startsWith('# ') ||
                  trimmed.startsWith('## ') ||
                  trimmed.startsWith('### ')
                ) {
                  lineColor = trimmed.startsWith('--')
                    ? 'text-zinc-500'
                    : 'text-sky-300 font-semibold';
                } else if (
                  /^(CREATE|ALTER|INDEX|UNIQUE|PRIMARY|PARTITION|SELECT|INSERT)\b/i.test(
                    trimmed
                  )
                ) {
                  lineColor = 'text-violet-300';
                } else if (/^[a-zA-Z0-9_-]+:/.test(trimmed)) {
                  lineColor = 'text-sky-200';
                }

                return (
                  <div key={index} className="flex hover:bg-zinc-900/60 px-1">
                    <span className="w-10 pr-4 text-right text-zinc-600 select-none shrink-0 tabular-nums">
                      {index + 1}
                    </span>
                    <span className={`whitespace-pre-wrap break-words ${lineColor}`}>
                      {line || ' '}
                    </span>
                  </div>
                );
              })}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
};
