/**
 * MIRAI Project Management Backend Integration Adapter
 * 
 * Implements the integration adapter allowing MIRAI to retrieve project data
 * from the hosted Project Management System via existing APIs without duplicating
 * database tables or business logic.
 * 
 * Strict Invariants:
 * - All IDs are UUID strings stored as TEXT; invariants are preserved without remapping or type changes.
 * - Single-purpose, strongly-typed methods.
 * - Comprehensive error handling and normalization.
 */

import { MiraiHttpClient } from './mirai-http-client';
import { MiraiIdentityMapper } from './mirai-identity-mapper';
import {
  AssignmentFilters,
  NormalizedAssignment,
  NormalizedMilestone,
  NormalizedParticipant,
  NormalizedProject,
  NormalizedProjectProgress,
  NormalizedTask,
  ParticipantFilters,
  ProjectFilters,
  TaskFilters,
  WorkItemHierarchyType,
} from './mirai-adapter.types';

export interface ProjectManagementAdapterOptions {
  client: MiraiHttpClient;
  identityMapper?: MiraiIdentityMapper;
}

export class MiraiProjectManagementAdapter {
  private readonly client: MiraiHttpClient;
  private readonly identityMapper: MiraiIdentityMapper;

  constructor(options: ProjectManagementAdapterOptions) {
    this.client = options.client;
    this.identityMapper = options.identityMapper || new MiraiIdentityMapper();
  }

  /**
   * Factory method to instantiate the adapter from environment variables
   */
  static createFromEnv(): MiraiProjectManagementAdapter {
    const baseUrl = process.env.PROJECT_MANAGEMENT_API_URL || 'http://localhost:3001/api';
    const token = process.env.PROJECT_MANAGEMENT_API_TOKEN;
    const timeoutMs = process.env.PROJECT_MANAGEMENT_API_TIMEOUT_MS
      ? parseInt(process.env.PROJECT_MANAGEMENT_API_TIMEOUT_MS, 10)
      : 8000;
    const maxRetries = process.env.PROJECT_MANAGEMENT_API_MAX_RETRIES
      ? parseInt(process.env.PROJECT_MANAGEMENT_API_MAX_RETRIES, 10)
      : 3;

    const client = new MiraiHttpClient({
      baseUrl,
      token,
      timeoutMs,
      maxRetries,
    });

    return new MiraiProjectManagementAdapter({
      client,
      identityMapper: new MiraiIdentityMapper(),
    });
  }

  /**
   * Calculate hierarchy depth based on task type and relationship
   */
  private computeHierarchyDepth(
    type: string,
    parentId: string | null,
    taskMap: Map<string, any>
  ): number {
    if (!parentId) {
      const upper = (type || '').toUpperCase();
      if (upper === 'EPIC') return 0;
      if (upper === 'STORY') return 1;
      return 0; // Standalone tasks start at depth 0
    }

    let depth = 1;
    let currentParentId: string | null = parentId;
    const visited = new Set<string>();

    while (currentParentId && taskMap.has(currentParentId)) {
      if (visited.has(currentParentId)) break; // Prevent cycle loops
      visited.add(currentParentId);
      depth++;
      const parentTask = taskMap.get(currentParentId);
      currentParentId = parentTask?.parent_id || null;
    }

    return depth;
  }

  /**
   * Helper to normalize raw project object into NormalizedProject contract
   */
  private normalizeProject(raw: any, tasks?: any[]): NormalizedProject {
    let progress: NormalizedProjectProgress;

    if (tasks && Array.isArray(tasks) && tasks.length > 0) {
      const total = tasks.length;
      const completed = tasks.filter((t: any) => t.status === 'DONE').length;
      const inProgress = tasks.filter((t: any) => t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW').length;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      progress = {
        total_tasks: total,
        completed_tasks: completed,
        in_progress_tasks: inProgress,
        completion_percentage: pct,
      };
    } else if (raw.progress) {
      progress = {
        total_tasks: Number(raw.progress.total_tasks || raw.progress.total || 0),
        completed_tasks: Number(raw.progress.completed_tasks || raw.progress.completed || 0),
        in_progress_tasks: Number(raw.progress.in_progress_tasks || raw.progress.in_progress || 0),
        completion_percentage: Number(raw.progress.completion_percentage || raw.progress.percentage || 0),
      };
    } else {
      progress = {
        total_tasks: 0,
        completed_tasks: 0,
        in_progress_tasks: 0,
        completion_percentage: 0,
      };
    }

    return {
      id: String(raw.id),
      name: String(raw.name || ''),
      description: raw.description ? String(raw.description) : null,
      status: String(raw.status || 'PLANNING'),
      methodology: String(raw.methodology || 'SCRUM'),
      organization_id: String(raw.organization_id || ''),
      owner_id: String(raw.owner_id || ''),
      start_date: raw.start_date ? new Date(raw.start_date).toISOString() : null,
      end_date: raw.end_date ? new Date(raw.end_date).toISOString() : null,
      progress,
      created_at: raw.created_at ? new Date(raw.created_at).toISOString() : new Date().toISOString(),
      updated_at: raw.updated_at ? new Date(raw.updated_at).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Helper to extract assignee IDs from work item data
   */
  private extractAssigneeIds(item: any): string[] {
    const ids: Set<string> = new Set();
    if (Array.isArray(item.assignees)) {
      for (const a of item.assignees) {
        const id = a?.user_id || a?.userId || a?.id || a?.user?.id;
        if (id) ids.add(String(id));
      }
    }
    if (item.assignee_id) {
      ids.add(String(item.assignee_id));
    }
    if (item.assignee?.id) {
      ids.add(String(item.assignee.id));
    }
    return Array.from(ids);
  }

  /**
   * 1. listProjects: Retrieves projects matching optional filters
   */
  async listProjects(filters?: ProjectFilters): Promise<NormalizedProject[]> {
    const params: Record<string, any> = {};
    if (filters?.status) params.status = filters.status;
    if (filters?.my !== undefined) params.my = filters.my;
    if (filters?.limit) params.limit = filters.limit;
    if (filters?.offset) params.offset = filters.offset;

    const response = await this.client.get<any>('/projects', params);
    const rawProjects = Array.isArray(response)
      ? response
      : (Array.isArray(response?.projects) ? response.projects : []);

    let filtered = rawProjects;
    if (filters?.organization_id) {
      filtered = filtered.filter((p: any) => p.organization_id === filters.organization_id);
    }

    return filtered.map((p: any) => this.normalizeProject(p));
  }

  /**
   * 2. getProjectById: Retrieves a single project with live progress calculation
   */
  async getProjectById(projectId: string): Promise<NormalizedProject> {
    if (!projectId || typeof projectId !== 'string') {
      throw new Error('projectId must be a non-empty string');
    }

    const rawProjectResponse = await this.client.get<any>(`/projects/${projectId}`);
    const rawProject = rawProjectResponse?.project || rawProjectResponse;

    // Fetch tasks to calculate exact progress metrics
    let tasks: any[] = [];
    try {
      const taskResponse = await this.client.get<any>('/work-items', { project_id: projectId });
      tasks = Array.isArray(taskResponse)
        ? taskResponse
        : (Array.isArray(taskResponse?.work_items) ? taskResponse.work_items : []);
    } catch {
      // If task fetch fails, proceed with raw project data
    }

    return this.normalizeProject(rawProject, tasks);
  }

  /**
   * 3. listProjectTasks: Retrieves hierarchical tasks/work items with depth calculation and optional tree nesting
   */
  async listProjectTasks(projectId: string, filters?: TaskFilters): Promise<NormalizedTask[]> {
    if (!projectId || typeof projectId !== 'string') {
      throw new Error('projectId must be a non-empty string');
    }

    const params: Record<string, any> = { project_id: projectId };
    if (filters?.sprint_id) params.sprint_id = filters.sprint_id;
    if (filters?.type) params.type = filters.type;
    if (filters?.status) params.status = filters.status;
    if (filters?.priority) params.priority = filters.priority;
    if (filters?.parent_id) params.parent_id = filters.parent_id;
    if (filters?.limit) params.limit = filters.limit;

    const response = await this.client.get<any>('/work-items', params);
    const rawItems: any[] = Array.isArray(response)
      ? response
      : (Array.isArray(response?.work_items) ? response.work_items : []);

    // Build map for hierarchy depth computation
    const itemMap = new Map<string, any>();
    for (const item of rawItems) {
      itemMap.set(String(item.id), item);
    }

    const normalizedList: NormalizedTask[] = rawItems.map((item) => {
      const parentId = item.parent_id ? String(item.parent_id) : null;
      const type = (item.type || 'TASK') as WorkItemHierarchyType;
      const depth = this.computeHierarchyDepth(type, parentId, itemMap);

      return {
        id: String(item.id),
        project_id: String(item.project_id || projectId),
        parent_id: parentId,
        type,
        title: String(item.title || ''),
        description: item.description ? String(item.description) : null,
        status: String(item.status || 'TODO'),
        priority: String(item.priority || 'MEDIUM'),
        story_points: item.story_points !== undefined && item.story_points !== null ? Number(item.story_points) : null,
        sprint_id: item.sprint_id ? String(item.sprint_id) : null,
        assignee_ids: this.extractAssigneeIds(item),
        due_date: item.due_date ? new Date(item.due_date).toISOString() : null,
        completed_at: item.completed_at ? new Date(item.completed_at).toISOString() : null,
        hierarchy_depth: depth,
        created_at: item.created_at ? new Date(item.created_at).toISOString() : new Date().toISOString(),
        updated_at: item.updated_at ? new Date(item.updated_at).toISOString() : new Date().toISOString(),
      };
    });

    // Client-side filtering by assigned_to if requested
    let result = normalizedList;
    if (filters?.assigned_to) {
      result = result.filter((task) => task.assignee_ids.includes(filters.assigned_to!));
    }

    // Build hierarchical tree if include_children is true
    if (filters?.include_children) {
      const taskLookup = new Map<string, NormalizedTask>();
      const topLevel: NormalizedTask[] = [];

      for (const t of result) {
        taskLookup.set(t.id, { ...t, children: [] });
      }

      for (const t of result) {
        const current = taskLookup.get(t.id)!;
        if (t.parent_id && taskLookup.has(t.parent_id)) {
          const parent = taskLookup.get(t.parent_id)!;
          parent.children = parent.children || [];
          parent.children.push(current);
        } else {
          topLevel.push(current);
        }
      }

      return topLevel;
    }

    return result;
  }

  /**
   * 4. listProjectMilestones: Maps sprints to milestones
   */
  async listProjectMilestones(projectId: string): Promise<NormalizedMilestone[]> {
    if (!projectId || typeof projectId !== 'string') {
      throw new Error('projectId must be a non-empty string');
    }

    const response = await this.client.get<any>(`/projects/${projectId}/sprints`);
    const rawSprints: any[] = Array.isArray(response)
      ? response
      : (Array.isArray(response?.sprints) ? response.sprints : (Array.isArray(response?.data) ? response.data : []));

    return rawSprints.map((sprint) => ({
      id: String(sprint.id),
      project_id: String(sprint.project_id || projectId),
      name: String(sprint.name || ''),
      goal: sprint.goal ? String(sprint.goal) : null,
      status: String(sprint.status || 'PLANNED'),
      start_date: sprint.start_date ? new Date(sprint.start_date).toISOString() : null,
      end_date: sprint.end_date ? new Date(sprint.end_date).toISOString() : null,
      created_at: sprint.created_at ? new Date(sprint.created_at).toISOString() : new Date().toISOString(),
      updated_at: sprint.updated_at ? new Date(sprint.updated_at).toISOString() : new Date().toISOString(),
    }));
  }

  /**
   * 5. listProjectParticipants: Retrieves project members and maps their roles
   */
  async listProjectParticipants(projectId: string, filters?: ParticipantFilters): Promise<NormalizedParticipant[]> {
    if (!projectId || typeof projectId !== 'string') {
      throw new Error('projectId must be a non-empty string');
    }

    const params: Record<string, any> = {};
    if (filters?.search) params.search = filters.search;

    const response = await this.client.get<any>(`/projects/${projectId}/members`, params);
    const rawMembers: any[] = Array.isArray(response)
      ? response
      : (Array.isArray(response?.members) ? response.members : (Array.isArray(response?.data) ? response.data : []));

    const normalized = rawMembers.map((m) => {
      const user = m.user || {};
      const id = String(m.user_id || m.userId || m.id || user.id || '');
      const name = String(m.name || user.name || '');
      const email = String(m.email || user.email || '');
      const role = String(m.project_role || m.role || 'MEMBER');

      return {
        id,
        project_id: projectId,
        name,
        email,
        role,
        joined_at: m.created_at ? new Date(m.created_at).toISOString() : undefined,
      };
    });

    if (filters?.role) {
      const roleFilter = filters.role.toUpperCase();
      return normalized.filter((p) => p.role.toUpperCase() === roleFilter);
    }

    return normalized;
  }

  /**
   * 6. listProjectAssignments: Flattens work item assignees into NormalizedAssignment records
   */
  async listProjectAssignments(projectId: string, filters?: AssignmentFilters): Promise<NormalizedAssignment[]> {
    if (!projectId || typeof projectId !== 'string') {
      throw new Error('projectId must be a non-empty string');
    }

    const tasks = await this.listProjectTasks(projectId);
    const assignments: NormalizedAssignment[] = [];

    for (const task of tasks) {
      for (const userId of task.assignee_ids) {
        assignments.push({
          task_id: task.id,
          project_id: projectId,
          user_id: userId,
          assigned_at: task.created_at,
        });
      }
    }

    let filtered = assignments;
    if (filters?.task_id) {
      filtered = filtered.filter((a) => a.task_id === filters.task_id);
    }
    if (filters?.user_id) {
      filtered = filtered.filter((a) => a.user_id === filters.user_id);
    }

    return filtered;
  }

  /**
   * Access the identity mapper instance
   */
  getIdentityMapper(): MiraiIdentityMapper {
    return this.identityMapper;
  }
}

