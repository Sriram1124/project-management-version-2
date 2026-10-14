import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const childrenWithNullSprint = await prisma.workItem.findMany({
    where: {
      sprint_id: null,
      parent_id: { not: null },
    },
    include: {
      parent: true,
    },
  });
  console.log('Found child items with null sprint:', childrenWithNullSprint.length);
  for (const c of childrenWithNullSprint) {
    if (c.parent?.sprint_id) {
      console.log(`Syncing child "${c.title}" (${c.type}) to parent's sprint: ${c.parent.sprint_id}`);
      await prisma.workItem.update({
        where: { id: c.id },
        data: { sprint_id: c.parent.sprint_id },
      });
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
