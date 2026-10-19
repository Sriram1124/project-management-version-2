import React, { useState, useEffect, useMemo } from 'react';
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
  Users,
  RotateCcw
} from 'lucide-react';
import { projectsService } from '../../../services/projects.service';
import { useAuth } from '../../../context/AuthContext';
import ProjectMethodologyBadge from './ProjectMethodologyBadge';

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
  const [createSelectedOwners, setCreateSelectedOwners] = useState([]);
  const [createOwnerSearch, setCreateOwnerSearch] = useState('');
  const [isOwnerDropdownOpen, setIsOwnerDropdownOpen] = useState(false);
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

  // Eligible Project Owners: strictly active Managers, Admins, Super Admins (NEVER interns)
  const eligibleOwners = useMemo(() => {
    return orgUsers.filter((u) => {
      if (u.is_active === false) return false;
      const roleStr = (u.type || u.role?.name || u.role || '').toUpperCase();
      const roles = Array.isArray(u.roles)
        ? u.roles.map((r) => (r.role?.name || r.name || (typeof r === 'string' ? r : '')).toUpperCase())
        : [];
      if (roleStr) roles.push(roleStr);

      const isIntern = roles.includes('INTERN');
      const isManagerOrHigher = roles.some((r) => ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(r));

      return !isIntern && isManagerOrHigher;
    });
  }, [orgUsers]);

  const filteredCreateOwners = useMemo(() => {
    if (!createOwnerSearch.trim()) return eligibleOwners;
    const term = createOwnerSearch.toLowerCase().trim();
    return eligibleOwners.filter((u) => {
      const matchName = u.name && u.name.toLowerCase().includes(term);
      const matchEmail = u.email && u.email.toLowerCase().includes(term);
      const matchRole = (u.type || u.role || '').toLowerCase().includes(term);
      return matchName || matchEmail || matchRole;
    });
  }, [eligibleOwners, createOwnerSearch]);

  // Eligible Project Members:
  // - Must be active
  // - Exclude users already selected as Project Owners to prevent duplicate roles/assignments
  // - Exclude platform SUPER_ADMIN
  const eligibleMembers = useMemo(() => {
    return orgUsers.filter((u) => {
      if (u.is_active === false) return false;
      if (createSelectedOwners.includes(u.id)) return false;

      const roleStr = (u.type || u.role?.name || u.role || '').toUpperCase();
      const roles = Array.isArray(u.roles)
        ? u.roles.map((r) => (r.role?.name || r.name || (typeof r === 'string' ? r : '')).toUpperCase())
        : [];
      if (roleStr) roles.push(roleStr);

      if (roles.includes('SUPER_ADMIN')) return false;

      return true;
    });
  }, [orgUsers, createSelectedOwners]);

  const filteredCreateMembers = useMemo(() => {
    if (!createMemberSearch.trim()) return eligibleMembers;
    const term = createMemberSearch.toLowerCase().trim();
    return eligibleMembers.filter((u) => {
      const matchName = u.name && u.name.toLowerCase().includes(term);
      const matchEmail = u.email && u.email.toLowerCase().includes(term);
      const matchRole = (u.type || u.role || '').toLowerCase().includes(term);
      const matchBatch = (u.batch || '').toLowerCase().includes(term) || (u.subbatch || '').toLowerCase().includes(term);
      return matchName || matchEmail || matchRole || matchBatch;
    });
  }, [eligibleMembers, createMemberSearch]);

  // Backward-compatible intern filter for edit modal
  const internUsers = orgUsers.filter((u) => u.type === 'INTERN' || u.role === 'INTERN');

  const filteredEditInterns = internUsers.filter((u) => {
    if (!editMemberSearch.trim()) return true;
    const term = editMemberSearch.toLowerCase().trim();
    const matchesName = u.name && u.name.toLowerCase().includes(term);
    const matchesEmail = u.email && u.email.toLowerCase().includes(term);
    return matchesName || matchesEmail;
  });

  const toggleSelectOwner = (userId) => {
    setCreateSelectedOwners((prev) => {
      const exists = prev.includes(userId);
      const next = exists ? prev.filter((id) => id !== userId) : [...prev, userId];
      // When added as owner, ensure removed from selected members if previously checked
      if (!exists) {
        setCreateSelectedMembers((memPrev) => memPrev.filter((id) => id !== userId));
      }
      return next;
    });
  };

  const clearSelectedOwners = () => {
    setCreateSelectedOwners([]);
  };

  const handleOpenCreate = () => {
    const isAuthUserEligible = authUser?.id && eligibleOwners.some((o) => o.id === authUser.id);
    const initialOwners = isAuthUserEligible
      ? [authUser.id]
      : (eligibleOwners.length > 0 ? [eligibleOwners[0].id] : []);

    setCreateForm({
      name: '',
      methodology: '',
      description: '',
      status: 'PLANNED',
      start_date: '',
      end_date: '',
      owner_id: initialOwners[0] || '',
    });
    setCreateSelectedOwners(initialOwners);
    setCreateOwnerSearch('');
    setIsOwnerDropdownOpen(false);
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
    if (!createForm.methodology) {
      setCreateError('Project Methodology is required. Please select Scrum or Kanban.');
      return;
    }
    if (createSelectedOwners.length === 0) {
      setCreateError('At least one project owner is required');
      return;
    }
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const payload = {
        name: createForm.name.trim(),
        methodology: createForm.methodology,
        description: createForm.description.trim() || undefined,
        status: createForm.status,
        start_date: createForm.start_date || undefined,
        end_date: createForm.end_date || undefined,
        owner_id: createSelectedOwners[0],
        owner_ids: createSelectedOwners,
        member_ids: createSelectedMembers,
      };
      const created = await projectsService.createProject(payload);
      setProjects((prev) => [created, ...prev]);
      setIsCreateOpen(false);
      const ownerCount = created.owners?.length || createSelectedOwners.length;
      const memberCount = created.members?.length || createSelectedMembers.length;
      showToast(`Project "${created.name}" created successfully with ${ownerCount} owner(s) and ${memberCount} member(s)`);
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
      methodology: proj.methodology || 'SCRUM',
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

  const handleReactivate = async (proj, e) => {
    e?.stopPropagation();
    try {
      const updated = await projectsService.updateProject(proj.id, { status: 'ACTIVE' });
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? { ...p, status: 'ACTIVE' } : p)));
      showToast(`Project "${proj.name}" reactivated successfully`);
    } catch (err) {
      alert(err?.message || 'Failed to reactivate project');
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
      const owners = (p.owners && p.owners.length > 0)
        ? p.owners
        : (p.owner ? [p.owner] : []);
      const matchOwner = owners.some((o) =>
        `${o.name || ''} ${o.email || ''}`.toLowerCase().includes(q)
      );
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
                    <th className="py-3.5 px-6 min-w-[220px]">Project Details</th>
                    <th className="py-3.5 px-6 w-[130px] min-w-[130px]">Methodology</th>
                    <th className="py-3.5 px-6 min-w-[180px]">Project Owner</th>
                    <th className="py-3.5 px-6 min-w-[150px]">Members</th>
                    <th className="py-3.5 px-6 min-w-[180px]">Timeline</th>
                    <th className="py-3.5 px-6 min-w-[130px]">Progress</th>
                    <th className="py-3.5 px-6 min-w-[110px]">Status</th>
                    <th className="py-3.5 px-6 text-right min-w-[90px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProjects.map((proj) => {
                    const owners = (proj.owners && proj.owners.length > 0)
                      ? proj.owners
                      : (proj.owner ? [proj.owner] : []);
                    const primaryOwner = owners[0];
                    const ownerName = primaryOwner 
                      ? primaryOwner.name || primaryOwner.email || 'Owner'
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
                        <td className="py-4 px-6 min-w-[220px] max-w-[280px]">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100/80 shrink-0 group-hover:scale-105 transition-transform">
                              <FolderKanban className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span 
                                className="font-bold text-slate-900 group-hover:text-purple-700 transition-colors text-xs leading-snug block truncate"
                                title={proj.name}
                              >
                                {proj.name}
                              </span>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                ID: {proj.id.slice(0, 8)}...
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Methodology */}
                        <td className="py-4 px-6 w-[130px] min-w-[130px] whitespace-nowrap">
                          <ProjectMethodologyBadge methodology={proj.methodology} />
                        </td>

                        {/* Project Owner */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2.5">
                            <div className="relative shrink-0">
                              <img
                                src={ownerAvatar}
                                alt={ownerName}
                                className="w-7 h-7 rounded-full object-cover ring-1 ring-purple-200"
                              />
                              {owners.length > 1 && (
                                <span
                                  className="absolute -top-1.5 -right-1.5 px-1 py-0.2 bg-purple-600 text-white text-[8px] font-bold rounded-full border border-white"
                                  title={`${owners.length} Project Owners: ${owners.map((o) => o.name || o.email).join(', ')}`}
                                >
                                  +{owners.length - 1}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-800 text-xs block leading-tight truncate max-w-[120px]">
                                  {ownerName}
                                </span>
                                {owners.length > 1 && (
                                  <span
                                    className="text-[9px] font-bold text-purple-700 bg-purple-50 px-1 py-0.2 rounded border border-purple-200 shrink-0"
                                    title={owners.map((o) => o.name || o.email).join(', ')}
                                  >
                                    +{owners.length - 1}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 block leading-tight truncate max-w-[130px]">
                                {primaryOwner?.email || 'Owner'}
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
                                {proj.status === 'ARCHIVED' ? (
                                  <button 
                                    title="Reactivate Project"
                                    onClick={(e) => handleReactivate(proj, e)}
                                    className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                  </button>
                                ) : (
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

              {/* Project Methodology Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Project Methodology <span className="text-rose-500">*</span></span>
                  {!createForm.methodology && (
                    <span className="text-[10px] text-amber-600 font-medium">Please select Scrum or Kanban</span>
                  )}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Scrum Option Card */}
                  <div
                    onClick={() => setCreateForm({ ...createForm, methodology: 'SCRUM' })}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      createForm.methodology === 'SCRUM'
                        ? 'border-purple-600 bg-purple-50/50 shadow-xs ring-1 ring-purple-600'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900">Scrum</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-purple-100 text-purple-700">Sprint-based</span>
                      </div>
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        createForm.methodology === 'SCRUM'
                          ? 'border-purple-600 bg-purple-600'
                          : 'border-slate-300'
                      }`}>
                        {createForm.methodology === 'SCRUM' && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium mb-1.5">
                      Sprint-based planning and delivery.
                    </p>
                    <ul className="text-[10px] text-slate-600 space-y-0.5 list-disc list-inside">
                      <li>Sprint planning &amp; iterations</li>
                      <li>Product &amp; sprint backlog</li>
                      <li>Sprint progress tracking</li>
                    </ul>
                  </div>

                  {/* Kanban Option Card */}
                  <div
                    onClick={() => setCreateForm({ ...createForm, methodology: 'KANBAN' })}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      createForm.methodology === 'KANBAN'
                        ? 'border-purple-600 bg-purple-50/50 shadow-xs ring-1 ring-purple-600'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900">Kanban</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-indigo-100 text-indigo-700">Continuous</span>
                      </div>
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        createForm.methodology === 'KANBAN'
                          ? 'border-purple-600 bg-purple-600'
                          : 'border-slate-300'
                      }`}>
                        {createForm.methodology === 'KANBAN' && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium mb-1.5">
                      Continuous workflow without mandatory sprints.
                    </p>
                    <ul className="text-[10px] text-slate-600 space-y-0.5 list-disc list-inside">
                      <li>Continuous flow of work</li>
                      <li>Work-in-progress visibility</li>
                      <li>No mandatory sprint planning</li>
                    </ul>
                  </div>
                </div>
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

              {/* Project Owners Multi-Select Selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Project Owners <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-purple-600">
                      {createSelectedOwners.length} selected
                    </span>
                    {createSelectedOwners.length > 0 && (
                      <button
                        type="button"
                        onClick={clearSelectedOwners}
                        className="text-[11px] text-slate-400 hover:text-rose-600 transition-colors font-medium cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Selected Owners Chips */}
                {createSelectedOwners.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2 max-h-24 overflow-y-auto p-1.5 bg-slate-50 border border-slate-200 rounded-xl">
                    {createSelectedOwners.map((ownerId) => {
                      const owner = eligibleOwners.find((o) => o.id === ownerId) ||
                        orgUsers.find((o) => o.id === ownerId) ||
                        (authUser?.id === ownerId ? authUser : null);
                      const name = owner?.name || owner?.email || ownerId;
                      const roleName = (owner?.type || owner?.role?.name || owner?.role || 'MANAGER').toUpperCase();
                      return (
                        <span
                          key={ownerId}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-100/80 text-purple-900 border border-purple-200 rounded-lg text-xs font-medium shadow-2xs"
                        >
                          <span className="w-4 h-4 rounded-full bg-purple-600 text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                            {(name || 'U').slice(0, 1).toUpperCase()}
                          </span>
                          <span className="truncate max-w-[140px]">{name}</span>
                          <span className="text-[9px] px-1 py-0.5 rounded bg-purple-200/80 text-purple-800 font-mono font-semibold uppercase shrink-0">
                            {roleName}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelectOwner(ownerId);
                            }}
                            className="text-purple-600 hover:text-rose-600 transition-colors p-0.5 cursor-pointer rounded-xs shrink-0"
                            title={`Remove ${name}`}
                            aria-label={`Remove ${name}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Owner Search Field */}
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={createOwnerSearch}
                    onChange={(e) => setCreateOwnerSearch(e.target.value)}
                    placeholder="Search eligible managers & admins by name or email..."
                    className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600 bg-white shadow-2xs"
                  />
                  {createOwnerSearch && (
                    <button
                      type="button"
                      onClick={() => setCreateOwnerSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Eligible Owners List */}
                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50 p-1">
                  {loadingUsers ? (
                    <div className="p-3 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                      <span>Loading eligible owners...</span>
                    </div>
                  ) : eligibleOwners.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">
                      No eligible managers or administrators available.
                    </div>
                  ) : filteredCreateOwners.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">
                      No eligible owners found matching "{createOwnerSearch}".
                    </div>
                  ) : (
                    filteredCreateOwners.map((u) => {
                      const isSelected = createSelectedOwners.includes(u.id);
                      const roleName = (u.type || u.role?.name || u.role || 'MANAGER').toUpperCase();
                      return (
                        <div
                          key={u.id}
                          onClick={() => toggleSelectOwner(u.id)}
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
                                <span className="font-mono text-[9px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200 shrink-0">
                                  {roleName}
                                </span>
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

                {/* Member Search Field */}
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={createMemberSearch}
                    onChange={(e) => setCreateMemberSearch(e.target.value)}
                    placeholder="Search eligible members by name, email, or role..."
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
                      <span>Loading eligible members...</span>
                    </div>
                  ) : eligibleMembers.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No eligible members available.
                    </div>
                  ) : filteredCreateMembers.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No eligible members found matching "{createMemberSearch}".
                    </div>
                  ) : (
                    filteredCreateMembers.map((u) => {
                      const isSelected = createSelectedMembers.includes(u.id);
                      const roleName = (u.type || u.role?.name || u.role || 'MEMBER').toUpperCase();
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
                                <span className="font-mono text-[9px] font-bold text-slate-600 bg-slate-200/70 px-1.5 py-0.2 rounded shrink-0">
                                  {roleName}
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

              {/* Project Methodology (Immutable - Read-Only) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Project Methodology
                </label>
                <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50/80">
                  <div className="flex items-center gap-2">
                    <ProjectMethodologyBadge methodology={editForm.methodology} />
                    <span className="text-[11px] text-slate-500">
                      {editForm.methodology === 'KANBAN' ? 'Continuous workflow' : 'Sprint iterations & planning'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium italic">Immutable after creation</span>
                </div>
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
