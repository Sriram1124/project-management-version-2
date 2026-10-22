import { prisma } from '../src/lib/prisma';

async function main() {
  const countBefore = await prisma.workItem.count({
    where: { sprint_id: null, status: { not: 'COMPLETED' } },
  });

  console.log(`Found ${countBefore} backlog items (sprint_id: null) with status !== 'COMPLETED'.`);

  if (countBefore === 0) {
    console.log('All backlog items are already marked as COMPLETED.');
    return;
  }

  const result = await prisma.workItem.updateMany({
    where: {
      sprint_id: null,
      status: { not: 'COMPLETED' },
    },
    data: {
      status: 'COMPLETED',
      completed_at: new Date(),
    },
  });

  console.log(`Successfully updated ${result.count} backlog work items to COMPLETED.`);

  const remaining = await prisma.workItem.count({
    where: { sprint_id: null, status: { not: 'COMPLETED' } },
  });
  console.log(`Remaining non-completed backlog items: ${remaining}`);
}

main()
  .catch((err) => {
    console.error('Error updating backlog items:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
