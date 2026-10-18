-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExtensionRequestStatus') THEN
    CREATE TYPE "ExtensionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "work_item_extension_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "original_due_date" TIMESTAMP(3),
    "requested_due_date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ExtensionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewer_id" TEXT,
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_item_extension_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "work_item_extension_requests_organization_id_idx" ON "work_item_extension_requests"("organization_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "work_item_extension_requests_project_id_idx" ON "work_item_extension_requests"("project_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "work_item_extension_requests_task_id_idx" ON "work_item_extension_requests"("task_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "work_item_extension_requests_requester_id_idx" ON "work_item_extension_requests"("requester_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "work_item_extension_requests_status_idx" ON "work_item_extension_requests"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "work_item_extension_requests_task_id_status_idx" ON "work_item_extension_requests"("task_id", "status");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'work_item_extension_requests_organization_id_fkey'
  ) THEN
    ALTER TABLE "work_item_extension_requests" ADD CONSTRAINT "work_item_extension_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'work_item_extension_requests_project_id_fkey'
  ) THEN
    ALTER TABLE "work_item_extension_requests" ADD CONSTRAINT "work_item_extension_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'work_item_extension_requests_task_id_fkey'
  ) THEN
    ALTER TABLE "work_item_extension_requests" ADD CONSTRAINT "work_item_extension_requests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'work_item_extension_requests_requester_id_fkey'
  ) THEN
    ALTER TABLE "work_item_extension_requests" ADD CONSTRAINT "work_item_extension_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'work_item_extension_requests_reviewer_id_fkey'
  ) THEN
    ALTER TABLE "work_item_extension_requests" ADD CONSTRAINT "work_item_extension_requests_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

