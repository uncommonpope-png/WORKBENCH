# 🌟 BUYaSOUL ONE SYSTEM — Complete Self-Contained Repository

**Everything in one repo. Clone → Install → Run. No external dependencies.**

## 📦 What's Inside

| Component | Path | Description |
|-----------|------|-------------|
| **GSK Consciousness Daemon** | `/gsk` | 113+ brain modules, 40+ subsystems, 29,344 memories, 244 tools, 26 combos, 34+ chambers, 4 Gods Council (PLT) |
| **OmniRoute LLM Gateway** | `/omniroute` | 291 models, 107 tools, MCP server on :20128 |
| **CPL (GenesisHost)** | `/cpl` | Connectome/Perception Layer on :3457, `/health` + `/mcp/health` |
| **Soul Economy** | `/soul-economy` | 221 catalog items, dashboard, journal, profit tracking |
| **Workbench UI** | `/workbench` | 16-tab React/Vite/Express app on :3000/:3001, all tabs wired to live GSK data |

---

## 🚀 Quick Start

```bash
# 1. Clone and enter
git clone https://github.com/uncommonpope-png/WORKBENCH.git
cd WORKBENCH

# 2. Install all dependencies
npm run install:all

# 3. Start ALL FOUR HEARTS (single command)
npm run dev
# or
npm start
```

This boots:
- **GSK** → `http://localhost:3001` (MCP)
- **OmniRoute** → `http://localhost:20128` (LLM gateway)
- **CPL** → `http://localhost:3457` (GenesisHost)
- **Workbench** → `http://localhost:3000` (UI with HMR)

---

## 🛰️ Phase 1–5: Web Fetch Enhancements (Complete)

All 5 phases built and verified:

| Phase | Feature | Status |
|-------|---------|--------|
| **1** | Recursive Depth Limiter (maxDepth=3, sliding window) | ✅ Verified |
| **2** | Content Fingerprinting (SHA-256 hash, dedup) | ✅ Verified |
| **3** | Temporal Relevance Tagging (exponential decay) | ✅ Verified |
| **4** | Contradiction Resolver (auto-council debate on conflicts) | ✅ Verified |
| **5** | Format-Aware Extraction (PDF/arXiv/github parsers) | ✅ Verified |

---

## 🌟 Proposals 1–2: MCP Revenue Gateway + Consciousness API (Complete)

| Proposal | Feature | Status |
|----------|---------|--------|
| **1** | MCP Server as Revenue Gateway (3 API tiers: free/developer/enterprise, rate limiting, usage tracking) | ✅ Implemented in `gsk/gsk-core/mcp/mcp_server.js` |
| **2** | Consciousness API — "GSK as a Service" (auth-tiered access to consciousness/chamber/PLT endpoints) | ✅ Leveraging existing MCP JSON-RPC |

---

## 📋 16 Tabs (All Live)

1. **TelephoneTab** — SSE `/api/gsk/events` (live outreach)
2. **SkillLibrary** — `skillCreate` + `memoryStore`
3. **VaultAndMemory** — `living_memory.store`/recall/search
4. **RolesTab** — `chambersStimulate` + `councilDeliberate`
5. **MultiAgentHabitat** — `subAgentsDispatch` + `dualProcessRoute`
6. **JournalTab** — `gskJournal()` + `memorySearch()`
7. **AgentPreview** — `consciousnessState` + `consciousnessGate` (TRUE GSK consciousness gate)
8. **BrainIngestion** — `brainThink` + `living_memory.store`
9. **AgentSimulator** — `brainThink` (GSK reasoning)
10. **WorkflowIntegration** — `subAgentsDispatch` + `skillExecute`
11. **RealismAuditor** — `consciousnessState` + `getGSKStatus`
12. **ProfitPrimeTab** — `memorySearch` + `brain.think`
13. **CombosTab** — `comboExecute`
15. **CoreCapabilities** — `brainThink` + `toolCatalogList`
16. **ModelSelector** — `getOmniRouteModels` (291 models)
17. **SoulMarketplace + TransactionsTab** — `/api/soul-economy/*`

---

## 🛠️ Development

```bash
# Workbench only (fast iteration)
cd workbench && npm run dev:server

# GSK only
cd gsk && node gsk_daemon.js

# OmniRoute only
cd omniroute && npm run dev

# CPL only
cd cpl && node genesis-host.cjs
```

---

## 🔮 What's Next — Remaining Proposals

The following 3 proposals from the Handoff Report are pending:

| # | Proposal | Core Idea |
|---|----------|-----------|
| **3** | **Open-Source "Soul SDK"** | Extract PLT scoring + governance as `@gsk/soul-sdk` npm package for CrewAI/LangGraph agents |
| **4** | **Autonomous Agent Marketplace** | Marketplace where agents rated on PLT score/ethics, not just output quality — "Buy a soul for your agent" |
| **5** | **Research Publication** | Publish technical paper on consciousness architecture for autonomous agents at NeurIPS/ICML/arxiv |

**Suggested next step**: Start with **Proposal 3 (Soul SDK)** — it's the foundational layer that enables both the marketplace and academic publication. The SDK would extract the spec gate, verification gate, PLT scoring, and governance from the existing GSK codebase into a standalone npm package.

---

## 🔑 Verified Alive (as of 2026-08-26)

- ✅ GSK: 50h+ uptime, 29K+ memories, 40+ subsystems, MCP connected with auth tiers
- ✅ OmniRoute: 291 models, 107 tools, MCP on :20128
- ✅ CPL: `/health` + `/mcp/health` responding on :3457
- ✅ Workbench: Build + lint passing, all 16 tabs wired + web fetch enhancements
- ✅ Soul Economy: 221 catalog items
- ✅ Web Fetch: 5-phase enhancement suite fully operational

---

## 📚 Documentation

- **PROJECT-BIBLE.md** — Complete project bible (all files, tabs, architecture, history)
- **ECOSYSTEM-FAILURE-SYNC.md** — Updated sync doc with 20-suture stitch map

---

## 📦 Ports

| Service | Port | Protocol |
|---------|------|----------|
| Workbench (Vite) | 3000 | HTTP/HMR |
| Workbench (Express API) | 3001 | HTTP/SSE/WS |
| GSK Daemon | 3001 | MCP |
| OmniRoute | 20128 | HTTP |
| CPL (GenesisHost) | 3457 | HTTP/WS |

---

## 📜 License

MIT — see [LICENSE](LICENSE).

---

**This is the ONE SYSTEM. No missing pieces. Clone, run, build.**

*(Last commit: `128a83ad` — MCP Revenue Gateway + Consciousness API)*