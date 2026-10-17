import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  Edit2,
  Trash2,
  Check,
  X,
  Loader2,
  AlertCircle,
  Clock,
  User as UserIcon,
} from 'lucide-react';
import { workItemsService } from '../../services/workItems.service';
import { useAuth } from '../../context/AuthContext';

function formatTimestamp(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function getInitials(name = '') {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function WorkItemComments({
  workItemId,
  readOnly = false,
  onToast,
  className = '',
}) {
  const { user: authUser } = useAuth();
  const currentUserId = authUser?.id || authUser?.user_id;
  const userRole = String(
    authUser?.role?.name || authUser?.role || authUser?.type || ''
  ).toUpperCase();
  const isManagerOrAdmin = ['MANAGER', 'ADMIN', 'TECH_LEAD'].includes(userRole);

  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');

  const fetchComments = useCallback(async () => {
    if (!workItemId) return;
    try {
      setLoading(true);
      setError('');
      const data = await workItemsService.getComments(workItemId);
      setComments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch comments:', err);
      setError(err?.message || 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [workItemId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const canModifyComment = (comment) => {
    if (!comment || readOnly) return false;
    const authorId = comment.author_id || comment.author?.id;
    if (currentUserId && authorId && String(authorId) === String(currentUserId)) {
      return true;
    }
    return isManagerOrAdmin;
  };

  const handleAddComment = async (e) => {
    e?.preventDefault();
    const content = newComment.trim();
    if (!content || submitting || readOnly) return;

    try {
      setSubmitting(true);
      setError('');
      const created = await workItemsService.addComment(workItemId, content);
      setComments((prev) => [...prev, created]);
      setNewComment('');
      onToast?.('Comment added successfully');
    } catch (err) {
      console.error('Failed to post comment:', err);
      setError(err?.message || 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (comment) => {
    setEditingCommentId(comment.id);
    setEditingText(comment.content || '');
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditingText('');
  };

  const handleSaveEdit = async (commentId) => {
    const content = editingText.trim();
    if (!content) {
      setError('Comment content cannot be empty.');
      return;
    }
    try {
      setSavingEdit(true);
      setError('');
      const updated = await workItemsService.updateComment(
        workItemId,
        commentId,
        content
      );
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? updated : c))
      );
      setEditingCommentId(null);
      setEditingText('');
      onToast?.('Comment updated');
    } catch (err) {
      console.error('Failed to update comment:', err);
      setError(err?.message || 'Failed to update comment');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Are you sure you want to delete this comment?')) {
      return;
    }
    try {
      setDeletingId(commentId);
      setError('');
      await workItemsService.deleteComment(workItemId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      onToast?.('Comment deleted');
    } catch (err) {
      console.error('Failed to delete comment:', err);
      setError(err?.message || 'Failed to delete comment');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {error && (
        <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span className="truncate">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError('')}
            className="text-rose-400 hover:text-rose-600 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Add Comment Input */}
      {!readOnly && (
        <form onSubmit={handleAddComment} className="space-y-2">
          <div className="relative">
            <textarea
              rows={2}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Write a comment or update..."
              disabled={submitting}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 transition-all resize-y min-h-[60px]"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              Shift + Enter for new line
            </span>
            <button
              type="submit"
              disabled={!newComment.trim() || submitting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Comment</span>
            </button>
          </div>
        </form>
      )}

      {/* Comments List */}
      <div className="space-y-2.5 pt-1">
        {loading ? (
          <div className="py-6 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
            <span className="text-xs">Loading comments...</span>
          </div>
        ) : comments.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <MessageSquare className="w-5 h-5 text-slate-300 mx-auto mb-1.5" />
            <p className="font-medium text-slate-600">No comments yet</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Start the discussion by sharing an update or feedback.
            </p>
          </div>
        ) : (
          comments.map((c) => {
            const author = c.author || {};
            const authorName = author.name || 'Member';
            const authorRole = author.role || '';
            const canModify = canModifyComment(c);
            const isEditing = editingCommentId === c.id;
            const isDeleting = deletingId === c.id;
            const isEdited =
              c.updated_at &&
              c.created_at &&
              new Date(c.updated_at).getTime() -
                new Date(c.created_at).getTime() >
                2000;

            return (
              <div
                key={c.id}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 transition-all hover:border-slate-300"
              >
                {/* Author row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {author.avatar_url ? (
                      <img
                        src={author.avatar_url}
                        alt={authorName}
                        className="w-6 h-6 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                        {getInitials(authorName)}
                      </div>
                    )}
                    <span className="font-semibold text-xs text-slate-800 truncate">
                      {authorName}
                    </span>
                    {authorRole && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200 uppercase shrink-0">
                        {authorRole}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-400 shrink-0">
                    <span className="text-[10px]" title={c.created_at ? new Date(c.created_at).toLocaleString() : ''}>
                      {formatTimestamp(c.created_at)}
                    </span>
                    {isEdited && (
                      <span className="text-[9px] text-slate-400 italic">
                        (edited)
                      </span>
                    )}

                    {canModify && !isEditing && (
                      <div className="flex items-center gap-0.5 ml-1">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(c)}
                          className="p-1 rounded text-slate-400 hover:text-purple-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
                          title="Edit comment"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(c.id)}
                          disabled={isDeleting}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete comment"
                        >
                          {isDeleting ? (
                            <Loader2 className="w-3 h-3 animate-spin text-rose-500" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Comment body or inline edit */}
                {isEditing ? (
                  <div className="space-y-1.5 pt-1">
                    <textarea
                      rows={2}
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-purple-400 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-y"
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={savingEdit}
                        className="px-2 py-1 rounded text-[11px] text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(c.id)}
                        disabled={savingEdit || !editingText.trim()}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        {savingEdit && (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        )}
                        <span>Save</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap select-text">
                    {c.content}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

