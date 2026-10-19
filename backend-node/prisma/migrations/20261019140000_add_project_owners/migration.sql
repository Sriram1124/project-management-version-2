-- CreateTable
CREATE TABLE IF NOT EXISTS "project_owners" (
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_owners_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "project_owners_project_id_idx" ON "project_owners"("project_id");
CREATE INDEX IF NOT EXISTS "project_owners_user_id_idx" ON "project_owners"("user_id");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'project_owners_project_id_fkey'
    ) THEN
        ALTER TABLE "project_owners" ADD CONSTRAINT "project_owners_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'project_owners_user_id_fkey'
    ) THEN
        ALTER TABLE "project_owners" ADD CONSTRAINT "project_owners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Data Migration: Migrate existing project owners without data loss
INSERT INTO "project_owners" ("project_id", "user_id", "created_at")
SELECT "id", "owner_id", "created_at"
FROM "projects"
WHERE "owner_id" IS NOT NULL
ON CONFLICT ("project_id", "user_id") DO NOTHING;

-- Also migrate any existing manager members that were added as co-owners
INSERT INTO "project_owners" ("project_id", "user_id", "created_at")
SELECT "project_id", "user_id", CURRENT_TIMESTAMP
FROM "project_members"
WHERE "project_role" = 'MANAGER'
ON CONFLICT ("project_id", "user_id") DO NOTHING;

