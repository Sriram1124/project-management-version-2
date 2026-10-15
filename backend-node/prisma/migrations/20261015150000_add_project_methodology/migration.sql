-- CreateEnum
CREATE TYPE "ProjectMethodology" AS ENUM ('SCRUM', 'KANBAN');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN "methodology" "ProjectMethodology" NOT NULL DEFAULT 'SCRUM';

