import { PrismaClient, WorkItemType, WorkItemStatus, WorkItemPriority } from '@prisma/client';
import { WorkItemService } from '../src/services/work-item.service';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}${detail ? ` - ${detail}` : ''}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

async function run() {
  console.log('=== VERIFYING TECH LEAD & AUTHORIZATION RULES ===\n');

  // 1. Fetch organization and test users
  const org = await prisma.organization.findFirst({ where: { name: 'Dailoqa Technologies' } });
  if (!org) throw new Error('Default organization not found');

  const manager = await prisma.user.findFirst({
    where: { email: 'manager@dailoqa.com', organization_id: org.id },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
  });

  const lead = await prisma.user.findFirst({
    where: { email: 'lead@dailoqa.com', organization_id: org.id },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
  });

  const intern = await prisma.user.findFirst({
    where: { email: 'intern@dailoqa.com', organization_id: org.id },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
  });

  if (!manager || !lead || !intern) throw new Error('Seeded users missing');

  // Create another intern for reassignment tests
  const secondIntern = await prisma.user.upsert({
    where: { email: 'intern2@dailoqa.com' },
    update: { organization_id: org.id },
    create: {
      name: 'Second Intern',
      email: 'intern2@dailoqa.com',
      password_hash: 'dummyhash',
      organization_id: org.id,
      user_code: 'INT-999',
    },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
  });

  // Create an outsider user in another organization
  let foreignOrg = await prisma.organization.findFirst({ where: { name: 'Foreign Org Test' } });
  if (!foreignOrg) {
    foreignOrg = await prisma.organization.create({ data: { name: 'Foreign Org Test' } });
  }

  const outsider = await prisma.user.upsert({
    where: { email: 'outsider@othercorp.com' },
    update: { organization_id: foreignOrg.id },
    create: {
      name: 'Outsider User',
      email: 'outsider@othercorp.com',
      password_hash: 'dummyhash',
      organization_id: foreignOrg.id,
    },
  });

  // Setup Project A where lead is a member
  let projectA = await prisma.project.findFirst({
    where: { name: 'Tech Lead Project Alpha', organization_id: org.id },
  });
  if (!projectA) {
    projectA = await prisma.project.create({
      data: {
        organization_id: org.id,
        name: 'Tech Lead Project Alpha',
        owner_id: manager.id,
      },
    });
  }

  // Ensure members of Project A: lead, intern, secondIntern
  await prisma.projectMember.upsert({
    where: { project_id_user_id: { project_id: projectA.id, user_id: lead.id } },
    update: { project_role: 'TECH_LEAD' },
    create: { project_id: projectA.id, user_id: lead.id, project_role: 'TECH_LEAD' },
  });

  await prisma.projectMember.upsert({
    where: { project_id_user_id: { project_id: projectA.id, user_id: intern.id } },
    update: { project_role: 'DEVELOPER' },
    create: { project_id: projectA.id, user_id: intern.id, project_role: 'DEVELOPER' },
  });

  await prisma.projectMember.upsert({
    where: { project_id_user_id: { project_id: projectA.id, user_id: secondIntern.id } },
    update: { project_role: 'DEVELOPER' },
    create: { project_id: projectA.id, user_id: secondIntern.id, project_role: 'DEVELOPER' },
  });

  // Setup Project B where lead is NOT a member
  let projectB = await prisma.project.findFirst({
    where: { name: 'Unauthorized Project Beta', organization_id: org.id },
  });
  if (!projectB) {
    projectB = await prisma.project.create({
      data: {
        organization_id: org.id,
        name: 'Unauthorized Project Beta',
        owner_id: manager.id,
      },
    });
  }
  // Ensure lead is NOT a member of Project B
  await prisma.projectMember.deleteMany({
    where: { project_id: projectB.id, user_id: lead.id },
  });

  console.log(`[SETUP DONE] Project A: ${projectA.id}, Project B: ${projectB.id}`);

  // Test 1: Tech Lead can view projects/items where they are a member
  try {
    const items = await WorkItemService.listWorkItems(lead, { project_id: projectA.id });
    assert(Array.isArray(items), '1. Tech Lead can list items in assigned project (Project A)');
  } catch (err: any) {
    assert(false, '1. Tech Lead can list items in assigned project (Project A)', err.message);
  }

  // Test 2: Tech Lead CANNOT list items of Project B (where they are not a member)
  try {
    await WorkItemService.listWorkItems(lead, { project_id: projectB.id });
    assert(false, '2. Tech Lead cannot access unauthorized Project B (negative test)');
  } catch (err: any) {
    assert(
      err.message.includes('Forbidden') || err.message.includes('not a member'),
      '2. Tech Lead access to unauthorized Project B rejected',
      err.message
    );
  }

  // Create an Epic in Project A for child items
  const epicA = await WorkItemService.createWorkItem(manager, {
    project_id: projectA.id,
    type: WorkItemType.EPIC,
    title: 'Alpha Root Epic for Auth Tests',
  });

  const storyA = await WorkItemService.createWorkItem(lead, {
    project_id: projectA.id,
    parent_id: epicA.id,
    type: WorkItemType.STORY,
    title: 'Alpha Story Created by Tech Lead',
  });

  // Test 3: Tech Lead can assign work to an eligible member (intern) of Project A
  let taskA: any;
  try {
    taskA = await WorkItemService.createWorkItem(lead, {
      project_id: projectA.id,
      parent_id: storyA.id,
      type: WorkItemType.TASK,
      title: 'Task Assigned by Tech Lead',
      assignee_ids: [intern.id],
    });
    assert(
      taskA.assignees.some((a: any) => a.user_id === intern.id),
      '3. Tech Lead can assign work to eligible project member (intern)'
    );
  } catch (err: any) {
    assert(false, '3. Tech Lead can assign work to eligible project member', err.message);
  }

  // Test 4: Tech Lead can reassign work from intern to secondIntern
  try {
    const reassigned = await WorkItemService.updateWorkItem(taskA.id, lead, {
      assignee_ids: [secondIntern.id],
    });
    assert(
      reassigned.assignees.some((a: any) => a.user_id === secondIntern.id) &&
      !reassigned.assignees.some((a: any) => a.user_id === intern.id),
      '4. Tech Lead can reassign work to another eligible project member (secondIntern)'
    );
  } catch (err: any) {
    assert(false, '4. Tech Lead can reassign work', err.message);
  }

  // Test 5: Assignment to user outside project is rejected
  try {
    await WorkItemService.updateWorkItem(taskA.id, lead, {
      assignee_ids: [outsider.id],
    });
    assert(false, '5. Assignment to user outside project/org rejected (negative test)');
  } catch (err: any) {
    assert(
      err.message.includes('not exist in your organization') || err.message.includes('not a member'),
      '5. Assignment to non-member/outsider rejected',
      err.message
    );
  }

  // Test 6: Intern cannot assign task to another user
  try {
    await WorkItemService.updateWorkItem(taskA.id, intern, {
      assignee_ids: [secondIntern.id],
    });
    assert(false, '6. Intern cannot perform unauthorized task assignment (negative test)');
  } catch (err: any) {
    assert(
      err.message.includes('Forbidden') || err.message.includes('permission'),
      '6. Intern assignment attempt forbidden',
      err.message
    );
  }

  // Test 7: Manager permissions continue to work as before
  try {
    const mgrUpdated = await WorkItemService.updateWorkItem(taskA.id, manager, {
      priority: WorkItemPriority.HIGH,
      status: WorkItemStatus.IN_PROGRESS,
    });
    assert(
      mgrUpdated.priority === WorkItemPriority.HIGH && mgrUpdated.status === WorkItemStatus.IN_PROGRESS,
      '7. Manager permissions continue to work across project'
    );
  } catch (err: any) {
    assert(false, '7. Manager permissions work', err.message);
  }

  // Test 8: Clean up test work items
  await prisma.workItemAssignee.deleteMany({ where: { work_item_id: taskA.id } });
  await prisma.workItem.delete({ where: { id: taskA.id } });
  await prisma.workItem.delete({ where: { id: storyA.id } });
  await prisma.workItem.delete({ where: { id: epicA.id } });
  await prisma.projectMember.deleteMany({ where: { project_id: projectA.id } });
  await prisma.project.delete({ where: { id: projectA.id } });
  await prisma.project.delete({ where: { id: projectB.id } });
  await prisma.user.delete({ where: { id: secondIntern.id } });
  await prisma.user.delete({ where: { id: outsider.id } });
  await prisma.organization.delete({ where: { id: foreignOrg.id } });

  console.log('\n========================================');
  console.log('TECH LEAD AUTHORIZATION VERIFICATION SUMMARY');
  console.log('========================================');
  console.log(`Total tests: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed === 0) {
    console.log('\nALL TECH LEAD & AUTHORIZATION TESTS PASSED PERFECTLY!');
  } else {
    process.exit(1);
  }
}

run()
  .catch((e) => {
    console.error('Fatal test error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
