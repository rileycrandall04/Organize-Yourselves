import { useState, useMemo } from 'react';
import { useMeetingInstances, useTagsFromInstance, useMeetings } from '../hooks/useDb';
import { addMeetingNoteTag, syncCallingNotesFromMeeting, deleteMeetingInstance, updateTask, getTasksByIds } from '../db';
import { formatFull } from '../utils/dates';
import { isAiConfigured, summarizeMeetingNotes, suggestActionItems } from '../utils/ai';
import MeetingPicker from './shared/MeetingPicker';
import SacramentProgram from './SacramentProgram';
import AiButton, { AiResultCard } from './shared/AiButton';
import BlockEditor, { migrateAgendaToBlocks, consolidateBlocks } from './BlockEditor';
import {
  ArrowLeft, Save, CheckCircle2, Users2, Trash2,
  ArrowUpRight, X, Pencil, RotateCcw,
} from 'lucide-react';

export default function MeetingNotes({ instance, meetingName, meetingId, participants, onBack }) {
  const isSacrament = meetingName === 'Sacrament Meeting';
  const { update } = useMeetingInstances(instance.meetingId);
  const { tags: instanceTags, remove: removeTag } = useTagsFromInstance(instance.id);
  const { meetings: allMeetings } = useMeetings();

  // Initialize blocks — migrate old formats and consolidate to text + task_ref
  const initialBlocks = useMemo(() => {
    if (instance.blocks?.length > 0) return consolidateBlocks(instance.blocks);
    if (instance.agendaItems?.length > 0 || instance.notes?.trim()) {
      return migrateAgendaToBlocks(instance.agendaItems, instance.notes);
    }
    return [{ id: 'init_1', type: 'text', text: '' }];
  }, []);

  const [blocks, setBlocks] = useState(initialBlocks);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Date editing
  const [editingDate, setEditingDate] = useState(false);
  const [editDate, setEditDate] = useState(instance.date);

  // Status
  const [instanceStatus, setInstanceStatus] = useState(instance.status);
  const isCompleted = instanceStatus === 'completed';
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Note tagging
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  // Task sharing to other meetings
  const [shareTaskId, setShareTaskId] = useState(null);

  // AI state
  const aiEnabled = isAiConfigured();
  const [aiSummary, setAiSummary] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSuggestionsLoading, setAiSuggestionsLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Derive text content for AI
  const hasContent = blocks.some(b => (b.text || '').trim());

  function handleBlocksChange(newBlocks) {
    setBlocks(newBlocks);
    setDirty(true);
  }

  async function handleReopen() {
    await update(instance.id, { status: 'scheduled' });
    instance.status = 'scheduled';
    setInstanceStatus('scheduled');
  }

  async function handleDeleteInstance() {
    await deleteMeetingInstance(instance.id);
    onBack();
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      await update(instance.id, { blocks });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleFinalize() {
    setSaving(true);
    try {
      await update(instance.id, { blocks, status: 'completed' });
      instance.status = 'completed';
      setInstanceStatus('completed');

      // Sync calling notes from text lines that match calling pipeline
      const content = blocks[0]?.text || '';
      const callingAgendaItems = content.split('\n')
        .filter(line => line.includes('[Calling]'))
        .map(line => ({ label: line.trim(), notes: '', source: 'calling_pipeline' }));
      if (callingAgendaItems.length > 0) {
        await syncCallingNotesFromMeeting(callingAgendaItems, instance.date, meetingName);
      }

      setDirty(false);
      onBack();
    } finally {
      setSaving(false);
    }
  }

  // AI — extract plain text from content (strip {{task:ID}} markers)
  function getPlainText() {
    return (blocks[0]?.text || '').replace(/\{\{task:\d+\}\}/g, '').trim();
  }

  async function handleAiSummarize() {
    setAiSummaryLoading(true);
    setAiError('');
    try {
      const result = await summarizeMeetingNotes({
        meetingName,
        date: formatFull(instance.date),
        agendaItems: [],
        notes: getPlainText(),
      });
      setAiSummary(result);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiSummaryLoading(false);
    }
  }

  async function handleAiSuggest() {
    setAiSuggestionsLoading(true);
    setAiError('');
    try {
      const result = await suggestActionItems({
        meetingName,
        date: formatFull(instance.date),
        agendaItems: [],
        notes: getPlainText(),
      });
      setAiSuggestions(result);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiSuggestionsLoading(false);
    }
  }

  // Note tagging
  async function handleTagMeeting(meeting) {
    const text = (blocks[0]?.text || '')
      .replace(/\{\{task:\d+\}\}/g, '')
      .trim();
    if (!text) return;

    await addMeetingNoteTag({
      sourceMeetingInstanceId: instance.id,
      targetMeetingId: meeting.id,
      text: text.trim(),
      agendaItemIndex: -1,
    });
    setTagPickerOpen(false);
  }

  // Task sharing — add task to another meeting's agenda
  async function handleShareTaskToMeeting(meeting) {
    if (!shareTaskId) return;
    const tasks = await getTasksByIds([shareTaskId]);
    const task = tasks[0];
    if (!task) { setShareTaskId(null); return; }
    const ids = task.meetingIds || [];
    if (!ids.includes(meeting.id)) {
      await updateTask(shareTaskId, { meetingIds: [...ids, meeting.id] });
    }
    setShareTaskId(null);
  }

  function getMeetingNameById(id) {
    const mtg = allMeetings.find(m => m.id === id);
    return mtg?.name || 'Meeting';
  }

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
          {editingDate ? (
            <div className="flex items-center gap-1.5 mt-0.5">
              <input
                type="date"
                value={editDate}
                onChange={e => setEditDate(e.target.value)}
                className="text-sm border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-300"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (editDate && editDate !== instance.date) {
                      update(instance.id, { date: editDate });
                      instance.date = editDate;
                    }
                    setEditingDate(false);
                  }
                  if (e.key === 'Escape') setEditingDate(false);
                }}
              />
              <button
                onClick={() => {
                  if (editDate && editDate !== instance.date) {
                    update(instance.id, { date: editDate });
                    instance.date = editDate;
                  }
                  setEditingDate(false);
                }}
                className="text-primary-600 hover:text-primary-800"
              >
                <CheckCircle2 size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingDate(true)}
              className="text-sm text-gray-500 mt-0.5 hover:text-primary-600 hover:underline flex items-center gap-1 group transition-colors"
              title="Click to change date"
            >
              {formatFull(instance.date)}
              <Pencil size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>
        {isCompleted && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs font-medium text-green-600">
              <CheckCircle2 size={14} />
              Finalized
            </span>
            <button
              onClick={handleReopen}
              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-primary-600 transition-colors"
              title="Reopen for editing"
            >
              <RotateCcw size={12} /> Edit
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-red-500 transition-colors"
              title="Delete this meeting instance"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="card bg-red-50 border-red-200 mb-5 p-4">
          <p className="text-sm font-medium text-red-800 mb-1">Delete this meeting?</p>
          <p className="text-xs text-red-600 mb-3">
            This will permanently delete this meeting instance, including all notes and linked tasks.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteInstance}
              className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Participants */}
      {participants?.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Users2 size={12} className="text-gray-400" />
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Participants</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {participants.map((p, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                {p.name}{p.role ? ` (${p.role})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sacrament Meeting Program */}
      {isSacrament && (
        <div className="mb-6">
          <SacramentProgram instance={instance} onUpdate={update} disabled={isCompleted} />
        </div>
      )}

      {/* Block Editor — the main meeting document */}
      {!isSacrament && (
        <div className="mb-6">
          <BlockEditor
            blocks={blocks}
            onChange={handleBlocksChange}
            meetingId={meetingId || instance.meetingId}
            instanceId={instance.id}
            finalized={isCompleted}
            onTagTask={(taskId) => setShareTaskId(taskId)}
            meetings={allMeetings}
          />
        </div>
      )}

      {/* Tags summary */}
      {instanceTags.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-1.5 mb-2">
            <ArrowUpRight size={14} className="text-indigo-500" />
            <h2 className="text-sm font-semibold text-gray-900">
              Tagged Notes ({instanceTags.length})
            </h2>
          </div>
          <div className="flex gap-1 flex-wrap">
            {instanceTags.map(tag => (
              <span key={tag.id} className="inline-flex items-center gap-0.5 badge bg-indigo-50 text-indigo-600 text-[10px]">
                <ArrowUpRight size={8} />
                {getMeetingNameById(tag.targetMeetingId)}
                {!isCompleted && (
                  <button onClick={() => removeTag(tag.id)} className="ml-0.5 hover:text-red-500">
                    <X size={8} />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tag notes to another meeting */}
      {!isCompleted && hasContent && (
        <button
          onClick={() => setTagPickerOpen(true)}
          className="flex items-center gap-1 text-[11px] text-indigo-500 hover:text-indigo-700 mb-6"
        >
          <ArrowUpRight size={12} /> Tag notes for another meeting
        </button>
      )}

      {/* AI Features */}
      {aiEnabled && hasContent && (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <AiButton onClick={handleAiSummarize} label="Summarize" loading={aiSummaryLoading} disabled={aiSuggestionsLoading} />
            <AiButton onClick={handleAiSuggest} label="Suggest Actions" loading={aiSuggestionsLoading} disabled={aiSummaryLoading} />
          </div>
          {aiError && <p className="text-xs text-red-500 mb-2">{aiError}</p>}
          <AiResultCard title="Meeting Summary" content={aiSummary} onClose={() => setAiSummary(null)} />
          <AiResultCard title="Suggested Action Items" content={aiSuggestions} onClose={() => setAiSuggestions(null)} />
        </div>
      )}

      {/* Bottom actions */}
      {!isCompleted ? (
        <div className="flex gap-3 mb-6">
          <button onClick={handleSave} disabled={!dirty || saving} className="btn-secondary flex-1 flex items-center justify-center gap-1.5">
            <Save size={16} /> {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button onClick={handleFinalize} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
            <CheckCircle2 size={16} /> Finalize
          </button>
        </div>
      ) : dirty && (
        <div className="mb-6">
          <button onClick={handleSave} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-1.5">
            <Save size={16} /> {saving ? 'Saving...' : 'Save Notes'}
          </button>
        </div>
      )}

      {/* Meeting tag picker (notes) */}
      <MeetingPicker open={tagPickerOpen} onClose={() => setTagPickerOpen(false)} onSelect={handleTagMeeting} excludeIds={[instance.meetingId]} title="Tag for Meeting" />

      {/* Task sharing picker */}
      <MeetingPicker open={!!shareTaskId} onClose={() => setShareTaskId(null)} onSelect={handleShareTaskToMeeting} excludeIds={[instance.meetingId]} title="Share Task to Meeting" />
    </div>
  );
}
