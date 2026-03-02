import { useState, useEffect } from 'react';
import Modal from './shared/Modal';
import MeetingPicker from './shared/MeetingPicker';
import { PRIORITY_LIST, CONTEXT_LIST, CADENCE_LIST, TASK_TYPE_LIST } from '../utils/constants';
import { useMeetings, usePeople } from '../hooks/useDb';
import { Star, Trash2, RotateCw, Calendar, UserCircle, X } from 'lucide-react';

const EMPTY_FORM = {
  title: '',
  description: '',
  type: 'action_item',
  priority: 'medium',
  context: '',
  dueDate: '',
  starred: false,
  isRecurring: false,
  recurringCadence: '',
  eventDate: '',
  organization: '',
};

export default function ActionItemForm({ open, onClose, onSave, onDelete, item }) {
  const isEdit = !!item;
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [meetingPickerOpen, setMeetingPickerOpen] = useState(false);
  const [meetingIds, setMeetingIds] = useState([]);
  const [assignedTo, setAssignedTo] = useState(null);
  const [assigneeInput, setAssigneeInput] = useState('');
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const { meetings: allMeetings } = useMeetings();
  const { people } = usePeople();

  useEffect(() => {
    if (open) {
      setForm(item ? { ...EMPTY_FORM, ...item } : EMPTY_FORM);
      // Support both old targetMeetingIds and new meetingIds
      setMeetingIds(item?.meetingIds || item?.targetMeetingIds || []);
      setAssignedTo(item?.assignedTo || null);
      setAssigneeInput('');
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
        type: form.type || 'action_item',
        title: form.title.trim(),
        description: form.description.trim(),
        priority: form.priority,
        context: form.context || undefined,
        dueDate: form.dueDate || undefined,
        starred: form.starred,
        isRecurring: form.isRecurring,
        recurringCadence: form.isRecurring ? form.recurringCadence : undefined,
        meetingIds: meetingIds.length > 0 ? meetingIds : [],
        assignedTo: assignedTo || null,
      };

      // Type-specific fields
      if (form.type === 'event') {
        data.eventDate = form.eventDate || form.dueDate || undefined;
        data.organization = form.organization || undefined;
      }

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

  const showActionFields = form.type === 'action_item';
  const showEventFields = form.type === 'event';

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Task' : 'New Task'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Type selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <div className="flex gap-1.5 flex-wrap">
            {TASK_TYPE_LIST.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => set('type', t.key)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors
                  ${form.type === t.key
                    ? 'bg-primary-700 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

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

        {/* Event-specific fields */}
        {showEventFields && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event Date</label>
              <input
                type="date"
                value={form.eventDate}
                onChange={e => set('eventDate', e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Organization</label>
              <input
                type="text"
                value={form.organization}
                onChange={e => set('organization', e.target.value)}
                placeholder="Organization (optional)"
                className="input-field"
              />
            </div>
          </>
        )}

        {/* Priority & Context row (mainly for action items but useful for all) */}
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
          {showActionFields && (
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
          )}
        </div>

        {/* Due Date */}
        {!showEventFields && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={e => set('dueDate', e.target.value)}
              className="input-field"
            />
          </div>
        )}

        {/* Assigned To */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
          {assignedTo ? (
            <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg">
              <UserCircle size={16} className="text-primary-500" />
              <span className="text-sm text-gray-800 flex-1">{assignedTo.name}</span>
              <button type="button" onClick={() => setAssignedTo(null)} className="text-gray-400 hover:text-red-500">
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                type="text"
                value={assigneeInput}
                onChange={e => {
                  setAssigneeInput(e.target.value);
                  setShowAssigneePicker(e.target.value.length >= 2);
                }}
                onFocus={() => { if (assigneeInput.length >= 2) setShowAssigneePicker(true); }}
                onBlur={() => setTimeout(() => setShowAssigneePicker(false), 150)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && assigneeInput.trim()) {
                    e.preventDefault();
                    setAssignedTo({ type: 'person', id: null, name: assigneeInput.trim() });
                    setAssigneeInput('');
                    setShowAssigneePicker(false);
                  }
                }}
                placeholder="Type a name or press Enter for free text..."
                className="input-field"
              />
              {showAssigneePicker && (() => {
                const q = assigneeInput.toLowerCase();
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
                          setAssignedTo({ type: 'person', id: p.id, name: p.name });
                          setAssigneeInput('');
                          setShowAssigneePicker(false);
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

        {/* Recurring toggle (action items only) */}
        {showActionFields && (
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
        )}

        {/* Report to meetings */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Linked Meetings</label>
          <button
            type="button"
            onClick={() => setMeetingPickerOpen(true)}
            className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <Calendar size={14} className="text-gray-400" />
            {meetingIds.length > 0 ? (
              <span className="flex-1">
                {meetingIds.map(id => allMeetings.find(m => m.id === id)?.name || 'Meeting').join(', ')}
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

      {/* Meeting picker for linked meetings */}
      <MeetingPicker
        open={meetingPickerOpen}
        onClose={() => setMeetingPickerOpen(false)}
        onSelect={(mtg) => {
          setMeetingIds(prev =>
            prev.includes(mtg.id) ? prev.filter(id => id !== mtg.id) : [...prev, mtg.id]
          );
        }}
        multiSelect
        selectedIds={meetingIds}
        onConfirm={(ids) => setMeetingIds(ids)}
        title="Link to Meetings"
      />
    </Modal>
  );
}
