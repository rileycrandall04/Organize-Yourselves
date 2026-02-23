import { useState, useRef } from 'react';
import { useProfile, useUserCallings } from '../hooks/useDb';
import { useDataStats, useLastExportDate } from '../hooks/useDataPortability';
import { getCallingConfig, getCallingList, ORGANIZATIONS, ORG_PRESIDENT_MAP, getOrgLabel } from '../data/callings';
import { addMeeting, addResponsibility, updateLastExportDate, syncAssignmentMeetings, updateCallingAssignments } from '../db';
import db from '../db';
import {
  exportAllData, downloadJsonFile, getExportFilename,
  readJsonFile, validateImportData, importAllData,
  canShareFiles, shareBackupFile, getTableLabel, CURRENT_APP_VERSION,
} from '../utils/dataPortability';
import { seedTestData } from '../utils/testSeeder';
import Modal from './shared/Modal';
import {
  ArrowLeft, Settings as SettingsIcon, UserCircle, Church, Trash2, Plus,
  AlertTriangle, Download, Upload, BarChart3, Share2, Info,
  ChevronRight, ChevronDown, CheckCircle2, Database,
} from 'lucide-react';
import { formatRelative } from '../utils/dates';

export default function Settings({ onBack }) {
  const { profile, save: saveProfile } = useProfile();
  const { callings, add: addCalling, remove: removeCalling } = useUserCallings();
  const { stats: dataStats, totalRows } = useDataStats();
  const { lastExportDate, daysSinceExport } = useLastExportDate();

  // Profile editing
  const [editName, setEditName] = useState(false);
  const [name, setName] = useState('');

  // Calling management
  const [addCallingOpen, setAddCallingOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Import state
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [importData, setImportData] = useState(null);
  const [importFileName, setImportFileName] = useState('');
  const [importValidation, setImportValidation] = useState(null);
  const [importError, setImportError] = useState('');

  // Stats
  const [statsOpen, setStatsOpen] = useState(false);

  // Reset
  const [resetConfirm, setResetConfirm] = useState(false);

  // Test seeder
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);

  const callingList = getCallingList();
  const activeKeys = callings.map(c => c.callingKey);
  const showShare = canShareFiles();

  // Group available callings by org
  const available = ORGANIZATIONS.map(org => ({
    ...org,
    callings: callingList.filter(c => c.organization === org.key && !activeKeys.includes(c.key)),
  })).filter(g => g.callings.length > 0);

  const filteredAvailable = search
    ? available.map(g => ({
        ...g,
        callings: g.callings.filter(c => c.title.toLowerCase().includes(search.toLowerCase())),
      })).filter(g => g.callings.length > 0)
    : available;

  // ── Profile handlers ─────────────────────────────────────

  function handleEditName() {
    setName(profile?.name || '');
    setEditName(true);
  }

  async function handleSaveName() {
    if (!name.trim()) return;
    await saveProfile({ name: name.trim() });
    setEditName(false);
  }

  // ── Calling handlers ─────────────────────────────────────

  async function handleAddCalling(key) {
    await addCalling({ callingKey: key });
    const config = getCallingConfig(key);
    if (config) {
      for (const m of config.meetings || []) {
        await addMeeting({
          callingId: key,
          name: m.name,
          cadence: m.cadence,
          agendaTemplate: m.agendaTemplate || [],
          handbook: m.handbook,
        });
      }
      for (const r of config.responsibilities || []) {
        await addResponsibility({
          callingId: key,
          title: r.title,
          isCustom: false,
          handbook: r.handbook,
        });
      }
    }
    setAddCallingOpen(false);
    setSearch('');
  }

  // Check if a calling is a counselor type (can have org assignments)
  function isCounselorCalling(callingKey) {
    return ['bishopric_1st', 'bishopric_2nd', 'stake_1st_counselor', 'stake_2nd_counselor'].includes(callingKey);
  }

  // Assignable organizations (those with a president in ORG_PRESIDENT_MAP)
  const assignableOrgs = Object.keys(ORG_PRESIDENT_MAP);

  async function handleOrgAssignmentToggle(callingKey, orgKey, currentAssignments) {
    const isAssigned = currentAssignments.includes(orgKey);
    const newAssignments = isAssigned
      ? currentAssignments.filter(k => k !== orgKey)
      : [...currentAssignments, orgKey];

    await updateCallingAssignments(callingKey, newAssignments);
    await syncAssignmentMeetings(callingKey, newAssignments);
  }

  async function handleRemoveCalling(id, callingKey) {
    await removeCalling(id);
    const meetings = await db.meetings.where('callingId').equals(callingKey).toArray();
    for (const m of meetings) await db.meetings.delete(m.id);
    const resps = await db.responsibilities.where('callingId').equals(callingKey).toArray();
    for (const r of resps) await db.responsibilities.delete(r.id);
  }

  // ── Export handlers ──────────────────────────────────────

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    setExportSuccess(false);
    try {
      const data = await exportAllData();
      const filename = getExportFilename();
      downloadJsonFile(data, filename);
      await updateLastExportDate();
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  }

  // ── Import handlers ──────────────────────────────────────

  function handleImportClick() {
    setImportError('');
    fileInputRef.current?.click();
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be re-selected
    e.target.value = '';

    try {
      const jsonObj = await readJsonFile(file);
      const validation = validateImportData(jsonObj);

      setImportFileName(file.name);
      setImportData(jsonObj);
      setImportValidation(validation);
      setImportError('');
      setImportConfirmOpen(true);
    } catch (err) {
      setImportError(err.message || 'Could not read the file.');
    }
  }

  async function executeImport() {
    if (!importData || importing) return;
    setImporting(true);
    try {
      await importAllData(importData);
      window.location.reload();
    } catch (err) {
      setImportError('Import failed: ' + (err.message || 'Unknown error'));
      setImporting(false);
    }
  }

  function cancelImport() {
    setImportConfirmOpen(false);
    setImportData(null);
    setImportValidation(null);
    setImportFileName('');
  }

  // ── Share handler ────────────────────────────────────────

  async function handleShare() {
    if (exporting) return;
    setExporting(true);
    try {
      const data = await exportAllData();
      const filename = getExportFilename();
      await shareBackupFile(data, filename);
      await updateLastExportDate();
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    } finally {
      setExporting(false);
    }
  }

  // ── Seed handler ─────────────────────────────────────────

  async function handleSeedTestData() {
    if (seeding) return;
    setSeeding(true);
    setSeedResult(null);
    try {
      const result = await seedTestData();
      setSeedResult(result);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      console.error('Seeding failed:', err);
      setSeedResult({ error: err.message });
      setSeeding(false);
    }
  }

  // ── Reset handler ────────────────────────────────────────

  async function handleReset() {
    await db.delete();
    window.location.reload();
  }

  // ── Last export display ──────────────────────────────────

  function getExportSubtitle() {
    if (exportSuccess) return 'Backup downloaded successfully!';
    if (!lastExportDate) return 'Never exported — back up your data';
    if (daysSinceExport === 0) return 'Last exported today';
    if (daysSinceExport === 1) return 'Last exported yesterday';
    return `Last exported ${daysSinceExport} days ago`;
  }

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      {/* Header */}
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary-600 mb-4">
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="flex items-center gap-2 mb-6">
        <SettingsIcon size={24} className="text-primary-700" />
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      </div>

      {/* ── Profile ───────────────────────────────────────── */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Profile</h2>
        <div className="card flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserCircle size={32} className="text-gray-300" />
            <div>
              <p className="text-sm font-medium text-gray-900">{profile?.name || 'Unknown'}</p>
              <p className="text-xs text-gray-500">Your display name</p>
            </div>
          </div>
          <button onClick={handleEditName} className="text-xs text-primary-600 font-medium">
            Edit
          </button>
        </div>
      </div>

      {/* ── Callings ──────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Your Callings</h2>
          <button
            onClick={() => setAddCallingOpen(true)}
            className="flex items-center gap-1 text-xs font-medium text-primary-600"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
        <div className="space-y-2">
          {callings.map(uc => {
            const config = getCallingConfig(uc.callingKey);
            const isCounselor = isCounselorCalling(uc.callingKey);
            const currentAssignments = uc.organizationAssignments || [];

            return (
              <div key={uc.id} className="card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Church size={18} className="text-primary-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{config?.title || uc.callingKey}</p>
                      <p className="text-xs text-gray-500">{config?.organization || ''}</p>
                    </div>
                  </div>
                  {callings.length > 1 && (
                    <button
                      onClick={() => handleRemoveCalling(uc.id, uc.callingKey)}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {/* Organization Assignments (counselors only) */}
                {isCounselor && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                      Organizations Assigned to Oversee
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {assignableOrgs.map(orgKey => {
                        const isActive = currentAssignments.includes(orgKey);
                        return (
                          <button
                            key={orgKey}
                            onClick={() => handleOrgAssignmentToggle(uc.callingKey, orgKey, currentAssignments)}
                            className={`px-2 py-1 rounded text-[11px] font-medium transition-colors border
                              ${isActive
                                ? 'bg-primary-50 text-primary-700 border-primary-200'
                                : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600'
                              }`}
                          >
                            {getOrgLabel(orgKey)}
                          </button>
                        );
                      })}
                    </div>
                    {currentAssignments.length > 0 && (
                      <p className="text-[10px] text-gray-400 mt-1.5">
                        Meetings from assigned organizations will appear in your meetings list.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Data Management ───────────────────────────────── */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Data Management</h2>
        <div className="space-y-2">
          {/* Export */}
          <div
            onClick={handleExport}
            className="card flex items-center gap-3 cursor-pointer hover:border-primary-200 transition-colors"
          >
            <div className={`p-2 rounded-lg ${exportSuccess ? 'bg-green-50' : 'bg-primary-50'}`}>
              {exportSuccess
                ? <CheckCircle2 size={18} className="text-green-600" />
                : <Download size={18} className="text-primary-600" />
              }
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                {exporting ? 'Exporting...' : 'Export Data'}
              </p>
              <p className={`text-xs ${exportSuccess ? 'text-green-600' : 'text-gray-500'}`}>
                {getExportSubtitle()}
              </p>
            </div>
          </div>

          {/* Import */}
          <div
            onClick={handleImportClick}
            className="card flex items-center gap-3 cursor-pointer hover:border-primary-200 transition-colors"
          >
            <div className="p-2 rounded-lg bg-amber-50">
              <Upload size={18} className="text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Import Data</p>
              <p className="text-xs text-gray-500">Restore from a backup file</p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Import error inline */}
          {importError && !importConfirmOpen && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red-50 rounded-lg">
              <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{importError}</p>
            </div>
          )}

          {/* Share */}
          {showShare && (
            <div
              onClick={handleShare}
              className="card flex items-center gap-3 cursor-pointer hover:border-primary-200 transition-colors"
            >
              <div className="p-2 rounded-lg bg-indigo-50">
                <Share2 size={18} className="text-indigo-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {exporting ? 'Preparing...' : 'Share Backup'}
                </p>
                <p className="text-xs text-gray-500">Send backup via share sheet</p>
              </div>
            </div>
          )}

          {/* Data Statistics */}
          <div className="card">
            <button
              onClick={() => setStatsOpen(!statsOpen)}
              className="flex items-center gap-3 w-full text-left"
            >
              <div className="p-2 rounded-lg bg-emerald-50">
                <BarChart3 size={18} className="text-emerald-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Data Statistics</p>
                <p className="text-xs text-gray-500">{totalRows} total items</p>
              </div>
              {statsOpen
                ? <ChevronDown size={16} className="text-gray-300" />
                : <ChevronRight size={16} className="text-gray-300" />
              }
            </button>

            {statsOpen && (
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                {Object.entries(dataStats)
                  .filter(([_, count]) => count > 0)
                  .map(([table, count]) => (
                    <div key={table} className="flex justify-between text-sm px-1">
                      <span className="text-gray-500">{getTableLabel(table)}</span>
                      <span className="text-gray-900 font-medium">{count}</span>
                    </div>
                  ))
                }
                {Object.values(dataStats).every(c => c === 0) && (
                  <p className="text-xs text-gray-400 text-center py-2">No data yet</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── About ─────────────────────────────────────────── */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">About</h2>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-50">
              <Info size={18} className="text-gray-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Organize Yourselves</p>
              <p className="text-xs text-gray-500">Version {CURRENT_APP_VERSION}</p>
              <p className="text-xs text-gray-400 mt-0.5 italic">
                "Organize yourselves; prepare every needful thing" — D&C 88:119
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Danger Zone ───────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">Danger Zone</h2>
        <div className="space-y-2">
          {/* Seed Test Data */}
          <button
            onClick={handleSeedTestData}
            disabled={seeding}
            className="w-full card flex items-center gap-3 text-left text-orange-600 hover:border-orange-200 transition-colors disabled:opacity-50"
          >
            <Database size={18} />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {seeding ? 'Seeding...' : seedResult && !seedResult.error ? 'Seeded! Reloading...' : 'Seed Test Data'}
              </p>
              <p className="text-xs text-orange-400">
                {seedResult?.error
                  ? `Error: ${seedResult.error}`
                  : seedResult
                    ? `${seedResult.people} people, ${seedResult.actionItems} items, ${seedResult.journal} journal entries`
                    : 'Clear & fill with 1 year of realistic test data'
                }
              </p>
            </div>
          </button>

          {/* Reset */}
          <button
            onClick={() => setResetConfirm(true)}
            className="w-full card flex items-center gap-3 text-left text-red-600 hover:border-red-200 transition-colors"
          >
            <Trash2 size={18} />
            <div>
              <p className="text-sm font-medium">Reset All Data</p>
              <p className="text-xs text-red-400">Delete everything and start over</p>
            </div>
          </button>
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────── */}

      {/* Edit name */}
      <Modal open={editName} onClose={() => setEditName(false)} title="Edit Name" size="sm">
        <div className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="input-field"
            autoFocus
          />
          <div className="flex gap-3">
            <button onClick={handleSaveName} disabled={!name.trim()} className="btn-primary flex-1">
              Save
            </button>
            <button onClick={() => setEditName(false)} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Add calling */}
      <Modal open={addCallingOpen} onClose={() => { setAddCallingOpen(false); setSearch(''); }} title="Add Calling" size="lg">
        <div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search callings..."
            className="input-field mb-3"
            autoFocus
          />
          <div className="space-y-4 max-h-[50vh] overflow-y-auto">
            {filteredAvailable.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                {search ? 'No matching callings found.' : 'All available callings have been added.'}
              </p>
            ) : (
              filteredAvailable.map(group => (
                <div key={group.key}>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                    {group.label}
                  </h3>
                  <div className="space-y-1">
                    {group.callings.map(calling => (
                      <button
                        key={calling.key}
                        onClick={() => handleAddCalling(calling.key)}
                        className="w-full text-left px-3 py-2.5 rounded-lg text-sm bg-white border border-gray-200 text-gray-700 hover:border-primary-200 hover:bg-primary-50 transition-colors"
                      >
                        {calling.title}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* Import confirmation */}
      <Modal open={importConfirmOpen} onClose={cancelImport} title="Restore from Backup?" size="md">
        {importValidation && (
          <div className="space-y-4">
            {/* File info */}
            <div className="text-sm text-gray-600 space-y-1">
              <p>File: <span className="font-medium">{importFileName}</span></p>
              {importData?.meta?.exportDate && (
                <p>Exported: <span className="font-medium">
                  {new Date(importData.meta.exportDate).toLocaleDateString('en-US', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </span></p>
              )}
              <p>Schema version: <span className="font-medium">{importData?.meta?.schemaVersion ?? 'unknown'}</span></p>
            </div>

            {/* Stats table */}
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Data to import</p>
              <div className="space-y-1">
                {Object.entries(importValidation.stats)
                  .filter(([_, count]) => count > 0)
                  .map(([table, count]) => (
                    <div key={table} className="flex justify-between text-sm">
                      <span className="text-gray-600">{getTableLabel(table)}</span>
                      <span className="font-medium text-gray-900">{count}</span>
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg">
              <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                This will <strong>replace all</strong> your current data. Export your current data first if you want to keep it.
              </p>
            </div>

            {/* Validation warnings */}
            {importValidation.warnings.length > 0 && (
              <div className="space-y-1">
                {importValidation.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-600">{w}</p>
                ))}
              </div>
            )}

            {/* Validation errors */}
            {importValidation.errors.length > 0 && (
              <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
                <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-800 space-y-1">
                  {importValidation.errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={executeImport}
                disabled={!importValidation.valid || importing}
                className="flex-1 bg-amber-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {importing ? 'Importing...' : 'Replace All Data'}
              </button>
              <button onClick={cancelImport} className="btn-secondary flex-1">
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reset confirmation */}
      <Modal open={resetConfirm} onClose={() => setResetConfirm(false)} title="Reset All Data?" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
            <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">
              This will permanently delete all your data including action items, meetings, journal entries, and settings. This cannot be undone.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={handleReset} className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors">
              Delete Everything
            </button>
            <button onClick={() => setResetConfirm(false)} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
