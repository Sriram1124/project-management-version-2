import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { prisma } from '../lib/prisma';
import { invalidateUserSessionCache } from '../middleware/auth.middleware';

export interface CreateUserInput {
  name: string;
  email: string;
  type: 'INTERN' | 'EMPLOYEE';
  managerOrgId: string;
  batch?: string | null;
  subbatch?: string | null;
  cohort_id?: string | null;
}

export interface CsvRow {
  rowNumber: number;
  name: string;
  email: string;
  type: 'INTERN' | 'EMPLOYEE';
  batch?: string | null;
  subbatch?: string | null;
  cohort_id?: string | null;
  cohort?: string | null;
}

export interface InvalidCsvRow {
  rowNumber: number;
  name: string;
  email: string;
  reason: string;
  batch?: string | null;
  subbatch?: string | null;
  cohort?: string | null;
}

export interface ExistingMemberDiff {
  rowNumber: number;
  name: string;
  email: string;
  type: string;
  batch?: string | null;
  subbatch?: string | null;
  cohort_id?: string | null;
  cohort?: string | null;
  existingId: string;
  existingUserCode?: string | null;
  existingName: string;
  existingBatch?: string | null;
  existingSubbatch?: string | null;
  existingIsActive: boolean;
  changes: {
    name?: { from: string; to: string };
    batch?: { from: string | null; to: string | null };
    subbatch?: { from: string | null; to: string | null };
  };
}

export interface SkippedMemberInfo {
  rowNumber: number;
  name: string;
  email: string;
  type?: string;
  reason: string;
  existingUserCode?: string | null;
  batch?: string | null;
  subbatch?: string | null;
}

export interface DuplicateInCsvRow {
  rowNumber: number;
  originalRowNumber: number;
  name: string;
  email: string;
  reason: string;
}

export interface CsvValidationResult {
  isValid: boolean;
  summary: {
    total: number;
    valid: number;
    invalid: number;
    to_create: number;
    to_skip: number;
    to_update: number;
    duplicate_in_csv: number;
  };
  detectedColumns: {
    all: string[];
    requiredPresent: string[];
    requiredMissing: string[];
    optionalPresent: string[];
  };
  validRows: CsvRow[];
  toCreateRows: CsvRow[];
  toSkipRows: SkippedMemberInfo[];
  toUpdateRows: ExistingMemberDiff[];
  duplicateInCsvRows: DuplicateInCsvRow[];
  invalidRows: InvalidCsvRow[];
  errors: string[];
}

export class UserService {
  /**
   * Cryptographically secure temporary password generator
   */
  private static generateTemporaryPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    const randomBytes = crypto.randomBytes(12);
    let pwd = '';
    for (let i = 0; i < 12; i++) {
      pwd += chars[randomBytes[i] % chars.length];
    }
    return pwd;
  }

  /**
   * Generates a unique user code scoped to organization
   * Guarantees uniqueness against DB AND against codes allocated in the current batch
   */
  public static async generateUserCode(
    prefix: string,
    orgId: string,
    reservedCodesInBatch: Set<string> = new Set()
  ): Promise<string> {
    // Attempt 1: 4-digit random numbers (1000 - 9999) using crypto.randomInt
    for (let attempt = 0; attempt < 30; attempt++) {
      const codeNum = crypto.randomInt(1000, 10000);
      const candidate = `${prefix}-${codeNum}`;

      if (reservedCodesInBatch.has(candidate)) {
        continue;
      }

      const existing = await prisma.user.findFirst({
        where: {
          organization_id: orgId,
          user_code: candidate,
        },
        select: { id: true },
      });

      if (!existing) {
        reservedCodesInBatch.add(candidate);
        return candidate;
      }
    }

    // Attempt 2: 5-digit fallback if high density collisions occur
    for (let attempt = 0; attempt < 30; attempt++) {
      const codeNum = crypto.randomInt(10000, 100000);
      const candidate = `${prefix}-${codeNum}`;

      if (reservedCodesInBatch.has(candidate)) {
        continue;
      }

      const existing = await prisma.user.findFirst({
        where: {
          organization_id: orgId,
          user_code: candidate,
        },
        select: { id: true },
      });

      if (!existing) {
        reservedCodesInBatch.add(candidate);
        return candidate;
      }
    }

    // Final safety fallback: timestamp + random suffix
    const candidate = `${prefix}-${Date.now().toString().slice(-4)}${crypto.randomInt(10, 99)}`;
    reservedCodesInBatch.add(candidate);
    return candidate;
  }

  /**
  /**
   * Detect delimiter (comma, semicolon, tab) from CSV header line
   */
  private static detectDelimiter(headerLine: string): string {
    const clean = headerLine.replace(/^[\uFEFF\u200B\u00A0]+/, '');
    const commaCount = (clean.match(/,/g) || []).length;
    const semicolonCount = (clean.match(/;/g) || []).length;
    const tabCount = (clean.match(/\t/g) || []).length;
    if (commaCount === 0) {
      if (semicolonCount > 0) return ';';
      if (tabCount > 0) return '\t';
    }
    return ',';
  }

  /**
   * Parse a single CSV line handling quotes, escaped quotes, and trimmed values
   */
  private static parseCsvLine(line: string, delimiter = ','): string[] {
    const cleanLine = line.replace(/^[\uFEFF\u200B\u00A0]+/, '');
    const cols: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < cleanLine.length; i++) {
      const char = cleanLine[i];
      if (char === '"') {
        if (inQuotes && cleanLine[i + 1] === '"') {
          cur += '"';
          i++; // skip next escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        cols.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    cols.push(cur.trim());
    return cols.map((col) =>
      col
        .replace(/^[\uFEFF\u200B\u00A0\s"']+|[\uFEFF\u200B\u00A0\s"']+$/g, '')
        .trim()
    );
  }

  /**
   * Create an individual organization user (Intern or Employee)
   */
  static async createUser(input: CreateUserInput) {
    const { name, email, type, managerOrgId, batch, subbatch, cohort_id } = input;

    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new Error('Name is required');
    }
    if (name.trim().length > 100) {
      throw new Error('Name cannot exceed 100 characters');
    }

    if (!email || typeof email !== 'string' || !email.trim()) {
      throw new Error('Email is required');
    }
    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      throw new Error('Invalid email format');
    }

    if (!type || (type !== 'INTERN' && type !== 'EMPLOYEE')) {
      throw new Error('Type must be either INTERN or EMPLOYEE');
    }

    if (!managerOrgId) {
      throw new Error('Manager organization is required');
    }

    // Validate batch and subbatch if provided (relevant for INTERN)
    let userBatch: string | null = null;
    let userSubbatch: string | null = null;
    let userCohortId: string | null = null;

    if (type === 'INTERN') {
      const VALID_BATCH_SUBBATCH: Record<string, string[]> = {
        A: ['A1', 'A2'],
        B: ['B1', 'B2'],
        C: ['C1', 'C2'],
        D: ['D1', 'D2'],
      };

      if (batch) {
        const trimmedBatch = batch.trim();
        const upperBatch = trimmedBatch.toUpperCase();
        userBatch = trimmedBatch;

        if (['A', 'B', 'C', 'D'].includes(upperBatch)) {
          if (subbatch) {
            const trimmedSubbatch = subbatch.trim().toUpperCase();
            const allowed = VALID_BATCH_SUBBATCH[upperBatch] || [];
            if (!allowed.includes(trimmedSubbatch)) {
              throw new Error(`Subbatch must be one of ${allowed.join(', ')} for Batch ${upperBatch}`);
            }
            userSubbatch = trimmedSubbatch;
          } else {
            userSubbatch = VALID_BATCH_SUBBATCH[upperBatch][0];
          }
        } else if (subbatch) {
          userSubbatch = subbatch.trim();
        }
      }

      if (cohort_id) {
        const cohort = await prisma.cohort.findFirst({
          where: {
            id: cohort_id,
            organization_id: managerOrgId,
          },
        });
        if (!cohort) {
          throw new Error('Selected cohort was not found in your organization');
        }
        userCohortId = cohort.id;
      } else {
        // Fallback: automatically assign whichever active cohort exists for the organization
        const defaultCohort = await prisma.cohort.findFirst({
          where: {
            organization_id: managerOrgId,
            is_active: true,
          },
          orderBy: { code: 'asc' },
        });
        if (defaultCohort) {
          userCohortId = defaultCohort.id;
        }
      }
    }

    // Check globally unique email
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      const err: any = new Error(`A user with email "${normalizedEmail}" already exists.`);
      err.statusCode = 409;
      throw err;
    }

    // Lookup role
    const roleRecord = await prisma.role.findUnique({
      where: { name: type },
    });
    if (!roleRecord) {
      throw new Error(`Role "${type}" is not configured in the system.`);
    }

    const prefix = type === 'INTERN' ? 'INT' : 'EMP';
    const userCode = await this.generateUserCode(prefix, managerOrgId, new Set<string>());
    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword);

    // Atomic transaction
    try {
      const newUser = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: name.trim(),
            email: normalizedEmail,
            user_code: userCode,
            password_hash: passwordHash,
            organization_id: managerOrgId,
            batch: userBatch,
            subbatch: userSubbatch,
            cohort_id: userCohortId,
            must_change_password: true,
            is_active: true,
          },
          include: {
            cohort: true,
          },
        });

        await tx.userRole.create({
          data: {
            user_id: user.id,
            role_id: roleRecord.id,
          },
        });

        return user;
      });

      return {
        user: {
          id: newUser.id,
          user_code: newUser.user_code,
          name: newUser.name,
          email: newUser.email,
          batch: newUser.batch,
          subbatch: newUser.subbatch,
          cohort_id: newUser.cohort_id,
          cohort: newUser.cohort,
          type,
          must_change_password: true,
          created_at: newUser.created_at,
        },
        temporary_password: temporaryPassword,
      };
    } catch (err: any) {
      if (err.code === 'P2002') {
        const cleanErr: any = new Error(`A user with email "${normalizedEmail}" already exists.`);
        cleanErr.statusCode = 409;
        throw cleanErr;
      }
      throw err;
    }
  }

  /**
   * Validate CSV content for bulk import preview with comprehensive categorization:
   * to_create, to_skip (identical or inactive), to_update (changed permitted fields),
   * duplicate_in_csv, and invalid/rejected rows.
   */
  static async validateBulkCsv(csvContent: string, managerOrgId: string): Promise<CsvValidationResult> {
    if (!csvContent || typeof csvContent !== 'string') {
      return {
        isValid: false,
        summary: { total: 0, valid: 0, invalid: 0, to_create: 0, to_skip: 0, to_update: 0, duplicate_in_csv: 0 },
        detectedColumns: {
          all: [],
          requiredPresent: [],
          requiredMissing: ['name', 'email', 'type'],
          optionalPresent: [],
        },
        validRows: [],
        toCreateRows: [],
        toSkipRows: [],
        toUpdateRows: [],
        duplicateInCsvRows: [],
        invalidRows: [],
        errors: ['CSV content is empty or invalid.'],
      };
    }

    // Strip UTF-8 BOM and normalize all newline variants (\r\n, \r, \n)
    const cleanContent = csvContent
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    const lines = cleanContent
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      return {
        isValid: false,
        summary: { total: 0, valid: 0, invalid: 0, to_create: 0, to_skip: 0, to_update: 0, duplicate_in_csv: 0 },
        detectedColumns: {
          all: [],
          requiredPresent: [],
          requiredMissing: ['name', 'email', 'type'],
          optionalPresent: [],
        },
        validRows: [],
        toCreateRows: [],
        toSkipRows: [],
        toUpdateRows: [],
        duplicateInCsvRows: [],
        invalidRows: [],
        errors: ['CSV file must contain a header row and at least one data row.'],
      };
    }

    const delimiter = this.detectDelimiter(lines[0]);
    const rawHeaders = this.parseCsvLine(lines[0], delimiter).map((h) =>
      h
        .toLowerCase()
        .replace(/^[\uFEFF\u200B\u00A0\s"']+|[\uFEFF\u200B\u00A0\s"']+$/g, '')
        .replace(/[\s\-_]+/g, '_')
        .trim()
    );

    // Security violation: forbid client specifying sensitive columns
    if (
      rawHeaders.includes('organization_id') ||
      rawHeaders.includes('password') ||
      rawHeaders.includes('password_hash') ||
      rawHeaders.includes('user_id') ||
      rawHeaders.includes('user_code')
    ) {
      return {
        isValid: false,
        summary: { total: 0, valid: 0, invalid: 0, to_create: 0, to_skip: 0, to_update: 0, duplicate_in_csv: 0 },
        detectedColumns: {
          all: rawHeaders,
          requiredPresent: ['name', 'email', 'type'].filter((h) => rawHeaders.includes(h)),
          requiredMissing: ['name', 'email', 'type'].filter((h) => !rawHeaders.includes(h)),
          optionalPresent: [],
        },
        validRows: [],
        toCreateRows: [],
        toSkipRows: [],
        toUpdateRows: [],
        duplicateInCsvRows: [],
        invalidRows: [],
        errors: ['Security Violation: CSV cannot contain organization_id, password, user_id, or user_code columns.'],
      };
    }

    const nameIdx = rawHeaders.findIndex(
      (h) => h === 'name' || h === 'full_name' || h === 'fullname' || h === 'member_name' || h === 'intern_name' || h === 'user_name'
    );
    const emailIdx = rawHeaders.findIndex(
      (h) => h === 'email' || h === 'email_address' || h === 'mail' || h === 'user_email'
    );
    const typeIdx = rawHeaders.findIndex(
      (h) => h === 'type' || h === 'user_type' || h === 'role' || h === 'member_type'
    );
    const batchIdx = rawHeaders.findIndex(
      (h) => h === 'batch' || h === 'batch_code' || h === 'batch_name'
    );
    const subbatchIdx = rawHeaders.findIndex(
      (h) => h === 'subbatch' || h === 'sub_batch' || h === 'subbatch_code' || h === 'sub_batch_code'
    );
    const cohortIdx = rawHeaders.findIndex(
      (h) => h === 'cohort' || h === 'cohort_name' || h === 'cohort_code' || h === 'cohort_id'
    );

    const requiredMissing: string[] = [];
    if (nameIdx === -1) requiredMissing.push('name');
    if (emailIdx === -1) requiredMissing.push('email');
    if (typeIdx === -1) requiredMissing.push('type');

    const requiredPresent: string[] = [];
    if (nameIdx !== -1) requiredPresent.push(rawHeaders[nameIdx]);
    if (emailIdx !== -1) requiredPresent.push(rawHeaders[emailIdx]);
    if (typeIdx !== -1) requiredPresent.push(rawHeaders[typeIdx]);

    const optionalPresent: string[] = [];
    if (batchIdx !== -1) optionalPresent.push('batch');
    if (subbatchIdx !== -1) optionalPresent.push('subbatch');
    if (cohortIdx !== -1) optionalPresent.push('cohort');

    const detectedColumns = {
      all: rawHeaders,
      requiredPresent,
      requiredMissing,
      optionalPresent,
    };

    if (requiredMissing.length > 0) {
      return {
        isValid: false,
        summary: { total: 0, valid: 0, invalid: 0, to_create: 0, to_skip: 0, to_update: 0, duplicate_in_csv: 0 },
        detectedColumns,
        validRows: [],
        toCreateRows: [],
        toSkipRows: [],
        toUpdateRows: [],
        duplicateInCsvRows: [],
        invalidRows: [],
        errors: [`Invalid CSV headers. Missing required columns: ${requiredMissing.join(', ')}. Expected at least: name,email,type`],
      };
    }

    const VALID_BATCH_SUBBATCH: Record<string, string[]> = {
      A: ['A1', 'A2'],
      B: ['B1', 'B2'],
      C: ['C1', 'C2'],
      D: ['D1', 'D2'],
    };

    // Pre-fetch all cohorts belonging to manager's organization
    const orgCohorts = await prisma.cohort.findMany({
      where: { organization_id: managerOrgId },
      select: { id: true, code: true, name: true },
    });
    const cohortMap = new Map<string, { id: string; name: string }>();
    for (const c of orgCohorts) {
      cohortMap.set(c.code.toLowerCase().trim(), { id: c.id, name: c.name });
      cohortMap.set(c.name.toLowerCase().trim(), { id: c.id, name: c.name });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Pass 1: Parse rows and normalize
    const parsedDataRows: Array<{
      rowNumber: number;
      name: string;
      email: string;
      rawType: string;
      rawBatch: string;
      rawSubbatch: string;
      rawCohort: string;
      type?: 'INTERN' | 'EMPLOYEE';
    }> = [];

    for (let i = 1; i < lines.length; i++) {
      const rowNum = i + 1;
      const cols = this.parseCsvLine(lines[i], delimiter);

      // Skip empty / whitespace-only rows (e.g. trailing commas from exported spreadsheets)
      if (!cols.some((c) => c.length > 0)) {
        continue;
      }

      const name = (cols[nameIdx] || '').trim();
      const email = (cols[emailIdx] || '').trim().toLowerCase();
      const rawType = (cols[typeIdx] || '').trim().toUpperCase();
      const rawBatch = batchIdx !== -1 ? (cols[batchIdx] || '').trim().toUpperCase() : '';
      const rawSubbatch = subbatchIdx !== -1 ? (cols[subbatchIdx] || '').trim().toUpperCase() : '';
      const rawCohort = cohortIdx !== -1 ? (cols[cohortIdx] || '').trim() : '';

      // Normalize type: support INTERN / EMPLOYEE
      let type: 'INTERN' | 'EMPLOYEE' | undefined;
      if (rawType === 'INTERN' || rawType === 'INTERNS' || rawType === 'INTERNSHIP') {
        type = 'INTERN';
      } else if (rawType === 'EMPLOYEE' || rawType === 'EMPLOYEES' || rawType === 'STAFF' || rawType === 'MEMBER') {
        type = 'EMPLOYEE';
      }

      parsedDataRows.push({
        rowNumber: rowNum,
        name,
        email,
        rawType,
        rawBatch,
        rawSubbatch,
        rawCohort,
        type,
      });
    }

    if (parsedDataRows.length === 0) {
      return {
        isValid: false,
        summary: { total: 0, valid: 0, invalid: 0, to_create: 0, to_skip: 0, to_update: 0, duplicate_in_csv: 0 },
        detectedColumns,
        validRows: [],
        toCreateRows: [],
        toSkipRows: [],
        toUpdateRows: [],
        duplicateInCsvRows: [],
        invalidRows: [],
        errors: ['CSV file contains headers but no data rows.'],
      };
    }

    // Pass 2: Query DB for all unique valid candidate emails in this CSV
    const candidateEmails = Array.from(new Set(parsedDataRows.map((r) => r.email).filter((e) => emailRegex.test(e))));
    const existingInDb = await prisma.user.findMany({
      where: {
        email: { in: candidateEmails },
      },
      select: {
        id: true,
        email: true,
        name: true,
        user_code: true,
        batch: true,
        subbatch: true,
        cohort_id: true,
        organization_id: true,
        is_active: true,
      },
    });

    const existingDbMap = new Map<string, typeof existingInDb[0]>();
    for (const u of existingInDb) {
      existingDbMap.set(u.email.toLowerCase().trim(), u);
    }

    const toCreateRows: CsvRow[] = [];
    const toSkipRows: SkippedMemberInfo[] = [];
    const toUpdateRows: ExistingMemberDiff[] = [];
    const duplicateInCsvRows: DuplicateInCsvRow[] = [];
    const invalidRows: InvalidCsvRow[] = [];
    const errors: string[] = [];

    const seenEmailsInCsv = new Map<string, number>(); // email -> first rowNumber

    // Pass 3: Classify each row independently
    for (const row of parsedDataRows) {
      let { rowNumber, name, email, rawType, rawBatch, rawSubbatch, rawCohort, type } = row;
      let failureReason = '';

      if (!name) {
        failureReason = 'Name is required.';
      } else if (name.length > 100) {
        failureReason = 'Name cannot exceed 100 characters.';
      } else if (!email || !emailRegex.test(email)) {
        failureReason = 'Invalid email format.';
      } else if (!type) {
        failureReason = `Invalid type "${rawType}". Must be INTERN or EMPLOYEE.`;
      } else if (rawBatch && !['A', 'B', 'C', 'D'].includes(rawBatch)) {
        failureReason = `Invalid batch "${rawBatch}". Must be one of A, B, C, D.`;
      } else if (rawSubbatch) {
        if (rawBatch) {
          const allowedSubbatches = VALID_BATCH_SUBBATCH[rawBatch] || [];
          if (!allowedSubbatches.includes(rawSubbatch)) {
            failureReason = `Invalid subbatch "${rawSubbatch}" for Batch ${rawBatch}. Must be one of ${allowedSubbatches.join(', ')}.`;
          }
        } else {
          const allSubbatches = Object.values(VALID_BATCH_SUBBATCH).flat();
          if (!allSubbatches.includes(rawSubbatch)) {
            failureReason = `Invalid subbatch "${rawSubbatch}". Valid subbatches are ${allSubbatches.join(', ')}.`;
          } else {
            const inferred = Object.keys(VALID_BATCH_SUBBATCH).find((b) => VALID_BATCH_SUBBATCH[b].includes(rawSubbatch));
            if (inferred) rawBatch = inferred;
          }
        }
      }

      let resolvedCohortId: string | null = null;
      if (!failureReason && rawCohort) {
        const cohortEntry = cohortMap.get(rawCohort.toLowerCase());
        if (!cohortEntry) {
          failureReason = `Cohort "${rawCohort}" does not exist in your organization.`;
        } else {
          resolvedCohortId = cohortEntry.id;
        }
      }

      if (failureReason) {
        invalidRows.push({
          rowNumber,
          name: name || 'Unnamed',
          email: email || 'No email provided',
          reason: failureReason,
          batch: rawBatch || null,
          subbatch: rawSubbatch || null,
          cohort: rawCohort || null,
        });
        errors.push(`Row ${rowNumber}: ${name || 'Unnamed'} (${email || 'No email'}) - ${failureReason}`);
        continue;
      }

      // Check intra-CSV duplicates
      if (seenEmailsInCsv.has(email)) {
        const firstRow = seenEmailsInCsv.get(email)!;
        duplicateInCsvRows.push({
          rowNumber,
          originalRowNumber: firstRow,
          name,
          email,
          reason: `Duplicate row in CSV: email already appeared on row ${firstRow}.`,
        });
        continue;
      }
      seenEmailsInCsv.set(email, rowNumber);

      // Check Database for existing member
      const existingUser = existingDbMap.get(email);
      if (!existingUser) {
        // New member to create
        const candidateRow: CsvRow = {
          rowNumber,
          name,
          email,
          type: type!,
          batch: rawBatch || null,
          subbatch: rawSubbatch || null,
          cohort_id: resolvedCohortId,
          cohort: rawCohort || null,
        };
        toCreateRows.push(candidateRow);
      } else if (existingUser.organization_id && existingUser.organization_id !== managerOrgId) {
        // Cross-tenant email collision
        const orgError = 'Email is already registered with another organization.';
        invalidRows.push({
          rowNumber,
          name,
          email,
          reason: orgError,
          batch: rawBatch || null,
          subbatch: rawSubbatch || null,
          cohort: rawCohort || null,
        });
        errors.push(`Row ${rowNumber}: ${name} (${email}) - ${orgError}`);
      } else if (!existingUser.is_active) {
        // Inactive member: do not reactivate automatically
        toSkipRows.push({
          rowNumber,
          name: existingUser.name,
          email,
          type: type!,
          reason: 'Inactive member — skipped (will not be reactivated automatically)',
          existingUserCode: existingUser.user_code,
          batch: existingUser.batch,
          subbatch: existingUser.subbatch,
        });
      } else {
        // Active member in manager's organization: check if permitted fields changed
        const nameDiff = existingUser.name.trim() !== name.trim();
        const batchDiff = (existingUser.batch || '').trim() !== (rawBatch || '').trim();
        const subbatchDiff = (existingUser.subbatch || '').trim() !== (rawSubbatch || '').trim();

        if (!nameDiff && !batchDiff && !subbatchDiff) {
          // Identical member data: safe skip
          toSkipRows.push({
            rowNumber,
            name: existingUser.name,
            email,
            type: type!,
            reason: 'Identical member data — skipped (no changes needed)',
            existingUserCode: existingUser.user_code,
            batch: existingUser.batch,
            subbatch: existingUser.subbatch,
          });
        } else {
          // Permitted fields have changed: may be updated upon confirmation
          const changes: any = {};
          if (nameDiff) changes.name = { from: existingUser.name, to: name };
          if (batchDiff) changes.batch = { from: existingUser.batch || null, to: rawBatch || null };
          if (subbatchDiff) changes.subbatch = { from: existingUser.subbatch || null, to: rawSubbatch || null };

          toUpdateRows.push({
            rowNumber,
            name,
            email,
            type: type!,
            batch: rawBatch || null,
            subbatch: rawSubbatch || null,
            cohort_id: resolvedCohortId,
            cohort: rawCohort || null,
            existingId: existingUser.id,
            existingUserCode: existingUser.user_code,
            existingName: existingUser.name,
            existingBatch: existingUser.batch,
            existingSubbatch: existingUser.subbatch,
            existingIsActive: existingUser.is_active,
            changes,
          });
        }
      }
    }

    const totalDataRows = parsedDataRows.length;
    const isValid = invalidRows.length === 0;

    return {
      isValid,
      summary: {
        total: totalDataRows,
        valid: toCreateRows.length + toUpdateRows.length,
        invalid: invalidRows.length,
        to_create: toCreateRows.length,
        to_skip: toSkipRows.length,
        to_update: toUpdateRows.length,
        duplicate_in_csv: duplicateInCsvRows.length,
      },
      detectedColumns,
      validRows: toCreateRows, // For backward compatibility
      toCreateRows,
      toSkipRows,
      toUpdateRows,
      duplicateInCsvRows,
      invalidRows,
      errors,
    };
  }

  /**
   * Generates dynamic CSV template aligned with authoritative database schema and org cohorts
   */
  static async generateBulkCsvTemplate(managerOrgId: string): Promise<string> {
    const cohorts = await prisma.cohort.findMany({
      where: { organization_id: managerOrgId },
      select: { code: true, name: true },
      take: 1,
    });
    const sampleCohort = cohorts[0]?.code || 'Cohort-1';

    const header = 'name,email,type,batch,subbatch,cohort\n';
    const sampleIntern = `Alex Morgan,alex.morgan@example.com,INTERN,A,A1,${sampleCohort}\n`;
    const sampleEmployee = `Jordan Lee,jordan.lee@example.com,EMPLOYEE,,,\n`;
    return header + sampleIntern + sampleEmployee;
  }

  /**
   * Bulk import users with safe, idempotent processing:
   * - Deduplicates within the submitted batch (first occurrence processed, subsequent skipped)
   * - Queries DB for existing users by normalized email
   * - Skips existing active users with identical data (0 duplicates created)
   * - Skips inactive members (never reactivates automatically)
   * - If updateExisting is true, updates permitted fields (name, batch, subbatch) without touching
   *   passwords, credentials, roles, permissions, cohort assignments, or account status
   * - If updateExisting is false, skips existing members with changed data
   * - Fails cross-tenant collisions
   * - Inserts new users in an atomic transaction
   * - Safely handles concurrent insertion collisions (P2002) with retry/skip
   * - Returns detailed summary: created, skipped, updated, failed
   */
  static async createUsersBulk(
    rows: CsvRow[],
    managerOrgId: string,
    optionsOrUpdateExisting?: boolean | { update_existing?: boolean }
  ) {
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      throw new Error('No candidate rows provided for bulk import.');
    }

    if (!managerOrgId) {
      throw new Error('Manager organization context required.');
    }

    const updateExisting = typeof optionsOrUpdateExisting === 'boolean'
      ? optionsOrUpdateExisting
      : Boolean(optionsOrUpdateExisting?.update_existing);

    // Role lookups
    const internRole = await prisma.role.findUnique({ where: { name: 'INTERN' } });
    const employeeRole = await prisma.role.findUnique({ where: { name: 'EMPLOYEE' } });

    if (!internRole || !employeeRole) {
      throw new Error('INTERN or EMPLOYEE role is not configured in the system.');
    }

    // Cohorts lookup for org
    const orgCohorts = await prisma.cohort.findMany({
      where: { organization_id: managerOrgId },
      select: { id: true, code: true, name: true },
    });
    const cohortIdSet = new Set(orgCohorts.map((c) => c.id));
    const cohortMap = new Map<string, string>();
    for (const c of orgCohorts) {
      cohortMap.set(c.code.toLowerCase().trim(), c.id);
      cohortMap.set(c.name.toLowerCase().trim(), c.id);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Output tracking
    const createdUsers: Array<{
      name: string;
      email: string;
      user_code: string;
      type: string;
      batch: string | null;
      subbatch: string | null;
      temporary_password: string;
    }> = [];

    const updatedUsers: Array<{
      id: string;
      name: string;
      email: string;
      user_code: string;
      batch: string | null;
      subbatch: string | null;
      changes: Record<string, { from: any; to: any }>;
    }> = [];

    const skippedUsers: Array<{
      rowNumber?: number;
      name: string;
      email: string;
      user_code?: string | null;
      reason: string;
    }> = [];

    const failedRows: Array<{
      rowNumber?: number;
      name: string;
      email: string;
      reason: string;
    }> = [];

    // Deduplicate within the submitted rows
    const seenEmailsInBatch = new Map<string, number>();
    const sanitizedRows: Array<CsvRow & { normalizedEmail: string; resolvedCohortId: string | null }> = [];

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const rowNum = row.rowNumber || (idx + 1);
      const name = (row.name || '').trim();
      const email = (row.email || '').trim().toLowerCase();
      const type = row.type ? (row.type.toUpperCase() as 'INTERN' | 'EMPLOYEE') : undefined;

      if (!name) {
        failedRows.push({ rowNumber: rowNum, name: 'Unnamed', email, reason: 'Name is required' });
        continue;
      }
      if (name.length > 100) {
        failedRows.push({ rowNumber: rowNum, name, email, reason: 'Name cannot exceed 100 characters' });
        continue;
      }
      if (!email || !emailRegex.test(email)) {
        failedRows.push({ rowNumber: rowNum, name, email: email || 'No email', reason: 'Invalid email format' });
        continue;
      }
      if (!type || (type !== 'INTERN' && type !== 'EMPLOYEE')) {
        failedRows.push({ rowNumber: rowNum, name, email, reason: `Invalid type "${row.type}". Must be INTERN or EMPLOYEE.` });
        continue;
      }

      // Check intra-batch duplicate
      if (seenEmailsInBatch.has(email)) {
        const firstRow = seenEmailsInBatch.get(email)!;
        skippedUsers.push({
          rowNumber: rowNum,
          name,
          email,
          reason: `Duplicate row in CSV: email already appeared on row ${firstRow}.`,
        });
        continue;
      }
      seenEmailsInBatch.set(email, rowNum);

      // Resolve cohort
      let resolvedCohortId: string | null = null;
      if (row.cohort_id && cohortIdSet.has(row.cohort_id)) {
        resolvedCohortId = row.cohort_id;
      } else if (row.cohort) {
        resolvedCohortId = cohortMap.get(row.cohort.toLowerCase().trim()) || null;
      }

      sanitizedRows.push({
        ...row,
        rowNumber: rowNum,
        name,
        email,
        type,
        normalizedEmail: email,
        resolvedCohortId,
      });
    }

    // Query DB for existing users
    const candidateEmails = sanitizedRows.map((r) => r.normalizedEmail);
    const existingUsers = await prisma.user.findMany({
      where: { email: { in: candidateEmails } },
      select: {
        id: true,
        email: true,
        name: true,
        user_code: true,
        batch: true,
        subbatch: true,
        cohort_id: true,
        organization_id: true,
        is_active: true,
      },
    });

    const existingMap = new Map<string, typeof existingUsers[0]>();
    for (const u of existingUsers) {
      existingMap.set(u.email.toLowerCase().trim(), u);
    }

    // Rows to write in DB
    const toCreateCandidates: typeof sanitizedRows = [];
    const toUpdateDb: Array<{
      id: string;
      name: string;
      batch: string | null;
      subbatch: string | null;
      user_code: string;
      email: string;
      changes: Record<string, { from: any; to: any }>;
    }> = [];

    for (const row of sanitizedRows) {
      const existing = existingMap.get(row.normalizedEmail);

      if (!existing) {
        // New user
        toCreateCandidates.push(row);
      } else if (existing.organization_id && existing.organization_id !== managerOrgId) {
        // Cross-tenant collision
        failedRows.push({
          rowNumber: row.rowNumber,
          name: row.name,
          email: row.normalizedEmail,
          reason: 'Email is registered with another organization.',
        });
      } else if (!existing.is_active) {
        // Inactive member: do not reactivate
        skippedUsers.push({
          rowNumber: row.rowNumber,
          name: existing.name,
          email: row.normalizedEmail,
          user_code: existing.user_code,
          reason: 'Inactive member — skipped (will not be reactivated automatically)',
        });
      } else {
        // Active member in manager's org: check diffs
        const nameDiff = existing.name.trim() !== row.name.trim();
        const batchDiff = (existing.batch || '').trim() !== (row.batch || '').trim();
        const subbatchDiff = (existing.subbatch || '').trim() !== (row.subbatch || '').trim();

        if (!nameDiff && !batchDiff && !subbatchDiff) {
          // Identical member: safe skip
          skippedUsers.push({
            rowNumber: row.rowNumber,
            name: existing.name,
            email: row.normalizedEmail,
            user_code: existing.user_code,
            reason: 'Identical member data — skipped (no changes needed)',
          });
        } else {
          // Permitted fields have changed
          const changes: Record<string, { from: any; to: any }> = {};
          if (nameDiff) changes.name = { from: existing.name, to: row.name.trim() };
          if (batchDiff) changes.batch = { from: existing.batch || null, to: row.batch || null };
          if (subbatchDiff) changes.subbatch = { from: existing.subbatch || null, to: row.subbatch || null };

          if (updateExisting) {
            toUpdateDb.push({
              id: existing.id,
              name: row.name.trim(),
              batch: row.batch || null,
              subbatch: row.subbatch || null,
              user_code: existing.user_code,
              email: row.normalizedEmail,
              changes,
            });
          } else {
            skippedUsers.push({
              rowNumber: row.rowNumber,
              name: existing.name,
              email: row.normalizedEmail,
              user_code: existing.user_code,
              reason: 'Existing member with changed data — skipped (update not confirmed)',
            });
          }
        }
      }
    }

    // Generate codes & passwords for users to create
    const reservedCodesInBatch = new Set<string>();
    const existingOrgUsers = await prisma.user.findMany({
      where: { organization_id: managerOrgId },
      select: { user_code: true },
    });
    for (const u of existingOrgUsers) {
      if (u.user_code) reservedCodesInBatch.add(u.user_code);
    }

    const usersToCreateData: Array<{
      id: string;
      name: string;
      email: string;
      user_code: string;
      type: 'INTERN' | 'EMPLOYEE';
      batch: string | null;
      subbatch: string | null;
      cohort_id: string | null;
      temporary_password: string;
      password_hash: string;
      role_id: string;
    }> = [];

    for (const row of toCreateCandidates) {
      const prefix = row.type === 'INTERN' ? 'INT' : 'EMP';
      const userCode = await this.generateUserCode(prefix, managerOrgId, reservedCodesInBatch);
      const tempPassword = this.generateTemporaryPassword();
      const pwdHash = await argon2.hash(tempPassword);
      const roleId = row.type === 'INTERN' ? internRole.id : employeeRole.id;
      const id = crypto.randomUUID();

      usersToCreateData.push({
        id,
        name: row.name,
        email: row.normalizedEmail,
        user_code: userCode,
        type: row.type,
        batch: row.batch || null,
        subbatch: row.subbatch || null,
        cohort_id: row.resolvedCohortId,
        temporary_password: tempPassword,
        password_hash: pwdHash,
        role_id: roleId,
      });
    }

    // Execute updates in transaction if confirmed
    if (toUpdateDb.length > 0) {
      await prisma.$transaction(
        async (tx) => {
          for (const u of toUpdateDb) {
            await tx.user.update({
              where: { id: u.id },
              data: {
                name: u.name,
                batch: u.batch,
                subbatch: u.subbatch,
              },
            });
          }
        },
        { timeout: 30000 }
      );

      for (const u of toUpdateDb) {
        updatedUsers.push({
          id: u.id,
          name: u.name,
          email: u.email,
          user_code: u.user_code,
          batch: u.batch,
          subbatch: u.subbatch,
          changes: u.changes,
        });
      }
    }

    // Execute inserts with concurrent collision handling (P2002)
    if (usersToCreateData.length > 0) {
      try {
        const usersData = usersToCreateData.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          user_code: u.user_code,
          password_hash: u.password_hash,
          organization_id: managerOrgId,
          cohort_id: u.cohort_id || null,
          batch: u.batch || null,
          subbatch: u.subbatch || null,
          must_change_password: true,
          is_active: true,
        }));

        const rolesData = usersToCreateData.map((u) => ({
          user_id: u.id,
          role_id: u.role_id,
        }));

        await prisma.$transaction(
          async (tx) => {
            await tx.user.createMany({ data: usersData });
            await tx.userRole.createMany({ data: rolesData });
          },
          { timeout: 30000, maxWait: 10000 }
        );

        for (const u of usersToCreateData) {
          createdUsers.push({
            name: u.name,
            email: u.email,
            user_code: u.user_code,
            type: u.type,
            batch: u.batch || null,
            subbatch: u.subbatch || null,
            temporary_password: u.temporary_password,
          });
        }
      } catch (err: any) {
        if (err.code === 'P2002') {
          // Concurrent collision handling: find collided emails and re-process safely
          const collisionEmails = usersToCreateData.map((u) => u.email);
          const collidedUsers = await prisma.user.findMany({
            where: { email: { in: collisionEmails } },
            select: { id: true, email: true, name: true, user_code: true },
          });
          const collidedEmailSet = new Set(collidedUsers.map((u) => u.email.toLowerCase()));

          const remainingToCreate = usersToCreateData.filter((u) => !collidedEmailSet.has(u.email));
          for (const u of usersToCreateData) {
            if (collidedEmailSet.has(u.email)) {
              const matched = collidedUsers.find((c) => c.email.toLowerCase() === u.email);
              skippedUsers.push({
                name: u.name,
                email: u.email,
                user_code: matched?.user_code,
                reason: 'Created concurrently by another import — skipped',
              });
            }
          }

          if (remainingToCreate.length > 0) {
            const remUsers = remainingToCreate.map((u) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              user_code: u.user_code,
              password_hash: u.password_hash,
              organization_id: managerOrgId,
              cohort_id: u.cohort_id || null,
              batch: u.batch || null,
              subbatch: u.subbatch || null,
              must_change_password: true,
              is_active: true,
            }));
            const remRoles = remainingToCreate.map((u) => ({
              user_id: u.id,
              role_id: u.role_id,
            }));

            await prisma.$transaction(
              async (tx) => {
                await tx.user.createMany({ data: remUsers });
                await tx.userRole.createMany({ data: remRoles });
              },
              { timeout: 30000, maxWait: 10000 }
            );

            for (const u of remainingToCreate) {
              createdUsers.push({
                name: u.name,
                email: u.email,
                user_code: u.user_code,
                type: u.type,
                batch: u.batch || null,
                subbatch: u.subbatch || null,
                temporary_password: u.temporary_password,
              });
            }
          }
        } else {
          throw err;
        }
      }
    }

    return {
      summary: {
        total: rows.length,
        created: createdUsers.length,
        skipped: skippedUsers.length,
        updated: updatedUsers.length,
        failed: failedRows.length,
      },
      created_users: createdUsers,
      updated_users: updatedUsers,
      skipped_users: skippedUsers,
      failed_rows: failedRows,
    };
  }

  /**
   * List users belonging strictly to manager's organization with search and batch filtering
   */
  static async listUsers(
    managerOrgId: string,
    typeFilter?: string,
    searchQuery?: string,
    batchFilter?: string,
    cohortFilter?: string
  ) {
    if (!managerOrgId) {
      throw new Error('Manager organization context required.');
    }

    const whereClause: any = {
      organization_id: managerOrgId,
      // Exclude global SUPER_ADMIN
      roles: {
        none: {
          role: { name: 'SUPER_ADMIN' },
        },
      },
    };

    if (cohortFilter && cohortFilter.trim()) {
      whereClause.cohort_id = cohortFilter.trim();
    }

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim();
      whereClause.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { user_code: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (batchFilter && batchFilter.trim()) {
      whereClause.batch = { contains: batchFilter.trim(), mode: 'insensitive' };
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      include: {
        roles: {
          include: {
            role: true,
          },
        },
        cohort: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const mapped = users.map((u) => {
      const roleName = u.roles[0]?.role?.name || 'MEMBER';
      return {
        id: u.id,
        user_code: u.user_code,
        name: u.name,
        email: u.email,
        batch: u.batch || null,
        subbatch: u.subbatch || null,
        cohort_id: u.cohort_id || null,
        cohort: u.cohort || null,
        type: roleName,
        is_active: u.is_active,
        created_at: u.created_at,
        updated_at: u.updated_at,
      };
    });

    let filtered = mapped;

    if (typeFilter && typeFilter !== 'ALL') {
      if (typeFilter === 'ACTIVE') {
        filtered = filtered.filter((u) => u.is_active);
      } else if (typeFilter === 'INACTIVE') {
        filtered = filtered.filter((u) => !u.is_active);
      } else if (['INTERN', 'EMPLOYEE', 'MANAGER', 'TECH_LEAD'].includes(typeFilter)) {
        filtered = filtered.filter((u) => u.type === typeFilter);
      }
    }

    return filtered;
  }

  /**
   * Update authenticated user's profile
   */
  static async updateProfile(userId: string, data: { name?: string; batch?: string }) {
    if (!userId) {
      const err: any = new Error('User ID is required.');
      err.statusCode = 400;
      throw err;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    if (!user || !user.is_active) {
      const err: any = new Error('User not found or inactive.');
      err.statusCode = 404;
      throw err;
    }

    const dataToUpdate: any = {};
    if (data.name !== undefined) {
      if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
        const err: any = new Error('Name cannot be empty.');
        err.statusCode = 400;
        throw err;
      }
      dataToUpdate.name = data.name.trim();
    }

    if (data.batch !== undefined) {
      dataToUpdate.batch = data.batch && typeof data.batch === 'string' ? data.batch.trim() : null;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: dataToUpdate,
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    const primaryRole = updatedUser.roles[0]?.role?.name || 'USER';
    const isInternOrEmployee = primaryRole === 'INTERN' || primaryRole === 'EMPLOYEE';

    return {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      batch: updatedUser.batch || null,
      role: primaryRole,
      user_code: isInternOrEmployee ? undefined : updatedUser.user_code,
      must_change_password: updatedUser.must_change_password,
      organization_id: updatedUser.organization_id,
      updated_at: updatedUser.updated_at,
    };
  }

  /**
   * Manager resets user password
   */
  static async resetUserPassword(managerOrgId: string, targetUserId: string, customPassword?: string) {
    if (!managerOrgId) {
      const err: any = new Error('Manager organization context required.');
      err.statusCode = 403;
      throw err;
    }
    if (!targetUserId) {
      const err: any = new Error('Target user ID is required.');
      err.statusCode = 400;
      throw err;
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    if (!targetUser) {
      const err: any = new Error('User not found.');
      err.statusCode = 404;
      throw err;
    }

    // Organization tenant isolation: target user MUST belong to the same organization
    if (targetUser.organization_id !== managerOrgId) {
      const err: any = new Error('Unauthorized: Target user does not belong to your organization.');
      err.statusCode = 403;
      throw err;
    }

    // Disallow resetting SUPER_ADMIN
    const isSuperAdmin = targetUser.roles.some((r) => r.role.name === 'SUPER_ADMIN');
    if (isSuperAdmin) {
      const err: any = new Error('Cannot reset password for Super Admin.');
      err.statusCode = 403;
      throw err;
    }

    // Generate new secure temporary password or hash custom password
    const newTempPassword = customPassword || this.generateTemporaryPassword();
    const newHash = await argon2.hash(newTempPassword);

    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        password_hash: newHash,
        must_change_password: true,
      },
    });

    // Invalidate existing sessions so old sessions cannot be used
    await prisma.userSession.deleteMany({
      where: { user_id: targetUserId },
    });

    return {
      user: {
        id: targetUser.id,
        user_code: targetUser.user_code,
        name: targetUser.name,
        email: targetUser.email,
        must_change_password: true,
      },
      temporary_password: newTempPassword,
    };
  }

  /**
   * Manager deactivates organization user
   */
  static async deactivateUser(managerOrgId: string, targetUserId: string) {
    if (!managerOrgId) {
      const err: any = new Error('Manager organization context required.');
      err.statusCode = 403;
      throw err;
    }
    if (!targetUserId) {
      const err: any = new Error('Target user ID is required.');
      err.statusCode = 400;
      throw err;
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    if (!targetUser) {
      const err: any = new Error('User not found.');
      err.statusCode = 404;
      throw err;
    }

    if (targetUser.organization_id !== managerOrgId) {
      const err: any = new Error('Unauthorized: Target user does not belong to your organization.');
      err.statusCode = 403;
      throw err;
    }

    const isSuperAdmin = targetUser.roles.some((r) => r.role.name === 'SUPER_ADMIN');
    if (isSuperAdmin) {
      const err: any = new Error('Cannot deactivate Super Admin.');
      err.statusCode = 403;
      throw err;
    }

    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        is_active: false,
      },
    });

    // Invalidate active sessions
    await prisma.userSession.deleteMany({
      where: { user_id: targetUserId },
    });

    return {
      success: true,
      message: 'User deactivated successfully.',
      user: {
        id: targetUser.id,
        user_code: targetUser.user_code,
        name: targetUser.name,
        is_active: false,
      },
    };
  }

  /**
   * Authenticated user changes temporary password on first login
   */
  static async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (!currentPassword) {
      throw new Error('Current password is required.');
    }
    if (!newPassword || newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters.');
    }
    if (currentPassword === newPassword) {
      throw new Error('New password must be different from current password.');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.is_active) {
      throw new Error('User not found or inactive.');
    }

    const isMatch = await argon2.verify(user.password_hash, currentPassword);
    if (!isMatch) {
      throw new Error('Current password is incorrect.');
    }

    const newHash = await argon2.hash(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: {
        password_hash: newHash,
        must_change_password: false,
      },
    });

    return { success: true, message: 'Password changed successfully.' };
  }

  /**
   * Manager updates an organization member's permitted details (name, batch, subbatch)
   */
  static async updateMember(
    managerOrgId: string,
    targetUserId: string,
    data: { name?: string; batch?: string; subbatch?: string; cohort_id?: string | null }
  ) {
    if (!managerOrgId) {
      const err: any = new Error('Manager organization context required.');
      err.statusCode = 403;
      throw err;
    }
    if (!targetUserId) {
      const err: any = new Error('Target user ID is required.');
      err.statusCode = 400;
      throw err;
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        roles: {
          include: { role: true },
        },
        cohort: true,
      },
    });

    if (!targetUser) {
      const err: any = new Error('User not found.');
      err.statusCode = 404;
      throw err;
    }

    if (targetUser.organization_id !== managerOrgId) {
      const err: any = new Error('Unauthorized: Target user does not belong to your organization.');
      err.statusCode = 403;
      throw err;
    }

    const isSuperAdmin = targetUser.roles.some((r) => r.role.name === 'SUPER_ADMIN');
    if (isSuperAdmin) {
      const err: any = new Error('Cannot edit details for Super Admin.');
      err.statusCode = 403;
      throw err;
    }

    const dataToUpdate: any = {};

    // Validate Name
    if (data.name !== undefined) {
      if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
        const err: any = new Error('Name cannot be empty.');
        err.statusCode = 400;
        throw err;
      }
      if (data.name.trim().length > 100) {
        const err: any = new Error('Name cannot exceed 100 characters.');
        err.statusCode = 400;
        throw err;
      }
      dataToUpdate.name = data.name.trim();
    }

    // Validate Batch and Subbatch
    const VALID_BATCH_SUBBATCH: Record<string, string[]> = {
      A: ['A1', 'A2'],
      B: ['B1', 'B2'],
      C: ['C1', 'C2'],
      D: ['D1', 'D2'],
    };

    if (data.batch !== undefined && data.batch !== null) {
      const trimmedBatch = typeof data.batch === 'string' ? data.batch.trim() : String(data.batch);
      if (!trimmedBatch) {
        const err: any = new Error('Batch cannot be empty.');
        err.statusCode = 400;
        throw err;
      }
      dataToUpdate.batch = trimmedBatch;

      const upperBatch = trimmedBatch.toUpperCase();
      if (['A', 'B', 'C', 'D'].includes(upperBatch)) {
        if (data.subbatch !== undefined) {
          const trimmedSubbatch = typeof data.subbatch === 'string' ? data.subbatch.trim().toUpperCase() : '';
          const allowedSubbatches = VALID_BATCH_SUBBATCH[upperBatch] || [];
          if (!trimmedSubbatch || !allowedSubbatches.includes(trimmedSubbatch)) {
            const err: any = new Error(`Subbatch must be one of ${allowedSubbatches.join(', ')} for Batch ${upperBatch}.`);
            err.statusCode = 400;
            throw err;
          }
          dataToUpdate.subbatch = trimmedSubbatch;
        } else if (targetUser.subbatch) {
          const allowedSubbatches = VALID_BATCH_SUBBATCH[upperBatch] || [];
          if (!allowedSubbatches.includes(targetUser.subbatch.toUpperCase())) {
            dataToUpdate.subbatch = allowedSubbatches[0];
          }
        }
      } else if (data.subbatch !== undefined) {
        dataToUpdate.subbatch = String(data.subbatch).trim();
      }
    } else if (data.subbatch !== undefined) {
      // Batch wasn't supplied, check against existing batch
      const effectiveBatch = (targetUser.batch || '').trim().toUpperCase();
      const allowedSubbatches = VALID_BATCH_SUBBATCH[effectiveBatch] || [];
      const trimmedSubbatch = typeof data.subbatch === 'string' ? data.subbatch.trim().toUpperCase() : '';
      if (!trimmedSubbatch || !allowedSubbatches.includes(trimmedSubbatch)) {
        const err: any = new Error(`Subbatch must be one of ${allowedSubbatches.join(', ')} for Batch ${effectiveBatch || 'unassigned'}.`);
        err.statusCode = 400;
        throw err;
      }
      dataToUpdate.subbatch = trimmedSubbatch;
    }

    // Validate Cohort
    if (data.cohort_id !== undefined) {
      if (data.cohort_id === null || data.cohort_id === '') {
        dataToUpdate.cohort_id = null;
      } else {
        const cohort = await prisma.cohort.findFirst({
          where: {
            id: data.cohort_id,
            organization_id: managerOrgId,
          },
        });
        if (!cohort) {
          const err: any = new Error('Selected cohort not found in your organization.');
          err.statusCode = 400;
          throw err;
        }
        dataToUpdate.cohort_id = cohort.id;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: dataToUpdate,
      include: {
        roles: {
          include: { role: true },
        },
        cohort: true,
      },
    });

    const roleName = updatedUser.roles[0]?.role?.name || 'MEMBER';

    return {
      id: updatedUser.id,
      user_code: updatedUser.user_code,
      name: updatedUser.name,
      email: updatedUser.email,
      batch: updatedUser.batch || null,
      subbatch: updatedUser.subbatch || null,
      cohort_id: updatedUser.cohort_id || null,
      cohort: updatedUser.cohort || null,
      type: roleName,
      is_active: updatedUser.is_active,
      created_at: updatedUser.created_at,
      updated_at: updatedUser.updated_at,
    };
  }

  /**
   * Manager retrieves an intern's base, granted, and effective permissions
   */
  static async getUserPermissions(managerOrgId: string, targetUserId: string, requestingUser: any) {
    if (!targetUserId || targetUserId === 'undefined') {
      const err: any = new Error('Target user ID is required');
      err.statusCode = 404;
      throw err;
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
        user_permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!targetUser) {
      const err: any = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }

    const isSuperAdmin = requestingUser?.roles?.some((r: any) => (r.role?.name || r.name) === 'SUPER_ADMIN') || requestingUser?.role === 'SUPER_ADMIN';
    if (!isSuperAdmin && targetUser.organization_id !== managerOrgId) {
      const err: any = new Error('Forbidden: User does not belong to your organization');
      err.statusCode = 403;
      throw err;
    }

    // Base permissions from assigned roles
    const basePermissionsSet = new Set<string>();
    for (const ur of targetUser.roles || []) {
      for (const rp of ur.role?.permissions || []) {
        if (rp.permission?.name) basePermissionsSet.add(rp.permission.name);
      }
    }
    const basePermissions = Array.from(basePermissionsSet);

    // Explicitly granted direct permissions
    const grantedPermissions = (targetUser.user_permissions || [])
      .map((up) => up.permission?.name)
      .filter(Boolean);

    const effectivePermissions = Array.from(
      new Set([...basePermissions, ...grantedPermissions])
    );

    const primaryRole = targetUser.roles?.[0]?.role?.name || 'INTERN';

    return {
      user: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        role: primaryRole,
        user_code: targetUser.user_code,
      },
      basePermissions,
      grantedPermissions,
      effectivePermissions,
      availablePermissions: DELEGABLE_MANAGER_PERMISSIONS,
    };
  }

  /**
   * Manager updates an intern's explicitly granted permissions
   */
  static async updateUserPermissions(
    managerOrgId: string,
    targetUserId: string,
    requestedPermissions: string[],
    requestingUser: any
  ) {
    if (!targetUserId || targetUserId === 'undefined') {
      const err: any = new Error('Target user ID is required');
      err.statusCode = 404;
      throw err;
    }

    if (!Array.isArray(requestedPermissions)) {
      const err: any = new Error('Permissions must be an array of permission names');
      err.statusCode = 400;
      throw err;
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!targetUser) {
      const err: any = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }

    const isSuperAdmin = requestingUser?.roles?.some((r: any) => (r.role?.name || r.name) === 'SUPER_ADMIN') || requestingUser?.role === 'SUPER_ADMIN';
    if (!isSuperAdmin && targetUser.organization_id !== managerOrgId) {
      const err: any = new Error('Forbidden: User does not belong to your organization');
      err.statusCode = 403;
      throw err;
    }

    // Prevention of self-grant or privilege escalation:
    if (requestingUser.id === targetUserId) {
      const err: any = new Error('Security violation: Users cannot modify their own permissions');
      err.statusCode = 403;
      throw err;
    }

    // Prevent non-managers / interns from granting permissions
    const callerRoles = (requestingUser.roles || []).map((r: any) => r.role?.name || r.name);
    if (requestingUser.role) callerRoles.push(requestingUser.role);
    const isAuthorizedManager = callerRoles.some((r: string) => ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(r));
    if (!isAuthorizedManager) {
      const err: any = new Error('Forbidden: Only authorized managers or administrators can manage permissions');
      err.statusCode = 403;
      throw err;
    }

    // Allow only delegable permissions; reject forbidden / super-admin platform permissions
    const delegableNames = new Set(DELEGABLE_MANAGER_PERMISSIONS.map((p) => p.name));
    const validRequested = requestedPermissions.filter((p) => delegableNames.has(p));

    // Resolve matching permission records from DB
    const permissionRecords = await prisma.permission.findMany({
      where: {
        name: { in: validRequested },
      },
    });

    // Execute atomic update in a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Delete existing user permissions for this user
      await tx.userPermission.deleteMany({
        where: { user_id: targetUserId },
      });

      // 2. Create new granted permissions
      if (permissionRecords.length > 0) {
        await tx.userPermission.createMany({
          data: permissionRecords.map((perm) => ({
            user_id: targetUserId,
            permission_id: perm.id,
          })),
        });
      }

      // 3. Record audit log
      await tx.auditLog.create({
        data: {
          actor_id: requestingUser.id,
          organization_id: targetUser.organization_id || managerOrgId,
          action: 'USER_PERMISSIONS_UPDATE',
          target_type: 'USER',
          target_id: targetUserId,
          metadata: {
            targetUserEmail: targetUser.email,
            grantedPermissions: permissionRecords.map((p) => p.name),
            count: permissionRecords.length,
          },
        },
      });
    });

    // Invalidate cached session for immediate effect
    invalidateUserSessionCache(targetUserId);

    // Return the updated permission summary
    return this.getUserPermissions(managerOrgId, targetUserId, requestingUser);
  }
}

export interface DelegablePermission {
  name: string;
  label: string;
  description: string;
  category: 'Dashboard & Analytics' | 'Projects' | 'Intern Management' | 'Timesheets' | 'Forms & Action Items';
}

export const DELEGABLE_MANAGER_PERMISSIONS: DelegablePermission[] = [
  // Dashboard & Analytics
  {
    name: 'EVALUATION_READ',
    label: 'View Reports & Analytics',
    description: 'Access manager performance reports, analytics charts, and evaluation summaries',
    category: 'Dashboard & Analytics',
  },
  {
    name: 'EVALUATION_CREATE',
    label: 'Create Evaluations & Ratings',
    description: 'Record intern performance ratings, scores, and evaluation feedback',
    category: 'Dashboard & Analytics',
  },
  // Projects
  {
    name: 'PROJECT_CREATE',
    label: 'Create Projects',
    description: 'Initiate and configure new team projects within the organization',
    category: 'Projects',
  },
  {
    name: 'PROJECT_UPDATE',
    label: 'Edit Projects & Manage Project Members',
    description: 'Modify project details, manage project members, cycles, sprints, and settings',
    category: 'Projects',
  },
  {
    name: 'PROJECT_DELETE',
    label: 'Archive & Delete Projects',
    description: 'Archive completed projects or remove projects from the active workspace',
    category: 'Projects',
  },
  {
    name: 'TASK_CREATE',
    label: 'Create Tasks & Work Items',
    description: 'Create tasks, epics, user stories, and bugs in project backlogs',
    category: 'Projects',
  },
  {
    name: 'TASK_UPDATE',
    label: 'Update Tasks & Work Items',
    description: 'Edit task descriptions, estimates, story points, and sprint status transitions',
    category: 'Projects',
  },
  {
    name: 'TASK_ASSIGN',
    label: 'Assign & Reassign Tasks',
    description: 'Allocate tasks, add assignees, or reassign work items to team members',
    category: 'Projects',
  },
  {
    name: 'TASK_DELETE',
    label: 'Delete Tasks',
    description: 'Permanently remove tasks or work items from project boards',
    category: 'Projects',
  },
  {
    name: 'DOCUMENT_UPLOAD',
    label: 'Upload Project Documents',
    description: 'Upload and manage project specifications, design docs, and attachments',
    category: 'Projects',
  },
  // Intern Management
  {
    name: 'USER_READ',
    label: 'View Interns Directory',
    description: 'Browse full roster of organization interns, batches, and account profiles',
    category: 'Intern Management',
  },
  {
    name: 'USER_CREATE',
    label: 'Create & Provision Interns',
    description: 'Onboard new interns and generate initial credentials',
    category: 'Intern Management',
  },
  {
    name: 'USER_BULK_CREATE',
    label: 'Bulk Import Interns via CSV',
    description: 'Upload CSV spreadsheets to bulk validate and provision cohort interns',
    category: 'Intern Management',
  },
  {
    name: 'USER_UPDATE',
    label: 'Edit Intern Details & Batches',
    description: 'Modify intern names, cohort allocations, batch (A-D) and subbatch groupings',
    category: 'Intern Management',
  },
  {
    name: 'USER_DELETE',
    label: 'Deactivate Accounts & Reset Passwords',
    description: 'Deactivate intern access and issue temporary password resets',
    category: 'Intern Management',
  },
  // Timesheets
  {
    name: 'ATTENDANCE_READ',
    label: "View All Interns' Timesheets & Reports",
    description: 'Inspect daily logs, clock-in records, weekly summaries, and time breakdowns',
    category: 'Timesheets',
  },
  {
    name: 'ATTENDANCE_UPDATE',
    label: 'Review & Approve Timesheet Corrections',
    description: 'Review time correction requests, approve manual adjustments, and audit hours',
    category: 'Timesheets',
  },
  // Forms & Action Items
  {
    name: 'FORM_READ',
    label: 'View Form Submissions & Overdue Reports',
    description: 'Review all intern form submissions, overdue member rosters, and export reports',
    category: 'Forms & Action Items',
  },
  {
    name: 'FORM_CREATE',
    label: 'Create Forms',
    description: 'Design new feedback forms, questionnaires, and onboarding checklists',
    category: 'Forms & Action Items',
  },
  {
    name: 'FORM_UPDATE',
    label: 'Edit Forms & Manage Deadlines',
    description: 'Update form questions, deadlines, publish or archive status',
    category: 'Forms & Action Items',
  },
  {
    name: 'FORM_DELETE',
    label: 'Delete Forms',
    description: 'Remove outdated evaluation and feedback forms',
    category: 'Forms & Action Items',
  },
];
