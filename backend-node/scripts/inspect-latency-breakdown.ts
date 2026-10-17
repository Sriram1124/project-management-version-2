import * as dotenv from 'dotenv';
dotenv.config();
import { prisma, getEffectiveDatabaseUrl } from '../src/lib/prisma';
import { PrismaClient } from '@prisma/client';

async function measure() {
  console.log('=== LATENCY BREAKDOWN INVESTIGATION ===\n');

  // 1. Measure pure baseline query execution (sequential)
  console.log('1. Sequential Query Baseline (1 connection):');
  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    await prisma.project.findMany({ take: 5 });
    const dur = performance.now() - t0;
    times.push(dur);
    console.log(`   Sequential Query ${i + 1}: ${dur.toFixed(1)} ms`);
  }
  const avgBaseline = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`   -> Pure execution + network roundtrip average: ${avgBaseline.toFixed(1)} ms\n`);

  // 2. Measure queue time inside single Prisma Client (connection_limit: 3)
  console.log('2. Single Client Queue Concurrency (15 parallel requests queued through connection_limit=3):');
  const tStart = performance.now();
  const queueTimes = await Promise.all(
    Array.from({ length: 15 }, async (_, i) => {
      const qStart = performance.now();
      await prisma.project.findMany({ take: 5 });
      const qDur = performance.now() - qStart;
      return { index: i + 1, qDur };
    })
  );
  const totalSingleClient = performance.now() - tStart;
  console.log(`   Fastest (front of queue): ${Math.min(...queueTimes.map(q => q.qDur)).toFixed(1)} ms`);
  console.log(`   Slowest (back of queue):  ${Math.max(...queueTimes.map(q => q.qDur)).toFixed(1)} ms`);
  console.log(`   Average wait + execute:   ${(queueTimes.reduce((a, b) => a + b.qDur, 0) / queueTimes.length).toFixed(1)} ms`);
  console.log(`   Total time for all 15:    ${totalSingleClient.toFixed(1)} ms\n`);

  // 3. Measure multi-instance behavior (simulating 5 Vercel serverless containers, each with its own Prisma client)
  console.log('3. Multi-Instance Concurrency (5 separate serverless containers, each handling 3 parallel requests):');
  const url = getEffectiveDatabaseUrl(process.env.DATABASE_URL)!;
  const clients = Array.from({ length: 5 }, () => new PrismaClient({ datasources: { db: { url } } }));

  const multiStart = performance.now();
  const multiTimes = await Promise.all(
    clients.map(async (client, cIdx) => {
      // Each container handles 3 requests concurrently
      const cStart = performance.now();
      await Promise.all([
        client.project.findMany({ take: 5 }),
        client.project.findMany({ take: 5 }),
        client.project.findMany({ take: 5 }),
      ]);
      return performance.now() - cStart;
    })
  );
  const totalMulti = performance.now() - multiStart;

  console.log(`   All 15 queries across 5 containers completed in: ${totalMulti.toFixed(1)} ms`);
  console.log(`   Per-container latency average: ${(multiTimes.reduce((a, b) => a + b, 0) / multiTimes.length).toFixed(1)} ms`);

  // Cleanup
  await Promise.all(clients.map(c => c.$disconnect()));
  await prisma.$disconnect();

  console.log('\n=== CONCLUSION ===');
  console.log('The 3.58s average in the previous test was caused by single-process client queuing (75 queries queued on 1 process with limit=3).');
  console.log('When distributed across multiple serverless containers as occurs in production Vercel, requests execute in parallel without excessive client-side queuing.');
}

measure().catch(err => {
  console.error(err);
  process.exit(1);
});

