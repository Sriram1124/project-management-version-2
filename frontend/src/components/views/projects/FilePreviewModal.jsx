import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Download, 
  FileText, 
  FileSpreadsheet, 
  Image as ImageIcon, 
  ZoomIn, 
  ZoomOut, 
  Loader2,
  AlertCircle
} from 'lucide-react';
import { projectsService } from '../../../services/projects.service';

export default function FilePreviewModal({ file, projectId, onClose, onDownload }) {
  const [zoomLevel, setZoomLevel] = useState(100);
  const [previewBlobUrl, setPreviewBlobUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let activeUrl = null;

    if (file && projectId && (file.isImage || file.type === 'pdf')) {
      setLoading(true);
      setError(null);
      projectsService.getDocumentBlobUrl(projectId, file.id)
        .then((url) => {
          activeUrl = url;
          setPreviewBlobUrl(url);
        })
        .catch((err) => {
          console.error('Failed to load file preview:', err);
          setError('Failed to load file preview. You can still download the file.');
        })
        .finally(() => setLoading(false));
    } else if (file?.previewUrl) {
      setPreviewBlobUrl(file.previewUrl);
    }

    return () => {
      if (activeUrl) {
        URL.revokeObjectURL(activeUrl);
      }
    };
  }, [file, projectId]);

  if (!file) return null;

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
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const modalContent = (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs shrink-0">
              {file.type === 'pdf' && <FileText className="w-5 h-5 text-rose-600" />}
              {['xlsx', 'xls', 'csv'].includes(file.type) && <FileSpreadsheet className="w-5 h-5 text-emerald-600" />}
              {['docx', 'doc'].includes(file.type) && <FileText className="w-5 h-5 text-blue-600" />}
              {file.isImage && <ImageIcon className="w-5 h-5 text-purple-600" />}
              {!file.isImage && !['pdf', 'xlsx', 'xls', 'csv', 'docx', 'doc'].includes(file.type) && (
                <FileText className="w-5 h-5 text-slate-600" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 truncate" title={file.name}>
                  {file.name}
                </h3>
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${getFileBadgeColor(file.type)}`}>
                  {file.type}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                <span>Uploaded {file.uploadedAt || 'Recently'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              onClick={() => onDownload?.(file)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              title="Download File"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Close Preview (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body Preview Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-100/60 min-h-[380px] max-h-[65vh] flex flex-col items-center justify-center">
          {loading && (
            <div className="flex flex-col items-center justify-center p-12 text-slate-500">
              <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-3" />
              <p className="text-sm font-medium">Loading preview...</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-rose-200 text-center max-w-md">
              <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
              <h4 className="text-sm font-bold text-slate-800">Preview Unavailable</h4>
              <p className="text-xs text-slate-500 mt-1 mb-4">{error}</p>
              <button
                onClick={() => onDownload?.(file)}
                className="px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-semibold hover:bg-purple-700 transition-colors"
              >
                Download File
              </button>
            </div>
          )}

          {/* IMAGE PREVIEW */}
          {!loading && !error && file.isImage && previewBlobUrl && (
            <div className="w-full flex flex-col items-center">
              <div className="mb-3 flex items-center gap-2 bg-white px-3 py-1 rounded-full border border-slate-200 text-xs text-slate-600 shadow-2xs">
                <button 
                  onClick={() => setZoomLevel((z) => Math.max(50, z - 25))}
                  className="hover:text-purple-600 p-0.5 cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] font-semibold w-12 text-center">{zoomLevel}%</span>
                <button 
                  onClick={() => setZoomLevel((z) => Math.min(200, z + 25))}
                  className="hover:text-purple-600 p-0.5 cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs max-w-full overflow-auto flex items-center justify-center">
                <img
                  src={previewBlobUrl}
                  alt={file.name}
                  style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'center center', transition: 'transform 0.15s ease-out' }}
                  className="rounded-lg object-contain max-h-[480px] w-auto max-w-full"
                />
              </div>
            </div>
          )}

          {/* PDF PREVIEW */}
          {!loading && !error && file.type === 'pdf' && previewBlobUrl && (
            <div className="w-full h-full min-h-[450px] bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <iframe
                src={previewBlobUrl}
                title={file.name}
                className="w-full h-full min-h-[450px] border-none"
              />
            </div>
          )}

          {/* NON-PREVIEWABLE FILE TYPES */}
          {!loading && !error && !file.isImage && file.type !== 'pdf' && (
            <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center max-w-md shadow-xs space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
                <FileText className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-800">{file.name}</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Preview is not available for this file type ({file.type?.toUpperCase()}). You can download the full file to view it on your device.
                </p>
              </div>
              <button
                onClick={() => onDownload?.(file)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download File</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
