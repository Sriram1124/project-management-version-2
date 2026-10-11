import React, { useState, useEffect } from 'react';
import { 
  FolderKanban, 
  Plus, 
  Search, 
  Edit3, 
  Archive, 
  Trash2, 
  ChevronRight, 
  SlidersHorizontal,
  ChevronLeft,
  Loader2,
  AlertCircle,
  X,
  Check,
  Calendar,
  Users
} from 'lucide-react';
import { projectsService } from '../../../services/projects.service';
import { useAuth } from '../../../context/AuthContext';

export default function ProjectsDirectoryView({ onSelectProject, isIntern = false }) {
  const { user: authUser } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Organization Users State
  const [orgUsers, setOrgUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Create Project Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    status: 'PLANNED',
    start_date: '',
    end_date: '',
    owner_id: '',
  });
  const [createSelectedMembers, setCreateSelectedMembers] = useState([]);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Edit Project Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    status: 'PLANNED',
    start_date: '',
    end_date: '',
    owner_id: '',
  });
  const [editSelectedMembers, setEditSelectedMembers] = useState([]);
  const [editInitialMembers, setEditInitialMembers] = useState([]);
  const [loadingEditMembers, setLoadingEditMembers] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState(null);
  const [editMemberSearch, setEditMemberSearch] = useState('');
  const [createMemberSearch, setCreateMemberSearch] = useState('');

  // Archive Confirmation Modal State
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveSubmitting, setArchiveSubmitting] = useState(false);

  // Success Feedback
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await projectsService.getProjects(isIntern ? { my: true } : {});
      setProjects(data);
    } catch (err) {
      setError(err?.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrgUsers = async () => {
    setLoadingUsers(true);
    try {
      const users = await projectsService.getUsers();
      setOrgUsers(users);
    } catch (err) {
      console.error('Failed to load organization users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchOrgUsers();
  }, []);

  // Show ONLY interns in the project member pickers
  const internUsers = orgUsers.filter((u) => u.type === 'INTERN' || u.role === 'INTERN');

  const filteredCreateInterns = internUsers.filter((u) => {
    if (!createMemberSearch.trim()) return true;
    const term = createMemberSearch.toLowerCase().trim();
    const matchesName = u.name && u.name.toLowerCase().includes(term);
    const matchesEmail = u.email && u.email.toLowerCase().includes(term);
    return matchesName || matchesEmail;
  });

  const filteredEditInterns = internUsers.filter((u) => {
    if (!editMemberSearch.trim()) return true;
    const term = editMemberSearch.toLowerCase().trim();
    const matchesName = u.name && u.name.toLowerCase().includes(term);
    const matchesEmail = u.email && u.email.toLowerCase().includes(term);
    return matchesName || matchesEmail;
  });

  const handleOpenCreate = () => {
    const defaultOwnerId = authUser?.id || (orgUsers.length > 0 ? orgUsers[0].id : '');
    setCreateForm({
      name: '',
      description: '',
      status: 'PLANNED',
      start_date: '',
      end_date: '',
      owner_id: defaultOwnerId,
    });
    setCreateSelectedMembers([]);
    setCreateMemberSearch('');
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const toggleCreateMember = (userId) => {
    setCreateSelectedMembers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleEditMember = (userId) => {
    setEditSelectedMembers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createForm.name.trim()) {
      setCreateError('Project name is required');
      return;
    }
    if (!createForm.owner_id) {
      setCreateError('Project owner is required');
      return;
    }
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const payload = {
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        status: createForm.status,
        start_date: createForm.start_date || undefined,
        end_date: createForm.end_date || undefined,
        owner_id: createForm.owner_id,
        member_ids: createSelectedMembers,
      };
      const created = await projectsService.createProject(payload);
      setProjects((prev) => [created, ...prev]);
      setIsCreateOpen(false);
      const memberCount = created.members?.length || createSelectedMembers.length;
      showToast(`Project "${created.name}" created successfully with ${memberCount} member(s)`);
    } catch (err) {
      setCreateError(err?.message || 'Failed to create project');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleOpenEdit = async (proj, e) => {
    e?.stopPropagation();
    setEditingProject(proj);
    setEditForm({
      name: proj.name || '',
      description: proj.description || '',
      status: proj.status || 'PLANNED',
      start_date: proj.start_date ? proj.start_date.slice(0, 10) : '',
      end_date: proj.end_date ? proj.end_date.slice(0, 10) : '',
      owner_id: proj.owner?.id || proj.owner_id || '',
    });
    setEditError(null);
    setEditMemberSearch('');
    // Clear selections initially so no stale or default members appear
    setEditInitialMembers([]);
    setEditSelectedMembers([]);
    setIsEditOpen(true);
    setLoadingEditMembers(true);

    try {
      const members = await projectsService.getMembers(proj.id);
      const memberIds = (members || []).map((m) => m.user_id || m.id).filter(Boolean);
      setEditInitialMembers(memberIds);
      setEditSelectedMembers(memberIds);
    } catch (err) {
      console.error('Failed to load project members for editing:', err);
      setEditInitialMembers([]);
      setEditSelectedMembers([]);
    } finally {
      setLoadingEditMembers(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editForm.name.trim()) {
      setEditError('Project name is required');
      return;
    }
    if (!editForm.owner_id) {
      setEditError('Project owner is required');
      return;
    }
    setEditSubmitting(true);
    setEditError(null);
    try {
      const payload = {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        status: editForm.status,
        start_date: editForm.start_date || undefined,
        end_date: editForm.end_date || undefined,
        owner_id: editForm.owner_id,
      };

      // 1. Update project core fields
      await projectsService.updateProject(editingProject.id, payload);

      // 2. Reconcile members
      const addedMembers = editSelectedMembers.filter((id) => !editInitialMembers.includes(id));
      const removedMembers = editInitialMembers.filter((id) => !editSelectedMembers.includes(id));

      for (const userId of addedMembers) {
        try {
          await projectsService.addMember(editingProject.id, userId);
        } catch (mErr) {
          console.warn('Member already added or failed to add:', mErr);
        }
      }
      for (const userId of removedMembers) {
        try {
          await projectsService.removeMember(editingProject.id, userId);
        } catch (mErr) {
          console.warn('Member already removed or failed to remove:', mErr);
        }
      }

      // 3. Fetch fresh project from backend to keep state 100% accurate
      const freshProject = await projectsService.getProjectById(editingProject.id);
      setProjects((prev) => prev.map((p) => (p.id === freshProject.id ? freshProject : p)));
      setIsEditOpen(false);
      showToast(`Project "${freshProject.name}" updated successfully`);
    } catch (err) {
      setEditError(err?.message || 'Failed to update project');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleOpenArchive = (proj, e) => {
    e?.stopPropagation();
    setArchiveTarget(proj);
  };

  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    setArchiveSubmitting(true);
    try {
      const archived = await projectsService.archiveProject(archiveTarget.id);
      setProjects((prev) => prev.map((p) => (p.id === archived.id ? archived : p)));
      showToast(`Project "${archived.name}" archived`);
      setArchiveTarget(null);
    } catch (err) {
      alert(err?.message || 'Failed to archive project');
    } finally {
      setArchiveSubmitting(false);
    }
  };

  // Helper for Status Badges
  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'PLANNED':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'COMPLETED':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'ARCHIVED':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  // Filter projects by status and search query
  const filteredProjects = projects.filter((p) => {
    if (statusFilter !== 'All' && p.status !== statusFilter.toUpperCase()) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name?.toLowerCase().includes(q);
      const matchId = p.id?.toLowerCase().includes(q);
      const matchOwner = p.owner 
        ? `${p.owner.name || ''} ${p.owner.email || ''}`.toLowerCase().includes(q)
        : false;
      return matchName || matchId || matchOwner;
    }
    return true;
  });

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl border border-slate-800 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Title & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {isIntern ? 'My Assigned Projects' : 'Active Projects'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {isIntern 
              ? 'View and explore project workspaces, roadmaps, and sprint deliverables assigned to you.'
              : 'Create, manage, and safely archive or configure workspace projects.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600 w-44 sm:w-56"
            />
          </div>

          {/* Status filter selector */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 shadow-2xs">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 ml-1" />
            <span className="text-slate-400 text-[11px]">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent font-bold text-purple-700 focus:outline-hidden cursor-pointer text-xs"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Planned">Planned</option>
              <option value="Completed">Completed</option>
              <option value="Archived">Archived</option>
            </select>
          </div>

          {/* Create Project CTA button (Hidden for interns) */}
          {!isIntern && (
            <button 
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Project</span>
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center p-16 bg-white rounded-2xl border border-slate-200/80 shadow-card">
          <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-3" />
          <p className="text-xs font-medium text-slate-500">Loading projects...</p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex items-center justify-between p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchProjects}
            className="px-3 py-1 bg-white border border-rose-200 hover:bg-rose-100 rounded-lg text-rose-700 font-semibold cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Table Card */}
      {!loading && !error && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden min-w-0 max-w-full">
          {filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-center">
              <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-3">
                <FolderKanban className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">No Projects Found</h3>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                {searchQuery || statusFilter !== 'All'
                  ? 'No projects match your search or filter criteria.'
                  : 'Get started by creating your first workspace project.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto min-w-0 max-w-full">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/70 border-b border-slate-200/80 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3.5 px-6">Project Details</th>
                    <th className="py-3.5 px-6">Project Owner</th>
                    <th className="py-3.5 px-6">Members</th>
                    <th className="py-3.5 px-6">Timeline</th>
                    <th className="py-3.5 px-6">Progress</th>
                    <th className="py-3.5 px-6">Status</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProjects.map((proj) => {
                    const ownerName = proj.owner 
                      ? proj.owner.name || proj.owner.email || 'Owner'
                      : 'Unassigned';
                    const ownerAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(ownerName)}&background=7C3AED&color=fff`;

                    const memberCount = proj._count?.members ?? (proj.members?.length ?? 0);
                    const startDateStr = proj.start_date ? new Date(proj.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';
                    const endDateStr = proj.end_date ? new Date(proj.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';
                    const progressVal = proj.status === 'COMPLETED' ? 100 : (proj.status === 'ACTIVE' ? 75 : 0);

                    return (
                      <tr 
                        key={proj.id}
                        onClick={() => onSelectProject?.(proj.id, proj.name)}
                        className="hover:bg-purple-50/40 transition-colors cursor-pointer group"
                      >
                        {/* Project Details */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100/80 shrink-0 group-hover:scale-105 transition-transform">
                              <FolderKanban className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 group-hover:text-purple-700 transition-colors text-xs leading-snug">
                                {proj.name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                ID: {proj.id.slice(0, 8)}...
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Project Owner */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={ownerAvatar}
                              alt={ownerName}
                              className="w-7 h-7 rounded-full object-cover ring-1 ring-purple-200"
                            />
                            <div>
                              <span className="font-semibold text-slate-800 text-xs block leading-tight">
                                {ownerName}
                              </span>
                              <span className="text-[10px] text-slate-400 block leading-tight">
                                {proj.owner?.email || 'Owner'}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Members */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-purple-100 text-purple-700 border border-purple-200/60">
                              {memberCount}
                            </span>
                            <span className="text-slate-500 font-medium text-xs">
                              {memberCount === 1 ? 'member assigned' : 'members assigned'}
                            </span>
                          </div>
                        </td>

                        {/* Timeline */}
                        <td className="py-4 px-6">
                          <div className="text-slate-800 font-medium text-xs">
                            {startDateStr} — {endDateStr}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>{proj.status === 'ARCHIVED' ? 'Archived' : 'Active Timeline'}</span>
                          </div>
                        </td>

                        {/* Progress */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3 max-w-[120px]">
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  proj.status === 'COMPLETED' ? 'bg-purple-600' : (proj.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-300')
                                }`}
                                style={{ width: `${progressVal}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-slate-700 w-8 text-right">
                              {progressVal}%
                            </span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-4 px-6">
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getStatusBadgeStyle(proj.status)}`}>
                            {proj.status}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            {isIntern ? (
                              <button
                                title="Open Workspace"
                                onClick={() => onSelectProject?.(proj.id, proj.name)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors cursor-pointer"
                              >
                                <span>Open</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <>
                                <button 
                                  title="Edit Project"
                                  onClick={(e) => handleOpenEdit(proj, e)}
                                  className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                {proj.status !== 'ARCHIVED' && (
                                  <button 
                                    title="Archive Project"
                                    onClick={(e) => handleOpenArchive(proj, e)}
                                    className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <Archive className="w-4 h-4" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Table Footer */}
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
            <span>Showing {filteredProjects.length} of {projects.length} projects</span>
          </div>
        </div>
      )}

      {/* CREATE PROJECT MODAL */}
      {isCreateOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-100"
          onClick={() => setIsCreateOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-purple-600" />
                <h3 className="text-base font-bold text-slate-900">Create New Project</h3>
              </div>
              <button 
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="p-3 mb-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Project Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Student Management System"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide project objectives, scope, or details..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                />
              </div>

              {/* Project Owner Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Project Owner <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={createForm.owner_id}
                  onChange={(e) => setCreateForm({ ...createForm, owner_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600 bg-white"
                >
                  <option value="" disabled>Select project owner...</option>
                  {orgUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Project Members Multi-Select Picker */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Project Members
                  </label>
                  <span className="text-[11px] font-semibold text-purple-600">
                    {createSelectedMembers.length} selected
                  </span>
                </div>

                {/* Intern Search Field */}
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={createMemberSearch}
                    onChange={(e) => setCreateMemberSearch(e.target.value)}
                    placeholder="Search interns by name or email..."
                    className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600 bg-white shadow-2xs"
                  />
                  {createMemberSearch && (
                    <button
                      type="button"
                      onClick={() => setCreateMemberSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50 p-1">
                  {loadingUsers ? (
                    <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                      <span>Loading interns...</span>
                    </div>
                  ) : internUsers.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No interns available.
                    </div>
                  ) : filteredCreateInterns.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No interns found matching "{createMemberSearch}".
                    </div>
                  ) : (
                    filteredCreateInterns.map((u) => {
                      const isSelected = createSelectedMembers.includes(u.id);
                      return (
                        <div
                          key={u.id}
                          onClick={() => toggleCreateMember(u.id)}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                            isSelected ? 'bg-purple-100/70 text-purple-900' : 'hover:bg-white text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 shadow-2xs ${
                              isSelected ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700'
                            }`}>
                              {(u.name || u.email || 'U').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="truncate">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-900 leading-tight truncate">
                                  {u.name}
                                </span>
                                {u.batch && u.subbatch && (
                                  <span className="font-mono text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200 shrink-0">
                                    {u.batch} / {u.subbatch}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono leading-tight truncate">
                                {u.email}
                              </div>
                            </div>
                          </div>
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ml-2 transition-colors ${
                            isSelected ? 'bg-purple-600 border-purple-600 text-white' : 'border-slate-300 bg-white'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={createForm.start_date}
                    onChange={(e) => setCreateForm({ ...createForm, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={createForm.end_date}
                    onChange={(e) => setCreateForm({ ...createForm, end_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Initial Status
                </label>
                <select
                  value={createForm.status}
                  onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                >
                  <option value="PLANNED">PLANNED</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="COMPLETED">COMPLETED</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {createSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Create Project</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PROJECT MODAL */}
      {isEditOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-100"
          onClick={() => setIsEditOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-purple-600" />
                <h3 className="text-base font-bold text-slate-900">Edit Project</h3>
              </div>
              <button 
                onClick={() => setIsEditOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="p-3 mb-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Project Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                />
              </div>

              {/* Project Owner Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Project Owner <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={editForm.owner_id}
                  onChange={(e) => setEditForm({ ...editForm, owner_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600 bg-white"
                >
                  <option value="" disabled>Select project owner...</option>
                  {orgUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Project Members Multi-Select Picker */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Project Members
                  </label>
                  <div className="flex items-center gap-1.5">
                    {loadingEditMembers && <Loader2 className="w-3 h-3 animate-spin text-purple-600" />}
                    <span className="text-[11px] font-semibold text-purple-600">
                      {editSelectedMembers.length} selected
                    </span>
                  </div>
                </div>

                {/* Intern Search Field */}
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={editMemberSearch}
                    onChange={(e) => setEditMemberSearch(e.target.value)}
                    placeholder="Search interns by name or email..."
                    className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600 bg-white shadow-2xs"
                  />
                  {editMemberSearch && (
                    <button
                      type="button"
                      onClick={() => setEditMemberSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Searchable Intern List */}
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50 p-1">
                  {loadingUsers || loadingEditMembers ? (
                    <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                      <span>Loading interns...</span>
                    </div>
                  ) : internUsers.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No interns available.
                    </div>
                  ) : filteredEditInterns.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No interns found matching "{editMemberSearch}".
                    </div>
                  ) : (
                    filteredEditInterns.map((u) => {
                      const isSelected = editSelectedMembers.includes(u.id);
                      return (
                        <div
                          key={u.id}
                          onClick={() => toggleEditMember(u.id)}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                            isSelected ? 'bg-purple-100/70 text-purple-900' : 'hover:bg-white text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 shadow-2xs ${
                              isSelected ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700'
                            }`}>
                              {(u.name || u.email || 'U').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="truncate">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-900 leading-tight truncate">
                                  {u.name}
                                </span>
                                {u.batch && u.subbatch && (
                                  <span className="font-mono text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200 shrink-0">
                                    {u.batch} / {u.subbatch}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono leading-tight truncate">
                                {u.email}
                              </div>
                            </div>
                          </div>
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ml-2 transition-colors ${
                            isSelected ? 'bg-purple-600 border-purple-600 text-white' : 'border-slate-300 bg-white'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={editForm.start_date}
                    onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={editForm.end_date}
                    onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Status
                </label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                >
                  <option value="PLANNED">PLANNED</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="ARCHIVED">ARCHIVED</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {editSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ARCHIVE CONFIRMATION MODAL */}
      {archiveTarget && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-100"
          onClick={() => setArchiveTarget(null)}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-amber-600 mb-3">
              <Archive className="w-6 h-6" />
              <h3 className="text-sm font-bold text-slate-900">Archive Project</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to archive <strong>{archiveTarget.name}</strong>? Its status will be updated to ARCHIVED.
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setArchiveTarget(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmArchive}
                disabled={archiveSubmitting}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {archiveSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Archive</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
