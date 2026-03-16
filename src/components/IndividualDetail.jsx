import { useState, useMemo } from 'react';
import { useIndividualNotes, useTasksForIndividual, useMeetings } from '../hooks/useDb';
import { addTask, updateTask, deleteTask, archiveIndividual, unarchiveIndividual } from '../db';
import { isCheckInOverdue, getDaysUntilCheckIn, CADENCES } from '../utils/constants';
import IndividualForm from './IndividualForm';
import IndividualNoteEditor from './IndividualNoteEditor';
import ActionItemForm from './ActionItemForm';
import MeetingPicker from './shared/MeetingPicker';
import {
  ArrowLeft, Edit3, UserRound, Target, Clock, AlertTriangle,
  Plus, CheckCircle2, Circle, Archive, ArchiveRestore,
  Calendar, ChevronRight, Star, Trash2, Users,
} from 'lucide-react';

const STATUS_ICONS = {
  not_started: { icon: Circle, color: 'text-gray-300' },
  in_progress: { icon: Clock, color: 'text-blue-500' },
  waiting: { icon: Clock, color: 'text-yellow-500' },
  complete: { icon: CheckCircle2, color: 'text-green-500' },
};

export default function IndividualDetail({ individual, onBack, onUpdated }) {
  const [editFormOpen, setEditFormOpen] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [addTaskFormOpen, setAddTaskFormOpen] = useState(false);
  const [editTaskItem, setEditTaskItem] = useState(null);
  const [addToMeetingOpen, setAddToMeetingOpen] = useState(false);

  const { notes, remove: removeNote } = useIndividualNotes(individual?.id);
  const { tasks: linkedTasks } = useTasksForIndividual(individual?.id);
  const { meetings: allMeetings } = useMeetings();

  const linkedMeetings = useMemo(() => {
    if (!allMeetings || !individual?.meetingIds) return [];
    return allMeetings.filter(m => (individual.meetingIds || []).includes(m.id));
  }, [allMeetings, individual?.meetingIds]);

  if (!individual) return null;

  const checkInOverdue = isCheckInOverdue(individual.lastCheckIn, individual.checkInCadence);
  const daysUntil = getDaysUntilCheckIn(individual.lastCheckIn, individual.checkInCadence);
  const cadenceLabel = CADENCES[individual.checkInCadence]?.label || individual.checkInCadence;

  function getCheckInLabel() {
    if (!individual.checkInCadence) return null;
    if (!individual.lastCheckIn) return 'No check-in yet';
    if (daysUntil === null) return null;
    if (daysUntil < 0) return `${Math.abs(daysUntil)} days overdue`;
    if (daysUntil === 0) return 'Check-in due today';
    return `Next check-in in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`;
  }

  async function handleSaveIndividual(data, id) {
    if (id) {
      await updateTask(id, data);
    } else {
      await addTask(data);
    }
    if (onUpdated) onUpdated();
  }

  async function handleArchive() {
    await archiveIndividual(individual.id);
    if (onUpdated) onUpdated();
    onBack();
  }

  async function handleUnarchive() {
    await unarchiveIndividual(individual.id);
    if (onUpdated) onUpdated();
  }

  async function handleSaveTask(data, id) {
    if (id) {
      await updateTask(id, data);
    } else {
      await addTask({ ...data, individualId: individual.id });
    }
  }

  async function handleDeleteTask(id) {
    await deleteTask(id);
  }

  function handleToggleTaskStatus(task) {
    const nextStatus = task.status === 'complete' ? 'not_started' :
      task.status === 'not_started' ? 'in_progress' : 'complete';
    updateTask(task.id, { status: nextStatus });
  }

  function formatDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatRelativeDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const now = new Date();
    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 pt-5 pb-24 max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <div className="flex items-center gap-2">
            {individual.isArchived && (
              <button
                onClick={handleUnarchive}
                className="flex items-center gap-1 px-2 py-1 text-xs text-cyan-600 hover:text-cyan-700 transition-colors"
              >
                <ArchiveRestore size={12} />
                Restore
              </button>
            )}
            <button
              onClick={() => setEditFormOpen(true)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Edit3 size={16} />
            </button>
          </div>
        </div>

        {/* Name */}
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-xl bg-cyan-50 border border-cyan-100">
            <UserRound size={22} className="text-cyan-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">{individual.title}</h1>
            {individual.description && (
              <p className="text-xs text-gray-500 mt-0.5">{individual.description}</p>
            )}
            {individual.isArchived && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded-full mt-1">
                <Archive size={10} />
                Archived
              </span>
            )}
          </div>
        </div>

        {/* Goal Card — Next Ordinance */}
        {individual.nextOrdinance && (
          <div className="mb-4 bg-gradient-to-r from-cyan-50 to-cyan-50/50 border border-cyan-200 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <Target size={14} className="text-cyan-600 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-cyan-500 uppercase tracking-wider">Next Ordinance</p>
                <p className="text-sm font-semibold text-cyan-800">{individual.nextOrdinance}</p>
              </div>
            </div>
          </div>
        )}

        {/* Fellowshippers */}
        {individual.fellowshippers && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-100 bg-white">
            <Users size={14} className="text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Fellowshippers</p>
              <p className="text-xs text-gray-700">{individual.fellowshippers}</p>
            </div>
          </div>
        )}

        {/* Check-in Status */}
        {individual.checkInCadence && (
          <div className={`mb-4 flex items-center gap-2 px-3 py-2 rounded-xl border ${
            checkInOverdue
              ? 'bg-red-50/50 border-red-200'
              : 'bg-white border-gray-100'
          }`}>
            {checkInOverdue ? (
              <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
            ) : (
              <Clock size={14} className="text-gray-400 flex-shrink-0" />
            )}
            <div className="flex-1">
              <p className={`text-xs font-medium ${checkInOverdue ? 'text-red-700' : 'text-gray-700'}`}>
                {getCheckInLabel()}
              </p>
              <p className="text-[10px] text-gray-400">
                {cadenceLabel} check-ins
                {individual.lastCheckIn && ` · Last: ${formatDate(individual.lastCheckIn)}`}
              </p>
            </div>
          </div>
        )}

        {/* Action Items Section */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-primary-500" />
              Action Items
            </h2>
            <button
              onClick={() => { setEditTaskItem(null); setAddTaskFormOpen(true); }}
              className="text-[11px] text-primary-600 flex items-center gap-0.5 hover:text-primary-700"
            >
              <Plus size={12} /> Add
            </button>
          </div>

          {linkedTasks.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3 border border-dashed border-gray-200 rounded-xl">
              No action items yet
            </p>
          ) : (
            <div className="space-y-1">
              {linkedTasks.map(task => {
                const StatusIcon = STATUS_ICONS[task.status]?.icon || Circle;
                const statusColor = STATUS_ICONS[task.status]?.color || 'text-gray-300';
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50 cursor-pointer group"
                    onClick={() => { setEditTaskItem(task); setAddTaskFormOpen(true); }}
                  >
                    <button
                      onClick={e => { e.stopPropagation(); handleToggleTaskStatus(task); }}
                      className="flex-shrink-0"
                    >
                      <StatusIcon size={14} className={statusColor} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs truncate block ${task.status === 'complete' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                        {task.title}
                      </span>
                      {task.followUpNotes?.length > 0 && (
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">
                          {task.followUpNotes[task.followUpNotes.length - 1].text}
                          {task.followUpNotes[task.followUpNotes.length - 1].date && (
                            <span className="text-gray-300 ml-1">
                              · {formatRelativeDate(task.followUpNotes[task.followUpNotes.length - 1].date)}
                            </span>
                          )}
                        </p>
                      )}
                      {!task.followUpNotes?.length && task.updatedAt && (
                        <p className="text-[10px] text-gray-300 mt-0.5">Updated {formatRelativeDate(task.updatedAt)}</p>
                      )}
                    </div>
                    {task.starred && <Star size={10} className="text-amber-400 fill-amber-400 flex-shrink-0" />}
                    {task.dueDate && (
                      <span className="text-[10px] text-gray-400 flex-shrink-0">{task.dueDate}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Notes & Updates Section */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Edit3 size={12} className="text-cyan-500" />
              Notes & Updates
            </h2>
            {!addingNote && (
              <button
                onClick={() => setAddingNote(true)}
                className="text-[11px] text-cyan-600 flex items-center gap-0.5 hover:text-cyan-700"
              >
                <Plus size={12} /> Add Update
              </button>
            )}
          </div>

          {/* New note editor */}
          {addingNote && (
            <div className="mb-3">
              <IndividualNoteEditor
                individualId={individual.id}
                onSaved={() => setAddingNote(false)}
                onCancel={() => setAddingNote(false)}
              />
            </div>
          )}

          {/* Past notes */}
          {notes.length === 0 && !addingNote ? (
            <button
              onClick={() => setAddingNote(true)}
              className="w-full text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl py-4 hover:border-cyan-300 hover:text-cyan-600 transition-colors"
            >
              + Add your first update
            </button>
          ) : (
            <div className="space-y-3">
              {notes.map(note => (
                <div key={note.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* Note header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50/50 border-b border-gray-100">
                    <span className="text-[10px] text-gray-400 font-medium">
                      {formatRelativeDate(note.createdAt)}
                    </span>
                    <div className="flex items-center gap-1">
                      {editingNoteId !== note.id && (
                        <button
                          onClick={() => setEditingNoteId(note.id)}
                          className="text-[10px] text-gray-400 hover:text-cyan-600 px-1.5 py-0.5 rounded transition-colors"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          if (window.confirm('Delete this update?')) {
                            await removeNote(note.id);
                          }
                        }}
                        className="text-gray-300 hover:text-red-500 p-0.5 transition-colors"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>

                  {/* Note content */}
                  {editingNoteId === note.id ? (
                    <div className="p-2">
                      <IndividualNoteEditor
                        individualId={individual.id}
                        note={note}
                        onSaved={() => setEditingNoteId(null)}
                        onCancel={() => setEditingNoteId(null)}
                      />
                    </div>
                  ) : (
                    <div
                      className="px-3 py-2 text-sm text-gray-700 prose prose-sm max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1"
                      dangerouslySetInnerHTML={{ __html: note.html || '<p class="text-gray-400 italic">Empty note</p>' }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Linked Meetings */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={12} className="text-indigo-500" />
              Linked Meetings
            </h2>
            <button
              onClick={() => setAddToMeetingOpen(true)}
              className="text-[11px] text-indigo-600 flex items-center gap-0.5 hover:text-indigo-700"
            >
              <Plus size={12} /> Add to Meeting
            </button>
          </div>
          {linkedMeetings.length > 0 ? (
            <div className="space-y-1.5">
              {linkedMeetings.map(m => (
                <div
                  key={m.id}
                  className="flex items-center gap-2.5 p-2 rounded-xl border border-gray-100 bg-white"
                >
                  <div className="p-1.5 rounded-lg bg-indigo-50">
                    <Calendar size={12} className="text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                  </div>
                  <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-3 border border-dashed border-gray-200 rounded-xl">
              Not linked to any meetings yet
            </p>
          )}
        </div>

        {/* Add to Meeting picker */}
        <MeetingPicker
          open={addToMeetingOpen}
          onClose={() => setAddToMeetingOpen(false)}
          onSelect={async (mtg) => {
            const currentIds = individual.meetingIds || [];
            if (!currentIds.includes(mtg.id)) {
              await updateTask(individual.id, { meetingIds: [...currentIds, mtg.id] });
              if (onUpdated) onUpdated();
            }
          }}
          excludeIds={individual.meetingIds || []}
          title="Add to Meeting"
        />

        {/* Archive/Unarchive button */}
        {!individual.isArchived && (
          <button
            onClick={handleArchive}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-amber-600 py-3 border border-dashed border-gray-200 rounded-xl hover:border-amber-300 transition-colors"
          >
            <Archive size={12} />
            Remove from Focus List
          </button>
        )}
      </div>

      {/* Edit Individual Form */}
      <IndividualForm
        open={editFormOpen}
        onClose={() => setEditFormOpen(false)}
        onSave={handleSaveIndividual}
        onArchive={handleArchive}
        item={individual}
      />

      {/* Action Item Form */}
      <ActionItemForm
        open={addTaskFormOpen}
        onClose={() => { setAddTaskFormOpen(false); setEditTaskItem(null); }}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        item={editTaskItem}
      />
    </div>
  );
}
