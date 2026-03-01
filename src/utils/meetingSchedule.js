/**
 * Meeting Schedule Calculator
 * Calculates the next occurrence of a meeting based on its cadence and last instance date.
 */

import {
  addDays,
  addWeeks,
  addMonths,
  startOfDay,
  startOfMonth,
  getDay,
  setDay,
  isBefore,
  isEqual,
  format,
  parseISO,
} from 'date-fns';
import { normalizeCadence } from '../data/callings';

/**
 * Calculate the next meeting date based on cadence and last instance.
 * Supports both single cadence strings and arrays of cadences.
 * @param {string|string[]} cadence — One or more MEETING_CADENCES keys
 * @param {string|null} lastInstanceDate — ISO date string of the last recorded instance
 * @returns {string|null} — YYYY-MM-DD of the next meeting, or null for 'as_needed'
 */
export function getNextMeetingDate(cadence, lastInstanceDate) {
  const cadences = normalizeCadence(cadence).filter(c => c && c !== 'as_needed');
  if (cadences.length === 0) return null;

  // Compute next date for each cadence, return the soonest
  const dates = cadences
    .map(c => getNextMeetingDateSingle(c, lastInstanceDate))
    .filter(Boolean);

  if (dates.length === 0) return null;
  dates.sort();
  return dates[0];
}

/**
 * Calculate the next meeting date for a single cadence value.
 */
function getNextMeetingDateSingle(cadence, lastInstanceDate) {
  if (!cadence || cadence === 'as_needed') return null;

  const today = startOfDay(new Date());
  const lastDate = lastInstanceDate ? startOfDay(parseISO(lastInstanceDate)) : null;

  // For nth-Sunday cadences, use special logic
  if (cadence.endsWith('_sunday')) {
    return formatDate(getNextNthSunday(cadence, today));
  }

  // For regular cadences, calculate from last instance (or today if none)
  const baseDate = lastDate || today;
  let next;

  switch (cadence) {
    case 'weekly':
      next = addWeeks(baseDate, 1);
      break;
    case 'biweekly':
      next = addWeeks(baseDate, 2);
      break;
    case 'monthly':
      next = addMonths(baseDate, 1);
      break;
    case 'quarterly':
      next = addMonths(baseDate, 3);
      break;
    case 'biannual':
      next = addMonths(baseDate, 6);
      break;
    case 'annual':
      next = addMonths(baseDate, 12);
      break;
    default:
      return null;
  }

  // If no last instance, the "next" from today is the first occurrence
  if (!lastDate) {
    return formatDate(today);
  }

  // Roll forward until the next date is today or in the future
  while (isBefore(next, today)) {
    switch (cadence) {
      case 'weekly':
        next = addWeeks(next, 1);
        break;
      case 'biweekly':
        next = addWeeks(next, 2);
        break;
      case 'monthly':
        next = addMonths(next, 1);
        break;
      case 'quarterly':
        next = addMonths(next, 3);
        break;
      case 'biannual':
        next = addMonths(next, 6);
        break;
      case 'annual':
        next = addMonths(next, 12);
        break;
      default:
        return null;
    }
  }

  return formatDate(next);
}

/**
 * Get the next Nth Sunday of the month (1st, 2nd, 3rd, or 4th).
 * If this month's Nth Sunday has passed, returns next month's.
 */
function getNextNthSunday(cadence, today) {
  const nMap = {
    first_sunday: 1,
    second_sunday: 2,
    third_sunday: 3,
    fourth_sunday: 4,
  };
  const n = nMap[cadence];
  if (!n) return today;

  // Try this month first
  const thisMonthSunday = getNthSundayOfMonth(today.getFullYear(), today.getMonth(), n);

  if (thisMonthSunday && !isBefore(thisMonthSunday, today)) {
    return thisMonthSunday;
  }

  // This month's Nth Sunday has passed — get next month's
  const nextMonth = addMonths(startOfMonth(today), 1);
  return getNthSundayOfMonth(nextMonth.getFullYear(), nextMonth.getMonth(), n);
}

/**
 * Get the Nth Sunday of a given month.
 * @param {number} year
 * @param {number} month — 0-indexed (0 = January)
 * @param {number} n — 1 = first, 2 = second, etc.
 * @returns {Date}
 */
function getNthSundayOfMonth(year, month, n) {
  const firstOfMonth = new Date(year, month, 1);
  const dayOfWeek = getDay(firstOfMonth); // 0 = Sunday

  // Calculate the first Sunday
  const firstSunday = dayOfWeek === 0
    ? firstOfMonth
    : setDay(firstOfMonth, 7); // Next Sunday after the 1st

  // Add (n-1) weeks to get the Nth Sunday
  const nthSunday = addWeeks(firstSunday, n - 1);

  // Verify it's still in the same month
  if (nthSunday.getMonth() !== month) return null;

  return startOfDay(nthSunday);
}

function formatDate(date) {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Check if a date string is today.
 */
export function isDateToday(dateStr) {
  if (!dateStr) return false;
  const today = format(new Date(), 'yyyy-MM-dd');
  return dateStr === today;
}

/**
 * Check if a date string is tomorrow.
 */
export function isDateTomorrow(dateStr) {
  if (!dateStr) return false;
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  return dateStr === tomorrow;
}
