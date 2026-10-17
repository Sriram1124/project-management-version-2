import { getEffectiveDatabaseUrl, getSanitizedDatabaseInfo } from './prisma';

function runTests() {
  console.log('=== PRISMA CONFIGURATION & CONNECTION LIFECYCLE TESTS ===\n');
  let passed = 0;
  let total = 0;

  function assert(name: string, condition: boolean, details?: any) {
    total++;
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}`, details || '');
    }
  }

  // 1. Should upgrade Supabase session pooler (port 5432) to transaction pooler (port 6543)
  {
    const input = 'postgresql://user:pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres';
    const effective = getEffectiveDatabaseUrl(input)!;
    const u = new URL(effective);
    assert('Supabase pooler port rewrites from 5432 to 6543', u.port === '6543', { port: u.port });
    assert('pgbouncer=true is enforced for transaction pooler', u.searchParams.get('pgbouncer') === 'true');
    assert('Default connection_limit=3 is set for serverless', u.searchParams.get('connection_limit') === '3');
    assert('Default pool_timeout=30 is set', u.searchParams.get('pool_timeout') === '30');
  }

  // 2. Should retain port 6543 if already set and enforce pgbouncer
  {
    const input = 'postgresql://user:pass@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
    const effective = getEffectiveDatabaseUrl(input)!;
    const u = new URL(effective);
    assert('Retains port 6543 when already configured', u.port === '6543');
    assert('pgbouncer=true is set when port 6543 was already present', u.searchParams.get('pgbouncer') === 'true');
  }

  // 3. Should preserve custom PRISMA_CONNECTION_LIMIT if present in URL
  {
    const input = 'postgresql://user:pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?connection_limit=3';
    const effective = getEffectiveDatabaseUrl(input)!;
    const u = new URL(effective);
    assert('Preserves custom connection_limit from URL', u.searchParams.get('connection_limit') === '3');
  }

  // 4. Non-Supabase pooler (e.g. direct localhost) should NOT rewrite port or add pgbouncer
  {
    const input = 'postgresql://postgres:postgres@localhost:5432/mydb';
    const effective = getEffectiveDatabaseUrl(input)!;
    const u = new URL(effective);
    assert('Localhost port 5432 is untouched', u.port === '5432');
    assert('pgbouncer is NOT added to non-pooler database', u.searchParams.get('pgbouncer') === null);
    assert('connection_limit is still set for serverless container', u.searchParams.get('connection_limit') === '3');
  }

  // 5. getSanitizedDatabaseInfo should never return password or user credentials
  {
    const info = getSanitizedDatabaseInfo();
    assert('Database info returns configured status', info.configured === true);
    assert('Database info does not contain password field', !('password' in info));
    assert('Database info does not contain secret in string', !JSON.stringify(info).includes('pass'));
    assert('Database info correctly identifies pool mode as transaction', info.pool_mode === 'transaction');
    assert('Database info reports pgbouncer enabled', info.pgbouncer === true);
  }

  console.log(`\nTests completed: ${passed}/${total} passed.`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests();

