-- CreateTable: user_identity_mappings
CREATE TABLE IF NOT EXISTS "user_identity_mappings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "mirai_user_id" TEXT NOT NULL,
    "pm_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_identity_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique mirai_user_id (1 MIRAI user -> 1 PM user)
CREATE UNIQUE INDEX IF NOT EXISTS "user_identity_mappings_mirai_user_id_key" ON "user_identity_mappings"("mirai_user_id");

-- CreateIndex: unique pm_user_id (1 PM user -> 1 MIRAI user)
CREATE UNIQUE INDEX IF NOT EXISTS "user_identity_mappings_pm_user_id_key" ON "user_identity_mappings"("pm_user_id");

-- CreateIndex: tenant indexing
CREATE INDEX IF NOT EXISTS "user_identity_mappings_organization_id_idx" ON "user_identity_mappings"("organization_id");

-- CreateIndex: composite lookup
CREATE INDEX IF NOT EXISTS "user_identity_mappings_mirai_user_id_organization_id_idx" ON "user_identity_mappings"("mirai_user_id", "organization_id");

-- AddForeignKey: organizations
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_identity_mappings_organization_id_fkey'
    ) THEN
        ALTER TABLE "user_identity_mappings" ADD CONSTRAINT "user_identity_mappings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: users
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_identity_mappings_pm_user_id_fkey'
    ) THEN
        ALTER TABLE "user_identity_mappings" ADD CONSTRAINT "user_identity_mappings_pm_user_id_fkey" FOREIGN KEY ("pm_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

