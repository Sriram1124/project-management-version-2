import S3rver from 's3rver';
import path from 'path';
import fs from 'fs';

const directory = path.join(process.cwd(), '.s3-local-data');
if (!fs.existsSync(directory)) {
  fs.mkdirSync(directory, { recursive: true });
}

const s3rver = new S3rver({
  port: 9000,
  address: '127.0.0.1',
  directory,
  silent: false,
  configureBuckets: [
    {
      name: 'internhub-project-files',
    },
  ],
});

s3rver.run((err: any, info: any) => {
  if (err) {
    console.error('Failed to start S3rver:', err);
    process.exit(1);
  }
  const address = info?.address || '127.0.0.1';
  const port = info?.port || 9000;
  console.log(`Local S3-compatible service is listening on http://${address}:${port}`);
  console.log(`Bucket initialized: internhub-project-files`);
});
