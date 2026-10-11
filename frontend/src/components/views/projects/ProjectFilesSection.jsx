import React, { useState, useEffect, useRef, useMemo } from 'react';
import { projectsService } from '../../../services/projects.service';
import { 
  Folder, 
  Plus, 
  FileText, 
  FileSpreadsheet, 
  Image as ImageIcon, 
  MoreVertical, 
  Eye, 
  Download, 
  Pencil, 
  Trash2, 
  Clock, 
  Check, 
  X,
  UploadCloud,
  Loader2, 
  FileQuestion,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Activity,
  Layers,
  ChevronRight
} from 'lucide-react';
import FilePreviewModal from './FilePreviewModal';
import DocumentRequirementsModal from './DocumentRequirementsModal';
import AllProjectFilesModal from '../../modals/AllProjectFilesModal';

// Component to dynamically load and display authentic image thumbnails
function ImageThumbnail({ projectId, fileId, alt }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let createdUrl = null;

    projectsService.getDocumentBlobUrl(projectId, fileId)
      .then((url) => {
        if (active) {
          createdUrl = url;
          setBlobUrl(url);
        }
      })
      .catch((err) => {
        console.error('Failed to load thumbnail:', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [projectId, fileId]);

  if (loading) {
    return (
      <div className="w-full h-28 bg-purple-50 flex items-center justify-center text-purple-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className="w-full h-28 bg-slate-100 flex items-center justify-center text-slate-400">
        <ImageIcon className="w-8 h-8 opacity-50" />
      </div>
    );
  }

  return (
    <div className="w-full h-28 bg-slate-50 flex items-center justify-center overflow-hidden border-b border-slate-100">
      <img
        src={blobUrl}
        alt={alt}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
      />
    </div>
  );
}

export default function ProjectFilesSection({ projectId, projectName = '', onToast, readOnly = false }) {
  const [files, setFiles] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  const [inspectDoc, setInspectDoc] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [renameFile, setRenameFile] = useState(null);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isAllFilesOpen, setIsAllFilesOpen] = useState(false);
  const fileInputRef = useRef(null);

  const formatDoc = (d) => {
    const ext = d.document_type || (d.name ? d.name.split('.').pop().toLowerCase() : 'pdf');
    const isImg = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext);
    
    // Requirements breakdown
    const reqs = Array.isArray(d.requirements) ? d.requirements : [];
    const totalReqs = reqs.length;
    const completedReqs = reqs.filter(r => r.status === 'COMPLETED').length;
    const inProgressReqs = reqs.filter(r => r.status === 'IN_PROGRESS').length;
    const blockedReqs = reqs.filter(r => r.status === 'BLOCKED').length;
    
    // Most recent active task / activity
    const activeReq = reqs.find(r => r.current_activity && r.status === 'IN_PROGRESS') ||
                      reqs.find(r => r.current_activity) ||
                      reqs.find(r => r.status === 'IN_PROGRESS');
    
    const currentActivity = activeReq?.current_activity || 
      (activeReq ? `Working on: ${activeReq.title}` : (totalReqs > 0 && completedReqs === totalReqs ? 'All requirements implemented' : null));

    // Determine status & progress
    let implementationStatus = 'Not trackable';
    let progressPct = null;

    const isDocTrackable = ['pdf', 'docx', 'doc', 'md', 'markdown', 'txt', 'brd'].includes(ext);

    if (!isDocTrackable) {
      implementationStatus = 'Not trackable';
    } else if (totalReqs === 0) {
      implementationStatus = 'Analysis required';
    } else {
      progressPct = Math.round((completedReqs / totalReqs) * 100);
      if (completedReqs === totalReqs) {
        implementationStatus = 'Completed';
      } else if (inProgressReqs > 0 || completedReqs > 0) {
        implementationStatus = 'In Progress';
      } else {
        implementationStatus = 'Pending';
      }
    }

    return {
      id: d.id,
      name: d.name,
      type: ext,
      size: d.storage_key ? d.storage_key.split('/').pop() : 'Document',
      uploadedAt: d.created_at ? new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently',
      isImage: isImg,
      requirements: reqs,
      totalReqs,
      completedReqs,
      inProgressReqs,
      blockedReqs,
      progressPct,
      implementationStatus,
      currentActivity,
      isDocTrackable,
    };
  };

  const loadDocuments = () => {
    if (projectId) {
      setLoading(true);
      projectsService.getDocuments(projectId)
        .then((docs) => {
          if (docs && docs.length > 0) {
            setFiles(docs.map(formatDoc));
          } else {
            setFiles([]);
          }
        })
        .catch((err) => {
          console.error('Failed to load documents:', err);
        })
        .finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [projectId]);

  // Overall Document Implementation Progress calculations
  const progressMetrics = useMemo(() => {
    const trackableDocs = files.filter(f => f.isDocTrackable && f.totalReqs > 0);
    const completedDocs = files.filter(f => f.implementationStatus === 'Completed').length;
    const inProgressDocs = files.filter(f => f.implementationStatus === 'In Progress').length;
    const pendingDocs = files.filter(f => f.implementationStatus === 'Pending' || f.implementationStatus === 'Analysis required').length;

    const totalRequirementsAcrossProject = trackableDocs.reduce((acc, f) => acc + f.totalReqs, 0);
    const completedRequirementsAcrossProject = trackableDocs.reduce((acc, f) => acc + f.completedReqs, 0);

    const overallProgress = totalRequirementsAcrossProject > 0
      ? Math.round((completedRequirementsAcrossProject / totalRequirementsAcrossProject) * 100)
      : (trackableDocs.length > 0 ? 0 : 0);

    return {
      eligibleCount: trackableDocs.length,
      completedDocs,
      inProgressDocs,
      pendingDocs,
      totalRequirementsAcrossProject,
      completedRequirementsAcrossProject,
      overallProgress,
    };
  }, [files]);

  // Close open dropdowns when clicking outside
  const handleContainerClick = () => {
    if (activeMenuId) setActiveMenuId(null);
  };

  const handleUploadClick = (e) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (e) => {
    const uploaded = Array.from(e.target.files || []);
    if (!uploaded.length || !projectId) return;

    setUploading(true);
    try {
      for (const f of uploaded) {
        await projectsService.uploadDocument(projectId, f);
      }
      onToast?.(`Uploaded and analyzed ${uploaded.length} file(s) successfully`);
      loadDocuments();
    } catch (err) {
      onToast?.(err?.message || 'Failed to upload document');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handlePreview = (file, e) => {
    e?.stopPropagation();
    setActiveMenuId(null);
    setPreviewFile(file);
  };

  const handleInspectRequirements = (file, e) => {
    e?.stopPropagation();
    setActiveMenuId(null);
    setInspectDoc(file);
  };

  const handleDownload = async (file, e) => {
    e?.stopPropagation();
    setActiveMenuId(null);
    if (!projectId) return;
    try {
      onToast?.(`Downloading ${file.name}...`);
      await projectsService.downloadDocument(projectId, file.id, file.name);
    } catch (err) {
      onToast?.(err?.message || 'Failed to download document');
    }
  };

  const handleStartRename = (file, e) => {
    e?.stopPropagation();
    setActiveMenuId(null);
    setRenameFile(file);
    setNewName(file.name);
  };

  const handleConfirmRename = async () => {
    if (!newName.trim() || !renameFile || !projectId) return;
    const trimmed = newName.trim();
    try {
      await projectsService.updateDocument(projectId, renameFile.id, { name: trimmed });
      setFiles((prev) =>
        prev.map((f) => (f.id === renameFile.id ? { ...f, name: trimmed } : f))
      );
      onToast?.(`Renamed to "${trimmed}"`);
    } catch (err) {
      onToast?.(err?.message || 'Failed to rename document');
    } finally {
      setRenameFile(null);
      setNewName('');
    }
  };

  const handleDelete = async (file, e) => {
    e?.stopPropagation();
    setActiveMenuId(null);
    if (!projectId) return;
    try {
      await projectsService.deleteDocument(projectId, file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      onToast?.(`Deleted "${file.name}"`);
    } catch (err) {
      onToast?.(err?.message || 'Failed to delete document');
    }
  };

  const toggleMenu = (fileId, e) => {
    e.stopPropagation();
    setActiveMenuId((prev) => (prev === fileId ? null : fileId));
  };

  const getFileBadgeColor = (type) => {
    switch (type.toLowerCase()) {
      case 'pdf':
        return 'bg-rose-50 text-rose-600 border-rose-200';
      case 'xlsx':
      case 'xls':
      case 'csv':
        return 'bg-emerald-50 text-emerald-600 border-emerald-200';
      case 'docx':
      case 'doc':
        return 'bg-blue-50 text-blue-600 border-blue-200';
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'webp':
      case 'gif':
      case 'svg':
        return 'bg-purple-50 text-purple-600 border-purple-200';
      case 'md':
      case 'markdown':
      case 'brd':
      case 'txt':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Completed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-300';
      case 'In Progress':
        return 'bg-purple-50 text-purple-700 border-purple-300';
      case 'Pending':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Analysis required':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Not trackable':
      default:
        return 'bg-slate-100 text-slate-500 border-slate-200';
    }
  };

  return (
    <div className="mt-6 pt-6 border-t border-slate-100" onClick={handleContainerClick}>
      {/* SECTION HEADER & UPLOAD BUTTON */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Folder className="w-4 h-4 text-purple-600 shrink-0" />
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Project Files
          </h3>
          <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            {files.length}
          </span>
        </div>

        {/* Actions: View All & Upload */}
        <div className="flex items-center gap-2">
          {files.length > 3 && (
            <button
              type="button"
              onClick={() => setIsAllFilesOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors cursor-pointer shadow-2xs"
            >
              <span>View All ({files.length})</span>
            </button>
          )}

          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              multiple
              className="hidden"
            />
            {!readOnly && (
              <button
                type="button"
                onClick={handleUploadClick}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-2xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {uploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <UploadCloud className="w-3.5 h-3.5" />
                )}
                <span>{uploading ? 'Analyzing...' : 'Upload File'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* OVERALL DOCUMENT IMPLEMENTATION PROGRESS TRACKER */}
      {files.length > 0 && (
        <div className="mb-5 p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Overall Document Implementation Progress
              </span>
            </div>
            
            {/* Document summary stats */}
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold border border-emerald-200/70">
                {progressMetrics.completedDocs} Completed
              </span>
              <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-bold border border-purple-200/70">
                {progressMetrics.inProgressDocs} In Progress
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700 font-bold border border-slate-300">
                {progressMetrics.pendingDocs} Pending
              </span>
            </div>
          </div>

          {/* Main Progress Bar */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
              <span className="text-slate-500 text-[11px]">
                {progressMetrics.totalRequirementsAcrossProject > 0 ? (
                  <>
                    Tracking <strong>{progressMetrics.completedRequirementsAcrossProject}</strong> of{' '}
                    <strong>{progressMetrics.totalRequirementsAcrossProject}</strong> verified requirements across{' '}
                    <strong>{progressMetrics.eligibleCount}</strong> eligible documents
                  </>
                ) : (
                  <>Upload BRD, Markdown, PDF, or DOCX specifications to auto-track requirements</>
                )}
              </span>
              <span className="text-purple-700 font-extrabold text-sm">
                {progressMetrics.overallProgress}%
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden shadow-inner">
              <div
                className="h-full rounded-full bg-purple-600 transition-all duration-500"
                style={{ width: `${progressMetrics.overallProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Files Grid / Empty State */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-8 bg-slate-50/50 rounded-xl border border-slate-100 text-slate-400">
          <Loader2 className="w-6 h-6 text-purple-600 animate-spin mb-2" />
          <span className="text-xs font-medium">Loading project files & requirements...</span>
        </div>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 bg-slate-50/40 rounded-xl border border-dashed border-slate-200 text-center">
          <FileQuestion className="w-8 h-8 text-slate-300 mb-2" />
          <h4 className="text-xs font-bold text-slate-700">No project documents yet</h4>
          <p className="text-[11px] text-slate-400 max-w-sm mt-0.5 mb-3">
            Upload BRD, specifications, PDF, DOCX, or Markdown files to track implementation progress.
          </p>
          <button
            type="button"
            onClick={handleUploadClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors cursor-pointer"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Upload First File</span>
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {files.slice(0, 3).map((file) => (
            <div
              key={file.id}
              onClick={(e) => handleInspectRequirements(file, e)}
              className="group bg-white rounded-xl border border-slate-200 hover:border-purple-300 hover:shadow-xs transition-all overflow-hidden flex flex-col justify-between cursor-pointer relative"
            >
              {/* Card Top: Image Thumbnail OR File Icon Header */}
              {file.isImage ? (
                <ImageThumbnail projectId={projectId} fileId={file.id} alt={file.name} />
              ) : (
                <div className="p-3 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                    {file.type === 'pdf' && <FileText className="w-5 h-5 text-rose-600" />}
                    {['xlsx', 'xls', 'csv'].includes(file.type) && <FileSpreadsheet className="w-5 h-5 text-emerald-600" />}
                    {['docx', 'doc'].includes(file.type) && <FileText className="w-5 h-5 text-blue-600" />}
                    {['md', 'markdown', 'brd', 'txt'].includes(file.type) && <FileText className="w-5 h-5 text-amber-600" />}
                    {!['pdf', 'xlsx', 'xls', 'csv', 'docx', 'doc', 'md', 'markdown', 'brd', 'txt'].includes(file.type) && (
                      <FileText className="w-5 h-5 text-slate-500" />
                    )}
                  </div>
                  
                  {/* Status Badge */}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getStatusBadge(file.implementationStatus)}`}>
                    {file.implementationStatus}
                  </span>
                </div>
              )}

              {/* Card Info & Dynamic Progress Tracker */}
              <div className="p-3 space-y-2">
                {renameFile?.id === file.id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleConfirmRename();
                        if (e.key === 'Escape') setRenameFile(null);
                      }}
                      className="flex-1 px-1.5 py-0.5 text-xs border border-purple-400 rounded focus:outline-hidden"
                      autoFocus
                    />
                    <button
                      onClick={handleConfirmRename}
                      className="p-1 rounded hover:bg-emerald-50 text-emerald-600"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setRenameFile(null)}
                      className="p-1 rounded hover:bg-rose-50 text-rose-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <h4 className="text-xs font-bold text-slate-800 truncate" title={file.name}>
                    {file.name}
                  </h4>
                )}

                {/* Progress Bar (Only when actionable requirements exist) */}
                {file.progressPct !== null ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-400 font-medium">Implementation</span>
                      <span className="font-bold text-purple-700">{file.progressPct}% ({file.completedReqs}/{file.totalReqs})</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-purple-600 transition-all duration-300"
                        style={{ width: `${file.progressPct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-400 font-medium italic">
                    {file.isDocTrackable ? '0 actionable items detected' : 'Non-trackable asset'}
                  </div>
                )}

                {/* Current Activity Snippet */}
                {file.currentActivity && (
                  <div className="pt-1.5 border-t border-slate-100 flex items-center gap-1.5 text-[10px] text-purple-700 font-medium">
                    <Activity className="w-3 h-3 text-purple-600 shrink-0" />
                    <span className="truncate" title={file.currentActivity}>
                      {file.currentActivity}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                  <span>{file.uploadedAt}</span>
                  <span className="font-mono uppercase px-1.5 py-0.2 rounded bg-slate-50 border border-slate-200">
                    {file.type}
                  </span>
                </div>
              </div>

              {/* Action Dropdown Menu Trigger */}
              <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={(e) => toggleMenu(file.id, e)}
                  className="p-1 rounded-md bg-white/80 hover:bg-white text-slate-500 hover:text-slate-800 shadow-2xs border border-slate-200 transition-colors"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>

                {/* Dropdown Popover */}
                {activeMenuId === file.id && (
                  <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-20 animate-in fade-in zoom-in-95">
                    <button
                      onClick={(e) => handleInspectRequirements(file, e)}
                      className="w-full px-3 py-1.5 text-left text-xs text-purple-700 hover:bg-purple-50 flex items-center gap-2 font-semibold"
                    >
                      <Layers className="w-3.5 h-3.5 text-purple-600" />
                      <span>Track Requirements</span>
                    </button>
                    <button
                      onClick={(e) => handlePreview(file, e)}
                      className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-400" />
                      <span>Preview File</span>
                    </button>
                    <button
                      onClick={(e) => handleDownload(file, e)}
                      className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-400" />
                      <span>Download</span>
                    </button>
                    {!readOnly && (
                      <>
                        <button
                          onClick={(e) => handleStartRename(file, e)}
                          className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                        >
                          <Pencil className="w-3.5 h-3.5 text-slate-400" />
                          <span>Rename</span>
                        </button>
                        <div className="border-t border-slate-100 my-0.5" />
                        <button
                          onClick={(e) => handleDelete(file, e)}
                          className="w-full px-3 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          <span>Delete</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Prompt if more than 3 files */}
        {files.length > 3 && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing first <strong className="text-slate-700 font-semibold">3</strong> of <strong className="text-slate-700 font-semibold">{files.length}</strong> project files
            </span>
            <button
              type="button"
              onClick={() => setIsAllFilesOpen(true)}
              className="font-bold text-purple-600 hover:text-purple-700 hover:underline cursor-pointer inline-flex items-center gap-1"
            >
              Show all {files.length} files &rarr;
            </button>
          </div>
        )}
      </>
      )}

      {/* Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          projectId={projectId}
          onClose={() => setPreviewFile(null)}
          onDownload={(f) => handleDownload(f)}
        />
      )}

      {/* Dynamic Requirements Breakdown Modal */}
      {inspectDoc && (
        <DocumentRequirementsModal
          isOpen={Boolean(inspectDoc)}
          onClose={() => setInspectDoc(null)}
          document={inspectDoc}
          projectId={projectId}
          onRequirementUpdated={loadDocuments}
          onToast={onToast}
        />
      )}

      {/* All Project Files Modal */}
      <AllProjectFilesModal
        isOpen={isAllFilesOpen}
        onClose={() => setIsAllFilesOpen(false)}
        files={files}
        projectName={projectName}
        projectId={projectId}
        onPreview={(file) => handlePreview(file)}
        onDownload={(file) => handleDownload(file)}
        onInspectRequirements={(file) => handleInspectRequirements(file)}
      />
    </div>
  );
}
