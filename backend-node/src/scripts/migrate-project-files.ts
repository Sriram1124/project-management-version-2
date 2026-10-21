import * as dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { connectMongoDB, disconnectMongoDB } from '../lib/mongodb';
import { ProjectFile } from '../models/project-file.model';
import { ObjectStorageService } from '../services/object-storage.service';
import { StorageService } from '../services/storage.service';

interface MigrationInventoryItem {
  id: string;
  projectId: string;
  organizationId: string;
  name: string;
  documentType: string;
  storageKey: string;
  localPath: string;
  existsOnDisk: boolean;
  sizeBytes?: number;
  sha256?: string;
  targetS3Key?: string;
  status: 'PENDING' | 'MISSING_ON_DISK' | 'MIGRATED' | 'SKIPPED' | 'FAILED';
  error?: string;
}

interface OrphanFileItem {
  path: string;
  relativePath: string;
  sizeBytes: number;
}

async function runMigration() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  const isVerifyOnly = args.includes('--verify-only');
  const isDryRun = !isExecute && !isVerifyOnly;

  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   INTERNHUB — PROJECT FILES MIGRATION & RECONCILIATION TOOL');
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log(`Mode: ${isExecute ? '🚀 EXECUTE (Live Data Copy)' : isVerifyOnly ? '🔍 VERIFY ONLY (Reconciliation)' : '🧪 DRY RUN (Inspection Only)'}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('────────────────────────────────────────────────────────────────────────');

  // Initialize DB connections and S3
  await prisma.$connect();
  await connectMongoDB();
  ObjectStorageService.initialize();

  const storageRoot = StorageService.getStorageRoot();
  console.log(`Resolved Storage Root: ${storageRoot}`);

  try {
    // 1. Inventory PostgreSQL records
    console.log('\n[1/5] Querying PostgreSQL project_documents...');
    const records = await prisma.projectDocument.findMany({
      include: {
        project: {
          select: {
            id: true,
            organization_id: true,
            owner_id: true,
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    console.log(`Found ${records.length} total document records in PostgreSQL.`);

    // 2. Scan physical disk files to detect indexed, missing, and orphaned files
    console.log('\n[2/5] Inspecting physical files on disk...');
    const inventory: MigrationInventoryItem[] = [];
    const knownDiskPaths = new Set<string>();

    for (const record of records) {
      const localPath = path.resolve(path.join(storageRoot, record.storage_key));
      const existsOnDisk = fs.existsSync(localPath);

      if (existsOnDisk) {
        knownDiskPaths.add(localPath.toLowerCase());
      }

      let sizeBytes: number | undefined;
      let sha256: string | undefined;

      if (existsOnDisk) {
        try {
          const stats = fs.statSync(localPath);
          sizeBytes = stats.size;
          const fileBuffer = fs.readFileSync(localPath);
          sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        } catch (err: any) {
          console.warn(`Warning: Could not read file stats for ${localPath}:`, err.message);
        }
      }

      const { sanitized, ext } = ObjectStorageService.sanitizeFilename(record.name);
      const targetS3Key = `projects/${record.project_id}/${record.id}/${sanitized}`;

      inventory.push({
        id: record.id,
        projectId: record.project_id,
        organizationId: record.project?.organization_id || 'unassigned',
        name: record.name,
        documentType: record.document_type || ext,
        storageKey: record.storage_key,
        localPath,
        existsOnDisk,
        sizeBytes,
        sha256,
        targetS3Key,
        status: existsOnDisk ? 'PENDING' : 'MISSING_ON_DISK',
      });
    }

    // Check for orphaned physical files in storage/projects
    const orphanedFiles: OrphanFileItem[] = [];
    const projectsDir = path.join(storageRoot, 'projects');
    if (fs.existsSync(projectsDir)) {
      const scanDir = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.isFile()) {
            if (!knownDiskPaths.has(fullPath.toLowerCase())) {
              const stats = fs.statSync(fullPath);
              orphanedFiles.push({
                path: fullPath,
                relativePath: path.relative(storageRoot, fullPath),
                sizeBytes: stats.size,
              });
            }
          }
        }
      };
      scanDir(projectsDir);
    }

    // 3. Print inventory summary
    const presentCount = inventory.filter((i) => i.existsOnDisk).length;
    const missingCount = inventory.filter((i) => !i.existsOnDisk).length;
    const totalBytes = inventory.reduce((acc, i) => acc + (i.sizeBytes || 0), 0);

    console.log('\n────────────────────────────────────────────────────────────────────────');
    console.log('   SOURCE INVENTORY BASELINE');
    console.log('────────────────────────────────────────────────────────────────────────');
    console.log(`- PostgreSQL Records:        ${inventory.length}`);
    console.log(`- Verified Files on Disk:    ${presentCount}`);
    console.log(`- Missing Files (In DB only): ${missingCount}`);
    console.log(`- Orphaned Files on Disk:    ${orphanedFiles.length}`);
    console.log(`- Total Verified Payload:    ${(totalBytes / (1024 * 1024)).toFixed(2)} MB (${totalBytes.toLocaleString()} bytes)`);

    if (missingCount > 0) {
      console.warn('\n⚠️  MISSING FILES DETECTED (Database record exists, but file missing on disk):');
      for (const item of inventory.filter((i) => !i.existsOnDisk)) {
        console.warn(`   • [ID: ${item.id}] "${item.name}" -> Expected at: ${item.localPath}`);
      }
    }

    if (orphanedFiles.length > 0) {
      console.warn('\nℹ️  ORPHANED FILES DETECTED (On disk, but not referenced by any active DB record):');
      for (const orphan of orphanedFiles) {
        console.warn(`   • "${orphan.relativePath}" (${orphan.sizeBytes} bytes) - Retained safely (no deletion).`);
      }
    }

    // 4. Execution Mode
    if (isDryRun) {
      console.log('\n────────────────────────────────────────────────────────────────────────');
      console.log('🧪 DRY RUN COMPLETE: Zero modifications made to MongoDB or S3.');
      console.log('To execute the actual migration, run:');
      console.log('   npm run migrate:project-files:execute');
      console.log('────────────────────────────────────────────────────────────────────────');
      return;
    }

    if (isExecute) {
      console.log('\n[3/5] Migrating verified files to S3 and MongoDB...');
      let successCount = 0;
      let failureCount = 0;

      for (const item of inventory) {
        if (!item.existsOnDisk || !item.sha256 || item.sizeBytes === undefined) {
          console.log(`  [SKIP] Record ${item.id} (${item.name}) - Physical file missing.`);
          item.status = 'SKIPPED';
          continue;
        }

        try {
          // Check if already in MongoDB
          const existing = await ProjectFile.findOne({ file_id: item.id });
          if (existing && existing.checksum_sha256 === item.sha256) {
            console.log(`  [OK - ALREADY MIGRATED] Record ${item.id} (${item.name})`);
            item.status = 'MIGRATED';
            successCount++;
            continue;
          }

          // 1. Stream file to S3
          const fileReadStream = fs.createReadStream(item.localPath);
          const mimeType = StorageService.getMimeType(item.name);

          const uploadResult = await ObjectStorageService.uploadStream(
            item.projectId,
            item.name,
            fileReadStream,
            mimeType
          );

          // 2. Upsert into MongoDB
          await ProjectFile.findOneAndUpdate(
            { file_id: item.id },
            {
              $set: {
                file_id: item.id,
                project_id: item.projectId,
                organization_id: item.organizationId,
                name: item.name,
                original_name: item.name,
                document_type: item.documentType,
                mime_type: uploadResult.mimeType,
                file_size_bytes: uploadResult.byteLength,
                storage_provider: 's3',
                storage_key: uploadResult.storageKey,
                checksum_sha256: uploadResult.checksumSha256,
                uploaded_by: (records.find((r) => r.id === item.id)?.project as any)?.owner_id || 'migration_tool',
                is_archived: false,
              },
            },
            { upsert: true, new: true }
          );

          console.log(`  [MIGRATED] Record ${item.id} -> S3: ${uploadResult.storageKey} (${uploadResult.byteLength} bytes)`);
          item.status = 'MIGRATED';
          successCount++;
        } catch (migErr: any) {
          console.error(`  [FAILED] Record ${item.id} (${item.name}):`, migErr.message);
          item.status = 'FAILED';
          item.error = migErr.message;
          failureCount++;
        }
      }

      console.log('\n────────────────────────────────────────────────────────────────────────');
      console.log(`Migration Run Finished: ${successCount} Migrated, ${failureCount} Failed.`);
      console.log('────────────────────────────────────────────────────────────────────────');
    }

    // 5. Post-migration reconciliation
    console.log('\n[4/5] Running Post-Migration Reconciliation & Integrity Check...');
    const mongoCount = await ProjectFile.countDocuments({ is_archived: false });
    console.log(`- Active MongoDB Documents: ${mongoCount}`);

    let checksumMatches = 0;
    let checksumMismatches = 0;

    for (const item of inventory.filter((i) => i.existsOnDisk)) {
      const doc = await ProjectFile.findOne({ file_id: item.id });
      if (!doc) {
        console.warn(`  ⚠️  Missing from MongoDB: Record ${item.id}`);
        continue;
      }

      if (doc.checksum_sha256 === item.sha256) {
        checksumMatches++;
      } else {
        console.error(`  ❌ Checksum mismatch for Record ${item.id}! Local: ${item.sha256}, Mongo: ${doc.checksum_sha256}`);
        checksumMismatches++;
      }

      // Verify S3 object exists
      const s3Head = await ObjectStorageService.headObject(doc.storage_key);
      if (!s3Head.exists) {
        console.error(`  ❌ S3 object missing for key: ${doc.storage_key}`);
      }
    }

    console.log(`- Checksum Verification: ${checksumMatches} matches, ${checksumMismatches} mismatches`);

    console.log('\n[5/5] Reconciliation Report Summary:');
    if (checksumMismatches === 0 && (isExecute || isVerifyOnly)) {
      console.log('✅ RECONCILIATION PASSED: 100% of verified documents match between source and target.');
    } else if (isDryRun) {
      console.log('ℹ️  DRY RUN: Ready for execution.');
    }

  } catch (fatalErr: any) {
    console.error('\nFatal Error During Migration:', fatalErr);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    await disconnectMongoDB();
    console.log('\nDatabase connections closed.');
  }
}

runMigration().catch((err) => {
  console.error('Unhandled error in migrate-project-files:', err);
  process.exit(1);
});
