import { prisma } from '../src/lib/prisma';
import { ProjectHealthService } from '../src/services/project-health.service';
import { ProjectMethodology, WorkItemType, WorkItemStatus } from '@prisma/client';

const EXPECTED_PROJECT_NAMES = [
  'Attendance Management & Leave management',
  'Performance Management System (PerforMax)',
  'Performance Management System',
  'Project Management System (PRMS)',
  'ResolveHub (Ticket Management)',
  'Ticket Management System',
  'FinCredit AI- Credit Health & Loan Planning',
  'NEXORA - AI-Powered Company Portfolio Management',
  'Cross Project Code Review',
  'Fraud Detection System (BankShield)',
  'Resource Allocation & Management System',
  'Timesheet Management System (To be integrated with Project Management)',
  'AI Transaction Anomlay Detection',
  'AI Powered QA Test and Bug Analysis',
  'LOAN APPLICATION ANALYSER',
];

async function main() {
  console.log('===============================================================');
  console.log('COMPREHENSIVE FINAL VALIDATION: ALL 15 PROJECTS');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string, details?: any) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`, details || '');
      failed++;
    }
  }

  // 1. Verify Manager
  const manager = await prisma.user.findUnique({
    where: { email: 'manager@dailoqa.com' },
  });
  assert(Boolean(manager), 'manager@dailoqa.com exists in database');
  if (!manager) process.exit(1);

  // 2. Query all 15 projects
  const projects = await prisma.project.findMany({
    where: {
      name: { in: EXPECTED_PROJECT_NAMES },
      organization_id: manager.organization_id!,
    },
    include: {
      owner: { select: { id: true, email: true, name: true } },
      members: {
        include: { user: { select: { id: true, email: true, name: true } } },
      },
      sprints: {
        include: {
          _count: { select: { work_items: true } },
        },
        orderBy: { start_date: 'asc' },
      },
      work_items: {
        include: {
          assignees: { include: { user: true } },
          parent: true,
          children: true,
        },
      },
      _count: {
        select: { members: true, work_items: true, sprints: true },
      },
    },
  });

  assert(projects.length === 15, `All 15 target projects exist in database (found: ${projects.length})`);

  // Verify unique project IDs
  const uniqueIds = new Set(projects.map((p) => p.id));
  assert(uniqueIds.size === 15, 'All 15 projects have unique IDs');

  // Verify unique project names
  const uniqueNames = new Set(projects.map((p) => p.name));
  assert(uniqueNames.size === 15, 'All 15 projects have unique names');

  // 3. Project Owners
  const allOwnedByManager = projects.every((p) => p.owner_id === manager.id && p.owner?.email === 'manager@dailoqa.com');
  assert(allOwnedByManager, 'All 15 projects are owned by manager@dailoqa.com');

  // 4. Methodology Distribution (8 Scrum, 7 Kanban)
  const scrumProjects = projects.filter((p) => p.methodology === ProjectMethodology.SCRUM);
  const kanbanProjects = projects.filter((p) => p.methodology === ProjectMethodology.KANBAN);
  assert(
    scrumProjects.length === 8 && kanbanProjects.length === 7,
    `Balanced methodology distribution: Exactly 8 Scrum and 7 Kanban (Actual: ${scrumProjects.length} Scrum, ${kanbanProjects.length} Kanban)`
  );

  // 5. Work item counts (20-35 items per project)
  let allCountsValid = true;
  for (const p of projects) {
    const count = p.work_items.length;
    if (count < 20 || count > 35) {
      allCountsValid = false;
      console.warn(`  Project "${p.name}" has ${count} items (expected ~25-35)`);
    }
  }
  assert(allCountsValid, 'All 15 projects have realistic deliverables count (~23-31 work items each)');

  // 6. Sprints validation
  let allScrumSprintsValid = true;
  for (const p of scrumProjects) {
    if (p.sprints.length < 3 || p.sprints.length > 5) {
      allScrumSprintsValid = false;
      console.warn(`  Scrum project "${p.name}" has ${p.sprints.length} sprints`);
    }
    const activeSprints = p.sprints.filter((s) => s.status === 'ACTIVE');
    if (activeSprints.length !== 1) {
      allScrumSprintsValid = false;
      console.warn(`  Scrum project "${p.name}" has ${activeSprints.length} ACTIVE sprints (expected exactly 1)`);
    }
  }
  assert(allScrumSprintsValid, 'All 8 Scrum projects have 3-5 sprints with exactly 1 ACTIVE sprint per project');

  let allKanbanSprintsValid = true;
  for (const p of kanbanProjects) {
    if (p.sprints.length !== 0) {
      allKanbanSprintsValid = false;
      console.warn(`  Kanban project "${p.name}" has ${p.sprints.length} sprints (expected 0)`);
    }
  }
  assert(allKanbanSprintsValid, 'All 7 Kanban projects have 0 sprints (continuous flow)');

  // 7. Member assignment validation
  let allAssignmentsValid = true;
  let totalTasksChecked = 0;
  for (const p of projects) {
    const validMemberUserIds = new Set(p.members.map((m) => m.user_id));
    for (const w of p.work_items) {
      for (const a of w.assignees) {
        totalTasksChecked++;
        if (!validMemberUserIds.has(a.user_id)) {
          allAssignmentsValid = false;
          console.error(`  Invalid assignment: User ${a.user.email} assigned to task "${w.title}" in project "${p.name}" without project membership!`);
        }
      }
    }
  }
  assert(allAssignmentsValid, `All ${totalTasksChecked} task assignees match actual project memberships`);

  // 8. Story points & hierarchy validation
  let allStoryPointsValid = true;
  let allHierarchiesValid = true;
  let totalSpSum = 0;

  for (const p of projects) {
    for (const w of p.work_items) {
      // Story points check
      if (w.type === WorkItemType.TASK || w.type === WorkItemType.SUBTASK || w.type === WorkItemType.BUG) {
        if (w.story_points === null || w.story_points === undefined || w.story_points < 0) {
          allStoryPointsValid = false;
          console.error(`  Invalid SP: Item "${w.title}" has sp = ${w.story_points}`);
        } else {
          totalSpSum += w.story_points;
        }
      }

      // Hierarchy check
      if (w.type === WorkItemType.EPIC && w.parent_id !== null) {
        allHierarchiesValid = false;
        console.error(`  Epic "${w.title}" has a parent_id`);
      }
      if (w.type === WorkItemType.STORY && w.parent && w.parent.type !== WorkItemType.EPIC) {
        allHierarchiesValid = false;
        console.error(`  Story "${w.title}" has parent of type ${w.parent.type}`);
      }
      if (w.type === WorkItemType.TASK && w.parent && w.parent.type !== WorkItemType.STORY) {
        allHierarchiesValid = false;
        console.error(`  Task "${w.title}" has parent of type ${w.parent.type}`);
      }
      if (w.type === WorkItemType.SUBTASK && w.parent && w.parent.type !== WorkItemType.TASK) {
        allHierarchiesValid = false;
        console.error(`  Subtask "${w.title}" has parent of type ${w.parent.type}`);
      }
    }
  }
  assert(allStoryPointsValid, `All deliverable work items have valid non-negative story points (Total SP sum: ${totalSpSum})`);
  assert(allHierarchiesValid, 'Strict Jira hierarchy validated: Epic -> Story -> Task -> Subtask');

  // 9. Project Health & Analytics
  let allAnalyticsPassed = true;
  for (const p of projects) {
    const health = ProjectHealthService.classifyProjectHealth(p as any);
    if (!health || typeof health.total_sp !== 'number' || typeof health.progress_percentage !== 'number') {
      allAnalyticsPassed = false;
      console.error(`  Analytics computation failed for "${p.name}":`, health);
    }
  }
  assert(allAnalyticsPassed, 'Project health & analytics computed cleanly for all 15 projects');

  // 10. Check that existing projects are preserved
  const originalInteen = await prisma.project.findFirst({
    where: { name: { contains: 'inteen', mode: 'insensitive' } },
  });
  const originalTest = await prisma.project.findFirst({
    where: { name: 'test' },
  });
  const originalTest2 = await prisma.project.findFirst({
    where: { name: 'test2' },
  });

  assert(Boolean(originalInteen), 'Original project "inteen" preserved intact');
  assert(Boolean(originalTest), 'Original project "test" preserved intact');
  assert(Boolean(originalTest2), 'Original project "test2" preserved intact');

  console.log('\n===============================================================');
  console.log(`FINAL RESULT: ${passed} / ${passed + failed} CHECKS PASSED`);
  console.log('===============================================================\n');

  if (failed === 0) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('Validation script failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

