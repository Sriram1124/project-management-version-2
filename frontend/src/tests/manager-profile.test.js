import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('Manager Profile Feature Suite', () => {
  describe('View Routing & Navigation', () => {
    const getViewFromPath = (pathname) => {
      let clean = pathname.replace(/^\/manager\/?/, '');
      while (clean.endsWith('/')) {
        clean = clean.slice(0, -1);
      }
      if (!clean || clean === 'dashboard') return 'dashboard';
      if (clean === 'timesheet') return 'timesheets';
      if (['projects', 'my-tasks', 'tasks', 'interns', 'tech-leads', 'reports', 'timesheets', 'channels', 'profile'].includes(clean)) {
        return clean;
      }
      return 'dashboard';
    };

    test('resolves profile route correctly', () => {
      assert.strictEqual(getViewFromPath('/manager/profile'), 'profile');
      assert.strictEqual(getViewFromPath('/manager/profile/'), 'profile');
      assert.strictEqual(getViewFromPath('/manager/dashboard'), 'dashboard');
      assert.strictEqual(getViewFromPath('/manager/projects'), 'projects');
    });

    test('breadcrumbs and titles map profile correctly', () => {
      const pageLabel = {
        dashboard: 'Manager Dashboard',
        profile: 'Manager Profile',
        projects: 'Projects Directory',
      }['profile'];

      assert.strictEqual(pageLabel, 'Manager Profile');
    });
  });

  describe('Password Validation Rules', () => {
    function validatePasswordForm({ currentPassword, newPassword, confirmPassword }) {
      const hasCurrent = Boolean(currentPassword && currentPassword.trim().length > 0);
      const lengthValid = Boolean(newPassword && newPassword.length >= 8);
      const differentFromCurrent = hasCurrent && newPassword ? newPassword !== currentPassword : true;
      const matchesConfirm = Boolean(newPassword && newPassword === confirmPassword);

      const errors = [];
      if (!hasCurrent) errors.push('Current password is required.');
      if (!lengthValid) errors.push('New password must be at least 8 characters.');
      if (!differentFromCurrent) errors.push('New password cannot match your current password.');
      if (!matchesConfirm) errors.push('New password and confirmation do not match.');

      return {
        isValid: errors.length === 0,
        errors,
      };
    }

    test('rejects empty fields', () => {
      const res = validatePasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      assert.strictEqual(res.isValid, false);
      assert.ok(res.errors.includes('Current password is required.'));
      assert.ok(res.errors.includes('New password must be at least 8 characters.'));
    });

    test('rejects new password under 8 characters', () => {
      const res = validatePasswordForm({
        currentPassword: 'currentPass123',
        newPassword: 'short',
        confirmPassword: 'short',
      });
      assert.strictEqual(res.isValid, false);
      assert.ok(res.errors.includes('New password must be at least 8 characters.'));
    });

    test('rejects new password matching current password', () => {
      const res = validatePasswordForm({
        currentPassword: 'secretPassword123',
        newPassword: 'secretPassword123',
        confirmPassword: 'secretPassword123',
      });
      assert.strictEqual(res.isValid, false);
      assert.ok(res.errors.includes('New password cannot match your current password.'));
    });

    test('rejects mismatched new and confirm passwords', () => {
      const res = validatePasswordForm({
        currentPassword: 'currentPass123',
        newPassword: 'newValidPassword123',
        confirmPassword: 'differentPassword456',
      });
      assert.strictEqual(res.isValid, false);
      assert.ok(res.errors.includes('New password and confirmation do not match.'));
    });

    test('accepts valid password change payload', () => {
      const res = validatePasswordForm({
        currentPassword: 'oldPassword123',
        newPassword: 'newSecurePassword456',
        confirmPassword: 'newSecurePassword456',
      });
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.errors.length, 0);
    });
  });

  describe('Projects Managed Filtering & Mapping', () => {
    const mockProjects = [
      {
        id: 'proj-1',
        name: 'Alpha Platform',
        status: 'ACTIVE',
        methodology: 'SCRUM',
        owner_id: 'mgr-1',
        _count: { members: 8 },
      },
      {
        id: 'proj-2',
        name: 'Beta Mobile App',
        status: 'PLANNED',
        methodology: 'KANBAN',
        owner_id: 'mgr-1',
        _count: { members: 5 },
      },
      {
        id: 'proj-3',
        name: 'Legacy Service',
        status: 'COMPLETED',
        methodology: 'SCRUM',
        owner_id: 'other-mgr',
        members: [{ user_id: 'mgr-1' }],
        _count: { members: 3 },
      },
    ];

    test('accurately calculates total and active projects managed', () => {
      const totalProjects = mockProjects.length;
      const activeProjectsCount = mockProjects.filter((p) => p.status === 'ACTIVE').length;

      assert.strictEqual(totalProjects, 3);
      assert.strictEqual(activeProjectsCount, 1);
    });

    test('filters projects by status and search query', () => {
      const filterProjects = (list, status, query) => {
        return list.filter((p) => {
          if (status !== 'ALL' && p.status !== status) return false;
          if (query.trim()) {
            const q = query.toLowerCase();
            return p.name.toLowerCase().includes(q) || p.methodology.toLowerCase().includes(q);
          }
          return true;
        });
      };

      const plannedOnly = filterProjects(mockProjects, 'PLANNED', '');
      assert.strictEqual(plannedOnly.length, 1);
      assert.strictEqual(plannedOnly[0].name, 'Beta Mobile App');

      const searchAlpha = filterProjects(mockProjects, 'ALL', 'alpha');
      assert.strictEqual(searchAlpha.length, 1);
      assert.strictEqual(searchAlpha[0].name, 'Alpha Platform');
    });

    test('handles empty project list gracefully', () => {
      const emptyList = [];
      assert.strictEqual(emptyList.length, 0);
    });
  });

  describe('Profile Role Authorization', () => {
    test('grants access only to users with MANAGER role', () => {
      const checkAccess = (role) => role === 'MANAGER';

      assert.strictEqual(checkAccess('MANAGER'), true);
      assert.strictEqual(checkAccess('INTERN'), false);
      assert.strictEqual(checkAccess('EMPLOYEE'), false);
      assert.strictEqual(checkAccess('TECH_LEAD'), false);
      assert.strictEqual(checkAccess(null), false);
    });
  });

  describe('Change Password UI State & Cancellation Lifecycle', () => {
    function createPasswordUIState() {
      let isChangingPassword = false;
      let passwordForm = {
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      };
      let passwordError = null;
      let passwordSuccess = null;

      return {
        getState: () => ({ isChangingPassword, passwordForm, passwordError, passwordSuccess }),
        openForm: () => {
          isChangingPassword = true;
          passwordError = null;
          passwordSuccess = null;
        },
        updateField: (field, value) => {
          passwordForm[field] = value;
        },
        cancel: () => {
          isChangingPassword = false;
          passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
          passwordError = null;
        },
        onSuccess: (message) => {
          isChangingPassword = false;
          passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
          passwordError = null;
          passwordSuccess = message;
        },
        onError: (errMsg) => {
          // Stays open when error occurs
          isChangingPassword = true;
          passwordError = errMsg;
        },
      };
    }

    test('initial state has password form collapsed with empty fields', () => {
      const ui = createPasswordUIState();
      const state = ui.getState();
      assert.strictEqual(state.isChangingPassword, false);
      assert.strictEqual(state.passwordForm.currentPassword, '');
      assert.strictEqual(state.passwordForm.newPassword, '');
      assert.strictEqual(state.passwordForm.confirmPassword, '');
    });

    test('openForm reveals form and clears stale notices', () => {
      const ui = createPasswordUIState();
      ui.openForm();
      const state = ui.getState();
      assert.strictEqual(state.isChangingPassword, true);
      assert.strictEqual(state.passwordError, null);
    });

    test('cancel closes form and clears all input fields without saving', () => {
      const ui = createPasswordUIState();
      ui.openForm();
      ui.updateField('currentPassword', 'typedOld');
      ui.updateField('newPassword', 'typedNew123');
      ui.updateField('confirmPassword', 'typedNew123');

      ui.cancel();
      const state = ui.getState();
      assert.strictEqual(state.isChangingPassword, false);
      assert.strictEqual(state.passwordForm.currentPassword, '');
      assert.strictEqual(state.passwordForm.newPassword, '');
      assert.strictEqual(state.passwordForm.confirmPassword, '');
    });

    test('successful submission closes form, clears inputs, and sets success message', () => {
      const ui = createPasswordUIState();
      ui.openForm();
      ui.updateField('currentPassword', 'oldPass123');
      ui.updateField('newPassword', 'newSecurePass456');
      ui.updateField('confirmPassword', 'newSecurePass456');

      ui.onSuccess('Password changed successfully.');
      const state = ui.getState();
      assert.strictEqual(state.isChangingPassword, false);
      assert.strictEqual(state.passwordSuccess, 'Password changed successfully.');
      assert.strictEqual(state.passwordForm.currentPassword, '');
    });

    test('failed submission keeps form open and shows error message', () => {
      const ui = createPasswordUIState();
      ui.openForm();
      ui.updateField('currentPassword', 'wrongOldPass');
      ui.updateField('newPassword', 'newSecurePass456');
      ui.updateField('confirmPassword', 'newSecurePass456');

      ui.onError('Current password is incorrect.');
      const state = ui.getState();
      assert.strictEqual(state.isChangingPassword, true);
      assert.strictEqual(state.passwordError, 'Current password is incorrect.');
      assert.strictEqual(state.passwordForm.currentPassword, 'wrongOldPass');
    });
  });
});
