import { useState, useEffect } from 'react';
import Modal from './shared/Modal';
import MeetingPicker from './shared/MeetingPicker';
import { PRIORITY_LIST, CONTEXT_LIST, CADENCE_LIST, TASK_TYPE_LIST } from '../utils/constants';
import { useMeetings, usePeople } from '../hooks/useDb';
import { getIndividuals } from '../db';
import { Star, Trash2, RotateCw, Calendar, UserCircle, X, UserRound, Search } from 'lucide-react';

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
  const [selectedTypes, setSelectedTypes] = useState(['action_item']);
  const [assignedTo, setAssignedTo] = useState(null);
  const [assigneeInput, setAssigneeInput] = useState('');
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [individualMode, setIndividualMode] = useState('new'); // 'new' | 'existing'
  const [existingIndividuals, setExistingIndividuals] = useState([]);
  const [selectedIndividual, setSelectedIndividual] = useState(null);
  const [individualSearch, setIndividualSearch] = useState('');
  const { meetings: allMeetings } = useMeetings();
  const { people } = usePeople();

  useEffect(() => {
    if (open) {
      setForm(item ? { ...EMPTY_FORM, ...item } : EMPTY_FORM);
      // Support both old targetMeetingIds and new meetingIds
      setMeetingIds(item?.meetingIds || item?.targetMeetingIds || []);
      setSelectedTypes(item?.types || (item?.type ? [item.type] : ['action_item']));
      setAssignedTo(item?.assignedTo || null);
      setAssigneeInput('');
      setConfirmDelete(false);
      setIndividualMode('new');
      setSelectedIndividual(null);
      setIndividualSearch('');
    }
  }, [open, item]);

  // Load existing individuals when individual type is selected
  const showIndividualFields = selectedTypes.includes('individual');
  useEffect(() => {
    if (showIndividualFields) {
      getIndividuals(false).then(setExistingIndividuals);
    }
  }, [showIndividualFields]);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;

    // When individual type is selected and user picked an existing one
    if (showIndividualFields && individualMode === 'existing' && selectedIndividual) {
      setSaving(true);
      try {
        // Link existing individual to selected meetings
        const { updateTask } = await import('../db');
        const currentIds = selectedIndividual.meetingIds || [];
        const newMeetingIds = [...new Set([...currentIds, ...meetingIds])];
        await updateTask(selectedIndividual.id, { meetingIds: newMeetingIds });
        onClose();
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const primaryType = selectedTypes[0] || 'action_item';
      const data = {
        type: primaryType,
        types: [...selectedTypes],
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
      if (selectedTypes.includes('event')) {
        data.eventDate = form.eventDate || form.dueDate || undefined;
        data.organization = form.organization || undefined;
      }

      // Individual-specific fields
      if (showIndividualFields && individualMode === 'new') {
        data.status = 'in_progress';
        data.isArchived = false;
        data.checkInCadence = 'monthly';
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

  const showActionFields = selectedTypes.includes('action_item');
  const showEventFields = selectedTypes.includes('event');

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Task' : 'New Task'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Type selector (multi-select) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type <span className="text-gray-400 font-normal">(select multiple)</span></label>
          <div className="flex gap-1.5 flex-wrap">
            {TASK_TYPE_LIST.map(t => {
              const isActive = selectedTypes.includes(t.key);
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setSelectedTypes(prev => {
                      if (prev.includes(t.key)) {
                        if (prev.length <= 1) return prev; // Keep at least one
                        return prev.filter(k => k !== t.key);
                      }
                      return [...prev, t.key];
                    });
                  }}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors
                    ${isActive
                      ? 'bg-primary-700 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Individual: new or existing toggle */}
        {showIndividualFields && !isEdit && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Individual</label>
            {/* Toggle: Create New / Select Existing */}
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => { setIndividualMode('new'); setSelectedIndividual(null); }}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  individualMode === 'new'
                    ? 'bg-cyan-50 text-cyan-700 border-cyan-300'
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Create New
              </button>
              <button
                type="button"
                onClick={() => setIndividualMode('existing')}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  individualMode === 'existing'
                    ? 'bg-cyan-50 text-cyan-700 border-cyan-300'
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Select Existing
              </button>
            </div>

            {individualMode === 'existing' && (
              <div>
                {/* Search field */}
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={individualSearch}
                    onChange={e => setIndividualSearch(e.target.value)}
                    placeholder="Search individuals..."
                    className="input-field pl-8 text-sm"
                  />
                </div>
                {/* Existing individuals list */}
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
                  {existingIndividuals
                    .filter(ind => !individualSearch || (ind.title || '').toLowerCase().includes(individualSearch.toLowerCase()))
                    .map(ind => (
                      <button
                        key={ind.id}
                        type="button"
                        onClick={() => {
                          setSelectedIndividual(ind);
                          set('title', ind.title);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-cyan-50 transition-colors border-b border-gray-100 last:border-0 ${
                          selectedIndividual?.id === ind.id ? 'bg-cyan-50 text-cyan-700' : 'text-gray-700'
                        }`}
                      >
                        <UserRound size={14} className={`flex-shrink-0 ${selectedIndividual?.id === ind.id ? 'text-cyan-600' : 'text-gray-400'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{ind.title}</p>
                          {ind.nextOrdinance && (
                            <p className="text-[10px] text-cyan-600">Next: {ind.nextOrdinance}</p>
                          )}
                        </div>
                        {selectedIndividual?.id === ind.id && (
                          <span className="text-cyan-600 text-xs">✓</span>
                        )}
                      </button>
                    ))
                  }
                  {existingIndividuals.filter(ind => !individualSearch || (ind.title || '').toLowerCase().includes(individualSearch.toLowerCase())).length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-3">
                      {individualSearch ? 'No matches found' : 'No individuals on focus list yet'}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Title (hidden when selecting existing individual) */}
        {!(showIndividualFields && !isEdit && individualMode === 'existing') && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {showIndividualFields && !isEdit ? "Person's Name" : 'Title'}
            </label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder={showIndividualFields && !isEdit ? "Person's name..." : "What needs to be done?"}
              className="input-field"
              autoFocus
            />
          </div>
        )}

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
          <button
            type="submit"
            disabled={
              saving || (
                showIndividualFields && !isEdit && individualMode === 'existing'
                  ? !selectedIndividual
                  : !form.title.trim()
              )
            }
            className="btn-primary flex-1"
          >
            {saving
              ? 'Saving...'
              : isEdit
                ? 'Update'
                : showIndividualFields && individualMode === 'existing'
                  ? 'Link Individual'
                  : 'Create'
            }
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
