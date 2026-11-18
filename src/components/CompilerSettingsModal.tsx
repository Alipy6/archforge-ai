import React from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldAlert,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  CloudProfile,
  CompilerSettings,
  CompliancePreset,
  GeminiModelOption,
  KeyVerificationResult,
  ThinkingLevelOption,
} from '../types/architecture';
import { verifyGeminiApiKey } from '../services/compilerClient';

export interface CompilerSettingsModalProps {
  isOpen: boolean;
  settings: CompilerSettings;
  onSave: (next: CompilerSettings) => void;
  onClose: () => void;
}

export const CompilerSettingsModal: React.FC<CompilerSettingsModalProps> = ({
  isOpen,
  settings,
  onSave,
  onClose,
}) => {
  const [draft, setDraft] = React.useState<CompilerSettings>(settings);
  const [showApiKey, setShowApiKey] = React.useState<boolean>(false);
  const [isVerifying, setIsVerifying] = React.useState<boolean>(false);
  const [verifyStatus, setVerifyStatus] =
    React.useState<KeyVerificationResult | null>(null);

  React.useEffect(() => {
    setDraft(settings);
    setVerifyStatus(null);
    setShowApiKey(false);
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const handleVerifyKey = async () => {
    if (isVerifying) return;
    setIsVerifying(true);
    setVerifyStatus(null);
    try {
      const result = await verifyGeminiApiKey(
        draft.customApiKey,
        draft.geminiModel
      );
      setVerifyStatus(result);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="compiler-settings-title"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="w-full max-w-lg max-h-[calc(100vh-2rem)] flex flex-col bg-[#111114] border border-[#27272a] rounded-lg overflow-hidden my-auto">
        <div className="px-5 py-3.5 border-b border-[#27272a] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-sky-400" />
            <h2
              id="compiler-settings-title"
              className="text-sm font-semibold text-zinc-100"
            >
              Compiler &amp; Model Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close compiler settings"
            className="p-1 text-zinc-400 hover:text-zinc-100 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 p-5 space-y-4 text-xs overflow-y-auto">
          {/* Active Compiler Pipeline Banner */}
          <div className="bg-[#09090b] border border-[#27272a] rounded p-3 space-y-1">
            <div className="flex items-center justify-between font-mono">
              <span className="text-zinc-400">Active Compiler Pipeline</span>
              <span className="text-emerald-400 inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Hybrid Gemini + Fail-Open Engine
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Uses your custom BYOK key first, falls back to server{' '}
              <code className="text-zinc-300">GEMINI_API_KEY</code>, and
              automatically fails open to the built-in Deterministic Domain
              Compiler if offline or rate-limited.
            </p>
          </div>

          {/* Gemini Model Selector */}
          <div>
            <label
              htmlFor="setting-gemini-model"
              className="block font-medium text-zinc-200 mb-1.5"
            >
              Gemini Synthesis Model
            </label>
            <select
              id="setting-gemini-model"
              value={draft.geminiModel}
              onChange={(e) => {
                setDraft({
                  ...draft,
                  geminiModel: e.target.value as GeminiModelOption,
                });
                setVerifyStatus(null);
              }}
              className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-100 font-mono focus:outline-none focus:border-sky-400"
            >
              <option value="gemini-2.5-flash">
                gemini-2.5-flash — Fast Structured Compiler (Default)
              </option>
              <option value="gemini-2.5-pro">
                gemini-2.5-pro — Deep Multi-Agent Reasoning
              </option>
            </select>
          </div>

          {/* Optional Custom Gemini API Key (BYOK) + Live Verify */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="setting-custom-api-key"
                className="font-medium text-zinc-200 inline-flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5 text-sky-400" />
                Custom Gemini API Key (Optional BYOK)
              </label>
              {draft.customApiKey && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft({ ...draft, customApiKey: '' });
                    setVerifyStatus(null);
                  }}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  Clear Key
                </button>
              )}
            </div>

            <div className="flex items-stretch gap-2">
              <div className="relative flex-1 flex items-center">
                <input
                  id="setting-custom-api-key"
                  type={showApiKey ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  value={draft.customApiKey}
                  onChange={(e) => {
                    setDraft({ ...draft, customApiKey: e.target.value });
                    setVerifyStatus(null);
                  }}
                  placeholder="AIzaSy... (Leave blank to use server key or deterministic engine)"
                  className="w-full bg-[#09090b] border border-[#27272a] focus:border-sky-400 rounded pl-3 pr-9 py-2 text-zinc-100 font-mono placeholder:text-zinc-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                  className="absolute right-2.5 text-zinc-500 hover:text-zinc-200 cursor-pointer"
                >
                  {showApiKey ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={handleVerifyKey}
                disabled={isVerifying}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-zinc-900 hover:bg-zinc-800 border border-[#27272a] hover:border-sky-400/60 text-zinc-100 font-medium whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                {isVerifying ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
                )}
                Verify Key
              </button>
            </div>

            <p className="text-[11px] text-zinc-500">
              Stored locally in your browser and transmitted via{' '}
              <code className="text-zinc-400">x-gemini-api-key</code> over HTTPS
              for self-hosted Render, Railway, or Docker deployments.
            </p>

            {verifyStatus && (
              <div
                role="status"
                className={`flex items-start gap-2 rounded border px-3 py-2 text-[11px] leading-relaxed ${
                  verifyStatus.valid
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                }`}
              >
                {verifyStatus.valid ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                )}
                <span>{verifyStatus.message}</span>
              </div>
            )}
          </div>

          {/* Reasoning Depth */}
          <div>
            <label
              htmlFor="setting-thinking-level"
              className="block font-medium text-zinc-200 mb-1.5"
            >
              Reasoning Depth (Thinking Budget)
            </label>
            <select
              id="setting-thinking-level"
              value={draft.thinkingLevel}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  thinkingLevel: e.target.value as ThinkingLevelOption,
                })
              }
              className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-100 font-mono focus:outline-none focus:border-sky-400"
            >
              <option value="LOW">
                LOW — Fast Cloud Response (&lt;15s, Default)
              </option>
              <option value="MEDIUM">MEDIUM — Balanced Latency &amp; Audit</option>
              <option value="HIGH">HIGH — Deep Architectural Reasoning</option>
              <option value="XHIGH">XHIGH — Maximum Multi-Agent Rigor</option>
            </select>
          </div>

          {/* Compliance Framework */}
          <div>
            <label
              htmlFor="setting-compliance"
              className="block font-medium text-zinc-200 mb-1.5"
            >
              Default Compliance &amp; Security Baseline
            </label>
            <select
              id="setting-compliance"
              value={draft.compliancePreset}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  compliancePreset: e.target.value as CompliancePreset,
                })
              }
              className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-100 font-mono focus:outline-none focus:border-sky-400"
            >
              <option value="SOC2_ISO27001">SOC2 Type II + ISO 27001</option>
              <option value="PCI_DSS">
                PCI-DSS Level 1 (Financial / Enclave)
              </option>
              <option value="HIPAA">HIPAA / HITECH (PHI Isolation)</option>
              <option value="GENERAL">High-Growth Production SaaS</option>
            </select>
          </div>

          {/* Default Cloud Pricing Profile */}
          <div>
            <label
              htmlFor="setting-cloud"
              className="block font-medium text-zinc-200 mb-1.5"
            >
              FinOps Cloud Pricing Benchmark
            </label>
            <select
              id="setting-cloud"
              value={draft.cloudProfile}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  cloudProfile: e.target.value as CloudProfile,
                })
              }
              className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-100 font-mono focus:outline-none focus:border-sky-400"
            >
              <option value="aws">
                AWS (us-east-1 On-Demand + Savings Mix)
              </option>
              <option value="gcp">Google Cloud (us-central1 CUD Mix)</option>
              <option value="hybrid">Multi-Cloud Active Federation</option>
            </select>
          </div>

          {/* Auto-fit toggle */}
          <label className="flex items-center justify-between pt-1 cursor-pointer">
            <span className="text-zinc-300">
              Auto-fit topology graph after compilation
            </span>
            <input
              type="checkbox"
              checked={draft.autoFitOnCompile}
              onChange={(e) =>
                setDraft({ ...draft, autoFitOnCompile: e.target.checked })
              }
              className="w-4 h-4 accent-sky-400 rounded"
            />
          </label>
        </div>

        <div className="px-5 py-3 bg-[#09090b] border-t border-[#27272a] flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-[#27272a] text-xs text-zinc-300 hover:text-white cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="px-4 py-1.5 rounded bg-sky-400 hover:bg-sky-300 text-zinc-950 font-semibold text-xs cursor-pointer"
          >
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
};
