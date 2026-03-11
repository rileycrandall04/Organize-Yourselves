import { useState, useEffect, useRef, useCallback } from 'react';
import { addJournalEntry, updateJournalEntry, deleteJournalEntry, addTask } from '../db';
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

  // Tag-to-list state
  const [journalListPickerOpen, setJournalListPickerOpen] = useState(false);
  const [tagTitleModalOpen, setTagTitleModalOpen] = useState(false);
  const [tagTargetList, setTagTargetList] = useState(null);
  const [tagTitle, setTagTitle] = useState('');

  // Tag-to-meeting state
  const [meetingPickerOpen, setMeetingPickerOpen] = useState(false);

  // Shared tag state
  const [tagText, setTagText] = useState(''); // selected text to tag

  const latestBlocksRef = useRef(blocks);
  const entryIdRef = useRef(entryId); // Ref to prevent duplicate creation race condition
  const creatingRef = useRef(null); // Promise lock for entry creation
  const getSelectedTextRef = useRef(null);
  const handleGetSelectedTextRef = useCallback((fn) => { getSelectedTextRef.current = fn; }, []);
  const insertChipRef = useRef(null);
  const handleInsertRef = useCallback((fn) => { insertChipRef.current = fn; }, []);

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

  // ── Tag to another journal list ──────────────────────────
  function handleTagToList(selectedText) {
    setTagText(selectedText || '');
    setJournalListPickerOpen(true);
  }

  // Step 1: user picks a list → show title prompt
  function handleListPicked(targetList) {
    setTagTargetList(targetList);
    setJournalListPickerOpen(false);
    setTagTitle('');
    setTagTitleModalOpen(true);
  }

  // Step 2: user confirms title → create the entry
  async function handleTagTitleConfirm() {
    const text = tagText.trim() || htmlToPlainText(latestBlocksRef.current?.[0]?.html || '');
    if (!text || !tagTargetList) return;
    const html = text.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');
    await addJournalEntry({
      listId: tagTargetList.id,
      title: tagTitle.trim() || '',
      text: text.trim(),
      html,
      tags: [],
      sourceEntryId: entryId || null,
    });
    setTagTitleModalOpen(false);
    setTagTargetList(null);
    setTagTitle('');
    setTagText('');
  }

  // ── Tag to a meeting (creates journal_entry task + chip) ──
  function handleTagToMeeting(selectedText) {
    setTagText(selectedText || '');
    setMeetingPickerOpen(true);
  }

  async function handlePickMeeting(meeting) {
    const text = tagText.trim() || htmlToPlainText(latestBlocksRef.current?.[0]?.html || '');
    if (!text) return;

    // Create a journal_entry task with the text stored in journalText
    const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;
    const taskId = await addTask({
      type: 'journal_entry',
      types: ['journal_entry'],
      title: `Journal: ${preview}`,
      description: '',
      journalText: text.trim(),
      sourceEntryId: entryId || null,
      sourceListName: list?.name || '',
      meetingIds: [meeting.id],
      status: 'not_started',
      priority: 'low',
    });

    // Insert the chip into the current journal entry's editor
    if (insertChipRef.current) {
      insertChipRef.current(taskId);
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
        onInsertRef={handleInsertRef}
        onTagJournalList={readOnly ? undefined : handleTagToList}
        onTagMeeting={readOnly ? undefined : handleTagToMeeting}
      />

      {/* Journal list picker (tag text to another list) */}
      <JournalListPicker
        open={journalListPickerOpen}
        onClose={() => { setJournalListPickerOpen(false); setTagText(''); }}
        onSelect={handleListPicked}
        excludeIds={list?.id ? [list.id] : []}
        title="Tag to Journal List"
      />

      {/* Title prompt for new journal entry */}
      <Modal
        open={tagTitleModalOpen}
        onClose={() => { setTagTitleModalOpen(false); setTagTargetList(null); setTagText(''); }}
        title="New Entry Title"
        size="sm"
      >
        <div className="space-y-3">
          {tagText && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 max-h-24 overflow-y-auto whitespace-pre-wrap">
              {tagText.length > 200 ? tagText.substring(0, 200) + '...' : tagText}
            </div>
          )}
          <input
            type="text"
            value={tagTitle}
            onChange={e => setTagTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleTagTitleConfirm(); }}
            placeholder="Enter a title (optional)"
            className="input-field w-full"
            autoFocus
          />
          <div className="flex gap-3">
            <button onClick={handleTagTitleConfirm} className="btn-primary flex-1">
              Create Entry
            </button>
            <button
              onClick={() => { setTagTitleModalOpen(false); setTagTargetList(null); setTagText(''); }}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Meeting picker (tag text as journal_entry task) */}
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
