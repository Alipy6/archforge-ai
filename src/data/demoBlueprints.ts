import type { ArchitectureBlueprint } from '../types/architecture';

export const DEMO_BLUEPRINTS: ArchitectureBlueprint[] = [
  {
    id: 'demo-fintech-payment-gateway',
    name: 'Global High-Frequency FinTech Payment Gateway',
    domainTag: 'PCI-DSS Level 1 · Clearing & Settlement',
    prompt:
      'Design a global PCI-DSS Level 1 high-frequency payment gateway supporting multi-currency authorization, real-time ML fraud scoring, idempotent double-entry ledger clearing, and webhook event delivery at 15,000+ peak RPS.',
    isDemo: true,
    updatedAt: '2026-11-17T09:00:00Z',
    activeVersionId: 'v1',
    defaultSimulation: {
      peakRps: 6500,
      readRatioPercent: 60,
      payloadSizeKb: 12,
      multiRegion: false,
      cloudProfile: 'aws',
    },
    versions: [
      {
        versionId: 'v1',
        versionLabel: 'v1 · Initial Baseline',
        createdAt: '2026-11-17T08:45:00Z',
        nodes: [
          {
            id: 'edge-waf',
            label: 'Edge Anycast WAF & TLS',
            tier: 'edge',
            technology: 'Cloudflare Enterprise WAF + TLS 1.3',
            justification:
              'Terminates global merchant TLS 1.3 connections at nearest PoP with DDoS scrubbing and bot mitigation before VPC ingress.',
            scalingModel: 'Global Edge Anycast',
            spofRisk: 'NONE',
            baseLatencyMs: 3.2,
            baseMonthlyCostUsd: 650,
            maxCapacityRps: 95000,
            costCategory: 'network',
            isStateful: false,
            replicas: 12,
            failureDomain: 'Global Anycast Edge Network',
          },
          {
            id: 'api-gateway',
            label: 'Merchant API Gateway',
            tier: 'gateway',
            technology: 'Envoy Proxy + OAuth2 / HMAC Verifier',
            justification:
              'Enforces per-merchant token bucket rate limits, request schema validation, and HMAC-SHA256 signature verification.',
            scalingModel: 'Horizontal Auto-Scale',
            spofRisk: 'LOW',
            baseLatencyMs: 4.8,
            baseMonthlyCostUsd: 920,
            maxCapacityRps: 38000,
            costCategory: 'network',
            isStateful: false,
            replicas: 6,
            failureDomain: 'Multi-AZ Ingress Mesh',
          },
          {
            id: 'payment-orchestrator',
            label: 'Payment Orchestrator',
            tier: 'compute',
            technology: 'Go 1.24 Microservice (EKS Spot + On-Demand)',
            justification:
              'Coordinates authorization state machines, card network ISO-8583 routing, and two-phase ledger reservation.',
            scalingModel: 'Horizontal Auto-Scale',
            spofRisk: 'LOW',
            baseLatencyMs: 9.5,
            baseMonthlyCostUsd: 1680,
            maxCapacityRps: 24000,
            costCategory: 'compute',
            isStateful: false,
            replicas: 8,
            failureDomain: 'us-east-1 Compute Cluster',
          },
          {
            id: 'fraud-engine',
            label: 'Inline Fraud ML Scorer',
            tier: 'compute',
            technology: 'ONNX Runtime GPU Pods (Triton)',
            justification:
              'Evaluates 140+ velocity and device fingerprint features synchronously during card authorization.',
            scalingModel: 'Vertical Primary-Replica',
            spofRisk: 'MODERATE',
            baseLatencyMs: 18.4,
            baseMonthlyCostUsd: 2850,
            maxCapacityRps: 11500,
            costCategory: 'ai_queue',
            isStateful: false,
            replicas: 2,
            failureDomain: 'Single-AZ GPU Node Group',
          },
          {
            id: 'kafka-settlement',
            label: 'Settlement & Webhook Bus',
            tier: 'messaging',
            technology: 'Apache Kafka (3-Broker MSK)',
            justification:
              'Decouples downstream clearing batches, merchant webhook retries, and audit log archival from critical auth path.',
            scalingModel: 'Partitioned Cluster',
            spofRisk: 'LOW',
            baseLatencyMs: 5.5,
            baseMonthlyCostUsd: 1340,
            maxCapacityRps: 42000,
            costCategory: 'ai_queue',
            isStateful: true,
            replicas: 3,
            failureDomain: '3-AZ Broker Quorum',
          },
          {
            id: 'redis-idempotency',
            label: 'Idempotency & Velocity Store',
            tier: 'storage',
            technology: 'Redis 7.4 Primary-Replica',
            justification:
              'Stores 24h merchant idempotency keys and sliding-window card velocity counters with sub-millisecond lookups.',
            scalingModel: 'Vertical Primary-Replica',
            spofRisk: 'MODERATE',
            baseLatencyMs: 1.6,
            baseMonthlyCostUsd: 780,
            maxCapacityRps: 36000,
            costCategory: 'storage',
            isStateful: true,
            replicas: 2,
            failureDomain: 'Primary + Async Standby',
          },
          {
            id: 'ledger-postgres',
            label: 'Primary Double-Entry Ledger',
            tier: 'storage',
            technology: 'PostgreSQL 17 (Single Primary r7g.4xlarge)',
            justification:
              'ACID serializable double-entry journal recording authorization holds, captures, and multi-currency balances.',
            scalingModel: 'Vertical Primary-Replica',
            spofRisk: 'CRITICAL',
            baseLatencyMs: 14.2,
            baseMonthlyCostUsd: 2420,
            maxCapacityRps: 8200,
            costCategory: 'storage',
            isStateful: true,
            replicas: 1,
            failureDomain: 'Single Writer Instance (us-east-1a)',
          },
        ],
        edges: [
          {
            id: 'e1',
            source: 'edge-waf',
            target: 'api-gateway',
            protocol: 'HTTPS',
            label: 'TLS 1.3 Ingress',
            isAsync: false,
            encrypted: true,
          },
          {
            id: 'e2',
            source: 'api-gateway',
            target: 'payment-orchestrator',
            protocol: 'HTTPS',
            label: 'Plain Internal HTTP/2',
            isAsync: false,
            encrypted: false,
          },
          {
            id: 'e3',
            source: 'payment-orchestrator',
            target: 'fraud-engine',
            protocol: 'gRPC',
            label: 'Sync Score RPC',
            isAsync: false,
            encrypted: true,
          },
          {
            id: 'e4',
            source: 'payment-orchestrator',
            target: 'redis-idempotency',
            protocol: 'Redis RESP',
            label: 'Idempotency Lock',
            isAsync: false,
            encrypted: true,
          },
          {
            id: 'e5',
            source: 'payment-orchestrator',
            target: 'ledger-postgres',
            protocol: 'SQL',
            label: 'ACID Journal Tx',
            isAsync: false,
            encrypted: true,
          },
          {
            id: 'e6',
            source: 'payment-orchestrator',
            target: 'kafka-settlement',
            protocol: 'Kafka',
            label: 'Outbox Events',
            isAsync: true,
            encrypted: true,
          },
        ],
        audit: {
          securityScore: 68,
          resilienceScore: 58,
          costEfficiencyScore: 76,
          executiveSummary:
            'Baseline topology achieves low nominal latency under 7k RPS, but contains a critical single-writer PostgreSQL ledger SPOF, lacks zero-trust mTLS + PCI PAN tokenization vaulting inside the VPC, and over-allocates dedicated GPU instances for tabular fraud scoring.',
          findings: [
            {
              id: 'f-sec-1',
              persona: 'security',
              severity: 'CRITICAL',
              title: 'Unencrypted East-West Hop & Missing HSM PAN Vault',
              analysis:
                'Traffic from Merchant API Gateway to Payment Orchestrator traverses internal HTTP/2 without mTLS, and raw Primary Account Numbers (PAN) reach application memory without isolated PCI-DSS enclave tokenization.',
              recommendation:
                'Enforce SPIFFE/SPIRE mTLS over gRPC across all east-west hops and introduce an isolated HSM Tokenization Vault at the gateway boundary.',
              targetNodeId: 'api-gateway',
              estimatedImpact: 'Eliminates lateral VPC credential/PAN exposure; shrinks PCI-DSS scope by 70%',
            },
            {
              id: 'f-sre-1',
              persona: 'sre',
              severity: 'CRITICAL',
              title: 'Single-Writer PostgreSQL Ledger Saturates at ~8.2k RPS',
              analysis:
                'Primary Double-Entry Ledger runs on a single r7g.4xlarge writer without horizontal Raft partitioning or PgBouncer connection multiplexing. Write lock contention causes catastrophic P99 tail spikes past 8,500 RPS.',
              recommendation:
                'Upgrade to a horizontally sharded Raft-consensus distributed SQL cluster (CockroachDB / Spanner) with connection pooling and multi-AZ synchronous quorum.',
              targetNodeId: 'ledger-postgres',
              estimatedImpact: 'Removes single-node writer SPOF; raises ledger ceiling from 8.2k to 48k+ RPS',
            },
            {
              id: 'f-sre-2',
              persona: 'sre',
              severity: 'WARNING',
              title: 'Synchronous Fraud ML Scorer Lacks Circuit Breaker & Multi-AZ Spread',
              analysis:
                'Fraud ML Scorer is deployed in a single-AZ GPU node group on the synchronous authorization critical path without fallback rule evaluation if GPU pods stall.',
              recommendation:
                'Spread inference across 3 AZs with CPU SIMD quantized ONNX workers + deterministic velocity circuit-breaker fallback at 25ms timeout.',
              targetNodeId: 'fraud-engine',
              estimatedImpact: 'Cuts P99 tail risk by 42% and survives full AZ outage',
            },
            {
              id: 'f-fin-1',
              persona: 'finops',
              severity: 'OPTIMIZATION',
              title: 'Oversized GPU Instances for Tabular GBDT/ONNX Fraud Features',
              analysis:
                'Dedicated Triton GPU nodes cost $2,850/mo base at <28% SM occupancy because small-batch tabular authorization payloads are CPU-bound on PCIe transfer.',
              recommendation:
                'Migrate Fraud Scorer to Graviton4 AVX/NEON quantized CPU auto-scale pool and apply 1-year Compute Savings Plan.',
              targetNodeId: 'fraud-engine',
              estimatedImpact: 'Saves ~$1,390/mo (-48% inference compute cost) while doubling throughput',
            },
          ],
        },
        artifacts: {
          schemaSql: `-- ArchForge AI · Production Ledger DDL (PostgreSQL 17)
-- Blueprint: Global High-Frequency FinTech Payment Gateway (v1)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE merchant_accounts (
    merchant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name VARCHAR(180) NOT NULL,
    iso_country CHAR(2) NOT NULL,
    settlement_currency CHAR(3) NOT NULL DEFAULT 'USD',
    risk_tier SMALLINT NOT NULL DEFAULT 1 CHECK (risk_tier BETWEEN 1 AND 5),
    webhook_secret_hash TEXT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payment_intents (
    intent_id UUID NOT NULL DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchant_accounts(merchant_id),
    idempotency_key VARCHAR(128) NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL,
    pan_token VARCHAR(96) NOT NULL,
    fraud_score NUMERIC(5,4) NOT NULL DEFAULT 0.0000,
    state VARCHAR(24) NOT NULL CHECK (state IN ('PENDING', 'AUTHORIZED', 'CAPTURED', 'DECLINED', 'REVERSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (intent_id, created_at)
) PARTITION BY RANGE (created_at);

CREATE UNIQUE INDEX idx_payment_intents_idempotency
    ON payment_intents (merchant_id, idempotency_key, created_at);

CREATE INDEX idx_payment_intents_merchant_state
    ON payment_intents (merchant_id, state, created_at DESC);

CREATE TABLE ledger_entries (
    entry_id UUID NOT NULL DEFAULT gen_random_uuid(),
    intent_id UUID NOT NULL,
    account_code VARCHAR(48) NOT NULL,
    direction CHAR(6) NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL,
    posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (entry_id, posted_at)
) PARTITION BY RANGE (posted_at);

CREATE INDEX idx_ledger_entries_intent
    ON ledger_entries (intent_id, posted_at);
`,
          dockerComposeYml: `name: archforge-fintech-gateway

services:
  envoy-gateway:
    image: envoyproxy/envoy:v1.31-latest
    ports:
      - "8443:8443"
    environment:
      - ENVOY_LOG_LEVEL=info
    depends_on:
      - payment-orchestrator

  payment-orchestrator:
    image: ghcr.io/archforge/payment-orchestrator:1.4.0
    environment:
      - DATABASE_URL=postgres://ledger_app:secret@ledger-postgres:5432/payments?sslmode=require
      - REDIS_ADDR=redis-idempotency:6379
      - FRAUD_GRPC_TARGET=fraud-engine:50051
      - KAFKA_BROKERS=kafka-settlement:9092
    deploy:
      replicas: 3
    depends_on:
      - ledger-postgres
      - redis-idempotency
      - fraud-engine

  fraud-engine:
    image: nvcr.io/nvidia/tritonserver:24.08-py3
    ports:
      - "50051:8001"

  redis-idempotency:
    image: redis:7.4-alpine
    command: ["redis-server", "--appendonly", "yes", "--maxmemory", "2gb", "--maxmemory-policy", "volatile-lru"]
    ports:
      - "6379:6379"

  ledger-postgres:
    image: postgres:17-alpine
    environment:
      - POSTGRES_USER=ledger_app
      - POSTGRES_PASSWORD=secret
      - POSTGRES_DB=payments
    command: ["postgres", "-c", "max_connections=500", "-c", "synchronous_commit=on"]
    ports:
      - "5432:5432"

  kafka-settlement:
    image: apache/kafka:3.8.0
    ports:
      - "9092:9092"
`,
          openapiYaml: `openapi: 3.1.0
info:
  title: Global High-Frequency Payment Gateway API
  version: 1.0.0
  description: PCI-DSS Level 1 Payment Authorization, Capture & Settlement Webhook Specification.
servers:
  - url: https://api.pay-clearing.internal/v1
paths:
  /payments/authorize:
    post:
      summary: Authorize an idempotent payment intent
      operationId: authorizePayment
      parameters:
        - name: Idempotency-Key
          in: header
          required: true
          schema:
            type: string
            minLength: 16
            maxLength: 128
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [merchantId, amountMinor, currency, paymentToken]
              properties:
                merchantId:
                  type: string
                  format: uuid
                amountMinor:
                  type: integer
                  minimum: 1
                currency:
                  type: string
                  pattern: "^[A-Z]{3}$"
                paymentToken:
                  type: string
      responses:
        "201":
          description: Payment authorized and double-entry hold recorded
          content:
            application/json:
              schema:
                type: object
                required: [intentId, state, fraudScore, latencyMs]
                properties:
                  intentId:
                    type: string
                    format: uuid
                  state:
                    type: string
                    enum: [AUTHORIZED, DECLINED]
                  fraudScore:
                    type: number
                  latencyMs:
                    type: number
  /payments/{intentId}/capture:
    post:
      summary: Capture an existing authorized hold
      operationId: capturePayment
      parameters:
        - name: intentId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        "200":
          description: Capture queued to settlement ledger
`,
          executiveRfcMd: `# Technical Architecture RFC: Global FinTech Payment Gateway (v1)

## 1. Executive Summary
This RFC specifies a low-latency payment authorization and double-entry settlement platform engineered for global merchants. At nominal traffic (**6,500 Peak RPS**), end-to-end synchronous authorization P99 completes under **78 ms** using Envoy edge-to-mesh ingress, Go orchestration workers, Redis idempotency locking, and ACID PostgreSQL ledger journaling.

## 2. Core Architectural Decisions
- **Synchronous Critical Path Isolation**: Card authorization executes strictly synchronous idempotency checks, ONNX fraud scoring, and ledger reservation; clearing files and merchant webhooks are decoupled via transactional outbox into **Apache Kafka**.
- **Idempotency Guarantee**: Every \`POST /payments/authorize\` enforces atomic \`SET NX EX 86400\` locks in Redis keyed by \`(merchant_id, idempotency_key)\` to prevent duplicate charges under network retries.

## 3. Identified Risks & Remediation Roadmap
1. **Primary Ledger SPOF (Critical)**: Single-writer PostgreSQL 17 saturates around **8,200 RPS** under write-heavy bursts. Phase 2 upgrades storage to horizontally partitioned Raft SQL.
2. **Zero-Trust PCI Boundary (Critical)**: Introduce SPIFFE mTLS across internal gRPC services and isolate PAN detokenization inside a dedicated HSM vault.
3. **Inference FinOps**: Replace under-utilized GPU pods with Graviton4 CPU quantized ONNX pools to reduce monthly inference spend by **48%**.
`,
        },
      },
      {
        versionId: 'v2',
        versionLabel: 'v2 · Auto-Healed',
        createdAt: '2026-11-17T09:00:00Z',
        diffFromPrevious: {
          addedNodes: [
            {
              id: 'hsm-token-vault',
              label: 'PCI HSM Tokenization Vault',
              technology: 'AWS Payment Cryptography + Nitro Enclaves',
              reason:
                'Isolates raw PAN detokenization at ingress boundary, shrinking PCI-DSS audit scope and eliminating plaintext card data from compute memory.',
            },
          ],
          upgradedProtocols: [
            {
              edgeLabel: 'Gateway -> Payment Orchestrator',
              from: 'HTTPS (Plain Internal HTTP/2)',
              to: 'gRPC (SPIFFE mTLS)',
              rationale:
                'Enforces mutual TLS cryptographic workload identity and binary Protobuf framing, cutting serialization latency by 1.9ms.',
            },
            {
              edgeLabel: 'Primary Double-Entry Ledger',
              from: 'PostgreSQL 17 Single Writer (8.2k RPS cap)',
              to: 'CockroachDB Raft Sharded Cluster (52k RPS cap)',
              rationale:
                'Eliminates single-node writer SPOF via multi-AZ synchronous Raft consensus and range sharding.',
            },
          ],
          remediatedRisks: [
            'Eliminated single-writer PostgreSQL ledger SPOF via distributed Raft SQL sharding',
            'Added Nitro Enclave + HSM PAN Tokenization Vault and enforced SPIFFE mTLS east-west',
            'Right-sized Fraud ML Scorer from single-AZ GPU to 3-AZ Graviton4 SIMD ONNX auto-scale pool with 25ms circuit breaker',
            'Upgraded Redis Idempotency Store to 6-shard Multi-AZ Cluster',
          ],
          securityScoreDelta: 26,
          resilienceScoreDelta: 35,
          costEfficiencyScoreDelta: 15,
          baseMonthlyCostDeltaUsd: -410,
          summary:
            'v2 Auto-Heal remediated both CRITICAL security and resilience bottlenecks while lowering baseline monthly infrastructure spend by $410/mo through GPU-to-Graviton4 inference right-sizing.',
        },
        nodes: [
          {
            id: 'edge-waf',
            label: 'Edge Anycast WAF & TLS',
            tier: 'edge',
            technology: 'Cloudflare Enterprise WAF + TLS 1.3',
            justification:
              'Terminates global merchant TLS 1.3 connections at nearest PoP with DDoS scrubbing and bot mitigation.',
            scalingModel: 'Global Edge Anycast',
            spofRisk: 'NONE',
            baseLatencyMs: 3.0,
            baseMonthlyCostUsd: 650,
            maxCapacityRps: 95000,
            costCategory: 'network',
            isStateful: false,
            replicas: 12,
            failureDomain: 'Global Anycast Edge Network',
          },
          {
            id: 'api-gateway',
            label: 'Zero-Trust Envoy Gateway',
            tier: 'gateway',
            technology: 'Envoy + SPIFFE/SPIRE mTLS + HMAC',
            justification:
              'Issues short-lived X.509 SVID workload identities, validates HMAC signatures, and strips PANs via HSM vault.',
            scalingModel: 'Horizontal Auto-Scale',
            spofRisk: 'NONE',
            baseLatencyMs: 4.1,
            baseMonthlyCostUsd: 980,
            maxCapacityRps: 55000,
            costCategory: 'network',
            isStateful: false,
            replicas: 8,
            failureDomain: '3-AZ Ingress Mesh',
          },
          {
            id: 'hsm-token-vault',
            label: 'PCI HSM Tokenization Vault',
            tier: 'gateway',
            technology: 'AWS Nitro Enclaves + CloudHSM',
            justification:
              'Cryptographically vaults card PANs into format-preserving tokens before requests enter core compute.',
            scalingModel: 'Horizontal Auto-Scale',
            spofRisk: 'LOW',
            baseLatencyMs: 2.9,
            baseMonthlyCostUsd: 890,
            maxCapacityRps: 50000,
            costCategory: 'compute',
            isStateful: false,
            replicas: 6,
            failureDomain: '3-AZ Attested Nitro Enclaves',
          },
          {
            id: 'payment-orchestrator',
            label: 'Payment Orchestrator',
            tier: 'compute',
            technology: 'Go 1.24 + Resilience Circuit Breakers',
            justification:
              'Stateless authorization state machine operating exclusively on vaulted tokens over mTLS gRPC.',
            scalingModel: 'Horizontal Auto-Scale',
            spofRisk: 'NONE',
            baseLatencyMs: 7.8,
            baseMonthlyCostUsd: 1620,
            maxCapacityRps: 54000,
            costCategory: 'compute',
            isStateful: false,
            replicas: 12,
            failureDomain: '3-AZ EKS Auto-Scale Pool',
          },
          {
            id: 'fraud-engine',
            label: 'Quantized Fraud ONNX Pool',
            tier: 'compute',
            technology: 'Graviton4 SIMD ONNX + 25ms Breaker',
            justification:
              'INT8 quantized GBDT + neural scoring across 3 AZs with deterministic fallback rules if tail exceeds 25ms.',
            scalingModel: 'Horizontal Auto-Scale',
            spofRisk: 'NONE',
            baseLatencyMs: 6.4,
            baseMonthlyCostUsd: 1460,
            maxCapacityRps: 48000,
            costCategory: 'ai_queue',
            isStateful: false,
            replicas: 10,
            failureDomain: '3-AZ Graviton4 Compute',
          },
          {
            id: 'kafka-settlement',
            label: 'Settlement & Webhook Bus',
            tier: 'messaging',
            technology: 'Apache Kafka (Tiered Storage + Rack-Aware)',
            justification:
              'Rack-aware partition placement eliminates cross-AZ follower fetch egress while buffering settlement outbox.',
            scalingModel: 'Partitioned Cluster',
            spofRisk: 'LOW',
            baseLatencyMs: 4.8,
            baseMonthlyCostUsd: 1180,
            maxCapacityRps: 65000,
            costCategory: 'ai_queue',
            isStateful: true,
            replicas: 6,
            failureDomain: '3-AZ Quorum + S3 Tiered Log',
          },
          {
            id: 'redis-idempotency',
            label: 'Clustered Idempotency Cache',
            tier: 'storage',
            technology: 'Dragonfly / Redis 7 Sharded Cluster',
            justification:
              '6-shard multi-AZ cluster with automatic slot failover for atomic idempotency locks and velocity counters.',
            scalingModel: 'Partitioned Cluster',
            spofRisk: 'LOW',
            baseLatencyMs: 1.1,
            baseMonthlyCostUsd: 860,
            maxCapacityRps: 75000,
            costCategory: 'storage',
            isStateful: true,
            replicas: 6,
            failureDomain: '3-AZ Sharded In-Memory Cluster',
          },
          {
            id: 'ledger-postgres',
            label: 'Distributed Raft SQL Ledger',
            tier: 'storage',
            technology: 'CockroachDB 24.2 (9-Node Raft Quorum)',
            justification:
              'Serializable ACID double-entry ledger partitioned by merchant hash with zero-RPO synchronous multi-AZ consensus.',
            scalingModel: 'Partitioned Cluster',
            spofRisk: 'NONE',
            baseLatencyMs: 8.6,
            baseMonthlyCostUsd: 2590,
            maxCapacityRps: 52000,
            costCategory: 'storage',
            isStateful: true,
            replicas: 9,
            failureDomain: '3-AZ Raft Consensus Ranges',
          },
        ],
        edges: [
          {
            id: 'e1',
            source: 'edge-waf',
            target: 'api-gateway',
            protocol: 'HTTPS',
            label: 'TLS 1.3 Ingress',
            isAsync: false,
            encrypted: true,
          },
          {
            id: 'e1b',
            source: 'api-gateway',
            target: 'hsm-token-vault',
            protocol: 'gRPC',
            label: 'mTLS PAN Vault',
            isAsync: false,
            encrypted: true,
          },
          {
            id: 'e2',
            source: 'hsm-token-vault',
            target: 'payment-orchestrator',
            protocol: 'gRPC',
            label: 'SPIFFE mTLS RPC',
            isAsync: false,
            encrypted: true,
          },
          {
            id: 'e3',
            source: 'payment-orchestrator',
            target: 'fraud-engine',
            protocol: 'gRPC',
            label: 'Bounded 25ms RPC',
            isAsync: false,
            encrypted: true,
          },
          {
            id: 'e4',
            source: 'payment-orchestrator',
            target: 'redis-idempotency',
            protocol: 'Redis RESP',
            label: 'Atomic Lock TLS',
            isAsync: false,
            encrypted: true,
          },
          {
            id: 'e5',
            source: 'payment-orchestrator',
            target: 'ledger-postgres',
            protocol: 'SQL',
            label: 'Raft Serializable Tx',
            isAsync: false,
            encrypted: true,
          },
          {
            id: 'e6',
            source: 'payment-orchestrator',
            target: 'kafka-settlement',
            protocol: 'Kafka',
            label: 'CDC Outbox Stream',
            isAsync: true,
            encrypted: true,
          },
        ],
        audit: {
          securityScore: 94,
          resilienceScore: 93,
          costEfficiencyScore: 91,
          executiveSummary:
            'Auto-healed v2 architecture enforces hardware-attested PAN tokenization, end-to-end SPIFFE mTLS over gRPC, multi-AZ Raft SQL sharding up to 52k RPS, and Graviton4 SIMD fraud scoring.',
          findings: [
            {
              id: 'f-v2-opt-1',
              persona: 'finops',
              severity: 'OPTIMIZATION',
              title: 'Archive Cold Ledger Partitions (>90 Days) to Parquet Object Tier',
              analysis:
                'Maintaining >90-day settled journal rows on NVMe Raft nodes adds ~14% storage overhead as historical volume compounds.',
              recommendation:
                'Enable automated TTL archival streaming settled partitions older than 90 days to immutable S3 Object Lock.',
              targetNodeId: 'ledger-postgres',
              estimatedImpact: 'Reduces long-term NVMe cluster growth by ~$380/mo per TB',
            },
          ],
        },
        artifacts: {
          schemaSql: `-- ArchForge AI · Production Distributed Raft SQL DDL (CockroachDB / PostgreSQL)
-- Blueprint: Global High-Frequency FinTech Payment Gateway (v2 Auto-Healed)

CREATE TABLE merchant_accounts (
    merchant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name STRING(180) NOT NULL,
    iso_country CHAR(2) NOT NULL,
    settlement_currency CHAR(3) NOT NULL DEFAULT 'USD',
    status STRING(24) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment_intents (
    merchant_id UUID NOT NULL,
    intent_id UUID NOT NULL DEFAULT gen_random_uuid(),
    idempotency_key STRING(128) NOT NULL,
    amount_minor INT8 NOT NULL CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL,
    vault_fpe_token STRING(64) NOT NULL,
    fraud_score DECIMAL(5,4) NOT NULL,
    state STRING(24) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id, intent_id),
    UNIQUE INDEX idx_idempotency_unique (merchant_id, idempotency_key)
) SPLIT AT VALUES (gen_random_uuid());

CREATE TABLE ledger_entries (
    merchant_id UUID NOT NULL,
    entry_id UUID NOT NULL DEFAULT gen_random_uuid(),
    intent_id UUID NOT NULL,
    account_code STRING(48) NOT NULL,
    direction CHAR(6) NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    amount_minor INT8 NOT NULL CHECK (amount_minor > 0),
    posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id, posted_at, entry_id),
    INDEX idx_ledger_intent (intent_id)
);
`,
          dockerComposeYml: `name: archforge-fintech-gateway-v2

services:
  envoy-spiffe-gateway:
    image: envoyproxy/envoy:v1.31-latest
    ports:
      - "8443:8443"
    depends_on:
      - hsm-token-vault

  hsm-token-vault:
    image: ghcr.io/archforge/nitro-pan-vault:2.1.0
    environment:
      - SPIFFE_ENDPOINT_SOCKET=unix:///run/spire/sockets/agent.sock

  payment-orchestrator:
    image: ghcr.io/archforge/payment-orchestrator:2.0.0
    environment:
      - LEDGER_DSN=postgresql://root@cockroach-ledger:26257/payments?sslmode=verify-full
      - REDIS_CLUSTER_NODES=dragonfly-cache:6379
      - FRAUD_GRPC_TARGET=fraud-onnx-cpu:50051
      - CIRCUIT_BREAKER_TIMEOUT_MS=25
    deploy:
      replicas: 4

  fraud-onnx-cpu:
    image: ghcr.io/archforge/onnx-fraud-graviton:2.0.0
    deploy:
      replicas: 3

  dragonfly-cache:
    image: docker.dragonflydb.io/dragonflydb/dragonfly:v1.22.0
    ports:
      - "6379:6379"

  cockroach-ledger:
    image: cockroachdb/cockroach:v24.2.3
    command: start-single-node --advertise-addr=cockroach-ledger
    ports:
      - "26257:26257"
      - "8080:8080"
`,
          openapiYaml: `openapi: 3.1.0
info:
  title: Global FinTech Payment Gateway API (v2 Zero-Trust)
  version: 2.0.0
  description: Hardware-tokenized, SPIFFE mTLS backed global payment authorization and Raft ledger API.
servers:
  - url: https://api.pay-clearing.global/v2
paths:
  /payments/authorize:
    post:
      summary: Authorize payment using HSM format-preserving token
      operationId: authorizePaymentV2
      parameters:
        - name: Idempotency-Key
          in: header
          required: true
          schema:
            type: string
        - name: X-Merchant-Signature
          in: header
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [merchantId, amountMinor, currency, hsmVaultToken]
              properties:
                merchantId:
                  type: string
                  format: uuid
                amountMinor:
                  type: integer
                currency:
                  type: string
                hsmVaultToken:
                  type: string
      responses:
        "201":
          description: Serializable Raft hold committed
`,
          executiveRfcMd: `# Technical Architecture RFC: Global FinTech Payment Gateway (v2 Auto-Healed)

## 1. Remediation Executive Summary
Version 2 resolves all critical findings raised by the Adversarial Engineering Audit Council while **reducing baseline monthly infrastructure spend by $410/mo**:
- **Security (+26 pts -> 94/100)**: Added **PCI HSM Tokenization Vault** on Nitro Enclaves and upgraded east-west HTTP/2 to **SPIFFE mTLS gRPC**.
- **Resilience (+35 pts -> 93/100)**: Replaced single-writer PostgreSQL with a **9-node Raft Distributed SQL Cluster** capable of **52,000+ RPS** with zero-RPO AZ failover.
- **Cost Efficiency (+15 pts -> 91/100)**: Migrated tabular fraud scoring from under-utilized GPUs to **Graviton4 INT8 SIMD ONNX** workers with a 25ms circuit breaker.
`,
        },
      },
    ],
  },
  {
    id: 'demo-enterprise-rag-platform',
    name: 'Multi-Tenant Enterprise RAG & Agentic Workflow Platform',
    domainTag: 'SOC2 Type II · Tenant-Isolated AI',
    prompt:
      'Design a SOC2 Type II multi-tenant enterprise RAG and durable agentic workflow platform supporting 5,000 enterprise workspaces, hybrid dense+BM25 retrieval, semantic caching, and sandboxed tool execution.',
    isDemo: true,
    updatedAt: '2026-11-17T08:30:00Z',
    activeVersionId: 'v1',
    defaultSimulation: {
      peakRps: 3200,
      readRatioPercent: 80,
      payloadSizeKb: 48,
      multiRegion: false,
      cloudProfile: 'gcp',
    },
    versions: [
      {
        versionId: 'v1',
        versionLabel: 'v1 · Initial Baseline',
        createdAt: '2026-11-17T08:30:00Z',
        nodes: [
          {
            id: 'rag-client-edge',
            label: 'Workspace SSE & SDK Edge',
            tier: 'edge',
            technology: 'Cloud CDN + HTTP/3 Streaming Edge',
            justification:
              'Streams low-TTFT Server-Sent Events (SSE) and WebSocket agent state deltas to enterprise web and Slack clients.',
            scalingModel: 'Global Edge Anycast',
            spofRisk: 'NONE',
            baseLatencyMs: 3.8,
            baseMonthlyCostUsd: 520,
            maxCapacityRps: 80000,
            costCategory: 'network',
            isStateful: false,
            replicas: 10,
            failureDomain: 'Global Edge PoPs',
          },
          {
            id: 'ai-gateway',
            label: 'AI Token Rate-Limit Gateway',
            tier: 'gateway',
            technology: 'Envoy AI Gateway + OIDC / OPA Policy',
            justification:
              'Authenticates SAML/OIDC JWTs, enforces per-tenant TPM/RPM token quotas, and scrubs PII prior to retrieval.',
            scalingModel: 'Horizontal Auto-Scale',
            spofRisk: 'LOW',
            baseLatencyMs: 6.2,
            baseMonthlyCostUsd: 880,
            maxCapacityRps: 32000,
            costCategory: 'network',
            isStateful: false,
            replicas: 6,
            failureDomain: 'Regional GKE Ingress',
          },
          {
            id: 'agent-orchestrator',
            label: 'Agentic Planner & Retriever',
            tier: 'compute',
            technology: 'Rust + Python Asyncio Hybrid Service',
            justification:
              'Executes query rewriting, reciprocal rank fusion (BM25 + dense vector), context assembly, and tool dispatch.',
            scalingModel: 'Horizontal Auto-Scale',
            spofRisk: 'LOW',
            baseLatencyMs: 22.0,
            baseMonthlyCostUsd: 2150,
            maxCapacityRps: 14000,
            costCategory: 'compute',
            isStateful: false,
            replicas: 10,
            failureDomain: 'Multi-Zone GKE Compute',
          },
          {
            id: 'ingestion-embedder',
            label: 'Document Chunker & Embedder',
            tier: 'compute',
            technology: 'Ray Data Workers + Embedding Pool',
            justification:
              'Parses PDFs/Slides, computes hierarchical semantic chunks, and generates 1536-d embeddings asynchronously.',
            scalingModel: 'Horizontal Auto-Scale',
            spofRisk: 'LOW',
            baseLatencyMs: 35.0,
            baseMonthlyCostUsd: 1940,
            maxCapacityRps: 9500,
            costCategory: 'ai_queue',
            isStateful: false,
            replicas: 6,
            failureDomain: 'Spot Worker Pool',
          },
          {
            id: 'temporal-queue',
            label: 'Durable Workflow & Ingestion Bus',
            tier: 'messaging',
            technology: 'Temporal Cluster + Kafka Connectors',
            justification:
              'Persists multi-step agent tool-execution state machines, retries, and SharePoint/Drive sync webhooks.',
            scalingModel: 'Partitioned Cluster',
            spofRisk: 'LOW',
            baseLatencyMs: 7.4,
            baseMonthlyCostUsd: 1490,
            maxCapacityRps: 26000,
            costCategory: 'ai_queue',
            isStateful: true,
            replicas: 5,
            failureDomain: 'Multi-Zone Workflow History',
          },
          {
            id: 'semantic-cache',
            label: 'Tenant Semantic Cache',
            tier: 'storage',
            technology: 'Redis Stack (Tenant-Prefixed Cache)',
            justification:
              'Caches recurring query embeddings, RBAC ACL bitmaps, and hot synthesized answers per tenant namespace.',
            scalingModel: 'Partitioned Cluster',
            spofRisk: 'LOW',
            baseLatencyMs: 2.1,
            baseMonthlyCostUsd: 940,
            maxCapacityRps: 45000,
            costCategory: 'storage',
            isStateful: true,
            replicas: 4,
            failureDomain: 'Multi-Zone Memorystore',
          },
          {
            id: 'pgvector-shared',
            label: 'Shared Multi-Tenant Vector DB',
            tier: 'storage',
            technology: 'PostgreSQL 17 + pgvector HNSW (Shared Table)',
            justification:
              'Stores metadata, ACL principals, and HNSW vector embeddings across all 5,000 enterprise tenants.',
            scalingModel: 'Vertical Primary-Replica',
            spofRisk: 'CRITICAL',
            baseLatencyMs: 26.5,
            baseMonthlyCostUsd: 3180,
            maxCapacityRps: 5800,
            costCategory: 'storage',
            isStateful: true,
            replicas: 2,
            failureDomain: 'Single Shared HNSW Index Memory',
          },
        ],
        edges: [
          {
            id: 're1',
            source: 'rag-client-edge',
            target: 'ai-gateway',
            protocol: 'WebSocket',
            label: 'WSS Token Stream',
            isAsync: false,
            encrypted: true,
          },
          {
            id: 're2',
            source: 'ai-gateway',
            target: 'agent-orchestrator',
            protocol: 'gRPC',
            label: 'Scoped Tenant RPC',
            isAsync: false,
            encrypted: true,
          },
          {
            id: 're3',
            source: 'agent-orchestrator',
            target: 'semantic-cache',
            protocol: 'Redis RESP',
            label: 'Semantic Lookup',
            isAsync: false,
            encrypted: true,
          },
          {
            id: 're4',
            source: 'agent-orchestrator',
            target: 'pgvector-shared',
            protocol: 'SQL',
            label: 'Hybrid ANN + ACL SQL',
            isAsync: false,
            encrypted: true,
          },
          {
            id: 're5',
            source: 'agent-orchestrator',
            target: 'temporal-queue',
            protocol: 'gRPC',
            label: 'Async Tool Workflow',
            isAsync: true,
            encrypted: true,
          },
          {
            id: 're6',
            source: 'temporal-queue',
            target: 'ingestion-embedder',
            protocol: 'Kafka',
            label: 'Connector Sync Batch',
            isAsync: true,
            encrypted: true,
          },
          {
            id: 're7',
            source: 'ingestion-embedder',
            target: 'pgvector-shared',
            protocol: 'SQL',
            label: 'Bulk Vector Upsert',
            isAsync: true,
            encrypted: true,
          },
        ],
        audit: {
          securityScore: 64,
          resilienceScore: 66,
          costEfficiencyScore: 72,
          executiveSummary:
            'Shared single-index pgvector storage creates cross-tenant noisy-neighbor HNSW memory exhaustion above 5.8k RPS and relies solely on application WHERE clauses without database Row-Level Security (RLS) or sandboxed tool isolation.',
          findings: [
            {
              id: 'rag-sec-1',
              persona: 'security',
              severity: 'CRITICAL',
              title: 'Cross-Tenant Vector Leakage Risk & Unsandboxed Agent Tool Calls',
              analysis:
                'All 5,000 tenants share one global HNSW index filtered only by application-layer SQL predicates, and indirect prompt injection in ingested documents can trigger privileged outbound tool calls from Agentic Planner.',
              recommendation:
                'Enforce PostgreSQL Row-Level Security (RLS) bound to cryptographic JWT tenant_id, partition vector namespaces per tenant tier, and isolate tool execution in ephemeral Firecracker microVMs.',
              targetNodeId: 'pgvector-shared',
              estimatedImpact: 'Guarantees cryptographic tenant isolation and blocks SSRF/exfiltration from prompt injection',
            },
            {
              id: 'rag-sre-1',
              persona: 'sre',
              severity: 'CRITICAL',
              title: 'Bulk Vector Upserts Contend with Live HNSW Search Latencies',
              analysis:
                'Ingestion Embedder writes bulk HNSW graph updates directly to the same PostgreSQL primary serving low-latency interactive queries, causing vacuum stalls and saturation at 5.8k RPS.',
              recommendation:
                'Separate hot query replicas from ingestion indexing or adopt a horizontally sharded native vector engine (Qdrant / Turbopuffer) with object-backed cold segments.',
              targetNodeId: 'pgvector-shared',
              estimatedImpact: 'Increases retrieval capacity 4.5x and stabilizes P99 retrieval under 14ms',
            },
            {
              id: 'rag-fin-1',
              persona: 'finops',
              severity: 'OPTIMIZATION',
              title: 'Uncompressed Float32 1536-d Vectors Inflate RAM Footprint 4x',
              analysis:
                'Storing uncompressed 6KB float32 vectors in high-memory Cloud SQL instances costs $3,180/mo base before autoscaling.',
              recommendation:
                'Apply Binary / Scalar INT8 vector quantization with Matryoshka 768-d truncation + async S3/GCS cold tiering.',
              targetNodeId: 'pgvector-shared',
              estimatedImpact: 'Cuts vector memory footprint by 75% (~$1,650/mo savings at scale)',
            },
          ],
        },
        artifacts: {
          schemaSql: `-- ArchForge AI · Multi-Tenant Enterprise RAG Schema (PostgreSQL 17 + pgvector)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TABLE tenants (
    tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    kms_key_arn TEXT NOT NULL,
    max_tpm_quota INTEGER NOT NULL DEFAULT 500000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE documents (
    document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    source_connector VARCHAR(32) NOT NULL,
    external_uri TEXT NOT NULL,
    acl_principals TEXT[] NOT NULL,
    checksum_sha256 CHAR(64) NOT NULL,
    indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE document_chunks (
    chunk_id UUID NOT NULL DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
    chunk_ordinal INTEGER NOT NULL,
    content_text TEXT NOT NULL,
    content_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content_text)) STORED,
    embedding halfvec(1536) NOT NULL,
    PRIMARY KEY (tenant_id, chunk_id)
) PARTITION BY HASH (tenant_id);

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON document_chunks
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE INDEX idx_chunks_tsv ON document_chunks USING GIN (content_tsv);
CREATE INDEX idx_chunks_embedding_hnsw ON document_chunks USING hnsw (embedding halfvec_cosine_ops);
`,
          dockerComposeYml: `name: archforge-enterprise-rag

services:
  envoy-ai-gateway:
    image: envoyproxy/envoy:v1.31-latest
    ports:
      - "8080:8080"

  agent-orchestrator:
    image: ghcr.io/archforge/rag-orchestrator:1.2.0
    environment:
      - DATABASE_URL=postgres://rag_engine:secret@pgvector-db:5432/rag
      - REDIS_URL=redis://semantic-cache:6379
      - TEMPORAL_HOST=temporal:7233
    depends_on:
      - pgvector-db
      - semantic-cache

  semantic-cache:
    image: redis/redis-stack-server:7.4.0-v0
    ports:
      - "6379:6379"

  pgvector-db:
    image: pgvector/pgvector:pg17
    environment:
      - POSTGRES_USER=rag_engine
      - POSTGRES_PASSWORD=secret
      - POSTGRES_DB=rag
    ports:
      - "5432:5432"

  temporal:
    image: temporalio/auto-setup:1.25.1
    ports:
      - "7233:7233"
`,
          openapiYaml: `openapi: 3.1.0
info:
  title: Enterprise Multi-Tenant RAG & Agentic Workflow API
  version: 1.0.0
servers:
  - url: https://rag.enterprise.internal/v1
paths:
  /query/stream:
    post:
      summary: Execute hybrid ACL-filtered retrieval and stream grounded synthesis
      operationId: streamGroundedQuery
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [tenantId, query, principalGroups]
              properties:
                tenantId:
                  type: string
                  format: uuid
                query:
                  type: string
                principalGroups:
                  type: array
                  items:
                    type: string
      responses:
        "200":
          description: SSE stream of grounded tokens and citation chunks
  /workflows/execute:
    post:
      summary: Trigger durable Temporal multi-step agent workflow
      operationId: startAgentWorkflow
      responses:
        "202":
          description: Workflow scheduled with deterministic runId
`,
          executiveRfcMd: `# Technical Architecture RFC: Multi-Tenant Enterprise RAG Platform

## 1. System Scope
Designed for **5,000+ SOC2 Type II enterprise workspaces**, combining dense \`halfvec(1536)\` HNSW retrieval, lexical BM25 GIN search, document-level ACL filtering, and durable **Temporal** agentic workflows.

## 2. Key Bottlenecks & Audit Action Items
- **Tenant Isolation**: Enforce PostgreSQL Row-Level Security (\`app.current_tenant_id\`) and isolate untrusted agent tool invocations inside microVM sandboxes.
- **Vector Index Scaling**: Decouple asynchronous document ingestion embeddings from interactive query replicas and quantize float32 embeddings to INT8/halfvec to cut memory costs by **75%**.
`,
        },
      },
    ],
  },
];
