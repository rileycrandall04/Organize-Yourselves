import { useState, useMemo } from 'react';
import { useActionItems, usePeople } from '../hooks/useDb';
import { ACTION_VIEWS, CONTEXT_LIST, STATUSES } from '../utils/constants';
import { todayStr, thisWeekRange, isOverdue } from '../utils/dates';
import ActionItemRow from './shared/ActionItemRow';
import ActionItemForm from './ActionItemForm';
import {
  CheckSquare, Plus, Search, X, Filter,
  Circle, Clock, Pause, CheckCircle2,
} from 'lucide-react';

export default function ActionItems() {
  const [view, setView] = useState('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);

  // Build filters based on current view
  const filters = useMemo(() => {
    const today = todayStr();
    const week = thisWeekRange();
    switch (view) {
      case 'today': return { excludeComplete: true, dueBy: today };
      case 'this_week': return { excludeComplete: true, dueBy: week.end };
      case 'overdue': return { excludeComplete: true, overdue: true };
      case 'completed': return { status: 'complete' };
      default: return { excludeComplete: view !== 'completed' };
    }
  }, [view]);

  const { items, loading, add, update, remove } = useActionItems(filters);
  const { people } = usePeople();

  // Build a phone lookup map from assignedTo person IDs
  const phoneMap = useMemo(() => {
    const map = {};
    for (const p of people) {
      if (p.phone) map[p.id] = p.phone;
    }
    return map;
  }, [people]);

  function getPhoneForItem(item) {
    // Check assignedTo person
    if (item.assignedTo?.id && phoneMap[item.assignedTo.id]) {
      return phoneMap[item.assignedTo.id];
    }
    // Try to match name from title against people
    const titleLower = item.title.toLowerCase();
    for (const p of people) {
      if (p.phone && titleLower.includes(p.name.toLowerCase())) {
        return p.phone;
      }
    }
    return null;
  }

  // Apply local search and status filter on top of DB results
  const filtered = useMemo(() => {
    let result = items;

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(i =>
        i.title.toLowerCase().includes(q) ||
        (i.description && i.description.toLowerCase().includes(q))
      );
    }

    // Status sub-filter (for "all" view)
    if (statusFilter) {
      result = result.filter(i => i.status === statusFilter);
    }

    // For "today" view, also include overdue items
    if (view === 'today') {
      const today = todayStr();
      result = result.filter(i => i.dueDate === today || isOverdue(i.dueDate));
    }

    return result;
  }, [items, search, statusFilter, view]);

  // Group items for context view
  const grouped = useMemo(() => {
    if (view === 'by_context') {
      const groups = {};
      CONTEXT_LIST.forEach(c => { groups[c.key] = []; });
      groups['_none'] = [];
      filtered.forEach(item => {
        const key = item.context && groups[item.context] ? item.context : '_none';
        groups[key].push(item);
      });
      return Object.entries(groups)
        .filter(([, arr]) => arr.length > 0)
        .map(([key, items]) => ({
          key,
          label: key === '_none' ? 'Anywhere' : CONTEXT_LIST.find(c => c.key === key)?.label || key,
          items,
        }));
    }
    return null;
  }, [view, filtered]);

  // Handlers
  function handleToggleStatus(id, newStatus) {
    update(id, { status: newStatus });
  }

  function handleToggleStar(id, starred) {
    update(id, { starred });
  }

  function handlePress(item) {
    setEditItem(item);
    setFormOpen(true);
  }

  function handleCreate() {
    setEditItem(null);
    setFormOpen(true);
  }

  async function handleSave(data, id) {
    if (id) {
      await update(id, data);
    } else {
      await add(data);
    }
  }

  async function handleDelete(id) {
    await remove(id);
  }

  // Status counts for quick filter chips
  const statusCounts = useMemo(() => {
    const counts = { not_started: 0, in_progress: 0, waiting: 0 };
    items.forEach(i => {
      if (counts[i.status] !== undefined) counts[i.status]++;
    });
    return counts;
  }, [items]);

  const STATUS_ICONS = { not_started: Circle, in_progress: Clock, waiting: Pause, complete: CheckCircle2 };

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CheckSquare size={24} className="text-primary-700" />
          <h1 className="text-2xl font-bold text-gray-900">Action Items</h1>
        </div>
        <span className="text-sm text-gray-400">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Search bar */}
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search action items..."
          className="input-field pl-9 pr-8"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X size={16} className="text-gray-400" />
          </button>
        )}
      </div>

      {/* View tabs (horizontal scroll) */}
      <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-4 px-4 no-scrollbar">
        {ACTION_VIEWS.map(v => (
          <button
            key={v.key}
            onClick={() => { setView(v.key); setStatusFilter(''); }}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
              ${view === v.key
                ? 'bg-primary-700 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Status sub-filter chips (only on "all" view) */}
      {(view === 'all' || view === 'this_week') && (
        <div className="flex gap-1.5 mb-3">
          {['not_started', 'in_progress', 'waiting'].map(s => {
            const Icon = STATUS_ICONS[s];
            const active = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(active ? '' : s)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors
                  ${active
                    ? 'bg-primary-100 text-primary-700 border border-primary-300'
                    : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}
              >
                <Icon size={12} />
                {STATUSES[s].label}
                {statusCounts[s] > 0 && (
                  <span className="ml-0.5 text-[10px] opacity-70">{statusCounts[s]}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Item list */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <div className="animate-spin w-6 h-6 border-2 border-primary-300 border-t-primary-700 rounded-full mx-auto mb-3" />
          <p className="text-sm">Loading...</p>
        </div>
      ) : grouped ? (
        // Grouped view (by context)
        grouped.length === 0 ? (
          <EmptyState view={view} />
        ) : (
          <div className="space-y-5">
            {grouped.map(group => (
              <div key={group.key}>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {group.label} <span className="text-gray-400">({group.items.length})</span>
                </h3>
                <div className="space-y-2">
                  {group.items.map(item => (
                    <ActionItemRow
                      key={item.id}
                      item={item}
                      onToggleStatus={handleToggleStatus}
                      onToggleStar={handleToggleStar}
                      onPress={handlePress}
                      onDelete={handleDelete}
                      phoneForPerson={getPhoneForItem(item)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <EmptyState view={view} search={search} />
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <ActionItemRow
              key={item.id}
              item={item}
              onToggleStatus={handleToggleStatus}
              onToggleStar={handleToggleStar}
              onPress={handlePress}
              onDelete={handleDelete}
              phoneForPerson={getPhoneForItem(item)}
            />
          ))}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={handleCreate}
        className="fixed bottom-20 right-4 sm:right-auto sm:left-1/2 sm:translate-x-[calc(256px-28px)]
          w-14 h-14 bg-primary-700 text-white rounded-full shadow-lg
          hover:bg-primary-800 active:bg-primary-900 transition-colors
          flex items-center justify-center z-40"
      >
        <Plus size={24} />
      </button>

      {/* Form modal */}
      <ActionItemForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditItem(null); }}
        onSave={handleSave}
        onDelete={handleDelete}
        item={editItem}
      />
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────

function EmptyState({ view, search }) {
  const messages = {
    today: 'Nothing due today. Enjoy the day!',
    this_week: 'No items due this week.',
    overdue: 'No overdue items. You\'re on top of things!',
    by_context: 'No active items to group.',
    all: 'No active action items yet.',
    completed: 'No completed items yet.',
  };

  return (
    <div className="card text-center text-gray-400 py-12">
      <CheckSquare size={40} className="mx-auto mb-3 text-gray-300" />
      <p className="text-sm">
        {search ? `No items matching "${search}"` : messages[view] || messages.all}
      </p>
      {!search && view !== 'completed' && (
        <p className="text-xs mt-1.5 text-gray-300">Tap + to create an action item</p>
      )}
    </div>
  );
}
