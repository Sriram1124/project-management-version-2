import { PrismaClient } from '@prisma/client';

/**
 * Derives the optimal database URL for serverless execution.
 * When connecting to Supabase Pooler (pooler.supabase.com):
 * - Rewrites port 5432 (Session mode) to 6543 (Transaction mode) to prevent EMAXCONNSESSION.
 * - Enforces pgbouncer=true to disable Prisma prepared statement caching across pooled connections.
 * - Enforces a conservative connection_limit (default 1) per serverless function instance.
 * - Enforces a pool_timeout (default 20s) so queries wait during sudden traffic bursts.
 */
export function getEffectiveDatabaseUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;

  try {
    const u = new URL(rawUrl);
    const isSupabasePooler = u.hostname.includes('pooler.supabase.com');

    if (isSupabasePooler) {
      // In serverless environments, Supabase Transaction Pooler (port 6543)
      // must be used instead of Session mode (port 5432) to avoid EMAXCONNSESSION exhaustion.
      if (u.port === '5432' || !u.port) {
        u.port = '6543';
      }
      u.searchParams.set('pgbouncer', 'true');
    }

    // Serverless connection limit: default to 3 connections per serverless function instance
    // unless explicitly configured via PRISMA_CONNECTION_LIMIT.
    if (!u.searchParams.has('connection_limit')) {
      const limit = process.env.PRISMA_CONNECTION_LIMIT || '3';
      u.searchParams.set('connection_limit', limit);
    }

    // Pool timeout: default to 30 seconds to allow queries to wait for a connection during brief spikes
    if (!u.searchParams.has('pool_timeout')) {
      const timeout = process.env.PRISMA_POOL_TIMEOUT || '30';
      u.searchParams.set('pool_timeout', timeout);
    }

    return u.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Returns safe database connection metadata with no secrets for diagnostics.
 */
export function getSanitizedDatabaseInfo() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) return { configured: false };
  try {
    const effective = getEffectiveDatabaseUrl(rawUrl);
    const u = new URL(effective || rawUrl);
    return {
      configured: true,
      host: u.hostname,
      port: Number(u.port || 5432),
      pool_mode: u.port === '6543' ? 'transaction' : (u.hostname.includes('pooler.supabase.com') ? 'session' : 'direct'),
      pgbouncer: u.searchParams.get('pgbouncer') === 'true',
      connection_limit: Number(u.searchParams.get('connection_limit') || 3),
      pool_timeout: Number(u.searchParams.get('pool_timeout') || 30),
    };
  } catch {
    return { configured: true, error: 'Invalid URL format' };
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const effectiveDatabaseUrl = getEffectiveDatabaseUrl(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(
    effectiveDatabaseUrl
      ? {
          datasources: {
            db: {
              url: effectiveDatabaseUrl,
            },
          },
        }
      : undefined
  );

globalForPrisma.prisma = prisma;

