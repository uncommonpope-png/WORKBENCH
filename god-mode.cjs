#!/usr/bin/env node
/*
 * god-mode.cjs — God Mode: Market Intelligence Engine
 *
 * Written for the WORKBENCH "God Mode — Market Intelligence Engine" workflow
 * (.github/workflows/god-mode.yml), which runs:  node god-mode.cjs
 *
 * Contract (from the workflow):
 *   env: XAI_API_KEY (optional), REPORT_DIR (workspace), CYCLE (full|quick)
 *   outputs in REPORT_DIR:
 *     god-mode-<YYYY-MM-DD_HHmm>.json   (dated scan, committed by the workflow)
 *     god-mode-latest.json              (same content; read by the summary step)
 *   summary step reads: sources.liveSources, totalProducts, trends[], gaps[]
 *
 * Zero dependencies: Node 18+ built-ins and global fetch only (the workflow
 * runs `npm init -y` and installs nothing).
 *
 * Behaviour: scans public, keyless sources for products in the watchlist
 * topics, extracts trends from titles/descriptions, flags low-supply topics
 * as gaps, and — when XAI_API_KEY is present — asks the xAI API for a short
 * analyst read. Any source or AI failure is recorded in the report, never
 * fatal: the job only fails if the report itself cannot be written.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPORT_DIR = process.env.REPORT_DIR || process.cwd();
const CYCLE = (process.env.CYCLE || 'full').toLowerCase() === 'quick' ? 'quick' : 'full';
const XAI_API_KEY = process.env.XAI_API_KEY || '';
const XAI_MODEL = process.env.XAI_MODEL || 'grok-4-latest';
const FETCH_TIMEOUT_MS = 12000;
const GAP_THRESHOLD = 500; // GitHub total_count below this = low-supply topic

// Watchlist: the markets this engine watches. Edit freely — one topic per line.
const TOPICS = [
  'ai soul',
  'ai companion',
  'system prompt library',
  'ai agent',
  'designer plush',
  'collectible plush',
  'plush toy',
];

const STOPWORDS = new Set((
  'the a an and or of for to in on with by from at as is are was were be been ' +
  'ai llm gpt openai api app web use using used user users tool tools free ' +
  'based your you it its this that these those build built make made get ' +
  'github com http https www io dev new all one two first more most other'
).split(/\s+/));

function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}_${p(date.getUTCHours())}${p(date.getUTCMinutes())}`;
}

async function fetchJson(url, headers = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'god-mode-market-intelligence/1.0', ...headers },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// --- Source 1: GitHub repository search, one query per watchlist topic ------
async function scanGitHub() {
  const perTopic = CYCLE === 'quick' ? 3 : 5;
  const products = [];
  const topicCounts = {};
  for (const topic of TOPICS) {
    const q = encodeURIComponent(`${topic} in:name,description`);
    const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${perTopic}`;
    const data = await fetchJson(url, { Accept: 'application/vnd.github+json' });
    topicCounts[topic] = typeof data.total_count === 'number' ? data.total_count : 0;
    for (const repo of data.items || []) {
      products.push({
        source: 'github',
        topic,
        name: repo.full_name,
        description: repo.description || '',
        stars: repo.stargazers_count || 0,
        url: repo.html_url,
        updatedAt: repo.updated_at || null,
      });
    }
  }
  return { products, topicCounts };
}

// --- Source 2: Hacker News front page (titles scanned for topic terms) -----
async function scanHackerNews() {
  const limit = CYCLE === 'quick' ? 30 : 60;
  const ids = await fetchJson('https://hacker-news.firebaseio.com/v0/topstories.json');
  const top = (ids || []).slice(0, limit);
  const titles = [];
  for (const id of top) {
    try {
      const item = await fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      if (item && item.title) titles.push(item.title);
    } catch {
      // one dead story never sinks the scan
    }
  }
  return { titles };
}

// --- Analysis ----------------------------------------------------------------
function extractTrends(products, hnTitles) {
  const freq = new Map();
  const bump = (text) => {
    for (const raw of String(text).toLowerCase().split(/[^a-z0-9+#.-]+/)) {
      const w = raw.replace(/^[.-]+|[.-]+$/g, '');
      if (w.length < 3 || STOPWORDS.has(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  };
  for (const p of products) { bump(p.name); bump(p.description); }
  for (const t of hnTitles) bump(t);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([term]) => term);
}

function extractGaps(topicCounts) {
  return Object.entries(topicCounts)
    .filter(([, count]) => count < GAP_THRESHOLD)
    .sort((a, b) => a[1] - b[1])
    .map(([topic]) => topic);
}

async function aiAnalyst(report) {
  if (!XAI_API_KEY) return { engine: 'local-heuristics', note: 'XAI_API_KEY not set; trends and gaps computed locally.' };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    let res;
    try {
      res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: XAI_MODEL,
          messages: [
            { role: 'system', content: 'You are a market intelligence analyst. Answer in at most 5 short bullet points. No hype, no invented numbers.' },
            {
              role: 'user',
              content:
                `Scan results — products found: ${report.totalProducts}. ` +
                `Trending terms: ${report.trends.join(', ')}. ` +
                `Low-supply topics (few public projects): ${report.gaps.join(', ') || 'none'}. ` +
                `Top products: ${report.products.slice(0, 8).map((p) => `${p.name} (${p.stars} stars)`).join('; ')}. ` +
                'Give the market read: what is heating up, where the gaps are, and one risk.',
            },
          ],
        }),
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    if (!text) throw new Error('empty response');
    return { engine: 'xai', model: XAI_MODEL, read: text };
  } catch (err) {
    return { engine: 'local-heuristics', note: `xAI analyst unavailable (${err.message}); trends and gaps computed locally.` };
  }
}

// --- Main --------------------------------------------------------------------
(async () => {
  const startedAt = new Date();
  const sourceDetail = [];
  let products = [];
  let topicCounts = {};
  let hnTitles = [];

  try {
    const gh = await scanGitHub();
    products = gh.products;
    topicCounts = gh.topicCounts;
    sourceDetail.push({ name: 'github-search', ok: true, items: products.length });
  } catch (err) {
    sourceDetail.push({ name: 'github-search', ok: false, items: 0, error: err.message });
  }

  try {
    const hn = await scanHackerNews();
    hnTitles = hn.titles;
    sourceDetail.push({ name: 'hacker-news', ok: true, items: hnTitles.length });
  } catch (err) {
    sourceDetail.push({ name: 'hacker-news', ok: false, items: 0, error: err.message });
  }

  // De-duplicate products across topics, keep the highest-star copy.
  const byUrl = new Map();
  for (const p of products) {
    const prev = byUrl.get(p.url);
    if (!prev || p.stars > prev.stars) byUrl.set(p.url, p);
  }
  products = [...byUrl.values()].sort((a, b) => b.stars - a.stars);

  const report = {
    engine: 'God Mode — Market Intelligence Engine',
    generatedAt: startedAt.toISOString(),
    cycle: CYCLE,
    sources: {
      liveSources: sourceDetail.filter((s) => s.ok).length,
      totalSources: sourceDetail.length,
      detail: sourceDetail,
    },
    topicCounts,
    totalProducts: products.length,
    products,
    trends: extractTrends(products, hnTitles),
    gaps: extractGaps(topicCounts),
    analysis: null,
  };
  report.analysis = await aiAnalyst(report);

  const datedName = `god-mode-${stamp(startedAt)}.json`;
  const body = JSON.stringify(report, null, 2) + '\n';
  fs.writeFileSync(path.join(REPORT_DIR, datedName), body);
  fs.writeFileSync(path.join(REPORT_DIR, 'god-mode-latest.json'), body);

  console.log(`god-mode: ${report.totalProducts} products from ${report.sources.liveSources}/${report.sources.totalSources} sources`);
  console.log(`god-mode: trends: ${report.trends.join(', ') || 'none'}`);
  console.log(`god-mode: gaps: ${report.gaps.join(', ') || 'none'}`);
  console.log(`god-mode: wrote ${datedName} + god-mode-latest.json to ${REPORT_DIR}`);
})().catch((err) => {
  // Only an unwritable report fails the job; everything else is in the report.
  console.error(`god-mode: fatal — ${err.stack || err.message}`);
  process.exit(1);
});
