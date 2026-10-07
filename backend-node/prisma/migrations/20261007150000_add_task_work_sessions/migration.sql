-- Link task-specific work sessions to the existing work item table
ALTER TABLE "work_sessions"
ADD COLUMN "task_id" TEXT;

CREATE INDEX "work_sessions_user_id_task_id_ended_at_idx"
ON "work_sessions"("user_id", "task_id", "ended_at");

ALTER TABLE "work_sessions"
ADD CONSTRAINT "work_sessions_task_id_fkey"
FOREIGN KEY ("task_id") REFERENCES "work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
