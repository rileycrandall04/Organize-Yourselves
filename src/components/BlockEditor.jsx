import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getTasksByIds, getTasks, addTask, updateTask, addTaskFollowUpNote } from '../db';
import { TASK_TYPES } from '../utils/constants';
import {
  Star, Share2, X, Search, Import,
  CheckCircle2, Circle, Clock, Pause,
  CheckSquare, MessageSquare, CalendarDays, Briefcase, Heart, RotateCw,
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
};

const TYPE_ICONS = {
  action_item: CheckSquare,
  discussion: MessageSquare,
  event: CalendarDays,
  calling_plan: Briefcase,
  ministering_plan: Heart,
  ongoing: RotateCw,
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

// Kept for backward compat during migration
export function createTaskRefBlock(taskId) {
  return { id: newBlockId(), type: 'task_ref', taskId };
}

/* ── Text / HTML / DOM helpers ──────────────────────────────── */

function extractTaskIds(text) {
  const ids = new Set();
  let m;
  const re = new RegExp(MARKER_RE.source, 'g');
  while ((m = re.exec(text)) !== null) ids.add(Number(m[1]));
  return [...ids];
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Convert source text (with {{task:ID}} markers) → HTML for contentEditable */
function textToHtml(text, tm) {
  if (!text) return '<br>';
  const parts = text.split(MARKER_RE);
  let html = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // Plain text segment
      html += esc(parts[i]).replace(/\n/g, '<br>');
    } else {
      // Task ID captured group
      const id = Number(parts[i]);
      const t = tm[id];
      const c = CHIP_COLORS[t?.type] || CHIP_COLORS.action_item;
      const sc = STATUS_CHAR[t?.status] || '\u25CB';
      const title = t?.title || `Task #${id}`;
      const done = t?.status === 'complete';
      html += `<span contenteditable="false" data-task-id="${id}" `
        + `style="display:inline-flex;align-items:center;gap:3px;`
        + `padding:2px 8px 2px 6px;border-radius:6px;`
        + `background:${c.bg};color:${c.fg};border:1px solid ${c.bd};`
        + `font-size:12px;font-weight:500;cursor:pointer;user-select:none;`
        + `vertical-align:baseline;line-height:1.4;margin:0 2px;white-space:nowrap;`
        + `${done ? 'opacity:0.5;text-decoration:line-through;' : ''}`
        + `">${sc}\u00a0${esc(title)}</span>`;
    }
  }
  return html || '<br>';
}

/** Parse contentEditable DOM back to source text with {{task:ID}} markers */
function domToText(el) {
  let r = '';
  for (const n of el.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) {
      r += n.textContent;
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      if (n.dataset?.taskId) {
        r += `{{task:${n.dataset.taskId}}}`;
      } else if (n.tagName === 'BR') {
        r += '\n';
      } else if (n.tagName === 'DIV' || n.tagName === 'P') {
        if (r && !r.endsWith('\n')) r += '\n';
        r += domToText(n);
      } else {
        r += domToText(n);
      }
    }
  }
  return r;
}

/** Update chip visuals in-place (no cursor loss) */
function patchChips(el, tm) {
  for (const chip of el.querySelectorAll('[data-task-id]')) {
    const t = tm[Number(chip.dataset.taskId)];
    if (!t) continue;
    const c = CHIP_COLORS[t.type] || CHIP_COLORS.action_item;
    const sc = STATUS_CHAR[t.status] || '\u25CB';
    const done = t.status === 'complete';
    chip.textContent = `${sc}\u00a0${t.title}`;
    Object.assign(chip.style, {
      background: c.bg, color: c.fg, borderColor: c.bd,
      opacity: done ? '0.5' : '1',
      textDecoration: done ? 'line-through' : 'none',
    });
  }
}

/* ── Block consolidation (old multi-block → single text with markers) */

export function consolidateBlocks(blocks) {
  if (!blocks?.length) return [createTextBlock('')];

  // Already new format? Single text block(s) with no task_ref or old types
  const hasOld = blocks.some(b => b.type === 'task_ref' || (b.type !== 'text'));
  if (!hasOld) {
    // If multiple text blocks, merge them
    if (blocks.length <= 1) return blocks;
    const merged = blocks.map(b => b.text || '').join('\n').replace(/\n{3,}/g, '\n\n');
    return [createTextBlock(merged)];
  }

  // Merge everything into single text with markers
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

  return [createTextBlock(text)];
}

/** Migrate old agendaItems[] format → single text block */
export function migrateAgendaToBlocks(agendaItems, notes) {
  const lines = [];
  for (const it of agendaItems || []) {
    lines.push(`\u2022 ${it.label || ''}`);
    if (it.notes?.trim()) lines.push(`  ${it.notes.trim()}`);
  }
  let text = lines.join('\n');
  if (notes?.trim()) text += (text ? '\n\n' : '') + notes.trim();
  return [createTextBlock(text)];
}

/* ── DocEditor (single contentEditable with inline task chips) ── */

function DocEditor({ content, taskMap, disabled, onContentChange, onClickTask, focusEndRef }) {
  const editorRef = useRef(null);
  const internalRef = useRef(false);
  const taskMapRef = useRef(taskMap);
  taskMapRef.current = taskMap;

  // Render HTML when content changes externally (not from user typing)
  useEffect(() => {
    if (internalRef.current) {
      internalRef.current = false;
      return;
    }
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = textToHtml(content, taskMapRef.current);

    // Focus at end when a task was just inserted
    if (focusEndRef?.current) {
      focusEndRef.current = false;
      el.focus();
      try {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (_) { /* ignore */ }
    }
  }, [content]);

  // Patch chip visuals when task data changes (preserves cursor)
  useEffect(() => {
    if (editorRef.current) patchChips(editorRef.current, taskMap);
  }, [taskMap]);

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    internalRef.current = true;
    onContentChange(domToText(el));
  }, [onContentChange]);

  // Strip formatting on paste — insert as plain text
  const handlePaste = useCallback((e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  const handleClick = useCallback((e) => {
    const chip = e.target.closest?.('[data-task-id]');
    if (chip) {
      e.preventDefault();
      onClickTask(Number(chip.dataset.taskId));
    }
  }, [onClickTask]);

  // Prevent dropping external formatted content
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    if (text) document.execCommand('insertText', false, text);
  }, []);

  const isEmpty = !content?.trim();

  return (
    <div className="relative">
      <div
        ref={editorRef}
        contentEditable={!disabled}
        onInput={handleInput}
        onPaste={handlePaste}
        onClick={handleClick}
        onDrop={handleDrop}
        className="min-h-[200px] text-sm text-gray-800 leading-relaxed focus:outline-none"
        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        suppressContentEditableWarning
      />
      {isEmpty && !disabled && (
        <div className="absolute top-0 left-0 text-sm text-gray-300 pointer-events-none select-none">
          Type your agenda and notes here...
        </div>
      )}
    </div>
  );
}

/* ── TaskPanel (bottom sheet for viewing/editing a task) ────── */

function TaskPanel({ task, onClose, disabled, onTagTask, meetings, currentMeetingId }) {
  const [noteText, setNoteText] = useState('');

  if (!task) return null;

  const StatusIcon = STATUS_ICONS[task.status] || Circle;
  const TypeIcon = TYPE_ICONS[task.type] || CheckSquare;
  const typeLabel = TASK_TYPES[task.type]?.label || 'Task';
  const isComplete = task.status === 'complete';

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-t-2xl shadow-xl p-4 pb-6 max-h-[55vh] overflow-y-auto animate-in slide-in-from-bottom duration-200"
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
              <span className="text-[10px] text-gray-400">{typeLabel}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

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

        {/* Follow-up notes */}
        {task.followUpNotes?.length > 0 && (
          <div className="mb-3">
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Notes</h4>
            <div className="space-y-1">
              {task.followUpNotes.slice(-3).map((note, i) => (
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
          </div>
        )}

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
            className="flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-700 font-medium"
          >
            <Share2 size={12} /> Add to another meeting
          </button>
        )}
      </div>
    </div>
  );
}

/* ── InsertTaskModal ────────────────────────────────────────── */

function InsertTaskModal({ type, meetingId, instanceId, onInsert, onClose }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const typeConfig = TASK_TYPES[type];

  async function handleCreate() {
    if (!title.trim()) return;
    const taskData = {
      type,
      title: title.trim(),
      description: description.trim(),
      meetingIds: meetingId ? [meetingId] : [],
      sourceMeetingInstanceId: instanceId || null,
      followUp: type === 'discussion' || type === 'ongoing' ? 'next' : null,
    };
    if (type === 'action_item') taskData.priority = 'medium';
    if (type === 'event' && eventDate) taskData.eventDate = eventDate;

    const id = await addTask(taskData);
    onInsert(id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-t-2xl shadow-xl p-5 animate-in slide-in-from-bottom"
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
          {(type === 'discussion' || type === 'event' || type === 'ministering_plan') && (
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Description or notes..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none"
            />
          )}
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={!title.trim()}
              className="btn-primary flex-1"
            >
              Add to Agenda
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

function ImportTaskPicker({ meetingId, content, meetings, onImport, onClose }) {
  const [search, setSearch] = useState('');
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load all incomplete tasks on mount
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

  // IDs already in the editor content
  const existingIds = useMemo(() => {
    const ids = new Set();
    let m;
    const re = /\{\{task:(\d+)\}\}/g;
    while ((m = re.exec(content || '')) !== null) ids.add(Number(m[1]));
    return ids;
  }, [content]);

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
        // Use the first meeting as the group key
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-t-2xl shadow-xl p-5 animate-in slide-in-from-bottom max-h-[70vh] flex flex-col"
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

/* ── Main BlockEditor Component ─────────────────────────────── */

export default function BlockEditor({
  blocks = [],
  onChange,
  meetingId,
  instanceId,
  disabled = false,
  finalized = false,
  onTagTask,
  meetings,
}) {
  const [insertModal, setInsertModal] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [importPickerOpen, setImportPickerOpen] = useState(false);
  const focusEndRef = useRef(false);

  // Derive content from blocks (merge if multiple text/task_ref blocks remain)
  const content = useMemo(() => {
    if (!blocks.length) return '';
    return blocks.map(b => {
      if (b.type === 'text') return b.text || '';
      if (b.type === 'task_ref') return `{{task:${b.taskId}}}`;
      return '';
    }).join('\n').replace(/\n{3,}/g, '\n\n');
  }, [blocks]);

  // Extract task IDs from content
  const taskIds = useMemo(() => extractTaskIds(content), [content]);

  // Live-query all referenced tasks
  const tasksData = useLiveQuery(
    () => taskIds.length > 0 ? getTasksByIds(taskIds) : [],
    [taskIds.join(',')]
  ) ?? [];

  const taskMap = useMemo(() => {
    const m = {};
    for (const t of tasksData) m[t.id] = t;
    return m;
  }, [tasksData]);

  // Selected task for the panel
  const selectedTask = selectedTaskId ? taskMap[selectedTaskId] : null;

  function handleContentChange(newContent) {
    const id = blocks[0]?.id || newBlockId();
    onChange([{ id, type: 'text', text: newContent }]);
  }

  function handleTaskInsert(taskId) {
    const marker = `{{task:${taskId}}}`;
    const newText = (content || '').trimEnd() + '\n' + marker + '\n';
    focusEndRef.current = true;
    handleContentChange(newText);
  }

  // Toolbar items
  const toolbarItems = [
    { type: 'action_item', icon: CheckSquare, label: 'Action', color: 'text-primary-600' },
    { type: 'discussion', icon: MessageSquare, label: 'Discuss', color: 'text-indigo-600' },
    { type: 'event', icon: CalendarDays, label: 'Event', color: 'text-green-600' },
    { type: 'calling_plan', icon: Briefcase, label: 'Calling', color: 'text-purple-600' },
    { type: 'ministering_plan', icon: Heart, label: 'Minister', color: 'text-rose-600' },
    { type: 'ongoing', icon: RotateCw, label: 'Ongoing', color: 'text-amber-600' },
  ];

  return (
    <div className="relative">
      {/* Document area — paper-like container */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 min-h-[200px]">
        <DocEditor
          content={content}
          taskMap={taskMap}
          disabled={disabled}
          onContentChange={handleContentChange}
          onClickTask={id => setSelectedTaskId(id)}
          focusEndRef={focusEndRef}
        />
      </div>

      {/* Bottom toolbar — task insertion */}
      {!disabled && !finalized && (
        <div className="sticky bottom-16 z-20 mt-3">
          <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-2">
            <div className="flex items-center justify-between gap-1">
              {toolbarItems.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.type}
                    onClick={() => setInsertModal(item.type)}
                    className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors flex-1"
                  >
                    <Icon size={16} className={item.color} />
                    <span className="text-[9px] text-gray-500 font-medium">{item.label}</span>
                  </button>
                );
              })}
              {/* Import existing task */}
              <button
                onClick={() => setImportPickerOpen(true)}
                className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors flex-1 border-l border-gray-100"
              >
                <Import size={16} className="text-gray-500" />
                <span className="text-[9px] text-gray-500 font-medium">Import</span>
              </button>
            </div>
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
          meetings={meetings}
          currentMeetingId={meetingId}
        />
      )}

      {/* Insert task modal */}
      {insertModal && (
        <InsertTaskModal
          type={insertModal}
          meetingId={meetingId}
          instanceId={instanceId}
          onInsert={handleTaskInsert}
          onClose={() => setInsertModal(null)}
        />
      )}

      {/* Import task picker */}
      {importPickerOpen && (
        <ImportTaskPicker
          meetingId={meetingId}
          content={content}
          meetings={meetings}
          onImport={handleTaskInsert}
          onClose={() => setImportPickerOpen(false)}
        />
      )}
    </div>
  );
}
