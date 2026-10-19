-- CreateTable
CREATE TABLE IF NOT EXISTS "project_owners" (
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_owners_pkey" PRIMARY KEY ("project_id","user_id")
);

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_owners_project_id_fkey'
  ) THEN
    ALTER TABLE "project_owners" ADD CONSTRAINT "project_owners_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_owners_user_id_fkey'
  ) THEN
    ALTER TABLE "project_owners" ADD CONSTRAINT "project_owners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill existing project owners
INSERT INTO "project_owners" ("project_id", "user_id")
SELECT "id", "owner_id" FROM "projects"
ON CONFLICT DO NOTHING;
