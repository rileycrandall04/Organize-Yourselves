import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCallingSlots, usePeople } from '../hooks/useDb';
import { transitionCallingSlot, startRelease } from '../db';
import { CALLING_STAGES, CALL_STAGE_ORDER, RELEASE_STAGE_ORDER, CALLING_PRIORITIES, DISPLAY_STAGE_GROUPS } from '../utils/constants';
import { ORGANIZATIONS } from '../data/callings';
import Modal from './shared/Modal';
import {
  ArrowLeft, GitBranch, Plus, ArrowRight, RotateCcw, List, LayoutGrid,
  ChevronDown, ChevronRight, AlertTriangle, Users, Clock, UserPlus,
  Check, X,
} from 'lucide-react';
import { isAiConfigured } from '../utils/ai';
import CallingSlotForm from './CallingSlotForm';
import OrgChart from './OrgChart';
import NeedsDashboard from './NeedsDashboard';
import CandidateManager from './CandidateManager';
import CallingChat from './CallingChat';

export default function CallingPipeline({ onBack }) {
  const navigate = useNavigate();
  const { slots, loading, add, update, remove } = useCallingSlots();
  const { people } = usePeople();
  const [view, setView] = useState('orgchart'); // 'list' | 'kanban' | 'orgchart'
  const [pipelineTab, setPipelineTab] = useState('call'); // 'call' | 'release'
  const [formOpen, setFormOpen] = useState(false);
  const [editSlot, setEditSlot] = useState(null);
  const [parentSlotId, setParentSlotId] = useState(null);
  const [addOrg, setAddOrg] = useState(null); // pre-filled organization for new slot
  const [advanceModal, setAdvanceModal] = useState(null);
  const [advanceNote, setAdvanceNote] = useState('');
  const [advanceAssignedTo, setAdvanceAssignedTo] = useState('');
  const [advanceCandidate, setAdvanceCandidate] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [candidateSlot, setCandidateSlot] = useState(null);
  const [releaseModal, setReleaseModal] = useState(null);
  const [releaseTarget, setReleaseTarget] = useState('');
  const [autoReleasePrompt, setAutoReleasePrompt] = useState(null); // { slot, servedBy }
  const [showCandidateAutocomplete, setShowCandidateAutocomplete] = useState(false);
  const [stageFilter, setStageFilter] = useState(null); // null | DISPLAY_STAGE_GROUPS key
  const [orgFilter, setOrgFilter] = useState(null); // null | org key

  // All stages for grouping
  const callStages = CALL_STAGE_ORDER;
  const releaseStages = RELEASE_STAGE_ORDER.filter(s => s !== 'serving');
  const displayStages = pipelineTab === 'call'
    ? [...callStages, 'declined']
    : ['serving', ...releaseStages];

  // Group slots by stage
  const slotsByStage = useMemo(() => {
    const grouped = {};
    Object.keys(CALLING_STAGES).forEach(s => { grouped[s] = []; });
    grouped['declined'] = grouped['declined'] || [];
    slots.forEach(slot => {
      const stage = slot.stage || 'identified';
      if (grouped[stage]) {
        grouped[stage].push(slot);
      } else {
        grouped['identified'].push(slot);
      }
    });
    return grouped;
  }, [slots]);

  const activeCount = slots.filter(s => !['serving', 'released'].includes(s.stage)).length;

  function openAdd(parentId, organization) {
    setEditSlot(null);
    setParentSlotId(parentId || null);
    setAddOrg(organization || null);
    setFormOpen(true);
  }

  function openEdit(slot) {
    setEditSlot(slot);
    setParentSlotId(null);
    setAddOrg(null);
    setFormOpen(true);
  }

  function getNextStage(currentStage) {
    // Check call track
    const callIdx = CALL_STAGE_ORDER.indexOf(currentStage);
    if (callIdx >= 0 && callIdx < CALL_STAGE_ORDER.length - 1) return CALL_STAGE_ORDER[callIdx + 1];
    // Check release track
    const relIdx = RELEASE_STAGE_ORDER.indexOf(currentStage);
    if (relIdx >= 0 && relIdx < RELEASE_STAGE_ORDER.length - 1) return RELEASE_STAGE_ORDER[relIdx + 1];
    return null;
  }

  function openAdvanceModal(slot) {
    setAdvanceModal(slot);
    setAdvanceNote('');
    setAdvanceAssignedTo('');
    setAdvanceCandidate(null);
  }

  async function handleAdvance(overrideStage) {
    if (!advanceModal || advancing) return;
    setAdvancing(true);
    try {
      const nextStage = overrideStage || getNextStage(advanceModal.stage);
      if (!nextStage) return;

      const extraUpdates = {};

      // Stage-specific data
      if (nextStage === 'assigned_to_extend' && advanceAssignedTo.trim()) {
        extraUpdates.assignedTo = advanceAssignedTo.trim();
      }
      if (nextStage === 'prayed_about' && advanceCandidate) {
        extraUpdates.candidateName = advanceCandidate.name || advanceCandidate;
        if (advanceCandidate.id) extraUpdates.personId = advanceCandidate.id;
      }
      if (nextStage === 'serving') {
        extraUpdates.servedBy = advanceModal.candidateName;
        extraUpdates.servingSince = new Date().toISOString();
      }

      await transitionCallingSlot(advanceModal.id, nextStage, advanceNote.trim(), extraUpdates);

      // Check for auto-release prompt when accepting
      if (nextStage === 'accepted' && advanceModal.servedBy) {
        setAutoReleasePrompt({
          slot: advanceModal,
          servedBy: advanceModal.servedBy,
        });
      }

      setAdvanceModal(null);
    } finally {
      setAdvancing(false);
    }
  }

  async function handleDecline(slot) {
    // Decline returns to 'discussed' stage (not 'identified')
    await transitionCallingSlot(slot.id || advanceModal?.id, 'declined', '');
    setAdvanceModal(null);
  }

  async function handleReturnToDiscussed(slot) {
    await transitionCallingSlot(slot.id, 'discussed', 'Returned after decline');
  }

  async function handleBeginRelease(slot) {
    setReleaseModal(slot);
    setReleaseTarget('');
  }

  async function confirmRelease() {
    if (!releaseModal) return;
    await startRelease(releaseModal.id, releaseTarget.trim());
    setReleaseModal(null);
  }

  async function confirmAutoRelease() {
    if (!autoReleasePrompt) return;
    await startRelease(autoReleasePrompt.slot.id, '');
    setAutoReleasePrompt(null);
  }

  function getOrgLabel(orgKey) {
    const org = ORGANIZATIONS.find(o => o.key === orgKey);
    return org?.label || orgKey || '';
  }

  // Contextual advance modal content
  function renderAdvanceContent() {
    if (!advanceModal) return null;
    const slot = advanceModal;
    const currentStage = slot.stage;
    const nextStage = getNextStage(currentStage);

    // ── identified → discussed
    if (currentStage === 'identified') {
      return (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Begin discussing names for <span className="font-medium">{slot.roleName}</span>?
          </p>
          <textarea
            value={advanceNote}
            onChange={e => setAdvanceNote(e.target.value)}
            placeholder="Optional note..."
            rows={2}
            className="input-field text-xs"
          />
          <div className="flex gap-3">
            <button onClick={() => handleAdvance()} disabled={advancing} className="btn-primary flex-1">
              {advancing ? 'Advancing...' : 'Begin Discussion'}
            </button>
            <button onClick={() => setAdvanceModal(null)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      );
    }

    // ── discussed → prayed_about (select candidate)
    if (currentStage === 'discussed') {
      const candidates = slot.candidates || [];
      return (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Which candidate should be prayed about for <span className="font-medium">{slot.roleName}</span>?
          </p>
          {candidates.length > 0 ? (
            <div className="space-y-1 max-h-32 overflow-y-auto border border-gray-200 rounded-lg">
              {candidates.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setAdvanceCandidate(c)}
                  className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 last:border-0 transition-colors ${
                    advanceCandidate === c ? 'bg-primary-50 text-primary-700 font-medium' : 'hover:bg-gray-50'
                  }`}
                >
                  {c.name || c}
                </button>
              ))}
            </div>
          ) : (
            <div className="relative">
              <label className="block text-xs font-medium text-gray-600 mb-1">Candidate Name</label>
              <input
                type="text"
                value={typeof advanceCandidate === 'string' ? advanceCandidate : ''}
                onChange={e => {
                  setAdvanceCandidate(e.target.value);
                  setShowCandidateAutocomplete(e.target.value.length >= 2);
                }}
                onFocus={() => { if ((typeof advanceCandidate === 'string' ? advanceCandidate : '').length >= 2) setShowCandidateAutocomplete(true); }}
                onBlur={() => setTimeout(() => setShowCandidateAutocomplete(false), 150)}
                placeholder="Start typing a name..."
                className="input-field text-sm"
                autoComplete="off"
              />
              {showCandidateAutocomplete && (() => {
                const q = (typeof advanceCandidate === 'string' ? advanceCandidate : '').toLowerCase();
                const matches = people.filter(p => p.name.toLowerCase().includes(q));
                if (matches.length === 0) return null;
                return (
                  <div className="absolute z-20 left-0 right-0 mt-1 max-h-32 overflow-y-auto border border-gray-200 rounded-lg bg-white shadow-lg">
                    {matches.slice(0, 8).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => {
                          setAdvanceCandidate({ name: p.name, id: p.id });
                          setShowCandidateAutocomplete(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50 border-b border-gray-100 last:border-0"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
          {slot.candidateName && !advanceCandidate && (
            <p className="text-xs text-gray-400">
              Current candidate: <span className="font-medium">{slot.candidateName}</span>
            </p>
          )}
          <textarea
            value={advanceNote}
            onChange={e => setAdvanceNote(e.target.value)}
            placeholder="Optional note..."
            rows={2}
            className="input-field text-xs"
          />
          <div className="flex gap-3">
            <button
              onClick={() => handleAdvance()}
              disabled={advancing}
              className="btn-primary flex-1"
            >
              {advancing ? 'Advancing...' : 'Pray About'}
            </button>
            <button onClick={() => setAdvanceModal(null)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      );
    }

    // ── prayed_about → assigned_to_extend (who will extend?)
    if (currentStage === 'prayed_about') {
      return (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Who will extend <span className="font-medium">{slot.roleName}</span> to{' '}
            <span className="font-medium">{slot.candidateName}</span>?
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Assigned To</label>
            <input
              type="text"
              value={advanceAssignedTo}
              onChange={e => setAdvanceAssignedTo(e.target.value)}
              placeholder='e.g., "Bishop Smith", "EQ President"'
              className="input-field text-sm"
              autoFocus
            />
          </div>
          <textarea
            value={advanceNote}
            onChange={e => setAdvanceNote(e.target.value)}
            placeholder="Optional note..."
            rows={2}
            className="input-field text-xs"
          />
          <div className="flex gap-3">
            <button
              onClick={() => handleAdvance()}
              disabled={advancing || !advanceAssignedTo.trim()}
              className="btn-primary flex-1"
            >
              {advancing ? 'Advancing...' : 'Assign'}
            </button>
            <button onClick={() => setAdvanceModal(null)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      );
    }

    // ── assigned_to_extend → extended
    if (currentStage === 'assigned_to_extend') {
      return (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            <span className="font-medium">{slot.assignedTo || 'The assigned leader'}</span> will extend{' '}
            <span className="font-medium">{slot.roleName}</span> to{' '}
            <span className="font-medium">{slot.candidateName}</span>.
          </p>
          <textarea
            value={advanceNote}
            onChange={e => setAdvanceNote(e.target.value)}
            placeholder="Optional note..."
            rows={2}
            className="input-field text-xs"
          />
          <div className="flex gap-3">
            <button onClick={() => handleAdvance()} disabled={advancing} className="btn-primary flex-1">
              {advancing ? 'Advancing...' : 'Mark Extended'}
            </button>
            <button onClick={() => setAdvanceModal(null)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      );
    }

    // ── extended → accepted OR declined
    if (currentStage === 'extended') {
      return (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Did <span className="font-medium">{slot.candidateName}</span> accept{' '}
            <span className="font-medium">{slot.roleName}</span>?
          </p>
          <textarea
            value={advanceNote}
            onChange={e => setAdvanceNote(e.target.value)}
            placeholder="Optional note..."
            rows={2}
            className="input-field text-xs"
          />
          <div className="flex gap-2">
            <button
              onClick={() => handleAdvance('accepted')}
              disabled={advancing}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              <Check size={14} />
              {advancing ? '...' : 'Accepted'}
            </button>
            <button
              onClick={() => handleDecline(slot)}
              disabled={advancing}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              <X size={14} />
              {advancing ? '...' : 'Declined'}
            </button>
          </div>
          <button onClick={() => setAdvanceModal(null)} className="btn-secondary w-full">Cancel</button>
        </div>
      );
    }

    // ── accepted → sustained
    if (currentStage === 'accepted') {
      return (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Add <span className="font-medium">{slot.candidateName}</span> for{' '}
            <span className="font-medium">{slot.roleName}</span> to sustainings?
          </p>
          <textarea
            value={advanceNote}
            onChange={e => setAdvanceNote(e.target.value)}
            placeholder="Optional note..."
            rows={2}
            className="input-field text-xs"
          />
          <div className="flex gap-3">
            <button onClick={() => handleAdvance()} disabled={advancing} className="btn-primary flex-1">
              {advancing ? 'Advancing...' : 'Add to Sustainings'}
            </button>
            <button onClick={() => setAdvanceModal(null)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      );
    }

    // ── sustained → set_apart
    if (currentStage === 'sustained') {
      return (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Schedule setting apart for <span className="font-medium">{slot.candidateName}</span> as{' '}
            <span className="font-medium">{slot.roleName}</span>?
          </p>
          <textarea
            value={advanceNote}
            onChange={e => setAdvanceNote(e.target.value)}
            placeholder="Optional note..."
            rows={2}
            className="input-field text-xs"
          />
          <div className="flex gap-3">
            <button onClick={() => handleAdvance()} disabled={advancing} className="btn-primary flex-1">
              {advancing ? 'Advancing...' : 'Schedule Set Apart'}
            </button>
            <button onClick={() => setAdvanceModal(null)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      );
    }

    // ── set_apart → serving
    if (currentStage === 'set_apart') {
      return (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Mark <span className="font-medium">{slot.candidateName}</span> as now serving as{' '}
            <span className="font-medium">{slot.roleName}</span>?
          </p>
          <p className="text-xs text-gray-400">
            This will record today as their service start date.
          </p>
          <textarea
            value={advanceNote}
            onChange={e => setAdvanceNote(e.target.value)}
            placeholder="Optional note..."
            rows={2}
            className="input-field text-xs"
          />
          <div className="flex gap-3">
            <button onClick={() => handleAdvance()} disabled={advancing} className="btn-primary flex-1">
              {advancing ? 'Advancing...' : 'Begin Serving'}
            </button>
            <button onClick={() => setAdvanceModal(null)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      );
    }

    // ── Release track stages (fallback generic)
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-700">
          Move <span className="font-medium">{slot.roleName}</span> from{' '}
          <span className="font-medium">{CALLING_STAGES[currentStage]?.label}</span> to{' '}
          <span className="font-medium text-primary-700">
            {CALLING_STAGES[nextStage]?.label}
          </span>?
        </p>
        {slot.candidateName && (
          <p className="text-xs text-gray-500">Candidate: {slot.candidateName}</p>
        )}
        <textarea
          value={advanceNote}
          onChange={e => setAdvanceNote(e.target.value)}
          placeholder="Optional note..."
          rows={2}
          className="input-field text-xs"
        />
        <div className="flex gap-3">
          <button onClick={() => handleAdvance()} disabled={advancing} className="btn-primary flex-1">
            {advancing ? 'Advancing...' : 'Confirm'}
          </button>
          <button onClick={() => setAdvanceModal(null)} className="btn-secondary flex-1">Cancel</button>
        </div>
      </div>
    );
  }

  // Get contextual title for advance modal
  function getAdvanceTitle() {
    if (!advanceModal) return 'Advance Calling';
    const stage = advanceModal.stage;
    if (stage === 'identified') return 'Begin Discussion';
    if (stage === 'discussed') return 'Select Candidate';
    if (stage === 'prayed_about') return 'Assign to Extend';
    if (stage === 'assigned_to_extend') return 'Mark Extended';
    if (stage === 'extended') return 'Response';
    if (stage === 'accepted') return 'Add to Sustainings';
    if (stage === 'sustained') return 'Schedule Set Apart';
    if (stage === 'set_apart') return 'Begin Serving';
    return 'Advance Calling';
  }

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <GitBranch size={24} className="text-primary-700" />
          <h1 className="text-2xl font-bold text-gray-900">Calling Pipeline</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* 3-way view toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {[
              { key: 'list', icon: List, label: 'List' },
              { key: 'kanban', icon: LayoutGrid, label: 'Board' },
              { key: 'orgchart', icon: Users, label: 'Org' },
            ].map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`p-1.5 rounded-md transition-colors ${
                  view === key
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
                title={label}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
          {view !== 'orgchart' && (
            <button
              onClick={() => openAdd()}
              className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-800"
            >
              <Plus size={16} />
              Add
            </button>
          )}
        </div>
      </div>

      {/* Needs Dashboard */}
      <NeedsDashboard
        onSelectSlot={openEdit}
        onAddCandidate={(slot) => setCandidateSlot(slot)}
        onOrgFilter={(orgKey) => {
          setOrgFilter(orgFilter === orgKey ? null : orgKey);
        }}
        activeOrgFilter={orgFilter}
      />

      {activeCount > 0 && (
        <p className="text-xs text-gray-400 mb-3">
          {activeCount} active calling{activeCount !== 1 ? 's' : ''} in pipeline
        </p>
      )}

      {/* Stage filter chips (orgchart view only) */}
      {view === 'orgchart' && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            onClick={() => setStageFilter(null)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              stageFilter === null
                ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-300'
                : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
            }`}
          >
            All
          </button>
          {DISPLAY_STAGE_GROUPS.map(group => {
            const count = slots.filter(s => group.stages.includes(s.stage)).length;
            return (
              <button
                key={group.key}
                onClick={() => setStageFilter(stageFilter === group.key ? null : group.key)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                  stageFilter === group.key
                    ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-300'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
              >
                <span>{group.label}</span>
                {count > 0 && (
                  <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[16px] text-center ${
                    stageFilter === group.key ? 'bg-primary-200 text-primary-800' : 'bg-gray-200 text-gray-600'
                  }`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Pipeline tab toggle (call vs release) — for list and kanban views */}
      {view !== 'orgchart' && (
        <div className="flex bg-gray-100 rounded-lg p-0.5 mb-4">
          <button
            onClick={() => setPipelineTab('call')}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
              pipelineTab === 'call' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-400'
            }`}
          >
            Call Pipeline
          </button>
          <button
            onClick={() => setPipelineTab('release')}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
              pipelineTab === 'release' ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-400'
            }`}
          >
            Release Track
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <div className="animate-spin w-6 h-6 border-2 border-primary-300 border-t-primary-700 rounded-full mx-auto mb-3" />
          <p className="text-sm">Loading...</p>
        </div>
      ) : slots.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          <GitBranch size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No callings in the pipeline yet.</p>
          <p className="text-xs text-gray-400 mt-1">Track calling changes from identification through setting apart.</p>
          <button onClick={() => openAdd()} className="btn-primary mt-3 text-sm">
            <Plus size={14} className="inline mr-1" />
            Add First Calling
          </button>
        </div>
      ) : view === 'orgchart' ? (
        <OrgChart
          onEditSlot={openEdit}
          onAddSlot={(parentId, organization) => openAdd(parentId, organization)}
          onAddCandidate={(node) => setCandidateSlot(node)}
          onBeginRelease={handleBeginRelease}
          onAdvance={openAdvanceModal}
          onNavigateSettings={() => navigate('/settings')}
          stageFilter={stageFilter}
          orgFilter={orgFilter}
          onClearOrgFilter={() => setOrgFilter(null)}
        />
      ) : view === 'kanban' ? (
        <KanbanView
          slotsByStage={slotsByStage}
          displayStages={displayStages}
          onSlotPress={openEdit}
          onAdvance={openAdvanceModal}
          onDecline={handleDecline}
          onReturn={handleReturnToDiscussed}
          onBeginRelease={handleBeginRelease}
          onAddCandidate={(slot) => setCandidateSlot(slot)}
          getOrgLabel={getOrgLabel}
          getNextStage={getNextStage}
        />
      ) : (
        <ListView
          slotsByStage={slotsByStage}
          displayStages={displayStages}
          onSlotPress={openEdit}
          onAdvance={openAdvanceModal}
          onDecline={handleDecline}
          onReturn={handleReturnToDiscussed}
          onBeginRelease={handleBeginRelease}
          onAddCandidate={(slot) => setCandidateSlot(slot)}
          getOrgLabel={getOrgLabel}
          getNextStage={getNextStage}
        />
      )}

      {/* Calling Slot Form */}
      <CallingSlotForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setParentSlotId(null); setAddOrg(null); }}
        slot={editSlot}
        parentSlotId={parentSlotId}
        prefilledOrganization={addOrg}
        allSlots={slots}
        onSave={async (data) => {
          if (editSlot) {
            await update(editSlot.id, data);
          } else {
            await add(data);
          }
          setFormOpen(false);
          setParentSlotId(null);
          setAddOrg(null);
        }}
        onDelete={editSlot ? async () => { await remove(editSlot.id); setFormOpen(false); } : null}
        onOpenCandidates={(slot) => { setFormOpen(false); setCandidateSlot(slot); }}
      />

      {/* Candidate Manager */}
      <CandidateManager
        open={!!candidateSlot}
        onClose={() => setCandidateSlot(null)}
        slot={candidateSlot}
        onAccepted={(slot) => {
          // If someone is currently serving, offer to begin release
          if (slot.stage === 'serving' && slot.servedBy) {
            handleBeginRelease(slot);
          }
        }}
      />

      {/* Contextual Advance Modal */}
      <Modal
        open={!!advanceModal}
        onClose={() => setAdvanceModal(null)}
        title={getAdvanceTitle()}
        size="sm"
      >
        {renderAdvanceContent()}
      </Modal>

      {/* Auto-release prompt (after acceptance) */}
      <Modal
        open={!!autoReleasePrompt}
        onClose={() => setAutoReleasePrompt(null)}
        title="Release Current Holder?"
        size="sm"
      >
        {autoReleasePrompt && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              <span className="font-medium">{autoReleasePrompt.servedBy}</span> is currently serving as{' '}
              <span className="font-medium">{autoReleasePrompt.slot.roleName}</span>. Would you like to begin the release process?
            </p>
            <div className="flex gap-3">
              <button onClick={confirmAutoRelease} className="btn-primary flex-1">
                Begin Release
              </button>
              <button onClick={() => setAutoReleasePrompt(null)} className="btn-secondary flex-1">
                Not Now
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Begin Release modal */}
      <Modal
        open={!!releaseModal}
        onClose={() => setReleaseModal(null)}
        title="Begin Release"
        size="sm"
      >
        {releaseModal && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              Begin release process for{' '}
              <span className="font-medium">{releaseModal.servedBy || releaseModal.candidateName}</span>{' '}
              from <span className="font-medium">{releaseModal.roleName}</span>?
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Release Target</label>
              <input
                type="text"
                value={releaseTarget}
                onChange={e => setReleaseTarget(e.target.value)}
                placeholder='e.g., "Sacrament Meeting March 2"'
                className="input-field text-sm"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={confirmRelease} className="btn-primary flex-1">
                Begin Release
              </button>
              <button onClick={() => setReleaseModal(null)} className="btn-secondary flex-1">
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* AI Chat */}
      {isAiConfigured() && <CallingChat slots={slots} />}
    </div>
  );
}

// ── Kanban View ─────────────────────────────────────────────

function KanbanView({ slotsByStage, displayStages, onSlotPress, onAdvance, onDecline, onReturn, onBeginRelease, onAddCandidate, getOrgLabel, getNextStage }) {
  return (
    <div className="overflow-x-auto -mx-4 px-4 no-scrollbar">
      <div className="flex gap-3" style={{ minWidth: `${displayStages.length * 240}px` }}>
        {displayStages.map(stageKey => {
          const config = CALLING_STAGES[stageKey];
          const stageSlots = slotsByStage[stageKey] || [];
          const isDeclined = stageKey === 'declined';

          return (
            <div key={stageKey} className="w-56 flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {config?.label || stageKey}
                </h3>
                {stageSlots.length > 0 && (
                  <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">
                    {stageSlots.length}
                  </span>
                )}
              </div>
              <div className="space-y-2 min-h-[80px] bg-gray-50 rounded-xl p-2">
                {stageSlots.length === 0 ? (
                  <p className="text-[10px] text-gray-300 text-center py-4">Empty</p>
                ) : (
                  stageSlots.map(slot => (
                    <SlotCard
                      key={slot.id}
                      slot={slot}
                      onPress={() => onSlotPress(slot)}
                      onAdvance={() => onAdvance(slot)}
                      onDecline={!isDeclined && slot.stage === 'extended' ? () => onDecline(slot) : null}
                      onReturn={isDeclined ? () => onReturn(slot) : null}
                      onBeginRelease={slot.stage === 'serving' ? () => onBeginRelease(slot) : null}
                      onAddCandidate={() => onAddCandidate(slot)}
                      getOrgLabel={getOrgLabel}
                      getNextStage={getNextStage}
                      compact
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── List View ───────────────────────────────────────────────

function ListView({ slotsByStage, displayStages, onSlotPress, onAdvance, onDecline, onReturn, onBeginRelease, onAddCandidate, getOrgLabel, getNextStage }) {
  const [collapsed, setCollapsed] = useState({});

  function toggle(stage) {
    setCollapsed(prev => ({ ...prev, [stage]: !prev[stage] }));
  }

  return (
    <div className="space-y-4">
      {displayStages.map(stageKey => {
        const config = CALLING_STAGES[stageKey];
        const stageSlots = slotsByStage[stageKey] || [];
        if (stageSlots.length === 0) return null;

        const isCollapsed = collapsed[stageKey];
        const isDeclined = stageKey === 'declined';

        return (
          <div key={stageKey}>
            <button
              onClick={() => toggle(stageKey)}
              className="flex items-center gap-1.5 w-full text-left mb-2"
            >
              {isCollapsed ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {config?.label || stageKey}
              </h3>
              <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">
                {stageSlots.length}
              </span>
            </button>
            {!isCollapsed && (
              <div className="space-y-2">
                {stageSlots.map(slot => (
                  <SlotCard
                    key={slot.id}
                    slot={slot}
                    onPress={() => onSlotPress(slot)}
                    onAdvance={() => onAdvance(slot)}
                    onDecline={!isDeclined && slot.stage === 'extended' ? () => onDecline(slot) : null}
                    onReturn={isDeclined ? () => onReturn(slot) : null}
                    onBeginRelease={slot.stage === 'serving' ? () => onBeginRelease(slot) : null}
                    onAddCandidate={() => onAddCandidate(slot)}
                    getOrgLabel={getOrgLabel}
                    getNextStage={getNextStage}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Slot Card ───────────────────────────────────────────────

function SlotCard({ slot, onPress, onAdvance, onDecline, onReturn, onBeginRelease, onAddCandidate, getOrgLabel, getNextStage, compact }) {
  const nextStage = getNextStage(slot.stage);
  const isTerminal = slot.stage === 'released' || (slot.stage === 'serving' && !nextStage);
  const serviceInfo = slot.stage === 'serving' && slot.servingSince ? getServiceMonths(slot.servingSince) : null;

  return (
    <div
      onClick={onPress}
      className={`card cursor-pointer hover:border-primary-200 transition-colors ${compact ? 'p-2.5' : 'p-3'}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {/* Priority dot */}
            {slot.priority && slot.priority !== 'medium' && (
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                slot.priority === 'high' ? 'bg-red-400' : 'bg-green-400'
              }`} />
            )}
            <p className={`font-medium text-gray-900 truncate ${compact ? 'text-xs' : 'text-sm'}`}>
              {slot.roleName}
            </p>
          </div>
          {(slot.servedBy || slot.candidateName) && (
            <p className={`text-gray-600 ${compact ? 'text-[10px]' : 'text-xs'}`}>
              {slot.servedBy || slot.candidateName}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className={`text-gray-400 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
              {getOrgLabel(slot.organization)}
            </p>
            {serviceInfo && (
              <span className="text-[10px] text-gray-300">
                &middot; {serviceInfo}mo
              </span>
            )}
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {(slot.expectedCount || 1) > 1 && (
            <span className="text-[9px] font-medium bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full">
              {slot.currentCount || 0}/{slot.expectedCount}
            </span>
          )}
          {slot.candidates?.length > 0 && (
            <span className="text-[9px] font-medium bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">
              {slot.candidates.length} name{slot.candidates.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-2" onClick={e => e.stopPropagation()}>
        {!isTerminal && nextStage && slot.stage !== 'serving' && (
          <button
            onClick={onAdvance}
            className="flex items-center gap-0.5 text-[10px] text-primary-600 hover:text-primary-800 font-medium"
          >
            <ArrowRight size={10} />
            {CALLING_STAGES[nextStage]?.label || 'Advance'}
          </button>
        )}
        {onBeginRelease && (
          <button
            onClick={onBeginRelease}
            className="flex items-center gap-0.5 text-[10px] text-amber-600 hover:text-amber-800 font-medium"
          >
            <Clock size={10} />
            Begin Release
          </button>
        )}
        {['release_planned', 'release_meeting'].includes(slot.stage) && nextStage && (
          <button
            onClick={onAdvance}
            className="flex items-center gap-0.5 text-[10px] text-amber-600 hover:text-amber-800 font-medium"
          >
            <ArrowRight size={10} />
            {CALLING_STAGES[nextStage]?.label}
          </button>
        )}
        {onDecline && (
          <button
            onClick={onDecline}
            className="flex items-center gap-0.5 text-[10px] text-red-500 hover:text-red-700 font-medium"
          >
            <AlertTriangle size={10} />
            Declined
          </button>
        )}
        {onReturn && (
          <button
            onClick={onReturn}
            className="flex items-center gap-0.5 text-[10px] text-blue-500 hover:text-blue-700 font-medium"
          >
            <RotateCcw size={10} />
            Return
          </button>
        )}
        {!slot.candidateName && slot.stage === 'identified' && (
          <button
            onClick={onAddCandidate}
            className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-primary-600 font-medium ml-auto"
          >
            <UserPlus size={10} />
            Add Name
          </button>
        )}
      </div>
    </div>
  );
}

function getServiceMonths(servingSince) {
  if (!servingSince) return null;
  const start = new Date(servingSince).getTime();
  const now = Date.now();
  return Math.round((now - start) / (1000 * 60 * 60 * 24 * 30.44));
}
