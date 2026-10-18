export const METHODOLOGY = {
  SCRUM: 'SCRUM',
  KANBAN: 'KANBAN',
};

export const METHODOLOGY_META = {
  SCRUM: {
    id: 'SCRUM',
    name: 'Scrum',
    tagline: 'Cycle-based planning and delivery',
    description: 'Cycle planning, time-boxed iterations, cycle backlogs, and burndown progress tracking.',
    bullets: [
      'Cycle planning and time-boxed iterations',
      'Product backlog and cycle backlog',
      'Cycle-based progress tracking',
    ],
    boardTabId: 'scrum',
    boardLabel: 'Scrum Board',
  },
  KANBAN: {
    id: 'KANBAN',
    name: 'Kanban',
    tagline: 'Continuous workflow without mandatory sprints',
    description: 'Continuous flow of work, visual work-in-progress, and real-time cycle-time throughput.',
    bullets: [
      'Continuous flow of work',
      'Work-in-progress visibility',
      'No mandatory cycle planning',
    ],
    boardTabId: 'kanban',
    boardLabel: 'Kanban Board',
  },
};

export function getProjectMethodology(project) {
  if (!project) return METHODOLOGY.SCRUM;
  const meth = (project.methodology || '').toUpperCase().trim();
  if (meth === METHODOLOGY.KANBAN) return METHODOLOGY.KANBAN;
  return METHODOLOGY.SCRUM;
}

export function isScrumProject(project) {
  return getProjectMethodology(project) === METHODOLOGY.SCRUM;
}

export function isKanbanProject(project) {
  return getProjectMethodology(project) === METHODOLOGY.KANBAN;
}

export function getProjectTabs(projectOrMethodology) {
  const meth = typeof projectOrMethodology === 'string'
    ? (projectOrMethodology.toUpperCase().trim() === 'KANBAN' ? 'KANBAN' : 'SCRUM')
    : getProjectMethodology(projectOrMethodology);

  if (meth === METHODOLOGY.KANBAN) {
    return [
      { id: 'overview', label: 'Overview' },
      { id: 'roadmap', label: 'Roadmap' },
      { id: 'cycles', label: 'Planning & Cycles' },
      { id: 'backlog', label: 'Backlog' },
      { id: 'kanban', label: 'Kanban Board' },
      { id: 'action-items', label: 'Action Items' },
      { id: 'approvals', label: 'Approvals' },
    ];
  }

  return [
    { id: 'overview', label: 'Overview' },
    { id: 'roadmap', label: 'Roadmap' },
    { id: 'sprint', label: 'Cycle Workspace' },
    { id: 'backlog', label: 'Backlog' },
    { id: 'scrum', label: 'Scrum Board' },
    { id: 'action-items', label: 'Action Items' },
    { id: 'approvals', label: 'Approvals' },
  ];
}

