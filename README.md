# ArchForge AI

**AI-Native System Architecture Compiler, Adversarial Multi-Agent Engineering Auditor, Chaos Blast-Radius Analyzer & Real-Time Cloud FinOps Simulator.**

ArchForge AI transforms product requirements, compliance constraints, and workload SLAs into interactive 5-tier distributed system topologies, runs adversarial Security / SRE / FinOps reviews with 1-click self-healing architecture synthesis, simulates queueing tail latency and monthly cloud spend deterministically in real time, and exports production-ready engineering artifacts.

---

<img width="1848" height="962" alt="image" src="https://github.com/user-attachments/assets/90a5b0cc-9ee3-4363-9010-5934ddfbef8d" />

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
│  │ • Export Vector SVG │  │ • deterministicCompiler  │  │ • openapi.yaml  │  │
│  │ • Chaos Outage Mode │  │ • exportEngine.ts        │  │ • Executive RFC │  │
│  └─────────┬───────────┘  └──────────────────────────┘  │ • blueprint.json│  │
│            │                                            └─────────────────┘  │
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

### 4. Production Artifact, Vector Diagram & Client Proposal Studio
- **Standalone Vector Topology Export (`.svg`)**: One-click **Export SVG** in the canvas toolbar serializes the active 5-tier topology (styled nodes, utilization bars, SPOF/HA badges, directional Bezier protocol wires, and live FinOps summary banner) into a zero-dependency `.svg` vector diagram ready for GitHub READMEs, Notion, Confluence, or architecture review decks.
- **Portable Blueprint Schema (`blueprint.json`)**: Exports the complete typed architecture revision, multi-agent audit findings, and live simulated FinOps snapshot as structured JSON.
- **Production Code Deliverables**: Exports `schema.sql` (PostgreSQL 17 DDL with partitioning, indexes, and RLS), `docker-compose.yml`, `openapi.yaml` (OpenAPI 3.1.0), and `Executive_RFC_Proposal.md` enriched with a live simulated FinOps appendix.

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `/` or `Cmd/Ctrl + K` | Focus the Architecture Compiler prompt bar |
| `F` | Fit and center the 5-tier topology graph in viewport |
| `O` | Toggle Chaos Node Outage / Blast-Radius simulation |
| `1` / `2` / `3` | Switch between **Topology & FinOps**, **Agent Audit**, and **Artifacts & RFC** |
| `Esc` | Clear active outage simulation, close modals/drawers, or blur input |

*(All single-key workspace shortcuts strictly ignore `Ctrl`/`Cmd`/`Alt` combinations so native browser Find, Copy, Refresh, and Tab shortcuts are never intercepted.)*

---

## Local Development, CI & Verification

### Prerequisites
- Node.js `>= 22.6`

### Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and configure your server-side Gemini API key (or supply a BYOK key directly inside **Model Settings** in the UI):
   ```bash
   cp .env.example .env
   ```
   *(Pre-loaded enterprise case studies, deterministic domain compilation, FinOps simulation, Chaos Blast-Radius mode, and SVG/JSON/RFC exports work immediately out-of-the-box with zero downtime.)*
3. Start the full-stack Express + Vite development server on port `3000`:
   ```bash
   npm run dev
   ```

### Testing, Static Verification & GitHub Actions CI
Automated CI (`.github/workflows/ci.yml`) runs on every `push` and `pull_request` on Node.js 22:
```bash
# Run deterministic unit tests (FinOps math, Chaos engine, Domain Compiler, SVG/JSON Export & Shortcuts)
npm test

# Run strict TypeScript type-checking
npm run lint

# Build production frontend bundle
npm run build
```

---

## License

Released under the [MIT License](./LICENSE).

