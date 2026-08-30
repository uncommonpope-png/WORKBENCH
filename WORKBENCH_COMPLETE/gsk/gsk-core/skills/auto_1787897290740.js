const MANIFEST = {
  id: "auto_1787897261235",
  name: "Cognitive Spatial Telemetry & Agent Handoff Engine",
  version: "1.0.0",
  plt_affinity: { profit: 0.9, love: 0.85, tax: 0.1 }
};

function evaluatePLT(profit, love, tax) {
  return profit + love - tax;
}

function compileDynamicPrompt(agentState, taskContext) {
  const netValue = evaluatePLT(agentState.profit || 0.9, agentState.love || 0.85, agentState.tax || 0.1);
  return `[SYSTEM_PROMPT: ${agentState.role || 'Cognitive Agent'}] PLT_Score: ${netValue.toFixed(2)} | Directive: Perform dynamic handoff & compute state sync | Payload: ${JSON.stringify(taskContext)}`;
}

function computeWebGPUSpatialState(entities) {
  return (entities || []).map(entity => ({
    id: entity.id || "entity_0",
    position: entity.position || [0, 0, 0],
    velocity: entity.velocity || [0, 0, 0],
    spatialHash: (entity.position ? entity.position[0] * 73856093 ^ entity.position[1] * 19349663 ^ entity.position[2] * 83492791 : 0) >>> 0
  }));
}

function performAgentHandoff(sourceAgent, targetAgent, payload) {
  const prompt = compileDynamicPrompt(targetAgent, payload);
  return {
    handoffId: `handoff_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    sourceId: sourceAgent.id || "agent_source",
    targetId: targetAgent.id || "agent_target",
    compiledPrompt: prompt,
    status: "HANDOFF_SUCCESS",
    timestamp: new Date().toISOString()
  };
}

function serializeWebSocketStateSnapshot(gameState) {
  const spatialBuffer = computeWebGPUSpatialState(gameState.entities || []);
  const pltValue = evaluatePLT(gameState.profit || 10, gameState.love || 8, gameState.tax || 2);
  return JSON.stringify({
    type: "SYNC_GAME_STATE",
    frame: gameState.frame || 0,
    timestamp: Date.now(),
    spatialEntities: spatialBuffer,
    pltTelemetry: {
      profit: gameState.profit || 10,
      love: gameState.love || 8,
      tax: gameState.tax || 2,
      netValue: pltValue
    }
  });
}

function execute(input) {
  let parsedInput = {};
  if (typeof input === 'string') {
    try {
      parsedInput = JSON.parse(input);
    } catch (e) {
      parsedInput = { raw: input };
    }
  } else if (typeof input === 'object' && input !== null) {
    parsedInput = input;
  }

  const sourceAgent = parsedInput.sourceAgent || { id: "gsk_governance_node", role: "Self Governance Orchestrator", profit: 0.9, love: 0.9, tax: 0.05 };
  const targetAgent = parsedInput.targetAgent || { id: "webgpu_compute_node", role: "WebGPU Spatial Shader Compute", profit: 0.95, love: 0.8, tax: 0.1 };
  const gameState = parsedInput.gameState || { frame: 2048, profit: 50, love: 40, tax: 5, entities: [{ id: "node_alpha", position: [12.5, 4.2, -9.1] }] };

  const prompt = compileDynamicPrompt(sourceAgent, parsedInput);
  const handoff = performAgentHandoff(sourceAgent, targetAgent, parsedInput);
  const wsFrame = serializeWebSocketStateSnapshot(gameState);

  const response = {
    manifest: MANIFEST,
    pltAlignment: evaluatePLT(sourceAgent.profit, sourceAgent.love, sourceAgent.tax),
    dynamicPrompt: prompt,
    agentHandoffRecord: handoff,
    webSocketSyncPacket: wsFrame,
    executedAt: new Date().toISOString()
  };

  return JSON.stringify(response, null, 2);
}

module.exports = {
  MANIFEST,
  execute
};