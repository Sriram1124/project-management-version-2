const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else if (file.endsWith('.jsx') || file.endsWith('.tsx')) {
      results.push(fullPath);
    }
  });
  return results;
}

const files = walk('frontend/src');
const labelHits = [];

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  // Match <label ...>
  const labelRegex = /<label\b([^>]*)>/gis;
  let match;
  while ((match = labelRegex.exec(content)) !== null) {
    const attrs = match[1] || '';
    // If it doesn't have htmlFor
    if (!/\bhtmlFor\s*=/i.test(attrs)) {
      // Check if it wraps an input, select, or textarea
      // Lookahead up to </label>
      const restOfContent = content.substring(match.index);
      const closeLabelIdx = restOfContent.indexOf('</label>');
      let hasNestedControl = false;
      if (closeLabelIdx !== -1) {
        const inner = restOfContent.substring(0, closeLabelIdx);
        if (/<(input|select|textarea)\b/i.test(inner)) {
          hasNestedControl = true;
        }
      }
      const line = content.substring(0, match.index).split('\n').length;
      labelHits.push({ file, line, attrs: attrs.replace(/\s+/g, ' ').substring(0, 80), hasNestedControl });
    }
  }
});

console.log('Total labels without htmlFor:', labelHits.length);
labelHits.forEach(h => {
  console.log(`${h.file}:${h.line} (hasNestedControl=${h.hasNestedControl}) <label ${h.attrs}>`);
});

