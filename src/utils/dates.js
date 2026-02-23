import {
  format,
  formatDistanceToNow,
  isToday,
  isTomorrow,
  isYesterday,
  isPast,
  differenceInDays,
  parseISO,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  addDays,
} from 'date-fns';

// Parse a date string (YYYY-MM-DD or ISO) into a Date object
export function parseDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  return parseISO(dateStr);
}

// "Feb 22" or "Feb 22, 2025" (includes year if not current year)
export function formatShort(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) {
    return format(d, 'MMM d');
  }
  return format(d, 'MMM d, yyyy');
}

// "Today", "Tomorrow", "Yesterday", or "Feb 22"
export function formatFriendly(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  if (isYesterday(d)) return 'Yesterday';
  return formatShort(dateStr);
}

// "Saturday, February 22, 2026"
export function formatFull(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  return format(d, 'EEEE, MMMM d, yyyy');
}

// "3 days ago", "in 2 hours", etc.
export function formatRelative(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  return formatDistanceToNow(d, { addSuffix: true });
}

// "3 days overdue" or "Due in 5 days" — for action items
export function formatDueStatus(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  if (isToday(d)) return 'Due today';
  if (isTomorrow(d)) return 'Due tomorrow';
  const days = differenceInDays(startOfDay(d), startOfDay(new Date()));
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} overdue`;
  return `Due in ${days} day${days !== 1 ? 's' : ''}`;
}

// Is a date in the past? (for overdue checks)
export function isOverdue(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return false;
  return isPast(endOfDay(d));
}

// Get YYYY-MM-DD string for today
export function todayStr() {
  return format(new Date(), 'yyyy-MM-dd');
}

// Get the date range for "this week" (Sun–Sat)
export function thisWeekRange() {
  const now = new Date();
  return {
    start: format(startOfWeek(now), 'yyyy-MM-dd'),
    end: format(endOfWeek(now), 'yyyy-MM-dd'),
  };
}

// Format a time string like "2:30 PM"
export function formatTime(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  return format(d, 'h:mm a');
}

// Format for display in meeting instances: "Sun, Feb 22"
export function formatMeetingDate(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  return format(d, 'EEE, MMM d');
}
