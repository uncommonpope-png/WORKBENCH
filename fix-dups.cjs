const fs = require('fs');

function fixDuplicates(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const result = [];
  
  // Track what classes/functions/exports we've already seen
  const seen = new Set();
  const seenExports = new Set();
  
  let inModuleExports = false;
  let exportDepth = 0;
  let firstModuleExportsDone = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Track class declarations
    const classMatch = trimmed.match(/^class\s+(\w+)/);
    if (classMatch) {
      const name = classMatch[1];
      if (seen.has(name)) {
        // Skip duplicate class - but skip until its closing brace
        let depth = 0;
        let foundOpen = false;
        for (let j = i; j < lines.length; j++) {
          if (lines[j].includes('{')) { depth++; foundOpen = true; }
          if (lines[j].includes('}')) depth--;
          if (foundOpen && depth === 0) {
            i = j;
            break;
          }
        }
        continue;
      }
      seen.add(name);
    }
    
    // Track function declarations  
    const funcMatch = trimmed.match(/^function\s+(\w+)/);
    if (funcMatch) {
      const name = funcMatch[1];
      if (seen.has(name)) {
        // Skip duplicate function - skip until closing brace
        let depth = 0;
        let foundOpen = false;
        for (let j = i; j < lines.length; j++) {
          if (lines[j].includes('{')) { depth++; foundOpen = true; }
          if (lines[j].includes('}')) depth--;
          if (foundOpen && depth === 0) {
            i = j;
            break;
          }
        }
        continue;
      }
      seen.add(name);
    }
    
    // Track const/function/arrow declarations
    const constMatch = trimmed.match(/^const\s+(\w+)\s*=/);
    if (constMatch) {
      const name = constMatch[1];
      if (seen.has(name)) continue;
      seen.add(name);
    }
    
    // Handle duplicate module.exports - skip earlier ones if there's a later one
    if (trimmed.startsWith('module.exports')) {
      if (firstModuleExportsDone) continue;
      firstModuleExportsDone = true;
      inModuleExports = true;
      exportDepth = 0;
    }
    
    if (inModuleExports) {
      for (const ch of line) {
        if (ch === '{') exportDepth++;
        if (ch === '}') exportDepth--;
      }
    }
    
    result.push(line);
    
    if (inModuleExports && exportDepth === 0 && trimmed.startsWith('module.exports')) {
      inModuleExports = false;
    }
  }
  
  const fixed = result.join('\n');
  fs.writeFileSync(filePath, fixed, 'utf8');
  console.log(filePath + ': ' + lines.length + ' -> ' + result.length + ' lines');
  
  // Verify
  try {
    new Function(fixed);
    console.log('  Parse: OK');
  } catch(e) {
    console.log('  Parse ERROR: ' + e.message.substring(0, 200));
    // Try to find where the error is
    const errLine = e.stack.match(/:(\d+):/);
    if (errLine) {
      const ln = parseInt(errLine[1]);
      console.log('  Around line ' + ln + ':');
      for (let i = Math.max(0, ln-3); i < Math.min(result.length, ln+2); i++) {
        console.log('    ' + (i+1) + ': ' + result[i]);
      }
    }
  }
}

const files = [
  'gsk/integration/routing/gsk-heart-routing-engine.js',
  'gsk/integration/handlers/gsk-heart-chat-handler.js',
  'gsk/integration/resilience/gsk-heart-resilience-manager.js',
];

files.forEach(f => fixDuplicates(f));