import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Project Health Calculation and Donut Redesign Suite', () => {
  const metricCardsPath = path.join(__dirname, '../components/dashboard/MetricCards.jsx');
  const projectHealthPath = path.join(__dirname, '../components/dashboard/ProjectHealth.jsx');
  const backendHealthServicePath = path.join(__dirname, '../../../backend-node/src/services/project-health.service.ts');

  const metricCardsContent = fs.readFileSync(metricCardsPath, 'utf8');
  const projectHealthContent = fs.readFileSync(projectHealthPath, 'utf8');
  const backendHealthContent = fs.readFileSync(backendHealthServicePath, 'utf8');

  test('1. MetricCards eliminates Completion Rate KPI card and maintains only Total Interns, Active Projects, and Portfolio Health', () => {
    // Assert no "Completion Rate" metric card is rendered in the top cards
    assert.ok(
      !metricCardsContent.includes('Completion Rate'),
      'Completion Rate KPI card must be removed from the homepage'
    );
    assert.match(
      metricCardsContent,
      /Total Interns/,
      'Total Interns metric card must be present'
    );
    assert.match(
      metricCardsContent,
      /Active Projects/,
      'Active Projects metric card must be present'
    );
    assert.match(
      metricCardsContent,
      /Portfolio Health/,
      'Portfolio Health card must be present'
    );
  });

  test('2. Portfolio Health is redesigned as an SVG Donut Chart with center project count', () => {
    assert.match(
      metricCardsContent,
      /viewBox="0 0 180 180"/,
      'Portfolio health card must render an SVG with viewBox "0 0 180 180"'
    );
    assert.match(
      metricCardsContent,
      /strokeDasharray/,
      'Donut chart must calculate strokeDasharray for segments'
    );
    assert.match(
      metricCardsContent,
      /strokeDashoffset/,
      'Donut chart must calculate strokeDashoffset for segments'
    );
    // Center counter
    assert.match(
      metricCardsContent,
      /\{totalCount\}/,
      'Center of donut must display the total project count'
    );
    assert.match(
      metricCardsContent,
      /Projects/,
      'Center label must say Projects'
    );
  });

  test('3. Portfolio Health displays assessed count summary and semantic color legend', () => {
    // Assessed count label
    assert.match(
      metricCardsContent,
      /\{assessedCount\} of \{totalCount\} projects assessed/,
      'Card header must display "X of Y projects assessed"'
    );

    // Required categories and semantic colors in legend
    // Healthy: Green (#10b981)
    assert.match(metricCardsContent, /#10b981/, 'Healthy segment must use Green (#10b981)');
    // Needs Attention: Amber (#f59e0b)
    assert.match(metricCardsContent, /#f59e0b/, 'Needs Attention segment must use Amber (#f59e0b)');
    // At Risk: Orange (#f97316)
    assert.match(metricCardsContent, /#f97316/, 'At Risk segment must use Orange (#f97316)');
    // Critical: Red (#ef4444)
    assert.match(metricCardsContent, /#ef4444/, 'Critical segment must use Red (#ef4444)');
    // Not Assessed: Neutral gray (#94a3b8)
    assert.match(metricCardsContent, /#94a3b8/, 'Not Assessed segment must use Neutral gray (#94a3b8)');
  });

  test('4. ProjectHealth.jsx aligns with semantic color palette and story-point completion score', () => {
    // Check HEALTH_CONFIG in ProjectHealth.jsx
    assert.match(
      projectHealthContent,
      /AT_RISK:\s*\{[\s\S]*?bg-orange-50 text-orange-700[\s\S]*?bg-orange-500/,
      'AT_RISK must use orange semantic coloring'
    );
    assert.match(
      projectHealthContent,
      /NEEDS_ATTENTION:\s*\{[\s\S]*?bg-amber-50 text-amber-700[\s\S]*?bg-amber-500/,
      'NEEDS_ATTENTION must use amber semantic coloring'
    );
    assert.match(
      projectHealthContent,
      /HEALTHY:\s*\{[\s\S]*?bg-emerald-50 text-emerald-700[\s\S]*?bg-emerald-500/,
      'HEALTHY must use emerald/green semantic coloring'
    );
    assert.match(
      projectHealthContent,
      /NOT_ASSESSED:\s*\{[\s\S]*?bg-slate-100 text-slate-600[\s\S]*?bg-slate-300/,
      'NOT_ASSESSED must use neutral slate coloring'
    );

    // Score display uses /100 and %
    assert.match(
      projectHealthContent,
      /\$\{proj\.health_score\}\/100 · /,
      'Score display must render story-point completion score out of 100'
    );
    assert.match(
      projectHealthContent,
      /\$\{proj\.progress_percentage\}%/,
      'Right side must display progress percentage'
    );
  });

  test('5. Backend project-health service calculates health strictly from story-point completion formula', () => {
    // Formula check
    assert.match(
      backendHealthContent,
      /Math\.round\(\(completed_sp \/ total_sp\) \* 100\)/,
      'Health score progress percentage must be (completed_sp / total_sp) * 100'
    );
    assert.match(
      backendHealthContent,
      /const finalScore(?::\s*number\s*\|\s*null)?\s*=\s*has_estimated_work \? progress_percentage : null;/,
      'finalScore must equal progress_percentage when work is estimated, else null'
    );
    // Not assessed check
    assert.match(
      backendHealthContent,
      /finalHealth = 'NOT_ASSESSED';/,
      'Projects without estimated work must be categorized as NOT_ASSESSED'
    );
  });
});
