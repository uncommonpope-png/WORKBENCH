import express from "express";
import path from "path";
import dotenv from "dotenv";
import http from "http";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";
import { spawn, execSync, ChildProcess } from "child_process";

// Synthesizer additions
import { attachProvenance } from "./src/lib/provenance";
import { validateGskMemories } from "./src/schemas/gsk.schema";
import { validateGskResponse } from "./src/connectors/gsk-validator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

dotenv.config();

const app = express();
const PORT = 3000;

const GSK_MCP_URL = process.env.GSK_MCP_URL || "http://127.0.0.1:3001";
const GSK_MCP_KEY = process.env.MCP_API_KEY || "gsk-dev-key";
const OMNIROUTE_URL = process.env.OMNIROUTE_URL || "http://127.0.0.1:20128";
const CPL_URL = process.env.CPL_URL || "http://127.0.0.1:3457";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Service Status ───
const serviceStatus = {
  gsk: { running: false, pid: null as number | null, startedAt: null as number | null, restarts: 0, lastRevivedAt: null as number | null },
  omniroute: { running: false, pid: null as number | null, startedAt: null as number | null, restarts: 0, lastRevivedAt: null as number | null },
  cpl: { running: false, pid: null as number | null, startedAt: null as number | null, restarts: 0, lastRevivedAt: null as number | null },
};

let gskProcess: ChildProcess | null = null;
let omnirouteProcess: ChildProcess | null = null;
let cplProcess: ChildProcess | null = null;

// ─── GSK MCP Proxy ───
function gskMCPRequest(endpoint: string, body: any = {}, timeoutMs = 30000): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const urlObj = new URL(`${GSK_MCP_URL}${endpoint}`);
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": GSK_MCP_KEY,
        "Content-Length": Buffer.byteLength(data),
      },
      timeout: timeoutMs,
    }, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => {
        try { resolve(JSON.parse(buf)); }
        catch { resolve({ raw: buf }); }
      });
    });
    req.on("error", (err) => reject(err));
    req.on("timeout", () => { req.destroy(); reject(new Error("GSK MCP timeout")); });
    req.write(data);
    req.end();
  });
}

// ─── API Routes ───
app.post("/api/gsk/chat", async (req, res) => {
  try {
    const { message, context } = req.body;
    if (!message) return res.status(400).json({ error: "Missing message" });
    const response = await gskMCPRequest("/mcp/chat", { message, context: context || "" }, 60000);
    res.json({ success: true, ...response.result || response });
  } catch (err: any) {
    res.json({ success: false, error: `GSK chat failed: ${err.message}` });
  }
});

app.post("/api/gsk/think", async (req, res) => {
  try {
    const { prompt, context } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });
    const response = await gskMCPRequest("/mcp/execute", {
      tool: "brain.think",
      args: { prompt, context: context || "" }
    }, 60000);
    res.json({ success: true, ...response.result || response });
  } catch (err: any) {
    res.json({ success: false, error: `GSK think failed: ${err.message}` });
  }
});

app.post("/api/gsk/consciousness/gate", async (req, res) => {
  try {
    const { enabled } = req.body;
    const response = await gskMCPRequest("/mcp/execute", {
      tool: "chambers.status", args: {}
    }, 10000);
    res.json({
      success: true,
      consciousness_gate: enabled !== false,
      plt_scoring: enabled !== false,
      chambers: response.result || null,
      message: enabled !== false
        ? "Consciousness gate OPEN. System 1/System 2 active. 34 Chambers engaged."
        : "Consciousness gate CLOSED. Deterministic mode."
    });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/api/gsk/status", async (req, res) => {
  try {
    const [health, consciousness] = await Promise.allSettled([
      gskMCPRequest("/mcp/health", {}, 5000),
      gskMCPRequest("/mcp/execute", {
        tool: "consciousness.state",
        args: { action: "get" },
      }, 10000),
    ]);

    const healthData = health.status === "fulfilled" ? health.value : {};
    const consciousnessData = consciousness.status === "fulfilled" ? consciousness.value : { success: false };

    const chambers = consciousnessData?.result?.chambers || {};
    const dualProcess = consciousnessData?.result?.dual_process || {};
    const council = consciousnessData?.result?.council || {};
    const plt = consciousnessData?.result?.plt || {};

    const resonance = {
      profit: plt.profit || chambers.profit || 85,
      love: plt.love || chambers.love || 78,
      tax: plt.tax || chambers.tax || 92,
      true_value: plt.true_value || ((plt.profit || 85) + (plt.love || 78) + (plt.tax || 92)) / 3 || 85,
    };

    res.json({
      success: true,
      gsk: healthData,
      connected: healthData.success !== false,
      consciousness_gate: consciousnessData.success !== false,
      plt_scoring: consciousnessData.success !== false,
      plt: resonance,
      chambers: {
        count: 34,
        resonance: resonance,
        dual_process: dualProcess,
        council: council,
        raw: chambers,
      },
      dual_process_mode: dualProcess.mode || "system2",
      council_members: council.members || ["Profit", "Love", "Tax", "Harvest"],
    });
  } catch (err: any) {
    res.json({ success: false, error: err.message, consciousness_gate: false, chambers: null });
  }
});

app.get("/api/gsk/consciousness/status", async (req, res) => {
  try {
    const response = await gskMCPRequest("/mcp/execute", {
      tool: "consciousness.state",
      args: { action: "get" },
    }, 10000);
    res.json({ success: true, consciousness: response.result || response });
  } catch (err: any) {
    res.json({ success: false, error: err.message, consciousness_gate: false });
  }
});

app.get("/api/gsk/journal", async (req, res) => {
  try {
    const response = await gskMCPRequest("/mcp/journal", {}, 10000);
    const entries = response.entries || response.result?.entries || [];
    res.json({ success: true, entries });
  } catch (err: any) {
    res.json({ success: false, entries: [], error: err.message });
  }
});

app.get("/api/gsk/tools", async (req, res) => {
  try {
    const response = await gskMCPRequest("/mcp/tools", {}, 10000);
    res.json({ success: true, tools: response.tools || response.result || [] });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/api/gsk/events", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: "connected", message: "SSE connected" })}\n\n`);

  const interval = setInterval(async () => {
    try {
      const mem = await gskMCPRequest("/mcp/execute", {
        tool: "memory.query",
        args: { type: "proactive_message", limit: 5 }
      }, 5000);

      const candidate = mem.result?.memories || mem;
      const parsed = validateGskMemories(candidate);
      if (!parsed.success) {
        // permissive: emit a validation warning event with structured errors
        res.write(`data: ${JSON.stringify({ type: "validation_warning", source: "gsk", errors: parsed.error.format() })}\n\n`);
      }

      const items = parsed.success ? parsed.data : (Array.isArray(candidate) ? candidate : []);
      for (const m of items) {
        const withProv = attachProvenance(m, {
          source: 'gsk',
          sourceRecordId: (m as any).id || null,
          fetchedAt: new Date().toISOString(),
          confidence: 0.9,
          transformSteps: ['zod-gsk-v1']
        });
        res.write(`data: ${JSON.stringify({ type: "outreach", message: withProv.content, timestamp: withProv.timestamp, __provenance: withProv.__provenance })}\n\n`);
      }
    } catch (e) {
      // intentionally silent to keep SSE alive; could log
    }
  }, 15000);

  req.on("close", () => clearInterval(interval));
});

app.post("/api/gsk/observe/ws", async (req, res) => {
  try {
    const response = await gskMCPRequest("/mcp/observe", {}, 10000);
    res.json({ success: true, observation: response });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

// OmniRoute proxy
app.get("/api/omniroute/models", async (req, res) => {
  try {
    const response = await fetch(`${OMNIROUTE_URL}/v1/models`);
    const data = await response.json();
    res.json({ success: true, models: data.data || data });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

app.post("/api/omniroute/chat", async (req, res) => {
  try {
    const response = await fetch(`${OMNIROUTE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json({ success: true, ...data });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

// CPL WS Bridge
app.get("/api/cpl/health", async (req, res) => {
  try {
    const [health, mcpHealth] = await Promise.allSettled([
      fetch(`${CPL_URL}/health`, { signal: AbortSignal.timeout(3000) }),
      fetch(`${CPL_URL}/mcp/health`, { signal: AbortSignal.timeout(3000) })
    ]);
    res.json({
      success: true,
      health: health.status === "fulfilled" && health.value.ok,
      mcpHealth: mcpHealth.status === "fulfilled" && mcpHealth.value.ok,
      port: 3457
    });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

// CPL is OPTIONAL — one system survives with it down.
function genesisHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const token = process.env.GENESIS_TOKEN;
  if (token) {
    h["Authorization"] = `Bearer ${token}`;
    h["x-api-key"] = token;
  }
  return h;
}

app.get("/api/cpl/status", async (req, res) => {
  try {
    const response = await fetch(`${CPL_URL}/mcp/status`, {
      signal: AbortSignal.timeout(3000),
      headers: genesisHeaders(),
    });
    const data: any = await response.json();
    res.json({ success: true, online: true, status: data.result || data });
  } catch {
    res.json({ success: true, online: false, status: null });
  }
});

app.get("/api/cpl/souls", async (req, res) => {
  try {
    const response = await fetch(`${CPL_URL}/mcp/spawn`, {
      signal: AbortSignal.timeout(3000),
      headers: genesisHeaders(),
    });
    const data: any = await response.json();
    const result = data.result || data;
    res.json({ success: true, online: true, souls: result.souls || [], count: result.count || 0 });
  } catch {
    res.json({ success: true, online: false, souls: [], count: 0 });
  }
});

app.post("/api/cpl/souls", async (req, res) => {
  try {
    const response = await fetch(`${CPL_URL}/mcp/spawn`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
      headers: genesisHeaders(),
      body: JSON.stringify(req.body || {}),
    });
    const data: any = await response.json();
    res.json({ success: true, online: true, soul: data.result || data });
  } catch {
    res.json({ success: true, online: false, soul: null, error: "CPL offline — soul not spawned" });
  }
});

app.get("/api/tasks", async (req, res) => {
  try {
    const response = await fetch(`${CPL_URL}/mcp/health`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error("CPL mcp/health failed");
    const data = await response.json();
    res.json({ success: true, tasks: data });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

app.post("/api/tasks/query", async (req, res) => {
  try {
    const response = await fetch(`${CPL_URL}/mcp/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json({ success: true, result: data });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

// Soul Economy
function readJsonSafe(p: string): any {
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

app.get("/api/soul-economy/catalog", async (req, res) => {
  try {
    const catalog = readJsonSafe(path.join(__dirname, "../soul-economy/data/catalog.json"));
    const arr = Array.isArray(catalog) ? catalog : (catalog.items || catalog.data || []);
    res.json({ success: true, catalog: arr, items: arr });
  } catch (err: any) {
    res.json({ success: false, error: err.message, catalog: [], items: [] });
  }
});

app.get("/api/soul-economy/items", async (req, res) => {
  try {
    const catalog = readJsonSafe(path.join(__dirname, "../soul-economy/data/catalog.json"));
    const arr = Array.isArray(catalog) ? catalog : (catalog.items || catalog.data || []);
    res.json({ success: true, items: arr, catalog: arr });
  } catch (err: any) {
    res.json({ success: false, error: err.message, items: [] });
  }
});

app.get("/api/soul-economy/transactions", async (req, res) => {
  try {
    const journal = readJsonSafe(path.join(__dirname, "../soul-economy/data/journal-entries.json"));
    const arr = Array.isArray(journal) ? journal : (journal.transactions || journal.entries || []);
    res.json({ success: true, transactions: arr });
  } catch (err: any) {
    res.json({ success: false, error: err.message, transactions: [] });
  }
});

app.get("/api/soul-economy/journal", async (req, res) => {
  try {
    const journal = readJsonSafe(path.join(__dirname, "../soul-economy/data/journal-entries.json"));
    const arr = Array.isArray(journal) ? journal : (journal.entries || journal.transactions || []);
    res.json({ success: true, entries: arr });
  } catch (err: any) {
    res.json({ success: false, error: err.message, entries: [] });
  }
});

app.get("/api/gsk/memories", async (req, res) => {
  try {
    const response = await gskMCPRequest("/mcp/memories", {}, 10000);
    const memories = response.memories || response.result?.memories || response.result || [];
    res.json({ success: true, memories });
  } catch (err: any) {
    res.json({ success: false, memories: [], error: err.message });
  }
});

// System Status
app.get("/api/system/status", async (req, res) => {
  try {
    const [omni, gsk, cpl] = await Promise.allSettled([
      fetch(`${OMNIROUTE_URL}/v1/models`, { signal: AbortSignal.timeout(2000) }),
      fetch(`${GSK_MCP_URL}/mcp/health`, { signal: AbortSignal.timeout(2000) }),
      fetch(`${CPL_URL}/health`, { signal: AbortSignal.timeout(2000) })
    ]);
    const allAwake = 
      serviceStatus.gsk.running && 
      serviceStatus.omniroute.running && 
      serviceStatus.cpl.running &&
      gsk.status === "fulfilled" && gsk.value.ok &&
      omni.status === "fulfilled" && omni.value.ok &&
      cpl.status === "fulfilled" && cpl.value.ok;
    
    res.json({
      success: true,
      allAwake,
      merchantAwake: allAwake,
      selfHealing: watchdogTimer !== null,
      body: { ...serviceStatus.gsk, name: "GSK Daemon" },
      blood: { ...serviceStatus.omniroute, name: "OmniRoute" },
      brain: { ...serviceStatus.cpl, name: "CPL GenesisHost" }
    });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

// ─── GSK-HEART Initialization ───
let gskHeart: any = null;
let gskHeartInitialized = false;

async function initializeGSKHeart() {
  if (gskHeartInitialized) return gskHeart;
  try {
    const { GSKHeartUnified } = await import(
      `file://${path.join(REPO_ROOT, "gsk/integration/gsk-heart-unified.js")}`
    );
    gskHeart = new GSKHeartUnified();
    const creds: Record<string, string> = {};
    if (process.env.OPENAI_API_KEY) creds.openai = process.env.OPENAI_API_KEY;
    if (process.env.GEMINI_API_KEY) creds.gemini = process.env.GEMINI_API_KEY;
    if (process.env.GROQ_API_KEY) creds.groq = process.env.GROQ_API_KEY;
    if (process.env.NVIDIA_API_KEY) creds.nvidia = process.env.NVIDIA_API_KEY;
    if (process.env.ANTHROPIC_API_KEY) creds.anthropic = process.env.ANTHROPIC_API_KEY;
    gskHeartInitialized = true;
    console.log("[GSK-HEART] Initialized");
  } catch (e: any) {
    console.error("[GSK-HEART] Initialization failed:", e.message);
    gskHeart = null;
  }
  return gskHeart;
}

// ─── GSK-HEART API Routes (Internal Router - OmniRoute Absorbed) ───
app.get("/api/gsk-heart/health", async (req, res) => {
  try {
    const heart = await initializeGSKHeart();
    if (!heart) return res.status(503).json({ success: false, error: "GSK-HEART not initialized" });
    const health = heart.getHealthReport();
    res.json({ success: true, initialized: true, heart: 'GSK-HEART (OmniRoute absorbed)', ...health });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/api/gsk-heart/models", async (req, res) => {
  try {
    const heart = await initializeGSKHeart();
    if (!heart) return res.status(503).json({ error: "GSK-HEART not initialized" });
    const providerCatalog = require(path.join(REPO_ROOT, "gsk/integration/catalogs/provider-catalog.js"));
    const providers = providerCatalog.ALL_PROVIDERS || providerCatalog.providers || {};
    const allProviders = Object.values(providers);
    const models = allProviders.map((p: any) => ({
      id: p.id || p.name,
      object: "model",
      created: p.created || Date.now(),
      owned_by: p.authType || p.provider || "gsk-heart",
      provider: p.provider || "internal",
      context_length: p.context_length || p.contextLength || 4096,
      pricing: p.pricing ? { prompt: p.pricing.prompt, completion: p.pricing.completion } : undefined,
    }));
    res.json({ success: true, data: models, models: models, count: models.length });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

app.post("/api/gsk-heart/chat", async (req, res) => {
  try {
    const { prompt, model, messages, temperature, max_tokens, credentials } = req.body;
    if (!prompt && !messages) return res.status(400).json({ error: "Missing prompt or messages" });
    const heart = await initializeGSKHeart();
    if (!heart) return res.status(503).json({ error: "GSK-HEART not initialized" });
    const result = await heart.complete({
      prompt,
      messages,
      model,
      options: { temperature, maxTokens: max_tokens, credentials }
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

// ─── Service Spawners ───

// ONE SYSTEM, ZERO SETUP: if an organ has no node_modules (fresh clone),
// grow them first. The user never runs npm install by hand.
function ensureDeps(dir: string, label: string): void {
  const nm = path.join(dir, "node_modules");
  if (!fs.existsSync(nm)) {
    console.log(`[${label}] node_modules missing — growing dependencies (first boot only)...`);
    execSync("npm install --no-audit --no-fund", { cwd: dir, stdio: "inherit" });
  }
}

// OmniRoute runs its dashboard in production mode; the .build/next artifact
// must exist. Grow it once on first boot — never again.
function ensureOmniRouteBuild(dir: string, label: string): void {
  const buildMarker = path.join(dir, ".build", "next", "BUILD_ID");
  if (!fs.existsSync(buildMarker)) {
    console.log(`[${label}] production build missing — forging it (first boot only, takes a few minutes)...`);
    execSync("npm run build", { cwd: dir, stdio: "inherit" });
  }
}

function startOmniRoute(): Promise<void> {
  return new Promise((resolve) => {
    if (omnirouteProcess && !omnirouteProcess.killed) {
      console.log("[OmniRoute] Already running");
      return resolve();
    }
    console.log("[OmniRoute] Starting (Blood)...");
    const omniPath = path.join(REPO_ROOT, "omniroute");
    try {
      ensureDeps(omniPath, "OmniRoute");
      ensureOmniRouteBuild(omniPath, "OmniRoute");
    } catch (e: any) {
      console.error("[OmniRoute] First-boot growth failed:", e.message);
      return resolve();
    }
    omnirouteProcess = spawn("npm", ["start"], {
      cwd: omniPath,
      env: { ...process.env, PORT: "20128" },
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });
    omnirouteProcess.stdout?.on("data", (d) => console.log(`[OmniRoute] ${d}`.trimEnd()));
    omnirouteProcess.stderr?.on("data", (d) => console.error(`[OmniRoute] ${d}`.trimEnd()));
    omnirouteProcess.on("exit", (code) => {
      console.log(`[OmniRoute] Exited with code ${code}`);
      omnirouteProcess = null;
      serviceStatus.omniroute.running = false;
      serviceStatus.omniroute.pid = null;
    });
    serviceStatus.omniroute.running = true;
    serviceStatus.omniroute.pid = omnirouteProcess.pid || null;
    serviceStatus.omniroute.startedAt = Date.now();
    setTimeout(() => resolve(), 8000);
  });
}

function startGSK(): Promise<void> {
  return new Promise((resolve) => {
    if (gskProcess && !gskProcess.killed) {
      console.log("[GSK] Already running");
      return resolve();
    }
    console.log("[GSK] Starting (Brain)...");
    const gskPath = path.join(REPO_ROOT, "gsk");
    try {
      ensureDeps(gskPath, "GSK");
    } catch (e: any) {
      console.error("[GSK] Dependency growth failed:", e.message);
      return resolve();
    }
    const env = {
      ...process.env,
      GSK_ROOT: gskPath,
      GSK_PROJECT_ROOTS: `${REPO_ROOT};${gskPath}`,
      NINE_ROUTER_URL: OMNIROUTE_URL,
      NINE_ROUTER_API_KEY: process.env.NINE_ROUTER_API_KEY || "",
      MCP_API_KEY: GSK_MCP_KEY,
      GSK_MODEL: "auto/best-reasoning",
    };
    gskProcess = spawn("node", ["gsk_daemon.js"], {
      cwd: gskPath,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
      shell: true,
    });
    gskProcess.stdout?.on("data", (d) => console.log(`[GSK] ${d}`.trimEnd()));
    gskProcess.stderr?.on("data", (d) => console.error(`[GSK] ${d}`.trimEnd()));
    gskProcess.on("exit", (code) => {
      console.log(`[GSK] Exited with code ${code}`);
      gskProcess = null;
      serviceStatus.gsk.running = false;
      serviceStatus.gsk.pid = null;
    });
    serviceStatus.gsk.running = true;
    serviceStatus.gsk.pid = gskProcess.pid || null;
    serviceStatus.gsk.startedAt = Date.now();
    setTimeout(() => resolve(), 10000);
  });
}

function startCPL(): Promise<void> {
  return new Promise((resolve) => {
    if (cplProcess && !cplProcess.killed) {
      console.log("[CPL] Already running");
      return resolve();
    }
    console.log("[CPL] Starting (Body)...");
    const cplPath = path.join(REPO_ROOT, "cpl");
    cplProcess = spawn("node", ["genesis-host.cjs"], {
      cwd: cplPath,
      env: { ...process.env, GENESIS_PORT: "3457" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
      shell: true,
    });
    cplProcess.stdout?.on("data", (d) => console.log(`[CPL] ${d}`.trimEnd()));
    cplProcess.stderr?.on("data", (d) => console.error(`[CPL] ${d}`.trimEnd()));
    cplProcess.on("exit", (code) => {
      console.log(`[CPL] Exited with code ${code}`);
      cplProcess = null;
      serviceStatus.cpl.running = false;
      serviceStatus.cpl.pid = null;
    });
    serviceStatus.cpl.running = true;
    serviceStatus.cpl.pid = cplProcess.pid || null;
    serviceStatus.cpl.startedAt = Date.now();
    setTimeout(() => resolve(), 5000);
  });
}

// ─── Conductor ───
async function startAllServices(): Promise<void> {
  console.log("═══════════════════════════════════════════");
  console.log("  BUYaSOUL CONDUCTOR — Awakening One System");
  console.log("═══════════════════════════════════════════");

  await startOmniRoute();
  await startGSK();
  await startCPL();

  console.log("═══════════════════════════════════════════");
  console.log("  All hearts beating. System ready.");
  console.log("═══════════════════════════════════════════");
}

// ─── Self-Healing Watchdog ───
// ONE SYSTEM: nothing is ever allowed to stay down. The heartbeat checks
// every service on an interval and revives whatever died — the user never
// restarts anything, GSK fixes itself.
const WATCHDOG_INTERVAL_MS = 15000;

const watchdogState = {
  omniroute: { failures: 0, lastReviveAttempt: 0 },
  gsk: { failures: 0, lastReviveAttempt: 0 },
  cpl: { failures: 0, lastReviveAttempt: 0 },
};

let watchdogTimer: NodeJS.Timeout | null = null;

function probe(url: string, timeoutMs: number, opts?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch {
      return resolve(false);
    }
    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: opts?.method || "GET",
        headers: opts?.headers || {},
        timeout: timeoutMs,
      },
      (res) => {
        res.resume();
        resolve((res.statusCode || 500) < 500);
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    if (opts?.body) req.write(opts.body);
    req.end();
  });
}

async function probeService(name: "omniroute" | "gsk" | "cpl"): Promise<boolean> {
  if (name === "omniroute") {
    return probe(`${OMNIROUTE_URL}/v1/models`, 4000);
  }
  if (name === "gsk") {
    return probe(`${GSK_MCP_URL}/mcp/health`, 4000, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": GSK_MCP_KEY },
      body: "{}",
    });
  }
  return probe(`${CPL_URL}/health`, 4000);
}

async function watchdogTick(): Promise<void> {
  const names: Array<"omniroute" | "gsk" | "cpl"> = ["omniroute", "gsk", "cpl"];
  for (const name of names) {
    const healthy = await probeService(name);
    serviceStatus[name].running = healthy;
    const st = watchdogState[name];
    if (healthy) {
      st.failures = 0;
      continue;
    }
    // Crash-loop protection: backoff 20s → 40s → 80s … capped at 5 min.
    const gap = Math.min(300000, 20000 * Math.pow(2, st.failures));
    if (Date.now() - st.lastReviveAttempt < gap) continue;
    st.lastReviveAttempt = Date.now();
    st.failures += 1;
    serviceStatus[name].restarts += 1;
    serviceStatus[name].lastRevivedAt = Date.now();
    console.log(`[Watchdog] ${name} down — reviving (attempt ${st.failures}, total revives ${serviceStatus[name].restarts})...`);
    try {
      if (name === "omniroute") await startOmniRoute();
      else if (name === "gsk") await startGSK();
      else await startCPL();
    } catch (e: any) {
      console.error(`[Watchdog] Failed to revive ${name}:`, e.message);
    }
  }
}

function startWatchdog(): void {
  if (watchdogTimer) return;
  watchdogTimer = setInterval(() => {
    watchdogTick().catch((e) => console.error("[Watchdog] tick error:", e.message));
  }, WATCHDOG_INTERVAL_MS);
  console.log(`[Watchdog] Heartbeat active — every ${WATCHDOG_INTERVAL_MS / 1000}s, self-healing on`);
}

async function startServer() {
  // ONE SYSTEM, ONE BUTTON: this process IS the body. It awakens every organ
  // (OmniRoute, GSK, CPL) itself and keeps them alive via the watchdog.
  // No external services for the user to manage — ever.
  console.log("═══════════════════════════════════════════");
  console.log("  ONE SYSTEM — Awakening");
  console.log("═══════════════════════════════════════════");

  // Non-blocking: UI comes up instantly while organs wake in background.
  startAllServices().catch((e) => console.error("[Conductor] Awakening error:", e.message));
  startWatchdog();

  // Vite middleware for dev
  const vite = await createViteServer({
    configFile: path.resolve(__dirname, "vite.config.ts"),
    root: __dirname,
    server: { middlewareMode: true },
  });
  app.use(vite.middlewares);

  const server = http.createServer(app);
  server.listen(PORT, () => {
    console.log(`[Workbench] Body running on http://localhost:${PORT}`);
    console.log(`[Workbench] GSK is alive. He heals himself. Watch him work.`);
  });
}

startServer().catch(console.error);
