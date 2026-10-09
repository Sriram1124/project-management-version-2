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
}) {
  const [currentTab, setCurrentTab] = useState(activeTab);
  const [liveProject, setLiveProject] = useState(null);

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
    <div className="space-y-3">
      {/* PROJECT CONTEXT: METADATA & PROJECT NAVIGATION TABS */}
      <div className="bg-white border-b border-slate-200 -mt-2 -mx-2 px-6 pt-3 pb-0 select-none">
        {/* ROW 1: Project Metadata */}
        <div className="flex items-center gap-3 text-[15px] text-slate-600 pb-2.5">
          <span>Project Owner: <strong className="text-slate-800 font-semibold">{ownerName}</strong></span>
          <span className="text-slate-300 select-none">·</span>
          <span>Status: <strong className="text-purple-700 font-semibold">{statusStr}</strong></span>
          <span className="text-slate-300 select-none">·</span>
          <span><strong className="text-slate-800 font-semibold">{memberCount}</strong> {memberCount === 1 ? 'Member' : 'Members'}</span>
        </div>

        {/* ROW 2: Project Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto -mb-px">
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
      <div className="pt-1">
        {currentTab === 'overview' ? (
          <ProjectOverviewTab 
            projectId={projectId} 
            project={liveProject} 
            onToast={onToast} 
          />
        ) : currentTab === 'roadmap' ? (
          <ProjectRoadmapTab
            projectId={projectId}
            project={liveProject}
            onToast={onToast}
          />
        ) : currentTab === 'sprint' ? (
          <ProjectSprintWorkspaceTab
            projectId={projectId}
            onToast={onToast}
          />
        ) : currentTab === 'backlog' ? (
          <ProjectBacklogTab
            projectId={projectId}
            project={liveProject}
            onToast={onToast}
          />
        ) : currentTab === 'kanban' ? (
          <KanbanBoard
            projectId={projectId}
            onToast={onToast}
          />
        ) : currentTab === 'action-items' || currentTab === 'mom' ? (
          <ProjectMomTab
            projectId={projectId}
            projectName={liveProject?.name}
            onToast={onToast}
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
