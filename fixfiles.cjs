const fs = require('fs');
const path = require('path');
const files = [
  'catalogs/provider-catalog.js',
  'routing/gsk-heart-routing-engine.js',
  'handlers/gsk-heart-chat-handler.js',
  'combos/gsk-heart-combo-router.js',
  'resilience/gsk-heart-resilience-manager.js',
  'safety/gsk-heart-guardrails-manager.js',
  'gsk-heart-unified.js',
];
const base = 'gsk/integration';
files.forEach(f => {
  const fullPath = path.join(base, f);
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');
  
  // Find the LAST 'use strict' line
  let lastUseStrict = 0;
  lines.forEach((line, i) => {
    if (line.trim() === "'use strict';") lastUseStrict = i;
  });
  
  if (lastUseStrict > 0) {
    // Keep everything from the last 'use strict' onwards
    const fixed = lines.slice(lastUseStrict).join('\n');
    fs.writeFileSync(fullPath, fixed, 'utf8');
    console.log(f + ': FIXED - kept ' + (lines.length - lastUseStrict) + ' lines (from line ' + (lastUseStrict+1) + ')');
    
    // Verify it parses
    try {
      new Function(fixed);
      console.log('  - Parse: OK');
    } catch(e) {
      console.log('  - Parse ERROR: ' + e.message.substring(0, 200));
    }
  } else {
    console.log(f + ': No duplicate use strict found');
  }
});