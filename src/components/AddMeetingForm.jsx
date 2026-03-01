import { useState } from 'react';
import { useUserCallings, usePeople } from '../hooks/useDb';
import { getCallingConfig, MEETING_CADENCES, ORGANIZATIONS } from '../data/callings';
import { X, Plus, Trash2 } from 'lucide-react';

const cadenceOptions = Object.entries(MEETING_CADENCES);

const REMINDER_OPTIONS = [
  { value: 'default', label: 'Default (based on frequency)' },
  { value: '1', label: '1 day before' },
  { value: '7', label: '1 week before' },
  { value: '30', label: '1 month before' },
  { value: '30,7', label: '1 month + 1 week before' },
  { value: 'none', label: 'None' },
];

function reminderDaysToValue(reminderDays) {
  if (reminderDays === null || reminderDays === undefined) return 'default';
  if (Array.isArray(reminderDays) && reminderDays.length === 0) return 'none';
  return reminderDays.join(',');
}

function valueToReminderDays(value) {
  if (value === 'default') return null;
  if (value === 'none') return [];
  return value.split(',').map(Number);
}

export default function AddMeetingForm({ onSave, onClose, editMeeting }) {
  const { callings } = useUserCallings();
  const { people } = usePeople();
  const isEditing = !!editMeeting;

  const [name, setName] = useState(editMeeting?.name || '');
  const [callingId, setCallingId] = useState(editMeeting?.callingId || '');
  const [cadence, setCadence] = useState(editMeeting?.cadence || 'monthly');
  const [reminderValue, setReminderValue] = useState(
    reminderDaysToValue(editMeeting?.reminderDays)
  );
  const [agendaItems, setAgendaItems] = useState(
    editMeeting?.agendaTemplate?.length
      ? editMeeting.agendaTemplate.map(t => t)
      : ['']
  );
  const [participants, setParticipants] = useState(editMeeting?.participants || []);
  const [participantInput, setParticipantInput] = useState('');
  const [showPeoplePicker, setShowPeoplePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  function addParticipantFromPerson(person) {
    if (participants.some(p => p.personId === person.id)) return;
    setParticipants(prev => [...prev, { personId: person.id, name: person.name, role: '' }]);
    setParticipantInput('');
    setShowPeoplePicker(false);
  }

  function addFreeTextParticipant() {
    if (!participantInput.trim()) return;
    if (participants.some(p => p.name.toLowerCase() === participantInput.trim().toLowerCase())) return;
    setParticipants(prev => [...prev, { personId: null, name: participantInput.trim(), role: '' }]);
    setParticipantInput('');
    setShowPeoplePicker(false);
  }

  function removeParticipant(index) {
    setParticipants(prev => prev.filter((_, i) => i !== index));
  }

  function handleAddAgendaItem() {
    setAgendaItems([...agendaItems, '']);
  }

  function handleRemoveAgendaItem(index) {
    setAgendaItems(agendaItems.filter((_, i) => i !== index));
  }

  function handleAgendaChange(index, value) {
    const updated = [...agendaItems];
    updated[index] = value;
    setAgendaItems(updated);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const meetingData = {
        name: name.trim(),
        callingId: callingId || null,
        cadence,
        reminderDays: valueToReminderDays(reminderValue),
        agendaTemplate: agendaItems.filter(a => a.trim()),
        participants,
        source: 'custom',
      };
      if (isEditing) {
        meetingData.id = editMeeting.id;
      }
      await onSave(meetingData);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  // Build calling options grouped by organization
  const callingOptions = callings.map(uc => {
    const config = getCallingConfig(uc.callingKey);
    const org = ORGANIZATIONS.find(o => o.key === config?.organization);
    return {
      key: uc.callingKey,
      title: config?.title || uc.callingKey,
      orgLabel: org?.label || '',
    };
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {isEditing ? 'Edit Meeting' : 'Add Meeting'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Meeting Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Meeting Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Activity Committee Meeting"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300"
              autoFocus
            />
          </div>

          {/* Calling Association */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Associated Calling <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <select
              value={callingId}
              onChange={e => setCallingId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300 bg-white"
            >
              <option value="">No calling — standalone meeting</option>
              {callingOptions.map(opt => (
                <option key={opt.key} value={opt.key}>
                  {opt.title} ({opt.orgLabel})
                </option>
              ))}
            </select>
          </div>

          {/* Cadence */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Frequency</label>
            <select
              value={cadence}
              onChange={e => setCadence(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300 bg-white"
            >
              {cadenceOptions.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Reminder */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Reminder</label>
            <select
              value={reminderValue}
              onChange={e => setReminderValue(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300 bg-white"
            >
              {REMINDER_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">
              Default: weekly/biweekly = 1 day, monthly = 1 week, quarterly+ = 1 month + 1 week
            </p>
          </div>

          {/* Participants */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Participants <span className="font-normal text-gray-400">(optional)</span>
            </label>
            {participants.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {participants.map((p, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-primary-50 text-primary-700 text-xs rounded-full"
                  >
                    {p.name}
                    <button
                      type="button"
                      onClick={() => removeParticipant(i)}
                      className="text-primary-400 hover:text-red-500"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <input
                type="text"
                value={participantInput}
                onChange={e => {
                  setParticipantInput(e.target.value);
                  setShowPeoplePicker(e.target.value.length >= 2);
                }}
                onFocus={() => { if (participantInput.length >= 2) setShowPeoplePicker(true); }}
                onBlur={() => setTimeout(() => setShowPeoplePicker(false), 150)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFreeTextParticipant(); } }}
                placeholder="Type a name..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300"
              />
              {showPeoplePicker && (() => {
                const q = participantInput.toLowerCase();
                const matches = people.filter(p =>
                  p.name.toLowerCase().includes(q) &&
                  !participants.some(pp => pp.personId === p.id)
                );
                if (matches.length === 0) return null;
                return (
                  <div className="absolute z-20 left-0 right-0 mt-1 max-h-32 overflow-y-auto border border-gray-200 rounded-lg bg-white shadow-lg">
                    {matches.slice(0, 8).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => addParticipantFromPerson(p)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50 border-b border-gray-100 last:border-0"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Type a name and press Enter, or select from the dropdown.</p>
          </div>

          {/* Agenda Template */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Agenda Template <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <div className="space-y-2">
              {agendaItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-4 text-right flex-shrink-0">{i + 1}.</span>
                  <input
                    type="text"
                    value={item}
                    onChange={e => handleAgendaChange(i, e.target.value)}
                    placeholder="Agenda item..."
                    className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300"
                  />
                  {agendaItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveAgendaItem(i)}
                      className="p-1 text-gray-300 hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddAgendaItem}
                className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-medium mt-1"
              >
                <Plus size={12} />
                Add agenda item
              </button>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || saving}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-40"
          >
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Meeting'}
          </button>
        </div>
      </div>
    </div>
  );
}
