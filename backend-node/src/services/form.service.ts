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

    if (userRole === 'INTERN') {
      where.status = FormStatus.PUBLISHED;
      where.OR = [
        { target_roles: { has: 'INTERN' } },
        { target_roles: { isEmpty: true } }
      ];
      return prisma.form.findMany({
        where,
        include: {
          questions: { orderBy: { order_index: 'asc' } },
          submissions: {
            where: userId ? { submitter_id: userId } : undefined,
            include: { answers: true }
          }
        },
        orderBy: { created_at: 'desc' }
      });
    }

    return prisma.form.findMany({
      where,
      include: {
        questions: { orderBy: { order_index: 'asc' } },
        _count: { select: { submissions: true } }
      },
      orderBy: { created_at: 'desc' }
    });
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
}
