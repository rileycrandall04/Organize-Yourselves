import { useState } from 'react';
import { useCallingSlots, usePeople } from '../hooks/useDb';
import { transitionCallingSlot } from '../db';
import { CALLING_STAGES, STAGE_ORDER } from '../utils/constants';
import { ORGANIZATIONS } from '../data/callings';
import { formatRelative } from '../utils/dates';
import Modal from './shared/Modal';
import {
  ArrowLeft, GitBranch, Plus, ArrowRight, RotateCcw, List, LayoutGrid,
  ChevronDown, ChevronRight, AlertTriangle, Trash2,
} from 'lucide-react';
import CallingSlotForm from './CallingSlotForm';

export default function CallingPipeline({ onBack }) {
  const { slots, loading, add, update, remove } = useCallingSlots();
  const [view, setView] = useState('list'); // 'list' or 'kanban'
  const [formOpen, setFormOpen] = useState(false);
  const [editSlot, setEditSlot] = useState(null);
  const [advanceModal, setAdvanceModal] = useState(null);
  const [advanceNote, setAdvanceNote] = useState('');
  const [advancing, setAdvancing] = useState(false);

  // Group slots by stage
  const slotsByStage = {};
  STAGE_ORDER.forEach(s => { slotsByStage[s] = []; });
  slotsByStage['declined'] = [];
  slots.forEach(slot => {
    const stage = slot.stage || 'identified';
    if (slotsByStage[stage]) {
      slotsByStage[stage].push(slot);
    } else {
      slotsByStage['identified'].push(slot);
    }
  });

  const activeCount = slots.filter(s => s.stage !== 'set_apart').length;

  function openAdd() {
    setEditSlot(null);
    setFormOpen(true);
  }

  function openEdit(slot) {
    setEditSlot(slot);
    setFormOpen(true);
  }

  function getNextStage(currentStage) {
    const idx = STAGE_ORDER.indexOf(currentStage);
    if (idx >= 0 && idx < STAGE_ORDER.length - 1) return STAGE_ORDER[idx + 1];
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
          {/* View toggle */}
          <button
            onClick={() => setView(view === 'list' ? 'kanban' : 'list')}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title={view === 'list' ? 'Switch to kanban view' : 'Switch to list view'}
          >
            {view === 'list' ? <LayoutGrid size={18} /> : <List size={18} />}
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-800"
          >
            <Plus size={16} />
            Add
          </button>
        </div>
      </div>

      {activeCount > 0 && (
        <p className="text-xs text-gray-400 mb-4">
          {activeCount} active calling{activeCount !== 1 ? 's' : ''} in pipeline
        </p>
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
      ) : view === 'kanban' ? (
        <KanbanView
          slotsByStage={slotsByStage}
          onSlotPress={openEdit}
          onAdvance={openAdvanceModal}
          onDecline={handleDecline}
          onReturn={handleReturnToIdentified}
          getOrgLabel={getOrgLabel}
        />
      ) : (
        <ListView
          slotsByStage={slotsByStage}
          onSlotPress={openEdit}
          onAdvance={openAdvanceModal}
          onDecline={handleDecline}
          onReturn={handleReturnToIdentified}
          getOrgLabel={getOrgLabel}
        />
      )}

      {/* Calling Slot Form */}
      <CallingSlotForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        slot={editSlot}
        onSave={async (data) => {
          if (editSlot) {
            await update(editSlot.id, data);
          } else {
            await add(data);
          }
          setFormOpen(false);
        }}
        onDelete={editSlot ? async () => { await remove(editSlot.id); setFormOpen(false); } : null}
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
    </div>
  );
}

// ── Kanban View ─────────────────────────────────────────────

function KanbanView({ slotsByStage, onSlotPress, onAdvance, onDecline, onReturn, getOrgLabel }) {
  const allStages = [...STAGE_ORDER, 'declined'];

  return (
    <div className="overflow-x-auto -mx-4 px-4 no-scrollbar">
      <div className="flex gap-3" style={{ minWidth: `${allStages.length * 240}px` }}>
        {allStages.map(stageKey => {
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
                      getOrgLabel={getOrgLabel}
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

function ListView({ slotsByStage, onSlotPress, onAdvance, onDecline, onReturn, getOrgLabel }) {
  const [collapsed, setCollapsed] = useState({});
  const allStages = [...STAGE_ORDER, 'declined'];

  function toggle(stage) {
    setCollapsed(prev => ({ ...prev, [stage]: !prev[stage] }));
  }

  return (
    <div className="space-y-4">
      {allStages.map(stageKey => {
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
                    getOrgLabel={getOrgLabel}
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

function SlotCard({ slot, onPress, onAdvance, onDecline, onReturn, getOrgLabel, compact }) {
  const nextStage = STAGE_ORDER[STAGE_ORDER.indexOf(slot.stage) + 1];
  const isTerminal = slot.stage === 'set_apart';

  return (
    <div
      onClick={onPress}
      className={`card cursor-pointer hover:border-primary-200 transition-colors ${compact ? 'p-2.5' : 'p-3'}`}
    >
      <p className={`font-medium text-gray-900 ${compact ? 'text-xs' : 'text-sm'}`}>
        {slot.roleName}
      </p>
      {slot.candidateName && (
        <p className={`text-gray-600 ${compact ? 'text-[10px]' : 'text-xs'}`}>
          {slot.candidateName}
        </p>
      )}
      <p className={`text-gray-400 mt-0.5 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
        {getOrgLabel(slot.organization)}
      </p>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-2" onClick={e => e.stopPropagation()}>
        {!isTerminal && nextStage && (
          <button
            onClick={onAdvance}
            className="flex items-center gap-0.5 text-[10px] text-primary-600 hover:text-primary-800 font-medium"
          >
            <ArrowRight size={10} />
            {CALLING_STAGES[nextStage]?.label || 'Advance'}
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
            Return to Identified
          </button>
        )}
      </div>
    </div>
  );
}
