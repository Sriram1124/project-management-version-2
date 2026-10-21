import { prisma } from '../src/lib/prisma';

async function main() {
  const users = await prisma.user.findMany({
    take: 20,
    select: {
      id: true,
      email: true,
      name: true,
      is_active: true,
      roles: {
        select: {
          role: { select: { name: true } }
        }
      }
    }
  });

  console.log('Sample Users in Database:');
  for (const u of users) {
    const roles = u.roles.map(r => r.role.name).join(', ');
    console.log(`- ${u.email} (${u.name}) [${roles}]`);
  }

  // Check if khushal.n.g@dailoqa.com exists
  const intern = await prisma.user.findUnique({
    where: { email: 'khushal.n.g@dailoqa.com' }
  });
  console.log('\nkhushal.n.g@dailoqa.com exists?', !!intern);

  // Check manager@dailoqa.com
  const mgr = await prisma.user.findUnique({
    where: { email: 'manager@dailoqa.com' }
  });
  console.log('manager@dailoqa.com exists?', !!mgr);

  // Check superadmin@dailoqa.com
  const sa = await prisma.user.findUnique({
    where: { email: 'superadmin@dailoqa.com' }
  });
  console.log('superadmin@dailoqa.com exists?', !!sa);
}

main().catch(console.error).finally(() => prisma.$disconnect());

