import { prisma } from '../lib/prisma';
import crypto from 'crypto';
import { AuditService } from './audit.service';
import { NotificationService } from './notification.service';

export interface OrganizationWorkPolicyInput {
  office_start_time?: string;
  office_end_time?: string;
  break_start_time?: string | null;
  break_end_time?: string | null;
  lunch_break_minutes?: number | null;
  timezone?: string;
  overtime_enabled?: boolean;
  overtime_start_time?: string | null;
}

export interface SessionInput {
  task_id?: string | null;
  started_at?: Date | string;
  ended_at?: Date | string | null;
  break_minutes?: number | null;
  notes?: string | null;
}

export interface TimeEntryInput {
  task_id?: string;
  project_id?: string | null;
  work_session_id?: string | null;
  date?: Date | string;
  start_time?: Date | string;
  end_time?: Date | string;
  duration_minutes?: number | null;
  notes?: string | null;
}

const MINUTE_MS = 60 * 1000;

const toDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const toUtcDate = (date: Date): Date => {
  const utcDate = new Date(date);
  return new Date(Date.UTC(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth(),
    utcDate.getUTCDate(),
    utcDate.getUTCHours(),
    utcDate.getUTCMinutes(),
    utcDate.getUTCSeconds(),
    utcDate.getUTCMilliseconds()
  ));
};

const asMinutes = (value: string | null | undefined): number => {
  if (!value) return 0;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/i.exec(value.trim());
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
};

const getTimeZoneParts = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
};

const buildLocalDateForTime = (day: Date, time: string, timeZone = 'Asia/Kolkata'): Date => {
  const [hour, minute] = time.split(':').map(Number);
  const dayParts = getTimeZoneParts(day, timeZone);
  const wallClockAsUtc = Date.UTC(dayParts.year, dayParts.month - 1, dayParts.day, hour, minute, 0, 0);
  const offsetParts = getTimeZoneParts(new Date(wallClockAsUtc), timeZone);
  const offsetMinutes = (
    Date.UTC(offsetParts.year, offsetParts.month - 1, offsetParts.day, offsetParts.hour, offsetParts.minute, offsetParts.second) - wallClockAsUtc
  ) / MINUTE_MS;
  return new Date(wallClockAsUtc - offsetMinutes * MINUTE_MS);
};

const diffMinutes = (start: Date, end: Date): number => {
  const ms = Math.max(0, end.getTime() - start.getTime());
  return Math.round(ms / MINUTE_MS);
};

const overlapMinutes = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number => {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  if (end <= start) return 0;
  return Math.round((end - start) / MINUTE_MS);
};

export class TimesheetService {
  private static hasRole(user: any, roles: string[]): boolean {
    const userRoles = Array.isArray(user?.roles) ? user.roles : [];
    if (user?.role && roles.includes(user.role)) return true;
    return userRoles.some((entry: any) => {
      const name = entry?.role?.name || entry?.name;
      return typeof name === 'string' && roles.includes(name);
    });
  }

  private static hasPermission(user: any, permissionName: string): boolean {
    const userRoles = Array.isArray(user?.roles) ? user.roles : [];
    for (const entry of userRoles) {
      const permissions = entry?.role?.permissions || [];
      for (const permission of permissions) {
        const name = permission?.permission?.name || permission?.name;
        if (name === permissionName) return true;
      }
    }
    if (Array.isArray(user?.user_permissions)) {
      for (const up of user.user_permissions) {
        const name = up?.permission?.name || up?.name;
        if (name === permissionName) return true;
      }
    }
    return false;
  }

  private static async getDefaultOrganizationId(): Promise<string> {
    const organization = await prisma.organization.findFirst({
      select: { id: true },
      orderBy: { created_at: 'asc' },
    });

    if (!organization) {
      throw new Error('No organization found');
    }

    return organization.id;
  }

  private static resolveOrganizationId(user: any, organizationId?: string | null): string {
    if (organizationId) return organizationId;
    if (user?.organization_id) return user.organization_id;
    return user?.organizationId || '';
  }

  private static async getVisibleUserIdsForManager(user: any, organizationId: string): Promise<string[]> {
    if (this.hasRole(user, ['SUPER_ADMIN', 'ADMIN'])) {
      const members = await prisma.user.findMany({
        where: { organization_id: organizationId, is_active: true },
        select: { id: true },
      });
      return members.map((member) => member.id);
    }

    const projectMemberIds = await prisma.projectMember.findMany({
      where: { project: { organization_id: organizationId } },
      select: { user_id: true },
    });

    const memberIds = new Set(projectMemberIds.map((item) => item.user_id));
    memberIds.add(user.id);
    return [...memberIds];
  }

  private static validateAdminAccess(user: any, organizationId?: string | null): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.hasRole(user, ['SUPER_ADMIN', 'ADMIN']) || this.hasPermission(user, 'ORGANIZATION_UPDATE')) {
        resolve();
        return;
      }
      reject(new Error('Forbidden: only administrators can update organization work hours'));
    });
  }

  static async getOrganizationWorkPolicy(user: any, organizationId?: string | null) {
    const orgId = this.resolveOrganizationId(user, organizationId) || await this.getDefaultOrganizationId();
    const policy = await prisma.organizationWorkPolicy.findUnique({
      where: { organization_id: orgId },
    });

    if (!policy) {
      return this.ensureOrganizationPolicyForOrg(orgId, {});
    }

    return policy;
  }

  static async ensureOrganizationPolicyForOrg(organizationId: string, input: OrganizationWorkPolicyInput = {}) {
    const normalized = {
      office_start_time: input.office_start_time || '09:00',
      office_end_time: input.office_end_time || '17:30',
      break_start_time: input.break_start_time || '13:00',
      break_end_time: input.break_end_time || '14:00',
      lunch_break_minutes: input.lunch_break_minutes ?? 60,
      timezone: input.timezone || 'Asia/Kolkata',
      overtime_enabled: Boolean(input.overtime_enabled),
      overtime_start_time: input.overtime_start_time || '17:30',
    };

    return prisma.organizationWorkPolicy.upsert({
      where: { organization_id: organizationId },
      update: normalized,
      create: {
        organization_id: organizationId,
        ...normalized,
      },
    });
  }

  static async upsertOrganizationPolicy(user: any, input: OrganizationWorkPolicyInput, organizationId?: string | null) {
    const orgId = this.resolveOrganizationId(user, organizationId) || await this.getDefaultOrganizationId();
    await this.validateAdminAccess(user, orgId);
    return this.ensureOrganizationPolicyForOrg(orgId, input);
  }

  static getSessionCutoffTime(startedAt: Date, timezone = 'Asia/Kolkata'): Date {
    // Evening cutoff is 18:15 (6:15 PM) on the day the session started
    const dayCutoff = buildLocalDateForTime(startedAt, '18:15', timezone);

    // If session started before 18:15, clock it at 18:15
    if (startedAt.getTime() < dayCutoff.getTime()) {
      return dayCutoff;
    }

    // If session started at or after 18:15, cutoff is next day's 18:15 (or 4 hours max duration)
    const tomorrow = new Date(startedAt.getTime() + 24 * 60 * 60 * 1000);
    const nextDayCutoff = buildLocalDateForTime(tomorrow, '18:15', timezone);
    const fourHoursLater = new Date(startedAt.getTime() + 4 * 60 * 60 * 1000);
    return fourHoursLater.getTime() < nextDayCutoff.getTime() ? fourHoursLater : nextDayCutoff;
  }

  private static isAutoClocking = false;

  static async autoClockExpiredSessions(orgId?: string, userId?: string): Promise<number> {
    if (this.isAutoClocking) {
      return 0;
    }
    this.isAutoClocking = true;

    try {
      const now = Date.now();
      const openSessions = await prisma.workSession.findMany({
        where: {
          ...(orgId ? { organization_id: orgId } : {}),
          ...(userId ? { user_id: userId } : {}),
          ended_at: null,
        },
        include: {
          task: { select: { id: true, project_id: true } },
        },
      });

      if (openSessions.length === 0) return 0;

      const orgIds = Array.from(new Set(openSessions.map((s) => s.organization_id)));
      const policies = await prisma.organizationWorkPolicy.findMany({
        where: { organization_id: { in: orgIds } },
      });
      const policyMap = new Map(policies.map((p) => [p.organization_id, p]));

      let clockedCount = 0;

      for (const session of openSessions) {
        const policy = policyMap.get(session.organization_id);
        const timezone = policy?.timezone || 'Asia/Kolkata';
        const cutoffTime = this.getSessionCutoffTime(session.started_at, timezone);

        if (now > cutoffTime.getTime()) {
          const durationMinutes = Math.max(1, diffMinutes(session.started_at, cutoffTime));
          const autoNotes = session.notes
            ? `${session.notes} · Auto-clocked at 18:15 (daily safety cutoff)`
            : 'Auto-clocked at 18:15 (daily safety cutoff)';

          await prisma.$transaction(async (tx) => {
            // Atomic conditional update: only the first caller to transition ended_at from null proceeds
            const updateResult = await tx.workSession.updateMany({
              where: { id: session.id, ended_at: null },
              data: {
                ended_at: cutoffTime,
                notes: autoNotes,
              },
            });

            if (updateResult.count === 0) {
              // Session was already finalized concurrently by another worker or request
              return;
            }

            if (session.task_id) {
              const existingEntry = await tx.timeEntry.findFirst({
                where: { work_session_id: session.id },
              });

              if (existingEntry) {
                await tx.timeEntry.update({
                  where: { id: existingEntry.id },
                  data: {
                    end_time: cutoffTime,
                    duration_minutes: durationMinutes,
                    notes: autoNotes,
                  },
                });
              } else {
                await tx.timeEntry.create({
                  data: {
                    organization_id: session.organization_id,
                    user_id: session.user_id,
                    task_id: session.task_id,
                    project_id: session.task?.project_id || null,
                    work_session_id: session.id,
                    date: session.started_at,
                    start_time: session.started_at,
                    end_time: cutoffTime,
                    duration_minutes: durationMinutes,
                    notes: autoNotes,
                  },
                });
              }
            }
          });

          clockedCount++;
        }
      }

      return clockedCount;
    } catch (err) {
      console.error('Failed to auto-clock expired sessions:', err);
      return 0;
    } finally {
      this.isAutoClocking = false;
    }
  }

  static async startSession(user: any, input: SessionInput = {}) {
    if (this.hasRole(user, ['MANAGER'])) {
      throw new Error('Forbidden: managers do not have permission to start timers on tasks');
    }

    const orgId = this.resolveOrganizationId(user, user.organization_id) || await this.getDefaultOrganizationId();
    // Auto-clock any expired/stale sessions before starting a new one
    await this.autoClockExpiredSessions(orgId, user.id);

    const taskId = input.task_id || null;

    if (taskId) {
      const task = await prisma.workItem.findFirst({
        where: { id: taskId, organization_id: orgId },
        include: { assignees: true },
      });
      if (!task) throw new Error('Task not found in your organization');

      const userIsAssignee = task.assignees.some((assignee) => assignee.user_id === user.id);
      const canManageTask = this.hasRole(user, ['ADMIN', 'SUPER_ADMIN', 'TECH_LEAD']) || this.hasPermission(user, 'TASK_UPDATE');
      if (!userIsAssignee && !canManageTask && task.created_by !== user.id) {
        throw new Error('Forbidden: you are not assigned to this task');
      }
    }

    // Enforce strictly one active task timer per user across the entire application
    const existingActive = await prisma.workSession.findFirst({
      where: {
        organization_id: orgId,
        user_id: user.id,
        ended_at: null,
      },
      include: {
        task: {
          select: { id: true, title: true },
        },
      },
      orderBy: { started_at: 'desc' },
    });

    if (existingActive) {
      if ((existingActive.task_id ?? null) === taskId) {
        // Idempotent: already running on this task, return without duplicate creation
        return existingActive;
      }
      // Switching tasks: safely stop and record the previous session before starting the next one
      await this.endSession(user, { task_id: existingActive.task_id });
    }

    const startedAt = toDate(input.started_at) || new Date();
    return prisma.workSession.create({
      data: {
        organization_id: orgId,
        user_id: user.id,
        task_id: taskId,
        started_at: startedAt,
        notes: input.notes || null,
        break_minutes: input.break_minutes ?? 0,
      },
      include: {
        task: {
          select: { id: true, title: true, status: true, priority: true }
        }
      }
    });
  }

  static async endSession(user: any, input: SessionInput = {}) {
    const orgId = this.resolveOrganizationId(user, user.organization_id) || await this.getDefaultOrganizationId();
    const activeSession = await prisma.workSession.findFirst({
      where: {
        organization_id: orgId,
        user_id: user.id,
        ...(input.task_id ? { task_id: input.task_id } : {}),
        ended_at: null,
      },
      orderBy: { started_at: 'desc' },
    });

    if (!activeSession) {
      // Idempotent: if already ended, return most recent ended session gracefully
      const lastSession = await prisma.workSession.findFirst({
        where: {
          organization_id: orgId,
          user_id: user.id,
          ...(input.task_id ? { task_id: input.task_id } : {}),
        },
        orderBy: { updated_at: 'desc' },
      });
      if (lastSession) {
        return lastSession;
      }
      throw new Error('No active work session found');
    }

    const endedAt = toDate(input.ended_at) || new Date();
    const breakMinutes = Number(input.break_minutes ?? activeSession.break_minutes ?? 0);

    if (endedAt < activeSession.started_at) {
      throw new Error('Session end time cannot be before start time');
    }

    const policy = await prisma.organizationWorkPolicy.findUnique({
      where: { organization_id: orgId },
    });
    const timezone = policy?.timezone || 'Asia/Kolkata';
    const cutoffTime = this.getSessionCutoffTime(activeSession.started_at, timezone);

    let effectiveEndedAt = endedAt;
    let effectiveNotes = input.notes ?? activeSession.notes;

    if (effectiveEndedAt.getTime() > cutoffTime.getTime()) {
      effectiveEndedAt = cutoffTime;
      const noteSuffix = 'Auto-clocked at 18:15 (daily safety cutoff)';
      effectiveNotes = effectiveNotes
        ? `${effectiveNotes} · ${noteSuffix}`
        : noteSuffix;
    }

    return await prisma.$transaction(async (tx) => {
      // Atomic conditional update: only the first caller to transition ended_at from null proceeds
      const updateResult = await tx.workSession.updateMany({
        where: { id: activeSession.id, ended_at: null },
        data: {
          ended_at: effectiveEndedAt,
          break_minutes: breakMinutes,
          notes: effectiveNotes,
        },
      });

      if (updateResult.count === 0) {
        // Concurrently ended or auto-clocked
        const ended = await tx.workSession.findUnique({
          where: { id: activeSession.id },
          include: {
            time_entries: {
              include: { task: true, project: true },
              orderBy: { created_at: 'desc' },
              take: 1,
            },
          },
        });
        return {
          ...ended,
          time_entry: ended?.time_entries?.[0] || null,
        };
      }

      const session = (await tx.workSession.findUnique({
        where: { id: activeSession.id },
      })) || activeSession;

      if (activeSession.task_id) {
        const rawDiff = diffMinutes(activeSession.started_at, effectiveEndedAt);
        const durationMinutes = Math.max(1, rawDiff);

        const task = await tx.workItem.findUnique({
          where: { id: activeSession.task_id },
          select: { project_id: true },
        });

        const existingEntry = await tx.timeEntry.findFirst({
          where: { work_session_id: activeSession.id },
        });

        if (existingEntry) {
          const entry = await tx.timeEntry.update({
            where: { id: existingEntry.id },
            data: {
              end_time: effectiveEndedAt,
              duration_minutes: durationMinutes,
              notes: effectiveNotes || null,
            },
            include: {
              task: true,
              project: true,
            },
          });
          return { ...session, time_entry: entry };
        }

        const entry = await tx.timeEntry.create({
          data: {
            organization_id: orgId,
            user_id: user.id,
            task_id: activeSession.task_id,
            project_id: task?.project_id || null,
            work_session_id: activeSession.id,
            date: activeSession.started_at,
            start_time: activeSession.started_at,
            end_time: effectiveEndedAt,
            duration_minutes: durationMinutes,
            notes: effectiveNotes || null,
          },
          include: {
            task: true,
            project: true,
          },
        });
        return { ...session, time_entry: entry };
      }

      return session;
    });
  }

  static async getActiveTaskSession(user: any, taskId?: string | null) {
    const orgId = this.resolveOrganizationId(user, user.organization_id) || await this.getDefaultOrganizationId();
    await this.autoClockExpiredSessions(orgId, user.id);
    return prisma.workSession.findFirst({
      where: {
        organization_id: orgId,
        user_id: user.id,
        ...(taskId ? { task_id: taskId } : {}),
        ended_at: null,
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            project_id: true,
            project: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { started_at: 'desc' },
    });
  }

  /**
   * Request Time Correction (Intern Dashboard)
   * Allows correcting accidentally recorded extra time with reason, difference calculation,
   * audit logging, manager notification, and approval requirement.
   */
  static async requestTimeCorrection(user: any, input: {
    time_entry_id: string;
    corrected_duration_minutes?: number;
    excess_minutes?: number;
    reason: string;
  }) {
    const { time_entry_id, reason } = input;
    if (!time_entry_id) {
      throw new Error('Time entry ID is required');
    }
    if (!reason || !reason.trim()) {
      throw new Error('Reason is mandatory for requesting a time correction');
    }

    const orgId = this.resolveOrganizationId(user, user.organization_id) || await this.getDefaultOrganizationId();

    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: time_entry_id },
      include: {
        task: { select: { id: true, title: true, project_id: true } },
      },
    });

    if (!timeEntry) {
      throw new Error('Time entry not found');
    }

    if (timeEntry.user_id !== user.id) {
      throw new Error('Forbidden: you can only request corrections for your own time entries');
    }

    const originalDuration = Number(timeEntry.duration_minutes) || 0;
    let correctedDuration: number;

    if (typeof input.excess_minutes === 'number') {
      if (input.excess_minutes <= 0) {
        throw new Error('Excess minutes to remove must be greater than 0');
      }
      correctedDuration = originalDuration - Math.round(input.excess_minutes);
    } else if (typeof input.corrected_duration_minutes === 'number') {
      correctedDuration = Math.round(input.corrected_duration_minutes);
    } else {
      throw new Error('Either corrected_duration_minutes or excess_minutes must be provided');
    }

    if (correctedDuration < 0) {
      throw new Error('Corrected duration cannot reduce a session below zero');
    }
    if (correctedDuration >= originalDuration) {
      throw new Error('Corrected duration must be less than original duration to remove excess time');
    }

    const excessMinutes = originalDuration - correctedDuration;

    // Check if an existing pending correction request already exists for this entry
    const existingLogs = await prisma.auditLog.findMany({
      where: {
        target_type: 'TimeEntry',
        target_id: time_entry_id,
        action: 'TIME_CORRECTION_REQUESTED',
      },
      orderBy: { created_at: 'desc' },
      take: 5,
    });

    for (const log of existingLogs) {
      const meta = log.metadata as any;
      if (meta && meta.status === 'PENDING') {
        throw new Error('A pending correction request already exists for this time entry');
      }
    }

    const requestId = `cor_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const metadata = {
      request_id: requestId,
      time_entry_id: timeEntry.id,
      user_id: user.id,
      user_name: user.name || user.email || 'Intern',
      task_id: timeEntry.task_id,
      task_title: timeEntry.task?.title || 'Task',
      project_id: timeEntry.project_id || timeEntry.task?.project_id || null,
      date: timeEntry.date,
      original_duration_minutes: originalDuration,
      corrected_duration_minutes: correctedDuration,
      excess_minutes: excessMinutes,
      reason: reason.trim(),
      status: 'PENDING',
      created_at: new Date().toISOString(),
    };

    await AuditService.record({
      actorId: user.id,
      organizationId: orgId,
      action: 'TIME_CORRECTION_REQUESTED',
      targetType: 'TimeEntry',
      targetId: timeEntry.id,
      metadata,
    });

    // Notify authorized managers
    try {
      const managers = await prisma.user.findMany({
        where: {
          organization_id: orgId,
          is_active: true,
          roles: {
            some: {
              role: {
                name: { in: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] }
              }
            }
          }
        },
        select: { id: true }
      });
      const managerIds = managers.map(m => m.id).filter(id => id !== user.id);

      if (managerIds.length > 0) {
        await NotificationService.createNotification({
          organizationId: orgId,
          senderId: user.id,
          title: `Time Correction Request from ${user.name || 'Intern'}`,
          message: `${user.name || 'Intern'} requested to reduce ${excessMinutes}m on task "${timeEntry.task?.title || 'Task'}". Reason: ${reason.trim()}`,
          recipientIds: managerIds,
          type: 'ALERT'
        });
      }
    } catch (notifErr) {
      console.error('[TimeCorrection] Failed to notify managers:', notifErr);
    }

    return {
      message: 'Time correction requested successfully',
      request: metadata,
    };
  }

  static async getTimeCorrections(user: any, filters: { status?: string; user_id?: string } = {}) {
    const orgId = this.resolveOrganizationId(user, user.organization_id) || await this.getDefaultOrganizationId();
    const isManager = this.hasRole(user, ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'TECH_LEAD']) || this.hasPermission(user, 'TIMESHEET_VIEW');

    const logs = await prisma.auditLog.findMany({
      where: {
        organization_id: orgId,
        target_type: 'TimeEntry',
        action: 'TIME_CORRECTION_REQUESTED',
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    });

    const resolutionLogs = await prisma.auditLog.findMany({
      where: {
        organization_id: orgId,
        target_type: 'TimeEntry',
        action: { in: ['TIME_CORRECTION_APPROVED', 'TIME_CORRECTION_REJECTED'] },
      },
      orderBy: { created_at: 'desc' },
      take: 200,
    });

    const requests = [];
    for (const log of logs) {
      const meta = log.metadata as any;
      if (!meta || !meta.request_id) continue;

      if (!isManager && meta.user_id !== user.id) {
        continue;
      }
      if (filters.user_id && meta.user_id !== filters.user_id) {
        continue;
      }

      // Check for resolution log matching this request_id
      const resolutionLog = resolutionLogs.find((l) => (l.metadata as any)?.request_id === meta.request_id);

      let currentStatus = meta.status || 'PENDING';
      let reviewedBy = meta.reviewed_by || null;
      let reviewedAt = meta.reviewed_at || null;
      let decisionNote = meta.decision_note || null;

      if (resolutionLog) {
        const resMeta = resolutionLog.metadata as any;
        currentStatus = resolutionLog.action === 'TIME_CORRECTION_APPROVED' ? 'APPROVED' : 'REJECTED';
        reviewedBy = resMeta?.reviewed_by_name || resMeta?.reviewed_by || resolutionLog.actor_id;
        reviewedAt = resMeta?.reviewed_at || resolutionLog.created_at;
        decisionNote = resMeta?.decision_note || null;
      }

      if (filters.status && filters.status !== 'ALL' && currentStatus !== filters.status) {
        continue;
      }

      requests.push({
        ...meta,
        status: currentStatus,
        reviewed_by: reviewedBy,
        reviewed_at: reviewedAt,
        decision_note: decisionNote,
      });
    }

    return { requests };
  }

  static async reviewTimeCorrection(user: any, requestId: string, decision: 'APPROVE' | 'REJECT', decisionNote?: string) {
    if (!this.hasRole(user, ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'TECH_LEAD']) && !this.hasPermission(user, 'ATTENDANCE_UPDATE')) {
      throw new Error('Forbidden: only managers can review time correction requests');
    }

    const orgId = this.resolveOrganizationId(user, user.organization_id) || await this.getDefaultOrganizationId();

    const requestLogs = await prisma.auditLog.findMany({
      where: {
        organization_id: orgId,
        target_type: 'TimeEntry',
        action: 'TIME_CORRECTION_REQUESTED',
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    });

    const requestLog = requestLogs.find((l) => (l.metadata as any)?.request_id === requestId);

    if (!requestLog) {
      throw new Error('Time correction request not found');
    }

    const meta = requestLog.metadata as any;
    if (!meta) throw new Error('Invalid request metadata');

    // Check if already reviewed
    const existingDecisionLogs = await prisma.auditLog.findMany({
      where: {
        organization_id: orgId,
        target_type: 'TimeEntry',
        action: { in: ['TIME_CORRECTION_APPROVED', 'TIME_CORRECTION_REJECTED'] },
      },
    });

    const existingDecision = existingDecisionLogs.find((l) => (l.metadata as any)?.request_id === requestId);

    if (existingDecision) {
      throw new Error(`This request has already been ${existingDecision.action === 'TIME_CORRECTION_APPROVED' ? 'approved' : 'rejected'}`);
    }

    const isApprove = decision === 'APPROVE';
    const actionName = isApprove ? 'TIME_CORRECTION_APPROVED' : 'TIME_CORRECTION_REJECTED';

    if (isApprove) {
      // Apply the correction to the actual TimeEntry
      const timeEntry = await prisma.timeEntry.findUnique({
        where: { id: meta.time_entry_id },
      });

      if (!timeEntry) {
        throw new Error('Associated time entry not found');
      }

      const noteSuffix = `[Correction: -${meta.excess_minutes}m approved by ${user.name || 'Manager'}. Reason: ${meta.reason}]`;
      const updatedNotes = timeEntry.notes ? `${timeEntry.notes} · ${noteSuffix}` : noteSuffix;

      await prisma.timeEntry.update({
        where: { id: meta.time_entry_id },
        data: {
          duration_minutes: meta.corrected_duration_minutes,
          notes: updatedNotes,
        },
      });
    }

    // Record review in AuditLog
    await AuditService.record({
      actorId: user.id,
      organizationId: orgId,
      action: actionName,
      targetType: 'TimeEntry',
      targetId: meta.time_entry_id,
      metadata: {
        request_id: requestId,
        time_entry_id: meta.time_entry_id,
        user_id: meta.user_id,
        status: isApprove ? 'APPROVED' : 'REJECTED',
        reviewed_by: user.id,
        reviewed_by_name: user.name || 'Manager',
        reviewed_at: new Date().toISOString(),
        decision_note: decisionNote ? decisionNote.trim() : null,
        excess_minutes: meta.excess_minutes,
        original_duration_minutes: meta.original_duration_minutes,
        corrected_duration_minutes: meta.corrected_duration_minutes,
      },
    });

    // Notify the intern
    try {
      await NotificationService.createNotification({
        organizationId: orgId,
        senderId: user.id,
        title: `Time Correction ${isApprove ? 'Approved' : 'Rejected'}`,
        message: isApprove
          ? `Your request to remove ${meta.excess_minutes}m on "${meta.task_title || 'Task'}" was approved by ${user.name || 'Manager'}.`
          : `Your request to remove ${meta.excess_minutes}m on "${meta.task_title || 'Task'}" was rejected. ${decisionNote ? `Note: ${decisionNote}` : ''}`,
        recipientIds: [meta.user_id],
        type: 'ALERT',
      });
    } catch (notifErr) {
      console.error('[TimeCorrection] Failed to notify intern:', notifErr);
    }

    return {
      message: `Time correction request ${isApprove ? 'approved' : 'rejected'} successfully`,
      status: isApprove ? 'APPROVED' : 'REJECTED',
      corrected_duration_minutes: isApprove ? meta.corrected_duration_minutes : meta.original_duration_minutes,
    };
  }

  static async getTaskTimeEntries(user: any, taskId: string) {
    const orgId = this.resolveOrganizationId(user, user.organization_id) || await this.getDefaultOrganizationId();
    const task = await prisma.workItem.findUnique({
      where: { id: taskId },
      select: { id: true, organization_id: true, project_id: true },
    });
    if (!task || task.organization_id !== orgId) {
      throw new Error('Task not found in your organization');
    }

    const entries = await prisma.timeEntry.findMany({
      where: { task_id: taskId, organization_id: orgId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { start_time: 'desc' },
    });

    const totalMinutes = entries.reduce((sum, e) => sum + (Number(e.duration_minutes) || 0), 0);
    return {
      task_id: taskId,
      total_minutes: totalMinutes,
      total_hours: +(totalMinutes / 60).toFixed(1),
      entries: entries.map((e) => ({
        id: e.id,
        user_id: e.user_id,
        user_name: e.user?.name || 'Unknown',
        user_email: e.user?.email,
        date: e.date,
        start_time: e.start_time,
        end_time: e.end_time,
        duration_minutes: e.duration_minutes,
        duration_formatted: `${Math.floor(e.duration_minutes / 60)}h ${e.duration_minutes % 60}m`,
        notes: e.notes,
        source: e.work_session_id ? 'TIMER' : 'MANUAL',
        work_session_id: e.work_session_id,
        created_at: e.created_at,
      })),
    };
  }

  static async createTimeEntry(user: any, input: TimeEntryInput) {
    const orgId = this.resolveOrganizationId(user, user.organization_id) || await this.getDefaultOrganizationId();
    const taskId = input.task_id;
    if (!taskId) {
      throw new Error('Task is required');
    }

    const task = await prisma.workItem.findUnique({
      where: { id: taskId },
      include: {
        assignees: true,
        project: true,
      },
    });

    if (!task || task.organization_id !== orgId) {
      throw new Error('Task not found in your organization');
    }

    const projectId = input.project_id || task.project_id || null;
    if (projectId && task.project_id && projectId !== task.project_id) {
      throw new Error('Task does not belong to the selected project');
    }

    const userIsAssignee = task.assignees.some((assignee) => assignee.user_id === user.id);
    const canManageTask = this.hasRole(user, ['MANAGER', 'ADMIN', 'SUPER_ADMIN']) || this.hasPermission(user, 'TASK_UPDATE');

    if (!userIsAssignee && !canManageTask && task.created_by !== user.id) {
      throw new Error('Forbidden: you are not assigned to this task');
    }

    let startTime = toDate(input.start_time);
    let endTime = toDate(input.end_time);
    let durationMinutes = Number(input.duration_minutes ?? (startTime && endTime ? diffMinutes(startTime, endTime) : 0));

    if ((!startTime || !endTime) && durationMinutes > 0) {
      const entryDate = input.date ? new Date(input.date) : new Date();
      const baseYear = entryDate.getUTCFullYear();
      const baseMonth = entryDate.getUTCMonth();
      const baseDay = entryDate.getUTCDate();

      const dayStart = new Date(Date.UTC(baseYear, baseMonth, baseDay, 9, 0, 0));
      const dayEnd = new Date(Date.UTC(baseYear, baseMonth, baseDay, 23, 59, 59));

      const lastEntry = await prisma.timeEntry.findFirst({
        where: {
          user_id: user.id,
          organization_id: orgId,
          end_time: { gte: dayStart, lte: dayEnd },
        },
        orderBy: { end_time: 'desc' },
      });

      if (lastEntry && lastEntry.end_time >= dayStart) {
        startTime = new Date(lastEntry.end_time.getTime() + MINUTE_MS);
      } else {
        startTime = dayStart;
      }
      endTime = new Date(startTime.getTime() + durationMinutes * MINUTE_MS);
    }

    if (!startTime || !endTime) {
      throw new Error('Start time and end time or valid duration are required');
    }
    if (endTime <= startTime) {
      throw new Error('Time entry end time must be after the start time');
    }

    if (durationMinutes <= 0) {
      durationMinutes = diffMinutes(startTime, endTime);
    }
    if (durationMinutes <= 0) {
      throw new Error('Time entry duration must be greater than zero');
    }

    const overlap = await prisma.timeEntry.findFirst({
      where: {
        user_id: user.id,
        organization_id: orgId,
        start_time: { lt: endTime },
        end_time: { gt: startTime },
      },
    });

    if (overlap) {
      // If times were auto-generated, bump after the overlapping end_time
      if (!input.start_time || !input.end_time) {
        startTime = new Date(overlap.end_time.getTime() + MINUTE_MS);
        endTime = new Date(startTime.getTime() + durationMinutes * MINUTE_MS);
      } else {
        throw new Error('Time entry overlaps with an existing entry. Please adjust the range.');
      }
    }

    return prisma.timeEntry.create({
      data: {
        organization_id: orgId,
        user_id: user.id,
        task_id: task.id,
        project_id: projectId,
        work_session_id: input.work_session_id || null,
        date: input.date ? new Date(input.date) : startTime,
        start_time: startTime,
        end_time: endTime,
        duration_minutes: durationMinutes,
        notes: input.notes || null,
      },
      include: {
        task: true,
        project: true,
      },
    });
  }

  static async updateTimeEntry(user: any, timeEntryId: string, input: Partial<TimeEntryInput>) {
    const entry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      include: { task: true },
    });

    if (!entry) {
      throw new Error('Time entry not found');
    }

    const isOwner = entry.user_id === user.id;
    const canManageEntry = this.hasRole(user, ['MANAGER', 'ADMIN', 'SUPER_ADMIN']) || this.hasPermission(user, 'TASK_UPDATE');

    if (!isOwner && !canManageEntry) {
      throw new Error('Forbidden: you can only update your own time entries');
    }

    const startTime = toDate(input.start_time) || entry.start_time;
    const endTime = toDate(input.end_time) || entry.end_time;
    if (endTime <= startTime) {
      throw new Error('Time entry end time must be after the start time');
    }

    const durationMinutes = Number(input.duration_minutes ?? diffMinutes(startTime, endTime));

    const overlap = await prisma.timeEntry.findFirst({
      where: {
        id: { not: timeEntryId },
        user_id: entry.user_id,
        organization_id: entry.organization_id,
        start_time: { lt: endTime },
        end_time: { gt: startTime },
      },
    });

    if (overlap) {
      throw new Error('Updated time entry overlaps with an existing entry.');
    }

    return prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        ...(input.task_id ? { task_id: input.task_id } : {}),
        ...(input.project_id !== undefined ? { project_id: input.project_id || null } : {}),
        ...(input.date ? { date: new Date(input.date) } : {}),
        start_time: startTime,
        end_time: endTime,
        duration_minutes: durationMinutes,
        notes: input.notes ?? entry.notes,
      },
      include: {
        task: true,
        project: true,
      },
    });
  }

  static async deleteTimeEntry(user: any, timeEntryId: string) {
    const entry = await prisma.timeEntry.findUnique({ where: { id: timeEntryId } });
    if (!entry) {
      throw new Error('Time entry not found');
    }

    const isOwner = entry.user_id === user.id;
    const canManageEntry = this.hasRole(user, ['MANAGER', 'ADMIN', 'SUPER_ADMIN']) || this.hasPermission(user, 'TASK_UPDATE');
    if (!isOwner && !canManageEntry) {
      throw new Error('Forbidden: you cannot delete another user\'s time entry');
    }

    await prisma.timeEntry.delete({ where: { id: timeEntryId } });
    return { success: true };
  }

  static calculateDailySummary(
    policy: OrganizationWorkPolicyInput | any,
    sessions: Array<any>,
    taskEntries: Array<any> = [],
    referenceDate: Date | string = new Date()
  ) {
    const date = new Date(referenceDate);
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const timeZone = policy.timezone || 'Asia/Kolkata';
    const officeStart = buildLocalDateForTime(startOfDay, policy.office_start_time || '09:00', timeZone);
    const officeEnd = buildLocalDateForTime(startOfDay, policy.office_end_time || '17:30', timeZone);
    const breakStart = policy.break_start_time ? buildLocalDateForTime(startOfDay, policy.break_start_time, timeZone) : null;
    const breakEnd = policy.break_end_time ? buildLocalDateForTime(startOfDay, policy.break_end_time, timeZone) : null;

    const attendanceIntervals: Array<[number, number]> = [];
    for (const session of sessions) {
      const sessionStart = new Date(session.started_at);
      const sessionEnd = new Date(session.ended_at || new Date());
      if (sessionEnd < officeStart || sessionStart > officeEnd) {
        continue;
      }
      const clampedStart = new Date(Math.max(sessionStart.getTime(), officeStart.getTime()));
      const clampedEnd = new Date(Math.min(sessionEnd.getTime(), officeEnd.getTime()));
      if (clampedEnd > clampedStart) {
        attendanceIntervals.push([clampedStart.getTime(), clampedEnd.getTime()]);
      }
    }

    attendanceIntervals.sort(([startA], [startB]) => startA - startB);
    let attendanceMinutes = 0;
    let mergedStart = 0;
    let mergedEnd = 0;
    for (const [intervalStart, intervalEnd] of attendanceIntervals) {
      if (mergedEnd === 0) {
        mergedStart = intervalStart;
        mergedEnd = intervalEnd;
      } else if (intervalStart <= mergedEnd) {
        mergedEnd = Math.max(mergedEnd, intervalEnd);
      } else {
        attendanceMinutes += diffMinutes(new Date(mergedStart), new Date(mergedEnd));
        mergedStart = intervalStart;
        mergedEnd = intervalEnd;
      }
    }
    if (mergedEnd > 0) {
      attendanceMinutes += diffMinutes(new Date(mergedStart), new Date(mergedEnd));
    }

    let breakMinutes = 0;
    if (breakStart && breakEnd) {
      const breakWindowStart = new Date(Math.max(breakStart.getTime(), officeStart.getTime()));
      const breakWindowEnd = new Date(Math.min(breakEnd.getTime(), officeEnd.getTime()));
      if (breakWindowEnd > breakWindowStart) {
        breakMinutes = overlapMinutes(officeStart, officeEnd, breakWindowStart, breakWindowEnd);
      }
    } else if ((policy.lunch_break_minutes ?? 0) > 0) {
      breakMinutes = Math.min(attendanceMinutes, Number(policy.lunch_break_minutes || 0));
    }

    const netWorkingMinutes = Math.max(0, attendanceMinutes - breakMinutes);
    const taskMinutes = taskEntries.reduce((sum, entry) => sum + Number(entry.duration_minutes || diffMinutes(new Date(entry.start_time), new Date(entry.end_time)) || 0), 0);
    const unallocatedMinutes = Math.max(0, netWorkingMinutes - taskMinutes);

    return {
      date: startOfDay.toISOString().slice(0, 10),
      gross_office_minutes: diffMinutes(officeStart, officeEnd),
      attendance_minutes: attendanceMinutes,
      break_minutes: breakMinutes,
      net_working_minutes: netWorkingMinutes,
      task_minutes: taskMinutes,
      unallocated_minutes: unallocatedMinutes,
    };
  }

  static async getDailyTimesheet(user: any, targetUserId?: string | null, dateValue?: Date | string) {
    const targetId = targetUserId || user.id;
    const orgId = this.resolveOrganizationId(user, user.organization_id) || await this.getDefaultOrganizationId();

    const isOwner = targetId === user.id;
    const canViewTeam = this.hasRole(user, ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'TECH_LEAD']);
    if (!isOwner && !canViewTeam) {
      throw new Error('Forbidden: you cannot view another user\'s timesheet');
    }

    await this.autoClockExpiredSessions(orgId, targetId);

    const date = dateValue ? new Date(dateValue) : new Date();
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const sessions = await prisma.workSession.findMany({
      where: {
        user_id: targetId,
        organization_id: orgId,
        started_at: { lte: endOfDay },
      },
      orderBy: { started_at: 'asc' },
    });

    const policy = await this.getOrganizationWorkPolicy({ ...user, organization_id: orgId });
    const taskEntries = await prisma.timeEntry.findMany({
      where: {
        user_id: targetId,
        organization_id: orgId,
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        task: true,
        project: true,
      },
      orderBy: { start_time: 'asc' },
    });

    const summary = this.calculateDailySummary(policy, sessions, taskEntries, startOfDay);

    return {
      ...summary,
      sessions: sessions.map((session) => ({
        id: session.id,
        started_at: session.started_at,
        ended_at: session.ended_at,
        break_minutes: session.break_minutes,
      })),
      task_entries: taskEntries,
    };
  }

  static async getWeeklyTimesheet(
    user: any,
    targetUserId?: string | null,
    dateValue?: Date | string,
    filters: {
      status?: string;
      priority?: string;
      time_filter?: string;
      search?: string;
    } = {}
  ) {
    const targetId = targetUserId || user.id;
    const orgId = this.resolveOrganizationId(user, user.organization_id) || await this.getDefaultOrganizationId();

    const isOwner = targetId === user.id;
    const canViewTeam = this.hasRole(user, ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'TECH_LEAD']);
    if (!isOwner && !canViewTeam) {
      throw new Error('Forbidden: you cannot view another user\'s timesheet');
    }

    await this.autoClockExpiredSessions(orgId, targetId);

    let targetUserInfo: any = null;
    if (!isOwner) {
      targetUserInfo = await prisma.user.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          name: true,
          email: true,
          user_code: true,
          batch: true,
          subbatch: true,
          organization_id: true,
          cohort: { select: { id: true, name: true, code: true } },
        },
      });
      if (!targetUserInfo) {
        throw new Error('User not found');
      }
      const isSuperAdmin = this.hasRole(user, ['SUPER_ADMIN']);
      if (!isSuperAdmin && targetUserInfo.organization_id !== orgId) {
        throw new Error('Forbidden: target user is outside your organization scope');
      }
    }

    const today = dateValue ? new Date(dateValue) : new Date();
    if (isNaN(today.getTime())) {
      throw new Error('Invalid date provided');
    }

    const startOfWeek = new Date(today);
    startOfWeek.setUTCHours(0, 0, 0, 0);
    const day = startOfWeek.getUTCDay();
    const diffToMonday = (day + 6) % 7;
    startOfWeek.setUTCDate(startOfWeek.getUTCDate() - diffToMonday);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
    endOfWeek.setUTCHours(23, 59, 59, 999);

    const todayIso = new Date().toISOString().slice(0, 10);
    const dayDateStrings: string[] = [];
    const days: Array<{
      date: string;
      dayName: string;
      dayNumber: number;
      isWeekend: boolean;
      isToday: boolean;
      total_minutes: number;
      summary?: any;
    }> = [];

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let index = 0; index < 7; index += 1) {
      const currentDay = new Date(startOfWeek);
      currentDay.setUTCDate(startOfWeek.getUTCDate() + index);
      const dateStr = currentDay.toISOString().slice(0, 10);
      const dayOfWeek = currentDay.getUTCDay();
      dayDateStrings.push(dateStr);

      const dailySummary = await this.getDailyTimesheet(user, targetId, currentDay);

      days.push({
        date: dateStr,
        dayName: dayNames[dayOfWeek],
        dayNumber: currentDay.getUTCDate(),
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isToday: dateStr === todayIso,
        total_minutes: 0,
        summary: dailySummary,
      });
    }

    const entries = await prisma.timeEntry.findMany({
      where: {
        user_id: targetId,
        organization_id: orgId,
        date: {
          gte: startOfWeek,
          lte: endOfWeek,
        },
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            type: true,
            story_points: true,
            project_id: true,
            project: { select: { id: true, name: true } },
            sprint: { select: { id: true, name: true } },
          },
        },
        project: { select: { id: true, name: true } },
      },
      orderBy: { start_time: 'asc' },
    });

    const assignedTasks = await prisma.workItem.findMany({
      where: {
        assignees: { some: { user_id: targetId } },
        organization_id: orgId,
      },
      include: {
        project: { select: { id: true, name: true } },
        sprint: { select: { id: true, name: true } },
      },
      orderBy: [{ updated_at: 'desc' }],
      take: 100,
    });

    const taskMap = new Map<string, any>();

    for (const t of assignedTasks) {
      taskMap.set(t.id, {
        id: t.id,
        key: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        type: t.type,
        story_points: t.story_points,
        project: t.project,
        cycle: t.sprint,
        days: Object.fromEntries(dayDateStrings.map((d) => [d, { minutes: 0, formatted: '0h 0m', entries: [] as any[] }])),
        total_minutes: 0,
        total_formatted: '0h 0m',
      });
    }

    const dailyTotals: Record<string, number> = Object.fromEntries(dayDateStrings.map((d) => [d, 0]));
    let grandTotalMinutes = 0;

    for (const entry of entries) {
      const entryDateStr = entry.date ? new Date(entry.date).toISOString().slice(0, 10) : '';
      const duration = Number(entry.duration_minutes) || 0;
      if (!dayDateStrings.includes(entryDateStr)) continue;

      dailyTotals[entryDateStr] = (dailyTotals[entryDateStr] || 0) + duration;
      grandTotalMinutes += duration;

      const taskId = entry.task_id;
      if (taskId) {
        if (!taskMap.has(taskId)) {
          taskMap.set(taskId, {
            id: taskId,
            key: taskId,
            title: entry.task?.title || 'Untitled Task',
            status: entry.task?.status || 'TODO',
            priority: entry.task?.priority || 'MEDIUM',
            type: entry.task?.type || 'TASK',
            story_points: entry.task?.story_points || 0,
            project: entry.task?.project || entry.project || null,
            cycle: entry.task?.sprint || null,
            days: Object.fromEntries(dayDateStrings.map((d) => [d, { minutes: 0, formatted: '0h 0m', entries: [] as any[] }])),
            total_minutes: 0,
            total_formatted: '0h 0m',
          });
        }

        const taskRow = taskMap.get(taskId);
        taskRow.days[entryDateStr].minutes += duration;
        const dMins = taskRow.days[entryDateStr].minutes;
        taskRow.days[entryDateStr].formatted = `${Math.floor(dMins / 60)}h ${dMins % 60}m`;
        taskRow.days[entryDateStr].entries.push({
          id: entry.id,
          duration_minutes: duration,
          start_time: entry.start_time,
          end_time: entry.end_time,
          notes: entry.notes,
          source: entry.work_session_id ? 'TIMER' : 'MANUAL',
        });

        taskRow.total_minutes += duration;
        const tMins = taskRow.total_minutes;
        taskRow.total_formatted = `${Math.floor(tMins / 60)}h ${tMins % 60}m`;
      }
    }

    for (const dayObj of days) {
      dayObj.total_minutes = dailyTotals[dayObj.date] || 0;
    }

    const activeSession = await prisma.workSession.findFirst({
      where: {
        user_id: targetId,
        organization_id: orgId,
        ended_at: null,
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            project: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { started_at: 'desc' },
    });

    let task_rows = Array.from(taskMap.values());
    const all_task_rows_count = task_rows.length;

    if (filters.status && filters.status !== 'ALL') {
      const s = filters.status.toUpperCase();
      task_rows = task_rows.filter((r) => (r.status || 'TODO').toUpperCase() === s);
    }
    if (filters.priority && filters.priority !== 'ALL') {
      const p = filters.priority.toUpperCase();
      task_rows = task_rows.filter((r) => (r.priority || 'MEDIUM').toUpperCase() === p);
    }
    if (filters.time_filter === 'LOGGED') {
      task_rows = task_rows.filter((r) => (r.total_minutes || 0) > 0);
    } else if (filters.time_filter === 'NO_LOGGED') {
      task_rows = task_rows.filter((r) => (r.total_minutes || 0) === 0);
    }
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      task_rows = task_rows.filter((r) => {
        const titleMatch = (r.title || '').toLowerCase().includes(q);
        const keyMatch = (r.key || r.id || '').toLowerCase().includes(q);
        const projMatch = (r.project?.name || '').toLowerCase().includes(q);
        return titleMatch || keyMatch || projMatch;
      });
    }

    return {
      user: targetUserInfo || { id: user.id, name: user.name, email: user.email },
      start_date: startOfWeek.toISOString().slice(0, 10),
      end_date: endOfWeek.toISOString().slice(0, 10),
      total_minutes: grandTotalMinutes,
      total_formatted: `${Math.floor(grandTotalMinutes / 60)}h ${grandTotalMinutes % 60}m`,
      days,
      daily_totals: dailyTotals,
      task_rows,
      all_task_rows_count,
      available_statuses: [
        { id: 'ALL', label: 'All Statuses' },
        { id: 'TODO', label: 'To Do' },
        { id: 'IN_PROGRESS', label: 'In Progress' },
        { id: 'IN_REVIEW', label: 'In Review' },
        { id: 'BLOCKED', label: 'Blocked' },
        { id: 'COMPLETED', label: 'Completed' },
      ],
      available_priorities: [
        { id: 'ALL', label: 'All Priorities' },
        { id: 'URGENT', label: 'Urgent' },
        { id: 'HIGH', label: 'High' },
        { id: 'MEDIUM', label: 'Medium' },
        { id: 'LOW', label: 'Low' },
      ],
      available_tasks: assignedTasks.map((t) => ({
        id: t.id,
        title: t.title,
        key: t.id,
        status: t.status,
        project: t.project,
      })),
      active_session: activeSession,
    };
  }

  static async getMonthlyTimesheet(
    user: any,
    targetUserId?: string | null,
    dateValue?: Date | string,
    filters: {
      status?: string;
      priority?: string;
      time_filter?: string;
      search?: string;
    } = {}
  ) {
    const targetId = targetUserId || user.id;
    const orgId = this.resolveOrganizationId(user, user.organization_id) || await this.getDefaultOrganizationId();

    const isOwner = targetId === user.id;
    const canViewTeam = this.hasRole(user, ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'TECH_LEAD']);
    if (!isOwner && !canViewTeam) {
      throw new Error('Forbidden: you cannot view another user\'s timesheet');
    }

    await this.autoClockExpiredSessions(orgId, targetId);

    let targetUserInfo: any = null;
    if (!isOwner) {
      targetUserInfo = await prisma.user.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          name: true,
          email: true,
          user_code: true,
          batch: true,
          subbatch: true,
          organization_id: true,
          cohort: { select: { id: true, name: true, code: true } },
        },
      });
      if (!targetUserInfo) {
        throw new Error('User not found');
      }
      const isSuperAdmin = this.hasRole(user, ['SUPER_ADMIN']);
      if (!isSuperAdmin && targetUserInfo.organization_id !== orgId) {
        throw new Error('Forbidden: target user is outside your organization scope');
      }
    }

    const referenceDate = dateValue ? new Date(dateValue) : new Date();
    if (isNaN(referenceDate.getTime())) {
      throw new Error('Invalid date provided');
    }

    const year = referenceDate.getUTCFullYear();
    const month = referenceDate.getUTCMonth();

    const startOfMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

    const startOfMonthIso = startOfMonth.toISOString().slice(0, 10);
    const endOfMonthIso = endOfMonth.toISOString().slice(0, 10);

    // Compute calendar-week groups starting Monday of week containing day 1
    const firstDow = startOfMonth.getUTCDay();
    const diffToMonday = (firstDow + 6) % 7;
    const firstWeekMonday = new Date(Date.UTC(year, month, 1 - diffToMonday, 0, 0, 0, 0));

    const weekGroups: Array<{
      week_number: number;
      start_date: string;
      end_date: string;
      label: string;
      total_minutes: number;
      total_formatted: string;
      days: Array<{
        date: string;
        dayName: string;
        dayNumber: number;
        in_month: boolean;
        isWeekend: boolean;
        isToday: boolean;
        total_minutes: number;
      }>;
      task_rows: any[];
    }> = [];

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthNamesFull = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const todayIso = new Date().toISOString().slice(0, 10);

    let curMonday = new Date(firstWeekMonday);
    let weekIndex = 1;

    while (curMonday <= endOfMonth) {
      const curSunday = new Date(curMonday);
      curSunday.setUTCDate(curMonday.getUTCDate() + 6);
      curSunday.setUTCHours(23, 59, 59, 999);

      const weekDays = [];
      let firstInMonthDay: Date | null = null;
      let lastInMonthDay: Date | null = null;

      for (let i = 0; i < 7; i++) {
        const d = new Date(curMonday);
        d.setUTCDate(curMonday.getUTCDate() + i);
        const dIso = d.toISOString().slice(0, 10);
        const dow = d.getUTCDay();
        const inMonth = d >= startOfMonth && d <= endOfMonth;

        if (inMonth) {
          if (!firstInMonthDay) firstInMonthDay = d;
          lastInMonthDay = d;
        }

        weekDays.push({
          date: dIso,
          dayName: dayNames[dow],
          dayNumber: d.getUTCDate(),
          in_month: inMonth,
          isWeekend: dow === 0 || dow === 6,
          isToday: dIso === todayIso,
          total_minutes: 0,
        });
      }

      let label = `Week ${weekIndex}`;
      if (firstInMonthDay && lastInMonthDay) {
        const sM = monthNamesShort[firstInMonthDay.getUTCMonth()];
        const eM = monthNamesShort[lastInMonthDay.getUTCMonth()];
        if (sM === eM) {
          if (firstInMonthDay.getUTCDate() === lastInMonthDay.getUTCDate()) {
            label = `Week ${weekIndex} (${sM} ${firstInMonthDay.getUTCDate()})`;
          } else {
            label = `Week ${weekIndex} (${sM} ${firstInMonthDay.getUTCDate()}–${lastInMonthDay.getUTCDate()})`;
          }
        } else {
          label = `Week ${weekIndex} (${sM} ${firstInMonthDay.getUTCDate()} – ${eM} ${lastInMonthDay.getUTCDate()})`;
        }
      }

      weekGroups.push({
        week_number: weekIndex,
        start_date: curMonday.toISOString().slice(0, 10),
        end_date: curSunday.toISOString().slice(0, 10),
        label,
        total_minutes: 0,
        total_formatted: '0h 0m',
        days: weekDays,
        task_rows: [],
      });

      curMonday = new Date(curMonday);
      curMonday.setUTCDate(curMonday.getUTCDate() + 7);
      weekIndex++;
    }

    // Query time entries strictly within the month
    const entries = await prisma.timeEntry.findMany({
      where: {
        user_id: targetId,
        organization_id: orgId,
        date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            type: true,
            story_points: true,
            project_id: true,
            project: { select: { id: true, name: true } },
            sprint: { select: { id: true, name: true } },
          },
        },
        project: { select: { id: true, name: true } },
      },
      orderBy: { start_time: 'asc' },
    });

    const assignedTasks = await prisma.workItem.findMany({
      where: {
        assignees: { some: { user_id: targetId } },
        organization_id: orgId,
      },
      include: {
        project: { select: { id: true, name: true } },
        sprint: { select: { id: true, name: true } },
      },
      orderBy: [{ updated_at: 'desc' }],
      take: 100,
    });

    // Build monthly task map
    const taskMap = new Map<string, any>();
    for (const t of assignedTasks) {
      taskMap.set(t.id, {
        id: t.id,
        key: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        type: t.type,
        story_points: t.story_points,
        project: t.project,
        cycle: t.sprint,
        weeks: Object.fromEntries(weekGroups.map((w) => [w.week_number, { minutes: 0, formatted: '0h 0m' }])),
        days: {} as Record<string, { minutes: number; formatted: string }>,
        total_minutes: 0,
        total_formatted: '0h 0m',
      });
    }

    let grandTotalMinutes = 0;
    const daysWithTime = new Set<string>();

    for (const entry of entries) {
      const entryDateStr = entry.date ? new Date(entry.date).toISOString().slice(0, 10) : '';
      if (!entryDateStr || entryDateStr < startOfMonthIso || entryDateStr > endOfMonthIso) continue;

      const duration = Number(entry.duration_minutes) || 0;
      if (duration > 0) {
        daysWithTime.add(entryDateStr);
      }
      grandTotalMinutes += duration;

      // Find which week group this entry belongs to
      for (const wg of weekGroups) {
        const dayInGroup = wg.days.find((d) => d.date === entryDateStr && d.in_month);
        if (dayInGroup) {
          dayInGroup.total_minutes += duration;
          wg.total_minutes += duration;
          break;
        }
      }

      const taskId = entry.task_id;
      if (taskId) {
        if (!taskMap.has(taskId)) {
          taskMap.set(taskId, {
            id: taskId,
            key: taskId,
            title: entry.task?.title || 'Untitled Task',
            status: entry.task?.status || 'TODO',
            priority: entry.task?.priority || 'MEDIUM',
            type: entry.task?.type || 'TASK',
            story_points: entry.task?.story_points || 0,
            project: entry.task?.project || entry.project || null,
            cycle: entry.task?.sprint || null,
            weeks: Object.fromEntries(weekGroups.map((w) => [w.week_number, { minutes: 0, formatted: '0h 0m' }])),
            days: {} as Record<string, { minutes: number; formatted: string }>,
            total_minutes: 0,
            total_formatted: '0h 0m',
          });
        }

        const taskRow = taskMap.get(taskId);
        taskRow.total_minutes += duration;
        taskRow.total_formatted = `${Math.floor(taskRow.total_minutes / 60)}h ${taskRow.total_minutes % 60}m`;

        if (!taskRow.days[entryDateStr]) {
          taskRow.days[entryDateStr] = { minutes: 0, formatted: '0h 0m', entries: [] };
        }
        taskRow.days[entryDateStr].minutes += duration;
        taskRow.days[entryDateStr].formatted = `${Math.floor(taskRow.days[entryDateStr].minutes / 60)}h ${taskRow.days[entryDateStr].minutes % 60}m`;
        if (!taskRow.days[entryDateStr].entries) {
          taskRow.days[entryDateStr].entries = [];
        }
        taskRow.days[entryDateStr].entries.push({
          id: entry.id,
          duration_minutes: duration,
          start_time: entry.start_time,
          end_time: entry.end_time,
          notes: entry.notes,
          source: entry.work_session_id ? 'TIMER' : 'MANUAL',
        });

        for (const wg of weekGroups) {
          if (entryDateStr >= wg.start_date && entryDateStr <= wg.end_date) {
            taskRow.weeks[wg.week_number].minutes += duration;
            const wM = taskRow.weeks[wg.week_number].minutes;
            taskRow.weeks[wg.week_number].formatted = `${Math.floor(wM / 60)}h ${wM % 60}m`;
            break;
          }
        }
      }
    }

    for (const wg of weekGroups) {
      wg.total_formatted = `${Math.floor(wg.total_minutes / 60)}h ${wg.total_minutes % 60}m`;
    }

    let task_rows = Array.from(taskMap.values());
    const all_task_rows_count = task_rows.length;

    if (filters.status && filters.status !== 'ALL') {
      const s = filters.status.toUpperCase();
      task_rows = task_rows.filter((r) => (r.status || 'TODO').toUpperCase() === s);
    }
    if (filters.priority && filters.priority !== 'ALL') {
      const p = filters.priority.toUpperCase();
      task_rows = task_rows.filter((r) => (r.priority || 'MEDIUM').toUpperCase() === p);
    }
    if (filters.time_filter === 'LOGGED') {
      task_rows = task_rows.filter((r) => (r.total_minutes || 0) > 0);
    } else if (filters.time_filter === 'NO_LOGGED') {
      task_rows = task_rows.filter((r) => (r.total_minutes || 0) === 0);
    }
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      task_rows = task_rows.filter((r) => {
        const titleMatch = (r.title || '').toLowerCase().includes(q);
        const keyMatch = (r.key || r.id || '').toLowerCase().includes(q);
        const projMatch = (r.project?.name || '').toLowerCase().includes(q);
        return titleMatch || keyMatch || projMatch;
      });
    }

    // Embed task rows into week groups for expandable weekly breakdown
    for (const wg of weekGroups) {
      wg.task_rows = task_rows
        .map((t) => {
          const weekMins = t.weeks[wg.week_number]?.minutes || 0;
          return {
            ...t,
            week_minutes: weekMins,
            week_formatted: `${Math.floor(weekMins / 60)}h ${weekMins % 60}m`,
          };
        })
        .filter((t) => filters.time_filter === 'NO_LOGGED' ? t.week_minutes === 0 : t.week_minutes > 0);
    }

    const activeTasksCount = task_rows.filter((r) => (r.total_minutes || 0) > 0).length;
    const activeDaysCount = daysWithTime.size;
    const avgDailyMinutes = activeDaysCount > 0 ? Math.round(grandTotalMinutes / activeDaysCount) : 0;

    const activeSession = await prisma.workSession.findFirst({
      where: {
        user_id: targetId,
        organization_id: orgId,
        ended_at: null,
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            project: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { started_at: 'desc' },
    });

    return {
      user: targetUserInfo || { id: user.id, name: user.name, email: user.email },
      month: referenceDate.toISOString().slice(0, 7),
      month_name: `${monthNamesFull[month]} ${year}`,
      start_date: startOfMonthIso,
      end_date: endOfMonthIso,
      total_minutes: grandTotalMinutes,
      total_formatted: `${Math.floor(grandTotalMinutes / 60)}h ${grandTotalMinutes % 60}m`,
      active_tasks_count: activeTasksCount,
      active_days_count: activeDaysCount,
      avg_daily_minutes: avgDailyMinutes,
      avg_daily_formatted: `${Math.floor(avgDailyMinutes / 60)}h ${avgDailyMinutes % 60}m`,
      weeks: weekGroups,
      task_rows,
      all_task_rows_count,
      available_statuses: [
        { id: 'ALL', label: 'All Statuses' },
        { id: 'TODO', label: 'To Do' },
        { id: 'IN_PROGRESS', label: 'In Progress' },
        { id: 'IN_REVIEW', label: 'In Review' },
        { id: 'BLOCKED', label: 'Blocked' },
        { id: 'COMPLETED', label: 'Completed' },
      ],
      available_priorities: [
        { id: 'ALL', label: 'All Priorities' },
        { id: 'URGENT', label: 'Urgent' },
        { id: 'HIGH', label: 'High' },
        { id: 'MEDIUM', label: 'Medium' },
        { id: 'LOW', label: 'Low' },
      ],
      available_tasks: assignedTasks.map((t) => ({
        id: t.id,
        title: t.title,
        key: t.id,
        status: t.status,
        project: t.project,
      })),
      active_session: activeSession,
      // Backward-compat keys for getInternReport/getManagerReport:
      working_days: activeDaysCount,
      present_days: activeDaysCount,
      absent_days: 0,
      total_official_minutes: grandTotalMinutes,
      total_actual_minutes: grandTotalMinutes,
      total_task_minutes: grandTotalMinutes,
      average_hours_per_day: activeDaysCount > 0 ? Number(((grandTotalMinutes / activeDaysCount) / 60).toFixed(2)) : 0,
      total_unallocated_minutes: 0,
      days: [],
    };
  }

  static async getTaskTime(user: any, targetUserId?: string | null, dateValue?: Date | string) {
    const targetId = targetUserId || user.id;
    const isOwner = targetId === user.id;
    const canView = isOwner || this.hasRole(user, ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'TECH_LEAD']);
    if (!canView) {
      throw new Error('Forbidden: you cannot view that user\'s task time');
    }

    const referenceDate = dateValue ? new Date(dateValue) : new Date();
    const startOfDay = new Date(referenceDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(referenceDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const entries = await prisma.timeEntry.findMany({
      where: {
        user_id: targetId,
        organization_id: this.resolveOrganizationId(user, user.organization_id) || await this.getDefaultOrganizationId(),
        date: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        task: true,
        project: true,
      },
      orderBy: { start_time: 'asc' },
    });

    return {
      date: referenceDate.toISOString().slice(0, 10),
      entries,
      total_minutes: entries.reduce((sum, entry) => sum + Number(entry.duration_minutes || 0), 0),
    };
  }

  static async getInternReport(user: any, targetUserId?: string | null, dateValue?: Date | string) {
    const targetId = targetUserId || user.id;
    const canView = targetId === user.id || this.hasRole(user, ['MANAGER', 'ADMIN', 'SUPER_ADMIN']);
    if (!canView) {
      throw new Error('Forbidden: you cannot access that intern report');
    }

    const date = dateValue ? new Date(dateValue) : new Date();
    const thirtyDays = new Date(date);
    thirtyDays.setUTCDate(date.getUTCDate() - 29);

    const entries = await prisma.timeEntry.findMany({
      where: {
        user_id: targetId,
        organization_id: this.resolveOrganizationId(user, user.organization_id) || await this.getDefaultOrganizationId(),
        date: { gte: thirtyDays },
      },
      include: {
        task: true,
        project: true,
      },
    });

    const monthSummary = await this.getMonthlyTimesheet(user, targetId, date);

    return {
      period_start: thirtyDays.toISOString().slice(0, 10),
      period_end: date.toISOString().slice(0, 10),
      total_task_minutes: monthSummary.total_task_minutes,
      total_working_minutes: monthSummary.total_actual_minutes,
      average_working_minutes_per_day: monthSummary.average_hours_per_day * 60,
      task_entries: entries,
      report: monthSummary,
    };
  }

  static async getIndividualReport(
    user: any,
    targetUserId: string,
    period: 'day' | 'week' | 'month' = 'day',
    dateValue?: Date | string,
    startDateValue?: Date | string,
    endDateValue?: Date | string
  ) {
    const organizationId = this.resolveOrganizationId(user, user.organization_id) || await this.getDefaultOrganizationId();
    const targetUser = await prisma.user.findFirst({
      where: { id: targetUserId, organization_id: organizationId },
      select: { id: true, name: true, email: true, user_code: true, batch: true, is_active: true },
    });

    if (!targetUser) {
      throw new Error('User not found in your organization');
    }

    const canView = targetUser.id === user.id || this.hasRole(user, ['MANAGER', 'ADMIN', 'SUPER_ADMIN']);
    if (!canView) {
      throw new Error('Forbidden: you cannot access that intern report');
    }

    const referenceDate = dateValue ? new Date(dateValue) : new Date();
    let startDate = startDateValue ? new Date(startDateValue) : new Date(referenceDate);
    let endDate = endDateValue ? new Date(endDateValue) : new Date(referenceDate);

    if (period === 'week') {
      startDate = new Date(referenceDate);
      startDate.setUTCHours(0, 0, 0, 0);
      startDate.setUTCDate(startDate.getUTCDate() - ((startDate.getUTCDay() + 6) % 7));
      endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + 6);
      endDate.setUTCHours(23, 59, 59, 999);
    } else if (period === 'month') {
      startDate = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1));
      endDate = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    } else {
      startDate.setUTCHours(0, 0, 0, 0);
      endDate.setUTCHours(23, 59, 59, 999);
    }

    if (endDate < startDate) {
      throw new Error('Report end date must be on or after the start date');
    }

    const days: any[] = [];
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      days.push(await this.getDailyTimesheet(user, targetUserId, new Date(cursor)));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const [assignedTasks, detailedEntries] = await Promise.all([
      prisma.workItem.findMany({
        where: {
          organization_id: organizationId,
          created_at: { lte: endDate },
          assignees: { some: { user_id: targetUserId } },
        },
        include: {
          project: true,
          assignees: { where: { user_id: targetUserId } },
        },
        orderBy: { created_at: 'asc' },
      }),
      prisma.timeEntry.findMany({
        where: {
          organization_id: organizationId,
          user_id: targetUserId,
          date: { gte: startDate, lte: endDate },
        },
        include: {
          task: true,
          project: true,
          work_session: true,
        },
        orderBy: { start_time: 'asc' },
      }),
    ]);

    const taskBreakdown = new Map<string, any>();
    const timeline: any[] = [];

    for (const task of assignedTasks) {
      const assignment = task.assignees[0];
      const assignedAt = assignment?.created_at || task.created_at;
      const lifecycleEnd = task.completed_at || new Date();
      const lifecycleMinutes = diffMinutes(new Date(assignedAt), lifecycleEnd);
      taskBreakdown.set(task.id, {
        task_id: task.id,
        task_title: task.title,
        project_id: task.project_id,
        project_name: task.project?.name || null,
        status: task.status,
        assigned_at: assignedAt,
        completed_at: task.completed_at,
        lifecycle_minutes: lifecycleMinutes,
        actual_work_minutes: 0,
        minutes: 0,
        entries: 0,
      });
      timeline.push({
        type: 'task_created',
        timestamp: task.created_at,
        task_id: task.id,
        task_title: task.title,
      });
      if (assignment?.created_at) {
        timeline.push({
          type: 'assigned',
          timestamp: assignment.created_at,
          task_id: task.id,
          task_title: task.title,
        });
      }
      if (task.completed_at) {
        timeline.push({
          type: 'task_completed',
          timestamp: task.completed_at,
          task_id: task.id,
          task_title: task.title,
        });
      }
    }

    const startedTasks = new Set<string>();
    for (const entry of detailedEntries) {
      const existing = taskBreakdown.get(entry.task_id) || {
        task_id: entry.task_id,
        task_title: entry.task?.title || 'Task',
        project_id: entry.project_id || entry.project?.id || null,
        project_name: entry.project?.name || null,
        status: entry.task?.status || null,
        minutes: 0,
        entries: 0,
      };
      existing.minutes += Number(entry.duration_minutes || 0);
      existing.actual_work_minutes = existing.minutes;
      existing.entries += 1;
      taskBreakdown.set(entry.task_id, existing);

      if (!startedTasks.has(entry.task_id)) {
        startedTasks.add(entry.task_id);
        timeline.push({
          type: 'work_started',
          timestamp: entry.start_time,
          task_id: entry.task_id,
          task_title: entry.task?.title || 'Task',
        });
      }
      timeline.push({
        type: 'time_entry',
        timestamp: entry.start_time,
        task_id: entry.task_id,
        task_title: entry.task?.title || 'Task',
        project_id: entry.project_id,
        project_name: entry.project?.name || null,
        start_time: entry.start_time,
        end_time: entry.end_time,
        duration_minutes: entry.duration_minutes,
        work_session_id: entry.work_session_id,
      });
    }

    const totals = days.reduce((result, day) => ({
      gross_office_minutes: result.gross_office_minutes + day.gross_office_minutes,
      attendance_minutes: result.attendance_minutes + day.attendance_minutes,
      break_minutes: result.break_minutes + day.break_minutes,
      net_working_minutes: result.net_working_minutes + day.net_working_minutes,
      task_minutes: result.task_minutes + day.task_minutes,
      unallocated_minutes: result.unallocated_minutes + day.unallocated_minutes,
    }), {
      gross_office_minutes: 0,
      attendance_minutes: 0,
      break_minutes: 0,
      net_working_minutes: 0,
      task_minutes: 0,
      unallocated_minutes: 0,
    });

    return {
      user: targetUser,
      period,
      start_date: startDate.toISOString().slice(0, 10),
      end_date: endDate.toISOString().slice(0, 10),
      totals,
      days: days.map((day) => ({
        date: day.date,
        attendance_minutes: day.attendance_minutes,
        gross_office_minutes: day.gross_office_minutes,
        break_minutes: day.break_minutes,
        net_working_minutes: day.net_working_minutes,
        task_minutes: day.task_minutes,
        unallocated_minutes: day.unallocated_minutes,
      })),
      task_breakdown: [...taskBreakdown.values()].sort((a, b) => b.minutes - a.minutes),
      time_entries: detailedEntries.map((entry) => ({
        id: entry.id,
        task_id: entry.task_id,
        task_title: entry.task?.title || 'Task',
        project_id: entry.project_id,
        project_name: entry.project?.name || null,
        status: entry.task?.status || null,
        date: entry.date,
        start_time: entry.start_time,
        end_time: entry.end_time,
        duration_minutes: entry.duration_minutes,
        work_session_id: entry.work_session_id,
      })),
      timeline: timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    };
  }

  static async getManagerReport(user: any, dateValue?: Date | string) {
    if (!this.hasRole(user, ['MANAGER', 'ADMIN', 'SUPER_ADMIN']) && !this.hasPermission(user, 'ATTENDANCE_READ')) {
      throw new Error('Forbidden: managers can only view team reports');
    }

    const orgId = this.resolveOrganizationId(user, user.organization_id) || await this.getDefaultOrganizationId();
    const members = await prisma.user.findMany({
      where: { organization_id: orgId, is_active: true },
      select: {
        id: true,
        name: true,
        email: true,
        batch: true,
        organization_id: true,
      },
    });

    const report = [] as any[];
    for (const member of members) {
      const summary = await this.getMonthlyTimesheet(user, member.id, dateValue || new Date());
      report.push({
        user: member,
        monthly: summary,
      });
    }

    return { organization_id: orgId, members: report };
  }

  static async getManagerTimesheetsReview(
    user: any,
    options: {
      date?: Date | string;
      period?: 'WEEK' | 'MONTH' | 'ALL_TIME' | string;
      search?: string;
      cohort_id?: string;
      project_id?: string;
      page?: number;
      limit?: number;
    } = {}
  ) {
    if (!this.hasRole(user, ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'TECH_LEAD']) && !this.hasPermission(user, 'ATTENDANCE_READ')) {
      throw new Error('Forbidden: only managers and administrators can review timesheets');
    }

    const orgId = this.resolveOrganizationId(user, user.organization_id) || await this.getDefaultOrganizationId();
    await this.autoClockExpiredSessions(orgId);

    const period = (options.period || 'WEEK').toUpperCase();
    const today = options.date ? new Date(options.date) : new Date();
    if (isNaN(today.getTime())) {
      throw new Error('Invalid date provided');
    }

    // 1. Week period calculations
    const startOfWeek = new Date(today);
    startOfWeek.setUTCHours(0, 0, 0, 0);
    const day = startOfWeek.getUTCDay();
    const diffToMonday = (day + 6) % 7;
    startOfWeek.setUTCDate(startOfWeek.getUTCDate() - diffToMonday);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
    endOfWeek.setUTCHours(23, 59, 59, 999);

    const dayDateStrings: string[] = [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (let i = 0; i < 7; i++) {
      const cur = new Date(startOfWeek);
      cur.setUTCDate(startOfWeek.getUTCDate() + i);
      dayDateStrings.push(cur.toISOString().slice(0, 10));
    }

    // 2. Month period calculations
    const startOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    const firstDayDow = startOfMonth.getUTCDay();
    const diffToMondayMonth = (firstDayDow + 6) % 7;
    const firstWeekMonday = new Date(Date.UTC(startOfMonth.getUTCFullYear(), startOfMonth.getUTCMonth(), 1 - diffToMondayMonth, 0, 0, 0, 0));

    const weeks: Array<{
      weekNumber: number;
      label: string;
      fullLabel: string;
      startDate: Date;
      endDate: Date;
      startDateStr: string;
      endDateStr: string;
    }> = [];

    let currentMonday = new Date(firstWeekMonday);
    let weekIndex = 1;
    while (currentMonday <= endOfMonth) {
      const weekSunday = new Date(Date.UTC(currentMonday.getUTCFullYear(), currentMonday.getUTCMonth(), currentMonday.getUTCDate() + 6, 23, 59, 59, 999));
      const inMonthStart = currentMonday < startOfMonth ? startOfMonth : currentMonday;
      const inMonthEnd = weekSunday > endOfMonth ? endOfMonth : weekSunday;

      weeks.push({
        weekNumber: weekIndex,
        label: `W${weekIndex}`,
        fullLabel: `Week ${weekIndex} (${inMonthStart.toISOString().slice(5, 10)} – ${inMonthEnd.toISOString().slice(5, 10)})`,
        startDate: currentMonday,
        endDate: weekSunday,
        startDateStr: inMonthStart.toISOString().slice(0, 10),
        endDateStr: inMonthEnd.toISOString().slice(0, 10),
      });

      currentMonday = new Date(Date.UTC(currentMonday.getUTCFullYear(), currentMonday.getUTCMonth(), currentMonday.getUTCDate() + 7, 0, 0, 0, 0));
      weekIndex++;
    }

    // Query date boundaries based on selected period
    const dateQueryFilter = period === 'ALL_TIME'
      ? {}
      : period === 'MONTH'
      ? { date: { gte: startOfMonth, lte: endOfMonth } }
      : { date: { gte: startOfWeek, lte: endOfWeek } };

    const whereClause: any = {
      organization_id: orgId,
      is_active: true,
      AND: [
        {
          OR: [
            {
              roles: {
                some: {
                  role: {
                    name: { in: ['INTERN', 'EMPLOYEE'] },
                  },
                },
              },
            },
            {
              roles: {
                none: {
                  role: {
                    name: { in: ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'TECH_LEAD'] },
                  },
                },
              },
            },
          ],
        },
      ],
    };

    if (options.cohort_id && options.cohort_id !== 'ALL' && options.cohort_id !== 'null' && options.cohort_id !== 'undefined') {
      const cohortId = options.cohort_id.trim();
      whereClause.AND.push({
        OR: [
          { cohort_id: cohortId },
          { cohort: { id: cohortId } },
          { cohort: { code: cohortId } },
          { cohort: { name: cohortId } },
        ],
      });
    }

    if (options.project_id && options.project_id !== 'ALL') {
      const pId = options.project_id.trim();
      whereClause.AND.push({
        OR: [
          { project_memberships: { some: { project_id: pId } } },
          { work_item_assignments: { some: { work_item: { project_id: pId } } } },
          { time_entries: { some: { project_id: pId } } },
        ],
      });
    }

    // Base cohort where clause (WITHOUT search) used for authoritative aggregate summary statistics
    const cohortWhereClause: any = {
      organization_id: orgId,
      is_active: true,
      AND: [...whereClause.AND],
    };

    // Table where clause (WITH search filter if provided) used strictly for row rendering and pagination
    const tableWhereClause: any = {
      organization_id: orgId,
      is_active: true,
      AND: [...whereClause.AND],
    };

    if (options.search && options.search.trim()) {
      const q = options.search.trim();
      tableWhereClause.AND.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { user_code: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    // 1. Calculate Aggregate Statistics for the entire selected cohort & week (independent of search filter)
    const cohortInterns = await prisma.user.findMany({
      where: cohortWhereClause,
      select: { id: true },
    });
    const cohortInternIds = cohortInterns.map((u) => u.id);
    const totalCohortCount = cohortInternIds.length;

    const cohortTimeEntries = cohortInternIds.length > 0
      ? await prisma.timeEntry.findMany({
          where: {
            user_id: { in: cohortInternIds },
            organization_id: orgId,
            ...dateQueryFilter,
            ...(options.project_id && options.project_id !== 'ALL' ? { project_id: options.project_id.trim() } : {}),
          },
          select: {
            user_id: true,
            duration_minutes: true,
          },
        })
      : [];

    let cohortOverallLoggedMinutes = 0;
    const cohortActiveInternIds = new Set<string>();

    for (const entry of cohortTimeEntries) {
      const dur = Number(entry.duration_minutes) || 0;
      cohortOverallLoggedMinutes += dur;
      if (dur > 0 && entry.user_id) {
        cohortActiveInternIds.add(entry.user_id);
      }
    }

    const cohortActiveCount = cohortActiveInternIds.size;
    const cohortTotalHours = Number((cohortOverallLoggedMinutes / 60).toFixed(1));
    const cohortAvgMinutesPerActive = cohortActiveCount > 0 ? Math.round(cohortOverallLoggedMinutes / cohortActiveCount) : 0;

    // 2. Fetch paginated intern rows according to search filter
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
    const skip = (page - 1) * limit;

    const totalCount = await prisma.user.count({ where: tableWhereClause });

    const interns = await prisma.user.findMany({
      where: tableWhereClause,
      select: {
        id: true,
        name: true,
        email: true,
        user_code: true,
        batch: true,
        subbatch: true,
        cohort: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: [{ name: 'asc' }],
      skip,
      take: limit,
    });

    const internIds = interns.map((u) => u.id);

    const timeEntries = internIds.length > 0
      ? await prisma.timeEntry.findMany({
          where: {
            user_id: { in: internIds },
            organization_id: orgId,
            ...dateQueryFilter,
            ...(options.project_id && options.project_id !== 'ALL' ? { project_id: options.project_id.trim() } : {}),
          },
          select: {
            id: true,
            user_id: true,
            task_id: true,
            duration_minutes: true,
            date: true,
          },
        })
      : [];

    const internMetricsMap = new Map<
      string,
      {
        total_minutes: number;
        taskIds: Set<string>;
        daily: Record<string, number>;
        weekly: Record<number, number>;
        activeDates: Set<string>;
      }
    >();

    for (const id of internIds) {
      internMetricsMap.set(id, {
        total_minutes: 0,
        taskIds: new Set<string>(),
        daily: Object.fromEntries(dayDateStrings.map((d) => [d, 0])),
        weekly: Object.fromEntries(weeks.map((w) => [w.weekNumber, 0])),
        activeDates: new Set<string>(),
      });
    }

    for (const entry of timeEntries) {
      const metrics = internMetricsMap.get(entry.user_id);
      if (!metrics) continue;

      const dur = Number(entry.duration_minutes) || 0;
      metrics.total_minutes += dur;
      if (entry.task_id) {
        metrics.taskIds.add(entry.task_id);
      }
      if (entry.date) {
        const entryDate = new Date(entry.date);
        const entryDateStr = entryDate.toISOString().slice(0, 10);
        if (dur > 0) {
          metrics.activeDates.add(entryDateStr);
        }
        if (metrics.daily[entryDateStr] !== undefined) {
          metrics.daily[entryDateStr] += dur;
        }
        if (period === 'MONTH') {
          for (const w of weeks) {
            if (entryDate >= w.startDate && entryDate <= w.endDate) {
              metrics.weekly[w.weekNumber] = (metrics.weekly[w.weekNumber] || 0) + dur;
              break;
            }
          }
        }
      }
    }

    let overallLoggedMinutes = 0;
    let activeInternsCount = 0;

    const internItems = interns.map((intern) => {
      const metrics = internMetricsMap.get(intern.id) || {
        total_minutes: 0,
        taskIds: new Set(),
        daily: {},
        weekly: {},
        activeDates: new Set(),
      };

      const totalMins = metrics.total_minutes;
      overallLoggedMinutes += totalMins;
      if (totalMins > 0) activeInternsCount += 1;

      const hours = Math.floor(totalMins / 60);
      const mins = totalMins % 60;

      return {
        id: intern.id,
        name: intern.name,
        email: intern.email,
        user_code: intern.user_code,
        batch: intern.batch,
        subbatch: intern.subbatch,
        cohort: intern.cohort,
        total_minutes: totalMins,
        total_hours: Number((totalMins / 60).toFixed(1)),
        total_formatted: `${hours}h ${mins}m`,
        task_count: metrics.taskIds.size,
        active_days_count: metrics.activeDates.size,
        daily_breakdown: dayDateStrings.map((d, idx) => {
          const dMins = metrics.daily[d] || 0;
          return {
            date: d,
            dayName: dayNames[idx],
            minutes: dMins,
            hours: Number((dMins / 60).toFixed(1)),
            formatted: `${Math.floor(dMins / 60)}h ${dMins % 60}m`,
          };
        }),
        weekly_breakdown: weeks.map((w) => {
          const wMins = metrics.weekly[w.weekNumber] || 0;
          return {
            weekNumber: w.weekNumber,
            label: w.label,
            fullLabel: w.fullLabel,
            startDateStr: w.startDateStr,
            endDateStr: w.endDateStr,
            minutes: wMins,
            hours: Number((wMins / 60).toFixed(1)),
            formatted: `${Math.floor(wMins / 60)}h ${wMins % 60}m`,
          };
        }),
      };
    });

    return {
      period: {
        type: period,
        start_date: period === 'ALL_TIME' ? null : (period === 'MONTH' ? startOfMonth.toISOString().slice(0, 10) : startOfWeek.toISOString().slice(0, 10)),
        end_date: period === 'ALL_TIME' ? null : (period === 'MONTH' ? endOfMonth.toISOString().slice(0, 10) : endOfWeek.toISOString().slice(0, 10)),
        day_dates: dayDateStrings,
        weeks: weeks.map((w) => ({
          weekNumber: w.weekNumber,
          label: w.label,
          fullLabel: w.fullLabel,
          startDateStr: w.startDateStr,
          endDateStr: w.endDateStr,
        })),
      },
      summary: {
        total_interns: totalCohortCount,
        active_interns: cohortActiveCount,
        total_logged_minutes: cohortOverallLoggedMinutes,
        total_logged_hours: cohortTotalHours,
        avg_logged_minutes_per_active: cohortAvgMinutesPerActive,
      },
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
      interns: internItems,
    };
  }
}
