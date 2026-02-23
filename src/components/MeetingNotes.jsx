import { useState } from 'react';
import { useMeetingInstances, useTagsFromInstance, useMeetings } from '../hooks/useDb';
import { addActionItem, addMeetingNoteTag } from '../db';
import { formatFull } from '../utils/dates';
import Modal from './shared/Modal';
import MeetingPicker from './shared/MeetingPicker';
import SacramentProgram from './SacramentProgram';
import {
  ArrowLeft, Save, CheckCircle2, Plus, MessageSquare, FileText,
  ArrowUpRight, X,
} from 'lucide-react';

export default function MeetingNotes({ instance, meetingName, onBack }) {
  const isSacrament = meetingName === 'Sacrament Meeting';
  const { update } = useMeetingInstances(instance.meetingId);
  const { tags: instanceTags, remove: removeTag } = useTagsFromInstance(instance.id);
  const { meetings: allMeetings } = useMeetings();
  const [notes, setNotes] = useState(instance.notes || '');
  const [agendaItems, setAgendaItems] = useState(instance.agendaItems || []);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [actionTitle, setActionTitle] = useState('');
  const [actionItemIds, setActionItemIds] = useState(instance.actionItemIds || []);

  // Note tagging state
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagAgendaIndex, setTagAgendaIndex] = useState(null);
  const [tagPickerForGeneral, setTagPickerForGeneral] = useState(false);

  function updateAgendaNote(index, value) {
    setAgendaItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], notes: value };
      return updated;
    });
    setDirty(true);
  }

  function updateNotes(value) {
    setNotes(value);
    setDirty(true);
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      await update(instance.id, { notes, agendaItems, actionItemIds });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleFinalize() {
    setSaving(true);
    try {
      await update(instance.id, { notes, agendaItems, actionItemIds, status: 'completed' });
      setDirty(false);
      onBack();
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateAction() {
    if (!actionTitle.trim()) return;
    const id = await addActionItem({
      title: actionTitle.trim(),
      sourceMeetingInstanceId: instance.id,
    });
    setActionItemIds(prev => [...prev, id]);
    await update(instance.id, { actionItemIds: [...actionItemIds, id] });
    setActionTitle('');
    setQuickActionOpen(false);
  }

  // --- Note Tagging ---

  function openTagPicker(agendaIndex) {
    setTagAgendaIndex(agendaIndex);
    setTagPickerForGeneral(false);
    setTagPickerOpen(true);
  }

  function openGeneralTagPicker() {
    setTagAgendaIndex(null);
    setTagPickerForGeneral(true);
    setTagPickerOpen(true);
  }

  async function handleTagMeeting(meeting) {
    const text = tagPickerForGeneral
      ? notes
      : agendaItems[tagAgendaIndex]?.notes || '';
    if (!text?.trim()) return;

    await addMeetingNoteTag({
      sourceMeetingInstanceId: instance.id,
      targetMeetingId: meeting.id,
      text: text.trim(),
      agendaItemIndex: tagPickerForGeneral ? -1 : tagAgendaIndex,
    });
    setTagPickerOpen(false);
  }

  function getMeetingName(meetingId) {
    const mtg = allMeetings.find(m => m.id === meetingId);
    return mtg?.name || 'Meeting';
  }

  function getAgendaItemTags(index) {
    return instanceTags.filter(t => t.agendaItemIndex === index);
  }

  const generalNoteTags = instanceTags.filter(t => t.agendaItemIndex === -1);
  const isCompleted = instance.status === 'completed';

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      {/* Header */}
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary-600 mb-4">
        <ArrowLeft size={16} />
        Back to {meetingName}
      </button>

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{meetingName}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{formatFull(instance.date)}</p>
        </div>
        {isCompleted && (
          <span className="flex items-center gap-1 text-xs font-medium text-green-600">
            <CheckCircle2 size={14} />
            Finalized
          </span>
        )}
      </div>

      {/* Sacrament Meeting Program (structured form) */}
      {isSacrament && (
        <div className="mb-6">
          <SacramentProgram
            instance={instance}
            onUpdate={update}
            disabled={isCompleted}
          />
        </div>
      )}

      {/* Agenda items with inline notes + tagging (non-sacrament meetings) */}
      {!isSacrament && agendaItems.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-3">
            <FileText size={14} className="text-primary-600" />
            Agenda
          </h2>
          <div className="space-y-3">
            {agendaItems.map((item, i) => {
              const itemTags = getAgendaItemTags(i);
              const sourceClass = item.source === 'carry_forward'
                ? 'border-l-2 border-l-amber-300'
                : item.source === 'tagged_note'
                  ? 'border-l-2 border-l-indigo-300'
                  : '';

              return (
                <div key={i} className={`card ${sourceClass}`}>
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-xs text-gray-400 mt-0.5 w-4 text-right flex-shrink-0">{i + 1}.</span>
                    <span className="text-sm font-medium text-gray-800 flex-1">{item.label}</span>
                    {item.source === 'carry_forward' && (
                      <span className="badge bg-amber-100 text-amber-700 text-[10px] flex-shrink-0">Carry Forward</span>
                    )}
                    {item.source === 'tagged_note' && (
                      <span className="badge bg-indigo-100 text-indigo-700 text-[10px] flex-shrink-0">Tagged Note</span>
                    )}
                  </div>
                  <textarea
                    value={item.notes}
                    onChange={e => updateAgendaNote(i, e.target.value)}
                    placeholder="Notes..."
                    rows={2}
                    className="input-field text-xs"
                    disabled={isCompleted}
                  />
                  {/* Tag controls + chips */}
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex gap-1 flex-wrap">
                      {itemTags.map(tag => (
                        <span key={tag.id} className="inline-flex items-center gap-0.5 badge bg-indigo-50 text-indigo-600 text-[10px]">
                          <ArrowUpRight size={8} />
                          {getMeetingName(tag.targetMeetingId)}
                          {!isCompleted && (
                            <button onClick={() => removeTag(tag.id)} className="ml-0.5 hover:text-red-500">
                              <X size={8} />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                    {!isCompleted && item.notes?.trim() && (
                      <button
                        onClick={() => openTagPicker(i)}
                        className="flex items-center gap-0.5 text-[10px] text-indigo-500 hover:text-indigo-700 flex-shrink-0"
                      >
                        <ArrowUpRight size={10} />
                        Tag
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* General notes */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-3">
          <MessageSquare size={14} className="text-primary-600" />
          General Notes
        </h2>
        <textarea
          value={notes}
          onChange={e => updateNotes(e.target.value)}
          placeholder="Meeting notes, impressions, follow-up thoughts..."
          rows={4}
          className="input-field"
          disabled={isCompleted}
        />
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex gap-1 flex-wrap">
            {generalNoteTags.map(tag => (
              <span key={tag.id} className="inline-flex items-center gap-0.5 badge bg-indigo-50 text-indigo-600 text-[10px]">
                <ArrowUpRight size={8} />
                {getMeetingName(tag.targetMeetingId)}
                {!isCompleted && (
                  <button onClick={() => removeTag(tag.id)} className="ml-0.5 hover:text-red-500">
                    <X size={8} />
                  </button>
                )}
              </span>
            ))}
          </div>
          {!isCompleted && notes.trim() && (
            <button
              onClick={openGeneralTagPicker}
              className="flex items-center gap-0.5 text-[10px] text-indigo-500 hover:text-indigo-700 flex-shrink-0"
            >
              <ArrowUpRight size={10} />
              Tag for another meeting
            </button>
          )}
        </div>
      </div>

      {/* Action items created from this meeting */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Action Items ({actionItemIds.length})
          </h2>
          {!isCompleted && (
            <button
              onClick={() => setQuickActionOpen(true)}
              className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800"
            >
              <Plus size={14} />
              Quick Add
            </button>
          )}
        </div>
        {actionItemIds.length === 0 && (
          <p className="text-xs text-gray-400">No action items from this meeting yet.</p>
        )}
        {actionItemIds.length > 0 && (
          <p className="text-xs text-gray-500">
            {actionItemIds.length} action item{actionItemIds.length !== 1 ? 's' : ''} created. View them on the Actions tab.
          </p>
        )}
      </div>

      {/* Tags summary */}
      {instanceTags.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-2">
            <ArrowUpRight size={14} className="text-indigo-500" />
            Tagged Notes ({instanceTags.length})
          </h2>
          <p className="text-xs text-gray-500">
            {instanceTags.length} note{instanceTags.length !== 1 ? 's' : ''} tagged for other meetings.
            They will appear in those meetings' next agendas.
          </p>
        </div>
      )}

      {/* Bottom actions */}
      {!isCompleted && (
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="btn-secondary flex-1 flex items-center justify-center gap-1.5"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            onClick={handleFinalize}
            disabled={saving}
            className="btn-primary flex-1 flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 size={16} />
            Finalize
          </button>
        </div>
      )}

      {/* Quick action item modal */}
      <Modal open={quickActionOpen} onClose={() => setQuickActionOpen(false)} title="Quick Action Item" size="sm">
        <div className="space-y-3">
          <input
            type="text"
            value={actionTitle}
            onChange={e => setActionTitle(e.target.value)}
            placeholder="What needs to be done?"
            className="input-field"
            autoFocus
          />
          <p className="text-xs text-gray-400">Creates a basic action item linked to this meeting. You can add details later from the Actions tab.</p>
          <div className="flex gap-3">
            <button onClick={handleCreateAction} disabled={!actionTitle.trim()} className="btn-primary flex-1">
              Create
            </button>
            <button onClick={() => setQuickActionOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Meeting tag picker */}
      <MeetingPicker
        open={tagPickerOpen}
        onClose={() => setTagPickerOpen(false)}
        onSelect={handleTagMeeting}
        excludeIds={[instance.meetingId]}
        title="Tag for Meeting"
      />
    </div>
  );
}
