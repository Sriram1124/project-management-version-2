import request from 'supertest';
import app from '../../src/app';
import { mockPrisma, mockEntity } from '../mocks/prisma.mock';
import { setupAuthUser } from '../helpers/auth.helper';
import { ProjectFile } from '../../src/models/project-file.model';
import { ObjectStorageService } from '../../src/services/object-storage.service';
import { connectMongoDB, disconnectMongoDB } from '../../src/lib/mongodb';

describe('Bi-Directional Cutover & Safe Rollback Demonstration', () => {
  const mockProject = {
    id: 'proj-rollback-demo',
    name: 'Rollback Canary Project',
    methodology: 'SCRUM',
    status: 'ACTIVE',
    owner_id: 'user-manager',
    organization_id: 'org-test-1',
    created_at: new Date(),
    updated_at: new Date(),
    owner: { id: 'user-manager', name: 'Manager' },
    members: [],
  };

  beforeAll(async () => {
    ObjectStorageService.initialize();
    await connectMongoDB();
  });

  afterAll(async () => {
    await ProjectFile.deleteMany({ project_id: 'proj-rollback-demo' }).catch(() => {});
    await disconnectMongoDB().catch(() => {});
  });

  beforeEach(() => {
    mockEntity('project', mockProject);
  });

  it('demonstrates safe zero-write-loss rollback after post-cutover operations', async () => {
    const { authHeader } = setupAuthUser({
      role: 'MANAGER',
      organization_id: 'org-test-1',
      permissions: ['PROJECT_READ', 'PROJECT_UPDATE', 'DOCUMENT_UPLOAD'],
    });

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 1: Cutover is active (Reads from MongoDB, Reverse Sync to PostgreSQL ON)
    // ──────────────────────────────────────────────────────────────────────────
    process.env.ENABLE_MONGODB_PROJECT_FILES = 'true';
    process.env.REVERSE_SYNC_TO_POSTGRES = 'true';

    const testPayload = 'Critical contract uploaded after cutover';

    const uploadRes = await request(app)
      .post('/api/projects/proj-rollback-demo/documents')
      .set('Authorization', authHeader)
      .attach('file', Buffer.from(testPayload), 'Post_Cutover_Contract.pdf');

    expect(uploadRes.status).toBe(201);
    const newDocId = uploadRes.body.id;
    expect(newDocId).toBeDefined();

    // Verify reverse-sync to PostgreSQL occurred
    expect(mockPrisma.projectDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: newDocId,
          name: expect.stringContaining('Post_Cutover_Contract'),
        }),
      })
    );

    // Verify file exists in MongoDB
    const inMongo = await ProjectFile.findOne({ file_id: newDocId });
    expect(inMongo).toBeDefined();

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 2: Emergency Rollback Triggered (Feature Flag Flipped to FALSE)
    // ──────────────────────────────────────────────────────────────────────────
    process.env.ENABLE_MONGODB_PROJECT_FILES = 'false';

    // Mock PostgreSQL returning the reverse-synced record
    mockPrisma.projectDocument.findFirst.mockResolvedValueOnce({
      id: newDocId,
      project_id: 'proj-rollback-demo',
      name: inMongo!.name,
      document_type: 'pdf',
      storage_key: inMongo!.storage_key,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Verify read request to PostgreSQL succeeds and streams the S3 binary
    const binaryParser = (res: any, cb: any) => {
      res.setEncoding('binary');
      let d = '';
      res.on('data', (c: string) => (d += c));
      res.on('end', () => cb(null, Buffer.from(d, 'binary')));
    };

    const downloadRes = await request(app)
      .get(`/api/projects/proj-rollback-demo/documents/${newDocId}/download`)
      .set('Authorization', authHeader)
      .buffer(true)
      .parse(binaryParser);

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-disposition']).toContain('attachment');
    expect(downloadRes.body.toString('utf-8')).toBe(testPayload);

    // Conclusion: Zero post-cutover data was lost upon rollback!
  });
});
