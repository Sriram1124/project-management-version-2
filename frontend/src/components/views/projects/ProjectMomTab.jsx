import React, { useState, useEffect, useCallback } from 'react';
import { 
  MessageSquare, 
  Calendar, 
  Clock, 
  Users, 
  CheckCircle2, 
  Plus, 
  Search, 
  Filter, 
  X, 
  FileText, 
  Tag, 
  Share2, 
  ChevronDown, 
  ChevronUp, 
  Trash2, 
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { actionItemsService } from '../../../services/actionItems.service';

export default function ProjectMomTab({ projectId, projectName, onToast, readOnly = false, isTechLead = false }) {
  const { user: authUser } = useAuth();
  const currentUserId = authUser?.id || authUser?.user_id;
  const authRole = String(authUser?.role?.name || authUser?.role || authUser?.type || authUser?.user_type || '').toUpperCase();
  const isManager = authRole === 'MANAGER' || authRole === 'ADMIN' || authRole === 'SUPER_ADMIN';
  const isLead = isTechLead || authRole === 'TECH_LEAD' || Boolean(authUser?.is_tech_lead && (authUser?.lead_project_ids?.includes(projectId) || !authUser?.lead_project_ids?.length));

  // Tech Leads on their assigned projects and managers have create and delete permissions
  const canDelete = (isManager || isLead) && !readOnly;
  const canCreate = (isManager || isLead) && !readOnly;

  const [moms, setMoms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedMomId, setExpandedMomId] = useState(null);
  const [newQuickItem, setNewQuickItem] = useState({});
  const [itemToDelete, setItemToDelete] = useState(null);

  // Form state for creating action items
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('Sprint Planning');
  const [newDate, setNewDate] = useState(() => new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }));
  const [newTime, setNewTime] = useState(() => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
  const [newOrganizer, setNewOrganizer] = useState(() => authUser?.name || authUser?.email || '');
  const [newAttendees, setNewAttendees] = useState('');
  const [newAgenda, setNewAgenda] = useState('');
  const [newDecisions, setNewDecisions] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Clear any legacy localStorage keys from prior versions
  useEffect(() => {
    try {
      localStorage.removeItem(`moms_project_${projectId || 'default'}`);
    } catch (_) {}
  }, [projectId]);

  // Load actual action items from backend API strictly scoped by project_id
  const fetchBackendActionItems = useCallback(async () => {
    if (!projectId) {
      setMoms([]);
      return;
    }
    try {
      setLoading(true);
      const apiItems = await actionItemsService.getActionItems(projectId);
      if (Array.isArray(apiItems)) {
        const mapped = apiItems.map((item) => ({
          id: item.id,
          backendId: item.id,
          title: item.title,
          date: item.created_at ? new Date(item.created_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recent',
          time: item.created_at ? new Date(item.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '',
          type: item.priority === 'URGENT' || item.priority === 'HIGH' ? 'Critical Action' : 'Action Item',
          typeColor: item.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-purple-50 text-purple-700 border-purple-200',
          organizer: item.creator?.name || item.creator?.email || 'Project Member',
          attendees: item.assignee?.name || item.assignee?.email ? `Assignee: ${item.assignee.name || item.assignee.email}` : 'Unassigned',
          agenda: item.description || 'Action item recorded for project execution.',
          status: item.status || 'OPEN',
          priority: item.priority || 'MEDIUM',
          keyDecisions: [item.title],
        }));
        setMoms(mapped);
      } else {
        setMoms([]);
      }
    } catch (err) {
      console.warn('[ProjectMomTab] Could not load backend action items:', err.message);
      setMoms([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchBackendActionItems();
  }, [fetchBackendActionItems]);

  const filteredMoMs = moms.filter((mom) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (mom.title || '').toLowerCase().includes(q) ||
      (mom.agenda || '').toLowerCase().includes(q) ||
      (mom.organizer || '').toLowerCase().includes(q) ||
      (Array.isArray(mom.keyDecisions) && mom.keyDecisions.some((d) => (d || '').toLowerCase().includes(q)))
    );
  });

  const handleConfirmDeleteActionItem = async () => {
    if (!itemToDelete || !canDelete) return;
    const { momId } = itemToDelete;
    const targetMom = moms.find((m) => m.id === momId);
    const backendId = targetMom?.backendId || momId;

    try {
      if (backendId) {
        await actionItemsService.deleteActionItem(backendId);
      }
      setItemToDelete(null);
      await fetchBackendActionItems();
      onToast?.('Action item deleted successfully');
    } catch (err) {
      console.warn('Backend action item delete error:', err.message);
      onToast?.(err?.response?.data?.error || err.message || 'Failed to delete action item');
      setItemToDelete(null);
    }
  };

  const handleAddQuickActionItem = async (momId) => {
    if (!canCreate) return;
    const text = (newQuickItem[momId] || '').trim();
    if (!text || !projectId) return;

    try {
      await actionItemsService.createActionItem({
        title: text,
        description: `Action item for project ${projectName || projectId}`,
        project_id: projectId,
        status: 'OPEN',
        priority: 'MEDIUM',
      });
      setNewQuickItem((prev) => ({ ...prev, [momId]: '' }));
      await fetchBackendActionItems();
      onToast?.('Action item added successfully');
    } catch (err) {
      console.warn('Backend action item create error:', err.message);
      onToast?.(err?.response?.data?.error || err.message || 'Failed to add action item');
    }
  };

  const handleDeleteMoM = async (momId) => {
    if (!canDelete) return;
    const targetMom = moms.find((m) => m.id === momId);
    const backendId = targetMom?.backendId || momId;

    try {
      if (backendId) {
        await actionItemsService.deleteActionItem(backendId);
      }
      await fetchBackendActionItems();
      onToast?.('Action item deleted successfully');
    } catch (err) {
      console.warn('Backend delete error:', err.message);
      onToast?.(err?.response?.data?.error || err.message || 'Failed to delete action item');
    }
  };

  const handleCreateMoM = async (e) => {
    e.preventDefault();
    if (!canCreate || !newTitle.trim() || !projectId) return;

    try {
      setIsSubmitting(true);
      await actionItemsService.createActionItem({
        title: newTitle.trim(),
        description: newAgenda.trim() || null,
        project_id: projectId,
        status: 'OPEN',
        priority: 'MEDIUM',
      });

      setIsModalOpen(false);
      setNewTitle('');
      setNewAgenda('');
      setNewDecisions('');
      setNewAttendees('');
      await fetchBackendActionItems();
      onToast?.(`Action item created successfully`);
    } catch (err) {
      console.warn('Backend createActionItem error:', err.message);
      onToast?.(err?.response?.data?.error || err.message || 'Failed to create action item');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar: Search, Counters, and Add Action Item Button */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
          {/* Search Box */}
          <div className="relative w-full sm:w-80 md:w-96 flex-1 max-w-lg">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search action items, context, organizers..."
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Right CTA */}
        <div className="flex items-center gap-2.5 shrink-0 self-end md:self-auto">
          {loading && <Loader2 className="w-3.5 h-3.5 text-purple-600 animate-spin" />}
          <span className="text-xs text-slate-400 font-medium">
            {filteredMoMs.length} {filteredMoMs.length === 1 ? 'Item' : 'Items'}
          </span>
          {!readOnly && canCreate && (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Action Item</span>
            </button>
          )}
        </div>
      </div>

      {/* Action Items List */}
      <div className="space-y-3">
        {loading && moms.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 border border-slate-200/90 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-purple-600 animate-spin mx-auto" />
            <p className="text-xs text-slate-500">Loading action items...</p>
          </div>
        ) : filteredMoMs.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 border border-slate-200/90 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-2 border border-purple-100">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">No Action Items for this Project</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              {searchQuery
                ? `No action items match "${searchQuery}". Try a different keyword.`
                : `No action items have been recorded for ${projectName || 'this project'}.`}
            </p>
            {!readOnly && canCreate && !searchQuery && (
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer mt-1"
              >
                <Plus className="w-4 h-4" />
                <span>Add First Action Item</span>
              </button>
            )}
          </div>
        ) : (
          filteredMoMs.map((mom) => {
            const isExpanded = expandedMomId === mom.id;
            return (
              <div
                key={mom.id}
                className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 hover:border-slate-300 transition-all shadow-2xs"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        {String(mom.id).slice(0, 8)}
                      </span>
                      {mom.type && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${mom.typeColor || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                          {mom.type}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                        {mom.status}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                      {mom.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500 shrink-0">
                    {mom.date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {mom.date}
                      </span>
                    )}
                    {mom.time && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {mom.time}
                        </span>
                      </>
                    )}
                    {canDelete && (
                      <>
                        <span className="text-slate-300">·</span>
                        <button
                          type="button"
                          onClick={() => setItemToDelete({ momId: mom.id, itemText: mom.title })}
                          title={`Delete action item`}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Metadata & Context */}
                {(mom.organizer || mom.attendees || mom.agenda) && (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-600">
                    <div>
                      {mom.organizer && (
                        <>
                          <span className="text-slate-400 font-medium text-[11px] block">Created By:</span>
                          <p className="font-semibold text-slate-800 mt-0.5">{mom.organizer}</p>
                        </>
                      )}

                      {mom.attendees && (
                        <>
                          <span className="text-slate-400 font-medium text-[11px] block mt-2">Assignment:</span>
                          <p className="text-slate-700 mt-0.5">{mom.attendees}</p>
                        </>
                      )}
                    </div>

                    {mom.agenda && (
                      <div className="md:col-span-2">
                        <span className="text-slate-400 font-medium text-[11px] block">Context &amp; Details:</span>
                        <p className="text-slate-700 mt-0.5 leading-relaxed">
                          {mom.agenda}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add Action Item Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-200">
                  <FileText className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Add Action Item</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateMoM} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Title / Summary *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Implement OAuth token refresh flow"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Details &amp; Context</label>
                <textarea
                  rows={3}
                  placeholder="Key context, requirements, blockers..."
                  value={newAgenda}
                  onChange={(e) => setNewAgenda(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newTitle.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Action Item</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Action Item Confirmation Modal */}
      {itemToDelete && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-100"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setItemToDelete(null);
            }
          }}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl border border-slate-200 p-5 w-full max-w-sm animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Delete Action Item</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete this action item from the project database?
            </p>
            {itemToDelete.itemText && (
              <div className="mt-2.5 p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-700 italic break-words line-clamp-3">
                &quot;{itemToDelete.itemText}&quot;
              </div>
            )}
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteActionItem}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
