import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const sprints = await prisma.sprint.findMany({
    include: {
      project: { select: { id: true, name: true, methodology: true } },
    },
    orderBy: { created_at: 'asc' },
  });
  console.log(`Total sprints: ${sprints.length}`);
  for (const s of sprints) {
    console.log(`- Sprint "${s.name}" (ID: ${s.id}) | Status: ${s.status} | Project: ${s.project?.name} (${s.project?.methodology}) | Dates: ${s.start_date} to ${s.end_date}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
