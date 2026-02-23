import { useState, useEffect } from 'react';
import Modal from './shared/Modal';
import { CALLING_STAGES, STAGE_ORDER } from '../utils/constants';
import { ORGANIZATIONS } from '../data/callings';
import { usePeople } from '../hooks/useDb';
import { Trash2 } from 'lucide-react';

const EMPTY = {
  organization: '',
  roleName: '',
  candidateName: '',
  personId: null,
  stage: 'identified',
  notes: '',
};

export default function CallingSlotForm({ open, onClose, slot, onSave, onDelete }) {
  const isEdit = !!slot;
  const { people } = usePeople();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPeoplePicker, setShowPeoplePicker] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(slot ? { ...EMPTY, ...slot } : EMPTY);
      setConfirmDelete(false);
    }
  }, [open, slot]);

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
      await onSave({
        organization: form.organization || undefined,
        roleName: form.roleName.trim(),
        candidateName: form.candidateName.trim() || undefined,
        personId: form.personId || undefined,
        stage: form.stage,
        notes: form.notes.trim() || undefined,
      });
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

  const allStages = [...STAGE_ORDER, 'declined'];

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

        {/* Stage (edit mode) */}
        {isEdit && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Stage</label>
            <select
              value={form.stage}
              onChange={e => set('stage', e.target.value)}
              className="input-field"
            >
              {allStages.map(key => (
                <option key={key} value={key}>{CALLING_STAGES[key]?.label || key}</option>
              ))}
            </select>
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
                  <span>→</span>
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
