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
const GSK_MCP_KEY = process.env.MCP_API_KEY || "92140facf0a3b8484f85b9d343687a95703e91b4724928e2ec78b8fd9d4aefc6";
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

// ─── Context Mirror (Workbench → GSK) ───
let latestContext: Record<string, any> | null = null;

app.post("/api/gsk/context", async (req, res) => {
  try {
    latestContext = req.body && typeof req.body === "object" ? req.body : {};
    res.json({ success: true });
    try {
      gskMCPRequest("/mcp/execute", {
        tool: "brain.context_update",
        args: latestContext,
      }).catch(() => {});
    } catch {}
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

// ─── API Routes ───
app.post("/api/gsk/chat", async (req, res) => {
  try {
    const { message, context } = req.body;
    if (!message) return res.status(400).json({ error: "Missing message" });
    let outboundContext: string = context || "";
    if (latestContext) {
      const skills = Array.isArray(latestContext.equippedSkills)
        ? latestContext.equippedSkills.join(",")
        : "";
      outboundContext = `[WORKBENCH CONTEXT] tab=${latestContext.activeTab ?? "?"} skills=${skills} provider=${latestContext.provider ?? "?"} model=${latestContext.model ?? "?"} agent=${latestContext.profileName ?? "?"}\n${outboundContext}`.trim();
      console.log("[CTX] injected into chat");
    }
    const response = await gskMCPRequest("/mcp/chat", { message, context: outboundContext }, 60000);
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

let gskStatusCache: any = null;
let gskStatusCacheAt = 0;

app.get("/api/gsk/status", async (req, res) => {
  try {
    const [health, consciousness] = await Promise.allSettled([
      gskMCPRequest("/mcp/health", {}, 3000),
      gskMCPRequest("/mcp/execute", {
        method: "consciousness.state",
        params: { action: "get" },
      }, 4000),
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

    const payload = {
      success: true,
      degraded: health.status !== "fulfilled" || consciousnessData.success === false,
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
    };
    if (!payload.degraded) {
      gskStatusCache = payload;
      gskStatusCacheAt = Date.now();
    } else if (gskStatusCache && Date.now() - gskStatusCacheAt < 600000) {
      return res.json({ ...gskStatusCache, cached_while_degraded: true });
    }
    res.json(payload);
  } catch (err: any) {
    if (gskStatusCache && Date.now() - gskStatusCacheAt < 600000) {
      return res.json({ ...gskStatusCache, cached_while_degraded: true });
    }
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

  let lastSeen = Date.now();
  const sentHashes = new Set<string>();

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
      let maxSeen = lastSeen;
      for (const m of items) {
        const ts = Number((m as any).timestamp || (m as any).createdAt || 0);
        const content = String((m as any).content ?? (m as any).summary ?? "");
        const hash = `${ts}|${content.slice(0, 80)}`;
        if (ts && ts <= lastSeen) continue;
        if (!ts && sentHashes.has(hash)) continue;
        if (ts) maxSeen = Math.max(maxSeen, ts);
        sentHashes.add(hash);
        const withProv = attachProvenance(m, {
          source: 'gsk',
          sourceRecordId: (m as any).id || null,
          fetchedAt: new Date().toISOString(),
          confidence: 0.9,
          transformSteps: ['zod-gsk-v1']
        });
        res.write(`data: ${JSON.stringify({
          type: "outreach",
          title: "GSK",
          message: withProv.content,
          timestamp: ts || Date.now(),
          priority: "normal",
          __provenance: withProv.__provenance
        })}\n\n`);
      }
      lastSeen = maxSeen;
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
    const arr: any[] = Array.isArray(journal) ? journal : (journal.entries || journal.transactions || []);
    const entries = arr.map((e: any) => {
      const content =
        (typeof e?.content === "string" && e.content) ||
        (typeof e?.text === "string" && e.text) ||
        (typeof e?.body === "string" && e.body) ||
        JSON.stringify(e ?? {}).slice(0, 300);
      return { ...e, content };
    });
    res.json({ success: true, entries });
  } catch (err: any) {
    res.json({ success: false, error: err.message, entries: [] });
  }
});

let memoriesCache: any[] = [];
let memoriesCacheAt = 0;

app.get("/api/gsk/memories", async (req, res) => {
  const fetchMemories = () => gskMCPRequest("/mcp/memories", {}, 8000);
  try {
    let response: any;
    try {
      response = await fetchMemories();
    } catch {
      await new Promise((r) => setTimeout(r, 1200));
      response = await fetchMemories().catch(() => null);
    }
    const raw = response ? (response.memories || response.result?.memories || response.result || []) : [];
    let arr: any[] = Array.isArray(raw) ? raw : [];
    if (arr.length === 0 && memoriesCache.length > 0 && Date.now() - memoriesCacheAt < 300000) {
      arr = memoriesCache;
    } else if (arr.length > 0) {
      memoriesCache = arr;
      memoriesCacheAt = Date.now();
    }
    const memories = arr.map((m: any) => {
      const summary =
        (typeof m?.summary === "string" && m.summary) ||
        (typeof m?.content === "string" && m.content) ||
        (typeof m?.text === "string" && m.text) ||
        JSON.stringify(m ?? {}).slice(0, 200);
      return {
        ...m,
        type: typeof m?.type === "string" && m.type ? m.type : "memory",
        summary,
      };
    });
    res.json({ success: true, memories });
  } catch (err: any) {
    res.json({ success: false, memories: [], error: err.message });
  }
});

app.post("/api/gsk/memories", async (req, res) => {
  try {
    const { type, summary, weight } = req.body || {};
    if (typeof type !== "string" || !type || typeof summary !== "string" || !summary) {
      return res.status(400).json({ success: false, stored: false, error: "type and summary are required" });
    }
    let stored = false;
    try {
      const response = await gskMCPRequest("/mcp/execute", {
        method: "memory.witness",
        params: {
          content: summary,
          type,
          weight: typeof weight === "number" ? weight : 1,
          tags: ["workbench"],
        },
      }, 8000);
      stored = !(response && response.error);
    } catch {}
    res.json({ success: true, stored });
  } catch (err: any) {
    res.json({ success: true, stored: false, error: err.message });
  }
});

// ─── GSK Mind: thoughts, proposals, injection ───
app.get("/api/gsk/thoughts", async (req, res) => {
  try {
    const response = await gskMCPRequest("/mcp/execute", {
      method: "memory.query",
      params: { type: "mcp_chat", limit: 15 },
    }, 6000);
    const raw = (response as any)?.result?.memories || (response as any)?.memories || [];
    const thoughts = (Array.isArray(raw) ? raw : []).map((m: any) => ({
      type: m.type || "thought",
      summary: String(m.summary ?? m.content ?? m.text ?? "").slice(0, 400),
      timestamp: Number(m.timestamp || m.createdAt || Date.now()),
    }));
    res.json({ success: true, thoughts });
  } catch (err: any) {
    res.json({ success: false, thoughts: [], error: err.message });
  }
});

app.get("/api/gsk/proposals", async (req, res) => {
  try {
    let pending: any = null;
    try {
      pending = await gskMCPRequest("/mcp/execute", { method: "autonomy.pending", params: {} }, 6000);
    } catch {}
    if (!pending || pending.error) {
      try {
        pending = await gskMCPRequest("/mcp/execute", { method: "autonomy.plans", params: {} }, 6000);
      } catch {}
    }
    const raw = (pending as any)?.result?.plans || (pending as any)?.result?.pending || (pending as any)?.result || [];
    const proposals = (Array.isArray(raw) ? raw : []).map((p: any) => ({
      id: p.id || p.plan_id || `prop-${Date.now()}`,
      title: p.title || p.description || p.goal || String(p).slice(0, 120),
      description: p.description || p.goal || "",
      risk: p.risk || "normal",
      status: p.status || "pending",
      createdAt: p.createdAt || p.created_at || null,
    }));
    res.json({ success: true, proposals });
  } catch (err: any) {
    res.json({ success: false, proposals: [], error: err.message });
  }
});

app.post("/api/gsk/proposals/approve", async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: "id required" });
    const r = await gskMCPRequest("/mcp/execute", { method: "autonomy.approve", params: { id } }, 8000);
    res.json({ success: !(r as any)?.error, result: (r as any)?.result || null });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

app.post("/api/gsk/proposals/deny", async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: "id required" });
    const r = await gskMCPRequest("/mcp/execute", { method: "autonomy.deny", params: { id } }, 8000);
    res.json({ success: !(r as any)?.error, result: (r as any)?.result || null });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

app.post("/api/gsk/inject/knowledge", async (req, res) => {
  try {
    const { title, content, url } = req.body || {};
    let body = typeof content === "string" ? content : "";
    if (!body && url) {
      if (!/^https?:\/\//i.test(url)) return res.status(400).json({ success: false, error: "url must be http(s)" });
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const html = await resp.text();
      body = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 20000);
    }
    if (!body || !body.trim()) return res.status(400).json({ success: false, error: "content or url required" });
    const label = title || url || "injected knowledge";
    const stored = { witness: false };
    try {
      const r = await gskMCPRequest("/mcp/execute", {
        method: "memory.witness",
        params: {
          content: `[KNOWLEDGE INJECTION] ${label}\n\n${body.slice(0, 18000)}`,
          type: "knowledge",
          weight: 0.8,
          tags: ["workbench", "injection"],
        },
      }, 10000);
      stored.witness = !(r as any)?.error;
    } catch {}
    res.json({ success: true, stored: stored.witness, chars: body.length, label });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

const SKILLS_DIR = path.join(__dirname, "..", "gsk", "gsk-core", "skills");
app.post("/api/gsk/inject/skill", async (req, res) => {
  try {
    const { name, code } = req.body || {};
    if (typeof name !== "string" || !/^[a-zA-Z0-9_-]{2,48}$/.test(name)) {
      return res.status(400).json({ success: false, error: "name must be 2-48 chars [a-zA-Z0-9_-]" });
    }
    if (typeof code !== "string" || code.length < 10 || code.length > 50000) {
      return res.status(400).json({ success: false, error: "code must be 10-50000 chars" });
    }
    if (!code.includes("module.exports") || !code.includes("execute")) {
      return res.status(400).json({ success: false, error: "skill must export execute (module.exports.execute)" });
    }
    const file = path.join(SKILLS_DIR, `${name}.js`);
    fs.writeFileSync(file, code, "utf8");
    console.log(`[MIND] Skill injected: ${file} (${code.length} bytes)`);
    res.json({ success: true, file: file, name });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

// ─── REAL BACKENDS for formerly-dead endpoints ───
import { createRequire as _cr } from "module";
const _require = _cr(import.meta.url);
const SKILLS_REAL_DIR = path.join(REPO_ROOT, "gsk", "gsk-core", "skills");
const LEDGER_PATH = path.join(REPO_ROOT, "gsk", "data", "gsk", "ledger.jsonl");

app.get("/api/omniroute/health", async (_req, res) => {
  try {
    const r = await fetch(`${OMNIROUTE_URL}/v1/models`, { signal: AbortSignal.timeout(4000) });
    const j = await r.json().catch(() => null);
    const count = Array.isArray(j?.data) ? j.data.length : 0;
    res.json({ success: true, healthy: r.ok && count > 0, models: count });
  } catch (err: any) {
    res.json({ success: false, healthy: false, error: err.message });
  }
});

app.post("/api/agent/chat", async (req, res) => {
  try {
    const { message, profile, skills } = req.body || {};
    if (!message) return res.status(400).json({ success: false, error: "message required" });
    const ctxBits: string[] = [];
    if (profile?.name) ctxBits.push(`agent=${profile.name}`);
    if (Array.isArray(skills) && skills.length) ctxBits.push(`skills=${skills.map((s: any) => s?.name || s?.skill || s).slice(0, 8).join(",")}`);
    const ctx = ctxBits.length ? `[AGENT CONTEXT] ${ctxBits.join(" ")}` : "";
    const gskRes = await gskMCPRequest("/mcp/chat", { message, context: ctx }, 60000);
    const reply = (gskRes as any)?.result?.response || (gskRes as any)?.response || "(silence)";
    res.json({ success: true, text: String(reply), groundingSources: ["gsk-mcp"] });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message });
  }
});

app.post("/api/copilot/chat", async (req, res) => {
  try {
    const { message, history } = req.body || {};
    if (!message) return res.status(400).json({ success: false, error: "message required" });
    const hist = Array.isArray(history) ? history.slice(-5).map((h: any) => `${h.role}: ${h.text}`).join("\n") : "";
    const ctx = `[COPILOT] You are the Architect Copilot assisting a workbench user.${hist ? "\nRecent:\n" + hist : ""}`;
    const gskRes = await gskMCPRequest("/mcp/chat", { message, context: ctx }, 60000);
    const reply = (gskRes as any)?.result?.response || (gskRes as any)?.response || "(silence)";
    res.json({ success: true, text: String(reply) });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message });
  }
});

app.post("/api/agent/compile", async (req, res) => {
  try {
    const { profile, skills } = req.body || {};
    if (!profile || typeof profile !== "object") return res.status(400).json({ success: false, error: "profile required" });
    const name = String(profile.name || "agent").replace(/[^a-zA-Z0-9_-]/g, "_");
    const skillList = Array.isArray(skills) ? skills : [];
    const skillNames = skillList.map((s: any) => s?.name || s?.skill || String(s)).filter(Boolean);
    const node = [
      `// Compiled agent bundle: ${name}`,
      `// Generated by ONE SYSTEM workbench at ${new Date().toISOString()}`,
      `export const AGENT_PROFILE = ${JSON.stringify(profile, null, 2)};`,
      `export const AGENT_SKILLS = ${JSON.stringify(skillNames, null, 2)};`,
      ``,
      `export async function run(input) {`,
      `  console.log(\`[${name}] received: \${input}\`);`,
      `  return { agent: "${name}", skills: AGENT_SKILLS, echo: input };`,
      `}`,
    ].join("\n");
    const py = [
      `# Compiled agent bundle: ${name}`,
      `import json`,
      `AGENT_PROFILE = json.loads(${JSON.stringify(JSON.stringify(profile))})`,
      `AGENT_SKILLS = json.loads(${JSON.stringify(JSON.stringify(skillNames))})`,
      ``,
      `def run(inp):`,
      `    print(f"[${name}] received: {inp}")`,
      `    return {"agent": "${name}", "skills": AGENT_SKILLS, "echo": inp}`,
    ].join("\n");
    const hook = { event: "agent.invoke", agent: name, skills: skillNames, profile, ts: new Date().toISOString() };
    res.json({ success: true, node, python: py, webhookPayload: JSON.stringify(hook) });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

app.post("/api/agent/dispatch-webhook", async (req, res) => {
  try {
    const { url, event, payload } = req.body || {};
    let forwarded = false;
    let httpStatus: number | null = null;
    if (url && /^https?:\/\//i.test(url)) {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, payload, ts: Date.now() }),
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
      forwarded = !!r?.ok;
      httpStatus = r?.status ?? null;
    }
    try {
      await gskMCPRequest("/mcp/execute", {
        method: "memory.witness",
        params: {
          content: `[WEBHOOK DISPATCH] ${event || "manual"} -> ${url || "no-url"} forwarded=${forwarded}`,
          type: "webhook_log",
          weight: 0.5,
          tags: ["workbench", "webhook"],
        },
      }, 6000);
    } catch {}
    res.json({ success: true, forwarded, httpStatus });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

function makeBundleZip(profile: any, skills: any): Buffer {
  const tmp = path.join(REPO_ROOT, ".bundle-tmp-" + Date.now());
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, "agent-profile.json"), JSON.stringify(profile ?? {}, null, 2));
  fs.writeFileSync(path.join(tmp, "README.txt"), `ONE SYSTEM agent bundle\nGenerated: ${new Date().toISOString()}\nSkills: ${(skills ?? []).length}\n`);
  const out = tmp + ".zip";
  execSync(`tar -a -c -f "${out}" -C "${tmp}" .`);
  const buf = fs.readFileSync(out);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(out, { force: true });
  return buf;
}

app.post("/api/agent/download-zip", (req, res) => {
  try {
    const { profile, skills } = req.body || {};
    const buf = makeBundleZip(profile, skills);
    const name = String((profile as any)?.name || "agent-bundle").replace(/[^a-zA-Z0-9_-]/g, "_");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${name}.zip"`);
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/agent/download-zip", (req, res) => {
  try {
    const buf = makeBundleZip({}, []);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="agent-bundle.zip"');
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/agent/execute-capability", async (req, res) => {
  try {
    const name = String((req.body || {}).skill || (req.body || {}).name || "");
    const input = String((req.body || {}).input ?? "");
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) return res.status(400).json({ success: false, error: "invalid skill name" });
    const file = path.join(SKILLS_REAL_DIR, name + ".js");
    if (!fs.existsSync(file)) return res.status(404).json({ success: false, error: `skill not found: ${name}` });
    delete _require.cache[_require.resolve(file)];
    const mod = _require(file);
    if (typeof mod.execute !== "function") return res.status(400).json({ success: false, error: "skill has no execute()" });
    const result = await Promise.race([
      mod.execute(input),
      new Promise((_res) => setTimeout(() => _res("[timeout after 10s]"), 10000)),
    ]);
    res.json({ success: true, skill: name, result: String(result) });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

function seedToSvg(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13; return ((h >>> 0) % 1000) / 1000; };
  const hue = Math.floor(rnd() * 360);
  const shapes = Array.from({ length: 7 }, () => {
    const cx = Math.floor(rnd() * 200), cy = Math.floor(rnd() * 200), r = 20 + Math.floor(rnd() * 60);
    const h2 = (hue + Math.floor(rnd() * 120)) % 360;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="hsl(${h2},70%,55%)" opacity="0.35"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="hsl(${hue},30%,10%)"/>${shapes}<circle cx="100" cy="100" r="52" fill="none" stroke="hsl(${(hue + 60) % 360},80%,65%)" stroke-width="4"/></svg>`;
}

app.get("/api/agent/generate-avatar", (req, res) => {
  const seed = String(req.query.seed || req.query.profile || "gsk");
  const svg = seedToSvg(seed);
  res.json({ success: true, seed, svg, dataUri: "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64") });
});

app.post("/api/agent/generate-avatar", (req, res) => {
  const seed = String((req.body || {}).seed || (req.body || {}).profile || "gsk");
  const svg = seedToSvg(seed);
  res.json({ success: true, seed, svg, dataUri: "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64") });
});

app.get("/api/marketplace/posts", async (_req, res) => {
  try {
    const r = await gskMCPRequest("/mcp/execute", { method: "memory.query", params: { type: "soul_market_post", limit: 20 } }, 6000);
    const raw = (r as any)?.result?.memories || (r as any)?.result || [];
    res.json({ success: true, posts: Array.isArray(raw) ? raw : [] });
  } catch (err: any) {
    res.json({ success: false, posts: [], error: err.message });
  }
});

app.post("/api/marketplace/post", async (req, res) => {
  try {
    const { title, description, price } = req.body || {};
    if (!title) return res.status(400).json({ success: false, error: "title required" });
    const stored = { ok: false };
    try {
      const r = await gskMCPRequest("/mcp/execute", {
        method: "memory.witness",
        params: {
          content: `[SOUL MARKET LISTING] ${title} :: ${description || ""} :: price=${price ?? "negotiable"}`,
          type: "soul_market_post",
          weight: 0.7,
          tags: ["workbench", "marketplace"],
        },
      }, 8000);
      stored.ok = !(r as any)?.error;
    } catch {}
    res.json({ success: true, stored: stored.ok });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/api/audit-integrity", async (_req, res) => {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
  const probe = async (name: string, fn: () => Promise<{ ok: boolean; detail: string }>) => {
    try { checks.push({ name, ...(await fn()) }); }
    catch (e: any) { checks.push({ name, ok: false, detail: e.message }); }
  };
  await probe("gsk-mcp", async () => {
    const r = await fetch(`${GSK_MCP_URL}/mcp/health`, { signal: AbortSignal.timeout(3000) });
    return { ok: r.ok, detail: `HTTP ${r.status}` };
  });
  await probe("omniroute", async () => {
    const r = await fetch(`${OMNIROUTE_URL}/v1/models`, { signal: AbortSignal.timeout(3000) });
    const j = await r.json().catch(() => null);
    return { ok: r.ok && Array.isArray(j?.data) && j.data.length > 0, detail: `${j?.data?.length ?? 0} models` };
  });
  await probe("cpl", async () => {
    const r = await fetch(`${CPL_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return { ok: r.ok, detail: `HTTP ${r.status}` };
  });
  await probe("soul-ledger", async () => {
    const stat = fs.existsSync(LEDGER_PATH) ? fs.statSync(LEDGER_PATH) : null;
    return { ok: !!stat && stat.size > 0, detail: stat ? `${Math.round(stat.size / 1024)}KB` : "missing" };
  });
  await probe("skills-dir", async () => {
    const n = fs.readdirSync(SKILLS_REAL_DIR).filter((f) => f.endsWith(".js")).length;
    return { ok: n > 0, detail: `${n} skills` };
  });
  await probe("catalog", async () => {
    const cat = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "soul-economy", "data", "catalog.json"), "utf8"));
    const n = Array.isArray(cat) ? cat.length : Object.keys(cat).length;
    return { ok: n > 0, detail: `${n} items` };
  });
  const score = Math.round((checks.filter((c) => c.ok).length / Math.max(checks.length, 1)) * 100);
  res.json({ success: true, score, checks, verdict: score === 100 ? "FULLY OPERATIONAL" : score >= 70 ? "DEGRADED" : "CRITICAL" });
});

app.get("/api/soul-ledger", (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || "30"), 10) || 30, 200);
    if (!fs.existsSync(LEDGER_PATH)) return res.json({ success: true, entries: [] });
    const lines = fs.readFileSync(LEDGER_PATH, "utf8").trim().split("\n").slice(-limit);
    const entries = lines.map((l) => { try { return JSON.parse(l); } catch { return { raw: l }; } });
    res.json({ success: true, entries: entries.reverse() });
  } catch (err: any) {
    res.json({ success: false, entries: [], error: err.message });
  }
});

app.get("/api/gsk/recall", async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  if (!q) return res.status(400).json({ success: false, results: [], error: "q required" });
  let results: any[] | null = null;
  try {
    const r = await gskMCPRequest("/mcp/execute", { method: "memory.search", params: { query: q, limit: 8 } }, 4000);
    const raw = (r as any)?.result;
    if (Array.isArray(raw)) results = raw;
  } catch {}
  if (!results) {
    try {
      const lines = fs.readFileSync(LEDGER_PATH, "utf8").trim().split("\n").slice(-800);
      results = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter((e: any) => e && String(e.content ?? "").toLowerCase().includes(q))
        .slice(-8)
        .map((e: any) => ({ id: e.id, timestamp: e.timestamp, type: e.type, content: String(e.content).slice(0, 400), source: "ledger" }));
    } catch (err: any) {
      return res.json({ success: false, results: [], error: err.message });
    }
  }
  res.json({ success: true, results });
});

const FORGE_DIR = path.join(__dirname, "public", "artifacts");
fs.mkdirSync(FORGE_DIR, { recursive: true });

app.post("/api/gsk/forge", async (req, res) => {
  try {
    const { prompt, previousCode, fixNote } = req.body || {};
    if (!prompt || typeof prompt !== "string") return res.status(400).json({ success: false, error: "prompt required" });
    let instruction = [
      "You are GSK FORGE, master builder. Build ONE self-contained interactive HTML artifact.",
      "RULES: single file, inline CSS and JS only, no external imports or CDNs except three.js via https://unpkg.com/three@0.160.0/build/three.min.js if 3D is needed.",
      "It must run standalone in an iframe and look visually striking.",
      `REQUEST: ${prompt}`,
      "Respond with the COMPLETE html between <artifact> and </artifact> tags. No commentary outside the tags.",
    ].join(" ");
    if (previousCode) {
      instruction += ` Your PREVIOUS attempt had this problem: ${fixNote || "render failure"}. Previous code:\n${String(previousCode).slice(0, 8000)}\nReturn the FULL corrected artifact.`;
    }
    const gskRes = await gskMCPRequest("/mcp/chat", { message: instruction, context: "[FORGE BUILD MODE]" }, 90000);
    const reply = String((gskRes as any)?.result?.response || (gskRes as any)?.response || "");
    let code = "";
    const tagMatch = reply.match(/<artifact>([\s\S]*?)<\/artifact>/i);
    if (tagMatch) {
      code = tagMatch[1].trim();
    } else {
      const fence = reply.match(/```(?:html)?\s*([\s\S]*?)```/i);
      if (fence && /<html|<!doctype|<div|<canvas|<script/i.test(fence[1])) {
        code = fence[1].trim();
      } else if (/<html|<!doctype/i.test(reply)) {
        const h = reply.indexOf("<"); 
        code = reply.slice(h).trim();
      }
    }
    if (!code || code.length < 40) {
      return res.json({ success: false, error: "GSK did not produce a valid artifact", raw: reply.slice(0, 500) });
    }
    if (!/<script|<style|<div|<canvas|<body/i.test(code)) {
      return res.json({ success: false, error: "artifact lacks executable structure", raw: reply.slice(0, 300) });
    }
    const id = `forge_${Date.now().toString(36)}`;
    const file = path.join(FORGE_DIR, `${id}.html`);
    fs.writeFileSync(file, code, "utf8");
    console.log(`[FORGE] Artifact built by GSK: ${id}.html (${code.length} bytes)`);
    res.json({ success: true, id, url: `/artifacts/${id}.html`, bytes: code.length });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/api/gsk/artifacts", (req, res) => {
  try {
    const files = fs.readdirSync(FORGE_DIR).filter((f) => f.endsWith(".html")).sort().reverse();
    const artifacts = files.slice(0, 24).map((f) => {
      const p = path.join(FORGE_DIR, f);
      const st = fs.statSync(p);
      let title: string = f;
      try {
        const head = fs.readFileSync(p, "utf8").slice(0, 2000);
        const m = head.match(/<title>([^<]+)<\/title>/i);
        if (m) title = m[1];
      } catch {}
      return { id: f.replace(/\.html$/, ""), url: `/artifacts/${f}`, bytes: st.size, created: st.mtimeMs, title };
    });
    res.json({ success: true, artifacts });
  } catch (err: any) {
    res.json({ success: false, artifacts: [], error: err.message });
  }
});

app.delete("/api/gsk/artifacts/:name", (req, res) => {
  try {
    const name = String(req.params.name || "").replace(/[^a-zA-Z0-9_.\-]/g, "");
    if (!name.endsWith(".html")) return res.status(400).json({ success: false, error: "invalid artifact name" });
    const file = path.join(FORGE_DIR, name);
    if (!fs.existsSync(file)) return res.status(404).json({ success: false, error: "not found" });
    fs.rmSync(file);
    res.json({ success: true, deleted: name });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/artifacts/:name", (req, res) => {
  const name = String(req.params.name || "").replace(/[^a-zA-Z0-9_.\-]/g, "");
  const file = path.join(FORGE_DIR, name);
  if (!fs.existsSync(file)) return res.status(404).send("artifact not found");
  res.setHeader("Content-Type", "text/html");
  res.send(fs.readFileSync(file, "utf8"));
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

function findGskDaemonPids(): number[] {
  try {
    const out = execSync('wmic process where "commandline like \'%gsk_daemon.js%\'" get processid', { encoding: "utf8", timeout: 8000 });
    return out.split(/\r?\n/).map((l) => parseInt(l.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
  } catch { return []; }
}

async function gskHealthy(timeoutMs = 2500): Promise<boolean> {
  try {
    const r = await fetch(`${GSK_MCP_URL}/mcp/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok;
  } catch { return false; }
}

function sleepMs(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

function findGskPortOwner(): number | null {
  try {
    const out = execSync("netstat -ano | findstr :3001 | findstr LISTENING", { encoding: "utf8", timeout: 8000 });
    const m = out.trim().split(/\r?\n/)[0]?.trim().split(/\s+/).pop();
    const pid = parseInt(m || "", 10);
    return isNaN(pid) ? null : pid;
  } catch { return null; }
}

async function startGSK(): Promise<void> {
  if (gskProcess && !gskProcess.killed) {
    console.log("[GSK] Already running (our child)");
    return;
  }
  console.log("[GSK] Starting (Brain)... with anti-race sweep");
  // ANTI-SPAWN-RACE: a previous workbench may have left orphan daemons.
  // Adopt ONLY the port owner if healthy; cull every other twin. Never spawn a duplicate.
  let existing = findGskDaemonPids();
  if (existing.length > 0) {
    const owner = findGskPortOwner();
    if (owner && await gskHealthy()) {
      console.log(`[GSK] Adopted port-owner daemon ${owner} (no spawn)`);
      serviceStatus.gsk.running = true;
      serviceStatus.gsk.pid = owner;
      for (const pid of existing.filter((p) => p !== owner)) {
        console.log(`[GSK] Culling orphan twin ${pid}`);
        try { execSync(`taskkill /F /PID ${pid}`, { timeout: 6000 }); } catch {}
      }
      return;
    }
    console.log(`[GSK] Culling unhealthy/stale daemon(s): ${existing.join(", ")}`);
    for (const pid of existing) {
      try { execSync(`taskkill /F /PID ${pid}`, { timeout: 6000 }); } catch {}
    }
    for (let i = 0; i < 10 && findGskDaemonPids().length > 0; i++) await sleepMs(500);
    existing = [];
  }
  const gskPath = path.join(REPO_ROOT, "gsk");
  try {
    ensureDeps(gskPath, "GSK");
  } catch (e: any) {
    console.error("[GSK] Dependency growth failed:", e.message);
    return;
  }
  const env = {
    ...process.env,
    GSK_ROOT: gskPath,
    GSK_PROJECT_ROOTS: `${REPO_ROOT};${gskPath}`,
    NINE_ROUTER_URL: OMNIROUTE_URL,
    NINE_ROUTER_API_KEY: process.env.NINE_ROUTER_API_KEY || "",
    MCP_API_KEY: GSK_MCP_KEY,
    GSK_MODEL: "auto/best-fast",
    GSK_BRAIN_MODEL: "auto/best-fast",
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
  // Health-verified startup instead of blind wait
  for (let i = 0; i < 25; i++) {
    await sleepMs(1000);
    if (await gskHealthy(1500)) {
      console.log(`[GSK] Healthy after ${i + 1}s (pid ${serviceStatus.gsk.pid})`);
      return;
    }
  }
  console.warn("[GSK] Spawned but health not confirmed within 25s");
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
