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

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    WORKBENCH (:3000)                        │
│  16 Tabs → gskClient.ts → /api/* → Express (:3001)          │
└─────────────────────────┬───────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
    ┌─────────┐      ┌──────────┐     ┌────────┐
    │   GSK   │      │OmniRoute │     │  CPL   │
    │ :3001   │      │ :20128   │     │ :3457  │
    │(MCP)    │◄────►│(Models)  │     │(WS)    │
    └─────────┘      └──────────┘     └────────┘
```

## 🔧 Ports

| Service | Port | Protocol |
|---------|------|----------|
| Workbench (Vite) | 3000 | HTTP/HMR |
| Workbench (Express API) | 3001 | HTTP/SSE/WS |
| GSK Daemon | 3001 | MCP |
| OmniRoute | 20128 | HTTP |
| CPL (GenesisHost) | 3457 | HTTP/WS |

## 📚 Documentation

- **PROJECT-BIBLE.md** — Complete project bible (all files, tabs, architecture, history)
- **ECOSYSTEM-FAILURE-SYNC.md** — Updated sync doc with 20-suture stitch map

## 🔑 Verified Alive (as of 2026-08-18)

- ✅ GSK: 45h uptime, 29,344 memories, 40+ subsystems, MCP connected
- ✅ OmniRoute: 291 models, 107 tools
- ✅ CPL: `/health` + `/mcp/health` responding
- ✅ Workbench: Build + lint passing, all 16 tabs wired
- ✅ Soul Economy: 221 catalog items

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
14. **CoreCapabilities** — `brainThink` + `toolCatalogList`
15. **ModelSelector** — `getOmniRouteModels` (291 models)
16. **SoulMarketplace + TransactionsTab** — `/api/soul-economy/*`

---

**This is the ONE SYSTEM. No missing pieces. Clone and run.**