import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile, useDashboardStats, useInbox, useTasks, useUpcomingMeetings, useUserCallings, useMinisteringSummary, useIndividuals } from '../hooks/useDb';
import { getTagsForMeeting, getUnresolvedActionItems, dismissBackupReminder, snoozeTask, addTask as addTaskDb, updateTask as updateTaskDb, archiveIndividual } from '../db';
import { isCheckInOverdue } from '../utils/constants';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle, Clock, CheckSquare, Inbox, Plus, Send, Star,
  Calendar, ChevronRight, ChevronDown, ShieldCheck, X, Heart, Play,
  Circle, CheckCircle2, Pause, AlarmClockOff, Filter,
  UserRound, Target,
} from 'lucide-react';
import { useLastExportDate } from '../hooks/useDataPortability';
import { useAuth } from '../hooks/useAuth';
import DashboardChat from './DashboardChat';
import ActionItemForm from './ActionItemForm';
import IndividualForm from './IndividualForm';
import IndividualDetail from './IndividualDetail';
import { formatFriendly } from '../utils/dates';
import { isDateToday } from '../utils/meetingSchedule';
import { formatCadenceLabel } from '../data/callings';
import { useVisibility } from '../hooks/useVisibility';

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { stats } = useDashboardStats();
  const { add: addInboxItem } = useInbox();
  const { tasks: allTasksRaw, update: updateTask, add: addTask, remove: removeTask } = useTasks({ excludeComplete: true });
  const allTasks = useMemo(() => allTasksRaw.filter(t => t.type !== 'individual'), [allTasksRaw]);
  const { individuals } = useIndividuals(false);
  const { callings } = useUserCallings();
  const { meetings: upcomingMeetings } = useUpcomingMeetings();

  const todaysMeetings = upcomingMeetings.filter(m => isDateToday(m.nextDate));
  const futureMeetings = upcomingMeetings.filter(m => m.nextDate && !isDateToday(m.nextDate));
  const { summary: ministeringSummary } = useMinisteringSummary();
  const { daysSinceExport, shouldShowReminder } = useLastExportDate();
  const { user: authUser } = useAuth();
  const isCloudSynced = !!authUser;

  const ministeringCallings = ['eq_president', 'rs_president', 'bishop', 'bishopric_1st', 'bishopric_2nd'];
  const showMinistering = callings.some(c => ministeringCallings.includes(c.callingKey));
  const [reminderDismissed, setReminderDismissed] = useState(false);

  const showBackupBanner = shouldShowReminder && !reminderDismissed && !isCloudSynced;

  const [inboxBannerDismissed, setInboxBannerDismissed] = useState(false);

  // To-do section state
  const [todoCollapsed, setTodoCollapsed] = useState(false);
  const [todoShowAll, setTodoShowAll] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  // Individual Focus state
  const [focusDetailItem, setFocusDetailItem] = useState(null);
  const [individualFormOpen, setIndividualFormOpen] = useState(false);
  const [editingIndividual, setEditingIndividual] = useState(null);

  async function handleDismissReminder() {
    setReminderDismissed(true);
    await dismissBackupReminder();
  }

  // Compute the "due soon" cutoff (2 days from now)
  const twoDaysOut = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  })();

  // Sort: starred first, then high priority, then by createdAt
  const sortedTasks = [...allTasks].sort((a, b) => {
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    if ((a.priority === 'high') !== (b.priority === 'high')) return a.priority === 'high' ? -1 : 1;
    return 0;
  });

  // Priority filter: high priority OR due within 2 days OR starred
  const priorityItems = sortedTasks.filter(item =>
    item.priority === 'high' || item.starred || (item.dueDate && item.dueDate <= twoDaysOut)
  );

  const todoItems = todoShowAll ? sortedTasks.slice(0, 15) : priorityItems.slice(0, 10);
  const totalCount = allTasks.length;
  const priorityCount = priorityItems.length;

  const greeting = getGreeting();

  function handleToggleStatus(id, newStatus) {
    updateTask(id, {
      status: newStatus,
      ...(newStatus === 'complete' ? { completedAt: new Date().toISOString() } : { completedAt: null }),
    });
  }

  async function handleSnooze(id) {
    await snoozeTask(id, 7);
  }

  function handlePressTask(item) {
    setEditItem(item);
    setFormOpen(true);
  }

  async function handleSaveTask(data, id) {
    if (id) {
      await updateTask(id, data);
    } else {
      await addTask(data);
    }
  }

  async function handleDeleteTask(id) {
    await removeTask(id);
  }

  // Individual handlers
  async function handleSaveIndividual(data, id) {
    if (id) {
      await updateTaskDb(id, data);
    } else {
      await addTaskDb(data);
    }
    setIndividualFormOpen(false);
    setEditingIndividual(null);
  }

  async function handleArchiveIndividual(id) {
    await archiveIndividual(id);
    setIndividualFormOpen(false);
    setEditingIndividual(null);
  }

  const hasContent = allTasks.length > 0 || upcomingMeetings.length > 0 || individuals.length > 0;

  return (
    <div className="px-4 pt-5 pb-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-1">
        <h1 className="text-xl font-bold text-gray-900">
          {greeting}, {profile?.name || 'Brother'}
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stat Badges */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {stats.overdue > 0 && (
          <button
            onClick={() => navigate('/actions', { state: { view: 'overdue' } })}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-100 hover:bg-red-100 transition-colors"
          >
            <AlertTriangle size={10} />
            {stats.overdue} overdue
          </button>
        )}
        {stats.dueToday > 0 && (
          <button
            onClick={() => navigate('/actions', { state: { view: 'today' } })}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100 hover:bg-amber-100 transition-colors"
          >
            <Clock size={10} />
            {stats.dueToday} today
          </button>
        )}
        <button
          onClick={() => navigate('/actions', { state: { view: 'all' } })}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100 hover:bg-gray-100 transition-colors"
        >
          <CheckSquare size={10} />
          {stats.totalActive} active
        </button>
        {stats.inboxCount > 0 && (
          <button
            onClick={() => navigate('/inbox')}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100 hover:bg-purple-100 transition-colors"
          >
            <Inbox size={10} />
            {stats.inboxCount} inbox
          </button>
        )}
      </div>

      {/* Backup Banner (compact) */}
      {showBackupBanner && (
        <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-2">
          <ShieldCheck size={14} className="text-amber-500 flex-shrink-0" />
          <p className="text-xs text-amber-700 flex-1 truncate">
            {daysSinceExport === null ? 'Back up your data' : `${daysSinceExport}d since last backup`}
          </p>
          <button
            onClick={() => navigate('/settings')}
            className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-lg hover:bg-amber-200 transition-colors flex-shrink-0"
          >
            Backup
          </button>
          <button onClick={handleDismissReminder} className="text-amber-300 hover:text-amber-500 flex-shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Inbox Alert Banner */}
      {stats.inboxCount > 0 && !inboxBannerDismissed && (
        <div className="mb-3 px-3 py-2 bg-purple-50 border border-purple-100 rounded-xl flex items-center gap-2">
          <Inbox size={14} className="text-purple-500 flex-shrink-0" />
          <p className="text-xs text-purple-700 flex-1 truncate">
            {stats.inboxCount} item{stats.inboxCount !== 1 ? 's' : ''} to process
          </p>
          <button
            onClick={() => navigate('/inbox')}
            className="text-[10px] font-semibold text-purple-700 bg-purple-100 px-2.5 py-1 rounded-lg hover:bg-purple-200 transition-colors flex-shrink-0"
          >
            Sort
          </button>
          <button onClick={() => setInboxBannerDismissed(true)} className="text-purple-300 hover:text-purple-500 flex-shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {/* To Do — collapsible with filter toggle */}
      {totalCount > 0 && (
        <div className="mb-4 bg-white rounded-xl border border-gray-200 shadow-sm p-3">
          {/* Header with collapse + filter */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setTodoCollapsed(!todoCollapsed)}
              className="flex items-center gap-1.5"
            >
              <ChevronDown
                size={12}
                className={`text-gray-400 transition-transform ${todoCollapsed ? '-rotate-90' : ''}`}
              />
              <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckSquare size={12} className="text-primary-500" />
                To Do
                <span className="text-gray-300 normal-case tracking-normal font-normal">
                  ({todoShowAll ? totalCount : priorityCount})
                </span>
              </h2>
            </button>
            <div className="flex items-center gap-2">
              {/* Filter toggle */}
              <div className="flex items-center bg-gray-100 rounded-full p-0.5">
                <button
                  onClick={() => setTodoShowAll(false)}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${
                    !todoShowAll ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'
                  }`}
                >
                  Priority
                </button>
                <button
                  onClick={() => setTodoShowAll(true)}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${
                    todoShowAll ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'
                  }`}
                >
                  All
                </button>
              </div>
              <button onClick={() => navigate('/actions')} className="text-[11px] text-primary-600 flex items-center gap-0.5 hover:text-primary-700">
                All <ChevronRight size={10} />
              </button>
            </div>
          </div>

          {/* Task list (collapsible) */}
          {!todoCollapsed && (
            <div className="space-y-0">
              {todoItems.length > 0 ? (
                todoItems.map(item => (
                  <TodoLine
                    key={item.id}
                    item={item}
                    onToggleStatus={handleToggleStatus}
                    onSnooze={handleSnooze}
                    onPress={handlePressTask}
                  />
                ))
              ) : (
                <p className="text-xs text-gray-400 py-2">No priority items right now.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Focus — Individuals */}
      {individuals.length > 0 && (
        <div className="mb-4">
          <SectionHeader
            icon={UserRound}
            color="text-cyan-500"
            label="Focus"
            onAdd={() => { setEditingIndividual(null); setIndividualFormOpen(true); }}
          />
          <div className="space-y-1.5">
            {individuals.map(ind => {
              const overdue = isCheckInOverdue(ind.lastCheckIn, ind.checkInCadence);
              return (
                <div
                  key={ind.id}
                  onClick={() => setFocusDetailItem(ind)}
                  className="flex items-center gap-2.5 p-2 rounded-xl border border-gray-100 bg-white cursor-pointer hover:border-cyan-200 transition-colors"
                >
                  <div className="p-1.5 rounded-lg bg-cyan-50">
                    <UserRound size={14} className="text-cyan-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{ind.title}</p>
                    {ind.nextOrdinance && (
                      <p className="text-[10px] text-cyan-600 flex items-center gap-1">
                        <Target size={8} />
                        {ind.nextOrdinance}
                      </p>
                    )}
                    {ind.fellowshippers && (
                      <p className="text-[10px] text-gray-400 truncate">{ind.fellowshippers}</p>
                    )}
                  </div>
                  {overdue && (
                    <span className="text-[9px] font-medium bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full border border-red-100">
                      Overdue
                    </span>
                  )}
                  <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Individual (empty state, always visible when no individuals) */}
      {individuals.length === 0 && (
        <div className="mb-4">
          <button
            onClick={() => { setEditingIndividual(null); setIndividualFormOpen(true); }}
            className="w-full text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl py-3 hover:border-cyan-300 hover:text-cyan-600 transition-colors flex items-center justify-center gap-1.5"
          >
            <UserRound size={12} />
            Add someone to focus on
          </button>
        </div>
      )}

      {/* Today's Meetings */}
      {todaysMeetings.length > 0 && (
        <div className="mb-4">
          <SectionHeader icon={Calendar} color="text-indigo-500" label="Today" onViewAll={() => navigate('/meetings')} />
          <div className="space-y-1.5">
            {todaysMeetings.map(meeting => (
              <TodayMeetingCard key={meeting.id} meeting={meeting} onPress={() => navigate('/meetings', { state: { openMeetingId: meeting.id } })} />
            ))}
          </div>
        </div>
      )}

      {/* Coming Up */}
      {futureMeetings.length > 0 && (
        <div className="mb-4">
          <SectionHeader
            icon={Calendar}
            color="text-primary-500"
            label={todaysMeetings.length > 0 ? 'Coming Up' : 'Upcoming'}
            onViewAll={() => navigate('/meetings')}
          />
          <div className="space-y-1.5">
            {futureMeetings.slice(0, 3).map(meeting => (
              <UpcomingMeetingCard key={meeting.id} meeting={meeting} onPress={() => navigate('/meetings', { state: { openMeetingId: meeting.id } })} />
            ))}
          </div>
        </div>
      )}

      {/* Ministering */}
      {showMinistering && (
        <div className="mb-4">
          <SummaryRow
            icon={Heart}
            iconBg="bg-rose-50"
            iconColor="text-rose-500"
            label="Ministering"
            detail={`${ministeringSummary.totalCompanionships} companionships`}
            badges={
              <>
                {ministeringSummary.unassignedFamilies > 0 && (
                  <span className="text-[9px] font-medium bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full">
                    {ministeringSummary.unassignedFamilies} unassigned
                  </span>
                )}
                {ministeringSummary.overdueInterviews > 0 && (
                  <span className="text-[9px] font-medium bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full">
                    {ministeringSummary.overdueInterviews} overdue
                  </span>
                )}
              </>
            }
            onPress={() => navigate('/ministering')}
          />
        </div>
      )}

      {/* Quick Capture */}
      <QuickCapture onAdd={addInboxItem} />

      {/* AI Agent */}
      <DashboardChat />

      {/* Empty state */}
      {!hasContent && (
        <div className="text-center text-gray-400 py-8">
          <CheckSquare size={28} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No items yet. Star action items or add meetings and they&apos;ll appear here.</p>
        </div>
      )}

      {/* Task edit form */}
      <ActionItemForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditItem(null); }}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        item={editItem}
      />

      {/* Individual Form modal */}
      <IndividualForm
        open={individualFormOpen}
        onClose={() => { setIndividualFormOpen(false); setEditingIndividual(null); }}
        onSave={handleSaveIndividual}
        onArchive={handleArchiveIndividual}
        item={editingIndividual}
      />

      {/* Individual Detail overlay */}
      {focusDetailItem && (
        <div className="fixed inset-0 z-40 bg-gray-50 overflow-y-auto">
          <IndividualDetail
            individual={focusDetailItem}
            onBack={() => setFocusDetailItem(null)}
            onUpdated={() => {
              // Refresh the detail item with latest data
              setFocusDetailItem(prev => prev);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Section Header ──────────────────────────────────────────

function SectionHeader({ icon: Icon, color, label, onViewAll, onAdd }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
        <Icon size={12} className={color} />
        {label}
      </h2>
      <div className="flex items-center gap-2">
        {onAdd && (
          <button onClick={onAdd} className="text-[11px] text-cyan-600 flex items-center gap-0.5 hover:text-cyan-700">
            <Plus size={12} /> Add
          </button>
        )}
        {onViewAll && (
          <button onClick={onViewAll} className="text-[11px] text-primary-600 flex items-center gap-0.5 hover:text-primary-700">
            All <ChevronRight size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Todo Line (ultra-compact single-line task) ──────────────

const TODO_STATUS_ICONS = {
  not_started: Circle,
  in_progress: Clock,
  waiting: Pause,
  complete: CheckCircle2,
};

const TODO_STATUS_COLORS = {
  not_started: 'text-gray-300',
  in_progress: 'text-blue-500',
  waiting: 'text-yellow-500',
  complete: 'text-green-500',
};

function TodoLine({ item, onToggleStatus, onSnooze, onPress }) {
  const StatusIcon = TODO_STATUS_ICONS[item.status] || Circle;
  const statusColor = TODO_STATUS_COLORS[item.status] || 'text-gray-300';
  const isComplete = item.status === 'complete';

  function handleStatusTap(e) {
    e.stopPropagation();
    const next = isComplete ? 'not_started' : item.status === 'in_progress' ? 'complete' : 'in_progress';
    onToggleStatus(item.id, next);
  }

  function handleQuickComplete(e) {
    e.stopPropagation();
    onToggleStatus(item.id, 'complete');
  }

  function handleSnooze(e) {
    e.stopPropagation();
    onSnooze(item.id);
  }

  return (
    <div
      onClick={() => onPress?.(item)}
      className="flex items-center gap-2 py-1.5 cursor-pointer group"
    >
      <button onClick={handleStatusTap} className="flex-shrink-0">
        <StatusIcon size={14} className={statusColor} />
      </button>
      <span className={`flex-1 text-xs truncate ${isComplete ? 'line-through text-gray-400' : 'text-gray-800'}`}>
        {item.title}
      </span>
      {item.starred && (
        <Star size={10} className="text-amber-400 fill-amber-400 flex-shrink-0" />
      )}
      {item.dueDate && (
        <span className="text-[10px] text-gray-400 flex-shrink-0">{formatFriendly(item.dueDate)}</span>
      )}
      {/* Snooze (1 week) */}
      <button
        onClick={handleSnooze}
        className="flex-shrink-0 text-gray-200 hover:text-orange-400 transition-colors opacity-0 group-hover:opacity-100"
        title="Snooze 1 week"
      >
        <AlarmClockOff size={13} />
      </button>
      {/* Quick complete */}
      <button
        onClick={handleQuickComplete}
        className="flex-shrink-0 text-gray-200 hover:text-green-500 transition-colors opacity-0 group-hover:opacity-100"
        title="Mark complete"
      >
        <CheckCircle2 size={14} />
      </button>
    </div>
  );
}

// ── Summary Row ─────────────────────────────────────────────

function SummaryRow({ icon: Icon, iconBg, iconColor, label, detail, badges, onPress }) {
  return (
    <div
      onClick={onPress}
      className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-100 bg-white cursor-pointer hover:border-primary-200 transition-colors"
    >
      <div className={`p-1.5 rounded-lg ${iconBg}`}>
        <Icon size={14} className={iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-[11px] text-gray-500">{detail}</p>
      </div>
      {badges && <div className="flex gap-1 flex-shrink-0">{badges}</div>}
      <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
    </div>
  );
}

// ── Today's Meeting Card ────────────────────────────────────

function TodayMeetingCard({ meeting, onPress }) {
  const pendingData = useLiveQuery(async () => {
    const tags = await getTagsForMeeting(meeting.id);
    const unresolved = await getUnresolvedActionItems(meeting.id);
    return tags.length + unresolved.length;
  }, [meeting.id]);

  const pendingCount = pendingData ?? 0;
  const cadenceLabel = formatCadenceLabel(meeting.cadence);

  return (
    <div
      onClick={onPress}
      className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-indigo-50/50 p-2.5 cursor-pointer hover:border-indigo-300 transition-colors"
    >
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-lg bg-indigo-100">
          <Calendar size={14} className="text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-indigo-900 truncate">{meeting.name}</p>
          <p className="text-[11px] text-indigo-500">{cadenceLabel}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {pendingCount > 0 && (
            <span className="text-[9px] bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded-full font-medium">
              {pendingCount} prep
            </span>
          )}
          <div className="p-1 rounded-lg bg-indigo-600 text-white">
            <Play size={10} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Upcoming Meeting Card ───────────────────────────────────

function UpcomingMeetingCard({ meeting, onPress }) {
  const pendingData = useLiveQuery(async () => {
    const tags = await getTagsForMeeting(meeting.id);
    const unresolved = await getUnresolvedActionItems(meeting.id);
    return tags.length + unresolved.length;
  }, [meeting.id]);

  const pendingCount = pendingData ?? 0;
  const cadenceLabel = formatCadenceLabel(meeting.cadence);
  const dateLabel = meeting.nextDate ? formatFriendly(meeting.nextDate) : '';

  return (
    <div
      onClick={onPress}
      className="flex items-center gap-2.5 p-2 rounded-xl border border-gray-100 bg-white cursor-pointer hover:border-primary-200 transition-colors"
    >
      <div className="p-1.5 rounded-lg bg-primary-50">
        <Calendar size={14} className="text-primary-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{meeting.name}</p>
        <p className="text-[11px] text-gray-500">
          {cadenceLabel}
          {dateLabel && <span className="text-primary-600"> &middot; {dateLabel}</span>}
        </p>
      </div>
      {pendingCount > 0 && (
        <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">
          {pendingCount}
        </span>
      )}
    </div>
  );
}

// ── Quick Capture ───────────────────────────────────────────

function QuickCapture({ onAdd }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      await onAdd(text.trim());
      setText('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-3">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Quick capture..."
            className="input-field pr-10 text-sm"
          />
          <Plus size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
        </div>
        <button
          type="submit"
          disabled={!text.trim() || saving}
          className="btn-primary px-3"
        >
          <Send size={14} />
        </button>
      </div>
    </form>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
