const fs = require('fs');
const path = require('path');
const base = 'gsk/integration';

// Strategy: for each file, the 'use strict' at the start of the real version
// is the SECOND occurrence (or the one that starts the complete file).
// We keep from that 'use strict' to the end, then remove any duplicate exports at the bottom.

function fixFile(relPath) {
  const fullPath = path.join(base, relPath);
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');
  
  // Find ALL 'use strict' lines
  const strictLines = [];
  lines.forEach((line, i) => {
    if (line.trim() === "'use strict';") strictLines.push(i);
  });
  
  if (strictLines.length <= 1) {
    console.log(relPath + ': OK (only ' + strictLines.length + ' use strict)');
    return;
  }
  
  // Keep from the SECOND 'use strict' onward
  const secondStrict = strictLines[1];
  const kept = lines.slice(secondStrict);
  
  // Now check for duplicate module.exports at the end
  // Count module.exports occurrences
  let exportsLines = [];
  kept.forEach((line, i) => {
    if (line.trim().startsWith('module.exports')) exportsLines.push(i);
  });
  
  let result;
  if (exportsLines.length > 1) {
    // Keep only the LAST module.exports block
    const lastExport = exportsLines[exportsLines.length - 1];
    // Find where the last export block starts (look backwards for the opening brace)
    let start = lastExport;
    while (start > 0 && kept[start-1].trim() !== '}') {
      start--;
    }
    // Keep everything before the first export block + the last export block
    const before = kept.slice(0, exportsLines[0]);
    // Remove trailing closing braces
    while (before.length > 0 && before[before.length-1].trim() === '}') {
      before.pop();
    }
    while (before.length > 0 && before[before.length-1].trim() === '') {
      before.pop();
    }
    result = before.concat(kept.slice(lastExport));
  } else {
    result = kept;
  }
  
  fs.writeFileSync(fullPath, result.join('\n'), 'utf8');
  console.log(relPath + ': FIXED (' + lines.length + ' -> ' + result.length + ' lines, ' + strictLines.length + ' use strict)');
  
  // Verify parse
  try {
    new Function(result.join('\n'));
    console.log('  - Parse: OK');
  } catch(e) {
    console.log('  - Parse ERROR: ' + e.message.substring(0, 200));
  }
}

const files = [
  'catalogs/provider-catalog.js',
  'routing/gsk-heart-routing-engine.js',
  'handlers/gsk-heart-chat-handler.js',
  'combos/gsk-heart-combo-router.js',
  'resilience/gsk-heart-resilience-manager.js',
  'safety/gsk-heart-guardrails-manager.js',
  'gsk-heart-unified.js',
];

files.forEach(f => fixFile(f));