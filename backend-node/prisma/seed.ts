import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding roles and permissions...');

  // 1. Create Roles
  const roles = ['ADMIN', 'MANAGER', 'INTERN', 'TECH_LEAD', 'SUPER_ADMIN', 'EMPLOYEE'];
  for (const roleName of roles) {
    await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
  }

  // 2. Create Permissions
  const permissions = [
    'USER_READ', 'USER_CREATE', 'USER_BULK_CREATE', 'USER_UPDATE', 'USER_DELETE',
    'PROJECT_READ', 'PROJECT_CREATE', 'PROJECT_UPDATE', 'PROJECT_DELETE',
    'TASK_READ', 'TASK_CREATE', 'TASK_UPDATE', 'TASK_DELETE', 'TASK_ASSIGN',
    'FORM_READ', 'FORM_CREATE', 'FORM_UPDATE', 'FORM_DELETE', 'FORM_SUBMIT',
    'ATTENDANCE_READ', 'ATTENDANCE_CREATE', 'ATTENDANCE_UPDATE',
    'EVALUATION_READ', 'EVALUATION_CREATE', 'EVALUATION_UPDATE',
    'ORGANIZATION_READ', 'ORGANIZATION_CREATE', 'ORGANIZATION_UPDATE', 'ORGANIZATION_DELETE',
    'DOCUMENT_UPLOAD',
    'NOTIFICATION_READ', 'NOTIFICATION_CREATE'
  ];

  for (const permName of permissions) {
    await prisma.permission.upsert({
      where: { name: permName },
      update: {},
      create: { name: permName },
    });
  }

  // 3. Assign Permissions to Roles (Manager & Intern & Employee & Tech Lead)
  const managerRole = await prisma.role.findUnique({ where: { name: 'MANAGER' } });
  const internRole = await prisma.role.findUnique({ where: { name: 'INTERN' } });
  const employeeRole = await prisma.role.findUnique({ where: { name: 'EMPLOYEE' } });
  const superAdminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
  const techLeadRole = await prisma.role.findUnique({ where: { name: 'TECH_LEAD' } });

  const superAdminPerms = [
    'ORGANIZATION_READ', 'ORGANIZATION_CREATE', 'ORGANIZATION_UPDATE', 'ORGANIZATION_DELETE',
    'USER_READ', 'USER_CREATE', 'USER_UPDATE', 'USER_DELETE',
    'PROJECT_READ', 'PROJECT_CREATE', 'PROJECT_UPDATE', 'PROJECT_DELETE'
  ];

  const managerPerms = [
    'USER_READ', 'USER_CREATE', 'USER_BULK_CREATE', 'USER_UPDATE', 'USER_DELETE',
    'PROJECT_READ', 'PROJECT_CREATE', 'PROJECT_UPDATE', 'PROJECT_DELETE',
    'TASK_READ', 'TASK_CREATE', 'TASK_UPDATE', 'TASK_DELETE', 'TASK_ASSIGN',
    'FORM_READ', 'FORM_CREATE', 'FORM_UPDATE', 'FORM_DELETE', 'FORM_SUBMIT',
    'EVALUATION_READ', 'EVALUATION_CREATE', 'EVALUATION_UPDATE',
    'ATTENDANCE_READ', 'ATTENDANCE_CREATE', 'ATTENDANCE_UPDATE', 'DOCUMENT_UPLOAD',
    'NOTIFICATION_READ', 'NOTIFICATION_CREATE'
  ];

  const techLeadPerms = [
    'PROJECT_READ', 'PROJECT_UPDATE', 'TASK_READ', 'TASK_CREATE', 'TASK_UPDATE', 'TASK_ASSIGN',
    'FORM_READ', 'DOCUMENT_UPLOAD', 'ROLE_ASSIGN', 'CYCLE_ACTIVATE', 'CYCLE_UPDATE', 'CYCLE_CREATE',
    'ACTION_ITEM_CREATE', 'ACTION_ITEM_DELETE'
  ];

  const internPerms = [
    'PROJECT_READ', 'TASK_READ', 'TASK_UPDATE', 'FORM_READ', 'FORM_SUBMIT',
    'ATTENDANCE_READ', 'ATTENDANCE_CREATE'
  ];

  const employeePerms = [
    'PROJECT_READ', 'TASK_READ', 'TASK_UPDATE', 'FORM_READ', 'FORM_SUBMIT',
    'ATTENDANCE_READ', 'ATTENDANCE_CREATE'
  ];

  if (superAdminRole) {
    for (const permName of superAdminPerms) {
      const perm = await prisma.permission.findUnique({ where: { name: permName } });
      if (perm) {
        await prisma.rolePermission.upsert({
          where: {
            role_id_permission_id: {
              role_id: superAdminRole.id,
              permission_id: perm.id
            }
          },
          update: {},
          create: {
            role_id: superAdminRole.id,
            permission_id: perm.id
          }
        });
      }
    }
  }

  if (managerRole) {
    for (const permName of managerPerms) {
      const perm = await prisma.permission.findUnique({ where: { name: permName } });
      if (perm) {
        await prisma.rolePermission.upsert({
          where: {
            role_id_permission_id: {
              role_id: managerRole.id,
              permission_id: perm.id
            }
          },
          update: {},
          create: {
            role_id: managerRole.id,
            permission_id: perm.id
          }
        });
      }
    }
  }

  if (internRole) {
    for (const permName of internPerms) {
      const perm = await prisma.permission.findUnique({ where: { name: permName } });
      if (perm) {
        await prisma.rolePermission.upsert({
          where: {
            role_id_permission_id: {
              role_id: internRole.id,
              permission_id: perm.id
            }
          },
          update: {},
          create: {
            role_id: internRole.id,
            permission_id: perm.id
          }
        });
      }
    }
  }

  if (employeeRole) {
    for (const permName of employeePerms) {
      const perm = await prisma.permission.findUnique({ where: { name: permName } });
      if (perm) {
        await prisma.rolePermission.upsert({
          where: {
            role_id_permission_id: {
              role_id: employeeRole.id,
              permission_id: perm.id
            }
          },
          update: {},
          create: {
            role_id: employeeRole.id,
            permission_id: perm.id
          }
        });
      }
    }
  }

  if (techLeadRole) {
    for (const permName of techLeadPerms) {
      const perm = await prisma.permission.findUnique({ where: { name: permName } });
      if (perm) {
        await prisma.rolePermission.upsert({
          where: {
            role_id_permission_id: {
              role_id: techLeadRole.id,
              permission_id: perm.id
            }
          },
          update: {},
          create: {
            role_id: techLeadRole.id,
            permission_id: perm.id
          }
        });
      }
    }
  }

  // 4. Default Organization
  let org = await prisma.organization.findFirst({ where: { name: 'Dailoqa Technologies' } });
  if (!org) {
    org = await prisma.organization.create({
      data: { name: 'Dailoqa Technologies' },
    });
  }

  await prisma.organizationWorkPolicy.upsert({
    where: { organization_id: org.id },
    update: {
      office_start_time: '09:00',
      office_end_time: '17:30',
      break_start_time: '13:00',
      break_end_time: '14:00',
      lunch_break_minutes: 60,
      timezone: 'Asia/Kolkata',
    },
    create: {
      organization_id: org.id,
      office_start_time: '09:00',
      office_end_time: '17:30',
      break_start_time: '13:00',
      break_end_time: '14:00',
      lunch_break_minutes: 60,
      timezone: 'Asia/Kolkata',
    },
  });

  // 5. Create / Update Users
  const passwordHash = await argon2.hash('password123');
  
  const manager = await prisma.user.upsert({
    where: { email: 'manager@dailoqa.com' },
    update: { organization_id: org.id, password_hash: passwordHash, must_change_password: false, is_active: true },
    create: {
      name: 'Test Manager',
      email: 'manager@dailoqa.com',
      password_hash: passwordHash,
      organization_id: org.id,
      must_change_password: false,
    },
  });

  const intern = await prisma.user.upsert({
    where: { email: 'intern@dailoqa.com' },
    update: { organization_id: org.id, batch: 'Batch 2026-A', password_hash: passwordHash, must_change_password: false, is_active: true },
    create: {
      name: 'Test Intern',
      email: 'intern@dailoqa.com',
      password_hash: passwordHash,
      organization_id: org.id,
      batch: 'Batch 2026-A',
      must_change_password: false,
    },
  });

  const lead = await prisma.user.upsert({
    where: { email: 'lead@dailoqa.com' },
    update: { organization_id: org.id, password_hash: passwordHash, must_change_password: false, is_active: true },
    create: {
      name: 'Alex Tech Lead',
      email: 'lead@dailoqa.com',
      password_hash: passwordHash,
      organization_id: org.id,
      must_change_password: false,
    },
  });

  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@dailoqa.com' },
    update: { organization_id: null, password_hash: passwordHash, must_change_password: false, is_active: true },
    create: {
      name: 'Global Super Admin',
      email: 'superadmin@dailoqa.com',
      password_hash: passwordHash,
      organization_id: null,
      must_change_password: false,
    },
  });

  // 6. Assign Users to Roles
  const seededTechLeadRole = await prisma.role.findUnique({ where: { name: 'TECH_LEAD' } });

  if (superAdminRole && superAdmin) {
    await prisma.userRole.upsert({
      where: {
        user_id_role_id: {
          user_id: superAdmin.id,
          role_id: superAdminRole.id
        }
      },
      update: {},
      create: {
        user_id: superAdmin.id,
        role_id: superAdminRole.id
      }
    });
  }

  if (managerRole && manager) {
    await prisma.userRole.upsert({
      where: {
        user_id_role_id: {
          user_id: manager.id,
          role_id: managerRole.id
        }
      },
      update: {},
      create: {
        user_id: manager.id,
        role_id: managerRole.id
      }
    });
  }

  if (internRole && intern) {
    await prisma.userRole.upsert({
      where: {
        user_id_role_id: {
          user_id: intern.id,
          role_id: internRole.id
        }
      },
      update: {},
      create: {
        user_id: intern.id,
        role_id: internRole.id
      }
    });
  }

  if (seededTechLeadRole && lead) {
    await prisma.userRole.upsert({
      where: {
        user_id_role_id: {
          user_id: lead.id,
          role_id: seededTechLeadRole.id
        }
      },
      update: {},
      create: {
        user_id: lead.id,
          role_id: seededTechLeadRole.id
      }
    });
  }

  console.log('Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

