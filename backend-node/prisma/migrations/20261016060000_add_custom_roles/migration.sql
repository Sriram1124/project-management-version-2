-- AlterTable
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "project_id" TEXT;
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "is_custom" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "project_members" ADD COLUMN IF NOT EXISTS "role_id" TEXT;

-- Foreign Keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'roles_organization_id_fkey'
  ) THEN
    ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_fkey" 
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'roles_project_id_fkey'
  ) THEN
    ALTER TABLE "roles" ADD CONSTRAINT "roles_project_id_fkey" 
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_members_role_id_fkey'
  ) THEN
    ALTER TABLE "project_members" ADD CONSTRAINT "project_members_role_id_fkey" 
    FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Scoped uniqueness on roles
DROP INDEX IF EXISTS "roles_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "roles_scoped_unique_idx" 
ON "roles" (COALESCE("organization_id", 'GLOBAL'), COALESCE("project_id", 'GLOBAL'), UPPER("name"));

