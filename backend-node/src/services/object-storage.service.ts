import crypto from 'crypto';
import path from 'path';
import { Readable, PassThrough } from 'stream';
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

// Safe CommonJS resolution for file-type
let fileTypeFromBufferFn: ((buffer: Uint8Array | ArrayBuffer) => Promise<{ ext: string; mime: string } | undefined>) | null = null;
try {
  const ft = require('file-type');
  fileTypeFromBufferFn = ft.fileTypeFromBuffer;
} catch {
  // Fallback
}

export interface StorageUploadResult {
  storageKey: string;
  checksumSha256: string;
  byteLength: number;
  mimeType: string;
  sanitizedFilename: string;
}

export interface StorageDownloadResult {
  stream: Readable;
  contentType: string;
  contentLength?: number;
  contentDisposition?: string;
}

export class ObjectStorageService {
  private static client: S3Client | null = null;
  private static bucketName: string = '';

  private static BLOCKED_EXTENSIONS = new Set([
    'exe', 'bat', 'cmd', 'sh', 'vbs', 'ps1', 'js', 'jar', 'scr', 'com', 'msi', 'pif', 'hta', 'cpl',
  ]);

  public static initialize(): void {
    if (this.client) return;

    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION || 'auto';
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    const bucket = process.env.S3_BUCKET || 'internhub-project-files';
    const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error('[ObjectStorage] Missing S3 environment configuration (S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY).');
    }

    this.bucketName = bucket;
    this.client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle,
    });
  }

  public static getClient(): S3Client {
    if (!this.client) {
      this.initialize();
    }
    return this.client!;
  }

  public static getBucket(): string {
    if (!this.bucketName) {
      this.initialize();
    }
    return this.bucketName;
  }

  /**
   * Sanitizes a user-supplied filename to prevent path traversal or unsafe characters.
   */
  public static sanitizeFilename(originalName: string): { sanitized: string; ext: string } {
    const parsed = path.parse(originalName);
    const ext = parsed.ext.replace(/^\./, '').toLowerCase();

    if (this.BLOCKED_EXTENSIONS.has(ext)) {
      throw new Error(`File type '.${ext}' is prohibited for security reasons.`);
    }

    const cleanBase = parsed.name
      .replace(/[^a-zA-Z0-9_\-\.]/g, '_')
      .substring(0, 80);

    const sanitized = ext ? `${cleanBase}.${ext}` : cleanBase;
    return { sanitized, ext: ext || 'bin' };
  }

  /**
   * Generates an immutable, collision-resistant storage key.
   */
  public static generateStorageKey(projectId: string, sanitizedFilename: string): string {
    // Validate project ID format
    if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
      throw new Error('Invalid projectId format.');
    }

    const uniqueId = crypto.randomUUID();
    return `projects/${projectId}/${uniqueId}/${sanitizedFilename}`;
  }

  /**
   * Inspects the initial bytes of a buffer to verify magic numbers against declared MIME type.
   */
  public static async validateFileContent(
    initialBuffer: Buffer,
    declaredMime: string,
    fileExt: string
  ): Promise<{ detectedMime: string; isValid: boolean }> {
    let detectedMime = declaredMime;
    if (fileTypeFromBufferFn) {
      const detected = await fileTypeFromBufferFn(initialBuffer);
      if (detected) {
        detectedMime = detected.mime;
      }
    }

    // Disallow dangerous executables even if disguised
    if (
      detectedMime === 'application/x-msdownload' ||
      detectedMime === 'application/x-executable' ||
      detectedMime === 'application/x-dosexec'
    ) {
      return { detectedMime, isValid: false };
    }

    return { detectedMime: detectedMime || 'application/octet-stream', isValid: true };
  }

  /**
   * Uploads a readable stream to S3 with on-the-fly SHA-256 calculation and chunked memory control.
   */
  public static async uploadStream(
    projectId: string,
    originalName: string,
    sourceStream: Readable,
    declaredMime: string,
    maxSizeBytes: number = 50 * 1024 * 1024 // 50MB default
  ): Promise<StorageUploadResult> {
    const s3 = this.getClient();
    const bucket = this.getBucket();

    const { sanitized, ext } = this.sanitizeFilename(originalName);
    const storageKey = this.generateStorageKey(projectId, sanitized);

    const hash = crypto.createHash('sha256');
    let totalBytes = 0;
    let initialChunk: Buffer | null = null;
    let detectedMime = declaredMime;

    // Pass-through stream that pipes chunks to hash and monitors total size
    const passThrough = new PassThrough();

    sourceStream.on('data', async (chunk: Buffer) => {
      totalBytes += chunk.length;

      if (totalBytes > maxSizeBytes) {
        sourceStream.destroy(new Error(`File size exceeds maximum allowed limit of ${maxSizeBytes / (1024 * 1024)}MB.`));
        return;
      }

      hash.update(chunk);

      if (!initialChunk) {
        initialChunk = chunk.slice(0, 4100);
      }
    });

    sourceStream.pipe(passThrough);

    // Bounded multipart uploader (5MB parts)
    const parallelUpload = new Upload({
      client: s3,
      params: {
        Bucket: bucket,
        Key: storageKey,
        Body: passThrough,
        ContentType: declaredMime || 'application/octet-stream',
      },
      partSize: 5 * 1024 * 1024, // 5MB chunk buffer
      queueSize: 4,              // Concurrent part uploads
      leavePartsOnError: false,  // Abort multipart upload on error
    });

    try {
      await parallelUpload.done();

      // Validate magic bytes if initial chunk was captured
      if (initialChunk) {
        const validation = await this.validateFileContent(initialChunk, declaredMime, ext);
        if (!validation.isValid) {
          // Compensating action: delete object immediately
          await this.deleteObject(storageKey);
          throw new Error('File content signature rejected: executable content detected.');
        }
        detectedMime = validation.detectedMime;
      }

      const checksumSha256 = hash.digest('hex');

      return {
        storageKey,
        checksumSha256,
        byteLength: totalBytes,
        mimeType: detectedMime,
        sanitizedFilename: sanitized,
      };
    } catch (err: any) {
      // Ensure any partially staged object is cleaned up
      await this.deleteObject(storageKey).catch(() => {});
      throw err;
    }
  }

  /**
   * Uploads a Buffer directly to S3 (useful for smaller files or test fixtures).
   */
  public static async uploadBuffer(
    projectId: string,
    originalName: string,
    buffer: Buffer,
    declaredMime: string
  ): Promise<StorageUploadResult> {
    const readable = Readable.from(buffer);
    return this.uploadStream(projectId, originalName, readable, declaredMime, buffer.length + 1024);
  }

  /**
   * Streams a file from S3.
   */
  public static async getReadStream(storageKey: string): Promise<StorageDownloadResult> {
    const s3 = this.getClient();
    const bucket = this.getBucket();

    // Verify key format
    if (storageKey.includes('..')) {
      throw new Error('Invalid storage key: directory traversal detected.');
    }

    try {
      const response = await s3.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: storageKey,
        })
      );

      if (!response.Body) {
        throw new Error('S3 object body is empty.');
      }

      return {
        stream: response.Body as Readable,
        contentType: response.ContentType || 'application/octet-stream',
        contentLength: response.ContentLength,
        contentDisposition: response.ContentDisposition,
      };
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        const notFoundErr = new Error(`Object not found in storage: ${storageKey}`);
        (notFoundErr as any).statusCode = 404;
        throw notFoundErr;
      }
      throw err;
    }
  }

  /**
   * Checks whether an object exists in S3 and returns its metadata.
   */
  public static async headObject(storageKey: string): Promise<{ exists: boolean; size?: number; contentType?: string }> {
    const s3 = this.getClient();
    const bucket = this.getBucket();

    try {
      const response = await s3.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: storageKey,
        })
      );

      return {
        exists: true,
        size: response.ContentLength,
        contentType: response.ContentType,
      };
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return { exists: false };
      }
      throw err;
    }
  }

  /**
   * Deletes an object from S3 idempotently.
   */
  public static async deleteObject(storageKey: string): Promise<void> {
    if (!storageKey || typeof storageKey !== 'string') return;

    const s3 = this.getClient();
    const bucket = this.getBucket();

    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: storageKey,
        })
      );
    } catch (err: any) {
      // Idempotent: log warning but do not crash on already-deleted keys
      console.warn(`[ObjectStorage] Warning: Failed to delete key '${storageKey}':`, err.message);
    }
  }

  /**
   * Verifies the S3 bucket health.
   */
  public static async checkHealth(): Promise<boolean> {
    try {
      const s3 = this.getClient();
      const bucket = this.getBucket();
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
      return true;
    } catch {
      return false;
    }
  }
}
