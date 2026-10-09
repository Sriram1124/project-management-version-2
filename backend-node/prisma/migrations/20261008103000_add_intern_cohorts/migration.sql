-- CreateTable
CREATE TABLE "cohorts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cohorts_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN "cohort_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "cohorts_organization_id_code_key" ON "cohorts"("organization_id", "code");

-- CreateIndex
CREATE INDEX "cohorts_organization_id_idx" ON "cohorts"("organization_id");

-- CreateIndex
CREATE INDEX "users_cohort_id_idx" ON "users"("cohort_id");

-- AddForeignKey
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE SET NULL ON UPDATE CASCADE;