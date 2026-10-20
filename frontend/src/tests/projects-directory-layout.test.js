import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Projects Directory Responsive Layout & Zero Horizontal Scrolling Suite', () => {
  const filePath = path.join(__dirname, '../components/views/projects/ProjectsDirectoryView.jsx');
  const fileContent = fs.readFileSync(filePath, 'utf8');

  test('1. Table uses table-fixed and 100% proportional column distribution', () => {
    // Verifies table layout prevents unconstrained width expansion
    assert.match(
      fileContent,
      /table className="[^"]*table-fixed[^"]*"/,
      'Table must use table-fixed layout'
    );

    // Extract colgroup percentages
    const colMatches = [...fileContent.matchAll(/<col className="w-\[(\d+)%\]" \/>/g)];
    assert.equal(colMatches.length, 8, 'Must declare exactly 8 columns in colgroup');

    const totalPercentage = colMatches.reduce((sum, match) => sum + parseInt(match[1], 10), 0);
    assert.equal(totalPercentage, 100, 'Sum of column percentage widths must equal exactly 100%');
  });

  test('2. All 8 required columns are preserved in the table header', () => {
    const requiredColumns = [
      'Project Details',
      'Methodology',
      'Project Owner',
      'Members',
      'Timeline',
      'Progress',
      'Status',
      'Actions',
    ];

    for (const col of requiredColumns) {
      assert.ok(
        fileContent.includes(`<th className="py-3 px-3 sm:px-3.5">${col}</th>`) ||
        fileContent.includes(`<th className="py-3 px-2 sm:px-2.5">${col}</th>`) ||
        fileContent.includes(`<th className="py-3 px-2 sm:px-3 text-right">${col}</th>`) ||
        fileContent.includes(`>${col}</th>`),
        `Column "${col}" must be present in the table header`
      );
    }
  });

  test('3. Oversized fixed min-widths and px-6 cell padding are removed from the table', () => {
    // Old implementation had px-6 and min-w-[220px], min-w-[180px], etc. on every cell
    assert.ok(
      !fileContent.includes('min-w-[220px]'),
      'Oversized min-w-[220px] must be removed'
    );
    assert.ok(
      !fileContent.includes('min-w-[180px]'),
      'Oversized min-w-[180px] must be removed'
    );
    assert.ok(
      !fileContent.includes('min-w-[150px]'),
      'Oversized min-w-[150px] must be removed'
    );
    assert.ok(
      !fileContent.includes('py-3.5 px-6 min-w-'),
      'Oversized header padding px-6 must be eliminated'
    );
  });

  test('4. Long project names wrap gracefully without forcing horizontal scroll', () => {
    assert.match(
      fileContent,
      /line-clamp-2 break-words/,
      'Project name must allow graceful wrapping (line-clamp-2 break-words)'
    );
  });

  test('5. Action buttons prevent unwanted wrapping or clipping', () => {
    assert.ok(
      fileContent.includes('shrink-0 whitespace-nowrap') || fileContent.includes('whitespace-nowrap shrink-0'),
      'Action button containers must prevent wrapping and clipping'
    );
  });

  test('6. Responsive mobile card layout (< md) and desktop table layout (md+) are provided', () => {
    assert.match(
      fileContent,
      /hidden md:block/,
      'Desktop & tablet table view must be scoped with md breakpoint'
    );
    assert.match(
      fileContent,
      /block md:hidden/,
      'Mobile card layout must be provided for narrow screens < md'
    );
  });
});
