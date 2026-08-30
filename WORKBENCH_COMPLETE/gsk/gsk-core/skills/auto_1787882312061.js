/**
 * Auto-generated Skill Module: auto_1787882295514.js
 * Topics: Autonomous Multi-Agent Handoff Patterns, WebAudio Spatial Audio Rendering, WebSocket State Sync
 */

const MANIFEST = {
  id: "auto_1787882295514",
  name: "Spatial Audio Multi-Agent Handoff Synchronizer",
  description: "Coordinates multi-agent state handoffs with WebAudio spatial calculations and WebSocket frame replication.",
  version: "1.0.0"
};

function calculateSpatialAudioPanner(listenerPos, sourcePos) {
  const dx = sourcePos.x - listenerPos.x;
  const dy = sourcePos.y - listenerPos.y;
  const dz = (sourcePos.z || 0) - (listenerPos.z || 0);
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const refDistance = 1.0;
  const rolloffFactor = 1.0;
  const clampedDist = Math.max(refDistance, distance);
  const gain = refDistance / (refDistance + rolloffFactor * (clampedDist - refDistance));

  return {
    position: sourcePos,
    distance: Number(distance.toFixed(3)),
    gain: Number(gain.toFixed(4))
  };
}

function processAgentHandoff(sourceAgentId, targetAgentId, payload, stateDelta) {
  const timestamp = Date.now();
  return {
    token: `handoff_${sourceAgentId}_to_${targetAgentId}_${timestamp}`,
    from: sourceAgentId,
    to: targetAgentId,
    timestamp,
    payload: {
      ...payload,
      transferredState: stateDelta,
      status: "HANDOFF_COMPLETED"
    }
  };
}

function encodeWebSocketSyncFrame(sequenceId, entityStates) {
  return JSON.stringify({
    type: "SYNC_STATE",
    seq: sequenceId,
    timestamp: Date.now(),
    entities: entityStates.map(entity => ({
      id: entity.id,
      position: entity.position,
      audioState: calculateSpatialAudioPanner(entity.listenerPos || { x: 0, y: 0, z: 0 }, entity.position)
    }))
  });
}

function execute(input) {
  let params = {};
  if (typeof input === 'string') {
    try { params = JSON.parse(input); } catch (e) { params = { text: input }; }
  } else if (typeof input === 'object' && input !== null) {
    params = input;
  }

  const listenerPos = params.listenerPos || { x: 0, y: 0, z: 0 };
  const sourcePos = params.sourcePos || { x: 5, y: 2, z: 10 };
  const audioData = calculateSpatialAudioPanner(listenerPos, sourcePos);
  const handoff = processAgentHandoff(
    params.sourceAgentId || "agent_alpha",
    params.targetAgentId || "agent_beta",
    params.payload || { task: "spatial_telemetry" },
    { audioGain: audioData.gain }
  );
  const syncFrame = JSON.parse(encodeWebSocketSyncFrame(params.seq || 1, [{ id: params.sourceAgentId || "agent_alpha", position: sourcePos, listenerPos }]));

  return JSON.stringify({ status: "success", manifest: MANIFEST, audioData, handoff, syncFrame }, null, 2);
}

module.exports = {
  MANIFEST,
  execute,
  calculateSpatialAudioPanner,
  processAgentHandoff,
  encodeWebSocketSyncFrame
};