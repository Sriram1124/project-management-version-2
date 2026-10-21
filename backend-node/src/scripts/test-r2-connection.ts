import dotenv from 'dotenv';
dotenv.config();

import { S3Client, HeadBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

async function testR2Connection() {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || 'auto';
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    console.error('ERROR: Missing Cloudflare R2 environment variables in backend-node/.env');
    console.error('Required: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY');
    process.exit(1);
  }

  // Mask sensitive credentials
  const maskedKeyId = accessKeyId.substring(0, 4) + '****' + accessKeyId.slice(-4);
  console.log('Testing Cloudflare R2 S3-Compatible Connection:');
  console.log(`- Endpoint: ${endpoint}`);
  console.log(`- Bucket:   ${bucket}`);
  console.log(`- Key ID:   ${maskedKeyId}`);

  const s3 = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  });

  try {
    // 1. Verify bucket accessibility
    console.log('\n[1/3] Checking bucket access (HeadBucket)...');
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log('  --> Bucket exists and is accessible.');

    // 2. Test write capability using a temporary probe key
    const probeKey = `system-probe-${Date.now()}.txt`;
    console.log(`[2/3] Testing write permission (PutObject: ${probeKey})...`);
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: probeKey,
      Body: 'internhub-storage-canary-test',
      ContentType: 'text/plain',
    }));
    console.log('  --> Write successful.');

    // 3. Test read and cleanup
    console.log(`[3/3] Testing cleanup (DeleteObject: ${probeKey})...`);
    await s3.send(new DeleteObjectCommand({
      Bucket: bucket,
      Key: probeKey,
    }));
    console.log('  --> Cleanup successful.');

    console.log('\nSUCCESS: Cloudflare R2 connection and permissions fully verified!');
    process.exit(0);
  } catch (err: any) {
    console.error('\nFAILURE: Could not verify Cloudflare R2 connection.');
    console.error('Error code:', err.name || err.Code);
    console.error('Error message:', err.message);

    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      console.error('\n--> Diagnosis: The bucket name was not found. Please verify the bucket name in Cloudflare R2.');
    } else if (err.name === 'Forbidden' || err.$metadata?.httpStatusCode === 403) {
      console.error('\n--> Diagnosis: Access denied (HTTP 403). Ensure the R2 API token has Object Read & Write permissions.');
    }

    process.exit(1);
  }
}

testR2Connection().catch((err) => {
  console.error('Unhandled error in testR2Connection:', err);
  process.exit(1);
});
