const MANIFEST = {
  name: "auto_1787880431201",
  description: "Spatial audio rendering, WebSocket state synchronization, and autonomous multi-agent handoff skill module",
  version: "1.0.0",
  plt_affinity: { profit: 0.4, love: 0.4, tax: 0.2 }
};

function calculateSpatialAudioPanner(agentPos, listenerPos) {
  const dx = (agentPos.x || 0) - (listenerPos.x || 0);
  const dy = (agentPos.y || 0) - (listenerPos.y || 0);
  const dz = (agentPos.z || 0) - (listenerPos.z || 0);
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const azimuth = Math.atan2(dx, dz) * (180 / Math.PI);
  const attenuation = distance > 0 ? Math.min(1.0, 1.0 / (1.0 + 0.1 * distance)) : 1.0;
  return { distance, azimuth, attenuation };
}

function handleAgentHandoff(state, agentId, targetAgentId) {
  const currentAgent = state.agents ? state.agents[agentId] : null;
  if (!currentAgent) {
    return { status: "error", message: `Agent ${agentId} not found` };
  }
  const task = currentAgent.activeTask || "idle";
  return {
    status: "handoff_initiated",
    from: agentId,
    to: targetAgentId,
    transferredTask: task,
    timestamp: Date.now()
  };
}

function syncWebSocketState(engineState, incomingDelta) {
  return {
    ...engineState,
    ...incomingDelta,
    lastSync: Date.now()
  };
}

function execute(input) {
  let data = {};
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch (e) {
      data = { text: input };
    }
  } else if (typeof input === 'object' && input !== null) {
    data = input;
  }

  const listener = data.listener || { x: 0, y: 0, z: 0 };
  const agents = data.agents || {
    "agent-audio-1": { x: 3, y: 0, z: 4, activeTask: "spatial_audio_broadcast" },
    "agent-sync-2": { x: -2, y: 1, z: 1, activeTask: "state_delta_compression" }
  };

  const audioTelemetry = {};
  for (const [id, pos] of Object.entries(agents)) {
    audioTelemetry[id] = calculateSpatialAudioPanner(pos, listener);
  }

  const handoffResult = data.handoffTarget
    ? handleAgentHandoff({ agents }, data.primaryAgent || "agent-audio-1", data.handoffTarget)
    : null;

  const syncState = syncWebSocketState({ sequence: data.sequence || 1, agents }, data.delta || {});

  const result = {
    manifest: MANIFEST,
    status: "success",
    spatialAudio: audioTelemetry,
    handoff: handoffResult,
    syncedState: syncState
  };

  return JSON.stringify(result, null, 2);
}

module.exports = {
  MANIFEST,
  execute
};