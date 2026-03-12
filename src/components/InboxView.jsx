import { useState } from 'react';
import { useInbox } from '../hooks/useDb';
import { addTask, addJournalEntry, getTask, getJournalEntry, getJournalEntries, getJournalLists, updateJournalEntry, addTaskFollowUpNote, getTasks } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatRelative } from '../utils/dates';
import Modal from './shared/Modal';
import TaskEditor from './shared/TaskEditor';
import JournalEntryEditor from './JournalEntryEditor';
import {
  Inbox, Plus, Send, CheckSquare, BookOpen, Trash2, X, ArrowRight,
  Search, Link2, ArrowLeft, FilePlus, FileText,
} from 'lucide-react';

export default function InboxView() {
  const { items, loading, add, markProcessed, remove } = useInbox();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [processItem, setProcessItem] = useState(null);
  const [processStep, setProcessStep] = useState('choose'); // 'choose' | 'pick-task' | 'journal-choose' | 'pick-note'
  const [taskSearch, setTaskSearch] = useState('');
  const [editingTask, setEditingTask] = useState(null);

  // Journal editor overlay state
  const [editingJournal, setEditingJournal] = useState(null); // { entry, list, lists }
  const [noteSearch, setNoteSearch] = useState('');
  const [journalNotes, setJournalNotes] = useState([]);
  const [journalLists, setJournalLists] = useState([]);

  // Active tasks for "Add to Existing Task" picker
  const activeTasks = useLiveQuery(() => getTasks({ excludeComplete: true }), []);
  const filteredTasks = (activeTasks ?? []).filter(t =>
    t.type !== 'individual' &&
    t.title.toLowerCase().includes(taskSearch.toLowerCase())
  );

  // Filtered journal notes for "Add to Existing Note" picker
  const filteredNotes = journalNotes.filter(n => {
    const q = noteSearch.toLowerCase();
    return (n.title || '').toLowerCase().includes(q) ||
           (n.text || '').toLowerCase().includes(q);
  });

  async function handleCapture(e) {
    e.preventDefault();
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      await add(text.trim());
      setText('');
    } finally {
      setSaving(false);
    }
  }

  async function handleConvertToAction(item) {
    const newId = await addTask({
      type: 'action_item',
      title: item.text,
      types: ['action_item'],
      status: 'not_started',
      priority: 'medium',
    });
    await markProcessed(item.id);
    setProcessItem(null);
    setProcessStep('choose');
    // Open TaskEditor for the new task
    const created = await getTask(newId);
    if (created) setEditingTask(created);
  }

  async function handleAddToExistingTask(item, targetTask) {
    await addTaskFollowUpNote(targetTask.id, {
      text: `[From inbox] ${item.text}`,
    });
    await markProcessed(item.id);
    setProcessItem(null);
    setProcessStep('choose');
    setTaskSearch('');
    // Open TaskEditor for the target task
    const refreshed = await getTask(targetTask.id);
    if (refreshed) setEditingTask(refreshed);
  }

  async function handleJournalStep() {
    // Load journal notes and lists for the picker
    const [notes, jLists] = await Promise.all([getJournalEntries(100), getJournalLists()]);
    setJournalNotes(notes);
    setJournalLists(jLists);
    setNoteSearch('');
    setProcessStep('journal-choose');
  }

  async function handleCreateNewNote(item) {
    const lists = journalLists;
    const defaultList = lists[0] || null;
    const newId = await addJournalEntry({
      listId: defaultList?.id || null,
      title: '',
      text: item.text,
      html: `<p>${item.text.replace(/\n/g, '</p><p>')}</p>`,
      tags: [],
    });
    await markProcessed(item.id);
    setProcessItem(null);
    setProcessStep('choose');
    // Open the entry in the journal editor
    const created = await getJournalEntry(newId);
    if (created) {
      const entryList = lists.find(l => l.id === created.listId) || defaultList;
      setEditingJournal({ entry: created, list: entryList, lists });
    }
  }

  async function handleAddToExistingNote(item, note) {
    // Append the inbox text to the existing note's content
    const separator = note.html ? '<hr><p></p>' : '\n---\n';
    const inboxHtml = `<p>${item.text.replace(/\n/g, '</p><p>')}</p>`;
    const updatedHtml = (note.html || '') + separator + inboxHtml;
    const updatedText = (note.text || '') + '\n---\n' + item.text;
    await updateJournalEntry(note.id, { html: updatedHtml, text: updatedText });
    await markProcessed(item.id);
    setProcessItem(null);
    setProcessStep('choose');
    setNoteSearch('');
    // Open the updated entry in the journal editor
    const refreshed = await getJournalEntry(note.id);
    if (refreshed) {
      const lists = journalLists;
      const noteList = lists.find(l => l.id === refreshed.listId) || lists[0] || null;
      setEditingJournal({ entry: refreshed, list: noteList, lists });
    }
  }

  async function handleDiscard(item) {
    await remove(item.id);
    setProcessItem(null);
    setProcessStep('choose');
  }

  function openProcessModal(item) {
    setProcessStep('choose');
    setTaskSearch('');
    setNoteSearch('');
    setProcessItem(item);
  }

  function closeProcessModal() {
    setProcessItem(null);
    setProcessStep('choose');
    setTaskSearch('');
    setNoteSearch('');
  }

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Inbox size={24} className="text-primary-700" />
          <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
        </div>
        {items.length > 0 && (
          <span className="text-sm text-gray-400">{items.length} item{items.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Quick capture */}
      <form onSubmit={handleCapture} className="mb-5">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Capture a thought, idea, or task..."
              className="input-field pr-10"
              autoFocus
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
        <p className="text-xs text-gray-400 mt-1.5">Get it out of your head. Process it later.</p>
      </form>

      {/* Inbox items */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <div className="animate-spin w-6 h-6 border-2 border-primary-300 border-t-primary-700 rounded-full mx-auto mb-3" />
          <p className="text-sm">Loading...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          <Inbox size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">Inbox zero. Nice work!</p>
          <p className="text-xs mt-1.5 text-gray-300">Capture thoughts above. Process them when you're ready.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <InboxItem
              key={item.id}
              item={item}
              onProcess={() => openProcessModal(item)}
            />
          ))}
        </div>
      )}

      {/* Process modal */}
      <Modal
        open={!!processItem}
        onClose={closeProcessModal}
        title="Process Item"
        size="sm"
      >
        {/* Step 1: Choose action */}
        {processItem && processStep === 'choose' && (
          <div>
            <div className="card bg-gray-50 mb-4">
              <p className="text-sm text-gray-800">{processItem.text}</p>
              <p className="text-xs text-gray-400 mt-1">{formatRelative(processItem.createdAt)}</p>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => handleConvertToAction(processItem)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-gray-200 hover:bg-primary-50 hover:border-primary-200 transition-colors text-left"
              >
                <CheckSquare size={18} className="text-primary-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Convert to New Task</p>
                  <p className="text-xs text-gray-500">Create a new action item from this</p>
                </div>
              </button>

              <button
                onClick={() => setProcessStep('pick-task')}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-gray-200 hover:bg-blue-50 hover:border-blue-200 transition-colors text-left"
              >
                <Link2 size={18} className="text-blue-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Add to Existing Task</p>
                  <p className="text-xs text-gray-500">Attach as a follow-up note on an active task</p>
                </div>
              </button>

              <button
                onClick={() => handleJournalStep()}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-gray-200 hover:bg-purple-50 hover:border-purple-200 transition-colors text-left"
              >
                <BookOpen size={18} className="text-purple-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Save to Journal</p>
                  <p className="text-xs text-gray-500">Create a new note or add to an existing one</p>
                </div>
              </button>

              <button
                onClick={() => handleDiscard(processItem)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-gray-200 hover:bg-red-50 hover:border-red-200 transition-colors text-left"
              >
                <Trash2 size={18} className="text-red-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Discard</p>
                  <p className="text-xs text-gray-500">Remove from inbox</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Step 2a: Journal — choose new or existing */}
        {processItem && processStep === 'journal-choose' && (
          <div>
            <button
              onClick={() => setProcessStep('choose')}
              className="text-xs text-primary-600 hover:text-primary-800 mb-3 flex items-center gap-1"
            >
              <ArrowLeft size={12} /> Back
            </button>

            <div className="card bg-gray-50 mb-4">
              <p className="text-xs text-gray-600 line-clamp-2">{processItem.text}</p>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => handleCreateNewNote(processItem)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-gray-200 hover:bg-purple-50 hover:border-purple-200 transition-colors text-left"
              >
                <FilePlus size={18} className="text-purple-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Create New Note</p>
                  <p className="text-xs text-gray-500">Start a new journal entry with this text</p>
                </div>
              </button>

              <button
                onClick={() => setProcessStep('pick-note')}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-gray-200 hover:bg-purple-50 hover:border-purple-200 transition-colors text-left"
              >
                <FileText size={18} className="text-purple-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Add to Existing Note</p>
                  <p className="text-xs text-gray-500">Append this text to a journal entry</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Step 2b: Pick existing journal note */}
        {processItem && processStep === 'pick-note' && (
          <div>
            <button
              onClick={() => setProcessStep('journal-choose')}
              className="text-xs text-primary-600 hover:text-primary-800 mb-3 flex items-center gap-1"
            >
              <ArrowLeft size={12} /> Back
            </button>

            <div className="card bg-gray-50 mb-3">
              <p className="text-xs text-gray-600 line-clamp-2">{processItem.text}</p>
            </div>

            {/* Search input */}
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
              <input
                type="text"
                value={noteSearch}
                onChange={e => setNoteSearch(e.target.value)}
                placeholder="Search journal notes..."
                className="input-field pl-9"
                autoFocus
              />
            </div>

            {/* Notes list */}
            <div className="space-y-1 max-h-[40vh] overflow-y-auto">
              {filteredNotes.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">
                  {noteSearch ? 'No matching notes found.' : 'No journal notes yet.'}
                </p>
              ) : (
                filteredNotes.slice(0, 20).map(note => {
                  const noteList = journalLists.find(l => l.id === note.listId);
                  return (
                    <button
                      key={note.id}
                      onClick={() => handleAddToExistingNote(processItem, note)}
                      className="w-full text-left px-3 py-2.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-700 hover:border-purple-200 hover:bg-purple-50 transition-colors"
                    >
                      <span className="font-medium truncate block">{note.title || 'Untitled'}</span>
                      <span className="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5">
                        {noteList && <span className="text-purple-500">{noteList.name}</span>}
                        {note.text && <span className="truncate max-w-[200px]">{note.text.slice(0, 60)}</span>}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Step 2c: Pick existing task */}
        {processItem && processStep === 'pick-task' && (
          <div>
            <button
              onClick={() => setProcessStep('choose')}
              className="text-xs text-primary-600 hover:text-primary-800 mb-3 flex items-center gap-1"
            >
              <ArrowLeft size={12} /> Back
            </button>

            <div className="card bg-gray-50 mb-3">
              <p className="text-xs text-gray-600 line-clamp-2">{processItem.text}</p>
            </div>

            {/* Search input */}
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
              <input
                type="text"
                value={taskSearch}
                onChange={e => setTaskSearch(e.target.value)}
                placeholder="Search active tasks..."
                className="input-field pl-9"
                autoFocus
              />
            </div>

            {/* Task list */}
            <div className="space-y-1 max-h-[40vh] overflow-y-auto">
              {filteredTasks.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">
                  {taskSearch ? 'No matching tasks found.' : 'No active tasks.'}
                </p>
              ) : (
                filteredTasks.slice(0, 20).map(task => (
                  <button
                    key={task.id}
                    onClick={() => handleAddToExistingTask(processItem, task)}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:bg-blue-50 transition-colors flex items-center gap-2"
                  >
                    <CheckSquare size={14} className="text-gray-400 flex-shrink-0" />
                    <span className="flex-1 truncate">{task.title}</span>
                    {task.priority === 'high' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 font-medium flex-shrink-0">
                        High
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* TaskEditor overlay for post-processing editing */}
      {editingTask && (
        <TaskEditor
          task={editingTask}
          onClose={() => setEditingTask(null)}
        />
      )}

      {/* JournalEntryEditor overlay for post-processing editing */}
      {editingJournal && (
        <div className="fixed inset-0 z-50 bg-white overflow-auto">
          <JournalEntryEditor
            key={editingJournal.entry?.id || 'new'}
            entry={editingJournal.entry}
            list={editingJournal.list}
            lists={editingJournal.lists}
            onBack={() => setEditingJournal(null)}
            onSwitchList={() => setEditingJournal(null)}
          />
        </div>
      )}
    </div>
  );
}

function InboxItem({ item, onProcess }) {
  return (
    <div
      onClick={onProcess}
      className="card flex items-start gap-3 cursor-pointer hover:border-primary-200 transition-colors"
    >
      <div className="p-1.5 rounded-lg bg-purple-50 mt-0.5">
        <Inbox size={14} className="text-purple-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900">{item.text}</p>
        <p className="text-xs text-gray-400 mt-1">{formatRelative(item.createdAt)}</p>
      </div>
      <ArrowRight size={14} className="text-gray-300 mt-1 flex-shrink-0" />
    </div>
  );
}
