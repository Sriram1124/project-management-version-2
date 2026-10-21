import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const users = await prisma.user.findMany({
    where: { roles: { some: { role: { name: 'SUPER_ADMIN' } } } },
    select: { id: true, email: true, name: true, is_active: true, must_change_password: true, organization_id: true }
  });
  console.log('SUPERADMIN_LIST:', JSON.stringify(users));
  await prisma.$disconnect();
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});

