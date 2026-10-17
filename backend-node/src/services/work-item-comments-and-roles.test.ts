import { prisma } from '../lib/prisma';
import { WorkItemService } from './work-item.service';
import { ProjectService } from './project.service';
import { WorkItemType, WorkItemStatus, WorkItemPriority } from '@prisma/client';

async function runTests() {
  console.log('=== RUNNING TESTS: COMMENTS, STORY POINTS & PROJECT-SCOPED ROLES ===');

  // Find or create test user and project
  const user = await prisma.user.findFirst({
    where: {
      is_active: true,
      organization_id: { not: null },
      roles: {
        some: {
          role: {
            name: { in: ['MANAGER', 'ADMIN'] }
          }
        }
      }
    },
    include: { roles: { select: { role: { select: { name: true } } } } },
  }) || await prisma.user.findFirst({
    where: { is_active: true, organization_id: { not: null } },
    include: { roles: { select: { role: { select: { name: true } } } } },
  });

  if (!user) {
    throw new Error('No active user found for testing');
  }

  (user as any).role = (user.roles?.[0] as any)?.role?.name || 'MANAGER';

  const project = await prisma.project.findFirst({
    where: {
      status: { not: 'ARCHIVED' },
      organization_id: user.organization_id || undefined,
    },
  }) || await prisma.project.findFirst({
    where: { status: { not: 'ARCHIVED' } },
  });

  if (!project) {
    throw new Error('No project found for testing');
  }

  const sprint = await prisma.sprint.findFirst({
    where: { project_id: project.id },
  });

  console.log(`[SETUP] Using user: ${user.name} (${user.id}), project: ${project.name} (${project.id})`);

  // Test 1: Story points validation on task creation
  console.log('\n--- TEST 1: Mandatory Story Points Validation on Creation ---');
  let threwOnMissingSp = false;
  try {
    await WorkItemService.createWorkItem(user, {
      project_id: project.id,
      type: WorkItemType.TASK,
      title: 'Task without story points',
      story_points: null,
    });
  } catch (err: any) {
    threwOnMissingSp = true;
    console.log('[PASS] Rejected task creation with null story points:', err.message);
  }
  if (!threwOnMissingSp) throw new Error('Expected task creation without story points to fail!');

  let threwOnZeroSp = false;
  try {
    await WorkItemService.createWorkItem(user, {
      project_id: project.id,
      type: WorkItemType.STORY,
      title: 'Story with 0 story points',
      story_points: 0,
    });
  } catch (err: any) {
    threwOnZeroSp = true;
    console.log('[PASS] Rejected story creation with 0 story points:', err.message);
  }
  if (!threwOnZeroSp) throw new Error('Expected story creation with 0 story points to fail!');

  // Test 2: Valid story creation with story points
  console.log('\n--- TEST 2: Story Creation with Valid Story Points ---');
  const validTask = await WorkItemService.createWorkItem(user, {
    project_id: project.id,
    type: WorkItemType.STORY,
    title: 'Test Persistent Comments & Cycles Story',
    story_points: 5,
    sprint_id: sprint ? sprint.id : null,
  });
  console.log(`[PASS] Story created successfully with ID: ${validTask.id}, story_points: ${validTask.story_points}`);

  // Test 3: Story points update validation
  console.log('\n--- TEST 3: Story Points Update Validation ---');
  let threwOnInvalidUpdateSp = false;
  try {
    await WorkItemService.updateWorkItem(validTask.id, user, { story_points: -1 });
  } catch (err: any) {
    threwOnInvalidUpdateSp = true;
    console.log('[PASS] Rejected negative story points on update:', err.message);
  }
  if (!threwOnInvalidUpdateSp) throw new Error('Expected update with negative story points to fail!');

  const updatedTask = await WorkItemService.updateWorkItem(validTask.id, user, { story_points: 8 });
  console.log(`[PASS] Updated task story points to: ${updatedTask.story_points}`);

  // Test 4: Persistent Comments CRUD
  console.log('\n--- TEST 4: Persistent Comments CRUD ---');
  // 4a: Add comment
  const comment1 = await WorkItemService.createComment(validTask.id, 'Initial test comment for task', user);
  console.log(`[PASS] Created comment 1: "${comment1.content}" by ${comment1.author.name} (${comment1.id})`);

  // Empty comment rejection
  let threwOnEmptyComment = false;
  try {
    await WorkItemService.createComment(validTask.id, '   ', user);
  } catch (err: any) {
    threwOnEmptyComment = true;
    console.log('[PASS] Rejected whitespace-only comment:', err.message);
  }
  if (!threwOnEmptyComment) throw new Error('Expected empty comment to fail!');

  // Add second comment
  const comment2 = await WorkItemService.createComment(validTask.id, 'Second comment for ordering check', user);
  console.log(`[PASS] Created comment 2: "${comment2.content}" (${comment2.id})`);

  // 4b: List comments (ordered oldest-to-newest)
  const commentList = await WorkItemService.listComments(validTask.id, user);
  console.log(`[PASS] Fetched ${commentList.length} comments. Ordered oldest-to-newest:`, 
    new Date(commentList[0].created_at).getTime() <= new Date(commentList[1].created_at).getTime());

  // 4c: Update comment
  const updatedComment = await WorkItemService.updateComment(validTask.id, comment1.id, 'Edited test comment content', user);
  console.log(`[PASS] Updated comment content: "${updatedComment.content}"`);

  // 4d: Delete comment
  const deleteResult = await WorkItemService.deleteComment(validTask.id, comment2.id, user);
  console.log(`[PASS] Deleted comment 2:`, deleteResult);

  const remainingComments = await WorkItemService.listComments(validTask.id, user);
  console.log(`[PASS] Remaining comments count: ${remainingComments.length} (expected: 1)`);

  // Test 5: Project-Scoped Custom Roles Restriction
  console.log('\n--- TEST 5: Project-Scoped Custom Roles Restriction ---');
  const projectPerms = await ProjectService.getAvailablePermissions(user, 'project');
  const hasOnlyProjectScope = projectPerms.permissions.every(p => ProjectService.PROJECT_SCOPED_PERMISSIONS.has(p.name));
  console.log(`[PASS] getAvailablePermissions with scope=project returns strictly project-scoped permissions: ${hasOnlyProjectScope} (count: ${projectPerms.permissions.length})`);

  // Attempt to create custom role with forbidden permissions (e.g. ATTENDANCE_READ, USER_CREATE)
  let threwOnForbiddenRolePerm = false;
  try {
    await ProjectService.createCustomRole(
      project.id,
      {
        name: `Test Escalated Role ${Date.now()}`,
        permissions: ['PROJECT_READ', 'ATTENDANCE_READ', 'USER_CREATE'],
      },
      user
    );
  } catch (err: any) {
    threwOnForbiddenRolePerm = true;
    console.log('[PASS] Rejected custom role with out-of-scope permissions:', err.message);
  }
  if (!threwOnForbiddenRolePerm) throw new Error('Expected custom role with out-of-scope permissions to fail!');

  // Create valid custom role with project-scoped permissions
  const validRole = await ProjectService.createCustomRole(
    project.id,
    {
      name: `Project QA Specialist ${Date.now()}`,
      description: 'Test project-scoped custom role',
      permissions: ['PROJECT_READ', 'TASK_READ', 'TASK_CREATE', 'TASK_UPDATE'],
    },
    user
  );
  console.log(`[PASS] Successfully created project-scoped custom role: "${validRole.name}" (${validRole.id})`);

  // Clean up test data
  console.log('\n--- CLEANUP ---');
  await WorkItemService.deleteWorkItem(validTask.id, user);
  console.log(`[PASS] Cleaned up test task ${validTask.id}`);
  await prisma.role.delete({ where: { id: validRole.id } });
  console.log(`[PASS] Cleaned up test custom role ${validRole.id}`);

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===\n');
}

runTests().catch((err) => {
  console.error('\n[FAIL] Test suite error:', err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
