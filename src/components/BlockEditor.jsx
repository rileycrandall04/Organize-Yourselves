import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getTasksByIds, addTask, updateTask, deleteTask, addTaskFollowUpNote } from '../db';
import { TASK_TYPES } from '../utils/constants';
import {
  Plus, Trash2, GripVertical, ChevronDown, ChevronUp,
  CheckCircle2, Circle, Clock, Pause, Star,
  CheckSquare, MessageSquare, CalendarDays, GitBranch, Heart, RotateCw,
  Type, AlignLeft, Minus,
} from 'lucide-react';

// ── Unique ID generator ────────────────────────────────────
let _blockCounter = 0;
function newBlockId() {
  return `b_${Date.now()}_${++_blockCounter}`;
}

// ── Block factory helpers ──────────────────────────────────
export function createHeadingBlock(text = '') {
  return { id: newBlockId(), type: 'heading', text };
}
export function createTextBlock(text = '') {
  return { id: newBlockId(), type: 'text', text };
}
export function createTaskRefBlock(taskId) {
  return { id: newBlockId(), type: 'task_ref', taskId };
}
export function createDividerBlock() {
  return { id: newBlockId(), type: 'divider' };
}

// ── Migrate old agendaItems → blocks ───────────────────────
export function migrateAgendaToBlocks(agendaItems, notes) {
  const blocks = [];
  for (const item of (agendaItems || [])) {
    blocks.push(createHeadingBlock(item.label || ''));
    if (item.notes?.trim()) {
      blocks.push(createTextBlock(item.notes));
    }
  }
  if (notes?.trim()) {
    blocks.push(createHeadingBlock('General Notes'));
    blocks.push(createTextBlock(notes));
  }
  if (blocks.length === 0) {
    blocks.push(createTextBlock(''));
  }
  return blocks;
}

// ── Status icons ───────────────────────────────────────────
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

// ── Task type icons ────────────────────────────────────────
const TYPE_ICONS = {
  action_item: CheckSquare,
  discussion: MessageSquare,
  event: CalendarDays,
  calling_plan: GitBranch,
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

// ── Auto-growing textarea ──────────────────────────────────
function AutoTextarea({ value, onChange, placeholder, className = '', disabled, onKeyDown }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      rows={1}
      className={`w-full resize-none overflow-hidden bg-transparent focus:outline-none ${className}`}
      style={{ minHeight: '1.5rem' }}
    />
  );
}

// ── Heading Block ──────────────────────────────────────────
function HeadingBlock({ block, onChange, disabled }) {
  return (
    <AutoTextarea
      value={block.text}
      onChange={e => onChange({ ...block, text: e.target.value })}
      placeholder="Section heading..."
      disabled={disabled}
      className="text-sm font-semibold text-gray-900 placeholder:text-gray-300 py-1"
    />
  );
}

// ── Text Block ─────────────────────────────────────────────
function TextBlock({ block, onChange, disabled }) {
  return (
    <AutoTextarea
      value={block.text}
      onChange={e => onChange({ ...block, text: e.target.value })}
      placeholder="Type notes here..."
      disabled={disabled}
      className="text-xs text-gray-700 placeholder:text-gray-300 py-0.5 leading-relaxed"
    />
  );
}

// ── Task Ref Block (inline task card) ──────────────────────
function TaskRefBlock({ block, task, disabled, meetingId }) {
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

// ── Insert Task Modal ──────────────────────────────────────
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

    // Type-specific defaults
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

// ── Main BlockEditor Component ─────────────────────────────
export default function BlockEditor({
  blocks = [],
  onChange,
  meetingId,
  instanceId,
  disabled = false,
}) {
  const [insertModal, setInsertModal] = useState(null); // task type string or null
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

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

  // ── Block operations ──────────────────────────────────────

  function updateBlock(index, updated) {
    const next = [...blocks];
    next[index] = updated;
    onChange(next);
  }

  function removeBlock(index) {
    const next = blocks.filter((_, i) => i !== index);
    if (next.length === 0) {
      next.push(createTextBlock(''));
    }
    onChange(next);
  }

  function insertBlockAfter(index, block) {
    const next = [...blocks];
    next.splice(index + 1, 0, block);
    onChange(next);
  }

  function insertBlockAtEnd(block) {
    onChange([...blocks, block]);
  }

  function handleTaskInsert(taskId) {
    const block = createTaskRefBlock(taskId);
    insertBlockAtEnd(block);
  }

  // ── Drag and drop ─────────────────────────────────────────

  function handleDragStart(e, index) {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    setDragOverIndex(index);
  }

  function handleDrop(e, dropIndex) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const next = [...blocks];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(dropIndex, 0, moved);
    onChange(next);
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
  }

  // ── Key handling (Enter to create new block, backspace to merge) ──

  function handleKeyDown(e, index) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const newBlock = createTextBlock('');
      insertBlockAfter(index, newBlock);
      // Focus new block on next tick
      setTimeout(() => {
        const el = document.querySelector(`[data-block-index="${index + 1}"] textarea`);
        el?.focus();
      }, 50);
    }
  }

  // ── Render blocks ─────────────────────────────────────────

  function renderBlock(block, index) {
    const isDragging = dragIndex === index;
    const isDragOver = dragOverIndex === index;

    return (
      <div
        key={block.id}
        data-block-index={index}
        className={`group relative flex items-start gap-1 ${isDragOver ? 'ring-2 ring-primary-300 rounded-lg' : ''} ${isDragging ? 'opacity-40' : ''}`}
        draggable={!disabled}
        onDragStart={e => handleDragStart(e, index)}
        onDragOver={e => handleDragOver(e, index)}
        onDrop={e => handleDrop(e, index)}
        onDragEnd={handleDragEnd}
      >
        {/* Drag handle + delete */}
        {!disabled && (
          <div className="flex flex-col items-center pt-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 w-5">
            <GripVertical size={12} className="text-gray-300 cursor-grab" />
            <button
              onClick={() => removeBlock(index)}
              className="mt-0.5 text-gray-200 hover:text-red-400 transition-colors"
              title="Remove block"
            >
              <Trash2 size={10} />
            </button>
          </div>
        )}

        {/* Block content */}
        <div className="flex-1 min-w-0">
          {block.type === 'heading' && (
            <HeadingBlock
              block={block}
              onChange={b => updateBlock(index, b)}
              disabled={disabled}
            />
          )}
          {block.type === 'text' && (
            <TextBlock
              block={block}
              onChange={b => updateBlock(index, b)}
              disabled={disabled}
            />
          )}
          {block.type === 'task_ref' && (
            <TaskRefBlock
              block={block}
              task={taskMap[block.taskId]}
              disabled={disabled}
              meetingId={meetingId}
            />
          )}
          {block.type === 'divider' && (
            <hr className="border-gray-200 my-2" />
          )}
        </div>
      </div>
    );
  }

  // ── Toolbar items ─────────────────────────────────────────

  const toolbarItems = [
    { type: 'action_item', icon: CheckSquare, label: 'Action', color: 'text-primary-600' },
    { type: 'discussion', icon: MessageSquare, label: 'Discuss', color: 'text-indigo-600' },
    { type: 'event', icon: CalendarDays, label: 'Event', color: 'text-green-600' },
    { type: 'calling_plan', icon: GitBranch, label: 'Calling', color: 'text-purple-600' },
    { type: 'ministering_plan', icon: Heart, label: 'Minister', color: 'text-rose-600' },
    { type: 'ongoing', icon: RotateCw, label: 'Ongoing', color: 'text-amber-600' },
  ];

  const insertItems = [
    { action: () => insertBlockAtEnd(createHeadingBlock('')), icon: Type, label: 'Heading' },
    { action: () => insertBlockAtEnd(createTextBlock('')), icon: AlignLeft, label: 'Text' },
    { action: () => insertBlockAtEnd(createDividerBlock()), icon: Minus, label: 'Divider' },
  ];

  return (
    <div className="relative">
      {/* Block list */}
      <div className="space-y-1 mb-4">
        {blocks.map((block, i) => renderBlock(block, i))}
      </div>

      {/* Bottom toolbar */}
      {!disabled && (
        <div className="sticky bottom-16 z-20">
          <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-2">
            {/* Task insert buttons */}
            <div className="flex items-center justify-between gap-1 mb-1.5">
              {toolbarItems.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.type}
                    onClick={() => setInsertModal(item.type)}
                    className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors flex-1`}
                  >
                    <Icon size={16} className={item.color} />
                    <span className="text-[9px] text-gray-500 font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
            {/* Block insert buttons */}
            <div className="flex items-center gap-1 border-t border-gray-100 pt-1.5">
              {insertItems.map((item, i) => {
                const Icon = item.icon;
                return (
                  <button
                    key={i}
                    onClick={item.action}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Icon size={12} />
                    {item.label}
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
