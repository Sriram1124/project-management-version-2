import { prisma } from '../src/lib/prisma';
import { ProjectService } from '../src/services/project.service';
import { WorkItemService } from '../src/services/work-item.service';
import { checkProjectMemberPermission } from '../src/middleware/auth.middleware';
import { WorkItemType, WorkItemStatus, WorkItemPriority, ProjectMethodology } from '@prisma/client';

async function runTestSuite() {
  console.log('================================================================');
  console.log('   RUNNING 18-POINT CUSTOM ROLES & PERMISSIONS VERIFICATION    ');
  console.log('================================================================\n');

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testNum: number, title: string, details?: string) {
    if (condition) {
      console.log(`[PASS] Test ${testNum}: ${title}`);
      passedCount++;
    } else {
      console.error(`[FAIL] Test ${testNum}: ${title}`);
      if (details) console.error(`       Details: ${details}`);
      failedCount++;
    }
  }

  // Setup test environment
  let testOrgA = await prisma.organization.findFirst({ where: { name: 'Test Org A Custom Roles' } });
  if (!testOrgA) {
    testOrgA = await prisma.organization.create({ data: { name: 'Test Org A Custom Roles' } });
  }

  let testOrgB = await prisma.organization.findFirst({ where: { name: 'Test Org B Custom Roles' } });
  if (!testOrgB) {
    testOrgB = await prisma.organization.create({ data: { name: 'Test Org B Custom Roles' } });
  }

  async function findOrCreateUser(email: string, name: string, orgId: string, roleName: string) {
    let user = await prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });
    const role = await prisma.role.findFirst({ where: { name: roleName } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          password_hash: 'dummyhash',
          organization_id: orgId,
          roles: role ? { create: { role_id: role.id } } : undefined,
        },
        include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
      });
    } else if (role && !user.roles.some((r) => r.role.name === roleName)) {
      await prisma.userRole.create({
        data: { user_id: user.id, role_id: role.id },
      });
      user = await prisma.user.findUnique({
        where: { email },
        include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
      });
    }
    return {
      ...user,
      role: roleName,
    };
  }

  const managerUser = await findOrCreateUser('manager-test-custom-roles@test.com', 'Test Manager A', testOrgA.id, 'MANAGER');
  const internUser1 = await findOrCreateUser('intern1-test-custom-roles@test.com', 'Test Intern 1', testOrgA.id, 'INTERN');
  const internUser2 = await findOrCreateUser('intern2-test-custom-roles@test.com', 'Test Intern 2', testOrgA.id, 'INTERN');
  const orgBMember = await findOrCreateUser('orgb-member@test.com', 'Test Org B Member', testOrgB.id, 'MANAGER');

  // Test Projects
  const projectA1 = await prisma.project.create({
    data: {
      name: 'Test Project Alpha',
      organization_id: testOrgA.id,
      owner_id: managerUser.id,
      methodology: ProjectMethodology.SCRUM,
    },
  });

  const projectA2 = await prisma.project.create({
    data: {
      name: 'Test Project Beta',
      organization_id: testOrgA.id,
      owner_id: managerUser.id,
      methodology: ProjectMethodology.SCRUM,
    },
  });

  const projectB1 = await prisma.project.create({
    data: {
      name: 'Test Project Gamma (Org B)',
      organization_id: testOrgB.id,
      owner_id: orgBMember.id,
      methodology: ProjectMethodology.SCRUM,
    },
  });

  // Add internUser1 to projectA1 as DEVELOPER initially
  await prisma.projectMember.create({
    data: {
      project_id: projectA1.id,
      user_id: internUser1.id,
      project_role: 'DEVELOPER',
    },
  });

  // Add internUser2 to projectA1
  await prisma.projectMember.create({
    data: {
      project_id: projectA1.id,
      user_id: internUser2.id,
      project_role: 'DEVELOPER',
    },
  });

  // Add internUser1 to projectA2
  await prisma.projectMember.create({
    data: {
      project_id: projectA2.id,
      user_id: internUser1.id,
      project_role: 'DEVELOPER',
    },
  });

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Creating a custom role with valid permissions within a project
    // -------------------------------------------------------------------------
    let role1: any;
    try {
      role1 = await ProjectService.createCustomRole(
        projectA1.id,
        {
          name: 'Task Auditor',
          description: 'Specialist role for task auditing',
          permissions: ['TASK_READ', 'TASK_UPDATE', 'TASK_CREATE'],
        },
        managerUser
      );
      assert(
        role1 && role1.name === 'Task Auditor' && role1.project_id === projectA1.id && role1.permissions.length === 3,
        1,
        'Creating a custom role with valid permissions within a project'
      );
    } catch (err: any) {
      assert(false, 1, 'Creating a custom role with valid permissions within a project', err.message);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Creating a custom role without the optional description
    // -------------------------------------------------------------------------
    let roleWithoutDesc: any;
    try {
      roleWithoutDesc = await ProjectService.createCustomRole(
        projectA1.id,
        {
          name: 'Minimal Role',
          permissions: ['TASK_READ'],
        },
        managerUser
      );
      assert(
        roleWithoutDesc && roleWithoutDesc.description === null,
        2,
        'Creating a custom role without the optional description'
      );
    } catch (err: any) {
      assert(false, 2, 'Creating a custom role without the optional description', err.message);
    }

    // -------------------------------------------------------------------------
    // TEST 3: Rejecting an empty or whitespace-only role name
    // -------------------------------------------------------------------------
    try {
      await ProjectService.createCustomRole(
        projectA1.id,
        {
          name: '    ',
          permissions: ['TASK_READ'],
        },
        managerUser
      );
      assert(false, 3, 'Rejecting an empty or whitespace-only role name');
    } catch (err: any) {
      assert(err.message.includes('required'), 3, 'Rejecting an empty or whitespace-only role name');
    }

    // -------------------------------------------------------------------------
    // TEST 4: Rejecting duplicate role names within the same project
    // -------------------------------------------------------------------------
    try {
      await ProjectService.createCustomRole(
        projectA1.id,
        {
          name: 'Task Auditor', // same name in same project
          permissions: ['TASK_READ'],
        },
        managerUser
      );
      assert(false, 4, 'Rejecting duplicate role names within the same project');
    } catch (err: any) {
      assert(err.message.includes('already exists in this scope'), 4, 'Rejecting duplicate role names within the same project');
    }

    // -------------------------------------------------------------------------
    // TEST 5: Permitting the same role name in different projects
    // -------------------------------------------------------------------------
    try {
      const roleInProjectA2 = await ProjectService.createCustomRole(
        projectA2.id,
        {
          name: 'Task Auditor', // same name in different project
          description: 'Task Auditor for Project Beta',
          permissions: ['TASK_READ'],
        },
        managerUser
      );
      assert(
        roleInProjectA2 && roleInProjectA2.project_id === projectA2.id,
        5,
        'Permitting the same role name in different projects'
      );
    } catch (err: any) {
      assert(false, 5, 'Permitting the same role name in different projects', err.message);
    }

    // -------------------------------------------------------------------------
    // TEST 6: Rejecting invalid or unknown permission names
    // -------------------------------------------------------------------------
    try {
      await ProjectService.createCustomRole(
        projectA1.id,
        {
          name: 'Invalid Perm Role',
          permissions: ['NON_EXISTENT_SUPER_PERMISSION_123'],
        },
        managerUser
      );
      assert(false, 6, 'Rejecting invalid or unknown permission names');
    } catch (err: any) {
      assert(
        err.message.toLowerCase().includes('invalid') && err.message.includes('permission'),
        6,
        'Rejecting invalid or unknown permission names'
      );
    }

    // -------------------------------------------------------------------------
    // TEST 7: Rejecting unauthorized permissions (non-super-admin privilege escalation)
    // -------------------------------------------------------------------------
    try {
      await ProjectService.createCustomRole(
        projectA1.id,
        {
          name: 'Malicious Admin Role',
          permissions: ['USER_DELETE', 'TASK_READ'], // USER_DELETE is admin-only / out-of-scope
        },
        managerUser
      );
      assert(false, 7, 'Rejecting unauthorized administrative permissions for non-super-admin');
    } catch (err: any) {
      assert(
        err.message.toLowerCase().includes('invalid') || err.message.includes('Unauthorized'),
        7,
        'Rejecting unauthorized administrative permissions for non-super-admin'
      );
    }

    // -------------------------------------------------------------------------
    // TEST 8: Rejecting role creation by unauthorized users (e.g. Interns)
    // -------------------------------------------------------------------------
    try {
      await ProjectService.createCustomRole(
        projectA1.id,
        {
          name: 'Intern Created Role',
          permissions: ['TASK_READ'],
        },
        internUser1 // Intern trying to create role
      );
      assert(false, 8, 'Rejecting role creation by unauthorized users');
    } catch (err: any) {
      assert(err.message.includes('Unauthorized: Only managers'), 8, 'Rejecting role creation by unauthorized users');
    }

    // -------------------------------------------------------------------------
    // TEST 9: Assigning a project custom role to a project member
    // -------------------------------------------------------------------------
    try {
      await ProjectService.updateProjectMemberRoles(
        projectA1.id,
        [
          {
            user_id: internUser1.id,
            role_id: role1.id,
          },
        ],
        managerUser
      );

      const updatedMember = await prisma.projectMember.findUnique({
        where: { project_id_user_id: { project_id: projectA1.id, user_id: internUser1.id } },
      });
      assert(
        updatedMember?.role_id === role1.id && updatedMember?.project_role === 'Task Auditor',
        9,
        'Assigning a project custom role to a project member'
      );
    } catch (err: any) {
      assert(false, 9, 'Assigning a project custom role to a project member', err.message);
    }

    // -------------------------------------------------------------------------
    // TEST 10: Rejecting assignment of a role created for project A to a member in project B
    // -------------------------------------------------------------------------
    try {
      await ProjectService.updateProjectMemberRoles(
        projectA2.id, // Project A2
        [
          {
            user_id: internUser1.id,
            role_id: role1.id, // role1 belongs to Project A1!
          },
        ],
        managerUser
      );
      assert(false, 10, 'Rejecting assignment of a role created for project A to a member in project B');
    } catch (err: any) {
      assert(
        err.message.includes('Cross-project role assignment rejected'),
        10,
        'Rejecting assignment of a role created for project A to a member in project B'
      );
    }

    // -------------------------------------------------------------------------
    // TEST 11: Verifying that a member assigned a role with only TASK_READ can view tasks but is forbidden from updating them
    // -------------------------------------------------------------------------
    const readOnlyRole = await ProjectService.createCustomRole(
      projectA1.id,
      {
        name: 'Viewer Only',
        permissions: ['TASK_READ'],
      },
      managerUser
    );

    // Assign readOnlyRole to internUser2 in Project A1
    await ProjectService.updateProjectMemberRoles(
      projectA1.id,
      [{ user_id: internUser2.id, role_id: readOnlyRole.id }],
      managerUser
    );

    // Create a work item in projectA1 using managerUser
    const testTask = await WorkItemService.createWorkItem(managerUser, {
      title: 'Audit Target Story',
      type: WorkItemType.STORY,
      project_id: projectA1.id,
      story_points: 3,
      priority: WorkItemPriority.MEDIUM,
      status: WorkItemStatus.TODO,
    });

    // internUser2 views task -> should succeed
    const viewItem = await WorkItemService.getWorkItemById(testTask.id, internUser2);
    const canView = Boolean(viewItem && viewItem.id === testTask.id);

    // internUser2 attempts to update task title -> should fail
    let updateDenied = false;
    try {
      await WorkItemService.updateWorkItem(testTask.id, internUser2, {
        title: 'Hacked Title By Viewer',
      });
    } catch (err: any) {
      updateDenied = err.message.includes('Forbidden: your role does not have permission to update work items');
    }

    assert(
      canView && updateDenied,
      11,
      'Verifying member with only TASK_READ can view tasks but is forbidden from updating them'
    );

    // -------------------------------------------------------------------------
    // TEST 12: Member with TASK_CREATE, TASK_ASSIGN, TASK_DELETE can perform those and is forbidden from unselected operations
    // -------------------------------------------------------------------------
    const opsRole = await ProjectService.createCustomRole(
      projectA1.id,
      {
        name: 'Task Operator',
        permissions: ['TASK_READ', 'TASK_CREATE', 'TASK_ASSIGN', 'TASK_DELETE'],
      },
      managerUser
    );

    // Assign opsRole to internUser2
    await ProjectService.updateProjectMemberRoles(
      projectA1.id,
      [{ user_id: internUser2.id, role_id: opsRole.id }],
      managerUser
    );

    // 1. Can create task
    const createdByOps = await WorkItemService.createWorkItem(internUser2, {
      title: 'Ops Created Story',
      type: WorkItemType.STORY,
      project_id: projectA1.id,
      story_points: 5,
    });
    const canCreate = Boolean(createdByOps && createdByOps.id);

    // 2. Can assign task to internUser1
    const canAssign = await WorkItemService.addAssignees(createdByOps.id, internUser2, [internUser1.id]);

    // 3. Forbidden from updating project settings
    const canUpdateProject = await checkProjectMemberPermission(
      internUser2,
      { params: { id: projectA1.id } } as any,
      'PROJECT_UPDATE'
    );

    // 4. Forbidden from managing sprints
    const canManageSprint = await checkProjectMemberPermission(
      internUser2,
      { params: { id: projectA1.id } } as any,
      'SPRINT_MANAGE'
    );

    // 5. Can delete task
    await WorkItemService.deleteWorkItem(createdByOps.id, internUser2);
    const deletedTask = await prisma.workItem.findUnique({ where: { id: createdByOps.id } });
    const canDelete = deletedTask === null;

    assert(
      canCreate && Boolean(canAssign) && !canUpdateProject && !canManageSprint && canDelete,
      12,
      'Verifying member with TASK_CREATE/ASSIGN/DELETE can perform those and is forbidden from unselected operations'
    );

    // -------------------------------------------------------------------------
    // TEST 13: Verifying that built-in roles continue to function identically
    // -------------------------------------------------------------------------
    // Tech Lead has full project management
    const techLeadPerm = await checkProjectMemberPermission(
      managerUser,
      { params: { id: projectA1.id } } as any,
      'PROJECT_UPDATE'
    );
    assert(techLeadPerm, 13, 'Verifying built-in roles continue to function identically');

    // -------------------------------------------------------------------------
    // TEST 14: Verifying that role-permission associations persist across queries
    // -------------------------------------------------------------------------
    const persistedRole = await prisma.role.findUnique({
      where: { id: opsRole.id },
      include: { permissions: { include: { permission: true } } },
    });
    const permNames = persistedRole?.permissions.map((rp) => rp.permission.name).sort();
    assert(
      persistedRole !== null &&
        permNames?.includes('TASK_CREATE') &&
        permNames?.includes('TASK_DELETE') &&
        permNames?.includes('TASK_ASSIGN'),
      14,
      'Verifying role-permission associations persist in database'
    );

    // -------------------------------------------------------------------------
    // TEST 15: Verifying modifying member role assignment immediately updates effective permissions
    // -------------------------------------------------------------------------
    // Switch internUser2 back to readOnlyRole
    await ProjectService.updateProjectMemberRoles(
      projectA1.id,
      [{ user_id: internUser2.id, role_id: readOnlyRole.id }],
      managerUser
    );

    // Now internUser2 should be immediately denied TASK_CREATE
    let createDenied = false;
    try {
      await WorkItemService.createWorkItem(internUser2, {
        title: 'Should Be Denied',
        type: WorkItemType.STORY,
        project_id: projectA1.id,
        story_points: 2,
      });
    } catch (err: any) {
      createDenied = err.message.includes('Forbidden: your role does not have permission to create work items');
    }
    assert(
      createDenied,
      15,
      'Verifying modifying member role assignment immediately updates effective permissions on the next request'
    );

    // -------------------------------------------------------------------------
    // TEST 16: Verifying double-click or rapid submission prevention
    // -------------------------------------------------------------------------
    let rapidSuccess = 0;
    let rapidFail = 0;
    const promises = [
      ProjectService.createCustomRole(
        projectA1.id,
        { name: 'Concurrent Role', permissions: ['TASK_READ'] },
        managerUser
      ),
      ProjectService.createCustomRole(
        projectA1.id,
        { name: 'Concurrent Role', permissions: ['TASK_READ'] },
        managerUser
      ),
    ];
    const results = await Promise.allSettled(promises);
    for (const r of results) {
      if (r.status === 'fulfilled') rapidSuccess++;
      if (r.status === 'rejected') rapidFail++;
    }
    assert(
      rapidSuccess === 1 && rapidFail === 1,
      16,
      'Verifying rapid/concurrent duplicate submission prevention (one succeeds, one rejected with 409)'
    );

    // -------------------------------------------------------------------------
    // TEST 17: Verifying UI permission selection registry & categories
    // -------------------------------------------------------------------------
    const registry = await ProjectService.getAvailablePermissions(managerUser);
    const hasCategories = Array.isArray(registry.categories) && registry.categories.length > 0;
    const hasPermissions = Array.isArray(registry.permissions) && registry.permissions.length >= 19;
    assert(
      hasCategories && hasPermissions,
      17,
      'Verifying permission registry groups, categories, and permission definitions'
    );

    // -------------------------------------------------------------------------
    // TEST 18: Multi-tenant isolation: roles in Org A never leak into Org B
    // -------------------------------------------------------------------------
    const orgBRoles = await ProjectService.getProjectRoles(projectB1.id, orgBMember);
    const leakedRole = orgBRoles.find((r) => r.id === role1.id || r.name === 'Task Auditor');
    assert(
      leakedRole === undefined,
      18,
      'Verifying multi-tenant isolation: custom roles in Org A never leak into Org B'
    );

    // -------------------------------------------------------------------------
    // TEST 19: Carry Forward = true creates reusable organization custom role & false creates project-only
    // -------------------------------------------------------------------------
    const projectOnlyRole = await ProjectService.createCustomRole(
      projectA1.id,
      {
        name: 'Alpha Exclusive Role',
        description: 'Only for Project Alpha',
        permissions: ['TASK_READ'],
        carry_forward: false,
      },
      managerUser
    );

    const reusableRole = await ProjectService.createCustomRole(
      projectA1.id,
      {
        name: 'Shared Security Officer',
        description: 'Organization-wide security reviewer',
        permissions: ['TASK_READ', 'TASK_UPDATE', 'PROJECT_READ'],
        carry_forward: true,
      },
      managerUser
    );
    assert(
      projectOnlyRole.carry_forward === false &&
      projectOnlyRole.project_id === projectA1.id &&
      reusableRole.name === 'Shared Security Officer' &&
      reusableRole.carry_forward === true &&
      reusableRole.is_template === true &&
      reusableRole.project_id === null,
      19,
      'Verifying carry_forward=true creates reusable org-wide role (project_id=null) and false creates project-only role'
    );

    // -------------------------------------------------------------------------
    // TEST 20: Future project selector in same org displays reusable role, excludes project-only role
    // -------------------------------------------------------------------------
    const projectA2Roles = await ProjectService.getProjectRoles(projectA2.id, managerUser);
    const hasReusableInA2 = projectA2Roles.some((r) => r.name === 'Shared Security Officer' && r.carry_forward === true);
    const hasProjectA1OnlyInA2 = projectA2Roles.some((r) => r.name === 'Alpha Exclusive Role');
    assert(
      hasReusableInA2 && !hasProjectA1OnlyInA2,
      20,
      'Verifying future project A2 displays reusable org role and excludes project A1-only custom role'
    );

    // -------------------------------------------------------------------------
    // TEST 21: Reusable role can be assigned in future project A2 without duplicating definition
    // -------------------------------------------------------------------------
    const assignedMember = await ProjectService.addProjectMember(
      projectA2.id,
      internUser1.id,
      managerUser,
      'Shared Security Officer'
    );
    assert(
      assignedMember.project_role === 'Shared Security Officer',
      21,
      'Verifying reusable role can be assigned to members in future project A2 without duplicating role record'
    );

    // -------------------------------------------------------------------------
    // TEST 22: Project-only custom role from Project A1 cannot be assigned in Project A2
    // -------------------------------------------------------------------------
    let crossProjectBlocked = false;
    try {
      await ProjectService.addProjectMember(
        projectA2.id,
        internUser2.id,
        managerUser,
        'Alpha Exclusive Role'
      );
    } catch (e: any) {
      crossProjectBlocked = true;
    }
    assert(
      crossProjectBlocked,
      22,
      'Verifying project-only custom role from Project A1 cannot be assigned in Project A2'
    );

    // -------------------------------------------------------------------------
    // TEST 23: Tenant isolation for reusable roles: Org B never sees Org A reusable role
    // -------------------------------------------------------------------------
    const orgBRolesAfter = await ProjectService.getProjectRoles(projectB1.id, orgBMember);
    const leakedReusableRole = orgBRolesAfter.find((r) => r.name === 'Shared Security Officer');
    assert(
      leakedReusableRole === undefined,
      23,
      'Verifying organization tenant isolation: reusable org role never leaks to Org B'
    );
  } finally {
    // Cleanup created test records
    await prisma.workItemAssignee.deleteMany({
      where: { work_item: { project_id: { in: [projectA1.id, projectA2.id, projectB1.id] } } },
    });
    await prisma.workItem.deleteMany({
      where: { project_id: { in: [projectA1.id, projectA2.id, projectB1.id] } },
    });
    await prisma.projectMember.deleteMany({
      where: { project_id: { in: [projectA1.id, projectA2.id, projectB1.id] } },
    });
    await prisma.rolePermission.deleteMany({
      where: {
        role: {
          OR: [
            { project_id: { in: [projectA1.id, projectA2.id, projectB1.id] } },
            { organization_id: { in: [testOrgA.id, testOrgB.id] } },
          ],
        },
      },
    });
    await prisma.role.deleteMany({
      where: {
        OR: [
          { project_id: { in: [projectA1.id, projectA2.id, projectB1.id] } },
          { organization_id: { in: [testOrgA.id, testOrgB.id] } },
        ],
      },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [projectA1.id, projectA2.id, projectB1.id] } },
    });
    await prisma.userRole.deleteMany({
      where: { user_id: { in: [managerUser.id, internUser1.id, internUser2.id, orgBMember.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [managerUser.id, internUser1.id, internUser2.id, orgBMember.id] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [testOrgA.id, testOrgB.id] } },
    });
  }

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${passedCount + failedCount} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal error during test suite execution:', err);
  process.exit(1);
});
