import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('=== INSPECTING MANAGER ACCOUNT ===');
  const manager = await prisma.user.findUnique({
    where: { email: 'manager@dailoqa.com' },
    include: {
      roles: { include: { role: true } },
      organization: true,
    },
  });
  if (!manager) {
    console.error('ERROR: manager@dailoqa.com does not exist!');
  } else {
    console.log('Manager ID:', manager.id);
    console.log('Manager Name:', manager.name);
    console.log('Manager Org:', manager.organization?.name, manager.organization_id);
    console.log('Manager Roles:', manager.roles.map((r) => r.role.name));
  }

  console.log('\n=== INSPECTING ALL PROJECTS ===');
  const projects = await prisma.project.findMany({
    include: {
      owner: { select: { id: true, email: true, name: true } },
      members: {
        include: { user: { select: { id: true, email: true, name: true } } },
      },
      sprints: true,
      _count: {
        select: { work_items: true, sprints: true, members: true },
      },
    },
    orderBy: { created_at: 'asc' },
  });

  console.log(`Total projects in database: ${projects.length}\n`);
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    console.log(`[Project ${i + 1}] ID: ${p.id}`);
    console.log(`  Name: "${p.name}"`);
    console.log(`  Methodology: ${p.methodology} | Status: ${p.status}`);
    console.log(`  Owner: ${p.owner?.name} (${p.owner?.email})`);
    console.log(`  Members (${p.members.length}):`);
    for (const m of p.members) {
      console.log(`    - ${m.user.name} <${m.user.email}> [${m.project_role || 'NO_ROLE'}]`);
    }
    console.log(`  Sprints: ${p.sprints.length}`);
    for (const s of p.sprints) {
      console.log(`    * Sprint "${s.name}" (${s.status})`);
    }
    console.log(`  Work Items count: ${p._count.work_items}`);
    console.log('');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

