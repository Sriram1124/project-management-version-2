import React, { useState, useEffect, useCallback } from 'react';
import { 
  Bell, 
  Check, 
  CheckCheck, 
  Clock, 
  AlertCircle, 
  FileText, 
  CheckCircle2, 
  Megaphone,
  User,
  Filter,
  Archive,
  ArchiveRestore,
  X,
  Loader2
} from 'lucide-react';
import { notificationsService } from '../services/notificationsService';

export default function AlertsTab({ notifications = [], onToast }) {
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'UNREAD' | 'ARCHIVED'
  const [archivedNotifs, setArchivedNotifs] = useState([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);

  // Active notifications strictly exclude archived items
  const activeNotifs = notifications.filter((n) => !n.is_archived && !n.archived_at);
  const unreadCount = activeNotifs.filter((n) => !n.is_read).length;

  const loadArchived = useCallback(async () => {
    setLoadingArchived(true);
    try {
      const data = await notificationsService.loadArchivedNotifications();
      setArchivedNotifs((data || []).filter((n) => n.is_archived || n.archived_at));
    } catch (err) {
      console.error('Failed to load archived notifications:', err);
    } finally {
      setLoadingArchived(false);
    }
  }, []);

  useEffect(() => {
    if (filter === 'ARCHIVED') {
      void loadArchived();
    }
  }, [filter, loadArchived]);

  // Load archived count on mount so the tab badge is accurate
  useEffect(() => {
    void loadArchived();
  }, [loadArchived]);

  const filteredNotifs = filter === 'ARCHIVED'
    ? archivedNotifs.filter((n) => n.is_archived || n.archived_at)
    : filter === 'UNREAD'
    ? activeNotifs.filter((n) => !n.is_read)
    : activeNotifs;

  const handleMarkRead = async (id, e) => {
    e?.stopPropagation();
    await notificationsService.markAsRead(id);
    if (selectedAlert?.id === id) {
      setSelectedAlert((prev) => prev ? { ...prev, is_read: true } : null);
    }
    onToast?.('Notification marked as read');
  };

  const handleMarkAllRead = async () => {
    await notificationsService.markAllAsRead();
    onToast?.('All notifications marked as read');
  };

  const handleArchive = async (id, e) => {
    e?.stopPropagation();
    const itemToArchive = notifications.find((n) => n.id === id) || (selectedAlert?.id === id ? selectedAlert : null);
    if (itemToArchive) {
      setArchivedNotifs((prev) => [
        { ...itemToArchive, is_archived: true, archived_at: new Date().toISOString() },
        ...prev.filter((n) => n.id !== id),
      ]);
    }
    await notificationsService.archiveNotification(id);
    if (selectedAlert?.id === id) {
      setSelectedAlert(null);
    }
    onToast?.('Notification archived');
  };

  const handleUnarchive = async (id, e) => {
    e?.stopPropagation();
    setArchivedNotifs((prev) => prev.filter((n) => n.id !== id));
    await notificationsService.unarchiveNotification(id);
    if (selectedAlert?.id === id) {
      setSelectedAlert(null);
    }
    onToast?.('Notification restored from archive');
  };

  const handleOpenAlert = (notif) => {
    setSelectedAlert(notif);
    if (!notif.is_read) {
      notificationsService.markAsRead(notif.id).catch((err) => {
        console.error(err);
      });
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'BROADCAST':
        return <Megaphone className="w-5 h-5 text-purple-600" />;
      case 'TASK_DEADLINE':
      case 'FORM_DEADLINE':
        return <Clock className="w-5 h-5 text-amber-500" />;
      case 'TASK_OVERDUE':
      case 'FORM_OVERDUE':
        return <AlertCircle className="w-5 h-5 text-rose-500" />;
      case 'TASK_ASSIGNED':
        return <CheckCircle2 className="w-5 h-5 text-indigo-600" />;
      case 'FORM_ASSIGNED':
        return <FileText className="w-5 h-5 text-indigo-600" />;
      default:
        return <Bell className="w-5 h-5 text-slate-600" />;
    }
  };

  return (
    <div className="space-y-6 w-full min-w-0 pb-12">
      {/* Tab Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Organization Alerts & Announcements
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Official notices, manager broadcasts, and operational updates.
              </p>
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {filter !== 'ARCHIVED' && unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark All Read ({unreadCount})</span>
            </button>
          )}

          {/* Filter Tabs: All, Unread, Archived */}
          <div className="flex items-center p-1 rounded-lg bg-slate-100 border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                filter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({activeNotifs.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('UNREAD')}
              className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                filter === 'UNREAD'
                  ? 'bg-white text-purple-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Unread</span>
              {unreadCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setFilter('ARCHIVED')}
              className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                filter === 'ARCHIVED'
                  ? 'bg-white text-purple-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Archive className="w-3 h-3" />
              <span>Archived {archivedNotifs.length > 0 ? `(${archivedNotifs.length})` : ''}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {filter === 'ARCHIVED' && loadingArchived ? (
          <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center text-slate-400 space-y-2">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600 mb-2" />
            <h3 className="text-sm font-bold text-slate-700">Loading archived alerts...</h3>
          </div>
        ) : filteredNotifs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center text-slate-400 space-y-2">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              {filter === 'ARCHIVED' ? (
                <Archive className="w-6 h-6 text-slate-400" />
              ) : (
                <Bell className="w-6 h-6 text-slate-400" />
              )}
            </div>
            <h3 className="text-sm font-bold text-slate-700">
              {filter === 'ARCHIVED' ? 'No Archived Alerts' : 'No Alerts Found'}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {filter === 'ARCHIVED'
                ? 'When you archive an alert, it will be kept here for your records without appearing in your active inbox.'
                : filter === 'UNREAD'
                ? 'You have caught up with all notifications and announcements.'
                : 'There are currently no broadcast announcements or alerts dispatched to you.'}
            </p>
          </div>
        ) : (
          filteredNotifs.map((notif) => {
            const senderName = notif.raw?.sender?.name || notif.sender?.name || 'Management';
            const isBroadcast = notif.type === 'BROADCAST';
            const isArchived = filter === 'ARCHIVED' || notif.is_archived;

            return (
              <div
                key={notif.id}
                role="button"
                tabIndex={0}
                onClick={() => handleOpenAlert(notif)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    handleOpenAlert(notif);
                  }
                }}
                className={`p-5 rounded-2xl border transition-all cursor-pointer hover:border-purple-300 hover:shadow-sm ${
                  !notif.is_read && !isArchived
                    ? 'bg-purple-50/40 border-purple-200 shadow-xs ring-1 ring-purple-100'
                    : 'bg-white border-slate-200/90 shadow-2xs'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`p-2.5 rounded-xl shrink-0 border ${
                    !notif.is_read && !isArchived
                      ? 'bg-purple-100/80 border-purple-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}>
                    {getIcon(notif.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <h3 className={`text-sm ${!notif.is_read ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>
                          {notif.title}
                        </h3>
                        {isBroadcast && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                            Broadcast
                          </span>
                        )}
                        {!notif.is_read && !isArchived && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                            New Alert
                          </span>
                        )}
                        {isArchived && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            Archived
                          </span>
                        )}
                      </div>

                      <span className="text-[11px] text-slate-400 font-medium">
                        {notif.created_at}
                      </span>
                    </div>

                    {/* Message Body (truncated preview on card) */}
                    <p className="text-xs text-slate-700 leading-relaxed line-clamp-2 mb-3">
                      {notif.message}
                    </p>

                    {/* Metadata & Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>From: <strong className="text-slate-600 font-semibold">{senderName}</strong></span>
                      </div>

                      <div className="flex items-center gap-3">
                        {!notif.is_read ? (
                          <button
                            type="button"
                            onClick={(e) => { void handleMarkRead(notif.id, e); }}
                            className="flex items-center gap-1 text-purple-700 font-bold hover:text-purple-900 transition-colors cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Mark as Read</span>
                          </button>
                        ) : (
                          <span className="flex items-center gap-1 text-slate-400 font-medium">
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Read</span>
                          </span>
                        )}

                        {isArchived ? (
                          <button
                            type="button"
                            onClick={(e) => { void handleUnarchive(notif.id, e); }}
                            className="flex items-center gap-1 text-purple-700 font-bold hover:text-purple-900 transition-colors cursor-pointer"
                            title="Restore alert to active inbox"
                          >
                            <ArchiveRestore className="w-3.5 h-3.5" />
                            <span>Restore</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => { void handleArchive(notif.id, e); }}
                            className="flex items-center gap-1 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                            title="Archive alert"
                          >
                            <Archive className="w-3.5 h-3.5" />
                            <span>Archive</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* FULL-MESSAGE DIALOG */}
      {selectedAlert && (
        <div
          role="button"
          tabIndex={0} 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedAlert(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              if (e.target === e.currentTarget) {
              setSelectedAlert(null);
            }
          }
          }}
        >
          <div 
            className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-purple-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
                  {getIcon(selectedAlert.type)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                      {selectedAlert.type || 'NOTIFICATION'}
                    </span>
                    {selectedAlert.is_read ? (
                      <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Read
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-rose-600">
                        Unread
                      </span>
                    )}
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 mt-1">
                    {selectedAlert.title}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAlert(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Metadata Strip */}
            <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>From: <strong className="text-slate-700">{selectedAlert.raw?.sender?.name || selectedAlert.sender?.name || 'Management'}</strong></span>
                {selectedAlert.raw?.sender?.email && (
                  <span className="text-slate-400">({selectedAlert.raw.sender.email})</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <Clock className="w-3.5 h-3.5" />
                <span>{selectedAlert.created_at}</span>
              </div>
            </div>

            {/* Modal Body: Scrollable Full Message */}
            <div className="p-6 overflow-y-auto max-h-[50vh] space-y-4">
              <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-100 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap select-text">
                {selectedAlert.message}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {selectedAlert.is_archived || filter === 'ARCHIVED' ? (
                  <button
                    type="button"
                    onClick={(e) => { void handleUnarchive(selectedAlert.id, e); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-colors cursor-pointer"
                  >
                    <ArchiveRestore className="w-3.5 h-3.5" />
                    <span>Restore to Inbox</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => { void handleArchive(selectedAlert.id, e); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>Archive Alert</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedAlert(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
