-- Add assignment creation timestamps to the existing task-assignee relationship
ALTER TABLE "work_item_assignees"
ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
