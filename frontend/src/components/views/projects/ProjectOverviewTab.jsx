import React, { useState, useEffect } from 'react';
import ProjectFilesSection from './ProjectFilesSection';
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
  ShieldCheck
} from 'lucide-react';
import { projectsService } from '../../../services/projects.service';
import { useAuth } from '../../../context/AuthContext';
import AssignProjectRolesModal, { PROJECT_ROLE_LABELS } from '../../modals/AssignProjectRolesModal';
import TasksView from '../TasksView';

export default function ProjectOverviewTab({ projectId, project, onToast }) {
  const { user: authUser } = useAuth();
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [isAssignRolesOpen, setIsAssignRolesOpen] = useState(false);

  const canAssignRoles = 
    authUser?.role === 'MANAGER' || 
    authUser?.role === 'ADMIN' || 
    authUser?.role === 'SUPER_ADMIN' || 
    authUser?.id === project?.owner_id;

  const loadMembers = () => {
    if (projectId) {
      setLoadingMembers(true);
      projectsService.getMembers(projectId)
        .then((list) => setMembers(list || []))
        .catch((err) => console.error('Failed to load project members:', err))
        .finally(() => setLoadingMembers(false));
    }
  };

  useEffect(() => {
    loadMembers();
  }, [projectId]);

  const handleRolesUpdated = (updatedList) => {
    if (Array.isArray(updatedList) && updatedList.length > 0) {
      setMembers(updatedList);
    } else {
      loadMembers();
    }
    onToast?.('Project member roles updated successfully');
  };

  const projectName = project?.name || 'Project Details';
  const projectStatus = project?.status || 'PLANNED';
  const projectDesc = project?.description || 'No description provided for this project.';
  const ownerName = project?.owner?.name || project?.owner?.email || 'Unassigned';
  const ownerEmail = project?.owner?.email || '';
  const ownerAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(ownerName)}&background=7C3AED&color=fff`;

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
    <div className="space-y-6">
      {/* Project Overview Executive Summary */}
      <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              {projectName} — Executive Summary
            </h2>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusBadgeStyle(projectStatus)}`}>
                {projectStatus}
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-600 mt-2 max-w-4xl leading-relaxed">
          {projectDesc}
        </p>

        {/* Project Metadata Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-5 pt-4 border-t border-slate-100">
          {/* Owner */}
          <div className="flex items-center gap-3 p-3 bg-slate-50/70 border border-slate-200/60 rounded-xl">
            <img
              src={ownerAvatar}
              alt={ownerName}
              className="w-9 h-9 rounded-full object-cover ring-1 ring-purple-200 shrink-0"
            />
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Project Owner
              </span>
              <div className="text-xs font-bold text-slate-900 truncate">{ownerName}</div>
              {ownerEmail && <div className="text-[10px] text-slate-400 truncate">{ownerEmail}</div>}
            </div>
          </div>

          {/* Timeline */}
          <div className="flex items-center gap-3 p-3 bg-slate-50/70 border border-slate-200/60 rounded-xl">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100/80 shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Timeline
              </span>
              <div className="text-xs font-bold text-slate-900">
                {startDateStr} — {endDateStr}
              </div>
              <div className="text-[10px] text-slate-400">
                Status: {projectStatus}
              </div>
            </div>
          </div>

          {/* Members Count */}
          <div className="flex items-center gap-3 p-3 bg-slate-50/70 border border-slate-200/60 rounded-xl">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100/80 shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Assigned Team
              </span>
              <div className="text-xs font-bold text-slate-900">
                {members.length} {members.length === 1 ? 'Member' : 'Members'}
              </div>
              <div className="text-[10px] text-slate-400">
                Active Organization Collaborators
              </div>
            </div>
          </div>
        </div>

        {/* Project Files Section (Real Document Metadata API) */}
        <ProjectFilesSection projectId={projectId || project?.id} onToast={onToast} />
      </div>

      {/* Project Members Section */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-card">
        <div className="flex items-center justify-between text-xs mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-600" />
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Project Members</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-slate-500 text-xs font-semibold">
              {members.length} {members.length === 1 ? 'Member' : 'Members'}
            </span>
            {canAssignRoles && (
              <button
                type="button"
                onClick={() => setIsAssignRolesOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 hover:bg-purple-100 active:bg-purple-200 text-purple-700 text-xs font-bold rounded-lg border border-purple-200/80 transition-all cursor-pointer shadow-2xs"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Assign Roles</span>
              </button>
            )}
          </div>
        </div>

        {loadingMembers ? (
          <div className="flex items-center justify-center p-8 text-slate-400">
            <Loader2 className="w-5 h-5 text-purple-600 animate-spin mr-2" />
            <span className="text-xs font-medium">Loading project members...</span>
          </div>
        ) : members.length === 0 ? (
          <div className="p-8 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-center">
            <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <h4 className="text-xs font-bold text-slate-700">0 Members Assigned</h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              No team members are currently assigned to this project.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
            {members.map((member) => {
              const mName = member.name || member.email || 'Member';
              const mAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(mName)}&background=random`;
              return (
                <div key={member.user_id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/80 border border-slate-200/70 shadow-2xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={mAvatar}
                      alt={mName}
                      className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">{mName}</div>
                      <div className="text-[10px] text-slate-400 truncate">{member.email}</div>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200/60 shrink-0 ml-1">
                    {PROJECT_ROLE_LABELS[member.project_role] || 'Member'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Work Management Section (Real Backend Tasks API) */}
      <TasksView projectId={projectId || project?.id} onToast={onToast} />

      {/* Assign Roles Modal */}
      <AssignProjectRolesModal
        isOpen={isAssignRolesOpen}
        onClose={() => setIsAssignRolesOpen(false)}
        projectId={projectId || project?.id}
        projectName={projectName}
        members={members}
        onSuccess={handleRolesUpdated}
      />
    </div>
  );
}
