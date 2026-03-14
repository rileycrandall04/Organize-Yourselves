import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useMeetingInstances, useTagsFromInstance, useMeetings } from '../hooks/useDb';
import { addMeetingNoteTag, addJournalEntry, syncCallingNotesFromMeeting, deleteMeetingInstance, updateTask, getTasksByIds, getTasks, setMeetingTaskStatus } from '../db';
import { formatFull, formatMeetingDate } from '../utils/dates';
import { TASK_TYPES } from '../utils/constants';
import { isAiConfigured, summarizeMeetingNotes, suggestActionItems } from '../utils/ai';
import MeetingPicker from './shared/MeetingPicker';
import JournalListPicker from './shared/JournalListPicker';
import Modal from './shared/Modal';
import SacramentProgram from './SacramentProgram';
import AiButton, { AiResultCard } from './shared/AiButton';
import BlockEditor, { migrateAgendaToBlocks, consolidateBlocks } from './BlockEditor';
import { htmlToPlainText, extractTaskIdsFromHtml, migrateTextToHtml } from './shared/RichTextEditor';
import {
  ArrowLeft, Save, CheckCircle2, Users2, Trash2,
  ArrowUpRight, X, Pencil, RotateCcw, Plus, Search, Import, BookOpen,
  CheckSquare, MessageSquare, CalendarDays, Briefcase, Heart, RotateCw,
  PhoneForwarded, Sparkles, ChevronDown, Copy, FileText,
} from 'lucide-react';

export default function MeetingNotes({ instance, meetingName, meetingId, participants, onBack }) {
  const isSacrament = meetingName === 'Sacrament Meeting';
  const { instances: allInstances, update } = useMeetingInstances(instance.meetingId);
  const { tags: instanceTags, remove: removeTag } = useTagsFromInstance(instance.id);
  const { meetings: allMeetings } = useMeetings();

  // Initialize blocks — migrate old formats and consolidate to text + task_ref
  const initialBlocks = useMemo(() => {
    if (instance.blocks?.length > 0) return consolidateBlocks(instance.blocks);
    if (instance.agendaItems?.length > 0 || instance.notes?.trim()) {
      return migrateAgendaToBlocks(instance.agendaItems, instance.notes);
    }
    return [{ id: 'init_1', type: 'text', text: '' }];
  }, []);

  const [blocks, setBlocks] = useState(initialBlocks);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const latestBlocksRef = useRef(initialBlocks);
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  // Date editing
  const [editingDate, setEditingDate] = useState(false);
  const [editDate, setEditDate] = useState(instance.date);

  // Status
  const [instanceStatus, setInstanceStatus] = useState(instance.status);
  const isCompleted = instanceStatus === 'completed';
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Note tagging
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [journalListPickerOpen, setJournalListPickerOpen] = useState(false);
  const [tagTitleModalOpen, setTagTitleModalOpen] = useState(false);
  const [tagTargetList, setTagTargetList] = useState(null);
  const [tagTitle, setTagTitle] = useState('');
  const [tagText, setTagText] = useState('');

  // Import tasks from other meetings
  const [importPickerOpen, setImportPickerOpen] = useState(false);
  const insertChipRef = useRef(null);
  const handleInsertRef = useCallback((fn) => { insertChipRef.current = fn; }, []);
  const getSelectedTextRef = useRef(null);
  const handleGetSelectedTextRef = useCallback((fn) => { getSelectedTextRef.current = fn; }, []);

  // Task sharing to other meetings
  const [shareTaskId, setShareTaskId] = useState(null);

  // AI state
  const aiEnabled = isAiConfigured();
  const [aiSummary, setAiSummary] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSuggestionsLoading, setAiSuggestionsLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Prior meeting notes
  const [showPriorNotes, setShowPriorNotes] = useState(false);
  const [addedFromPriorIds, setAddedFromPriorIds] = useState(new Set());
  const previousInstance = useMemo(() => {
    if (!allInstances || allInstances.length < 2) return null;
    const currentIdx = allInstances.findIndex(i => i.id === instance.id);
    if (currentIdx === -1 || currentIdx >= allInstances.length - 1) return null;
    const prev = allInstances[currentIdx + 1];
    const html = prev.blocks?.[0]?.html || prev.blocks?.[0]?.text || '';
    if (!html.replace(/<[^>]*>/g, '').trim()) return null;
    return prev;
  }, [allInstances, instance.id]);

  // Copy minutes
  const [copied, setCopied] = useState(false);

  // Derive text content for AI
  const hasContent = blocks.some(b => (b.text || b.html || '').replace(/<[^>]*>/g, '').trim());

  function handleBlocksChange(newBlocks) {
    latestBlocksRef.current = newBlocks;
    setBlocks(newBlocks);
    setDirty(true);
  }

  // Auto-save handler — called by RichTextEditor's auto-save (every 5s, on unmount, on visibility change)
  const handleAutoSave = useCallback(async (newBlocks) => {
    try {
      await update(instance.id, { blocks: newBlocks });
      setBlocks(newBlocks);
      setDirty(false);
    } catch {
      // Silently fail — will retry on next auto-save
    }
  }, [instance.id, update]);

  // Auto-save on unmount (user navigates away via back button, bottom nav, etc.)
  useEffect(() => {
    return () => {
      const currentBlocks = latestBlocksRef.current;
      if (currentBlocks) {
        update(instance.id, { blocks: currentBlocks });
      }
    };
  }, [instance.id, update]);

  // Measure sticky header height for formatting toolbar offset
  useEffect(() => {
    if (!headerRef.current) return;
    const ro = new ResizeObserver(() => setHeaderHeight(headerRef.current.offsetHeight));
    ro.observe(headerRef.current);
    return () => ro.disconnect();
  }, []);

  async function handleReopen() {
    await update(instance.id, { status: 'scheduled' });
    instance.status = 'scheduled';
    setInstanceStatus('scheduled');
  }

  async function handleDeleteInstance() {
    await deleteMeetingInstance(instance.id);
    onBack();
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      // Always use the ref for the latest blocks to avoid stale React state
      const currentBlocks = latestBlocksRef.current;
      if (dirty) {
        await update(instance.id, { blocks: currentBlocks });
        setDirty(false);
      }
      onBack(); // Return to meeting home page
    } finally {
      setSaving(false);
    }
  }

  async function handleFinalize() {
    setSaving(true);
    try {
      const currentBlocks = latestBlocksRef.current;
      await update(instance.id, { blocks: currentBlocks, status: 'completed' });
      instance.status = 'completed';
      setInstanceStatus('completed');

      // Sync calling notes from text lines that match calling pipeline
      const content = currentBlocks[0]?.text || '';
      const callingAgendaItems = content.split('\n')
        .filter(line => line.includes('[Calling]'))
        .map(line => ({ label: line.trim(), notes: '', source: 'calling_pipeline' }));
      if (callingAgendaItems.length > 0) {
        await syncCallingNotesFromMeeting(callingAgendaItems, instance.date, meetingName);
      }

      setDirty(false);
      onBack();
    } finally {
      setSaving(false);
    }
  }

  // AI — extract plain text from content (handles both old text and new richtext blocks)
  function getPlainText() {
    const block = blocks[0];
    if (!block) return '';
    if (block.type === 'richtext') {
      return htmlToPlainText(block.html || '').replace(/\{\{task:\d+\}\}/g, '').trim();
    }
    return (block.text || '').replace(/\{\{task:\d+\}\}/g, '').trim();
  }

  async function handleAiSummarize() {
    setAiSummaryLoading(true);
    setAiError('');
    try {
      const result = await summarizeMeetingNotes({
        meetingName,
        date: formatFull(instance.date),
        agendaItems: [],
        notes: getPlainText(),
      });
      setAiSummary(result);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiSummaryLoading(false);
    }
  }

  async function handleAiSuggest() {
    setAiSuggestionsLoading(true);
    setAiError('');
    try {
      const result = await suggestActionItems({
        meetingName,
        date: formatFull(instance.date),
        agendaItems: [],
        notes: getPlainText(),
      });
      setAiSuggestions(result);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiSuggestionsLoading(false);
    }
  }

  // Note tagging
  async function handleTagMeeting(meeting) {
    const text = getPlainText();
    if (!text) return;

    await addMeetingNoteTag({
      sourceMeetingInstanceId: instance.id,
      targetMeetingId: meeting.id,
      text: text.trim(),
      agendaItemIndex: -1,
    });
    setTagPickerOpen(false);
  }

  // Tag notes to a journal list — uses highlighted text if available, otherwise full note
  // Step 1: user picks a list → capture text and show title prompt
  function handleTagJournalList(list) {
    const selectedText = getSelectedTextRef.current?.();
    const text = selectedText?.trim() || getPlainText();
    if (!text) return;
    setTagText(text);
    setTagTargetList(list);
    setJournalListPickerOpen(false);
    setTagTitle('');
    setTagTitleModalOpen(true);
  }

  // Step 2: user confirms title → create the entry
  async function handleTagTitleConfirm() {
    if (!tagText || !tagTargetList) return;
    const html = tagText.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');
    await addJournalEntry({
      listId: tagTargetList.id,
      title: tagTitle.trim() || '',
      text: tagText.trim(),
      html,
      tags: [],
      sourceMeetingInstanceId: instance.id,
    });
    setTagTitleModalOpen(false);
    setTagTargetList(null);
    setTagTitle('');
    setTagText('');
  }

  // Task sharing — add task to another meeting's agenda
  async function handleShareTaskToMeeting(meeting) {
    if (!shareTaskId) return;
    const tasks = await getTasksByIds([shareTaskId]);
    const task = tasks[0];
    if (!task) { setShareTaskId(null); return; }
    const ids = task.meetingIds || [];
    if (!ids.includes(meeting.id)) {
      await updateTask(shareTaskId, { meetingIds: [...ids, meeting.id] });
    }
    setShareTaskId(null);
  }

  // Import a task from another meeting into the current meeting + insert chip into editor
  async function handleImportTask(task) {
    const updatedMeetingIds = [...new Set([...(task.meetingIds || []), meetingId || instance.meetingId])];
    await updateTask(task.id, { meetingIds: updatedMeetingIds });
    // Insert task chip into the TipTap editor via BlockEditor's insertTaskChip
    if (insertChipRef.current) {
      insertChipRef.current(task.id);
    }
  }

  // Add a task from prior meeting notes to the current meeting
  async function handleAddFromPrior(taskId) {
    const tasks = await getTasksByIds([taskId]);
    const task = tasks[0];
    if (!task) return;
    const currentMeetingId = meetingId || instance.meetingId;
    const updatedMeetingIds = [...new Set([...(task.meetingIds || []), currentMeetingId])];
    await updateTask(task.id, { meetingIds: updatedMeetingIds });
    if (task.status === 'complete') {
      await setMeetingTaskStatus(task.id, currentMeetingId, 'resolved');
    }
    if (insertChipRef.current) insertChipRef.current(task.id);
    setAddedFromPriorIds(prev => new Set([...prev, taskId]));
  }

  // Generate formatted minutes text for clipboard
  async function generateMinutesText() {
    const block = blocks[0];
    if (!block) return '';
    let html = block.html || block.text || '';

    const taskIds = extractTaskIdsFromHtml(html);
    if (taskIds.length > 0) {
      const tasks = await getTasksByIds(taskIds);
      const taskMap = {};
      for (const t of tasks) taskMap[t.id] = t;

      html = html.replace(
        /<task-chip[^>]*data-task-id="(\d+)"[^>]*>(?:<\/task-chip>)?/g,
        (_, idStr) => {
          const task = taskMap[Number(idStr)];
          if (!task) return '';
          const sc = STATUS_CHAR[task.status] || '\u25CB';
          return `${sc} ${task.title}`;
        }
      );
    }

    const bodyText = htmlToPlainText(html);
    const dateStr = formatFull(instance.date);
    const attendeeStr = participants?.length > 0
      ? participants.map(p => p.name).join(', ')
      : '';

    let minutes = `${meetingName}\nDate: ${dateStr}`;
    if (attendeeStr) minutes += `\n\nAttendees: ${attendeeStr}`;
    minutes += `\n\n${bodyText.trim()}`;
    return minutes;
  }

  async function handleCopyMinutes() {
    const text = await generateMinutesText();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function getMeetingNameById(id) {
    const mtg = allMeetings.find(m => m.id === id);
    return mtg?.name || 'Meeting';
  }

  return (
    <div className="pb-24 max-w-lg mx-auto">
      {/* Sticky header */}
      <div ref={headerRef} className="sticky top-0 z-30 bg-gray-50/95 backdrop-blur-sm px-4 pt-4 pb-3 -mx-0">
        <button onClick={handleSave} className="flex items-center gap-1 text-sm text-primary-600 mb-2">
          <ArrowLeft size={16} />
          Back to {meetingName}
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{meetingName}</h1>
            {editingDate ? (
              <div className="flex items-center gap-1.5 mt-0.5">
                <input
                  type="date"
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  className="text-sm border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-300"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (editDate && editDate !== instance.date) {
                        update(instance.id, { date: editDate });
                        instance.date = editDate;
                      }
                      setEditingDate(false);
                    }
                    if (e.key === 'Escape') setEditingDate(false);
                  }}
                />
                <button
                  onClick={() => {
                    if (editDate && editDate !== instance.date) {
                      update(instance.id, { date: editDate });
                      instance.date = editDate;
                    }
                    setEditingDate(false);
                  }}
                  className="text-primary-600 hover:text-primary-800"
                >
                  <CheckCircle2 size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingDate(true)}
                className="text-sm text-gray-500 mt-0.5 hover:text-primary-600 hover:underline flex items-center gap-1 group transition-colors"
                title="Click to change date"
              >
                {formatFull(instance.date)}
                <Pencil size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
          </div>
          {isCompleted && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                <CheckCircle2 size={14} />
                Finalized
              </span>
              <button
                onClick={handleReopen}
                className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-primary-600 transition-colors"
                title="Reopen for editing"
              >
                <RotateCcw size={12} /> Edit
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                title="Delete this meeting instance"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

    <div className="px-4">

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="card bg-red-50 border-red-200 mb-5 p-4">
          <p className="text-sm font-medium text-red-800 mb-1">Delete this meeting?</p>
          <p className="text-xs text-red-600 mb-3">
            This will permanently delete this meeting instance, including all notes and linked tasks.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteInstance}
              className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Participants */}
      {participants?.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Users2 size={12} className="text-gray-400" />
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Participants</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {participants.map((p, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                {p.name}{p.role ? ` (${p.role})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Prior Meeting Notes (collapsible, interactive) */}
      {!isSacrament && previousInstance && (
        <div className="mb-4 border border-gray-100 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowPriorNotes(prev => !prev)}
            className="flex items-center justify-between w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <FileText size={12} className="text-gray-400" />
              Previous Meeting — {formatMeetingDate(previousInstance.date)}
            </span>
            <ChevronDown
              size={14}
              className={`text-gray-400 transition-transform ${showPriorNotes ? '' : '-rotate-90'}`}
            />
          </button>
          {showPriorNotes && (
            <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/30 max-h-72 overflow-y-auto">
              <PriorMeetingNotes
                instance={previousInstance}
                currentMeetingId={meetingId || instance.meetingId}
                onAddTask={handleAddFromPrior}
                addedIds={addedFromPriorIds}
              />
            </div>
          )}
        </div>
      )}

      {/* Sacrament Meeting Program */}
      {isSacrament && (
        <div className="mb-6">
          <SacramentProgram instance={instance} onUpdate={update} disabled={isCompleted} />
        </div>
      )}

      {/* Add Tasks button (above editor) */}
      {!isSacrament && !isCompleted && (
        <div className="mb-3">
          <button
            onClick={() => setImportPickerOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-800 px-3 py-2 rounded-lg border border-primary-200 hover:bg-primary-50 transition-colors w-full justify-center"
          >
            <Import size={14} />
            Add tasks from other meetings
          </button>
        </div>
      )}

      {/* Block Editor — the main meeting document */}
      {!isSacrament && (
        <div className="mb-6">
          <BlockEditor
            blocks={blocks}
            onChange={handleBlocksChange}
            onSave={handleAutoSave}
            meetingId={meetingId || instance.meetingId}
            instanceId={instance.id}
            finalized={isCompleted}
            onTagTask={(taskId) => setShareTaskId(taskId)}
            meetings={allMeetings}
            onInsertRef={handleInsertRef}
            onGetSelectedTextRef={handleGetSelectedTextRef}
            autoSaveMs={5000}
            stickyTopOffset={headerHeight}
          />
        </div>
      )}

      {/* Tags summary */}
      {instanceTags.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-1.5 mb-2">
            <ArrowUpRight size={14} className="text-indigo-500" />
            <h2 className="text-sm font-semibold text-gray-900">
              Tagged Notes ({instanceTags.length})
            </h2>
          </div>
          <div className="flex gap-1 flex-wrap">
            {instanceTags.map(tag => (
              <span key={tag.id} className="inline-flex items-center gap-0.5 badge bg-indigo-50 text-indigo-600 text-[10px]">
                <ArrowUpRight size={8} />
                {getMeetingNameById(tag.targetMeetingId)}
                {!isCompleted && (
                  <button onClick={() => removeTag(tag.id)} className="ml-0.5 hover:text-red-500">
                    <X size={8} />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tag notes to another meeting / journal list */}
      {!isCompleted && hasContent && (
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => setTagPickerOpen(true)}
            className="flex items-center gap-1 text-[11px] text-indigo-500 hover:text-indigo-700"
          >
            <ArrowUpRight size={12} /> Tag for meeting
          </button>
          <button
            onClick={() => setJournalListPickerOpen(true)}
            className="flex items-center gap-1 text-[11px] text-violet-500 hover:text-violet-700"
          >
            <BookOpen size={12} /> Tag to journal list
          </button>
        </div>
      )}

      {/* AI Features */}
      {aiEnabled && hasContent && (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <AiButton onClick={handleAiSummarize} label="Summarize" loading={aiSummaryLoading} disabled={aiSuggestionsLoading} />
            <AiButton onClick={handleAiSuggest} label="Suggest Actions" loading={aiSuggestionsLoading} disabled={aiSummaryLoading} />
          </div>
          {aiError && <p className="text-xs text-red-500 mb-2">{aiError}</p>}
          <AiResultCard title="Meeting Summary" content={aiSummary} onClose={() => setAiSummary(null)} />
          <AiResultCard title="Suggested Action Items" content={aiSuggestions} onClose={() => setAiSuggestions(null)} />
        </div>
      )}

      {/* Bottom actions */}
      {!isCompleted ? (
        <div className="flex gap-3 mb-6">
          <button
            onClick={handleCopyMinutes}
            disabled={!hasContent}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
              copied
                ? 'border-green-200 bg-green-50 text-green-600'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
            title={copied ? 'Copied!' : 'Copy formatted minutes to clipboard'}
          >
            {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
            <span className="hidden sm:inline">{copied ? 'Copied!' : 'Copy'}</span>
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-secondary flex-1 flex items-center justify-center gap-1.5">
            <Save size={16} /> {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button onClick={handleFinalize} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
            <CheckCircle2 size={16} /> Finalize
          </button>
        </div>
      ) : dirty ? (
        <div className="flex gap-3 mb-6">
          <button
            onClick={handleCopyMinutes}
            disabled={!hasContent}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
              copied
                ? 'border-green-200 bg-green-50 text-green-600'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
            title={copied ? 'Copied!' : 'Copy formatted minutes to clipboard'}
          >
            {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
            <span className="hidden sm:inline">{copied ? 'Copied!' : 'Copy'}</span>
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
            <Save size={16} /> {saving ? 'Saving...' : 'Save Notes'}
          </button>
        </div>
      ) : (
        <div className="flex justify-center mb-6">
          <button
            onClick={handleCopyMinutes}
            disabled={!hasContent}
            className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
              copied
                ? 'border-green-200 bg-green-50 text-green-600'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
            title={copied ? 'Copied!' : 'Copy formatted minutes to clipboard'}
          >
            {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy Minutes'}
          </button>
        </div>
      )}

    </div>

      {/* Meeting tag picker (notes) */}
      <MeetingPicker open={tagPickerOpen} onClose={() => setTagPickerOpen(false)} onSelect={handleTagMeeting} excludeIds={[instance.meetingId]} title="Tag for Meeting" />

      {/* Journal list picker (notes → journal) */}
      <JournalListPicker open={journalListPickerOpen} onClose={() => setJournalListPickerOpen(false)} onSelect={handleTagJournalList} title="Tag to Journal List" />

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
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
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

      {/* Task sharing picker */}
      <MeetingPicker open={!!shareTaskId} onClose={() => setShareTaskId(null)} onSelect={handleShareTaskToMeeting} excludeIds={[instance.meetingId]} title="Share Task to Meeting" />

      {/* Import tasks from other meetings */}
      {importPickerOpen && (
        <MeetingImportPicker
          meetingId={meetingId || instance.meetingId}
          meetings={allMeetings}
          onImport={handleImportTask}
          onClose={() => setImportPickerOpen(false)}
        />
      )}
    </div>
  );
}

/* ── Import Task Picker for MeetingNotes ─────────────────────── */

const TYPE_ICONS = {
  action_item: CheckSquare,
  discussion: MessageSquare,
  event: CalendarDays,
  calling_plan: Briefcase,
  ministering_plan: Heart,
  ongoing: RotateCw,
  follow_up: PhoneForwarded,
  spiritual_thought: Sparkles,
};

const CHIP_COLORS = {
  action_item:      { bg: '#eff6ff', fg: '#1d4ed8' },
  discussion:       { bg: '#eef2ff', fg: '#4338ca' },
  event:            { bg: '#f0fdf4', fg: '#15803d' },
  calling_plan:     { bg: '#faf5ff', fg: '#7e22ce' },
  ministering_plan: { bg: '#fff1f2', fg: '#be123c' },
  ongoing:          { bg: '#fffbeb', fg: '#b45309' },
  follow_up:        { bg: '#f0fdfa', fg: '#0f766e' },
  spiritual_thought:{ bg: '#f5f3ff', fg: '#6d28d9' },
};

const STATUS_CHAR = {
  not_started: '\u25CB',
  in_progress: '\u25D0',
  waiting: '\u23F8',
  complete: '\u2713',
};

function MeetingImportPicker({ meetingId, meetings, onImport, onClose }) {
  const [search, setSearch] = useState('');
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [imported, setImported] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tasks = await getTasks({ excludeComplete: true });
      if (!cancelled) {
        setAllTasks(tasks);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Filter: exclude tasks already on this meeting or already imported
  const available = useMemo(() => {
    return allTasks.filter(t => {
      if ((t.meetingIds || []).includes(meetingId)) return false;
      if (imported.has(t.id)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!t.title.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allTasks, meetingId, search, imported]);

  // Group by source meeting
  const grouped = useMemo(() => {
    const meetingMap = {};
    if (meetings) for (const m of meetings) meetingMap[m.id] = m.name;

    const groups = {};
    for (const task of available) {
      const mIds = (task.meetingIds || []).filter(id => id !== meetingId);
      if (mIds.length > 0) {
        const groupId = mIds[0];
        const groupName = meetingMap[groupId] || `Meeting #${groupId}`;
        if (!groups[groupId]) groups[groupId] = { name: groupName, tasks: [] };
        groups[groupId].tasks.push(task);
      } else {
        if (!groups['_unlinked']) groups['_unlinked'] = { name: 'Unlinked Tasks', tasks: [] };
        groups['_unlinked'].tasks.push(task);
      }
    }
    return Object.values(groups);
  }, [available, meetings, meetingId]);

  async function handleImport(task) {
    await onImport(task);
    setImported(prev => new Set([...prev, task.id]));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-5 animate-in fade-in max-h-[70vh] flex flex-col mx-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Import size={16} className="text-gray-600" />
          Add Tasks from Other Meetings
        </h3>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            autoFocus
          />
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="text-center py-8 text-gray-400">
              <div className="animate-spin w-5 h-5 border-2 border-primary-300 border-t-primary-700 rounded-full mx-auto mb-2" />
              <p className="text-xs">Loading tasks...</p>
            </div>
          ) : grouped.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-xs">{search ? 'No matching tasks found.' : 'No tasks available to add.'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.map(group => (
                <div key={group.name}>
                  <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5 px-1">
                    {group.name}
                  </h4>
                  <div className="space-y-0.5">
                    {group.tasks.map(task => {
                      const TypeIcon = TYPE_ICONS[task.type] || CheckSquare;
                      const c = CHIP_COLORS[task.type] || CHIP_COLORS.action_item;
                      const sc = STATUS_CHAR[task.status] || '\u25CB';
                      return (
                        <button
                          key={task.id}
                          onClick={() => handleImport(task)}
                          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left group"
                        >
                          <span
                            className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px]"
                            style={{ background: c.bg, color: c.fg }}
                          >
                            {sc}
                          </span>
                          <span className="flex-1 text-xs text-gray-800 truncate">{task.title}</span>
                          <Plus size={14} className="text-gray-300 group-hover:text-primary-500 flex-shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Done */}
        <button onClick={onClose} className="btn-primary w-full mt-3">
          Done
        </button>
      </div>
    </div>
  );
}

/* ── Prior Meeting Notes Viewer ────────────────────────────────── */

function PriorMeetingNotes({ instance: prevInstance, currentMeetingId, onAddTask, addedIds }) {
  const [resolvedHtml, setResolvedHtml] = useState(null);
  const [taskMap, setTaskMap] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const block = prevInstance.blocks?.[0];
      let html = block?.html || '';
      // If no HTML but has plain text, convert to HTML for proper paragraph rendering
      if (!html && block?.text) {
        html = migrateTextToHtml(block.text);
      }
      if (!html.trim()) { setResolvedHtml(null); return; }

      const taskIds = extractTaskIdsFromHtml(html);
      let tMap = {};

      if (taskIds.length > 0) {
        const tasks = await getTasksByIds(taskIds);
        for (const t of tasks) tMap[t.id] = t;
      }

      if (!cancelled) {
        setTaskMap(tMap);
        setResolvedHtml(html);
      }
    })();
    return () => { cancelled = true; };
  }, [prevInstance]);

  // Build display HTML with interactive task badges
  const displayHtml = useMemo(() => {
    if (!resolvedHtml) return null;

    return resolvedHtml.replace(
      /<task-chip[^>]*data-task-id="(\d+)"[^>]*>(?:<\/task-chip>)?/g,
      (_, idStr) => {
        const id = Number(idStr);
        const task = taskMap[id];
        if (!task) return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:6px;background:#f3f4f6;color:#9ca3af;font-size:12px;vertical-align:baseline;line-height:1.4;margin:0 2px;">Task #${id}</span>`;

        const c = CHIP_COLORS[task.type] || CHIP_COLORS.action_item;
        const sc = STATUS_CHAR[task.status] || '\u25CB';
        const done = task.status === 'complete';
        const alreadyLinked = (task.meetingIds || []).includes(currentMeetingId);
        const justAdded = addedIds.has(id);
        const isAdded = alreadyLinked || justAdded;

        if (isAdded) {
          return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:6px;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;font-size:12px;font-weight:500;vertical-align:baseline;line-height:1.4;margin:0 2px;opacity:0.7;">\u2713\u00a0${task.title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`;
        }

        return `<span data-task-id="${id}" style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:6px;background:${c.bg};color:${c.fg};border:1px solid ${c.bg};font-size:12px;font-weight:500;vertical-align:baseline;line-height:1.4;margin:0 2px;cursor:pointer;${done ? 'opacity:0.5;text-decoration:line-through;' : ''}" title="Click to add to this meeting">${sc}\u00a0${task.title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}<span style="margin-left:4px;font-size:10px;opacity:0.6;">+</span></span>`;
      }
    );
  }, [resolvedHtml, taskMap, currentMeetingId, addedIds]);

  function handleClick(e) {
    const target = e.target.closest('[data-task-id]');
    if (!target) return;
    const taskId = Number(target.getAttribute('data-task-id'));
    if (taskId && !addedIds.has(taskId)) {
      onAddTask(taskId);
    }
  }

  if (!displayHtml) return <p className="text-xs text-gray-400 italic">No notes from previous meeting.</p>;

  return (
    <div
      onClick={handleClick}
      className="prose prose-sm max-w-none text-gray-600 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: displayHtml }}
    />
  );
}
