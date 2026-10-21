import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Search, 
  Folder, 
  FileText, 
  FileSpreadsheet, 
  Image as ImageIcon,
  Download, 
  Eye, 
  Trash2,
  Loader2 
} from 'lucide-react';

export default function AllProjectFilesModal({
  isOpen,
  onClose,
  files = [],
  projectName = '',
  projectId,
  readOnly = false,
  onPreview,
  onDownload,
  onDelete,
}) {
  if (!isOpen) return null;

  const [search, setSearch] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);

  const filteredFiles = useMemo(() => {
    return files.filter((f) => {
      const q = search.toLowerCase();
      const matchName = (f.name || '').toLowerCase().includes(q);
      const matchType = (f.type || '').toLowerCase().includes(q);
      return matchName || matchType;
    });
  }, [files, search]);

  const handleDownloadFile = async (file, e) => {
    e?.stopPropagation();
    try {
      setDownloadingId(file.id);
      await onDownload?.(file);
    } finally {
      setDownloadingId(null);
    }
  };

  const modalContent = (
    <div
      role="button"
      tabIndex={0} 
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.target === e.currentTarget) {
          onClose();
        }
      }
      }}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl h-[580px] max-h-[85vh] flex flex-col overflow-hidden"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
              <Folder className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Project Files & Documentation
                </h3>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                  {files.length} Total
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {projectName ? `${projectName} file repository & specifications` : 'Project file directory'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-3 bg-white border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by filename, extension, or status..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
            />
          </div>
          <div className="text-xs text-slate-500 hidden sm:block">
            Showing <strong>{filteredFiles.length}</strong> of <strong>{files.length}</strong> files
          </div>
        </div>

        {/* Files List Table */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredFiles.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Folder className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-700">No Files Match Search</h4>
              <p className="text-xs text-slate-400 mt-1">
                Try adjusting your search query or uploading new documentation.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50/70 hover:bg-white border border-slate-200/80 hover:border-purple-300 hover:shadow-xs transition-all shadow-2xs group"
                >
                  {/* Left: File icon, name, details */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs shrink-0">
                      {file.type === 'pdf' && <FileText className="w-5 h-5 text-rose-600" />}
                      {['xlsx', 'xls', 'csv'].includes(file.type) && <FileSpreadsheet className="w-5 h-5 text-emerald-600" />}
                      {['docx', 'doc'].includes(file.type) && <FileText className="w-5 h-5 text-blue-600" />}
                      {['md', 'markdown', 'brd', 'txt'].includes(file.type) && <FileText className="w-5 h-5 text-amber-600" />}
                      {file.isImage && <ImageIcon className="w-5 h-5 text-purple-600" />}
                      {!['pdf', 'xlsx', 'xls', 'csv', 'docx', 'doc', 'md', 'markdown', 'brd', 'txt'].includes(file.type) && !file.isImage && (
                        <FileText className="w-5 h-5 text-slate-500" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 truncate" title={file.name}>
                          {file.name}
                        </span>
                        <span className="font-mono text-[9px] uppercase px-1.5 py-0.2 rounded bg-slate-100 border border-slate-200 shrink-0">
                          {file.type}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                        <span>Uploaded {file.uploadedAt}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: 2 Action Buttons (Preview & Download) */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">

                    {/* Option 1: Preview */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPreview?.(file);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition-colors cursor-pointer shadow-2xs hover:border-slate-300"
                      title={`Preview ${file.name}`}
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-500" />
                      <span>Preview</span>
                    </button>

                    {/* Option 2: Download */}
                    <button
                      type="button"
                      onClick={(e) => handleDownloadFile(file, e)}
                      disabled={downloadingId === file.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                      title={`Download ${file.name}`}
                    >
                      {downloadingId === file.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>Download</span>
                    </button>

                    {/* Option 3: Delete */}
                    {!readOnly && onDelete && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(file);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer shadow-2xs"
                        title={`Delete ${file.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing <strong>{filteredFiles.length}</strong> of <strong>{files.length}</strong> documents
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}

