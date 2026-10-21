// Authenticated User Service
import { getSafeStoredUser } from '../../../utils/storageSecurity.js';

export const userService = {
  getCurrentUser: () => {
    try {
      const u = getSafeStoredUser();
      if (u) {
        const name = u.name || u.email?.split('@')[0] || 'User';
        return {
          id: u.id || 'USER-01',
          name: name,
          email: u.email || '',
          role: u.role || 'INTERN',
          title: u.role === 'INTERN' ? 'Engineering Intern' : (u.role || 'Member'),
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7C3AED&color=fff`,
          initials: name.slice(0, 2).toUpperCase(),
          projectIds: [],
          primaryProjectId: null,
          stats: {
            tasksCompleted: 0,
            hoursLogged: '0h',
            attendanceRate: '0%',
            formsSubmitted: 0
          },
          permissions: (u.permissions || []).reduce((acc, perm) => {
            acc[perm] = true;
            return acc;
          }, {})
        };
      }
    } catch (e) {
      // Fallback
    }

    return {
      id: 'USER-01',
      name: 'User',
      email: '',
      role: 'INTERN',
      title: 'Engineering Intern',
      avatar: 'https://ui-avatars.com/api/?name=User&background=7C3AED&color=fff',
      initials: 'US',
      projectIds: [],
      primaryProjectId: null,
      stats: {
        tasksCompleted: 0,
        hoursLogged: '0h',
        attendanceRate: '0%',
        formsSubmitted: 0
      },
      permissions: {}
    };
  },

  hasPermission: (permissionKey) => {
    const user = userService.getCurrentUser();
    return Boolean(user.permissions && user.permissions[permissionKey]);
  }
};
