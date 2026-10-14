import { prisma } from '../src/lib/prisma';

async function main() {
  const items = await prisma.workItem.findMany({
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      priority: true,
      story_points: true,
      project: { select: { id: true, name: true } },
      parent: { select: { id: true, title: true, type: true } },
    },
    orderBy: { created_at: 'asc' },
  });

  console.log(`Total items in database: ${items.length}\n`);
  for (const item of items) {
    console.log(
      `- [${item.type}] "${item.title}" | SP: ${item.story_points} | Status: ${item.status} | Project: ${item.project?.name || 'Personal'} | Parent: ${item.parent?.title || 'None'}`
    );
  }
}

main().finally(() => prisma.$disconnect());

