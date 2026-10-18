import { ActionItemService } from '../../src/services/action-item.service';
import { mockPrisma, resetPrismaMock } from '../mocks/prisma.mock';
import { ActionItemPriority, ActionItemStatus } from '@prisma/client';

describe('ActionItemService Unit Tests', () => {
  const mockOrgId = 'org-act-1';
  const mockProjectId = 'proj-act-1';
  const mockManagerId = 'user-mgr-1';
  const mockInternId = 'user-intern-1';
  const mockOtherId = 'user-other-1';

  const mockItem = {
    id: 'ai-1',
    organization_id: mockOrgId,
    project_id: mockProjectId,
    creator_id: mockManagerId,
    assignee_id: mockInternId,
    title: 'Review Security Checklist',
    description: 'Complete OWASP checks',
    status: ActionItemStatus.OPEN,
    priority: ActionItemPriority.HIGH,
    due_date: new Date('2026-11-01'),
    created_at: new Date(),
    updated_at: new Date(),
    assignee: { id: mockInternId, name: 'Intern User', email: 'intern@example.com' },
    creator: { id: mockManagerId, name: 'Manager User', email: 'mgr@example.com' },
    project: { id: mockProjectId, name: 'Platform App' },
  };

  beforeEach(() => {
    resetPrismaMock();
  });

  describe('list & getById', () => {
    it('list applies filters for assignee_id, project_id, and status', async () => {
      mockPrisma.actionItem.findMany.mockResolvedValueOnce([mockItem]);

      const res = await ActionItemService.list({
        organization_id: mockOrgId,
        project_id: mockProjectId,
        assignee_id: mockInternId,
        status: ActionItemStatus.IN_PROGRESS,
      });

      expect(res).toHaveLength(1);
      expect(mockPrisma.actionItem.findMany).toHaveBeenCalledWith({
        where: {
          organization_id: mockOrgId,
          project_id: mockProjectId,
          assignee_id: mockInternId,
          status: ActionItemStatus.IN_PROGRESS,
        },
        include: expect.any(Object),
        orderBy: { created_at: 'desc' },
      });
    });

    it('getById returns item when found', async () => {
      mockPrisma.actionItem.findFirst.mockResolvedValueOnce(mockItem);

      const res = await ActionItemService.getById('ai-1', mockOrgId);
      expect(res.id).toBe('ai-1');
    });

    it('getById throws error when item is not found', async () => {
      mockPrisma.actionItem.findFirst.mockResolvedValueOnce(null);

      await expect(ActionItemService.getById('ai-missing', mockOrgId)).rejects.toThrow(
        'Action item not found'
      );
    });
  });

  describe('create', () => {
    it('throws error when an intern attempts to create an action item', async () => {
      const internUser = { id: mockInternId, role: 'INTERN' };

      await expect(
        ActionItemService.create(
          {
            title: 'Unauthorized Item',
            project_id: mockProjectId,
            organization_id: mockOrgId,
            creator_id: mockInternId,
          },
          internUser
        )
      ).rejects.toThrow('Forbidden: interns do not have permission to create action items');
    });

    it('identifies intern when role is present in roles array', async () => {
      const internWithRolesArray = {
        id: mockInternId,
        roles: [{ role: { name: 'INTERN' } }],
      };

      await expect(
        ActionItemService.create(
          {
            title: 'Unauthorized Item',
            project_id: mockProjectId,
            organization_id: mockOrgId,
            creator_id: mockInternId,
          },
          internWithRolesArray
        )
      ).rejects.toThrow('Forbidden: interns do not have permission to create action items');
    });

    it('creates action item successfully with defaults for manager', async () => {
      const managerUser = { id: mockManagerId, role: 'MANAGER' };
      mockPrisma.actionItem.create.mockResolvedValueOnce(mockItem);

      const created = await ActionItemService.create(
        {
          title: 'Review Security Checklist',
          project_id: mockProjectId,
          organization_id: mockOrgId,
          creator_id: mockManagerId,
          due_date: '2026-11-01',
        },
        managerUser
      );

      expect(created.id).toBe('ai-1');
      expect(mockPrisma.actionItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: ActionItemStatus.OPEN,
          priority: ActionItemPriority.MEDIUM,
          due_date: expect.any(Date),
        }),
        include: expect.any(Object),
      });
    });
  });

  describe('update', () => {
    it('throws error when intern tries to update action item not assigned to them', async () => {
      mockPrisma.actionItem.findFirst.mockResolvedValueOnce(mockItem); // assigned to mockInternId
      const otherIntern = { id: mockOtherId, role: 'INTERN' };

      await expect(
        ActionItemService.update('ai-1', mockOrgId, { status: ActionItemStatus.IN_PROGRESS }, otherIntern)
      ).rejects.toThrow('Forbidden: you can only update action items assigned to you');
    });

    it('throws error when intern attempts to modify restricted fields', async () => {
      mockPrisma.actionItem.findFirst.mockResolvedValue(mockItem);
      const internUser = { id: mockInternId, role: 'INTERN' };

      await expect(
        ActionItemService.update('ai-1', mockOrgId, { title: 'New Title' }, internUser)
      ).rejects.toThrow('Forbidden: interns can only update progress or status of assigned action items');

      await expect(
        ActionItemService.update('ai-1', mockOrgId, { priority: ActionItemPriority.URGENT }, internUser)
      ).rejects.toThrow('Forbidden: interns can only update progress or status of assigned action items');

      await expect(
        ActionItemService.update('ai-1', mockOrgId, { due_date: '2026-12-01' }, internUser)
      ).rejects.toThrow('Forbidden: interns can only update progress or status of assigned action items');
    });

    it('allows intern to update status on assigned action item', async () => {
      mockPrisma.actionItem.findFirst.mockResolvedValueOnce(mockItem);
      const updatedItem = { ...mockItem, status: ActionItemStatus.COMPLETED };
      mockPrisma.actionItem.update.mockResolvedValueOnce(updatedItem);

      const internUser = { id: mockInternId, role: 'INTERN' };
      const res = await ActionItemService.update(
        'ai-1',
        mockOrgId,
        { status: ActionItemStatus.COMPLETED },
        internUser
      );

      expect(res.status).toBe(ActionItemStatus.COMPLETED);
    });

    it('allows manager to update all fields including clearing due_date', async () => {
      mockPrisma.actionItem.findFirst.mockResolvedValueOnce(mockItem);
      mockPrisma.actionItem.update.mockResolvedValueOnce({ ...mockItem, due_date: null });

      const managerUser = { id: mockManagerId, role: 'MANAGER' };
      const res = await ActionItemService.update(
        'ai-1',
        mockOrgId,
        {
          title: 'Updated Title',
          description: 'Updated Description',
          assignee_id: mockOtherId,
          priority: ActionItemPriority.LOW,
          due_date: null,
        },
        managerUser
      );

      expect(mockPrisma.actionItem.update).toHaveBeenCalledWith({
        where: { id: 'ai-1' },
        data: {
          title: 'Updated Title',
          description: 'Updated Description',
          assignee_id: mockOtherId,
          priority: ActionItemPriority.LOW,
          due_date: null,
        },
        include: expect.any(Object),
      });
      expect(res.due_date).toBeNull();
    });
  });

  describe('delete & permission checks', () => {
    it('throws error when intern attempts to delete an action item', async () => {
      mockPrisma.actionItem.findFirst.mockResolvedValueOnce(mockItem);
      const internUser = { id: mockInternId, role: 'INTERN' };

      await expect(ActionItemService.delete('ai-1', mockOrgId, internUser)).rejects.toThrow(
        'Forbidden: interns are not permitted to delete action items'
      );
    });

    it('throws error when an unauthorized member attempts to delete an action item', async () => {
      mockPrisma.actionItem.findFirst.mockResolvedValueOnce(mockItem);
      mockPrisma.project.findFirst.mockResolvedValueOnce({ owner_id: 'someone-else' });
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce(null);

      const unauthorizedUser = { id: mockOtherId, role: 'DEVELOPER' };

      await expect(ActionItemService.delete('ai-1', mockOrgId, unauthorizedUser)).rejects.toThrow(
        'Forbidden: you do not have permission to delete this action item'
      );
    });

    it('allows creator of the action item to delete it', async () => {
      mockPrisma.actionItem.findFirst.mockResolvedValueOnce(mockItem); // creator is mockManagerId
      mockPrisma.project.findFirst.mockResolvedValueOnce({ owner_id: 'someone-else' });
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce(null);
      mockPrisma.actionItem.delete.mockResolvedValueOnce(mockItem);

      const creatorUser = { id: mockManagerId, role: 'DEVELOPER' };
      const res = await ActionItemService.delete('ai-1', mockOrgId, creatorUser);

      expect(res.id).toBe('ai-1');
    });

    it('allows project manager or tech lead member to delete action item', async () => {
      mockPrisma.actionItem.findFirst.mockResolvedValueOnce(mockItem);
      mockPrisma.project.findFirst.mockResolvedValueOnce({ owner_id: 'owner-id' });
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({ project_role: 'TECH_LEAD' });
      mockPrisma.actionItem.delete.mockResolvedValueOnce(mockItem);

      const leadUser = { id: 'lead-user-id', roles: [{ role: { name: 'DEVELOPER' } }] };
      const res = await ActionItemService.delete('ai-1', mockOrgId, leadUser);

      expect(res.id).toBe('ai-1');
    });

    it('allows organization manager to delete action item', async () => {
      mockPrisma.actionItem.findFirst.mockResolvedValueOnce(mockItem);
      mockPrisma.actionItem.delete.mockResolvedValueOnce(mockItem);

      const orgManager = { id: 'admin-id', roles: [{ name: 'MANAGER' }] };
      const res = await ActionItemService.delete('ai-1', mockOrgId, orgManager);

      expect(res.id).toBe('ai-1');
    });
  });
});

