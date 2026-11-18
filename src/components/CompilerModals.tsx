import React from 'react';
import { Check, Loader2, Terminal } from 'lucide-react';

export { CompilerSettingsModal } from './CompilerSettingsModal';
export type { CompilerSettingsModalProps } from './CompilerSettingsModal';

export const COMPILATION_STEPS = [
  '01. Parsing domain constraints, SLA bounds & compliance posture',
  '02. Synthesizing 5-tier service topology & failure domains',
  '03. Running adversarial Security, SRE & FinOps multi-agent audit',
  '04. Generating PostgreSQL DDL, Docker Compose, OpenAPI 3.1 & RFC',
] as const;

interface CompilationTelemetryModalProps {
  isOpen: boolean;
  mode: 'compile' | 'heal';
  activeStepIndex: number;
  promptPreview: string;
}

export const CompilationTelemetryOverlay: React.FC<
  CompilationTelemetryModalProps
> = ({ isOpen, mode, activeStepIndex, promptPreview }) => {
  if (!isOpen) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="w-full max-w-lg bg-[#111114] border border-[#27272a] rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-[#09090b] border-b border-[#27272a] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-200">
            <Terminal className="w-3.5 h-3.5 text-sky-400" />
            <span>
              {mode === 'compile'
                ? 'ArchForge Compiler · Structured Topology Synthesis'
                : 'Self-Healing Compiler · Synthesizing Hardened Revision'}
            </span>
          </div>
          <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
        </div>

        <div className="p-5 space-y-4">
          <div className="text-xs text-zinc-400 bg-[#09090b] border border-[#27272a] rounded p-3 font-mono line-clamp-2">
            {promptPreview}
          </div>

          <div className="space-y-2.5 font-mono text-xs">
            {COMPILATION_STEPS.map((step, index) => {
              const isDone = index < activeStepIndex;
              const isCurrent = index === activeStepIndex;
              return (
                <div
                  key={step}
                  className={`flex items-center gap-2.5 ${
                    isDone
                      ? 'text-emerald-400'
                      : isCurrent
                        ? 'text-sky-300 font-medium'
                        : 'text-zinc-600'
                  }`}
                >
                  {isDone ? (
                    <Check className="w-3.5 h-3.5 shrink-0" />
                  ) : isCurrent ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <span className="w-3.5 h-3.5 inline-block text-center shrink-0">
                      ·
                    </span>
                  )}
                  <span>{step}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
