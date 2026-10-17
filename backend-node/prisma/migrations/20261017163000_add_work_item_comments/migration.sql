-- CreateTable
CREATE TABLE IF NOT EXISTS "work_item_comments" (
    "id" TEXT NOT NULL,
    "work_item_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_item_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "work_item_comments_work_item_id_idx" ON "work_item_comments"("work_item_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "work_item_comments_author_id_idx" ON "work_item_comments"("author_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "work_item_comments_work_item_id_created_at_idx" ON "work_item_comments"("work_item_id", "created_at");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'work_item_comments_work_item_id_fkey'
  ) THEN
    ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'work_item_comments_author_id_fkey'
  ) THEN
    ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

