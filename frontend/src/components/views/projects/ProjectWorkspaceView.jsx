import React, { useState, useEffect } from 'react';
import { FolderKanban } from 'lucide-react';
import ProjectOverviewTab from './ProjectOverviewTab';
import ProjectRoadmapTab from './ProjectRoadmapTab';
import ProjectSprintWorkspaceTab from './ProjectSprintWorkspaceTab';
import ProjectBacklogTab from './ProjectBacklogTab';
import KanbanBoard from '../../kanban/KanbanBoard';
import ProjectMomTab from './ProjectMomTab';
import { projectsService } from '../../../services/projects.service';

export default function ProjectWorkspaceView({ 
  projectId,
  onBackToDirectory, 
  activeTab = 'overview', 
  onTabChange,
  onOpenSearch,
  onActionTrigger,
  onToast,
  onProjectLoaded,
  readOnly = false,
  userRole = null,
}) {
  const [currentTab, setCurrentTab] = useState(activeTab);
  const [liveProject, setLiveProject] = useState(null);
  const [selectedSprintId, setSelectedSprintId] = useState(null);

  useEffect(() => {
    if (projectId) {
      projectsService.getProjectById(projectId)
        .then((proj) => {
          setLiveProject(proj);
          onProjectLoaded?.(proj);
        })
        .catch((err) => console.error('Failed to load project details in workspace:', err));
    }
  }, [projectId]);

  useEffect(() => {
    setCurrentTab(activeTab);
  }, [activeTab]);

  const handleTabClick = (tabId) => {
    setCurrentTab(tabId);
    onTabChange?.(tabId);
  };

  const handleOpenSprintBoard = (sprintId) => {
    setSelectedSprintId(sprintId);
    handleTabClick('sprint');
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'roadmap', label: 'Roadmap' },
    { id: 'sprint', label: 'Sprint Workspace' },
    { id: 'backlog', label: 'Backlog & Epics' },
    { id: 'kanban', label: 'Kanban Board' },
    { id: 'action-items', label: 'Action Items' },
  ];

  const ownerName = liveProject?.owner
    ? (liveProject.owner.name || liveProject.owner.email)
    : (liveProject ? 'Unassigned' : 'Loading...');

  const memberCount = liveProject?._count?.members ?? (liveProject?.members?.length ?? 0);
  const statusStr = liveProject?.status || 'PLANNED';

  return (
    <div className="min-w-0 max-w-full">
      {/* PROJECT CONTEXT: METADATA & PROJECT NAVIGATION TABS */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 pb-0 select-none shadow-xs">
        {/* ROW 1: Project Metadata & Optional Back Button */}
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 text-xs sm:text-sm text-slate-600 pb-2.5">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {onBackToDirectory && (
              <>
                <button
                  type="button"
                  onClick={onBackToDirectory}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors cursor-pointer mr-1"
                >
                  <span>&larr; Back to Projects</span>
                </button>
                <span className="text-slate-300 select-none">·</span>
              </>
            )}
            {liveProject?.name && (
              <>
                <span className="font-bold text-slate-900">{liveProject.name}</span>
                <span className="text-slate-300 select-none">·</span>
              </>
            )}
            <span>Project Owner: <strong className="text-slate-800 font-semibold">{ownerName}</strong></span>
            <span className="text-slate-300 select-none">·</span>
            <span>Status: <strong className="text-purple-700 font-semibold">{statusStr}</strong></span>
            <span className="text-slate-300 select-none">·</span>
            <span><strong className="text-slate-800 font-semibold">{memberCount}</strong> {memberCount === 1 ? 'Member' : 'Members'}</span>
          </div>
          {readOnly && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
              Contributor View (Read-Only)
            </span>
          )}
        </div>

        {/* ROW 2: Project Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto -mb-px min-w-0 max-w-full">
          {tabs.map((tab) => {
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 cursor-pointer ${
                  isActive
                    ? 'border-purple-600 text-purple-700 font-bold'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Render Current Tab Content */}
      <div className="pt-2 sm:pt-2.5">
        {currentTab === 'overview' ? (
          <ProjectOverviewTab 
            projectId={projectId} 
            project={liveProject} 
            onToast={onToast}
            readOnly={readOnly}
          />
        ) : currentTab === 'roadmap' ? (
          <ProjectRoadmapTab
            projectId={projectId}
            project={liveProject}
            onOpenSprintBoard={handleOpenSprintBoard}
            onToast={onToast}
            readOnly={readOnly}
          />
        ) : currentTab === 'sprint' ? (
          <ProjectSprintWorkspaceTab
            projectId={projectId}
            selectedSprintId={selectedSprintId}
            onBackToRoadmap={() => handleTabClick('roadmap')}
            onToast={onToast}
            readOnly={readOnly}
          />
        ) : currentTab === 'backlog' ? (
          <ProjectBacklogTab
            projectId={projectId}
            project={liveProject}
            onToast={onToast}
            readOnly={readOnly}
          />
        ) : currentTab === 'kanban' ? (
          <KanbanBoard
            projectId={projectId}
            onToast={onToast}
            readOnly={readOnly}
          />
        ) : currentTab === 'action-items' || currentTab === 'mom' ? (
          <ProjectMomTab
            projectId={projectId}
            projectName={liveProject?.name}
            onToast={onToast}
            readOnly={readOnly}
          />
        ) : (
          <div className="bg-white rounded-2xl p-12 border border-slate-200/80 shadow-xs text-center max-w-lg mx-auto my-8">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-3">
              <FolderKanban className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {tabs.find((t) => t.id === currentTab)?.label || 'Module'}
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto mb-4">
              Action Items module is active.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
