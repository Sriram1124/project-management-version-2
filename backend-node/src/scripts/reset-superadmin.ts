import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function resetSuperAdmin(email: string = 'superadmin@dailoqa.com', newPass: string = 'password123') {
  console.log(`Starting credential reset for superadmin: ${email}...`);

  const passwordHash = await argon2.hash(newPass);

  // Check or find SUPER_ADMIN role
  let superAdminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
  if (!superAdminRole) {
    superAdminRole = await prisma.role.create({ data: { name: 'SUPER_ADMIN' } });
  }

  // Upsert superadmin user
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      password_hash: passwordHash,
      is_active: true,
      must_change_password: false,
      organization_id: null, // Superadmin is global
    },
    create: {
      name: 'Global Super Admin',
      email,
      password_hash: passwordHash,
      organization_id: null,
      is_active: true,
      must_change_password: false,
    },
  });

  // Ensure user has SUPER_ADMIN role
  await prisma.userRole.upsert({
    where: {
      user_id_role_id: {
        user_id: user.id,
        role_id: superAdminRole.id,
      },
    },
    update: {},
    create: {
      user_id: user.id,
      role_id: superAdminRole.id,
    },
  });

  // Revoke active sessions for security
  try {
    await prisma.userSession.deleteMany({
      where: { user_id: user.id },
    });
  } catch (e) {
    // Optional table
  }

  console.log(`Successfully reset credentials for ${email}.`);
  console.log(`Email: ${email}`);
  console.log(`Status: Active | must_change_password: false`);
  await prisma.$disconnect();
}

const targetEmail = process.argv[2] || 'superadmin@dailoqa.com';
const targetPass = process.argv[3] || 'password123';

resetSuperAdmin(targetEmail, targetPass).catch((err) => {
  console.error('Error resetting superadmin:', err);
  process.exit(1);
});

