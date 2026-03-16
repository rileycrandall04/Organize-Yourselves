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
  PhoneForwarded, Sparkles, BookOpen, UserRound,
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
  journal_entry:    { bg: '#f0f9ff', fg: '#0369a1', bd: '#bae6fd' },
  individual:       { bg: '#ecfeff', fg: '#0e7490', bd: '#a5f3fc' },
};

/**
 * Resolve chip colors for a task, supporting multi-type gradient borders.
 * Returns { bg, fg, bd, gradient } — gradient is a CSS border-image string or null.
 */
function getChipStyle(task) {
  const types = task.types && task.types.length > 1 ? task.types : [task.type];
  const primary = CHIP_COLORS[types[0]] || CHIP_COLORS.action_item;

  if (types.length <= 1) {
    return { ...primary, gradient: null };
  }

  // Multi-type: use primary's bg/fg, build a gradient border from all type colors
  const colors = types.map(t => (CHIP_COLORS[t] || CHIP_COLORS.action_item).bd);
  const stops = colors.map((c, i) => {
    const start = (i / colors.length) * 100;
    const end = ((i + 1) / colors.length) * 100;
    return `${c} ${start}%, ${c} ${end}%`;
  }).join(', ');

  return {
    bg: primary.bg,
    fg: primary.fg,
    bd: primary.bd,
    gradient: `linear-gradient(90deg, ${stops})`,
  };
}

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
  journal_entry: BookOpen,
  individual: UserRound,
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

  // Allow single backspace to delete chip (default atom behavior requires two)
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { state, dispatch } = this.editor.view;
        const { selection } = state;
        // If cursor is right after a taskChip node, delete it in one press
        if (selection.empty && selection.$from.nodeBefore?.type.name === 'taskChip') {
          const pos = selection.from - selection.$from.nodeBefore.nodeSize;
          dispatch(state.tr.delete(pos, selection.from));
          return true;
        }
        return false;
      },
    };
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

  const c = getChipStyle(task);
  const sc = STATUS_CHAR[task.status] || '\u25CB';
  const done = task.status === 'complete';

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium cursor-pointer select-none"
      style={{
        background: c.bg,
        color: c.fg,
        border: c.gradient ? '2px solid transparent' : `1px solid ${c.bd}`,
        borderImage: c.gradient ? `${c.gradient} 1` : undefined,
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
  const cachedSelectionRef = useRef(''); // Cache selected text so it survives focus loss
  const saveTimerRef = useRef(null);   // debounce timer
  const lastSavedRef = useRef(initialHtml);
  const isDirtyRef = useRef(false);
  const autoSaveMsRef = useRef(autoSaveMs); // keep ref for onUpdate closure
  autoSaveMsRef.current = autoSaveMs;

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

      // Debounced auto-save: reset timer on each content change.
      // Save fires only after autoSaveMs of inactivity.
      if (!disabled && autoSaveMsRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          // Inline save logic using current editor (performSave may have stale ref)
          if (!isDirtyRef.current) return;
          const latestHtml = editor.getHTML();
          if (latestHtml === lastSavedRef.current) return;
          onSave?.(latestHtml);
          lastSavedRef.current = latestHtml;
          isDirtyRef.current = false;
        }, autoSaveMsRef.current);
      }
    },
    onSelectionUpdate({ editor }) {
      const { from, to } = editor.state.selection;
      const hasSel = from !== to;
      setHasSelection(hasSel);
      // Cache selected text so it survives focus loss (mobile touch, button clicks)
      cachedSelectionRef.current = hasSel ? editor.state.doc.textBetween(from, to, ' ') : '';
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

  // Clean up debounce timer on unmount or when disabled changes
  useEffect(() => {
    if (disabled) clearTimeout(saveTimerRef.current);
    return () => clearTimeout(saveTimerRef.current);
  }, [disabled]);

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
      const c = getChipStyle(task);
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

      const borderStyle = c.gradient
        ? `border:2px solid transparent;border-image:${c.gradient} 1;`
        : `border:1px solid ${c.bd};`;
      chip.style.cssText = `display:inline-flex;align-items:center;gap:3px;padding:2px 8px 2px 6px;border-radius:6px;background:${c.bg};color:${c.fg};${borderStyle}font-size:12px;font-weight:500;cursor:grab;user-select:none;vertical-align:baseline;line-height:1.4;margin:0 2px;${dimmed ? 'opacity:0.5;text-decoration:line-through;' : ''}`;
    });
  }, [editor]);

  // Re-style chips when task data changes
  useEffect(() => {
    styleAllChips();
  }, [editor, tasksData, meetingTaskStatuses, styleAllChips]);

  // Re-style chips after every editor transaction (handles Enter, paste, undo, etc.)
  // Use requestAnimationFrame to defer DOM manipulation until AFTER TipTap finishes
  // processing the transaction — prevents conflicts during rapid key-repeat (e.g. held backspace)
  useEffect(() => {
    if (!editor) return;
    let rafId = null;
    const onTransaction = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => styleAllChips());
    };
    editor.on('transaction', onTransaction);
    return () => {
      editor.off('transaction', onTransaction);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [editor, styleAllChips]);

  // ── Insert task chip on its own line ────────────────────────

  const insertTaskChip = useCallback((taskId, afterLines) => {
    if (!editor) return;

    const { $from } = editor.state.selection;
    const isEmptyBlock = $from.parentOffset === 0 && $from.parent.content.size === 0;

    const chain = editor.chain().focus();

    // If we're not on an empty line, split to a new paragraph first
    if (!isEmptyBlock) {
      chain.splitBlock();
    }

    // Insert the chip
    chain.insertContent({
      type: 'taskChip',
      attrs: { taskId },
    });

    // If there are after lines (e.g. recent updates for individuals), add each as a bullet paragraph
    // Uses plain paragraphs with • prefix to avoid TipTap list-context issues on multi-insert
    if (afterLines && afterLines.length > 0) {
      for (const entry of afterLines) {
        chain.splitBlock().insertContent([
          { type: 'text', marks: [{ type: 'bold' }], text: `• ${entry.dateStr}: ` },
          { type: 'text', text: entry.text },
        ]);
      }
    }

    // Move to a new empty paragraph for continued typing
    chain.splitBlock().run();
  }, [editor]);

  // ── Get selected text (for "Make Task") ────────────────────

  const getSelectedText = useCallback(() => {
    if (!editor) return cachedSelectionRef.current || '';
    const { from, to } = editor.state.selection;
    if (from === to) {
      // Selection may have been cleared by focus loss — return cached text
      return cachedSelectionRef.current || '';
    }
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
