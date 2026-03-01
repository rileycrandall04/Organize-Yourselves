import { useState, useRef, useCallback, useEffect } from 'react';
import { useMeetingInstances, useTagsFromInstance, useMeetings } from '../hooks/useDb';
import { addActionItem, addMeetingNoteTag, syncCallingNotesFromMeeting, addOngoingTaskUpdate, addMinisteringPlanUpdate, updateActionItem, dismissOngoingTask, completeMinisteringPlan } from '../db';
import { formatFull } from '../utils/dates';
import { isAiConfigured, summarizeMeetingNotes, suggestActionItems } from '../utils/ai';
import Modal from './shared/Modal';
import MeetingPicker from './shared/MeetingPicker';
import SacramentProgram from './SacramentProgram';
import AiButton, { AiResultCard } from './shared/AiButton';
import AddPriorTasksModal from './AddPriorTasksModal';
import {
  ArrowLeft, Save, CheckCircle2, Plus, MessageSquare, FileText,
  ArrowUpRight, X, CheckSquare, Clock, Users2, Trash2,
  GripVertical, ListPlus,
} from 'lucide-react';

export default function MeetingNotes({ instance, meetingName, meetingId, onBack }) {
  const isSacrament = meetingName === 'Sacrament Meeting';
  const { update } = useMeetingInstances(instance.meetingId);
  const { tags: instanceTags, remove: removeTag } = useTagsFromInstance(instance.id);
  const { meetings: allMeetings } = useMeetings();
  const [notes, setNotes] = useState(instance.notes || '');
  const [agendaItems, setAgendaItems] = useState(instance.agendaItems || []);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [actionTitle, setActionTitle] = useState('');
  const [actionItemIds, setActionItemIds] = useState(instance.actionItemIds || []);
  const [showPriorTasks, setShowPriorTasks] = useState(false);

  // Focus Families state
  const [focusFamilies, setFocusFamilies] = useState(instance.focusFamilies || []);

  // Text selection toolbar state
  const [selectionToolbar, setSelectionToolbar] = useState(null);
  const containerRef = useRef(null);

  // Drag state
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  // Note tagging state
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagAgendaIndex, setTagAgendaIndex] = useState(null);
  const [tagPickerForGeneral, setTagPickerForGeneral] = useState(false);
  const [tagFromSelection, setTagFromSelection] = useState(null);

  // AI state
  const aiEnabled = isAiConfigured();
  const [aiSummary, setAiSummary] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSuggestionsLoading, setAiSuggestionsLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const isCompleted = instance.status === 'completed';

  async function handleAiSummarize() {
    setAiSummaryLoading(true);
    setAiError('');
    try {
      const result = await summarizeMeetingNotes({
        meetingName,
        date: formatFull(instance.date),
        agendaItems,
        notes,
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
        agendaItems,
        notes,
      });
      setAiSuggestions(result);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiSuggestionsLoading(false);
    }
  }

  const hasContent = notes.trim() || agendaItems.some(a => a.notes?.trim());

  function updateAgendaNote(index, value) {
    setAgendaItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], notes: value };
      return updated;
    });
    setDirty(true);
  }

  function updateNotes(value) {
    setNotes(value);
    setDirty(true);
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      await update(instance.id, { notes, agendaItems, actionItemIds, focusFamilies });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleFinalize() {
    setSaving(true);
    try {
      await update(instance.id, { notes, agendaItems, actionItemIds, focusFamilies, status: 'completed' });
      await syncCallingNotesFromMeeting(agendaItems, instance.date, meetingName);

      // Save ongoing task updates and ministering plan updates
      for (const item of agendaItems) {
        if (item.source === 'ongoing_task' && item.ongoingTaskId && item.notes?.trim()) {
          await addOngoingTaskUpdate(item.ongoingTaskId, {
            text: item.notes.trim(),
            instanceId: instance.id,
          });
        }
        if (item.source === 'ministering_plan' && item.ministeringPlanId && item.notes?.trim()) {
          await addMinisteringPlanUpdate(item.ministeringPlanId, {
            text: item.notes.trim(),
            instanceId: instance.id,
            meetingName,
          });
        }
        if (item.source === 'completed_followup' && item.actionItemId) {
          await updateActionItem(item.actionItemId, { followUpShown: true });
        }
      }

      setDirty(false);
      onBack();
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateAction() {
    if (!actionTitle.trim()) return;
    const id = await addActionItem({
      title: actionTitle.trim(),
      sourceMeetingInstanceId: instance.id,
    });
    setActionItemIds(prev => [...prev, id]);
    await update(instance.id, { actionItemIds: [...actionItemIds, id] });
    setActionTitle('');
    setQuickActionOpen(false);
  }

  async function handleDismissOngoingTask(index) {
    const item = agendaItems[index];
    if (item?.ongoingTaskId) {
      await dismissOngoingTask(item.ongoingTaskId);
      setAgendaItems(prev => prev.filter((_, i) => i !== index));
      setDirty(true);
    }
  }

  async function handleCompleteMinisteringPlan(index) {
    const item = agendaItems[index];
    if (item?.ministeringPlanId) {
      await completeMinisteringPlan(item.ministeringPlanId);
      setAgendaItems(prev => prev.filter((_, i) => i !== index));
      setDirty(true);
    }
  }

  // --- Focus Families ---

  function addFocusFamily() {
    setFocusFamilies(prev => [...prev, { name: '', notes: '' }]);
    setDirty(true);
  }

  function updateFocusFamily(index, field, value) {
    setFocusFamilies(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setDirty(true);
  }

  function removeFocusFamily(index) {
    setFocusFamilies(prev => prev.filter((_, i) => i !== index));
    setDirty(true);
  }

  // --- Drag & Drop ---

  function handleDragStart(e, index) {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    setDragOverIndex(index);
  }

  function handleDrop(e, dropIndex) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    setAgendaItems(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(dragIndex, 1);
      updated.splice(dropIndex, 0, moved);
      return updated;
    });
    setDirty(true);
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
  }

  // --- Add Prior Tasks ---

  function handleAddPriorItems(items) {
    setAgendaItems(prev => [...prev, ...items]);
    setDirty(true);
    setShowPriorTasks(false);
  }

  // --- Text Selection Toolbar ---

  const handleTextSelect = useCallback((e) => {
    if (isCompleted) return;
    const el = e.target;
    if (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT') return;
    const selectedText = el.value.substring(el.selectionStart, el.selectionEnd).trim();
    if (selectedText.length < 3) {
      setSelectionToolbar(null);
      return;
    }
    const containerRect = containerRef.current?.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (!containerRect) return;
    setSelectionToolbar({
      text: selectedText,
      top: elRect.top - containerRect.top - 36,
      left: Math.min(elRect.left - containerRect.left + 8, 200),
    });
  }, [isCompleted]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('mouseup', handleTextSelect);
    container.addEventListener('keyup', handleTextSelect);
    return () => {
      container.removeEventListener('mouseup', handleTextSelect);
      container.removeEventListener('keyup', handleTextSelect);
    };
  }, [handleTextSelect]);

  async function createActionFromSelection() {
    if (!selectionToolbar?.text) return;
    const id = await addActionItem({
      title: selectionToolbar.text,
      sourceMeetingInstanceId: instance.id,
    });
    setActionItemIds(prev => [...prev, id]);
    await update(instance.id, { actionItemIds: [...actionItemIds, id] });
    setSelectionToolbar(null);
  }

  function tagFromSelectionText() {
    if (!selectionToolbar?.text) return;
    setTagFromSelection(selectionToolbar.text);
    setSelectionToolbar(null);
    setTagPickerOpen(true);
  }

  // --- Calling Snooze ---

  function snoozeAgendaItem(index) {
    setAgendaItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], snoozed: true };
      return updated;
    });
    setDirty(true);
  }

  // --- Note Tagging ---

  function openTagPicker(agendaIndex) {
    setTagAgendaIndex(agendaIndex);
    setTagPickerForGeneral(false);
    setTagPickerOpen(true);
  }

  function openGeneralTagPicker() {
    setTagAgendaIndex(null);
    setTagPickerForGeneral(true);
    setTagPickerOpen(true);
  }

  async function handleTagMeeting(meeting) {
    if (tagFromSelection) {
      await addMeetingNoteTag({
        sourceMeetingInstanceId: instance.id,
        targetMeetingId: meeting.id,
        text: tagFromSelection.trim(),
        agendaItemIndex: -2,
      });
      setTagFromSelection(null);
      setTagPickerOpen(false);
      return;
    }

    const text = tagPickerForGeneral
      ? notes
      : agendaItems[tagAgendaIndex]?.notes || '';
    if (!text?.trim()) return;

    await addMeetingNoteTag({
      sourceMeetingInstanceId: instance.id,
      targetMeetingId: meeting.id,
      text: text.trim(),
      agendaItemIndex: tagPickerForGeneral ? -1 : tagAgendaIndex,
    });
    setTagPickerOpen(false);
  }

  function getMeetingNameById(id) {
    const mtg = allMeetings.find(m => m.id === id);
    return mtg?.name || 'Meeting';
  }

  function getAgendaItemTags(index) {
    return instanceTags.filter(t => t.agendaItemIndex === index);
  }

  function getSourceClass(source) {
    switch (source) {
      case 'carry_forward': return 'border-l-2 border-l-amber-300';
      case 'tagged_note': return 'border-l-2 border-l-indigo-300';
      case 'calling_pipeline': return 'border-l-2 border-l-purple-300';
      case 'ongoing_task': return 'border-l-2 border-l-green-300';
      case 'ministering_plan': return 'border-l-2 border-l-teal-300';
      case 'completed_followup': return 'border-l-2 border-l-green-300';
      default: return '';
    }
  }

  function getSourceBadge(item) {
    switch (item.source) {
      case 'carry_forward':
        return <span className="badge bg-amber-100 text-amber-700 text-[9px] flex-shrink-0">Carry Forward</span>;
      case 'tagged_note':
        return <span className="badge bg-indigo-100 text-indigo-700 text-[9px] flex-shrink-0">Tagged Note</span>;
      case 'calling_pipeline':
        return <span className="badge bg-purple-100 text-purple-700 text-[9px] flex-shrink-0">Calling</span>;
      case 'ongoing_task':
        return <span className="badge bg-green-100 text-green-700 text-[9px] flex-shrink-0">Ongoing</span>;
      case 'ministering_plan':
        return <span className="badge bg-teal-100 text-teal-700 text-[9px] flex-shrink-0">Ministering</span>;
      case 'completed_followup':
        return <span className="badge bg-green-100 text-green-700 text-[9px] flex-shrink-0">Completed</span>;
      default: return null;
    }
  }

  const generalNoteTags = instanceTags.filter(t => t.agendaItemIndex === -1);

  return (
    <div ref={containerRef} className="px-4 pt-6 pb-24 max-w-lg mx-auto relative">
      {/* Floating selection toolbar */}
      {selectionToolbar && (
        <div
          className="absolute z-30 flex items-center gap-1 bg-gray-800 text-white rounded-lg shadow-lg px-2 py-1.5 animate-in fade-in"
          style={{ top: selectionToolbar.top, left: selectionToolbar.left }}
        >
          <button
            onMouseDown={e => { e.preventDefault(); createActionFromSelection(); }}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-gray-700 transition-colors"
          >
            <CheckSquare size={12} />
            Action Item
          </button>
          <div className="w-px h-4 bg-gray-600" />
          <button
            onMouseDown={e => { e.preventDefault(); tagFromSelectionText(); }}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-gray-700 transition-colors"
          >
            <ArrowUpRight size={12} />
            Tag
          </button>
          <button
            onMouseDown={e => { e.preventDefault(); setSelectionToolbar(null); }}
            className="ml-1 p-0.5 rounded hover:bg-gray-700 transition-colors"
          >
            <X size={10} />
          </button>
        </div>
      )}

      {/* Header */}
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary-600 mb-4">
        <ArrowLeft size={16} />
        Back to {meetingName}
      </button>

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{meetingName}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{formatFull(instance.date)}</p>
        </div>
        {isCompleted && (
          <span className="flex items-center gap-1 text-xs font-medium text-green-600">
            <CheckCircle2 size={14} />
            Finalized
          </span>
        )}
      </div>

      {/* Sacrament Meeting Program */}
      {isSacrament && (
        <div className="mb-6">
          <SacramentProgram instance={instance} onUpdate={update} disabled={isCompleted} />
        </div>
      )}

      {/* Agenda items with drag reorder */}
      {!isSacrament && agendaItems.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              <FileText size={14} className="text-primary-600" />
              Agenda
            </h2>
            {!isCompleted && (
              <button
                onClick={() => setShowPriorTasks(true)}
                className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800"
              >
                <ListPlus size={14} />
                Add Prior Tasks
              </button>
            )}
          </div>
          <div className="space-y-2">
            {agendaItems.map((item, i) => {
              const itemTags = getAgendaItemTags(i);
              const sourceClass = getSourceClass(item.source);
              const isCompletedFollowup = item.source === 'completed_followup';

              return (
                <div
                  key={i}
                  className={`card !p-2.5 ${sourceClass} ${dragOverIndex === i ? 'ring-2 ring-primary-300' : ''} ${dragIndex === i ? 'opacity-50' : ''}`}
                  draggable={!isCompleted}
                  onDragStart={e => handleDragStart(e, i)}
                  onDragOver={e => handleDragOver(e, i)}
                  onDrop={e => handleDrop(e, i)}
                  onDragEnd={handleDragEnd}
                >
                  <div className="flex items-start gap-1.5 mb-1.5">
                    {!isCompleted && (
                      <GripVertical size={12} className="text-gray-300 mt-0.5 cursor-grab flex-shrink-0" />
                    )}
                    <span className="text-[10px] text-gray-400 mt-0.5 w-3 text-right flex-shrink-0">{i + 1}.</span>
                    <span className={`text-xs font-medium text-gray-800 flex-1 ${isCompletedFollowup ? 'line-through text-gray-500' : ''}`}>
                      {item.label}
                    </span>
                    {getSourceBadge(item)}
                    {item.snoozed && (
                      <span className="badge bg-gray-100 text-gray-500 text-[9px] flex-shrink-0">Snoozed</span>
                    )}
                  </div>
                  {item.snoozed ? (
                    <p className="text-[10px] text-gray-400 italic">Snoozed — will reappear in next meeting</p>
                  ) : (
                    <>
                      <textarea
                        value={item.notes}
                        onChange={e => updateAgendaNote(i, e.target.value)}
                        placeholder="Notes..."
                        rows={1}
                        className="input-field text-xs"
                        disabled={isCompleted}
                      />
                      <div className="flex items-center justify-between mt-1">
                        <div className="flex gap-1 flex-wrap">
                          {itemTags.map(tag => (
                            <span key={tag.id} className="inline-flex items-center gap-0.5 badge bg-indigo-50 text-indigo-600 text-[9px]">
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
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {!isCompleted && item.source === 'ongoing_task' && (
                            <button onClick={() => handleDismissOngoingTask(i)} className="flex items-center gap-0.5 text-[10px] text-amber-500 hover:text-amber-700">
                              <X size={10} /> Dismiss
                            </button>
                          )}
                          {!isCompleted && item.source === 'ministering_plan' && (
                            <button onClick={() => handleCompleteMinisteringPlan(i)} className="flex items-center gap-0.5 text-[10px] text-teal-500 hover:text-teal-700">
                              <CheckCircle2 size={10} /> Complete
                            </button>
                          )}
                          {!isCompleted && item.source === 'calling_pipeline' && (
                            <button onClick={() => snoozeAgendaItem(i)} className="flex items-center gap-0.5 text-[10px] text-amber-500 hover:text-amber-700">
                              <Clock size={10} /> Snooze
                            </button>
                          )}
                          {!isCompleted && item.notes?.trim() && (
                            <button onClick={() => openTagPicker(i)} className="flex items-center gap-0.5 text-[10px] text-indigo-500 hover:text-indigo-700">
                              <ArrowUpRight size={10} /> Tag
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Prior Tasks button when no agenda items */}
      {!isSacrament && agendaItems.length === 0 && !isCompleted && (
        <div className="mb-6">
          <button
            onClick={() => setShowPriorTasks(true)}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:text-primary-600 hover:border-primary-200 transition-colors"
          >
            <ListPlus size={16} /> Add Prior Tasks
          </button>
        </div>
      )}

      {/* General notes */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-3">
          <MessageSquare size={14} className="text-primary-600" />
          General Notes
        </h2>
        <textarea
          value={notes}
          onChange={e => updateNotes(e.target.value)}
          placeholder="Meeting notes, impressions, follow-up thoughts..."
          rows={4}
          className="input-field"
          disabled={isCompleted}
        />
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex gap-1 flex-wrap">
            {generalNoteTags.map(tag => (
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
          {!isCompleted && notes.trim() && (
            <button onClick={openGeneralTagPicker} className="flex items-center gap-0.5 text-[10px] text-indigo-500 hover:text-indigo-700 flex-shrink-0">
              <ArrowUpRight size={10} /> Tag for another meeting
            </button>
          )}
        </div>
      </div>

      {/* Focus Families */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
            <Users2 size={14} className="text-primary-600" />
            Focus Families / Individuals
          </h2>
          {!isCompleted && (
            <button onClick={addFocusFamily} className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800">
              <Plus size={14} /> Add
            </button>
          )}
        </div>
        {focusFamilies.length === 0 && (
          <p className="text-xs text-gray-400">No focus families or individuals added yet.</p>
        )}
        {focusFamilies.length > 0 && (
          <div className="space-y-2">
            {focusFamilies.map((ff, i) => (
              <div key={i} className="card !p-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <input type="text" value={ff.name} onChange={e => updateFocusFamily(i, 'name', e.target.value)} placeholder="Family or individual name..." className="input-field text-xs flex-1 !py-1" disabled={isCompleted} />
                  {!isCompleted && (
                    <button onClick={() => removeFocusFamily(i)} className="text-gray-400 hover:text-red-500 flex-shrink-0"><Trash2 size={12} /></button>
                  )}
                </div>
                <textarea value={ff.notes} onChange={e => updateFocusFamily(i, 'notes', e.target.value)} placeholder="Discussion notes..." rows={1} className="input-field text-xs" disabled={isCompleted} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action items */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Action Items ({actionItemIds.length})</h2>
          {!isCompleted && (
            <button onClick={() => setQuickActionOpen(true)} className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800">
              <Plus size={14} /> Quick Add
            </button>
          )}
        </div>
        {actionItemIds.length === 0 && <p className="text-xs text-gray-400">No action items from this meeting yet.</p>}
        {actionItemIds.length > 0 && (
          <p className="text-xs text-gray-500">{actionItemIds.length} action item{actionItemIds.length !== 1 ? 's' : ''} created. View them on the Actions tab.</p>
        )}
      </div>

      {/* Tags summary */}
      {instanceTags.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-2">
            <ArrowUpRight size={14} className="text-indigo-500" />
            Tagged Notes ({instanceTags.length})
          </h2>
          <p className="text-xs text-gray-500">{instanceTags.length} note{instanceTags.length !== 1 ? 's' : ''} tagged for other meetings.</p>
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
      {!isCompleted && (
        <div className="flex gap-3">
          <button onClick={handleSave} disabled={!dirty || saving} className="btn-secondary flex-1 flex items-center justify-center gap-1.5">
            <Save size={16} /> {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button onClick={handleFinalize} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
            <CheckCircle2 size={16} /> Finalize
          </button>
        </div>
      )}

      {/* Quick action item modal */}
      <Modal open={quickActionOpen} onClose={() => setQuickActionOpen(false)} title="Quick Action Item" size="sm">
        <div className="space-y-3">
          <input type="text" value={actionTitle} onChange={e => setActionTitle(e.target.value)} placeholder="What needs to be done?" className="input-field" autoFocus />
          <p className="text-xs text-gray-400">Creates a basic action item linked to this meeting.</p>
          <div className="flex gap-3">
            <button onClick={handleCreateAction} disabled={!actionTitle.trim()} className="btn-primary flex-1">Create</button>
            <button onClick={() => setQuickActionOpen(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Meeting tag picker */}
      <MeetingPicker open={tagPickerOpen} onClose={() => setTagPickerOpen(false)} onSelect={handleTagMeeting} excludeIds={[instance.meetingId]} title="Tag for Meeting" />

      {/* Add Prior Tasks modal */}
      {showPriorTasks && (
        <AddPriorTasksModal
          onClose={() => setShowPriorTasks(false)}
          onAdd={handleAddPriorItems}
          currentMeetingId={meetingId || instance.meetingId}
        />
      )}
    </div>
  );
}
