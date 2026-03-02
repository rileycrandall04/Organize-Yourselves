import { useState, useRef, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getTasksByIds, addTask, updateTask, addTaskFollowUpNote } from '../db';
import { TASK_TYPES } from '../utils/constants';
import {
  ChevronDown, Star,
  CheckCircle2, Circle, Clock, Pause,
  CheckSquare, MessageSquare, CalendarDays, Briefcase, Heart, RotateCw,
} from 'lucide-react';

// ── Unique ID generator ────────────────────────────────────
let _blockCounter = 0;
function newBlockId() {
  return `b_${Date.now()}_${++_blockCounter}`;
}

// ── Block factory helpers ──────────────────────────────────
export function createTextBlock(text = '') {
  return { id: newBlockId(), type: 'text', text };
}
export function createTaskRefBlock(taskId) {
  return { id: newBlockId(), type: 'task_ref', taskId };
}

// ── Consolidate old multi-block format → simplified text + task_ref ──
export function consolidateBlocks(blocks) {
  if (!blocks || blocks.length === 0) return [createTextBlock('')];

  // Check if consolidation is needed (any non-text, non-task_ref blocks)
  const needsConsolidation = blocks.some(b =>
    b.type !== 'text' && b.type !== 'task_ref'
  );
  if (!needsConsolidation) return blocks;

  const result = [];
  let textAccum = '';

  for (const block of blocks) {
    if (block.type === 'task_ref') {
      // Flush accumulated text before the task card
      result.push({ id: newBlockId(), type: 'text', text: textAccum });
      textAccum = '';
      result.push({ ...block });
    } else if (block.type === 'heading') {
      if (textAccum) textAccum += '\n';
      textAccum += block.text;
    } else if (block.type === 'bullet') {
      if (textAccum) textAccum += '\n';
      textAccum += `• ${block.text}`;
    } else if (block.type === 'text' || block.type === 'notepad') {
      if (block.text) {
        if (textAccum) textAccum += '\n';
        textAccum += block.text;
      }
    }
    // dividers are silently dropped
  }

  // Flush remaining text
  result.push({ id: newBlockId(), type: 'text', text: textAccum });

  if (result.length === 0) {
    result.push(createTextBlock(''));
  }

  return result;
}

// ── Migrate old agendaItems → blocks (simplified format) ───
export function migrateAgendaToBlocks(agendaItems, notes) {
  const lines = [];
  for (const item of (agendaItems || [])) {
    const label = item.label || '';
    lines.push(`• ${label}`);
    if (item.notes?.trim()) {
      lines.push(`  ${item.notes.trim()}`);
    }
  }

  let text = lines.join('\n');
  if (notes?.trim()) {
    text += (text ? '\n\n' : '') + notes.trim();
  }

  return [
    createTextBlock(text),
    createTextBlock(''),
  ];
}

// ── Status icons & colors ─────────────────────────────────
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

// ── Task type icons & colors ──────────────────────────────
const TYPE_ICONS = {
  action_item: CheckSquare,
  discussion: MessageSquare,
  event: CalendarDays,
  calling_plan: Briefcase,
  ministering_plan: Heart,
  ongoing: RotateCw,
};

const TYPE_COLORS = {
  action_item: 'border-l-primary-400',
  discussion: 'border-l-indigo-400',
  event: 'border-l-green-400',
  calling_plan: 'border-l-purple-400',
  ministering_plan: 'border-l-rose-400',
  ongoing: 'border-l-amber-400',
};

// ── Auto-growing textarea ─────────────────────────────────
function AutoTextarea({ value, onChange, placeholder, className = '', disabled, minHeight = 24 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = Math.max(ref.current.scrollHeight, minHeight) + 'px';
    }
  }, [value, minHeight]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      rows={1}
      className={`w-full resize-none overflow-hidden bg-transparent focus:outline-none ${className}`}
      style={{ minHeight: `${minHeight}px` }}
    />
  );
}

// ── Document Text Block ───────────────────────────────────
function DocTextarea({ block, onChange, disabled, isMainArea }) {
  return (
    <AutoTextarea
      value={block.text}
      onChange={e => onChange({ ...block, text: e.target.value })}
      placeholder={isMainArea ? 'Type your agenda and notes here...' : ''}
      disabled={disabled}
      className="text-sm text-gray-800 leading-relaxed placeholder:text-gray-300"
      minHeight={isMainArea ? 80 : 24}
    />
  );
}

// ── Task Ref Block (inline task card) ─────────────────────
function TaskRefBlock({ block, task, disabled }) {
  const [expanded, setExpanded] = useState(false);
  const [noteText, setNoteText] = useState('');

  if (!task) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-400 italic">
        Task not found (deleted?)
      </div>
    );
  }

  const StatusIcon = STATUS_ICONS[task.status] || Circle;
  const TypeIcon = TYPE_ICONS[task.type] || CheckSquare;
  const borderClass = TYPE_COLORS[task.type] || 'border-l-gray-300';
  const isComplete = task.status === 'complete';
  const typeLabel = TASK_TYPES[task.type]?.label || task.type;

  async function cycleStatus(e) {
    e.stopPropagation();
    if (disabled) return;
    const next = isComplete ? 'not_started' : task.status === 'in_progress' ? 'complete' : 'in_progress';
    await updateTask(task.id, { status: next });
  }

  async function toggleStar(e) {
    e.stopPropagation();
    if (disabled) return;
    await updateTask(task.id, { starred: !task.starred });
  }

  async function toggleFollowUp(e) {
    e.stopPropagation();
    if (disabled) return;
    const next = task.followUp === 'next' ? null : 'next';
    await updateTask(task.id, { followUp: next });
  }

  async function addNote() {
    if (!noteText.trim()) return;
    await addTaskFollowUpNote(task.id, {
      text: noteText.trim(),
      meetingName: '',
    });
    setNoteText('');
  }

  return (
    <div className={`rounded-lg border border-gray-200 bg-white border-l-[3px] ${borderClass} overflow-hidden`}>
      {/* Compact header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <button onClick={cycleStatus} className={`flex-shrink-0 ${STATUS_COLORS[task.status]}`}>
          <StatusIcon size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-medium truncate ${isComplete ? 'line-through text-gray-400' : 'text-gray-900'}`}>
              {task.title}
            </span>
            {task.starred && <Star size={11} className="text-amber-400 fill-amber-400 flex-shrink-0" />}
          </div>
        </div>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">
          {typeLabel}
        </span>
        {task.followUp === 'next' && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 flex-shrink-0">
            Follow Up
          </span>
        )}
        <ChevronDown size={12} className={`text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-2.5 border-t border-gray-100 pt-2 space-y-2">
          {/* Description */}
          {task.description && (
            <p className="text-[11px] text-gray-600">{task.description}</p>
          )}

          {/* Metadata pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {task.priority && task.priority !== 'low' && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${task.priority === 'high' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'}`}>
                {task.priority}
              </span>
            )}
            {task.assignedTo?.name && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-700">
                {task.assignedTo.name}
              </span>
            )}
            {task.dueDate && (
              <span className="text-[9px] text-gray-500">{task.dueDate}</span>
            )}
          </div>

          {/* Follow-up notes history */}
          {task.followUpNotes?.length > 0 && (
            <div className="space-y-1">
              <span className="text-[9px] font-medium text-gray-400 uppercase">Updates</span>
              {task.followUpNotes.slice(-3).map((note, i) => (
                <div key={i} className="text-[10px] text-gray-600 pl-2 border-l border-gray-200">
                  {note.text}
                  {note.date && <span className="text-gray-400 ml-1">({new Date(note.date).toLocaleDateString()})</span>}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          {!disabled && (
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={toggleFollowUp}
                className={`flex items-center gap-1 text-[10px] font-medium transition-colors ${task.followUp === 'next' ? 'text-blue-600' : 'text-gray-400 hover:text-blue-600'}`}
              >
                <RotateCw size={10} />
                {task.followUp === 'next' ? 'Following up' : 'Follow up next'}
              </button>
              <button onClick={toggleStar} className={`text-[10px] flex items-center gap-1 ${task.starred ? 'text-amber-500' : 'text-gray-400 hover:text-amber-500'}`}>
                <Star size={10} className={task.starred ? 'fill-amber-400' : ''} />
                {task.starred ? 'Starred' : 'Star'}
              </button>
            </div>
          )}

          {/* Add progress note */}
          {!disabled && (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addNote(); }}
                placeholder="Add a progress note..."
                className="flex-1 text-[11px] px-2 py-1 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-300 placeholder:text-gray-300"
                onClick={e => e.stopPropagation()}
              />
              <button
                onClick={addNote}
                disabled={!noteText.trim()}
                className="text-[10px] font-medium text-primary-600 hover:text-primary-800 disabled:opacity-30 px-1"
              >
                Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Insert Task Modal ─────────────────────────────────────
function InsertTaskModal({ type, meetingId, instanceId, onInsert, onClose }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
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

    if (type === 'action_item') {
      taskData.priority = 'medium';
    }

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

// ── Main BlockEditor Component ────────────────────────────
export default function BlockEditor({
  blocks = [],
  onChange,
  meetingId,
  instanceId,
  disabled = false,
  finalized = false,
}) {
  const [insertModal, setInsertModal] = useState(null);

  // Collect all task IDs from task_ref blocks
  const taskIds = useMemo(() => {
    return blocks
      .filter(b => b.type === 'task_ref' && b.taskId)
      .map(b => b.taskId);
  }, [blocks]);

  // Live query all referenced tasks
  const tasksData = useLiveQuery(
    () => getTasksByIds(taskIds),
    [taskIds.join(',')]
  ) ?? [];

  // Map for quick lookup
  const taskMap = useMemo(() => {
    const map = {};
    for (const t of tasksData) map[t.id] = t;
    return map;
  }, [tasksData]);

  // ── Block operations ────────────────────────────────────

  function updateBlock(index, updated) {
    const next = [...blocks];
    next[index] = updated;
    onChange(next);
  }

  function handleTaskInsert(taskId) {
    const taskRef = createTaskRefBlock(taskId);
    const next = [...blocks];
    // Insert before the last text block if it's empty (the freeform notes area)
    const lastIdx = next.length - 1;
    if (lastIdx >= 0 && next[lastIdx].type === 'text' && !next[lastIdx].text.trim()) {
      next.splice(lastIdx, 0, taskRef);
    } else {
      next.push(taskRef);
      next.push(createTextBlock(''));
    }
    onChange(next);
  }

  // ── Toolbar items ───────────────────────────────────────

  const toolbarItems = [
    { type: 'action_item', icon: CheckSquare, label: 'Action', color: 'text-primary-600' },
    { type: 'discussion', icon: MessageSquare, label: 'Discuss', color: 'text-indigo-600' },
    { type: 'event', icon: CalendarDays, label: 'Event', color: 'text-green-600' },
    { type: 'calling_plan', icon: Briefcase, label: 'Calling', color: 'text-purple-600' },
    { type: 'ministering_plan', icon: Heart, label: 'Minister', color: 'text-rose-600' },
    { type: 'ongoing', icon: RotateCw, label: 'Ongoing', color: 'text-amber-600' },
  ];

  // Track first text block for the main area placeholder
  let firstTextSeen = false;

  return (
    <div className="relative">
      {/* Document area — paper-like container */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 min-h-[200px]">
        {blocks.map((block, i) => {
          if (block.type === 'text') {
            const isMainArea = !firstTextSeen;
            firstTextSeen = true;
            return (
              <DocTextarea
                key={block.id}
                block={block}
                onChange={b => updateBlock(i, b)}
                disabled={disabled}
                isMainArea={isMainArea}
              />
            );
          }
          if (block.type === 'task_ref') {
            return (
              <div key={block.id} className="my-2">
                <TaskRefBlock
                  block={block}
                  task={taskMap[block.taskId]}
                  disabled={disabled}
                />
              </div>
            );
          }
          return null;
        })}
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
            </div>
          </div>
        </div>
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
    </div>
  );
}
