import * as dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';

export interface MiraiCandidate {
  mirai_user_id: string;
  email: string;
  organization_id?: string;
}

export interface ReconciliationReport {
  mode: 'DRY_RUN' | 'EXECUTE';
  timestamp: string;
  total_candidates: number;
  exact_uuid_matches: number;
  unique_email_matches: number;
  already_mapped: number;
  ambiguous_matches: number;
  org_conflicts: number;
  inactive_users: number;
  unmatched: number;
  created_mappings: number;
  details: {
    exact_uuid: Array<{ mirai_user_id: string; pm_user_id: string; email: string }>;
    unique_email: Array<{ mirai_user_id: string; pm_user_id: string; email: string }>;
    ambiguous: Array<{ mirai_user_id: string; email: string; reason: string }>;
    org_conflicts: Array<{ mirai_user_id: string; email: string; mirai_org?: string; pm_org: string }>;
    inactive: Array<{ mirai_user_id: string; pm_user_id: string; email: string }>;
    unmatched: Array<{ mirai_user_id: string; email: string }>;
  };
}

export async function runReconciliation(options?: {
  candidates?: MiraiCandidate[];
  inputFile?: string;
  organizationId?: string;
  execute?: boolean;
}): Promise<ReconciliationReport> {
  const args = process.argv.slice(2);
  const isExecute = options?.execute ?? args.includes('--execute');
  const isDryRun = !isExecute;

  let candidateInputPath = options?.inputFile;
  const inputIdx = args.indexOf('--input');
  if (inputIdx !== -1 && args[inputIdx + 1]) {
    candidateInputPath = args[inputIdx + 1];
  }

  let filterOrgId = options?.organizationId;
  const orgIdx = args.indexOf('--org');
  if (orgIdx !== -1 && args[orgIdx + 1]) {
    filterOrgId = args[orgIdx + 1];
  }

  let candidates: MiraiCandidate[] = options?.candidates || [];
  if (candidates.length === 0 && candidateInputPath) {
    const resolvedPath = path.resolve(process.cwd(), candidateInputPath);
    if (fs.existsSync(resolvedPath)) {
      const content = fs.readFileSync(resolvedPath, 'utf8');
      candidates = JSON.parse(content);
    } else {
      console.warn(`[WARN] Candidate input file not found: ${resolvedPath}`);
    }
  }

  const report: ReconciliationReport = {
    mode: isExecute ? 'EXECUTE' : 'DRY_RUN',
    timestamp: new Date().toISOString(),
    total_candidates: candidates.length,
    exact_uuid_matches: 0,
    unique_email_matches: 0,
    already_mapped: 0,
    ambiguous_matches: 0,
    org_conflicts: 0,
    inactive_users: 0,
    unmatched: 0,
    created_mappings: 0,
    details: {
      exact_uuid: [],
      unique_email: [],
      ambiguous: [],
      org_conflicts: [],
      inactive: [],
      unmatched: [],
    },
  };

  // Fetch all existing mappings to detect already mapped pairs or conflicting mappings
  const existingMappings = await prisma.userIdentityMapping.findMany();
  const mappedMiraiIds = new Set(existingMappings.map((m) => m.mirai_user_id));
  const mappedPmIds = new Set(existingMappings.map((m) => m.pm_user_id));

  // Query PM users
  const pmUsers = await prisma.user.findMany({
    where: filterOrgId ? { organization_id: filterOrgId } : undefined,
    select: {
      id: true,
      email: true,
      name: true,
      organization_id: true,
      is_active: true,
    },
  });

  const pmUserById = new Map(pmUsers.map((u) => [u.id, u]));

  // Group PM users by normalized email
  const pmUsersByEmail = new Map<string, typeof pmUsers>();
  for (const u of pmUsers) {
    const normEmail = (u.email || '').trim().toLowerCase();
    if (!normEmail) continue;
    if (!pmUsersByEmail.has(normEmail)) {
      pmUsersByEmail.set(normEmail, []);
    }
    pmUsersByEmail.get(normEmail)!.push(u);
  }

  // Candidates grouped by normalized email to detect duplicate candidate emails
  const candidatesByEmail = new Map<string, MiraiCandidate[]>();
  for (const c of candidates) {
    const normEmail = (c.email || '').trim().toLowerCase();
    if (!normEmail) continue;
    if (!candidatesByEmail.has(normEmail)) {
      candidatesByEmail.set(normEmail, []);
    }
    candidatesByEmail.get(normEmail)!.push(c);
  }

  const plannedInserts: Array<{
    organization_id: string;
    mirai_user_id: string;
    pm_user_id: string;
  }> = [];

  for (const candidate of candidates) {
    const miraiId = candidate.mirai_user_id.trim();
    const normEmail = (candidate.email || '').trim().toLowerCase();

    // Check if candidate is already mapped
    if (mappedMiraiIds.has(miraiId)) {
      report.already_mapped++;
      continue;
    }

    // 1. Check exact UUID match
    const exactPmUser = pmUserById.get(miraiId);
    if (exactPmUser) {
      if (!exactPmUser.is_active) {
        report.inactive_users++;
        report.details.inactive.push({
          mirai_user_id: miraiId,
          pm_user_id: exactPmUser.id,
          email: exactPmUser.email,
        });
        continue;
      }
      if (candidate.organization_id && candidate.organization_id !== exactPmUser.organization_id) {
        report.org_conflicts++;
        report.details.org_conflicts.push({
          mirai_user_id: miraiId,
          email: exactPmUser.email,
          mirai_org: candidate.organization_id,
          pm_org: exactPmUser.organization_id,
        });
        continue;
      }
      if (mappedPmIds.has(exactPmUser.id)) {
        report.ambiguous_matches++;
        report.details.ambiguous.push({
          mirai_user_id: miraiId,
          email: exactPmUser.email,
          reason: `PM user ${exactPmUser.id} is already mapped to a different MIRAI user`,
        });
        continue;
      }

      report.exact_uuid_matches++;
      report.details.exact_uuid.push({
        mirai_user_id: miraiId,
        pm_user_id: exactPmUser.id,
        email: exactPmUser.email,
      });

      plannedInserts.push({
        organization_id: exactPmUser.organization_id,
        mirai_user_id: miraiId,
        pm_user_id: exactPmUser.id,
      });
      mappedPmIds.add(exactPmUser.id);
      continue;
    }

    // 2. Check unique email match
    if (!normEmail) {
      report.unmatched++;
      report.details.unmatched.push({ mirai_user_id: miraiId, email: candidate.email });
      continue;
    }

    const emailCandidates = candidatesByEmail.get(normEmail) || [];
    if (emailCandidates.length > 1) {
      report.ambiguous_matches++;
      report.details.ambiguous.push({
        mirai_user_id: miraiId,
        email: candidate.email,
        reason: `Multiple MIRAI candidates share email ${normEmail}`,
      });
      continue;
    }

    const pmMatches = pmUsersByEmail.get(normEmail) || [];
    if (pmMatches.length === 0) {
      report.unmatched++;
      report.details.unmatched.push({ mirai_user_id: miraiId, email: candidate.email });
      continue;
    }

    if (pmMatches.length > 1) {
      report.ambiguous_matches++;
      report.details.ambiguous.push({
        mirai_user_id: miraiId,
        email: candidate.email,
        reason: `Multiple PM users (${pmMatches.length}) share email ${normEmail}`,
      });
      continue;
    }

    const targetPmUser = pmMatches[0];

    if (!targetPmUser.is_active) {
      report.inactive_users++;
      report.details.inactive.push({
        mirai_user_id: miraiId,
        pm_user_id: targetPmUser.id,
        email: targetPmUser.email,
      });
      continue;
    }

    if (candidate.organization_id && candidate.organization_id !== targetPmUser.organization_id) {
      report.org_conflicts++;
      report.details.org_conflicts.push({
        mirai_user_id: miraiId,
        email: targetPmUser.email,
        mirai_org: candidate.organization_id,
        pm_org: targetPmUser.organization_id,
      });
      continue;
    }

    if (mappedPmIds.has(targetPmUser.id)) {
      report.ambiguous_matches++;
      report.details.ambiguous.push({
        mirai_user_id: miraiId,
        email: targetPmUser.email,
        reason: `PM user ${targetPmUser.id} is already mapped`,
      });
      continue;
    }

    report.unique_email_matches++;
    report.details.unique_email.push({
      mirai_user_id: miraiId,
      pm_user_id: targetPmUser.id,
      email: targetPmUser.email,
    });

    plannedInserts.push({
      organization_id: targetPmUser.organization_id,
      mirai_user_id: miraiId,
      pm_user_id: targetPmUser.id,
    });
    mappedPmIds.add(targetPmUser.id);
  }

  if (isExecute && plannedInserts.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const item of plannedInserts) {
        await tx.userIdentityMapping.create({
          data: {
            organization_id: item.organization_id,
            mirai_user_id: item.mirai_user_id,
            pm_user_id: item.pm_user_id,
          },
        });
      }
    });
    report.created_mappings = plannedInserts.length;
  }

  return report;
}

// CLI Execution entrypoint
if (require.main === module) {
  (async () => {
    try {
      console.log('════════════════════════════════════════════════════════════════════════');
      console.log('   MIRAI × PM USER IDENTITY RECONCILIATION UTILITY');
      console.log('════════════════════════════════════════════════════════════════════════');
      const report = await runReconciliation();
      console.log(`Execution Mode       : ${report.mode}`);
      console.log(`Timestamp            : ${report.timestamp}`);
      console.log(`Total Candidates     : ${report.total_candidates}`);
      console.log(`Exact UUID Matches   : ${report.exact_uuid_matches}`);
      console.log(`Unique Email Matches : ${report.unique_email_matches}`);
      console.log(`Already Mapped       : ${report.already_mapped}`);
      console.log(`Ambiguous Matches    : ${report.ambiguous_matches}`);
      console.log(`Organization Conflicts: ${report.org_conflicts}`);
      console.log(`Inactive PM Users    : ${report.inactive_users}`);
      console.log(`Unmatched Candidates : ${report.unmatched}`);
      console.log(`Created Mappings     : ${report.created_mappings}`);
      console.log('────────────────────────────────────────────────────────────────────────');
      if (report.mode === 'DRY_RUN') {
        console.log('ℹ️ DRY-RUN complete: No changes were written to the database.');
      } else {
        console.log(`✅ Successfully committed ${report.created_mappings} identity mappings.`);
      }
    } catch (err) {
      console.error('[FATAL] Reconciliation failed:', err);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  })();
}

