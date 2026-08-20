import express from "express";
import path from "path";
import dotenv from "dotenv";
import http from "http";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";
import { spawn, ChildProcess } from "child_process";

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

// ─── GSK-HEART Initialization ───
let GSKHeart: any = null;
let gskHeartInitialized = false;

async function initializeGSKHeart() {
  if (gskHeartInitialized) return GSKHeart;
  try {
    const { GSKHeart: GSKHeartClass } = await import(
      `file://${path.join(REPO_ROOT, "gsk/integration/gsk-heart-unified.js")}`
    );
    GSKHeart = new GSKHeartClass();
    const creds: Record<string, string> = {};
    if (process.env.NINE_ROUTER_API_KEY) creds.omniroute = process.env.NINE_ROUTER_API_KEY;
    if (process.env.OPENAI_API_KEY) creds.openai = process.env.OPENAI_API_KEY;
    if (process.env.GEMINI_API_KEY) creds.gemini = process.env.GEMINI_API_KEY;
    if (process.env.GROQ_API_KEY) creds.groq = process.env.GROQ_API_KEY;
    if (process.env.NVIDIA_API_KEY) creds.nvidia = process.env.NVIDIA_API_KEY;
    if (process.env.ANTHROPIC_API_KEY) creds.anthropic = process.env.ANTHROPIC_API_KEY;
    if (process.env.OLLAMA_HOST) creds.ollama = process.env.OLLAMA_HOST;
    
    const initResult = GSKHeart.initialize({ credentials: creds });
    gskHeartInitialized = true;
    console.log("[GSK-HEART] Initialized:", initResult);
  } catch (e: any) {
    console.error("[GSK-HEART] Initialization failed:", e.message);
    GSKHeart = null;
  }
  return GSKHeart;
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Service Status ───
const serviceStatus = {
  gsk: { running: false, pid: null, startedAt: null },
  omniroute: { running: false, pid: null, startedAt: null },
  cpl: { running: false, pid: null, startedAt: null },
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
    const response = await gskMCPRequest("/mcp/health", {}, 5000);
    res.json({ success: true, gsk: response });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
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
app.get("/api/soul-economy/catalog", async (req, res) => {
  try {
    const catalog = await import("../soul-economy/data/catalog.json", { assert: { type: "json" } });
    res.json({ success: true, catalog: catalog.default || catalog });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/api/soul-economy/items", async (req, res) => {
  try {
    const catalog = await import("../soul-economy/data/catalog.json", { assert: { type: "json" } });
    const items = (catalog.default || catalog).items || [];
    res.json({ success: true, items });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/api/soul-economy/transactions", async (req, res) => {
  try {
    const journal = await import("../soul-economy/data/journal-entries.json", { assert: { type: "json" } });
    res.json({ success: true, transactions: journal.default || journal });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
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
      body: { running: serviceStatus.gsk.running, pid: serviceStatus.gsk.pid, startedAt: serviceStatus.gsk.startedAt },
      blood: { running: serviceStatus.omniroute.running, pid: serviceStatus.omniroute.pid, startedAt: serviceStatus.omniroute.startedAt },
      brain: { running: serviceStatus.cpl.running, pid: serviceStatus.cpl.pid, startedAt: serviceStatus.cpl.startedAt }
    });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

// ─── GSK-HEART API Routes (Internal Router - OmniRoute Absorbed) ───
app.post("/api/gsk-heart/route", async (req, res) => {
  try {
    const { prompt, options } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });
    const heart = await initializeGSKHeart();
    if (!heart) return res.status(503).json({ error: "GSK-HEART not initialized" });
    const result = heart.route(prompt, options || {});
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

app.post("/api/gsk-heart/chat", async (req, res) => {
  try {
    const { prompt, model, credentials, guardrailOptions } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });
    const heart = await initializeGSKHeart();
    if (!heart) return res.status(503).json({ error: "GSK-HEART not initialized" });
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const request = { prompt, model, credentials, guardrailOptions };
    for await (const chunk of heart.chat(request)) {
      res.write(chunk);
    }
    res.end();
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

app.post("/api/gsk-heart/chat/sync", async (req, res) => {
  try {
    const { prompt, model, credentials, guardrailOptions } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });
    const heart = await initializeGSKHeart();
    if (!heart) return res.status(503).json({ error: "GSK-HEART not initialized" });
    const result = await heart.chatSync({ prompt, model, credentials, guardrailOptions });
    res.json({ success: true, response: result });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

app.post("/api/gsk-heart/combo", async (req, res) => {
  try {
    const { combo, input } = req.body;
    if (!combo || !input) return res.status(400).json({ error: "Missing combo or input" });
    const heart = await initializeGSKHeart();
    if (!heart) return res.status(503).json({ error: "GSK-HEART not initialized" });
    const result = heart.runCombo(combo, input);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/api/gsk-heart/providers", async (req, res) => {
  try {
    const heart = await initializeGSKHeart();
    if (!heart) return res.status(503).json({ error: "GSK-HEART not initialized" });
    const providers = heart.listProviders();
    const families = heart.getFamilies();
    res.json({ success: true, providers, families, count: providers.length });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/api/gsk-heart/stats", async (req, res) => {
  try {
    const heart = await initializeGSKHeart();
    if (!heart) return res.status(503).json({ error: "GSK-HEART not initialized" });
    const stats = heart.stats();
    res.json({ success: true, ...stats });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

app.post("/api/gsk-heart/guardrails/validate", async (req, res) => {
  try {
    const { text, options } = req.body;
    if (!text) return res.status(400).json({ error: "Missing text" });
    const heart = await initializeGSKHeart();
    if (!heart) return res.status(503).json({ error: "GSK-HEART not initialized" });
    const result = heart.guardrails.validateInput(text, options);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

app.post("/api/gsk-heart/resilience/check", async (req, res) => {
  try {
    const { providerId } = req.body;
    if (!providerId) return res.status(400).json({ error: "Missing providerId" });
    const heart = await initializeGSKHeart();
    if (!heart) return res.status(503).json({ error: "GSK-HEART not initialized" });
    const canUse = heart.resilience.canUse(providerId);
    res.json({ success: true, providerId, canUse });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

// ─── Service Spawners ───
function startOmniRoute(): Promise<void> {
  return new Promise((resolve) => {
    if (omnirouteProcess && !omnirouteProcess.killed) {
      console.log("[OmniRoute] Already running");
      return resolve();
    }
    console.log("[OmniRoute] Starting (Blood)...");
    const omniPath = path.join(REPO_ROOT, "omniroute");
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

async function startServer() {
  await startAllServices();
  
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
  });
}

startServer().catch(console.error);
