'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');

let mainWindow;
let omnirouteProcess = null;
let omniroutePid = null;

const OMNIROUTE_PORT = 20128;
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
  // Check if Omniroute is already running on port 20128
  const isPortInUse = await checkPort(OMNIROUTE_PORT);
  const existingPids = getOmniPids();
  
  if (isPortInUse && existingPids.length > 0) {
    console.log('[FAMILY] Omniroute already running, adopting existing blood flow');
    omniroutePid = existingPids[0];
    return { adopted: true, pid: omniroutePid };
  }
  
  // Try to start Omniroute from global install
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
    console.log('[FAMILY] Omniroute not found in global install, will use local mode');
    return { adopted: false, pid: null };
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'BUYASOUL Workbench',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  const indexPath = path.join(__dirname, 'dist', 'index.html');
  mainWindow.loadFile(indexPath);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Initialize Omniroute (blood flow) FIRST
  await initializeOmniroute();
  
  // Initialize family systems
  await initializeFamily();
  
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
    omnirouteProcess.kill();
  }
  shutdownFamily();
  if (process.platform !== 'darwin') {
    app.quit();
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