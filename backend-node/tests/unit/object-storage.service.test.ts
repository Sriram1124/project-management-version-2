import { ObjectStorageService } from '../../src/services/object-storage.service';
import { Readable } from 'stream';
import S3rver from 's3rver';
import path from 'path';
import fs from 'fs';

describe('ObjectStorageService Unit Tests', () => {
  let s3ServerInstance: any = null;
  const testS3Dir = path.join(process.cwd(), '.s3-test-data');

  beforeAll(async () => {
    if (!fs.existsSync(testS3Dir)) {
      fs.mkdirSync(testS3Dir, { recursive: true });
    }

    s3ServerInstance = new S3rver({
      port: 9000,
      address: '127.0.0.1',
      directory: testS3Dir,
      silent: true,
      configureBuckets: [
        {
          name: 'internhub-project-files',
        },
      ],
    });

    await new Promise<void>((resolve, reject) => {
      s3ServerInstance.run((err: any) => {
        if (err) {
          if (err.code === 'EADDRINUSE') {
            return resolve();
          }
          return reject(err);
        }
        resolve();
      });
    });

    process.env.STORAGE_DRIVER = 's3';
    process.env.S3_ENDPOINT = 'http://127.0.0.1:9000';
    process.env.S3_REGION = 'us-east-1';
    process.env.S3_BUCKET = 'internhub-project-files';
    process.env.S3_ACCESS_KEY_ID = 'S3RVER';
    process.env.S3_SECRET_ACCESS_KEY = 'S3RVER';
    process.env.S3_FORCE_PATH_STYLE = 'true';

    ObjectStorageService.initialize();
  });

  afterAll(async () => {
    if (s3ServerInstance) {
      await new Promise<void>((resolve) => {
        s3ServerInstance.close(() => resolve());
      });
    }
    try {
      fs.rmSync(testS3Dir, { recursive: true, force: true });
    } catch {}
  });

  describe('sanitizeFilename', () => {
    it('should sanitize unsafe characters and keep valid extension', () => {
      const result = ObjectStorageService.sanitizeFilename('my report (draft #1) [final]!.pdf');
      expect(result.sanitized).toMatch(/my_report__draft__1___final__\.pdf/);
      expect(result.ext).toBe('pdf');
    });

    it('should reject prohibited executable extensions', () => {
      expect(() => {
        ObjectStorageService.sanitizeFilename('malware.exe');
      }).toThrow(/prohibited for security reasons/);

      expect(() => {
        ObjectStorageService.sanitizeFilename('script.sh');
      }).toThrow(/prohibited for security reasons/);

      expect(() => {
        ObjectStorageService.sanitizeFilename('payload.bat');
      }).toThrow(/prohibited for security reasons/);
    });
  });

  describe('generateStorageKey', () => {
    it('should generate an immutable storage key format', () => {
      const key = ObjectStorageService.generateStorageKey('proj-uuid-123', 'document.pdf');
      expect(key).toMatch(/^projects\/proj-uuid-123\/[a-f0-9-]+\/document\.pdf$/);
    });

    it('should reject directory traversal in projectId', () => {
      expect(() => {
        ObjectStorageService.generateStorageKey('../../etc', 'document.pdf');
      }).toThrow('Invalid projectId format.');
    });
  });

  describe('S3 Storage Operations (Local S3 Endpoint)', () => {
    const testContent = 'InternHub S3 Integration Test Document Content';
    const testBuffer = Buffer.from(testContent);
    let uploadedKey: string;

    it('should upload a buffer and return storage metadata and SHA-256', async () => {
      const result = await ObjectStorageService.uploadBuffer(
        'test-project-101',
        'test-spec.txt',
        testBuffer,
        'text/plain'
      );

      expect(result).toHaveProperty('storageKey');
      expect(result).toHaveProperty('checksumSha256');
      expect(result.byteLength).toBe(testBuffer.length);
      expect(result.mimeType).toBe('text/plain');
      expect(result.storageKey).toContain('projects/test-project-101/');

      uploadedKey = result.storageKey;
    });

    it('should verify uploaded object exists via headObject', async () => {
      const head = await ObjectStorageService.headObject(uploadedKey);
      expect(head.exists).toBe(true);
      expect(head.size).toBe(testBuffer.length);
    });

    it('should stream object content back and match original data', async () => {
      const download = await ObjectStorageService.getReadStream(uploadedKey);
      expect(download.stream).toBeDefined();

      const chunks: Buffer[] = [];
      for await (const chunk of download.stream) {
        chunks.push(Buffer.from(chunk));
      }
      const downloadedString = Buffer.concat(chunks).toString('utf-8');
      expect(downloadedString).toBe(testContent);
    });

    it('should delete object idempotently', async () => {
      await ObjectStorageService.deleteObject(uploadedKey);

      const head = await ObjectStorageService.headObject(uploadedKey);
      expect(head.exists).toBe(false);

      // Deleting again should not throw
      await expect(ObjectStorageService.deleteObject(uploadedKey)).resolves.not.toThrow();
    });

    it('should throw 404 for non-existent objects on getReadStream', async () => {
      await expect(
        ObjectStorageService.getReadStream('projects/test-project-101/non-existent-file.pdf')
      ).rejects.toThrow(/Object not found in storage/);
    });
  });
});
