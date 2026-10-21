import { prisma } from '../src/lib/prisma';

async function main() {
  const tables = await prisma.$queryRawUnsafe(`
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
  `);
  console.log('TABLES:', tables);

  const schemas = await prisma.$queryRawUnsafe(`
    SELECT schema_name FROM information_schema.schemata
  `);
  console.log('SCHEMAS:', schemas);

  const projectRows = await prisma.$queryRawUnsafe(`
    SELECT * FROM "projects"
  `);
  console.log('RAW PROJECTS COUNT:', (projectRows as any[]).length);
  console.log('RAW PROJECTS:', projectRows);
}

main().catch(console.error).finally(() => prisma.$disconnect());

