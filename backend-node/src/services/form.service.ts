import { prisma } from '../lib/prisma';
import { FormStatus, QuestionType } from '@prisma/client';

function normalizeQuestionType(type: any): QuestionType {
  if (!type) return QuestionType.SHORT_TEXT;
  const upper = String(type).toUpperCase().replace(/-/g, '_').replace(/ /g, '_');
  if (upper in QuestionType) {
    return upper as QuestionType;
  }
  switch (upper) {
    case 'TEXT':
    case 'STRING':
      return QuestionType.SHORT_TEXT;
    case 'PARAGRAPH':
    case 'LONGTEXT':
    case 'TEXTAREA':
      return QuestionType.LONG_TEXT;
    case 'RADIO':
    case 'SELECT':
    case 'DROPDOWN':
      return QuestionType.SINGLE_SELECT;
    case 'CHECKBOXES':
    case 'MULTI':
      return QuestionType.MULTI_SELECT;
    case 'CHECKBOX':
    case 'BOOL':
      return QuestionType.BOOLEAN;
    case 'NUM':
      return QuestionType.NUMBER;
    case 'DATETIME':
      return QuestionType.DATE;
    default:
      return QuestionType.SHORT_TEXT;
  }
}

export class FormService {
  
  static async listForms(organizationId?: string, userRole?: string, userId?: string) {
    const where: any = {};
    if (organizationId) {
      where.organization_id = organizationId;
    }

    const targetInterns = organizationId
      ? await prisma.user.count({
          where: {
            organization_id: organizationId,
            is_active: true,
            roles: { some: { role: { name: 'INTERN' } } },
          },
        })
      : 0;

    const totalActiveUsers = organizationId
      ? await prisma.user.count({
          where: { organization_id: organizationId, is_active: true },
        })
      : 0;

    const totalTarget = targetInterns > 0 ? targetInterns : totalActiveUsers;

    if (userRole === 'INTERN') {
      where.status = FormStatus.PUBLISHED;
      where.OR = [
        { target_roles: { has: 'INTERN' } },
        { target_roles: { isEmpty: true } }
      ];
      const forms = await prisma.form.findMany({
        where,
        include: {
          creator: { select: { id: true, name: true, email: true } },
          questions: { orderBy: { order_index: 'asc' } },
          submissions: {
            where: userId ? { submitter_id: userId } : undefined,
            include: { answers: true }
          }
        },
        orderBy: { created_at: 'desc' }
      });

      return forms.map((f) => ({
        ...f,
        totalTarget,
        total_target: totalTarget,
      }));
    }

    const forms = await prisma.form.findMany({
      where,
      include: {
        creator: { select: { id: true, name: true, email: true } },
        questions: { orderBy: { order_index: 'asc' } },
        _count: { select: { submissions: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    return forms.map((f) => ({
      ...f,
      totalTarget,
      total_target: totalTarget,
    }));
  }

  static async getForm(formId: string, organizationId?: string) {
    if (!formId) return null;

    let form = organizationId
      ? await prisma.form.findFirst({
          where: { id: formId, organization_id: organizationId },
          include: {
            questions: { orderBy: { order_index: 'asc' } },
            creator: { select: { id: true, name: true, email: true } }
          }
        })
      : null;

    if (!form) {
      form = await prisma.form.findUnique({
        where: { id: formId },
        include: {
          questions: { orderBy: { order_index: 'asc' } },
          creator: { select: { id: true, name: true, email: true } }
        }
      });
    }

    return form;
  }

  static async createForm(data: any, organizationId?: string, creatorId?: string) {
    let orgId = organizationId;
    if (!orgId) {
      const org = await prisma.organization.findFirst();
      orgId = org?.id || '';
    }
    let creator = creatorId;
    if (!creator) {
      const user = await prisma.user.findFirst();
      creator = user?.id || '';
    }

    let roles: string[] = ['INTERN'];
    if (Array.isArray(data.target_roles)) {
      roles = data.target_roles;
    } else if (typeof data.target_roles === 'string') {
      roles = [data.target_roles];
    }

    let status: FormStatus = FormStatus.DRAFT;
    if (data.status) {
      const statusUpper = String(data.status).toUpperCase();
      if (statusUpper in FormStatus) {
        status = statusUpper as FormStatus;
      }
    }

    return prisma.form.create({
      data: {
        title: data.title || 'Untitled Form',
        description: data.description || null,
        status,
        target_roles: roles,
        deadline: data.deadline ? new Date(data.deadline) : null,
        organization_id: orgId,
        creator_id: creator,
        project_id: data.project_id || null
      },
      include: {
        questions: { orderBy: { order_index: 'asc' } },
        creator: { select: { id: true, name: true, email: true } }
      }
    });
  }

  static async updateForm(formId: string, data: any, organizationId?: string) {
    const existing = await prisma.form.findUnique({ where: { id: formId } });
    if (!existing) {
      throw new Error('Form not found');
    }

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.target_roles !== undefined) {
      updateData.target_roles = Array.isArray(data.target_roles) ? data.target_roles : [data.target_roles];
    }
    if (data.deadline !== undefined) {
      updateData.deadline = data.deadline ? new Date(data.deadline) : null;
    }
    if (data.status !== undefined) {
      const statusUpper = String(data.status).toUpperCase();
      if (statusUpper in FormStatus) {
        updateData.status = statusUpper as FormStatus;
      }
    }
    if (data.project_id !== undefined) {
      updateData.project_id = data.project_id;
    }

    return prisma.form.update({
      where: { id: formId },
      data: updateData,
      include: {
        questions: { orderBy: { order_index: 'asc' } },
        creator: { select: { id: true, name: true, email: true } }
      }
    });
  }

  static async updateStatus(formId: string, status: FormStatus, organizationId?: string) {
    const existing = await prisma.form.findUnique({ where: { id: formId } });
    if (!existing) {
      throw new Error('Form not found');
    }

    return prisma.form.update({
      where: { id: formId },
      data: { status },
      include: {
        questions: { orderBy: { order_index: 'asc' } },
        creator: { select: { id: true, name: true, email: true } }
      }
    });
  }

  static async deleteForm(formId: string) {
    const existing = await prisma.form.findUnique({ where: { id: formId } });
    if (!existing) {
      throw new Error('Form not found');
    }
    return prisma.form.delete({ where: { id: formId } });
  }

  static async addQuestion(formId: string, data: any) {
    const form = await prisma.form.findUnique({ where: { id: formId } });
    if (!form) {
      throw new Error('Form not found');
    }

    const existingCount = await prisma.formQuestion.count({ where: { form_id: formId } });
    const orderIndex = data.order_index !== undefined ? Number(data.order_index) : existingCount;

    return prisma.formQuestion.create({
      data: {
        form_id: formId,
        type: normalizeQuestionType(data.type),
        text: data.text || 'Untitled Question',
        description: data.description || null,
        is_required: data.is_required !== undefined ? Boolean(data.is_required) : true,
        order_index: orderIndex,
        options: Array.isArray(data.options) ? data.options : []
      }
    });
  }

  static async updateQuestion(questionId: string, data: any) {
    const existing = await prisma.formQuestion.findUnique({ where: { id: questionId } });
    if (!existing) {
      throw new Error('Question not found');
    }

    const updateData: any = {};
    if (data.text !== undefined) updateData.text = data.text;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.is_required !== undefined) updateData.is_required = Boolean(data.is_required);
    if (data.options !== undefined) updateData.options = Array.isArray(data.options) ? data.options : [];
    if (data.order_index !== undefined) updateData.order_index = Number(data.order_index);
    if (data.type !== undefined) updateData.type = normalizeQuestionType(data.type);

    return prisma.formQuestion.update({
      where: { id: questionId },
      data: updateData
    });
  }

  static async deleteQuestion(questionId: string) {
    const existing = await prisma.formQuestion.findUnique({ where: { id: questionId } });
    if (!existing) {
      throw new Error('Question not found');
    }
    return prisma.formQuestion.delete({ where: { id: questionId } });
  }

  static async submitForm(formId: string, submitterId: string, answers: any = []) {
    const form = await prisma.form.findUnique({ where: { id: formId }, include: { questions: true } });
    if (!form) {
      throw new Error('Form not found');
    }
    if (form.status === FormStatus.ARCHIVED) {
      throw new Error('Form is archived');
    }

    const existing = await prisma.formSubmission.findFirst({
      where: { form_id: formId, submitter_id: submitterId }
    });
    if (existing) {
      await prisma.formSubmission.delete({ where: { id: existing.id } });
    }

    const answersList = Array.isArray(answers) ? answers : [];

    return prisma.formSubmission.create({
      data: {
        form_id: formId,
        submitter_id: submitterId,
        answers: {
          create: answersList.map((ans: any) => ({
            question_id: ans.question_id || ans.questionId || (form.questions[0]?.id || ''),
            value_string: ans.value_string !== undefined ? String(ans.value_string) : (typeof ans.value === 'string' ? ans.value : null),
            value_number: ans.value_number !== undefined ? Number(ans.value_number) : (typeof ans.value === 'number' ? ans.value : null),
            value_boolean: ans.value_boolean !== undefined ? Boolean(ans.value_boolean) : (typeof ans.value === 'boolean' ? ans.value : null),
            value_array: Array.isArray(ans.value_array) ? ans.value_array : (Array.isArray(ans.value) ? ans.value : [])
          }))
        }
      },
      include: {
        answers: true,
        submitter: { select: { id: true, name: true, email: true } }
      }
    });
  }

  static async listSubmissions(formId: string, organizationId?: string) {
    const form = await prisma.form.findUnique({ where: { id: formId } });
    if (!form) {
      throw new Error('Form not found');
    }

    return prisma.formSubmission.findMany({
      where: { form_id: formId },
      include: {
        submitter: { select: { id: true, name: true, email: true } },
        answers: {
          include: { question: true }
        }
      },
      orderBy: { created_at: 'desc' }
    });
  }

  static async getMySubmission(formId: string, userId: string, organizationId?: string) {
    const form = await prisma.form.findUnique({ where: { id: formId } });
    if (!form) {
      throw new Error('Form not found');
    }

    return prisma.formSubmission.findFirst({
      where: { form_id: formId, submitter_id: userId },
      include: {
        submitter: { select: { id: true, name: true, email: true } },
        answers: {
          include: { question: true }
        }
      }
    });
  }

  static async getOverdueData(organizationId?: string, cohortId?: string, formId?: string) {
    let orgId = organizationId;
    if (!orgId) {
      const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
      orgId = firstOrg?.id || '';
    }

    // 1. Fetch Organization Work Policy for timezone
    const workPolicy = await prisma.organizationWorkPolicy.findUnique({
      where: { organization_id: orgId },
      select: { timezone: true }
    });
    const timeZone = workPolicy?.timezone || 'Asia/Kolkata';

    const now = new Date();

    // 2. Query published forms with deadlines in the past (scoped to formId if specified)
    const formWhere: any = {
      organization_id: orgId,
      status: FormStatus.PUBLISHED,
      deadline: {
        not: null,
        lt: now
      }
    };
    if (formId) {
      formWhere.id = formId;
    }

    const forms = await prisma.form.findMany({
      where: formWhere,
      include: {
        creator: { select: { id: true, name: true, email: true } },
        submissions: { select: { submitter_id: true, created_at: true } }
      },
      orderBy: { deadline: 'asc' }
    });

    // 3. Query active eligible members in the organization, scoped to cohort if specified
    const memberWhere: any = {
      organization_id: orgId,
      is_active: true
    };
    if (cohortId && cohortId !== 'ALL' && cohortId !== 'null' && cohortId !== 'undefined') {
      memberWhere.cohort_id = cohortId;
    }

    const members = await prisma.user.findMany({
      where: memberWhere,
      select: {
        id: true,
        name: true,
        email: true,
        batch: true,
        cohort_id: true,
        cohort: { select: { id: true, name: true, code: true } },
        roles: {
          include: {
            role: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: [{ name: 'asc' }]
    });

    // Helper for formatting dates with the configured timezone
    const formatDateTime = (date: Date): string => {
      try {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).formatToParts(date);
        const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';
        return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
      } catch {
        return date.toISOString().replace('T', ' ').slice(0, 19);
      }
    };

    // 4. Correlate overdue forms per member
    const details: Array<{
      memberId: string;
      memberName: string;
      memberEmail: string;
      cohortName: string;
      cohortCode: string;
      batch: string;
      cohortBatch: string;
      formId: string;
      formTitle: string;
      formDescription: string;
      formDeadline: Date;
      formDeadlineFormatted: string;
      daysOverdue: number;
      submissionStatus: string;
      managerName: string;
      managerEmail: string;
    }> = [];

    const memberMap = new Map<string, {
      memberId: string;
      memberName: string;
      memberEmail: string;
      cohortBatch: string;
      overdueFormsCount: number;
      oldestDeadline: Date;
      maxDaysOverdue: number;
    }>();

    for (const form of forms) {
      if (!form.deadline) continue;

      const targetRoles = (form.target_roles || []).map((r) => r.toUpperCase());
      const submittedUserIds = new Set(form.submissions.map((s) => s.submitter_id));
      const diffMs = now.getTime() - form.deadline.getTime();
      const daysOverdue = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      const deadlineFormatted = formatDateTime(form.deadline);
      const managerName = form.creator?.name || 'Program Manager';
      const managerEmail = form.creator?.email || 'N/A';
      const formDescription = form.description || 'No description provided';

      for (const member of members) {
        // Check role targeting
        const userRoles = (member.roles || []).map((r) => r.role?.name?.toUpperCase()).filter(Boolean);
        const isEligible = 
          targetRoles.length === 0 || 
          targetRoles.some((tr) => userRoles.includes(tr) || (tr === 'INTERN' && (userRoles.length === 0 || userRoles.includes('INTERN'))));

        if (!isEligible) continue;

        // Check if member already submitted
        if (submittedUserIds.has(member.id)) continue;

        // Cohort / Batch display
        const cohortPart = member.cohort?.name || member.cohort?.code || 'No Cohort';
        const cohortBatch = member.batch ? `${cohortPart} / Batch ${member.batch}` : cohortPart;

        // Add detailed row
        details.push({
          memberId: member.id,
          memberName: member.name,
          memberEmail: member.email,
          cohortName: member.cohort?.name || 'N/A',
          cohortCode: member.cohort?.code || 'N/A',
          batch: member.batch || 'N/A',
          cohortBatch,
          formId: form.id,
          formTitle: form.title,
          formDescription,
          formDeadline: form.deadline,
          formDeadlineFormatted: deadlineFormatted,
          daysOverdue,
          submissionStatus: 'Overdue - Not Submitted',
          managerName,
          managerEmail
        });

        // Update member-level summary
        const existingSummary = memberMap.get(member.id);
        if (existingSummary) {
          existingSummary.overdueFormsCount += 1;
          if (form.deadline < existingSummary.oldestDeadline) {
            existingSummary.oldestDeadline = form.deadline;
          }
          if (daysOverdue > existingSummary.maxDaysOverdue) {
            existingSummary.maxDaysOverdue = daysOverdue;
          }
        } else {
          memberMap.set(member.id, {
            memberId: member.id,
            memberName: member.name,
            memberEmail: member.email,
            cohortBatch,
            overdueFormsCount: 1,
            oldestDeadline: form.deadline,
            maxDaysOverdue: daysOverdue
          });
        }
      }
    }

    // Format summary list
    const summary = Array.from(memberMap.values())
      .map((item) => ({
        ...item,
        oldestDeadlineFormatted: formatDateTime(item.oldestDeadline)
      }))
      .sort((a, b) => {
        // Sort highest days overdue first, then overdue count desc, then name asc
        if (b.maxDaysOverdue !== a.maxDaysOverdue) return b.maxDaysOverdue - a.maxDaysOverdue;
        if (b.overdueFormsCount !== a.overdueFormsCount) return b.overdueFormsCount - a.overdueFormsCount;
        return a.memberName.localeCompare(b.memberName);
      });

    // Also fetch cohort name if cohortId is provided
    let cohortScopeName = 'All Cohorts';
    if (cohortId && cohortId !== 'ALL') {
      const c = await prisma.cohort.findUnique({
        where: { id: cohortId },
        select: { name: true, code: true }
      });
      if (c) cohortScopeName = c.name || c.code;
    }

    return {
      summary,
      details,
      totalOverdueCount: details.length,
      overdueMembersCount: summary.length,
      formsCount: forms.length,
      cohortScopeName,
      timezone: timeZone,
      generatedAt: now,
      generatedAtFormatted: formatDateTime(now)
    };
  }

  static async generateOverdueCsv(organizationId?: string, cohortId?: string, formId?: string) {
    const data = await FormService.getOverdueData(organizationId, cohortId, formId);

    const escapeCsv = (val: any): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    let targetFormTitle: string | null = null;
    if (formId) {
      const f = await prisma.form.findUnique({ where: { id: formId }, select: { title: true } });
      if (f) targetFormTitle = f.title;
    }

    const dateStr = data.generatedAt.toISOString().slice(0, 10);
    const safeScopeName = data.cohortScopeName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeFormTitle = targetFormTitle ? targetFormTitle.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
    const filename = targetFormTitle
      ? `Overdue_Members_${safeFormTitle}_${safeScopeName}_${dateStr}.csv`
      : `Overdue_Members_Report_${safeScopeName}_${dateStr}.csv`;

    const lines: string[] = [];

    // Header Metadata
    lines.push(escapeCsv('INTERNHUB - OVERDUE MEMBERS REPORT'));
    if (targetFormTitle) {
      lines.push(`${escapeCsv('Target Form')},${escapeCsv(targetFormTitle)}`);
    }
    lines.push(`${escapeCsv('Target Scope')},${escapeCsv(data.cohortScopeName)}`);
    lines.push(`${escapeCsv('Generated At')},${escapeCsv(`${data.generatedAtFormatted} (${data.timezone})`)}`);
    lines.push(`${escapeCsv('Total Overdue Submissions')},${escapeCsv(data.totalOverdueCount)}`);
    lines.push(`${escapeCsv('Members with Overdue Forms')},${escapeCsv(data.overdueMembersCount)}`);
    lines.push(`${escapeCsv('Total Published Forms Evaluated')},${escapeCsv(data.formsCount)}`);
    lines.push(''); // Blank line separator

    // SECTION 1: Member-level summary
    lines.push(escapeCsv('=== MEMBER-LEVEL OVERDUE SUMMARY ==='));
    lines.push([
      escapeCsv('Member Name'),
      escapeCsv('Member Email'),
      escapeCsv('Cohort / Batch'),
      escapeCsv('Number of Overdue Forms'),
      escapeCsv('Oldest Outstanding Deadline'),
      escapeCsv('Maximum Days Overdue')
    ].join(','));

    if (data.summary.length === 0) {
      lines.push(`${escapeCsv('No members have overdue form submissions in this scope.')},${escapeCsv('')},${escapeCsv('')},${escapeCsv(0)},${escapeCsv('N/A')},${escapeCsv('0 days')}`);
    } else {
      for (const item of data.summary) {
        lines.push([
          escapeCsv(item.memberName),
          escapeCsv(item.memberEmail),
          escapeCsv(item.cohortBatch),
          escapeCsv(item.overdueFormsCount),
          escapeCsv(`${item.oldestDeadlineFormatted} (${data.timezone})`),
          escapeCsv(`${item.maxDaysOverdue} ${item.maxDaysOverdue === 1 ? 'day' : 'days'} overdue`)
        ].join(','));
      }
    }

    lines.push(''); // Blank line separator

    // SECTION 2: Detailed overdue submissions
    lines.push(escapeCsv('=== DETAILED OVERDUE SUBMISSIONS ==='));
    lines.push([
      escapeCsv('Member Name'),
      escapeCsv('Member Email'),
      escapeCsv('Cohort / Batch'),
      escapeCsv('Form Title'),
      escapeCsv('Form Description'),
      escapeCsv('Form Deadline'),
      escapeCsv('Days Overdue'),
      escapeCsv('Submission Status'),
      escapeCsv('Manager / Form Owner')
    ].join(','));

    if (data.details.length === 0) {
      lines.push(`${escapeCsv('No overdue form submissions found.')},${escapeCsv('')},${escapeCsv('')},${escapeCsv('')},${escapeCsv('')},${escapeCsv('')},${escapeCsv('')},${escapeCsv('')},${escapeCsv('')}`);
    } else {
      for (const row of data.details) {
        lines.push([
          escapeCsv(row.memberName),
          escapeCsv(row.memberEmail),
          escapeCsv(row.cohortBatch),
          escapeCsv(row.formTitle),
          escapeCsv(row.formDescription),
          escapeCsv(`${row.formDeadlineFormatted} (${data.timezone})`),
          escapeCsv(`${row.daysOverdue} ${row.daysOverdue === 1 ? 'day' : 'days'} overdue`),
          escapeCsv(row.submissionStatus),
          escapeCsv(row.managerName)
        ].join(','));
      }
    }

    // Prepend UTF-8 BOM so Microsoft Excel correctly parses UTF-8 characters without encoding issues
    const csvContent = '\uFEFF' + lines.join('\r\n');

    return {
      csv: csvContent,
      filename,
      data,
      overdueCount: data.totalOverdueCount,
      membersCount: data.overdueMembersCount
    };
  }
}

