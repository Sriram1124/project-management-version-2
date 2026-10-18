import request from 'supertest';
import app from '../../src/app';
import { mockPrisma, mockEntity } from '../mocks/prisma.mock';
import { setupAuthUser } from '../helpers/auth.helper';
import { ObjectStorageService } from '../../src/services/object-storage.service';
import { ProjectFile } from '../../src/models/project-file.model';
import { connectMongoDB, disconnectMongoDB } from '../../src/lib/mongodb';

describe('Project Files Migration Integration Tests (MongoDB + S3)', () => {
  const originalEnvMongo = process.env.ENABLE_MONGODB_PROJECT_FILES;
  const originalEnvReverse = process.env.REVERSE_SYNC_TO_POSTGRES;

  const mockProject = {
    id: 'proj-mig-100',
    name: 'Migration Test Project',
    description: 'Testing MongoDB Files Migration',
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
    process.env.ENABLE_MONGODB_PROJECT_FILES = 'true';
    process.env.REVERSE_SYNC_TO_POSTGRES = 'true';
    process.env.STORAGE_DRIVER = 's3';
    process.env.S3_ENDPOINT = 'http://127.0.0.1:9000';
    process.env.S3_REGION = 'us-east-1';
    process.env.S3_BUCKET = 'internhub-project-files';
    process.env.S3_ACCESS_KEY_ID = 'S3RVER';
    process.env.S3_SECRET_ACCESS_KEY = 'S3RVER';
    process.env.S3_FORCE_PATH_STYLE = 'true';

    ObjectStorageService.initialize();
    await connectMongoDB();
  });

  afterAll(async () => {
    process.env.ENABLE_MONGODB_PROJECT_FILES = originalEnvMongo;
    process.env.REVERSE_SYNC_TO_POSTGRES = originalEnvReverse;
    // Clean up any test records in MongoDB
    await ProjectFile.deleteMany({ project_id: 'proj-mig-100' }).catch(() => {});
    await disconnectMongoDB().catch(() => {});
  });

  beforeEach(() => {
    mockEntity('project', mockProject);
  });

  it('T-01: should upload a file via multipart form-data to S3 and store metadata in MongoDB', async () => {
    const { authHeader } = setupAuthUser({
      role: 'MANAGER',
      organization_id: 'org-test-1',
      permissions: ['PROJECT_UPDATE', 'DOCUMENT_UPLOAD'],
    });

    const fileContent = 'Sample Document Content For Migration Test';

    const res = await request(app)
      .post('/api/projects/proj-mig-100/documents')
      .set('Authorization', authHeader)
      .attach('file', Buffer.from(fileContent), 'Design_Document.pdf');

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toContain('Design_Document.pdf');
    expect(res.body.storage_key).toContain('projects/proj-mig-100/');
    expect(res.body).toHaveProperty('checksum_sha256');

    // Verify metadata was stored in MongoDB
    const mongoDoc = await ProjectFile.findOne({ file_id: res.body.id });
    expect(mongoDoc).toBeDefined();
    expect(mongoDoc?.name).toContain('Design_Document.pdf');
    expect(mongoDoc?.file_size_bytes).toBe(Buffer.from(fileContent).length);

    // Verify binary was stored in S3
    const head = await ObjectStorageService.headObject(res.body.storage_key);
    expect(head.exists).toBe(true);
  });

  it('T-02: should list documents from MongoDB matching frontend contract', async () => {
    const { authHeader } = setupAuthUser({
      role: 'MANAGER',
      organization_id: 'org-test-1',
      permissions: ['PROJECT_READ'],
    });

    const res = await request(app)
      .get('/api/projects/proj-mig-100/documents')
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('documents');
    expect(Array.isArray(res.body.documents)).toBe(true);
    expect(res.body.documents.length).toBeGreaterThan(0);
    expect(res.body.documents[0]).toHaveProperty('id');
    expect(res.body.documents[0]).toHaveProperty('name');
    expect(res.body.documents[0]).toHaveProperty('storage_key');
  });

  const binaryParser = (res: any, callback: (err: Error | null, body: Buffer) => void) => {
    res.setEncoding('binary');
    let data = '';
    res.on('data', (chunk: string) => {
      data += chunk;
    });
    res.on('end', () => {
      callback(null, Buffer.from(data, 'binary'));
    });
  };

  it('T-03: should stream file content inline for preview with correct headers', async () => {
    const { authHeader } = setupAuthUser({
      role: 'MANAGER',
      organization_id: 'org-test-1',
      permissions: ['PROJECT_READ'],
    });

    const mongoDoc = await ProjectFile.findOne({ project_id: 'proj-mig-100' });
    expect(mongoDoc).toBeDefined();

    const res = await request(app)
      .get(`/api/projects/proj-mig-100/documents/${mongoDoc?.file_id}/preview`)
      .set('Authorization', authHeader)
      .buffer(true)
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('inline');
    expect(res.body.toString('utf-8')).toBe('Sample Document Content For Migration Test');
  });

  it('T-04: should stream file content as attachment for download with correct headers', async () => {
    const { authHeader } = setupAuthUser({
      role: 'MANAGER',
      organization_id: 'org-test-1',
      permissions: ['PROJECT_READ'],
    });

    const mongoDoc = await ProjectFile.findOne({ project_id: 'proj-mig-100' });
    expect(mongoDoc).toBeDefined();

    const res = await request(app)
      .get(`/api/projects/proj-mig-100/documents/${mongoDoc?.file_id}/download`)
      .set('Authorization', authHeader)
      .buffer(true)
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.body.toString('utf-8')).toBe('Sample Document Content For Migration Test');
  });

  it('T-05: should rename document in MongoDB and maintain S3 object', async () => {
    const { authHeader } = setupAuthUser({
      role: 'MANAGER',
      organization_id: 'org-test-1',
      permissions: ['PROJECT_UPDATE'],
    });

    const mongoDoc = await ProjectFile.findOne({ project_id: 'proj-mig-100' });
    expect(mongoDoc).toBeDefined();

    const res = await request(app)
      .patch(`/api/projects/proj-mig-100/documents/${mongoDoc?.file_id}`)
      .set('Authorization', authHeader)
      .send({ name: 'Architecture_Specification_V2.pdf' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Architecture_Specification_V2.pdf');

    const updatedMongo = await ProjectFile.findOne({ file_id: mongoDoc?.file_id });
    expect(updatedMongo?.name).toBe('Architecture_Specification_V2.pdf');
  });

  it('T-06: should delete document from MongoDB and purge object from S3', async () => {
    const { authHeader } = setupAuthUser({
      role: 'MANAGER',
      organization_id: 'org-test-1',
      permissions: ['DOCUMENT_DELETE', 'PROJECT_UPDATE'],
    });

    const mongoDoc = await ProjectFile.findOne({ project_id: 'proj-mig-100' });
    expect(mongoDoc).toBeDefined();
    const storageKey = mongoDoc?.storage_key!;

    const res = await request(app)
      .delete(`/api/projects/proj-mig-100/documents/${mongoDoc?.file_id}`)
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify deleted from MongoDB
    const deletedMongo = await ProjectFile.findOne({ file_id: mongoDoc?.file_id });
    expect(deletedMongo).toBeNull();

    // Verify deleted from S3
    const head = await ObjectStorageService.headObject(storageKey);
    expect(head.exists).toBe(false);
  });

  it('T-07: should return HTTP 404 for missing document with no dummy file creation', async () => {
    const { authHeader } = setupAuthUser({
      role: 'MANAGER',
      organization_id: 'org-test-1',
      permissions: ['PROJECT_READ'],
    });

    const res = await request(app)
      .get('/api/projects/proj-mig-100/documents/non-existent-doc-id/download')
      .set('Authorization', authHeader);

    expect(res.status).toBe(404);
  });

  it('T-08: should enforce cross-organization tenant isolation', async () => {
    const { authHeader } = setupAuthUser({
      role: 'MANAGER',
      organization_id: 'org-other-foreign',
      permissions: ['PROJECT_READ'],
    });

    // Mock project belongs to org-test-1, foreign user belongs to org-other-foreign
    mockPrisma.project.findFirst.mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/projects/proj-mig-100/documents')
      .set('Authorization', authHeader);

    expect(res.status).toBe(404); // Scoped findFirst returns null -> 404 Project not found
  });
});
