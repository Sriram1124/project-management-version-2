import { notificationsService as apiNotifications } from '../../../services/notifications.service';

let notificationsData = [];
let listeners = [];

function notifyListeners() {
  listeners.forEach((l) => l([...notificationsData]));
}

export const notificationsService = {
  subscribe: (listener) => {
    listeners.push(listener);
    listener([...notificationsData]);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },

  getAllNotifications: () => [...notificationsData],

  getUnreadCount: () => notificationsData.filter((n) => !n.is_read).length,

  loadNotifications: async () => {
    try {
      const data = await apiNotifications.getNotifications();
      const nextData = (data || [])
        .filter((n) => !n.is_archived && !n.archived_at)
        .map((n) => ({
          id: n.id,
          title: n.title,
          message: n.message,
          type: n.type,
          is_read: n.is_read,
          is_archived: false,
          archived_at: null,
          created_at: n.created_at ? new Date(n.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now',
          raw: n,
        }));

      const hasChanged =
        nextData.length !== notificationsData.length ||
        nextData.some((n, idx) => {
          const prev = notificationsData[idx];
          return !prev || prev.id !== n.id || prev.is_read !== n.is_read;
        });

      if (hasChanged) {
        notificationsData = nextData;
        notifyListeners();
      }
      return notificationsData;
    } catch (err) {
      console.error('Failed to load notifications from API:', err);
      return notificationsData;
    }
  },

  markAsRead: async (id) => {
    try {
      await apiNotifications.markAsRead(id);
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
    notificationsData = notificationsData.map((n) =>
      n.id === id ? { ...n, is_read: true } : n
    );
    notifyListeners();
  },

  markAllAsRead: async () => {
    try {
      await apiNotifications.markAllAsRead();
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
    }
    notificationsData = notificationsData.map((n) => ({ ...n, is_read: true }));
    notifyListeners();
  },

  loadArchivedNotifications: async () => {
    try {
      const data = await apiNotifications.getNotifications({ archived: true });
      return (data || [])
        .filter((n) => n.is_archived || n.archived_at)
        .map((n) => ({
          id: n.id,
          title: n.title,
          message: n.message,
          type: n.type,
          is_read: n.is_read,
          is_archived: true,
          archived_at: n.archived_at,
          created_at: n.created_at ? new Date(n.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now',
          raw: n,
        }));
    } catch (err) {
      console.error('Failed to load archived notifications:', err);
      return [];
    }
  },

  archiveNotification: async (id) => {
    try {
      await apiNotifications.archiveNotification(id);
    } catch (err) {
      console.error('Failed to archive notification:', err);
    }
    notificationsData = notificationsData.filter((n) => n.id !== id);
    notifyListeners();
  },

  unarchiveNotification: async (id) => {
    try {
      await apiNotifications.unarchiveNotification(id);
      await notificationsService.loadNotifications();
    } catch (err) {
      console.error('Failed to unarchive notification:', err);
    }
  },
};

