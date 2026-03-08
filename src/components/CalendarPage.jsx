import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTasks, useUpcomingMeetings } from '../hooks/useDb';
import { addTask, updateTask, deleteTask } from '../db';
import { TASK_TYPES } from '../utils/constants';
import {
  ChevronLeft, ChevronRight, Plus, Calendar, CalendarDays,
  CheckCircle2, Circle, X,
} from 'lucide-react';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarPage() {
  const navigate = useNavigate();
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState(null);
  const [showAddEvent, setShowAddEvent] = useState(false);

  // Get all events from unified tasks
  const { tasks: events } = useTasks({ type: 'event' });
  const { tasks: actionItems } = useTasks({ type: 'action_item', excludeComplete: true });
  const { meetings: upcomingMeetings } = useUpcomingMeetings();

  // Build a map of date → items for the current month view
  const dateItems = useMemo(() => {
    const map = {};

    // Events (by eventDate or dueDate)
    for (const evt of events) {
      const date = evt.eventDate || evt.dueDate;
      if (!date) continue;
      if (!map[date]) map[date] = { events: [], meetings: [], tasks: [] };
      map[date].events.push(evt);
    }

    // Action items with due dates
    for (const task of actionItems) {
      if (!task.dueDate) continue;
      if (!map[task.dueDate]) map[task.dueDate] = { events: [], meetings: [], tasks: [] };
      map[task.dueDate].tasks.push(task);
    }

    // Meetings
    for (const mtg of upcomingMeetings) {
      if (!mtg.nextDate) continue;
      if (!map[mtg.nextDate]) map[mtg.nextDate] = { events: [], meetings: [], tasks: [] };
      map[mtg.nextDate].meetings.push(mtg);
    }

    return map;
  }, [events, actionItems, upcomingMeetings]);

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const { year, month } = viewDate;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    // Days of month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ day: d, date: dateStr, items: dateItems[dateStr] || null });
    }

    return days;
  }, [viewDate, dateItems]);

  const today = new Date().toISOString().split('T')[0];

  function prevMonth() {
    setViewDate(prev => {
      const m = prev.month - 1;
      if (m < 0) return { year: prev.year - 1, month: 11 };
      return { ...prev, month: m };
    });
    setSelectedDate(null);
  }

  function nextMonth() {
    setViewDate(prev => {
      const m = prev.month + 1;
      if (m > 11) return { year: prev.year + 1, month: 0 };
      return { ...prev, month: m };
    });
    setSelectedDate(null);
  }

  function goToToday() {
    const now = new Date();
    setViewDate({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedDate(today);
  }

  // Selected day items
  const selectedItems = selectedDate ? dateItems[selectedDate] : null;

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays size={24} className="text-primary-700" />
          <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
        </div>
        <button
          onClick={() => { setSelectedDate(today); setShowAddEvent(true); }}
          className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800 bg-primary-50 px-2.5 py-1.5 rounded-lg"
        >
          <Plus size={14} />
          Event
        </button>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronLeft size={20} className="text-gray-600" />
        </button>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">
            {MONTH_NAMES[viewDate.month]} {viewDate.year}
          </h2>
          <button onClick={goToToday} className="text-[10px] text-primary-600 hover:text-primary-800">
            Today
          </button>
        </div>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronRight size={20} className="text-gray-600" />
        </button>
      </div>

      {/* Day names header */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
        {calendarDays.map((cell, i) => {
          if (!cell) {
            return <div key={i} className="bg-gray-50 h-12" />;
          }

          const isToday = cell.date === today;
          const isSelected = cell.date === selectedDate;
          const hasEvents = cell.items?.events?.length > 0;
          const hasMeetings = cell.items?.meetings?.length > 0;
          const hasTasks = cell.items?.tasks?.length > 0;

          return (
            <button
              key={cell.date}
              onClick={() => setSelectedDate(isSelected ? null : cell.date)}
              className={`h-12 flex flex-col items-center justify-center relative transition-colors
                ${isSelected ? 'bg-primary-50' : 'bg-white hover:bg-gray-50'}
                ${isToday ? 'font-bold' : ''}`}
            >
              <span className={`text-xs ${isToday ? 'bg-primary-700 text-white w-6 h-6 rounded-full flex items-center justify-center' : 'text-gray-700'}`}>
                {cell.day}
              </span>
              {/* Dots for items */}
              <div className="flex gap-0.5 mt-0.5">
                {hasMeetings && <span className="w-1 h-1 rounded-full bg-blue-500" />}
                {hasEvents && <span className="w-1 h-1 rounded-full bg-green-500" />}
                {hasTasks && <span className="w-1 h-1 rounded-full bg-amber-500" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected day detail */}
      {selectedDate && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
            <button
              onClick={() => { setShowAddEvent(true); }}
              className="text-[10px] text-primary-600 hover:text-primary-800 flex items-center gap-0.5"
            >
              <Plus size={10} /> Add Event
            </button>
          </div>

          {!selectedItems ? (
            <p className="text-xs text-gray-400 py-4 text-center">No items on this day</p>
          ) : (
            <div className="space-y-1.5">
              {/* Meetings */}
              {selectedItems.meetings?.map(mtg => (
                <div
                  key={mtg.id}
                  onClick={() => navigate('/meetings', { state: { openMeetingId: mtg.id } })}
                  className="flex items-center gap-2 p-2 rounded-lg border border-blue-200 bg-blue-50/50 cursor-pointer hover:bg-blue-50"
                >
                  <Calendar size={14} className="text-blue-600 flex-shrink-0" />
                  <span className="text-xs font-medium text-blue-900 flex-1 truncate">{mtg.name}</span>
                  <span className="text-[9px] text-blue-500">Meeting</span>
                </div>
              ))}

              {/* Events */}
              {selectedItems.events?.map(evt => (
                <div
                  key={evt.id}
                  className="flex items-center gap-2 p-2 rounded-lg border border-green-200 bg-green-50/50"
                >
                  <button
                    onClick={() => updateTask(evt.id, { status: evt.status === 'complete' ? 'not_started' : 'complete' })}
                    className={`flex-shrink-0 ${evt.status === 'complete' ? 'text-green-500' : 'text-gray-300'}`}
                  >
                    {evt.status === 'complete' ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                  </button>
                  <span className={`text-xs font-medium flex-1 truncate ${evt.status === 'complete' ? 'line-through text-gray-400' : 'text-green-900'}`}>
                    {evt.title}
                  </span>
                  {evt.organization && (
                    <span className="text-[9px] text-green-500">{evt.organization}</span>
                  )}
                </div>
              ))}

              {/* Tasks */}
              {selectedItems.tasks?.map(task => (
                <div
                  key={task.id}
                  className="flex items-center gap-2 p-2 rounded-lg border border-amber-200 bg-amber-50/30"
                >
                  <button
                    onClick={() => updateTask(task.id, { status: task.status === 'complete' ? 'not_started' : 'complete' })}
                    className={`flex-shrink-0 ${task.status === 'complete' ? 'text-green-500' : 'text-gray-300'}`}
                  >
                    {task.status === 'complete' ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                  </button>
                  <span className={`text-xs font-medium flex-1 truncate ${task.status === 'complete' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                    {task.title}
                  </span>
                  <span className="text-[9px] text-amber-500">Task</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Event Modal */}
      {showAddEvent && (
        <AddEventModal
          date={selectedDate || today}
          onAdd={async (data) => {
            await addTask({
              type: 'event',
              ...data,
              dueDate: data.eventDate,
            });
            setShowAddEvent(false);
          }}
          onClose={() => setShowAddEvent(false)}
        />
      )}
    </div>
  );
}

// ── Add Event Modal ────────────────────────────────────────
function AddEventModal({ date, onAdd, onClose }) {
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState(date);
  const [organization, setOrganization] = useState('');
  const [description, setDescription] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-5 animate-in fade-in mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <CalendarDays size={16} className="text-green-600" />
            New Event
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && title.trim()) onAdd({ title: title.trim(), eventDate, organization, description }); }}
            placeholder="Event title..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            autoFocus
          />
          <input
            type="date"
            value={eventDate}
            onChange={e => setEventDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
          />
          <input
            type="text"
            value={organization}
            onChange={e => setOrganization(e.target.value)}
            placeholder="Organization (optional)"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description or notes..."
            rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none"
          />
          <div className="flex gap-3">
            <button
              onClick={() => onAdd({ title: title.trim(), eventDate, organization, description })}
              disabled={!title.trim()}
              className="btn-primary flex-1"
            >
              Add Event
            </button>
            <button onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
