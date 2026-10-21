import React, { useState, useRef } from 'react';
import { 
  X, 
  UploadCloud, 
  FileText, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  Copy, 
  Check, 
  Loader2,
  Building2,
  Users
} from 'lucide-react';
import { organizationService } from '../../../services/organization.service';

export default function BulkImportManagersModal({ isOpen, organization, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [csvContent, setCsvContent] = useState('');
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [error, setError] = useState('');

  // Execution state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef(null);

  if (!isOpen || !organization) return null;

  const handleDownloadTemplate = async () => {
    try {
      await organizationService.downloadManagerTemplate(organization.id);
    } catch (e) {
      // Fallback client-side CSV download
      const csv = 'name,email\nJohn Doe,john.doe@example.com\nJane Smith,jane.smith@example.com\n';
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'manager-import-template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!selected.name.endsWith('.csv') && selected.type !== 'text/csv') {
      setError('Please select a valid CSV (.csv) file');
      return;
    }

    setError('');
    setFile(selected);
    setValidationResult(null);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result;
      if (typeof text === 'string') {
        setCsvContent(text);
        await validateCsv(text);
      }
    };
    reader.readAsText(selected);
  };

  const validateCsv = async (text) => {
    try {
      setValidating(true);
      setError('');
      const res = await organizationService.validateManagerCsv(organization.id, text);
      setValidationResult(res);
    } catch (err) {
      setError(err.message || 'Failed to validate CSV');
    } finally {
      setValidating(false);
    }
  };

  const handleImport = async () => {
    if (!validationResult || validationResult.validRows.length === 0) return;

    try {
      setImporting(true);
      setError('');
      const res = await organizationService.importManagersBulk(
        organization.id,
        validationResult.validRows
      );
      setImportResult(res);
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to import managers');
    } finally {
      setImporting(false);
    }
  };

  const handleCopyCredentials = async () => {
    if (!importResult?.createdManagers) return;
    const lines = [
      `Organization: ${organization.name}`,
      `Generated Credentials (${importResult.createdManagers.length} managers):`,
      '--------------------------------------------------',
      ...importResult.createdManagers.map(
        (m) => `Name: ${m.name} | Email: ${m.email} | User Code: ${m.user_code || 'N/A'} | Temporary Password: ${m.temporary_password}`
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy credentials to clipboard:', err);
    }
  };

  const handleDownloadCredentialsCsv = () => {
    if (!importResult?.createdManagers) return;
    const header = 'Name,Email,User Code,Temporary Password\n';
    const rows = importResult.createdManagers
      .map((m) => `"${m.name}","${m.email}","${m.user_code || ''}","${m.temporary_password}"`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${organization.name.replace(/\s+/g, '_')}_managers_credentials.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Bulk Import Managers</h3>
              <p className="text-[11px] text-slate-500">
                Organization: <span className="font-semibold text-slate-700">{organization.name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Screen 1: Finished Result Screen */}
          {importResult ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <p className="font-bold text-amber-800">One-Time Manager Credentials</p>
                  <p className="text-amber-700 mt-0.5">
                    Temporary passwords will <span className="font-semibold underline">not be displayed again</span>. Please copy or download them now and distribute them securely.
                  </p>
                </div>
              </div>

              {/* Summary Badges */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Total Rows</span>
                  <p className="text-base font-black text-slate-800">{importResult.summary.total}</p>
                </div>
                <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-100">
                  <span className="text-[10px] text-emerald-600 uppercase font-bold">Created</span>
                  <p className="text-base font-black text-emerald-700">{importResult.summary.created}</p>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Skipped</span>
                  <p className="text-base font-black text-slate-600">{importResult.summary.skipped}</p>
                </div>
              </div>

              {/* Table of created credentials */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500">
                      <tr>
                        <th className="py-2 px-3">Manager</th>
                        <th className="py-2 px-3">Email</th>
                        <th className="py-2 px-3">Temporary Password</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {importResult.createdManagers.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 font-sans font-semibold text-slate-800">{m.name}</td>
                          <td className="py-2 px-3 text-purple-700">{m.email}</td>
                          <td className="py-2 px-3 font-bold text-rose-600">{m.temporary_password}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyCredentials}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        <span>Copy All</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleDownloadCredentialsCsv}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Download CSV</span>
                  </button>
                </div>

                <button
                  onClick={onClose}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* Screen 2: Upload and Preview Step */
            <div className="space-y-4">
              {/* Instructions and Download Template */}
              <div className="flex items-center justify-between p-3.5 bg-purple-50/50 rounded-xl border border-purple-100">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-600 shrink-0" />
                  <span className="text-xs text-purple-900 font-medium">
                    CSV format must have columns: <code className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-purple-200 text-purple-800">name,email</code>
                  </span>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  type="button"
                  className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-purple-100/60 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Sample CSV</span>
                </button>
              </div>

              {/* Upload Zone */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-200 hover:border-purple-400 hover:bg-purple-50/20 rounded-2xl p-6 text-center cursor-pointer transition-all"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">
                  {file ? file.name : 'Click or drop a CSV file to upload'}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">Maximum 100 managers per bulk batch</p>
              </button>

              {/* Validating indicator */}
              {validating && (
                <div className="p-4 text-center text-slate-500 flex items-center justify-center gap-2 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                  <span>Validating CSV structure and checking for duplicates...</span>
                </div>
              )}

              {/* Validation Preview */}
              {validationResult && !validating && (
                <div className="space-y-3 pt-2">
                  {/* Summary badges */}
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700">
                      Total: {validationResult.summary.total}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Valid: {validationResult.summary.valid}
                    </span>
                    {validationResult.summary.invalid > 0 && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        Invalid: {validationResult.summary.invalid}
                      </span>
                    )}
                  </div>

                  {/* Invalid Rows alert if any */}
                  {validationResult.invalidRows.length > 0 && (
                    <div className="border border-rose-200 rounded-xl p-3 bg-rose-50/50 space-y-2">
                      <p className="text-xs font-bold text-rose-800">
                        Invalid Rows ({validationResult.invalidRows.length}):
                      </p>
                      <div className="max-h-32 overflow-y-auto space-y-1 text-[11px]">
                        {validationResult.invalidRows.map((inv) => (
                          <div key={inv.rowNumber} className="flex items-start gap-1.5 text-rose-700">
                            <span className="font-bold">Row {inv.rowNumber}:</span>
                            <span>{inv.name || 'Unnamed'} ({inv.email || 'No email'}) — {inv.errors.join(', ')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Valid Rows Preview Table */}
                  {validationResult.validRows.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 text-xs font-bold text-slate-700">
                        Valid Rows Ready for Import ({validationResult.validRows.length})
                      </div>
                      <div className="max-h-40 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50/50 border-b border-slate-100 text-[10px] text-slate-400 uppercase font-bold">
                            <tr>
                              <th className="py-1.5 px-3">#</th>
                              <th className="py-1.5 px-3">Name</th>
                              <th className="py-1.5 px-3">Email</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {validationResult.validRows.map((r, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="py-1.5 px-3 text-slate-400 font-mono text-[10px]">{r.rowNumber}</td>
                                <td className="py-1.5 px-3 font-medium text-slate-800">{r.name}</td>
                                <td className="py-1.5 px-3 text-purple-700">{r.email}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={importing || !validationResult || validationResult.validRows.length === 0}
                  onClick={handleImport}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-50 cursor-pointer shadow-sm flex items-center gap-1.5"
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Importing...</span>
                    </>
                  ) : (
                    <span>Import {validationResult?.validRows?.length ? `${validationResult.validRows.length} Managers` : 'Managers'}</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
