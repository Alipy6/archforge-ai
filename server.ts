import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  GoogleGenAI,
  ThinkingLevel,
  Type,
  type GenerateContentConfig,
  type Schema,
} from '@google/genai';
import {
  synthesizeDeterministicAutoHeal,
  synthesizeDeterministicBlueprint,
} from './src/engine/deterministicCompiler';
import type { ArchitectureVersion } from './src/types/architecture';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'] as const;
const ALLOWED_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
]);

function resolveActiveApiKey(req: Request): {
  apiKey: string | null;
  source: 'custom' | 'env' | 'none';
} {
  const headerKey = req.header('x-gemini-api-key')?.trim();
  if (headerKey && headerKey.length >= 12 && headerKey !== 'MY_GEMINI_API_KEY') {
    return { apiKey: headerKey, source: 'custom' };
  }

  const envKey = process.env.GEMINI_API_KEY?.trim();
  if (envKey && envKey.length >= 12 && envKey !== 'MY_GEMINI_API_KEY') {
    return { apiKey: envKey, source: 'env' };
  }

  return { apiKey: null, source: 'none' };
}

function resolveCandidateModels(req: Request, bodyModel?: string): string[] {
  const headerModel = req.header('x-gemini-model')?.trim();
  const preferred = headerModel || bodyModel?.trim() || DEFAULT_MODEL;
  const safePreferred = ALLOWED_MODELS.has(preferred) ? preferred : DEFAULT_MODEL;

  const chain: string[] = [safePreferred];
  for (const fallback of FALLBACK_MODELS) {
    if (!chain.includes(fallback)) {
      chain.push(fallback);
    }
  }
  return chain;
}

function resolveThinkingLevelEnum(level?: string): ThinkingLevel {
  switch (level) {
    case 'MEDIUM':
      return ThinkingLevel.MEDIUM;
    case 'HIGH':
      return ThinkingLevel.HIGH;
    case 'XHIGH':
      return ThinkingLevel.XHIGH;
    case 'LOW':
    default:
      return ThinkingLevel.LOW;
  }
}

function buildThinkingConfig(
  model: string,
  thinkingLevel = 'LOW'
): GenerateContentConfig['thinkingConfig'] | undefined {
  if (model.startsWith('gemini-2.0')) {
    return undefined;
  }

  if (model.startsWith('gemini-2.5-pro')) {
    const proBudgetMap: Record<string, number> = {
      LOW: 1024,
      MEDIUM: 4096,
      HIGH: 8192,
      XHIGH: 16384,
    };
    return { thinkingBudget: proBudgetMap[thinkingLevel] ?? 1024 };
  }

  if (model.startsWith('gemini-2.5')) {
    const flashBudgetMap: Record<string, number> = {
      LOW: 0,
      MEDIUM: 2048,
      HIGH: 8192,
      XHIGH: 16384,
    };
    return { thinkingBudget: flashBudgetMap[thinkingLevel] ?? 0 };
  }

  return { thinkingLevel: resolveThinkingLevelEnum(thinkingLevel) };
}

function isModelUnavailableError(err: unknown): boolean {
  const raw = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    raw.includes('404') ||
    raw.includes('not_found') ||
    raw.includes('not found') ||
    raw.includes('not supported') ||
    raw.includes('unavailable') ||
    raw.includes('invalid model')
  );
}

function isThinkingConfigUnsupportedError(err: unknown): boolean {
  const raw = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return raw.includes('thinking') && (raw.includes('400') || raw.includes('invalid'));
}

async function generateStructuredWithModelFallback(params: {
  apiKey: string;
  candidateModels: string[];
  contents: string;
  systemInstruction: string;
  responseSchema: Schema;
  thinkingLevel?: string;
}): Promise<{ parsed: Record<string, unknown>; usedModel: string }> {
  const ai = new GoogleGenAI({ apiKey: params.apiKey });
  let lastError: unknown = null;

  for (const model of params.candidateModels) {
    try {
      const thinkingConfig = buildThinkingConfig(model, params.thinkingLevel);
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: {
          systemInstruction: params.systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: params.responseSchema,
          ...(thinkingConfig ? { thinkingConfig } : {}),
        },
      });

      const parsed = parseStructuredJsonSafely(response.text);
      return { parsed, usedModel: model };
    } catch (err) {
      lastError = err;

      // Retry same model once without thinkingConfig if endpoint rejected thinking params
      if (isThinkingConfigUnsupportedError(err)) {
        try {
          const retryResponse = await ai.models.generateContent({
            model,
            contents: params.contents,
            config: {
              systemInstruction: params.systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: params.responseSchema,
            },
          });
          const parsed = parseStructuredJsonSafely(retryResponse.text);
          return { parsed, usedModel: model };
        } catch (retryErr) {
          lastError = retryErr;
        }
      }

      if (isModelUnavailableError(lastError)) {
        continue;
      }
      break;
    }
  }

  throw lastError ?? new Error('Gemini model synthesis failed.');
}

function parseStructuredJsonSafely(
  rawText: string | undefined
): Record<string, unknown> {
  const trimmed = (rawText ?? '').trim();
  if (!trimmed) {
    throw new Error('Upstream compiler returned an empty structured payload.');
  }

  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const obj = JSON.parse(unfenced) as unknown;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new Error('Structured payload was not a JSON object.');
    }
    return obj as Record<string, unknown>;
  } catch {
    throw new Error(
      'Upstream compiler returned malformed JSON.'
    );
  }
}

const NODE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    id: {
      type: Type.STRING,
      description: 'Kebab-case unique node identifier, e.g. payment-orchestrator',
    },
    label: {
      type: Type.STRING,
      description: 'Concise component title (2-4 words)',
    },
    tier: {
      type: Type.STRING,
      enum: ['edge', 'gateway', 'compute', 'messaging', 'storage'],
      description: 'Architectural tier for left-to-right topology layout',
    },
    technology: {
      type: Type.STRING,
      description:
        'Concrete production technology stack, e.g. Envoy + SPIFFE mTLS or PostgreSQL 17',
    },
    justification: {
      type: Type.STRING,
      description:
        '1-2 sentence engineering rationale for selecting this component',
    },
    scalingModel: {
      type: Type.STRING,
      enum: [
        'Horizontal Auto-Scale',
        'Serverless Elastic',
        'Vertical Primary-Replica',
        'Partitioned Cluster',
        'Global Edge Anycast',
      ],
    },
    spofRisk: {
      type: Type.STRING,
      enum: ['NONE', 'LOW', 'MODERATE', 'CRITICAL'],
    },
    baseLatencyMs: {
      type: Type.NUMBER,
      description:
        'Nominal P99 latency contribution in milliseconds (e.g. 1.5 to 35)',
    },
    baseMonthlyCostUsd: {
      type: Type.NUMBER,
      description:
        'Baseline monthly cloud cost in USD at nominal load (e.g. 450 to 4200)',
    },
    maxCapacityRps: {
      type: Type.NUMBER,
      description:
        'Maximum requests per second before saturation in single region (e.g. 6000 to 95000)',
    },
    costCategory: {
      type: Type.STRING,
      enum: ['compute', 'storage', 'network', 'ai_queue'],
    },
    isStateful: {
      type: Type.BOOLEAN,
    },
    replicas: {
      type: Type.INTEGER,
      description: 'Default replica or partition count (1 to 16)',
    },
    failureDomain: {
      type: Type.STRING,
      description:
        'Failure domain description, e.g. 3-AZ Raft Quorum or Single Writer AZ',
    },
  },
  required: [
    'id',
    'label',
    'tier',
    'technology',
    'justification',
    'scalingModel',
    'spofRisk',
    'baseLatencyMs',
    'baseMonthlyCostUsd',
    'maxCapacityRps',
    'costCategory',
    'isStateful',
    'replicas',
    'failureDomain',
  ],
};

const EDGE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    source: { type: Type.STRING, description: 'Exact id of source node' },
    target: { type: Type.STRING, description: 'Exact id of target node' },
    protocol: {
      type: Type.STRING,
      enum: [
        'HTTPS',
        'gRPC',
        'Kafka',
        'WebSocket',
        'SQL',
        'Redis RESP',
        'S3 API',
      ],
    },
    label: {
      type: Type.STRING,
      description: 'Short 2-3 word flow label, e.g. mTLS RPC or CDC Outbox',
    },
    isAsync: { type: Type.BOOLEAN },
    encrypted: { type: Type.BOOLEAN },
  },
  required: [
    'id',
    'source',
    'target',
    'protocol',
    'label',
    'isAsync',
    'encrypted',
  ],
};

const AUDIT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    securityScore: { type: Type.INTEGER, description: 'Score 0-100' },
    resilienceScore: { type: Type.INTEGER, description: 'Score 0-100' },
    costEfficiencyScore: { type: Type.INTEGER, description: 'Score 0-100' },
    executiveSummary: { type: Type.STRING },
    findings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          persona: {
            type: Type.STRING,
            enum: ['security', 'sre', 'finops'],
          },
          severity: {
            type: Type.STRING,
            enum: ['CRITICAL', 'WARNING', 'OPTIMIZATION'],
          },
          title: { type: Type.STRING },
          analysis: { type: Type.STRING },
          recommendation: { type: Type.STRING },
          targetNodeId: {
            type: Type.STRING,
            description: 'Must match one of the node ids in nodes array',
          },
          estimatedImpact: { type: Type.STRING },
        },
        required: [
          'id',
          'persona',
          'severity',
          'title',
          'analysis',
          'recommendation',
          'targetNodeId',
          'estimatedImpact',
        ],
      },
    },
  },
  required: [
    'securityScore',
    'resilienceScore',
    'costEfficiencyScore',
    'executiveSummary',
    'findings',
  ],
};

const ARTIFACTS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    schemaSql: {
      type: Type.STRING,
      description:
        'Complete PostgreSQL 17 DDL with UUIDs, foreign keys, partitioning or RLS, and composite indexes',
    },
    dockerComposeYml: {
      type: Type.STRING,
      description:
        'Runnable docker-compose.yml matching the architecture services',
    },
    openapiYaml: {
      type: Type.STRING,
      description:
        'OpenAPI 3.1.0 YAML specification for core endpoints and webhooks',
    },
    executiveRfcMd: {
      type: Type.STRING,
      description:
        'Polished Markdown Technical Architecture RFC & Cost Estimation Proposal',
    },
  },
  required: ['schemaSql', 'dockerComposeYml', 'openapiYaml', 'executiveRfcMd'],
};

const COMPILE_BLUEPRINT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: 'Concise system architecture title' },
    domainTag: {
      type: Type.STRING,
      description:
        'Compliance & domain summary, e.g. HIPAA · Real-Time Telemedicine',
    },
    recommendedPeakRps: { type: Type.INTEGER },
    recommendedReadRatioPercent: { type: Type.INTEGER },
    recommendedPayloadSizeKb: { type: Type.INTEGER },
    nodes: { type: Type.ARRAY, items: NODE_SCHEMA },
    edges: { type: Type.ARRAY, items: EDGE_SCHEMA },
    audit: AUDIT_SCHEMA,
    artifacts: ARTIFACTS_SCHEMA,
  },
  required: [
    'name',
    'domainTag',
    'recommendedPeakRps',
    'recommendedReadRatioPercent',
    'recommendedPayloadSizeKb',
    'nodes',
    'edges',
    'audit',
    'artifacts',
  ],
};

const AUTO_HEAL_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    nodes: { type: Type.ARRAY, items: NODE_SCHEMA },
    edges: { type: Type.ARRAY, items: EDGE_SCHEMA },
    audit: AUDIT_SCHEMA,
    artifacts: ARTIFACTS_SCHEMA,
    diffFromPrevious: {
      type: Type.OBJECT,
      properties: {
        addedNodes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              label: { type: Type.STRING },
              technology: { type: Type.STRING },
              reason: { type: Type.STRING },
            },
            required: ['id', 'label', 'technology', 'reason'],
          },
        },
        upgradedProtocols: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              edgeLabel: { type: Type.STRING },
              from: { type: Type.STRING },
              to: { type: Type.STRING },
              rationale: { type: Type.STRING },
            },
            required: ['edgeLabel', 'from', 'to', 'rationale'],
          },
        },
        remediatedRisks: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        securityScoreDelta: { type: Type.INTEGER },
        resilienceScoreDelta: { type: Type.INTEGER },
        costEfficiencyScoreDelta: { type: Type.INTEGER },
        baseMonthlyCostDeltaUsd: { type: Type.INTEGER },
        summary: { type: Type.STRING },
      },
      required: [
        'addedNodes',
        'upgradedProtocols',
        'remediatedRisks',
        'securityScoreDelta',
        'resilienceScoreDelta',
        'costEfficiencyScoreDelta',
        'baseMonthlyCostDeltaUsd',
        'summary',
      ],
    },
  },
  required: ['nodes', 'edges', 'audit', 'artifacts', 'diffFromPrevious'],
};

function summarizeUpstreamVerifyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (
    raw.includes('API_KEY_INVALID') ||
    raw.includes('PERMISSION_DENIED') ||
    raw.includes('ACCOUNT_STATE_INVALID') ||
    raw.includes('401') ||
    raw.includes('403')
  ) {
    return 'API key was rejected (invalid, unauthorized, or inactive billing/account state). Built-in Deterministic Engine remains active.';
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return 'API key reached rate-limit / quota exhaustion (429). Built-in Deterministic Engine will automatically cover requests.';
  }
  return `Key verification failed (${raw.slice(0, 140)}). Built-in Deterministic Engine remains active.`;
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (req: Request, res: Response) => {
    const resolved = resolveActiveApiKey(req);
    res.json({
      ok: true,
      engine: 'gemini-structured-compiler',
      fallbackEngine: 'deterministic-domain-synthesizer',
      defaultModel: DEFAULT_MODEL,
      configured: resolved.source !== 'none',
    });
  });

  app.post('/api/verify-key', async (req: Request, res: Response) => {
    const startMs = Date.now();
    const { apiKey, source } = resolveActiveApiKey(req);
    const bodyModel = (req.body as { model?: string } | undefined)?.model;
    const candidateModels = resolveCandidateModels(req, bodyModel);

    if (!apiKey) {
      res.json({
        valid: false,
        configured: false,
        model: candidateModels[0],
        keySource: 'none',
        latencyMs: 0,
        message:
          'No Gemini API key configured. Built-in Deterministic Engine is active; enter a custom Gemini API key above for live LLM synthesis.',
      });
      return;
    }

    const ai = new GoogleGenAI({ apiKey });
    let lastErr: unknown = null;

    for (const model of candidateModels) {
      try {
        const thinkingConfig = buildThinkingConfig(model, 'LOW');
        const response = await ai.models.generateContent({
          model,
          contents: 'Reply with OK',
          config: {
            ...(thinkingConfig ? { thinkingConfig } : {}),
          },
        });

        if (typeof response.text === 'string') {
          const latencyMs = Date.now() - startMs;
          res.json({
            valid: true,
            configured: true,
            model,
            keySource: source,
            latencyMs,
            message: `Verified live connection to ${model} (${
              source === 'custom' ? 'Custom BYOK' : 'Server Environment Key'
            }) in ${latencyMs}ms.`,
          });
          return;
        }
      } catch (err) {
        lastErr = err;
        if (isModelUnavailableError(err)) {
          continue;
        }
        break;
      }
    }

    res.json({
      valid: false,
      configured: true,
      model: candidateModels[0],
      keySource: source,
      latencyMs: Date.now() - startMs,
      message: summarizeUpstreamVerifyError(lastErr),
    });
  });

  app.post('/api/compile', async (req: Request, res: Response) => {
    const {
      prompt,
      compliancePreset = 'SOC2_ISO27001',
      cloudProfile = 'aws',
      thinkingLevel = 'LOW',
      model: bodyModel,
    } = (req.body ?? {}) as {
      prompt?: string;
      compliancePreset?: string;
      cloudProfile?: string;
      thinkingLevel?: string;
      model?: string;
    };

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 10) {
      res.status(400).json({
        error:
          'Please provide a descriptive system architecture requirement (at least 10 characters).',
      });
      return;
    }

    const cleanPrompt = prompt.trim().slice(0, 4000);
    const { apiKey } = resolveActiveApiKey(req);

    if (apiKey) {
      try {
        const candidateModels = resolveCandidateModels(req, bodyModel);
        const systemInstruction = `You are ArchForge AI, a Principal Staff Distributed Systems Architect, Red-Team Security Auditor, and Cloud FinOps Economist.
Compile the user's requirement into a realistic, high-signal v1 system architecture graph (7 to 9 nodes spanning edge, gateway, compute, messaging, and storage tiers), directional edges with exact protocols, an adversarial 3-persona engineering audit (including realistic v1 trade-offs, SPOFs, security or FinOps findings referencing exact node IDs), and complete production artifacts (PostgreSQL 17 DDL, docker-compose.yml, OpenAPI 3.1.0 YAML, and Executive Technical RFC Markdown).
Target Compliance Preset: ${compliancePreset}. Preferred Cloud Pricing Profile: ${String(cloudProfile).toUpperCase()}.
CRITICAL INVARIANT: Every edge.source, edge.target, and finding.targetNodeId MUST exactly match an id in the returned nodes array.`;

        const { parsed, usedModel } = await generateStructuredWithModelFallback({
          apiKey,
          candidateModels,
          contents: cleanPrompt,
          systemInstruction,
          responseSchema: COMPILE_BLUEPRINT_SCHEMA,
          thinkingLevel,
        });

        res.json({
          ...parsed,
          synthesisEngine: 'gemini-live',
          synthesisModel: usedModel,
        });
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[ArchForge] Live Gemini compile unavailable (${msg.slice(0, 120)}); engaging deterministic domain synthesizer.`
        );
      }
    }

    const fallbackOutput = synthesizeDeterministicBlueprint({
      prompt: cleanPrompt,
      compliancePreset,
      cloudProfile,
    });
    res.json(fallbackOutput);
  });

  app.post('/api/auto-heal', async (req: Request, res: Response) => {
    const {
      prompt,
      blueprintName,
      currentVersion,
      compliancePreset = 'SOC2_ISO27001',
      cloudProfile = 'aws',
      thinkingLevel = 'LOW',
      model: bodyModel,
    } = (req.body ?? {}) as {
      prompt?: string;
      blueprintName?: string;
      currentVersion?: Pick<
        ArchitectureVersion,
        'versionId' | 'nodes' | 'edges' | 'audit'
      >;
      compliancePreset?: string;
      cloudProfile?: string;
      thinkingLevel?: string;
      model?: string;
    };

    if (
      !currentVersion ||
      typeof currentVersion !== 'object' ||
      !Array.isArray(currentVersion.nodes)
    ) {
      res.status(400).json({
        error:
          'Missing current architecture version payload for Auto-Heal synthesis.',
      });
      return;
    }

    const { apiKey } = resolveActiveApiKey(req);

    if (apiKey) {
      try {
        const candidateModels = resolveCandidateModels(req, bodyModel);
        const systemInstruction = `You are ArchForge AI's Self-Healing Architecture Compiler.
Given an existing architecture graph and its adversarial multi-agent audit findings (Security, SRE, FinOps), synthesize an upgraded, remediated architecture revision that eliminates CRITICAL/WARNING SPOFs, hardens zero-trust encryption/isolation, right-sizes cloud FinOps costs, increases capacity ceilings, updates all 4 production artifacts accordingly, and produces a precise ArchitectureDiff summary.
Target Compliance: ${compliancePreset}. Cloud Profile: ${String(cloudProfile).toUpperCase()}.
CRITICAL INVARIANT: Every edge.source, edge.target, and finding.targetNodeId in the healed architecture MUST match an id in the returned nodes array.`;

        const contents = JSON.stringify({
          originalRequirement:
            typeof prompt === 'string' ? prompt.slice(0, 4000) : '',
          currentArchitecture: currentVersion,
        });

        const { parsed, usedModel } = await generateStructuredWithModelFallback({
          apiKey,
          candidateModels,
          contents,
          systemInstruction,
          responseSchema: AUTO_HEAL_SCHEMA,
          thinkingLevel,
        });

        res.json({
          ...parsed,
          synthesisEngine: 'gemini-live',
          synthesisModel: usedModel,
        });
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[ArchForge] Live Gemini auto-heal unavailable (${msg.slice(0, 120)}); engaging deterministic self-healer.`
        );
      }
    }

    const fallbackHealed = synthesizeDeterministicAutoHeal({
      prompt: typeof prompt === 'string' ? prompt : '',
      blueprintName,
      currentVersion,
      compliancePreset,
      cloudProfile,
    });
    res.json(fallbackHealed);
  });

  // Ensure unknown /api/* routes always return clean JSON 404 rather than HTML
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  const isProd = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(__dirname, 'dist');

  if (!isProd || !fs.existsSync(distPath)) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`ArchForge AI server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ArchForge AI server:', err);
  process.exit(1);
});
