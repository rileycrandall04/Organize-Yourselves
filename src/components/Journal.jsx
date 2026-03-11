import { useState, useEffect } from 'react';
import { useJournalLists, useJournalByList, useJournal } from '../hooks/useDb';
import { getJournalListColor, JOURNAL_LIST_COLORS } from '../utils/constants';
import { formatRelative } from '../utils/dates';
import { ensureDefaultJournalLists } from '../db';
import Modal from './shared/Modal';
import JournalEntryEditor from './JournalEntryEditor';
import {
  ArrowLeft, BookOpen, Plus, Search, X, Sparkles, Check,
  Pencil, Trash2,
} from 'lucide-react';

// ── List Management Modal ──────────────────────────────────

function ListFormModal({ open, onClose, onSave, editList }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editList?.name || '');
      setColor(editList?.color || 'blue');
    }
  }, [open, editList]);

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), color });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editList ? 'Edit List' : 'New List'} size="sm">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., Conference Notes"
            className="input-field"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
          <div className="flex gap-2 flex-wrap">
            {JOURNAL_LIST_COLORS.map(c => (
              <button
                key={c.key}
                onClick={() => setColor(c.key)}
                className={`w-8 h-8 rounded-full ${c.dot} border-2 transition-all ${
                  color === c.key ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-105'
                }`}
                title={c.label}
              />
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={handleSave} disabled={!name.trim() || saving} className="btn-primary flex-1">
            {saving ? 'Saving...' : editList ? 'Save' : 'Create'}
          </button>
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Entries List (Level 2) ─────────────────────────────────

function JournalEntriesList({ list, onBack, onOpenEntry }) {
  const { entries, loading } = useJournalByList(list.id, 200);
  const [search, setSearch] = useState('');
  const color = getJournalListColor(list.color);

  let filtered = entries;
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(e =>
      (e.text || '').toLowerCase().includes(q) ||
      (e.tags && e.tags.some(t => t.toLowerCase().includes(q)))
    );
  }

  function getPreview(entry) {
    const text = entry.text || '';
    if (text.length <= 120) return text;
    return text.substring(0, 120) + '...';
  }

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary-600 mb-4">
        <ArrowLeft size={16} /> Back
      </button>

      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className={`w-4 h-4 rounded-full ${color.dot}`} />
          <h1 className="text-2xl font-bold text-gray-900">{list.name}</h1>
        </div>
        <button
          onClick={() => onOpenEntry(null)}
          className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-800"
        >
          <Plus size={16} /> New Entry
        </button>
      </div>

      {entries.length > 0 && (
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search entries..."
            className="input-field pl-9 pr-8"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X size={16} className="text-gray-400" />
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <div className="animate-spin w-6 h-6 border-2 border-primary-300 border-t-primary-700 rounded-full mx-auto mb-3" />
          <p className="text-sm">Loading...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          <Sparkles size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">
            {search ? `No entries matching "${search}"` : 'No entries yet.'}
          </p>
          {!search && (
            <button onClick={() => onOpenEntry(null)} className="btn-primary mt-3 text-sm">
              <Plus size={14} className="inline mr-1" /> Write Your First Entry
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(entry => (
            <div
              key={entry.id}
              className="card cursor-pointer hover:border-primary-300"
              onClick={() => onOpenEntry(entry)}
            >
              <p className="text-sm text-gray-900 whitespace-pre-wrap line-clamp-3">{getPreview(entry)}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-xs text-gray-400">{formatRelative(entry.date)}</span>
                {entry.tags && entry.tags.map(tag => (
                  <span key={tag} className="badge bg-purple-50 text-purple-600">{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Journal Component (Level 1) ───────────────────────

export default function Journal({ onBack, pickerMode, onPick, pickerSection }) {
  const { lists, loading: listsLoading, add: addList, update: updateList, remove: removeList } = useJournalLists();
  const { entries: allEntries } = useJournal(500);
  const [selectedList, setSelectedList] = useState(null);
  const [editingEntry, setEditingEntry] = useState(undefined); // undefined = not editing, null = new entry, object = existing entry
  const [listFormOpen, setListFormOpen] = useState(false);
  const [editingList, setEditingList] = useState(null);
  const [deleteConfirmList, setDeleteConfirmList] = useState(null);

  // Ensure defaults exist on first load
  useEffect(() => {
    ensureDefaultJournalLists();
  }, []);

  // If in picker mode, fall back to simple flat view
  if (pickerMode) {
    return (
      <PickerView
        entries={allEntries}
        onBack={onBack}
        onPick={onPick}
        pickerSection={pickerSection}
      />
    );
  }

  // Level 3: Entry editor
  if (editingEntry !== undefined && selectedList) {
    return (
      <JournalEntryEditor
        entry={editingEntry}
        list={selectedList}
        onBack={() => setEditingEntry(undefined)}
      />
    );
  }

  // Level 2: Entries within a list
  if (selectedList) {
    return (
      <JournalEntriesList
        list={selectedList}
        onBack={() => setSelectedList(null)}
        onOpenEntry={(entry) => setEditingEntry(entry)}
      />
    );
  }

  // Count entries per list
  const entryCounts = {};
  const latestDates = {};
  allEntries.forEach(e => {
    if (e.listId) {
      entryCounts[e.listId] = (entryCounts[e.listId] || 0) + 1;
      if (!latestDates[e.listId] || e.date > latestDates[e.listId]) {
        latestDates[e.listId] = e.date;
      }
    }
  });

  async function handleSaveList(data) {
    if (editingList) {
      await updateList(editingList.id, data);
    } else {
      await addList(data);
    }
  }

  async function handleDeleteList(list) {
    // Move entries to no-list before deleting
    const listEntries = allEntries.filter(e => e.listId === list.id);
    for (const entry of listEntries) {
      const { updateJournalEntry } = await import('../db');
      await updateJournalEntry(entry.id, { listId: null });
    }
    await removeList(list.id);
    setDeleteConfirmList(null);
  }

  // Level 1: List of lists
  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary-600 mb-4">
          <ArrowLeft size={16} /> Back
        </button>
      )}

      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <BookOpen size={24} className="text-primary-700" />
          <h1 className="text-2xl font-bold text-gray-900">Journal</h1>
        </div>
        <button
          onClick={() => { setEditingList(null); setListFormOpen(true); }}
          className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-800"
        >
          <Plus size={16} /> Add List
        </button>
      </div>

      <p className="text-xs text-gray-400 mb-4">
        Private notes and spiritual impressions. Never shared.
      </p>

      {listsLoading ? (
        <div className="text-center py-12 text-gray-400">
          <div className="animate-spin w-6 h-6 border-2 border-primary-300 border-t-primary-700 rounded-full mx-auto mb-3" />
          <p className="text-sm">Loading...</p>
        </div>
      ) : lists.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          <BookOpen size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No journal lists yet.</p>
          <button
            onClick={() => { setEditingList(null); setListFormOpen(true); }}
            className="btn-primary mt-3 text-sm"
          >
            <Plus size={14} className="inline mr-1" /> Create Your First List
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {lists.map(list => {
            const color = getJournalListColor(list.color);
            const count = entryCounts[list.id] || 0;
            const latest = latestDates[list.id];
            return (
              <div
                key={list.id}
                className="card cursor-pointer hover:border-primary-300 flex items-center gap-3"
                onClick={() => setSelectedList(list)}
              >
                <div className={`w-4 h-4 rounded-full flex-shrink-0 ${color.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-gray-900">{list.name}</div>
                  <div className="text-xs text-gray-400">
                    {count} {count === 1 ? 'entry' : 'entries'}
                    {latest && ` \u00B7 ${formatRelative(latest)}`}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={e => { e.stopPropagation(); setEditingList(list); setListFormOpen(true); }}
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  {!list.isDefault && (
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteConfirmList(list); }}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List form modal */}
      <ListFormModal
        open={listFormOpen}
        onClose={() => { setListFormOpen(false); setEditingList(null); }}
        onSave={handleSaveList}
        editList={editingList}
      />

      {/* Delete confirmation */}
      <Modal open={!!deleteConfirmList} onClose={() => setDeleteConfirmList(null)} title="Delete List" size="sm">
        <p className="text-sm text-gray-600 mb-4">
          Delete &ldquo;{deleteConfirmList?.name}&rdquo;? Entries will be kept but won&apos;t be assigned to a list.
        </p>
        <div className="flex gap-3">
          <button onClick={() => handleDeleteList(deleteConfirmList)} className="btn-danger flex-1">Delete</button>
          <button onClick={() => setDeleteConfirmList(null)} className="btn-secondary flex-1">Cancel</button>
        </div>
      </Modal>
    </div>
  );
}

// ── Picker View (legacy support for pickerMode) ────────────

function PickerView({ entries, onBack, onPick, pickerSection }) {
  const [search, setSearch] = useState('');

  let filtered = entries;
  if (pickerSection) {
    filtered = filtered.filter(e => e.section === pickerSection);
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(e =>
      (e.text || '').toLowerCase().includes(q) ||
      (e.tags && e.tags.some(t => t.toLowerCase().includes(q)))
    );
  }

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary-600 mb-4">
        <ArrowLeft size={16} /> Back
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-5">Select Entry</h1>

      {entries.length > 0 && (
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search journal..."
            className="input-field pl-9 pr-8"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X size={16} className="text-gray-400" />
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          <Sparkles size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No entries found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(entry => (
            <div
              key={entry.id}
              className="card cursor-pointer hover:border-primary-300"
              onClick={() => onPick?.(entry)}
            >
              <p className="text-sm text-gray-900 whitespace-pre-wrap line-clamp-3">
                {(entry.text || '').substring(0, 120)}{(entry.text || '').length > 120 ? '...' : ''}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-gray-400">{formatRelative(entry.date)}</span>
                <span className="ml-auto text-xs text-primary-500 font-medium flex items-center gap-1">
                  <Check size={12} /> Select
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
