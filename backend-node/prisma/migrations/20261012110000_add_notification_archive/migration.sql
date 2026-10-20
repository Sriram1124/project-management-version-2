-- AlterTable
ALTER TABLE "notification_recipients" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notification_recipients_user_id_archived_at_idx" ON "notification_recipients"("user_id", "archived_at");

