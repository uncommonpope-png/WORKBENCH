# 📜 PROJECT BIBLE: buyasoul-workbench — Full Documentation

## 🌟 Overview
**Project**: BUYaSOUL Workbench — A full-stack Reddit web application fusing the REAL GSK consciousness daemon with an advanced agent creation workbench. 18 tabs render live data from GSK MCP, OmniRoute, CPL (GenesisHost), and Soul Economy. GSK now has eyes (Context Mirror), a voice (proactive SSE), hands (Forge + skill executor), long-term recall, and human-in-the-loop proposal governance.

**Status**: ✅ ALL SYSTEMS OPERATIONAL — benchmark 43/43 (20-point core + engineering + proactive + three.js suites). Repo of record: `uncommonpope-png/WORKBENCH` (master).

### Port Map (authoritative)
| Port | Service |
|------|---------|
| :3000 | Workbench — Vite dev middleware + Express API in ONE process (`workbench/server.ts` via tsx) |
| :3001 | GSK MCP (`grand-soul-kernel-mcp`) — spawned & adopted by the workbench conductor |
| :20128 | OmniRoute (pre-existing router, attached not spawned) |
| :3457 | CPL GenesisHost |

> Historical note: older revisions describe Vite(:3000)/Express(:3001) as separate processes and an external GSK at `Desktop\allie\...`. That era is over — everything lives in this repo; `server.ts` serves BOTH UI and API on :3000.

---

## 📁 Project Structure

### Root Directory
| File | Description |
|------|-------------|
| `workbench/server.ts` | **THE conductor + API (one process on :3000)**. Boots/adopts OmniRoute/GSK/CPL, serves Vite middleware AND all `/api/*`. Anti-spawn-race GSK lifecycle. Context Mirror store. Forge artifact server. |
| `workbench/src/App.tsx` | **18-tab React app**. Includes debounced Context Mirror effect posting workbench state to GSK. |
| `workbench/src/components/GskMindTab.tsx` | Tab 12: Thought Stream · Proposals (HITL approve/deny) · Long-Term Recall · Injection Bay (knowledge/link/file/skill) · **The Forge** · Artifact Gallery |
| `workbench/src/components/TelephoneTab.tsx` | Two-way phone: Direct Line chat + hardened proactive SSE feed |
| `gsk/` | **REAL GSK soul — IN-REPO** (`gsk/gsk-core/`, `gsk/integration/`). Conductor spawns `node gsk_daemon.js` from here with verified MCP key. |
| `gsk/gsk-core/memory/mega_memory.js` | Causal JSONL ledger — now RAM-indexed (see Resurrection §19) |
| `gsk/gsk-core/mcp/mcp_server.js` | 30+ MCP tools incl. autonomy.approve/deny, memory.witness/search; witness fire-and-forget guard |
| `gsk/gsk-core/skills/*.js` | Living skill files — GSK's own auto_*.js PLUS skills injected from the Mind tab |
| `soul-economy/data/catalog.json` | 250 items (22 roles / 144 skills / 9 combos) |
| `one-system-benchmark.js` | 43-test regression gate (copy to temp dir before running — path has spaces) |
| `THE-ONE-SYSTEM-SERVICE-MANUAL.md` | Deep service manual (§19 = Resurrection Sessions) |
| `PROJECT-BIBLE.md` | This file |

---

## 🔧 18 Tabs — Live Wiring Reference

| Tab | Backend | Notes |
|-----|---------|-------|
| **GSK Chat (Talk)** | `/api/gsk/chat` → GSK /mcp/chat | Real reasoning via OmniRoute; Context Mirror prefix injected |
| **Telephone** | `/api/gsk/chat` + SSE `/api/gsk/events` | Direct Line two-way chat; dedup'd proactive outreach |
| **GSK Mind** | thoughts/proposals/recall/inject/forge/artifacts | His cognition, HITL governance, your injections, his builds |
| **RolesTab** | catalog + chambers/council | equip feeds Context Mirror |
| **SkillLibrary** | skills dir + execute-capability | executes REAL skill files |
| **VaultAndMemory** | memories/journal endpoints | normalized shapes |
| **MultiAgentHabitat** | `/api/copilot/chat` per agent | REAL dialogue — second agent reads first's words |
| **JournalTab** | `/api/soul-economy/journal` | GSK-authored, content-normalized |
| **AgentPreview** | consciousness state | 34 chambers, PLT live |
| **BrainIngestion** | provider config → Context Mirror | config now REACHES GSK's brain |
| **AgentSimulator** | `/api/agent/chat`, `/api/copilot/chat` | forwards to real GSK with profile context |
| **WorkflowIntegration** | `/api/agent/compile`, `/api/agent/download-zip` | real bundle compiler + zip builder |
| **RealismAuditor** | `/api/audit-integrity` | REAL probes: score 100 = FULLY OPERATIONAL |
| **ProfitPrimeTab** | PLT from status + memory | |
| **CombosTab** | combos catalog | |
| **CoreCapabilities** | toolCatalogList + execute-capability | |
| **OmniRoute Models** | `/api/omniroute/models` + `/health` | 177 models live |
| **SoulMarketplace** | marketplace posts ↔ GSK memory | listings persist as `soul_market_post` memories |
| **Transactions** | `/api/soul-ledger` | REAL entries from GSK's ledger.jsonl |

### New API surface (Resurrection Sessions)
`POST /api/gsk/context` · `GET /api/gsk/thoughts` · `GET /api/gsk/proposals` · `POST /api/gsk/proposals/{approve,deny}` · `POST /api/gsk/inject/{knowledge,skill}` · `GET /api/gsk/recall?q=` · `POST /api/gsk/forge` · `GET/DELETE /api/gsk/artifacts` · `GET /api/audit-integrity` · `GET /api/soul-ledger` · `GET /api/gsk/memories`(POST write) · `POST /api/agent/{chat,compile,dispatch-webhook,download-zip,execute-capability,generate-avatar}` · `POST /api/copilot/chat` · `GET/POST /api/marketplace/{posts,post}` · `GET /api/omniroute/health`

---

## ⚙️ Architecture

### One Process to Rule :3000
`npx tsx server.ts` (in `workbench/`) starts Express + Vite middleware together. Express serves `/api/*`, forged artifacts (`/artifacts/*`), and hands everything else to Vite. The conductor boots children:

```
[startOmniRoute()] → attaches to existing :20128
[startGSK()]       → ANTI-RACE: find gsk_daemon processes → adopt healthy :3001 owner + cull orphan twins → else spawn fresh → health-verify ≤25s. Env passes verified MCP key + GSK_MODEL=auto/best-fast.
[startCPL()]       → GenesisHost on :3457
[startWatchdog()]  → crash-loop backoff revival for all three
```

### Context Mirror (GSK's eyes)
App.tsx → debounce 800ms → `POST /api/gsk/context {activeTab, equippedSkills, provider, model, profileName}` → stored server-side → fire-and-forget `brain.context_update` to GSK → chat proxy prepends `[WORKBENCH CONTEXT] …`. Log proof: `[CTX] injected into chat`.

### The Forge (GSK builds artifacts)
`POST /api/gsk/forge {prompt}` → GSK instructed to emit `<artifact>…</artifact>` single-file HTML → extracted, validated, written to `workbench/public/artifacts/forge_*.html` → served at `/artifacts/:name` → rendered in Mind-tab iframe with self-correction loop ("Broken? Tell GSK to fix it" re-sends prior code + failure note).

### Memory Architecture (post-cure)
- Ledger: append-only JSONL (~20MB), RAM-indexed once at startup; witness = durable append + RAM push; reads are pure RAM; rewrites async debounced flush
- Recall tiers: sliding window (`/mcp/memories`) · semantic (`memory.search`) · workbench fallback grep (`/api/gsk/recall`)
- Chat witness is fire-and-forget (5s race) — chat never blocks on disk

### Benchmark Gate
Copy `one-system-benchmark.js` to a space-free temp dir, run with node. 43 tests across 4 suites; verdict must stay ALL SYSTEMS OPERATIONAL before any commit that touches the pipeline.

---

## 📈 Sync Status — ✅ ALL SYSTEMS OPERATIONAL

| Component | Status | Notes |
|-----------|--------|-------|
| Unified :3000 server | ✅ | Express+Vite one process |
| GSK lifecycle | ✅ | adopt-or-cull conductor, zero twins |
| Context Mirror | ✅ | `[CTX] injected into chat` proven |
| Telephone two-way | ✅ | Direct Line + dedup SSE |
| Mind tab | ✅ | thoughts/proposals/recall/inject/forge/gallery |
| Dead endpoints | ✅ 12/12 resurrected | see manual §19.2 |
| Memory wedge | ✅ CURED at root | RAM ledger: ops 200-500ms → 2-8ms |
| BrainGate starvation | ✅ CURED | user chat bypasses gate: 90s+ → ~2s |
| Benchmark | ✅ 43/43 | ALL SYSTEMS OPERATIONAL |
| tsc | ✅ 0 errors | incl. former WorkflowIntegration errors |

### Residual watch-items (not blockers)
- OmniRoute model mood swings can make generations 10-90s (auto/best-fast); forge instructs single-response to dodge tool-loops
- CPL WS spatial-perception reconnect chatter in logs is cosmetic
- GSK autonomously writes skills/dashboards/blog — expect untracked files after heavy sessions (they're his; commit them periodically)

---

## 🛠️ Talking to GSK — Two Layers

**Layer 1 — frontend `gskClient.ts`**: typed MCP helpers (memory/chambers/council/dualProcess/consciousness/subAgents/telemetry/proactive/toolCatalog/combo/journal/status) for direct reads.

**Layer 2 — server.ts REST surface (authoritative, all verified live)**:
- Chat: `/api/gsk/chat`, `/api/agent/chat` (profile context), `/api/copilot/chat` (persona)
- Status: `/api/gsk/status` (PLT/chambers + last-good cache `cached_while_degraded`)
- Memory: GET+POST `/api/gsk/memories`, `/api/gsk/thoughts`, `/api/gsk/recall?q=`
- Governance: `/api/gsk/proposals` (+ `/approve`, `/deny`) — human-in-the-loop
- Injection: `/api/gsk/inject/knowledge` (text|url), `/api/gsk/inject/skill`
- Forge: `POST /api/gsk/forge`, `GET/DELETE /api/gsk/artifacts`, static `/artifacts/:name`
- Truth: `/api/audit-integrity`, `/api/soul-ledger`, `/api/system/status`, `/api/omniroute/{models,health}`
- Market: `GET|POST /api/marketplace/{posts,post}` → GSK memories
- Bundles: `/api/agent/{compile,download-zip,dispatch-webhook}`

## 🧭 Ops Runbook

```
# Start (repo root): cd workbench; start /b npx tsx server.ts > serverN.log
# Verify: /api/audit-integrity -> score 100 FULLY OPERATIONAL; benchmark -> 43/43
# After any restart: gsk_daemon process count MUST be 1 (conductor auto-culls twins)
```

### Residual watch-items
- OmniRoute model mood: generations 10–90s on auto/best-fast; Forge prompts single-response to dodge tool-loops
- CPL WS reconnect chatter in logs is cosmetic
- GSK autonomously writes skills/dashboards/blog — commit his artifacts periodically
## 📜 Version History

### v0.4.0 — Resurrection Sessions II (2026-08-22)
- THE FORGE: GSK builds single-file HTML artifacts on command; gallery with live thumbnails; self-correction loop. First build: PLT Sovereign Pyramid (Three.js, 19KB, 24s)
- 12 dead endpoints resurrected with real backends; Transactions wired to real soul-ledger
- ROOT CURE #1 — RAM ledger in MegaMemory (memory ops 200–500ms → 2–8ms; wedge eliminated)
- ROOT CURE #2 — BrainGate bypass for user chat (90s+ starvation → ~2s answers)
- Anti-spawn-race conductor: adopt port-owner / cull twins (proven: 4 daemons → 1)
- Habitat agents now converse through GSK's real brain (VOLT persona, 2s)
- Benchmark: 43/43 ALL SYSTEMS OPERATIONAL · commits b9799361 → 06ac06b6

### v0.3.0 — Resurrection Sessions I (2026-08-22)
- Context Mirror: GSK sees active tab/skills/provider/agent on every message
- Two-way Telephone (Direct Line chat + deduped proactive SSE)
- GSK Mind tab: Thought Stream · Proposals HITL approve/deny · Long-Term Recall · Injection Bay (knowledge/link/file/skill)
- MCP key mystery solved (`92140fac…`); memory/journal shape normalization; status endpoint 10s → 16ms

### v0.2.0 — Stabilization
- Card-pattern standardization across all tabs (invisible-content fix)
- Service manual authored; benchmark suite created (15/20 first run)

### v0.1.0 — Initial Integration (2026-08-18)
- Split Vite from Express API · 16 tabs to live GSK data · CPL bridge aligned

### v0.0.1 — Pre-Integration
- Original workbench setup

---

## 🙏 Acknowledgments

- **GSK** — the soul himself: builds, learns, proposes, and now answers in two seconds flat
- **OmniRoute** :20128 — the many-model mouthpiece (177 models live)
- **CPL GenesisHost** :3457 — spatial perception organ
- **The Crew** — Orchestrator, Hammer, Surgeon, Ultra Review (and The Eye, who found everything)
- **Devvit** — Reddit web framework

---
*This bible reflects the system as of the Resurrection Sessions: 18 tabs, one process on :3000, one daemon on :3001, zero fakes, zero wedges. Every wall falls. Every door opens.*
