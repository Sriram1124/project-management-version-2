import {
  MiraiProjectManagementAdapter,
  MiraiHttpClient,
  MiraiIdentityMapper,
  UpstreamAuthError,
  UpstreamNotFoundError,
  UpstreamRateLimitError,
  UpstreamTimeoutError,
  UpstreamNetworkError,
  UserMappingError,
} from '../src/client';

describe('MIRAI Project Management Integration Adapter', () => {
  // ── 1. MiraiHttpClient Unit Tests ─────────────────────────────────────────
  describe('MiraiHttpClient', () => {
    it('should inject Authorization Bearer header and return parsed JSON', async () => {
      const mockResponse = { data: 'ok' };
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockResponse,
      });

      const client = new MiraiHttpClient({
        baseUrl: 'http://test-upstream.local/api',
        token: 'mock-jwt-token',
        fetchFn: mockFetch as any,
      });

      const result = await client.get('/projects', { status: 'ACTIVE' });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('http://test-upstream.local/api/projects?status=ACTIVE');
      expect(init.headers['Authorization']).toBe('Bearer mock-jwt-token');
      expect(init.headers['Accept']).toBe('application/json');
    });

    it('should throw UpstreamAuthError on 401 or 403 status', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Invalid or expired token' }),
      });

      const client = new MiraiHttpClient({
        baseUrl: 'http://test-upstream.local/api',
        maxRetries: 0,
        fetchFn: mockFetch as any,
      });

      await expect(client.get('/projects')).rejects.toThrow(UpstreamAuthError);
    });

    it('should throw UpstreamNotFoundError on 404', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Project not found' }),
      });

      const client = new MiraiHttpClient({
        baseUrl: 'http://test-upstream.local/api',
        maxRetries: 0,
        fetchFn: mockFetch as any,
      });

      await expect(client.get('/projects/non-existent-id')).rejects.toThrow(UpstreamNotFoundError);
    });

    it('should retry on transient 500 errors and succeed on subsequent attempt', async () => {
      const mockFetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'Internal Server Error' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true }),
        });

      const client = new MiraiHttpClient({
        baseUrl: 'http://test-upstream.local/api',
        maxRetries: 2,
        retryDelayMs: 10,
        fetchFn: mockFetch as any,
      });

      const result = await client.get<any>('/health');
      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw UpstreamRateLimitError on 429 when max retries exceeded', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'content-type': 'application/json', 'retry-after': '1' }),
        json: async () => ({ error: 'Rate limit exceeded' }),
      });

      const client = new MiraiHttpClient({
        baseUrl: 'http://test-upstream.local/api',
        maxRetries: 1,
        retryDelayMs: 10,
        fetchFn: mockFetch as any,
      });

      await expect(client.get('/projects')).rejects.toThrow(UpstreamRateLimitError);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw UpstreamTimeoutError on abort/timeout', async () => {
      const mockFetch = jest.fn().mockImplementation(() => {
        const error: any = new Error('The operation was aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const client = new MiraiHttpClient({
        baseUrl: 'http://test-upstream.local/api',
        maxRetries: 0,
        fetchFn: mockFetch as any,
      });

      await expect(client.get('/projects')).rejects.toThrow(UpstreamTimeoutError);
    });
  });

  // ── 2. MiraiIdentityMapper Unit Tests ─────────────────────────────────────
  describe('MiraiIdentityMapper', () => {
    it('should map a valid source user and preserve UUID TEXT invariant', () => {
      const mapper = new MiraiIdentityMapper('org-uuid-123');
      const sourceUser = {
        id: 'usr-uuid-456',
        email: 'intern@company.com',
        organization_id: 'org-uuid-123',
        cohort_id: 'cohort-uuid-789',
      };

      const mapped = mapper.mapUser(sourceUser);

      expect(mapped.source_user_id).toBe('usr-uuid-456');
      expect(mapped.canonical_user_id).toBe('usr-uuid-456');
      expect(mapped.organization_id).toBe('org-uuid-123');
      expect(mapped.cohort_id).toBe('cohort-uuid-789');
      expect(mapped.email).toBe('intern@company.com');
      expect(mapped.mapped_at).toBeDefined();
    });

    it('should throw UserMappingError when user violates organization boundary', () => {
      const mapper = new MiraiIdentityMapper();
      const sourceUser = {
        id: 'usr-uuid-456',
        email: 'intern@company.com',
        organization_id: 'tenant-org-a',
      };

      expect(() => mapper.mapUser(sourceUser, 'tenant-org-b')).toThrow(UserMappingError);
      expect(() => mapper.mapUser(sourceUser, 'tenant-org-b')).toThrow(
        /Organization boundary violation/
      );
    });

    it('should throw UserMappingError for invalid user payload or malformed email', () => {
      const mapper = new MiraiIdentityMapper('org-123');

      expect(() => mapper.mapUser(null as any)).toThrow(UserMappingError);
      expect(() => mapper.mapUser({ id: '', email: 'valid@mail.com', organization_id: 'org-123' })).toThrow(
        UserMappingError
      );
      expect(() => mapper.mapUser({ id: 'u1', email: 'not-an-email', organization_id: 'org-123' })).toThrow(
        UserMappingError
      );
    });

    it('should apply explicit user and cohort overrides when registered', () => {
      const mapper = new MiraiIdentityMapper('org-123');
      mapper.registerUserOverride('source-u1', 'canonical-u1-mirai');
      mapper.registerCohortOverride('source-c1', 'canonical-c1-mirai');

      const mappedUser = mapper.mapUser({
        id: 'source-u1',
        email: 'user@org.com',
        organization_id: 'org-123',
      });
      expect(mappedUser.canonical_user_id).toBe('canonical-u1-mirai');

      const mappedCohort = mapper.mapCohort({
        id: 'source-c1',
        code: 'COHORT-2026',
        organization_id: 'org-123',
      });
      expect(mappedCohort.canonical_cohort_id).toBe('canonical-c1-mirai');
    });

    describe('resolveSourceUserId', () => {
      it('should preserve the canonical UUID TEXT invariant by default', () => {
        const mapper = new MiraiIdentityMapper('org-123');
        const resolved = mapper.resolveSourceUserId('8a3e7b12-9c44-4821-b3fa-3d84a7e94e21');
        expect(resolved).toBe('8a3e7b12-9c44-4821-b3fa-3d84a7e94e21');
      });

      it('should resolve explicit reverse overrides registered via registerUserOverride', () => {
        const mapper = new MiraiIdentityMapper('org-123');
        mapper.registerUserOverride('source-pm-id-999', 'canonical-mirai-id-999');
        const resolved = mapper.resolveSourceUserId('canonical-mirai-id-999');
        expect(resolved).toBe('source-pm-id-999');
      });

      it('should throw UserMappingError on blank or invalid MIRAI user ID', () => {
        const mapper = new MiraiIdentityMapper('org-123');
        expect(() => mapper.resolveSourceUserId('')).toThrow(UserMappingError);
        expect(() => mapper.resolveSourceUserId('   ')).toThrow(UserMappingError);
      });

      it('should enforce organization boundary if user organization does not match expected boundary', () => {
        const mapper = new MiraiIdentityMapper('org-123');
        expect(() => mapper.resolveSourceUserId('user-uuid-1', 'org-alien', 'org-123')).toThrow(UserMappingError);
      });

      it('should enforce organization boundary on registered user override', () => {
        const mapper = new MiraiIdentityMapper('org-123');
        mapper.registerUserOverride('pm-user-1', 'mirai-user-1', 'org-abc');
        expect(() => mapper.resolveSourceUserId('mirai-user-1', undefined, 'org-xyz')).toThrow(UserMappingError);
      });
    });

    it('should map a batch of users with boundary checking', () => {
      const mapper = new MiraiIdentityMapper('org-shared');
      const users = [
        { id: 'u1', email: 'u1@shared.com', organization_id: 'org-shared' },
        { id: 'u2', email: 'u2@shared.com', organization_id: 'org-shared' },
      ];

      const mapped = mapper.mapUsers(users, 'org-shared');
      expect(mapped).toHaveLength(2);
      expect(mapped[0].source_user_id).toBe('u1');
      expect(mapped[1].source_user_id).toBe('u2');
    });
  });

  // ── 3. MiraiProjectManagementAdapter Unit Tests ───────────────────────────
  describe('MiraiProjectManagementAdapter', () => {
    let mockFetch: jest.Mock;
    let client: MiraiHttpClient;
    let adapter: MiraiProjectManagementAdapter;

    beforeEach(() => {
      mockFetch = jest.fn();
      client = new MiraiHttpClient({
        baseUrl: 'http://test-server.local/api',
        token: 'test-token',
        fetchFn: mockFetch as any,
      });
      adapter = new MiraiProjectManagementAdapter({ client });
    });

    describe('listProjects', () => {
      it('should retrieve and normalize projects with progress metrics', async () => {
        const rawProjects = [
          {
            id: 'proj-1',
            name: 'MIRAI Integration Platform',
            description: 'Core project adapter',
            status: 'ACTIVE',
            methodology: 'SCRUM',
            organization_id: 'org-1',
            owner_id: 'usr-lead',
            start_date: '2026-10-01T00:00:00.000Z',
            end_date: '2026-12-31T00:00:00.000Z',
            created_at: '2026-10-01T00:00:00.000Z',
            updated_at: '2026-10-22T00:00:00.000Z',
            progress: { total: 10, completed: 6, in_progress: 2, percentage: 60 },
          },
        ];

        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ projects: rawProjects }),
        });

        const projects = await adapter.listProjects({ status: 'ACTIVE' });

        expect(projects).toHaveLength(1);
        const p = projects[0];
        expect(p.id).toBe('proj-1');
        expect(p.name).toBe('MIRAI Integration Platform');
        expect(p.progress.completion_percentage).toBe(60);
        expect(p.progress.completed_tasks).toBe(6);
        expect(p.progress.total_tasks).toBe(10);
      });

      it('should handle empty projects list', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ projects: [] }),
        });

        const projects = await adapter.listProjects();
        expect(projects).toEqual([]);
      });

      it('should filter by organization_id', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            projects: [
              { id: 'p1', name: 'P1', organization_id: 'org-a' },
              { id: 'p2', name: 'P2', organization_id: 'org-b' },
            ],
          }),
        });

        const projects = await adapter.listProjects({ organization_id: 'org-a' });
        expect(projects).toHaveLength(1);
        expect(projects[0].id).toBe('p1');
      });
    });

    describe('getProjectById', () => {
      it('should retrieve single project and compute exact task progress from work items', async () => {
        const rawProject = {
          id: 'proj-123',
          name: 'Dashboard Overhaul',
          description: 'Performance enhancements',
          status: 'ACTIVE',
          methodology: 'SCRUM',
          organization_id: 'org-1',
          owner_id: 'usr-1',
        };

        const rawWorkItems = [
          { id: 'w1', status: 'DONE' },
          { id: 'w2', status: 'DONE' },
          { id: 'w3', status: 'IN_PROGRESS' },
          { id: 'w4', status: 'TODO' },
        ];

        // First call: GET /projects/proj-123
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ project: rawProject }),
        });

        // Second call: GET /work-items?project_id=proj-123
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ work_items: rawWorkItems }),
        });

        const project = await adapter.getProjectById('proj-123');

        expect(project.id).toBe('proj-123');
        expect(project.progress.total_tasks).toBe(4);
        expect(project.progress.completed_tasks).toBe(2);
        expect(project.progress.in_progress_tasks).toBe(1);
        expect(project.progress.completion_percentage).toBe(50);
      });

      it('should throw error for empty projectId', async () => {
        await expect(adapter.getProjectById('')).rejects.toThrow(/projectId must be a non-empty string/);
      });
    });

    describe('listProjectTasks', () => {
      it('should retrieve tasks, calculate hierarchy depths and parse assignees', async () => {
        const rawTasks = [
          {
            id: 'task-epic-1',
            type: 'EPIC',
            title: 'Authentication Module',
            parent_id: null,
            status: 'IN_PROGRESS',
            priority: 'HIGH',
            assignees: [{ user_id: 'usr-10' }],
          },
          {
            id: 'task-story-1',
            type: 'STORY',
            title: 'OAuth Integration',
            parent_id: 'task-epic-1',
            status: 'TODO',
            priority: 'HIGH',
            assignees: [{ user_id: 'usr-11' }],
          },
          {
            id: 'task-sub-1',
            type: 'SUBTASK',
            title: 'Token Refresh Handler',
            parent_id: 'task-story-1',
            status: 'TODO',
            priority: 'MEDIUM',
            assignees: [{ user_id: 'usr-11' }, { user_id: 'usr-12' }],
          },
        ];

        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ work_items: rawTasks }),
        });

        const tasks = await adapter.listProjectTasks('proj-1');

        expect(tasks).toHaveLength(3);

        const epic = tasks.find((t) => t.id === 'task-epic-1')!;
        expect(epic.hierarchy_depth).toBe(0);
        expect(epic.assignee_ids).toEqual(['usr-10']);

        const story = tasks.find((t) => t.id === 'task-story-1')!;
        expect(story.hierarchy_depth).toBe(2); // child of epic
        expect(story.parent_id).toBe('task-epic-1');

        const subtask = tasks.find((t) => t.id === 'task-sub-1')!;
        expect(subtask.hierarchy_depth).toBe(3); // child of story
        expect(subtask.assignee_ids).toEqual(['usr-11', 'usr-12']);
      });

      it('should structure tasks into a nested tree when include_children is true', async () => {
        const rawTasks = [
          { id: 'epic-1', type: 'EPIC', title: 'Parent Epic', parent_id: null },
          { id: 'story-1', type: 'STORY', title: 'Child Story', parent_id: 'epic-1' },
        ];

        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ work_items: rawTasks }),
        });

        const tree = await adapter.listProjectTasks('proj-1', { include_children: true });

        expect(tree).toHaveLength(1);
        expect(tree[0].id).toBe('epic-1');
        expect(tree[0].children).toHaveLength(1);
        expect(tree[0].children![0].id).toBe('story-1');
      });

      it('should filter tasks by assigned_to filter', async () => {
        const rawTasks = [
          { id: 't1', title: 'Task 1', assignees: [{ user_id: 'usr-alex' }] },
          { id: 't2', title: 'Task 2', assignees: [{ user_id: 'usr-bob' }] },
        ];

        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ work_items: rawTasks }),
        });

        const tasks = await adapter.listProjectTasks('proj-1', { assigned_to: 'usr-alex' });

        expect(tasks).toHaveLength(1);
        expect(tasks[0].id).toBe('t1');
      });
    });

    describe('listProjectMilestones', () => {
      it('should map project sprints to NormalizedMilestone contracts', async () => {
        const rawSprints = [
          {
            id: 'sprint-1',
            project_id: 'proj-1',
            name: 'Sprint 1 - Foundation',
            goal: 'Establish architecture',
            status: 'COMPLETED',
            start_date: '2026-10-01T00:00:00.000Z',
            end_date: '2026-10-14T00:00:00.000Z',
          },
          {
            id: 'sprint-2',
            project_id: 'proj-1',
            name: 'Sprint 2 - Implementation',
            goal: 'Complete adapter deliverables',
            status: 'ACTIVE',
            start_date: '2026-10-15T00:00:00.000Z',
            end_date: '2026-10-28T00:00:00.000Z',
          },
        ];

        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ sprints: rawSprints }),
        });

        const milestones = await adapter.listProjectMilestones('proj-1');

        expect(milestones).toHaveLength(2);
        expect(milestones[0].id).toBe('sprint-1');
        expect(milestones[0].name).toBe('Sprint 1 - Foundation');
        expect(milestones[0].status).toBe('COMPLETED');
        expect(milestones[1].id).toBe('sprint-2');
        expect(milestones[1].status).toBe('ACTIVE');
      });
    });

    describe('listProjectParticipants', () => {
      it('should normalize members and filter by role', async () => {
        const rawMembers = [
          {
            user_id: 'usr-1',
            name: 'Sriram',
            email: 'sriram@mirai.local',
            project_role: 'TECH_LEAD',
          },
          {
            user_id: 'usr-2',
            name: 'Chaitanya',
            email: 'chaitanya@mirai.local',
            project_role: 'MEMBER',
          },
        ];

        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ members: rawMembers }),
        });

        const leads = await adapter.listProjectParticipants('proj-1', { role: 'TECH_LEAD' });

        expect(leads).toHaveLength(1);
        expect(leads[0].name).toBe('Sriram');
        expect(leads[0].role).toBe('TECH_LEAD');
      });
    });

    describe('listProjectAssignments', () => {
      it('should flatten work item assignees into assignments', async () => {
        const rawTasks = [
          {
            id: 'task-1',
            assignees: [{ user_id: 'usr-a' }, { user_id: 'usr-b' }],
          },
          {
            id: 'task-2',
            assignees: [{ user_id: 'usr-a' }],
          },
        ];

        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ work_items: rawTasks }),
        });

        const assignments = await adapter.listProjectAssignments('proj-1', { user_id: 'usr-b' });

        expect(assignments).toHaveLength(1);
        expect(assignments[0].task_id).toBe('task-1');
        expect(assignments[0].user_id).toBe('usr-b');
      });
    });

    describe('isProjectMember', () => {
      it('should return true when user is a verified member in project_members', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            status: 'success',
            data: {
              is_member: true,
              project_id: 'proj-uuid-1',
              user_id: 'user-uuid-1',
              project_role: 'DEVELOPER',
              joined_at: '2026-10-22T00:00:00.000Z',
            },
          }),
        });

        const isMember = await adapter.isProjectMember('user-uuid-1', 'proj-uuid-1');
        expect(isMember).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
          'http://test-server.local/api/projects/proj-uuid-1/members/user-uuid-1/check',
          expect.anything()
        );
      });

      it('should return false when upstream confirms user is not a member', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            status: 'success',
            data: {
              is_member: false,
              project_id: 'proj-uuid-1',
              user_id: 'user-uuid-2',
            },
          }),
        });

        const isMember = await adapter.isProjectMember('user-uuid-2', 'proj-uuid-1');
        expect(isMember).toBe(false);
      });

      it('should rethrow UpstreamNotFoundError when upstream returns 404 Not Found to distinguish unknown entity from non-membership', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'Project not found' }),
        });

        await expect(adapter.isProjectMember('unknown-user', 'proj-uuid-1')).rejects.toThrow(UpstreamNotFoundError);
      });

      it('should throw UserMappingError or Error on empty or invalid user or project IDs', async () => {
        await expect(adapter.isProjectMember('', 'proj-1')).rejects.toThrow(UserMappingError);
        await expect(adapter.isProjectMember('user-1', '')).rejects.toThrow('Invalid project ID');
        await expect(adapter.isProjectMember('   ', 'proj-1')).rejects.toThrow(UserMappingError);
      });

      it('should throw UserMappingError when identity resolution violates organization boundary', async () => {
        const strictMapper = new MiraiIdentityMapper('org-primary');
        const boundAdapter = new MiraiProjectManagementAdapter({
          client,
          identityMapper: strictMapper,
        });

        strictMapper.registerUserOverride('pm-user-123', 'mirai-user-123', 'org-other');
        await expect(boundAdapter.isProjectMember('mirai-user-123', 'proj-1')).rejects.toThrow(UserMappingError);
      });

      it('should rethrow UpstreamAuthError on 401 or 403 status to prevent false negative/positive', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'Unauthorized service token' }),
        });

        await expect(adapter.isProjectMember('user-1', 'proj-1')).rejects.toThrow(UpstreamAuthError);
      });

      it('should rethrow UpstreamNetworkError on 500 server error', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'Database connection failed' }),
        });

        await expect(adapter.isProjectMember('user-1', 'proj-1')).rejects.toThrow(UpstreamNetworkError);
      });
    });

    describe('getProjectIdsForUser', () => {
      it('should return all project IDs for a verified project member', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            status: 'success',
            data: {
              user_id: 'user-uuid-1',
              project_ids: ['proj-1', 'proj-2', 'proj-3'],
              total: 3,
            },
          }),
        });

        const projectIds = await adapter.getProjectIdsForUser('user-uuid-1');
        expect(projectIds).toEqual(['proj-1', 'proj-2', 'proj-3']);
        expect(mockFetch).toHaveBeenCalledWith(
          'http://test-server.local/api/users/user-uuid-1/project-memberships',
          expect.anything()
        );
      });

      it('should return an empty array when the user belongs to 0 projects', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            status: 'success',
            data: {
              user_id: 'user-uuid-empty',
              project_ids: [],
              total: 0,
            },
          }),
        });

        const projectIds = await adapter.getProjectIdsForUser('user-uuid-empty');
        expect(projectIds).toEqual([]);
      });

      it('should rethrow UpstreamNotFoundError when upstream returns 404 Not Found to distinguish unknown user from zero memberships', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'User not found' }),
        });

        await expect(adapter.getProjectIdsForUser('unregistered-user')).rejects.toThrow(UpstreamNotFoundError);
      });

      it('should throw UserMappingError on invalid or blank user ID', async () => {
        await expect(adapter.getProjectIdsForUser('')).rejects.toThrow(UserMappingError);
        await expect(adapter.getProjectIdsForUser('   ')).rejects.toThrow(UserMappingError);
      });

      it('should rethrow UpstreamAuthError on 401/403', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 403,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'Forbidden' }),
        });

        await expect(adapter.getProjectIdsForUser('user-1')).rejects.toThrow(UpstreamAuthError);
      });

      it('should rethrow UpstreamNetworkError on 500 error', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'Internal error' }),
        });

        await expect(adapter.getProjectIdsForUser('user-1')).rejects.toThrow(UpstreamNetworkError);
      });
    });

    describe('createFromEnv', () => {
      it('should instantiate adapter using environment variables', () => {
        process.env.PROJECT_MANAGEMENT_API_URL = 'http://env-upstream.test/api';
        process.env.PROJECT_MANAGEMENT_API_TOKEN = 'secret-env-token';

        const envAdapter = MiraiProjectManagementAdapter.createFromEnv();
        expect(envAdapter).toBeInstanceOf(MiraiProjectManagementAdapter);
        expect(envAdapter.getIdentityMapper()).toBeInstanceOf(MiraiIdentityMapper);
      });
    });
  });
});

