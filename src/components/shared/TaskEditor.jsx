import { useState } from 'react';
import { updateTask, addTaskFollowUpNote, setMeetingTaskStatus } from '../../db';
import { TASK_TYPES, MEETING_TASK_STATUSES, MEETING_TASK_STATUS_LIST } from '../../utils/constants';
import {
  Star, Share2, X, RotateCw, ArrowRightLeft,
  CheckCircle2, Circle, Clock, Pause,
  CheckSquare, MessageSquare, CalendarDays, Briefcase, Heart,
  PhoneForwarded, Sparkles, BookOpen, ChevronDown, ChevronUp, UserRound,
} from 'lucide-react';

/* ── Constants ──────────────────────────────────────────────── */

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

const MEETING_STATUS_ICONS = {
  keep: RotateCw,
  resolved: CheckCircle2,
  snoozed: Clock,
  reassigned: ArrowRightLeft,
};

const MEETING_STATUS_BUTTON_STYLES = {
  keep:       'text-blue-600 bg-blue-50 border-blue-200',
  resolved:   'text-green-600 bg-green-50 border-green-200',
  snoozed:    'text-amber-600 bg-amber-50 border-amber-200',
  reassigned: 'text-purple-600 bg-purple-50 border-purple-200',
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

/* ── Compact Task Row (for lists) ───────────────────────────── */

export function TaskRow({ task, onClick, meetingStatus }) {
  const TypeIcon = TYPE_ICONS[task.type] || CheckSquare;
  const c = CHIP_COLORS[task.type] || CHIP_COLORS.action_item;
  const StatusIcon = STATUS_ICONS[task.status] || Circle;
  const isComplete = task.status === 'complete';
  const isResolved = meetingStatus?.meetingStatus === 'resolved';

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left group ${
        isComplete || isResolved ? 'opacity-50' : ''
      }`}
    >
      <StatusIcon size={14} className={STATUS_COLORS[task.status]} />
      <span
        className="flex-shrink-0 w-4 h-4 rounded flex items-center justify-center"
        style={{ background: c.bg, color: c.fg }}
      >
        <TypeIcon size={10} />
      </span>
      <span className={`flex-1 text-xs text-gray-800 truncate ${isComplete ? 'line-through' : ''}`}>
        {task.title}
      </span>
      {task.starred && (
        <Star size={10} className="text-amber-400 fill-amber-400 flex-shrink-0" />
      )}
      {meetingStatus?.meetingStatus && meetingStatus.meetingStatus !== 'keep' && (
        <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${
          MEETING_STATUS_BUTTON_STYLES[meetingStatus.meetingStatus] || ''
        }`}>
          {MEETING_TASK_STATUSES[meetingStatus.meetingStatus]?.label}
        </span>
      )}
    </button>
  );
}

/* ── Full Task Editor (bottom sheet) ────────────────────────── */

export default function TaskEditor({
  task,
  onClose,
  disabled = false,
  meetingId,
  meetingStatus,
  onTagTask,
  onConvertToText,
  meetings,
}) {
  const [noteText, setNoteText] = useState('');
  const [journalTextExpanded, setJournalTextExpanded] = useState(false);

  if (!task) return null;

  const StatusIcon = STATUS_ICONS[task.status] || Circle;
  const TypeIcon = TYPE_ICONS[task.type] || CheckSquare;
  const typeLabel = TASK_TYPES[task.type]?.label || 'Task';
  const isComplete = task.status === 'complete';

  // Multi-type badges
  const types = task.types || [task.type];

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

  async function handleMeetingStatus(status) {
    if (!meetingId) return;
    await setMeetingTaskStatus(task.id, meetingId, status);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-4 pb-6 max-h-[60vh] overflow-y-auto animate-in fade-in duration-200 mx-4"
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
              {/* Multi-type badges */}
              <div className="flex items-center gap-1 mt-0.5">
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
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        {/* Next Ordinance (individual type) */}
        {task.type === 'individual' && task.nextOrdinance && (
          <div className="mb-3 px-3 py-2 bg-cyan-50/50 border border-cyan-200 rounded-lg flex items-center gap-2">
            <span className="text-[10px] font-semibold text-cyan-500 uppercase">Next Ordinance</span>
            <span className="text-xs font-medium text-cyan-800">{task.nextOrdinance}</span>
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
        {!disabled && meetingId && task.type !== 'spiritual_thought' && task.type !== 'journal_entry' && (
          <div className="mb-3 pb-3 border-b border-gray-100">
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Meeting Status</h4>
            <div className="flex items-center gap-1.5">
              {MEETING_TASK_STATUS_LIST.map(ms => {
                const MsIcon = MEETING_STATUS_ICONS[ms.key];
                const isActive = meetingStatus?.meetingStatus === ms.key;
                const colorClass = MEETING_STATUS_BUTTON_STYLES[ms.key];
                return (
                  <button
                    key={ms.key}
                    onClick={() => handleMeetingStatus(ms.key)}
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

        {/* Journal entry text (expand/collapse) */}
        {task.type === 'journal_entry' && task.journalText && (
          <div className="mb-3">
            <button
              onClick={() => setJournalTextExpanded(!journalTextExpanded)}
              className="flex items-center gap-1.5 text-xs font-medium text-sky-600 hover:text-sky-800 mb-1"
            >
              <BookOpen size={12} />
              {journalTextExpanded ? 'Collapse' : 'Expand'} journal text
              {journalTextExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {journalTextExpanded && (
              <div className="text-xs text-gray-700 bg-sky-50/50 border border-sky-100 rounded-lg px-3 py-2 whitespace-pre-wrap leading-relaxed">
                {task.journalText}
              </div>
            )}
          </div>
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

        {/* Phone numbers (follow-up tasks) */}
        {(task.phoneNumbers?.length > 0 || task.phoneNumber) && (
          <div className="mb-3">
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Phone Numbers</h4>
            <div className="space-y-1">
              {(task.phoneNumbers || [task.phoneNumber]).filter(Boolean).map((phone, i) => (
                <a
                  key={i}
                  href={`tel:${phone.replace(/[^\d+]/g, '')}`}
                  className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-800"
                >
                  <PhoneForwarded size={12} />
                  {phone}
                </a>
              ))}
            </div>
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
                const isCurrent = mid === meetingId;
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
            className="flex items-center gap-1.5 text-xs text-sky-500 hover:text-sky-700 font-medium"
          >
            <BookOpen size={12} /> Convert to inline text
          </button>
        )}
      </div>
    </div>
  );
}
