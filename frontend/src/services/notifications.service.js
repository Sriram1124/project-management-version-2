import api from './api';

export const notificationsService = {
  /**
   * Get all notifications for current authenticated user
   */
  async getNotifications(params = {}) {
    const query = new URLSearchParams();
    if (params.unread_only) query.append('unread_only', 'true');
    if (params.archived !== undefined) query.append('archived', String(params.archived));
    if (params.limit) query.append('limit', String(params.limit));
    const qs = query.toString();
    const res = await api.get(qs ? `/notifications?${qs}` : '/notifications');
    return res.notifications || res.data || [];
  },

  /**
   * Get count of unread notifications for current user
   */
  async getUnreadCount() {
    const res = await api.get('/notifications/unread-count');
    return res.unread_count ?? res.data?.unread_count ?? 0;
  },

  /**
   * Mark single notification as read
   */
  async markAsRead(notificationId) {
    const res = await api.patch(`/notifications/${encodeURIComponent(notificationId)}/read`);
    return res;
  },

  /**
   * Archive a single notification
   */
  async archiveNotification(notificationId) {
    const res = await api.patch(`/notifications/${encodeURIComponent(notificationId)}/archive`);
    return res;
  },

  /**
   * Unarchive a single notification
   */
  async unarchiveNotification(notificationId) {
    const res = await api.patch(`/notifications/${encodeURIComponent(notificationId)}/unarchive`);
    return res;
  },

  /**
   * Mark all notifications as read for current user
   */
  async markAllAsRead() {
    const res = await api.patch('/notifications/read-all');
    return res;
  },

  /**
   * Manager / Tech Lead sends broadcast notification
   */
  async sendBroadcast({ title, message, recipient_ids }) {
    const res = await api.post('/notifications', {
      title,
      message,
      recipient_ids,
    });
    return res.notification || res.data || res;
  },
};

export default notificationsService;
