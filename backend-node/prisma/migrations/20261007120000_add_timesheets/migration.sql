-- CreateTable
CREATE TABLE "organization_work_policies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "office_start_time" TEXT NOT NULL DEFAULT '09:00',
    "office_end_time" TEXT NOT NULL DEFAULT '17:30',
    "break_start_time" TEXT,
    "break_end_time" TEXT,
    "lunch_break_minutes" INTEGER NOT NULL DEFAULT 60,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "overtime_enabled" BOOLEAN NOT NULL DEFAULT false,
    "overtime_start_time" TEXT DEFAULT '17:30',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_work_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_sessions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "project_id" TEXT,
    "work_session_id" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_work_policies_organization_id_key" ON "organization_work_policies"("organization_id");
CREATE INDEX "work_sessions_organization_id_user_id_idx" ON "work_sessions"("organization_id", "user_id");
CREATE INDEX "work_sessions_user_id_started_at_idx" ON "work_sessions"("user_id", "started_at");
CREATE INDEX "time_entries_organization_id_user_id_date_idx" ON "time_entries"("organization_id", "user_id", "date");
CREATE INDEX "time_entries_task_id_idx" ON "time_entries"("task_id");
CREATE INDEX "time_entries_user_id_start_time_idx" ON "time_entries"("user_id", "start_time");

-- AddForeignKey
ALTER TABLE "organization_work_policies" ADD CONSTRAINT "organization_work_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_work_session_id_fkey" FOREIGN KEY ("work_session_id") REFERENCES "work_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
