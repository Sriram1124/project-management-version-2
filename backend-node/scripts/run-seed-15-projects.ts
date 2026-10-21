import {
  PrismaClient,
  ProjectMethodology,
  ProjectStatus,
  SprintStatus,
  WorkItemType,
  WorkItemStatus,
  WorkItemPriority,
} from '@prisma/client';

import { PROJECTS_SPEC } from './seed-spec-part1';
import { PROJECTS_SPEC_PART2 } from './seed-spec-part2';
import { PROJECTS_SPEC_PART3 } from './seed-spec-part3';
import { PROJECTS_SPEC_PART4 } from './seed-spec-part4';
import { PROJECTS_SPEC_PART5 } from './seed-spec-part5';

const prisma = new PrismaClient();

const now = new Date('2026-10-19T10:00:00.000Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);
const daysFromNow = (d: number) => new Date(now.getTime() + d * 86400000);

async function main() {
  console.log('===============================================================');
  console.log('SEEDING 15 DISTINCT PROJECTS WITH COMPLETE DATA');
  console.log('===============================================================\n');

  // 1. Verify manager account
  const manager = await prisma.user.findUnique({
    where: { email: 'manager@dailoqa.com' },
    include: {
      organization: true,
      roles: { include: { role: true } },
    },
  });

  if (!manager) {
    throw new Error('Required manager account manager@dailoqa.com not found in database!');
  }

  const orgId = manager.organization_id;
  if (!orgId) {
    throw new Error('Manager account does not have an organization_id assigned!');
  }

  console.log(`Verified Manager: ${manager.name} (${manager.email}) | ID: ${manager.id}`);
  console.log(`Target Organization: ${manager.organization?.name} | ID: ${orgId}\n`);

  // 2. Fetch all users in organization
  const allUsers = await prisma.user.findMany({
    where: { organization_id: orgId },
    select: { id: true, email: true, name: true },
  });
  const userMap = new Map(allUsers.map((u) => [u.email.toLowerCase(), u]));
  console.log(`Loaded ${allUsers.length} active users in organization for assignment.\n`);

  // Combine all specifications
  const allSpecs = [
    ...PROJECTS_SPEC,
    ...PROJECTS_SPEC_PART2,
    ...PROJECTS_SPEC_PART3,
    ...PROJECTS_SPEC_PART4,
    ...PROJECTS_SPEC_PART5,
  ];

  console.log(`Total project specifications to process: ${allSpecs.length}\n`);

  const createdProjectsSummary: any[] = [];

  for (let idx = 0; idx < allSpecs.length; idx++) {
    const spec = allSpecs[idx];
    const projectNum = idx + 1;
    console.log(`--- [${projectNum}/15] Processing: "${spec.name}" (${spec.methodology}) ---`);

    // 1. Find or create project
    let project = await prisma.project.findFirst({
      where: {
        name: spec.name,
        organization_id: orgId,
      },
    });

    if (!project) {
      project = await prisma.project.create({
        data: {
          organization_id: orgId,
          owner_id: manager.id,
          name: spec.name,
          description: spec.description,
          methodology: spec.methodology,
          status: ProjectStatus.ACTIVE,
          start_date: daysAgo(45),
          end_date: daysFromNow(45),
        },
      });
      console.log(`  Created project ID: ${project.id}`);
    } else {
      // Ensure owner and methodology match
      project = await prisma.project.update({
        where: { id: project.id },
        data: {
          owner_id: manager.id,
          methodology: spec.methodology,
          description: spec.description,
          status: ProjectStatus.ACTIVE,
        },
      });
      console.log(`  Updated existing project ID: ${project.id}`);
    }

    // 2. Assign project members
    const eligibleMembers: { id: string; name: string; email: string; role: string }[] = [];
    for (const mem of spec.members) {
      const u = userMap.get(mem.email.toLowerCase());
      if (!u) {
        console.warn(`  User ${mem.email} not found in DB!`);
        continue;
      }
      eligibleMembers.push({ ...u, role: mem.role });

      await prisma.projectMember.upsert({
        where: {
          project_id_user_id: {
            project_id: project.id,
            user_id: u.id,
          },
        },
        update: {
          project_role: mem.role,
        },
        create: {
          project_id: project.id,
          user_id: u.id,
          project_role: mem.role,
        },
      });
    }
    console.log(`  Ensured ${eligibleMembers.length} project members assigned.`);

    // 3. Create Sprints for Scrum projects
    const sprintMap: Record<number, string> = {};
    if (spec.methodology === ProjectMethodology.SCRUM) {
      const existingSprints = await prisma.sprint.findMany({
        where: { project_id: project.id },
        orderBy: { created_at: 'asc' },
      });

      if (existingSprints.length >= 4) {
        existingSprints.forEach((s, i) => {
          sprintMap[i] = s.id;
        });
        console.log(`  Found ${existingSprints.length} existing sprints.`);
      } else {
        // Clean out any conflicting existing test sprints if under 4
        await prisma.workItem.updateMany({
          where: { project_id: project.id },
          data: { sprint_id: null },
        });
        await prisma.sprint.deleteMany({
          where: { project_id: project.id },
        });

        const s1 = await prisma.sprint.create({
          data: {
            organization_id: orgId,
            project_id: project.id,
            name: 'Sprint 1 - Foundation & Core Architecture',
            goal: 'Establish database schemas, authentication, and core domain baseline models.',
            status: SprintStatus.COMPLETED,
            start_date: daysAgo(45),
            end_date: daysAgo(31),
          },
        });
        sprintMap[0] = s1.id;

        const s2 = await prisma.sprint.create({
          data: {
            organization_id: orgId,
            project_id: project.id,
            name: 'Sprint 2 - MVP Deliverables & Integration',
            goal: 'Deliver high-priority client workflows and primary service endpoints.',
            status: SprintStatus.COMPLETED,
            start_date: daysAgo(30),
            end_date: daysAgo(16),
          },
        });
        sprintMap[1] = s2.id;

        const s3 = await prisma.sprint.create({
          data: {
            organization_id: orgId,
            project_id: project.id,
            name: 'Sprint 3 - Advanced Features & Active Workflows',
            goal: 'Execute current milestone deliverables, bug fixes, and performance optimization.',
            status: SprintStatus.ACTIVE,
            start_date: daysAgo(15),
            end_date: daysFromNow(6),
          },
        });
        sprintMap[2] = s3.id;

        const s4 = await prisma.sprint.create({
          data: {
            organization_id: orgId,
            project_id: project.id,
            name: 'Sprint 4 - Scale, Hardening & Launch',
            goal: 'Comprehensive cross-browser verification, telemetry monitoring, and production launch.',
            status: SprintStatus.PLANNED,
            start_date: daysFromNow(7),
            end_date: daysFromNow(21),
          },
        });
        sprintMap[3] = s4.id;

        console.log('  Created 4 valid sprints (2 COMPLETED, 1 ACTIVE, 1 PLANNED).');
      }
    }

    // 4. Create Work Items (if not already populated with full deliverables)
    const existingCount = await prisma.workItem.count({
      where: { project_id: project.id },
    });

    if (existingCount >= 20) {
      console.log(`  Project already has ${existingCount} work items. Preserving existing items.`);
    } else {
      let memberIdx = 0;
      let totalCreated = 0;

      for (const epicSpec of spec.epics) {
        // Create Epic
        const epic = await prisma.workItem.create({
          data: {
            organization_id: orgId,
            project_id: project.id,
            created_by: manager.id,
            type: WorkItemType.EPIC,
            title: epicSpec.title,
            description: epicSpec.desc,
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.HIGH,
            story_points: 0,
            start_date: daysAgo(40),
            due_date: daysFromNow(30),
          },
        });
        totalCreated++;

        for (const storySpec of epicSpec.stories) {
          const storySprintId =
            spec.methodology === ProjectMethodology.SCRUM && storySpec.sprintIndex !== undefined
              ? sprintMap[storySpec.sprintIndex] || null
              : null;

          const story = await prisma.workItem.create({
            data: {
              organization_id: orgId,
              project_id: project.id,
              sprint_id: storySprintId,
              parent_id: epic.id,
              created_by: manager.id,
              type: WorkItemType.STORY,
              title: storySpec.title,
              description: storySpec.desc,
              status: storySpec.status,
              priority: storySpec.priority,
              story_points: 0,
              start_date: daysAgo(35),
              due_date: daysFromNow(20),
            },
          });
          totalCreated++;

          // Assign lead to story
          const leadMember = eligibleMembers.find((m) => m.role === 'TECH_LEAD') || eligibleMembers[0];
          if (leadMember) {
            await prisma.workItemAssignee.create({
              data: { work_item_id: story.id, user_id: leadMember.id },
            });
          }

          for (const taskSpec of storySpec.tasks) {
            const taskSprintId =
              spec.methodology === ProjectMethodology.SCRUM && taskSpec.sprintIndex !== undefined
                ? sprintMap[taskSpec.sprintIndex] || null
                : null;

            // Pick member round-robin
            const assignee = eligibleMembers[memberIdx % eligibleMembers.length];
            memberIdx++;

            // Date calculations
            let startDate: Date = daysAgo(20);
            let dueDate: Date = daysFromNow(10);
            let completedAt: Date | null = null;

            if (taskSpec.status === WorkItemStatus.COMPLETED) {
              startDate = daysAgo(30);
              dueDate = daysAgo(10);
              completedAt = daysAgo(11);
            } else if (taskSpec.status === WorkItemStatus.IN_PROGRESS || taskSpec.status === WorkItemStatus.IN_REVIEW) {
              startDate = daysAgo(8);
              dueDate = daysFromNow(5);
            } else if (taskSpec.status === WorkItemStatus.BLOCKED) {
              startDate = daysAgo(12);
              dueDate = daysAgo(2); // Slightly overdue for realistic blocker tracking!
            } else if (taskSpec.status === WorkItemStatus.TODO) {
              startDate = daysFromNow(2);
              dueDate = daysFromNow(18);
            }

            const formattedDesc = `${taskSpec.desc}\n\n### Acceptance Criteria\n${taskSpec.acceptance
              .map((a) => `- [x] ${a}`)
              .join('\n')}`;

            const task = await prisma.workItem.create({
              data: {
                organization_id: orgId,
                project_id: project.id,
                sprint_id: taskSprintId,
                parent_id: story.id,
                created_by: manager.id,
                type: taskSpec.type,
                title: taskSpec.title,
                description: formattedDesc,
                status: taskSpec.status,
                priority: taskSpec.priority,
                story_points: taskSpec.sp,
                start_date: startDate,
                due_date: dueDate,
                completed_at: completedAt,
              },
            });
            totalCreated++;

            // Assign to eligible member
            if (assignee) {
              await prisma.workItemAssignee.create({
                data: { work_item_id: task.id, user_id: assignee.id },
              });
            }

            // Create Subtasks if any
            if (taskSpec.subtasks && taskSpec.subtasks.length > 0) {
              for (const sub of taskSpec.subtasks) {
                const subtask = await prisma.workItem.create({
                  data: {
                    organization_id: orgId,
                    project_id: project.id,
                    sprint_id: taskSprintId,
                    parent_id: task.id,
                    created_by: manager.id,
                    type: WorkItemType.SUBTASK,
                    title: sub.title,
                    description: sub.desc,
                    status: sub.status,
                    priority: taskSpec.priority,
                    story_points: sub.sp,
                    start_date: startDate,
                    due_date: dueDate,
                    completed_at: sub.status === WorkItemStatus.COMPLETED ? completedAt : null,
                  },
                });
                totalCreated++;

                if (assignee) {
                  await prisma.workItemAssignee.create({
                    data: { work_item_id: subtask.id, user_id: assignee.id },
                  });
                }
              }
            }
          }
        }
      }
      console.log(`  Populated ${totalCreated} work items with strict hierarchy and story points.`);
    }

    // Verify stats for this project
    const finalCounts = await prisma.project.findUnique({
      where: { id: project.id },
      include: {
        _count: {
          select: { members: true, work_items: true, sprints: true },
        },
      },
    });

    createdProjectsSummary.push({
      id: project.id,
      name: project.name,
      methodology: project.methodology,
      members: finalCounts?._count.members,
      workItems: finalCounts?._count.work_items,
      sprints: finalCounts?._count.sprints,
    });
    console.log('');
  }

  console.log('===============================================================');
  console.log('15 PROJECTS SEEDING COMPLETED SUCCESSFULLY!');
  console.log('===============================================================\n');
  console.table(createdProjectsSummary);
}

main()
  .catch((e) => {
    console.error('SEEDING FAILED:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

