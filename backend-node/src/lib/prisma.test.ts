const { getEffectiveDatabaseUrl, getSanitizedDatabaseInfo } = jest.requireActual('./prisma');

describe('Prisma Configuration & Connection Lifecycle Tests', () => {
  it('rewrites Supabase session pooler port from 5432 to 6543 and sets transaction pooler params', () => {
    const input = 'postgresql://user:pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres';
    const effective = getEffectiveDatabaseUrl(input);
    expect(effective).not.toBeNull();
    const u = new URL(effective!);
    expect(u.port).toBe('6543');
    expect(u.searchParams.get('pgbouncer')).toBe('true');
    expect(u.searchParams.get('connection_limit')).toBe('3');
    expect(u.searchParams.get('pool_timeout')).toBe('30');
  });

  it('retains port 6543 when already configured and enforces pgbouncer', () => {
    const input = 'postgresql://user:pass@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
    const effective = getEffectiveDatabaseUrl(input);
    expect(effective).not.toBeNull();
    const u = new URL(effective!);
    expect(u.port).toBe('6543');
    expect(u.searchParams.get('pgbouncer')).toBe('true');
  });

  it('preserves custom PRISMA_CONNECTION_LIMIT if present in URL', () => {
    const input = 'postgresql://user:pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?connection_limit=3';
    const effective = getEffectiveDatabaseUrl(input);
    expect(effective).not.toBeNull();
    const u = new URL(effective!);
    expect(u.searchParams.get('connection_limit')).toBe('3');
  });

  it('does NOT rewrite port or add pgbouncer for non-Supabase database (e.g. localhost)', () => {
    const input = 'postgresql://postgres:postgres@localhost:5432/mydb';
    const effective = getEffectiveDatabaseUrl(input);
    expect(effective).not.toBeNull();
    const u = new URL(effective!);
    expect(u.port).toBe('5432');
    expect(u.searchParams.get('pgbouncer')).toBeNull();
    expect(u.searchParams.get('connection_limit')).toBe('3');
  });

  it('getSanitizedDatabaseInfo never returns password or user credentials', () => {
    const origUrl = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = 'postgresql://user:secretpassword@aws-0-ap-south-1.pooler.supabase.com:5432/postgres';
      const info = getSanitizedDatabaseInfo();
      expect(info.configured).toBe(true);
      expect(info).not.toHaveProperty('password');
      expect(JSON.stringify(info)).not.toContain('secretpassword');
      expect(info.pool_mode).toBe('transaction');
      expect(info.pgbouncer).toBe(true);
    } finally {
      process.env.DATABASE_URL = origUrl;
    }
  });

  it('getSanitizedDatabaseInfo returns configured: false when DATABASE_URL is not set', () => {
    const origUrl = process.env.DATABASE_URL;
    try {
      delete process.env.DATABASE_URL;
      const info = getSanitizedDatabaseInfo();
      expect(info.configured).toBe(false);
    } finally {
      process.env.DATABASE_URL = origUrl;
    }
  });
});
