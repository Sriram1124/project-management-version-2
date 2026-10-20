import api from '../../../services/api';

let cachedProjects = [];

export const normalizeProject = (p) => {
  if (!p) return null;
  const ownerName = p.owner 
    ? `${p.owner.name || ''}`.trim() || p.owner.email || 'Project Owner'
    : 'Project Owner';

  return {
    id: p.id,
    name: p.name,
    code: p.id ? p.id.slice(0, 8).toUpperCase() : 'PROJ',
    description: p.description || 'No description provided.',
    status: p.status || 'ACTIVE',
    startDate: p.start_date ? new Date(p.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD',
    endDate: p.end_date ? new Date(p.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD',
    progress: p.status === 'COMPLETED' ? 100 : (p.progress ?? p.progress_percentage ?? p.delivery_progress_percentage ?? p.completion_rate ?? null),
    lead: {
      id: p.owner?.id || 'owner',
      name: ownerName,
      role: 'Project Owner',
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(ownerName)}&background=7C3AED&color=fff`,
    },
    members: (p.members || []).map((m) => {
      const memName = m.user 
        ? `${m.user.name || ''}`.trim() || m.user.email || 'Member'
        : 'Member';
      return {
        id: m.user_id,
        name: memName,
        email: m.user?.email || '',
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(memName)}&background=random`,
      };
    }),
    documents: (p.documents || []).map((d) => ({
      id: d.id,
      name: d.name,
      type: d.document_type || 'file',
      storage_key: d.storage_key,
      updated: d.created_at ? new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently',
    })),
    recentActivity: [],
  };
};

export const projectsService = {
  // Returns only projects the intern belongs to from live backend API
  getMyProjects: async () => {
    try {
      const res = await api.get('/projects?my=true');
      const list = (res.projects || []).map(normalizeProject);
      cachedProjects = list;
      return list;
    } catch (err) {
      console.error('Failed to get my projects:', err);
      return cachedProjects;
    }
  },

  getProjectById: (projectId) => {
    return cachedProjects.find((p) => p.id === projectId) || null;
  },

  fetchProjectById: async (projectId) => {
    try {
      const res = await api.get(`/projects/${projectId}`);
      const norm = normalizeProject(res.project);
      if (norm) {
        const idx = cachedProjects.findIndex((p) => p.id === projectId);
        if (idx >= 0) cachedProjects[idx] = norm;
        else cachedProjects.push(norm);
      }
      return norm;
    } catch (err) {
      console.error('Failed to fetch project by id:', err);
      return cachedProjects.find((p) => p.id === projectId) || null;
    }
  },
};
