// ── Action Item Statuses ────────────────────────────────────
export const STATUSES = {
  not_started: { key: 'not_started', label: 'Not Started', color: 'gray' },
  in_progress: { key: 'in_progress', label: 'In Progress', color: 'blue' },
  waiting: { key: 'waiting', label: 'Waiting', color: 'yellow' },
  complete: { key: 'complete', label: 'Complete', color: 'green' },
};

export const STATUS_LIST = Object.values(STATUSES);

// ── Priority Levels ─────────────────────────────────────────
export const PRIORITIES = {
  high: { key: 'high', label: 'High', color: 'red', badge: 'badge-high' },
  medium: { key: 'medium', label: 'Medium', color: 'yellow', badge: 'badge-medium' },
  low: { key: 'low', label: 'Low', color: 'green', badge: 'badge-low' },
};

export const PRIORITY_LIST = Object.values(PRIORITIES);

// ── Context Tags (where to do it) ───────────────────────────
export const CONTEXTS = {
  at_church: { key: 'at_church', label: 'At Church', icon: 'Church' },
  home: { key: 'home', label: 'At Home', icon: 'Home' },
  phone: { key: 'phone', label: 'Phone Call', icon: 'Phone' },
  computer: { key: 'computer', label: 'Computer', icon: 'Monitor' },
  visit: { key: 'visit', label: 'Visit', icon: 'UserCheck' },
  anywhere: { key: 'anywhere', label: 'Anywhere', icon: 'Globe' },
};

export const CONTEXT_LIST = Object.values(CONTEXTS);

// ── Recurring Cadences ──────────────────────────────────────
export const CADENCES = {
  daily: { key: 'daily', label: 'Daily' },
  weekly: { key: 'weekly', label: 'Weekly' },
  biweekly: { key: 'biweekly', label: 'Every 2 Weeks' },
  monthly: { key: 'monthly', label: 'Monthly' },
  quarterly: { key: 'quarterly', label: 'Quarterly' },
  biannual: { key: 'biannual', label: 'Twice a Year' },
  annual: { key: 'annual', label: 'Annually' },
};

export const CADENCE_LIST = Object.values(CADENCES);

// ── Meeting Instance Statuses ───────────────────────────────
export const MEETING_STATUSES = {
  scheduled: { key: 'scheduled', label: 'Scheduled' },
  in_progress: { key: 'in_progress', label: 'In Progress' },
  completed: { key: 'completed', label: 'Completed' },
  cancelled: { key: 'cancelled', label: 'Cancelled' },
};

// ── Action Item View Filters ────────────────────────────────
export const ACTION_VIEWS = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This Week' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'by_context', label: 'By Context' },
  { key: 'all', label: 'All Active' },
  { key: 'completed', label: 'Completed' },
];

// ── Calling Pipeline Stages ─────────────────────────────────
export const CALLING_STAGES = {
  // Call track (in real-world process order)
  identified: { key: 'identified', label: 'Identified', color: 'gray' },
  discussed: { key: 'discussed', label: 'Discussed', color: 'indigo' },
  prayed_about: { key: 'prayed_about', label: 'Prayed About', color: 'blue' },
  assigned_to_extend: { key: 'assigned_to_extend', label: 'Assigned to Extend', color: 'purple' },
  extended: { key: 'extended', label: 'Extended', color: 'yellow' },
  accepted: { key: 'accepted', label: 'Accepted', color: 'emerald' },
  declined: { key: 'declined', label: 'Declined', color: 'red' },
  sustained: { key: 'sustained', label: 'Sustained', color: 'teal' },
  set_apart: { key: 'set_apart', label: 'Set Apart', color: 'green' },
  serving: { key: 'serving', label: 'Serving', color: 'green' },
  // Release track
  release_planned: { key: 'release_planned', label: 'Release Planned', color: 'amber' },
  release_meeting: { key: 'release_meeting', label: 'Release Meeting', color: 'orange' },
  released: { key: 'released', label: 'Released', color: 'gray' },
};

// Call track stages (identified → serving) — real-world process order
export const CALL_STAGE_ORDER = [
  'identified', 'discussed', 'prayed_about', 'assigned_to_extend',
  'extended', 'accepted', 'sustained', 'set_apart', 'serving',
];

// Release track stages (serving → released)
export const RELEASE_STAGE_ORDER = [
  'serving', 'release_planned', 'release_meeting', 'released',
];

// Backward-compatible alias
export const STAGE_ORDER = CALL_STAGE_ORDER;

export const STAGE_LIST = Object.values(CALLING_STAGES);

// ── Calling Priorities ──────────────────────────────────────
export const CALLING_PRIORITIES = {
  high: { key: 'high', label: 'High', color: 'red', badge: 'bg-red-50 text-red-700' },
  low: { key: 'low', label: 'Low', color: 'green', badge: 'bg-green-50 text-green-700' },
};

export const CALLING_PRIORITY_LIST = Object.values(CALLING_PRIORITIES);

// ── Display Stage Groups (simplified 5-category view) ───────
export const DISPLAY_STAGE_GROUPS = [
  { key: 'discussing', label: 'Discussing', stages: ['identified', 'discussed', 'prayed_about'], color: 'blue' },
  { key: 'extending', label: 'Need to Extend', stages: ['assigned_to_extend', 'extended'], color: 'purple' },
  { key: 'sustaining', label: 'Sustaining', stages: ['accepted', 'sustained'], color: 'teal' },
  { key: 'set_apart', label: 'To be Set Apart', stages: ['set_apart'], color: 'green' },
  { key: 'complete', label: 'Complete', stages: ['serving'], color: 'green' },
];

// ── Note Tag Sources (for auto-agenda items) ────────────────
export const NOTE_TAG_SOURCES = {
  template: { key: 'template', label: 'Template' },
  carry_forward: { key: 'carry_forward', label: 'Carry Forward' },
  tagged_note: { key: 'tagged_note', label: 'Tagged Note' },
  calling_pipeline: { key: 'calling_pipeline', label: 'Calling' },
};

// ── Task Types (Unified Tasks Table) ────────────────────────
export const TASK_TYPES = {
  action_item: { key: 'action_item', label: 'Action Item', icon: 'CheckSquare', color: 'primary' },
  discussion: { key: 'discussion', label: 'Discussion', icon: 'MessageSquare', color: 'indigo' },
  event: { key: 'event', label: 'Event', icon: 'CalendarDays', color: 'green' },
  calling_plan: { key: 'calling_plan', label: 'Calling Plan', icon: 'Briefcase', color: 'purple' },
  ministering_plan: { key: 'ministering_plan', label: 'Ministering', icon: 'Heart', color: 'rose' },
  ongoing: { key: 'ongoing', label: 'Ongoing Task', icon: 'RotateCw', color: 'amber' },
  follow_up: { key: 'follow_up', label: 'Follow Up', icon: 'PhoneForwarded', color: 'teal' },
  spiritual_thought: { key: 'spiritual_thought', label: 'Spiritual Thought', icon: 'Sparkles', color: 'violet' },
};

export const TASK_TYPE_LIST = Object.values(TASK_TYPES);

// ── Journal Sections (legacy — kept for backward compat) ────
export const JOURNAL_SECTIONS = [
  { key: 'spiritual_thoughts', label: 'Spiritual Thoughts' },
  { key: 'impressions', label: 'Impressions' },
  { key: 'promptings', label: 'Promptings' },
  { key: 'gratitude', label: 'Gratitude' },
];

// ── Journal List Colors ─────────────────────────────────────
export const JOURNAL_LIST_COLORS = [
  { key: 'blue', label: 'Blue', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', active: 'bg-blue-600 text-white', dot: 'bg-blue-500' },
  { key: 'violet', label: 'Violet', bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200', active: 'bg-violet-600 text-white', dot: 'bg-violet-500' },
  { key: 'amber', label: 'Amber', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', active: 'bg-amber-600 text-white', dot: 'bg-amber-500' },
  { key: 'emerald', label: 'Emerald', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', active: 'bg-emerald-600 text-white', dot: 'bg-emerald-500' },
  { key: 'rose', label: 'Rose', bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-200', active: 'bg-rose-600 text-white', dot: 'bg-rose-500' },
  { key: 'indigo', label: 'Indigo', bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200', active: 'bg-indigo-600 text-white', dot: 'bg-indigo-500' },
  { key: 'teal', label: 'Teal', bg: 'bg-teal-50', text: 'text-teal-600', border: 'border-teal-200', active: 'bg-teal-600 text-white', dot: 'bg-teal-500' },
  { key: 'orange', label: 'Orange', bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200', active: 'bg-orange-600 text-white', dot: 'bg-orange-500' },
];

export function getJournalListColor(colorKey) {
  return JOURNAL_LIST_COLORS.find(c => c.key === colorKey) || JOURNAL_LIST_COLORS[0];
}

// ── Meeting Task Statuses (per-meeting status for tasks) ────
export const MEETING_TASK_STATUSES = {
  keep: { key: 'keep', label: 'Keep', icon: 'RotateCw', color: 'blue' },
  resolved: { key: 'resolved', label: 'Resolved', icon: 'CheckCircle2', color: 'green' },
  snoozed: { key: 'snoozed', label: 'Snooze', icon: 'Clock', color: 'amber' },
  reassigned: { key: 'reassigned', label: 'Reassign', icon: 'ArrowRightLeft', color: 'purple' },
};

export const MEETING_TASK_STATUS_LIST = Object.values(MEETING_TASK_STATUSES);

// ── Follow-Up Modes ─────────────────────────────────────────
export const FOLLOW_UP_MODES = {
  next: { key: 'next', label: 'Follow up next meeting' },
  current_only: { key: 'current_only', label: 'This meeting only' },
};

// ── Bottom Nav Tabs ─────────────────────────────────────────
export const NAV_TABS = [
  { key: 'dashboard', label: 'Home', icon: 'LayoutDashboard', path: '/' },
  { key: 'actions', label: 'Actions', icon: 'CheckSquare', path: '/actions' },
  { key: 'meetings', label: 'Meetings', icon: 'Calendar', path: '/meetings' },
  { key: 'inbox', label: 'Inbox', icon: 'Inbox', path: '/inbox' },
  { key: 'more', label: 'More', icon: 'MoreHorizontal', path: '/more' },
];
