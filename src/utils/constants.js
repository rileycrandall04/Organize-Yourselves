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
  identified: { key: 'identified', label: 'Identified', color: 'gray' },
  prayed_about: { key: 'prayed_about', label: 'Prayed About', color: 'blue' },
  discussed: { key: 'discussed', label: 'Discussed', color: 'indigo' },
  extended: { key: 'extended', label: 'Extended', color: 'yellow' },
  accepted: { key: 'accepted', label: 'Accepted', color: 'emerald' },
  declined: { key: 'declined', label: 'Declined', color: 'red' },
  sustained: { key: 'sustained', label: 'Sustained', color: 'teal' },
  set_apart: { key: 'set_apart', label: 'Set Apart', color: 'green' },
};

export const STAGE_ORDER = [
  'identified', 'prayed_about', 'discussed', 'extended',
  'accepted', 'sustained', 'set_apart',
];

export const STAGE_LIST = Object.values(CALLING_STAGES);

// ── Note Tag Sources (for auto-agenda items) ────────────────
export const NOTE_TAG_SOURCES = {
  template: { key: 'template', label: 'Template' },
  carry_forward: { key: 'carry_forward', label: 'Carry Forward' },
  tagged_note: { key: 'tagged_note', label: 'Tagged Note' },
};

// ── Bottom Nav Tabs ─────────────────────────────────────────
export const NAV_TABS = [
  { key: 'dashboard', label: 'Home', icon: 'LayoutDashboard', path: '/' },
  { key: 'actions', label: 'Actions', icon: 'CheckSquare', path: '/actions' },
  { key: 'meetings', label: 'Meetings', icon: 'Calendar', path: '/meetings' },
  { key: 'inbox', label: 'Inbox', icon: 'Inbox', path: '/inbox' },
  { key: 'more', label: 'More', icon: 'MoreHorizontal', path: '/more' },
];
