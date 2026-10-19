# InternHub — Project Files Module Migration: Final Architecture Audit & Implementation Plan

**Scope**: Planning and Technical Audit Only — Project Files Module  
**Status**: Architecture Review & Revised Implementation Plan (Pre-Implementation Final)  
**Target Environment**: InternHub (Dailoqa Enterprise Workspace Platform)  

---

## 1. Corrected Architecture Recommendation & Justification

### 1.1 Comparative Evaluation

| Architectural Factor | Option A: PostgreSQL Metadata + S3-Compatible Storage | Option B: MongoDB Metadata + S3-Compatible Storage |
|---|---|---|
| **Authoritative Entity Store** | **Single Engine (PostgreSQL)**: Organizations, Projects, Members, and Documents reside in one relational database. | **Split Engines**: Organizations, Projects, and Members in PostgreSQL; Document metadata in MongoDB. |
| **Referential Integrity** | **Database-Enforced**: Deleting a project automatically cascades or restricts document records (`onDelete: Cascade`) via database foreign keys. | **Application-Enforced**: Backend must manually coordinate cross-database referential cleanup; risks orphaned records if service crashes. |
| **Dual-Write Complexity** | **Low**: Dual-write exists only between PostgreSQL and S3 (1 database + 1 object store). | **High**: Distributed state across three systems: PostgreSQL (auth/projects) -> MongoDB (metadata) -> S3 (binaries). |
| **Hosting & Operational Cost** | **Minimal**: No additional database cluster; only pay for raw object storage (~$0.015/GB/mo on S3/R2). | **Moderate**: Requires provisioning, securing, and maintaining a MongoDB Atlas/self-hosted cluster in addition to PostgreSQL and S3. |
| **Operational Risk** | **Lowest**: Single backup schedule, single connection pool, proven Prisma ORM patterns. | **Elevated**: Independent point-in-time recovery (PITR) desynchronization, dual connection pool management. |

### 1.2 Recommendation: Option A vs. Option B
1. **Primary Technical Recommendation: Option A (PostgreSQL + S3-Compatible Object Storage)**
   - InternHub's data model is fundamentally relational. File metadata does not possess variable, deeply polymorphic, or hierarchical document requirements that justify a NoSQL engine.
   - Option A solves 100% of the operational challenges (local disk ephemerality, container memory exhaustion, horizontal scaling) with the lowest risk and cost.
2. **If MongoDB is Mandatory: Option B (MongoDB Metadata + S3-Compatible Object Storage)**
   - If migrating the Project Files metadata to MongoDB is an immutable business constraint, **Option B is the only valid architecture**.
   - **Mandatory Constraint**: PostgreSQL **must remain strictly authoritative** for Organizations, Users, Roles, Permissions, Projects, and Project Memberships. MongoDB must hold **only** file metadata and must reference PostgreSQL entities exclusively via validated UUID strings.
   - **GridFS Disqualification**: GridFS is excluded from this plan. Storing binary chunks in MongoDB bloats database backups, degrades WiredTiger cache performance, and provides zero advantages over standard object storage.
   - **Feature Scope**: Optional extensions like file versioning and tags are excluded from the initial migration baseline to prevent unnecessary schema bloat and keep the data model strictly mapped to the existing feature set.

---

## 2. Verified Current-State Implementation

All observations below are verified directly against the current repository codebase on branch `main`.

### 2.1 Frontend Components & Services
* `frontend/src/components/views/projects/ProjectFilesSection.jsx`:
  - Renders top 3 files on the project overview tab in a card grid.
  - Generates image thumbnails via `ImageThumbnail` (calls `projectsService.getDocumentBlobUrl`).
  - Implements inline document renaming via `handleConfirmRename` (`projectsService.updateDocument`).
  - Handles single and multiple file uploads via hidden `<input type="file" multiple>` and `handleFileInputChange` (`projectsService.uploadDocument`).
  - Renders an accessible portal-based confirmation modal for file deletions (`projectsService.deleteDocument`).
  - **Identified Gap (Line 103)**: Displays `d.storage_key ? d.storage_key.split('/').pop() : 'Document'` in place of actual file size because the backend database schema does not store byte sizes.
* `frontend/src/components/views/projects/FilePreviewModal.jsx`:
  - Loads preview blobs for images (`isImage`) and PDFs (`file.type === 'pdf'`) using `projectsService.getDocumentBlobUrl`.
  - Converts the received binary Blob into an in-memory Object URL (`URL.createObjectURL(blob)`), revoking it on unmount.
  - Renders interactive zoom controls (50% to 200%) for images and embedded `<iframe>` for PDFs.
  - Renders an explicit fallback card (`Preview Unavailable`) with a direct download button for non-previewable file types or failed requests.
* `frontend/src/components/modals/AllProjectFilesModal.jsx`:
  - Directory modal displaying all project files with client-side text filtering across `name` and `type`.
  - Supports Preview, Download, and Delete actions matching `ProjectFilesSection`.
* `frontend/src/features/intern/components/ScopedProjectView.jsx` (Lines 309-380):
  - Renders "Project Documents" for assigned interns, reading from `project.documents` supplied by `projectsService.getProjectById`.
* `frontend/src/services/projects.service.js` (Lines 102-135):
  - `getDocuments(id)`: `GET /api/projects/:id/documents`
  - `uploadDocument(id, file)`: `POST /api/projects/:id/documents` (Multipart form-data)
  - `downloadDocument(id, documentId, filename)`: `api.downloadFile('/projects/:id/documents/:documentId/download', filename)`
  - `getDocumentBlobUrl(id, documentId)`: `api.getBlob('/projects/:id/documents/:documentId/preview')`
  - `updateDocument(id, documentId, data)`: `PATCH /api/projects/:id/documents/:documentId`
  - `deleteDocument(id, documentId)`: `DELETE /api/projects/:id/documents/:documentId`
* `frontend/src/services/api.js` (Lines 370-390):
  - `getBlob()` issues an authenticated `fetchWithAuth()` request expecting a binary body (`response.blob()`).
  - `downloadFile()` retrieves the blob via `getBlob()` and creates a temporary `<a>` element with `window.URL.createObjectURL(blob)` to trigger a browser download.

### 2.2 Backend Architecture & Routes
* `backend-node/src/routes/project.routes.ts` (Lines 7-55):
  - Declares Multer memory storage with 50MB limit: `multer.memoryStorage()`.
  - `GET /:id/documents` requires `PROJECT_READ`.
  - `POST /:id/documents` requires `DOCUMENT_UPLOAD` or `PROJECT_UPDATE` with `upload.single('file')`.
  - `GET /:id/documents/:documentId/download` requires `PROJECT_READ`.
  - `GET /:id/documents/:documentId/preview` requires `PROJECT_READ`.
  - `PATCH /:id/documents/:documentId` requires `PROJECT_UPDATE`.
  - `DELETE /:id/documents/:documentId` requires `DOCUMENT_DELETE` or `PROJECT_UPDATE`.
* `backend-node/src/controllers/project.controller.ts` (Lines 332-430):
  - Dispatches calls to `ProjectService`.
  - Sets `Content-Type: mimeType` and executes `res.download(filePath, document.name)` for downloads.
  - Sets `Content-Disposition: inline; filename="..."` and executes `res.sendFile(filePath)` for previews.
* `backend-node/src/services/storage.service.ts`:
  - Resolves path: `STORAGE_PATH || path.join(process.cwd(), 'storage')`.
  - Writes to: `storage/projects/:projectId/:uniqueId-:sanitizedName.ext`.
  - Checks path traversal: `resolvedPath.startsWith(storageRoot)`.
  - Unlinks on delete: `fs.promises.unlink(filePath)`.
* `backend-node/src/services/project.service.ts` (Lines 1600-1935):
  - Enforces organization scoping: verifies project belongs to `user.organization_id`.
  - `uploadProjectDocumentWithFile`: Writes to disk, creates PostgreSQL row; if DB insert fails, unlinks disk file.
  - `getProjectById` & `listProjects`: Embeds `documents: true` and `_count: { select: { documents: true } }`.
* `backend-node/src/middleware/auth.middleware.ts` (Lines 244-475):
  - `checkProjectMemberPermission`: Authorizes `SUPER_ADMIN`, `ADMIN`, `MANAGER`, Project Owners, and project members (`ProjectMember`). Built-in roles: `TECH_LEAD` (full), `DEVELOPER` (`DOCUMENT_READ`, `DOCUMENT_UPLOAD`), `QA_TESTER` (`DOCUMENT_READ`), standard members (`DOCUMENT_READ`).

### 2.3 Verified Code Anomaly: Synthetic Dummy-File Generation
Lines 1785–1800 of `backend-node/src/services/project.service.ts` contain test-fixture fallback code:
- If a file is missing on disk at `resolvedPath`, the backend writes a synthetic dummy PDF (`%PDF-1.4...`) or dummy text file (`Document Content: ...`) directly to the filesystem.
- **Impact**: Silently masks storage corruption and data loss, while mutating the filesystem during idempotent HTTP `GET` requests.
- **Correction**: This block must be removed completely. Missing storage objects must log a critical alert and return HTTP 404 (`FILE_NOT_FOUND_IN_STORAGE`).

### 2.4 Verified Data Model (Prisma Schema)
`backend-node/prisma/schema.prisma` (Lines 289-302):
```prisma
model ProjectDocument {
  id            String   @id @default(uuid())
  project_id    String
  name          String
  document_type String
  storage_key   String
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt

  project      Project   @relation(fields: [project_id], references: [id], onDelete: Cascade)

  @@map("project_documents")
}
```

### 2.5 Storage Paths, Volumes, and Cloud Ephemerality
- **Docker Compose**: Maps named volume `project_storage` to `/app/storage`. Working directory in container is `/app`.
- **Host Execution**: Resolves to `<cwd>/storage` (e.g., `backend-node/storage`).
- **Cloud Ephemerality**: In AWS ECS or Kubernetes, container file systems are destroyed on task restart. Local disk storage cannot survive multi-instance deployments without network storage (AWS EFS).

### 2.6 Environment-Specific Inventory Distinction
- **Development Database Observation**: The local development database contains **7 records** in `project_documents` (project `607bc935-aae5-4f8b-b9ac-c41f578a03dc`), and the local filesystem contains **10 files** (including 3 unindexed test files).
- **Production Reality**: **Production inventory is unknown and unverified at this stage.** Live production may contain thousands of records and files across dozens of organizations. Live inventory must be queried dynamically via the read-only audit script during Phase 1 of migration.

---

## 3. Final Schema & API Contract

### 3.1 MongoDB Collection Schema: `project_files`
The schema is strictly bounded to the required file metadata without premature versioning bloat:

```typescript
import { Schema, Document, model } from 'mongoose';

export interface IProjectFile extends Document {
  file_id: string;              // UUIDv4 (exposed as id to frontend for 100% compatibility)
  project_id: string;           // PostgreSQL Project UUID
  organization_id: string;      // PostgreSQL Organization UUID (hard tenant boundary)
  name: string;                 // Display filename (e.g. "Architecture_Spec.pdf")
  original_name: string;        // Name at upload
  document_type: string;        // Extension (e.g. "pdf", "docx")
  mime_type: string;            // Validated MIME (e.g. "application/pdf")
  file_size_bytes: number;      // Exact byte size
  storage_provider: 's3' | 'local';
  storage_key: string;          // Object store key
  checksum_sha256: string;      // SHA256 hex digest
  uploaded_by: string;          // PostgreSQL User UUID
  is_archived: boolean;
  created_at: Date;
  updated_at: Date;
}

export const ProjectFileSchema = new Schema<IProjectFile>(
  {
    file_id: { type: String, required: true, unique: true },
    project_id: { type: String, required: true },
    organization_id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    original_name: { type: String, required: true },
    document_type: { type: String, required: true, lowercase: true, trim: true },
    mime_type: { type: String, required: true },
    file_size_bytes: { type: Number, required: true, min: 0 },
    storage_provider: { type: String, enum: ['s3', 'local'], default: 's3' },
    storage_key: { type: String, required: true },
    checksum_sha256: { type: String, required: true },
    uploaded_by: { type: String, required: true },
    is_archived: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Targeted, non-redundant compound indexes matching actual query patterns
ProjectFileSchema.index({ project_id: 1, is_archived: 1, created_at: -1 }); // List documents in project
ProjectFileSchema.index({ organization_id: 1, created_at: -1 });            // Tenant-level audit/isolation
ProjectFileSchema.index({ project_id: 1, name: 1 });                        // Duplicate name check in project

export const ProjectFile = model<IProjectFile>('ProjectFile', ProjectFileSchema, 'project_files');
```

### 3.2 Exact Preserved API Contract

The frontend contracts remain identical. To avoid breaking the frontend's `api.getBlob` implementation, **the backend functions as an authenticated streaming proxy** for downloads and previews.

| Endpoint | Method | Request Payload / Params | Response Status & Body | Streaming / Content-Disposition |
|---|---|---|---|---|
| `/api/projects/:id/documents` | `GET` | Params: `id` (Project UUID) | `200 OK`<br>`{ "documents": [ { "id": "uuid", "name": "...", "document_type": "...", "storage_key": "...", "created_at": "...", "updated_at": "..." } ] }` | JSON response. `file_id` mapped to `id`. |
| `/api/projects/:id/documents` | `POST` | Multipart Form: `file` (Binary) | `201 Created`<br>`{ "document": { "id": "uuid", "name": "...", ... } }` | S3 multipart upload stream with on-the-fly SHA256. |
| `/api/projects/:id/documents/:docId/download` | `GET` | Params: `id`, `docId` | `200 OK` (Binary Stream) | `Content-Type: <mime>`<br>`Content-Disposition: attachment; filename="<name>"` |
| `/api/projects/:id/documents/:docId/preview` | `GET` | Params: `id`, `docId` | `200 OK` (Binary Stream) | `Content-Type: <mime>`<br>`Content-Disposition: inline; filename="<name>"` |
| `/api/projects/:id/documents/:docId` | `PATCH` | JSON: `{ "name": "New Name" }` | `200 OK`<br>`{ "document": { "id": "uuid", "name": "New Name", ... } }` | Updates metadata in MongoDB. |
| `/api/projects/:id/documents/:docId` | `DELETE`| Params: `id`, `docId` | `200 OK`<br>`{ "success": true, "message": "Document deleted successfully", "id": "uuid" }` | Removes metadata from MongoDB; deletes S3 object. |

#### Why Direct S3 Presigned URL Redirects Are Not Used in Phase 1
If the backend returns an HTTP 302 redirect to an S3 pre-signed URL:
1. The frontend's `fetchWithAuth()` attaches `Authorization: Bearer <token>`.
2. The browser automatically follows the redirect to `https://<bucket>.s3.amazonaws.com/...`.
3. AWS S3 rejects the request with **HTTP 400 Bad Request** (`InvalidArgument: Only one auth mechanism allowed`).
4. By using the backend as a streaming proxy (`pipeline(s3Stream, res)`), the existing frontend code functions with **zero regressions**.

---

## 4. Data Consistency, Failure Recovery & Reversible Rollback

### 4.1 Distributed Failure Handling Matrix

1. **Upload Compensation Pattern**:
   - Stream binary to S3 first under a unique staged key.
   - Insert metadata document into MongoDB.
   - If the database insertion fails, catch the error and execute an immediate, retryable `deleteObject` call to S3.
2. **Deletion Two-Phase Tombstone Pattern**:
   - Mark file as `is_archived: true` in MongoDB.
   - Delete binary object from S3.
   - Delete metadata record permanently from MongoDB.
3. **Automated Daily Reconciliation Worker**:
   - Scheduled BullMQ background worker running every 24 hours:
     - **Orphan Storage Detection**: Scans S3 bucket objects under `projects/*`. Objects created >24 hours ago without an active database record are purged.
     - **Missing Binary Detection**: Scans active MongoDB `project_files`. If `headObject` on S3 returns 404, the record is flagged as `storage_error: true` and reported to cloud monitoring.

### 4.2 Safe Reversible Rollback (Bi-Directional Sync)
A feature flag toggle alone is **not** a rollback strategy because any files uploaded or deleted after cutover would be lost upon reverting.

1. **During Cutover (Canary Phase)**:
   - Primary reads: Served from MongoDB / S3.
   - Primary writes: Dispatched to MongoDB / S3 **AND mirrored back to PostgreSQL / local disk**.
2. **If Rollback is Triggered**:
   - Flip feature flag: `ENABLE_MONGODB_PROJECT_FILES=false`.
   - Traffic reverts to PostgreSQL immediately.
   - **Zero Writes Lost**: All documents uploaded, renamed, or deleted during the cutover period already exist in PostgreSQL.
3. **Decommissioning**:
   - The PostgreSQL `project_documents` table and local disk files are retained for **14 days** post-cutover.
   - They will only be dropped after explicit business sign-off and zero rollback requests during the observation window.

---

## 5. Security, Validation & Deployment Hardening

### 5.1 Memory-Efficient Upload Pipeline
Replace `multer.memoryStorage()` with `@aws-sdk/lib-storage` chunked stream piping:
- Pass-through stream pipeline:
  - First 4,100 bytes inspected by `file-type` magic-number sniffer.
  - Stream piped simultaneously into `crypto.createHash('sha256')`.
  - Stream piped into `@aws-sdk/lib-storage` with 5MB part buffers.
- Peak memory per upload: **~5MB–10MB** (vs. buffering entire 50MB files in RAM).
- Executable files (`.exe`, `.sh`, `.bat`, `.cmd`, `.vbs`, `.js`, `.jar`, `.scr`) are rejected at byte 4,100, aborting the S3 upload immediately with HTTP 400 Bad Request.

### 5.2 Server-Side Authorization Enforcement
- Client-supplied `organization_id`, `project_id`, or `uploaded_by` are **never trusted**:
  - `organization_id` is extracted strictly from the authenticated JWT session.
  - `project_id` from the URL is verified against PostgreSQL to ensure `project.organization_id === user.organization_id`.
  - `uploaded_by` is set strictly to `req.fullUser.id`.
- Every MongoDB query includes both `project_id` and `organization_id` for hard tenant isolation.

### 5.3 Object Storage Security (AWS S3 / MinIO)
- **Bucket Policy**: Enforce TLS (`aws:SecureTransport: false` denied).
- **Public Access Block**: Enable all 4 S3 Block Public Access settings.
- **Storage Key Structure**: Keys use immutable, server-generated UUIDs:
  `projects/${projectId}/${fileId}/${sanitizedBasename}.${safeExt}`
- **Least-Privilege IAM Policy**: Scoped strictly to `arn:aws:s3:::internhub-project-documents/projects/*` with permissions limited to `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, and `s3:AbortMultipartUpload`.

---

## 6. Staged, Idempotent & Reversible Migration Plan

- **Stage 1: Production Pre-Migration Audit & Backup**
  - Snapshot PostgreSQL `project_documents`.
  - Create compressed archive of storage directory.
  - Execute read-only audit script to catalog live records, sizes, and orphans.
- **Stage 2: Target Storage Provisioning**
  - Provision private encrypted S3 bucket.
  - Initialize MongoDB collection `project_files` with compound indexes.
- **Stage 3: Offline Data Copy with Dry-Run Mode**
  - Migration script supports `--dry-run` and `--execute`.
  - Streams verified files from disk to S3, calculates SHA256, and upserts into MongoDB idempotently.
- **Stage 4: Automated Reconciliation**
  - Verifies 100% record-count match, byte-size match, and SHA256 checksum match.
- **Stage 5: Bi-Directional Dual-Writing Deployment**
  - Writes mirrored to both systems; reads serve from PostgreSQL.
- **Stage 6: Cutover**
  - Primary reads switched to MongoDB; writes continue mirroring to PostgreSQL.
- **Stage 7: 14-Day Canary Observation Window**
  - Health and latency monitoring. Instant zero-loss rollback ready.
- **Stage 8: Final Decommissioning**
  - Disable reverse sync and archive PostgreSQL table after 14 days.

---

## 7. Deployment Configuration & Test Matrix

### 7.1 Environment Variables
```ini
MONGODB_URI=mongodb://app_user:strong_password@mongo-host:27017/internhub?authSource=admin&replicaSet=rs0
MONGODB_MAX_POOL_SIZE=50
MONGODB_MIN_POOL_SIZE=10

STORAGE_DRIVER=s3
S3_ENDPOINT=https://s3.ap-south-1.amazonaws.com
S3_REGION=ap-south-1
S3_BUCKET=internhub-project-documents
S3_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
S3_SECRET_ACCESS_KEY=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
S3_FORCE_PATH_STYLE=false

ENABLE_MONGODB_PROJECT_FILES=false
DUAL_WRITE_PROJECT_FILES=true
REVERSE_SYNC_TO_POSTGRES=true
```

### 7.2 Comprehensive Test Matrix

| Test ID | Test Category | Execution & Scenario | Expected Result |
|---|---|---|---|
| **T-01** | **Upload Stream** | Upload 50MB PDF via `POST /api/projects/:id/documents` | Node heap memory < 20MB. S3 object created. MongoDB document created with matching SHA256. HTTP 201 returned. |
| **T-02** | **Magic-Byte Sniffing** | Upload executable disguised as PDF (`payload.exe` named `doc.pdf`) | Request rejected at byte 4,100. S3 stream aborted. HTTP 400 Bad Request returned. Zero storage objects created. |
| **T-03** | **Oversized Upload** | Upload 51MB file | Upload rejected at 50MB limit. HTTP 413 Payload Too Large returned. |
| **T-04** | **Streaming Preview** | `GET /api/projects/:id/documents/:docId/preview` | HTTP 200 returned with `Content-Disposition: inline`. Binary stream piped to client. Renders in modal. |
| **T-05** | **Streaming Download** | `GET /api/projects/:id/documents/:docId/download` | HTTP 200 returned with `Content-Disposition: attachment; filename="..."`. Downloaded byte size matches original. |
| **T-06** | **Rename Document** | `PATCH /api/projects/:id/documents/:docId` with `{ name: "Updated.pdf" }` | MongoDB `name` updated. S3 object is unchanged. HTTP 200 returned. UI card reflects new name. |
| **T-07** | **Delete Document** | `DELETE /api/projects/:id/documents/:docId` | MongoDB record removed. S3 object unlinked. HTTP 200 returned. Card removed from UI. |
| **T-08** | **Missing Object 404** | Document record exists in MongoDB, but object deleted from S3 | Critical error logged. HTTP 404 returned (`FILE_NOT_FOUND_IN_STORAGE`). Zero dummy files generated. |
| **T-09** | **Tenant Isolation** | User from Organization A attempts to download file belonging to Organization B | Request rejected with HTTP 403 Forbidden via PostgreSQL validation. Zero data leakage. |
| **T-10** | **Project Access** | Intern not assigned to Project X attempts preview | Request rejected with HTTP 403 Forbidden via `checkProjectMemberPermission`. |
| **T-11** | **Compensation** | Force database connection failure during upload | Uploaded S3 object is deleted immediately by catch-block. HTTP 500/503 returned. No orphan left in S3. |
| **T-12** | **Reverse Sync Rollback** | Create new file in MongoDB during cutover; trigger rollback to PostgreSQL | File exists in PostgreSQL and local storage. Switching read flag to PostgreSQL retains the new file with zero write loss. |

---

## 8. Explicit Assumptions, Unresolved Questions & Risks

### 8.1 Assumptions
1. **Production Inventory**: The production database contains active documents that must be audited dynamically. The 7 records observed in the local database do not represent production volume.
2. **PostgreSQL as Source of Truth**: PostgreSQL remains the permanent authoritative store for all organizational, project, and authorization entities.
3. **Frontend Compatibility**: The backend streaming proxy approach is used to maintain 100% compatibility with `api.getBlob()`.

### 8.2 Unresolved Decisions for Stakeholders
1. **Option A vs. Option B Decision**: Confirm whether Option A (PostgreSQL + S3) is preferred for engineering simplicity and lowest cost, OR whether Option B (MongoDB + S3) is mandatory for organizational reasons.
2. **Storage Target**: Confirm target cloud provider: AWS S3 vs. Cloudflare R2 vs. Self-hosted MinIO.
3. **Removal of Dummy-File Fallback**: Confirm approval to completely eliminate the synthetic dummy PDF/text generator (`project.service.ts#L1785-L1800`) in favor of standard HTTP 404 responses.

---

## 9. Final Pre-Implementation Checklist

Do not begin code changes, package installations, or database migrations until each item is verified:

- [ ] **Architecture Decision Approved**: Stakeholder has selected Option A or Option B.
- [ ] **Target Storage Provisioned**: S3 bucket created with private access policy, TLS enforcement, and IAM credentials restricted to `projects/*`.
- [ ] **MongoDB Cluster Initialized**: Connection string verified with read/write access to `internhub` (if Option B selected).
- [ ] **Production Snapshot Archived**: Full PostgreSQL database dump and full archive of production storage directory verified.
- [ ] **Dry-Run Completed**: Migration script executed with `--dry-run` against production data; zero unmapped records.
- [ ] **Rollback Plan Tested**: Bi-directional reverse sync verified in staging environment.
- [ ] **Frontend Preservation Verified**: Confirmed that the streaming proxy approach requires zero modifications to frontend components.
- [ ] **Explicit Stakeholder Approval**: Written approval received to proceed with implementation.
