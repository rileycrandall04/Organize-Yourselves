import { useEffect, useRef, useCallback, useState } from 'react';
import { useEditor, EditorContent, Node, mergeAttributes } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { useLiveQuery } from 'dexie-react-hooks';
import { getTasksByIds } from '../../db';
import { TASK_TYPES } from '../../utils/constants';
import {
  Bold, Italic, Underline as UnderlineIcon, List, Undo2, Redo2,
  CheckSquare, MessageSquare, CalendarDays, Briefcase, Heart, RotateCw,
  PhoneForwarded, Sparkles,
} from 'lucide-react';

/* ── Constants ─────────────────────────────────────────────── */

const CHIP_COLORS = {
  action_item:      { bg: '#eff6ff', fg: '#1d4ed8', bd: '#bfdbfe' },
  discussion:       { bg: '#eef2ff', fg: '#4338ca', bd: '#c7d2fe' },
  event:            { bg: '#f0fdf4', fg: '#15803d', bd: '#bbf7d0' },
  calling_plan:     { bg: '#faf5ff', fg: '#7e22ce', bd: '#e9d5ff' },
  ministering_plan: { bg: '#fff1f2', fg: '#be123c', bd: '#fecdd3' },
  ongoing:          { bg: '#fffbeb', fg: '#b45309', bd: '#fde68a' },
  follow_up:        { bg: '#f0fdfa', fg: '#0f766e', bd: '#99f6e4' },
  spiritual_thought:{ bg: '#f5f3ff', fg: '#6d28d9', bd: '#ddd6fe' },
};

const STATUS_CHAR = {
  not_started: '\u25CB',   // ○
  in_progress: '\u25D0',   // ◐
  waiting: '\u23F8',       // ⏸
  complete: '\u2713',      // ✓
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
};

// Meeting-level status indicators (overlaid on chips)
const MEETING_STATUS_INDICATOR = {
  resolved:   { char: '\u2713', color: '#15803d', bg: '#dcfce7' },  // ✓ green
  snoozed:    { char: '\u23F8', color: '#b45309', bg: '#fef3c7' },  // ⏸ amber
  reassigned: { char: '\u2192', color: '#7e22ce', bg: '#f3e8ff' },  // → purple
};

/* ── TipTap Custom Node: TaskChip ─────────────────────────── */

const TaskChipNode = Node.create({
  name: 'taskChip',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      taskId: {
        default: null,
        parseHTML: element => {
          const val = element.getAttribute('data-task-id');
          return val != null ? Number(val) : null;
        },
        renderHTML: attributes => {
          if (attributes.taskId == null) return {};
          return { 'data-task-id': attributes.taskId };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'task-chip[data-task-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['task-chip', mergeAttributes(HTMLAttributes, {
      contenteditable: 'false',
    })];
  },
});

/* ── TaskChip React Component (rendered inside editor) ───── */

function TaskChipView({ taskId, taskMap, onClick }) {
  const task = taskMap[taskId];
  if (!task) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 text-gray-400 text-xs cursor-pointer select-none"
        onClick={() => onClick?.(taskId)}
      >
        Task #{taskId}
      </span>
    );
  }

  const c = CHIP_COLORS[task.type] || CHIP_COLORS.action_item;
  const sc = STATUS_CHAR[task.status] || '\u25CB';
  const done = task.status === 'complete';

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium cursor-pointer select-none"
      style={{
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.bd}`,
        opacity: done ? 0.5 : 1,
        textDecoration: done ? 'line-through' : 'none',
        verticalAlign: 'baseline',
        lineHeight: 1.4,
        margin: '0 2px',
      }}
      onClick={() => onClick?.(taskId)}
    >
      {sc}&nbsp;{task.title}
    </span>
  );
}

/* ── Content conversion helpers ────────────────────────────── */

const MARKER_RE = /\{\{task:(\d+)\}\}/g;

/** Convert old plain-text content with {{task:ID}} markers to TipTap HTML */
export function migrateTextToHtml(text) {
  if (!text) return '<p></p>';

  // Split by task markers — odd indices are task IDs
  const parts = text.split(MARKER_RE);
  let html = '';

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // Plain text — convert newlines to paragraph breaks
      const lines = parts[i].split('\n');
      for (let j = 0; j < lines.length; j++) {
        const line = lines[j];
        // Check for bullet points
        if (line.match(/^\s*[\u2022\-\*]\s/)) {
          const bulletText = line.replace(/^\s*[\u2022\-\*]\s*/, '');
          html += `<li><p>${escHtml(bulletText)}</p></li>`;
        } else if (j > 0 || html) {
          // Add line breaks between paragraphs (but not before first content)
          if (line.trim()) {
            html += escHtml(line);
          }
          if (j < lines.length - 1) {
            html += '<br>';
          }
        } else {
          html += escHtml(line);
        }
      }
    } else {
      // Task ID — insert task chip element
      html += `<task-chip data-task-id="${parts[i]}"></task-chip>`;
    }
  }

  // Wrap in paragraph if not already
  if (!html.startsWith('<p>') && !html.startsWith('<ul>') && !html.startsWith('<li>')) {
    html = `<p>${html}</p>`;
  }

  return html || '<p></p>';
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Extract task IDs from HTML content */
export function extractTaskIdsFromHtml(html) {
  const ids = new Set();
  const re = /data-task-id="(\d+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) ids.add(Number(m[1]));
  return [...ids];
}

/** Convert TipTap HTML back to plain text with {{task:ID}} markers (for AI, search) */
export function htmlToPlainText(html) {
  if (!html) return '';
  return html
    .replace(/<task-chip[^>]*data-task-id="(\d+)"[^>]*><\/task-chip>/g, '{{task:$1}}')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/p>\s*<p>/g, '\n')
    .replace(/<\/li>\s*<li>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/* ── Formatting Toolbar ────────────────────────────────────── */

function FormattingToolbar({ editor, disabled, onMakeTask, hasSelection }) {
  if (!editor || disabled) return null;

  // Prevent mousedown from stealing focus/selection from the editor
  const preventFocusLoss = (e) => e.preventDefault();

  const buttons = [
    {
      icon: Undo2,
      label: 'Undo',
      action: () => editor.chain().focus().undo().run(),
      active: false,
      disabled: !editor.can().undo(),
    },
    {
      icon: Redo2,
      label: 'Redo',
      action: () => editor.chain().focus().redo().run(),
      active: false,
      disabled: !editor.can().redo(),
    },
    { divider: true },
    {
      icon: Bold,
      label: 'Bold',
      action: () => editor.chain().focus().toggleBold().run(),
      active: editor.isActive('bold'),
    },
    {
      icon: Italic,
      label: 'Italic',
      action: () => editor.chain().focus().toggleItalic().run(),
      active: editor.isActive('italic'),
    },
    {
      icon: UnderlineIcon,
      label: 'Underline',
      action: () => editor.chain().focus().toggleUnderline().run(),
      active: editor.isActive('underline'),
    },
    {
      icon: List,
      label: 'Bullets',
      action: () => editor.chain().focus().toggleBulletList().run(),
      active: editor.isActive('bulletList'),
    },
  ];

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 border-b border-gray-100 bg-gray-50/50 rounded-t-xl">
      {buttons.map((btn, i) => {
        if (btn.divider) return <div key={`div-${i}`} className="w-px h-5 bg-gray-200 mx-0.5" />;
        const Icon = btn.icon;
        return (
          <button
            key={btn.label}
            onMouseDown={preventFocusLoss}
            onClick={btn.action}
            title={btn.label}
            disabled={btn.disabled}
            className={`p-1.5 rounded-md transition-colors ${
              btn.disabled
                ? 'text-gray-200 cursor-not-allowed'
                : btn.active
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Icon size={16} />
          </button>
        );
      })}
      {/* Divider + Make Task button */}
      <div className="w-px h-5 bg-gray-200 mx-0.5" />
      <button
        onMouseDown={preventFocusLoss}
        onClick={onMakeTask}
        title={hasSelection ? 'Make Task from selection' : 'Make Task'}
        className={`flex items-center gap-1 p-1.5 rounded-md transition-colors ${
          hasSelection
            ? 'text-primary-600 bg-primary-50 hover:bg-primary-100'
            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
        }`}
      >
        <CheckSquare size={16} />
        {hasSelection && (
          <span className="text-[10px] font-medium hidden sm:inline">Task</span>
        )}
      </button>
    </div>
  );
}

/* ── Main RichTextEditor Component ─────────────────────────── */

export default function RichTextEditor({
  initialHtml = '<p></p>',
  onContentChange,
  onSave,
  onClickTask,
  onMakeTask,
  disabled = false,
  taskIds = [],
  autoSaveMs = 60000,
  meetingTaskStatuses = {},  // { taskId: { meetingStatus, snoozedUntil, ... } }
}) {
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved'
  const [hasSelection, setHasSelection] = useState(false);
  const saveTimerRef = useRef(null);
  const lastSavedRef = useRef(initialHtml);
  const isDirtyRef = useRef(false);

  // Live-query all referenced tasks for chip rendering
  const tasksData = useLiveQuery(
    () => taskIds.length > 0 ? getTasksByIds(taskIds) : [],
    [taskIds.join(',')]
  ) ?? [];

  const taskMap = {};
  for (const t of tasksData) taskMap[t.id] = t;

  // Initialize TipTap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable code block and horizontal rule (not needed for meeting notes)
        codeBlock: false,
        horizontalRule: false,
      }),
      Underline,
      Placeholder.configure({
        placeholder: 'Type your agenda and notes here...',
      }),
      TaskChipNode,
    ],
    content: initialHtml,
    editable: !disabled,
    onUpdate({ editor }) {
      const html = editor.getHTML();
      isDirtyRef.current = true;
      onContentChange?.(html);
    },
    onSelectionUpdate({ editor }) {
      const { from, to } = editor.state.selection;
      setHasSelection(from !== to);
    },
  });

  // Update editable state when disabled changes
  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [disabled, editor]);

  // ── Auto-save logic ──────────────────────────────────────

  const performSave = useCallback(async () => {
    if (!isDirtyRef.current || !editor) return;
    const html = editor.getHTML();
    if (html === lastSavedRef.current) return;

    setSaveStatus('saving');
    try {
      await onSave?.(html);
      lastSavedRef.current = html;
      isDirtyRef.current = false;
      setSaveStatus('saved');
      // Clear "saved" indicator after 3 seconds
      setTimeout(() => setSaveStatus(null), 3000);
    } catch {
      setSaveStatus(null);
    }
  }, [editor, onSave]);

  // Auto-save timer (every autoSaveMs)
  useEffect(() => {
    if (disabled || !autoSaveMs) return;

    const timer = setInterval(() => {
      performSave();
    }, autoSaveMs);

    saveTimerRef.current = timer;
    return () => clearInterval(timer);
  }, [disabled, autoSaveMs, performSave]);

  // Save on unmount (navigate away)
  useEffect(() => {
    return () => {
      if (isDirtyRef.current && editor) {
        const html = editor.getHTML();
        if (html !== lastSavedRef.current) {
          onSave?.(html);
        }
      }
    };
  }, [editor, onSave]);

  // Save on visibility change (user switches apps / locks phone)
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        performSave();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [performSave]);

  // Save on beforeunload (user closes browser tab)
  useEffect(() => {
    function handleBeforeUnload() {
      if (isDirtyRef.current && editor) {
        const html = editor.getHTML();
        if (html !== lastSavedRef.current) {
          // Synchronous save attempt — best effort
          onSave?.(html);
        }
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [editor, onSave]);

  // ── Task chip click handling ──────────────────────────────

  useEffect(() => {
    if (!editor) return;

    const handleClick = (e) => {
      const chip = e.target.closest('task-chip');
      if (chip) {
        e.preventDefault();
        e.stopPropagation();
        const raw = chip.getAttribute('data-task-id');
        if (raw == null) return;
        const taskId = Number(raw);
        if (!isNaN(taskId)) onClickTask?.(taskId);
      }
    };

    const editorEl = editor.view.dom;
    editorEl.addEventListener('click', handleClick);
    return () => editorEl.removeEventListener('click', handleClick);
  }, [editor, onClickTask]);

  // ── Task chip rendering (update chips when task data changes OR DOM changes) ──

  // Keep latest data in refs so the transaction handler always sees current values
  const taskMapRef = useRef(taskMap);
  taskMapRef.current = taskMap;
  const meetingStatusRef = useRef(meetingTaskStatuses);
  meetingStatusRef.current = meetingTaskStatuses;

  const styleAllChips = useCallback(() => {
    if (!editor) return;
    const editorEl = editor.view.dom;
    const chips = editorEl.querySelectorAll('task-chip');
    const currentTaskMap = taskMapRef.current;
    const currentStatuses = meetingStatusRef.current;

    chips.forEach(chip => {
      const raw = chip.getAttribute('data-task-id');
      if (raw == null) return;
      const id = Number(raw);
      if (isNaN(id)) return;
      const task = currentTaskMap[id];
      if (!task) {
        chip.textContent = `Task #${id}`;
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:6px;background:#f3f4f6;color:#9ca3af;font-size:12px;cursor:grab;user-select:none;vertical-align:baseline;line-height:1.4;margin:0 2px;';
        return;
      }
      const c = CHIP_COLORS[task.type] || CHIP_COLORS.action_item;
      const sc = STATUS_CHAR[task.status] || '\u25CB';
      const done = task.status === 'complete';

      // Check for per-meeting status
      const mStatus = currentStatuses[id];
      const mIndicator = mStatus ? MEETING_STATUS_INDICATOR[mStatus.meetingStatus] : null;
      const dimmed = done || mStatus?.meetingStatus === 'resolved';

      // Build chip content: status char + title + optional meeting status badge
      chip.innerHTML = '';
      chip.textContent = `${sc}\u00a0${task.title}`;

      // If there's a meeting-level status, append a small badge
      if (mIndicator) {
        const badge = document.createElement('span');
        badge.textContent = ` ${mIndicator.char}`;
        badge.style.cssText = `
          display:inline-flex;align-items:center;justify-content:center;
          font-size:10px;margin-left:3px;padding:0 3px;
          border-radius:3px;background:${mIndicator.bg};color:${mIndicator.color};
          font-weight:700;line-height:1.2;
        `;
        chip.appendChild(badge);
      }

      chip.style.cssText = `display:inline-flex;align-items:center;gap:3px;padding:2px 8px 2px 6px;border-radius:6px;background:${c.bg};color:${c.fg};border:1px solid ${c.bd};font-size:12px;font-weight:500;cursor:grab;user-select:none;vertical-align:baseline;line-height:1.4;margin:0 2px;${dimmed ? 'opacity:0.5;text-decoration:line-through;' : ''}`;
    });
  }, [editor]);

  // Re-style chips when task data changes
  useEffect(() => {
    styleAllChips();
  }, [editor, tasksData, meetingTaskStatuses, styleAllChips]);

  // Re-style chips after every editor transaction (handles Enter, paste, undo, etc.)
  useEffect(() => {
    if (!editor) return;
    const onTransaction = () => styleAllChips();
    editor.on('transaction', onTransaction);
    return () => editor.off('transaction', onTransaction);
  }, [editor, styleAllChips]);

  // ── Insert task chip at current position ───────────────────

  const insertTaskChip = useCallback((taskId) => {
    if (!editor) return;
    editor.chain()
      .focus()
      .insertContent({
        type: 'taskChip',
        attrs: { taskId },
      })
      .insertContent(' ')
      .run();
  }, [editor]);

  // ── Get selected text (for "Make Task") ────────────────────

  const getSelectedText = useCallback(() => {
    if (!editor) return '';
    const { from, to } = editor.state.selection;
    if (from === to) return '';
    return editor.state.doc.textBetween(from, to, ' ');
  }, [editor]);

  // ── Replace selected text with task chip ───────────────────

  const replaceSelectionWithChip = useCallback((taskId) => {
    if (!editor) return;
    editor.chain()
      .focus()
      .deleteSelection()
      .insertContent({
        type: 'taskChip',
        attrs: { taskId },
      })
      .insertContent(' ')
      .run();
  }, [editor]);

  return {
    editor,
    saveStatus,
    taskMap,
    hasSelection,
    insertTaskChip,
    getSelectedText,
    replaceSelectionWithChip,
    formattingToolbar: (
      <FormattingToolbar
        editor={editor}
        disabled={disabled}
        onMakeTask={onMakeTask}
        hasSelection={hasSelection}
      />
    ),
    editorView: (
      <EditorContent
        editor={editor}
        className="rich-text-editor min-h-[200px] text-sm text-gray-800 leading-relaxed focus:outline-none px-4 py-3"
      />
    ),
  };
}
