import { prisma } from '../src/lib/prisma';
import { ProjectService } from '../src/services/project.service';

async function main() {
  console.log('=== STARTING PROJECT METHODOLOGY VERIFICATION ===\n');

  // Find an admin/manager user to act as caller
  const user = await prisma.user.findFirst({
    where: {
      is_active: true,
      roles: {
        some: {
          role: {
            name: { in: ['ADMIN', 'MANAGER'] },
          },
        },
      },
    },
    include: {
      roles: {
        include: {
          role: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error('No active admin/manager user found for test');
  }

  const caller = {
    id: user.id,
    organization_id: user.organization_id,
    roles: user.roles.map((r) => r.role.name),
  };

  const createdProjectIds: string[] = [];

  try {
    // TEST 1: Existing projects have methodology backfilled
    console.log('--- Test 1: Verify existing projects have valid methodology ---');
    const existingProjects = await prisma.project.findMany({ take: 5 });
    console.log(`Found ${existingProjects.length} existing projects:`);
    for (const p of existingProjects) {
      console.log(`  Project "${p.name}": methodology = ${p.methodology}`);
      if (!p.methodology || (p.methodology !== 'SCRUM' && p.methodology !== 'KANBAN')) {
        throw new Error(`Project ${p.id} has invalid methodology: ${p.methodology}`);
      }
    }
    console.log('✓ PASS: All checked existing projects have valid methodology.\n');

    // TEST 2: Create project with SCRUM
    console.log('--- Test 2: Create project with explicit SCRUM methodology ---');
    const scrumProj = await ProjectService.createProject(
      {
        name: 'Verification Scrum Sprint Test Proj',
        description: 'Testing scrum sprint iterations',
        methodology: 'SCRUM',
      },
      caller
    );
    createdProjectIds.push(scrumProj.id);
    if (scrumProj.methodology !== 'SCRUM') {
      throw new Error(`Expected methodology to be SCRUM, got ${scrumProj.methodology}`);
    }
    console.log(`✓ PASS: Created Scrum project with id ${scrumProj.id}, methodology = ${scrumProj.methodology}\n`);

    // TEST 3: Create project with KANBAN
    console.log('--- Test 3: Create project with explicit KANBAN methodology ---');
    const kanbanProj = await ProjectService.createProject(
      {
        name: 'Verification Kanban Continuous Flow Proj',
        description: 'Testing continuous workflow without sprints',
        methodology: 'KANBAN',
      },
      caller
    );
    createdProjectIds.push(kanbanProj.id);
    if (kanbanProj.methodology !== 'KANBAN') {
      throw new Error(`Expected methodology to be KANBAN, got ${kanbanProj.methodology}`);
    }
    console.log(`✓ PASS: Created Kanban project with id ${kanbanProj.id}, methodology = ${kanbanProj.methodology}\n`);

    // TEST 4: Reject project creation without methodology
    console.log('--- Test 4: Reject project creation with missing methodology ---');
    let rejectedMissing = false;
    try {
      await ProjectService.createProject(
        {
          name: 'Invalid Missing Methodology Proj',
          methodology: undefined as any,
        },
        caller
      );
    } catch (err: any) {
      rejectedMissing = true;
      console.log(`Caught expected error: "${err.message}"`);
    }
    if (!rejectedMissing) {
      throw new Error('Server should have rejected project creation with missing methodology');
    }
    console.log('✓ PASS: Rejected project with missing methodology.\n');

    // TEST 5: Reject project creation with invalid methodology string
    console.log('--- Test 5: Reject project creation with invalid methodology string ---');
    let rejectedInvalid = false;
    try {
      await ProjectService.createProject(
        {
          name: 'Invalid Methodology Value Proj',
          methodology: 'WATERFALL' as any,
        },
        caller
      );
    } catch (err: any) {
      rejectedInvalid = true;
      console.log(`Caught expected error: "${err.message}"`);
    }
    if (!rejectedInvalid) {
      throw new Error('Server should have rejected project creation with invalid methodology');
    }
    console.log('✓ PASS: Rejected invalid methodology value.\n');

    // TEST 6: Reject attempts to update project methodology from KANBAN to SCRUM
    console.log('--- Test 6: Reject attempt to update project methodology from KANBAN to SCRUM ---');
    let rejectedImmutable = false;
    try {
      await ProjectService.updateProject(
        kanbanProj.id,
        {
          methodology: 'SCRUM',
        },
        caller
      );
    } catch (err: any) {
      rejectedImmutable = true;
      console.log(`Caught expected error: "${err.message}"`);
    }
    if (!rejectedImmutable) {
      throw new Error('Server should have rejected attempt to update project methodology');
    }
    const checkKanbanStillSame = await prisma.project.findUnique({ where: { id: kanbanProj.id } });
    if (checkKanbanStillSame?.methodology !== 'KANBAN') {
      throw new Error(`Project methodology was unexpectedly modified to ${checkKanbanStillSame?.methodology}`);
    }
    console.log('✓ PASS: Rejected methodology update and original KANBAN methodology remains intact.\n');

    // TEST 7: Normal update of other fields succeeds while preserving methodology
    console.log('--- Test 7: Normal update of name and description preserves methodology ---');
    const updatedProj = await ProjectService.updateProject(
      kanbanProj.id,
      {
        name: 'Verification Kanban Updated Name',
        description: 'Updated description',
      },
      caller
    );
    if (updatedProj.name !== 'Verification Kanban Updated Name' || updatedProj.methodology !== 'KANBAN') {
      throw new Error(`Expected name to be updated and methodology to remain KANBAN, got methodology ${updatedProj.methodology}`);
    }
    console.log(`✓ PASS: Updated project name to "${updatedProj.name}", methodology preserved as ${updatedProj.methodology}\n`);

    console.log('====================================================');
    console.log('ALL PROJECT METHODOLOGY VERIFICATION TESTS PASSED! ✓');
    console.log('====================================================');
  } finally {
    // Cleanup created test projects
    if (createdProjectIds.length > 0) {
      await prisma.project.deleteMany({
        where: { id: { in: createdProjectIds } },
      });
      console.log(`Cleaned up ${createdProjectIds.length} test projects.`);
    }
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('Test failed with error:', e);
  process.exit(1);
});

