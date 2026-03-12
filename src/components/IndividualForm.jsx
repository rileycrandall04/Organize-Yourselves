import { useState, useEffect } from 'react';
import Modal from './shared/Modal';
import MeetingPicker from './shared/MeetingPicker';
import { CADENCE_LIST } from '../utils/constants';
import { useMeetings } from '../hooks/useDb';
import { Archive, UserRound } from 'lucide-react';

const EMPTY_FORM = {
  title: '',
  nextOrdinance: '',
  description: '',
  phoneNumber: '',
  checkInCadence: 'monthly',
};

export default function IndividualForm({ open, onClose, onSave, onArchive, item }) {
  const isEdit = !!item;
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [meetingPickerOpen, setMeetingPickerOpen] = useState(false);
  const [meetingIds, setMeetingIds] = useState([]);
  const { meetings: allMeetings } = useMeetings();

  useEffect(() => {
    if (open) {
      setForm(item ? {
        title: item.title || '',
        nextOrdinance: item.nextOrdinance || '',
        description: item.description || '',
        phoneNumber: item.phoneNumber || '',
        checkInCadence: item.checkInCadence || 'monthly',
      } : EMPTY_FORM);
      setMeetingIds(item?.meetingIds || []);
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
        type: 'individual',
        types: ['individual'],
        title: form.title.trim(),
        description: form.description.trim(),
        nextOrdinance: form.nextOrdinance.trim() || undefined,
        phoneNumber: form.phoneNumber.trim() || undefined,
        checkInCadence: form.checkInCadence || undefined,
        status: 'in_progress',
        priority: 'medium',
        isArchived: item?.isArchived ?? false,
        meetingIds: meetingIds.length > 0 ? meetingIds : [],
      };
      await onSave(data, item?.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (onArchive && item) {
      await onArchive(item.id);
      onClose();
    }
  }

  const linkedMeetings = allMeetings?.filter(m => meetingIds.includes(m.id)) || [];

  return (
    <>
      <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Individual' : 'New Individual'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Icon header */}
          <div className="flex items-center gap-2 pb-1">
            <div className="p-2 rounded-lg bg-cyan-50">
              <UserRound size={18} className="text-cyan-600" />
            </div>
            <span className="text-xs text-gray-400">Focus Individual</span>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              className="input-field"
              placeholder="Person's name"
              autoFocus
              required
            />
          </div>

          {/* Next Ordinance */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Next Ordinance</label>
            <input
              type="text"
              value={form.nextOrdinance}
              onChange={e => set('nextOrdinance', e.target.value)}
              className="input-field"
              placeholder="e.g., Baptism, Priesthood Ordination, Temple Recommend"
            />
          </div>

          {/* Check-in Cadence */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Check-in Cadence</label>
            <div className="flex flex-wrap gap-1.5">
              {CADENCE_LIST.map(c => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => set('checkInCadence', c.key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    form.checkInCadence === c.key
                      ? 'bg-cyan-50 border-cyan-300 text-cyan-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Phone Number</label>
            <input
              type="tel"
              value={form.phoneNumber}
              onChange={e => set('phoneNumber', e.target.value)}
              className="input-field"
              placeholder="Optional"
            />
          </div>

          {/* Notes/Background */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Background Notes</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              className="input-field"
              rows={2}
              placeholder="Brief background or situation"
            />
          </div>

          {/* Linked Meetings */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Discuss in Meetings</label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {linkedMeetings.map(m => (
                <span key={m.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-cyan-50 text-cyan-700 border border-cyan-200">
                  {m.name}
                  <button
                    type="button"
                    onClick={() => setMeetingIds(prev => prev.filter(id => id !== m.id))}
                    className="text-cyan-400 hover:text-cyan-600"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setMeetingPickerOpen(true)}
              className="text-xs text-cyan-600 hover:text-cyan-700"
            >
              + Link to meeting
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={!form.title.trim() || saving}
              className="btn-primary flex-1"
            >
              {saving ? 'Saving...' : isEdit ? 'Update' : 'Add to Focus'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
          </div>

          {/* Archive button (edit mode) */}
          {isEdit && !item.isArchived && (
            <button
              type="button"
              onClick={handleArchive}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-amber-600 py-1.5 transition-colors"
            >
              <Archive size={12} />
              Remove from Focus List
            </button>
          )}
        </form>
      </Modal>

      {/* Meeting Picker */}
      <MeetingPicker
        open={meetingPickerOpen}
        onClose={() => setMeetingPickerOpen(false)}
        meetings={allMeetings || []}
        selectedIds={meetingIds}
        onConfirm={(ids) => { setMeetingIds(ids); setMeetingPickerOpen(false); }}
        multiSelect
      />
    </>
  );
}
