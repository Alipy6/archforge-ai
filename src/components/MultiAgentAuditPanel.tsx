import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Coins,
  Crosshair,
  GitCompare,
  ServerCrash,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import type {
  ArchitectureDiff,
  ArchNode,
  AuditFinding,
  AuditPersonaId,
  FindingSeverity,
  MultiAgentAudit,
} from '../types/architecture';

interface MultiAgentAuditPanelProps {
  audit: MultiAgentAudit;
  nodes: ArchNode[];
  diffFromPrevious?: ArchitectureDiff;
  versionLabel: string;
  isHealing: boolean;
  onAutoHeal: () => void;
  onFocusNodeOnCanvas: (nodeId: string) => void;
}

const PERSONA_INFO: Record<
  AuditPersonaId,
  {
    name: string;
    role: string;
    mandate: string;
    scoreKey: 'securityScore' | 'resilienceScore' | 'costEfficiencyScore';
    icon: React.FC<{ className?: string }>;
  }
> = {
  security: {
    name: 'Principal Red-Team Security Auditor',
    role: 'Zero-Trust · IAM · Crypto · Injection Vectors',
    mandate:
      'Audits lateral east-west mTLS, tenant data isolation, secret/PAN enclaves, and untrusted input vectors.',
    scoreKey: 'securityScore',
    icon: ShieldAlert,
  },
  sre: {
    name: 'Staff Distributed Systems SRE',
    role: 'SPOFs · Consensus · Tail Latency · Breakers',
    mandate:
      'Evaluates quorum durability, connection pool saturation, thundering-herd retries, and AZ blast radius.',
    scoreKey: 'resilienceScore',
    icon: ServerCrash,
  },
  finops: {
    name: 'Cloud FinOps Economist',
    role: 'Unit Economics · Egress Traps · Right-Sizing',
    mandate:
      'Identifies under-utilized GPU/compute tiers, cross-AZ NAT/Kafka transfer waste, and storage tiering.',
    scoreKey: 'costEfficiencyScore',
    icon: Coins,
  },
};

export const MultiAgentAuditPanel: React.FC<MultiAgentAuditPanelProps> = ({
  audit,
  nodes,
  diffFromPrevious,
  versionLabel,
  isHealing,
  onAutoHeal,
  onFocusNodeOnCanvas,
}) => {
  const [severityFilter, setSeverityFilter] = useState<'ALL' | FindingSeverity>(
    'ALL'
  );
  const [personaFilter, setPersonaFilter] = useState<'ALL' | AuditPersonaId>(
    'ALL'
  );

  const nodeLabelMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const n of nodes) {
      map[n.id] = n.label;
    }
    return map;
  }, [nodes]);

  const filteredFindings = React.useMemo(() => {
    return audit.findings.filter((f: AuditFinding) => {
      if (severityFilter !== 'ALL' && f.severity !== severityFilter) {
        return false;
      }
      if (personaFilter !== 'ALL' && f.persona !== personaFilter) {
        return false;
      }
      return true;
    });
  }, [audit.findings, severityFilter, personaFilter]);

  const criticalCount = audit.findings.filter(
    (f) => f.severity === 'CRITICAL'
  ).length;
  const warningCount = audit.findings.filter(
    (f) => f.severity === 'WARNING'
  ).length;

  const formatScoreColor = (score: number): string => {
    if (score >= 85) return 'text-emerald-400';
    if (score >= 70) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <div className="h-full overflow-y-auto bg-[#09090b] p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Council Header + 1-Click Auto-Heal CTA */}
        <div className="bg-[#111114] border border-[#27272a] rounded-lg p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
              <span>Adversarial Multi-Agent Review Council</span>
              <span aria-hidden="true">·</span>
              <span className="text-zinc-200">{versionLabel}</span>
              <span aria-hidden="true">·</span>
              <span>
                {criticalCount} Critical · {warningCount} Warnings
              </span>
            </div>
            <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">
              Automated Security, Distributed SRE &amp; Cloud FinOps Audit
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {audit.executiveSummary}
            </p>
          </div>

          <div className="shrink-0 flex flex-col items-stretch sm:items-end gap-2">
            <button
              type="button"
              disabled={isHealing}
              onClick={onAutoHeal}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-sky-400 hover:bg-sky-300 disabled:opacity-50 text-zinc-950 font-semibold text-xs transition-colors whitespace-nowrap cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              {isHealing
                ? 'Synthesizing Self-Healed Architecture...'
                : '1-Click Auto-Heal Architecture'}
            </button>
            <span className="text-[11px] text-zinc-500 font-mono">
              Compiles remediated topology + Before/After Diff via Gemini
            </span>
          </div>
        </div>

        {/* Architecture Diff Summary (Displayed when viewing an Auto-Healed version) */}
        {diffFromPrevious && (
          <section
            aria-label="Architecture Diff Summary"
            className="bg-[#111114] border border-emerald-500/35 rounded-lg p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#27272a] pb-3.5">
              <div className="flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-zinc-100">
                  Self-Healing Architecture Diff Summary
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums">
                <span className="text-emerald-400">
                  Security {diffFromPrevious.securityScoreDelta >= 0 ? '+' : ''}
                  {diffFromPrevious.securityScoreDelta} pts
                </span>
                <span aria-hidden="true" className="text-zinc-700">
                  ·
                </span>
                <span className="text-emerald-400">
                  Resilience {diffFromPrevious.resilienceScoreDelta >= 0 ? '+' : ''}
                  {diffFromPrevious.resilienceScoreDelta} pts
                </span>
                <span aria-hidden="true" className="text-zinc-700">
                  ·
                </span>
                <span className="text-emerald-400">
                  Cost Efficiency{' '}
                  {diffFromPrevious.costEfficiencyScoreDelta >= 0 ? '+' : ''}
                  {diffFromPrevious.costEfficiencyScoreDelta} pts
                </span>
                <span aria-hidden="true" className="text-zinc-700">
                  ·
                </span>
                <span
                  className={
                    diffFromPrevious.baseMonthlyCostDeltaUsd <= 0
                      ? 'text-emerald-300'
                      : 'text-amber-300'
                  }
                >
                  Base Spend{' '}
                  {diffFromPrevious.baseMonthlyCostDeltaUsd >= 0 ? '+$' : '-$'}
                  {Math.abs(diffFromPrevious.baseMonthlyCostDeltaUsd).toLocaleString()}
                  /mo
                </span>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              {diffFromPrevious.summary}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Added Nodes */}
              <div className="bg-[#09090b] border border-[#27272a] rounded p-3.5 space-y-2">
                <div className="text-xs font-semibold text-zinc-200">
                  Added / Enclave Components ({diffFromPrevious.addedNodes.length})
                </div>
                {diffFromPrevious.addedNodes.length === 0 ? (
                  <div className="text-xs text-zinc-500">
                    In-place cluster upgrades applied without extra hops.
                  </div>
                ) : (
                  diffFromPrevious.addedNodes.map((added) => (
                    <div
                      key={added.id}
                      className="text-xs space-y-0.5 pt-1.5 border-t border-[#27272a] first:border-t-0 first:pt-0"
                    >
                      <div className="font-mono text-emerald-400 font-medium">
                        + {added.label}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {added.technology}
                      </div>
                      <p className="text-[11px] text-zinc-500 leading-snug">
                        {added.reason}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Upgraded Protocols & Storage */}
              <div className="bg-[#09090b] border border-[#27272a] rounded p-3.5 space-y-2">
                <div className="text-xs font-semibold text-zinc-200">
                  Upgraded Protocols &amp; Tiers ({diffFromPrevious.upgradedProtocols.length})
                </div>
                {diffFromPrevious.upgradedProtocols.map((upg, idx) => (
                  <div
                    key={idx}
                    className="text-xs space-y-0.5 pt-1.5 border-t border-[#27272a] first:border-t-0 first:pt-0"
                  >
                    <div className="font-medium text-zinc-200">
                      {upg.edgeLabel}
                    </div>
                    <div className="font-mono text-[11px] text-sky-400">
                      {upg.from} → {upg.to}
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-snug">
                      {upg.rationale}
                    </p>
                  </div>
                ))}
              </div>

              {/* Remediated Risks */}
              <div className="bg-[#09090b] border border-[#27272a] rounded p-3.5 space-y-2">
                <div className="text-xs font-semibold text-zinc-200">
                  Verified Risk Reductions ({diffFromPrevious.remediatedRisks.length})
                </div>
                <ul className="space-y-1.5">
                  {diffFromPrevious.remediatedRisks.map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-1.5 text-[11px] text-zinc-300 leading-snug"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* 3 Engineering Persona Quantitative Scorecards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['security', 'sre', 'finops'] as const).map((personaId) => {
            const info = PERSONA_INFO[personaId];
            const Icon = info.icon;
            const score = audit[info.scoreKey];
            const personaFindingsCount = audit.findings.filter(
              (f) => f.persona === personaId
            ).length;
            const isActive = personaFilter === personaId;

            return (
              <button
                key={personaId}
                type="button"
                onClick={() =>
                  setPersonaFilter((prev) =>
                    prev === personaId ? 'ALL' : personaId
                  )
                }
                className={`text-left bg-[#111114] border rounded-lg p-4 transition-colors cursor-pointer ${
                  isActive
                    ? 'border-sky-400 bg-sky-500/5'
                    : 'border-[#27272a] hover:border-zinc-600'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
                      <Icon className="w-4 h-4 text-zinc-400 shrink-0" />
                      <span>{info.name}</span>
                    </div>
                    <div className="text-[11px] font-mono text-zinc-500">
                      {info.role}
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div
                      className={`text-2xl font-bold leading-none ${formatScoreColor(
                        score
                      )}`}
                    >
                      {score}
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">/ 100</div>
                  </div>
                </div>

                <p className="mt-3 text-xs text-zinc-400 leading-relaxed">
                  {info.mandate}
                </p>

                <div className="mt-3 pt-2.5 border-t border-[#27272a] flex items-center justify-between text-[11px] font-mono text-zinc-400">
                  <span>{personaFindingsCount} Active Findings</span>
                  <span className="text-sky-400">
                    {isActive ? 'Showing Only · Clear' : 'Filter Findings'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Prioritized Findings Table / List with Filter Controls */}
        <div className="bg-[#111114] border border-[#27272a] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#27272a] flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-semibold text-zinc-200">
              Prioritized Engineering Findings ({filteredFindings.length})
            </div>

            <div className="flex items-center gap-1 bg-[#09090b] border border-[#27272a] rounded p-0.5">
              {(['ALL', 'CRITICAL', 'WARNING', 'OPTIMIZATION'] as const).map(
                (sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setSeverityFilter(sev)}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors whitespace-nowrap ${
                      severityFilter === sev
                        ? 'bg-zinc-800 text-zinc-100 font-medium'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {sev}
                  </button>
                )
              )}
            </div>
          </div>

          {filteredFindings.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-400">
              No audit findings match the active severity or persona filter.
            </div>
          ) : (
            <div className="divide-y divide-[#27272a]">
              {filteredFindings.map((finding) => {
                const targetLabel =
                  nodeLabelMap[finding.targetNodeId] ?? finding.targetNodeId;
                return (
                  <div
                    key={finding.id}
                    className="p-4 hover:bg-zinc-900/40 transition-colors flex flex-col lg:flex-row lg:items-start justify-between gap-4"
                  >
                    <div className="space-y-2 max-w-4xl">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            finding.severity === 'CRITICAL'
                              ? 'text-red-400'
                              : finding.severity === 'WARNING'
                                ? 'text-amber-400'
                                : 'text-sky-400'
                          }`}
                        >
                          {finding.severity === 'CRITICAL' && (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          )}
                          {finding.severity}
                        </span>
                        <span aria-hidden="true" className="text-zinc-700">
                          ·
                        </span>
                        <span className="text-zinc-400">
                          {PERSONA_INFO[finding.persona].name}
                        </span>
                        <span aria-hidden="true" className="text-zinc-700">
                          ·
                        </span>
                        <span className="text-zinc-300">
                          Target: {targetLabel}
                        </span>
                      </div>

                      <h4 className="text-sm font-semibold text-zinc-100">
                        {finding.title}
                      </h4>

                      <p className="text-xs text-zinc-400 leading-relaxed">
                        {finding.analysis}
                      </p>

                      <div className="bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-xs text-zinc-300">
                        <span className="font-semibold text-zinc-200">
                          Remediation:{' '}
                        </span>
                        {finding.recommendation}
                      </div>

                      <div className="text-[11px] font-mono text-emerald-400/90">
                        Expected Impact: {finding.estimatedImpact}
                      </div>
                    </div>

                    <div className="shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          onFocusNodeOnCanvas(finding.targetNodeId)
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#09090b] border border-[#27272a] hover:border-sky-400 text-xs font-mono text-zinc-200 hover:text-sky-300 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Crosshair className="w-3.5 h-3.5" />
                        Locate on Canvas
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
