import { useState, useEffect, useRef, useCallback } from 'react';
import { addJournalEntry, updateJournalEntry, deleteJournalEntry, addJournalMeetingTag } from '../db';
import { getJournalListColor } from '../utils/constants';
import { formatFull } from '../utils/dates';
import { htmlToPlainText } from './shared/RichTextEditor';
import BlockEditor from './BlockEditor';
import JournalListPicker from './shared/JournalListPicker';
import MeetingPicker from './shared/MeetingPicker';
import Modal from './shared/Modal';
import { ArrowLeft, Trash2, Save, CheckCircle2 } from 'lucide-react';

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
  const [title, setTitle] = useState(entry?.title || '');
  // Initialize blocks synchronously so BlockEditor sees them on the first render.
  // (Using useEffect would delay initialization until after the first render,
  //  causing BlockEditor's useMemo to see an empty array and init TipTap blank.)
  const [blocks, setBlocks] = useState(() => {
    if (entry?.html) {
      return [{ id: 'j1', type: 'richtext', html: entry.html }];
    } else if (entry?.text) {
      const html = entry.text.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');
      return [{ id: 'j1', type: 'richtext', html }];
    }
    return [{ id: 'j1', type: 'richtext', html: '<p></p>' }];
  });
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [journalListPickerOpen, setJournalListPickerOpen] = useState(false);
  const [meetingPickerOpen, setMeetingPickerOpen] = useState(false);
  const [tagText, setTagText] = useState(''); // selected text to tag
  const latestBlocksRef = useRef(blocks);
  const entryIdRef = useRef(entryId); // Ref to prevent duplicate creation race condition
  const creatingRef = useRef(null); // Promise lock for entry creation
  const getSelectedTextRef = useRef(null);
  const handleGetSelectedTextRef = useCallback((fn) => { getSelectedTextRef.current = fn; }, []);

  const color = getJournalListColor(list?.color);

  // Keep entryId ref in sync
  useEffect(() => {
    entryIdRef.current = entryId;
  }, [entryId]);

  // Keep ref in sync
  useEffect(() => {
    latestBlocksRef.current = blocks;
  }, [blocks]);

  // Create entry on first edit if new — uses ref + promise lock to prevent duplicates
  const ensureEntry = useCallback(async (html) => {
    // Already have an ID (via state or ref)
    if (entryIdRef.current) return entryIdRef.current;

    // Already creating — wait for that to finish
    if (creatingRef.current) return creatingRef.current;

    const text = htmlToPlainText(html);
    if (!text.trim()) return null;

    // Lock: store the creation promise
    creatingRef.current = (async () => {
      const id = await addJournalEntry({
        listId: list.id,
        title: title.trim() || '',
        html,
        text,
      });
      entryIdRef.current = id;
      setEntryId(id);
      creatingRef.current = null;
      return id;
    })();

    return creatingRef.current;
  }, [list?.id, title]);

  // Save handler (called by BlockEditor auto-save or manual Save button)
  const handleSave = useCallback(async (newBlocks) => {
    const html = newBlocks?.[0]?.html || '';
    const text = htmlToPlainText(html);

    const currentId = entryIdRef.current;
    if (currentId) {
      await updateJournalEntry(currentId, { html, text, title: title.trim() || '' });
    } else if (text.trim()) {
      await ensureEntry(html);
    }
  }, [ensureEntry, title]);

  // Manual save (Save button) — saves and navigates back
  const handleManualSave = useCallback(async () => {
    const currentBlocks = latestBlocksRef.current;
    await handleSave(currentBlocks);
    onBack();
  }, [handleSave, onBack]);

  // Change handler
  const handleChange = useCallback((newBlocks) => {
    setBlocks(newBlocks);
  }, []);

  // Save title when it changes (debounced via auto-save)
  const handleTitleBlur = useCallback(async () => {
    const currentId = entryIdRef.current;
    if (currentId) {
      await updateJournalEntry(currentId, { title: title.trim() || '' });
    }
  }, [title]);

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

  // Tag selected text to another journal list
  function handleTagToList(selectedText) {
    setTagText(selectedText || '');
    setJournalListPickerOpen(true);
  }

  async function handlePickJournalList(targetList) {
    const text = tagText.trim() || htmlToPlainText(latestBlocksRef.current?.[0]?.html || '');
    if (!text) return;
    const html = text.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');
    await addJournalEntry({
      listId: targetList.id,
      title: '',
      text: text.trim(),
      html,
      tags: [],
      sourceEntryId: entryId || null,
    });
    setJournalListPickerOpen(false);
    setTagText('');
  }

  // Tag selected text to a meeting
  function handleTagToMeeting(selectedText) {
    setTagText(selectedText || '');
    setMeetingPickerOpen(true);
  }

  async function handlePickMeeting(meeting) {
    const text = tagText.trim() || htmlToPlainText(latestBlocksRef.current?.[0]?.html || '');
    if (!text) return;
    // Ensure the entry is saved first so we have an ID
    const currentId = entryIdRef.current || await ensureEntry(latestBlocksRef.current?.[0]?.html || '');
    if (currentId) {
      await addJournalMeetingTag({
        journalEntryId: currentId,
        targetMeetingId: meeting.id,
        text: text.trim(),
      });
    }
    setMeetingPickerOpen(false);
    setTagText('');
  }

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary-600">
          <ArrowLeft size={16} />
          {readOnly ? 'Back' : 'Back to List'}
        </button>
        <div className="flex items-center gap-2">
          {/* Save button */}
          {!readOnly && (
            <button
              onClick={handleManualSave}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                saveFlash
                  ? 'bg-green-50 text-green-600 border border-green-200'
                  : 'bg-primary-50 text-primary-600 hover:bg-primary-100 border border-primary-200'
              }`}
            >
              {saveFlash ? (
                <>
                  <CheckCircle2 size={14} />
                  Saved
                </>
              ) : (
                <>
                  <Save size={14} />
                  Save
                </>
              )}
            </button>
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

      {/* Title field */}
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${color.dot}`} />
        <span className="text-xs text-gray-400">{list?.name}</span>
        {entry?.date && (
          <span className="text-xs text-gray-400 ml-auto">{formatFull(entry.date)}</span>
        )}
      </div>
      {!readOnly ? (
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          placeholder="Untitled"
          className="w-full text-lg font-bold text-gray-900 placeholder-gray-300 border-none outline-none bg-transparent mb-3 px-0"
        />
      ) : (
        <h1 className="text-lg font-bold text-gray-900 mb-3">{title || 'Untitled'}</h1>
      )}

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
        autoSaveMs={5000}
        onGetSelectedTextRef={handleGetSelectedTextRef}
        onTagJournalList={readOnly ? undefined : handleTagToList}
        onTagMeeting={readOnly ? undefined : handleTagToMeeting}
      />

      {/* Journal list picker (tag text to another list) */}
      <JournalListPicker
        open={journalListPickerOpen}
        onClose={() => { setJournalListPickerOpen(false); setTagText(''); }}
        onSelect={handlePickJournalList}
        excludeIds={list?.id ? [list.id] : []}
        title="Tag to Journal List"
      />

      {/* Meeting picker (tag text to a meeting) */}
      <MeetingPicker
        open={meetingPickerOpen}
        onClose={() => { setMeetingPickerOpen(false); setTagText(''); }}
        onSelect={handlePickMeeting}
        title="Tag to Meeting"
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
