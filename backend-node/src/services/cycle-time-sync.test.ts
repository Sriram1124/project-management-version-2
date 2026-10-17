import { prisma } from '../lib/prisma';
import { SprintService } from './sprint.service';
import { WorkItemService } from './work-item.service';
import { TimesheetService } from './timesheet.service';
import { WorkItemType, WorkItemStatus, WorkItemPriority, SprintStatus } from '@prisma/client';

export async function runCycleTimeSyncTests() {
  console.log('=== RUNNING CYCLE TIME TRACKING & SYNC TESTS ===');

  const user = await prisma.user.findFirst({
    where: {
      is_active: true,
      organization_id: { not: null },
    },
    include: { roles: { select: { role: { select: { name: true } } } } },
  });

  if (!user || !user.organization_id) {
    throw new Error('No active user with organization found for testing');
  }

  (user as any).role = 'MANAGER';

  const project = await prisma.project.findFirst({
    where: {
      organization_id: user.organization_id,
      status: { not: 'ARCHIVED' },
    },
  });

  if (!project) {
    throw new Error('No active project found for testing');
  }

  console.log(`[SETUP] Project: ${project.name} (${project.id}), User: ${user.name} (${user.id})`);

  // Create two test planning cycles
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 14);

  const cycle1 = await SprintService.createSprint(
    project.id,
    {
      name: `Test Cycle 1 ${Date.now()}`,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
    },
    user
  );

  const cycle2 = await SprintService.createSprint(
    project.id,
    {
      name: `Test Cycle 2 ${Date.now()}`,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
    },
    user
  );

  console.log(`[SETUP] Created Cycle 1 (${cycle1.id}) and Cycle 2 (${cycle2.id})`);

  try {
    // Create Task A assigned to Cycle 1
    const taskA = await WorkItemService.createWorkItem(user, {
      project_id: project.id,
      sprint_id: cycle1.id,
      type: WorkItemType.STORY,
      title: 'Story A with time',
      status: WorkItemStatus.IN_PROGRESS,
      priority: WorkItemPriority.MEDIUM,
      story_points: 3,
    });

    // Create Task B assigned to Cycle 1 (zero time logged)
    const taskB = await WorkItemService.createWorkItem(user, {
      project_id: project.id,
      sprint_id: cycle1.id,
      type: WorkItemType.STORY,
      title: 'Story B without time',
      status: WorkItemStatus.TODO,
      priority: WorkItemPriority.LOW,
      story_points: 2,
    });

    console.log(`[SETUP] Created Task A (${taskA.id}) and Task B (${taskB.id}) in Cycle 1`);

    // Verify initial cycle time is 0
    let sprints = await SprintService.listSprints(project.id, user);
    let c1Data = sprints.find((s) => s.id === cycle1.id);
    if (!c1Data || c1Data.total_logged_minutes !== 0) {
      throw new Error(`Expected Cycle 1 initial logged minutes to be 0, got ${c1Data?.total_logged_minutes}`);
    }
    console.log('✓ Initial cycle time is 0h for zero-entry tasks');

    // Add manual time entry 1: 90 mins (1h 30m) on Task A
    await TimesheetService.createTimeEntry(user, {
      task_id: taskA.id,
      project_id: project.id,
      duration_minutes: 90,
      notes: 'Initial development on Task A',
      date: new Date().toISOString(),
    });

    // Add manual time entry 2: 60 mins (1h) on Task A (multiple entries on same task)
    await TimesheetService.createTimeEntry(user, {
      task_id: taskA.id,
      project_id: project.id,
      duration_minutes: 60,
      notes: 'Testing Task A',
      date: new Date().toISOString(),
    });

    // Verify Cycle 1 now reflects 150 minutes (2h 30m)
    sprints = await SprintService.listSprints(project.id, user);
    c1Data = sprints.find((s) => s.id === cycle1.id);
    if (!c1Data || c1Data.total_logged_minutes !== 150) {
      throw new Error(`Expected Cycle 1 total_logged_minutes to be 150, got ${c1Data?.total_logged_minutes}`);
    }
    if (c1Data.total_logged_hours !== 2.5) {
      throw new Error(`Expected Cycle 1 total_logged_hours to be 2.5, got ${c1Data.total_logged_hours}`);
    }
    if (!c1Data.time_by_intern || c1Data.time_by_intern.length === 0 || c1Data.time_by_intern[0].logged_minutes !== 150) {
      throw new Error('Expected time_by_intern to reflect 150 mins for intern');
    }
    console.log('✓ Cycle 1 correctly aggregates multiple time entries on assigned task (150 mins / 2.5h)');

    // Verify work item query includes logged_minutes on Task A and Task B
    const workItems = await WorkItemService.listWorkItems(user, { project_id: project.id });
    const fetchedA = workItems.find((w: any) => w.id === taskA.id);
    const fetchedB = workItems.find((w: any) => w.id === taskB.id);
    if (!fetchedA || fetchedA.logged_minutes !== 150) {
      throw new Error(`Expected Task A logged_minutes to be 150, got ${fetchedA?.logged_minutes}`);
    }
    if (!fetchedB || fetchedB.logged_minutes !== 0) {
      throw new Error(`Expected Task B logged_minutes to be 0, got ${fetchedB?.logged_minutes}`);
    }
    console.log('✓ Task A has 150 logged_minutes and zero-entry Task B has 0 logged_minutes');

    // TEST REASSIGNMENT: Move Task A from Cycle 1 to Cycle 2
    console.log('\n--- Testing Cycle Reassignment ---');
    await WorkItemService.updateWorkItem(taskA.id, user, { sprint_id: cycle2.id });

    // Re-check sprints: Cycle 1 should have 0 mins, Cycle 2 should have 150 mins
    sprints = await SprintService.listSprints(project.id, user);
    const updatedC1 = sprints.find((s) => s.id === cycle1.id);
    const updatedC2 = sprints.find((s) => s.id === cycle2.id);

    if (!updatedC1 || updatedC1.total_logged_minutes !== 0) {
      throw new Error(`Expected Cycle 1 to have 0 mins after moving Task A, got ${updatedC1?.total_logged_minutes}`);
    }
    if (!updatedC2 || updatedC2.total_logged_minutes !== 150) {
      throw new Error(`Expected Cycle 2 to have 150 mins after receiving Task A, got ${updatedC2?.total_logged_minutes}`);
    }
    console.log('✓ Reassigning task to Cycle 2 transferred hours to Cycle 2 and removed them from Cycle 1');

    // Clean up test tasks & time entries
    await prisma.timeEntry.deleteMany({ where: { task_id: { in: [taskA.id, taskB.id] } } });
    await prisma.workItem.deleteMany({ where: { id: { in: [taskA.id, taskB.id] } } });
    console.log('✓ Cleanup completed');

    console.log('\n=== ALL CYCLE TIME SYNC TESTS PASSED! ===');
    return true;
  } finally {
    await prisma.sprint.deleteMany({ where: { id: { in: [cycle1.id, cycle2.id] } } });
  }
}

if (require.main === module) {
  runCycleTimeSyncTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Test execution failed:', err);
      process.exit(1);
    });
}
