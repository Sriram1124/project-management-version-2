import fs from 'fs';
import path from 'path';
import os from 'os';
import { StorageService } from '../../src/services/storage.service';

describe('StorageService', () => {
  let tempStorageDir: string;
  const originalEnvStorage = process.env.STORAGE_PATH;

  beforeEach(() => {
    tempStorageDir = path.join(os.tmpdir(), `test-storage-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    process.env.STORAGE_PATH = tempStorageDir;
  });

  afterEach(async () => {
    process.env.STORAGE_PATH = originalEnvStorage;
    try {
      if (fs.existsSync(tempStorageDir)) {
        await fs.promises.rm(tempStorageDir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup errors
    }
  });

  describe('getStorageRoot', () => {
    it('creates and returns the storage root when STORAGE_PATH is configured', () => {
      const root = StorageService.getStorageRoot();
      expect(root).toBe(path.resolve(tempStorageDir));
      expect(fs.existsSync(root)).toBe(true);
    });

    it('falls back to default cwd storage when STORAGE_PATH is unset', () => {
      delete process.env.STORAGE_PATH;
      const root = StorageService.getStorageRoot();
      expect(root).toBe(path.resolve(process.cwd(), 'storage'));
      expect(fs.existsSync(root)).toBe(true);
    });
  });

  describe('saveProjectFile', () => {
    it('saves a file and returns storageKey and unique filename', async () => {
      const buffer = Buffer.from('hello world content');
      const result = await StorageService.saveProjectFile('proj-123', 'my report #1!.pdf', buffer);

      expect(result).toHaveProperty('storageKey');
      expect(result).toHaveProperty('filename');
      expect(result.storageKey).toMatch(/^projects\/proj-123\//);
      expect(result.filename).toMatch(/my_report__1_\.pdf$/);

      const filePath = StorageService.getFilePath(result.storageKey, true);
      const readContent = await fs.promises.readFile(filePath);
      expect(readContent.toString()).toBe('hello world content');
    });

    it('handles files without extensions and filenames longer than 50 chars', async () => {
      const longName = 'a'.repeat(60);
      const result = await StorageService.saveProjectFile('proj-456', longName, Buffer.from('test'));

      expect(result.filename).toMatch(new RegExp(`-${'a'.repeat(50)}$`));
    });

    it('throws error on path traversal attempts in projectId', async () => {
      await expect(
        StorageService.saveProjectFile('../../../etc', 'exploit.txt', Buffer.from('danger'))
      ).rejects.toThrow('Invalid file storage path');
    });
  });

  describe('getFilePath', () => {
    it('throws error on directory traversal', () => {
      expect(() => {
        StorageService.getFilePath('../../../outside.txt', false);
      }).toThrow('Invalid file path traversal');
    });

    it('throws error when checkExists is true and file is missing', () => {
      expect(() => {
        StorageService.getFilePath('projects/proj-123/non-existent.pdf', true);
      }).toThrow('File not found in storage');
    });

    it('returns path without error when checkExists is false even if file does not exist', () => {
      const p = StorageService.getFilePath('projects/proj-123/non-existent.pdf', false);
      expect(p).toContain(path.join('projects', 'proj-123', 'non-existent.pdf'));
    });

    it('returns resolved path using default checkExists=true when file exists', async () => {
      const saved = await StorageService.saveProjectFile('proj-default', 'exists.txt', Buffer.from('data'));
      const resolved = StorageService.getFilePath(saved.storageKey);
      expect(resolved).toBeTruthy();
    });
  });

  describe('deleteFile', () => {
    it('silently ignores empty or non-string storageKey', async () => {
      await expect(StorageService.deleteFile('')).resolves.toBeUndefined();
      await expect(StorageService.deleteFile(null as any)).resolves.toBeUndefined();
    });

    it('handles deleting a file that does not exist on disk', async () => {
      await expect(StorageService.deleteFile('projects/proj-del/missing-file.txt')).resolves.toBeUndefined();
    });

    it('deletes an existing file successfully', async () => {
      const saved = await StorageService.saveProjectFile('proj-del', 'delete-me.txt', Buffer.from('data'));
      const fullPath = StorageService.getFilePath(saved.storageKey, true);
      expect(fs.existsSync(fullPath)).toBe(true);

      await StorageService.deleteFile(saved.storageKey);
      expect(fs.existsSync(fullPath)).toBe(false);
    });

    it('handles delete errors gracefully without rethrowing', async () => {
      jest.spyOn(StorageService, 'getFilePath').mockImplementationOnce(() => {
        throw new Error('Disk failure');
      });
      await expect(StorageService.deleteFile('projects/proj-del/some-key.txt')).resolves.toBeUndefined();
    });
  });

  describe('getMimeType', () => {
    it('correctly maps known extensions to MIME types', () => {
      expect(StorageService.getMimeType('image.png')).toBe('image/png');
      expect(StorageService.getMimeType('photo.jpg')).toBe('image/jpeg');
      expect(StorageService.getMimeType('photo.jpeg')).toBe('image/jpeg');
      expect(StorageService.getMimeType('anim.gif')).toBe('image/gif');
      expect(StorageService.getMimeType('modern.webp')).toBe('image/webp');
      expect(StorageService.getMimeType('vector.svg')).toBe('image/svg+xml');
      expect(StorageService.getMimeType('doc.pdf')).toBe('application/pdf');
      expect(StorageService.getMimeType('notes.txt')).toBe('text/plain');
      expect(StorageService.getMimeType('data.json')).toBe('application/json');
      expect(StorageService.getMimeType('sheet.csv')).toBe('text/csv');
      expect(StorageService.getMimeType('table.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(StorageService.getMimeType('old.xls')).toBe('application/vnd.ms-excel');
      expect(StorageService.getMimeType('word.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(StorageService.getMimeType('word.doc')).toBe('application/msword');
      expect(StorageService.getMimeType('archive.zip')).toBe('application/zip');
    });

    it('falls back to application/octet-stream for unknown or missing extensions', () => {
      expect(StorageService.getMimeType('binary.unknown')).toBe('application/octet-stream');
      expect(StorageService.getMimeType('no_extension')).toBe('application/octet-stream');
    });
  });
});

