import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { projectsService } from '../../../services/projects.service';
import { 
  Folder, 
  FileText, 
  FileSpreadsheet, 
  Image as ImageIcon, 
  MoreVertical, 
  Eye, 
  Download, 
  Pencil, 
  Trash2, 
  Check, 
  X,
  UploadCloud,
  Loader2, 
  FileQuestion,
  AlertTriangle,
  AlertCircle
} from 'lucide-react';
import FilePreviewModal from './FilePreviewModal';
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

export default function ProjectFilesSection({ projectId, projectName = '', onToast, readOnly = false, className = '' }) {
  const [files, setFiles] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [renameFile, setRenameFile] = useState(null);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isAllFilesOpen, setIsAllFilesOpen] = useState(false);
  const [deleteModalFile, setDeleteModalFile] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const fileInputRef = useRef(null);

  const formatDoc = (d) => {
    const ext = d.document_type || (d.name ? d.name.split('.').pop().toLowerCase() : 'pdf');
    const isImg = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext);

    return {
      id: d.id,
      name: d.name,
      type: ext,
      size: d.storage_key ? d.storage_key.split('/').pop() : 'Document',
      uploadedAt: d.created_at ? new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently',
      isImage: isImg,
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

  // Close open dropdowns when clicking outside
  useEffect(() => {
    if (!activeMenuId) return;
    const handleClickOutside = () => setActiveMenuId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeMenuId]);

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
      onToast?.(`Uploaded ${uploaded.length} file(s) successfully`);
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

  const handlePromptDelete = (file, e) => {
    e?.stopPropagation();
    setActiveMenuId(null);
    setDeleteError('');
    setDeleteModalFile(file);
  };

  const handleCloseDeleteModal = () => {
    if (isDeleting) return;
    setDeleteModalFile(null);
    setDeleteError('');
  };

  const handleConfirmDelete = async () => {
    if (!deleteModalFile || !projectId || isDeleting) return;

    setIsDeleting(true);
    setDeleteError('');

    try {
      await projectsService.deleteDocument(projectId, deleteModalFile.id);
      onToast?.(`File "${deleteModalFile.name}" deleted successfully`);
      setDeleteModalFile(null);
      loadDocuments();
    } catch (err) {
      console.error('Failed to delete file:', err);
      const errMsg = err?.message || 'Failed to delete file. Please check permissions and try again.';
      setDeleteError(errMsg);
      onToast?.(errMsg);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleMenu = (fileId, e) => {
    e.stopPropagation();
    setActiveMenuId((prev) => (prev === fileId ? null : fileId));
  };

  return (
    <div className={`mt-6 pt-6 border-t border-slate-100 ${className}`}>
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
              onChange={(e) => { void handleFileInputChange(e); }}
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
                <span>{uploading ? 'Uploading...' : 'Upload File'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Files Grid / Empty State */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-8 bg-slate-50/50 rounded-xl border border-slate-100 text-slate-400">
          <Loader2 className="w-6 h-6 text-purple-600 animate-spin mb-2" />
          <span className="text-xs font-medium">Loading project files...</span>
        </div>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 bg-slate-50/40 rounded-xl border border-dashed border-slate-200 text-center">
          <FileQuestion className="w-8 h-8 text-slate-300 mb-2" />
          <h4 className="text-xs font-bold text-slate-700">No project documents yet</h4>
          <p className="text-[11px] text-slate-400 max-w-sm mt-0.5 mb-3">
            Upload project documentation, specifications, images, or spreadsheets.
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
              className="group bg-white rounded-xl border border-slate-200 hover:border-purple-300 hover:shadow-xs transition-all overflow-hidden flex flex-col justify-between relative"
            >
              {/* Card Top: Image Thumbnail OR File Icon Header */}
              {file.isImage ? (
                <ImageThumbnail projectId={projectId} fileId={file.id} alt={file.name} />
              ) : (
                <div className="p-3 bg-slate-50/70 border-b border-slate-100 flex items-center">
                  <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                    {file.type === 'pdf' && <FileText className="w-5 h-5 text-rose-600" />}
                    {['xlsx', 'xls', 'csv'].includes(file.type) && <FileSpreadsheet className="w-5 h-5 text-emerald-600" />}
                    {['docx', 'doc'].includes(file.type) && <FileText className="w-5 h-5 text-blue-600" />}
                    {['md', 'markdown', 'brd', 'txt'].includes(file.type) && <FileText className="w-5 h-5 text-amber-600" />}
                    {!['pdf', 'xlsx', 'xls', 'csv', 'docx', 'doc', 'md', 'markdown', 'brd', 'txt'].includes(file.type) && (
                      <FileText className="w-5 h-5 text-slate-500" />
                    )}
                  </div>
                </div>
              )}

              {/* Card Info */}
              <div className="p-3 space-y-2">
                {renameFile?.id === file.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleConfirmRename();
                        if (e.key === 'Escape') setRenameFile(null);
                      }}
                      className="flex-1 px-1.5 py-0.5 text-xs border border-purple-400 rounded focus:outline-hidden"
                    />
                    <button
                      onClick={() => { void handleConfirmRename(); }}
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

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                  <span>{file.uploadedAt}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => handlePreview(file, e)}
                      className="text-purple-600 hover:text-purple-700 font-medium hover:underline text-[11px]"
                    >
                      Preview
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={(e) => { void handleDownload(file, e); }}
                      className="text-slate-500 hover:text-slate-700 font-medium hover:underline text-[11px]"
                    >
                      Download
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Dropdown Menu Trigger */}
              <div className="absolute top-2 right-2">
                <button
                  type="button"
                  onClick={(e) => toggleMenu(file.id, e)}
                  className="p-1 rounded-md bg-white/80 hover:bg-white text-slate-500 hover:text-slate-800 shadow-2xs border border-slate-200 transition-colors cursor-pointer"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>

                {/* Dropdown Popover */}
                {activeMenuId === file.id && (
                  <div className="absolute right-0 mt-1 w-36 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-20 animate-in fade-in zoom-in-95">
                    <button
                      onClick={(e) => handlePreview(file, e)}
                      className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-400" />
                      <span>Preview</span>
                    </button>
                    <button
                      onClick={(e) => handleDownload(file, e)}
                      className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-400" />
                      <span>Download</span>
                    </button>
                    {!readOnly && (
                      <>
                        <button
                          onClick={(e) => handleStartRename(file, e)}
                          className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5 text-slate-400" />
                          <span>Rename</span>
                        </button>
                        <div className="border-t border-slate-100 my-0.5" />
                        <button
                          onClick={(e) => handlePromptDelete(file, e)}
                          className="w-full px-3 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
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
          onDownload={(f) => { void handleDownload(f); }}
        />
      )}

      {/* All Project Files Modal */}
      <AllProjectFilesModal
        isOpen={isAllFilesOpen}
        onClose={() => setIsAllFilesOpen(false)}
        files={files}
        projectName={projectName}
        projectId={projectId}
        readOnly={readOnly}
        onPreview={(file) => handlePreview(file)}
        onDownload={(file) => { void handleDownload(file); }}
        onDelete={(file) => handlePromptDelete(file)}
      />

      {/* Delete Confirmation Modal */}
      {deleteModalFile && typeof document !== 'undefined' && createPortal(
        <div
          role="button"
          tabIndex={0} 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) {
              handleCloseDeleteModal();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              if (e.target === e.currentTarget && !isDeleting) {
              handleCloseDeleteModal();
            }
          }
          }}
        >
          <div 
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shadow-xs">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Delete Project File
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Permanently delete this document
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseDeleteModal}
                disabled={isDeleting}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              {deleteError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{deleteError}</span>
                </div>
              )}

              {/* Target File Card */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs shrink-0">
                  <FileText className="w-4 h-4 text-slate-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900 truncate" title={deleteModalFile.name}>
                    {deleteModalFile.name}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {deleteModalFile.size || 'Document'} · {deleteModalFile.uploadedAt || 'Uploaded file'}
                  </p>
                </div>
              </div>

              {/* Warning */}
              <div className="p-3.5 bg-rose-50/70 border border-rose-200/80 rounded-xl text-rose-900 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed">
                  Are you sure you want to delete <strong className="font-semibold text-rose-950">{deleteModalFile.name}</strong>? This action cannot be undone and will permanently remove the file from storage.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleCloseDeleteModal}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-40 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void handleConfirmDelete(); }}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete File</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
