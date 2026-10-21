import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Users, FolderKanban, ArrowRight } from 'lucide-react';
import { projectsService } from '../../services/projects.service';

export default function QuickSearchModal({ isOpen, onClose, onSelectResult }) {
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      projectsService.getProjects().then((data) => setProjects(data?.projects || [])).catch(() => {});
      projectsService.getUsers().then((data) => setUsers(data?.users || [])).catch(() => {});
    } else {
      setQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const q = query.toLowerCase().trim();

  const filteredUsers = q ? users.filter(u => 
    (u.name && u.name.toLowerCase().includes(q)) || 
    (u.email && u.email.toLowerCase().includes(q)) || 
    (u.role && u.role.toLowerCase().includes(q))
  ).slice(0, 4) : [];

  const filteredProjects = q ? projects.filter(p => 
    (p.name && p.name.toLowerCase().includes(q)) || 
    (p.description && p.description.toLowerCase().includes(q)) ||
    (p.owner?.name && p.owner.name.toLowerCase().includes(q))
  ).slice(0, 4) : [];

  const hasResults = filteredUsers.length > 0 || filteredProjects.length > 0;

  return (
    <div
      role="button"
      tabIndex={0} 
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          (e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }
        }
      }}
    >
      <div 
        className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
      >
        {/* Search Input Bar */}
        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, members, leads..."
            className="w-full text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
          />
          {query && (
            <button 
              onClick={() => setQuery('')}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="px-2 py-0.5 text-[10px] font-semibold text-slate-400 bg-slate-100 rounded border border-slate-200">
            ESC
          </kbd>
        </div>

        {/* Search Results Area */}
        <div className="p-4 max-h-96 overflow-y-auto space-y-4">
          {!q ? (
            <div className="py-8 text-center text-xs text-slate-400 space-y-1">
              <p className="font-semibold text-slate-600">Quick Search across Workspace</p>
              <p>Type a project title or member name to quickly navigate</p>
            </div>
          ) : !hasResults ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No matching records found for "{query}".
            </div>
          ) : (
            <>
              {/* Users Section */}
              {filteredUsers.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-purple-600" />
                    <span>Members & Interns</span>
                  </div>
                  <div className="space-y-1">
                    {filteredUsers.map((u) => (
                      <button
                        type="button"
                        key={u.id}
                        onClick={() => {
                          onSelectResult?.('interns', u);
                          onClose();
                        }}
                        className="w-full text-left flex items-center justify-between p-2.5 rounded-xl hover:bg-purple-50/60 cursor-pointer group transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center">
                            {(u.name || u.email || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-slate-800 group-hover:text-purple-700">
                              {u.name || 'Member'}
                            </span>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {u.email} • {u.role}
                            </div>
                          </div>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-purple-600 transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Projects Section */}
              {filteredProjects.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <FolderKanban className="w-3 h-3 text-purple-600" />
                    <span>Projects</span>
                  </div>
                  <div className="space-y-1">
                    {filteredProjects.map((proj) => (
                      <button
                        type="button"
                        key={proj.id}
                        onClick={() => {
                          onSelectResult?.('projects', proj);
                          onClose();
                        }}
                        className="w-full text-left flex items-center justify-between p-2.5 rounded-xl hover:bg-purple-50/60 cursor-pointer group transition-colors"
                      >
                        <div>
                          <span className="text-xs font-semibold text-slate-800 group-hover:text-purple-700">
                            {proj.name}
                          </span>
                          <div className="text-[10px] text-slate-400">
                            Owner: {proj.owner?.name || proj.owner?.email || 'Unassigned'} • Status: {proj.status}
                          </div>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {proj.status}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
