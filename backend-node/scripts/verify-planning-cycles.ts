import { prisma } from '../src/lib/prisma';
import { SprintService } from '../src/services/sprint.service';
import { ProjectService } from '../src/services/project.service';
import { WorkItemService } from '../src/services/work-item.service';

async function runVerification() {
  console.log('=== STARTING PLANNING CYCLES & SPRINT VERIFICATION ===\n');

  const existingUser = await prisma.user.findFirst();
  if (!existingUser) {
    throw new Error('No user found in database');
  }

  const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
  if (!firstOrg) {
    throw new Error('No active organization found in database for test');
  }

  const adminUser = {
    id: existingUser.id,
    role: 'ADMIN',
    organization_id: existingUser.organization_id || firstOrg.id,
  };

  const testProjectIds: string[] = [];

  try {
    // -----------------------------------------------------------------
    // TEST 1: Create a Scrum Project and verify single active constraint
    // -----------------------------------------------------------------
    console.log('--- Test 1: Scrum Project Single-Active Sprint Constraint ---');
    const scrumProj = await ProjectService.createProject(
      {
        name: 'Test Scrum Project For Sprints',
        description: 'Verifying Scrum constraints',
        methodology: 'SCRUM',
      },
      adminUser
    );
    testProjectIds.push(scrumProj.id);

    const sprint1 = await SprintService.createSprint(
      scrumProj.id,
      {
        name: 'Sprint 1',
        start_date: new Date(),
        end_date: new Date(Date.now() + 14 * 86400000),
      },
      adminUser
    );

    const sprint2 = await SprintService.createSprint(
      scrumProj.id,
      {
        name: 'Sprint 2',
        start_date: new Date(Date.now() + 15 * 86400000),
        end_date: new Date(Date.now() + 29 * 86400000),
      },
      adminUser
    );

    // Start Sprint 1
    await SprintService.startSprint(scrumProj.id, sprint1.id, adminUser);
    console.log('Started Sprint 1 successfully.');

    // Attempt to start Sprint 2 while Sprint 1 is ACTIVE in Scrum -> Must throw error
    let scrumThrew = false;
    try {
      await SprintService.startSprint(scrumProj.id, sprint2.id, adminUser);
    } catch (err: any) {
      scrumThrew = true;
      console.log(`Caught expected Scrum constraint error: "${err.message}"`);
    }

    if (!scrumThrew) {
      throw new Error('Scrum should NOT allow two concurrent active sprints!');
    }
    console.log('✓ PASS: Scrum project enforces single active sprint rule.');

    // -----------------------------------------------------------------
    // TEST 2: Create a Kanban Project and verify Planning Cycles
    // -----------------------------------------------------------------
    console.log('\n--- Test 2: Kanban Project Flexible Planning Cycles ---');
    const kanbanProj = await ProjectService.createProject(
      {
        name: 'Test Kanban Project For Cycles',
        description: 'Verifying Kanban planning cycles',
        methodology: 'KANBAN',
      },
      adminUser
    );
    testProjectIds.push(kanbanProj.id);

    const cycle1 = await SprintService.createSprint(
      kanbanProj.id,
      {
        name: 'Cycle 1 - Core Delivery',
        goal: 'Accelerate MVP flow',
        start_date: new Date(),
        end_date: new Date(Date.now() + 14 * 86400000),
      },
      adminUser
    );

    const cycle2 = await SprintService.createSprint(
      kanbanProj.id,
      {
        name: 'Cycle 2 - Refinements',
        goal: 'Continuous polish',
        start_date: new Date(),
        end_date: new Date(Date.now() + 14 * 86400000),
      },
      adminUser
    );

    // Activate Cycle 1
    await SprintService.startSprint(kanbanProj.id, cycle1.id, adminUser);
    console.log('Activated Cycle 1 in Kanban project.');

    // Attempting to activate Cycle 2 while Cycle 1 is active catches Kanban-specific message
    let kanbanActiveThrew = false;
    try {
      await SprintService.startSprint(kanbanProj.id, cycle2.id, adminUser);
    } catch (err: any) {
      kanbanActiveThrew = true;
      console.log(`Caught expected Kanban cycle conflict message: "${err.message}"`);
    }

    if (!kanbanActiveThrew) {
      throw new Error('Should catch active cycle conflict when activating concurrent cycle');
    }
    console.log('✓ PASS: Kanban project enforces cycle-level clarity with methodology-specific error messaging.');

    // -----------------------------------------------------------------
    // TEST 3: Assign work items optionally to Cycle and verify metrics
    // -----------------------------------------------------------------
    console.log('\n--- Test 3: Work items optional cycle assignment & metrics ---');
    
    // Create work item assigned to cycle 1
    const inCycleItem = await WorkItemService.createWorkItem(
      adminUser,
      {
        project_id: kanbanProj.id,
        title: 'Story Assigned to Cycle 1',
        type: 'STORY' as any,
        status: 'IN_PROGRESS' as any,
        sprint_id: cycle1.id,
        story_points: 5,
        due_date: new Date(Date.now() - 86400000).toISOString() as any, // Overdue yesterday!
      }
    );

    // Create work item NOT assigned to any cycle (continuous flow)
    const continuousItem = await WorkItemService.createWorkItem(
      adminUser,
      {
        project_id: kanbanProj.id,
        title: 'Continuous Flow Story (Unassigned)',
        type: 'STORY' as any,
        status: 'TODO' as any,
        sprint_id: null, // Optional, unassigned
        story_points: 3,
      }
    );

    // Create completed work item in cycle 1
    const completedItem = await WorkItemService.createWorkItem(
      adminUser,
      {
        project_id: kanbanProj.id,
        title: 'Completed Story in Cycle 1',
        type: 'STORY' as any,
        status: 'COMPLETED' as any,
        sprint_id: cycle1.id,
        story_points: 8,
      }
    );

    const cycleList = await SprintService.listSprints(kanbanProj.id, adminUser);
    const cycle1Data = cycleList.find((c) => c.id === cycle1.id);

    console.log(`Cycle 1 Metrics: total_items = ${cycle1Data?.total_items}, completed_items = ${cycle1Data?.completed_items}, overdue_items = ${cycle1Data?.overdue_items}, completion_percentage = ${cycle1Data?.completion_percentage}%`);

    if (cycle1Data?.total_items !== 2) {
      throw new Error(`Expected 2 items in Cycle 1, got ${cycle1Data?.total_items}`);
    }
    if (cycle1Data?.completed_items !== 1) {
      throw new Error(`Expected 1 completed item in Cycle 1, got ${cycle1Data?.completed_items}`);
    }
    if (cycle1Data?.overdue_items !== 1) {
      throw new Error(`Expected 1 overdue item in Cycle 1, got ${cycle1Data?.overdue_items}`);
    }
    if (cycle1Data?.completion_percentage !== 50) {
      throw new Error(`Expected 50% completion percentage, got ${cycle1Data?.completion_percentage}%`);
    }
    console.log('✓ PASS: Cycle metrics (total, completed, overdue, %) calculated accurately.');

    // -----------------------------------------------------------------
    // TEST 4: Close Cycle with KEEP_IN_CYCLE and verify continuous flow
    // -----------------------------------------------------------------
    console.log('\n--- Test 4: Close Cycle & Continuous Flow Integrity ---');
    await SprintService.completeSprint(
      kanbanProj.id,
      cycle1.id,
      { unfinished_action: 'KEEP_IN_CYCLE' },
      adminUser
    );

    const closedCycle = await prisma.sprint.findUnique({ where: { id: cycle1.id } });
    if (closedCycle?.status !== 'COMPLETED') {
      throw new Error('Cycle should be marked COMPLETED when closed');
    }

    const checkInCycle = await prisma.workItem.findUnique({ where: { id: inCycleItem.id } });
    if (checkInCycle?.sprint_id !== cycle1.id) {
      throw new Error('Task should remain assigned to closed cycle when KEEP_IN_CYCLE is selected');
    }

    const checkContinuous = await prisma.workItem.findUnique({ where: { id: continuousItem.id } });
    if (checkContinuous?.sprint_id !== null) {
      throw new Error('Continuous item should remain null (unassigned)');
    }
    console.log('✓ PASS: Closed cycle preserves audit history and continuous flow items remain unassigned.');

    // -----------------------------------------------------------------
    // TEST 5: Delete Cycle and verify items disassociated safely
    // -----------------------------------------------------------------
    console.log('\n--- Test 5: Delete Planning Cycle ---');
    await SprintService.deleteSprint(kanbanProj.id, cycle1.id, adminUser);
    const checkAfterDelete = await prisma.workItem.findUnique({ where: { id: inCycleItem.id } });
    if (checkAfterDelete?.sprint_id !== null) {
      throw new Error('Deleted cycle must set work items sprint_id back to null (unassigned)');
    }
    console.log('✓ PASS: Deleted cycle safely returns deliverables back to continuous flow.');

    console.log('\n======================================================');
    console.log('ALL PLANNING CYCLES & SPRINT TESTS PASSED! ✓');
    console.log('======================================================');
  } finally {
    // Cleanup test data
    console.log('\nCleaning up test projects and records...');
    for (const pId of testProjectIds) {
      await prisma.workItem.deleteMany({ where: { project_id: pId } });
      await prisma.sprint.deleteMany({ where: { project_id: pId } });
      await prisma.project.deleteMany({ where: { id: pId } });
    }
    console.log('Cleanup finished.');
  }
}

runVerification()
  .catch((err) => {
    console.error('VERIFICATION FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
