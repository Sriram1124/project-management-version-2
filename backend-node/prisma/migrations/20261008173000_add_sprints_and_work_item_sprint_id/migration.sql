-- CreateEnum
CREATE TYPE "SprintStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "sprints" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "status" "SprintStatus" NOT NULL DEFAULT 'PLANNED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sprints_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "work_items" ADD COLUMN "sprint_id" TEXT;

-- CreateIndex
CREATE INDEX "sprints_organization_id_project_id_idx" ON "sprints"("organization_id", "project_id");

-- CreateIndex: Database-level guarantee that at most ONE sprint can be ACTIVE per project
CREATE UNIQUE INDEX "sprints_one_active_per_project_idx" ON "sprints" ("project_id") WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "work_items_sprint_id_idx" ON "work_items"("sprint_id");

-- AddForeignKey
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "sprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

