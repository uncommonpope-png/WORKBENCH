const MANIFEST = {
  id: 'auto_1787896413369',
  name: 'cognitive_handoff_sync_engine',
  version: '1.0.0',
  description: 'Dynamic prompt compilation, autonomous multi-agent handoff, and WebSocket state synchronization.',
  pltAffinity: { profit: 0.88, love: 0.82, tax: 0.12 }
};

function compileDynamicPrompt(agentRole, contextData, goals) {
  const contextBlock = Object.entries(contextData || {})
    .map(([k, v]) => `[CONTEXT:${k.toUpperCase()}] ${JSON.stringify(v)}`)
    .join('\n');
  const goalBlock = (goals || []).map(g => `- ${g}`).join('\n');

  return `=== AGENT ROLE: ${agentRole} ===\n` +
         `=== COGNITIVE CONTEXT ===\n${contextBlock}\n` +
         `=== DIRECTIVE GOALS ===\n${goalBlock}\n` +
         `=== OPERATIONAL PROTOCOL ===\nExecute state handoff and push dynamic delta across WebSocket state bus.`;
}

function createHandoffPacket(sourceAgent, targetAgent, engineState) {
  const handoffToken = `HANDOFF_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const syncFrame = {
    type: 'STATE_DELTA',
    timestamp: Date.now(),
    sequence: (engineState && engineState.sequence) ? engineState.sequence + 1 : 1,
    delta: engineState || {}
  };

  return {
    token: handoffToken,
    from: sourceAgent,
    to: targetAgent,
    syncFrame,
    status: 'ACTIVE_HANDOFF'
  };
}

function execute(input) {
  let parsedInput = {};
  if (typeof input === 'string') {
    try {
      parsedInput = JSON.parse(input);
    } catch (e) {
      parsedInput = { rawInput: input };
    }
  } else if (typeof input === 'object' && input !== null) {
    parsedInput = input;
  }

  const role = parsedInput.role || 'DynamicPromptCompilerAgent';
  const context = parsedInput.context || { session: 'gsk_sync_01', latencyMs: 14, entityCount: 42 };
  const goals = parsedInput.goals || ['Compile dynamic prompt', 'Perform seamless multi-agent handoff', 'Broadcast WS state delta'];
  const sourceAgent = parsedInput.sourceAgent || 'Agent_Primary';
  const targetAgent = parsedInput.targetAgent || 'Agent_Secondary';

  const compiledPrompt = compileDynamicPrompt(role, context, goals);
  const handoffPacket = createHandoffPacket(sourceAgent, targetAgent, context);

  const result = {
    manifest: MANIFEST,
    compiledPrompt,
    handoffPacket,
    wsStateSync: {
      channel: 'wss://engine.gsk.internal/state-bus',
      broadcastReady: true,
      payload: handoffPacket.syncFrame
    },
    status: 'EXECUTED'
  };

  return JSON.stringify(result, null, 2);
}

module.exports = {
  MANIFEST,
  execute
};