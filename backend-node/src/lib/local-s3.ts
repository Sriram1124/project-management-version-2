import path from 'path';
import fs from 'fs';
import net from 'net';

let activeS3rver: any = null;

function isPortInUse(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(400);

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.once('error', () => {
      resolve(false);
    });

    socket.connect(port, host);
  });
}

export async function ensureLocalS3Service(): Promise<void> {
  const driver = process.env.STORAGE_DRIVER;
  const endpoint = process.env.S3_ENDPOINT || '';

  const isLocalEndpoint =
    driver === 's3' &&
    (endpoint.includes('127.0.0.1:9000') || endpoint.includes('localhost:9000'));

  if (!isLocalEndpoint) {
    return;
  }

  const inUse = await isPortInUse(9000, '127.0.0.1');
  if (inUse) {
    console.log('[ObjectStorage] Local S3-compatible service is already active on port 9000.');
    return;
  }

  try {
    const S3rver = require('s3rver');
    const directory = path.join(process.cwd(), '.s3-local-data');
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    const bucketName = process.env.S3_BUCKET || 'internhub-project-files';

    const s3rver = new S3rver({
      port: 9000,
      address: '127.0.0.1',
      directory,
      silent: true,
      configureBuckets: [
        {
          name: bucketName,
        },
      ],
    });

    await new Promise<void>((resolve, reject) => {
      s3rver.run((err: any) => {
        if (err) {
          if (err.code === 'EADDRINUSE') {
            console.log('[ObjectStorage] Port 9000 in use, continuing.');
            return resolve();
          }
          return reject(err);
        }
        activeS3rver = s3rver;
        console.log(`[ObjectStorage] Auto-started embedded S3 storage service on http://127.0.0.1:9000`);
        resolve();
      });
    });
  } catch (err: any) {
    console.warn('[ObjectStorage] Notice: Could not auto-start embedded S3 server:', err.message);
  }
}

export async function stopLocalS3Service(): Promise<void> {
  if (activeS3rver && typeof activeS3rver.close === 'function') {
    await new Promise<void>((resolve) => {
      activeS3rver.close(() => {
        activeS3rver = null;
        resolve();
      });
    });
  }
}
