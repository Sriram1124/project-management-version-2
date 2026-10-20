import { prisma } from '../lib/prisma';

async function main() {
  const stories = await prisma.workItem.findMany({
    where: { type: 'STORY' },
    include: {
      children: {
        select: { id: true, title: true, type: true, parent_id: true }
      }
    }
  });

  const violations: any[] = [];
  for (const s of stories) {
    for (const c of s.children) {
      if (c.type !== 'TASK') {
        violations.push({ storyId: s.id, storyTitle: s.title, childId: c.id, childTitle: c.title, childType: c.type });
      }
    }
  }

  // Also check existing stories with invalid story points (null, <= 0)
  const invalidStoryPoints = await prisma.workItem.findMany({
    where: {
      type: 'STORY',
      OR: [
        { story_points: null },
        { story_points: { lte: 0 } }
      ]
    },
    select: { id: true, title: true, story_points: true }
  });

  console.log('Total stories:', stories.length);
  console.log('Hierarchy violations found:', JSON.stringify(violations, null, 2));
  console.log('Stories with null/zero/negative story points:', JSON.stringify(invalidStoryPoints, null, 2));
}

main().catch(console.error).finally(() => process.exit(0));
