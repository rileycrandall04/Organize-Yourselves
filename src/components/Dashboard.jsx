import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile, useDashboardStats, useInbox, useActionItems, useMeetings, useUserCallings, usePipelineSummary, useMeetingNoteTags, useMinisteringSummary } from '../hooks/useDb';
import { getTagsForMeeting, getUnresolvedActionItems } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Clock, CheckSquare, Inbox, Plus, Send, Star, Calendar, ChevronRight, GitBranch, ShieldCheck, X, Heart, Users } from 'lucide-react';
import { useLastExportDate } from '../hooks/useDataPortability';
import { dismissBackupReminder } from '../db';
import ActionItemRow from './shared/ActionItemRow';
import DashboardChat from './DashboardChat';
import { updateActionItem } from '../db';
import { formatFriendly, formatMeetingDate, todayStr, thisWeekRange } from '../utils/dates';

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { stats } = useDashboardStats();
  const { add: addInboxItem } = useInbox();
  const { items: focusItems, update: updateAction } = useActionItems({ excludeComplete: true });
  const { callings } = useUserCallings();
  const { meetings } = useMeetings();
  const { summary: pipelineSummary } = usePipelineSummary();
  const { summary: ministeringSummary } = useMinisteringSummary();
  const { daysSinceExport, shouldShowReminder } = useLastExportDate();

  // Show ministering card for EQ pres, RS pres, bishopric
  const ministeringCallings = ['eq_president', 'rs_president', 'bishop', 'bishopric_1st', 'bishopric_2nd'];
  const showMinistering = callings.some(c => ministeringCallings.includes(c.callingKey));
  const [reminderDismissed, setReminderDismissed] = useState(false);

  const showBackupBanner = shouldShowReminder && !reminderDismissed;

  async function handleDismissReminder() {
    setReminderDismissed(true);
    await dismissBackupReminder();
  }

  // Filter to starred or high-priority items, max 5
  const focus = focusItems
    .filter(i => i.starred || i.priority === 'high')
    .slice(0, 5);

  const greeting = getGreeting();

  function handleToggleStatus(id, newStatus) {
    updateAction(id, { status: newStatus });
  }

  function handleToggleStar(id, starred) {
    updateAction(id, { starred });
  }

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting}, {profile?.name || 'Brother'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">Organize yourselves; prepare every needful thing.</p>
      </div>

      {/* Backup Reminder Banner */}
      {showBackupBanner && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <ShieldCheck size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">
              {daysSinceExport === null
                ? "You haven't backed up your data yet."
                : `It's been ${daysSinceExport} days since your last backup.`}
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => navigate('/settings')}
                className="text-xs font-medium text-amber-700 bg-amber-100 px-3 py-1 rounded-lg hover:bg-amber-200 transition-colors"
              >
                Back Up Now
              </button>
              <button
                onClick={handleDismissReminder}
                className="text-xs text-amber-500 px-2 py-1"
              >
                Remind Later
              </button>
            </div>
          </div>
          <button onClick={handleDismissReminder} className="text-amber-300 hover:text-amber-500">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Quick Capture */}
      <QuickCapture onAdd={addInboxItem} />

      {/* AI Agent */}
      <DashboardChat />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard icon={AlertTriangle} label="Overdue" value={stats.overdue} color="red" onPress={() => navigate('/actions')} />
        <StatCard icon={Clock} label="Due Today" value={stats.dueToday} color="amber" onPress={() => navigate('/actions')} />
        <StatCard icon={CheckSquare} label="Active Items" value={stats.totalActive} color="primary" onPress={() => navigate('/actions')} />
        <StatCard icon={Inbox} label="Inbox" value={stats.inboxCount} color="purple" onPress={() => navigate('/inbox')} />
      </div>

      {/* Focus Items */}
      {focus.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              <Star size={14} className="text-amber-400" />
              Focus Items
            </h2>
            <button onClick={() => navigate('/actions')} className="text-xs text-primary-600 flex items-center gap-0.5">
              View all <ChevronRight size={12} />
            </button>
          </div>
          <div className="space-y-2">
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

      {/* Upcoming Meetings */}
      {meetings.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              <Calendar size={14} className="text-primary-600" />
              Your Meetings
            </h2>
            <button onClick={() => navigate('/meetings')} className="text-xs text-primary-600 flex items-center gap-0.5">
              View all <ChevronRight size={12} />
            </button>
          </div>
          <div className="space-y-2">
            {meetings.slice(0, 4).map(meeting => (
              <MeetingCardWithPrep key={meeting.id} meeting={meeting} onPress={() => navigate('/meetings')} />
            ))}
          </div>
        </div>
      )}

      {/* Pipeline Summary */}
      {pipelineSummary.total > 0 && (
        <div className="mb-6">
          <div
            onClick={() => navigate('/pipeline')}
            className="card flex items-center gap-3 cursor-pointer hover:border-primary-200 transition-colors"
          >
            <div className="p-2 rounded-lg bg-indigo-50">
              <GitBranch size={16} className="text-indigo-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Calling Pipeline</p>
              <p className="text-xs text-gray-500">
                {pipelineSummary.active} active
                {pipelineSummary.needsAction > 0 && (
                  <span className="text-amber-600"> · {pipelineSummary.needsAction} need action</span>
                )}
              </p>
              {(pipelineSummary.openPositions > 0 || pipelineSummary.releasesInProgress > 0 || pipelineSummary.candidatesPending > 0) && (
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {pipelineSummary.openPositions > 0 && (
                    <span className="text-[10px] font-medium bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full">
                      {pipelineSummary.openPositions} open
                    </span>
                  )}
                  {pipelineSummary.releasesInProgress > 0 && (
                    <span className="text-[10px] font-medium bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full">
                      {pipelineSummary.releasesInProgress} releasing
                    </span>
                  )}
                  {pipelineSummary.candidatesPending > 0 && (
                    <span className="text-[10px] font-medium bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">
                      {pipelineSummary.candidatesPending} candidates
                    </span>
                  )}
                </div>
              )}
            </div>
            <ChevronRight size={14} className="text-gray-300" />
          </div>
        </div>
      )}

      {/* Ministering Summary */}
      {showMinistering && (
        <div className="mb-6">
          <div
            onClick={() => navigate('/ministering')}
            className="card flex items-center gap-3 cursor-pointer hover:border-primary-200 transition-colors"
          >
            <div className="p-2 rounded-lg bg-rose-50">
              <Heart size={16} className="text-rose-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Ministering</p>
              <p className="text-xs text-gray-500">
                {ministeringSummary.totalCompanionships} companionships
              </p>
              {(ministeringSummary.unassignedFamilies > 0 || ministeringSummary.overdueInterviews > 0) && (
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {ministeringSummary.unassignedFamilies > 0 && (
                    <span className="text-[10px] font-medium bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full">
                      {ministeringSummary.unassignedFamilies} unassigned
                    </span>
                  )}
                  {ministeringSummary.overdueInterviews > 0 && (
                    <span className="text-[10px] font-medium bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full">
                      {ministeringSummary.overdueInterviews} overdue interviews
                    </span>
                  )}
                </div>
              )}
            </div>
            <ChevronRight size={14} className="text-gray-300" />
          </div>
        </div>
      )}

      {/* Empty state when no focus items or meetings */}
      {focus.length === 0 && meetings.length === 0 && (
        <div className="card text-center text-gray-400 py-8">
          <CheckSquare size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No focus items yet. Star or set action items to high priority and they'll show up here.</p>
        </div>
      )}
    </div>
  );
}

// ── Meeting Card with Prep Indicator ────────────────────────

function MeetingCardWithPrep({ meeting, onPress }) {
  // Check for pending prep items (tags + carry-forward)
  const pendingData = useLiveQuery(async () => {
    const tags = await getTagsForMeeting(meeting.id);
    const unresolved = await getUnresolvedActionItems(meeting.id);
    return tags.length + unresolved.length;
  }, [meeting.id]);

  const pendingCount = pendingData ?? 0;

  return (
    <div
      onClick={onPress}
      className="card flex items-center gap-3 cursor-pointer hover:border-primary-200 transition-colors"
    >
      <div className="p-2 rounded-lg bg-primary-50">
        <Calendar size={16} className="text-primary-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{meeting.name}</p>
        <p className="text-xs text-gray-500">{meeting.cadence}</p>
      </div>
      {pendingCount > 0 && (
        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">
          {pendingCount} pending
        </span>
      )}
    </div>
  );
}

// ── Quick Capture Bar ───────────────────────────────────────

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
    <form onSubmit={handleSubmit} className="mb-5">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Quick capture a thought..."
            className="input-field pr-10"
          />
          <Plus size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
        </div>
        <button
          type="submit"
          disabled={!text.trim() || saving}
          className="btn-primary px-3"
        >
          <Send size={16} />
        </button>
      </div>
    </form>
  );
}

// ── Stat Card ───────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color, onPress }) {
  const colorMap = {
    red: 'text-red-600 bg-red-50',
    amber: 'text-amber-600 bg-amber-50',
    primary: 'text-primary-700 bg-primary-50',
    purple: 'text-purple-600 bg-purple-50',
  };
  const classes = colorMap[color] || colorMap.primary;

  return (
    <div className="card flex items-center gap-3 cursor-pointer hover:border-primary-200 transition-colors" onClick={onPress}>
      <div className={`p-2 rounded-lg ${classes}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
