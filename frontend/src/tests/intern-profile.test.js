import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('Intern Profile Feature Suite', () => {
  describe('View Routing & Navigation', () => {
    const getTabFromPath = (pathname) => {
      let clean = pathname.replace(/^\/intern\/?/, '');
      while (clean.endsWith('/')) {
        clean = clean.slice(0, -1);
      }
      if (!clean || clean === 'dashboard') return 'dashboard';
      if (clean === 'tasks' || clean === 'my-tasks') return 'tasks';
      if (['alerts', 'projects', 'tasks', 'timesheet', 'analytics', 'forms', 'attendance', 'profile'].includes(clean)) {
        return clean;
      }
      return 'dashboard';
    };

    test('resolves intern profile route correctly', () => {
      assert.strictEqual(getTabFromPath('/intern/profile'), 'profile');
      assert.strictEqual(getTabFromPath('/intern/profile/'), 'profile');
      assert.strictEqual(getTabFromPath('/intern/dashboard'), 'dashboard');
      assert.strictEqual(getTabFromPath('/intern/projects'), 'projects');
      assert.strictEqual(getTabFromPath('/intern/timesheet'), 'timesheet');
    });

    test('initials generator formats names properly', () => {
      const getInitials = (name) => {
        if (!name) return 'IN';
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
          return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
      };

      assert.strictEqual(getInitials('John Doe'), 'JD');
      assert.strictEqual(getInitials('Postman Manager Profile'), 'PP');
      assert.strictEqual(getInitials('Intern'), 'IN');
      assert.strictEqual(getInitials(''), 'IN');
      assert.strictEqual(getInitials(null), 'IN');
    });
  });

  describe('Password Validation Rules for Interns', () => {
    function validatePasswordForm({ currentPassword, newPassword, confirmPassword }) {
      const hasCurrent = Boolean(currentPassword && currentPassword.trim().length > 0);
      const lengthValid = Boolean(newPassword && newPassword.length >= 8);
      const differentFromCurrent = hasCurrent && newPassword ? newPassword !== currentPassword : true;
      const matchesConfirm = Boolean(newPassword && newPassword === confirmPassword);

      const errors = [];
      if (!hasCurrent) errors.push('Current password is required.');
      if (!lengthValid) errors.push('New password must be at least 8 characters long.');
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
      assert.ok(res.errors.includes('New password must be at least 8 characters long.'));
    });

    test('rejects new password under 8 characters', () => {
      const res = validatePasswordForm({
        currentPassword: 'currentPass123',
        newPassword: 'short',
        confirmPassword: 'short',
      });
      assert.strictEqual(res.isValid, false);
      assert.ok(res.errors.includes('New password must be at least 8 characters long.'));
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

  describe('Assigned Projects Filtering', () => {
    const mockProjects = [
      {
        id: 'proj-1',
        name: 'Backend Microservices',
        status: 'ACTIVE',
        methodology: 'SCRUM',
        code: 'PROJ-01',
        description: 'Core API development',
      },
      {
        id: 'proj-2',
        name: 'Frontend Mobile Portal',
        status: 'PLANNED',
        methodology: 'KANBAN',
        code: 'PROJ-02',
        description: 'React Native app',
      },
      {
        id: 'proj-3',
        name: 'Automated QA Testing',
        status: 'COMPLETED',
        methodology: 'SCRUM',
        code: 'PROJ-03',
        description: 'End-to-end Cypress test suite',
      },
    ];

    test('filters projects by status and search query', () => {
      const filterProjects = (list, status, query) => {
        return list.filter((p) => {
          if (status !== 'ALL' && p.status !== status) return false;
          if (query.trim()) {
            const q = query.toLowerCase();
            return (
              p.name.toLowerCase().includes(q) ||
              p.description.toLowerCase().includes(q) ||
              p.methodology.toLowerCase().includes(q)
            );
          }
          return true;
        });
      };

      const plannedOnly = filterProjects(mockProjects, 'PLANNED', '');
      assert.strictEqual(plannedOnly.length, 1);
      assert.strictEqual(plannedOnly[0].name, 'Frontend Mobile Portal');

      const searchMicro = filterProjects(mockProjects, 'ALL', 'micro');
      assert.strictEqual(searchMicro.length, 1);
      assert.strictEqual(searchMicro[0].name, 'Backend Microservices');
    });
  });

  describe('Change Password UI State Lifecycle', () => {
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
    });

    test('openForm expands form and clears errors', () => {
      const ui = createPasswordUIState();
      ui.openForm();
      const state = ui.getState();
      assert.strictEqual(state.isChangingPassword, true);
    });

    test('cancel collapses form and clears fields', () => {
      const ui = createPasswordUIState();
      ui.openForm();
      ui.updateField('currentPassword', 'temp');
      ui.cancel();
      const state = ui.getState();
      assert.strictEqual(state.isChangingPassword, false);
      assert.strictEqual(state.passwordForm.currentPassword, '');
    });
  });
});

