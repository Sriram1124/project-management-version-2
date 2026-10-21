import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Intern Backlog Permissions, Status Persistence, and Due-Date Extension Suite', () => {
  const drawerPath = path.join(__dirname, '../components/backlog/IssueDetailDrawer.jsx');
  const hierarchicalTablePath = path.join(__dirname, '../components/backlog/HierarchicalIssueTable.jsx');
  const backlogTabPath = path.join(__dirname, '../components/views/projects/ProjectBacklogTab.jsx');
  const backendWorkItemServicePath = path.join(__dirname, '../../../backend-node/src/services/work-item.service.ts');

  const drawerContent = fs.readFileSync(drawerPath, 'utf8');
  const tableContent = fs.readFileSync(hierarchicalTablePath, 'utf8');
  const backlogTabContent = fs.readFileSync(backlogTabPath, 'utf8');
  const backendServiceContent = fs.readFileSync(backendWorkItemServicePath, 'utf8');

  describe('1. Task Status Persistence & Delta Updates', () => {
    test('ProjectBacklogTab passes delta changes and does not send monolithic payload for interns', () => {
      assert.match(
        backlogTabContent,
        /onUpdateIssue=\{async\s*\(\s*updated,\s*delta\s*\)\s*=>/,
        'ProjectBacklogTab must accept (updated, delta) parameters'
      );
      assert.match(
        backlogTabContent,
        /if\s*\(\s*delta\s*&&\s*typeof\s*delta\s*===\s*['"]object['"]\s*&&\s*Object\.keys\(delta\)\.length\s*>\s*0\s*\)/,
        'ProjectBacklogTab must isolate payload to delta changes when provided'
      );
    });

    test('ProjectBacklogTab does not call updateWorkItem if no work-item fields changed', () => {
      assert.match(
        backlogTabContent,
        /if\s*\(\s*Object\.keys\(payload\)\.length\s*===\s*0\s*\)\s*\{\s*setWorkItems\(/,
        'ProjectBacklogTab must update local state without calling updateWorkItem when payload is empty'
      );
    });

    test('ProjectBacklogTab performs optimistic update and rolls back on API error', () => {
      assert.match(
        backlogTabContent,
        /const prevWorkItems = \[\.\.\.workItems\];/,
        'Must capture prevWorkItems before attempting update'
      );
      assert.match(
        backlogTabContent,
        /setWorkItems\(prevWorkItems\);[\s\S]*?setSelectedIssue\(prevSelected\);/,
        'Must roll back workItems and selectedIssue on error'
      );
    });

    test('IssueDetailDrawer passes delta to onUpdateIssue on status change', () => {
      assert.match(
        drawerContent,
        /await\s*onUpdateIssue\?\.?\(\s*\{\s*\.\.\.issue,\s*status:\s*newStatus\s*\},\s*\{\s*status:\s*newStatus\s*\}\s*\)/,
        'handleStatusChange must pass { status: newStatus } delta to onUpdateIssue'
      );
    });
  });

  describe('2. Role-Based Field Restrictions for INTERN role in Task Detail Panel', () => {
    test('Interns cannot edit Priority, Assignee, Sprint, Epic, Story Points, Due Date, or Title/Desc in drawer', () => {
      assert.match(
        drawerContent,
        /const canDelete = !isIntern && \(canManageProject \|\| hasTaskDelete \|\| isCreator\);/,
        'canDelete must be strictly false for interns'
      );
      assert.match(
        drawerContent,
        /const canEditTitleAndDesc = !isIntern && \(canManageProject \|\| hasTaskUpdate\);/,
        'canEditTitleAndDesc must be false for interns'
      );
      assert.match(
        drawerContent,
        /const canChangePriority = !isIntern && \(canManageProject \|\| hasTaskUpdate\);/,
        'canChangePriority must be false for interns'
      );
      assert.match(
        drawerContent,
        /const canChangeAssignee = !isIntern && \(canManageProject \|\| hasTaskUpdate \|\| memberPerms\.has\('ROLE_ASSIGN'\)\);/,
        'canChangeAssignee must be false for interns'
      );
      assert.match(
        drawerContent,
        /const canChangeSprint = !isIntern && \(canManageProject \|\| hasTaskUpdate\);/,
        'canChangeSprint must be false for interns'
      );
      assert.match(
        drawerContent,
        /const canChangeEpic = !isIntern && \(canManageProject \|\| hasTaskUpdate\);/,
        'canChangeEpic must be false for interns'
      );
      assert.match(
        drawerContent,
        /const canChangeStoryPoints = !isIntern && \(canManageProject \|\| hasTaskUpdate\);/,
        'canChangeStoryPoints must be false for interns'
      );
      assert.match(
        drawerContent,
        /const canChangeDueDate = !isIntern && \(canManageProject \|\| hasTaskUpdate\);/,
        'canChangeDueDate must be false for interns'
      );
      assert.match(
        drawerContent,
        /const canAddChildItems = !isIntern && \(canManageProject \|\| hasTaskCreate\);/,
        'canAddChildItems must be false for interns'
      );
    });

    test('Interns cannot edit Assignee, Priority, Sprint, Story Points, or Due Date in Backlog table rows', () => {
      assert.match(
        tableContent,
        /const canChangeAssignee = !isIntern && \(canManageProject \|\| memberPerms\.has\('ROLE_ASSIGN'\) \|\| hasTaskUpdate\);/,
        'canChangeAssignee in table must be strictly false for interns'
      );
      assert.match(
        tableContent,
        /const canChangePriority = !isIntern && \(canManageProject \|\| hasTaskUpdate\);/,
        'canChangePriority in table must be false for interns'
      );
      assert.match(
        tableContent,
        /const canChangeSprint = !isIntern && \(canManageProject \|\| hasTaskUpdate\);/,
        'canChangeSprint in table must be false for interns'
      );
      assert.match(
        tableContent,
        /const canChangeStoryPoints = !isIntern && \(canManageProject \|\| hasTaskUpdate\);/,
        'canChangeStoryPoints in table must be false for interns'
      );
      assert.match(
        tableContent,
        /const canChangeDueDate = !isIntern && \(canManageProject \|\| hasTaskUpdate\);/,
        'canChangeDueDate in table must be false for interns'
      );
      assert.match(
        backlogTabContent,
        /if \(isIntern\) \{\s*onToast\?\.\('Forbidden: interns cannot reassign tasks'\);\s*return;\s*\}/,
        'handleUpdateAssignee in ProjectBacklogTab must guard against intern execution'
      );
    });

    test('Interns can change task status if assigned, but canCompleteStatus is false', () => {
      assert.match(
        drawerContent,
        /const canChangeStatus = !isIntern \? \(canManageProject \|\| hasTaskUpdate\) : isAssignedToMe;/,
        'canChangeStatus must permit assigned interns'
      );
      assert.match(
        drawerContent,
        /const canCompleteStatus = canManageProject;/,
        'canCompleteStatus must be restricted to project managers'
      );
    });

    test('Completed option is omitted or disabled for interns in status dropdown', () => {
      assert.match(
        drawerContent,
        /\{canCompleteStatus \? \(\s*<option value="COMPLETED">Completed<\/option>\s*\) : issue\.status === 'COMPLETED' \? \(\s*<option value="COMPLETED" disabled>Completed<\/option>\s*\) : null\}/,
        'Status dropdown must not allow interns to select Completed status'
      );
    });

    test('Subtask completion toggle is disabled for interns', () => {
      assert.match(
        drawerContent,
        /disabled=\{isIntern \|\| !canManageProject\}/,
        'Subtask completion checkbox must be disabled for interns'
      );
    });
  });

  describe('3. Backend Enforcement of Intern Restrictions', () => {
    test('Backend updateWorkItem blocks restricted fields when called by an intern', () => {
      assert.match(
        backendServiceContent,
        /if \(input\.assignee_ids !== undefined\) \{\s*throw new Error\('Forbidden: interns cannot reassign tasks'\);/,
        'Backend must reject intern reassignment'
      );
      assert.match(
        backendServiceContent,
        /if \(input\.sprint_id !== undefined\) \{\s*throw new Error\('Forbidden: interns cannot change sprint assignments'\);/,
        'Backend must reject intern sprint changes'
      );
      assert.match(
        backendServiceContent,
        /if \(input\.parent_id !== undefined\) \{\s*throw new Error\('Forbidden: interns cannot alter parent-child or epic assignments'\);/,
        'Backend must reject intern reparenting'
      );
      assert.match(
        backendServiceContent,
        /if \(input\.story_points !== undefined\) \{\s*throw new Error\('Forbidden: interns cannot modify story points'\);/,
        'Backend must reject intern story points modifications'
      );
      assert.match(
        backendServiceContent,
        /if \(input\.priority !== undefined\) \{\s*throw new Error\('Forbidden: interns cannot modify task priority'\);/,
        'Backend must reject intern priority modifications'
      );
      assert.match(
        backendServiceContent,
        /if \(input\.due_date !== undefined \|\| input\.start_date !== undefined\) \{\s*throw new Error\('Forbidden: interns cannot modify task due dates or schedules'\);/,
        'Backend must reject intern direct due date modifications'
      );
    });

    test('Backend updateWorkItem strictly prevents interns from completing tasks', () => {
      assert.match(
        backendServiceContent,
        /Forbidden: only managers and tech leads can mark tasks as completed/,
        'Backend must reject non-managers attempting status completion'
      );
    });

    test('Backend deleteWorkItem strictly prevents interns from deleting work items', () => {
      assert.match(
        backendServiceContent,
        /if \(this\.isIntern\(user\)\) \{\s*throw new Error\('Forbidden: interns do not have permission to delete work items'\);\s*\}/,
        'Backend deleteWorkItem must unconditionally reject intern deletion attempts'
      );
    });
  });

  describe('4. Due-Date Extension Workflow Integration', () => {
    test('Read-only due date has Apply for Extension button directly below it for interns', () => {
      assert.match(
        drawerContent,
        /Apply for Extension/,
        'Drawer must render "Apply for Extension" button'
      );
      assert.match(
        drawerContent,
        /!canChangeDueDate && \([\s\S]*?Apply for Extension/,
        'Apply for Extension button must be rendered under read-only due date when cannot edit due date'
      );
      assert.match(
        drawerContent,
        /isIntern && isAssignedToMe/,
        'Apply for Extension button must only be shown for the assigned intern, not for other members'
      );
    });

    test('Displays Extension Pending Approval badge when a request is under review', () => {
      assert.match(
        drawerContent,
        /Extension Pending Approval/,
        'Must display "Extension Pending Approval" badge when extension is pending'
      );
      assert.match(
        drawerContent,
        /IN REVIEW/,
        'Must display IN REVIEW status badge'
      );
    });

    test('Extension history section displays previous extension requests and review notes', () => {
      assert.match(
        drawerContent,
        /Extension History/,
        'Must render Extension History section header'
      );
      assert.match(
        drawerContent,
        /req\.status === 'APPROVED'[\s\S]*?req\.status === 'REJECTED'/,
        'Must style APPROVED, REJECTED, and PENDING status badges in history'
      );
    });

    test('Extension submission modal validates requested due date and mandatory reason', () => {
      assert.match(
        drawerContent,
        /Requested due date must be later than the current due date\./,
        'Modal must enforce requested due date strictly later than current due date'
      );
      assert.match(
        drawerContent,
        /Reason is mandatory\./,
        'Modal must enforce mandatory reason'
      );
      assert.match(
        drawerContent,
        /workItemsService\.requestExtension\(issue\.id,/,
        'Modal submit handler must call workItemsService.requestExtension'
      );
    });
  });

  describe('5. Manager Review Flow', () => {
    test('Drawer renders manager review section with decision notes and Approve/Reject actions', () => {
      assert.match(
        drawerContent,
        /handleDecideExtension\('APPROVE'\)/,
        'Drawer must provide Approve Extension action'
      );
      assert.match(
        drawerContent,
        /handleDecideExtension\('REJECT'\)/,
        'Drawer must provide Reject action'
      );
      assert.match(
        drawerContent,
        /Optional decision note for intern\.\.\./,
        'Drawer must provide decision note input for manager'
      );
    });
  });
});

