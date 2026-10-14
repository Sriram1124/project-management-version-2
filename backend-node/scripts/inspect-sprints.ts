import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const item1 = await prisma.workItem.findFirst({ where: { title: 'story-epic-1' } });
  const item2 = await prisma.workItem.findFirst({ where: { title: 'test_1' } });
  console.log('story-epic-1:', item1);
  console.log('test_1:', item2);
}

main().catch(console.error).finally(() => prisma.$disconnect());
