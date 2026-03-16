import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getTasksByIds, getTasks, addTask, updateTask, deleteTask, addTaskFollowUpNote, setMeetingTaskStatus, getMeetings, getIndividuals, getTask } from '../db';
import { TASK_TYPES, TASK_TYPE_LIST, MEETING_TASK_STATUSES, MEETING_TASK_STATUS_LIST, JOURNAL_SECTIONS } from '../utils/constants';
import { useMeetingTaskStatuses, useJournalBySection } from '../hooks/useDb';
import useRichTextEditor, { migrateTextToHtml, extractTaskIdsFromHtml, htmlToPlainText } from './shared/RichTextEditor';
import IndividualDetail from './IndividualDetail';
import {
  Plus, Star, Share2, X, Search, Import, Cloud, CloudOff, ArrowRightLeft,
  CheckCircle2, Circle, Clock, Pause, ChevronUp, ChevronDown, Trash2,
  CheckSquare, MessageSquare, CalendarDays, Briefcase, Heart, RotateCw,
  PhoneForwarded, Sparkles, BookOpen, Tag, UserRound,
} from 'lucide-react';

/* ── Constants ──────────────────────────────────────────────── */

const MARKER_RE = /\{\{task:(\d+)\}\}/g;

const STATUS_CHAR = {
  not_started: '\u25CB',   // ○
  in_progress: '\u25D0',   // ◐
  waiting: '\u23F8',       // ⏸
  complete: '\u2713',      // ✓
};

const CHIP_COLORS = {
  action_item:      { bg: '#eff6ff', fg: '#1d4ed8', bd: '#bfdbfe' },
  discussion:       { bg: '#eef2ff', fg: '#4338ca', bd: '#c7d2fe' },
  event:            { bg: '#f0fdf4', fg: '#15803d', bd: '#bbf7d0' },
  calling_plan:     { bg: '#faf5ff', fg: '#7e22ce', bd: '#e9d5ff' },
  ministering_plan: { bg: '#fff1f2', fg: '#be123c', bd: '#fecdd3' },
  ongoing:          { bg: '#fffbeb', fg: '#b45309', bd: '#fde68a' },
  follow_up:        { bg: '#f0fdfa', fg: '#0f766e', bd: '#99f6e4' },
  spiritual_thought:{ bg: '#f5f3ff', fg: '#6d28d9', bd: '#ddd6fe' },
  journal_entry:    { bg: '#f0f9ff', fg: '#0369a1', bd: '#bae6fd' },
  individual:       { bg: '#ecfeff', fg: '#0e7490', bd: '#a5f3fc' },
};

const TYPE_ICONS = {
  action_item: CheckSquare,
  discussion: MessageSquare,
  event: CalendarDays,
  calling_plan: Briefcase,
  ministering_plan: Heart,
  ongoing: RotateCw,
  follow_up: PhoneForwarded,
  spiritual_thought: Sparkles,
  journal_entry: BookOpen,
  individual: UserRound,
};

const STATUS_ICONS = {
  not_started: Circle,
  in_progress: Clock,
  waiting: Pause,
  complete: CheckCircle2,
};

const STATUS_COLORS = {
  not_started: 'text-gray-300',
  in_progress: 'text-blue-500',
  waiting: 'text-yellow-500',
  complete: 'text-green-500',
};

/* ── ID helpers ─────────────────────────────────────────────── */

let _ctr = 0;
function newBlockId() { return `b_${Date.now()}_${++_ctr}`; }

export function createTextBlock(text = '') {
  return { id: newBlockId(), type: 'text', text };
}

export function createRichTextBlock(html = '<p></p>') {
  return { id: newBlockId(), type: 'richtext', html };
}

// Kept for backward compat during migration
export function createTaskRefBlock(taskId) {
  return { id: newBlockId(), type: 'task_ref', taskId };
}

/* ── Text extraction helpers ──────────────────────────────── */

function extractTaskIds(text) {
  const ids = new Set();
  let m;
  const re = new RegExp(MARKER_RE.source, 'g');
  while ((m = re.exec(text)) !== null) ids.add(Number(m[1]));
  return [...ids];
}

/* ── Block consolidation (old multi-block → single text with markers) */

export function consolidateBlocks(blocks) {
  if (!blocks?.length) return [createRichTextBlock('<p></p>')];

  // Already rich text format?
  const hasRichText = blocks.some(b => b.type === 'richtext');
  if (hasRichText) {
    // If multiple richtext blocks, merge them
    if (blocks.length <= 1) return blocks;
    const merged = blocks.map(b => b.html || b.text || '').join('');
    return [createRichTextBlock(merged)];
  }

  // Old formats — migrate to richtext
  const hasOld = blocks.some(b => b.type === 'task_ref' || b.type === 'heading' || b.type === 'bullet' || b.type === 'notepad');

  // Merge everything into a single text string first
  let text = '';
  for (const b of blocks) {
    if (b.type === 'task_ref') {
      if (text && !text.endsWith('\n')) text += '\n';
      text += `{{task:${b.taskId}}}`;
    } else if (b.type === 'heading') {
      if (text && !text.endsWith('\n')) text += '\n';
      text += b.text || '';
    } else if (b.type === 'bullet') {
      if (text && !text.endsWith('\n')) text += '\n';
      text += `\u2022 ${b.text || ''}`;
    } else if (b.type === 'text' || b.type === 'notepad') {
      if (b.text) {
        if (text && !text.endsWith('\n')) text += '\n';
        text += b.text;
      }
    }
  }

  // Convert plain text to rich text HTML
  const html = migrateTextToHtml(text);
  return [createRichTextBlock(html)];
}

/** Migrate old agendaItems[] format → single richtext block */
export function migrateAgendaToBlocks(agendaItems, notes) {
  const lines = [];
  for (const it of agendaItems || []) {
    lines.push(`\u2022 ${it.label || ''}`);
    if (it.notes?.trim()) lines.push(`  ${it.notes.trim()}`);
  }
  let text = lines.join('\n');
  if (notes?.trim()) text += (text ? '\n\n' : '') + notes.trim();
  const html = migrateTextToHtml(text);
  return [createRichTextBlock(html)];
}

/* ── TaskPanel (bottom sheet for viewing/editing a task) ────── */

function TaskPanel({ task, onClose, disabled, onTagTask, onConvertToText, onDeleteTask, meetings, currentMeetingId, meetingStatus, onSetMeetingStatus }) {
  const [noteText, setNoteText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [editingTypes, setEditingTypes] = useState(false);

  if (!task) return null;

  const StatusIcon = STATUS_ICONS[task.status] || Circle;
  const TypeIcon = TYPE_ICONS[task.type] || CheckSquare;
  const typeLabel = TASK_TYPES[task.type]?.label || 'Task';
  const isComplete = task.status === 'complete';
  const types = task.types || [task.type];

  // Meeting status icons map
  const MEETING_STATUS_ICONS = {
    keep: RotateCw,
    resolved: CheckCircle2,
    snoozed: Clock,
    reassigned: ArrowRightLeft,
  };
  const MEETING_STATUS_COLORS = {
    keep: 'text-blue-600 bg-blue-50 border-blue-200',
    resolved: 'text-green-600 bg-green-50 border-green-200',
    snoozed: 'text-amber-600 bg-amber-50 border-amber-200',
    reassigned: 'text-purple-600 bg-purple-50 border-purple-200',
  };

  async function cycleStatus() {
    if (disabled) return;
    const order = ['not_started', 'in_progress', 'waiting', 'complete'];
    const idx = order.indexOf(task.status);
    const next = order[(idx + 1) % order.length];
    await updateTask(task.id, {
      status: next,
      ...(next === 'complete' ? { completedAt: new Date().toISOString() } : { completedAt: null }),
    });
  }

  async function toggleStar() {
    if (disabled) return;
    await updateTask(task.id, { starred: !task.starred });
  }

  async function toggleFollowUp() {
    if (disabled) return;
    await updateTask(task.id, { followUp: task.followUp === 'next' ? null : 'next' });
  }

  async function addNote() {
    if (!noteText.trim()) return;
    await addTaskFollowUpNote(task.id, { text: noteText.trim(), meetingName: '' });
    setNoteText('');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-4 pb-6 max-h-[55vh] overflow-y-auto animate-in fade-in duration-200 mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <TypeIcon size={16} className="text-gray-400 flex-shrink-0" />
            <div className="min-w-0">
              <h3 className={`text-sm font-semibold text-gray-900 ${isComplete ? 'line-through opacity-50' : ''}`}>
                {task.title}
              </h3>
              {/* Multi-type badges (tap to edit) */}
              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                {types.map(t => {
                  const c = CHIP_COLORS[t] || CHIP_COLORS.action_item;
                  return (
                    <span
                      key={t}
                      className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.bd}` }}
                    >
                      {TASK_TYPES[t]?.label || t}
                    </span>
                  );
                })}
                {!disabled && (
                  <button
                    onClick={() => setEditingTypes(!editingTypes)}
                    className="text-[9px] text-gray-400 hover:text-gray-600 p-0.5"
                    title="Edit types"
                  >
                    <Tag size={10} />
                  </button>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        {/* Type editing panel (expandable multi-select) */}
        {editingTypes && !disabled && (
          <div className="mb-3 pb-3 border-b border-gray-100">
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Edit Task Types</h4>
            <div className="flex flex-wrap gap-1.5">
              {TASK_TYPE_LIST.map(typeConfig => {
                const typeKey = typeConfig.key;
                const isSelected = types.includes(typeKey);
                const Icon = TYPE_ICONS[typeKey] || CheckSquare;
                const c = CHIP_COLORS[typeKey] || CHIP_COLORS.action_item;
                return (
                  <button
                    key={typeKey}
                    type="button"
                    onClick={async () => {
                      let newTypes;
                      if (isSelected) {
                        if (types.length <= 1) return;
                        newTypes = types.filter(t => t !== typeKey);
                      } else {
                        newTypes = [...types, typeKey];
                      }
                      await updateTask(task.id, { types: newTypes, type: newTypes[0] });
                    }}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${
                      isSelected
                        ? 'ring-2 ring-offset-1 shadow-sm'
                        : 'opacity-40 hover:opacity-70'
                    }`}
                    style={{
                      background: c.bg,
                      color: c.fg,
                      border: `1px solid ${c.bd}`,
                    }}
                  >
                    <Icon size={11} />
                    {typeConfig.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Status / Star / Follow-up */}
        <div className="flex items-center gap-4 mb-3 pb-3 border-b border-gray-100">
          <button
            onClick={cycleStatus}
            className={`flex items-center gap-1.5 text-xs font-medium ${STATUS_COLORS[task.status]}`}
          >
            <StatusIcon size={14} />
            {task.status.replace(/_/g, ' ')}
          </button>
          <button
            onClick={toggleStar}
            className={`flex items-center gap-1 text-xs ${task.starred ? 'text-amber-500' : 'text-gray-400 hover:text-amber-500'}`}
          >
            <Star size={12} className={task.starred ? 'fill-amber-400' : ''} />
            {task.starred ? 'Starred' : 'Star'}
          </button>
          <button
            onClick={toggleFollowUp}
            className={`flex items-center gap-1 text-xs ${task.followUp === 'next' ? 'text-blue-600' : 'text-gray-400 hover:text-blue-600'}`}
          >
            <RotateCw size={12} />
            {task.followUp === 'next' ? 'Following up' : 'Follow up'}
          </button>
        </div>

        {/* Per-meeting status buttons (hidden for spiritual_thought and journal_entry) */}
        {!disabled && onSetMeetingStatus && task.type !== 'spiritual_thought' && task.type !== 'journal_entry' && (
          <div className="mb-3 pb-3 border-b border-gray-100">
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Meeting Status</h4>
            <div className="flex items-center gap-1.5">
              {MEETING_TASK_STATUS_LIST.map(ms => {
                const MsIcon = MEETING_STATUS_ICONS[ms.key];
                const isActive = meetingStatus?.meetingStatus === ms.key;
                const colorClass = MEETING_STATUS_COLORS[ms.key];
                return (
                  <button
                    key={ms.key}
                    onClick={() => onSetMeetingStatus(task.id, ms.key)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                      isActive
                        ? `${colorClass} ring-1 ring-offset-1 shadow-sm`
                        : 'text-gray-400 bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {MsIcon && <MsIcon size={12} />}
                    {ms.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Description */}
        {task.description && (
          <p className="text-xs text-gray-600 mb-3">{task.description}</p>
        )}

        {/* Metadata pills */}
        {(task.priority && task.priority !== 'low' || task.assignedTo?.name || task.dueDate || task.eventDate) && (
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {task.priority && task.priority !== 'low' && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                task.priority === 'high' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'
              }`}>
                {task.priority} priority
              </span>
            )}
            {task.assignedTo?.name && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-700">
                {task.assignedTo.name}
              </span>
            )}
            {task.eventDate && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">
                {new Date(task.eventDate + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
            {task.dueDate && (
              <span className="text-[10px] text-gray-500">Due: {task.dueDate}</span>
            )}
          </div>
        )}

        {/* Follow-up notes — newest first, expandable */}
        {task.followUpNotes?.length > 0 && (() => {
          const sortedNotes = [...task.followUpNotes].reverse();
          const visibleNotes = showAllNotes ? sortedNotes : sortedNotes.slice(0, 5);
          return (
            <div className="mb-3">
              <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Notes</h4>
              <div className="space-y-1">
                {visibleNotes.map((note, i) => (
                  <div key={i} className="text-[11px] text-gray-600 bg-gray-50 rounded px-2 py-1">
                    {note.text}
                    {note.date && (
                      <span className="text-gray-300 ml-1 text-[10px]">
                        ({new Date(note.date).toLocaleDateString()})
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {sortedNotes.length > 5 && (
                <button
                  onClick={() => setShowAllNotes(!showAllNotes)}
                  className="text-[10px] text-primary-600 hover:text-primary-800 font-medium mt-1"
                >
                  {showAllNotes ? 'Show less' : `Show all ${sortedNotes.length} notes`}
                </button>
              )}
            </div>
          );
        })()}

        {/* Add note */}
        {!disabled && (
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addNote(); }}
              placeholder="Add a note..."
              className="flex-1 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-300"
            />
            <button
              onClick={addNote}
              disabled={!noteText.trim()}
              className="text-xs font-medium text-primary-600 hover:text-primary-800 disabled:opacity-30 px-2"
            >
              Add
            </button>
          </div>
        )}

        {/* Shared meetings */}
        {meetings && (task.meetingIds || []).length > 0 && (
          <div className="mb-3">
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Shared with</h4>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(task.meetingIds || []).map(mid => {
                const mtg = meetings.find(m => m.id === mid);
                if (!mtg) return null;
                const isCurrent = mid === currentMeetingId;
                return (
                  <span
                    key={mid}
                    className={`inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full ${
                      isCurrent ? 'bg-primary-50 text-primary-600' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {mtg.name}
                    {!isCurrent && !disabled && (
                      <button
                        onClick={async () => {
                          await updateTask(task.id, {
                            meetingIds: (task.meetingIds || []).filter(id => id !== mid),
                          });
                        }}
                        className="hover:text-red-500 ml-0.5"
                      >
                        <X size={8} />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Share to another meeting */}
        {!disabled && onTagTask && (
          <button
            onClick={() => { onTagTask(task.id); onClose(); }}
            className="flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-700 font-medium mb-2"
          >
            <Share2 size={12} /> Add to another meeting
          </button>
        )}

        {/* Convert journal entry chip to inline text */}
        {!disabled && onConvertToText && task.type === 'journal_entry' && task.journalText && (
          <button
            onClick={() => { onConvertToText(task.id); onClose(); }}
            className="flex items-center gap-1.5 text-xs text-sky-500 hover:text-sky-700 font-medium mb-2"
          >
            <BookOpen size={12} /> Convert to inline text
          </button>
        )}

        {/* Delete task */}
        {!disabled && onDeleteTask && (
          <div className="pt-2 border-t border-gray-100 mt-2">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Delete this task?</span>
                <button
                  onClick={() => { onDeleteTask(task.id); onClose(); }}
                  className="text-xs font-medium text-red-600 hover:text-red-800 px-2 py-1 rounded bg-red-50"
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 font-medium"
              >
                <Trash2 size={12} /> Remove task
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── InsertTaskModal ────────────────────────────────────────── */

function InsertTaskModal({ type, meetingId, instanceId, onInsert, onClose, allMeetings, individualId }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [phoneNumbers, setPhoneNumbers] = useState(['']);
  const [messageText, setMessageText] = useState('');
  const [selectedMeetingId, setSelectedMeetingId] = useState(meetingId || '');
  const typeConfig = TASK_TYPES[type];

  // Determine effective meeting ID: explicit prop or user-selected
  const effectiveMeetingId = meetingId || (selectedMeetingId ? Number(selectedMeetingId) : null);

  async function handleCreate() {
    if (!title.trim()) return;
    const taskData = {
      type,
      types: [type],
      title: title.trim(),
      description: description.trim(),
      meetingIds: effectiveMeetingId ? [effectiveMeetingId] : [],
      sourceMeetingInstanceId: instanceId || null,
      followUp: type === 'discussion' || type === 'ongoing' ? 'next' : null,
    };
    if (type === 'action_item') taskData.priority = 'medium';
    if (type === 'event' && eventDate) taskData.eventDate = eventDate;
    if (type === 'follow_up') {
      const cleanNumbers = phoneNumbers.map(p => p.trim()).filter(Boolean);
      taskData.phoneNumbers = cleanNumbers;
      taskData.phoneNumber = cleanNumbers[0] || ''; // backward compat
      taskData.messageText = messageText.trim();
      taskData.context = 'phone';
    }
    if (individualId) taskData.individualId = individualId;

    const id = await addTask(taskData);
    onInsert(id);
    onClose();
  }

  function addPhoneField() {
    setPhoneNumbers(prev => [...prev, '']);
  }

  function removePhoneField(index) {
    setPhoneNumbers(prev => prev.filter((_, i) => i !== index));
  }

  function updatePhoneField(index, value) {
    setPhoneNumbers(prev => prev.map((p, i) => i === index ? value : p));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-5 animate-in fade-in mx-4 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          {typeConfig && (() => {
            const Icon = TYPE_ICONS[type];
            return Icon ? <Icon size={16} className="text-primary-600" /> : null;
          })()}
          New {typeConfig?.label || 'Task'}
        </h3>
        <div className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            placeholder={`${typeConfig?.label || 'Task'} title...`}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            autoFocus
          />
          {type === 'event' && (
            <div>
              <label className="text-[11px] font-medium text-gray-500 mb-1 block">Event Date</label>
              <input
                type="date"
                value={eventDate}
                onChange={e => setEventDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
            </div>
          )}
          {type === 'follow_up' && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-gray-500">Phone Number{phoneNumbers.length > 1 ? 's' : ''}</label>
                  <button
                    type="button"
                    onClick={addPhoneField}
                    className="text-[11px] text-primary-600 hover:text-primary-800 font-medium flex items-center gap-0.5"
                  >
                    <Plus size={12} /> Add Number
                  </button>
                </div>
                <div className="space-y-2">
                  {phoneNumbers.map((phone, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="tel"
                        value={phone}
                        onChange={e => updatePhoneField(i, e.target.value)}
                        placeholder="(555) 123-4567"
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                      />
                      {phoneNumbers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePhoneField(i)}
                          className="p-1.5 text-gray-400 hover:text-red-500"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">Message Text</label>
                <textarea
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  placeholder="Type the message to send..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none"
                />
              </div>
            </>
          )}
          {(type === 'discussion' || type === 'event' || type === 'ministering_plan') && (
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Description or notes..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none"
            />
          )}
          {/* Meeting picker — shown when no meetingId (journal context) */}
          {!meetingId && allMeetings && allMeetings.length > 0 && (
            <div>
              <label className="text-[11px] font-medium text-gray-500 mb-1 block">Link to Meeting (optional)</label>
              <select
                value={selectedMeetingId}
                onChange={e => setSelectedMeetingId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 bg-white"
              >
                <option value="">None</option>
                {allMeetings.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={!title.trim()}
              className="btn-primary flex-1"
            >
              {meetingId ? 'Add to Agenda' : 'Create Task'}
            </button>
            <button onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── MakeTaskModal (from highlighted text) ────────────────── */

function MakeTaskModal({ initialTitle, meetingId, instanceId, onCreated, onClose, individualId }) {
  const [title, setTitle] = useState(initialTitle || '');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [selectedTypes, setSelectedTypes] = useState(['action_item']);

  function toggleType(typeKey) {
    setSelectedTypes(prev => {
      if (prev.includes(typeKey)) {
        // Don't allow deselecting the last type
        if (prev.length <= 1) return prev;
        return prev.filter(t => t !== typeKey);
      }
      return [...prev, typeKey];
    });
  }

  async function handleCreate() {
    if (!title.trim()) return;
    const primaryType = selectedTypes[0];
    const taskData = {
      type: primaryType,
      types: [...selectedTypes],
      title: title.trim(),
      description: description.trim(),
      meetingIds: meetingId ? [meetingId] : [],
      sourceMeetingInstanceId: instanceId || null,
      followUp: selectedTypes.includes('discussion') || selectedTypes.includes('ongoing') ? 'next' : null,
    };
    if (selectedTypes.includes('action_item')) taskData.priority = 'medium';
    if (selectedTypes.includes('event') && eventDate) taskData.eventDate = eventDate;
    if (individualId) taskData.individualId = individualId;

    const id = await addTask(taskData);
    onCreated(id);
    onClose();
  }

  const showEventDate = selectedTypes.includes('event');
  const showDescription = selectedTypes.some(t => ['discussion', 'event', 'ministering_plan'].includes(t));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-5 animate-in fade-in mx-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <CheckSquare size={16} className="text-primary-600" />
          Make Task from Selection
        </h3>
        <p className="text-[11px] text-gray-400 mb-3">Create a task and insert a chip into your notes</p>

        <div className="space-y-3">
          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="Task title..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            autoFocus
          />

          {/* Type selection — multi-select checkboxes */}
          <div>
            <label className="text-[11px] font-medium text-gray-500 mb-1.5 block">Task Type(s)</label>
            <div className="flex flex-wrap gap-1.5">
              {TASK_TYPE_LIST.map(typeConfig => {
                const typeKey = typeConfig.key;
                const isSelected = selectedTypes.includes(typeKey);
                const Icon = TYPE_ICONS[typeKey] || CheckSquare;
                const c = CHIP_COLORS[typeKey] || CHIP_COLORS.action_item;
                return (
                  <button
                    key={typeKey}
                    type="button"
                    onClick={() => toggleType(typeKey)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isSelected
                        ? 'ring-2 ring-offset-1 shadow-sm'
                        : 'opacity-50 hover:opacity-75'
                    }`}
                    style={{
                      background: c.bg,
                      color: c.fg,
                      border: `1px solid ${c.bd}`,
                      ...(isSelected ? { ringColor: c.fg } : {}),
                    }}
                  >
                    <Icon size={13} />
                    {typeConfig.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Event date (shown when 'event' type is selected) */}
          {showEventDate && (
            <div>
              <label className="text-[11px] font-medium text-gray-500 mb-1 block">Event Date</label>
              <input
                type="date"
                value={eventDate}
                onChange={e => setEventDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
            </div>
          )}

          {/* Description (shown for discussion, event, ministering) */}
          {showDescription && (
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Description or notes..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none"
            />
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={!title.trim()}
              className="btn-primary flex-1"
            >
              Create Task
            </button>
            <button onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── ImportTaskPicker ──────────────────────────────────────── */

function ImportTaskPicker({ meetingId, htmlContent, meetings, onImport, onClose }) {
  const [search, setSearch] = useState('');
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load all incomplete tasks on mount
  useMemo(() => {
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

  // IDs already in the editor content
  const existingIds = useMemo(() => {
    return new Set(extractTaskIdsFromHtml(htmlContent || ''));
  }, [htmlContent]);

  // Filter: exclude tasks already on this meeting or already in the editor
  const available = useMemo(() => {
    return allTasks.filter(t => {
      if (existingIds.has(t.id)) return false;
      if ((t.meetingIds || []).includes(meetingId)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!t.title.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allTasks, existingIds, meetingId, search]);

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
    const updatedMeetingIds = [...(task.meetingIds || []), meetingId];
    await updateTask(task.id, { meetingIds: updatedMeetingIds });
    onImport(task.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-5 animate-in fade-in max-h-[70vh] flex flex-col mx-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Import size={16} className="text-gray-600" />
          Import Task from Another Meeting
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
              <p className="text-xs">{search ? 'No matching tasks found.' : 'No tasks available to import.'}</p>
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
                          <TypeIcon size={12} className="text-gray-300 flex-shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cancel */}
        <button onClick={onClose} className="btn-secondary w-full mt-3">
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── JournalPickerModal (pick a spiritual thought → create task) */

function JournalPickerModal({ meetingId, instanceId, onInsert, onClose }) {
  const [sectionFilter, setSectionFilter] = useState('spiritual_thoughts');
  const { entries, loading } = useJournalBySection(sectionFilter);
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? entries.filter(e => e.text.toLowerCase().includes(search.toLowerCase()))
    : entries;

  async function handlePick(entry) {
    // Create a spiritual_thought task from the journal entry
    const title = entry.text.length > 80
      ? entry.text.substring(0, 80) + '...'
      : entry.text;
    const taskData = {
      type: 'spiritual_thought',
      types: ['spiritual_thought'],
      title,
      description: entry.text,
      meetingIds: meetingId ? [meetingId] : [],
      sourceMeetingInstanceId: instanceId || null,
      journalEntryId: entry.id,
    };
    const id = await addTask(taskData);
    onInsert(id);
    onClose();
  }

  const SECTION_COLORS = {
    spiritual_thoughts: 'bg-violet-600 text-white',
    impressions: 'bg-blue-600 text-white',
    promptings: 'bg-amber-600 text-white',
    gratitude: 'bg-emerald-600 text-white',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-5 animate-in fade-in max-h-[70vh] flex flex-col mx-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Sparkles size={16} className="text-violet-600" />
          Select Spiritual Thought
        </h3>

        {/* Section filter pills */}
        <div className="flex gap-2 mb-3 flex-wrap">
          <button
            onClick={() => setSectionFilter(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              !sectionFilter
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            All
          </button>
          {JOURNAL_SECTIONS.map(sec => (
            <button
              key={sec.key}
              onClick={() => setSectionFilter(sec.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                sectionFilter === sec.key
                  ? SECTION_COLORS[sec.key] || 'bg-gray-800 text-white'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {sec.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search entries..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            autoFocus
          />
        </div>

        {/* Entry list */}
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="text-center py-8 text-gray-400">
              <div className="animate-spin w-5 h-5 border-2 border-primary-300 border-t-primary-700 rounded-full mx-auto mb-2" />
              <p className="text-xs">Loading journal...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Sparkles size={24} className="mx-auto mb-2 text-gray-300" />
              <p className="text-xs">{search ? 'No matching entries.' : 'No journal entries in this section yet.'}</p>
              <p className="text-[10px] text-gray-300 mt-1">Add entries in the Journal first.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map(entry => (
                <button
                  key={entry.id}
                  onClick={() => handlePick(entry)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-violet-50 transition-colors border border-transparent hover:border-violet-200"
                >
                  <p className="text-xs text-gray-800 line-clamp-3">{entry.text}</p>
                  <span className="text-[10px] text-gray-400 mt-1 block">
                    {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button onClick={onClose} className="btn-secondary w-full mt-3">
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── IndividualPickerModal ─────────────────────────────────── */

function IndividualPickerModal({ meetingId, onInsert, onClose }) {
  const [individuals, setIndividuals] = useState([]);
  const [search, setSearch] = useState('');
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [inserting, setInserting] = useState(false);

  useEffect(() => {
    getIndividuals(false).then(list => {
      setIndividuals(list);
      setLoading(false);
    });
  }, []);

  const filtered = individuals.filter(ind =>
    !search || (ind.title || '').toLowerCase().includes(search.toLowerCase())
  );

  function toggleSelection(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleInsertSelected() {
    if (selectedIds.size === 0) return;
    setInserting(true);
    try {
      for (const id of selectedIds) {
        const ind = individuals.find(i => i.id === id);
        if (ind && meetingId && !(ind.meetingIds || []).includes(meetingId)) {
          await updateTask(ind.id, {
            meetingIds: [...(ind.meetingIds || []), meetingId],
          });
        }
        onInsert(id);
      }
      onClose();
    } finally {
      setInserting(false);
    }
  }

  async function handleCreateNew(data) {
    // Inject meetingId if available
    if (meetingId && !(data.meetingIds || []).includes(meetingId)) {
      data.meetingIds = [...(data.meetingIds || []), meetingId];
    }
    const id = await addTask(data);
    onInsert(id);
    setCreateFormOpen(false);
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
        <div
          className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-4 mx-4 max-h-[70vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <UserRound size={16} className="text-cyan-600" />
            Insert Individuals
            {selectedIds.size > 0 && (
              <span className="text-[10px] bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded-full font-medium">
                {selectedIds.size} selected
              </span>
            )}
          </h3>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field pl-8 text-sm"
              placeholder="Search individuals..."
              autoFocus
            />
          </div>

          {/* List — multi-select with checkmarks */}
          <div className="flex-1 overflow-y-auto space-y-1 mb-3 min-h-0">
            {loading && <p className="text-xs text-gray-400 text-center py-4">Loading...</p>}
            {!loading && filtered.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">
                {search ? 'No matches' : 'No individuals on focus list yet'}
              </p>
            )}
            {filtered.map(ind => {
              const isSelected = selectedIds.has(ind.id);
              // Compute recent notes (last 30 days)
              const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
              const recentNotes = (ind.followUpNotes || [])
                .filter(n => n.date && new Date(n.date).getTime() >= thirtyDaysAgo)
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 2);
              return (
                <button
                  key={ind.id}
                  onClick={() => toggleSelection(ind.id)}
                  className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg border transition-colors text-left ${
                    isSelected
                      ? 'border-cyan-300 bg-cyan-50'
                      : 'border-gray-100 hover:border-cyan-200 hover:bg-cyan-50/50'
                  }`}
                >
                  {/* Checkbox indicator */}
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    isSelected
                      ? 'bg-cyan-600 border-cyan-600 text-white'
                      : 'border-gray-300'
                  }`}>
                    {isSelected && <CheckCircle2 size={12} />}
                  </div>
                  <UserRound size={14} className="text-cyan-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{ind.title}</p>
                    {ind.nextOrdinance && (
                      <p className="text-[10px] text-cyan-600">Next: {ind.nextOrdinance}</p>
                    )}
                    {/* Recent updates (last 30 days) */}
                    {recentNotes.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {recentNotes.map((note, i) => (
                          <p key={i} className="text-[10px] text-gray-500 truncate">
                            <span className="text-gray-300">
                              {new Date(note.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}:
                            </span>{' '}
                            {note.text}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {selectedIds.size > 0 ? (
              <button
                onClick={handleInsertSelected}
                disabled={inserting}
                className="btn-primary flex-1 flex items-center justify-center gap-1.5"
              >
                {inserting ? 'Inserting...' : `Insert ${selectedIds.size} Individual${selectedIds.size > 1 ? 's' : ''}`}
              </button>
            ) : (
              <button
                onClick={() => setCreateFormOpen(true)}
                className="btn-primary flex-1 flex items-center justify-center gap-1.5"
              >
                <Plus size={14} />
                Create New
              </button>
            )}
            <button onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </div>

      {/* Inline IndividualForm for create */}
      {createFormOpen && (
        <IndividualFormInline
          onSave={handleCreateNew}
          onClose={() => setCreateFormOpen(false)}
        />
      )}
    </>
  );
}

/**
 * A lightweight inline form for creating an individual from within BlockEditor.
 * Simpler than the full IndividualForm — just name and optional next ordinance.
 */
function IndividualFormInline({ onSave, onClose }) {
  const [name, setName] = useState('');
  const [nextOrdinance, setNextOrdinance] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      type: 'individual',
      types: ['individual'],
      title: name.trim(),
      nextOrdinance: nextOrdinance.trim() || undefined,
      status: 'in_progress',
      priority: 'medium',
      isArchived: false,
      checkInCadence: 'monthly',
      meetingIds: [],
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-5 mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <UserRound size={16} className="text-cyan-600" />
          New Individual
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="input-field"
            placeholder="Person's name"
            autoFocus
            required
          />
          <input
            type="text"
            value={nextOrdinance}
            onChange={e => setNextOrdinance(e.target.value)}
            className="input-field"
            placeholder="Next Ordinance (optional)"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={!name.trim()} className="btn-primary flex-1">
              Add to Focus
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main BlockEditor Component ─────────────────────────────── */

export default function BlockEditor({
  blocks = [],
  onChange,
  onSave,
  meetingId,
  instanceId,
  disabled = false,
  finalized = false,
  onTagTask,
  meetings,
  onInsertRef,
  onGetSelectedTextRef,
  // Journal mode props
  mode = 'meeting',
  journalEntryId,
  journalListId,
  onTagJournalList,
  onTagMeeting,
  journalLists,
  autoSaveMs: autoSaveMsProp,
  // Individual context
  individualId,
  // Layout helpers
  toolbarHeader,
  stickyTopOffset = 0,
}) {
  const [insertModal, setInsertModal] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [importPickerOpen, setImportPickerOpen] = useState(false);
  const [makeTaskOpen, setMakeTaskOpen] = useState(false);
  const [makeTaskTitle, setMakeTaskTitle] = useState('');
  const [journalPickerOpen, setJournalPickerOpen] = useState(false);
  const [individualPickerOpen, setIndividualPickerOpen] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(true);
  const [individualDetailTask, setIndividualDetailTask] = useState(null);

  // Load all meetings for journal mode task creation (meeting picker)
  const allMeetings = useLiveQuery(
    () => (mode === 'journal' ? getMeetings() : Promise.resolve(null)),
    [mode]
  );

  // Derive HTML content from blocks
  const initialHtml = useMemo(() => {
    if (!blocks.length) return '<p></p>';
    // Rich text format
    if (blocks[0]?.type === 'richtext') return blocks[0].html || '<p></p>';
    // Plain text format — migrate
    const text = blocks.map(b => {
      if (b.type === 'text') return b.text || '';
      if (b.type === 'task_ref') return `{{task:${b.taskId}}}`;
      return '';
    }).join('\n').replace(/\n{3,}/g, '\n\n');
    return migrateTextToHtml(text);
  }, []); // Only compute once on mount

  // Current HTML for extracting task IDs (updated on each change)
  const [currentHtml, setCurrentHtml] = useState(initialHtml);
  const taskIds = useMemo(() => extractTaskIdsFromHtml(currentHtml), [currentHtml]);

  // Query per-meeting task statuses (reactive via useLiveQuery)
  const { statuses: meetingStatusList } = useMeetingTaskStatuses(meetingId);
  const meetingTaskStatusMap = useMemo(() => {
    const map = {};
    for (const s of meetingStatusList) map[s.taskId] = s;
    return map;
  }, [meetingStatusList]);

  // Initialize rich text editor
  const {
    editor,
    saveStatus,
    taskMap,
    hasSelection,
    insertTaskChip,
    getSelectedText,
    replaceSelectionWithChip,
    formattingToolbar,
    editorView,
  } = useRichTextEditor({
    initialHtml,
    onContentChange: (html) => {
      setCurrentHtml(html);
      // Propagate to parent as richtext block
      const id = blocks[0]?.id || newBlockId();
      onChange?.([{ id, type: 'richtext', html }]);
    },
    onSave: async (html) => {
      const id = blocks[0]?.id || newBlockId();
      await onSave?.([{ id, type: 'richtext', html }]);
    },
    onClickTask: (id) => {
      const task = taskMap[id];
      if (task?.status === 'complete') {
        updateTask(id, { status: 'not_started' });
      } else if (task?.type === 'individual') {
        // Open full IndividualDetail for individual-type tasks
        setIndividualDetailTask(task);
      } else {
        setSelectedTaskId(id);
      }
    },
    onMakeTask: () => {
      const text = getSelectedText();
      setMakeTaskTitle(text || '');
      setMakeTaskOpen(true);
    },
    disabled,
    taskIds,
    autoSaveMs: autoSaveMsProp ?? 60000,
    meetingTaskStatuses: meetingTaskStatusMap,
  });

  // Expose insertTaskChip to parent via callback ref
  useMemo(() => {
    if (onInsertRef) onInsertRef(insertTaskChip);
  }, [onInsertRef, insertTaskChip]);

  // Expose getSelectedText to parent via callback ref
  useMemo(() => {
    if (onGetSelectedTextRef) onGetSelectedTextRef(getSelectedText);
  }, [onGetSelectedTextRef, getSelectedText]);

  // Selected task for the panel
  const selectedTask = selectedTaskId ? taskMap[selectedTaskId] : null;
  const selectedTaskMeetingStatus = selectedTaskId ? meetingTaskStatusMap[selectedTaskId] : null;

  // Handle task insertion from modal
  function handleTaskInsert(taskId) {
    insertTaskChip(taskId);
  }

  // Handle person button click — skip picker if text is highlighted
  async function handlePersonClick() {
    const selected = getSelectedText();
    if (selected && selected.trim()) {
      // Auto-create individual with highlighted text as name
      const data = {
        type: 'individual',
        types: ['individual'],
        title: selected.trim(),
        status: 'in_progress',
        priority: 'medium',
        isArchived: false,
        checkInCadence: 'monthly',
        meetingIds: meetingId ? [meetingId] : [],
      };
      const id = await addTask(data);
      replaceSelectionWithChip(id);
    } else {
      setIndividualPickerOpen(true);
    }
  }

  // Handle deleting a task — removes chip from editor and deletes from DB
  async function handleDeleteTask(taskId) {
    // Remove the chip from the editor
    if (editor) {
      const { doc } = editor.state;
      let chipPos = null;
      let chipNode = null;
      doc.descendants((node, pos) => {
        if (node.type.name === 'taskChip' && Number(node.attrs.taskId) === taskId) {
          chipPos = pos;
          chipNode = node;
          return false;
        }
      });
      if (chipPos !== null && chipNode) {
        const { tr } = editor.state;
        tr.delete(chipPos, chipPos + chipNode.nodeSize);
        editor.view.dispatch(tr);
      }
    }
    // Delete from database
    await deleteTask(taskId);
    setSelectedTaskId(null);
  }

  // Handle converting a journal_entry task chip to inline text
  function handleConvertToText(taskId) {
    if (!editor) return;
    const task = taskMap[taskId];
    const text = task?.journalText || task?.title || '';
    if (!text) return;

    // Find the taskChip node with the matching taskId
    const { doc } = editor.state;
    let chipPos = null;
    let chipNode = null;
    doc.descendants((node, pos) => {
      if (node.type.name === 'taskChip' && Number(node.attrs.taskId) === taskId) {
        chipPos = pos;
        chipNode = node;
        return false; // stop searching
      }
    });

    if (chipPos === null || !chipNode) return;

    // Replace the chip with the journal text as a text node
    const { tr } = editor.state;
    tr.replaceWith(chipPos, chipPos + chipNode.nodeSize, editor.schema.text(text));
    editor.view.dispatch(tr);
  }

  // Handle task created from "Make Task" (replaces selected text with chip)
  function handleMakeTaskCreated(taskId) {
    if (hasSelection) {
      replaceSelectionWithChip(taskId);
    } else {
      insertTaskChip(taskId);
    }
  }

  // Toolbar items (task creation)
  const toolbarItems = [
    { type: 'action_item', icon: CheckSquare, label: 'Action', color: 'text-primary-600' },
    { type: 'discussion', icon: MessageSquare, label: 'Discuss', color: 'text-indigo-600' },
    { type: 'event', icon: CalendarDays, label: 'Event', color: 'text-green-600' },
    { type: 'calling_plan', icon: Briefcase, label: 'Calling', color: 'text-purple-600' },
    { type: 'ministering_plan', icon: Heart, label: 'Minister', color: 'text-rose-600' },
    { type: 'ongoing', icon: RotateCw, label: 'Ongoing', color: 'text-amber-600' },
    { type: 'follow_up', icon: PhoneForwarded, label: 'Follow Up', color: 'text-teal-600' },
    { type: 'spiritual_thought', icon: Sparkles, label: 'Thought', color: 'text-violet-600' },
  ];

  return (
    <div className="relative">
      {/* Document area — paper-like container with formatting toolbar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm min-h-[200px]">
        {/* Formatting toolbar — sticky below page header */}
        {!disabled && (
          <div className="sticky z-20 bg-gray-50/95 backdrop-blur-sm rounded-t-xl" style={{ top: stickyTopOffset }}>
            {formattingToolbar}
          </div>
        )}

        {/* Editor content */}
        {editorView}

        {/* Auto-save status indicator */}
        {saveStatus && (
          <div className="flex items-center gap-1 px-3 py-1 border-t border-gray-100 bg-gray-50/50">
            {saveStatus === 'saving' ? (
              <>
                <Cloud size={12} className="text-blue-400 animate-pulse" />
                <span className="text-[10px] text-gray-400">Saving...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={12} className="text-green-400" />
                <span className="text-[10px] text-gray-400">Saved</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom toolbar — task insertion (collapsible) */}
      {!disabled && (
        <div className="sticky bottom-16 z-20 mt-3">
          {/* Tag bar header (from parent) */}
          {toolbarHeader && (
            <div className="bg-white/90 backdrop-blur-sm border border-gray-200 border-b-0 rounded-t-lg px-2.5 py-1">
              {toolbarHeader}
            </div>
          )}
          <div className={`bg-white border border-gray-200 shadow-lg overflow-hidden ${toolbarHeader ? 'rounded-b-xl' : 'rounded-xl'}`}>
            {/* Toggle handle */}
            <button
              onClick={() => setToolbarCollapsed(prev => !prev)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 hover:bg-gray-50 transition-colors border-b border-gray-100"
            >
              {toolbarCollapsed ? (
                <>
                  <ChevronUp size={14} className="text-gray-400" />
                  <span className="text-[10px] text-gray-400 font-medium">Insert</span>
                </>
              ) : (
                <ChevronDown size={14} className="text-gray-400" />
              )}
            </button>

            {/* Expandable toolbar grid */}
            {!toolbarCollapsed && (
              <div className="p-2">
                <div className="grid grid-cols-5 gap-1">
                  {/* Journal mode: show all task types + tag buttons */}
                  {mode === 'journal' ? (
                    <>
                      {toolbarItems.map(item => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.type}
                            onClick={() => setInsertModal(item.type)}
                            className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            <Icon size={15} className={item.color} />
                            <span className="text-[8px] text-gray-500 font-medium">{item.label}</span>
                          </button>
                        );
                      })}
                      {onTagJournalList && (
                        <button
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => onTagJournalList(getSelectedText(), currentHtml)}
                          className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <Tag size={15} className="text-violet-600" />
                          <span className="text-[8px] text-gray-500 font-medium">To List</span>
                        </button>
                      )}
                      {onTagMeeting && (
                        <button
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => onTagMeeting(getSelectedText(), currentHtml)}
                          className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <CalendarDays size={15} className="text-indigo-600" />
                          <span className="text-[8px] text-gray-500 font-medium">To Mtg</span>
                        </button>
                      )}
                      <button
                        onClick={handlePersonClick}
                        className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <UserRound size={15} className="text-cyan-600" />
                        <span className="text-[8px] text-gray-500 font-medium">Person</span>
                      </button>
                    </>
                  ) : (
                    /* Meeting mode: show all task type buttons + individual */
                    <>
                      {toolbarItems.map(item => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.type}
                            onClick={() => {
                              if (item.type === 'spiritual_thought') {
                                setJournalPickerOpen(true);
                              } else {
                                setInsertModal(item.type);
                              }
                            }}
                            className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            <Icon size={16} className={item.color} />
                            <span className="text-[9px] text-gray-500 font-medium">{item.label}</span>
                          </button>
                        );
                      })}
                      <button
                        onClick={handlePersonClick}
                        className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <UserRound size={16} className="text-cyan-600" />
                        <span className="text-[9px] text-gray-500 font-medium">Person</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Task detail panel (bottom sheet) */}
      {selectedTaskId && (
        <TaskPanel
          task={selectedTask}
          onClose={() => setSelectedTaskId(null)}
          disabled={disabled}
          onTagTask={onTagTask}
          onConvertToText={handleConvertToText}
          onDeleteTask={handleDeleteTask}
          meetings={meetings}
          currentMeetingId={meetingId}
          meetingStatus={selectedTaskMeetingStatus}
          onSetMeetingStatus={async (taskId, status) => {
            if (meetingId) await setMeetingTaskStatus(taskId, meetingId, status);
          }}
        />
      )}

      {/* Insert task modal */}
      {insertModal && (
        <InsertTaskModal
          type={insertModal}
          meetingId={meetingId}
          instanceId={instanceId}
          individualId={individualId}
          onInsert={handleTaskInsert}
          onClose={() => setInsertModal(null)}
          allMeetings={mode === 'journal' ? (allMeetings || []) : null}
        />
      )}

      {/* Import task picker (meeting mode only) */}
      {mode === 'meeting' && importPickerOpen && (
        <ImportTaskPicker
          meetingId={meetingId}
          htmlContent={currentHtml}
          meetings={meetings}
          onImport={handleTaskInsert}
          onClose={() => setImportPickerOpen(false)}
        />
      )}

      {/* Make Task modal (from highlighted text) */}
      {makeTaskOpen && (
        <MakeTaskModal
          initialTitle={makeTaskTitle}
          meetingId={meetingId}
          instanceId={instanceId}
          individualId={individualId}
          onCreated={handleMakeTaskCreated}
          onClose={() => { setMakeTaskOpen(false); setMakeTaskTitle(''); }}
        />
      )}

      {/* Journal picker modal (meeting mode only — for spiritual thoughts) */}
      {mode === 'meeting' && journalPickerOpen && (
        <JournalPickerModal
          meetingId={meetingId}
          instanceId={instanceId}
          onInsert={handleTaskInsert}
          onClose={() => setJournalPickerOpen(false)}
        />
      )}

      {/* Individual picker modal */}
      {individualPickerOpen && (
        <IndividualPickerModal
          meetingId={meetingId}
          onInsert={handleTaskInsert}
          onClose={() => setIndividualPickerOpen(false)}
        />
      )}

      {/* Full Individual Detail overlay */}
      {individualDetailTask && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          <IndividualDetail
            individual={individualDetailTask}
            onBack={() => setIndividualDetailTask(null)}
            onUpdated={async () => {
              // Refresh the task data
              const updated = await getTask(individualDetailTask.id);
              if (updated) setIndividualDetailTask(updated);
            }}
          />
        </div>
      )}
    </div>
  );
}
