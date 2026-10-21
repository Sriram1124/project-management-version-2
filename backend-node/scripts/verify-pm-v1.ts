import { PrismaClient, WorkItemType, WorkItemStatus, WorkItemPriority, ProjectStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3001/api';

async function main() {
  console.log('================================================================');
  console.log('PROJECT MANAGEMENT + WORK MANAGEMENT V1 INTEGRATION VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  }

  // Helper login function
  async function login(email: string, password = 'password123', organization_id?: string | null) {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, organization_id }),
    });
    const json: any = await res.json();
    return { status: res.status, json, token: json.accessToken };
  }

  try {
    // -------------------------------------------------------------
    // 1. Setup Test Tenants and Users
    // -------------------------------------------------------------
    console.log('--- 1. Setting Up Test Tenants and Users ---');

    let orgA = await prisma.organization.findFirst({ where: { name: 'PM Org Alpha' } });
    if (!orgA) {
      orgA = await prisma.organization.create({ data: { name: 'PM Org Alpha' } });
    }

    let orgB = await prisma.organization.findFirst({ where: { name: 'PM Org Beta' } });
    if (!orgB) {
      orgB = await prisma.organization.create({ data: { name: 'PM Org Beta' } });
    }

    const managerRole = await prisma.role.findUnique({ where: { name: 'MANAGER' } });
    const internRole = await prisma.role.findUnique({ where: { name: 'INTERN' } });

    if (!managerRole || !internRole) {
      throw new Error('MANAGER or INTERN role not found in database');
    }

    const passwordHash = await argon2.hash('password123');

    // Manager in Org A
    const mgrEmail = 'pm.manager.a@test.com';
    let mgrA = await prisma.user.findFirst({ where: { email: mgrEmail } });
    if (!mgrA) {
      mgrA = await prisma.user.create({
        data: {
          email: mgrEmail,
          password_hash: passwordHash,
          name: 'Manager Alpha',
          user_code: 'MGR-PM-A',
          organization: { connect: { id: orgA.id } },
          roles: { create: { role_id: managerRole.id } },
        },
      });
    }

    // Intern 1 in Org A
    const intern1Email = 'pm.intern1.a@test.com';
    let intern1 = await prisma.user.findFirst({ where: { email: intern1Email } });
    if (!intern1) {
      intern1 = await prisma.user.create({
        data: {
          email: intern1Email,
          password_hash: passwordHash,
          name: 'Intern One Alpha',
          user_code: 'INT-PM-A1',
          organization: { connect: { id: orgA.id } },
          roles: { create: { role_id: internRole.id } },
        },
      });
    }

    // Intern 2 in Org A
    const intern2Email = 'pm.intern2.a@test.com';
    let intern2 = await prisma.user.findFirst({ where: { email: intern2Email } });
    if (!intern2) {
      intern2 = await prisma.user.create({
        data: {
          email: intern2Email,
          password_hash: passwordHash,
          name: 'Intern Two Alpha',
          user_code: 'INT-PM-A2',
          organization: { connect: { id: orgA.id } },
          roles: { create: { role_id: internRole.id } },
        },
      });
    }

    // Manager in Org B
    const mgrBEmail = 'pm.manager.b@test.com';
    let mgrB = await prisma.user.findFirst({ where: { email: mgrBEmail } });
    if (!mgrB) {
      mgrB = await prisma.user.create({
        data: {
          email: mgrBEmail,
          password_hash: passwordHash,
          name: 'Manager Beta',
          user_code: 'MGR-PM-B',
          organization: { connect: { id: orgB.id } },
          roles: { create: { role_id: managerRole.id } },
        },
      });
    }

    assert(true, 'Test organizations and users initialized successfully');

    // Login Manager A
    const mgrALogin = await login(mgrEmail, 'password123', orgA.id);
    assert(mgrALogin.status === 200 && Boolean(mgrALogin.token), 'Manager A logged in successfully');
    const mgrToken = mgrALogin.token;

    // Login Manager B
    const mgrBLogin = await login(mgrBEmail, 'password123', orgB.id);
    assert(mgrBLogin.status === 200 && Boolean(mgrBLogin.token), 'Manager B logged in successfully');
    const mgrBToken = mgrBLogin.token;

    // Login Intern 1
    const intern1Login = await login(intern1Email, 'password123', orgA.id);
    assert(intern1Login.status === 200 && Boolean(intern1Login.token), 'Intern 1 logged in successfully');
    const intern1Token = intern1Login.token;

    // -------------------------------------------------------------
    // 2. Project CRUD Operations & Tenant Isolation
    // -------------------------------------------------------------
    console.log('\n--- 2. Project Lifecycle & Multi-Tenant Boundary ---');

    // Create Project in Org A
    const createProjRes = await fetch(`${BASE_URL}/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mgrToken}`,
      },
      body: JSON.stringify({
        name: 'Alpha Engineering Initiative',
        description: 'Core engineering project for testing V1 delivery',
        status: 'PLANNED',
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 86400000 * 30).toISOString(),
      }),
    });
    const createProjJson: any = await createProjRes.json();
    assert(createProjRes.status === 201 && createProjJson.project?.id, 'POST /projects creates project (HTTP 201)');
    const projectId = createProjJson.project.id;

    // Read project
    const getProjRes = await fetch(`${BASE_URL}/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${mgrToken}` },
    });
    const getProjJson: any = await getProjRes.json();
    assert(getProjRes.status === 200 && getProjJson.project?.name === 'Alpha Engineering Initiative', 'GET /projects/:id retrieves project');

    // Update project
    const updateProjRes = await fetch(`${BASE_URL}/projects/${projectId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mgrToken}`,
      },
      body: JSON.stringify({
        name: 'Alpha Engineering Initiative (Active)',
        status: 'ACTIVE',
      }),
    });
    const updateProjJson: any = await updateProjRes.json();
    assert(updateProjRes.status === 200 && updateProjJson.project?.status === 'ACTIVE', 'PATCH /projects/:id updates project status to ACTIVE');

    // Tenant isolation: Manager B (Org B) cannot view or update Org A project
    const mgrBCrossGet = await fetch(`${BASE_URL}/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${mgrBToken}` },
    });
    assert(mgrBCrossGet.status === 404 || mgrBCrossGet.status === 403, 'Cross-tenant GET /projects/:id rejected (HTTP 404/403)');

    const mgrBCrossPatch = await fetch(`${BASE_URL}/projects/${projectId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mgrBToken}`,
      },
      body: JSON.stringify({ name: 'Hacked Project' }),
    });
    assert(mgrBCrossPatch.status === 404 || mgrBCrossPatch.status === 403, 'Cross-tenant PATCH /projects/:id rejected (HTTP 404/403)');

    // -------------------------------------------------------------
    // 3. Project Member Management
    // -------------------------------------------------------------
    console.log('\n--- 3. Project Member Management ---');

    // Add Intern 1 to Project
    const addMemberRes = await fetch(`${BASE_URL}/projects/${projectId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mgrToken}`,
      },
      body: JSON.stringify({ userId: intern1.id }),
    });
    const addMemberJson: any = await addMemberRes.json();
    assert(addMemberRes.status === 201 && addMemberJson.member?.user_id === intern1.id, 'POST /projects/:id/members adds member to project');

    // Prevent cross-tenant member addition (Org B user cannot be added to Org A project)
    const addCrossMemberRes = await fetch(`${BASE_URL}/projects/${projectId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mgrToken}`,
      },
      body: JSON.stringify({ userId: mgrB.id }),
    });
    assert(addCrossMemberRes.status === 400 || addCrossMemberRes.status === 403 || addCrossMemberRes.status === 404, 'Cross-tenant member addition rejected');

    // List project members
    const listMembersRes = await fetch(`${BASE_URL}/projects/${projectId}/members`, {
      headers: { Authorization: `Bearer ${mgrToken}` },
    });
    const listMembersJson: any = await listMembersRes.json();
    assert(
      listMembersRes.status === 200 &&
      listMembersJson.members?.some((m: any) => m.user_id === intern1.id),
      'GET /projects/:id/members returns assigned members'
    );

    // -------------------------------------------------------------
    // 4. Work Item Hierarchy Enforcement
    // -------------------------------------------------------------
    console.log('\n--- 4. Work Item Hierarchy Enforcement ---');

    // 4a. EPIC creation (Must NOT have parent)
    const epicRes = await fetch(`${BASE_URL}/work-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mgrToken}`,
      },
      body: JSON.stringify({
        title: 'Epic 1: User Experience',
        type: 'EPIC',
        project_id: projectId,
        priority: 'HIGH',
      }),
    });
    const epicJson: any = await epicRes.json();
    assert(epicRes.status === 201 && epicJson.work_item?.id, 'Create EPIC without parent succeeds (HTTP 201)');
    const epicId = epicJson.work_item.id;

    // EPIC cannot have parent
    const invalidEpicRes = await fetch(`${BASE_URL}/work-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mgrToken}`,
      },
      body: JSON.stringify({
        title: 'Invalid Epic',
        type: 'EPIC',
        project_id: projectId,
        parent_id: epicId,
      }),
    });
    assert(invalidEpicRes.status === 400, 'EPIC with parent_id rejected (HTTP 400)');

    // 4b. STORY creation (Parent must be EPIC)
    const storyRes = await fetch(`${BASE_URL}/work-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mgrToken}`,
      },
      body: JSON.stringify({
        title: 'Story 1: Task Management Flow',
        type: 'STORY',
        project_id: projectId,
        parent_id: epicId,
        priority: 'MEDIUM',
      }),
    });
    const storyJson: any = await storyRes.json();
    assert(storyRes.status === 201 && storyJson.work_item?.id, 'Create STORY with EPIC parent succeeds (HTTP 201)');
    const storyId = storyJson.work_item.id;

    // 4c. TASK creation (Parent must be STORY if parent provided)
    const taskRes = await fetch(`${BASE_URL}/work-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mgrToken}`,
      },
      body: JSON.stringify({
        title: 'Task 1: Build Scoped Project View',
        type: 'TASK',
        project_id: projectId,
        parent_id: storyId,
        priority: 'HIGH',
        assignee_ids: [intern1.id],
        due_date: new Date(Date.now() + 86400000 * 5).toISOString(),
      }),
    });
    const taskJson: any = await taskRes.json();
    assert(taskRes.status === 201 && taskJson.work_item?.id, 'Create TASK with STORY parent succeeds (HTTP 201)');
    const taskId = taskJson.work_item.id;

    // TASK with EPIC parent must fail
    const invalidTaskRes = await fetch(`${BASE_URL}/work-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mgrToken}`,
      },
      body: JSON.stringify({
        title: 'Invalid Task',
        type: 'TASK',
        project_id: projectId,
        parent_id: epicId, // invalid, parent must be STORY
      }),
    });
    assert(invalidTaskRes.status === 400, 'TASK with EPIC parent rejected (HTTP 400)');

    // 4d. SUBTASK creation (Parent must be TASK)
    const subtaskRes = await fetch(`${BASE_URL}/work-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mgrToken}`,
      },
      body: JSON.stringify({
        title: 'Subtask 1.1: Component Layout',
        type: 'SUBTASK',
        project_id: projectId,
        parent_id: taskId,
        priority: 'LOW',
      }),
    });
    const subtaskJson: any = await subtaskRes.json();
    assert(subtaskRes.status === 201 && subtaskJson.work_item?.id, 'Create SUBTASK with TASK parent succeeds (HTTP 201)');

    // SUBTASK without parent must fail
    const invalidSubtaskRes = await fetch(`${BASE_URL}/work-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mgrToken}`,
      },
      body: JSON.stringify({
        title: 'Invalid Subtask',
        type: 'SUBTASK',
        project_id: projectId,
      }),
    });
    assert(invalidSubtaskRes.status === 400, 'SUBTASK without parent rejected (HTTP 400)');

    // 4e. BUG creation (Standalone, cannot have parent)
    const bugRes = await fetch(`${BASE_URL}/work-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mgrToken}`,
      },
      body: JSON.stringify({
        title: 'Bug 1: Fix mobile padding',
        type: 'BUG',
        project_id: projectId,
        priority: 'URGENT',
      }),
    });
    const bugJson: any = await bugRes.json();
    assert(bugRes.status === 201 && bugJson.work_item?.id, 'Create BUG without parent succeeds (HTTP 201)');

    const invalidBugRes = await fetch(`${BASE_URL}/work-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mgrToken}`,
      },
      body: JSON.stringify({
        title: 'Invalid Bug',
        type: 'BUG',
        project_id: projectId,
        parent_id: taskId,
      }),
    });
    assert(invalidBugRes.status === 400, 'BUG with parent rejected (HTTP 400)');

    // -------------------------------------------------------------
    // 5. Personal Tasks (project_id = null)
    // -------------------------------------------------------------
    console.log('\n--- 5. Personal Tasks System ---');

    // Intern 1 creates personal task
    const personalTaskRes = await fetch(`${BASE_URL}/work-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${intern1Token}`,
      },
      body: JSON.stringify({
        title: 'My Daily Self-Study & Review',
        description: 'Review TypeScript generics documentation',
        type: 'TASK',
        project_id: null,
        priority: 'LOW',
      }),
    });
    const personalJson: any = await personalTaskRes.json();
    assert(
      personalTaskRes.status === 201 &&
      personalJson.work_item?.project_id === null,
      'Create personal task with project_id = null succeeds (HTTP 201)'
    );
    const personalTaskId = personalJson.work_item.id;

    // Check creator was automatically added as assignee
    const personalAssignee = personalJson.work_item.assignees?.some((a: any) => a.user_id === intern1.id);
    assert(personalAssignee, 'Creator is automatically assigned to personal task');

    // Intern 1 queries my_personal=true
    const listPersonalRes = await fetch(`${BASE_URL}/work-items?my_personal=true`, {
      headers: { Authorization: `Bearer ${intern1Token}` },
    });
    const listPersonalJson: any = await listPersonalRes.json();
    assert(
      listPersonalRes.status === 200 &&
      listPersonalJson.work_items?.some((w: any) => w.id === personalTaskId),
      'GET /work-items?my_personal=true returns user personal task'
    );

    // Intern 1 toggles completion on personal task
    const togglePersonalRes = await fetch(`${BASE_URL}/work-items/${personalTaskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${intern1Token}`,
      },
      body: JSON.stringify({ status: 'COMPLETED' }),
    });
    const togglePersonalJson: any = await togglePersonalRes.json();
    assert(
      togglePersonalRes.status === 200 &&
      togglePersonalJson.work_item?.status === 'COMPLETED',
      'Intern can toggle status of personal task to COMPLETED'
    );

    // Personal task cannot have a project work item as parent
    const invalidPersonalParent = await fetch(`${BASE_URL}/work-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${intern1Token}`,
      },
      body: JSON.stringify({
        title: 'Invalid personal task with project parent',
        type: 'TASK',
        project_id: null,
        parent_id: storyId,
      }),
    });
    assert(invalidPersonalParent.status === 400, 'Personal task with project parent rejected (HTTP 400)');

    // -------------------------------------------------------------
    // 6. Intern Project & Work Item Scoping
    // -------------------------------------------------------------
    console.log('\n--- 6. Intern Access & Scoping Verification ---');

    // Intern 1 is member of Project -> Can view project
    const intern1GetProj = await fetch(`${BASE_URL}/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${intern1Token}` },
    });
    assert(intern1GetProj.status === 200, 'Intern 1 (assigned member) can access project details');

    // Intern 1 can list work items for assigned project
    const intern1GetItems = await fetch(`${BASE_URL}/work-items?project_id=${projectId}`, {
      headers: { Authorization: `Bearer ${intern1Token}` },
    });
    const intern1ItemsJson: any = await intern1GetItems.json();
    assert(
      intern1GetItems.status === 200 &&
      intern1ItemsJson.work_items?.length >= 4,
      'Intern 1 can list work items in assigned project'
    );

    // Intern 1 can update status of task assigned to them
    const internUpdateTask = await fetch(`${BASE_URL}/work-items/${taskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${intern1Token}`,
      },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });
    assert(internUpdateTask.status === 200, 'Intern 1 can update status of assigned project task');

    // Login Intern 2 (Not a member of Project)
    const intern2Login = await login(intern2Email, 'password123', orgA.id);
    const intern2Token = intern2Login.token;

    // Intern 2 attempts to view Project -> HTTP 403 Forbidden
    const intern2GetProj = await fetch(`${BASE_URL}/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${intern2Token}` },
    });
    assert(intern2GetProj.status === 403, 'Intern 2 (non-member) forbidden from accessing project details (HTTP 403)');

    // Intern 2 attempts to list work items for Project -> HTTP 403 Forbidden
    const intern2GetItems = await fetch(`${BASE_URL}/work-items?project_id=${projectId}`, {
      headers: { Authorization: `Bearer ${intern2Token}` },
    });
    assert(intern2GetItems.status === 403, 'Intern 2 (non-member) forbidden from accessing project work items (HTTP 403)');

    // -------------------------------------------------------------
    // 7. Project Archival
    // -------------------------------------------------------------
    console.log('\n--- 7. Project Archival Lifecycle ---');

    const archiveRes = await fetch(`${BASE_URL}/projects/${projectId}/archive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mgrToken}` },
    });
    const archiveJson: any = await archiveRes.json();
    assert(
      archiveRes.status === 200 &&
      archiveJson.project?.status === 'ARCHIVED',
      'POST /projects/:id/archive updates project status to ARCHIVED'
    );

    // Intern cannot archive project
    const internArchiveRes = await fetch(`${BASE_URL}/projects/${projectId}/archive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${intern1Token}` },
    });
    assert(internArchiveRes.status === 403, 'Intern forbidden from archiving project (HTTP 403)');

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`TOTAL CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log('================================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('\n[FATAL ERROR]', err.message || err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Unhandled error in verify-pm-v1:', err);
  process.exit(1);
});
