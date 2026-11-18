# ArchForge AI

**AI-Native System Architecture Compiler, Adversarial Multi-Agent Engineering Auditor, Chaos Blast-Radius Analyzer & Real-Time Cloud FinOps Simulator.**

ArchForge AI transforms product requirements, compliance constraints, and workload SLAs into interactive 5-tier distributed system topologies, runs adversarial Security / SRE / FinOps reviews with 1-click self-healing architecture synthesis, simulates queueing tail latency and monthly cloud spend deterministically in real time, and exports production-ready engineering artifacts.

---

<img width="1919" height="1019" alt="image" src="https://github.com/user-attachments/assets/81a8b696-dcc3-45a3-9e73-2136caef615c" />

---

## System Architecture Overview

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                         ArchForge AI Client Workspace                        │
│                                                                              │
│  ┌─────────────────────┐  ┌──────────────────────────┐  ┌─────────────────┐  │
│  │ 5-Tier SVG + HTML   │  │ Deterministic Engines    │  │ Artifact Studio │  │
│  │ Topology Canvas     │◄─┤ • finopsSimulator.ts     │  │ • schema.sql    │  │
│  │ • Pan / Zoom / Fit  │  │ • chaosEngine.ts         │  │ • compose.yml   │  │
│  │ • Port De-collision │  │ • deterministicCompiler  │  │ • openapi.yaml  │  │
│  │ • Chaos Outage Mode │  │ • layoutEngine.ts        │  │ • Executive RFC │  │
│  └─────────┬───────────┘  └──────────────────────────┘  └─────────────────┘  │
└────────────┼─────────────────────────────────────────────────────────────────┘
             │ POST /api/compile · /api/auto-heal · /api/verify-key (120s)
             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    Express + Vite Full-Stack Server (server.ts)              │
│  • Portable @google/genai SDK (BYOK x-gemini-api-key -> env GEMINI_API_KEY)  │
│  • Automatic model fallback (gemini-2.5-flash / pro -> gemini-2.0-flash)     │
│  • Zero-downtime fail-open fallback to Deterministic Domain Synthesizer      │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Engineering Modules

### 1. Interactive 5-Tier Topology Canvas & Chaos Fault Injection
- Deterministic left-to-right failure domain layout across **Edge & Client**, **Gateway & Auth**, **Compute & Services**, **Async & Messaging**, and **Cache, Storage & AI**.
- Distributed outbound/inbound port offsets and inter-column protocol pill placement prevent Bezier wire and label collisions across multi-tier jumps.
- **Chaos Fault Injection (`chaosEngine.ts`)**: Simulates unplanned single-node or primary failure on any component, tracing synchronous upstream caller `503` cascades and downstream starvation versus resilient multi-AZ Raft/auto-scale quorum survival.

### 2. Deterministic Queueing Latency & Cloud FinOps Engine (`finopsSimulator.ts`)
- **Traffic Routing & Cache Offload**: Models read/write ratio amplification (`95/5` to `20/80`) across stateless tiers, event buses, and stateful storage, applying read offload when an in-memory cache layer (`Redis` / `Dragonfly`) is present.
- **Non-Linear Queueing Tail Latency**: Uses a piecewise utilization ($\rho = \lambda / \mu$) tail-latency curve inspired by Kingman's approximation:
  - Nominal ($\rho \le 0.70$): Linear warm scaling $1 + 0.28\rho$.
  - Knee ($0.70 < \rho \le 0.95$): Quadratic queueing inflection $1.196 + 1.95\left(\frac{\rho - 0.70}{0.25}\right)^2$.
  - Saturation ($\rho > 0.95$): Steep overload penalty + crimson visual saturation state on overloaded bottlenecks.
- **Synchronous Critical-Path Traversal**: Computes end-to-end client P99 latency across synchronous (`!isAsync`) DAG hops + WAN RTT + multi-region consensus write quorum penalties, excluding asynchronous `Kafka` / outbox branches from synchronous response time.
- **Cloud Unit Economics**: Computes monthly spend across **Compute**, **Database & Storage IOPS**, **Network Egress** (using a 0.42 diurnal average-to-peak load factor over $2.592 \times 10^6$ sec/month), and **Managed AI & Messaging**.

### 3. Adversarial Multi-Agent Review Council & Self-Healing Loop
- Evaluates architectures quantitatively (`0–100`) across three personas:
  1. **Principal Red-Team Security Auditor** (mTLS, IAM, enclaves, tenant RLS isolation).
  2. **Staff Distributed Systems SRE** (SPOFs, quorum durability, circuit breakers, tail latency).
  3. **Cloud FinOps Economist** (GPU/CPU right-sizing, quantization, cross-AZ egress waste).
- **1-Click Auto-Heal**: Sends the active graph and audit findings to `/api/auto-heal` to synthesize a remediated revision along with a structured **Before/After Architecture Diff Summary**.

### 4. Production Artifact & Client Proposal Studio
- Exports `schema.sql` (PostgreSQL 17 DDL with partitioning, indexes, and RLS), `docker-compose.yml`, `openapi.yaml` (OpenAPI 3.1.0), and `Executive_RFC_Proposal.md` enriched with a live simulated FinOps appendix.

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `/` or `Cmd/Ctrl + K` | Focus the Architecture Compiler prompt bar |
| `F` | Fit and center the 5-tier topology graph in viewport |
| `O` | Toggle Chaos Node Outage / Blast-Radius simulation |
| `1` / `2` / `3` | Switch between **Topology & FinOps**, **Agent Audit**, and **Artifacts & RFC** |
| `Esc` | Clear active outage simulation, close modals/drawers, or blur input |

---

## Local Development & Verification

### Prerequisites
- Node.js `>= 22.6`

### Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and configure your server-side Gemini API key:
   ```bash
   cp .env.example .env
   ```
   *(Pre-loaded enterprise case studies, deterministic FinOps simulation, Chaos Blast-Radius mode, and artifact exports work immediately out-of-the-box prior to live API calls.)*
3. Start the full-stack Express + Vite development server on port `3000`:
   ```bash
   npm run dev
   ```

### Testing & Static Verification
```bash
# Run deterministic unit tests (FinOps math, Chaos engine, Layout & Sanitizer)
npm test

# Run strict TypeScript type-checking
npm run lint

# Build production frontend bundle
npm run build
```
