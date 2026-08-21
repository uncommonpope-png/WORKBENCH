const fs = require('fs');
const path = require('path');
const files = [
  'catalogs/provider-catalog.js',
  'routing/gsk-heart-routing-engine.js',
  'handlers/gsk-heart-chat-handler.js',
  'combos/gsk-heart-combo-router.js',
  'resilience/gsk-heart-resilience-manager.js',
  'safety/gsk-heart-guardrails-manager.js',
];
const base = 'gsk/integration';
files.forEach(f => {
  try {
    const c = fs.readFileSync(path.join(base, f), 'utf8');
    const lines = c.split('\n');
    let useStrictLine = 0;
    lines.forEach((line, i) => {
      if (line.trim() === "'use strict';") useStrictLine = i + 1;
    });
    // Check if file starts with comment or 'use strict'
    const firstLine = lines[0].trim();
    const startsWithDirective = firstLine.startsWith('/**') || firstLine.startsWith('//') || firstLine === "'use strict';";
    
    // Find ALL lines containing "'use strict'"
    let strictLines = [];
    lines.forEach((line, i) => {
      if (line.includes("'use strict'")) strictLines.push(i + 1);
    });
    
    console.log(f + ': ' + lines.length + ' lines');
    console.log('  - First line: ' + firstLine.substring(0, 60));
    console.log('  - Starts properly: ' + startsWithDirective);
    console.log('  - use strict lines: ' + strictLines.join(', '));
    
    // Try to parse
    try {
      new Function(c);
      console.log('  - Parse: OK');
    } catch(e) {
      console.log('  - Parse ERROR: ' + e.message.substring(0, 100));
    }
  } catch(e) {
    console.log(f + ': ERROR ' + e.message);
  }
});