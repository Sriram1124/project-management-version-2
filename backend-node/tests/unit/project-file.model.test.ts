import { ProjectFile, IProjectFile } from '../../src/models/project-file.model';

describe('ProjectFile Mongoose Model Unit Tests', () => {
  it('should validate a valid project file schema object', () => {
    const validData = {
      file_id: '11111111-2222-3333-4444-555555555555',
      project_id: 'proj-123',
      organization_id: 'org-456',
      name: 'Architecture Spec.pdf',
      original_name: 'Architecture Spec.pdf',
      document_type: 'pdf',
      mime_type: 'application/pdf',
      file_size_bytes: 1048576,
      storage_provider: 's3',
      storage_key: 'projects/proj-123/file-1/Architecture_Spec.pdf',
      checksum_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      uploaded_by: 'user-789',
      is_archived: false,
    };

    const doc = new ProjectFile(validData);
    const err = doc.validateSync();
    expect(err).toBeUndefined();

    // Check transformation: file_id is exposed as id in JSON
    const json = doc.toJSON() as any;
    expect(json.id).toBe('11111111-2222-3333-4444-555555555555');
    expect(json._id).toBeUndefined();
    expect(json.__v).toBeUndefined();
  });

  it('should reject documents missing required fields', () => {
    const invalidDoc = new ProjectFile({
      name: 'Missing_Fields.pdf',
    });

    const err = invalidDoc.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors['file_id']).toBeDefined();
    expect(err?.errors['project_id']).toBeDefined();
    expect(err?.errors['organization_id']).toBeDefined();
    expect(err?.errors['storage_key']).toBeDefined();
    expect(err?.errors['checksum_sha256']).toBeDefined();
    expect(err?.errors['uploaded_by']).toBeDefined();
  });

  it('should reject negative file_size_bytes', () => {
    const invalidDoc = new ProjectFile({
      file_id: '11111111-2222-3333-4444-555555555555',
      project_id: 'proj-123',
      organization_id: 'org-456',
      name: 'Test.pdf',
      original_name: 'Test.pdf',
      document_type: 'pdf',
      mime_type: 'application/pdf',
      file_size_bytes: -10,
      storage_provider: 's3',
      storage_key: 'projects/proj-123/file-1/Test.pdf',
      checksum_sha256: 'sha-test',
      uploaded_by: 'user-1',
    });

    const err = invalidDoc.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors['file_size_bytes']).toBeDefined();
  });
});
