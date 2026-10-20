const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function getCanonicalInternWhereClause(filters = {}) {
  const where = {
    roles: {
      some: {
        role: { name: 'INTERN' },
      },
      none: {
        role: { name: 'SUPER_ADMIN' },
      },
    },
  };

  if (filters.organizationId) {
    where.organization_id = filters.organizationId;
  }

  if (filters.isActive !== undefined) {
    where.is_active = filters.isActive;
  }

  if (filters.cohortId && filters.cohortId !== 'ALL') {
    const cId = filters.cohortId;
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          { cohort_id: cId },
          { cohort: { id: cId } },
          { cohort: { code: cId } },
          { cohort: { name: cId } },
        ],
      },
    ];
  }

  return where;
}

async function run() {
  const dailoqaOrg = await prisma.organization.findFirst({ where: { name: 'Dailoqa Solutions' } });
  const cohorts = await prisma.cohort.findMany({ where: { organization_id: dailoqaOrg.id } });

  console.log('Dailoqa Org ID:', dailoqaOrg.id);
  const totalCanonical = await prisma.user.count({
    where: getCanonicalInternWhereClause({ organizationId: dailoqaOrg.id })
  });
  console.log('Total Canonical Intern Count in Dailoqa:', totalCanonical);

  for (const c of cohorts) {
    const cohortCount = await prisma.user.count({
      where: getCanonicalInternWhereClause({ organizationId: dailoqaOrg.id, cohortId: c.id })
    });
    console.log(`Cohort [${c.name}] (${c.code}) Canonical Count:`, cohortCount);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());

