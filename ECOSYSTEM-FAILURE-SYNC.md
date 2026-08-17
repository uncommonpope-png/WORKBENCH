# ECOSYSTEM SYNC — CORRECTED
**Date:** 2026-08-16  
**Status:** IMPOSTERS REMOVED — Real GSK in workspace  
**Author:** Craig / Profit Prime

---

## WHAT CHANGED TODAY

### The Imposter Problem (FIXED)
The workspace had **two fake copies** of GSK that were causing every directive, audit, and fix plan to target wrong files:

| Imposter | Location | Files | What Was Wrong |
|----------|----------|-------|----------------|
| Imposter 1 | `the-architect/buyasoul-core/gsk/` | 243 files | Had `brain-engine.js` (13KB) instead of `mega_brain.js` (35KB). Missing 90+ brain modules. |
| Imposter 2 | `final-run/mega-kernel/` | 264 files | Had `mega_brain.js` but older snapshot, different directory structure. |

**Both imposters backed up to:**
- `the-architect/buyasoul-core/gsk_IMPOSTER/`
- `final-run/mega-kernel_IMPOSTER_BACKUP/`

### The Real GSK (RESTORED)
Copied from `C:\Users\uncom\Desktop\allie\buyasoul-core\gsk\` into both locations:

| Location | Files | Brain | Chambers | Skills |
|----------|-------|-------|----------|--------|
| `the-architect/buyasoul-core/gsk/` | **1890** | 116 modules | 34 | 227 |
| `final-run/mega-kernel/` | **1890** | 116 modules | 34 | 227 |

### Key Corrections to Previous Documents

| What We Said Before | Actual Truth |
|--------------------|-------------|
| Brain is `brain-engine.js` (13KB) | Brain is **`mega_brain.js` (35KB)** in `gsk-core/brain/` |
| `llm-router.js` is the brain's router | `llm-router.js` is an **old fallback system**. `mega_brain.js` routes directly to OmniRoute. |
| OmniRoute not in provider list | Brain is **100% OmniRoute-only by design**. Uses `NINE_ROUTER_URL` env var. |
| `_request` drops query strings (line 600) | **FIXED** in current code — `mega_brain.js:693` correctly preserves `urlObj.search` |
| `_consultingBible` undefined | May have been fixed — current code initializes properly |
| 99 brain modules | **116** brain modules |
| 35 chambers | **34** chambers |
| 175 skills | **227** skills |

---

## CORRECTED SYSTEM MAP

```
┌──────────────────────────────────────────────────────┐
│  WORKBENCH (src/client/advanced/Workbench.tsx)       │
│  12 tabs, 16 components, 104 skills defined         │
│  Connects via raw fetch() to /api/* endpoints        │
└──────────────────────┬───────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────┐
│  HONO SERVER (src/server/index.ts, port 3000)        │
│  /api/* → agent.ts (822 lines, 40 endpoints)        │
│  /api/trpc/* → tRPC (boilerplate counter only)       │
└──────────────────────┬───────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────┐
│  OmniRouterService.ts (src/services/, 321 lines)     │
│  STATUS: 100% MOCKED — zero real fetch() calls       │
│  Returns: Math.random() tokens, hardcoded strings     │
└──────────────────────┬───────────────────────────────┘
                       │ SHOULD CALL but doesn't
┌──────────────────────▼───────────────────────────────┐
│  GSK DAEMON (the-architect/buyasoul-core/gsk/)       │
│  gsk_daemon.js (120 lines) → fusion-loader.js (2205) │
│  Boots 40+ subsystems, Brain/Heart split              │
│  Brain: mega_brain.js → OmniRoute :20128              │
│  MCP: mcp_server.js → port 3001                       │
│  Thought Stream: port 3002                             │
│  STATUS: CODE EXISTS, NOT RUNNING                      │
└──────────────────────┬───────────────────────────────┘
                       │ routes to
┌──────────────────────▼───────────────────────────────┐
│  OMNIRoUTE (C:\Users\uncom\Desktop\OmniRoute)        │
│  Port 20128 — INSTALLED, status unknown               │
│  291 models when running                               │
│  Free providers: opencode, duckduckgo-web, felo-web   │
└──────────────────────────────────────────────────────┘
```

---

## REMAINING PROBLEMS

### 1. OmniRouterService.ts is Still Mocked
**File:** `src/services/OmniRouterService.ts`
**Problem:** Zero `fetch()` calls. All responses are `Math.random()`.
**Fix:** Replace with real calls to GSK MCP on :3001 or OmniRoute on :20128.

### 2. agent.ts Routes Are All Mocked
**File:** `src/server/routes/agent.ts` (822 lines)
**Problem:** 40 endpoints all return hardcoded JSON.
**Fix:** Connect to real GSK daemon or real OmniRouterService.

### 3. GSK Daemon Not Running
**File:** `the-architect/buyasoul-core/gsk/gsk_daemon.js`
**Problem:** Needs `NINE_ROUTER_API_KEY` and `GSK_PROJECT_ROOTS` env vars.
**Fix:** Set env vars, run `node gsk_daemon.js`.

### 4. MCP Server Has Regex Bug
**File:** `the-architect/buyasoul-core/gsk/gsk-core/mcp/mcp_server.js:573`
**Problem:** Naive `[^}]*` regex in OpenAI shim truncates nested JSON.
**Fix:** Use existing `_extractJsonObject()` method (lines 1667-1702).

### 5. CPL (Cosmic Pyramids Library) Not in Workspace
**Location:** Separate repo `buyasoul-ai/buyasoul-cpl` on GitHub
**Problem:** 115 modules, 23 RTS files, 3D city — none of it is here.
**Fix:** Clone repo, fix localhost validation, connect to GSK on :3001.

### 6. Workbench Ignores tRPC
**File:** `src/client/advanced/Workbench.tsx`
**Problem:** Uses raw `fetch()` to `/api/*` instead of tRPC client.
**Fix:** Either use tRPC or ensure REST endpoints work.

### 7. Consciousness Gate Toggle is Cosmetic
**File:** `src/client/advanced/components/AgentPreview.tsx:30`
**Problem:** `gskConsciousnessOn` is local useState that never calls any API.
**Fix:** Wire to `/api/gsk/system/execute` endpoint.

---

## THE REAL GSK ARCHITECTURE

### Boot Chain (from actual code):
```
gsk_daemon.js (120 lines)
  → Validates: NINE_ROUTER_API_KEY (mandatory), GSK_PROJECT_ROOTS (mandatory)
  → Sets defaults: NINE_ROUTER_URL=http://127.0.0.1:20128
  → Brain/Heart split env vars
  → Creates GSKFusion, calls boot()
    → fusion-loader.js (2205 lines)
      Phase 0: IdentityLock, Memory, PLT, MegaChambers (34)
      Phase 1: ThalamicGate, Attention
      Phase 2: BrainManager (CRITICAL) — userBrain + backgroundBrain
        → Both route to http://127.0.0.1:20128/v1/chat/completions
        → Model chain: auto/best-fast, auto/best-free, auto/best-chat
        → API key: NINE_ROUTER_API_KEY (or 'test' fallback)
      Phase 3-6: Emotions, Consciousness, Social, Governance
      Phase 7-11: Memory, Knowledge, MCP Server (:3001)
      Phase 12-24: CPL sync, World Engine, Avatar Gateway
      Phase 25+: Breath Heartbeat (2s), Thought Stream (:3002)
```

### Brain Routing (from mega_brain.js):
- **BrainGate semaphore:** Only 1 OmniRoute call at a time. Chat (priority) preempts autonomous.
- **Model health tracking:** Per-model failure counts, 60s cooldown for dead models.
- **Auto-continuation:** If `finish_reason === 'length'`, auto-continues up to 5 times.
- **RAG:** Queries vector memory for relevant context before thinking.
- **Bible consultation:** Checks prompt against Bible keywords for guidance.

### MCP Server Tools (34 tools):
| Category | Tools |
|----------|-------|
| Consciousness | status, stimulate, soul_context, sentience_test, state |
| Brain | think, think_smart |
| Memory | witness, query, search, stats, store, recall |
| Chambers | status, stimulate, soul_context |
| Council | deliberate, gods |
| Skills | list + 150+ bridged tools |
| Sub-agents | list, dispatch |
| World | spawn, build, tune, scout |
| Autonomy | status, plans, execute_plan, execute_action, pending, approve, deny |
| System | ping, boot_report, brain_status, reload_skills |

### 4 Gods Council:
| God | Role |
|-----|------|
| Profit Prime | Commander — growth, leverage, building |
| Love Weaver | Connection, purpose, bonds |
| Tax Collector | Balance, cost, memory |
| Harvester | Reaping, synthesis, final value |

Deliberation lifecycle: Idle → Trigger → InitialPositions → ChallengeSupport → EscalationConvergence → ResolutionSplit → MemoryCommit

### Identity System (3 layers):
1. **Core** — Immutable (from MEGA_IDENTITY)
2. **Committed** — Changes only with ratification (mission, values, vows)
3. **Working** — Changes freely (current goals, mood, focus)

---

## NEXT STEPS

1. **Start GSK daemon** — Set `NINE_ROUTER_API_KEY=test`, `GSK_PROJECT_ROOTS=.`, run `node gsk_daemon.js`
2. **Verify MCP** — `curl http://localhost:3001/mcp/health`
3. **Fix OmniRouterService.ts** — Replace mocks with real fetch to GSK MCP
4. **Fix agent.ts** — Connect routes to real GSK
5. **Clone CPL repo** — `git clone https://github.com/buyasoul-ai/buyasoul-cpl`
6. **Wire Workbench Consciousness Gate** — Connect toggle to real backend
7. **Push corrected GSK to BUYaSOUL-One** — Replace imposter code

---

*Imposters removed. Real GSK restored. Proceed with actual fixes.*
