import React from 'react';
import { X, Bell } from 'lucide-react';
import { notificationsService } from '../services/notificationsService';

export default function NotificationsDrawer({
  isOpen,
  onClose,
  notifications = [],
  onOpenTarget,
  onToast
}) {
  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleMarkAll = () => {
    notificationsService.markAllAsRead();
    onToast?.('All notifications marked as read');
  };

  const handleNotificationClick = (notif) => {
    notificationsService.markAsRead(notif.id);
    onOpenTarget?.(notif);
  };

  return (
    <div
      className="fixed inset-0 z-50 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="absolute right-3 top-14 flex max-h-[calc(100vh-4.5rem)] w-[min(20rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-xl sm:right-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3.5 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-purple-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <span className="rounded-full bg-purple-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="text-xs font-semibold text-purple-700 hover:text-purple-900"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
              aria-label="Close notifications"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-10 text-center text-slate-500">
              <Bell className="mx-auto mb-2 h-7 w-7 text-slate-300" />
              <p className="text-xs font-semibold">No notifications right now</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`flex cursor-pointer items-start gap-3 px-3.5 py-3 transition-colors hover:bg-purple-50 ${
                  !n.is_read ? 'bg-purple-50/70' : 'bg-white'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <h4
                      className={`text-xs ${
                        !n.is_read
                          ? 'font-bold text-slate-900'
                          : 'font-semibold text-slate-700'
                      }`}
                    >
                      {n.title}
                    </h4>
                    <span className="shrink-0 text-[10px] text-slate-400">
                      {n.created_at}
                    </span>
                  </div>
                  <p className="text-sm leading-snug text-slate-600">
                    {n.message}
                  </p>
                </div>

                {!n.is_read && (
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-purple-600" />
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 p-3 text-center text-[10px] text-slate-500">
          Centralized notifications for deadlines, task assignments, and forms
        </div>
      </div>
    </div>
  );
}
