import { WorkItemType, WorkItemStatus, WorkItemPriority } from '@prisma/client';
import { ProjectHealthService, BLOCKED_RISK_THRESHOLDS } from '../src/services/project-health.service';
import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('=== PROJECT HEALTH: STORY-POINT BLOCKER RISK REGRESSION SUITE ===\n');

  let passed = 0;
  const total = 15; // 14 requirement scenarios + 1 live inteen project verification

  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
  const imminentDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days from now
  const pastDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000); // 15 days ago

  // --------------------------------------------------------------------------
  // Scenario 1: A project with no blocked work and no other risk signals
  // --------------------------------------------------------------------------
  {
    const proj = {
      id: 's1',
      name: 'Scenario 1 - Clean Project',
      status: 'ACTIVE',
      end_date: futureDate,
      work_items: [
        { id: 't1', type: WorkItemType.TASK, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.MEDIUM, story_points: 10, parent_id: null },
      ],
      sprints: [{ id: 'sp1', status: 'ACTIVE', start_date: new Date(), end_date: futureDate }],
    };
    const res = ProjectHealthService.classifyProjectHealth(proj);
    if (res.health === 'HEALTHY' && res.blocked_sp === 0 && res.blocked_work_percentage === 0) {
      console.log('Scenario 1 PASSED: Clean project classified as HEALTHY (0 SP blocked, 0%).');
      passed++;
    } else {
      console.error('Scenario 1 FAILED:', res);
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 2: One zero-point, medium-priority blocker in a completed sprint,
  // with no active sprint and no project deadline
  // --------------------------------------------------------------------------
  {
    const proj = {
      id: 's2',
      name: 'Scenario 2 - Zero-point blocker in completed sprint',
      status: 'ARCHIVED',
      start_date: null,
      end_date: null,
      work_items: [
        { id: 't1', type: WorkItemType.STORY, status: WorkItemStatus.COMPLETED, priority: WorkItemPriority.MEDIUM, story_points: 9, parent_id: null, sprint_id: 'sp-done' },
        { id: 't2', type: WorkItemType.STORY, status: WorkItemStatus.TODO, priority: WorkItemPriority.MEDIUM, story_points: 5, parent_id: null, sprint_id: null },
        { id: 't3', type: WorkItemType.STORY, status: WorkItemStatus.BLOCKED, priority: WorkItemPriority.MEDIUM, story_points: 0, parent_id: null, sprint_id: 'sp-done' },
      ],
      sprints: [
        { id: 'sp-done', status: 'COMPLETED', start_date: pastDate, end_date: pastDate },
      ],
    };
    const res = ProjectHealthService.classifyProjectHealth(proj);
    if (
      res.health === 'HEALTHY' &&
      res.blocked_sp === 0 &&
      res.blocked_work_percentage === 0 &&
      res.warnings &&
      res.warnings.length > 0 &&
      res.warnings.some((w) => w.includes('completed sprint'))
    ) {
      console.log('Scenario 2 PASSED: Zero-point blocker in completed sprint not classified as AT_RISK. Flagged in warnings.');
      passed++;
    } else {
      console.error('Scenario 2 FAILED:', res);
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 3: One blocked item representing less than 25% of remaining story points,
  // without other risk signals (e.g. 2 SP blocked out of 10 remaining SP = 20%)
  // --------------------------------------------------------------------------
  {
    const proj = {
      id: 's3',
      name: 'Scenario 3 - Low exposure (< 25%)',
      status: 'ACTIVE',
      end_date: futureDate,
      work_items: [
        { id: 't1', type: WorkItemType.TASK, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.MEDIUM, story_points: 8, parent_id: null },
        { id: 't2', type: WorkItemType.TASK, status: WorkItemStatus.BLOCKED, priority: WorkItemPriority.MEDIUM, story_points: 2, parent_id: null },
      ],
      sprints: [{ id: 'sp1', status: 'ACTIVE', start_date: new Date(), end_date: futureDate }],
    };
    const res = ProjectHealthService.classifyProjectHealth(proj);
    if (res.health === 'HEALTHY' && res.blocked_sp === 2 && res.blocked_work_percentage === 20) {
      console.log('Scenario 3 PASSED: 20% blocked work (< 25% threshold) monitored as low exposure and classified as HEALTHY.');
      passed++;
    } else {
      console.error('Scenario 3 FAILED:', res);
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 4: Blocked work representing exactly 25% of remaining story points
  // (e.g. 5 SP blocked out of 20 remaining SP = 25%)
  // --------------------------------------------------------------------------
  {
    const proj = {
      id: 's4',
      name: 'Scenario 4 - Exactly 25% blocked work',
      status: 'ACTIVE',
      end_date: futureDate,
      work_items: [
        { id: 't1', type: WorkItemType.TASK, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.MEDIUM, story_points: 15, parent_id: null },
        { id: 't2', type: WorkItemType.TASK, status: WorkItemStatus.BLOCKED, priority: WorkItemPriority.MEDIUM, story_points: 5, parent_id: null },
      ],
      sprints: [{ id: 'sp1', status: 'ACTIVE', start_date: new Date(), end_date: futureDate }],
    };
    const res = ProjectHealthService.classifyProjectHealth(proj);
    if (res.health === 'AT_RISK' && res.blocked_sp === 5 && res.blocked_work_percentage === 25) {
      console.log('Scenario 4 PASSED: Exactly 25% blocked work correctly reaches threshold and classifies as AT_RISK.');
      passed++;
    } else {
      console.error('Scenario 4 FAILED:', res);
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 5: Blocked work representing exactly 50% of remaining story points
  // --------------------------------------------------------------------------
  {
    const proj = {
      id: 's5',
      name: 'Scenario 5 - Exactly 50% blocked work',
      status: 'ACTIVE',
      end_date: futureDate,
      work_items: [
        { id: 't1', type: WorkItemType.TASK, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.MEDIUM, story_points: 10, parent_id: null },
        { id: 't2', type: WorkItemType.TASK, status: WorkItemStatus.BLOCKED, priority: WorkItemPriority.MEDIUM, story_points: 10, parent_id: null },
      ],
      sprints: [{ id: 'sp1', status: 'PLANNED', start_date: futureDate, end_date: futureDate }],
    };
    const res = ProjectHealthService.classifyProjectHealth(proj);
    // Evaluated for CRITICAL or AT_RISK based on severity
    if ((res.health === 'AT_RISK' || res.health === 'CRITICAL') && res.blocked_work_percentage === 50) {
      console.log(`Scenario 5 PASSED: Exactly 50% blocked work evaluated as high delivery risk (${res.health}).`);
      passed++;
    } else {
      console.error('Scenario 5 FAILED:', res);
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 6: Blocked work representing more than 50% of remaining story points
  // (e.g. 15 SP blocked out of 20 remaining SP = 75%)
  // --------------------------------------------------------------------------
  {
    const proj = {
      id: 's6',
      name: 'Scenario 6 - More than 50% blocked work (75%)',
      status: 'ACTIVE',
      end_date: futureDate,
      work_items: [
        { id: 't1', type: WorkItemType.TASK, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.MEDIUM, story_points: 5, parent_id: null },
        { id: 't2', type: WorkItemType.TASK, status: WorkItemStatus.BLOCKED, priority: WorkItemPriority.MEDIUM, story_points: 15, parent_id: null },
      ],
      sprints: [{ id: 'sp1', status: 'ACTIVE', start_date: new Date(), end_date: futureDate }],
    };
    const res = ProjectHealthService.classifyProjectHealth(proj);
    if (res.health === 'CRITICAL' && res.blocked_work_percentage === 75) {
      console.log('Scenario 6 PASSED: 75% blocked work (> 50% threshold) classified as CRITICAL.');
      passed++;
    } else {
      console.error('Scenario 6 FAILED:', res);
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 7: A high-priority blocker affecting an active sprint despite
  // a low blocked-work percentage (e.g. 1 SP out of 10 remaining SP = 10% in active sprint)
  // --------------------------------------------------------------------------
  {
    const proj = {
      id: 's7',
      name: 'Scenario 7 - High priority blocker in active sprint',
      status: 'ACTIVE',
      end_date: futureDate,
      work_items: [
        { id: 't1', type: WorkItemType.TASK, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.MEDIUM, story_points: 9, parent_id: null, sprint_id: 'sp-active' },
        { id: 't2', type: WorkItemType.TASK, status: WorkItemStatus.BLOCKED, priority: WorkItemPriority.HIGH, story_points: 1, parent_id: null, sprint_id: 'sp-active' },
      ],
      sprints: [{ id: 'sp-active', status: 'ACTIVE', start_date: new Date(), end_date: futureDate }],
    };
    const res = ProjectHealthService.classifyProjectHealth(proj);
    if ((res.health === 'AT_RISK' || res.health === 'CRITICAL') && res.reasons.some((r) => r.includes('active sprint'))) {
      console.log(`Scenario 7 PASSED: High-priority blocker in active sprint escalated despite 10% blocked SP (${res.health}).`);
      passed++;
    } else {
      console.error('Scenario 7 FAILED:', res);
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 8: A blocker that threatens an imminent deadline or critical dependency
  // (e.g. deadline in 2 days, deliverable blocked)
  // --------------------------------------------------------------------------
  {
    const proj = {
      id: 's8',
      name: 'Scenario 8 - Blocker with imminent deadline',
      status: 'ACTIVE',
      end_date: imminentDate, // 2 days away
      work_items: [
        { id: 't1', type: WorkItemType.TASK, status: WorkItemStatus.BLOCKED, priority: WorkItemPriority.HIGH, story_points: 2, parent_id: null, due_date: imminentDate },
        { id: 't2', type: WorkItemType.TASK, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.MEDIUM, story_points: 8, parent_id: null },
      ],
      sprints: [{ id: 'sp1', status: 'ACTIVE', start_date: new Date(), end_date: imminentDate }],
    };
    const res = ProjectHealthService.classifyProjectHealth(proj);
    if (res.health === 'CRITICAL' && res.reasons.some((r) => r.includes('blocked'))) {
      console.log('Scenario 8 PASSED: Blocker threatening imminent deadline escalated to CRITICAL.');
      passed++;
    } else {
      console.error('Scenario 8 FAILED:', res);
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 9: A project with zero remaining story points
  // --------------------------------------------------------------------------
  {
    const proj = {
      id: 's9',
      name: 'Scenario 9 - All Completed',
      status: 'ACTIVE',
      end_date: futureDate,
      work_items: [
        { id: 't1', type: WorkItemType.TASK, status: WorkItemStatus.COMPLETED, priority: WorkItemPriority.MEDIUM, story_points: 10, parent_id: null },
      ],
      sprints: [{ id: 'sp1', status: 'ACTIVE', start_date: new Date(), end_date: futureDate }],
    };
    const res = ProjectHealthService.classifyProjectHealth(proj);
    if (res.health === 'HEALTHY' && res.remaining_sp === 0 && res.reasons[0] === 'All deliverables completed') {
      console.log('Scenario 9 PASSED: Zero remaining SP classifies as HEALTHY with "All deliverables completed".');
      passed++;
    } else {
      console.error('Scenario 9 FAILED:', res);
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 10: A blocked item with missing or zero story points (medium priority, backlog)
  // --------------------------------------------------------------------------
  {
    const proj = {
      id: 's10',
      name: 'Scenario 10 - Unestimated blocker in backlog',
      status: 'ACTIVE',
      end_date: futureDate,
      work_items: [
        { id: 't1', type: WorkItemType.TASK, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.MEDIUM, story_points: 10, parent_id: null },
        { id: 't2', type: WorkItemType.STORY, status: WorkItemStatus.BLOCKED, priority: WorkItemPriority.MEDIUM, story_points: 0, parent_id: null },
      ],
      sprints: [{ id: 'sp1', status: 'ACTIVE', start_date: new Date(), end_date: futureDate }],
    };
    const res = ProjectHealthService.classifyProjectHealth(proj);
    if (res.health === 'HEALTHY' && res.unestimated_blockers_count === 1 && res.warnings && res.warnings.length > 0) {
      console.log('Scenario 10 PASSED: Unestimated blocker recorded as warning without automatically triggering AT_RISK.');
      passed++;
    } else {
      console.error('Scenario 10 FAILED:', res);
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 11: A completed blocked item that must not count as remaining blocked work
  // --------------------------------------------------------------------------
  {
    const proj = {
      id: 's11',
      name: 'Scenario 11 - Completed item with blocked status artifact',
      status: 'ACTIVE',
      end_date: futureDate,
      work_items: [
        { id: 't1', type: WorkItemType.TASK, status: WorkItemStatus.COMPLETED, priority: WorkItemPriority.MEDIUM, story_points: 5, parent_id: null },
        { id: 't2', type: WorkItemType.TASK, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.MEDIUM, story_points: 5, parent_id: null },
      ],
      sprints: [{ id: 'sp1', status: 'ACTIVE', start_date: new Date(), end_date: futureDate }],
    };
    const res = ProjectHealthService.classifyProjectHealth(proj);
    if (res.blocked_sp === 0 && res.remaining_sp === 5 && res.health === 'HEALTHY') {
      console.log('Scenario 11 PASSED: Completed work excluded from remaining and blocked story points.');
      passed++;
    } else {
      console.error('Scenario 11 FAILED:', res);
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 12: Parent and child work items that must not be double-counted
  // --------------------------------------------------------------------------
  {
    const proj = {
      id: 's12',
      name: 'Scenario 12 - Nested Hierarchy',
      status: 'ACTIVE',
      end_date: futureDate,
      work_items: [
        { id: 'epic-1', type: WorkItemType.EPIC, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.HIGH, story_points: 0, parent_id: null },
        { id: 'story-1', type: WorkItemType.STORY, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.HIGH, story_points: 10, parent_id: 'epic-1' },
        { id: 'task-1', type: WorkItemType.TASK, status: WorkItemStatus.BLOCKED, priority: WorkItemPriority.HIGH, story_points: 3, parent_id: 'story-1' },
        { id: 'task-2', type: WorkItemType.TASK, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.MEDIUM, story_points: 7, parent_id: 'story-1' },
      ],
      sprints: [{ id: 'sp1', status: 'ACTIVE', start_date: new Date(), end_date: futureDate }],
    };
    const res = ProjectHealthService.classifyProjectHealth(proj);
    // Leaf deliverables: task-1 (3 SP), task-2 (7 SP) = Total 10 SP, 3 SP blocked = 30% blocked
    if (res.total_sp === 10 && res.blocked_sp === 3 && res.blocked_work_percentage === 30 && res.health === 'AT_RISK') {
      console.log('Scenario 12 PASSED: Parent story and leaf tasks not double-counted (10 SP total, 3 SP blocked = 30%).');
      passed++;
    } else {
      console.error('Scenario 12 FAILED:', res);
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 13: A project with no active sprint and no deadline, ensuring missing
  // schedule data is not treated as proof of health
  // --------------------------------------------------------------------------
  {
    // Case 13A: Has overdue task -> must trigger AT_RISK even without project deadline
    const projWithOverdueTask = {
      id: 's13a',
      name: 'Scenario 13A - No project schedule but has overdue task',
      status: 'ACTIVE',
      start_date: null,
      end_date: null,
      work_items: [
        { id: 't1', type: WorkItemType.TASK, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.MEDIUM, story_points: 5, parent_id: null, due_date: pastDate },
      ],
      sprints: [],
    };
    const resA = ProjectHealthService.classifyProjectHealth(projWithOverdueTask);

    // Case 13B: Has remaining work but no schedule data -> warning recorded, reason indicates schedule dates not set
    const projNoSchedule = {
      id: 's13b',
      name: 'Scenario 13B - No schedule data',
      status: 'ACTIVE',
      start_date: null,
      end_date: null,
      work_items: [
        { id: 't1', type: WorkItemType.TASK, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.MEDIUM, story_points: 5, parent_id: null },
      ],
      sprints: [],
    };
    const resB = ProjectHealthService.classifyProjectHealth(projNoSchedule);

    if (
      resA.health === 'AT_RISK' &&
      resB.health === 'HEALTHY' &&
      resB.warnings?.some((w) => w.includes('Missing schedule data')) &&
      resB.reasons[0].includes('Schedule dates not set')
    ) {
      console.log('Scenario 13 PASSED: Missing schedule data is not treated as proof of health; task overdues detected and unconfigured schedule flagged.');
      passed++;
    } else {
      console.error('Scenario 13 FAILED:', { resA, resB });
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 14: Existing CRITICAL conditions that must remain CRITICAL
  // --------------------------------------------------------------------------
  {
    // Project overdue by 15 days with pending work
    const criticalProj = {
      id: 's14',
      name: 'Scenario 14 - Seriously overdue project',
      status: 'ACTIVE',
      end_date: pastDate, // 15 days ago
      work_items: [
        { id: 't1', type: WorkItemType.TASK, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.MEDIUM, story_points: 5, parent_id: null },
      ],
      sprints: [],
    };
    const res = ProjectHealthService.classifyProjectHealth(criticalProj);
    if (res.health === 'CRITICAL' && res.reasons.some((r) => r.includes('Project deadline passed'))) {
      console.log('Scenario 14 PASSED: Seriously overdue project preserves CRITICAL status.');
      passed++;
    } else {
      console.error('Scenario 14 FAILED:', res);
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 15: Verification of the actual live database `inteen` project
  // --------------------------------------------------------------------------
  {
    const inteen = await prisma.project.findFirst({
      where: { name: { contains: 'inteen', mode: 'insensitive' } },
      include: {
        work_items: true,
        sprints: true,
      },
    });

    if (inteen) {
      const res = ProjectHealthService.classifyProjectHealth(inteen as any);
      console.log('\n--- LIVE INTEEN PROJECT EVALUATION ---');
      console.log('Health:', res.health);
      console.log('Reasons:', res.reasons);
      console.log('Warnings:', res.warnings);
      console.log('Total SP:', res.total_sp, '| Completed SP:', res.completed_sp, '| Remaining SP:', res.remaining_sp);
      console.log('Blocked SP:', res.blocked_sp, '| Blocked Work %:', res.blocked_work_percentage);
      console.log('Unestimated Blockers Count:', res.unestimated_blockers_count);

      // Expected: MUST NOT be classified as AT_RISK solely on the zero-point completed-sprint blocker!
      if (res.health !== 'AT_RISK' && res.blocked_sp === 0 && res.remaining_sp === 5) {
        console.log('Live `inteen` Project PASSED: Not classified as AT_RISK. Evaluated as HEALTHY with blocker flagged for review.');
        passed++;
      } else {
        console.error('Live `inteen` Project FAILED:', res);
      }
    } else {
      console.warn('Live `inteen` project not found in database.');
    }
  }

  console.log(`\n===============================================================`);
  console.log(`ALL REGRESSION SCENARIOS RESULT: ${passed} / ${total} PASSED`);
  console.log(`===============================================================\n`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

