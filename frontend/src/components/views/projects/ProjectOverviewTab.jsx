import React, { useState, useEffect, useRef } from 'react';
import ProjectFilesSection from './ProjectFilesSection';
import ProjectMethodologyBadge from './ProjectMethodologyBadge';
import { 
  FolderKanban, 
  Calendar, 
  Clock, 
  Users, 
  Layers, 
  User, 
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  ShieldPlus,
  ChevronRight,
  RefreshCw,
  UserPlus,
  Trash2
} from 'lucide-react';
import { projectsService } from '../../../services/projects.service';
import { useAuth } from '../../../context/AuthContext';
import AssignProjectRolesModal, { PROJECT_ROLE_LABELS } from '../../modals/AssignProjectRolesModal';
import AllProjectMembersModal from '../../modals/AllProjectMembersModal';
import AddProjectMembersModal from '../../modals/AddProjectMembersModal';
import AddCustomRoleModal from '../../modals/AddCustomRoleModal';
import ProjectTaskCharts from './ProjectTaskCharts';

export default function ProjectOverviewTab({ projectId, project, onNavigateTab, onToast, onDeleted, readOnly = false, isTechLead = false, isIntern = false }) {
  const { user: authUser } = useAuth();
  const currentUserId = authUser?.id || authUser?.user_id;
  const authRole = String(authUser?.role?.name || authUser?.role || authUser?.type || authUser?.user_type || '').toUpperCase();
  const [members, setMembers] = useState(null); // null indicates not loaded yet
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState(null);
  const isFetchingRef = useRef(false);
  const [isAssignRolesOpen, setIsAssignRolesOpen] = useState(false);
  const [isAllMembersOpen, setIsAllMembersOpen] = useState(false);
  const [isAddMembersOpen, setIsAddMembersOpen] = useState(false);
  const [isAddCustomRoleOpen, setIsAddCustomRoleOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isTechLeadOnProject = 
    isTechLead ||
    authRole === 'TECH_LEAD' || 
    Boolean(authUser?.is_tech_lead && (authUser?.lead_project_ids?.includes(projectId) || !authUser?.lead_project_ids?.length)) ||
    (members || project?.members || []).some((m) => 
      (m.user_id === currentUserId || m.id === currentUserId) && 
      (m.project_role === 'TECH_LEAD' || m.role === 'TECH_LEAD')
    );

  const isManager = 
    authRole === 'MANAGER' || 
    authRole === 'ADMIN' || 
    authRole === 'SUPER_ADMIN' || 
    authUser?.id === project?.owner_id;

  const canManageProject = 
    isManager ||
    isTechLeadOnProject;

  const canAssignRoles = isManager || isTechLeadOnProject;
  const canRemoveMembers = isManager || isTechLeadOnProject;
  const canAddMembers = isManager || isTechLeadOnProject;

  const loadMembers = (force = false) => {
    if (!projectId) return;
    if (!force && (members !== null || isFetchingRef.current)) return;

    isFetchingRef.current = true;
    setLoadingMembers(true);
    setMembersError(null);

    projectsService.getMembers(projectId)
      .then((list) => {
        setMembers(list || []);
      })
      .catch((err) => {
        console.error('Failed to load project members:', err);
        setMembersError(err?.message || 'Failed to load project members. Please try again.');
      })
      .finally(() => {
        setLoadingMembers(false);
        isFetchingRef.current = false;
      });
  };

  useEffect(() => {
    // Reset state when project changes without eager fetching
    setMembers(null);
    setMembersError(null);
    isFetchingRef.current = false;
  }, [projectId]);

  const handleOpenAssignRoles = () => {
    if (members === null && !loadingMembers) {
      loadMembers();
    }
    setIsAssignRolesOpen(true);
  };

  const handleOpenAllMembers = () => {
    if (members === null && !loadingMembers) {
      loadMembers();
    }
    setIsAllMembersOpen(true);
  };

  const handleRolesUpdated = (updatedList) => {
    if (Array.isArray(updatedList) && updatedList.length > 0) {
      const sorted = updatedList.slice().sort((a, b) => {
        const aIsLead = a.project_role === 'TECH_LEAD' || a.role === 'TECH_LEAD';
        const bIsLead = b.project_role === 'TECH_LEAD' || b.role === 'TECH_LEAD';
        if (aIsLead && !bIsLead) return -1;
        if (!aIsLead && bIsLead) return 1;
        const nameA = a.name || a.email || '';
        const nameB = b.name || b.email || '';
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      });
      setMembers(sorted);
    } else {
      loadMembers(true);
    }
    onToast?.('Project member roles updated successfully');
  };

  const handleMembersAdded = (newMembers) => {
    if (Array.isArray(newMembers) && newMembers.length > 0) {
      setMembers((prev) => {
        const current = prev || [];
        const existingIds = new Set(current.map((m) => m.user_id || m.id));
        const toAdd = newMembers.filter((m) => !existingIds.has(m.user_id || m.id));
        const merged = [...current, ...toAdd];
        return merged.sort((a, b) => {
          const aIsLead = a.project_role === 'TECH_LEAD' || a.role === 'TECH_LEAD';
          const bIsLead = b.project_role === 'TECH_LEAD' || b.role === 'TECH_LEAD';
          if (aIsLead && !bIsLead) return -1;
          if (!aIsLead && bIsLead) return 1;
          const nameA = a.name || a.email || '';
          const nameB = b.name || b.email || '';
          return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
        });
      });
      onToast?.(`Successfully added ${newMembers.length} ${newMembers.length === 1 ? 'member' : 'members'} to ${projectName}`);
    } else {
      loadMembers(true);
    }
  };

  const handleConfirmDelete = async () => {
    const targetId = projectId || project?.id;
    if (!targetId) return;
    setIsDeleting(true);
    try {
      await projectsService.deleteProject(targetId);
      onToast?.(`Project "${projectName}" deleted successfully`);
      setIsDeleteOpen(false);
      onDeleted?.();
    } catch (err) {
      alert(err?.message || 'Failed to delete project');
    } finally {
      setIsDeleting(false);
    }
  };

  const projectName = project?.name || 'Project Details';
  const projectStatus = project?.status || 'PLANNED';
  const projectMethodology = String(project?.methodology || 'SCRUM').toUpperCase();
  const projectDesc = project?.description || 'No description provided for this project.';
  const projectOwners = Array.isArray(project?.owners) && project.owners.length > 0
    ? project.owners
    : (project?.owner ? [project.owner] : []);
  const primaryOwner = projectOwners[0] || project?.owner;
  const ownerName = primaryOwner?.name || primaryOwner?.email || 'Unassigned';
  const ownerEmail = primaryOwner?.email || '';
  const ownerAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(ownerName)}&background=7C3AED&color=fff`;
  const additionalOwnersCount = projectOwners.length > 1 ? projectOwners.length - 1 : 0;
  const memberCount = Array.isArray(members) ? members.length : (project?._count?.members ?? (Array.isArray(project?.members) ? project.members.length : null));

  const startDateStr = project?.start_date 
    ? new Date(project.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) 
    : 'Not set';
  const endDateStr = project?.end_date 
    ? new Date(project.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) 
    : 'Not set';

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

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      {/* 1. Project Overview Executive Summary */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              {projectName} — Executive Summary
            </h2>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusBadgeStyle(projectStatus)}`}>
                {projectStatus}
              </span>
              <ProjectMethodologyBadge methodology={projectMethodology} />
            </div>
          </div>

          {canManageProject && !readOnly && onDeleted && (
            <button
              type="button"
              onClick={() => setIsDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200/80 rounded-xl transition-colors cursor-pointer self-start sm:self-auto"
              title="Delete Project"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Delete Project</span>
            </button>
          )}
        </div>

        <p className="text-xs text-slate-600 mt-2 max-w-4xl leading-relaxed">
          {projectDesc}
        </p>

        {/* Project Metadata Stats (All three cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-5 pt-4 border-t border-slate-100">
          {/* Owner */}
          <div 
            className="flex items-center gap-3.5 p-3.5 sm:p-4 bg-slate-50/80 border border-slate-200/80 rounded-xl"
            title={projectOwners.length > 0 ? projectOwners.map((o) => `${o.name || o.email} (${o.email || ''})`).join(', ') : undefined}
          >
            <div className="relative shrink-0">
              <img
                src={ownerAvatar}
                alt={ownerName}
                className="w-9 h-9 rounded-full object-cover ring-1 ring-purple-200"
              />
              {additionalOwnersCount > 0 && (
                <span className="absolute -bottom-1 -right-1 px-1 py-0.2 rounded-full text-[9px] font-bold bg-purple-600 text-white border border-white">
                  +{additionalOwnersCount}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  {additionalOwnersCount > 0 ? 'Project Owners' : 'Project Owner'}
                </span>
                {additionalOwnersCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                    {projectOwners.length}
                  </span>
                )}
              </div>
              <div className="text-xs font-bold text-slate-900 truncate">
                {ownerName}
                {additionalOwnersCount > 0 && (
                  <span className="text-[11px] font-normal text-purple-600 ml-1">
                    +{additionalOwnersCount} more
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {additionalOwnersCount > 0
                  ? projectOwners.map((o) => o.name || o.email).join(', ')
                  : (ownerEmail || '')}
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="flex items-center gap-3.5 p-3.5 sm:p-4 bg-slate-50/80 border border-slate-200/80 rounded-xl">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100/80 shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Timeline
              </span>
              <div className="text-xs font-bold text-slate-900">
                {startDateStr} — {endDateStr}
              </div>
              <div className="text-[10px] text-slate-400">
                Methodology: {projectMethodology === 'KANBAN' ? 'Kanban (Flow)' : 'Scrum (Sprints)'} · Status: {projectStatus}
              </div>
            </div>
          </div>

          {/* Assigned Team */}
          <div
            role="button"
            tabIndex={0}
            onClick={handleOpenAllMembers}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleOpenAllMembers();
              }
            }}
            className="flex items-center justify-between gap-3.5 p-3.5 sm:p-4 bg-slate-50/80 hover:bg-blue-50/60 border border-slate-200/80 hover:border-blue-300 rounded-xl transition-all cursor-pointer shadow-2xs hover:shadow-xs group select-none"
            title="Click to view all members, add members, or assign roles"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white flex items-center justify-center border border-blue-100/80 shrink-0 transition-colors">
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400 group-hover:text-blue-600 uppercase tracking-wider block transition-colors">
                    Assigned Team
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-900 group-hover:text-blue-950 truncate transition-colors">
                  {memberCount !== null ? `${memberCount} ${memberCount === 1 ? 'Member' : 'Members'}` : 'Team Members'}
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  Active Organization Collaborators
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0 text-slate-400 group-hover:text-blue-600 transition-colors pr-1">
              <span className="text-[10px] font-bold hidden sm:inline px-2 py-0.5 rounded-full bg-blue-100/70 text-blue-700 border border-blue-200/60 group-hover:bg-blue-600 group-hover:text-white transition-all">
                Open ↗
              </span>
              <ChevronRight className="w-4 h-4 sm:hidden text-slate-400 group-hover:text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Task Analytics & Work Distribution (Second) */}
      <ProjectTaskCharts 
        projectId={projectId || project?.id} 
        project={project}
        members={members || project?.members || []}
        onNavigateTab={onNavigateTab}
        readOnly={readOnly && !canManageProject}
        isIntern={false}
      />

      {/* 3. Project Files Section (Real Document Metadata API - Last) */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-card">
        <ProjectFilesSection 
          projectId={projectId || project?.id} 
          projectName={projectName}
          onToast={onToast} 
          readOnly={readOnly}
          className="!mt-0 !pt-0 !border-t-0"
        />
      </div>

      {/* View All Members Modal (Floating rectangular modal with search & role filter) */}
      <AllProjectMembersModal
        isOpen={isAllMembersOpen}
        onClose={() => setIsAllMembersOpen(false)}
        members={members || []}
        projectName={projectName}
        projectId={projectId || project?.id}
        canAssignRoles={canAssignRoles}
        canRemoveMembers={canRemoveMembers}
        canAddMembers={canAddMembers}
        canEditPermissions={isManager}
        onOpenAssignRoles={handleOpenAssignRoles}
        onMembersAdded={handleMembersAdded}
        onToast={onToast}
        onMemberRemoved={(removedUserId) => {
          setMembers((prev) => (prev ? prev.filter((m) => (m.user_id || m.id) !== removedUserId) : []));
          onToast?.('Member removed from project successfully');
        }}
      />

      {/* Add Project Members Modal */}
      <AddProjectMembersModal
        isOpen={isAddMembersOpen}
        onClose={() => setIsAddMembersOpen(false)}
        projectId={projectId || project?.id}
        projectName={projectName}
        existingMembers={members || project?.members || []}
        onSuccess={handleMembersAdded}
        onToast={onToast}
      />

      {/* Assign Roles Modal */}
      <AssignProjectRolesModal
        isOpen={isAssignRolesOpen}
        onClose={() => setIsAssignRolesOpen(false)}
        projectId={projectId || project?.id}
        projectName={projectName}
        members={members || []}
        onSuccess={handleRolesUpdated}
        onToast={onToast}
      />

      {/* Add Custom Role Modal */}
      <AddCustomRoleModal
        isOpen={isAddCustomRoleOpen}
        onClose={() => setIsAddCustomRoleOpen(false)}
        projectId={projectId || project?.id}
        projectName={projectName}
        onRoleCreated={(newRole) => {
          onToast?.({
            type: 'success',
            title: 'Custom Role Created',
            message: `Role "${newRole.name}" created successfully.`,
          });
          if (members === null) {
            loadMembers(true);
          }
        }}
        onToast={onToast}
      />

      {/* Delete Project Confirmation Modal */}
      {isDeleteOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-100"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsDeleteOpen(false);
            }
          }}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-sm"
          >
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Delete Project</h3>
                <p className="text-[11px] text-slate-400">Permanent action</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed mb-2">
              Are you sure you want to permanently delete <strong>{projectName}</strong>?
            </p>
            <p className="text-[11px] text-slate-400 leading-normal mb-5">
              This will permanently delete the project, member assignments, work items, and documents. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsDeleteOpen(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete Project</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
