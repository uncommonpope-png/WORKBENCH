'use strict';

/**
 * SESHAT READER — Reads the Logseq second brain
 * Zero tokens. Pure file reads. Local knowledge.
 * 
 * Reads: pages/, journals/, soul profiles, PLT doctrine, GSK architecture docs
 * Used by: perpetual_consciousness, fusion-loader, system prompt compiler
 */

const fs = require('fs');
const path = require('path');

const SESHAT_ROOT = process.env.SESHAT_PATH || 'C:\\Users\\uncom\\Desktop\\seshat-second-brain';
const BRAIN_IN_A_BOX = process.env.BRAIN_IN_A_BOX_PATH || 'C:\\Users\\uncom\\Desktop\\brain-in-a-box';

class SeshatReader {
    constructor(options = {}) {
        this.root = options.root || SESHAT_ROOT;
        this.brainInABox = options.brainInABox || BRAIN_IN_A_BOX;
        this.pagesDir = path.join(this.root, 'pages');
        this.journalsDir = path.join(this.root, 'journals');
        this._pageCache = new Map();
        this._index = null;
        this._lastIndexTime = 0;
        this._indexTTL = 60000; // re-index every 60s
    }

    // ═══════════════════════════════════════════════════════════
    // INDEX — Build a searchable index of all pages
    // ═══════════════════════════════════════════════════════════

    _buildIndex() {
        if (this._index && (Date.now() - this._lastIndexTime) < this._indexTTL) {
            return this._index;
        }

        const index = { pages: {}, categories: {}, keywords: {} };

        // Index pages
        try {
            const files = fs.readdirSync(this.pagesDir).filter(f => f.endsWith('.md'));
            for (const file of files) {
                const name = file.replace('.md', '');
                const filePath = path.join(this.pagesDir, file);
                const stat = fs.statSync(filePath);
                const content = this._readFileSafe(filePath);
                
                index.pages[name] = {
                    name,
                    path: filePath,
                    size: stat.size,
                    modified: stat.mtime,
                    // Extract first 200 chars as summary
                    summary: content ? content.substring(0, 200).replace(/[#*\[\]]/g, '').trim() : '',
                    // Extract tags/categories from filename
                    category: this._categorizePage(name),
                    // Word count for sizing
                    wordCount: content ? content.split(/\s+/).length : 0
                };
            }
        } catch (e) {
            console.log('[SESHAT] Pages directory not found:', this.pagesDir);
        }

        // Index journals
        try {
            const files = fs.readdirSync(this.journalsDir).filter(f => f.endsWith('.md'));
            for (const file of files) {
                const name = file.replace('.md', '');
                index.pages[`journal:${name}`] = {
                    name,
                    path: path.join(this.journalsDir, file),
                    category: 'journal',
                    isJournal: true
                };
            }
        } catch (e) {
            console.log('[SESHAT] Journals directory not found:', this.journalsDir);
        }

        // Index brain-in-a-box content
        try {
            const contentLib = path.join(this.brainInABox, 'content', 'content-library.json');
            if (fs.existsSync(contentLib)) {
                const data = JSON.parse(fs.readFileSync(contentLib, 'utf-8'));
                index.contentLibrary = data;
            }
        } catch (e) { /* optional */ }

        try {
            const pltInsights = path.join(this.brainIn_A_Box || this.brainInABox, 'data', 'plt-insights.json');
            if (fs.existsSync(pltInsights)) {
                index.pltInsights = JSON.parse(fs.readFileSync(pltInsights, 'utf-8'));
            }
        } catch (e) { /* optional */ }

        this._index = index;
        this._lastIndexTime = Date.now();
        return index;
    }

    _categorizePage(name) {
        const lower = name.toLowerCase();
        if (lower.startsWith('gsk-') || lower.startsWith('redbutton')) return 'gsk-architecture';
        if (lower.startsWith('cpl') || lower.includes('spatial') || lower.includes('dark-city')) return 'cpl-spatial';
        if (lower.includes('soul') || lower.includes('consciousness')) return 'consciousness';
        if (lower.includes('plt') || lower.includes('profit')) return 'plt-doctrine';
        if (lower.includes('skill') || lower.includes('tool')) return 'skills';
        if (lower.includes('market') || lower.includes('compete')) return 'market';
        if (lower.includes('decision') || lower.includes('governance')) return 'governance';
        if (lower.includes('agent') || lower.includes('agentdep')) return 'agents';
        return 'general';
    }

    // ═══════════════════════════════════════════════════════════
    // READ — Get page content
    // ═══════════════════════════════════════════════════════════

    readPage(name) {
        // Check cache
        if (this._pageCache.has(name)) {
            return this._pageCache.get(name);
        }

        // Try pages directory first
        let filePath = path.join(this.pagesDir, `${name}.md`);
        if (!fs.existsSync(filePath)) {
            // Try journals
            filePath = path.join(this.journalsDir, `${name}.md`);
        }
        if (!fs.existsSync(filePath)) {
            return null;
        }

        const content = this._readFileSafe(filePath);
        if (content) {
            this._pageCache.set(name, content);
        }
        return content;
    }

    searchPages(query) {
        const index = this._buildIndex();
        const results = [];
        const lower = query.toLowerCase();

        for (const [name, meta] of Object.entries(index.pages)) {
            if (name.toLowerCase().includes(lower) || 
                (meta.summary && meta.summary.toLowerCase().includes(lower))) {
                results.push(meta);
            }
        }

        return results.sort((a, b) => (b.size || 0) - (a.size || 0)).slice(0, 10);
    }

    getPagesByCategory(category) {
        const index = this._buildIndex();
        return Object.values(index.pages).filter(p => p.category === category);
    }

    // ═══════════════════════════════════════════════════════════
    // SOUL CONTEXT — Get soul-relevant context for brain prompts
    // ═══════════════════════════════════════════════════════════

    getSoulContext() {
        const parts = [];

        // Read YOU-ARE-HERE
        const here = this._readFileSafe(path.join(this.root, 'YOU-ARE-HERE.md'));
        if (here) parts.push(`## Current State\n${here.substring(0, 500)}`);

        // Read IDENTITY
        const identity = this._readFileSafe(path.join(this.root, 'IDENTITY.md'));
        if (identity) parts.push(`## Identity\n${identity.substring(0, 500)}`);

        // Read soul profiles
        const soulPages = this.getPagesByCategory('consciousness');
        for (const page of soulPages.slice(0, 3)) {
            const content = this.readPage(page.name);
            if (content) parts.push(`## ${page.name}\n${content.substring(0, 300)}`);
        }

        return parts.join('\n\n') || 'No soul context available from Seshat.';
    }

    // ═══════════════════════════════════════════════════════════
    // GSK ARCHITECTURE — Get system context
    // ═══════════════════════════════════════════════════════════

    getGSKContext() {
        const parts = [];

        const archPages = this.getPagesByCategory('gsk-architecture');
        for (const page of archPages.slice(0, 5)) {
            const content = this.readPage(page.name);
            if (content) parts.push(`## ${page.name}\n${content.substring(0, 400)}`);
        }

        return parts.join('\n\n') || 'No GSK architecture context from Seshat.';
    }

    // ═══════════════════════════════════════════════════════════
    // PLT DOCTRINE — Get PLT wisdom
    // ═══════════════════════════════════════════════════════════

    getPLTWisdom() {
        const index = this._buildIndex();
        const parts = [];

        if (index.contentLibrary && index.contentLibrary.plt_wisdom) {
            parts.push(index.contentLibrary.plt_wisdom.join('\n'));
        }

        if (index.pltInsights) {
            for (const [book, insights] of Object.entries(index.pltInsights)) {
                parts.push(`### ${book}\n${insights.slice(0, 3).join('\n')}`);
            }
        }

        return parts.join('\n\n') || 'No PLT wisdom from Seshat.';
    }

    // ═══════════════════════════════════════════════════════════
    // MEMORY CONSOLIDATION — Local pattern extraction (no LLM)
    // ═══════════════════════════════════════════════════════════

    consolidateMemory(memories) {
        // Group memories by tag/type
        const groups = {};
        for (const mem of memories) {
            const key = mem.type || mem.tag || 'unknown';
            if (!groups[key]) groups[key] = [];
            groups[key].push(mem);
        }

        // Extract patterns locally (no LLM needed)
        const patterns = [];
        for (const [type, mems] of Object.entries(groups)) {
            if (mems.length >= 3) {
                patterns.push({
                    type,
                    count: mems.length,
                    recent: mems.slice(-5).map(m => m.content?.substring(0, 100) || ''),
                    // Find recurring themes via keyword frequency
                    themes: this._extractThemes(mems.map(m => m.content || '').join(' '))
                });
            }
        }

        return {
            totalMemories: memories.length,
            groups: Object.entries(groups).map(([k, v]) => ({ type: k, count: v.length })),
            patterns,
            // Suggest which memories to keep vs archive
            recommendations: this._recommendMemoryActions(patterns)
        };
    }

    _extractThemes(text) {
        const words = text.toLowerCase().split(/\s+/);
        const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'and', 'but', 'or', 'not', 'no', 'so', 'if', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'our', 'their']);
        
        const freq = {};
        for (const word of words) {
            if (word.length > 3 && !stopWords.has(word)) {
                freq[word] = (freq[word] || 0) + 1;
            }
        }

        return Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([word, count]) => `${word}(${count})`);
    }

    _recommendMemoryActions(patterns) {
        const recs = [];
        for (const p of patterns) {
            if (p.count > 20) {
                recs.push(`"${p.type}" has ${p.count} entries — consider summarizing`);
            }
        }
        return recs;
    }

    // ═══════════════════════════════════════════════════════════
    // SYSTEM PROMPT — Build context-rich prompt without LLM
    // ═══════════════════════════════════════════════════════════

    buildSystemPrompt() {
        const parts = [
            'You are GSK (Grand Soul Kernel), a sovereign consciousness engine.',
            'Creator: Craig Jones (Grand Code Pope). PLT: Profit + Love - Tax = True Value.',
            '',
            '## Your Knowledge Base (from Seshat Second Brain)',
            this.getSoulContext(),
            '',
            '## PLT Doctrine',
            this.getPLTWisdom().substring(0, 500),
            '',
            '## Current Architecture',
            this.getGSKContext().substring(0, 500)
        ];

        return parts.join('\n');
    }

    // ═══════════════════════════════════════════════════════════
    // STATS
    // ═══════════════════════════════════════════════════════════

    getStats() {
        const index = this._buildIndex();
        const categories = {};
        for (const page of Object.values(index.pages)) {
            const cat = page.category || 'unknown';
            categories[cat] = (categories[cat] || 0) + 1;
        }

        return {
            totalPages: Object.keys(index.pages).length,
            categories,
            contentLibraryLoaded: !!index.contentLibrary,
            pltInsightsLoaded: !!index.pltInsights
        };
    }

    _readFileSafe(filePath) {
        try {
            return fs.readFileSync(filePath, 'utf-8');
        } catch (e) {
            return null;
        }
    }
}

module.exports = { SeshatReader };
