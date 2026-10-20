import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Manager Profile Projects Managed Pagination & Column Alignment Suite', () => {
  const profileViewPath = path.join(__dirname, '../components/views/ManagerProfileView.jsx');
  const profileViewContent = fs.readFileSync(profileViewPath, 'utf8');

  describe('1. Pagination Calculation & Logic', () => {
    const mockProjects = Array.from({ length: 12 }, (_, i) => ({
      id: `proj-${i + 1}`,
      name: `Project ${i + 1}`,
      status: i < 6 ? 'ACTIVE' : i < 9 ? 'PLANNED' : 'COMPLETED',
      methodology: i % 2 === 0 ? 'SCRUM' : 'KANBAN',
      owner: { name: `Lead ${i + 1}` },
      _count: { members: (i + 1) * 2 },
      start_date: i % 3 === 0 ? '2026-01-01' : null,
      end_date: i % 3 === 0 ? '2026-06-30' : null,
    }));

    const PAGE_SIZE = 5;

    function paginateList(items, page, pageSize = PAGE_SIZE) {
      const total = items.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const safePage = Math.min(Math.max(1, page), totalPages);
      const startIndex = (safePage - 1) * pageSize;
      const endIndex = Math.min(startIndex + pageSize, total);
      const slice = items.slice(startIndex, endIndex);

      return {
        items: slice,
        total,
        totalPages,
        currentPage: safePage,
        startIndex,
        endIndex,
        isFirstPage: safePage <= 1,
        isLastPage: safePage >= totalPages,
        rangeText: total === 0 ? 'Showing 0 projects' : `Showing ${startIndex + 1}–${endIndex} of ${total} ${total === 1 ? 'project' : 'projects'}`,
      };
    }

    test('paginates 12 projects with fixed page size of 5', () => {
      // Page 1
      const p1 = paginateList(mockProjects, 1);
      assert.strictEqual(p1.items.length, 5);
      assert.strictEqual(p1.totalPages, 3);
      assert.strictEqual(p1.isFirstPage, true);
      assert.strictEqual(p1.isLastPage, false);
      assert.strictEqual(p1.rangeText, 'Showing 1–5 of 12 projects');
      assert.strictEqual(p1.items[0].name, 'Project 1');
      assert.strictEqual(p1.items[4].name, 'Project 5');

      // Page 2
      const p2 = paginateList(mockProjects, 2);
      assert.strictEqual(p2.items.length, 5);
      assert.strictEqual(p2.isFirstPage, false);
      assert.strictEqual(p2.isLastPage, false);
      assert.strictEqual(p2.rangeText, 'Showing 6–10 of 12 projects');
      assert.strictEqual(p2.items[0].name, 'Project 6');
      assert.strictEqual(p2.items[4].name, 'Project 10');

      // Page 3 (remaining items)
      const p3 = paginateList(mockProjects, 3);
      assert.strictEqual(p3.items.length, 2);
      assert.strictEqual(p3.isFirstPage, false);
      assert.strictEqual(p3.isLastPage, true);
      assert.strictEqual(p3.rangeText, 'Showing 11–12 of 12 projects');
      assert.strictEqual(p3.items[0].name, 'Project 11');
      assert.strictEqual(p3.items[1].name, 'Project 12');
    });

    test('calculates pagination from filtered projects and resets to page 1 on filter changes', () => {
      // Filter for PLANNED status (3 items)
      const plannedOnly = mockProjects.filter((p) => p.status === 'PLANNED');
      const pPlanned = paginateList(plannedOnly, 1);
      assert.strictEqual(pPlanned.total, 3);
      assert.strictEqual(pPlanned.totalPages, 1);
      assert.strictEqual(pPlanned.items.length, 3);
      assert.strictEqual(pPlanned.rangeText, 'Showing 1–3 of 3 projects');

      // Check reset effect in component code
      assert.match(
        profileViewContent,
        /const PROJECTS_PER_PAGE = 5;/,
        'Component must use fixed page size of 5'
      );
      assert.match(
        profileViewContent,
        /useEffect\(\(\) => \{[\s\S]*?setProjectPage\(1\);[\s\S]*?\}, \[projectSearch, statusFilter\]\);/,
        'Component must reset projectPage to 1 whenever search query or status filter changes'
      );
    });

    test('pagination controls are rendered with range, Previous, page numbers, and Next', () => {
      assert.match(
        profileViewContent,
        /Showing[\s\S]*?\{totalFilteredProjects === 0 \? '0' : `\$\{projectStartIndex \+ 1\}–\$\{projectEndIndex\}`\}[\s\S]*?of[\s\S]*?\{totalFilteredProjects\}/,
        'Component must display formatted range text like "Showing 1–5 of 12 projects"'
      );
      assert.match(
        profileViewContent,
        /disabled=\{safeProjectPage <= 1\}/,
        'Previous button must be disabled on the first page'
      );
      assert.match(
        profileViewContent,
        /disabled=\{safeProjectPage >= totalProjectPages\}/,
        'Next button must be disabled on the last page'
      );
      assert.match(
        profileViewContent,
        /Array\.from\(\{ length: totalProjectPages \}, \(_, i\) => i \+ 1\)\.map/,
        'Must render individual clickable page numbers'
      );
    });
  });

  describe('2. Column Alignment & CSS Grid Layout', () => {
    test('renders consistent 6-column header and row layout', () => {
      // Check column header titles
      assert.match(profileViewContent, />Project<\/div>/, 'Header must contain Column 1 — Project');
      assert.match(profileViewContent, />Status<\/div>/, 'Header must contain Column 2 — Status');
      assert.match(profileViewContent, />Methodology<\/div>/, 'Header must contain Column 3 — Methodology');
      assert.match(profileViewContent, />Members<\/div>/, 'Header must contain Column 4 — Members');
      assert.match(profileViewContent, />Timeline<\/div>/, 'Header must contain Column 5 — Timeline');
      assert.match(profileViewContent, />Lead<\/div>/, 'Header must contain Column 6 — Lead');
    });

    test('separates status and methodology badges into independent columns', () => {
      assert.match(
        profileViewContent,
        /{\/\* Column 2 — Status \*\/}[\s\S]*?statusInfo\.label[\s\S]*?{\/\* Column 3 — Methodology \*\/}[\s\S]*?ProjectMethodologyBadge/,
        'Status badge and Methodology badge must be placed in separate sequential grid columns'
      );
    });

    test('standardizes badge heights and typography', () => {
      assert.match(
        profileViewContent,
        /h-5 leading-none select-none \$\{statusInfo\.badgeClass\}/,
        'Status badge must have standardized h-5 height and typography matching methodology badge'
      );
      assert.match(
        profileViewContent,
        /<ProjectMethodologyBadge methodology=\{proj\.methodology\} size="sm" \/>/,
        'Methodology badge must use standardized small badge'
      );
    });

    test('hides timeline content when dates are unavailable while maintaining column alignment', () => {
      assert.match(
        profileViewContent,
        /{\/\* Column 5 — Timeline \*\/}[\s\S]*?proj\.start_date \? \([\s\S]*?\) : null/,
        'Timeline column must render content only when start_date is available and maintain grid position when missing'
      );
    });

    test('truncates project names and lead names cleanly', () => {
      assert.match(
        profileViewContent,
        /{\/\* Column 1 — Project \*\/}[\s\S]*?truncate block/,
        'Project name must truncate cleanly to avoid column shifting'
      );
      assert.match(
        profileViewContent,
        /{\/\* Column 6 — Lead \*\/}[\s\S]*?truncate block/,
        'Lead name must truncate cleanly to avoid column shifting'
      );
    });

    test('provides horizontal scrolling container on smaller screens', () => {
      assert.match(
        profileViewContent,
        /<div className="overflow-x-auto">[\s\S]*?<div className="min-w-\[760px\]">/,
        'Must wrap grid in overflow-x-auto container with min-w-[760px] to prevent overlapping on mobile'
      );
    });
  });
});

