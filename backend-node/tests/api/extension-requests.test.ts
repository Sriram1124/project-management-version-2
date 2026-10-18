import request from 'supertest';
import app from '../../src/app';
import { mockPrisma, mockEntity } from '../mocks/prisma.mock';
import { setupAuthUser } from '../helpers/auth.helper';

describe('Work Item Extension Requests API', () => {
  const futureDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
  const extendedDueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days from now
  const pastDueDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

  const mockProject = {
    id: 'proj-1',
    name: 'Dashboard App',
    organization_id: 'org-test-1',
    owner_id: 'user-manager',
    status: 'ACTIVE',
    members: [
      { user_id: 'user-manager', project_role: 'MANAGER' },
      { user_id: 'user-intern', project_role: 'INTERN' },
      { user_id: 'user-lead', project_role: 'TECH_LEAD' },
    ],
  };

  const mockWorkItem = {
    id: 'wi-ext-1',
    project_id: 'proj-1',
    organization_id: 'org-test-1',
    sprint_id: 'sprint-1',
    creator_id: 'user-manager',
    title: 'Implement Data Pipeline',
    description: 'Build ETL pipeline',
    type: 'TASK',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    story_points: 8,
    due_date: futureDueDate,
    order: 1,
    parent_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    assignees: [
      {
        user_id: 'user-intern',
        user: { id: 'user-intern', name: 'Intern User', email: 'intern@example.com' },
      },
    ],
    time_entries: [],
    children: [],
    project: {
      id: 'proj-1',
      name: 'Dashboard App',
      status: 'ACTIVE',
      owner_id: 'user-manager',
    },
    sprint: { id: 'sprint-1', name: 'Sprint 1', status: 'ACTIVE' },
  };

  const mockPendingExtension = {
    id: 'ext-req-1',
    organization_id: 'org-test-1',
    project_id: 'proj-1',
    task_id: 'wi-ext-1',
    requester_id: 'user-intern',
    reviewer_id: null,
    original_due_date: futureDueDate,
    requested_due_date: extendedDueDate,
    reason: 'Encountered unexpected external API rate limiting and auth delays',
    status: 'PENDING',
    decision_note: null,
    created_at: new Date(),
    updated_at: new Date(),
    reviewed_at: null,
    requester: { id: 'user-intern', name: 'Intern User', email: 'intern@example.com' },
    reviewer: null,
    task: {
      id: 'wi-ext-1',
      title: 'Implement Data Pipeline',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      due_date: futureDueDate,
    },
  };

  beforeEach(() => {
    mockEntity('project', mockProject);
    mockEntity('projectMember', {
      id: 'pm-intern',
      project_id: 'proj-1',
      user_id: 'user-intern',
      project_role: 'INTERN',
    });
    mockEntity('workItem', mockWorkItem);
    mockEntity('workItemExtensionRequest', mockPendingExtension);
  });

  describe('POST /api/work-items/:id/extension-request', () => {
    it('should reject request without authentication', async () => {
      const res = await request(app)
        .post('/api/work-items/wi-ext-1/extension-request')
        .send({
          requested_due_date: extendedDueDate.toISOString(),
          reason: 'Need extra time',
        });

      expect(res.status).toBe(401);
    });

    it('should reject request when reason is missing', async () => {
      const { authHeader } = setupAuthUser({
        id: 'user-intern',
        role: 'INTERN',
        organization_id: 'org-test-1',
      });

      const res = await request(app)
        .post('/api/work-items/wi-ext-1/extension-request')
        .set('Authorization', authHeader)
        .send({
          requested_due_date: extendedDueDate.toISOString(),
          reason: '   ',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Reason is mandatory');
    });

    it('should reject request when requested date is missing or invalid', async () => {
      const { authHeader } = setupAuthUser({
        id: 'user-intern',
        role: 'INTERN',
        organization_id: 'org-test-1',
      });

      const res = await request(app)
        .post('/api/work-items/wi-ext-1/extension-request')
        .set('Authorization', authHeader)
        .send({
          requested_due_date: 'not-a-valid-date',
          reason: 'Blocked by dependencies',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid requested due date');
    });

    it('should reject request when requested date is not later than current due date', async () => {
      const { authHeader } = setupAuthUser({
        id: 'user-intern',
        role: 'INTERN',
        organization_id: 'org-test-1',
      });

      const earlierDate = new Date(futureDueDate.getTime() - 24 * 60 * 60 * 1000);

      const res = await request(app)
        .post('/api/work-items/wi-ext-1/extension-request')
        .set('Authorization', authHeader)
        .send({
          requested_due_date: earlierDate.toISOString(),
          reason: 'Attempting to set earlier date',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('The requested date must be later than the current due date');
    });

    it('should reject request when a pending extension request already exists', async () => {
      const { authHeader } = setupAuthUser({
        id: 'user-intern',
        role: 'INTERN',
        organization_id: 'org-test-1',
      });

      mockPrisma.workItemExtensionRequest.findFirst.mockResolvedValueOnce(mockPendingExtension);

      const res = await request(app)
        .post('/api/work-items/wi-ext-1/extension-request')
        .set('Authorization', authHeader)
        .send({
          requested_due_date: extendedDueDate.toISOString(),
          reason: 'Second pending request attempt',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('A pending extension request already exists');
    });

    it('should successfully submit extension request without changing task due date', async () => {
      const { authHeader } = setupAuthUser({
        id: 'user-intern',
        role: 'INTERN',
        organization_id: 'org-test-1',
      });

      // No pending request
      mockPrisma.workItemExtensionRequest.findFirst.mockResolvedValueOnce(null);
      mockPrisma.workItemExtensionRequest.create.mockResolvedValueOnce(mockPendingExtension);
      mockPrisma.project.findUnique.mockResolvedValueOnce(mockProject);
      mockPrisma.workItemComment.create.mockResolvedValueOnce({});
      mockPrisma.auditLog.create.mockResolvedValueOnce({});
      mockPrisma.notification.create.mockResolvedValueOnce({ id: 'notif-1' });

      const res = await request(app)
        .post('/api/work-items/wi-ext-1/extension-request')
        .set('Authorization', authHeader)
        .send({
          requested_due_date: extendedDueDate.toISOString(),
          reason: 'Encountered unexpected external API rate limiting and auth delays',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('extension_request');
      expect(res.body.extension_request.status).toBe('PENDING');
      expect(res.body.extension_request.reason).toContain('rate limiting');

      // Crucial requirement: WorkItem update MUST NOT be called when creating request
      expect(mockPrisma.workItem.update).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/work-items/:id/extension-requests', () => {
    it('should list all extension requests for a work item', async () => {
      const { authHeader } = setupAuthUser({
        id: 'user-intern',
        role: 'INTERN',
        organization_id: 'org-test-1',
      });

      mockPrisma.workItemExtensionRequest.findMany.mockResolvedValueOnce([mockPendingExtension]);

      const res = await request(app)
        .get('/api/work-items/wi-ext-1/extension-requests')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('extension_requests');
      expect(res.body.extension_requests).toHaveLength(1);
      expect(res.body.extension_requests[0].id).toBe('ext-req-1');
    });
  });

  describe('POST /api/work-items/:id/extension-requests/:requestId/decision', () => {
    it('should reject invalid decision option', async () => {
      const { authHeader } = setupAuthUser({
        id: 'user-manager',
        role: 'MANAGER',
        organization_id: 'org-test-1',
      });

      const res = await request(app)
        .post('/api/work-items/wi-ext-1/extension-requests/ext-req-1/decision')
        .set('Authorization', authHeader)
        .send({ decision: 'MAYBE' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Decision must be either 'APPROVE' or 'REJECT'");
    });

    it('should reject decision by unauthorized intern', async () => {
      const { authHeader } = setupAuthUser({
        id: 'user-intern',
        role: 'INTERN',
        organization_id: 'org-test-1',
      });

      mockPrisma.project.findUnique.mockResolvedValueOnce({ owner_id: 'user-manager' });
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({ project_role: 'INTERN' });

      const res = await request(app)
        .post('/api/work-items/wi-ext-1/extension-requests/ext-req-1/decision')
        .set('Authorization', authHeader)
        .send({ decision: 'APPROVE' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('only managers and tech leads');
    });

    it('should approve extension request: updates task due date and preserves story points', async () => {
      const { authHeader } = setupAuthUser({
        id: 'user-manager',
        role: 'MANAGER',
        organization_id: 'org-test-1',
      });

      mockPrisma.workItemExtensionRequest.findFirst.mockResolvedValueOnce(mockPendingExtension);

      const approvedReq = {
        ...mockPendingExtension,
        status: 'APPROVED',
        reviewer_id: 'user-manager',
        decision_note: 'Approved for API blocker',
        reviewed_at: new Date(),
      };

      const updatedTask = {
        ...mockWorkItem,
        due_date: extendedDueDate,
        story_points: 8, // Strictly preserved
      };

      mockPrisma.workItemExtensionRequest.update.mockResolvedValueOnce(approvedReq);
      mockPrisma.workItem.update.mockResolvedValueOnce(updatedTask);
      mockPrisma.workItemComment.create.mockResolvedValueOnce({});
      mockPrisma.auditLog.create.mockResolvedValueOnce({});
      mockPrisma.notification.create.mockResolvedValueOnce({ id: 'notif-2' });

      const res = await request(app)
        .post('/api/work-items/wi-ext-1/extension-requests/ext-req-1/decision')
        .set('Authorization', authHeader)
        .send({
          decision: 'APPROVE',
          decision_note: 'Approved for API blocker',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('request');
      expect(res.body.request.status).toBe('APPROVED');
      expect(res.body).toHaveProperty('work_item');
      expect(res.body.work_item.due_date).toBeDefined();
      expect(res.body.work_item.story_points).toBe(8); // Story points untouched
    });

    it('should reject extension request: preserves original due date', async () => {
      const { authHeader } = setupAuthUser({
        id: 'user-manager',
        role: 'MANAGER',
        organization_id: 'org-test-1',
      });

      mockPrisma.workItemExtensionRequest.findFirst.mockResolvedValueOnce(mockPendingExtension);

      const rejectedReq = {
        ...mockPendingExtension,
        status: 'REJECTED',
        reviewer_id: 'user-manager',
        decision_note: 'Scope must be reduced instead',
        reviewed_at: new Date(),
      };

      mockPrisma.workItemExtensionRequest.update.mockResolvedValueOnce(rejectedReq);
      mockPrisma.workItemComment.create.mockResolvedValueOnce({});
      mockPrisma.auditLog.create.mockResolvedValueOnce({});
      mockPrisma.notification.create.mockResolvedValueOnce({ id: 'notif-3' });

      const res = await request(app)
        .post('/api/work-items/wi-ext-1/extension-requests/ext-req-1/decision')
        .set('Authorization', authHeader)
        .send({
          decision: 'REJECT',
          decision_note: 'Scope must be reduced instead',
        });

      expect(res.status).toBe(200);
      expect(res.body.request.status).toBe('REJECTED');
      // When rejected, work item due date was not changed in transaction
      expect(res.body.work_item.due_date).toBe(futureDueDate.toISOString());
    });
  });

  describe('GET /api/projects/:id/extension-requests', () => {
    it('should return project extension requests with optional status filtering', async () => {
      const { authHeader } = setupAuthUser({
        id: 'user-manager',
        role: 'MANAGER',
        organization_id: 'org-test-1',
      });

      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.workItemExtensionRequest.findMany.mockResolvedValueOnce([mockPendingExtension]);

      const res = await request(app)
        .get('/api/projects/proj-1/extension-requests?status=PENDING')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('extension_requests');
      expect(res.body.extension_requests).toHaveLength(1);
    });

    it('should return all project extension requests when no status filter is provided', async () => {
      const { authHeader } = setupAuthUser({
        id: 'user-manager',
        role: 'MANAGER',
        organization_id: 'org-test-1',
      });

      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.workItemExtensionRequest.findMany.mockResolvedValueOnce([mockPendingExtension]);

      const res = await request(app)
        .get('/api/projects/proj-1/extension-requests')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('extension_requests');
      expect(res.body.extension_requests).toHaveLength(1);
    });

    it('should enforce tenant isolation and return 404 if project is in a different organization', async () => {
      const { authHeader } = setupAuthUser({
        id: 'user-manager-other-org',
        role: 'MANAGER',
        organization_id: 'org-other-99',
      });

      mockPrisma.project.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/projects/proj-1/extension-requests')
        .set('Authorization', authHeader);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Project not found');
    });

    it('should reject unauthorized non-member from viewing project extension requests (403)', async () => {
      const { authHeader } = setupAuthUser({
        id: 'user-intern-unauth',
        role: 'INTERN',
        organization_id: 'org-test-1',
      });

      mockPrisma.project.findFirst.mockResolvedValueOnce({
        ...mockProject,
        owner_id: 'user-manager',
      });
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/projects/proj-1/extension-requests')
        .set('Authorization', authHeader);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden|insufficient permissions|not authorized/);
    });
  });

  describe('Analytics Extension Metrics & Task Breakdown Flags', () => {
    it('GET /api/work-items/analytics should calculate dual deadline adherence and extension metrics', async () => {
      const { authHeader } = setupAuthUser({
        id: 'user-manager',
        role: 'MANAGER',
        organization_id: 'org-test-1',
      });

      const completedTaskWithApprovedExt = {
        ...mockWorkItem,
        id: 'wi-completed-1',
        status: 'COMPLETED',
        completed_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // Finished on day 10 (after original day 7, before day 14)
        due_date: extendedDueDate,
        story_points: 8,
      };

      const approvedExtensionRecord = {
        ...mockPendingExtension,
        task_id: 'wi-completed-1',
        status: 'APPROVED',
        original_due_date: futureDueDate,
        requested_due_date: extendedDueDate,
      };

      mockPrisma.workItem.findMany.mockResolvedValueOnce([completedTaskWithApprovedExt]);
      mockPrisma.timeEntry.findMany.mockResolvedValueOnce([]);
      mockPrisma.sprint.findMany.mockResolvedValueOnce([]);
      mockPrisma.project.findMany.mockResolvedValueOnce([mockProject]);
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([]);
      mockPrisma.workItemExtensionRequest.findMany.mockResolvedValueOnce([approvedExtensionRecord]);

      const res = await request(app)
        .get('/api/work-items/analytics?project_id=proj-1')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('extension_metrics');

      const metrics = res.body.extension_metrics;
      expect(metrics.total_requests).toBe(1);
      expect(metrics.approved_requests).toBe(1);
      expect(metrics.tasks_with_approved_extensions_count).toBe(1);
      expect(metrics.approved_on_time_rate).toBe(100);
      expect(metrics.original_on_time_rate).toBe(0); // Missed original day 7 deadline, met approved day 14 deadline

      // Check task breakdown flags
      expect(res.body).toHaveProperty('task_breakdown');
      const itemBreakdown = res.body.task_breakdown.find((t: any) => t.id === 'wi-completed-1');
      expect(itemBreakdown).toBeDefined();
      expect(itemBreakdown.has_extension).toBe(true);
      expect(itemBreakdown.was_completed_by_approved_deadline).toBe(true);
      expect(itemBreakdown.was_completed_by_original_deadline).toBe(false);
      expect(itemBreakdown.story_points).toBe(8); // Full points credited!
    });
  });
});
