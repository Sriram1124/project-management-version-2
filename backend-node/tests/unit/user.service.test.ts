import { prisma } from '../../src/lib/prisma';
import { UserService } from '../../src/services/user.service';
import * as argon2 from 'argon2';

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    userRole: {
      create: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    cohort: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    userSession: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mock_hashed_password'),
  verify: jest.fn().mockResolvedValue(true),
}));

describe('UserService Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateUserCode', () => {
    it('should generate a code on first attempt when not in DB and not reserved', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
      const reserved = new Set<string>();

      const code = await UserService.generateUserCode('INT', 'org-1', reserved);
      expect(code).toMatch(/^INT-\d{4}$/);
      expect(reserved.has(code)).toBe(true);
    });

    it('should retry if generated code is already in reserved Set or DB', async () => {
      (prisma.user.findFirst as jest.Mock)
        .mockResolvedValueOnce({ id: 'existing-id' })
        .mockResolvedValueOnce(null);

      const reserved = new Set<string>();
      const code = await UserService.generateUserCode('EMP', 'org-1', reserved);
      expect(code).toMatch(/^EMP-\d{4}$/);
      expect(reserved.has(code)).toBe(true);
    });

    it('should fallback to 5-digit and timestamp if collisions persist', async () => {
      // Return existing for 60 iterations (30 for 4-digit, 30 for 5-digit)
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'always-collide' });
      const reserved = new Set<string>();

      const code = await UserService.generateUserCode('INT', 'org-1', reserved);
      expect(code).toMatch(/^INT-\d{6}$/);
      expect(reserved.has(code)).toBe(true);
    });
  });

  describe('createUser', () => {
    const validManagerOrgId = 'org-1';

    it('should reject invalid or missing name', async () => {
      await expect(
        UserService.createUser({ name: '', email: 'a@b.com', type: 'INTERN', managerOrgId: validManagerOrgId })
      ).rejects.toThrow('Name is required');

      await expect(
        UserService.createUser({ name: 'a'.repeat(101), email: 'a@b.com', type: 'INTERN', managerOrgId: validManagerOrgId })
      ).rejects.toThrow('Name cannot exceed 100 characters');
    });

    it('should reject invalid or missing email', async () => {
      await expect(
        UserService.createUser({ name: 'Valid Name', email: '', type: 'INTERN', managerOrgId: validManagerOrgId })
      ).rejects.toThrow('Email is required');

      await expect(
        UserService.createUser({ name: 'Valid Name', email: 'not-an-email', type: 'INTERN', managerOrgId: validManagerOrgId })
      ).rejects.toThrow('Invalid email format');
    });

    it('should reject invalid type or missing managerOrgId', async () => {
      await expect(
        UserService.createUser({ name: 'Valid Name', email: 'valid@example.com', type: 'INVALID' as any, managerOrgId: validManagerOrgId })
      ).rejects.toThrow('Type must be either INTERN or EMPLOYEE');

      await expect(
        UserService.createUser({ name: 'Valid Name', email: 'valid@example.com', type: 'INTERN', managerOrgId: '' })
      ).rejects.toThrow('Manager organization is required');
    });

    it('should validate batch and subbatch rules for INTERN', async () => {
      // Invalid subbatch for batch A
      await expect(
        UserService.createUser({
          name: 'Intern One',
          email: 'intern1@example.com',
          type: 'INTERN',
          managerOrgId: validManagerOrgId,
          batch: 'A',
          subbatch: 'B1',
        })
      ).rejects.toThrow('Subbatch must be one of A1, A2 for Batch A');

      // Invalid cohort_id
      (prisma.cohort.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        UserService.createUser({
          name: 'Intern One',
          email: 'intern1@example.com',
          type: 'INTERN',
          managerOrgId: validManagerOrgId,
          batch: 'A',
          subbatch: 'A1',
          cohort_id: 'non-existent-cohort',
        })
      ).rejects.toThrow('Selected cohort was not found in your organization');
    });

    it('should reject existing email', async () => {
      (prisma.cohort.findFirst as jest.Mock).mockResolvedValue({ id: 'c1' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'existing-user' });

      await expect(
        UserService.createUser({
          name: 'Intern Duplicate',
          email: 'existing@example.com',
          type: 'INTERN',
          managerOrgId: validManagerOrgId,
        })
      ).rejects.toThrow('A user with email "existing@example.com" already exists.');
    });

    it('should reject if role is not configured in DB', async () => {
      (prisma.cohort.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.role.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        UserService.createUser({
          name: 'Intern',
          email: 'new@example.com',
          type: 'INTERN',
          managerOrgId: validManagerOrgId,
        })
      ).rejects.toThrow('Role "INTERN" is not configured in the system.');
    });

    it('should successfully create an intern with default subbatch and cohort fallback', async () => {
      (prisma.cohort.findFirst as jest.Mock).mockResolvedValue({ id: 'default-cohort' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.role.findUnique as jest.Mock).mockResolvedValue({ id: 'role-intern', name: 'INTERN' });
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      const createdUserMock = {
        id: 'u-123',
        user_code: 'INT-5555',
        name: 'New Intern',
        email: 'newintern@example.com',
        batch: 'B',
        subbatch: 'B1',
        cohort_id: 'default-cohort',
        cohort: { id: 'default-cohort', name: 'Cohort 1' },
        created_at: new Date(),
      };

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          user: { create: jest.fn().mockResolvedValue(createdUserMock) },
          userRole: { create: jest.fn().mockResolvedValue({ id: 'ur-1' }) },
        };
        return await callback(tx);
      });

      const result = await UserService.createUser({
        name: 'New Intern',
        email: 'newintern@example.com',
        type: 'INTERN',
        managerOrgId: validManagerOrgId,
        batch: 'B',
        // subbatch omitted, should default to B1
      });

      expect(result.user.name).toBe('New Intern');
      expect(result.user.batch).toBe('B');
      expect(result.user.subbatch).toBe('B1');
      expect(result.temporary_password).toBeDefined();
    });

    it('should create an employee successfully with custom batch/subbatch', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.role.findUnique as jest.Mock).mockResolvedValue({ id: 'role-emp', name: 'EMPLOYEE' });
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      const createdUserMock = {
        id: 'u-emp',
        user_code: 'EMP-1234',
        name: 'New Employee',
        email: 'employee@example.com',
        batch: null,
        subbatch: null,
        cohort_id: null,
        cohort: null,
        created_at: new Date(),
      };

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          user: { create: jest.fn().mockResolvedValue(createdUserMock) },
          userRole: { create: jest.fn().mockResolvedValue({ id: 'ur-emp' }) },
        };
        return await callback(tx);
      });

      const result = await UserService.createUser({
        name: 'New Employee',
        email: 'employee@example.com',
        type: 'EMPLOYEE',
        managerOrgId: validManagerOrgId,
      });

      expect(result.user.type).toBe('EMPLOYEE');
    });

    it('should handle P2002 collision during transaction', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.role.findUnique as jest.Mock).mockResolvedValue({ id: 'role-emp', name: 'EMPLOYEE' });
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      const p2002Error: any = new Error('Unique constraint failed');
      p2002Error.code = 'P2002';
      (prisma.$transaction as jest.Mock).mockRejectedValue(p2002Error);

      await expect(
        UserService.createUser({
          name: 'Colliding Employee',
          email: 'collide@example.com',
          type: 'EMPLOYEE',
          managerOrgId: validManagerOrgId,
        })
      ).rejects.toThrow('A user with email "collide@example.com" already exists.');
    });
  });

  describe('validateBulkCsv', () => {
    it('should reject empty or missing csv content', async () => {
      const res1 = await UserService.validateBulkCsv('', 'org-1');
      expect(res1.isValid).toBe(false);
      expect(res1.errors[0]).toContain('CSV content is empty or invalid.');

      const res2 = await UserService.validateBulkCsv('just-a-header', 'org-1');
      expect(res2.isValid).toBe(false);
      expect(res2.errors[0]).toContain('must contain a header row and at least one data row.');
    });

    it('should reject sensitive security forbidden columns', async () => {
      const csv = 'name,email,type,password\nAlice,alice@example.com,INTERN,secret';
      const res = await UserService.validateBulkCsv(csv, 'org-1');
      expect(res.isValid).toBe(false);
      expect(res.errors[0]).toContain('Security Violation');
    });

    it('should reject missing required columns (Name and Email)', async () => {
      const csv = 'batch,cohort\nA,Cohort-1';
      const res = await UserService.validateBulkCsv(csv, 'org-1');
      expect(res.isValid).toBe(false);
      expect(res.errors[0]).toContain('Missing required columns: Name, Email');
    });

    it('should accept master data format (Name,Batch,Subbatch,Email) and infer type INTERN with default cohort', async () => {
      (prisma.cohort.findMany as jest.Mock).mockResolvedValue([
        { id: 'c-active', code: 'Cohort-2026', name: 'Spring Cohort 2026', is_active: true },
      ]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

      const masterCsv = [
        'Name,Batch,Subbatch,Email',
        'Aditya Yadav,A,A1,aditya.yadav@dailoqa.com',
        'Bhavna Sharma,B,B1,bhavna.sharma@dailoqa.com',
        'Deepak Verma,D,D2,deepak.verma@dailoqa.com',
      ].join('\n');

      const res = await UserService.validateBulkCsv(masterCsv, 'org-1');
      expect(res.isValid).toBe(true);
      expect(res.summary.total).toBe(3);
      expect(res.toCreateRows.length).toBe(3);

      // Verify row 1: Aditya Yadav
      const r1 = res.toCreateRows[0];
      expect(r1.name).toBe('Aditya Yadav');
      expect(r1.email).toBe('aditya.yadav@dailoqa.com');
      expect(r1.type).toBe('INTERN');
      expect(r1.batch).toBe('A');
      expect(r1.subbatch).toBe('A1');
      expect(r1.cohort_id).toBe('c-active');

      // Verify row 2: Bhavna Sharma
      const r2 = res.toCreateRows[1];
      expect(r2.batch).toBe('B');
      expect(r2.subbatch).toBe('B1');
      expect(r2.type).toBe('INTERN');

      // Verify row 3: Deepak Verma
      const r3 = res.toCreateRows[2];
      expect(r3.batch).toBe('D');
      expect(r3.subbatch).toBe('D2');
      expect(r3.type).toBe('INTERN');
    });

    it('should handle master data format with UTF-8 BOM, mixed header casing, and spaces', async () => {
      (prisma.cohort.findMany as jest.Mock).mockResolvedValue([
        { id: 'c-default', code: 'Cohort-1', name: 'Cohort 1', is_active: true },
      ]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

      const bomMasterCsv = '\uFEFF  NAME , BATCH , Sub_Batch ,  EMAIL  \nAditya Yadav,A,A1,aditya.yadav@dailoqa.com';
      const res = await UserService.validateBulkCsv(bomMasterCsv, 'org-1');
      expect(res.isValid).toBe(true);
      expect(res.summary.total).toBe(1);
      expect(res.toCreateRows[0].name).toBe('Aditya Yadav');
      expect(res.toCreateRows[0].email).toBe('aditya.yadav@dailoqa.com');
      expect(res.toCreateRows[0].type).toBe('INTERN');
      expect(res.toCreateRows[0].batch).toBe('A');
      expect(res.toCreateRows[0].subbatch).toBe('A1');
      expect(res.toCreateRows[0].cohort_id).toBe('c-default');
    });

    it('should correctly flag invalid emails and bad batches in master data format', async () => {
      (prisma.cohort.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

      const masterCsvWithErrors = [
        'Name,Batch,Subbatch,Email',
        'Valid User,A,A1,valid@example.com',
        'Bad Email User,A,A1,not-an-email',
        'Bad Batch User,Z,Z1,badbatch@example.com',
      ].join('\n');

      const res = await UserService.validateBulkCsv(masterCsvWithErrors, 'org-1');
      expect(res.isValid).toBe(false);
      expect(res.summary.total).toBe(3);
      expect(res.summary.valid).toBe(1);
      expect(res.summary.invalid).toBe(2);
      expect(res.toCreateRows.length).toBe(1);
      expect(res.invalidRows.length).toBe(2);
      expect(res.invalidRows[0].reason).toContain('Invalid email format');
      expect(res.invalidRows[1].reason).toContain('Invalid batch "Z"');
    });

    it('should handle UTF-8 BOM gracefully without misinterpreting headers', async () => {
      (prisma.cohort.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      const csvWithBom = '\uFEFFname,email,type\nBob Smith,bob@example.com,INTERN';
      const res = await UserService.validateBulkCsv(csvWithBom, 'org-1');
      expect(res.isValid).toBe(true);
      expect(res.summary.total).toBe(1);
      expect(res.toCreateRows.length).toBe(1);
      expect(res.toCreateRows[0].name).toBe('Bob Smith');
      expect(res.toCreateRows[0].email).toBe('bob@example.com');
    });

    it('should handle Mac CR (\\r) and Windows CRLF (\\r\\n) line endings', async () => {
      (prisma.cohort.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      const csvMacCr = 'name,email,type\rClaire,claire@example.com,INTERN\rDan,dan@example.com,EMPLOYEE';
      const res = await UserService.validateBulkCsv(csvMacCr, 'org-1');
      expect(res.isValid).toBe(true);
      expect(res.summary.total).toBe(2);
      expect(res.toCreateRows.length).toBe(2);
    });

    it('should handle double-quoted headers and fields with escaped quotes', async () => {
      (prisma.cohort.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      const csvQuoted = '"name","email","type"\n"Emily ""The Rock"" Jones","emily@example.com","INTERN"';
      const res = await UserService.validateBulkCsv(csvQuoted, 'org-1');
      expect(res.isValid).toBe(true);
      expect(res.summary.total).toBe(1);
      expect(res.toCreateRows[0].name).toBe('Emily "The Rock" Jones');
      expect(res.toCreateRows[0].email).toBe('emily@example.com');
    });

    it('should auto-detect semicolon delimiter', async () => {
      (prisma.cohort.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      const csvSemicolon = 'name;email;type;batch\nFrank;frank@example.com;INTERN;A';
      const res = await UserService.validateBulkCsv(csvSemicolon, 'org-1');
      expect(res.isValid).toBe(true);
      expect(res.summary.total).toBe(1);
      expect(res.toCreateRows[0].name).toBe('Frank');
      expect(res.toCreateRows[0].batch).toBe('A');
    });

    it('should support common header aliases and skip trailing blank rows', async () => {
      (prisma.cohort.findMany as jest.Mock).mockResolvedValue([
        { id: 'c-1', code: 'Cohort-1', name: 'Cohort 1' },
      ]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      const csvAliases = [
        'Full Name,Email Address,User Type,Batch,Sub Batch,Cohort Name',
        'Grace Hopper,grace@example.com,INTERN,A,A1,Cohort-1',
        ',,,,,', // Trailing blank row with commas
        '   ',   // Trailing whitespace line
      ].join('\n');
      const res = await UserService.validateBulkCsv(csvAliases, 'org-1');
      expect(res.isValid).toBe(true);
      expect(res.summary.total).toBe(1);
      expect(res.toCreateRows[0].name).toBe('Grace Hopper');
      expect(res.toCreateRows[0].subbatch).toBe('A1');
      expect(res.toCreateRows[0].cohort_id).toBe('c-1');
    });

    it('should reject CSV with headers but no data rows', async () => {
      const csvHeadersOnly = 'name,email,type\n';
      const res = await UserService.validateBulkCsv(csvHeadersOnly, 'org-1');
      expect(res.isValid).toBe(false);
      expect(res.summary.total).toBe(0);
      expect(res.errors[0]).toBe('CSV file must contain a header row and at least one data row.');
    });

    it('should categorize invalid rows, intra-csv duplicates, and to_create candidates', async () => {
      (prisma.cohort.findMany as jest.Mock).mockResolvedValue([
        { id: 'c-1', code: 'Cohort-1', name: 'Cohort 1' },
      ]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'existing-other-org',
          email: 'other@example.com',
          organization_id: 'different-org',
          name: 'Other Org User',
          is_active: true,
        },
        {
          id: 'existing-inactive',
          email: 'inactive@example.com',
          organization_id: 'org-1',
          name: 'Old User',
          user_code: 'INT-0001',
          is_active: false,
        },
        {
          id: 'existing-identical',
          email: 'same@example.com',
          organization_id: 'org-1',
          name: 'Same User',
          user_code: 'INT-0002',
          batch: 'A',
          subbatch: 'A1',
          is_active: true,
        },
        {
          id: 'existing-updated',
          email: 'update@example.com',
          organization_id: 'org-1',
          name: 'Old Name',
          user_code: 'INT-0003',
          batch: 'A',
          subbatch: 'A1',
          is_active: true,
        },
      ]);

      const csvLines = [
        'name,email,type,batch,subbatch,cohort',
        'Invalid Type User,invalid-type@example.com,CONTRACTOR,A,A1,Cohort-1', // Invalid type
        'Invalid Subbatch User,bad-sub@example.com,INTERN,A,C1,Cohort-1', // Invalid subbatch
        'Bad Cohort User,bad-cohort@example.com,INTERN,A,A1,NonExistentCohort', // Unknown cohort
        'Valid User 1,valid1@example.com,INTERN,A,A1,Cohort-1', // to_create
        'Valid User Duplicate,valid1@example.com,INTERN,A,A1,Cohort-1', // duplicate_in_csv
        'Cross Tenant,other@example.com,INTERN,A,A1,Cohort-1', // cross-tenant collision
        'Inactive User,inactive@example.com,INTERN,A,A1,Cohort-1', // to_skip (inactive)
        'Same User,same@example.com,INTERN,A,A1,Cohort-1', // to_skip (identical)
        'New Name,update@example.com,INTERN,A,A1,Cohort-1', // to_update (name changed)
      ].join('\n');

      const res = await UserService.validateBulkCsv(csvLines, 'org-1');
      expect(res.summary.total).toBe(9);
      expect(res.toCreateRows.length).toBe(1);
      expect(res.toCreateRows[0].email).toBe('valid1@example.com');
      expect(res.duplicateInCsvRows.length).toBe(1);
      expect(res.duplicateInCsvRows[0].email).toBe('valid1@example.com');
      expect(res.toSkipRows.length).toBe(2);
      expect(res.toUpdateRows.length).toBe(1);
      expect(res.toUpdateRows[0].changes.name).toEqual({ from: 'Old Name', to: 'New Name' });
    });

    it('should infer batch from subbatch when batch is omitted', async () => {
      (prisma.cohort.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

      const csv = 'name,email,type,subbatch\nInferred User,inferred@example.com,INTERN,B2';
      const res = await UserService.validateBulkCsv(csv, 'org-1');
      expect(res.isValid).toBe(true);
      expect(res.toCreateRows[0].batch).toBe('B');
      expect(res.toCreateRows[0].subbatch).toBe('B2');
    });
  });

  describe('generateBulkCsvTemplate', () => {
    it('should generate template with sample cohort if available', async () => {
      (prisma.cohort.findMany as jest.Mock).mockResolvedValue([{ code: 'COHORT-2026', name: 'Spring 2026' }]);
      const template = await UserService.generateBulkCsvTemplate('org-1');
      expect(template).toContain('COHORT-2026');
      expect(template).toContain('Alex Morgan');
    });

    it('should fallback to Cohort-1 when no cohorts exist', async () => {
      (prisma.cohort.findMany as jest.Mock).mockResolvedValue([]);
      const template = await UserService.generateBulkCsvTemplate('org-1');
      expect(template).toContain('Cohort-1');
    });
  });

  describe('createUsersBulk', () => {
    it('should throw error if candidate rows array is empty', async () => {
      await expect(UserService.createUsersBulk([], 'org-1')).rejects.toThrow(
        'No candidate rows provided for bulk import.'
      );
    });

    it('should throw error if system roles are missing', async () => {
      (prisma.role.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        UserService.createUsersBulk(
          [{ rowNumber: 2, name: 'Alice', email: 'alice@example.com', type: 'INTERN' }],
          'org-1'
        )
      ).rejects.toThrow('INTERN or EMPLOYEE role is not configured in the system.');
    });

    it('should successfully import users and update existing when update_existing is true', async () => {
      (prisma.role.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'r-int', name: 'INTERN' })
        .mockResolvedValueOnce({ id: 'r-emp', name: 'EMPLOYEE' });

      (prisma.cohort.findMany as jest.Mock).mockResolvedValue([{ id: 'c-1', code: 'C1', name: 'Cohort 1' }]);
      (prisma.user.findMany as jest.Mock)
        .mockResolvedValueOnce([
          {
            id: 'u-existing',
            email: 'bob@example.com',
            organization_id: 'org-1',
            name: 'Bob Old',
            user_code: 'INT-1111',
            batch: 'A',
            subbatch: 'A1',
            is_active: true,
          },
        ])
        .mockResolvedValueOnce([{ user_code: 'INT-1111' }]); // existingOrgUsers for code reservations

      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null); // generateUserCode findFirst

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          user: { update: jest.fn(), createMany: jest.fn() },
          userRole: { createMany: jest.fn() },
        };
        return await callback(tx);
      });

      const rows: any[] = [
        { rowNumber: 2, name: 'Alice', email: 'alice@example.com', type: 'INTERN', batch: 'A', subbatch: 'A1' },
        { rowNumber: 3, name: 'Bob New', email: 'bob@example.com', type: 'INTERN', batch: 'A', subbatch: 'A2' },
      ];

      const res = await UserService.createUsersBulk(rows, 'org-1', { update_existing: true });
      expect(res.summary.created).toBe(1);
      expect(res.summary.updated).toBe(1);
      expect(res.created_users[0].email).toBe('alice@example.com');
      expect(res.updated_users[0].email).toBe('bob@example.com');
    });

    it('should handle concurrent P2002 collision during bulk creation', async () => {
      (prisma.role.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'r-int', name: 'INTERN' })
        .mockResolvedValueOnce({ id: 'r-emp', name: 'EMPLOYEE' });

      (prisma.cohort.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // existingDbUsers
        .mockResolvedValueOnce([]) // existingOrgUsers
        .mockResolvedValueOnce([{ id: 'u-collided', email: 'alice@example.com', user_code: 'INT-9999' }]); // collidedUsers query

      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      let firstCall = true;
      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        if (firstCall) {
          firstCall = false;
          const p2002: any = new Error('Unique constraint failed');
          p2002.code = 'P2002';
          throw p2002;
        }
        const tx = {
          user: { createMany: jest.fn() },
          userRole: { createMany: jest.fn() },
        };
        return await callback(tx);
      });

      const rows: any[] = [
        { rowNumber: 2, name: 'Alice', email: 'alice@example.com', type: 'INTERN' },
        { rowNumber: 3, name: 'Charlie', email: 'charlie@example.com', type: 'INTERN' },
      ];

      const res = await UserService.createUsersBulk(rows, 'org-1', false);
      expect(res.summary.skipped).toBe(1);
      expect(res.summary.created).toBe(1);
      expect(res.skipped_users[0].email).toBe('alice@example.com');
      expect(res.created_users[0].email).toBe('charlie@example.com');
    });

    it('should infer INTERN and assign active default cohort when type and cohort are omitted in bulk creation', async () => {
      (prisma.role.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'r-int', name: 'INTERN' })
        .mockResolvedValueOnce({ id: 'r-emp', name: 'EMPLOYEE' });

      (prisma.cohort.findMany as jest.Mock).mockResolvedValue([
        { id: 'c-active-default', code: 'C-2026', name: 'Cohort 2026', is_active: true },
      ]);
      (prisma.user.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // existing candidate emails
        .mockResolvedValueOnce([]); // existingOrgUsers for code reservation

      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      let createdData: any[] = [];
      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          user: {
            createMany: jest.fn().mockImplementation(({ data }) => {
              createdData = data;
            }),
          },
          userRole: { createMany: jest.fn() },
        };
        return await callback(tx);
      });

      // Master data candidate row without type or cohort
      const masterRows: any[] = [
        { rowNumber: 2, name: 'Aditya Yadav', email: 'aditya.yadav@dailoqa.com', batch: 'A', subbatch: 'A1' },
      ];

      const res = await UserService.createUsersBulk(masterRows, 'org-1');
      expect(res.summary.created).toBe(1);
      expect(res.created_users[0].name).toBe('Aditya Yadav');
      expect(res.created_users[0].type).toBe('INTERN');
      expect(createdData[0].batch).toBe('A');
      expect(createdData[0].subbatch).toBe('A1');
      expect(createdData[0].cohort_id).toBe('c-active-default');
    });

    it('should idempotently skip previously created master data on re-import', async () => {
      (prisma.role.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'r-int', name: 'INTERN' })
        .mockResolvedValueOnce({ id: 'r-emp', name: 'EMPLOYEE' });

      (prisma.cohort.findMany as jest.Mock).mockResolvedValue([
        { id: 'c-active-default', code: 'C-2026', name: 'Cohort 2026', is_active: true },
      ]);
      // DB already contains Aditya Yadav with identical details
      (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'u-aditya',
          email: 'aditya.yadav@dailoqa.com',
          name: 'Aditya Yadav',
          user_code: 'INT-5001',
          batch: 'A',
          subbatch: 'A1',
          cohort_id: 'c-active-default',
          organization_id: 'org-1',
          is_active: true,
        },
      ]);

      const masterRows: any[] = [
        { rowNumber: 2, name: 'Aditya Yadav', email: 'aditya.yadav@dailoqa.com', batch: 'A', subbatch: 'A1' },
      ];

      const res = await UserService.createUsersBulk(masterRows, 'org-1');
      expect(res.summary.created).toBe(0);
      expect(res.summary.skipped).toBe(1);
      expect(res.skipped_users[0].reason).toContain('Identical member data');
    });
  });

  describe('listUsers', () => {
    it('should require managerOrgId', async () => {
      await expect(UserService.listUsers('')).rejects.toThrow('Manager organization context required.');
    });

    it('should list and filter users by search query, cohort, batch, and type', async () => {
      const mockUsers = [
        {
          id: 'u-1',
          name: 'Alice Wonder',
          email: 'alice@example.com',
          user_code: 'INT-1001',
          batch: 'A',
          subbatch: 'A1',
          cohort_id: 'c-1',
          cohort: { id: 'c-1', name: 'Cohort 1', code: 'C1' },
          is_active: true,
          roles: [{ role: { name: 'INTERN' } }],
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'u-2',
          name: 'Bob Inactive',
          email: 'bob@example.com',
          user_code: 'INT-1002',
          batch: 'B',
          subbatch: 'B1',
          cohort_id: 'c-2',
          cohort: null,
          is_active: false,
          roles: [{ role: { name: 'EMPLOYEE' } }],
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];
      (prisma.user.findMany as jest.Mock).mockResolvedValue(mockUsers);

      const all = await UserService.listUsers('org-1', 'ALL', 'Alice', 'A', 'c-1');
      expect(all.length).toBe(2);

      const activeOnly = await UserService.listUsers('org-1', 'ACTIVE');
      expect(activeOnly.length).toBe(1);
      expect(activeOnly[0].name).toBe('Alice Wonder');

      const inactiveOnly = await UserService.listUsers('org-1', 'INACTIVE');
      expect(inactiveOnly.length).toBe(1);
      expect(inactiveOnly[0].name).toBe('Bob Inactive');

      const internOnly = await UserService.listUsers('org-1', 'INTERN');
      expect(internOnly.length).toBe(1);
    });
  });

  describe('updateProfile', () => {
    it('should reject missing or empty userId and invalid name', async () => {
      await expect(UserService.updateProfile('', {})).rejects.toThrow('User ID is required.');

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(UserService.updateProfile('missing', {})).rejects.toThrow('User not found or inactive.');

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u-1', is_active: true, roles: [] });
      await expect(UserService.updateProfile('u-1', { name: '  ' })).rejects.toThrow('Name cannot be empty.');
    });

    it('should update profile name and batch', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'u-1',
        is_active: true,
        roles: [{ role: { name: 'INTERN' } }],
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({
        id: 'u-1',
        name: 'Updated Alice',
        email: 'alice@example.com',
        batch: 'B',
        roles: [{ role: { name: 'INTERN' } }],
        user_code: 'INT-1234',
        must_change_password: false,
        organization_id: 'org-1',
        updated_at: new Date(),
      });

      const res = await UserService.updateProfile('u-1', { name: 'Updated Alice', batch: 'B' });
      expect(res.name).toBe('Updated Alice');
      expect(res.batch).toBe('B');
      expect(res.role).toBe('INTERN');
      expect(res.user_code).toBeUndefined(); // Intern/Employee hides user_code in return
    });
  });

  describe('resetUserPassword', () => {
    it('should validate inputs, organization boundary, and super admin check', async () => {
      await expect(UserService.resetUserPassword('', 'target')).rejects.toThrow(
        'Manager organization context required.'
      );
      await expect(UserService.resetUserPassword('org-1', '')).rejects.toThrow(
        'Target user ID is required.'
      );

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(UserService.resetUserPassword('org-1', 'target')).rejects.toThrow('User not found.');

      // Cross-tenant check
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'target',
        organization_id: 'org-other',
        roles: [],
      });
      await expect(UserService.resetUserPassword('org-1', 'target')).rejects.toThrow(
        'Unauthorized: Target user does not belong to your organization.'
      );

      // Super admin check
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'target',
        organization_id: 'org-1',
        roles: [{ role: { name: 'SUPER_ADMIN' } }],
      });
      await expect(UserService.resetUserPassword('org-1', 'target')).rejects.toThrow(
        'Cannot reset password for Super Admin.'
      );
    });

    it('should reset password with custom password and invalidate sessions', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'target',
        user_code: 'INT-9999',
        name: 'Intern Name',
        email: 'intern@example.com',
        organization_id: 'org-1',
        roles: [{ role: { name: 'INTERN' } }],
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (prisma.userSession.deleteMany as jest.Mock).mockResolvedValue({});

      const res = await UserService.resetUserPassword('org-1', 'target', 'CustomPass123!');
      expect(res.temporary_password).toBe('CustomPass123!');
      expect(prisma.userSession.deleteMany).toHaveBeenCalledWith({ where: { user_id: 'target' } });
    });
  });

  describe('deactivateUser', () => {
    it('should validate inputs, tenancy, and reject deactivating Super Admin', async () => {
      await expect(UserService.deactivateUser('', 'target')).rejects.toThrow(
        'Manager organization context required.'
      );
      await expect(UserService.deactivateUser('org-1', '')).rejects.toThrow('Target user ID is required.');

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(UserService.deactivateUser('org-1', 'target')).rejects.toThrow('User not found.');

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'target',
        organization_id: 'org-other',
        roles: [],
      });
      await expect(UserService.deactivateUser('org-1', 'target')).rejects.toThrow('Unauthorized');

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'target',
        organization_id: 'org-1',
        roles: [{ role: { name: 'SUPER_ADMIN' } }],
      });
      await expect(UserService.deactivateUser('org-1', 'target')).rejects.toThrow('Cannot deactivate Super Admin.');
    });

    it('should deactivate member and invalidate user sessions', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'target',
        user_code: 'INT-5555',
        name: 'Deactivatable User',
        organization_id: 'org-1',
        roles: [{ role: { name: 'INTERN' } }],
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (prisma.userSession.deleteMany as jest.Mock).mockResolvedValue({});

      const res = await UserService.deactivateUser('org-1', 'target');
      expect(res.success).toBe(true);
      expect(res.user.is_active).toBe(false);
      expect(prisma.userSession.deleteMany).toHaveBeenCalledWith({ where: { user_id: 'target' } });
    });
  });

  describe('changePassword', () => {
    it('should validate password inputs and verification', async () => {
      await expect(UserService.changePassword('u-1', '', 'newpassword123')).rejects.toThrow(
        'Current password is required.'
      );
      await expect(UserService.changePassword('u-1', 'current', 'short')).rejects.toThrow(
        'New password must be at least 8 characters.'
      );
      await expect(UserService.changePassword('u-1', 'samepassword', 'samepassword')).rejects.toThrow(
        'New password must be different from current password.'
      );

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(UserService.changePassword('u-1', 'current', 'newpassword123')).rejects.toThrow(
        'User not found or inactive.'
      );

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'u-1',
        is_active: true,
        password_hash: 'hashed',
      });
      (argon2.verify as jest.Mock).mockResolvedValueOnce(false);
      await expect(UserService.changePassword('u-1', 'wrongcurrent', 'newpassword123')).rejects.toThrow(
        'Current password is incorrect.'
      );
    });

    it('should successfully change password', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'u-1',
        is_active: true,
        password_hash: 'hashed',
      });
      (argon2.verify as jest.Mock).mockResolvedValueOnce(true);
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      const res = await UserService.changePassword('u-1', 'correctold', 'newsecurepass123');
      expect(res.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: {
          password_hash: 'mock_hashed_password',
          must_change_password: false,
        },
      });
    });
  });

  describe('updateMember', () => {
    it('should validate inputs, tenancy, and reject modifying Super Admin', async () => {
      await expect(UserService.updateMember('', 'target', {})).rejects.toThrow(
        'Manager organization context required.'
      );
      await expect(UserService.updateMember('org-1', '', {})).rejects.toThrow('Target user ID is required.');

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(UserService.updateMember('org-1', 'target', {})).rejects.toThrow('User not found.');

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'target',
        organization_id: 'org-other',
        roles: [],
      });
      await expect(UserService.updateMember('org-1', 'target', {})).rejects.toThrow('Unauthorized');

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'target',
        organization_id: 'org-1',
        roles: [{ role: { name: 'SUPER_ADMIN' } }],
      });
      await expect(UserService.updateMember('org-1', 'target', {})).rejects.toThrow(
        'Cannot edit details for Super Admin.'
      );
    });

    it('should validate name length and non-empty batch', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'target',
        organization_id: 'org-1',
        roles: [{ role: { name: 'INTERN' } }],
        batch: 'A',
      });

      await expect(UserService.updateMember('org-1', 'target', { name: '  ' })).rejects.toThrow(
        'Name cannot be empty.'
      );
      await expect(UserService.updateMember('org-1', 'target', { name: 'x'.repeat(101) })).rejects.toThrow(
        'Name cannot exceed 100 characters.'
      );
      await expect(UserService.updateMember('org-1', 'target', { batch: '   ' })).rejects.toThrow(
        'Batch cannot be empty.'
      );
      await expect(UserService.updateMember('org-1', 'target', { batch: 'A', subbatch: 'INVALID' })).rejects.toThrow(
        'Subbatch must be one of A1, A2 for Batch A.'
      );
    });

    it('should validate cohort exists and successfully update member', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'target',
        organization_id: 'org-1',
        roles: [{ role: { name: 'INTERN' } }],
        batch: 'A',
      });

      (prisma.cohort.findFirst as jest.Mock).mockResolvedValueOnce(null);
      await expect(UserService.updateMember('org-1', 'target', { cohort_id: 'missing-c' })).rejects.toThrow(
        'Selected cohort not found in your organization.'
      );

      (prisma.cohort.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'c-valid' });
      (prisma.user.update as jest.Mock).mockResolvedValue({
        id: 'target',
        user_code: 'INT-3333',
        name: 'New Name',
        email: 'intern@example.com',
        batch: 'A',
        subbatch: 'A2',
        cohort_id: 'c-valid',
        cohort: { id: 'c-valid', name: 'Spring' },
        roles: [{ role: { name: 'INTERN' } }],
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const res = await UserService.updateMember('org-1', 'target', {
        name: 'New Name',
        batch: 'A',
        subbatch: 'A2',
        cohort_id: 'c-valid',
      });

      expect(res.name).toBe('New Name');
      expect(res.subbatch).toBe('A2');
      expect(res.cohort_id).toBe('c-valid');
    });
  });

  describe('deleteUsersBulk', () => {
    it('should validate inputs and reject empty userIds or missing managerOrgId', async () => {
      await expect(UserService.deleteUsersBulk('', 'mgr-1', ['u-1'])).rejects.toThrow(
        'Manager organization context required.'
      );
      await expect(UserService.deleteUsersBulk('org-1', 'mgr-1', [])).rejects.toThrow(
        'At least one member ID is required for deletion.'
      );
    });

    it('should prevent manager from deleting own account', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'mgr-1',
          name: 'Manager Self',
          email: 'mgr@example.com',
          roles: [{ role: { name: 'MANAGER' } }],
          owned_projects: [],
          created_forms: [],
          form_submissions: [],
          created_work_items: [],
          time_entries: [],
          work_sessions: [],
        },
      ]);

      const res = await UserService.deleteUsersBulk('org-1', 'mgr-1', ['mgr-1']);
      expect(res.success).toBe(false);
      expect(res.deletedCount).toBe(0);
      expect(res.failedCount).toBe(1);
      expect(res.failures[0].reason).toContain('You cannot delete your own account.');
    });

    it('should reject deleting Super Admin or Admin account by non-superadmin', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'u-super',
          name: 'Root Admin',
          email: 'root@example.com',
          roles: [{ role: { name: 'SUPER_ADMIN' } }],
          owned_projects: [],
          created_forms: [],
          form_submissions: [],
          created_work_items: [],
          time_entries: [],
          work_sessions: [],
        },
        {
          id: 'u-admin',
          name: 'Org Admin',
          email: 'admin@example.com',
          roles: [{ role: { name: 'ADMIN' } }],
          owned_projects: [],
          created_forms: [],
          form_submissions: [],
          created_work_items: [],
          time_entries: [],
          work_sessions: [],
        },
      ]);

      const res = await UserService.deleteUsersBulk(
        'org-1',
        'mgr-1',
        ['u-super', 'u-admin'],
        { roles: [{ role: { name: 'MANAGER' } }] }
      );
      expect(res.success).toBe(false);
      expect(res.failedCount).toBe(2);
      expect(res.failures[0].reason).toContain('Cannot delete Super Admin account.');
      expect(res.failures[1].reason).toContain('Insufficient permissions to delete an administrator account.');
    });

    it('should block deletion of user with logged timesheet records (retention policy)', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'u-intern-timesheet',
          name: 'Timesheet Intern',
          email: 'ts@example.com',
          roles: [{ role: { name: 'INTERN' } }],
          owned_projects: [],
          created_forms: [],
          form_submissions: [],
          created_work_items: [],
          time_entries: [{ id: 'te-1' }],
          work_sessions: [],
        },
      ]);

      const res = await UserService.deleteUsersBulk('org-1', 'mgr-1', ['u-intern-timesheet']);
      expect(res.success).toBe(false);
      expect(res.deletedCount).toBe(0);
      expect(res.failedCount).toBe(1);
      expect(res.failures[0].reason).toContain('data retention policy');
      expect(res.failures[0].reason).toContain('Deactivate the account instead');
    });

    it('should block deletion of user who is primary owner of active project(s)', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'u-lead',
          name: 'Project Lead',
          email: 'lead@example.com',
          roles: [{ role: { name: 'EMPLOYEE' } }],
          owned_projects: [{ id: 'proj-1', name: 'Alpha Project' }],
          created_forms: [],
          form_submissions: [],
          created_work_items: [],
          time_entries: [],
          work_sessions: [],
        },
      ]);

      const res = await UserService.deleteUsersBulk('org-1', 'mgr-1', ['u-lead']);
      expect(res.success).toBe(false);
      expect(res.failedCount).toBe(1);
      expect(res.failures[0].reason).toContain('primary owner of active project(s)');
      expect(res.failures[0].reason).toContain('Alpha Project');
    });

    it('should block deletion of user who created forms or submitted evaluations', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'u-form-creator',
          name: 'Form Creator',
          email: 'fc@example.com',
          roles: [{ role: { name: 'MANAGER' } }],
          owned_projects: [],
          created_forms: [{ id: 'form-1', title: 'Survey' }],
          form_submissions: [],
          created_work_items: [],
          time_entries: [],
          work_sessions: [],
        },
        {
          id: 'u-submitter',
          name: 'Form Submitter',
          email: 'fs@example.com',
          roles: [{ role: { name: 'INTERN' } }],
          owned_projects: [],
          created_forms: [],
          form_submissions: [{ id: 'sub-1' }],
          created_work_items: [],
          time_entries: [],
          work_sessions: [],
        },
      ]);

      const res = await UserService.deleteUsersBulk('org-1', 'mgr-1', ['u-form-creator', 'u-submitter']);
      expect(res.success).toBe(false);
      expect(res.failedCount).toBe(2);
      expect(res.failures[0].reason).toContain('user created forms that must be retained');
      expect(res.failures[1].reason).toContain('user has submitted evaluation forms');
    });

    it('should successfully delete eligible unencumbered members and report partial failures', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'u-safe-1',
          name: 'Safe Intern 1',
          email: 'safe1@example.com',
          roles: [{ role: { name: 'INTERN' } }],
          owned_projects: [],
          created_forms: [],
          form_submissions: [],
          created_work_items: [],
          time_entries: [],
          work_sessions: [],
        },
        {
          id: 'u-blocked',
          name: 'Blocked Intern',
          email: 'blocked@example.com',
          roles: [{ role: { name: 'INTERN' } }],
          owned_projects: [],
          created_forms: [],
          form_submissions: [],
          created_work_items: [],
          time_entries: [{ id: 'te-1' }],
          work_sessions: [],
        },
      ]);

      const mockDelete = jest.fn().mockResolvedValue({ id: 'u-safe-1' });
      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback({
          user: { delete: mockDelete },
        });
      });

      const res = await UserService.deleteUsersBulk('org-1', 'mgr-1', ['u-safe-1', 'u-blocked']);
      expect(res.success).toBe(true);
      expect(res.deletedCount).toBe(1);
      expect(res.failedCount).toBe(1);
      expect(res.deletedIds).toEqual(['u-safe-1']);
      expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'u-safe-1' } });
      expect(res.failures[0].id).toBe('u-blocked');
      expect(res.failures[0].reason).toContain('data retention policy');
    });

    it('should successfully delete all members when all are eligible', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'u-safe-1',
          name: 'Safe Intern 1',
          email: 'safe1@example.com',
          roles: [{ role: { name: 'INTERN' } }],
          owned_projects: [],
          created_forms: [],
          form_submissions: [],
          created_work_items: [],
          time_entries: [],
          work_sessions: [],
        },
        {
          id: 'u-safe-2',
          name: 'Safe Intern 2',
          email: 'safe2@example.com',
          roles: [{ role: { name: 'INTERN' } }],
          owned_projects: [],
          created_forms: [],
          form_submissions: [],
          created_work_items: [],
          time_entries: [],
          work_sessions: [],
        },
      ]);

      const mockDelete = jest.fn();
      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback({
          user: { delete: mockDelete },
        });
      });

      const res = await UserService.deleteUsersBulk('org-1', 'mgr-1', ['u-safe-1', 'u-safe-2']);
      expect(res.success).toBe(true);
      expect(res.deletedCount).toBe(2);
      expect(res.failedCount).toBe(0);
      expect(res.deletedIds).toEqual(['u-safe-1', 'u-safe-2']);
      expect(mockDelete).toHaveBeenCalledTimes(2);
    });
  });
});
