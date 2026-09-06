'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');

let mainWindow;
let omnirouteProcess = null;
let omniroutePid = null;
let workbenchProcess = null;

const OMNIROUTE_PORT = 20128;
const WORKBENCH_PORT = 3000;
const OMNIROUTE_DIR = path.join(__dirname, '..', '..', '..', '..', 'omniroute'); // Global install location

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

function getOmniPids() {
  try {
    const output = spawn.sync('wmic', ['process', 'where', '"commandline like \'%omniroute%\' or commandline like \'%run-next.mjs%\'"', 'get', 'processid'], { 
      encoding: 'utf8', 
      timeout: 8000,
      shell: true 
    });
    return output.stdout.split(/\r?\n/).map(l => parseInt(l.trim(), 10)).filter(n => !isNaN(n) && n > 0);
  } catch { return []; }
}

async function initializeOmniroute() {
  // Check if Omniroute is already running on port 20128 — ADOPT BLOOD, NEVER KILL
  const isPortInUse = await checkPort(OMNIROUTE_PORT);
  const existingPids = getOmniPids();
  
  if (isPortInUse && existingPids.length > 0) {
    updateLoading('OmniRoute blood flow already alive — adopting...');
    console.log('[FAMILY] Omniroute already running, adopting existing blood flow');
    omniroutePid = existingPids[0];
    return { adopted: true, pid: omniroutePid };
  }
  
  // Try to start Omniroute from global install
  updateLoading('Starting OmniRoute blood flow...');
  console.log('[FAMILY] Starting Omniroute (blood flow)...');
  
  // Check common locations
  const possiblePaths = [
    path.join(process.env.APPDATA, 'npm', 'node_modules', 'omniroute'),
    path.join(process.env.LOCALAPPDATA, 'npm', 'node_modules', 'omniroute'),
    'C:\\Users\\uncom\\AppData\\Roaming\\npm\\node_modules\\omniroute',
  ];
  
  let omnirouteRoot = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(path.join(p, 'package.json'))) {
      omnirouteRoot = p;
      break;
    }
  }
  
  if (!omnirouteRoot) {
    updateLoading('OmniRoute not found — installing (first setup, one time)...');
    console.log('[FAMILY] Omniroute not found — auto-installing (first setup)...');
    try {
      const { execSync } = require('child_process');
      execSync('npm install -g omniroute', { stdio: 'inherit', timeout: 120000 });
      // Re-check after install
      for (const p of possiblePaths) {
        if (fs.existsSync(path.join(p, 'package.json'))) { omnirouteRoot = p; break; }
      }
      if (!omnirouteRoot) throw new Error('install did not create omniroute dir');
      updateLoading('OmniRoute installed — starting...');
    } catch (e) {
      console.log('[FAMILY] Omniroute auto-install failed:', e.message, '— continuing without it, workbench will still load');
      updateLoading('OmniRoute install failed — workbench will load without it');
      return { adopted: false, pid: null };
    }
  }
  
  console.log(`[FAMILY] Starting Omniroute from: ${omnirouteRoot}`);
  
  // Start Omniroute
  omnirouteProcess = spawn('npm', ['start'], {
    cwd: omnirouteRoot,
    stdio: 'inherit',
    shell: true,
    detached: false,
    env: { ...process.env, OMNIROUTE_ALREADY_UP: '1' }
  });
  
  omnirouteProcess.on('error', (err) => {
    console.log('[FAMILY] Omniroute start error:', err.message);
  });
  
  // Give it time to start
  await new Promise(r => setTimeout(r, 5000));
  
  console.log('[FAMILY] Omniroute started');
  return { adopted: false, pid: omnirouteProcess.pid };
}

async function initializeWorkbench() {
  const isUp = await checkPort(WORKBENCH_PORT);
  if (!isUp) {
    console.log('[FAMILY] Starting workbench server.ts on :3000...');
    const workbenchDir = __dirname;
    workbenchProcess = spawn('npx', ['tsx', 'server.ts'], {
      cwd: workbenchDir,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, OMNIROUTE_ALREADY_UP: '1' }
    });
    workbenchProcess.on('error', (err) => console.log('[FAMILY] Workbench start error:', err.message));
    // Wait for :3000 to be up (up to 30s)
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (await checkPort(WORKBENCH_PORT)) {
        console.log('[FAMILY] Workbench live on :3000');
        break;
      }
    }
  } else {
    console.log('[FAMILY] Workbench :3000 already live — adopting');
  }
}

let loadingWindow = null;

function createLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 480,
    height: 320,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    center: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  const html = `
    <html><head><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{background:#05050c;color:#fff;font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center}
      h1{font-size:28px;letter-spacing:4px;background:linear-gradient(90deg,#ff2d9e,#00d4ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:900}
      .sub{color:#888;font-size:11px;letter-spacing:2px;margin-top:6px}
      .bar{width:260px;height:3px;background:#1a1a2e;border-radius:99px;margin-top:20px;overflow:hidden}
      .fill{height:100%;background:linear-gradient(90deg,#ff2d9e,#00d4ff);width:0%;animation:fill 2s ease-in-out infinite}
      .status{color:#ff2d9e;font-size:10px;margin-top:10px;font-family:monospace}
      @keyframes fill{0%{width:0%}50%{width:100%}100%{width:0%}}
    </style></head><body>
      <h1>BUYASOUL</h1><div class="sub">PROFIT ♡ LOVE TAX — THE FAMILY IS AWAKENING</div>
      <div class="bar"><div class="fill"></div></div>
      <div class="status" id="status">Loading workbench...</div>
      <script>
        const { ipcRenderer } = require('electron');
        ipcRenderer.on('loading-status', (e, msg)=>{ document.getElementById('status').innerText = msg; });
      </script>
    </body></html>`;
  loadingWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  loadingWindow.show();
}

function updateLoading(msg) {
  console.log('[LOADING] ' + msg);
  if (loadingWindow && !loadingWindow.isDestroyed()) {
    loadingWindow.webContents.send('loading-status', msg);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'BUYASOUL — The Profit LoveTax Family',
    icon: path.join(__dirname, 'public', 'icon.ico'),
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  // LIVE MODE: load from workbench server so /api/* polling works (file:// has no server)
  const workbenchUrl = `http://127.0.0.1:${WORKBENCH_PORT}`;
  console.log(`[FAMILY] Loading ${workbenchUrl}`);
  mainWindow.loadURL(workbenchUrl).catch(() => {
    console.log('[FAMILY] Workbench URL failed, falling back to file');
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  });

  mainWindow.once('ready-to-show', () => {
    if (loadingWindow && !loadingWindow.isDestroyed()) loadingWindow.close();
    mainWindow.show();
    mainWindow.maximize();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  createLoadingWindow();
  updateLoading('Waking OmniRoute blood flow...');
  // Initialize Omniroute (blood flow) FIRST — adopt or auto-install
  await initializeOmniroute();
  
  updateLoading('Breathing Seshat + Scribe into memory...');
  // Initialize family systems (Seshat/Scribe in-process)
  await initializeFamily();

  updateLoading('Building workbench — Profit Love Tax family...');
  // Start workbench server so polling /api/* is live
  await initializeWorkbench();
  
  updateLoading('Workbench live — opening family...');
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't kill adopted Omniroute
  if (omnirouteProcess && !process.env.OMNIROUTE_ALREADY_UP) {
    try { omnirouteProcess.kill(); } catch {}
  }
  if (workbenchProcess) {
    try { workbenchProcess.kill(); } catch {}
  }
  shutdownFamily();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers for Seshat
ipcMain.handle('seshat-search', async (event, { query, topK = 10 }) => {
  try {
    const { hybridSearch } = require('./profit-brain/body/seshat/core/index.js');
    const results = await hybridSearch(query, topK);
    return { results };
  } catch (err) {
    console.error('[SESHAT] Search error:', err.message);
    return { results: [], error: err.message };
  }
});

ipcMain.handle('seshat-reason', async (event, { prompt, context }) => {
  try {
    const { think } = require('./profit-brain/body/seshat/core/index.js');
    const result = await think(prompt, context);
    return { response: result, text: result };
  } catch (err) {
    console.error('[SESHAT] Reason error:', err.message);
    return { response: 'Error: ' + err.message, error: err.message };
  }
});

ipcMain.handle('seshat-synthesize', async (event, { topic, sources }) => {
  try {
    const { synthesize } = require('./profit-brain/body/seshat/core/index.js');
    const result = await synthesize(topic, sources);
    return { synthesized: result, result: result };
  } catch (err) {
    console.error('[SESHAT] Synthesize error:', err.message);
    return { synthesized: 'Error: ' + err.message, error: err.message };
  }
});

// Initialize ALL family systems in-process
async function initializeFamily() {
  try {
    const { initLLM } = require('./profit-brain/body/seshat/core/llm');
    const { initVectorDB } = require('./profit-brain/body/seshat/core/vectorDB');
    const { initEmbedder } = require('./profit-brain/body/seshat/core/embedder');
    const { init: initScribe } = require('./profit-brain/body/scribe-module');
    
    console.log('[FAMILY] Initializing...');
    
    await initVectorDB();
    console.log('[FAMILY] Vector DB ready');
    
    await initEmbedder();
    console.log('[FAMILY] Embedder ready');
    
    await initLLM();
    console.log('[FAMILY] Seshat ALLM ready');
    
    await initScribe({ observe: true });
    console.log('[FAMILY] Scribe ready');
    
    console.log('[FAMILY] All systems initialized');
  } catch (err) {
    console.log('[FAMILY] Init warning:', err.message);
  }
}

function shutdownFamily() {
  console.log('[FAMILY] Shutting down...');
}