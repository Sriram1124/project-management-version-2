import * as dotenv from 'dotenv';
dotenv.config();

import * as argon2 from 'argon2';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';

function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const randomBytes = crypto.randomBytes(12);
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += chars[randomBytes[i] % chars.length];
  }
  return pwd;
}

async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  const isInspect = args.includes('--inspect');

  console.log('====================================================');
  console.log('       INTERN BULK PASSWORD RESET TOOL              ');
  console.log('====================================================');

  // Query organizations and interns
  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      is_active: true,
      _count: {
        select: {
          users: true,
        },
      },
    },
  });

  console.log(`\nFound ${orgs.length} organization(s):`);
  orgs.forEach((o) => {
    console.log(` - [${o.id}] "${o.name}" (Active: ${o.is_active}, Total Users: ${o._count.users})`);
  });

  // Find all active interns
  const interns = await prisma.user.findMany({
    where: {
      is_active: true,
      roles: {
        some: {
          role: {
            name: 'INTERN',
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      user_code: true,
      organization_id: true,
      organization: {
        select: {
          name: true,
        },
      },
      cohort: {
        select: {
          name: true,
          code: true,
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  });

  console.log(`\nFound ${interns.length} active INTERN user(s) in database.\n`);

  if (isInspect) {
    console.log('Inspect mode complete.');
    await prisma.$disconnect();
    return;
  }

  if (!isExecute) {
    console.log('DRY RUN MODE (--execute not supplied).');
    console.log('Target interns to reset:');
    interns.forEach((u, i) => {
      console.log(`  ${i + 1}. ${u.name} | ${u.email} | Code: ${u.user_code || 'N/A'} | Org: ${u.organization?.name || 'N/A'}`);
    });
    console.log('\nTo perform the actual reset, run with --execute');
    await prisma.$disconnect();
    return;
  }

  console.log('EXECUTING BULK RESET...');
  const resetResults: Array<{
    name: string;
    email: string;
    user_code: string;
    organization: string;
    cohort: string;
    temporary_password: string;
  }> = [];

  for (let i = 0; i < interns.length; i++) {
    const intern = interns[i];
    const tempPassword = generateTemporaryPassword();
    const hash = await argon2.hash(tempPassword);

    await prisma.user.update({
      where: { id: intern.id },
      data: {
        password_hash: hash,
        must_change_password: true,
      },
    });

    // Invalidate sessions
    await prisma.userSession.deleteMany({
      where: { user_id: intern.id },
    });

    resetResults.push({
      name: intern.name,
      email: intern.email,
      user_code: intern.user_code || '',
      organization: intern.organization?.name || '',
      cohort: intern.cohort?.name || intern.cohort?.code || '',
      temporary_password: tempPassword,
    });

    console.log(`[${i + 1}/${interns.length}] Reset password for: ${intern.name} (${intern.email})`);
  }

  // Export to CSV
  const timestamp = Date.now();
  const outputDir = path.resolve(process.cwd(), 'credentials_exports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const csvFilePath = path.join(outputDir, `reset_credentials_${timestamp}.csv`);
  const csvHeader = 'Name,Email,User Code,Organization,Cohort,Temporary Password\n';
  const csvRows = resetResults
    .map(
      (r) =>
        `"${r.name.replace(/"/g, '""')}","${r.email}","${r.user_code}","${r.organization.replace(/"/g, '""')}","${r.cohort.replace(/"/g, '""')}","${r.temporary_password}"`
    )
    .join('\n');

  fs.writeFileSync(csvFilePath, csvHeader + csvRows, 'utf8');

  console.log('\n====================================================');
  console.log(`SUCCESS: Reset ${resetResults.length} intern passwords.`);
  console.log(`Fresh credentials CSV generated at:\n${csvFilePath}`);
  console.log('====================================================');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Fatal error during reset:', e);
  await prisma.$disconnect();
  process.exit(1);
});
