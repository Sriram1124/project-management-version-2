import React, { useState, useRef } from 'react';
import { 
  X, 
  Upload, 
  Download, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ShieldAlert, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  XCircle,
  FileSpreadsheet,
  Users,
  UserPlus,
  RefreshCw,
  AlertTriangle,
  Copy
} from 'lucide-react';
import { usersService } from '../../services/users.service';

export default function BulkImportModal({ isOpen, onClose, onSuccess }) {
  // Step: 'UPLOAD' | 'PREVIEW' | 'SUCCESS'
  const [step, setStep] = useState('UPLOAD');
  const [selectedFile, setSelectedFile] = useState(null);
  const [csvContent, setCsvContent] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [confirmUpdateExisting, setConfirmUpdateExisting] = useState(false);
  const [previewTab, setPreviewTab] = useState('ALL');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleDownloadTemplate = async () => {
    try {
      const templateContent = await usersService.getBulkTemplate();
      const contentStr = typeof templateContent === 'string' ? templateContent : (templateContent?.data || '');
      const blob = new Blob([contentStr || 'name,email,type,batch,subbatch,cohort\nAlex Morgan,alex.morgan@example.com,INTERN,A,A1,Cohort-1\nJordan Lee,jordan.lee@example.com,EMPLOYEE,,,\n'], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'members_import_template.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      const fallback = 'name,email,type,batch,subbatch,cohort\nAlex Morgan,alex.morgan@example.com,INTERN,A,A1,Cohort-1\nJordan Lee,jordan.lee@example.com,EMPLOYEE,,,\n';
      const blob = new Blob([fallback], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'members_import_template.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        setError('Please select a valid .csv file.');
        return;
      }
      setError('');
      setSelectedFile(file);

      const reader = new FileReader();
      reader.onload = (event) => {
        let content = event.target?.result || '';
        // Strip UTF-8 BOM if present at the start of the file
        if (content.charCodeAt(0) === 0xFEFF) {
          content = content.slice(1);
        }
        setCsvContent(content);
        console.info('[BulkImport] File read successfully:', {
          fileName: file.name,
          sizeBytes: file.size,
          charCount: content.length,
        });
      };
      reader.onerror = (err) => {
        console.error('[BulkImport] FileReader error:', err);
        setError('Failed to read the selected file. Please try again.');
      };
      reader.readAsText(file);
    }
  };

  const handleValidate = async () => {
    if (!csvContent.trim()) {
      setError('Please choose a CSV file with member data.');
      return;
    }

    setIsValidating(true);
    setError('');
    setConfirmUpdateExisting(false);
    setPreviewTab('ALL');

    try {
      console.info('[BulkImport] Sending CSV for validation, length:', csvContent.length);
      const result = await usersService.validateBulkCsv(csvContent);
      console.info('[BulkImport] Validation response:', {
        isValid: result?.isValid,
        summary: result?.summary,
        detectedColumns: result?.detectedColumns,
        errors: result?.errors,
      });

      const totalRows = result?.summary?.total ?? 0;
      // If validation failed at file/header level or no rows could be parsed:
      if (!result || totalRows === 0 || (!result.isValid && (!result.toCreateRows?.length && !result.toUpdateRows?.length && !result.toSkipRows?.length && !result.invalidRows?.length))) {
        const errorMsg = result?.errors?.length > 0
          ? result.errors.join(' ')
          : 'The uploaded CSV file contains no recognizable member records or valid headers. Expected columns: name, email, type.';
        setError(errorMsg);
        // Do not advance to preview with 0 rows
        return;
      }

      setValidationResult(result);
      setStep('PREVIEW');
    } catch (err) {
      console.error('[BulkImport] Validation error:', err);
      setError(err.response?.data?.reason || err.response?.data?.error || err.message || 'Failed to validate CSV file.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleConfirmImport = async () => {
    const toCreate = validationResult?.toCreateRows || [];
    const toUpdate = validationResult?.toUpdateRows || [];
    const toSkip = validationResult?.toSkipRows || [];

    // Candidate rows to submit to backend
    const rowsToSubmit = [
      ...toCreate,
      ...(confirmUpdateExisting ? toUpdate : []),
      ...toSkip,
    ];

    if (rowsToSubmit.length === 0) {
      setError('No candidate rows available to import.');
      return;
    }

    setIsImporting(true);
    setError('');

    try {
      const result = await usersService.confirmBulkImport(rowsToSubmit, confirmUpdateExisting);
      setImportResult(result);
      setStep('SUCCESS');
      onSuccess?.();
    } catch (err) {
      setError(
        err.response?.data?.reason ||
        err.response?.data?.error ||
        err.message ||
        'Bulk import could not be completed.'
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadCredentialsCsv = () => {
    if (!importResult?.created_users || importResult.created_users.length === 0) return;

    const headers = 'name,email,user_code,type,batch,subbatch,temporary_password\n';
    const rows = importResult.created_users.map(
      (u) => `"${u.name}","${u.email}","${u.user_code}","${u.type}","${u.batch || ''}","${u.subbatch || ''}","${u.temporary_password}"`
    ).join('\n');

    const csvData = headers + rows;
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `provisioned_credentials_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadUpdatedCsv = () => {
    if (!importResult?.updated_users || importResult.updated_users.length === 0) return;

    const headers = 'user_code,name,email,batch,subbatch,changes\n';
    const rows = importResult.updated_users.map((u) => {
      const changesStr = Object.entries(u.changes || {})
        .map(([k, v]) => `${k}: ${v.from || 'none'} -> ${v.to || 'none'}`)
        .join('; ');
      return `"${u.user_code}","${u.name}","${u.email}","${u.batch || ''}","${u.subbatch || ''}","${changesStr}"`;
    }).join('\n');

    const csvData = headers + rows;
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `updated_members_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadFailedRowsCsv = () => {
    const failedList = importResult?.failed_rows || validationResult?.invalidRows || [];
    if (failedList.length === 0) return;

    const headers = 'row_number,name,email,error_reason\n';
    const rows = failedList.map((r) => {
      const name = (r.name || '').replace(/"/g, '""');
      const email = (r.email || '').replace(/"/g, '""');
      const reason = (r.reason || '').replace(/"/g, '""');
      return `${r.rowNumber || ''},"${name}","${email}","${reason}"`;
    }).join('\n');

    const csvData = headers + rows;
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `import_failed_rows_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    setStep('UPLOAD');
    setSelectedFile(null);
    setCsvContent('');
    setValidationResult(null);
    setConfirmUpdateExisting(false);
    setPreviewTab('ALL');
    setImportResult(null);
    setError('');
    onClose();
  };

  // Preview category counts
  const toCreateRows = validationResult?.toCreateRows || [];
  const toSkipRows = validationResult?.toSkipRows || [];
  const toUpdateRows = validationResult?.toUpdateRows || [];
  const duplicateInCsvRows = validationResult?.duplicateInCsvRows || [];
  const invalidRows = validationResult?.invalidRows || [];

  const toCreateCount = validationResult?.summary?.to_create ?? toCreateRows.length;
  const toSkipCount = validationResult?.summary?.to_skip ?? toSkipRows.length;
  const toUpdateCount = validationResult?.summary?.to_update ?? toUpdateRows.length;
  const duplicateInCsvCount = validationResult?.summary?.duplicate_in_csv ?? duplicateInCsvRows.length;
  const invalidCount = validationResult?.summary?.invalid ?? invalidRows.length;
  const totalCount = validationResult?.summary?.total ?? (toCreateCount + toSkipCount + toUpdateCount + duplicateInCsvCount + invalidCount);

  const detectedCols = validationResult?.detectedColumns;

  // Total items that will actually be committed to the database
  const effectiveCommitCount = toCreateCount + (confirmUpdateExisting ? toUpdateCount : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 h-auto max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shadow-2xs">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">Bulk Import Members</h2>
              <p className="text-[11px] text-slate-500">Safe, idempotent bulk member provisioning with preview and diff analysis.</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1">
          {error && (
            <div className="mb-3.5 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold block">Import Notice</span>
                <span className="text-[11px] leading-relaxed mt-0.5 block">{error}</span>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* STEP 1: UPLOAD & VALIDATE                                 */}
          {/* ========================================================= */}
          {step === 'UPLOAD' && (
            <div className="space-y-3.5">
              
              {/* Template Download Box */}
              <div className="p-3.5 bg-purple-50/70 rounded-xl border border-purple-100 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span>Database-Aware CSV Template</span>
                  </h4>
                  <p className="text-[11px] text-purple-800/90 mt-0.5 leading-snug">
                    Required: <span className="font-semibold text-purple-950">name, email, type</span> • Optional: <span className="font-semibold text-purple-950">batch, subbatch, cohort</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-3 py-1.5 rounded-lg bg-white border border-purple-200 hover:bg-purple-100 text-xs font-bold text-purple-700 flex items-center gap-1.5 transition-colors shadow-2xs shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Template</span>
                </button>
              </div>

              {/* Upload Dropzone */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 hover:border-purple-400 rounded-xl py-6 px-4 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-purple-50/20"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <FileText className="w-9 h-9 text-purple-500/80 mx-auto mb-2" />
                {selectedFile ? (
                  <div>
                    <span className="text-xs font-bold text-purple-700 block truncate max-w-sm mx-auto">{selectedFile.name}</span>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">{(selectedFile.size / 1024).toFixed(1)} KB • Click to choose a different file</span>
                  </div>
                ) : (
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Click to select CSV file</span>
                    <span className="text-[11px] text-slate-400 mt-0.5 block">Normalized matching: email addresses are matched case-insensitively</span>
                  </div>
                )}
              </div>

              {/* Field Reference Summary */}
              <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80 text-[11px] text-slate-600 space-y-1">
                <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wider pb-1 border-b border-slate-200/60">
                  <span>Safety & Schema Guidelines</span>
                  <span className="text-purple-600 font-bold">Idempotent</span>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 pt-0.5 text-[10.5px]">
                  <div><span className="font-semibold text-slate-700">Type:</span> INTERN or EMPLOYEE</div>
                  <div><span className="font-semibold text-slate-700">Batch:</span> A, B, C, or D</div>
                  <div><span className="font-semibold text-slate-700">Subbatch:</span> A1, A2, B1, B2, etc.</div>
                  <div><span className="font-semibold text-slate-700">Duplicates:</span> Safely skipped without error</div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="pt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedFile || isValidating}
                  onClick={handleValidate}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Validating CSV...
                    </>
                  ) : (
                    <>
                      <span>Inspect & Preview</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* STEP 2: PREVIEW & CATEGORIZATION                          */}
          {/* ========================================================= */}
          {step === 'PREVIEW' && validationResult && (
            <div className="space-y-3.5">
              
              {/* Validation Warning Alert in Preview */}
              {validationResult?.errors?.length > 0 && invalidCount > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold block">Notice: {invalidCount} invalid row{invalidCount > 1 ? 's' : ''} detected</span>
                    <span className="text-[11px] leading-relaxed mt-0.5 block">
                      {invalidCount} row{invalidCount > 1 ? 's' : ''} failed schema validation and will be skipped. You can review them under the <strong className="font-semibold text-red-700">Invalid</strong> tab or download the Failed Rows CSV.
                    </span>
                  </div>
                </div>
              )}

              {/* 5 Distinct Category Stat Tiles */}
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                {/* To Create */}
                <div 
                  onClick={() => setPreviewTab('CREATE')}
                  className={`p-2 rounded-xl border text-center cursor-pointer transition-all ${
                    previewTab === 'CREATE' ? 'ring-2 ring-emerald-500 bg-emerald-50/80 border-emerald-300' : 'bg-emerald-50/40 border-emerald-200/80 hover:bg-emerald-50/70'
                  }`}
                >
                  <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 block truncate">To Create</span>
                  <span className="text-sm sm:text-base font-black text-emerald-800">{toCreateCount}</span>
                </div>

                {/* To Update */}
                <div 
                  onClick={() => setPreviewTab('UPDATE')}
                  className={`p-2 rounded-xl border text-center cursor-pointer transition-all ${
                    previewTab === 'UPDATE' ? 'ring-2 ring-amber-500 bg-amber-50/80 border-amber-300' : 'bg-amber-50/40 border-amber-200/80 hover:bg-amber-50/70'
                  }`}
                >
                  <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 block truncate">To Update</span>
                  <span className="text-sm sm:text-base font-black text-amber-800">{toUpdateCount}</span>
                </div>

                {/* To Skip */}
                <div 
                  onClick={() => setPreviewTab('SKIP')}
                  className={`p-2 rounded-xl border text-center cursor-pointer transition-all ${
                    previewTab === 'SKIP' ? 'ring-2 ring-slate-500 bg-slate-100 border-slate-300' : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/70'
                  }`}
                >
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-600 block truncate">To Skip</span>
                  <span className="text-sm sm:text-base font-black text-slate-800">{toSkipCount}</span>
                </div>

                {/* Duplicates in CSV */}
                <div 
                  onClick={() => setPreviewTab('DUPLICATES')}
                  className={`p-2 rounded-xl border text-center cursor-pointer transition-all ${
                    previewTab === 'DUPLICATES' ? 'ring-2 ring-purple-500 bg-purple-50/80 border-purple-300' : 'bg-purple-50/40 border-purple-200/80 hover:bg-purple-50/70'
                  }`}
                >
                  <span className="text-[9px] font-bold uppercase tracking-wider text-purple-700 block truncate">In-CSV Dups</span>
                  <span className="text-sm sm:text-base font-black text-purple-800">{duplicateInCsvCount}</span>
                </div>

                {/* Invalid / Rejected */}
                <div 
                  onClick={() => setPreviewTab('INVALID')}
                  className={`p-2 rounded-xl border text-center cursor-pointer transition-all ${
                    previewTab === 'INVALID' ? 'ring-2 ring-red-500 bg-red-50/80 border-red-300' : 'bg-red-50/40 border-red-200/80 hover:bg-red-50/70'
                  }`}
                >
                  <span className="text-[9px] font-bold uppercase tracking-wider text-red-700 block truncate">Invalid</span>
                  <span className="text-sm sm:text-base font-black text-red-800">{invalidCount}</span>
                </div>
              </div>

              {/* Explicit Update Confirmation Checkbox (Requirement 3) */}
              {toUpdateCount > 0 && (
                <div className="p-3 bg-amber-50/90 border border-amber-200/90 rounded-xl">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmUpdateExisting}
                      onChange={(e) => setConfirmUpdateExisting(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                    <div className="flex-1">
                      <span className="font-bold text-xs text-amber-950 block">
                        Confirm update to permitted fields (name, batch, subbatch) for {toUpdateCount} existing member{toUpdateCount > 1 ? 's' : ''}
                      </span>
                      <p className="text-[11px] leading-relaxed text-amber-900/90 mt-0.5">
                        Existing passwords, roles, permissions, cohort assignments, and account status will <strong>NOT</strong> be modified. If left unchecked, these members will be safely skipped.
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {/* All identical members notice */}
              {toCreateCount === 0 && toUpdateCount === 0 && toSkipCount > 0 && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2 text-slate-700 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">All CSV members already exist</span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      All {toSkipCount} members in this file have identical records in your organization. Re-running import is safe and will create 0 duplicate accounts.
                    </span>
                  </div>
                </div>
              )}

              {/* Category Segmented Filter Buttons */}
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-1.5">
                <div className="flex items-center gap-1 overflow-x-auto text-[11px] font-semibold text-slate-500">
                  <button
                    type="button"
                    onClick={() => setPreviewTab('ALL')}
                    className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                      previewTab === 'ALL' ? 'bg-slate-800 text-white font-bold' : 'hover:bg-slate-100 text-slate-600'
                    }`}
                  >
                    All ({totalCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('CREATE')}
                    className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                      previewTab === 'CREATE' ? 'bg-emerald-600 text-white font-bold' : 'hover:bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    To Create ({toCreateCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('UPDATE')}
                    className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                      previewTab === 'UPDATE' ? 'bg-amber-600 text-white font-bold' : 'hover:bg-amber-50 text-amber-700'
                    }`}
                  >
                    To Update ({toUpdateCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('SKIP')}
                    className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                      previewTab === 'SKIP' ? 'bg-slate-600 text-white font-bold' : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    To Skip ({toSkipCount})
                  </button>
                  {duplicateInCsvCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setPreviewTab('DUPLICATES')}
                      className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                        previewTab === 'DUPLICATES' ? 'bg-purple-600 text-white font-bold' : 'hover:bg-purple-50 text-purple-700'
                      }`}
                    >
                      Dups ({duplicateInCsvCount})
                    </button>
                  )}
                  {invalidCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setPreviewTab('INVALID')}
                      className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                        previewTab === 'INVALID' ? 'bg-red-600 text-white font-bold' : 'hover:bg-red-50 text-red-700'
                      }`}
                    >
                      Invalid ({invalidCount})
                    </button>
                  )}
                </div>

                {invalidCount > 0 && (
                  <button
                    type="button"
                    onClick={handleDownloadFailedRowsCsv}
                    className="text-[10px] font-bold text-red-700 hover:text-red-900 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                  >
                    <Download className="w-3 h-3" />
                    Failed Rows CSV
                  </button>
                )}
              </div>

              {/* Rows List / Detail Table */}
              <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[9px] sticky top-0">
                    <tr>
                      <th className="py-1.5 px-2.5">Member Details</th>
                      <th className="py-1.5 px-2">Type</th>
                      <th className="py-1.5 px-2">Batch / Sub</th>
                      <th className="py-1.5 px-2 text-right">Status / Diff</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11px]">
                    {/* Rows to Create */}
                    {(previewTab === 'ALL' || previewTab === 'CREATE') && toCreateRows.map((r, i) => (
                      <tr key={`create-${i}`} className="hover:bg-slate-50/60">
                        <td className="py-1.5 px-2.5">
                          <span className="font-semibold text-slate-900 block truncate max-w-xs">{r.name}</span>
                          <span className="font-mono text-[10px] text-slate-500 block truncate max-w-xs">{r.email}</span>
                        </td>
                        <td className="py-1.5 px-2">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            r.type === 'INTERN' ? 'bg-purple-100 text-purple-700' : 'bg-indigo-100 text-indigo-700'
                          }`}>
                            {r.type}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 font-mono text-[10px] text-slate-600">
                          {r.batch ? `${r.batch} / ${r.subbatch || '—'}` : '—'}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[9px]">
                            <UserPlus className="w-2.5 h-2.5" />
                            To Create
                          </span>
                        </td>
                      </tr>
                    ))}

                    {/* Rows to Update */}
                    {(previewTab === 'ALL' || previewTab === 'UPDATE') && toUpdateRows.map((r, i) => (
                      <tr key={`update-${i}`} className="hover:bg-amber-50/30 bg-amber-50/15">
                        <td className="py-1.5 px-2.5">
                          <span className="font-semibold text-slate-900 block truncate max-w-xs">
                            {r.name} <span className="font-mono text-[9px] text-slate-400">({r.existingUserCode})</span>
                          </span>
                          <span className="font-mono text-[10px] text-slate-500 block truncate max-w-xs">{r.email}</span>
                        </td>
                        <td className="py-1.5 px-2">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800">
                            {r.type}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 font-mono text-[10px] text-slate-600">
                          {r.batch ? `${r.batch} / ${r.subbatch || '—'}` : '—'}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <div className="space-y-0.5">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold text-[9px] ${
                              confirmUpdateExisting ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              <RefreshCw className="w-2.5 h-2.5" />
                              {confirmUpdateExisting ? 'Will Update' : 'Update (Unconfirmed)'}
                            </span>
                            <div className="text-[9px] text-slate-500 font-mono">
                              {Object.entries(r.changes || {}).map(([field, diff]) => (
                                <span key={field} className="block">
                                  {field}: {diff.from || '—'} → <strong className="text-amber-800">{diff.to || '—'}</strong>
                                </span>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {/* Rows to Skip */}
                    {(previewTab === 'ALL' || previewTab === 'SKIP') && toSkipRows.map((r, i) => (
                      <tr key={`skip-${i}`} className="hover:bg-slate-50/60 opacity-80">
                        <td className="py-1.5 px-2.5">
                          <span className="font-medium text-slate-700 block truncate max-w-xs">{r.name}</span>
                          <span className="font-mono text-[10px] text-slate-400 block truncate max-w-xs">{r.email}</span>
                        </td>
                        <td className="py-1.5 px-2 text-[10px] text-slate-500">
                          {r.type}
                        </td>
                        <td className="py-1.5 px-2 font-mono text-[10px] text-slate-500">
                          {r.batch ? `${r.batch} / ${r.subbatch || '—'}` : '—'}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium text-[9px]">
                            {r.reason?.includes('Inactive') ? 'Inactive (Skip)' : 'Identical (Skip)'}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {/* Duplicates in CSV */}
                    {(previewTab === 'ALL' || previewTab === 'DUPLICATES') && duplicateInCsvRows.map((r, i) => (
                      <tr key={`dup-${i}`} className="hover:bg-purple-50/30 bg-purple-50/15">
                        <td className="py-1.5 px-2.5">
                          <span className="font-medium text-slate-800 block truncate max-w-xs">{r.name}</span>
                          <span className="font-mono text-[10px] text-slate-500 block truncate max-w-xs">{r.email}</span>
                        </td>
                        <td className="py-1.5 px-2 text-[10px] text-purple-700 font-semibold">
                          Row {r.rowNumber}
                        </td>
                        <td className="py-1.5 px-2 font-mono text-[10px] text-slate-500">
                          dup of r{r.originalRowNumber}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-800 font-bold text-[9px]">
                            <Copy className="w-2.5 h-2.5" />
                            CSV Duplicate
                          </span>
                        </td>
                      </tr>
                    ))}

                    {/* Invalid Rows */}
                    {(previewTab === 'ALL' || previewTab === 'INVALID') && invalidRows.map((r, i) => (
                      <tr key={`inv-${i}`} className="hover:bg-red-50/30 bg-red-50/15">
                        <td className="py-1.5 px-2.5">
                          <span className="font-medium text-red-900 block truncate max-w-xs">{r.name || 'Unnamed'}</span>
                          <span className="font-mono text-[10px] text-red-600 block truncate max-w-xs">{r.email}</span>
                        </td>
                        <td className="py-1.5 px-2 text-[10px] text-red-700 font-bold">
                          Row {r.rowNumber}
                        </td>
                        <td className="py-1.5 px-2 font-mono text-[10px] text-red-600">
                          {r.batch || '—'}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-100 text-red-800 font-bold text-[9px]">
                            ❌ {r.reason}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Actions Footer */}
              <div className="pt-1 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setStep('UPLOAD')}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Upload Again</span>
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isImporting || (toCreateCount === 0 && (!confirmUpdateExisting || toUpdateCount === 0) && toSkipCount === 0)}
                    onClick={handleConfirmImport}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Processing Import...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>
                          {toCreateCount > 0 && confirmUpdateExisting && toUpdateCount > 0
                            ? `Confirm Import (${toCreateCount} create, ${toUpdateCount} update)`
                            : toCreateCount > 0
                            ? `Confirm Import (${toCreateCount} to create)`
                            : confirmUpdateExisting && toUpdateCount > 0
                            ? `Confirm Import (${toUpdateCount} to update)`
                            : `Run Idempotent Import (${toSkipCount} skipped)`}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* STEP 3: SUCCESS RESULT & SUMMARY                          */}
          {/* ========================================================= */}
          {step === 'SUCCESS' && importResult && (
            <div className="space-y-4 text-center py-1">
              <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-2xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Bulk Import Completed Successfully
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Processed import with full transactional integrity and duplicate protection.
                </p>
              </div>

              {/* 4 Summary KPI Tiles (Requirement 5) */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 block">Created</span>
                  <span className="text-base font-black text-emerald-900">{importResult.summary?.created ?? 0}</span>
                </div>
                <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 block">Updated</span>
                  <span className="text-base font-black text-amber-900">{importResult.summary?.updated ?? 0}</span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-600 block">Skipped</span>
                  <span className="text-base font-black text-slate-900">{importResult.summary?.skipped ?? 0}</span>
                </div>
                <div className="p-2.5 bg-red-50 rounded-xl border border-red-200">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-red-700 block">Failed</span>
                  <span className="text-base font-black text-red-900">{importResult.summary?.failed ?? 0}</span>
                </div>
              </div>

              {/* Notice regarding credentials */}
              {importResult.summary?.created > 0 && (
                <div className="p-3 bg-amber-50/90 border border-amber-200/90 rounded-xl text-left text-amber-900 text-xs flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold text-amber-950 text-xs">Download Generated Credentials</p>
                    <p className="text-[11px] leading-relaxed text-amber-900/90">
                      Temporary passwords and User IDs were generated for newly created members. <strong>These credentials cannot be retrieved after closing this window.</strong>
                    </p>
                  </div>
                </div>
              )}

              {/* Download Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {importResult.summary?.created > 0 && (
                  <button
                    type="button"
                    onClick={handleDownloadCredentialsCsv}
                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Credentials CSV</span>
                  </button>
                )}
                {importResult.summary?.updated > 0 && (
                  <button
                    type="button"
                    onClick={handleDownloadUpdatedCsv}
                    className="px-3.5 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Updated Members</span>
                  </button>
                )}
                {(importResult.summary?.failed > 0 || invalidCount > 0) && (
                  <button
                    type="button"
                    onClick={handleDownloadFailedRowsCsv}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Failed Rows</span>
                  </button>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
