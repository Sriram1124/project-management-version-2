require('dotenv').config({ path: 'backend-node/.env' });
const { PrismaClient } = require('./backend-node/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: 'sachin' } },
        { name: { contains: 'Postman' } },
        { name: { contains: 'Sachin' } },
        { email: { contains: 'dailoqa' } }
      ]
    },
    select: { id: true, email: true, name: true, role: true, user_code: true }
  });
  console.log('Users found:', JSON.stringify(users, null, 2));
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

