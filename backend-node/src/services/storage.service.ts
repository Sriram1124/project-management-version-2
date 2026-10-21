import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

export class StorageService {
  static getStorageRoot(): string {
    if (process.env.STORAGE_PATH) {
      const root = path.resolve(process.env.STORAGE_PATH);
      if (!fs.existsSync(root)) {
        fs.mkdirSync(root, { recursive: true });
      }
      return root;
    }

    // In serverless environments (e.g. Vercel, AWS Lambda), process.cwd() (/var/task) is read-only.
    // The only writable directory on the container is os.tmpdir() (/tmp).
    const isServerless = Boolean(
      process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT ||
      (typeof process.cwd === 'function' && process.cwd().startsWith('/var/task'))
    );

    const preferredRoot = isServerless
      ? path.join(os.tmpdir(), 'internhub-storage')
      : path.join(process.cwd(), 'storage');

    try {
      if (!fs.existsSync(preferredRoot)) {
        fs.mkdirSync(preferredRoot, { recursive: true });
      }
      return path.resolve(preferredRoot);
    } catch {
      const fallbackRoot = path.join(os.tmpdir(), 'internhub-storage');
      if (!fs.existsSync(fallbackRoot)) {
        fs.mkdirSync(fallbackRoot, { recursive: true });
      }
      return path.resolve(fallbackRoot);
    }
  }

  /**
   * Save a project document file into persistent storage
   */
  static async saveProjectFile(
    projectId: string,
    originalName: string,
    buffer: Buffer
  ): Promise<{ storageKey: string; filename: string }> {
    const storageRoot = path.resolve(this.getStorageRoot());
    const safeProjectDir = path.resolve(path.join(storageRoot, 'projects', projectId));
    
    // Guard against path traversal before performing filesystem operations
    if (!safeProjectDir.startsWith(storageRoot)) {
      throw new Error('Invalid file storage path');
    }

    if (!fs.existsSync(safeProjectDir)) {
      fs.mkdirSync(safeProjectDir, { recursive: true });
    }

    const ext = path.extname(originalName) || '';
    const baseName = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
    const uniqueId = crypto.randomUUID();
    const generatedFilename = `${uniqueId}-${baseName}${ext}`;
    const targetPath = path.join(safeProjectDir, generatedFilename);

    // Guard against path traversal
    const resolvedPath = path.resolve(targetPath);
    if (!resolvedPath.startsWith(storageRoot)) {
      throw new Error('Invalid file storage path');
    }

    await fs.promises.writeFile(resolvedPath, buffer);

    const storageKey = `projects/${projectId}/${generatedFilename}`;
    return { storageKey, filename: generatedFilename };
  }

  /**
   * Resolve physical file path from storage key
   */
  static getFilePath(storageKey: string, checkExists: boolean = true): string {
    const storageRoot = this.getStorageRoot();
    const resolvedPath = path.resolve(path.join(storageRoot, storageKey));

    if (!resolvedPath.startsWith(storageRoot)) {
      throw new Error('Invalid file path traversal');
    }

    if (checkExists && !fs.existsSync(resolvedPath)) {
      throw new Error('File not found in storage');
    }

    return resolvedPath;
  }

  /**
   * Delete a file from storage if it exists
   */
  static async deleteFile(storageKey: string): Promise<void> {
    if (!storageKey || typeof storageKey !== 'string') return;
    try {
      const filePath = this.getFilePath(storageKey, false);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (e) {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Get standard MIME type from filename/extension
   */
  static getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.csv': 'text/csv',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
      '.zip': 'application/zip',
    };
    return mimeMap[ext] || 'application/octet-stream';
  }
}
