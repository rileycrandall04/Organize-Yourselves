import { useState, useEffect, useRef, useCallback } from 'react';
import { addJournalEntry, updateJournalEntry, deleteJournalEntry, getJournalEntry } from '../db';
import { getJournalListColor } from '../utils/constants';
import { formatFull } from '../utils/dates';
import { htmlToPlainText } from './shared/RichTextEditor';
import BlockEditor from './BlockEditor';
import Modal from './shared/Modal';
import { ArrowLeft, Trash2 } from 'lucide-react';

/**
 * JournalEntryEditor — Full-page rich text editor for a journal entry.
 *
 * Props:
 *   entry     — existing entry object to edit, or null for new entry
 *   list      — the journal list this entry belongs to
 *   onBack    — callback to navigate back
 *   readOnly  — if true, disable editing (for viewing from meeting review)
 */
export default function JournalEntryEditor({ entry, list, onBack, readOnly = false }) {
  const [entryId, setEntryId] = useState(entry?.id || null);
  const [blocks, setBlocks] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const hasInitialized = useRef(false);
  const latestBlocksRef = useRef(blocks);

  const color = getJournalListColor(list?.color);

  // Initialize blocks from entry
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    if (entry?.html) {
      setBlocks([{ id: 'j1', type: 'richtext', html: entry.html }]);
    } else if (entry?.text) {
      // Legacy plain text — wrap in paragraph
      const html = entry.text.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');
      setBlocks([{ id: 'j1', type: 'richtext', html }]);
    } else {
      setBlocks([{ id: 'j1', type: 'richtext', html: '<p></p>' }]);
    }
  }, [entry]);

  // Keep ref in sync
  useEffect(() => {
    latestBlocksRef.current = blocks;
  }, [blocks]);

  // Create entry on first edit if new
  const ensureEntry = useCallback(async (html) => {
    if (entryId) return entryId;
    const text = htmlToPlainText(html);
    if (!text.trim()) return null;
    const id = await addJournalEntry({
      listId: list.id,
      html,
      text,
    });
    setEntryId(id);
    return id;
  }, [entryId, list?.id]);

  // Save handler (called by BlockEditor auto-save)
  const handleSave = useCallback(async (newBlocks) => {
    const html = newBlocks?.[0]?.html || '';
    const text = htmlToPlainText(html);

    if (entryId) {
      await updateJournalEntry(entryId, { html, text });
    } else if (text.trim()) {
      await ensureEntry(html);
    }
  }, [entryId, ensureEntry]);

  // Change handler
  const handleChange = useCallback((newBlocks) => {
    setBlocks(newBlocks);
    // Auto-create entry if this is a new entry and user typed something
    if (!entryId) {
      const html = newBlocks?.[0]?.html || '';
      const text = htmlToPlainText(html);
      if (text.trim()) {
        ensureEntry(html);
      }
    }
  }, [entryId, ensureEntry]);

  async function handleDelete() {
    if (!entryId || deleting) return;
    setDeleting(true);
    try {
      await deleteJournalEntry(entryId);
      onBack();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      {/* Header */}
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary-600 mb-4">
        <ArrowLeft size={16} />
        {readOnly ? 'Back' : 'Back to List'}
      </button>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${color.dot}`} />
          <h1 className="text-lg font-bold text-gray-900">{list?.name || 'Journal Entry'}</h1>
        </div>
        <div className="flex items-center gap-2">
          {entry?.date && (
            <span className="text-xs text-gray-400">{formatFull(entry.date)}</span>
          )}
          {entryId && !readOnly && (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="p-1.5 text-gray-400 hover:text-red-500 rounded"
              title="Delete entry"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Block Editor */}
      <BlockEditor
        blocks={blocks}
        onChange={handleChange}
        onSave={handleSave}
        meetingId={null}
        instanceId={null}
        disabled={readOnly}
        finalized={readOnly}
        mode="journal"
        journalEntryId={entryId}
        journalListId={list?.id}
      />

      {/* Delete confirmation */}
      <Modal open={deleteConfirm} onClose={() => setDeleteConfirm(false)} title="Delete Entry" size="sm">
        <p className="text-sm text-gray-600 mb-4">Delete this journal entry? This cannot be undone.</p>
        <div className="flex gap-3">
          <button onClick={handleDelete} disabled={deleting} className="btn-danger flex-1">
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
          <button onClick={() => setDeleteConfirm(false)} className="btn-secondary flex-1">Cancel</button>
        </div>
      </Modal>
    </div>
  );
}
