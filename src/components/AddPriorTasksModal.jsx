import { useState, useEffect } from 'react';
import { getActionItems, getAllOngoingTasks, getActiveMinisteringPlans } from '../db';
import db from '../db';
import { ArrowLeft, CheckSquare, Target, Heart, Calendar, MessageSquare, X } from 'lucide-react';

const CATEGORIES = [
  { key: 'action_items', label: 'Action Items', icon: CheckSquare, color: 'amber' },
  { key: 'ongoing_tasks', label: 'Ongoing Tasks', icon: Target, color: 'green' },
  { key: 'ministering_plans', label: 'Ministering Plans', icon: Heart, color: 'teal' },
  { key: 'events', label: 'Events', icon: Calendar, color: 'blue' },
  { key: 'tagged_notes', label: 'Discussion Topics', icon: MessageSquare, color: 'indigo' },
];

export default function AddPriorTasksModal({ onClose, onAdd, currentMeetingId }) {
  const [step, setStep] = useState('categories'); // 'categories' | 'items'
  const [category, setCategory] = useState(null);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState({});

  // Load counts for each category
  useEffect(() => {
    async function loadCounts() {
      const actionItems = await getActionItems({ excludeComplete: true });
      const ongoingTasks = await getAllOngoingTasks();
      const ministeringPlans = await getActiveMinisteringPlans();
      const events = await db.events.toArray();
      const upcomingEvents = events.filter(e => e.date >= new Date().toISOString().split('T')[0]);
      const tags = await db.meetingNoteTags.where('consumed').equals(0).toArray();

      setCounts({
        action_items: actionItems.length,
        ongoing_tasks: ongoingTasks.length,
        ministering_plans: ministeringPlans.length,
        events: upcomingEvents.length,
        tagged_notes: tags.length,
      });
    }
    loadCounts();
  }, []);

  async function loadItems(cat) {
    setLoading(true);
    setCategory(cat);
    setStep('items');
    setSelected(new Set());

    try {
      let result = [];
      switch (cat) {
        case 'action_items': {
          const actionItems = await getActionItems({ excludeComplete: true });
          result = actionItems.map(item => ({
            id: `action_${item.id}`,
            label: item.title,
            subtitle: item.dueDate ? `Due: ${item.dueDate}` : 'No due date',
            agendaItem: {
              label: `[Action Item] ${item.title}`,
              notes: '',
              source: 'prior_action_item',
              actionItemId: item.id,
            },
          }));
          break;
        }
        case 'ongoing_tasks': {
          const tasks = await getAllOngoingTasks();
          result = tasks.map(task => ({
            id: `task_${task.id}`,
            label: task.title,
            subtitle: task.updates?.length > 0
              ? `Last update: ${new Date(task.updates[task.updates.length - 1].date).toLocaleDateString()}`
              : 'No updates yet',
            agendaItem: {
              label: `[Ongoing] ${task.title}`,
              notes: task.updates?.length > 0 ? task.updates[task.updates.length - 1].text : '',
              source: 'ongoing_task',
              ongoingTaskId: task.id,
            },
          }));
          break;
        }
        case 'ministering_plans': {
          const plans = await getActiveMinisteringPlans();
          result = plans.map(plan => ({
            id: `plan_${plan.id}`,
            label: plan.familyName
              ? `${plan.personName} ${plan.familyName} Family`
              : plan.personName,
            subtitle: plan.description || 'No description',
            agendaItem: {
              label: plan.familyName
                ? `[Ministering] ${plan.personName} ${plan.familyName} Family`
                : `[Ministering] ${plan.personName}`,
              notes: plan.updates?.length > 0 ? plan.updates[plan.updates.length - 1].text : '',
              source: 'ministering_plan',
              ministeringPlanId: plan.id,
            },
          }));
          break;
        }
        case 'events': {
          const events = await db.events.toArray();
          const today = new Date().toISOString().split('T')[0];
          const upcoming = events.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
          result = upcoming.map(event => ({
            id: `event_${event.id}`,
            label: event.title,
            subtitle: event.date,
            agendaItem: {
              label: `[Event] ${event.title} (${event.date})`,
              notes: event.notes || '',
              source: 'prior_event',
              eventId: event.id,
            },
          }));
          break;
        }
        case 'tagged_notes': {
          const tags = await db.meetingNoteTags.where('consumed').equals(0).toArray();
          // Get meeting names for each tag
          for (const tag of tags) {
            let sourceName = 'another meeting';
            if (tag.sourceMeetingInstanceId) {
              const inst = await db.meetingInstances.get(tag.sourceMeetingInstanceId);
              if (inst) {
                const mtg = await db.meetings.get(inst.meetingId);
                if (mtg) sourceName = mtg.name;
              }
            }
            tag._sourceName = sourceName;
          }
          result = tags.map(tag => ({
            id: `tag_${tag.id}`,
            label: tag.text.length > 60 ? tag.text.substring(0, 60) + '...' : tag.text,
            subtitle: `From: ${tag._sourceName}`,
            agendaItem: {
              label: `[From ${tag._sourceName}] ${tag.text.length > 60 ? tag.text.substring(0, 60) + '...' : tag.text}`,
              notes: tag.text,
              source: 'tagged_note',
              sourceNoteTagId: tag.id,
            },
          }));
          break;
        }
      }
      setItems(result);
    } catch (err) {
      console.warn('[AddPriorTasks] Error loading items:', err.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleItem(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAdd() {
    const selectedItems = items
      .filter(item => selected.has(item.id))
      .map(item => item.agendaItem);
    onAdd(selectedItems);
  }

  const categoryConfig = CATEGORIES.find(c => c.key === category);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {step === 'items' && (
              <button onClick={() => setStep('categories')} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <ArrowLeft size={16} />
              </button>
            )}
            <h2 className="text-lg font-bold text-gray-900">
              {step === 'categories' ? 'Add Prior Tasks' : categoryConfig?.label}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 'categories' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 mb-3">Select a category to browse items you can add to the agenda.</p>
              {CATEGORIES.map(cat => {
                const Icon = cat.icon;
                const count = counts[cat.key] || 0;
                return (
                  <button
                    key={cat.key}
                    onClick={() => loadItems(cat.key)}
                    disabled={count === 0}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                      count === 0
                        ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                        : 'border-gray-200 hover:border-primary-200 hover:bg-primary-50'
                    }`}
                  >
                    <div className={`p-2 rounded-lg bg-${cat.color}-50`}>
                      <Icon size={16} className={`text-${cat.color}-600`} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{cat.label}</p>
                    </div>
                    <span className={`text-xs font-medium ${count > 0 ? 'text-gray-500' : 'text-gray-300'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {step === 'items' && loading && (
            <div className="text-center py-8 text-gray-400">
              <div className="animate-spin w-5 h-5 border-2 border-primary-300 border-t-primary-700 rounded-full mx-auto mb-2" />
              <p className="text-xs">Loading...</p>
            </div>
          )}

          {step === 'items' && !loading && items.length === 0 && (
            <p className="text-center py-8 text-xs text-gray-400">No items available in this category.</p>
          )}

          {step === 'items' && !loading && items.length > 0 && (
            <div className="space-y-2">
              {items.map(item => (
                <label
                  key={item.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    selected.has(item.id)
                      ? 'border-primary-300 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleItem(item.id)}
                    className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{item.label}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{item.subtitle}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'items' && selected.size > 0 && (
          <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
              Cancel
            </button>
            <button
              onClick={handleAdd}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
            >
              Add {selected.size} Item{selected.size !== 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
