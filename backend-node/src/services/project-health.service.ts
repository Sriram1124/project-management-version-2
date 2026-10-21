import { WorkItemType, WorkItemStatus, WorkItemPriority } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { cacheService } from './cache.service';

export type HealthStatus = 'HEALTHY' | 'NEEDS_ATTENTION' | 'AT_RISK' | 'CRITICAL' | 'NOT_ASSESSED' | 'INSUFFICIENT_DATA';
export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | 'INSUFFICIENT_DATA';
export type ScheduleHealth = 'ON_TRACK' | 'BEHIND' | 'AHEAD' | 'NO_SCHEDULE';

/**
 * Configurable thresholds for blocked-work percentage of remaining story points.
 * formula: (blockedStoryPoints / remainingStoryPoints) * 100
 */
export const BLOCKED_RISK_THRESHOLDS = {
  LOW_EXPOSURE_MAX: 25, // < 25%: Low exposure; monitor. Do not classify as AT_RISK solely on percentage.
  POTENTIAL_RISK_MIN: 25, // 25% to < 50%: Potential delivery risk (AT_RISK)
  HIGH_RISK_MIN: 50, // >= 50%: High delivery risk (evaluate for CRITICAL or AT_RISK)
} as const;

function getEndOfDueDate(dueDateVal: string | Date | null | undefined, timeZone = 'Asia/Kolkata'): Date | null {
  if (!dueDateVal) return null;
  const d = new Date(dueDateVal);
  if (isNaN(d.getTime())) return null;

  let dateStr = '';
  if (typeof dueDateVal === 'string') {
    const match = dueDateVal.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
      dateStr = match[1];
    }
  }
  if (!dateStr) {
    dateStr = d.toLocaleDateString('en-CA', { timeZone });
  }

  if (timeZone === 'Asia/Kolkata') {
    return new Date(`${dateStr}T23:59:59.999+05:30`);
  }

  return new Date(`${dateStr}T23:59:59.999`);
}

export interface StoryHealthItem {
  id: string;
  title: string;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  total_sp: number;
  completed_sp: number;
  remaining_sp: number;
  progress_percentage: number | null;
  task_count: number;
  completed_task_count: number;
  is_blocked: boolean;
  is_overdue: boolean;
  sprint_id?: string | null;
}

export interface ProjectHealthItem {
  id: string;
  name: string;
  status: string; // Project lifecycle status (e.g. ACTIVE, PLANNED, ARCHIVED)
  health: HealthStatus;
  health_score: number | null;
  risk_level: RiskLevel;
  schedule_health: ScheduleHealth;
  schedule_variance_days?: number | null;
  schedule_variance_percentage?: number | null;
  reasons: string[];
  risk_factors: string[];
  recommended_actions: string[];
  warnings?: string[];
  completion_percentage: number | null; // Kept for backwards compatibility
  progress_percentage: number | null; // SP-based project progress percentage
  delivery_progress_percentage?: number | null;
  completion_rate: number;
  overdue_percentage: number;
  blocked_percentage: number;
  has_estimated_work: boolean;
  total_sp: number;
  completed_sp: number;
  remaining_sp: number;
  overdue_sp?: number;
  overdue_sp_percentage?: number;
  blocked_sp: number;
  blocked_sp_percentage?: number;
  blocked_work_percentage: number | null;
  totalSP?: number;
  completedSP?: number;
  remainingSP?: number;
  deliveryProgressPercentage?: number | null;
  overdueSP?: number;
  overdueSPPercentage?: number;
  blockedSP?: number;
  blockedSPPercentage?: number;
  unestimated_blockers_count: number;
  story_count: number;
  completed_stories_count: number;
  blocked_stories_count: number;
  overdue_stories_count: number;
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  blocked_tasks: number;
  critical_tasks: number;
  project_overdue_days: number;
  max_task_overdue_days: number;
  stories?: StoryHealthItem[];
}

export interface PortfolioHealthSummary {
  total: number;
  assessed: number;
  healthy: number;
  needs_attention?: number;
  at_risk_only?: number;
  at_risk: number;
  critical: number;
  not_assessed: number;
  insufficient_data: number;
  attention_required: number;
  attention_rate: number;
}

export interface PortfolioHealthDistribution {
  healthy: { count: number; percentage: number };
  needs_attention?: { count: number; percentage: number };
  at_risk: { count: number; percentage: number };
  critical: { count: number; percentage: number };
  not_assessed: { count: number; percentage: number };
  insufficient_data: { count: number; percentage: number };
}

export interface PortfolioHealthResponse {
  summary: PortfolioHealthSummary;
  distribution: PortfolioHealthDistribution;
  projects: ProjectHealthItem[];
}

export class ProjectHealthService {
  /**
   * Helper to ensure user belongs to an organization or fallback for Super Admin
   */
  private static async getEffectiveOrgId(user: any): Promise<string | null> {
    if (user?.organization_id) return user.organization_id;
    if (user?.organization?.id) return user.organization.id;

    // Super Admin global fallback
    const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
    return firstOrg?.id || null;
  }

  /**
   * Classify health and compute story-point progress for a single project
   */
  static classifyProjectHealth(project: {
    id: string;
    name: string;
    status: string;
    methodology?: string | null;
    start_date?: Date | null;
    end_date?: Date | null;
    work_items?: Array<{
      id: string;
      title?: string;
      type: WorkItemType;
      status: WorkItemStatus;
      priority: WorkItemPriority;
      due_date?: Date | null;
      story_points?: number | null;
      parent_id?: string | null;
      sprint_id?: string | null;
    }>;
    sprints?: Array<{
      id: string;
      status: string;
      start_date?: Date | null;
      end_date?: Date | null;
    }>;
  }): {
    health: HealthStatus;
    health_score: number | null;
    risk_level: RiskLevel;
    schedule_health: ScheduleHealth;
    schedule_variance_days?: number | null;
    schedule_variance_percentage?: number | null;
    completion_rate: number;
    overdue_percentage: number;
    blocked_percentage: number;
    reasons: string[];
    risk_factors: string[];
    recommended_actions: string[];
    warnings?: string[];
    has_estimated_work: boolean;
    total_sp: number;
    completed_sp: number;
    remaining_sp: number;
    delivery_progress_percentage: number | null;
    overdue_sp: number;
    overdue_sp_percentage: number;
    blocked_sp: number;
    blocked_sp_percentage: number;
    blocked_work_percentage: number | null;
    totalSP?: number;
    completedSP?: number;
    remainingSP?: number;
    deliveryProgressPercentage?: number | null;
    overdueSP?: number;
    overdueSPPercentage?: number;
    blockedSP?: number;
    blockedSPPercentage?: number;
    unestimated_blockers_count: number;
    progress_percentage: number | null;
    completion_percentage: number | null;
    story_count: number;
    completed_stories_count: number;
    blocked_stories_count: number;
    overdue_stories_count: number;
    total_tasks: number;
    completed_tasks: number;
    overdue_tasks: number;
    blocked_tasks: number;
    critical_tasks: number;
    project_overdue_days: number;
    max_task_overdue_days: number;
    stories: StoryHealthItem[];
  } {
    const workItems = project.work_items || [];
    const sprints = project.sprints || [];
    const now = new Date();

    const sprintMap = new Map<string, any>(sprints.map((s: any) => [s.id, s]));

    // 1. All parent IDs that have children in this project (to prevent double counting)
    const parentIdsWithChildren = new Set(workItems.map((w: any) => w.parent_id).filter(Boolean));

    // 2. Identify eligible leaf deliverables:
    // Any work item in the project that is NOT an Epic and has NO children in the project,
    // OR has children but none of the children have estimated story points, while the parent item itself has story points.
    const eligibleLeaves = workItems.filter((w: any) => {
      if (w.type === WorkItemType.EPIC) return false;
      if (!parentIdsWithChildren.has(w.id)) return true;
      const children = workItems.filter((c: any) => c.parent_id === w.id);
      const childPoints = children.reduce((sum: number, c: any) => sum + (Number(c.story_points) || 0), 0);
      return childPoints === 0 && Number(w.story_points || 0) > 0;
    });

    // 3. Compute story-level progress and metrics
    const stories = workItems.filter((w: any) => w.type === WorkItemType.STORY);
    const storyItems: StoryHealthItem[] = stories.map((s: any) => {
      // Find all leaf tasks under this story
      const childTasks = eligibleLeaves.filter((t: any) => {
        if (t.id === s.id) return false;
        if (t.parent_id === s.id) return true;
        const parentTask = workItems.find((p: any) => p.id === t.parent_id);
        return parentTask && parentTask.parent_id === s.id;
      });

      const hasChildren = childTasks.length > 0;
      const sTotalSp = hasChildren
        ? childTasks.reduce((sum: number, t: any) => sum + (Number(t.story_points) || 0), 0)
        : Number(s.story_points) || 0;

      const sCompletedTasks = childTasks.filter((t: any) => t.status === WorkItemStatus.COMPLETED);
      const sCompletedSp = hasChildren
        ? sCompletedTasks.reduce((sum: number, t: any) => sum + (Number(t.story_points) || 0), 0)
        : (s.status === WorkItemStatus.COMPLETED ? sTotalSp : 0);

      const sRemainingSp = Math.max(0, sTotalSp - sCompletedSp);
      const sProgress = sTotalSp > 0
        ? Math.round((sCompletedSp / sTotalSp) * 100)
        : (s.status === WorkItemStatus.COMPLETED ? 100 : null);

      // Exclude completed work from remaining blocked work
      const isStoryExplicitlyBlocked = s.status === WorkItemStatus.BLOCKED && s.status !== WorkItemStatus.COMPLETED;
      const hasBlockedChildTask = childTasks.some(
        (t: any) => t.status === WorkItemStatus.BLOCKED && t.status !== WorkItemStatus.COMPLETED
      );
      const isBlocked = isStoryExplicitlyBlocked || hasBlockedChildTask;

      const storyEod = getEndOfDueDate(s.due_date);
      const isStoryExplicitlyOverdue = Boolean(
        storyEod && now > storyEod && s.status !== WorkItemStatus.COMPLETED && (s.status as any) !== 'CANCELLED'
      );
      const hasOverdueChildTask = childTasks.some((t: any) => {
        const tEod = getEndOfDueDate(t.due_date);
        return Boolean(tEod && now > tEod && t.status !== WorkItemStatus.COMPLETED && (t.status as any) !== 'CANCELLED');
      });
      const isOverdue = isStoryExplicitlyOverdue || hasOverdueChildTask;

      return {
        id: s.id,
        title: s.title || 'Story',
        status: s.status,
        priority: s.priority,
        total_sp: sTotalSp,
        completed_sp: sCompletedSp,
        remaining_sp: sRemainingSp,
        progress_percentage: sProgress,
        task_count: hasChildren ? childTasks.length : 1,
        completed_task_count: hasChildren ? sCompletedTasks.length : (s.status === WorkItemStatus.COMPLETED ? 1 : 0),
        is_blocked: isBlocked,
        is_overdue: isOverdue,
        sprint_id: s.sprint_id || null,
      };
    });

    // 4. Compute project-level story points aggregation from eligible leaf deliverables
    const total_sp = eligibleLeaves.reduce((sum: number, t: any) => sum + (Number(t.story_points) || 0), 0);
    const completed_sp = eligibleLeaves
      .filter((t: any) => t.status === WorkItemStatus.COMPLETED)
      .reduce((sum: number, t: any) => sum + (Number(t.story_points) || 0), 0);
    const remaining_sp = Math.max(0, total_sp - completed_sp);
    const has_estimated_work = total_sp > 0;
    const progress_percentage = has_estimated_work ? Math.round((completed_sp / total_sp) * 100) : null;

    // Unfinished leaf deliverables (excluding completed or cancelled work)
    const unfinishedLeaves = eligibleLeaves.filter(
      (t: any) => t.status !== WorkItemStatus.COMPLETED && (t.status as any) !== 'CANCELLED'
    );

    // Blocked leaf deliverables (only active/unfinished work)
    const blockedLeaves = unfinishedLeaves.filter((t: any) => t.status === WorkItemStatus.BLOCKED);
    const blocked_tasks = blockedLeaves.length;
    const blocked_sp = blockedLeaves.reduce((sum: number, t: any) => sum + (Number(t.story_points) || 0), 0);
    const blocked_sp_percentage = total_sp > 0 ? Number(((blocked_sp / total_sp) * 100).toFixed(1)) : 0;

    // Formula: blockedWorkPercentage = (blockedStoryPoints / remainingStoryPoints) * 100
    const blocked_work_percentage =
      remaining_sp > 0 ? Number(((blocked_sp / remaining_sp) * 100).toFixed(1)) : 0;

    // Task and story counts from eligible leaves
    const total_tasks = eligibleLeaves.length;
    const completed_tasks = eligibleLeaves.filter((t: any) => t.status === WorkItemStatus.COMPLETED).length;
    const overdueTasksList = unfinishedLeaves.filter((t: any) => {
      const tEod = getEndOfDueDate(t.due_date);
      return Boolean(tEod && now > tEod);
    });
    const overdue_tasks = overdueTasksList.length;
    const overdue_sp = overdueTasksList.reduce((sum: number, t: any) => sum + (Number(t.story_points) || 0), 0);
    const overdue_sp_percentage = total_sp > 0 ? Number(((overdue_sp / total_sp) * 100).toFixed(1)) : 0;

    const completed_stories_count = storyItems.filter(
      (s) => s.status === WorkItemStatus.COMPLETED || (s.total_sp > 0 && s.completed_sp === s.total_sp)
    ).length;
    const blocked_stories_count = storyItems.filter((s) => s.is_blocked).length;
    const overdue_stories_count = storyItems.filter((s) => s.is_overdue).length;

    // Overdue days calculation
    let maxTaskOverdueDays = 0;
    if (overdueTasksList.length > 0) {
      maxTaskOverdueDays = Math.max(
        ...overdueTasksList.map((t) => {
          const tEod = getEndOfDueDate(t.due_date) || new Date(t.due_date!);
          return Math.max(1, Math.floor((now.getTime() - tEod.getTime()) / (1000 * 60 * 60 * 24)));
        })
      );
    }

    const projectEndDatePassed = Boolean(
      project.end_date && new Date(project.end_date) < now && (has_estimated_work ? remaining_sp > 0 : total_tasks > completed_tasks)
    );
    let projectOverdueDays = 0;
    if (projectEndDatePassed && project.end_date) {
      projectOverdueDays = Math.max(
        1,
        Math.floor((now.getTime() - new Date(project.end_date).getTime()) / (1000 * 60 * 60 * 24))
      );
    }

    // Schedule / Sprint deadlines calculation
    const activeSprint = sprints.find((s) => s.status === 'ACTIVE');
    const sprintOverdue = Boolean(
      activeSprint &&
        activeSprint.end_date &&
        new Date(activeSprint.end_date) < now &&
        (has_estimated_work ? remaining_sp > 0 : total_tasks > completed_tasks)
    );

    let daysUntilDeadline: number | null = null;
    if (project.end_date && new Date(project.end_date) >= now) {
      daysUntilDeadline = Math.floor((new Date(project.end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Classify blocked items by sprint scope & estimation
    const blockedInActiveSprint: any[] = [];
    const blockedInCompletedSprint: any[] = [];
    const blockedInPlannedOrBacklog: any[] = [];
    const unestimatedBlockers: any[] = [];

    for (const t of blockedLeaves) {
      let itemSprintId = t.sprint_id;
      if (!itemSprintId && t.parent_id) {
        const parent = workItems.find((w: any) => w.id === t.parent_id);
        if (parent?.sprint_id) itemSprintId = parent.sprint_id;
      }
      const itemSprint = itemSprintId ? sprintMap.get(itemSprintId) : null;
      const sprintLifecycle = itemSprint ? itemSprint.status : 'BACKLOG';

      if (sprintLifecycle === 'ACTIVE') {
        blockedInActiveSprint.push(t);
      } else if (sprintLifecycle === 'COMPLETED') {
        blockedInCompletedSprint.push(t);
      } else {
        blockedInPlannedOrBacklog.push(t);
      }

      if (!t.story_points || Number(t.story_points) === 0) {
        unestimatedBlockers.push(t);
      }
    }
    const unestimated_blockers_count = unestimatedBlockers.length;

    // Collect non-blocking data quality and lifecycle warnings
    const warnings: string[] = [];
    if (blockedInCompletedSprint.length > 0) {
      warnings.push(
        `${blockedInCompletedSprint.length} unresolved blocked deliverable(s) in completed sprint · Flagged for review / rollover`
      );
    }
    if (unestimated_blockers_count > 0) {
      warnings.push(
        `${unestimated_blockers_count} blocked deliverable(s) with 0 estimated SP · Delivery impact unknown (estimation required)`
      );
    }
    const isKanban = project.methodology === 'KANBAN';
    const hasExplicitSchedule = isKanban ? Boolean(project.end_date) : Boolean(project.end_date || activeSprint);
    if (remaining_sp > 0 && !hasExplicitSchedule) {
      warnings.push(
        isKanban
          ? 'Missing schedule data: No project deadline scheduled'
          : 'Missing schedule data: No project deadline or active sprint scheduled'
      );
    }

    // 5. Insufficient Data / Not Assessed check:
    // If no eligible estimated work defined or 0 tasks, return NOT_ASSESSED / INSUFFICIENT_DATA with null progress percentage
    if (!has_estimated_work || total_tasks === 0) {
      const completion_rate = total_tasks > 0 ? Math.round((completed_tasks / total_tasks) * 100) : 0;
      const overdue_percentage = total_tasks > 0 ? Math.round((overdue_tasks / total_tasks) * 100) : 0;
      return {
        health: 'NOT_ASSESSED',
        health_score: null,
        risk_level: 'INSUFFICIENT_DATA',
        schedule_health: 'NO_SCHEDULE',
        schedule_variance_days: null,
        schedule_variance_percentage: null,
        completion_rate,
        overdue_percentage,
        blocked_percentage: 0,
        reasons: ['No estimated work defined for this project'],
        risk_factors: ['No estimated deliverables or tasks defined for this project'],
        recommended_actions: ['Define project tasks, story points, and schedule dates to enable delivery health tracking'],
        warnings,
        has_estimated_work: false,
        total_sp: 0,
        completed_sp: 0,
        remaining_sp: 0,
        delivery_progress_percentage: null,
        overdue_sp: 0,
        overdue_sp_percentage: 0,
        blocked_sp: 0,
        blocked_sp_percentage: 0,
        blocked_work_percentage: null,
        totalSP: 0,
        completedSP: 0,
        remainingSP: 0,
        deliveryProgressPercentage: null,
        overdueSP: 0,
        overdueSPPercentage: 0,
        blockedSP: 0,
        blockedSPPercentage: 0,
        unestimated_blockers_count,
        progress_percentage: null,
        completion_percentage: null,
        story_count: stories.length,
        completed_stories_count: 0,
        blocked_stories_count: 0,
        overdue_stories_count: 0,
        total_tasks,
        completed_tasks,
        overdue_tasks,
        blocked_tasks: 0,
        critical_tasks: 0,
        project_overdue_days: projectOverdueDays,
        max_task_overdue_days: maxTaskOverdueDays,
        stories: storyItems,
      };
    }

    // 6. Evaluate Health Separately from Progress:
    const criticalReasons: string[] = [];
    const atRiskReasons: string[] = [];
    const needsAttentionReasons: string[] = [];

    // --- CRITICAL THRESHOLDS ---

    // Rule 1: High-impact overdue deliverable volume
    // Only classify as CRITICAL if the overdue work represents a severe portion of project scope or substantial delay:
    const critOverdueTasks = overdueTasksList.filter(
      (t) => t.priority === WorkItemPriority.URGENT || t.priority === WorkItemPriority.HIGH
    );
    const critOverdueStories = storyItems.filter(
      (s) => (s.priority === WorkItemPriority.URGENT || s.priority === WorkItemPriority.HIGH) && s.is_overdue
    );
    const hasSevereOverdueImpact =
      overdue_sp_percentage >= 35 ||
      (critOverdueTasks.length > 0 && overdue_sp_percentage >= 20 && maxTaskOverdueDays >= 7) ||
      (overdue_tasks >= 4 && maxTaskOverdueDays >= 7);

    if (hasSevereOverdueImpact) {
      const count = Math.max(critOverdueStories.length, critOverdueTasks.length, overdue_tasks);
      criticalReasons.push(
        `${count} high-impact deliverable(s) overdue (${overdue_sp} SP · ${maxTaskOverdueDays}d delay)`
      );
    } else if (critOverdueTasks.length > 0 || critOverdueStories.length > 0) {
      // Moderate/single high-priority overdue task affects score as AT_RISK or NEEDS_ATTENTION rather than forcing CRITICAL
      const count = Math.max(critOverdueStories.length, critOverdueTasks.length);
      if (maxTaskOverdueDays >= 7 || overdue_sp_percentage >= 15) {
        atRiskReasons.push(
          `${count} high-priority deliverable(s) overdue (${overdue_sp} SP · ${maxTaskOverdueDays}d delay)`
        );
      } else {
        needsAttentionReasons.push(
          `${count} high-priority deliverable(s) overdue (${overdue_sp} SP · ${maxTaskOverdueDays}d delay)`
        );
      }
    }

    // Rule 2: Severe Blocker / High-Priority Deliverable Blocked
    // Blockers in completed sprints are excluded from severe immediate threats
    const severeBlockedDeliverables = blockedLeaves.filter((t: any) => {
      let sId = t.sprint_id;
      if (!sId && t.parent_id) {
        const p = workItems.find((w: any) => w.id === t.parent_id);
        if (p?.sprint_id) sId = p.sprint_id;
      }
      const sObj = sId ? sprintMap.get(sId) : null;
      if (sObj?.status === 'COMPLETED') return false;

      if (t.priority === WorkItemPriority.URGENT) return true;
      if (t.priority === WorkItemPriority.HIGH) {
        if (t.due_date) {
          const diffDays = Math.floor((new Date(t.due_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return diffDays <= 3;
        }
        if (daysUntilDeadline !== null && daysUntilDeadline <= 3) return true;
        if (sObj?.status === 'ACTIVE' && sObj.end_date) {
          const sprintDays = Math.floor((new Date(sObj.end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (sprintDays <= 3) return true;
        }
      }
      return false;
    });

    if (severeBlockedDeliverables.length > 0) {
      criticalReasons.push(
        `${severeBlockedDeliverables.length} high-priority deliverable(s) blocked · Urgent resolution required`
      );
    }

    // Rule 3: High Delivery Risk (More than 50% of remaining SP blocked)
    if (blocked_work_percentage > BLOCKED_RISK_THRESHOLDS.HIGH_RISK_MIN) {
      criticalReasons.push(
        `High delivery risk: ${blocked_sp} of ${remaining_sp} remaining SP blocked (${Math.round(blocked_work_percentage)}%)`
      );
    } else if (blocked_work_percentage === BLOCKED_RISK_THRESHOLDS.HIGH_RISK_MIN) {
      // At exactly 50%, evaluate for CRITICAL if severe factors or widespread task count apply
      const hasCriticalFactors =
        severeBlockedDeliverables.length > 0 ||
        critOverdueTasks.length > 0 ||
        blockedInActiveSprint.length > 0 ||
        blocked_tasks >= 3;
      if (hasCriticalFactors) {
        criticalReasons.push(
          `High delivery risk: ${blocked_sp} of ${remaining_sp} remaining SP blocked (50%)`
        );
      }
    }

    // Rule 4: Significant schedule slippage
    if (projectEndDatePassed) {
      if (
        progress_percentage === 0 ||
        projectOverdueDays >= 14 ||
        (projectOverdueDays >= 7 && (progress_percentage ?? 0) < 50)
      ) {
        criticalReasons.push(
          `Project deadline passed ${projectOverdueDays} days ago · ${remaining_sp} SP pending`
        );
      }
    }

    // Rule 5: Critical volume of overdue work
    if (overdue_tasks >= 4 || (overdue_tasks >= 3 && overdue_tasks / total_tasks >= 0.4)) {
      criticalReasons.push(`${overdue_tasks} deliverables overdue · Significant delivery risk`);
    }

    // --- AT_RISK THRESHOLDS ---

    // Rule A: Moderate project-level delay
    if (projectEndDatePassed) {
      atRiskReasons.push(
        `Project deadline passed ${projectOverdueDays} ${projectOverdueDays === 1 ? 'day' : 'days'} ago · ${remaining_sp} SP pending`
      );
    }

    // Rule B: Active sprint deadline passed
    if (sprintOverdue) {
      atRiskReasons.push('Active sprint deadline passed · Delivery delayed');
    }

    // Rule C: Story-Point-Based Blocker Impact (Configurable thresholds)
    if (blocked_work_percentage >= BLOCKED_RISK_THRESHOLDS.HIGH_RISK_MIN) {
      // Exactly 50% without critical factors evaluated to AT_RISK
      atRiskReasons.push(
        `${blocked_sp} of ${remaining_sp} remaining SP blocked (${Math.round(blocked_work_percentage)}%) · Significant delivery risk`
      );
    } else if (blocked_work_percentage >= BLOCKED_RISK_THRESHOLDS.POTENTIAL_RISK_MIN) {
      // 25% to below 50%: Potential delivery risk
      atRiskReasons.push(
        `${blocked_sp} of ${remaining_sp} remaining SP blocked (${Math.round(blocked_work_percentage)}%) · Potential delivery risk`
      );
    } else {
      // Below 25%: Low exposure; do NOT classify as AT_RISK solely on percentage!
      // But check if a high-priority blocker threatens an active sprint:
      const highPriorityActiveBlockers = blockedInActiveSprint.filter(
        (t: any) => t.priority === WorkItemPriority.HIGH || t.priority === WorkItemPriority.URGENT
      );
      if (highPriorityActiveBlockers.length > 0) {
        atRiskReasons.push(
          `High-priority deliverable blocked in active sprint · Immediate delivery risk`
        );
      } else {
        // High-priority unestimated blocker in active sprint
        const urgentUnestimatedActive = unestimatedBlockers.filter((t: any) => {
          let sId = t.sprint_id;
          if (!sId && t.parent_id) {
            const p = workItems.find((w: any) => w.id === t.parent_id);
            if (p?.sprint_id) sId = p.sprint_id;
          }
          const sObj = sId ? sprintMap.get(sId) : null;
          return (
            (t.priority === WorkItemPriority.HIGH || t.priority === WorkItemPriority.URGENT) &&
            sObj?.status === 'ACTIVE'
          );
        });
        if (urgentUnestimatedActive.length > 0) {
          atRiskReasons.push(
            `High-priority unestimated deliverable blocked in active sprint · Attention required`
          );
        }
      }
    }

    // Rule D: Material volume or delay of overdue deliverables
    // A single low-impact overdue task (<= 7 days delay, low/medium priority, minimal SP impact)
    // must NOT cause project-wide AT_RISK classification; record it as a warning instead.
    const overdueSp = overdueTasksList.reduce((s: number, t: any) => s + (Number(t.story_points) || 0), 0);
    const overdueSpRatio = remaining_sp > 0 ? overdueSp / remaining_sp : 0;
    const isMaterialOverdueRisk =
      (overdue_tasks >= 2 && maxTaskOverdueDays > 7) ||
      overdue_tasks >= 3 ||
      (overdue_tasks > 0 && overdueSpRatio >= 0.3);

    if (isMaterialOverdueRisk) {
      atRiskReasons.push(`${overdue_tasks} deliverables overdue (${maxTaskOverdueDays}d delay) · Material delivery impact`);
    } else if (overdue_tasks > 0) {
      warnings.push(`${overdue_tasks} non-critical deliverable(s) overdue (${maxTaskOverdueDays}d delay) · Low delivery impact`);
    }

    // Rule E: Imminent project deadline (< 7 days) with low progress (< 50%)
    if (daysUntilDeadline !== null && daysUntilDeadline <= 7 && (progress_percentage ?? 0) < 50 && remaining_sp > 0) {
      needsAttentionReasons.push(`Upcoming deadline in ${daysUntilDeadline}d with ${remaining_sp} SP remaining`);
    }

    // --- HEALTHY REASON ---
    let healthyReason = 'On schedule · 0 overdue · 0 active blockers';
    if (remaining_sp === 0) {
      healthyReason = 'All deliverables completed';
    } else if (!hasExplicitSchedule) {
      if (blockedInCompletedSprint.length > 0) {
        healthyReason = `No active delivery blockers · ${blockedInCompletedSprint.length} item in completed sprint flagged for review`;
      } else {
        healthyReason = 'No active delivery blockers · Schedule dates not set';
      }
    } else if (blocked_work_percentage > 0 && blocked_work_percentage < BLOCKED_RISK_THRESHOLDS.POTENTIAL_RISK_MIN) {
      healthyReason = `On track · Low blocker exposure (${blocked_sp} of ${remaining_sp} SP blocked)`;
    }

    // --- SCHEDULE HEALTH & VARIANCE ---
    let schedule_health: ScheduleHealth = 'ON_TRACK';
    let schedule_variance_days: number | null = null;
    let schedule_variance_percentage: number | null = null;

    if (projectOverdueDays > 0) {
      schedule_health = 'BEHIND';
      schedule_variance_days = -projectOverdueDays;
    } else if (project.start_date && project.end_date) {
      const startMs = new Date(project.start_date).getTime();
      const endMs = new Date(project.end_date).getTime();
      const nowMs = now.getTime();
      const totalDurationDays = Math.max(1, (endMs - startMs) / (1000 * 60 * 60 * 24));
      const elapsedDays = (nowMs - startMs) / (1000 * 60 * 60 * 24);
      const elapsedPct = nowMs < startMs ? 0 : nowMs > endMs ? 100 : Math.min(100, Math.max(0, Math.round((elapsedDays / totalDurationDays) * 100)));
      const workPct = progress_percentage ?? (total_tasks > 0 ? Math.round((completed_tasks / total_tasks) * 100) : 0);
      schedule_variance_percentage = workPct - elapsedPct;
      schedule_variance_days = daysUntilDeadline;

      if (nowMs > endMs) {
        schedule_health = 'BEHIND';
      } else if (schedule_variance_percentage >= 10) {
        schedule_health = 'AHEAD';
      } else if (schedule_variance_percentage <= -25) {
        schedule_health = 'BEHIND';
        atRiskReasons.push(`Delivery significantly behind schedule (${Math.abs(Math.round(schedule_variance_percentage))}% variance)`);
      } else if (schedule_variance_percentage < -10) {
        schedule_health = 'BEHIND';
        needsAttentionReasons.push(`Delivery behind expected schedule (${Math.abs(Math.round(schedule_variance_percentage))}% variance)`);
      } else {
        schedule_health = 'ON_TRACK';
      }
    } else if (activeSprint?.end_date) {
      const sEnd = new Date(activeSprint.end_date);
      if (sEnd < now) {
        schedule_health = 'BEHIND';
        schedule_variance_days = -Math.max(1, Math.floor((now.getTime() - sEnd.getTime()) / (1000 * 60 * 60 * 24)));
      } else {
        schedule_health = 'ON_TRACK';
        schedule_variance_days = Math.floor((sEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }
    } else if (overdue_tasks > 0) {
      schedule_health = 'BEHIND';
      schedule_variance_days = -maxTaskOverdueDays;
    } else if (completed_tasks === total_tasks && total_tasks > 0) {
      schedule_health = 'ON_TRACK';
    } else {
      schedule_health = 'NO_SCHEDULE';
    }

    if (overdue_tasks > 0) {
      schedule_health = 'BEHIND';
    }

    const completion_rate = total_tasks > 0 ? Math.round((completed_tasks / total_tasks) * 100) : 0;
    const overdue_percentage = total_tasks > 0 ? Math.round((overdue_tasks / total_tasks) * 100) : 0;
    const blocked_percentage = total_tasks > 0 ? Math.round((blocked_tasks / total_tasks) * 100) : 0;

    // Baseline health score is strictly based on story-point completion against total estimated story points
    // Formula: Completion Percentage = (Completed Story Points / Total Estimated Story Points) * 100
    const finalScore: number | null = has_estimated_work ? progress_percentage : null;

    let finalHealth: HealthStatus;
    let finalRisk: RiskLevel;
    let finalReasons: string[];

    if (!has_estimated_work) {
      finalHealth = 'NOT_ASSESSED';
      finalRisk = 'INSUFFICIENT_DATA';
      finalReasons = ['No estimated work defined for this project'];
    } else if (remaining_sp === 0) {
      finalHealth = 'HEALTHY';
      finalRisk = 'LOW';
      finalReasons = ['All deliverables completed'];
    } else if (criticalReasons.length > 0) {
      finalHealth = 'CRITICAL';
      finalRisk = 'CRITICAL';
      finalReasons = criticalReasons;
    } else if (atRiskReasons.length > 0) {
      finalHealth = 'AT_RISK';
      finalRisk = 'HIGH';
      finalReasons = atRiskReasons;
    } else if (needsAttentionReasons.length > 0) {
      finalHealth = 'NEEDS_ATTENTION';
      finalRisk = 'MODERATE';
      finalReasons = needsAttentionReasons;
    } else {
      finalHealth = 'HEALTHY';
      finalRisk = 'LOW';
      finalReasons = [healthyReason];
    }

    // Risk factors lowering the score
    const risk_factors: string[] = [];
    if (finalReasons.length > 0 && finalHealth !== 'HEALTHY') {
      risk_factors.push(...finalReasons);
    }
    if (overdue_tasks > 0 && !risk_factors.some((r) => r.includes('overdue'))) {
      risk_factors.push(`${overdue_tasks} overdue task(s) (${overdue_percentage}% of total work)`);
    }
    if (blocked_tasks > 0 && !risk_factors.some((r) => r.includes('blocked'))) {
      risk_factors.push(`${blocked_tasks} blocked deliverable(s) (${blocked_percentage}% of total work)`);
    }
    if (schedule_health === 'BEHIND' && !risk_factors.some((r) => r.includes('schedule') || r.includes('deadline'))) {
      risk_factors.push('Execution progress is lagging behind planned schedule');
    }
    if (risk_factors.length === 0) {
      risk_factors.push('All health metrics within optimal thresholds');
    }

    // Recommended actions
    const recommended_actions: string[] = [];
    if (blocked_tasks > 0) {
      recommended_actions.push(`Resolve ${blocked_tasks} blocked deliverable(s) to unblock active sprint work`);
    }
    if (overdue_tasks > 0) {
      recommended_actions.push(`Review and expedite or reschedule ${overdue_tasks} overdue task(s)`);
    }
    if (projectOverdueDays > 0) {
      recommended_actions.push(`Project deadline passed ${projectOverdueDays} days ago — re-baseline scope or delivery dates`);
    }
    if (schedule_health === 'BEHIND') {
      recommended_actions.push('Velocity is lagging behind schedule — rebalance assignments or work item scope');
    }
    if (unestimated_blockers_count > 0) {
      recommended_actions.push(`Estimate story points on ${unestimated_blockers_count} blocked deliverable(s)`);
    }
    if (finalHealth === 'HEALTHY') {
      recommended_actions.push('Maintain current delivery cadence and monitor upcoming milestones');
    }
    if (finalScore === null) {
      recommended_actions.push('Set project start/end dates and assign story points to enable health tracking');
    }

    return {
      health: finalHealth,
      health_score: finalScore,
      risk_level: finalRisk,
      schedule_health,
      schedule_variance_days,
      schedule_variance_percentage,
      completion_rate,
      overdue_percentage,
      blocked_percentage,
      reasons: finalReasons,
      risk_factors: Array.from(new Set(risk_factors)),
      recommended_actions: Array.from(new Set(recommended_actions)),
      warnings,
      has_estimated_work: true,
      total_sp,
      completed_sp,
      remaining_sp,
      delivery_progress_percentage: progress_percentage,
      overdue_sp,
      overdue_sp_percentage,
      blocked_sp,
      blocked_sp_percentage,
      blocked_work_percentage,
      totalSP: total_sp,
      completedSP: completed_sp,
      remainingSP: remaining_sp,
      deliveryProgressPercentage: progress_percentage,
      overdueSP: overdue_sp,
      overdueSPPercentage: overdue_sp_percentage,
      blockedSP: blocked_sp,
      blockedSPPercentage: blocked_sp_percentage,
      unestimated_blockers_count,
      progress_percentage,
      completion_percentage: progress_percentage,
      story_count: stories.length,
      completed_stories_count,
      blocked_stories_count,
      overdue_stories_count,
      total_tasks,
      completed_tasks,
      overdue_tasks,
      blocked_tasks,
      critical_tasks: critOverdueTasks.length + severeBlockedDeliverables.length,
      project_overdue_days: projectOverdueDays,
      max_task_overdue_days: maxTaskOverdueDays,
      stories: storyItems,
    };
  }

  /**
   * Get portfolio health overview across all projects in the manager/user's organization scope
   */
  static async getPortfolioHealth(
    user: any,
    filters?: { cohort_id?: string }
  ): Promise<PortfolioHealthResponse> {
    const orgId = await this.getEffectiveOrgId(user);
    if (!orgId) {
      return {
        summary: { total: 0, assessed: 0, healthy: 0, needs_attention: 0, at_risk_only: 0, at_risk: 0, critical: 0, not_assessed: 0, insufficient_data: 0, attention_required: 0, attention_rate: 0 },
        distribution: {
          healthy: { count: 0, percentage: 0 },
          needs_attention: { count: 0, percentage: 0 },
          at_risk: { count: 0, percentage: 0 },
          critical: { count: 0, percentage: 0 },
          not_assessed: { count: 0, percentage: 0 },
          insufficient_data: { count: 0, percentage: 0 },
        },
        projects: [],
      };
    }

    const cacheKey = `health:org:${orgId}:cohort:${filters?.cohort_id || 'all'}`;
    return await cacheService.getOrSet(cacheKey, 30, async () => {
      const where: any = { organization_id: orgId };

    // Optional cohort filter
    if (filters?.cohort_id) {
      where.members = {
        some: {
          user: {
            cohort_id: filters.cohort_id,
          },
        },
      };
    }

    // Single non-N+1 query with work items and sprints
    const dbProjects = await prisma.project.findMany({
      where,
      select: {
        id: true,
        name: true,
        status: true,
        start_date: true,
        end_date: true,
        work_items: {
          select: {
            id: true,
            title: true,
            type: true,
            status: true,
            priority: true,
            due_date: true,
            story_points: true,
            parent_id: true,
            sprint_id: true,
          },
        },
        sprints: {
          select: {
            id: true,
            status: true,
            start_date: true,
            end_date: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const classifiedProjects: ProjectHealthItem[] = dbProjects.map((p) => {
      const evaluation = this.classifyProjectHealth(p);
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        health: evaluation.health,
        health_score: evaluation.health_score,
        risk_level: evaluation.risk_level,
        schedule_health: evaluation.schedule_health,
        schedule_variance_days: evaluation.schedule_variance_days,
        schedule_variance_percentage: evaluation.schedule_variance_percentage,
        completion_rate: evaluation.completion_rate,
        overdue_percentage: evaluation.overdue_percentage,
        blocked_percentage: evaluation.blocked_percentage,
        reasons: evaluation.reasons,
        risk_factors: evaluation.risk_factors,
        recommended_actions: evaluation.recommended_actions,
        warnings: evaluation.warnings,
        completion_percentage: evaluation.completion_percentage,
        progress_percentage: evaluation.progress_percentage,
        delivery_progress_percentage: evaluation.delivery_progress_percentage ?? evaluation.progress_percentage,
        has_estimated_work: evaluation.has_estimated_work,
        total_sp: evaluation.total_sp,
        completed_sp: evaluation.completed_sp,
        remaining_sp: evaluation.remaining_sp,
        overdue_sp: evaluation.overdue_sp,
        overdue_sp_percentage: evaluation.overdue_sp_percentage,
        blocked_sp: evaluation.blocked_sp,
        blocked_sp_percentage: evaluation.blocked_sp_percentage,
        blocked_work_percentage: evaluation.blocked_work_percentage,
        totalSP: evaluation.total_sp,
        completedSP: evaluation.completed_sp,
        remainingSP: evaluation.remaining_sp,
        deliveryProgressPercentage: evaluation.delivery_progress_percentage ?? evaluation.progress_percentage,
        overdueSP: evaluation.overdue_sp,
        overdueSPPercentage: evaluation.overdue_sp_percentage,
        blockedSP: evaluation.blocked_sp,
        blockedSPPercentage: evaluation.blocked_sp_percentage,
        unestimated_blockers_count: evaluation.unestimated_blockers_count,
        story_count: evaluation.story_count,
        completed_stories_count: evaluation.completed_stories_count,
        blocked_stories_count: evaluation.blocked_stories_count,
        overdue_stories_count: evaluation.overdue_stories_count,
        completed_tasks: evaluation.completed_tasks,
        total_tasks: evaluation.total_tasks,
        overdue_tasks: evaluation.overdue_tasks,
        blocked_tasks: evaluation.blocked_tasks,
        critical_tasks: evaluation.critical_tasks,
        project_overdue_days: evaluation.project_overdue_days,
        max_task_overdue_days: evaluation.max_task_overdue_days,
        stories: evaluation.stories,
      };
    });

    const total = classifiedProjects.length;
    const healthyCount = classifiedProjects.filter((p) => p.health === 'HEALTHY').length;
    const needsAttentionCount = classifiedProjects.filter((p) => p.health === 'NEEDS_ATTENTION').length;
    const atRiskOnlyCount = classifiedProjects.filter((p) => p.health === 'AT_RISK').length;
    const criticalCount = classifiedProjects.filter((p) => p.health === 'CRITICAL').length;
    const notAssessedCount = classifiedProjects.filter(
      (p) => p.health === 'NOT_ASSESSED' || (p.health as any) === 'INSUFFICIENT_DATA'
    ).length;

    const assessedCount = healthyCount + needsAttentionCount + atRiskOnlyCount + criticalCount;
    const attentionRequiredCount = needsAttentionCount + atRiskOnlyCount + criticalCount;

    const roundPct = (num: number, den: number) => {
      if (den <= 0) return 0;
      return Number(((num / den) * 100).toFixed(1));
    };

    const summary: PortfolioHealthSummary = {
      total,
      assessed: assessedCount,
      healthy: healthyCount,
      needs_attention: needsAttentionCount,
      at_risk_only: atRiskOnlyCount,
      at_risk: atRiskOnlyCount + needsAttentionCount,
      critical: criticalCount,
      not_assessed: notAssessedCount,
      insufficient_data: notAssessedCount,
      attention_required: attentionRequiredCount,
      attention_rate: roundPct(attentionRequiredCount, assessedCount),
    };

    const distribution: PortfolioHealthDistribution = {
      healthy: {
        count: healthyCount,
        percentage: roundPct(healthyCount, assessedCount),
      },
      needs_attention: {
        count: needsAttentionCount,
        percentage: roundPct(needsAttentionCount, assessedCount),
      },
      at_risk: {
        count: atRiskOnlyCount,
        percentage: roundPct(atRiskOnlyCount, assessedCount),
      },
      critical: {
        count: criticalCount,
        percentage: roundPct(criticalCount, assessedCount),
      },
      not_assessed: {
        count: notAssessedCount,
        percentage: roundPct(notAssessedCount, total),
      },
      insufficient_data: {
        count: notAssessedCount,
        percentage: roundPct(notAssessedCount, total),
      },
    };

    return {
      summary,
      distribution,
      projects: classifiedProjects,
    };
    });
  }
}
