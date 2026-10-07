import { prisma } from '../lib/prisma';

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

  static async startSession(user: any, input: SessionInput = {}) {
    const orgId = this.resolveOrganizationId(user, user.organization_id) || await this.getDefaultOrganizationId();
    const taskId = input.task_id || null;

    if (taskId) {
      if (!this.hasRole(user, ['INTERN', 'EMPLOYEE'])) {
        throw new Error('Forbidden: only assigned interns can start task work');
      }

      const task = await prisma.workItem.findFirst({
        where: { id: taskId, organization_id: orgId },
        include: { assignees: true },
      });
      if (!task) throw new Error('Task not found in your organization');
      if (!task.assignees.some((assignee) => assignee.user_id === user.id)) {
        throw new Error('Forbidden: you are not assigned to this task');
      }

      const activeTaskSession = await prisma.workSession.findFirst({
        where: { organization_id: orgId, user_id: user.id, task_id: { not: null }, ended_at: null },
        orderBy: { started_at: 'desc' },
      });
      if (activeTaskSession) {
        if (activeTaskSession.task_id === taskId) return activeTaskSession;
        throw new Error('You already have an active task session');
      }
    }

    const existingActive = await prisma.workSession.findFirst({
      where: {
        organization_id: orgId,
        user_id: user.id,
        ended_at: null,
      },
      orderBy: { started_at: 'desc' },
    });

    if (existingActive) {
      return existingActive;
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
      throw new Error('No active work session found');
    }

    const endedAt = toDate(input.ended_at) || new Date();
    const breakMinutes = Number(input.break_minutes ?? activeSession.break_minutes ?? 0);

    if (endedAt < activeSession.started_at) {
      throw new Error('Session end time cannot be before start time');
    }

    const session = await prisma.workSession.update({
      where: { id: activeSession.id },
      data: {
        ended_at: endedAt,
        break_minutes: breakMinutes,
        notes: input.notes ?? activeSession.notes,
      },
    });

    if (activeSession.task_id) {
      const entry = await this.createTimeEntry(user, {
        task_id: activeSession.task_id,
        work_session_id: activeSession.id,
        date: activeSession.started_at,
        start_time: activeSession.started_at,
        end_time: endedAt,
        duration_minutes: diffMinutes(activeSession.started_at, endedAt),
        notes: input.notes || null,
      });
      return { ...session, time_entry: entry };
    }

    return session;
  }

  static async getActiveTaskSession(user: any, taskId: string) {
    const orgId = this.resolveOrganizationId(user, user.organization_id) || await this.getDefaultOrganizationId();
    return prisma.workSession.findFirst({
      where: { organization_id: orgId, user_id: user.id, task_id: taskId, ended_at: null },
      orderBy: { started_at: 'desc' },
    });
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

    const startTime = toDate(input.start_time);
    const endTime = toDate(input.end_time);
    if (!startTime || !endTime) {
      throw new Error('Start time and end time are required');
    }
    if (endTime <= startTime) {
      throw new Error('Time entry end time must be after the start time');
    }

    const durationMinutes = Number(input.duration_minutes ?? diffMinutes(startTime, endTime));
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
      throw new Error('Time entry overlaps with an existing entry. Please adjust the range.');
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

  static async getWeeklyTimesheet(user: any, targetUserId?: string | null, dateValue?: Date | string) {
    const today = dateValue ? new Date(dateValue) : new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setUTCHours(0, 0, 0, 0);
    const day = startOfWeek.getUTCDay();
    const diffToMonday = (day + 6) % 7;
    startOfWeek.setUTCDate(startOfWeek.getUTCDate() - diffToMonday);

    const weekEntries = [] as any[];
    let totalMinutes = 0;
    for (let index = 0; index < 7; index += 1) {
      const currentDay = new Date(startOfWeek);
      currentDay.setUTCDate(startOfWeek.getUTCDate() + index);
      const summary = await this.getDailyTimesheet(user, targetUserId || user.id, currentDay);
      weekEntries.push(summary);
      totalMinutes += summary.net_working_minutes;
    }

    return {
      start_date: startOfWeek.toISOString().slice(0, 10),
      end_date: new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      total_minutes: totalMinutes,
      days: weekEntries,
    };
  }

  static async getMonthlyTimesheet(user: any, targetUserId?: string | null, dateValue?: Date | string) {
    const targetId = targetUserId || user.id;
    const referenceDate = dateValue ? new Date(dateValue) : new Date();
    const startOfMonth = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1));
    const endOfMonth = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    const calendarDays = [] as any[];
    let workingDays = 0;
    let presentDays = 0;
    let absentDays = 0;
    let totalOfficialMinutes = 0;
    let totalActualMinutes = 0;
    let totalTaskMinutes = 0;
    let totalUnallocatedMinutes = 0;
    const current = new Date(startOfMonth);

    while (current <= endOfMonth) {
      const summary = await this.getDailyTimesheet(user, targetId, current);
      calendarDays.push(summary);
      totalOfficialMinutes += summary.gross_office_minutes;
      totalActualMinutes += summary.attendance_minutes;
      totalTaskMinutes += summary.task_minutes;
      totalUnallocatedMinutes += summary.unallocated_minutes;

      if (summary.attendance_minutes > 0) {
        presentDays += 1;
      } else {
        absentDays += 1;
      }

      if (summary.gross_office_minutes > 0) {
        workingDays += 1;
      }

      current.setUTCDate(current.getUTCDate() + 1);
    }

    return {
      month: referenceDate.toISOString().slice(0, 7),
      working_days: workingDays,
      present_days: presentDays,
      absent_days: absentDays,
      total_official_minutes: totalOfficialMinutes,
      total_actual_minutes: totalActualMinutes,
      total_task_minutes: totalTaskMinutes,
      average_hours_per_day: workingDays > 0 ? Number(((totalActualMinutes / workingDays) / 60).toFixed(2)) : 0,
      total_unallocated_minutes: totalUnallocatedMinutes,
      days: calendarDays,
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
    if (!this.hasRole(user, ['MANAGER', 'ADMIN', 'SUPER_ADMIN'])) {
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
}
