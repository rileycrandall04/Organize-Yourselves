import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useMeetingInstances, useTagsFromInstance, useMeetings } from '../hooks/useDb';
import { addMeetingNoteTag, syncCallingNotesFromMeeting, deleteMeetingInstance, updateTask, getTasksByIds, getTasks } from '../db';
import { formatFull } from '../utils/dates';
import { TASK_TYPES } from '../utils/constants';
import { isAiConfigured, summarizeMeetingNotes, suggestActionItems } from '../utils/ai';
import MeetingPicker from './shared/MeetingPicker';
import SacramentProgram from './SacramentProgram';
import AiButton, { AiResultCard } from './shared/AiButton';
import BlockEditor, { migrateAgendaToBlocks, consolidateBlocks } from './BlockEditor';
import { htmlToPlainText } from './shared/RichTextEditor';
import {
  ArrowLeft, Save, CheckCircle2, Users2, Trash2,
  ArrowUpRight, X, Pencil, RotateCcw, Plus, Search, Import,
  CheckSquare, MessageSquare, CalendarDays, Briefcase, Heart, RotateCw,
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

  // Import tasks from other meetings
  const [importPickerOpen, setImportPickerOpen] = useState(false);
  const insertChipRef = useRef(null);
  const handleInsertRef = useCallback((fn) => { insertChipRef.current = fn; }, []);

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
  const hasContent = blocks.some(b => (b.text || b.html || '').replace(/<[^>]*>/g, '').trim());

  function handleBlocksChange(newBlocks) {
    setBlocks(newBlocks);
    setDirty(true);
  }

  // Auto-save handler — called by RichTextEditor's auto-save (every 60s, on unmount, on visibility change)
  async function handleAutoSave(newBlocks) {
    try {
      await update(instance.id, { blocks: newBlocks });
      setBlocks(newBlocks);
      setDirty(false);
    } catch {
      // Silently fail — will retry on next auto-save
    }
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
      onBack(); // Return to meeting home page
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

  // AI — extract plain text from content (handles both old text and new richtext blocks)
  function getPlainText() {
    const block = blocks[0];
    if (!block) return '';
    if (block.type === 'richtext') {
      return htmlToPlainText(block.html || '').replace(/\{\{task:\d+\}\}/g, '').trim();
    }
    return (block.text || '').replace(/\{\{task:\d+\}\}/g, '').trim();
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
    const text = getPlainText();
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

  // Import a task from another meeting into the current meeting + insert chip into editor
  async function handleImportTask(task) {
    const updatedMeetingIds = [...new Set([...(task.meetingIds || []), meetingId || instance.meetingId])];
    await updateTask(task.id, { meetingIds: updatedMeetingIds });
    // Insert task chip into the TipTap editor via BlockEditor's insertTaskChip
    if (insertChipRef.current) {
      insertChipRef.current(task.id);
    }
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

      {/* Add Tasks button (above editor) */}
      {!isSacrament && !isCompleted && (
        <div className="mb-3">
          <button
            onClick={() => setImportPickerOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-800 px-3 py-2 rounded-lg border border-primary-200 hover:bg-primary-50 transition-colors w-full justify-center"
          >
            <Import size={14} />
            Add tasks from other meetings
          </button>
        </div>
      )}

      {/* Block Editor — the main meeting document */}
      {!isSacrament && (
        <div className="mb-6">
          <BlockEditor
            blocks={blocks}
            onChange={handleBlocksChange}
            onSave={handleAutoSave}
            meetingId={meetingId || instance.meetingId}
            instanceId={instance.id}
            finalized={isCompleted}
            onTagTask={(taskId) => setShareTaskId(taskId)}
            meetings={allMeetings}
            onInsertRef={handleInsertRef}
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

      {/* Import tasks from other meetings */}
      {importPickerOpen && (
        <MeetingImportPicker
          meetingId={meetingId || instance.meetingId}
          meetings={allMeetings}
          onImport={handleImportTask}
          onClose={() => setImportPickerOpen(false)}
        />
      )}
    </div>
  );
}

/* ── Import Task Picker for MeetingNotes ─────────────────────── */

const TYPE_ICONS = {
  action_item: CheckSquare,
  discussion: MessageSquare,
  event: CalendarDays,
  calling_plan: Briefcase,
  ministering_plan: Heart,
  ongoing: RotateCw,
};

const CHIP_COLORS = {
  action_item:      { bg: '#eff6ff', fg: '#1d4ed8' },
  discussion:       { bg: '#eef2ff', fg: '#4338ca' },
  event:            { bg: '#f0fdf4', fg: '#15803d' },
  calling_plan:     { bg: '#faf5ff', fg: '#7e22ce' },
  ministering_plan: { bg: '#fff1f2', fg: '#be123c' },
  ongoing:          { bg: '#fffbeb', fg: '#b45309' },
};

const STATUS_CHAR = {
  not_started: '\u25CB',
  in_progress: '\u25D0',
  waiting: '\u23F8',
  complete: '\u2713',
};

function MeetingImportPicker({ meetingId, meetings, onImport, onClose }) {
  const [search, setSearch] = useState('');
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [imported, setImported] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tasks = await getTasks({ excludeComplete: true });
      if (!cancelled) {
        setAllTasks(tasks);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Filter: exclude tasks already on this meeting or already imported
  const available = useMemo(() => {
    return allTasks.filter(t => {
      if ((t.meetingIds || []).includes(meetingId)) return false;
      if (imported.has(t.id)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!t.title.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allTasks, meetingId, search, imported]);

  // Group by source meeting
  const grouped = useMemo(() => {
    const meetingMap = {};
    if (meetings) for (const m of meetings) meetingMap[m.id] = m.name;

    const groups = {};
    for (const task of available) {
      const mIds = (task.meetingIds || []).filter(id => id !== meetingId);
      if (mIds.length > 0) {
        const groupId = mIds[0];
        const groupName = meetingMap[groupId] || `Meeting #${groupId}`;
        if (!groups[groupId]) groups[groupId] = { name: groupName, tasks: [] };
        groups[groupId].tasks.push(task);
      } else {
        if (!groups['_unlinked']) groups['_unlinked'] = { name: 'Unlinked Tasks', tasks: [] };
        groups['_unlinked'].tasks.push(task);
      }
    }
    return Object.values(groups);
  }, [available, meetings, meetingId]);

  async function handleImport(task) {
    await onImport(task);
    setImported(prev => new Set([...prev, task.id]));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-5 animate-in fade-in max-h-[70vh] flex flex-col mx-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Import size={16} className="text-gray-600" />
          Add Tasks from Other Meetings
        </h3>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            autoFocus
          />
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="text-center py-8 text-gray-400">
              <div className="animate-spin w-5 h-5 border-2 border-primary-300 border-t-primary-700 rounded-full mx-auto mb-2" />
              <p className="text-xs">Loading tasks...</p>
            </div>
          ) : grouped.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-xs">{search ? 'No matching tasks found.' : 'No tasks available to add.'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.map(group => (
                <div key={group.name}>
                  <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5 px-1">
                    {group.name}
                  </h4>
                  <div className="space-y-0.5">
                    {group.tasks.map(task => {
                      const TypeIcon = TYPE_ICONS[task.type] || CheckSquare;
                      const c = CHIP_COLORS[task.type] || CHIP_COLORS.action_item;
                      const sc = STATUS_CHAR[task.status] || '\u25CB';
                      return (
                        <button
                          key={task.id}
                          onClick={() => handleImport(task)}
                          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left group"
                        >
                          <span
                            className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px]"
                            style={{ background: c.bg, color: c.fg }}
                          >
                            {sc}
                          </span>
                          <span className="flex-1 text-xs text-gray-800 truncate">{task.title}</span>
                          <Plus size={14} className="text-gray-300 group-hover:text-primary-500 flex-shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Done */}
        <button onClick={onClose} className="btn-primary w-full mt-3">
          Done
        </button>
      </div>
    </div>
  );
}
