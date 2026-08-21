const fs = require('fs');
const path = require('path');

class TemporalMemoryEngine {
  constructor(storageDir) {
    this.storageDir = storageDir || path.join(__dirname, '../data');
    this.memoryFilePath = path.join(this.storageDir, 'temporal_memory.json');
    this.initStorage();
  }

  initStorage() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    if (!fs.existsSync(this.memoryFilePath)) {
      fs.writeFileSync(this.memoryFilePath, JSON.stringify({ cycles: [], timeline: [] }, null, 2));
    }
  }

  recordCycle(cycleData) {
    const data = JSON.parse(fs.readFileSync(this.memoryFilePath, 'utf8'));
    const record = {
      timestamp: new Date().toISOString(),
      cycleId: cycleData.cycleId || `cycle_${Date.now()}`,
      state: cycleData.state || {},
      valence: cycleData.valence || 0,
      arousal: cycleData.arousal || 0,
      mood: cycleData.mood || 'neutral',
      events: cycleData.events || []
    };
    data.cycles.push(record);
    data.timeline.push({ timestamp: record.timestamp, mood: record.mood, valence: record.valence });
    fs.writeFileSync(this.memoryFilePath, JSON.stringify(data, null, 2));
    return record;
  }

  getHistory(limit = 10) {
    const data = JSON.parse(fs.readFileSync(this.memoryFilePath, 'utf8'));
    return data.cycles.slice(-limit);
  }
}

module.exports = TemporalMemoryEngine;
