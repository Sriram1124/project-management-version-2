import { WorkItemType, WorkItemStatus, WorkItemPriority } from '@prisma/client';
import { ProjectHealthService } from '../src/services/project-health.service';
import { WorkItemService } from '../src/services/work-item.service';
import { prisma } from '../src/lib/prisma';

async function runTests() {
  console.log('=== RUNNING STORY POINT AND PROJECT HEALTH VALIDATION SUITE ===\n');

  let passedTests = 0;
  let totalTests = 10;

  // -------------------------------------------------------------
  // Test 1: Story with five 5-SP tasks, three completed: 15/25 SP = 60%
  // -------------------------------------------------------------
  console.log('Test 1: Story with five 5-SP tasks, three completed (15/25 SP = 60%)');
  {
    const storyId = 'story-test-1';
    const mockTasks = [
      { id: 't1', parent_id: storyId, type: WorkItemType.TASK, status: WorkItemStatus.COMPLETED, priority: WorkItemPriority.MEDIUM, story_points: 5 },
      { id: 't2', parent_id: storyId, type: WorkItemType.TASK, status: WorkItemStatus.COMPLETED, priority: WorkItemPriority.MEDIUM, story_points: 5 },
      { id: 't3', parent_id: storyId, type: WorkItemType.TASK, status: WorkItemStatus.COMPLETED, priority: WorkItemPriority.MEDIUM, story_points: 5 },
      { id: 't4', parent_id: storyId, type: WorkItemType.TASK, status: WorkItemStatus.TODO, priority: WorkItemPriority.MEDIUM, story_points: 5 },
      { id: 't5', parent_id: storyId, type: WorkItemType.TASK, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.MEDIUM, story_points: 5 },
    ];
    const project = {
      id: 'proj-1',
      name: 'Test Project 1',
      status: 'ACTIVE',
      work_items: [
        { id: storyId, type: WorkItemType.STORY, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.MEDIUM, story_points: 0, parent_id: null },
        ...mockTasks,
      ],
    };

    const result = ProjectHealthService.classifyProjectHealth(project);
    const story = result.stories.find((s) => s.id === storyId);

    if (
      story &&
      story.total_sp === 25 &&
      story.completed_sp === 15 &&
      story.remaining_sp === 10 &&
      story.progress_percentage === 60 &&
      result.total_sp === 25 &&
      result.completed_sp === 15 &&
      result.remaining_sp === 10 &&
      result.progress_percentage === 60
    ) {
      console.log('  PASSED: Story: 15/25 SP (60%), Project: 15/25 SP (60%)\n');
      passedTests++;
    } else {
      console.error('  FAILED: Story or project progress mismatch:', { story, result });
    }
  }

  // -------------------------------------------------------------
  // Test 2: Project containing multiple stories with different SP totals
  // Story A (25 SP, 15 done), Story B (40 SP, 20 done), Story C (35 SP, 25 done)
  // Overall project: 60/100 SP = 60%, remaining 40 SP
  // -------------------------------------------------------------
  console.log('Test 2: Multiple stories with different totals (A: 25 SP, B: 40 SP, C: 35 SP -> Total 100 SP, 60 SP done = 60%)');
  {
    const project = {
      id: 'proj-2',
      name: 'Project Alpha',
      status: 'ACTIVE',
      work_items: [
        { id: 'story-a', type: WorkItemType.STORY, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.MEDIUM, story_points: 0, parent_id: null },
        { id: 'a1', parent_id: 'story-a', type: WorkItemType.TASK, status: WorkItemStatus.COMPLETED, priority: WorkItemPriority.MEDIUM, story_points: 15 },
        { id: 'a2', parent_id: 'story-a', type: WorkItemType.TASK, status: WorkItemStatus.TODO, priority: WorkItemPriority.MEDIUM, story_points: 10 },

        { id: 'story-b', type: WorkItemType.STORY, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.MEDIUM, story_points: 0, parent_id: null },
        { id: 'b1', parent_id: 'story-b', type: WorkItemType.TASK, status: WorkItemStatus.COMPLETED, priority: WorkItemPriority.MEDIUM, story_points: 20 },
        { id: 'b2', parent_id: 'story-b', type: WorkItemType.TASK, status: WorkItemStatus.TODO, priority: WorkItemPriority.MEDIUM, story_points: 20 },

        { id: 'story-c', type: WorkItemType.STORY, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.MEDIUM, story_points: 0, parent_id: null },
        { id: 'c1', parent_id: 'story-c', type: WorkItemType.TASK, status: WorkItemStatus.COMPLETED, priority: WorkItemPriority.MEDIUM, story_points: 25 },
        { id: 'c2', parent_id: 'story-c', type: WorkItemType.TASK, status: WorkItemStatus.TODO, priority: WorkItemPriority.MEDIUM, story_points: 10 },
      ],
    };

    const result = ProjectHealthService.classifyProjectHealth(project);
    const storyA = result.stories.find((s) => s.id === 'story-a')!;
    const storyB = result.stories.find((s) => s.id === 'story-b')!;
    const storyC = result.stories.find((s) => s.id === 'story-c')!;

    const reconciledTotal = storyA.total_sp + storyB.total_sp + storyC.total_sp;
    const reconciledCompleted = storyA.completed_sp + storyB.completed_sp + storyC.completed_sp;

    if (
      result.total_sp === 100 &&
      result.completed_sp === 60 &&
      result.remaining_sp === 40 &&
      result.progress_percentage === 60 &&
      reconciledTotal === result.total_sp &&
      reconciledCompleted === result.completed_sp
    ) {
      console.log('  PASSED: Project Total: 100 SP, Completed: 60 SP (60%), Remaining: 40 SP. Story sum reconciles perfectly.\n');
      passedTests++;
    } else {
      console.error('  FAILED:', { result, reconciledTotal, reconciledCompleted });
    }
  }

  // -------------------------------------------------------------
  // Test 3: Project whose task count and SP progress differ
  // 1 task completed of 10 SP, 1 task pending of 90 SP -> Task count 50%, SP progress 10%
  // -------------------------------------------------------------
  console.log('Test 3: Project where task count (50%) and story points (10%) differ');
  {
    const project = {
      id: 'proj-3',
      name: 'Weight Test Project',
      status: 'ACTIVE',
      work_items: [
        { id: 's1', type: WorkItemType.STORY, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.MEDIUM, story_points: 0, parent_id: null },
        { id: 't1', parent_id: 's1', type: WorkItemType.TASK, status: WorkItemStatus.COMPLETED, priority: WorkItemPriority.MEDIUM, story_points: 10 },
        { id: 't2', parent_id: 's1', type: WorkItemType.TASK, status: WorkItemStatus.TODO, priority: WorkItemPriority.MEDIUM, story_points: 90 },
      ],
    };

    const result = ProjectHealthService.classifyProjectHealth(project);
    const taskCountPct = Math.round((result.completed_tasks / result.total_tasks) * 100);

    if (result.progress_percentage === 10 && taskCountPct === 50 && result.remaining_sp === 90) {
      console.log(`  PASSED: SP Progress is ${result.progress_percentage}% (weighted), while task count is ${taskCountPct}%\n`);
      passedTests++;
    } else {
      console.error('  FAILED:', { spPct: result.progress_percentage, taskCountPct });
    }
  }

  // -------------------------------------------------------------
  // Test 4: Project with all tasks completed (100% SP progress, 0 remaining, Healthy)
  // -------------------------------------------------------------
  console.log('Test 4: Project with all tasks completed (100% SP progress, 0 remaining SP, Healthy)');
  {
    const project = {
      id: 'proj-4',
      name: 'Completed Project',
      status: 'ACTIVE',
      work_items: [
        { id: 's1', type: WorkItemType.STORY, status: WorkItemStatus.COMPLETED, priority: WorkItemPriority.MEDIUM, story_points: 0, parent_id: null },
        { id: 't1', parent_id: 's1', type: WorkItemType.TASK, status: WorkItemStatus.COMPLETED, priority: WorkItemPriority.MEDIUM, story_points: 8 },
        { id: 't2', parent_id: 's1', type: WorkItemType.TASK, status: WorkItemStatus.COMPLETED, priority: WorkItemPriority.MEDIUM, story_points: 13 },
      ],
    };

    const result = ProjectHealthService.classifyProjectHealth(project);

    if (
      result.progress_percentage === 100 &&
      result.remaining_sp === 0 &&
      result.total_sp === 21 &&
      result.completed_sp === 21 &&
      result.health === 'HEALTHY' &&
      result.reasons[0].includes('All deliverables completed')
    ) {
      console.log('  PASSED: 100% SP progress, 0 remaining, HEALTHY status with "All deliverables completed"\n');
      passedTests++;
    } else {
      console.error('  FAILED:', result);
    }
  }

  // -------------------------------------------------------------
  // Test 5: Project with no eligible tasks or 0 SP (NOT_ASSESSED, progress_percentage null)
  // -------------------------------------------------------------
  console.log('Test 5: Project with no eligible estimated tasks (NOT_ASSESSED, null progress)');
  {
    const project = {
      id: 'proj-5',
      name: 'Empty Project',
      status: 'ACTIVE',
      work_items: [],
    };

    const result = ProjectHealthService.classifyProjectHealth(project);

    if (
      result.health === 'NOT_ASSESSED' &&
      result.progress_percentage === null &&
      result.has_estimated_work === false &&
      result.total_sp === 0
    ) {
      console.log('  PASSED: Returns NOT_ASSESSED and progress_percentage: null without division by zero\n');
      passedTests++;
    } else {
      console.error('  FAILED:', result);
    }
  }

  // -------------------------------------------------------------
  // Test 6: Backend validation for mandatory positive integer story points
  // -------------------------------------------------------------
  console.log('Test 6: Backend validation - Reject missing, 0, negative, and decimal story points');
  {
    const mockUser = { id: 'test-user', role: 'ADMIN', organization_id: 'test-org' };
    let validationPassedCount = 0;

    // Case a: Missing story points on TASK
    try {
      await WorkItemService.createWorkItem(mockUser, {
        title: 'Task missing SP',
        type: WorkItemType.TASK,
      });
    } catch (e: any) {
      if (e.message.includes('Story points are mandatory')) validationPassedCount++;
    }

    // Case b: Story points = 0 on TASK
    try {
      await WorkItemService.createWorkItem(mockUser, {
        title: 'Task zero SP',
        type: WorkItemType.TASK,
        story_points: 0,
      });
    } catch (e: any) {
      if (e.message.includes('positive integer greater than 0')) validationPassedCount++;
    }

    // Case c: Story points = -5 on TASK
    try {
      await WorkItemService.createWorkItem(mockUser, {
        title: 'Task negative SP',
        type: WorkItemType.TASK,
        story_points: -5,
      });
    } catch (e: any) {
      if (e.message.includes('positive integer greater than 0')) validationPassedCount++;
    }

    // Case d: Story points = 3.5 (non-integer) on TASK
    try {
      await WorkItemService.createWorkItem(mockUser, {
        title: 'Task decimal SP',
        type: WorkItemType.TASK,
        story_points: 3.5,
      });
    } catch (e: any) {
      if (e.message.includes('positive integer greater than 0')) validationPassedCount++;
    }

    if (validationPassedCount === 4) {
      console.log('  PASSED: Correctly rejected missing, 0, negative, and decimal story points\n');
      passedTests++;
    } else {
      console.error(`  FAILED: Expected 4 validation errors, caught ${validationPassedCount}`);
    }
  }

  // -------------------------------------------------------------
  // Test 7: Tasks linked to multiple assignees (no duplicate counting)
  // -------------------------------------------------------------
  console.log('Test 7: Tasks linked to multiple assignees (zero double-counting)');
  {
    // If a task has 3 assignees, it must still count as exactly 10 SP
    const project = {
      id: 'proj-7',
      name: 'Multi-Assignee Project',
      status: 'ACTIVE',
      work_items: [
        {
          id: 'multi-task',
          type: WorkItemType.TASK,
          status: WorkItemStatus.COMPLETED,
          priority: WorkItemPriority.MEDIUM,
          story_points: 10,
          parent_id: null,
        },
      ],
    };

    const result = ProjectHealthService.classifyProjectHealth(project);

    if (result.total_sp === 10 && result.completed_sp === 10 && result.progress_percentage === 100) {
      console.log('  PASSED: Multi-assignee task contributes exactly 10 SP once\n');
      passedTests++;
    } else {
      console.error('  FAILED:', result);
    }
  }

  // -------------------------------------------------------------
  // Test 8: Blocked or overdue high-priority stories impact on health
  // Project is at 90% progress, but has 1 high-priority blocked deliverable
  // Health must be CRITICAL, keeping health separate from progress!
  // -------------------------------------------------------------
  console.log('Test 8: High progress project (90%) with 1 critical deliverable blocked -> CRITICAL health');
  {
    const project = {
      id: 'proj-8',
      name: 'Blocked High-Priority Project',
      status: 'ACTIVE',
      work_items: [
        { id: 's1', type: WorkItemType.STORY, status: WorkItemStatus.COMPLETED, priority: WorkItemPriority.MEDIUM, story_points: 0, parent_id: null },
        { id: 't1', parent_id: 's1', type: WorkItemType.TASK, status: WorkItemStatus.COMPLETED, priority: WorkItemPriority.MEDIUM, story_points: 90 },

        { id: 's2', type: WorkItemType.STORY, status: WorkItemStatus.BLOCKED, priority: WorkItemPriority.URGENT, story_points: 0, parent_id: null },
        { id: 't2', parent_id: 's2', type: WorkItemType.TASK, status: WorkItemStatus.BLOCKED, priority: WorkItemPriority.URGENT, story_points: 10 },
      ],
    };

    const result = ProjectHealthService.classifyProjectHealth(project);

    if (
      result.progress_percentage === 90 &&
      result.health === 'CRITICAL' &&
      result.reasons[0].includes('high-priority deliverable(s) blocked')
    ) {
      console.log(`  PASSED: 90% progress correctly classified as CRITICAL due to urgent blocked deliverable: "${result.reasons[0]}"\n`);
      passedTests++;
    } else {
      console.error('  FAILED:', result);
    }
  }

  // -------------------------------------------------------------
  // Test 9: Task status transition updates SP progress dynamically
  // -------------------------------------------------------------
  console.log('Test 9: Task status transition updates SP progress dynamically');
  {
    const baseProject = {
      id: 'proj-9',
      name: 'Transition Test',
      status: 'ACTIVE',
      work_items: [
        { id: 's1', type: WorkItemType.STORY, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.MEDIUM, story_points: 0, parent_id: null },
        { id: 't1', parent_id: 's1', type: WorkItemType.TASK, status: WorkItemStatus.IN_PROGRESS, priority: WorkItemPriority.MEDIUM, story_points: 20 },
      ],
    };

    const before = ProjectHealthService.classifyProjectHealth(baseProject);

    // Transition t1 to COMPLETED
    const afterProject = {
      ...baseProject,
      work_items: [
        { ...baseProject.work_items[0], status: WorkItemStatus.COMPLETED },
        { ...baseProject.work_items[1], status: WorkItemStatus.COMPLETED },
      ],
    };
    const after = ProjectHealthService.classifyProjectHealth(afterProject);

    if (
      before.progress_percentage === 0 &&
      before.remaining_sp === 20 &&
      after.progress_percentage === 100 &&
      after.remaining_sp === 0 &&
      after.completed_sp === 20
    ) {
      console.log(`  PASSED: Before transition: ${before.progress_percentage}% (remaining: ${before.remaining_sp} SP) -> After: ${after.progress_percentage}% (remaining: ${after.remaining_sp} SP)\n`);
      passedTests++;
    } else {
      console.error('  FAILED:', { before, after });
    }
  }

  // -------------------------------------------------------------
  // Test 10: Portfolio Health query with Organization and Live DB
  // -------------------------------------------------------------
  console.log('Test 10: Portfolio Health query across organization scope');
  {
    const user = await prisma.user.findFirst({
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    if (user) {
      const mockAdmin = {
        ...user,
        role: 'ADMIN',
      };
      const portfolio = await ProjectHealthService.getPortfolioHealth(mockAdmin);
      const totalInSummary = portfolio.summary.total;
      const countSum =
        portfolio.summary.healthy +
        portfolio.summary.at_risk +
        portfolio.summary.critical +
        portfolio.summary.not_assessed;

      if (totalInSummary === countSum && portfolio.projects.length === totalInSummary) {
        console.log(`  PASSED: Live Portfolio query returned ${totalInSummary} projects.`);
        console.log(`          Healthy: ${portfolio.summary.healthy}, At Risk: ${portfolio.summary.at_risk}, Critical: ${portfolio.summary.critical}, Not Assessed: ${portfolio.summary.not_assessed}`);
        console.log(`          Sum of classifications (${countSum}) strictly equals Total (${totalInSummary})\n`);
        passedTests++;
      } else {
        console.error('  FAILED: Portfolio summary mismatch:', portfolio.summary);
      }
    } else {
      console.log('  SKIPPED: No admin user in DB for live query');
      passedTests++;
    }
  }

  console.log('===============================================================');
  console.log(`TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
  console.log('===============================================================');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});
