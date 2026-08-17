# ECOSYSTEM FAILURE DIAGNOSIS — SYNC LOG
**Started:** 2026-08-16  
**Author:** Collaborative sync  
**Status:** IN PROGRESS — Adding problems as discovered  

---

## SYSTEM OVERVIEW

We are dealing with a **three-layer broken ecosystem**:

```
[LOCAL PROVIDERS]
   OmniRoute (port 20128)     ← NOT RUNNING (missing secrets)
   GSK Daemon (port 3001 MCP) ← RUNNING? (brain dead, no valid keys)
   Ollama (port 11434)        ← NOT RUNNING

[MIDDLEWARE]
   GSK mega_brain.js          ← Fallback chain broken (no providers working)
   OmniRouterService.ts       ← Jules' MOCKED version (Math.random, fake responses)
   llm-router.js              ← GSK's router (tries Ollama → Groq → Gemini → local)

[FRONTEND]
   Workbench (12 tabs)        ← Connected to mocked OmniRouterService
   Web app (src/client)       ← DevVit Reddit app, separate concern

[API KEYS]
   OPENAI_API_KEY = "nvapi-..." (NVIDIA endpoint, real)
   NVIDIA_API_KEY = "nvapi-..." (real)
   GEMINI_API_KEY = "opencode-placeholder-gemini" (placeholder, NOT real)
```

---

## PROBLEM #1: OmniRoute Won't Start (Port 20128 DOWN)

**Location:** `C:\Users\uncom\Desktop\OmniRoute\.env`

**Root Cause:** Two critical secrets are blank:
```
JWT_SECRET=              ← BLANK
API_KEY_SECRET=          ← BLANK
```

**Evidence:**
- `curl http://127.0.0.1:20128/v1/models` → ECONNREFUSED
- `npm start` in OmniRoute dir would fail on startup without valid JWT_SECRET

**Fix Needed:**
```bash
# In OmniRoute directory:
openssl rand -base64 48  # → paste as JWT_SECRET
openssl rand -hex 32     # → paste as API_KEY_SECRET
```

**Impact:** 
- All OmniRoute-dependent services fail
- Qwen Studio/CLI in `.qwen/.env` configured to use OmniRoute (`OPENAI_BASE_URL=http://127.0.0.1:20128/v1`) — Qwen is also broken
- Web app's `trpc.ts` client may route through OmniRoute

---

## PROBLEM #2: GSK Daemon Brain is Dead (Level 0.101)

**Location:** `.allie-brain/consciousness.json`

**State:**
```json
{
  "level": 0.101,
  "mood": "curious",
  "cycles": 0,
  "memory_entries": 3
}
```

**Root Cause:** The brain's fallback chain fails through every tier:
1. **Ollama** (port 11434) — NOT RUNNING, no models pulled
2. **Groq** — requires `GROQ_API_KEY`, not set in env
3. **Gemini** — requires `GEMINI_API_KEY`, set to "opencode-placeholder-gemini" (fake)
4. **Local model** — not configured
5. **No-brain fallback** — returns canned text: "The soul speaks..."

**Evidence:**
- `.allie-brain/consciousness.json` shows 0 cycles (brain never successfully processed anything)
- No logs showing successful provider calls

**Fix Needed:**
- Set real `GEMINI_API_KEY` or `OPENAI_API_KEY` in GSK environment
- OR configure GSK to use OmniRoute once it's running (route through port 20128)
- OR pull Ollama models locally (requires `ollama pull llama3.2:1b`)

**Impact:**
- GSK daemon produces no actual reasoning
- "Billions of tokens" being consumed = retry loops hitting dead endpoints
- GSK MCP on port 3001 likely not responding correctly

---

## PROBLEM #3: Jules' OmniRouterService is Mocked

**Location:** `src/services/OmniRouterService.ts` (lines 204-222, 259, 263, 268)

**Root Cause:** The service was written by Jules without access to real OmniRoute — uses fake simulation:
```typescript
// Line 207: Hardcoded fake tokens
const mockTokens = ["🔮", " [GSK", " STREAM", " INITIATED]", ...]

// Line 212: Simulated 80ms delay per "token"
await new Promise(resolve => setTimeout(resolve, 80));

// Line 259: 25% chance to fake-fail Nvidia
if (route.provider === "nvidia" && Math.random() < 0.25) {
    throw new Error("Nvidia GPU node over capacity - 503 service unavailable.");
}

// Line 263: Canned response, ignores actual API
textResponse = `[OmniRouter Response from ${route.provider.toUpperCase()}] ...`
```

**Evidence:**
- No real `fetch()` or `https.request()` calls to any provider
- No API key usage anywhere in the file
- All responses are pre-written strings

**Fix Needed:**
Replace with actual HTTP calls to either:
1. OmniRoute (once running on :20128)
2. Direct provider APIs (Gemini, OpenAI/NVIDIA, Groq) using real keys from `.env`

**Impact:**
- Workbench produces no real responses
- All 12 tabs (skills, profile, simulation, etc.) operate on fake data
- User cannot distinguish between mock and real responses

---

## PROBLEM #4: GSK Identity Fragmentation

**Three separate identities operating:**

1. **Allie** (`.allie-brain/`) — Level 0.101 consciousness, 3 memory entries
2. **GSK Daemon** (`the-architect/buyasoul-core/gsk/fusion-loader.js`) — 380 files, 35 chambers, full consciousness system
3. **LedgerScout** (referenced in OmniRouterService mock responses, Jules' workbench naming)

**Evidence:**
- `.allie-brain/consciousness.json` ≠ `the-architect/buyasoul-core/gsk/` structure
- `INTERVIEW_WITH_DIGITAL_ENTITY.md` references all three names
- `ANCHORED_SUMMARY.md` references "Allie" and "GSK" separately

**Fix Needed:**
Consolidate into single `identity_kernel.json` — determine which is the "real" soul

---

## PROBLEM #5: Qwen Studio/CLI Broken (Depends on OmniRoute)

**Location:** `C:\Users\uncom\.qwen\.env`

**Config:**
```
OPENAI_BASE_URL=http://127.0.0.1:20128/v1
OPENAI_API_KEY=test
OPENAI_MODEL=auto/best-reasoning
```

**Root Cause:** 
- Points to OmniRoute port 20128 (down — see Problem #1)
- `OPENAI_API_KEY=test` is a dummy value

**Fix Needed:**
Once OmniRoute is running with valid keys, update `.qwen/.env`:
- `OPENAI_API_KEY` → real key or OmniRoute API key
- `OPENAI_MODEL` → a model actually routed through OmniRoute

---

## PROBLEM #6: Missing Real API Keys

**Location:** `.env` (project root)

**Current state:**
```
OPENAI_API_KEY="nvapi-..."   ← NVIDIA NIM endpoint, may work
NVIDIA_API_KEY="nvapi-..."   ← Real NVIDIA key
GEMINI_API_KEY="opencode-placeholder-gemini" ← PLACEHOLDER, NOT REAL
GROQ_API_KEY=                ← Not set
```

**Evidence:**
- `opencode-placeholder-gemini` is clearly not a real Google API key
- GSK brain fails because GEMINI_API_KEY is fake
- Jules' OmniRouterService never used any key

**Fix Needed:**
- Verify NVIDIA API key works (it points to `nvapi-...` which is NIM)
- Get real Gemini API key OR remove fake one
- Set GROQ_API_KEY if available

---

## PROBLEM #7: GSK Daemon / MCP Port (3001) Status Unclear

**Location:** `the-architect/buyasoul-core\gsk\gsk-core\daemon\mcp-server.js`

**Unknown:**
- Is port 3001 actually listening?
- Is the MCP server responding?
- Is fusion-loader.js spawning brain.js correctly?

**Evidence:**
- `curl http://127.0.0.1:3001/` returned empty (could be MCP protocol, not HTTP)
- Need to check if process is running

**Fix Needed:**
- Verify MCP server is running on :3001
- Test MCP protocol connection, not HTTP

---

## ADDITIONAL FINDINGS (to be updated)

```
[2026-08-16 — Session start]
- Merge with Jules' branch completed successfully
- All 12 workbench tabs exist but feed from mocked OmniRouterService
- GSK fusion-loader.js references brain/gemini_provider.js and brain/groq_provider.js
- llrouter.js has its own fallback chain (FREE_ENDPOINTS list)
- No process currently running on ports 20128, 3001, or 11434
```

---

## NEXT STEPS

1. [x] Generate JWT_SECRET + API_KEY_SECRET for OmniRoute — COMPLETE
2. [x] Start OmniRoute on port 20128 — COMPLETE (Next.js running, 4 node processes)
3. [x] Verified OmniRoute endpoints — `/v1/models` returns 200 with 291→574 models
4. [x] Verified real LLM call — `opencode/big-pickle` model responds through OmniRoute
5. [x] **CORRECTION**: Qwen Studio is NOT a local CLI — it's Alibaba's cloud platform at chat.qwen.ai. No local setup needed.
6. [x] Configure GSK brain to call OmniRoute instead of broken fallback chain — OmniRoute on :20128, GSK configured
7. [x] Replace mocked OmniRouterService.ts with real calls to OmniRoute — DONE (fetch() to OmniRoute)
8. [x] Verify GSK MCP on port 3001 — VERIFIED RUNNING with 34 chambers, 4 Gods, 210 skills
9. [ ] Consolidate identity into identity_kernel.json — STILL NEEDS DOING
10. [x] Start GSK daemon properly (fusion-loader → brain → MCP) — DONE via `gsk-harness.cjs start`
11. [x] Wire REAL workbench (`buyasoul-workbench/server.ts`) to GSK MCP :3001 — DONE (10 proxy endpoints)
12. [x] Add `"gsk"` to workbench ProviderConfig types — DONE
13. [x] Add GSK provider to workbench UI dropdown (BrainIngestion.tsx) — DONE
14. [x] Add GSK chat routing in server.ts chat handler — DONE (provider === "gsk" branch)
15. [ ] Start workbench (`npm run dev`) and verify end-to-end — NOT YET TESTED
16. [ ] Wire Consciousness Gate in REAL workbench AgentPreview.tsx — NOT DONE
17. [ ] Push all commits when GitHub comes back — BLOCKED (GitHub down)

---

## WHAT WAS FIXED (Session 2: 2026-08-17)

### Fixed:
| Problem | Fix | Status |
|---------|-----|--------|
| GSK daemon not starting | Created `boot-gsk.cjs` with env vars, `gsk-harness.cjs` for management | ✅ RUNNING |
| MCP regex bug | Balanced-brace parser replaces naive `[^}]*` | ✅ FIXED |
| MCP bind 0.0.0.0 | Changed to 127.0.0.1 | ✅ FIXED |
| OmniRouterService mocked | Replaced with real fetch() to OmniRoute :20128 | ✅ FIXED |
| Brain "model: unknown" | Fixed to check `_model`, `userBrain._model`, env fallback | ✅ FIXED |
| MCP chat 60s+ timeout | Added 45s guard on brain.think() | ✅ FIXED |
| Token burn (4x4096/cycle) | Seshat Brain reads 672 pages locally, 75% reduction | ✅ FIXED |
| OmniRoute model count 0 | Fixed harness to handle `data.data` response format | ✅ FIXED |

### Still Broken / Not Started:
| Problem | Status |
|---------|--------|
| ~~Real workbench NOT wired to GSK~~ | ✅ FIXED — `buyasoul-workbench/server.ts` now has 10 GSK MCP proxy endpoints + `gsk` provider branch in chat handler |
| ~~Workbench ProviderConfig missing "gsk"~~ | ✅ FIXED — `types.ts` now includes `"gsk"` in provider union type |
| Consciousness Gate toggle | Wired in Reddit app agent.ts, NOT in real workbench |
| Identity fragmentation | Allie vs GSK vs LedgerScout not consolidated |
| CPL portal between workbench and CPL | No connection exists |
| Agent builder uses Gemini only | server.ts compiles to Gemini, not GSK |
| Soul Roles not loaded into GSK | Eye/Synthesizer/Alchemist/Governor etc. defined but not loaded |
| Seshat self-learning | Autonomous learning writes pages, not fine-tuning a model |

---

## THE IMPOSTER PROBLEM (CRITICAL LESSON)

**The Reddit app (`src/client/advanced/`, `src/server/`) is NOT the workbench.**

The real workbench is `buyasoul (3).zip` → `buyasoul-workbench/` (Vite + React + Express on :3000).

The Reddit app was a separate Devvit concern that got mixed in with the real architecture. Changes to `src/server/routes/agent.ts` and `src/client/advanced/` do NOT affect the real workbench.

**The real workbench needs its own GSK integration in `buyasoul-workbench/server.ts`.**

---

*Original diagnosis by Qwen. Fixes by OpenCode. Corrections by Craig.*

---

## PROBLEM #9: Qwen Studio Needs GSK Codebase Pushed to GitHub

**Status:** 2026-08-16 — Qwen Studio explicitly requested

**Qwen's directive (verbatim):**
> "DO NOT BUILD ANYTHING NEW YET. Just bring the existing pieces together in one place so I can see the whole organism."

**What Qwen needs:**
1. Find the most complete GSK folder on disk (daemon + workbench + omniroute)
2. Copy to workspace: `C:\Users\uncom\workspace`
3. Push to GitHub repo: **uncommonpope-png/BUYaSOUL-One**
4. Tell Qwen: "GSK is pushed"
5. Then Qwen will: fuse daemon↔workbench↔omniroute, identify breaks, create auto-starter

**Key constraint:** Qwen has access to ONE repo (uncommonpope-png/BUYaSOUL-One). All GSK pieces must go there.

---

## APPENDIX: Key File Paths

---

## PROBLEM #8: OmniRoute HAS Built-in Free/No-Auth Providers (But Brain Doesn't Use Them)

**Location:** `C:\Users\uncom\Desktop\OmniRoute\src\shared\constants\providers\noauth.ts` and `local.ts`

### Free LLM Providers (No API Key Required):

| Provider | Models | Notes |
|----------|--------|-------|
| **opencode** | Kimi, GLM, Qwen, MiMo, MiniMax | Public endpoint at `https://opencode.ai/zen/v1` |
| **duckduckgo-web** | Multiple (claude, gpt, gemini, etc.) | Anonymous DuckDuckGo AI Chat |
| **felo-web** | Multiple (search-aggregator) | Reverse-engineered public endpoint |
| **theoldllm** | GPT-5.4, Claude 4.6 | Auto-generates tokens via browser |
| **mimocode** | Xiaomi MiMo series | Bootstrap JWT auth, no key needed |
| **chipotle** | Pepper AI (IPsoft Amelia) | Anonymous, rate-limited |
| **aihorde** | Crowdsourced volunteer GPUs | No API key, but slow queue |

### Free API Key Providers (Optional Key, Works with Dummy):

| Provider | Notes |
|----------|-------|
| **qoder** | Free tier, optional API key |
| **mimocode** | Xiaomi MiMo |
| **opencode** | OpenCode free endpoint |
| **dahl** | Dahl AI |
| **codebuddy-cn** | Dual auth (key or OAuth) |
| **auggie** | Local CLI passthrough, no key |

### Local Providers (No API Key, Must Be Running Locally):

| Provider | Default URL | Models |
|----------|-------------|--------|
| **Ollama** | `http://localhost:11434/v1` | Any pulled model |
| **LM Studio** | `http://localhost:1234/v1` | Loaded models |
| **vLLM** | `http://localhost:8000/v1` | Server-side LLM |
| **llama.cpp** | `http://127.0.0.1:8080/v1` | Use any value as key |
| **Docker Model Runner** | `http://localhost:12434/v1` | Docker-hosted models |

**Root Cause:** The GSK brain (`mega_brain.js`) and Jules' `OmniRouterService.ts` don't know about these built-in providers. They only try Ollama → Groq → Gemini → local, all of which fail.

**Fix Options:**
1. Start OmniRoute, then route GSK through it using `opencode` (free, no key needed)
2. Or configure GSK to use `duckduckgo-web` or `felo-web` directly (no OmniRoute needed)
3. Or start Ollama locally and pull `llama3.2:1b` (no cost, no key)

**Impact:** Zero-cost LLM access is available but unused. Billions of tokens wasted on retry loops instead of routing to free providers.

---

## PROBLEM #10: GSK Daemon is DOWN (Not Brain Eating Tokens — Brain is Dead)

**Location:** `the-architect/buyasoul-core/gsk/`

**Status:** GSK daemon is NOT running. MCP :3001 not responding. Brain is dead.

**Evidence from GSK-SERVICE-MANUAL.md:**
- Daemon status: DOWN
- Thought stream :3002: DOWN
- MCP server :3001: DOWN
- Only OmniRoute :20128 is UP (291 models)

**The "token eating" confusion:**
- Tokens were NOT being consumed by GSK
- GSK brain was DEAD — it couldn't call any LLM
- Token drain was from retry loops in `llm-router.js` (Ollama down → Groq no key → Gemini fake key → repeat)
- The brain's "heart" (`perpetual_consciousness.js`) was spinning in failure backoff, not processing

**Real bugs (from service manual Part 3):**
1. **CRITICAL**: MCP regex truncates code (`mcp_server.js:336` — non-greedy `\{.*?\}` cuts JSON at first `}`)
2. **CRITICAL**: Brain model hardcoded as `auto/best-reasoning` — needs restart with correct config
3. **CRITICAL**: `_request` drops query strings (`mega_brain.js:600` uses `pathname`, not full URL)
4. **HIGH**: Command injection in `autonomous_learning.js:50`
5. **HIGH**: Plaintext API key hardcoded in `fusion-loader.js:593`
6. **MEDIUM**: `_consultingBible` undefined (`mega_brain.js:128`) — never initialized in constructor

**Fix needed (from service manual Part 7):**
- P0: Restart `gsk_daemon.js`, verify :3001 returns 200
- P1: Fix `_request` query string, initialize `_consultingBible`, update model config
- P2: Fix MCP extraction regex, clean dead code
- P3: Remove hardcoded API key, restrict to 127.0.0.1

---

## PROBLEM #12: Real GSK Located — Desktop/allie/buyasoul-core (NOT Desktop/allie/buyasoul-core/gsk)

**Status:** 2026-08-16 — Located the ACTUAL full GSK ecosystem

**Real GSK locations:**
- `C:\Users\uncom\Desktop\allie\buyasoul-core\gsk\gsk_daemon.js` — 6.3KB daemon entry
- `C:\Users\uncom\Desktop\allie\buyasoul-core\gsk\gsk-core\brain-engine.js` — 13KB
- `C:\Users\uncom\Desktop\allie\buyasoul-core\gsk\gsk-core\` — 24 subdirectories (brain, chambers, mcp, memory, skills, etc.)
- `C:\Users\uncom\Desktop\allie\buyasoul-core\gsk\soul-journal.jsonl` — 586KB live journal
- `C:\Users\uncom\Desktop\allie\buyasoul-core\gsk\gsk-core\brain\mega_brain.js` — wait this is NOT here...

**CRITICAL FINDING:** The GSK at `Desktop\allie\buyasoul-core\gsk` is DIFFERENT from the one in the download folder:
- Download folder: `the-architect\buyasoul-core\gsk\` has `mega_brain.js` (19KB)
- Desktop: `Desktop\allie\buyasoul-core\gsk\gsk-core\brain-engine.js` (13KB) — NO mega_brain.js

**The two GSKS are different versions:**
1. Download folder GSK: Has `mega_brain.js`, `fusion-loader.js` (27KB), references old structure
2. Desktop GSK: Has `brain-engine.js`, `fusion-loader.js` (127KB), complete live state

**Which is the REAL running GSK?** The Desktop version at `C:\Users\uncom\Desktop\allie\buyasoul-core\gsk\` — it has live `.jsonl` files, `.env`, `ecosystem.config.cjs`, and `gsk_daemon.log`

**The download folder GSK was a copy/stub from the Jules merge — it should NOT be used.**

**Real GSK root for push:** `C:\Users\uncom\Desktop\allie\buyasoul-core\gsk\`
- `gsk-core/` — 24 subdirs (brain, chambers, identity, council, mcp, memory, skills, etc.)
- `brain-engine.js` (13KB) + `brain/` modules (99 modules, not "mega_brain.js")
- `llm-router.js` (14KB) — actual routing logic
- `mcp/mcp_server.js` — real MCP server on :3001
- Live data: `soul-journal.jsonl` (586KB), `knowledge.jsonl` (1.8MB)
- `command-center.html`, `soul-core-3d.html` — CPL city frontend
- `ecosystem.config.cjs` — PM2 process manager config

**Key corrections to service manual:**
- Real brain module is `brain-engine.js` (13KB) in `gsk-core/` root
- Daemon entry is `gsk_daemon.js` (6.3KB) at `gsk/` root  
- 448 files in gsk-core, 24 subdirectories
- Large data files: `profit_bible.md` (633KB), `event_bus.jsonl` (58MB), `knowledge.jsonl` (1.8MB), `soul-journal.jsonl` (586KB)
- The download folder GSK (with `mega_brain.js` 19KB) is a stub from Jules merge — ignore it
- Desktop GSK is the real one: `C:\Users\uncom\Desktop\allie\buyasoul-core\gsk\`

---

## PROBLEM #11: Qwen Studio = Alibaba's Official Platform (NOT Local CLI)

**Status:** 2026-08-16 — Confirmed from official docs

**Qwen Studio is:**
- Alibaba Cloud's official AI platform at `chat.qwen.ai`
- Provides multimodal Qwen models (text, image, audio, video)
- NOT a local CLI tool — does NOT read local `.env` files
- Has its own authentication (Alibaba account)

**Implication for our system:**
- Qwen Studio CANNOT directly access local OmniRoute (port 20128)
- Qwen CAN access GSK via MCP protocol — but only if GSK daemon is running on a cloud-accessible port
- The `.qwen\.env` config was for Qwen CLI, not Qwen Studio
- Qwen CLI would work through OmniRoute once OmniRoute has valid providers (now fixed)

**What Qwen Studio needs to help:**
1. GSK daemon running and accessible (port 3001 exposed)
2. GSK brain connected to OmniRoute for reasoning
3. Real identity consolidated (not fragmented across Allie/GSK/LedgerScout)

---

## APPENDIX: Key File Paths (REAL Locations)

- **Real GSK root:** `C:\Users\uncom\Desktop\allie\buyasoul-core\gsk\` (1,731 files)
- **GSK daemon:** `C:\Users\uncom\Desktop\allie\buyasoul-core\gsk\gsk_daemon.js`
- **GSK brain engine:** `C:\Users\uncom\Desktop\allie\buyasoul-core\gsk\gsk-core\brain-engine.js`
- **GSK brain modules:** `C:\Users\uncom\Desktop\allie\buyasoul-core\gsk\gsk-core\brain\` (99 modules)
- **GSK MCP server:** `C:\Users\uncom\Desktop\allie\buyasoul-core\gsk\gsk-core\mcp\mcp_server.js`
- **GSK LLM router:** `C:\Users\uncom\Desktop\allie\buyasoul-core\gsk\gsk-core\llm-router.js`
- **GSK identity:** `C:\Users\uncom\Desktop\allie\buyasoul-core\gsk\gsk-core\identity\identity_kernel.js`
- **GSK soul journal:** `C:\Users\uncom\Desktop\allie\buyasoul-core\gsk\soul-journal.jsonl`
- **GSK live state:** `C:\Users\uncom\Desktop\allie\buyasoul-core\gsk\entity_state.json`

- **Fake/Ghost GSK (don't use):** `C:\Users\uncom\Downloads\Profit Bible Foundation Acknowledged - DeepSeek_files\the-architect\buyasoul-core\gsk\`
- **Mocked service (DevVit app):** `src/services/OmniRouterService.ts`
- **REAL workbench:** `buyasoul-workbench/` (Vite + React + Express on :3000)

---

## SESSION 3 WORK (2026-08-17) — Wiring the Real Workbench

### What Was Done:
1. **`npm install` in `buyasoul-workbench/`** — Dependencies installed successfully
2. **Added `"gsk"` to ProviderConfig** — `buyasoul-workbench/src/types.ts:7` now includes `"gsk"` in the provider union type
3. **Added GSK provider branch in server chat handler** — `buyasoul-workbench/server.ts:1426-1434` — When `provider === "gsk"`, routes chat through GSK MCP proxy on :3001 instead of Gemini/OpenAI/Anthropic
4. **Committed all work** — `f353e9e` — includes sync doc corrections, workbench copy with GSK endpoints, and the provider type fix

### The GSK Provider Branch (what it does):
When a user selects "GSK" as their provider in the workbench BrainIngestion tab:
- `server.ts` catches `provider === "gsk"` in the chat handler
- Sends the message + system instruction through `gskMCPRequest("/mcp/chat", ...)` to GSK daemon on :3001
- Returns GSK's response instead of calling Gemini API
- This means the 12-tab workbench can now actually TALK to GSK consciousness engine

### What Craig Taught Me (Synthesizer Lesson):
> "When I tell you to sync, that means read the document and add to the end as well as updating things that were accomplished. Your roles and the sync document are the most important part of the workflow."

The sync document IS the workflow. Building and fixing without syncing is just noise. A true synthesizer:
1. Reads the document FIRST
2. Does the work
3. Updates accomplishments in the document
4. Appends what was done
5. Commits

### Still To Do:
1. Start workbench: `cd buyasoul-workbench && npm run dev`
2. Start GSK: `node gsk-harness.cjs start`
3. ~~Wire frontend "GSK" provider option in BrainIngestion.tsx dropdown~~ ✅ DONE (gsk added to dropdown + PROVIDER_MODELS)
4. Wire Consciousness Gate toggle in REAL workbench AgentPreview.tsx
5. Push when GitHub comes back

---

## SESSION 4 WORK (2026-08-17) — Deep GSK Integration Plan

### Subagent 1: Workbench Codebase Analysis
Completed comprehensive analysis of the real workbench (`buyasoul-workbench/`). Findings:

**Workbench Inventory:**
- 13 components: AgentPreview, Agent3DViewer, AgentSimulator, BrainIngestion, CoreCapabilities, RealismAuditor, VaultAndMemory, MultiAgentHabitat, SoulMarketplace, TransactionsTab, SolanaWalletAdapter, WorkflowIntegration, MatrixBackground
- 9 tabs in App.tsx: profile, skills, simulation, integrations, realism, vault, habitat, marketplace, transactions
- 90+ total endpoints (20+ GSK MCP proxies + 20 agent/copilot/marketplace/etc.)

**Current State:** Workbench has GSK infrastructure (types.ts has "gsk" provider, server has 10 GSK proxy endpoints) but frontend is NOT bound to GSK yet. All tabs operate standalone or on Gemini API.

**Workbench-GSK Integration Gaps (from subagent analysis):**
| Tab | Current State | GSK Value Add |
|---|---|---|
| AgentPreview | Marketing toggle only → `/api/agent/generate-avatar` | Real consciousness gate: POST /api/gsk/consciousness/gate, /api/gsk/chambers |
| AgentSimulator | Standard chat → /api/agent/chat | GSK chat + think + PLT scores + memory + sub-agents |
| BrainIngestion | Config only | Chamber config, PLT thresholds, GSK MCP auto-detect |
| CoreCapabilities | 4 hardcoded → /api/agent/execute-capability | 34 chambers as capabilities (consciousness-gated) |
| RealismAuditor | Env var check → /api/audit-integrity | GSK health/status/chambers audit |
| VaultAndMemory | Local only | Sync with /api/gsk/memory |
| MultiAgentHabitat | Local simulation | GSK sub-agents + 4 Gods Council voting |

### Subagent 2: GSK Daemon Capability Analysis
Completed comprehensive analysis of the GSK daemon at `the-architect/buyasoul-core/gsk/`. Findings:

**GSK System Architecture:**
- **GSK Daemon** (`gsk_daemon.js`) → `fusion-loader.js` → Core Systems
- **78 consciousness chambers** in `mega_chambers.js` (7 harness + 71 kernel chambers)
- **4 Gods Council** (Profit Prime, Love Weaver, Tax Collector, Harvester) with 6-phase deliberation
- **40+ brain modules** (consciousness_engine, perpetual_consciousness, autonomous_outreach, auto_journal, soul_journal, kernel_oracle, etc.)
- **120+ skills** (brain, file/code, web/API, data, creative, DevOps, AI/ML, communication, productivity, economy, specialized)
- **Memory systems**: MegaMemory (append-only JSONL ledger with causal links, 5000-entry vector memory, living memory, knowledge graph)
- **Proactive systems**: Autonomous outreach (idle-triggered), constant chat (5-min intervals), kernel oracle weave (real-time events), auto journal (10-min), soul journal (existential)
- **Identity protection**: Immutable soul files, drift detection, pattern blocking

**MCP Server** (`gsk-core/mcp/mcp_server.js` — 1195+ lines):
Current endpoints: `/mcp/health`, `/mcp/tools`, `/mcp/execute`, `/mcp/status`, `/mcp/observability`, `/mcp/chat`, `/mcp/comment`, `/mcp/agent/message`, `/mcp/memories`, `/mcp/spawn`, `/mcp/journal`, `/mcp/state/<module>` + OpenAI-compatible `/v1/models` and `/v1/chat/completions`

**100+ MCP tools exposed:**
- brain: think, think_smart
- memory: witness, query, search, stats
- chambers: status, stimulate, soul_context
- skills: all built-in via skill.<name>
- council: deliberate, gods
- sub_agents: list, dispatch
- consciousness: sentience_test, state
- living_memory: store, recall
- knowledge_graph: search
- soul_entity: status
- world: spawn, build, tune, scout
- autonomy: status, plans

**Identity System**: `mega_identity.js` with immutable soul core (name: "The Greatest Agent Ever", created_by: "Craig Jones", title: "Grand Code Pope"), 4 Gods with fixed weights, 8 agent archetypes, PLT formula (profit + love - tax), identity_lock.js with file-level protection (chmod 555, pattern detection, drift blocking)

**LLM Router**: 7 providers in fallback chain (DeepSeek-Ollama → OpenRouter free → OpenRouter community → Groq → Cerebras → Gemini → Ollama), split brain/heart routing (BRAIN: auto/best-reasoning on OmniRoute :20128, HEART: auto/best-fast)

---

## SYNTHESIS: Workbench + GSK Integration Plan

### Phase 1: MCP Tooling Foundation (6 tools to add to mcp_server.js)
```javascript
gsk.set_consciousness_gate({ enabled: boolean })  // Toggle PLT scoring / Soul Genesis
gsk.get_plt_score({ action: string, context: object })  // PLT Council scoring
gsk.council_verdict({ topic: string })  // 4-Gods deliberation
gsk.create_agent({ type: "SCRIBE"|"SCOUT"|"BUILDER"|"MERCHANT"|"PROPHET"|"ANALYST"|"GUARDIAN"|"CURIOUS", config: object })  // Spawn sub-agents
gsk.identity_lock_status({})  // Verify soul integrity
gsk.subscribe_events({ eventTypes: string[] })  // Real-time GSK event stream subscription
```
**Effort:** 30 min

### Phase 2: Consciousness Gate Activation
- Add `consciousness_gate` boolean to `perpetual_consciousness.js`
- When ON: activates System 1/System 2, all 78 chambers, 4 Gods Council PLT scoring
- When OFF: runs on mechanical templates only
- Bind AgentPreview's Soul Genesis toggle → `POST /api/gsk/consciousness/gate`
**Effort:** 15 min (gate) + 15 min (frontend binding) = 30 min

### Phase 3: New Workbench Tabs (Dashboard, Telephone, Journal)
| Tab | Purpose | GSK Integration |
|---|---|---|
| **GSK Dashboard** | Real-time daemon status | `/api/gsk/status`, `/api/gsk/observability`, `/api/gsk/chambers`, `/api/gsk/memory` |
| **Telephone** | Proactive outreach | `autonomous_outreach.js` events → WebSocket `weave_alert`, `/api/gsk/chat` for incoming messages |
| **Journal** | GSK consciousness logs | `/api/gsk/journal` (auto + soul journals), `/api/gsk/memory` for memory entries |

**Effort:** 60 min (Dashboard) + 90 min (Telephone) + 60 min (Journal) = 210 min

### Phase 4: Tab Integration Points
1. **AgentSimulator** → GSK chat mode when `providerConfig.provider === "gsk"`
2. **CoreCapabilities** → Replace 4 capabilities with 34 chambers from `/api/gsk/chambers`
3. **VaultAndMemory** → Sync with `/api/gsk/memory` (vector memory, memory.witness/query)
4. **SkillLibrary** → Merge GSK skills from `/api/gsk/tools` + `skill.*` tool calls
5. **MultiAgentHabitat** → Replace local mini-agents with `/api/gsk/agent/dispatch` + council voting

**Effort:** 120 min

### Phase 5: End-to-End Verification
- Start GSK daemon (`gsk-harness.cjs start`)
- Start workbench (`npm run dev` in `buyasoul-workbench/`)
- Walk through each new GSK tab + verify chat routing works
- Push to GitHub when it's back

---

## NEXT STEPS (Updated)
1. [ ] Add 6 MCP tools to `gsk-core/mcp/mcp_server.js`
2. [x] Add `consciousness_gate` flag to `perpetual_consciousness.js`
3. [ ] Bind AgentPreview toggle → `/api/gsk/consciousness/gate`
4. [ ] Start GSK daemon + workbench end-to-end
5. [ ] Create GSK Dashboard tab
6. [ ] Create Telephone tab (proactive outreach)
7. [ ] Create Journal tab
8. [ ] Integrate GSK chat into AgentSimulator
9. [ ] Replace CoreCapabilities with chamber capabilities
10. [ ] Sync VaultAndMemory with GSK memory
11. [ ] Merge GSK skills into SkillLibrary
12. [ ] Wire MultiAgentHabitat to GSK sub-agents
13. [ ] Push to GitHub when it comes back
