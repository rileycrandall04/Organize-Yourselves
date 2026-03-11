import { useState, useEffect } from 'react';
import { useJournalLists, useJournalByList, useJournal } from '../hooks/useDb';
import { getJournalListColor, JOURNAL_LIST_COLORS } from '../utils/constants';
import { formatRelative } from '../utils/dates';
import { ensureDefaultJournalLists } from '../db';
import Modal from './shared/Modal';
import JournalEntryEditor from './JournalEntryEditor';
import {
  ArrowLeft, BookOpen, Plus, Search, X, Sparkles, Check,
  Pencil, Trash2, Settings,
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

// ── Manage Lists Modal ────────────────────────────────────

function ManageListsModal({ open, onClose, lists, onEdit, onDelete, onAdd }) {
  return (
    <Modal open={open} onClose={onClose} title="Manage Lists" size="sm">
      <div className="space-y-2 mb-4">
        {lists.map(list => {
          const color = getJournalListColor(list.color);
          return (
            <div key={list.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${color.dot}`} />
              <span className="flex-1 text-sm text-gray-900 font-medium">{list.name}</span>
              <button
                onClick={() => { onClose(); onEdit(list); }}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                title="Edit"
              >
                <Pencil size={14} />
              </button>
              {!list.isDefault && (
                <button
                  onClick={() => { onClose(); onDelete(list); }}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        onClick={() => { onClose(); onAdd(); }}
        className="btn-primary w-full text-sm flex items-center justify-center gap-1"
      >
        <Plus size={14} /> Add List
      </button>
    </Modal>
  );
}

// ── Main Journal Component (Tabbed View) ─────────────────

export default function Journal({ onBack, pickerMode, onPick, pickerSection }) {
  const { lists, loading: listsLoading, add: addList, update: updateList, remove: removeList } = useJournalLists();
  const { entries: allEntries } = useJournal(500);
  const [activeListId, setActiveListId] = useState(null);
  const [editingEntry, setEditingEntry] = useState(undefined); // undefined = not editing, null = new, object = existing
  const [listFormOpen, setListFormOpen] = useState(false);
  const [editingList, setEditingList] = useState(null);
  const [deleteConfirmList, setDeleteConfirmList] = useState(null);
  const [manageListsOpen, setManageListsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');

  // Ensure defaults exist on first load
  useEffect(() => {
    ensureDefaultJournalLists();
  }, []);

  // Auto-select first list (Scripture Study) when lists load
  useEffect(() => {
    if (!activeListId && lists.length > 0) {
      // Scripture Study is sortOrder 0, so it should be first
      setActiveListId(lists[0].id);
    }
  }, [lists, activeListId]);

  const activeList = lists.find(l => l.id === activeListId) || lists[0] || null;

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

  // Entry editor (full page)
  if (editingEntry !== undefined && activeList) {
    return (
      <JournalEntryEditor
        key={editingEntry?.id || 'new'}
        entry={editingEntry}
        list={activeList}
        onBack={() => setEditingEntry(undefined)}
      />
    );
  }

  async function handleSaveList(data) {
    if (editingList) {
      await updateList(editingList.id, data);
    } else {
      await addList(data);
    }
  }

  async function handleDeleteList(list) {
    const listEntries = allEntries.filter(e => e.listId === list.id);
    for (const entry of listEntries) {
      const { updateJournalEntry } = await import('../db');
      await updateJournalEntry(entry.id, { listId: null });
    }
    await removeList(list.id);
    // If we deleted the active list, switch to first available
    if (activeListId === list.id) {
      const remaining = lists.filter(l => l.id !== list.id);
      setActiveListId(remaining.length > 0 ? remaining[0].id : null);
    }
    setDeleteConfirmList(null);
  }

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary-600 mb-4">
          <ArrowLeft size={16} /> Back
        </button>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BookOpen size={24} className="text-primary-700" />
          <h1 className="text-2xl font-bold text-gray-900">Journal</h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setManageListsOpen(true)}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
            title="Manage lists"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      {/* Global search bar — searches across all lists */}
      {!listsLoading && lists.length > 0 && (
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={globalSearch}
            onChange={e => setGlobalSearch(e.target.value)}
            placeholder="Search all notes..."
            className="input-field pl-9 pr-8 w-full"
          />
          {globalSearch && (
            <button onClick={() => setGlobalSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X size={16} className="text-gray-400" />
            </button>
          )}
        </div>
      )}

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
      ) : globalSearch.trim() ? (
        /* Global search results across all lists */
        <GlobalSearchResults
          entries={allEntries}
          query={globalSearch}
          lists={lists}
          onOpenEntry={(entry) => {
            // Switch to the entry's list tab, then open it
            if (entry.listId) setActiveListId(entry.listId);
            setEditingEntry(entry);
          }}
        />
      ) : (
        <>
          {/* Tab pills — horizontal scrollable */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1 scrollbar-hide">
            {lists.map(list => {
              const color = getJournalListColor(list.color);
              const isActive = list.id === activeListId;
              return (
                <button
                  key={list.id}
                  onClick={() => { setActiveListId(list.id); setSearch(''); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                    isActive
                      ? `${color.active} shadow-sm`
                      : `${color.bg} ${color.text} hover:shadow-sm`
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-white/60' : color.dot}`} />
                  {list.name}
                </button>
              );
            })}
          </div>

          {/* Entries for active tab */}
          {activeList && (
            <ActiveListEntries
              list={activeList}
              search={search}
              setSearch={setSearch}
              onOpenEntry={(entry) => setEditingEntry(entry)}
            />
          )}
        </>
      )}

      {/* Manage Lists Modal */}
      <ManageListsModal
        open={manageListsOpen}
        onClose={() => setManageListsOpen(false)}
        lists={lists}
        onEdit={(list) => { setEditingList(list); setListFormOpen(true); }}
        onDelete={(list) => setDeleteConfirmList(list)}
        onAdd={() => { setEditingList(null); setListFormOpen(true); }}
      />

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

// ── Active List Entries (inline below tabs) ──────────────

function ActiveListEntries({ list, search, setSearch, onOpenEntry }) {
  const { entries, loading } = useJournalByList(list.id, 200);

  let filtered = entries;
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(e =>
      (e.title || '').toLowerCase().includes(q) ||
      (e.text || '').toLowerCase().includes(q) ||
      (e.tags && e.tags.some(t => t.toLowerCase().includes(q)))
    );
  }

  function getPreview(entry) {
    const text = entry.text || '';
    if (text.length <= 80) return text;
    return text.substring(0, 80) + '...';
  }

  return (
    <>
      {/* New Entry + Search row */}
      <div className="flex items-center gap-2 mb-4">
        {entries.length > 0 && (
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search entries..."
              className="input-field pl-9 pr-8 w-full"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X size={16} className="text-gray-400" />
              </button>
            )}
          </div>
        )}
        <button
          onClick={() => onOpenEntry(null)}
          className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg whitespace-nowrap flex-shrink-0"
        >
          <Plus size={16} /> New
        </button>
      </div>

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
        <div className="space-y-2">
          {filtered.map(entry => (
            <div
              key={entry.id}
              className="card cursor-pointer hover:border-primary-300 py-3"
              onClick={() => onOpenEntry(entry)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900 truncate">
                  {entry.title || 'Untitled'}
                </span>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {formatRelative(entry.date)}
                </span>
              </div>
              {entry.text && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-1">{getPreview(entry)}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Global Search Results (across all lists) ───────────────

function GlobalSearchResults({ entries, query, lists, onOpenEntry }) {
  const q = query.toLowerCase();
  const filtered = entries
    .filter(e =>
      (e.title || '').toLowerCase().includes(q) ||
      (e.text || '').toLowerCase().includes(q) ||
      (e.tags && e.tags.some(t => t.toLowerCase().includes(q)))
    )
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const listMap = {};
  for (const l of lists) listMap[l.id] = l;

  function getPreview(entry) {
    const text = entry.text || '';
    if (text.length <= 80) return text;
    return text.substring(0, 80) + '...';
  }

  if (filtered.length === 0) {
    return (
      <div className="card text-center text-gray-400 py-12">
        <Search size={40} className="mx-auto mb-3 text-gray-300" />
        <p className="text-sm">No entries matching &ldquo;{query}&rdquo;</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {filtered.map(entry => {
        const list = listMap[entry.listId];
        const color = list ? getJournalListColor(list.color) : null;
        return (
          <div
            key={entry.id}
            className="card cursor-pointer hover:border-primary-300 py-3"
            onClick={() => onOpenEntry(entry)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-gray-900 truncate">
                {entry.title || 'Untitled'}
              </span>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {formatRelative(entry.date)}
              </span>
            </div>
            {entry.text && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-1">{getPreview(entry)}</p>
            )}
            {list && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <div className={`w-2 h-2 rounded-full ${color?.dot || 'bg-gray-300'}`} />
                <span className="text-[10px] text-gray-400">{list.name}</span>
              </div>
            )}
          </div>
        );
      })}
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
