import { useState, useMemo, useEffect } from 'react';
import { useFollowUpsForMeeting, useTasksForMeeting, useMeetingNoteTags, useMeetingTaskStatuses, useMeetings } from '../hooks/useDb';
import { setMeetingTaskStatus, getTasks, updateTask } from '../db';
import { TASK_TYPES, MEETING_TASK_STATUSES, MEETING_TASK_STATUS_LIST } from '../utils/constants';
import {
  ArrowLeft, ChevronDown, ChevronRight, Play, SkipForward, Plus, Search, Import, X,
  CheckCircle2, RotateCw, Clock, ArrowRightLeft, FileText,
  CheckSquare, MessageSquare, CalendarDays, Briefcase, Heart,
  ArrowUpRight,
} from 'lucide-react';

/* ── Constants ──────────────────────────────────────────────── */

const TYPE_ICONS = {
  action_item: CheckSquare,
  discussion: MessageSquare,
  event: CalendarDays,
  calling_plan: Briefcase,
  ministering_plan: Heart,
  ongoing: RotateCw,
};

const CHIP_COLORS = {
  action_item:      { bg: '#eff6ff', fg: '#1d4ed8', bd: '#bfdbfe' },
  discussion:       { bg: '#eef2ff', fg: '#4338ca', bd: '#c7d2fe' },
  event:            { bg: '#f0fdf4', fg: '#15803d', bd: '#bbf7d0' },
  calling_plan:     { bg: '#faf5ff', fg: '#7e22ce', bd: '#e9d5ff' },
  ministering_plan: { bg: '#fff1f2', fg: '#be123c', bd: '#fecdd3' },
  ongoing:          { bg: '#fffbeb', fg: '#b45309', bd: '#fde68a' },
};

const STATUS_CHAR = {
  not_started: '\u25CB',
  in_progress: '\u25D0',
  waiting: '\u23F8',
  complete: '\u2713',
};

const STATUS_ICONS = {
  keep: RotateCw,
  resolved: CheckCircle2,
  snoozed: Clock,
  reassigned: ArrowRightLeft,
};

const STATUS_BUTTON_STYLES = {
  keep:       { active: 'text-blue-600 bg-blue-50 border-blue-200', label: 'Keep' },
  resolved:   { active: 'text-green-600 bg-green-50 border-green-200', label: 'Resolved' },
  snoozed:    { active: 'text-amber-600 bg-amber-50 border-amber-200', label: 'Snooze' },
  reassigned: { active: 'text-purple-600 bg-purple-50 border-purple-200', label: 'Reassign' },
};

/* ── Section Component ──────────────────────────────────────── */

function ReviewSection({ title, icon: Icon, count, color, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  if (count === 0) return null;

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
      >
        <Icon size={14} className={color} />
        <span className="text-xs font-semibold text-gray-700 flex-1 text-left">{title}</span>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${color} bg-opacity-10`}
          style={{ backgroundColor: 'currentColor', color: 'white' }}
        >
          {count}
        </span>
        {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 pl-1">
          {children}
        </div>
      )}
    </div>
  );
}

/* ── Task Row with Status Buttons ───────────────────────────── */

const SNOOZE_OPTIONS = [
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
];

function TaskReviewRow({ task, meetingId, meetingStatus, onStatusChange }) {
  const [showSnoozePicker, setShowSnoozePicker] = useState(false);
  const TypeIcon = TYPE_ICONS[task.type] || CheckSquare;
  const c = CHIP_COLORS[task.type] || CHIP_COLORS.action_item;
  const typeLabel = TASK_TYPES[task.type]?.label || 'Task';
  const currentStatus = meetingStatus?.meetingStatus || null;

  function handleStatusClick(statusKey) {
    if (statusKey === 'snoozed') {
      setShowSnoozePicker(!showSnoozePicker);
    } else {
      setShowSnoozePicker(false);
      onStatusChange(task.id, statusKey);
    }
  }

  function handleSnooze(days) {
    const until = new Date();
    until.setDate(until.getDate() + days);
    onStatusChange(task.id, 'snoozed', { snoozedUntil: until.toISOString() });
    setShowSnoozePicker(false);
  }

  return (
    <div className="bg-white rounded-lg border border-gray-100 p-2.5">
      {/* Task info row */}
      <div className="flex items-start gap-2 mb-2">
        <span
          className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5"
          style={{ background: c.bg, color: c.fg }}
        >
          <TypeIcon size={11} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-800 leading-tight">{task.title}</p>
          <span className="text-[10px] text-gray-400">{typeLabel}</span>
          {task.description && (
            <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{task.description}</p>
          )}
        </div>
      </div>

      {/* Status buttons */}
      <div className="flex items-center gap-1">
        {MEETING_TASK_STATUS_LIST.map(ms => {
          const MsIcon = STATUS_ICONS[ms.key];
          const styles = STATUS_BUTTON_STYLES[ms.key];
          const isActive = currentStatus === ms.key;
          return (
            <button
              key={ms.key}
              onClick={() => handleStatusClick(ms.key)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border transition-all flex-1 justify-center ${
                isActive
                  ? `${styles.active} ring-1 ring-offset-1 shadow-sm`
                  : 'text-gray-400 bg-gray-50 border-gray-200 hover:bg-gray-100'
              }`}
            >
              <MsIcon size={10} />
              <span className="hidden sm:inline">{styles.label}</span>
            </button>
          );
        })}
      </div>

      {/* Snooze duration picker */}
      {showSnoozePicker && (
        <div className="mt-1.5 flex items-center gap-1 pl-1">
          <span className="text-[10px] text-gray-400 mr-1">Snooze for:</span>
          {SNOOZE_OPTIONS.map(opt => (
            <button
              key={opt.days}
              onClick={() => handleSnooze(opt.days)}
              className="px-2 py-0.5 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Tagged Note Row ────────────────────────────────────────── */

function TaggedNoteRow({ tag }) {
  const text = tag.text || '';
  const preview = text.length > 120 ? text.substring(0, 120) + '...' : text;

  return (
    <div className="bg-white rounded-lg border border-gray-100 p-2.5">
      <div className="flex items-start gap-2">
        <ArrowUpRight size={12} className="text-indigo-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-600 leading-relaxed">{preview}</p>
      </div>
    </div>
  );
}

/* ── Import Task Picker ────────────────────────────────────── */

function ImportTaskPicker({ meetingId, onClose }) {
  const [search, setSearch] = useState('');
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { meetings } = useMeetings();

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

  // Filter: exclude tasks already on this meeting
  const available = useMemo(() => {
    return allTasks.filter(t => {
      if ((t.meetingIds || []).includes(meetingId)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!t.title.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allTasks, meetingId, search]);

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
    const updatedMeetingIds = [...new Set([...(task.meetingIds || []), meetingId])];
    await updateTask(task.id, { meetingIds: updatedMeetingIds });
    // Don't close — let user add multiple tasks
    setAllTasks(prev => prev.filter(t => t.id !== task.id));
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

/* ── Main PreMeetingReview Component ────────────────────────── */

export default function PreMeetingReview({ meetingId, meetingName, onStartMeeting, onSkip, onBack }) {
  const { followUps: followUpTasks } = useFollowUpsForMeeting(meetingId);
  const { tasks: meetingTasks } = useTasksForMeeting(meetingId);
  const { tags: pendingTags } = useMeetingNoteTags(meetingId);
  const { statuses: meetingStatusList } = useMeetingTaskStatuses(meetingId);
  const [importPickerOpen, setImportPickerOpen] = useState(false);

  // Build status map { taskId: statusRecord }
  const statusMap = useMemo(() => {
    const map = {};
    for (const s of meetingStatusList) map[s.taskId] = s;
    return map;
  }, [meetingStatusList]);

  // Categorize tasks
  const followUps = followUpTasks || [];
  const actionItems = (meetingTasks || []).filter(t => t.type === 'action_item' && !followUps.some(f => f.id === t.id));
  const discussions = (meetingTasks || []).filter(t => t.type === 'discussion' && !followUps.some(f => f.id === t.id));
  const ongoingItems = (meetingTasks || []).filter(t => t.type === 'ongoing' && !followUps.some(f => f.id === t.id));
  const otherTasks = (meetingTasks || []).filter(t =>
    !['action_item', 'discussion', 'ongoing'].includes(t.type) && !followUps.some(f => f.id === t.id)
  );
  const tags = pendingTags || [];

  // All unique tasks for counting
  const allTasks = useMemo(() => {
    const seen = new Set();
    const all = [];
    for (const t of [...followUps, ...actionItems, ...discussions, ...ongoingItems, ...otherTasks]) {
      if (!seen.has(t.id)) { seen.add(t.id); all.push(t); }
    }
    return all;
  }, [followUps, actionItems, discussions, ongoingItems, otherTasks]);

  const totalItems = allTasks.length + tags.length;
  const assignedCount = allTasks.filter(t => statusMap[t.id]?.meetingStatus).length;

  async function handleStatusChange(taskId, status, extra = {}) {
    await setMeetingTaskStatus(taskId, meetingId, status, extra);
  }

  function handleStartMeeting() {
    // Default unassigned tasks to "keep"
    const unassigned = allTasks.filter(t => !statusMap[t.id]?.meetingStatus);
    const promises = unassigned.map(t => setMeetingTaskStatus(t.id, meetingId, 'keep'));
    Promise.all(promises).then(() => onStartMeeting());
  }

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      {/* Header */}
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary-600 mb-4">
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">{meetingName}</h1>
        <p className="text-sm text-gray-500 mt-0.5">Pre-Meeting Review</p>
      </div>

      {/* Summary + Add Tasks button */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-5">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-500">
              {totalItems} item{totalItems !== 1 ? 's' : ''} to review
            </span>
            {allTasks.length > 0 && (
              <span className="text-[10px] text-gray-400 ml-2">
                ({assignedCount}/{allTasks.length} assigned)
              </span>
            )}
          </div>
          <button
            onClick={() => setImportPickerOpen(true)}
            className="flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-800 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors"
          >
            <Plus size={12} />
            Add Tasks
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1">
          Assign a status to each task: Keep on agenda, mark Resolved, Snooze for later, or Reassign to another meeting.
        </p>
      </div>

      {/* Follow-up Tasks */}
      <ReviewSection
        title="Follow-up Tasks"
        icon={RotateCw}
        count={followUps.length}
        color="text-blue-600"
        defaultOpen={true}
      >
        {followUps.map(task => (
          <TaskReviewRow
            key={task.id}
            task={task}
            meetingId={meetingId}
            meetingStatus={statusMap[task.id]}
            onStatusChange={handleStatusChange}
          />
        ))}
      </ReviewSection>

      {/* Action Items */}
      <ReviewSection
        title="Action Items"
        icon={CheckSquare}
        count={actionItems.length}
        color="text-primary-600"
        defaultOpen={true}
      >
        {actionItems.map(task => (
          <TaskReviewRow
            key={task.id}
            task={task}
            meetingId={meetingId}
            meetingStatus={statusMap[task.id]}
            onStatusChange={handleStatusChange}
          />
        ))}
      </ReviewSection>

      {/* Discussions */}
      <ReviewSection
        title="Discussions"
        icon={MessageSquare}
        count={discussions.length}
        color="text-indigo-600"
        defaultOpen={discussions.length <= 5}
      >
        {discussions.map(task => (
          <TaskReviewRow
            key={task.id}
            task={task}
            meetingId={meetingId}
            meetingStatus={statusMap[task.id]}
            onStatusChange={handleStatusChange}
          />
        ))}
      </ReviewSection>

      {/* Ongoing */}
      <ReviewSection
        title="Ongoing Tasks"
        icon={RotateCw}
        count={ongoingItems.length}
        color="text-amber-600"
      >
        {ongoingItems.map(task => (
          <TaskReviewRow
            key={task.id}
            task={task}
            meetingId={meetingId}
            meetingStatus={statusMap[task.id]}
            onStatusChange={handleStatusChange}
          />
        ))}
      </ReviewSection>

      {/* Other Tasks (events, calling plans, ministering) */}
      <ReviewSection
        title="Other Tasks"
        icon={CalendarDays}
        count={otherTasks.length}
        color="text-green-600"
      >
        {otherTasks.map(task => (
          <TaskReviewRow
            key={task.id}
            task={task}
            meetingId={meetingId}
            meetingStatus={statusMap[task.id]}
            onStatusChange={handleStatusChange}
          />
        ))}
      </ReviewSection>

      {/* Tagged Notes */}
      <ReviewSection
        title="Tagged Notes"
        icon={ArrowUpRight}
        count={tags.length}
        color="text-indigo-500"
      >
        {tags.map(tag => (
          <TaggedNoteRow key={tag.id} tag={tag} />
        ))}
      </ReviewSection>

      {/* No items state */}
      {totalItems === 0 && (
        <div className="text-center py-8 text-gray-400">
          <CheckCircle2 size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm font-medium text-gray-500 mb-1">All clear!</p>
          <p className="text-xs mb-3">No pending tasks or notes to review.</p>
          <button
            onClick={() => setImportPickerOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-800 px-3 py-1.5 rounded-lg border border-primary-200 hover:bg-primary-50 transition-colors"
          >
            <Import size={14} />
            Add tasks from other meetings
          </button>
        </div>
      )}

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 safe-area-bottom z-50">
        <div className="max-w-lg mx-auto flex gap-3">
          <button
            onClick={onSkip}
            className="btn-secondary flex items-center justify-center gap-1.5 flex-1"
          >
            <SkipForward size={14} />
            Skip Review
          </button>
          <button
            onClick={handleStartMeeting}
            className="btn-primary flex items-center justify-center gap-1.5 flex-1"
          >
            <FileText size={14} />
            Open Meeting Notes
          </button>
        </div>
      </div>

      {/* Import task picker */}
      {importPickerOpen && (
        <ImportTaskPicker
          meetingId={meetingId}
          onClose={() => setImportPickerOpen(false)}
        />
      )}
    </div>
  );
}
