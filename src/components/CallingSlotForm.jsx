import { useState, useEffect } from 'react';
import Modal from './shared/Modal';
import { CALLING_STAGES, CALL_STAGE_ORDER, RELEASE_STAGE_ORDER, CALLING_PRIORITIES } from '../utils/constants';
import { ORGANIZATIONS } from '../data/callings';
import { usePeople } from '../hooks/useDb';
import { Trash2, Users } from 'lucide-react';

const EMPTY = {
  organization: '',
  roleName: '',
  candidateName: '',
  personId: null,
  stage: 'identified',
  notes: '',
  parentSlotId: null,
  priority: 'medium',
  expectedCount: 1,
  recommendedServiceMonths: '',
  releaseTarget: '',
  presidingOfficer: '',
};

export default function CallingSlotForm({ open, onClose, slot, onSave, onDelete, parentSlotId, allSlots = [], onOpenCandidates }) {
  const isEdit = !!slot;
  const { people } = usePeople();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPeoplePicker, setShowPeoplePicker] = useState(false);

  useEffect(() => {
    if (open) {
      if (slot) {
        setForm({
          ...EMPTY,
          ...slot,
          recommendedServiceMonths: slot.recommendedServiceMonths ?? '',
          releaseTarget: slot.releaseTarget ?? '',
          presidingOfficer: slot.presidingOfficer ?? '',
          expectedCount: slot.expectedCount ?? 1,
          priority: slot.priority ?? 'medium',
        });
      } else {
        const parentId = parentSlotId || null;
        const parent = parentId ? allSlots.find(s => s.id === parentId) : null;
        setForm({
          ...EMPTY,
          parentSlotId: parentId,
          organization: parent?.organization || '',
          isCustomPosition: true,
        });
      }
      setConfirmDelete(false);
    }
  }, [open, slot, parentSlotId]);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function selectPerson(person) {
    set('candidateName', person.name);
    set('personId', person.id);
    setShowPeoplePicker(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.roleName.trim() || saving) return;
    setSaving(true);
    try {
      const data = {
        organization: form.organization || undefined,
        roleName: form.roleName.trim(),
        candidateName: form.candidateName.trim() || undefined,
        personId: form.personId || undefined,
        stage: form.stage,
        notes: form.notes.trim() || undefined,
        parentSlotId: form.parentSlotId || null,
        priority: form.priority || 'medium',
        expectedCount: parseInt(form.expectedCount) || 1,
        recommendedServiceMonths: form.recommendedServiceMonths ? parseInt(form.recommendedServiceMonths) : null,
        releaseTarget: form.releaseTarget.trim() || undefined,
        presidingOfficer: form.presidingOfficer.trim() || undefined,
      };
      if (!isEdit && form.isCustomPosition) {
        data.isCustomPosition = true;
      }
      await onSave(data);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (onDelete) await onDelete();
  }

  // Build stage options — call track + release track + declined
  const allStages = [...CALL_STAGE_ORDER, ...RELEASE_STAGE_ORDER.filter(s => s !== 'serving'), 'declined'];
  // Deduplicate
  const stageOptions = [...new Set(allStages)];

  const parentOptions = allSlots
    .filter(s => !isEdit || s.id !== slot?.id)
    .sort((a, b) => (a.tier || 0) - (b.tier || 0));

  const candidateCount = slot?.candidates?.length || 0;
  const isReleaseTrack = ['release_planned', 'release_meeting'].includes(form.stage);

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Calling Slot' : 'New Calling Slot'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Organization */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Organization</label>
          <select
            value={form.organization}
            onChange={e => set('organization', e.target.value)}
            className="input-field"
          >
            <option value="">Select organization</option>
            {ORGANIZATIONS.map(org => (
              <option key={org.key} value={org.key}>{org.label}</option>
            ))}
          </select>
        </div>

        {/* Role Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Calling / Role</label>
          <input
            type="text"
            value={form.roleName}
            onChange={e => set('roleName', e.target.value)}
            placeholder="e.g., EQ 2nd Counselor, Nursery Leader"
            className="input-field"
            autoFocus
          />
        </div>

        {/* Priority + Expected Count (side by side) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={form.priority}
              onChange={e => set('priority', e.target.value)}
              className="input-field"
            >
              {Object.values(CALLING_PRIORITIES).map(p => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">How Many Needed</label>
            <input
              type="number"
              min="1"
              max="20"
              value={form.expectedCount}
              onChange={e => set('expectedCount', e.target.value)}
              className="input-field"
            />
          </div>
        </div>

        {/* Reports To (parent position) */}
        {parentOptions.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reports To</label>
            <select
              value={form.parentSlotId || ''}
              onChange={e => set('parentSlotId', e.target.value ? Number(e.target.value) : null)}
              className="input-field"
            >
              <option value="">No parent (top-level)</option>
              {parentOptions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.roleName}{s.candidateName ? ` — ${s.candidateName}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Presiding Officer */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Presiding Officer</label>
          <input
            type="text"
            value={form.presidingOfficer}
            onChange={e => set('presidingOfficer', e.target.value)}
            placeholder='e.g., "Bishop", "EQ President"'
            className="input-field"
          />
        </div>

        {/* Candidate */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Candidate</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={form.candidateName}
              onChange={e => { set('candidateName', e.target.value); set('personId', null); }}
              placeholder="Name (type or pick from people)"
              className="input-field flex-1"
            />
            {people.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPeoplePicker(!showPeoplePicker)}
                className="btn-secondary text-xs px-3"
              >
                Pick
              </button>
            )}
          </div>
          {showPeoplePicker && (
            <div className="mt-2 max-h-32 overflow-y-auto border border-gray-200 rounded-lg">
              {people.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectPerson(p)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50 border-b border-gray-100 last:border-0"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Candidates section (edit mode) */}
        {isEdit && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenCandidates?.(slot)}
              className="flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-800 bg-primary-50 px-3 py-2 rounded-lg transition-colors"
            >
              <Users size={14} />
              {candidateCount > 0
                ? `${candidateCount} Candidate${candidateCount !== 1 ? 's' : ''} — Review`
                : 'Manage Candidates'}
            </button>
          </div>
        )}

        {/* Stage (edit mode) */}
        {isEdit && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Stage</label>
            <select
              value={form.stage}
              onChange={e => set('stage', e.target.value)}
              className="input-field"
            >
              {stageOptions.map(key => (
                <option key={key} value={key}>{CALLING_STAGES[key]?.label || key}</option>
              ))}
            </select>
          </div>
        )}

        {/* Service Length (recommended) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Recommended Service Length (months)</label>
          <input
            type="number"
            min="0"
            max="120"
            value={form.recommendedServiceMonths}
            onChange={e => set('recommendedServiceMonths', e.target.value)}
            placeholder="Leave blank for no limit"
            className="input-field"
          />
          <p className="text-[10px] text-gray-400 mt-0.5">Alerts will appear 2-3 months before this target</p>
        </div>

        {/* Release Target (shown for release-track stages) */}
        {isReleaseTrack && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Release Target</label>
            <input
              type="text"
              value={form.releaseTarget}
              onChange={e => set('releaseTarget', e.target.value)}
              placeholder='e.g., "Sacrament Meeting March 2"'
              className="input-field"
            />
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Private notes about this calling change..."
            rows={2}
            className="input-field text-xs"
          />
        </div>

        {/* History (edit mode) */}
        {isEdit && slot?.history?.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Transition History</label>
            <div className="space-y-1">
              {slot.history.map((h, i) => (
                <div key={i} className="text-[10px] text-gray-400 flex items-center gap-1">
                  <span>{CALLING_STAGES[h.from]?.label || h.from}</span>
                  <span>&rarr;</span>
                  <span className="font-medium text-gray-600">{CALLING_STAGES[h.to]?.label || h.to}</span>
                  <span className="ml-auto">{new Date(h.date).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={!form.roleName.trim() || saving} className="btn-primary flex-1">
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
        </div>

        {/* Delete (edit mode) */}
        {isEdit && onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
              ${confirmDelete ? 'bg-red-600 text-white' : 'text-red-600 hover:bg-red-50'}`}
          >
            <Trash2 size={14} />
            {confirmDelete ? 'Tap again to delete' : 'Delete'}
          </button>
        )}
      </form>
    </Modal>
  );
}
