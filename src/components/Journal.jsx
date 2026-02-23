import { useState } from 'react';
import { useJournal } from '../hooks/useDb';
import { formatFull, formatRelative } from '../utils/dates';
import Modal from './shared/Modal';
import {
  ArrowLeft, BookOpen, Plus, Search, X, Sparkles,
} from 'lucide-react';

export default function Journal({ onBack }) {
  const { entries, loading, add } = useJournal(100);
  const [search, setSearch] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [newText, setNewText] = useState('');
  const [newTags, setNewTags] = useState('');
  const [saving, setSaving] = useState(false);

  // Filter by search
  const filtered = search.trim()
    ? entries.filter(e => {
        const q = search.toLowerCase();
        return e.text.toLowerCase().includes(q) ||
          (e.tags && e.tags.some(t => t.toLowerCase().includes(q)));
      })
    : entries;

  async function handleSave() {
    if (!newText.trim() || saving) return;
    setSaving(true);
    try {
      const tags = newTags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);
      await add({
        text: newText.trim(),
        tags: tags.length > 0 ? tags : undefined,
      });
      setNewText('');
      setNewTags('');
      setComposeOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      {/* Header */}
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary-600 mb-4">
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <BookOpen size={24} className="text-primary-700" />
          <h1 className="text-2xl font-bold text-gray-900">Journal</h1>
        </div>
        <button
          onClick={() => setComposeOpen(true)}
          className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-800"
        >
          <Plus size={16} />
          New Entry
        </button>
      </div>

      <p className="text-xs text-gray-400 mb-4">Private spiritual impressions. Never shared, even in future multi-user mode.</p>

      {/* Search */}
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

      {/* Entries */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <div className="animate-spin w-6 h-6 border-2 border-primary-300 border-t-primary-700 rounded-full mx-auto mb-3" />
          <p className="text-sm">Loading...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          <Sparkles size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">
            {search ? `No entries matching "${search}"` : 'No journal entries yet.'}
          </p>
          {!search && (
            <button
              onClick={() => setComposeOpen(true)}
              className="btn-primary mt-3 text-sm"
            >
              <Plus size={14} className="inline mr-1" />
              Write Your First Entry
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(entry => (
            <div key={entry.id} className="card">
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{entry.text}</p>
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

      {/* Compose modal */}
      <Modal open={composeOpen} onClose={() => setComposeOpen(false)} title="New Journal Entry" size="lg">
        <div className="space-y-4">
          <div>
            <textarea
              value={newText}
              onChange={e => setNewText(e.target.value)}
              placeholder="Write your thoughts, impressions, or spiritual experiences..."
              rows={6}
              className="input-field"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags (optional)</label>
            <input
              type="text"
              value={newTags}
              onChange={e => setNewTags(e.target.value)}
              placeholder="e.g., testimony, prompting, gratitude (comma-separated)"
              className="input-field"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={!newText.trim() || saving}
              className="btn-primary flex-1"
            >
              {saving ? 'Saving...' : 'Save Entry'}
            </button>
            <button onClick={() => setComposeOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
