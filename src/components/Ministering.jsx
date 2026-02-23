import { useState, useMemo, useRef } from 'react';
import { useMinisteringCompanionships, useMinisteringInterviews, usePeople } from '../hooks/useDb';
import { addMinisteringCompanionship, updateMinisteringCompanionship, deleteMinisteringCompanionship, addMinisteringInterview } from '../db';
import db from '../db';
import { parseMemberCSV, diffMemberList, applyMemberImport } from '../utils/memberImport';
import Modal from './shared/Modal';
import {
  ArrowLeft, Users, Plus, UserPlus, Calendar, AlertTriangle,
  ChevronDown, ChevronRight, Upload, Check, X, Edit3, Trash2,
  FileText, Eye, EyeOff,
} from 'lucide-react';

export default function Ministering({ onBack }) {
  const [tab, setTab] = useState('brothers'); // 'brothers' | 'sisters'
  const [mode, setMode] = useState('active'); // 'active' | 'draft'
  const { companionships, loading } = useMinisteringCompanionships(tab);
  const { people } = usePeople();
  const [showAddComp, setShowAddComp] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null); // companionship to assign family to
  const [interviewComp, setInterviewComp] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  // Filter by status (active vs draft)
  const filteredComps = companionships.filter(c => c.status === mode);

  // Unassigned people — eligible ministers not in any active companionship
  const assignedMinisterIds = useMemo(() => {
    const ids = new Set();
    for (const c of companionships) {
      if (c.minister1Id) ids.add(c.minister1Id);
      if (c.minister2Id) ids.add(c.minister2Id);
    }
    return ids;
  }, [companionships]);

  // Unassigned families — people not assigned to any companionship
  const assignedFamilyIds = useMemo(() => {
    const ids = new Set();
    for (const c of companionships) {
      for (const fid of (c.assignedFamilyIds || [])) {
        ids.add(fid);
      }
    }
    return ids;
  }, [companionships]);

  const unassignedPeople = people.filter(p =>
    !assignedMinisterIds.has(p.id) && !assignedFamilyIds.has(p.id)
  );

  const newMembers = people.filter(p => {
    if (!p.moveInDate) return false;
    const daysSince = (Date.now() - new Date(p.moveInDate).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince <= 60;
  });

  async function handleAssignFamily(compId, personId, personName) {
    const comp = companionships.find(c => c.id === compId);
    if (!comp) return;
    const familyIds = [...(comp.assignedFamilyIds || []), personId];
    const familyNames = [...(comp.assignedFamilyNames || []), personName];
    await updateMinisteringCompanionship(compId, {
      assignedFamilyIds: familyIds,
      assignedFamilyNames: familyNames,
    });
    setAssignTarget(null);
  }

  async function handleUnassignFamily(compId, familyIndex) {
    const comp = companionships.find(c => c.id === compId);
    if (!comp) return;
    const familyIds = [...(comp.assignedFamilyIds || [])];
    const familyNames = [...(comp.assignedFamilyNames || [])];
    familyIds.splice(familyIndex, 1);
    familyNames.splice(familyIndex, 1);
    await updateMinisteringCompanionship(compId, {
      assignedFamilyIds: familyIds,
      assignedFamilyNames: familyNames,
    });
  }

  async function handleFinalizeDrafts() {
    const drafts = companionships.filter(c => c.status === 'draft');
    for (const d of drafts) {
      await updateMinisteringCompanionship(d.id, { status: 'active' });
    }
    setMode('active');
  }

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      {/* Header */}
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary-600 mb-4">
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Users size={24} className="text-primary-700" />
          <h1 className="text-2xl font-bold text-gray-900">Ministering</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setImportOpen(true)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
            title="Import members"
          >
            <Upload size={16} />
          </button>
          <button
            onClick={() => setShowAddComp(true)}
            className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-800"
          >
            <Plus size={16} />
            Add
          </button>
        </div>
      </div>

      {/* Brothers / Sisters toggle */}
      <div className="flex bg-gray-100 rounded-lg p-0.5 mb-4">
        <button
          onClick={() => setTab('brothers')}
          className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
            tab === 'brothers' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-400'
          }`}
        >
          Brothers
        </button>
        <button
          onClick={() => setTab('sisters')}
          className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
            tab === 'sisters' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-400'
          }`}
        >
          Sisters
        </button>
      </div>

      {/* Active / Draft toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setMode('active')}
            className={`text-xs font-medium px-3 py-1 rounded-md transition-colors ${
              mode === 'active' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-400'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setMode('draft')}
            className={`text-xs font-medium px-3 py-1 rounded-md transition-colors ${
              mode === 'draft' ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-400'
            }`}
          >
            Draft
          </button>
        </div>
        {mode === 'draft' && filteredComps.length > 0 && (
          <button
            onClick={handleFinalizeDrafts}
            className="flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-800"
          >
            <Check size={14} />
            Finalize All
          </button>
        )}
      </div>

      {/* Unassigned pool */}
      {unassignedPeople.length > 0 && (
        <div className="card !p-0 overflow-hidden mb-4">
          <UnassignedPool
            people={unassignedPeople}
            newMembers={newMembers}
            onAssign={(person) => setAssignTarget({ person })}
          />
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <div className="animate-spin w-6 h-6 border-2 border-primary-300 border-t-primary-700 rounded-full mx-auto mb-3" />
          <p className="text-sm">Loading...</p>
        </div>
      ) : filteredComps.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          <Users size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No {mode} companionships yet.</p>
          <button onClick={() => setShowAddComp(true)} className="btn-primary mt-3 text-sm">
            <Plus size={14} className="inline mr-1" />
            Add Companionship
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredComps.map(comp => (
            <CompanionshipCard
              key={comp.id}
              comp={comp}
              onAssignFamily={() => setAssignTarget({ compId: comp.id })}
              onUnassignFamily={(idx) => handleUnassignFamily(comp.id, idx)}
              onLogInterview={() => setInterviewComp(comp)}
              onDelete={() => deleteMinisteringCompanionship(comp.id)}
              isDraft={mode === 'draft'}
            />
          ))}
        </div>
      )}

      {/* Add Companionship Modal */}
      <AddCompanionshipModal
        open={showAddComp}
        onClose={() => setShowAddComp(false)}
        type={tab}
        people={people}
        status={mode}
      />

      {/* Assign Family Modal */}
      <AssignFamilyModal
        open={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        target={assignTarget}
        unassignedPeople={unassignedPeople}
        companionships={filteredComps}
        onAssign={handleAssignFamily}
      />

      {/* Interview Modal */}
      <InterviewModal
        open={!!interviewComp}
        onClose={() => setInterviewComp(null)}
        comp={interviewComp}
      />

      {/* Import Modal */}
      <MemberImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        existingPeople={people}
      />
    </div>
  );
}

// ── Unassigned Pool ─────────────────────────────────────────

function UnassignedPool({ people, newMembers, onAssign }) {
  const [expanded, setExpanded] = useState(true);
  const newMemberIds = new Set(newMembers.map(m => m.id));

  return (
    <>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
      >
        {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        <span className="text-xs font-semibold text-amber-600 flex-1">
          Unassigned ({people.length})
        </span>
      </button>
      {expanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-50 max-h-40 overflow-y-auto">
          {people.map(person => (
            <button
              key={person.id}
              onClick={() => onAssign(person)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-primary-50 transition-colors"
            >
              <span className="text-xs text-gray-700 flex-1">{person.name}</span>
              {newMemberIds.has(person.id) && (
                <span className="text-[9px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">
                  NEW
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ── Companionship Card ──────────────────────────────────────

function CompanionshipCard({ comp, onAssignFamily, onUnassignFamily, onLogInterview, onDelete, isDraft }) {
  const [expanded, setExpanded] = useState(true);
  const lastInterview = comp.lastInterviewDate ? new Date(comp.lastInterviewDate) : null;
  const daysSinceInterview = lastInterview
    ? Math.round((Date.now() - lastInterview.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const interviewOverdue = daysSinceInterview !== null && daysSinceInterview > 90;

  return (
    <div className={`card ${isDraft ? 'border-dashed border-amber-200' : ''}`}>
      {/* Header */}
      <div className="flex items-start gap-2">
        <button onClick={() => setExpanded(!expanded)} className="p-0.5 mt-0.5">
          {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-primary-500 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-900">
              {comp.minister1Name || 'Minister 1'}
            </span>
            <span className="text-xs text-gray-400">+</span>
            <span className="text-sm font-medium text-gray-900">
              {comp.minister2Name || 'Minister 2'}
            </span>
          </div>
          {/* Interview status */}
          <button
            onClick={onLogInterview}
            className={`text-[10px] mt-0.5 ${
              interviewOverdue ? 'text-amber-500' :
              daysSinceInterview !== null ? 'text-gray-400' : 'text-gray-300'
            }`}
          >
            {interviewOverdue && <AlertTriangle size={9} className="inline mr-0.5" />}
            {daysSinceInterview !== null
              ? `Last interview: ${daysSinceInterview} days ago`
              : 'No interviews logged'
            }
          </button>
        </div>
        {isDraft && (
          <span className="text-[9px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
            Draft
          </span>
        )}
        <button
          onClick={onDelete}
          className="p-1 text-gray-300 hover:text-red-500 transition-colors"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Assigned families */}
      {expanded && (
        <div className="mt-2 pl-6 space-y-1">
          {(comp.assignedFamilyNames || []).map((name, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
              <span className="flex-1">{name}</span>
              <button
                onClick={() => onUnassignFamily(i)}
                className="text-gray-300 hover:text-red-400 transition-colors"
              >
                <X size={10} />
              </button>
            </div>
          ))}
          <button
            onClick={onAssignFamily}
            className="flex items-center gap-1 text-[10px] text-primary-500 hover:text-primary-700 font-medium mt-1"
          >
            <Plus size={10} />
            Assign Family
          </button>
        </div>
      )}
    </div>
  );
}

// ── Add Companionship Modal ─────────────────────────────────

function AddCompanionshipModal({ open, onClose, type, people, status }) {
  const [minister1, setMinister1] = useState('');
  const [minister1Id, setMinister1Id] = useState(null);
  const [minister2, setMinister2] = useState('');
  const [minister2Id, setMinister2Id] = useState(null);
  const [district, setDistrict] = useState('');

  async function handleSave() {
    if (!minister1.trim()) return;
    await addMinisteringCompanionship({
      type,
      minister1Name: minister1.trim(),
      minister1Id: minister1Id || undefined,
      minister2Name: minister2.trim() || undefined,
      minister2Id: minister2Id || undefined,
      district: district.trim() || undefined,
      status: status || 'active',
    });
    setMinister1('');
    setMinister1Id(null);
    setMinister2('');
    setMinister2Id(null);
    setDistrict('');
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="New Companionship" size="md">
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Minister 1</label>
          <input
            type="text"
            value={minister1}
            onChange={e => { setMinister1(e.target.value); setMinister1Id(null); }}
            placeholder="Name"
            className="input-field text-sm"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Minister 2</label>
          <input
            type="text"
            value={minister2}
            onChange={e => { setMinister2(e.target.value); setMinister2Id(null); }}
            placeholder="Name (optional)"
            className="input-field text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">District (optional)</label>
          <input
            type="text"
            value={district}
            onChange={e => setDistrict(e.target.value)}
            placeholder="e.g., District 1"
            className="input-field text-sm"
          />
        </div>
        <div className="flex gap-3">
          <button onClick={handleSave} disabled={!minister1.trim()} className="btn-primary flex-1">
            Create
          </button>
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Assign Family Modal ─────────────────────────────────────

function AssignFamilyModal({ open, onClose, target, unassignedPeople, companionships, onAssign }) {
  const [step, setStep] = useState('selectComp'); // 'selectComp' if coming from person, or 'selectFamily' if from comp

  if (!target) return null;

  // If we have a person but no compId, show companionship picker
  if (target.person && !target.compId) {
    return (
      <Modal open={open} onClose={onClose} title={`Assign ${target.person.name}`} size="md">
        <p className="text-xs text-gray-500 mb-3">Select a companionship:</p>
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {companionships.map(comp => (
            <button
              key={comp.id}
              onClick={() => {
                onAssign(comp.id, target.person.id, target.person.name);
              }}
              className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 hover:border-primary-200 hover:bg-primary-50 transition-colors"
            >
              <p className="text-xs font-medium text-gray-900">
                {comp.minister1Name} + {comp.minister2Name || '—'}
              </p>
              <p className="text-[10px] text-gray-400">
                {(comp.assignedFamilyNames || []).length} families assigned
              </p>
            </button>
          ))}
          {companionships.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">No companionships yet. Create one first.</p>
          )}
        </div>
      </Modal>
    );
  }

  // If we have a compId, show family picker
  return (
    <Modal open={open} onClose={onClose} title="Assign Family" size="md">
      <p className="text-xs text-gray-500 mb-3">Select a family to assign:</p>
      <div className="space-y-1 max-h-60 overflow-y-auto">
        {unassignedPeople.map(person => (
          <button
            key={person.id}
            onClick={() => onAssign(target.compId, person.id, person.name)}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-primary-50 transition-colors text-xs text-gray-700"
          >
            {person.name}
          </button>
        ))}
        {unassignedPeople.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">Everyone is assigned.</p>
        )}
      </div>
    </Modal>
  );
}

// ── Interview Modal ─────────────────────────────────────────

function InterviewModal({ open, onClose, comp }) {
  const [notes, setNotes] = useState('');
  const [conductedBy, setConductedBy] = useState('');
  const { interviews } = useMinisteringInterviews(comp?.id);

  async function handleLog() {
    if (!comp) return;
    await addMinisteringInterview({
      companionshipId: comp.id,
      conductedBy: conductedBy.trim() || undefined,
      notes: notes.trim() || undefined,
      attendees: [comp.minister1Name, comp.minister2Name].filter(Boolean),
    });
    await updateMinisteringCompanionship(comp.id, {
      lastInterviewDate: new Date().toISOString(),
    });
    setNotes('');
    setConductedBy('');
    onClose();
  }

  if (!comp) return null;

  return (
    <Modal open={open} onClose={onClose} title="Ministering Interview" size="md">
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          {comp.minister1Name} + {comp.minister2Name || '—'}
        </p>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Conducted By</label>
          <input
            type="text"
            value={conductedBy}
            onChange={e => setConductedBy(e.target.value)}
            placeholder="Your name"
            className="input-field text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Interview notes..."
            rows={3}
            className="input-field text-xs"
          />
        </div>
        <button onClick={handleLog} className="btn-primary w-full">
          Log Interview
        </button>

        {/* Past interviews */}
        {interviews.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Past Interviews</h4>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {interviews.map(iv => (
                <div key={iv.id} className="text-[10px] text-gray-500 bg-gray-50 rounded px-2 py-1.5">
                  <div className="flex justify-between">
                    <span>{iv.conductedBy || 'Unknown'}</span>
                    <span className="text-gray-400">{new Date(iv.date).toLocaleDateString()}</span>
                  </div>
                  {iv.notes && <p className="text-gray-400 mt-0.5">{iv.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Member Import Modal ─────────────────────────────────────

function MemberImportModal({ open, onClose, existingPeople }) {
  const fileRef = useRef(null);
  const [diff, setDiff] = useState(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    try {
      const text = await file.text();
      const imported = parseMemberCSV(text);
      if (imported.length === 0) {
        setError('No members found in the CSV file.');
        return;
      }
      const result = diffMemberList(imported, existingPeople);
      setDiff(result);
      setError('');
    } catch (err) {
      setError('Could not read file: ' + (err.message || ''));
    }
  }

  async function handleApply() {
    if (!diff || importing) return;
    setImporting(true);
    try {
      await applyMemberImport(diff, {
        addNew: true,
        updateExisting: true,
        removeDeparted: true,
      }, db);
      setDiff(null);
      onClose();
    } catch (err) {
      setError('Import failed: ' + (err.message || ''));
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal open={open} onClose={() => { onClose(); setDiff(null); setError(''); }} title="Import Member List" size="md">
      <div className="space-y-4">
        {!diff ? (
          <>
            <p className="text-xs text-gray-500">
              Upload a CSV file with member names. The first row should be headers (Name, Phone, Email, etc.).
            </p>
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-primary-300 hover:text-primary-600 transition-colors"
            >
              <Upload size={16} />
              Choose CSV File
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleFile}
              className="hidden"
            />
            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}
          </>
        ) : (
          <>
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              {diff.newMembers.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">New members</span>
                  <span className="font-medium">{diff.newMembers.length}</span>
                </div>
              )}
              {diff.updatedMembers.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-blue-600">Updated</span>
                  <span className="font-medium">{diff.updatedMembers.length}</span>
                </div>
              )}
              {diff.departed.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-amber-600">Departed</span>
                  <span className="font-medium">{diff.departed.length}</span>
                </div>
              )}
              {diff.newMembers.length === 0 && diff.updatedMembers.length === 0 && diff.departed.length === 0 && (
                <p className="text-xs text-gray-400 text-center">No changes detected.</p>
              )}
            </div>

            {diff.departed.length > 0 && (
              <div className="flex items-start gap-2 p-2 bg-amber-50 rounded-lg">
                <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Departed members will be marked as moved out. Their callings and ministering positions should be vacated.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleApply}
                disabled={importing}
                className="btn-primary flex-1"
              >
                {importing ? 'Applying...' : 'Apply Changes'}
              </button>
              <button onClick={() => setDiff(null)} className="btn-secondary flex-1">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
