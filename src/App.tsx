import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Compass,
  Cpu,
  FolderGit2,
  GitBranch,
  Menu,
  Play,
  Sliders,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ArchitectureBlueprint,
  CompilerSettings,
  SimulationParams,
} from './types/architecture';
import { runFinOpsSimulation } from './engine/finopsSimulator';
import { analyzeNodeOutage } from './engine/chaosEngine';
import {
  reconcileSelectionState,
  resolveWorkspaceShortcut,
} from './engine/exportEngine';
import {
  autoHealArchitectureViaGemini,
  compileArchitectureViaGemini,
  computeNextVersionId,
  loadCompilerSettings,
  loadPersistedBlueprints,
  saveCompilerSettings,
  savePersistedBlueprints,
} from './services/compilerClient';
import { TopologyCanvas } from './components/TopologyCanvas';
import { NodeInspectorDrawer } from './components/NodeInspectorDrawer';
import { FinOpsSimulatorDock } from './components/FinOpsSimulatorDock';
import { MultiAgentAuditPanel } from './components/MultiAgentAuditPanel';
import { ArtifactStudio } from './components/ArtifactStudio';
import {
  COMPILATION_STEPS,
  CompilationTelemetryOverlay,
  CompilerSettingsModal,
} from './components/CompilerModals';

type WorkspaceTab = 'topology' | 'audit' | 'artifacts';

const SAMPLE_PROMPTS = [
  'Design a HIPAA-compliant telemedicine WebRTC video & real-time AI transcription platform for 50k daily consultations',
  'Design a global multiplayer game matchmaking, anti-cheat telemetry, and leaderboard engine for 80k concurrent RPS',
  'Design an IoT fleet telemetry ingestion and predictive maintenance time-series platform for 250k connected vehicles',
] as const;

export default function App() {
  const initialBlueprintsRef = useRef<ArchitectureBlueprint[] | null>(null);
  if (initialBlueprintsRef.current === null) {
    initialBlueprintsRef.current = loadPersistedBlueprints();
  }

  const [blueprints, setBlueprints] = useState<ArchitectureBlueprint[]>(
    () => initialBlueprintsRef.current!
  );
  const [activeBlueprintId, setActiveBlueprintId] = useState<string>(
    () =>
      initialBlueprintsRef.current![0]?.id ?? 'demo-fintech-payment-gateway'
  );

  const [settings, setSettings] = useState<CompilerSettings>(() =>
    loadCompilerSettings()
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isSubXlInspectorOpen, setIsSubXlInspectorOpen] =
    useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('topology');
  const [fitTriggerCounter, setFitTriggerCounter] = useState<number>(0);

  const promptInputRef = useRef<HTMLInputElement | null>(null);

  const activeBlueprint = useMemo(
    () =>
      blueprints.find((b) => b.id === activeBlueprintId) ?? blueprints[0],
    [blueprints, activeBlueprintId]
  );

  const activeVersion = useMemo(() => {
    const found = activeBlueprint.versions.find(
      (v) => v.versionId === activeBlueprint.activeVersionId
    );
    return found ?? activeBlueprint.versions[0];
  }, [activeBlueprint]);

  const [simParams, setSimParams] = useState<SimulationParams>(
    () => activeBlueprint.defaultSimulation
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    () =>
      activeVersion.nodes.find((n) => n.spofRisk === 'CRITICAL')?.id ??
      activeVersion.nodes[0]?.id ??
      null
  );
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(
    null
  );
  const [outageNodeId, setOutageNodeId] = useState<string | null>(null);

  const [promptInput, setPromptInput] = useState<string>('');
  const [promptValidationError, setPromptValidationError] = useState<
    string | null
  >(null);
  const [apiErrorBanner, setApiErrorBanner] = useState<string | null>(null);

  const [telemetryState, setTelemetryState] = useState<{
    active: boolean;
    mode: 'compile' | 'heal';
    stepIndex: number;
    preview: string;
  }>({
    active: false,
    mode: 'compile',
    stepIndex: 0,
    preview: '',
  });
  const stepTimerRef = useRef<number | null>(null);

  useEffect(() => {
    savePersistedBlueprints(blueprints);
  }, [blueprints]);

  const startTelemetryTicker = (mode: 'compile' | 'heal', preview: string) => {
    if (stepTimerRef.current) {
      window.clearInterval(stepTimerRef.current);
    }
    setTelemetryState({
      active: true,
      mode,
      stepIndex: 0,
      preview,
    });
    stepTimerRef.current = window.setInterval(() => {
      setTelemetryState((prev) => ({
        ...prev,
        stepIndex: Math.min(COMPILATION_STEPS.length - 1, prev.stepIndex + 1),
      }));
    }, 1850);
  };

  const stopTelemetryTicker = () => {
    if (stepTimerRef.current) {
      window.clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    setTelemetryState((prev) => ({ ...prev, active: false }));
  };

  useEffect(() => {
    return () => {
      if (stepTimerRef.current) {
        window.clearInterval(stepTimerRef.current);
      }
    };
  }, []);

  const simulation = useMemo(
    () =>
      runFinOpsSimulation(activeVersion.nodes, activeVersion.edges, simParams),
    [activeVersion.nodes, activeVersion.edges, simParams]
  );

  const outageBlastRadius = useMemo(
    () =>
      analyzeNodeOutage(
        activeVersion.nodes,
        activeVersion.edges,
        outageNodeId
      ),
    [activeVersion.nodes, activeVersion.edges, outageNodeId]
  );

  const selectedNode = useMemo(
    () => activeVersion.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [activeVersion.nodes, selectedNodeId]
  );

  const handleToggleOutageSimulation = useCallback(
    (explicitNodeId?: string) => {
      setOutageNodeId((prev) => {
        if (explicitNodeId) {
          return prev === explicitNodeId ? null : explicitNodeId;
        }
        const defaultTarget =
          selectedNodeId ??
          activeVersion.nodes.find((n) => n.spofRisk === 'CRITICAL')?.id ??
          activeVersion.nodes[0]?.id ??
          null;
        if (!defaultTarget) return null;
        return prev === defaultTarget ? null : defaultTarget;
      });
    },
    [activeVersion.nodes, selectedNodeId]
  );

  // Power-User Global Keyboard Shortcuts (Modifier-Safe)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      const action = resolveWorkspaceShortcut({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        isEditable,
        isBusy: telemetryState.active,
        isModalOpen: isSettingsOpen,
      });

      if (!action) return;

      switch (action) {
        case 'focus_prompt':
          e.preventDefault();
          promptInputRef.current?.focus();
          break;
        case 'escape':
          if (isEditable && target) {
            target.blur();
            return;
          }
          if (isSettingsOpen) {
            setIsSettingsOpen(false);
            return;
          }
          if (isSubXlInspectorOpen) {
            setIsSubXlInspectorOpen(false);
            return;
          }
          if (isMobileSidebarOpen) {
            setIsMobileSidebarOpen(false);
            return;
          }
          if (outageNodeId) {
            setOutageNodeId(null);
          }
          break;
        case 'fit_canvas':
          e.preventDefault();
          setActiveTab('topology');
          setFitTriggerCounter((c) => c + 1);
          break;
        case 'toggle_outage':
          e.preventDefault();
          setActiveTab('topology');
          handleToggleOutageSimulation();
          break;
        case 'tab_topology':
          setActiveTab('topology');
          break;
        case 'tab_audit':
          setActiveTab('audit');
          break;
        case 'tab_artifacts':
          setActiveTab('artifacts');
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleToggleOutageSimulation,
    isMobileSidebarOpen,
    isSettingsOpen,
    isSubXlInspectorOpen,
    outageNodeId,
    telemetryState.active,
  ]);

  const handleSelectNodeOnCanvas = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setHighlightedNodeId(null);
    if (typeof window !== 'undefined' && window.innerWidth < 1280) {
      setIsSubXlInspectorOpen(true);
    }
  };

  const handleSelectBlueprint = (bp: ArchitectureBlueprint) => {
    setActiveBlueprintId(bp.id);
    setSimParams(bp.defaultSimulation);
    const ver =
      bp.versions.find((v) => v.versionId === bp.activeVersionId) ??
      bp.versions[0];
    const nextState = reconcileSelectionState({
      nodes: ver.nodes,
      previousSelectedNodeId: selectedNodeId,
      previousOutageNodeId: outageNodeId,
      resetAllTransientStates: true,
    });
    setSelectedNodeId(nextState.selectedNodeId);
    setHighlightedNodeId(nextState.highlightedNodeId);
    setOutageNodeId(nextState.outageNodeId);
    setApiErrorBanner(null);
    setIsMobileSidebarOpen(false);
    setIsSubXlInspectorOpen(false);
  };

  const handleSelectVersion = (versionId: string) => {
    setBlueprints((prev) =>
      prev.map((bp) =>
        bp.id === activeBlueprint.id
          ? { ...bp, activeVersionId: versionId }
          : bp
      )
    );
    const nextVer = activeBlueprint.versions.find(
      (v) => v.versionId === versionId
    );
    if (nextVer) {
      const nextState = reconcileSelectionState({
        nodes: nextVer.nodes,
        previousSelectedNodeId: selectedNodeId,
        previousOutageNodeId: outageNodeId,
        resetAllTransientStates: false,
      });
      setSelectedNodeId(nextState.selectedNodeId);
      setHighlightedNodeId(nextState.highlightedNodeId);
      setOutageNodeId(nextState.outageNodeId);
    } else {
      setHighlightedNodeId(null);
    }
  };

  const handleDeleteBlueprint = (id: string) => {
    const remaining = blueprints.filter((b) => b.id !== id);
    if (remaining.length === 0) return;
    setBlueprints(remaining);
    if (activeBlueprint.id === id) {
      handleSelectBlueprint(remaining[0]);
    }
  };

  const handleCompileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (telemetryState.active) return;

    const trimmed = promptInput.trim();
    if (trimmed.length < 10) {
      setPromptValidationError(
        'Enter at least 10 characters describing your system architecture requirements.'
      );
      return;
    }
    setPromptValidationError(null);
    setApiErrorBanner(null);

    startTelemetryTicker('compile', trimmed);
    try {
      const compiledBlueprint = await compileArchitectureViaGemini(
        trimmed,
        settings
      );
      setBlueprints((prev) => [compiledBlueprint, ...prev]);
      setActiveBlueprintId(compiledBlueprint.id);
      setSimParams(compiledBlueprint.defaultSimulation);
      const firstVer = compiledBlueprint.versions[0];
      setSelectedNodeId(
        firstVer.nodes.find((n) => n.spofRisk === 'CRITICAL')?.id ??
          firstVer.nodes[0]?.id ??
          null
      );
      setOutageNodeId(null);
      setActiveTab('topology');
      setPromptInput('');
    } catch (err) {
      setApiErrorBanner(
        err instanceof Error
          ? err.message
          : 'Failed to compile architecture via Gemini.'
      );
    } finally {
      stopTelemetryTicker();
    }
  };

  const handleAutoHeal = async () => {
    if (telemetryState.active) return;
    setApiErrorBanner(null);

    const targetBlueprintSnapshot = activeBlueprint;
    const targetVersionSnapshot = activeVersion;

    startTelemetryTicker(
      'heal',
      `Auto-healing ${targetBlueprintSnapshot.name} (${targetVersionSnapshot.versionLabel}) across ${targetVersionSnapshot.audit.findings.length} audit findings`
    );

    try {
      const healedVersion = await autoHealArchitectureViaGemini(
        targetBlueprintSnapshot,
        targetVersionSnapshot,
        settings
      );

      setBlueprints((prev) =>
        prev.map((bp) => {
          if (bp.id !== targetBlueprintSnapshot.id) return bp;
          const uniqueVerId = computeNextVersionId(bp.versions);
          const safeVersion = {
            ...healedVersion,
            versionId: uniqueVerId,
            versionLabel: `${uniqueVerId} · Auto-Healed`,
          };
          return {
            ...bp,
            updatedAt: safeVersion.createdAt,
            activeVersionId: safeVersion.versionId,
            versions: [...bp.versions, safeVersion],
          };
        })
      );
      setOutageNodeId(null);
      setSelectedNodeId(healedVersion.nodes[0]?.id ?? null);
      setIsSubXlInspectorOpen(false);
      setActiveTab('audit');
    } catch (err) {
      setApiErrorBanner(
        err instanceof Error
          ? err.message
          : 'Failed to auto-heal architecture via Gemini.'
      );
    } finally {
      stopTelemetryTicker();
    }
  };

  const handleFocusNodeFromAudit = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setHighlightedNodeId(nodeId);
    setActiveTab('topology');
    if (typeof window !== 'undefined' && window.innerWidth < 1280) {
      setIsSubXlInspectorOpen(true);
    }
  };

  const handleSaveSettings = (next: CompilerSettings) => {
    setSettings(next);
    saveCompilerSettings(next);
    setSimParams((prev) => ({
      ...prev,
      cloudProfile: next.cloudProfile,
    }));
  };

  const criticalFindingsCount = activeVersion.audit.findings.filter(
    (f) => f.severity === 'CRITICAL'
  ).length;

  return (
    <div className="min-h-screen h-screen flex flex-col bg-[#09090b] text-[#f4f4f5] overflow-hidden">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="h-12 px-3 sm:px-5 bg-[#111114] border-b border-[#27272a] flex items-center justify-between gap-2 sm:gap-8 shrink-0">
        {/* Zone 1: Single-line Brand Wordmark */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen((v) => !v)}
            aria-label="Toggle workspace blueprints sidebar"
            className="lg:hidden p-1.5 text-zinc-400 hover:text-zinc-100 rounded border border-[#27272a] cursor-pointer"
          >
            {isMobileSidebarOpen ? (
              <X className="w-4 h-4" />
            ) : (
              <Menu className="w-4 h-4" />
            )}
          </button>
          <a
            href="#workspace"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('topology');
            }}
            className="text-sm sm:text-base font-bold tracking-tight text-zinc-100 whitespace-nowrap shrink-0"
          >
            ArchForge AI
          </a>
        </div>

        {/* Zone 2: Clean Single-Line Navigation Links */}
        <nav
          aria-label="Primary Workspace Modules"
          className="flex items-center gap-3 sm:gap-6 h-full text-xs font-medium min-w-0 overflow-x-auto"
        >
          <button
            type="button"
            onClick={() => setActiveTab('topology')}
            className={`h-full flex items-center border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'topology'
                ? 'border-sky-400 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-100'
            }`}
          >
            <span className="sm:hidden">Topology</span>
            <span className="hidden sm:inline">Topology &amp; FinOps</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`h-full flex items-center border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'audit'
                ? 'border-sky-400 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-100'
            }`}
          >
            <span className="sm:hidden">
              Audit ({activeVersion.audit.findings.length})
            </span>
            <span className="hidden sm:inline">
              Agent Audit Council ({activeVersion.audit.findings.length})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('artifacts')}
            className={`h-full flex items-center border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'artifacts'
                ? 'border-sky-400 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-100'
            }`}
          >
            <span className="sm:hidden">Artifacts</span>
            <span className="hidden sm:inline">Artifacts &amp; RFC (5)</span>
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Model Settings"
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-zinc-200 bg-[#09090b] border border-[#27272a] hover:border-zinc-500 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="hidden sm:inline">Model Settings</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Shell */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Sidebar Scrim */}
        {isMobileSidebarOpen && (
          <div
            aria-hidden="true"
            onClick={() => setIsMobileSidebarOpen(false)}
            className="lg:hidden fixed inset-0 top-12 z-30 bg-black/60"
          />
        )}

        {/* Left Project & Version History Sidebar */}
        <aside
          aria-label="Blueprints and Version History"
          className={`${
            isMobileSidebarOpen
              ? 'fixed top-12 bottom-0 left-0 z-40 w-72 flex'
              : 'hidden'
          } lg:static lg:flex lg:w-64 bg-[#111114] border-r border-[#27272a] flex-col justify-between shrink-0 overflow-y-auto`}
        >
          <div className="p-3.5 space-y-5">
            {/* Blueprints List */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 mb-2">
                <span className="inline-flex items-center gap-1.5">
                  <FolderGit2 className="w-3.5 h-3.5 text-zinc-500" />
                  Architecture Blueprints
                </span>
                <span className="font-mono text-zinc-500">
                  {blueprints.length}
                </span>
              </div>

              <div className="space-y-1.5">
                {blueprints.map((bp) => {
                  const isCurrent = bp.id === activeBlueprint.id;
                  return (
                    <div
                      key={bp.id}
                      className={`group rounded-md border transition-colors ${
                        isCurrent
                          ? 'bg-[#09090b] border-sky-400/60'
                          : 'bg-[#09090b]/40 border-[#27272a] hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-start justify-between p-2.5 gap-1">
                        <button
                          type="button"
                          title={`${bp.name} — ${bp.domainTag}`}
                          onClick={() => handleSelectBlueprint(bp)}
                          className="text-left flex-1 min-w-0 cursor-pointer"
                        >
                          <div className="text-xs font-medium text-zinc-100 leading-snug line-clamp-2">
                            {bp.name}
                          </div>
                          <div className="mt-1 text-[10px] text-zinc-500 truncate">
                            {bp.domainTag}
                          </div>
                        </button>
                        {!bp.isDemo && (
                          <button
                            type="button"
                            onClick={() => handleDeleteBlueprint(bp.id)}
                            aria-label={`Delete blueprint ${bp.name}`}
                            className="p-1 text-zinc-500 hover:text-red-400 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Version History Switcher (v1, v2 Healed) */}
            <div className="pt-4 border-t border-[#27272a]">
              <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 mb-2">
                <span className="inline-flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-zinc-500" />
                  Version Revisions
                </span>
                <span className="font-mono text-zinc-500">
                  {activeBlueprint.versions.length}
                </span>
              </div>

              <div className="space-y-1">
                {activeBlueprint.versions.map((ver) => {
                  const isActiveVer = ver.versionId === activeVersion.versionId;
                  return (
                    <button
                      key={ver.versionId}
                      type="button"
                      title={ver.versionLabel}
                      onClick={() => handleSelectVersion(ver.versionId)}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded border text-xs font-mono transition-colors cursor-pointer ${
                        isActiveVer
                          ? 'bg-sky-500/10 border-sky-400/60 text-sky-200'
                          : 'bg-[#09090b] border-[#27272a] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <span className="truncate">{ver.versionLabel}</span>
                      {ver.diffFromPrevious && (
                        <span className="text-[10px] text-emerald-400 shrink-0 ml-1">
                          Diff
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Adversarial Council Quick Scorecard */}
            <div className="pt-4 border-t border-[#27272a] space-y-2.5">
              <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400">
                <span>Council Audit Posture</span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('audit');
                    setIsMobileSidebarOpen(false);
                  }}
                  className="text-sky-400 hover:underline text-[11px] cursor-pointer"
                >
                  Open Report
                </button>
              </div>

              <div className="bg-[#09090b] border border-[#27272a] rounded p-2.5 space-y-2 font-mono text-xs tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 font-sans text-[11px]">
                    Security
                  </span>
                  <span
                    className={
                      activeVersion.audit.securityScore >= 85
                        ? 'text-emerald-400 font-semibold'
                        : 'text-amber-400 font-semibold'
                    }
                  >
                    {activeVersion.audit.securityScore}/100
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 font-sans text-[11px]">
                    Resilience
                  </span>
                  <span
                    className={
                      activeVersion.audit.resilienceScore >= 85
                        ? 'text-emerald-400 font-semibold'
                        : activeVersion.audit.resilienceScore >= 65
                          ? 'text-amber-400 font-semibold'
                          : 'text-red-400 font-semibold'
                    }
                  >
                    {activeVersion.audit.resilienceScore}/100
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 font-sans text-[11px]">
                    Cost Efficiency
                  </span>
                  <span
                    className={
                      activeVersion.audit.costEfficiencyScore >= 85
                        ? 'text-emerald-400 font-semibold'
                        : 'text-sky-300 font-semibold'
                    }
                  >
                    {activeVersion.audit.costEfficiencyScore}/100
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={telemetryState.active}
                onClick={handleAutoHeal}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-zinc-900 hover:bg-zinc-800 border border-[#27272a] hover:border-sky-400/60 text-xs font-medium text-zinc-100 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                {criticalFindingsCount > 0
                  ? `Auto-Heal (${criticalFindingsCount} Critical)`
                  : 'Synthesize Hardened Next Rev'}
              </button>
            </div>
          </div>

          <div className="p-3.5 border-t border-[#27272a] text-[11px] text-zinc-500 font-mono truncate">
            {settings.geminiModel} · {settings.thinkingLevel} ·{' '}
            {settings.cloudProfile.toUpperCase()}
          </div>
        </aside>

        {/* Main Center + Contextual Right Workspace */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Architecture Compiler Command Bar */}
          <div className="px-3 sm:px-4 py-2 bg-[#111114] border-b border-[#27272a] shrink-0 space-y-2">
            <form
              onSubmit={handleCompileSubmit}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
            >
              <div className="relative flex-1 flex items-center">
                <Compass className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
                <label htmlFor="arch-compiler-input" className="sr-only">
                  Describe system architecture requirements to compile
                </label>
                <input
                  ref={promptInputRef}
                  id="arch-compiler-input"
                  type="text"
                  value={promptInput}
                  onChange={(e) => {
                    setPromptInput(e.target.value);
                    if (promptValidationError) setPromptValidationError(null);
                  }}
                  placeholder="Describe any system to compile live via Gemini (press / to focus)..."
                  className="w-full bg-[#09090b] border border-[#27272a] focus:border-sky-400 rounded-md pl-9 pr-9 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                />
                <kbd className="hidden md:inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-mono text-zinc-500 bg-zinc-900 border border-[#27272a] rounded absolute right-2.5 pointer-events-none">
                  /
                </kbd>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const nextSample =
                      SAMPLE_PROMPTS[
                        Math.floor(Math.random() * SAMPLE_PROMPTS.length)
                      ];
                    setPromptInput(nextSample);
                    setPromptValidationError(null);
                  }}
                  className="px-2.5 py-2 rounded-md bg-[#09090b] border border-[#27272a] hover:border-zinc-600 text-xs text-zinc-300 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Sample Prompt
                </button>
                <button
                  type="submit"
                  disabled={telemetryState.active}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-sky-400 hover:bg-sky-300 disabled:opacity-50 text-zinc-950 font-semibold text-xs transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Compile Architecture
                </button>
              </div>
            </form>

            {promptValidationError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-1.5"
              >
                <span className="inline-flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {promptValidationError}
                </span>
                <button
                  type="button"
                  onClick={() => setPromptValidationError(null)}
                  aria-label="Dismiss validation notice"
                  className="text-amber-300 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {apiErrorBanner && (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded px-3 py-1.5"
              >
                <span className="inline-flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {apiErrorBanner}
                </span>
                <button
                  type="button"
                  onClick={() => setApiErrorBanner(null)}
                  aria-label="Dismiss API error alert"
                  className="text-red-300 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {activeVersion.synthesisEngine === 'deterministic-fallback' && (
              <div
                role="status"
                aria-label="Deterministic Synthesis Engine Notice"
                className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-sky-200 bg-sky-500/10 border border-sky-500/25 rounded px-3 py-1.5"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>
                    Compiled via Built-in Deterministic Engine · Add an active
                    Gemini key in{' '}
                    <button
                      type="button"
                      onClick={() => setIsSettingsOpen(true)}
                      className="underline font-medium text-sky-300 hover:text-white cursor-pointer"
                    >
                      Model Settings
                    </button>{' '}
                    for live LLM mode
                  </span>
                </span>
              </div>
            )}
          </div>

          {/* Active Workspace Content */}
          {activeTab === 'topology' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
              <div className="flex-1 flex min-h-0 overflow-hidden relative">
                {/* Center Interactive System Topology Canvas */}
                <div className="flex-1 min-w-0 relative">
                  <TopologyCanvas
                    blueprintName={activeBlueprint.name}
                    domainTag={activeBlueprint.domainTag}
                    versionLabel={activeVersion.versionLabel}
                    nodes={activeVersion.nodes}
                    edges={activeVersion.edges}
                    simulation={simulation}
                    selectedNodeId={selectedNodeId}
                    highlightedNodeId={highlightedNodeId}
                    outageBlastRadius={outageBlastRadius}
                    onSelectNode={handleSelectNodeOnCanvas}
                    onOpenInspectorDrawer={() => setIsSubXlInspectorOpen(true)}
                    onToggleOutageSimulation={handleToggleOutageSimulation}
                    onClearOutageSimulation={() => setOutageNodeId(null)}
                    layoutResetKey={`${activeBlueprint.id}-${activeVersion.versionId}`}
                    fitTriggerCounter={fitTriggerCounter}
                  />
                </div>

                {/* Desktop (>= 1280px xl) Docked Node Inspector */}
                <div className="hidden xl:flex w-[348px] shrink-0 h-full min-h-0 flex-col">
                  <NodeInspectorDrawer
                    node={selectedNode}
                    metrics={
                      selectedNode
                        ? simulation.nodeMetrics[selectedNode.id]
                        : undefined
                    }
                    edges={activeVersion.edges}
                    allNodes={activeVersion.nodes}
                    findings={activeVersion.audit.findings}
                    outageBlastRadius={outageBlastRadius}
                    onSelectNode={(id) => setSelectedNodeId(id)}
                    onCloseSelection={() => setSelectedNodeId(null)}
                    onToggleNodeOutage={(id) =>
                      handleToggleOutageSimulation(id)
                    }
                    onTriggerAutoHeal={handleAutoHeal}
                    isHealing={telemetryState.active}
                  />
                </div>

                {/* Laptop / Tablet / Mobile (< 1280px) Slide-Over Node Inspector Drawer */}
                {isSubXlInspectorOpen && (
                  <>
                    <div
                      aria-hidden="true"
                      onClick={() => setIsSubXlInspectorOpen(false)}
                      className="xl:hidden fixed inset-0 top-12 z-20 bg-black/55"
                    />
                    <div className="xl:hidden fixed top-12 bottom-0 right-0 z-30 w-full max-w-[360px] flex flex-col min-h-0">
                      <NodeInspectorDrawer
                        node={selectedNode}
                        metrics={
                          selectedNode
                            ? simulation.nodeMetrics[selectedNode.id]
                            : undefined
                        }
                        edges={activeVersion.edges}
                        allNodes={activeVersion.nodes}
                        findings={activeVersion.audit.findings}
                        outageBlastRadius={outageBlastRadius}
                        onSelectNode={(id) => setSelectedNodeId(id)}
                        onCloseSelection={() => setIsSubXlInspectorOpen(false)}
                        onToggleNodeOutage={(id) =>
                          handleToggleOutageSimulation(id)
                        }
                        onTriggerAutoHeal={handleAutoHeal}
                        isHealing={telemetryState.active}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Bottom Real-Time Load, Latency & FinOps Simulator Dock */}
              <FinOpsSimulatorDock
                params={simParams}
                defaultParams={activeBlueprint.defaultSimulation}
                simulation={simulation}
                nodes={activeVersion.nodes}
                onChangeParams={setSimParams}
                onSelectNode={handleSelectNodeOnCanvas}
              />
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <MultiAgentAuditPanel
                audit={activeVersion.audit}
                nodes={activeVersion.nodes}
                diffFromPrevious={activeVersion.diffFromPrevious}
                versionLabel={activeVersion.versionLabel}
                isHealing={telemetryState.active}
                onAutoHeal={handleAutoHeal}
                onFocusNodeOnCanvas={handleFocusNodeFromAudit}
              />
            </div>
          )}

          {activeTab === 'artifacts' && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <ArtifactStudio
                blueprint={activeBlueprint}
                activeVersion={activeVersion}
                blueprintName={activeBlueprint.name}
                versionLabel={activeVersion.versionLabel}
                artifacts={activeVersion.artifacts}
                simulation={simulation}
                simulationParams={simParams}
              />
            </div>
          )}
        </main>
      </div>

      {/* Modals & Live Telemetry Overlays */}
      <CompilationTelemetryOverlay
        isOpen={telemetryState.active}
        mode={telemetryState.mode}
        activeStepIndex={telemetryState.stepIndex}
        promptPreview={telemetryState.preview}
      />

      <CompilerSettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        onSave={handleSaveSettings}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
