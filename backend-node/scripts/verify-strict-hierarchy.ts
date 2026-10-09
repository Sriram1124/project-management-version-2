import { prisma } from '../src/lib/prisma';
import { WorkItemService } from '../src/services/work-item.service';
import { WorkItemType, WorkItemStatus, WorkItemPriority } from '@prisma/client';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function runHierarchyVerification() {
  console.log('=== STARTING STRICT JIRA HIERARCHY VERIFICATION ===\n');
  const results: TestResult[] = [];
  const createdIds: string[] = [];

  // 1. Fetch user and project
  const user = await prisma.user.findFirst({
    where: {
      is_active: true,
      roles: {
        some: {
          role: {
            name: { in: ['MANAGER', 'ADMIN'] },
          },
        },
      },
    },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  });

  if (!user || !user.organization_id) {
    throw new Error('No active manager/admin user found to run verification.');
  }

  const project = await prisma.project.findFirst({
    where: { organization_id: user.organization_id },
  });

  if (!project) {
    throw new Error('No project found in organization to run verification.');
  }

  console.log(`Testing with User: ${user.name} (${user.email}) [Org: ${user.organization_id}]`);
  console.log(`Testing with Project: ${project.name} (${project.id})\n`);

  const mockUser = {
    id: user.id,
    organization_id: user.organization_id,
    role: 'MANAGER',
    roles: user.roles,
  };

  const testCase = async (
    name: string,
    action: () => Promise<any>,
    expectSuccess: boolean,
    expectedErrorSubstring?: string
  ) => {
    try {
      const res = await action();
      if (res?.id) createdIds.push(res.id);

      if (expectSuccess) {
        results.push({ name, passed: true });
        console.log(`[PASS] ${name}`);
      } else {
        results.push({
          name,
          passed: false,
          error: 'Expected failure, but operation succeeded unexpectedly.',
        });
        console.error(`[FAIL] ${name}: Expected failure, but succeeded.`);
      }
    } catch (err: any) {
      if (!expectSuccess) {
        const msg = err?.message || '';
        if (expectedErrorSubstring && !msg.toLowerCase().includes(expectedErrorSubstring.toLowerCase())) {
          results.push({
            name,
            passed: false,
            error: `Expected error message containing "${expectedErrorSubstring}", got: "${msg}"`,
          });
          console.error(`[FAIL] ${name}: Got error "${msg}", expected substring "${expectedErrorSubstring}"`);
        } else {
          results.push({ name, passed: true });
          console.log(`[PASS] ${name} (Rejected with expected error: "${msg}")`);
        }
      } else {
        results.push({
          name,
          passed: false,
          error: `Expected success, but failed with: ${err?.message}`,
        });
        console.error(`[FAIL] ${name}: ${err?.message}`);
      }
    }
  };

  // ---------------------------------------------------------
  // SECTION 1: Top-level in Project (parent_id = null, project_id != null)
  // ---------------------------------------------------------
  console.log('\n--- SECTION 1: Root Project Items ---');
  let testEpicId: string = '';

  await testCase('1.1 Create EPIC at project root (Allowed)', async () => {
    const epic = await WorkItemService.createWorkItem(mockUser, {
      project_id: project.id,
      type: WorkItemType.EPIC,
      title: 'TEST_EPIC_ROOT',
    });
    testEpicId = epic.id;
    return epic;
  }, true);

  await testCase('1.2 Create STORY at project root (Rejected)', async () => {
    return await WorkItemService.createWorkItem(mockUser, {
      project_id: project.id,
      type: WorkItemType.STORY,
      title: 'TEST_STORY_ROOT',
    });
  }, false, 'must have a parent work item. Only EPIC can be created at the project root');

  await testCase('1.3 Create TASK at project root (Rejected)', async () => {
    return await WorkItemService.createWorkItem(mockUser, {
      project_id: project.id,
      type: WorkItemType.TASK,
      title: 'TEST_TASK_ROOT',
    });
  }, false, 'must have a parent work item. Only EPIC can be created at the project root');

  await testCase('1.4 Create SUBTASK at project root (Rejected)', async () => {
    return await WorkItemService.createWorkItem(mockUser, {
      project_id: project.id,
      type: WorkItemType.SUBTASK,
      title: 'TEST_SUBTASK_ROOT',
    });
  }, false, 'must have a parent work item. Only EPIC can be created at the project root');

  await testCase('1.5 Create BUG at project root (Rejected)', async () => {
    return await WorkItemService.createWorkItem(mockUser, {
      project_id: project.id,
      type: WorkItemType.BUG,
      title: 'TEST_BUG_ROOT',
    });
  }, false, 'must have a parent work item. Only EPIC can be created at the project root');

  // ---------------------------------------------------------
  // SECTION 2: Manager Personal Tasks (project_id = null)
  // ---------------------------------------------------------
  console.log('\n--- SECTION 2: Manager Personal Tasks ---');

  let testPersonalTaskId: string = '';
  await testCase('2.1 Create TASK as personal item (Allowed)', async () => {
    const item = await WorkItemService.createWorkItem(mockUser, {
      project_id: null,
      parent_id: null,
      type: WorkItemType.TASK,
      title: 'TEST_PERSONAL_TASK',
    });
    testPersonalTaskId = item.id;
    return item;
  }, true);

  await testCase('2.2 Create EPIC as personal item (Rejected)', async () => {
    return await WorkItemService.createWorkItem(mockUser, {
      project_id: null,
      parent_id: null,
      type: WorkItemType.EPIC,
      title: 'TEST_PERSONAL_EPIC',
    });
  }, false, 'Personal tasks without a project must be of type TASK');

  await testCase('2.3 Create STORY as personal item (Rejected)', async () => {
    return await WorkItemService.createWorkItem(mockUser, {
      project_id: null,
      parent_id: null,
      type: WorkItemType.STORY,
      title: 'TEST_PERSONAL_STORY',
    });
  }, false, 'Personal tasks without a project must be of type TASK');

  await testCase('2.4 Create SUBTASK as personal item (Rejected)', async () => {
    return await WorkItemService.createWorkItem(mockUser, {
      project_id: null,
      parent_id: null,
      type: WorkItemType.SUBTASK,
      title: 'TEST_PERSONAL_SUBTASK',
    });
  }, false, 'Personal tasks without a project must be of type TASK');

  // ---------------------------------------------------------
  // SECTION 3: Children of EPIC (EPIC -> STORY or BUG only)
  // ---------------------------------------------------------
  console.log('\n--- SECTION 3: Children of EPIC ---');
  let testStoryId: string = '';
  let testEpicBugId: string = '';

  await testCase('3.1 Create STORY under EPIC (Allowed)', async () => {
    const story = await WorkItemService.createWorkItem(mockUser, {
      project_id: project.id,
      parent_id: testEpicId,
      type: WorkItemType.STORY,
      title: 'TEST_EPIC_STORY',
    });
    testStoryId = story.id;
    return story;
  }, true);

  await testCase('3.2 Create BUG under EPIC (Allowed)', async () => {
    const bug = await WorkItemService.createWorkItem(mockUser, {
      project_id: project.id,
      parent_id: testEpicId,
      type: WorkItemType.BUG,
      title: 'TEST_EPIC_BUG',
    });
    testEpicBugId = bug.id;
    return bug;
  }, true);

  await testCase('3.3 Create TASK under EPIC (Rejected)', async () => {
    return await WorkItemService.createWorkItem(mockUser, {
      project_id: project.id,
      parent_id: testEpicId,
      type: WorkItemType.TASK,
      title: 'TEST_EPIC_TASK_INVALID',
    });
  }, false, 'An EPIC can only contain STORY or BUG');

  await testCase('3.4 Create SUBTASK under EPIC (Rejected)', async () => {
    return await WorkItemService.createWorkItem(mockUser, {
      project_id: project.id,
      parent_id: testEpicId,
      type: WorkItemType.SUBTASK,
      title: 'TEST_EPIC_SUBTASK_INVALID',
    });
  }, false, 'An EPIC can only contain STORY or BUG');

  await testCase('3.5 Create EPIC under EPIC (Rejected)', async () => {
    return await WorkItemService.createWorkItem(mockUser, {
      project_id: project.id,
      parent_id: testEpicId,
      type: WorkItemType.EPIC,
      title: 'TEST_EPIC_UNDER_EPIC_INVALID',
    });
  }, false, 'EPIC cannot have a parent');

  // ---------------------------------------------------------
  // SECTION 4: Children of STORY (STORY -> TASK or BUG only)
  // ---------------------------------------------------------
  console.log('\n--- SECTION 4: Children of STORY ---');
  let testTaskId: string = '';

  await testCase('4.1 Create TASK under STORY (Allowed)', async () => {
    const task = await WorkItemService.createWorkItem(mockUser, {
      project_id: project.id,
      parent_id: testStoryId,
      type: WorkItemType.TASK,
      title: 'TEST_STORY_TASK',
    });
    testTaskId = task.id;
    return task;
  }, true);

  await testCase('4.2 Create BUG under STORY (Allowed)', async () => {
    return await WorkItemService.createWorkItem(mockUser, {
      project_id: project.id,
      parent_id: testStoryId,
      type: WorkItemType.BUG,
      title: 'TEST_STORY_BUG',
    });
  }, true);

  await testCase('4.3 Create STORY under STORY (Rejected)', async () => {
    return await WorkItemService.createWorkItem(mockUser, {
      project_id: project.id,
      parent_id: testStoryId,
      type: WorkItemType.STORY,
      title: 'TEST_STORY_UNDER_STORY_INVALID',
    });
  }, false, 'A STORY can only contain TASK or BUG');

  await testCase('4.4 Create SUBTASK under STORY (Rejected)', async () => {
    return await WorkItemService.createWorkItem(mockUser, {
      project_id: project.id,
      parent_id: testStoryId,
      type: WorkItemType.SUBTASK,
      title: 'TEST_SUBTASK_UNDER_STORY_INVALID',
    });
  }, false, 'A STORY can only contain TASK or BUG');

  // ---------------------------------------------------------
  // SECTION 5: Children of TASK (TASK -> SUBTASK only)
  // ---------------------------------------------------------
  console.log('\n--- SECTION 5: Children of TASK ---');
  let testSubtaskId: string = '';

  await testCase('5.1 Create SUBTASK under TASK (Allowed)', async () => {
    const subtask = await WorkItemService.createWorkItem(mockUser, {
      project_id: project.id,
      parent_id: testTaskId,
      type: WorkItemType.SUBTASK,
      title: 'TEST_TASK_SUBTASK',
    });
    testSubtaskId = subtask.id;
    return subtask;
  }, true);

  await testCase('5.2 Create TASK under TASK (Rejected)', async () => {
    return await WorkItemService.createWorkItem(mockUser, {
      project_id: project.id,
      parent_id: testTaskId,
      type: WorkItemType.TASK,
      title: 'TEST_TASK_UNDER_TASK_INVALID',
    });
  }, false, 'A TASK can only contain SUBTASK');

  await testCase('5.3 Create STORY under TASK (Rejected)', async () => {
    return await WorkItemService.createWorkItem(mockUser, {
      project_id: project.id,
      parent_id: testTaskId,
      type: WorkItemType.STORY,
      title: 'TEST_STORY_UNDER_TASK_INVALID',
    });
  }, false, 'A TASK can only contain SUBTASK');

  await testCase('5.4 Create BUG under TASK (Rejected)', async () => {
    return await WorkItemService.createWorkItem(mockUser, {
      project_id: project.id,
      parent_id: testTaskId,
      type: WorkItemType.BUG,
      title: 'TEST_BUG_UNDER_TASK_INVALID',
    });
  }, false, 'A TASK can only contain SUBTASK');

  // ---------------------------------------------------------
  // SECTION 6: Leaf items (SUBTASK and BUG cannot have children)
  // ---------------------------------------------------------
  console.log('\n--- SECTION 6: Leaf items (SUBTASK & BUG) ---');

  await testCase('6.1 Create child under SUBTASK (Rejected)', async () => {
    return await WorkItemService.createWorkItem(mockUser, {
      project_id: project.id,
      parent_id: testSubtaskId,
      type: WorkItemType.SUBTASK,
      title: 'TEST_LEAF_SUBTASK_INVALID',
    });
  }, false, 'A SUBTASK is a leaf item and cannot have child work items');

  await testCase('6.2 Create child under BUG (Rejected)', async () => {
    return await WorkItemService.createWorkItem(mockUser, {
      project_id: project.id,
      parent_id: testEpicBugId,
      type: WorkItemType.SUBTASK,
      title: 'TEST_LEAF_BUG_INVALID',
    });
  }, false, 'A BUG is a leaf item and cannot have child work items');

  // ---------------------------------------------------------
  // SECTION 7: Cycle Detection in Updates
  // ---------------------------------------------------------
  console.log('\n--- SECTION 7: Cycle Detection in Updates ---');

  await testCase('7.1 Self-referencing update A -> A (Rejected)', async () => {
    return await WorkItemService.updateWorkItem(testStoryId, mockUser, {
      parent_id: testStoryId,
    });
  }, false, 'an item cannot be its own parent');

  await testCase('7.2 Circular dependency update A -> B -> A (Rejected)', async () => {
    return await WorkItemService.updateWorkItem(testEpicId, mockUser, {
      parent_id: testStoryId,
    });
  }, false, 'Circular parent-child relationship detected');

  // ---------------------------------------------------------
  // SECTION 8: Type Mutation with Existing Children
  // ---------------------------------------------------------
  console.log('\n--- SECTION 8: Type Mutation with Existing Children ---');

  await testCase('8.1 Mutate TASK with subtask to SUBTASK (Rejected)', async () => {
    return await WorkItemService.updateWorkItem(testTaskId, mockUser, {
      type: WorkItemType.SUBTASK,
    });
  }, false, 'A STORY can only contain TASK or BUG work items');

  await testCase('8.2 Mutate STORY with task to BUG (Rejected)', async () => {
    return await WorkItemService.updateWorkItem(testStoryId, mockUser, {
      type: WorkItemType.BUG,
    });
  }, false, 'Cannot change type to BUG');

  // ---------------------------------------------------------
  // SECTION 9: Cross-Project and Boundary Parent Integrity
  // ---------------------------------------------------------
  console.log('\n--- SECTION 9: Cross-Project and Boundary Parent Integrity ---');

  await testCase('9.1 Project item with personal task parent (Rejected)', async () => {
    return await WorkItemService.createWorkItem(mockUser, {
      project_id: project.id,
      parent_id: testPersonalTaskId,
      type: WorkItemType.SUBTASK,
      title: 'TEST_PROJECT_ITEM_PERSONAL_PARENT',
    });
  }, false, 'Cross-project parent relationships are not allowed');

  await testCase('9.2 Personal task with project work item as parent (Rejected)', async () => {
    return await WorkItemService.createWorkItem(mockUser, {
      project_id: null,
      parent_id: testStoryId,
      type: WorkItemType.TASK,
      title: 'TEST_PERSONAL_TASK_WITH_PROJECT_PARENT',
    });
  }, false, 'Personal tasks cannot have a project work item as a parent');

  // ---------------------------------------------------------
  // CLEANUP
  // ---------------------------------------------------------
  console.log('\n--- CLEANING UP TEST ITEMS ---');
  // Delete in reverse order of hierarchy (subtask -> task -> story/bug -> epic)
  for (const id of createdIds.reverse()) {
    try {
      await prisma.workItemAssignee.deleteMany({ where: { work_item_id: id } });
      await prisma.workItem.delete({ where: { id } });
    } catch (e: any) {
      console.warn(`Could not delete test item ${id}: ${e?.message}`);
    }
  }

  // ---------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------
  console.log('\n========================================');
  console.log('HIERARCHY VERIFICATION SUMMARY');
  console.log('========================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  console.log(`Total tests: ${results.length}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);

  if (failedCount > 0) {
    console.error('\nFAILED TESTS:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.error(`- ${r.name}: ${r.error}`));
    process.exit(1);
  } else {
    console.log(`\nALL ${results.length} HIERARCHY TESTS PASSED PERFECTLY!`);
    process.exit(0);
  }
}

runHierarchyVerification().catch((err) => {
  console.error('FATAL VERIFICATION ERROR:', err);
  process.exit(1);
});
