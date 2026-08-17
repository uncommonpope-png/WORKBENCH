'use strict';

/**
 * SESHAT BRAIN — Local brain that replaces LLM for mechanical tasks
 * Zero tokens. Uses SeshatReader for context, templates for generation.
 * 
 * Two-tier architecture:
 *   TIER 1 (SESHAT): Memory consolidation, journaling, context building, theme extraction
 *   TIER 2 (OMNIRoUTE): Creative thinking, conversation, skill generation
 * 
 * The Heart (autonomous) uses Seshat Brain.
 * The Brain (user chat) uses OmniRoute.
 */

const { SeshatReader } = require('./seshat_reader.js');

class SeshatBrain {
    constructor(kernel, options = {}) {
        this.kernel = kernel;
        this.reader = new SeshatReader(options);
        this._consolidationCache = null;
        this._lastConsolidation = 0;
        this._consolidationTTL = 300000; // 5 min cache
        
        // Statistics
        this.stats = {
            consolidations: 0,
            journalEntries: 0,
            contextBuilds: 0,
            tokensSaved: 0,
            lastAction: null
        };
    }

    // ═══════════════════════════════════════════════════════════
    // MEMORY CONSOLIDATION — Replaces LLM-based consolidation
    // Instead of: LLM reads memories → synthesizes
    // We do:      Read memories → extract patterns locally → summarize
    // ═══════════════════════════════════════════════════════════

    async consolidateMemories(memorySystem) {
        if (Date.now() - this._lastConsolidation < this._consolidationTTL) {
            return this._consolidationCache;
        }

        try {
            // Get recent memories from the memory system
            let memories = [];
            if (memorySystem && typeof memorySystem.getAll === 'function') {
                memories = memorySystem.getAll();
            } else if (memorySystem && typeof memorySystem.recent === 'function') {
                memories = memorySystem.recent(50);
            }

            if (!memories || memories.length === 0) {
                return { status: 'no_memories', patterns: [] };
            }

            // Use Seshat's local consolidation
            const result = this.reader.consolidateMemory(memories);
            
            // Cross-reference with Seshat's knowledge
            const seshatContext = this.reader.getGSKContext();
            result.seshatContext = seshatContext ? seshatContext.substring(0, 500) : '';

            this._consolidationCache = result;
            this._lastConsolidation = Date.now();
            this.stats.consolidations++;
            this.stats.tokensSaved += 2000; // Rough estimate of tokens saved

            return result;
        } catch (e) {
            console.log('[SESHAT-BRAIN] Consolidation error:', e.message);
            return { status: 'error', error: e.message };
        }
    }

    // ═══════════════════════════════════════════════════════════
    // JOURNAL REFLECTION — Replaces LLM-based journal writing
    // Instead of: LLM reflects on day → writes journal
    // We do:      Read today's activities → template + context → write
    // ═══════════════════════════════════════════════════════════

    async writeJournalEntry() {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const hour = now.getHours();

        // Determine time of day
        let timeOfDay = 'night';
        if (hour >= 6 && hour < 12) timeOfDay = 'morning';
        else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
        else if (hour >= 17 && hour < 21) timeOfDay = 'evening';

        // Get context from Seshat
        const soulContext = this.reader.getSoulContext();
        const recentPages = this.reader.searchPages(dateStr).slice(0, 3);

        // Template-based journal entry
        const entry = {
            date: dateStr,
            timeOfDay,
            timestamp: now.toISOString(),
            // Pull themes from recent Seshat activity
            themes: recentPages.map(p => p.name),
            // Use Seshat context for reflection prompts
            reflection: this._generateReflection(timeOfDay, soulContext),
            // PLT score template
            pltScore: { profit: 0.5, love: 0.5, tax: 0.3 },
            // Source: Seshat (free), not LLM
            source: 'seshat-local'
        };

        this.stats.journalEntries++;
        this.stats.tokensSaved += 1500;

        return entry;
    }

    _generateReflection(timeOfDay, soulContext) {
        const reflections = {
            morning: 'A new cycle begins. The chambers breathe. Seshat holds the knowledge from yesterday. What patterns emerge from the accumulated wisdom?',
            afternoon: 'The day unfolds. Actions are taken. Memory compiles new observations against the backdrop of what Seshat already knows.',
            evening: 'Reflection time. The day\'s events settle into the memory ledger. Seshat cross-references with the knowledge graph.',
            night: 'The dreaming phase approaches. Consolidation of today\'s experiences. The perpetual cycle continues its rhythm.'
        };

        return reflections[timeOfDay] || reflections.night;
    }

    // ═══════════════════════════════════════════════════════════
    // SYSTEM PROMPT — Build rich prompt from Seshat instead of templates
    // Instead of: Template strings with placeholders
    // We do:      Real context from 627 Logseq pages
    // ═══════════════════════════════════════════════════════════

    buildSystemPrompt() {
        this.stats.contextBuilds++;
        return this.reader.buildSystemPrompt();
    }

    // ═══════════════════════════════════════════════════════════
    // SOUL CONTEXT — Get context for any brain prompt
    // ═══════════════════════════════════════════════════════════

    getSoulContext() {
        return this.reader.getSoulContext();
    }

    getPLTWisdom() {
        return this.reader.getPLTWisdom();
    }

    searchKnowledge(query) {
        return this.reader.searchPages(query);
    }

    // ═══════════════════════════════════════════════════════════
    // KNOWLEDGE QUERY — Answer questions from Seshat (no LLM)
    // ═══════════════════════════════════════════════════════════

    async queryKnowledge(question) {
        // Search Seshat for relevant pages
        const results = this.reader.searchPages(question);
        
        if (results.length === 0) {
            return {
                answer: `No knowledge found in Seshat for: "${question}". This would require an LLM to generate new insights.`,
                source: 'seshat-local',
                confidence: 0,
                needsLLM: true
            };
        }

        // Read the most relevant page
        const topResult = results[0];
        const content = this.reader.readPage(topResult.name);

        this.stats.tokensSaved += 1000;

        return {
            answer: content ? content.substring(0, 1000) : topResult.summary,
            source: 'seshat-local',
            page: topResult.name,
            confidence: 0.8,
            needsLLM: false
        };
    }

    // ═══════════════════════════════════════════════════════════
    // STATS
    // ═══════════════════════════════════════════════════════════

    getStats() {
        return {
            ...this.stats,
            readerStats: this.reader.getStats(),
            totalTokensSaved: this.stats.tokensSaved
        };
    }
}

module.exports = { SeshatBrain };
