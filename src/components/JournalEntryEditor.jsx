import { useState, useEffect, useRef, useCallback } from 'react';
import { addJournalEntry, updateJournalEntry, deleteJournalEntry, addTask, getAllJournalTags, addJournalEntryToList, removeJournalEntryFromList } from '../db';
// Color constants no longer needed — notebook theme uses stone palette
import { formatFull } from '../utils/dates';
import { htmlToPlainText } from './shared/RichTextEditor';
import BlockEditor from './BlockEditor';
import JournalListPicker from './shared/JournalListPicker';
import MeetingPicker from './shared/MeetingPicker';
import Modal from './shared/Modal';
import { ArrowLeft, Trash2, Save, CheckCircle2, ChevronLeft, ChevronRight, FolderOpen, Tag, X } from 'lucide-react';

/**
 * JournalEntryEditor — Full-page rich text editor for a journal entry.
 *
 * Props:
 *   entry        — existing entry object to edit, or null for new entry
 *   list         — the journal list this entry belongs to
 *   lists        — all journal lists (for list navigation)
 *   onBack       — callback to navigate back
 *   onSwitchList — callback to switch to another list (auto-saves first)
 *   readOnly     — if true, disable editing (for viewing from meeting review)
 */
export default function JournalEntryEditor({ entry, list, lists = [], onBack, onSwitchList, readOnly = false }) {
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
  const [movePickerOpen, setMovePickerOpen] = useState(false);
  const [overrideListId, setOverrideListId] = useState(null);
  // Multi-list state
  const [addListPickerOpen, setAddListPickerOpen] = useState(false);
  const [assignedListIds, setAssignedListIds] = useState(() => {
    if (entry?.listIds?.length) return [...entry.listIds];
    if (entry?.listId) return [entry.listId];
    if (list?.id) return [list.id];
    return [];
  });

  // Tag-to-list state
  const [journalListPickerOpen, setJournalListPickerOpen] = useState(false);
  const [tagTitleModalOpen, setTagTitleModalOpen] = useState(false);
  const [tagCreatedEntryId, setTagCreatedEntryId] = useState(null); // ID of just-created entry
  const [tagTitle, setTagTitle] = useState('');

  // Tag-to-meeting state
  const [meetingPickerOpen, setMeetingPickerOpen] = useState(false);

  // Shared tag state
  const [tagText, setTagText] = useState(''); // selected text to tag
  const [tagHtml, setTagHtml] = useState(''); // full editor HTML captured at click time

  // Topic tags state
  const [topicTags, setTopicTags] = useState(entry?.tags || []);
  const [topicTagInput, setTopicTagInput] = useState('');
  const [allKnownTags, setAllKnownTags] = useState([]);
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);

  const latestBlocksRef = useRef(blocks);
  const entryIdRef = useRef(entryId); // Ref to prevent duplicate creation race condition
  const creatingRef = useRef(null); // Promise lock for entry creation
  const getSelectedTextRef = useRef(null);
  const handleGetSelectedTextRef = useCallback((fn) => { getSelectedTextRef.current = fn; }, []);
  const insertChipRef = useRef(null);
  const handleInsertRef = useCallback((fn) => { insertChipRef.current = fn; }, []);
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  // Display list — tracks moves within this session
  const displayList = overrideListId !== null
    ? lists.find(l => l.id === overrideListId) || { id: null, name: 'All' }
    : list;

  // List navigation helpers
  const currentListIdx = lists.findIndex(l => l.id === list?.id);
  const prevList = currentListIdx > 0 ? lists[currentListIdx - 1] : null;
  const nextList = currentListIdx >= 0 && currentListIdx < lists.length - 1 ? lists[currentListIdx + 1] : null;

  // Keep entryId ref in sync
  useEffect(() => {
    entryIdRef.current = entryId;
  }, [entryId]);

  // Measure sticky header height for formatting toolbar offset
  useEffect(() => {
    if (!headerRef.current) return;
    const ro = new ResizeObserver(() => setHeaderHeight(headerRef.current.offsetHeight));
    ro.observe(headerRef.current);
    return () => ro.disconnect();
  }, []);

  // Load all previously used tags for autocomplete
  useEffect(() => {
    getAllJournalTags().then(setAllKnownTags);
  }, []);

  // Computed tag suggestions
  const tagSuggestions = topicTagInput.trim()
    ? allKnownTags.filter(t =>
        t.toLowerCase().includes(topicTagInput.toLowerCase()) &&
        !topicTags.includes(t)
      ).slice(0, 5)
    : [];

  // NOTE: latestBlocksRef is updated synchronously in handleChange (below)
  // so that handleSaveAndBack always reads the latest editor content,
  // even if React hasn't re-rendered yet (fixes save-erases-changes bug).

  // Create entry on first edit if new — uses ref + promise lock to prevent duplicates
  const ensureEntry = useCallback(async (html) => {
    // Already have an ID (via state or ref)
    if (entryIdRef.current) return entryIdRef.current;

    // Already creating — wait for that to finish
    if (creatingRef.current) return creatingRef.current;

    const text = htmlToPlainText(html);
    if (!text.trim() && !title.trim()) return null; // Allow creation with just a title

    // Lock: store the creation promise
    creatingRef.current = (async () => {
      const id = await addJournalEntry({
        listId: assignedListIds[0] || list?.id || null,
        listIds: assignedListIds.length ? assignedListIds : (list?.id ? [list.id] : []),
        title: title.trim() || '',
        html,
        text,
        tags: topicTags,
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
    } else if (text.trim() || title.trim()) {
      await ensureEntry(html);
    }
  }, [ensureEntry, title]);

  // Auto-save + navigate back (used by both Save button and Back button)
  const handleSaveAndBack = useCallback(async () => {
    const currentBlocks = latestBlocksRef.current;
    await handleSave(currentBlocks);
    onBack();
  }, [handleSave, onBack]);

  // Auto-save + navigate to another list
  const handleSwitchList = useCallback(async (targetList) => {
    if (!onSwitchList) return;
    // Auto-save current entry before switching
    const currentBlocks = latestBlocksRef.current;
    await handleSave(currentBlocks);
    onSwitchList(targetList.id);
  }, [handleSave, onSwitchList]);

  // Change handler — updates ref synchronously so handleSaveAndBack always
  // has the latest content, even if the user clicks Save/Back before React re-renders.
  const handleChange = useCallback((newBlocks) => {
    latestBlocksRef.current = newBlocks;
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

  // ── Topic tag handlers ─────────────────────────────────────
  function handleAddTopicTag(tagText) {
    const trimmed = tagText.trim();
    if (!trimmed || topicTags.includes(trimmed)) return;
    const newTags = [...topicTags, trimmed];
    setTopicTags(newTags);
    setTopicTagInput('');
    setShowTagSuggestions(false);
    // Persist immediately if entry exists
    const currentId = entryIdRef.current;
    if (currentId) updateJournalEntry(currentId, { tags: newTags });
    // Add to known tags if new
    if (!allKnownTags.includes(trimmed)) setAllKnownTags(prev => [...prev, trimmed].sort());
  }

  function handleRemoveTopicTag(tag) {
    const newTags = topicTags.filter(t => t !== tag);
    setTopicTags(newTags);
    const currentId = entryIdRef.current;
    if (currentId) updateJournalEntry(currentId, { tags: newTags });
  }

  // ── Move entry to a different list ─────────────────────────
  async function handleMoveToList(targetList) {
    setMovePickerOpen(false);
    const currentId = entryIdRef.current;
    if (!currentId || targetList.id === (overrideListId || list?.id)) return;
    await updateJournalEntry(currentId, { listId: targetList.id });
    setOverrideListId(targetList.id);
  }

  // ── Multi-list: add entry to another list ─────────────────
  async function handleAddToList(targetList) {
    setAddListPickerOpen(false);
    if (assignedListIds.includes(targetList.id)) return;
    const newIds = [...assignedListIds, targetList.id];
    setAssignedListIds(newIds);
    const currentId = entryIdRef.current;
    if (currentId) {
      await addJournalEntryToList(currentId, targetList.id);
    }
  }

  // ── Multi-list: remove entry from a list ──────────────────
  async function handleRemoveFromList(listId) {
    if (assignedListIds.length <= 1) return; // keep at least one
    const newIds = assignedListIds.filter(id => id !== listId);
    setAssignedListIds(newIds);
    const currentId = entryIdRef.current;
    if (currentId) {
      await removeJournalEntryFromList(currentId, listId);
    }
  }

  // ── Tag to another journal list ──────────────────────────
  // Now receives (selectedText, fullHtml) from BlockEditor
  function handleTagToList(selectedText, fullHtml) {
    setTagText(selectedText || '');
    setTagHtml(fullHtml || ''); // Capture current editor HTML at click time
    setJournalListPickerOpen(true);
  }

  // Step 1: user picks a list → create entry immediately, then offer title update
  async function handleListPicked(targetList) {
    setJournalListPickerOpen(false);

    let text, html;
    if (tagText.trim()) {
      // Selected text — create from plain text (strip any task markers)
      text = tagText.trim().replace(/\{\{task:\d+\}\}/g, '').replace(/\s{2,}/g, ' ').trim();
      if (!text) { setTagText(''); setTagHtml(''); return; }
      html = text.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');
    } else {
      // Full note — use the raw HTML captured at click time (preserves task chips)
      html = tagHtml || latestBlocksRef.current?.[0]?.html || '';
      text = htmlToPlainText(html).replace(/\{\{task:\d+\}\}/g, '').replace(/\s{2,}/g, ' ').trim();
      if (!text && !html) { setTagText(''); setTagHtml(''); return; }
    }

    // Create entry immediately (untitled)
    const newId = await addJournalEntry({
      listId: targetList.id,
      title: '',
      text: text.trim(),
      html,
      tags: [],
      sourceEntryId: entryId || null,
    });

    // Show title modal so user can optionally add a title
    setTagCreatedEntryId(newId);
    setTagTitle('');
    setTagText('');
    setTagHtml('');
    setTagTitleModalOpen(true);
  }

  // Step 2: user adds/skips title → update the already-created entry
  async function handleTagTitleConfirm() {
    if (tagCreatedEntryId && tagTitle.trim()) {
      await updateJournalEntry(tagCreatedEntryId, { title: tagTitle.trim() });
    }
    setTagTitleModalOpen(false);
    setTagCreatedEntryId(null);
    setTagTitle('');
  }

  // ── Tag to a meeting (creates journal_entry task + chip) ──
  // Now receives (selectedText, fullHtml) from BlockEditor
  function handleTagToMeeting(selectedText, fullHtml) {
    setTagText(selectedText || '');
    setTagHtml(fullHtml || '');
    setMeetingPickerOpen(true);
  }

  async function handlePickMeeting(meeting) {
    // Use selected text, or fall back to the full note plain text (captured at click time)
    let text;
    if (tagText.trim()) {
      text = tagText.trim().replace(/\{\{task:\d+\}\}/g, '').replace(/\s{2,}/g, ' ').trim();
    } else {
      const html = tagHtml || latestBlocksRef.current?.[0]?.html || '';
      text = htmlToPlainText(html).replace(/\{\{task:\d+\}\}/g, '').replace(/\s{2,}/g, ' ').trim();
    }
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
    setTagHtml('');
  }

  return (
    <div className="min-h-screen lined-paper">
      {/* Sticky header */}
      <div ref={headerRef} className="sticky top-0 z-30 px-4 pt-4 pb-2">
        <div className="max-w-lg mx-auto">
        {/* Nav row */}
        <div className="flex items-center justify-between mb-2">
          <button onClick={readOnly ? onBack : handleSaveAndBack} className="flex items-center gap-1 text-sm text-stone-600">
            <ArrowLeft size={16} />
            {readOnly ? 'Back' : 'Back to List'}
          </button>
          <div className="flex items-center gap-2">
            {/* Save button */}
            {!readOnly && (
              <button
                onClick={handleSaveAndBack}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  saveFlash
                    ? 'bg-green-50 text-green-600 border border-green-200'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-300'
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

        {/* List indicator — multi-list badges */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <FolderOpen size={13} className="text-stone-400 flex-shrink-0" />
          {assignedListIds.length > 0 ? (
            assignedListIds.map(lid => {
              const l = lists.find(x => x.id === lid);
              if (!l) return null;
              return (
                <span key={lid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 text-xs font-medium">
                  {l.name}
                  {!readOnly && assignedListIds.length > 1 && (
                    <button onClick={() => handleRemoveFromList(lid)} className="text-stone-400 hover:text-stone-600">
                      <X size={11} />
                    </button>
                  )}
                </span>
              );
            })
          ) : (
            <span className="text-xs text-stone-400">Uncategorized</span>
          )}
          {!readOnly && (
            <button
              onClick={() => setAddListPickerOpen(true)}
              className="text-[10px] text-stone-400 hover:text-stone-600 font-medium"
              title="Add to another list"
            >
              + List
            </button>
          )}
          {entry?.date && (
            <span className="text-xs text-stone-400 ml-auto">{formatFull(entry.date)}</span>
          )}
        </div>

        {/* Title */}
        {!readOnly ? (
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            placeholder="Untitled"
            className="w-full text-lg font-bold text-gray-900 placeholder-gray-300 border-none outline-none bg-transparent px-0"
          />
        ) : (
          <h1 className="text-lg font-bold text-gray-900">{title || 'Untitled'}</h1>
        )}
        </div>
      </div>

    <div className="px-4 pb-24 max-w-lg mx-auto">
      {/* Block Editor */}
      <div className="mt-3">
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
        stickyTopOffset={headerHeight}
        toolbarHeader={!readOnly ? (
          <div className="flex flex-wrap gap-1 items-center">
            <Tag size={11} className="text-stone-400 flex-shrink-0" />
            {topicTags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 text-xs font-medium">
                {tag}
                <button onClick={() => handleRemoveTopicTag(tag)} className="text-stone-400 hover:text-stone-600">
                  <X size={12} />
                </button>
              </span>
            ))}
            <div className="relative flex-1 min-w-[100px]">
              <input
                type="text"
                value={topicTagInput}
                onChange={e => { setTopicTagInput(e.target.value); setShowTagSuggestions(true); }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && topicTagInput.trim()) { e.preventDefault(); handleAddTopicTag(topicTagInput); }
                }}
                onFocus={() => setShowTagSuggestions(true)}
                onBlur={() => setTimeout(() => setShowTagSuggestions(false), 200)}
                placeholder="Add tag..."
                className="w-full text-xs bg-transparent border-none outline-none text-stone-600 placeholder-stone-300"
              />
              {showTagSuggestions && tagSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 bottom-full mb-1 bg-white border border-stone-200 rounded-lg shadow-sm z-10 py-1">
                  {tagSuggestions.map(suggestion => (
                    <button
                      key={suggestion}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleAddTopicTag(suggestion)}
                      className="w-full text-left px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : undefined}
      />
      </div>

      {/* Read-only tag display */}
      {readOnly && topicTags.length > 0 && (
        <div className="mt-4 pt-3 border-t border-stone-200 flex flex-wrap gap-1.5">
          {topicTags.map(tag => (
            <span key={tag} className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 text-xs font-medium">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Move entry to another list (legacy — kept for backward compat) */}
      <JournalListPicker
        open={movePickerOpen}
        onClose={() => setMovePickerOpen(false)}
        onSelect={handleMoveToList}
        excludeIds={displayList?.id ? [displayList.id] : []}
        title="Move to List"
      />

      {/* Add entry to another list (multi-list) */}
      <JournalListPicker
        open={addListPickerOpen}
        onClose={() => setAddListPickerOpen(false)}
        onSelect={handleAddToList}
        excludeIds={assignedListIds}
        title="Add to List"
      />

      {/* Journal list picker (tag text to another list) */}
      <JournalListPicker
        open={journalListPickerOpen}
        onClose={() => { setJournalListPickerOpen(false); setTagText(''); setTagHtml(''); }}
        onSelect={handleListPicked}
        excludeIds={list?.id ? [list.id] : []}
        title="Tag to Journal List"
      />

      {/* Title prompt for already-created tagged entry */}
      <Modal
        open={tagTitleModalOpen}
        onClose={() => { setTagTitleModalOpen(false); setTagCreatedEntryId(null); setTagTitle(''); }}
        title="Add Title"
        size="sm"
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Entry created! Add a title?</p>
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
              {tagTitle.trim() ? 'Save Title' : 'Skip'}
            </button>
            <button
              onClick={() => { setTagTitleModalOpen(false); setTagCreatedEntryId(null); setTagTitle(''); }}
              className="btn-secondary flex-1"
            >
              Skip
            </button>
          </div>
        </div>
      </Modal>

      {/* Meeting picker (tag text as journal_entry task) */}
      <MeetingPicker
        open={meetingPickerOpen}
        onClose={() => { setMeetingPickerOpen(false); setTagText(''); setTagHtml(''); }}
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
    </div>
  );
}
