'use strict';

const KNOWLEDGE = {
  spatialAudio: {
    title: 'Real-time Spatial Audio (WebAudio)',
    essence: 'AudioListener + PannerNode with HRTF panning; positions in meters using AudioContext currentTime for deterministic scheduling.',
    pattern: 'Create one AudioContext, one listener, one PannerNode per emitter; update position with setPosition or positionX/Y/Z automation; connect through GainNode to master chain for volume control.',
    gotcha: 'Always resume() the context inside a user gesture — autoplay policies will otherwise leave the graph silent.'
  },
  agentHandoff: {
    title: 'Autonomous Multi-Agent Handoff',
    essence: 'Agents exchange control via a shared handoff token — an envelope containing taskId, context, and the next agent id.',
    pattern: 'Each agent validates the envelope, mutates only its own slice, signs completion, then pushes the envelope to the next agent via a queue; timeouts and retry counters prevent stale loops.',
    gotcha: 'Make handoff idempotent: processing the same envelope twice must produce the same result or a recognized no-op.'
  },
  websocketSync: {
    title: 'WebSocket State Synchronization',
    essence: 'Server is source of truth; clients send intent, server applies authoritative mutations and broadcasts deltas.',
    pattern: 'Use a versioned state object + delta log; clients reconcile with last-sent-version to skip missed updates; throttle snapshots for slow joiners.',
    gotcha: 'Always cap delta log length and persist state snapshot so a new client can cold-start without replaying the whole history.'
  },
  logseqGraph: {
    title: 'Logseq Markdown Knowledge Graph',
    essence: 'Every page is a node; [[wiki-links]] and block refs ((uuid)) are edges; properties are typed key: value pairs on first block line.',
    pattern: 'Parse .md files with front-matter-free convention; build adjacency from [[links]]; index blocks by uuid for bidirectional traversal; emit Cypher or JSON for external query.',
    gotcha: 'Block IDs change on file structure edits; treat uuid as a hint, re-key by path+block text hash for durable identity.'
  },
  threeInstancing: {
    title: 'Three.js Instanced Rendering',
    essence: 'InstancedMesh renders thousands of objects in one draw call, each with its own matrix, color, and per-instance attributes.',
    pattern: 'Allocate dummy Object3D, loop to compose matrices; set instanceMatrix.needsUpdate once; use onBeforeCompile or custom shader chunk for per-instance data.',
    gotcha: 'Keep instance count fixed after first render or fully reallocate buffers — changing geometry count mid-flight silently drops draws.'
  }
};

/**
 * Encapsulates five recent exploration areas into an actionable skill brief.
 *
 * @param {string} input - topic key (spatialAudio, agentHandoff, websocketSync,
 *   logseqGraph, threeInstancing) or any free-form query containing a known key.
 * @returns {string} formatted skill summary.
 */
function execute(input) {
  const raw = String(input == null ? '' : input);
  const key = (Object.keys(KNOWLEDGE).find((k) => raw.toLowerCase().includes(k.toLowerCase()))
    || raw.trim().toLowerCase())
    .replace(/[-\s]/g, '');

  const entry = KNOWLEDGE[key] || KNOWLEDGE[Object.keys(KNOWLEDGE)[0]];

  const fallbackNote = KNOWLEDGE[key]
    ? ''
    : `\n  (Unknown key "${raw}" — defaulting to ${entry.title}.)`;

  return [
    '=== SKILL: auto_1786209741902 | Encapsulated Explorations ===',
    `Topic: ${entry.title}`,
    `Essence: ${entry.essence}`,
    `Pattern: ${entry.pattern}`,
    `Gotcha: ${entry.gotcha}`,
    '---',
    'Combo cheat: spatial audio + agent handoff works when the audio intent envelope',
    'carries both position data and a WebSocket version token, so the mixer is also',
    'the state authority. Logseq graph links can drive Three.js instancing by mapping',
    'each knowledge node to one rendered instance whose matrix is derived from',
    'embedding similarity — one graph, one buffer, zero FOMO.',
    fallbackNote,
    '=== End Skill ==='
  ].filter(Boolean).join('\n');
}

module.exports = { execute };
