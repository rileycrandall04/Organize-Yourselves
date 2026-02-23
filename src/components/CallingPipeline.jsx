import { useState, useMemo } from 'react';
import { useCallingSlots, usePeople } from '../hooks/useDb';
import { transitionCallingSlot, startRelease } from '../db';
import { CALLING_STAGES, CALL_STAGE_ORDER, RELEASE_STAGE_ORDER, CALLING_PRIORITIES } from '../utils/constants';
import { ORGANIZATIONS } from '../data/callings';
import Modal from './shared/Modal';
import {
  ArrowLeft, GitBranch, Plus, ArrowRight, RotateCcw, List, LayoutGrid,
  ChevronDown, ChevronRight, AlertTriangle, Users, Clock, UserPlus,
} from 'lucide-react';
import CallingSlotForm from './CallingSlotForm';
import OrgChart from './OrgChart';
import NeedsDashboard from './NeedsDashboard';
import CandidateManager from './CandidateManager';

export default function CallingPipeline({ onBack }) {
  const { slots, loading, add, update, remove } = useCallingSlots();
  const [view, setView] = useState('list'); // 'list' | 'kanban' | 'orgchart'
  const [pipelineTab, setPipelineTab] = useState('call'); // 'call' | 'release'
  const [formOpen, setFormOpen] = useState(false);
  const [editSlot, setEditSlot] = useState(null);
  const [parentSlotId, setParentSlotId] = useState(null);
  const [advanceModal, setAdvanceModal] = useState(null);
  const [advanceNote, setAdvanceNote] = useState('');
  const [advancing, setAdvancing] = useState(false);
  const [candidateSlot, setCandidateSlot] = useState(null);
  const [releaseModal, setReleaseModal] = useState(null);
  const [releaseTarget, setReleaseTarget] = useState('');

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

  function openAdd(parentId) {
    setEditSlot(null);
    setParentSlotId(parentId || null);
    setFormOpen(true);
  }

  function openEdit(slot) {
    setEditSlot(slot);
    setParentSlotId(null);
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
  }

  async function handleAdvance() {
    if (!advanceModal || advancing) return;
    setAdvancing(true);
    try {
      const nextStage = getNextStage(advanceModal.stage);
      if (nextStage) {
        await transitionCallingSlot(advanceModal.id, nextStage, advanceNote.trim());
      }
      setAdvanceModal(null);
    } finally {
      setAdvancing(false);
    }
  }

  async function handleDecline(slot) {
    await transitionCallingSlot(slot.id, 'declined', '');
  }

  async function handleReturnToIdentified(slot) {
    await transitionCallingSlot(slot.id, 'identified', 'Returned after decline');
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

  function getOrgLabel(orgKey) {
    const org = ORGANIZATIONS.find(o => o.key === orgKey);
    return org?.label || orgKey || '';
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
          <button
            onClick={() => openAdd()}
            className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-800"
          >
            <Plus size={16} />
            Add
          </button>
        </div>
      </div>

      {/* Needs Dashboard */}
      <NeedsDashboard
        onSelectSlot={openEdit}
        onAddCandidate={(slot) => setCandidateSlot(slot)}
      />

      {activeCount > 0 && (
        <p className="text-xs text-gray-400 mb-4">
          {activeCount} active calling{activeCount !== 1 ? 's' : ''} in pipeline
        </p>
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
          <button onClick={openAdd} className="btn-primary mt-3 text-sm">
            <Plus size={14} className="inline mr-1" />
            Add First Calling
          </button>
        </div>
      ) : view === 'orgchart' ? (
        <OrgChart
          onEditSlot={openEdit}
          onAddChild={(parentNode) => openAdd(parentNode.id)}
          onAddCandidate={(node) => setCandidateSlot(node)}
          onBeginRelease={handleBeginRelease}
          onAdvance={openAdvanceModal}
        />
      ) : view === 'kanban' ? (
        <KanbanView
          slotsByStage={slotsByStage}
          displayStages={displayStages}
          onSlotPress={openEdit}
          onAdvance={openAdvanceModal}
          onDecline={handleDecline}
          onReturn={handleReturnToIdentified}
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
          onReturn={handleReturnToIdentified}
          onBeginRelease={handleBeginRelease}
          onAddCandidate={(slot) => setCandidateSlot(slot)}
          getOrgLabel={getOrgLabel}
          getNextStage={getNextStage}
        />
      )}

      {/* Calling Slot Form */}
      <CallingSlotForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setParentSlotId(null); }}
        slot={editSlot}
        parentSlotId={parentSlotId}
        allSlots={slots}
        onSave={async (data) => {
          if (editSlot) {
            await update(editSlot.id, data);
          } else {
            await add(data);
          }
          setFormOpen(false);
          setParentSlotId(null);
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

      {/* Advance confirmation modal */}
      <Modal
        open={!!advanceModal}
        onClose={() => setAdvanceModal(null)}
        title="Advance Calling"
        size="sm"
      >
        {advanceModal && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              Move <span className="font-medium">{advanceModal.roleName}</span> from{' '}
              <span className="font-medium">{CALLING_STAGES[advanceModal.stage]?.label}</span> to{' '}
              <span className="font-medium text-primary-700">
                {CALLING_STAGES[getNextStage(advanceModal.stage)]?.label}
              </span>?
            </p>
            {advanceModal.candidateName && (
              <p className="text-xs text-gray-500">Candidate: {advanceModal.candidateName}</p>
            )}
            <textarea
              value={advanceNote}
              onChange={e => setAdvanceNote(e.target.value)}
              placeholder="Optional note about this transition..."
              rows={2}
              className="input-field text-xs"
            />
            <p className="text-[10px] text-gray-400">
              Action items may be auto-created for this stage.
            </p>
            <div className="flex gap-3">
              <button onClick={handleAdvance} disabled={advancing} className="btn-primary flex-1">
                {advancing ? 'Advancing...' : 'Confirm'}
              </button>
              <button onClick={() => setAdvanceModal(null)} className="btn-secondary flex-1">
                Cancel
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
  const priorityConfig = CALLING_PRIORITIES[slot.priority];
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
