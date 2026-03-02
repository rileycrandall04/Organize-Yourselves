import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile, useDashboardStats, useInbox, useTasks, useUpcomingMeetings, useUserCallings, usePipelineSummary, useMinisteringSummary } from '../hooks/useDb';
import { getTagsForMeeting, getUnresolvedActionItems, dismissBackupReminder } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Clock, CheckSquare, Inbox, Plus, Send, Star, Calendar, ChevronRight, GitBranch, ShieldCheck, X, Heart, Play } from 'lucide-react';
import { useLastExportDate } from '../hooks/useDataPortability';
import { useAuth } from '../hooks/useAuth';
import ActionItemRow from './shared/ActionItemRow';
import DashboardChat from './DashboardChat';
import { formatFriendly } from '../utils/dates';
import { isDateToday } from '../utils/meetingSchedule';
import { formatCadenceLabel } from '../data/callings';
import { useVisibility } from '../hooks/useVisibility';

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { stats } = useDashboardStats();
  const { add: addInboxItem } = useInbox();
  const { tasks: allTasks, update: updateTask } = useTasks({ excludeComplete: true });
  const { callings } = useUserCallings();
  const { meetings: upcomingMeetings } = useUpcomingMeetings();
  const { jurisdiction } = useVisibility();
  const { summary: pipelineSummary } = usePipelineSummary(jurisdiction);

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

  async function handleDismissReminder() {
    setReminderDismissed(true);
    await dismissBackupReminder();
  }

  const focus = allTasks
    .filter(i => i.starred || i.priority === 'high')
    .slice(0, 5);

  const greeting = getGreeting();

  function handleToggleStatus(id, newStatus) {
    updateTask(id, { status: newStatus });
  }

  function handleToggleStar(id, starred) {
    updateTask(id, { starred });
  }

  const hasContent = focus.length > 0 || upcomingMeetings.length > 0 || pipelineSummary.total > 0;

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
            onClick={() => navigate('/actions')}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-100 hover:bg-red-100 transition-colors"
          >
            <AlertTriangle size={10} />
            {stats.overdue} overdue
          </button>
        )}
        {stats.dueToday > 0 && (
          <button
            onClick={() => navigate('/actions')}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100 hover:bg-amber-100 transition-colors"
          >
            <Clock size={10} />
            {stats.dueToday} today
          </button>
        )}
        <button
          onClick={() => navigate('/actions')}
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

      {/* Focus Items */}
      {focus.length > 0 && (
        <div className="mb-4">
          <SectionHeader icon={Star} color="text-amber-400" label="Focus" onViewAll={() => navigate('/actions')} />
          <div className="space-y-1.5">
            {focus.map(item => (
              <ActionItemRow
                key={item.id}
                item={item}
                onToggleStatus={handleToggleStatus}
                onToggleStar={handleToggleStar}
                onPress={() => navigate('/actions')}
              />
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

      {/* Summary Links */}
      {(pipelineSummary.total > 0 || showMinistering) && (
        <div className="space-y-1.5 mb-4">
          {pipelineSummary.total > 0 && (
            <SummaryRow
              icon={GitBranch}
              iconBg="bg-indigo-50"
              iconColor="text-indigo-600"
              label="Pipeline"
              detail={`${pipelineSummary.active} active${pipelineSummary.needsAction > 0 ? ` \u00b7 ${pipelineSummary.needsAction} need action` : ''}`}
              badges={
                <>
                  {pipelineSummary.openPositions > 0 && (
                    <span className="text-[9px] font-medium bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full">
                      {pipelineSummary.openPositions} open
                    </span>
                  )}
                  {pipelineSummary.candidatesPending > 0 && (
                    <span className="text-[9px] font-medium bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">
                      {pipelineSummary.candidatesPending} pending
                    </span>
                  )}
                </>
              }
              onPress={() => navigate('/pipeline')}
            />
          )}
          {showMinistering && (
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
          )}
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
    </div>
  );
}

// ── Section Header ──────────────────────────────────────────

function SectionHeader({ icon: Icon, color, label, onViewAll }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
        <Icon size={12} className={color} />
        {label}
      </h2>
      {onViewAll && (
        <button onClick={onViewAll} className="text-[11px] text-primary-600 flex items-center gap-0.5 hover:text-primary-700">
          All <ChevronRight size={10} />
        </button>
      )}
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
