import { useState, useEffect } from 'react';
import Modal from './shared/Modal';
import MeetingPicker from './shared/MeetingPicker';
import { PRIORITY_LIST, CONTEXT_LIST, CADENCE_LIST } from '../utils/constants';
import { useMeetings } from '../hooks/useDb';
import { Star, Trash2, RotateCw, Calendar } from 'lucide-react';

const EMPTY_FORM = {
  title: '',
  description: '',
  priority: 'medium',
  context: '',
  dueDate: '',
  starred: false,
  isRecurring: false,
  recurringCadence: '',
};

export default function ActionItemForm({ open, onClose, onSave, onDelete, item }) {
  const isEdit = !!item;
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [meetingPickerOpen, setMeetingPickerOpen] = useState(false);
  const [targetMeetingIds, setTargetMeetingIds] = useState([]);
  const { meetings: allMeetings } = useMeetings();

  useEffect(() => {
    if (open) {
      setForm(item ? { ...EMPTY_FORM, ...item } : EMPTY_FORM);
      setTargetMeetingIds(item?.targetMeetingIds || []);
      setConfirmDelete(false);
    }
  }, [open, item]);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || saving) return;
    setSaving(true);
    try {
      const data = {
        title: form.title.trim(),
        description: form.description.trim(),
        priority: form.priority,
        context: form.context || undefined,
        dueDate: form.dueDate || undefined,
        starred: form.starred,
        isRecurring: form.isRecurring,
        recurringCadence: form.isRecurring ? form.recurringCadence : undefined,
        targetMeetingIds: targetMeetingIds.length > 0 ? targetMeetingIds : [],
      };
      await onSave(data, item?.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDelete(item.id);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Action Item' : 'New Action Item'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="What needs to be done?"
            className="input-field"
            autoFocus
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Additional details (optional)"
            rows={2}
            className="input-field"
          />
        </div>

        {/* Priority & Context row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={form.priority}
              onChange={e => set('priority', e.target.value)}
              className="input-field"
            >
              {PRIORITY_LIST.map(p => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Context</label>
            <select
              value={form.context}
              onChange={e => set('context', e.target.value)}
              className="input-field"
            >
              <option value="">Any</option>
              {CONTEXT_LIST.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Due Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
          <input
            type="date"
            value={form.dueDate}
            onChange={e => set('dueDate', e.target.value)}
            className="input-field"
          />
        </div>

        {/* Star toggle */}
        <button
          type="button"
          onClick={() => set('starred', !form.starred)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm
            ${form.starred ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
        >
          <Star size={16} className={form.starred ? 'fill-amber-400 text-amber-400' : ''} />
          {form.starred ? 'Focus item' : 'Mark as focus item'}
        </button>

        {/* Recurring toggle */}
        <div>
          <button
            type="button"
            onClick={() => set('isRecurring', !form.isRecurring)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm
              ${form.isRecurring ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
          >
            <RotateCw size={16} />
            {form.isRecurring ? 'Recurring' : 'Make recurring'}
          </button>
          {form.isRecurring && (
            <select
              value={form.recurringCadence}
              onChange={e => set('recurringCadence', e.target.value)}
              className="input-field mt-2"
            >
              <option value="">Select cadence</option>
              {CADENCE_LIST.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          )}
        </div>

        {/* Report to meetings */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Report to Meetings</label>
          <button
            type="button"
            onClick={() => setMeetingPickerOpen(true)}
            className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <Calendar size={14} className="text-gray-400" />
            {targetMeetingIds.length > 0 ? (
              <span className="flex-1">
                {targetMeetingIds.map(id => allMeetings.find(m => m.id === id)?.name || 'Meeting').join(', ')}
              </span>
            ) : (
              <span className="flex-1 text-gray-400">Select meetings (optional)</span>
            )}
          </button>
          {item?.sourceMeetingInstanceId && (
            <p className="text-[10px] text-gray-400 mt-1">Created from a meeting instance</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={!form.title.trim() || saving} className="btn-primary flex-1">
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
        </div>

        {/* Delete (edit mode only) */}
        {isEdit && (
          <button
            type="button"
            onClick={handleDelete}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
              ${confirmDelete ? 'bg-red-600 text-white' : 'text-red-600 hover:bg-red-50'}`}
          >
            <Trash2 size={16} />
            {confirmDelete ? 'Tap again to delete' : 'Delete item'}
          </button>
        )}
      </form>

      {/* Meeting picker for target meetings */}
      <MeetingPicker
        open={meetingPickerOpen}
        onClose={() => setMeetingPickerOpen(false)}
        onSelect={(mtg) => {
          setTargetMeetingIds(prev =>
            prev.includes(mtg.id) ? prev.filter(id => id !== mtg.id) : [...prev, mtg.id]
          );
        }}
        multiSelect
        selectedIds={targetMeetingIds}
        onConfirm={(ids) => setTargetMeetingIds(ids)}
        title="Report to Meetings"
      />
    </Modal>
  );
}
