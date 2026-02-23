import { useState } from 'react';
import { useInbox } from '../hooks/useDb';
import { addActionItem, addJournalEntry } from '../db';
import { formatRelative } from '../utils/dates';
import Modal from './shared/Modal';
import {
  Inbox, Plus, Send, CheckSquare, BookOpen, Trash2, X, ArrowRight,
} from 'lucide-react';

export default function InboxView() {
  const { items, loading, add, markProcessed, remove } = useInbox();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [processItem, setProcessItem] = useState(null);

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
    await addActionItem({ title: item.text });
    await markProcessed(item.id);
    setProcessItem(null);
  }

  async function handleConvertToJournal(item) {
    await addJournalEntry({ text: item.text });
    await markProcessed(item.id);
    setProcessItem(null);
  }

  async function handleDiscard(item) {
    await remove(item.id);
    setProcessItem(null);
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
              onProcess={() => setProcessItem(item)}
            />
          ))}
        </div>
      )}

      {/* Process modal */}
      <Modal
        open={!!processItem}
        onClose={() => setProcessItem(null)}
        title="Process Item"
        size="sm"
      >
        {processItem && (
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
                  <p className="text-sm font-medium text-gray-900">Convert to Action Item</p>
                  <p className="text-xs text-gray-500">Add to your action items list</p>
                </div>
              </button>

              <button
                onClick={() => handleConvertToJournal(processItem)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-gray-200 hover:bg-purple-50 hover:border-purple-200 transition-colors text-left"
              >
                <BookOpen size={18} className="text-purple-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Save to Journal</p>
                  <p className="text-xs text-gray-500">Move to your spiritual impressions journal</p>
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
      </Modal>
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
