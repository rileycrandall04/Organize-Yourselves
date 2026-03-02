import { useState } from 'react';
import { useMeetingInstances, useMeetingNoteTags, useTasksForMeeting, useTasks } from '../hooks/useDb';
import { buildAutoAgenda, buildAutoAgendaBlocks, getUnresolvedActionItems, updateMeeting, updateMeetingInstance, deleteMeetingInstance, deleteMeetingWithInstances, addTask } from '../db';
import { MEETING_CADENCES, formatCadenceLabel, normalizeCadence } from '../data/callings';
import { todayStr, formatMeetingDate } from '../utils/dates';
import { MEETING_STATUSES } from '../utils/constants';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft, Calendar, Plus, Clock, CheckCircle2, ListChecks, FileText,
  ArrowUpRight, RotateCw, Pencil, Trash2, Target, Heart, ClipboardList,
  Check, Save,
} from 'lucide-react';
import MeetingNotes from './MeetingNotes';
import AddMeetingForm from './AddMeetingForm';
import Modal from './shared/Modal';

const cadenceOptions = Object.entries(MEETING_CADENCES);

export default function MeetingDetail({ meeting, onBack, onMeetingDeleted }) {
  const { instances, loading, add: addInstance } = useMeetingInstances(meeting.id);
  const { tags: pendingTags } = useMeetingNoteTags(meeting.id);
  const { tasks: ongoingTasks } = useTasksForMeeting(meeting.id);
  const { tasks: ministeringPlans } = useTasks({ type: 'ministering_plan', excludeComplete: true });
  const [activeInstance, setActiveInstance] = useState(null);
  const [creating, setCreating] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [editingCadence, setEditingCadence] = useState(false);
  const [cadenceSelection, setCadenceSelection] = useState([]);
  const [editingAgenda, setEditingAgenda] = useState(false);
  const [agendaEditItems, setAgendaEditItems] = useState([]);
  const [showAddPreMeetingTask, setShowAddPreMeetingTask] = useState(false);
  const [preMeetingTaskTitle, setPreMeetingTaskTitle] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newPlanPerson, setNewPlanPerson] = useState('');
  const [newPlanFamily, setNewPlanFamily] = useState('');
  const [newPlanDesc, setNewPlanDesc] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customDate, setCustomDate] = useState(todayStr());

  // Get unresolved action items from last instance (for pending count)
  const unresolvedItems = useLiveQuery(
    () => getUnresolvedActionItems(meeting.id),
    [meeting.id]
  ) ?? [];

  const cadenceLabel = formatCadenceLabel(meeting.cadence);
  const agendaTemplate = meeting.agendaTemplate || [];
  const pendingCount = pendingTags.length + unresolvedItems.length;
  const isCustom = meeting.source === 'custom';

  const isSacrament = meeting.name === 'Sacrament Meeting';

  async function handleNewInstance(date) {
    if (creating) return;
    setCreating(true);
    setShowDatePicker(false);
    try {
      const instanceDate = date || todayStr();
      const newInstance = {
        meetingId: meeting.id,
        date: instanceDate,
        notes: '',
        actionItemIds: [],
        attendees: [],
        status: 'scheduled',
      };

      if (isSacrament) {
        newInstance.agendaItems = [];
        newInstance.programData = {
          presiding: '',
          conducting: '',
          announcements: '',
          openingHymn: '',
          invocation: '',
          wardBusiness: '',
          sacramentHymn: '',
          speakers: [
            { name: '', topic: '' },
            { name: '', topic: '' },
          ],
          musicalNumber: '',
          intermediateHymn: '',
          closingHymn: '',
          benediction: '',
          notes: '',
        };
      } else {
        // Build block-based agenda for the new instance
        const autoBlocks = await buildAutoAgendaBlocks(meeting.id);
        newInstance.blocks = autoBlocks;
        // Keep legacy agendaItems for backward compatibility during transition
        const autoAgenda = await buildAutoAgenda(meeting.id, instanceDate);
        newInstance.agendaItems = autoAgenda;
      }

      const id = await addInstance(newInstance);
      setActiveInstance({ id, ...newInstance });
    } finally {
      setCreating(false);
    }
  }

  async function handleEditSave(meetingData) {
    const { id, ...changes } = meetingData;
    await updateMeeting(meeting.id, changes);
    Object.assign(meeting, changes);
  }

  async function handleCadenceChange(newCadence) {
    await updateMeeting(meeting.id, { cadence: newCadence });
    meeting.cadence = newCadence;
    setEditingCadence(false);
  }

  function startEditingCadence() {
    setCadenceSelection(normalizeCadence(meeting.cadence));
    setEditingCadence(true);
  }

  function toggleCadenceChip(key) {
    setCadenceSelection(prev => {
      if (prev.includes(key)) {
        const next = prev.filter(c => c !== key);
        return next.length > 0 ? next : prev;
      }
      return [...prev, key];
    });
  }

  function startEditingAgenda() {
    setAgendaEditItems([...(meeting.agendaTemplate || []), '']);
    setEditingAgenda(true);
  }

  async function saveAgendaTemplate() {
    const filtered = agendaEditItems.filter(a => a.trim());
    await updateMeeting(meeting.id, { agendaTemplate: filtered });
    meeting.agendaTemplate = filtered;
    setEditingAgenda(false);
  }

  async function handleAddPreMeetingTask() {
    if (!preMeetingTaskTitle.trim()) return;
    const pending = meeting.pendingAgendaItems || [];
    const updated = [...pending, { label: preMeetingTaskTitle.trim(), notes: '' }];
    await updateMeeting(meeting.id, { pendingAgendaItems: updated });
    meeting.pendingAgendaItems = updated;
    setPreMeetingTaskTitle('');
    setShowAddPreMeetingTask(false);
  }

  async function handleRemovePreMeetingTask(index) {
    const pending = meeting.pendingAgendaItems || [];
    const updated = pending.filter((_, i) => i !== index);
    await updateMeeting(meeting.id, { pendingAgendaItems: updated });
    meeting.pendingAgendaItems = updated;
  }

  async function handleDelete() {
    await deleteMeetingWithInstances(meeting.id);
    onMeetingDeleted?.();
  }

  async function handleAddTask() {
    if (!newTaskTitle.trim()) return;
    await addTask({ type: 'ongoing', meetingIds: [meeting.id], title: newTaskTitle.trim() });
    setNewTaskTitle('');
    setShowAddTask(false);
  }

  async function handleAddPlan() {
    if (!newPlanPerson.trim()) return;
    await addTask({
      type: 'ministering_plan',
      title: newPlanPerson.trim() + (newPlanFamily.trim() ? ` ${newPlanFamily.trim()} Family` : ''),
      personName: newPlanPerson.trim(),
      familyName: newPlanFamily.trim() || null,
      description: newPlanDesc.trim() || '',
    });
    setNewPlanPerson('');
    setNewPlanFamily('');
    setNewPlanDesc('');
    setShowAddPlan(false);
  }

  if (activeInstance) {
    return (
      <MeetingNotes
        instance={activeInstance}
        meetingName={meeting.name}
        meetingId={meeting.id}
        participants={meeting.participants}
        onBack={() => setActiveInstance(null)}
      />
    );
  }

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      {/* Header */}
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary-600 mb-4">
        <ArrowLeft size={16} />
        Back to Meetings
      </button>

      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{meeting.name}</h1>
            {isCustom && (
              <span className="text-[10px] font-medium text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">
                Custom
              </span>
            )}
          </div>
          {editingCadence ? (
            <div className="mt-1.5">
              <div className="flex flex-wrap gap-1">
                {cadenceOptions.map(([key, label]) => {
                  const selected = cadenceSelection.includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() => toggleCadenceChip(key)}
                      className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                        selected
                          ? 'bg-primary-100 border-primary-300 text-primary-700 font-medium'
                          : 'bg-white border-gray-200 text-gray-400 hover:border-primary-200'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => handleCadenceChange(cadenceSelection)}
                className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800 mt-1.5"
              >
                <Check size={12} /> Done
              </button>
            </div>
          ) : (
            <button
              onClick={startEditingCadence}
              className="text-sm text-gray-500 mt-1 hover:text-primary-600 hover:underline transition-colors"
              title="Click to change frequency"
            >
              {cadenceLabel}
            </button>
          )}
          {meeting.participants?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {meeting.participants.map((p, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                  {p.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowEditForm(true)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            title="Edit meeting"
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
            title="Delete meeting"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="card bg-red-50 border-red-200 mb-5 p-4">
          <p className="text-sm font-medium text-red-800 mb-1">Delete this meeting?</p>
          <p className="text-xs text-red-600 mb-3">
            This will permanently delete the meeting and all {instances.length} recorded instance{instances.length !== 1 ? 's' : ''}.
          </p>
          {!isCustom && (
            <p className="text-xs text-red-500 mb-3 italic">
              This meeting was auto-created from your calling. You can re-create it from Settings.
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
            >
              Delete Meeting
            </button>
          </div>
        </div>
      )}

      {/* Pending items for next meeting */}
      {pendingCount > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-3">
            <RotateCw size={14} className="text-amber-500" />
            Pending for Next Meeting ({pendingCount})
          </h2>
          <div className="space-y-2">
            {unresolvedItems.map(item => (
              <div key={item.id} className="card bg-amber-50 border-amber-100 py-2.5 px-3">
                <span className="badge bg-amber-100 text-amber-700 text-[10px] mb-1">Carry Forward</span>
                <p className="text-xs text-gray-800">{item.title}</p>
              </div>
            ))}
            {pendingTags.map(tag => (
              <div key={tag.id} className="card bg-indigo-50 border-indigo-100 py-2.5 px-3">
                <span className="badge bg-indigo-100 text-indigo-700 text-[10px] mb-1">
                  <ArrowUpRight size={8} className="inline mr-0.5" />
                  Tagged Note
                </span>
                <p className="text-xs text-gray-800">
                  {tag.text.length > 80 ? tag.text.substring(0, 80) + '...' : tag.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pre-Meeting Tasks */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
            <ClipboardList size={14} className="text-blue-600" />
            Pre-Meeting Tasks ({(meeting.pendingAgendaItems || []).length})
          </h2>
          <button
            onClick={() => setShowAddPreMeetingTask(true)}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
        {(meeting.pendingAgendaItems || []).length === 0 ? (
          <p className="text-xs text-gray-400">Add items here before starting a meeting. They'll auto-populate the agenda.</p>
        ) : (
          <div className="space-y-2">
            {(meeting.pendingAgendaItems || []).map((item, i) => (
              <div key={i} className="card !p-2.5 border-l-2 border-l-blue-300 flex items-center justify-between">
                <p className="text-xs font-medium text-gray-800">{item.label}</p>
                <button
                  onClick={() => handleRemovePreMeetingTask(i)}
                  className="text-gray-400 hover:text-red-500 flex-shrink-0 ml-2"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ongoing Tasks */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
            <Target size={14} className="text-green-600" />
            Ongoing Tasks ({ongoingTasks.length})
          </h2>
          <button
            onClick={() => setShowAddTask(true)}
            className="flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-800"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
        {ongoingTasks.length === 0 ? (
          <p className="text-xs text-gray-400">No ongoing tasks. Tasks appear on every agenda until dismissed.</p>
        ) : (
          <div className="space-y-2">
            {ongoingTasks.map(task => (
              <div key={task.id} className="card !p-2.5 border-l-2 border-l-green-300">
                <p className="text-xs font-medium text-gray-800">{task.title}</p>
                {task.updates?.length > 0 && (
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Last update: {new Date(task.updates[task.updates.length - 1].date).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ministering Plans */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
            <Heart size={14} className="text-teal-600" />
            Ministering Plans ({ministeringPlans.length})
          </h2>
          <button
            onClick={() => setShowAddPlan(true)}
            className="flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-800"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
        {ministeringPlans.length === 0 ? (
          <p className="text-xs text-gray-400">No ministering plans. Plans appear on all meeting agendas until completed.</p>
        ) : (
          <div className="space-y-2">
            {ministeringPlans.map(plan => (
              <div key={plan.id} className="card !p-2.5 border-l-2 border-l-teal-300">
                <p className="text-xs font-medium text-gray-800">
                  {plan.personName}{plan.familyName ? ` ${plan.familyName} Family` : ''}
                </p>
                {plan.description && (
                  <p className="text-[10px] text-gray-500 mt-0.5">{plan.description}</p>
                )}
                {plan.updates?.length > 0 && (
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Last update: {new Date(plan.updates[plan.updates.length - 1].date).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agenda template */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
            <ListChecks size={14} className="text-primary-600" />
            Agenda Template
          </h2>
          {editingAgenda ? (
            <button
              onClick={saveAgendaTemplate}
              className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800"
            >
              <Save size={14} /> Save
            </button>
          ) : (
            <button
              onClick={startEditingAgenda}
              className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-primary-600"
            >
              <Pencil size={12} /> Edit
            </button>
          )}
        </div>
        {editingAgenda ? (
          <div className="space-y-2">
            {agendaEditItems.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-4 text-right flex-shrink-0">{i + 1}.</span>
                <input
                  type="text"
                  value={item}
                  onChange={e => {
                    const updated = [...agendaEditItems];
                    updated[i] = e.target.value;
                    setAgendaEditItems(updated);
                  }}
                  placeholder="Agenda item..."
                  className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-300"
                />
                {agendaEditItems.length > 1 && (
                  <button
                    onClick={() => setAgendaEditItems(prev => prev.filter((_, idx) => idx !== i))}
                    className="p-1 text-gray-300 hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setAgendaEditItems(prev => [...prev, ''])}
              className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-medium mt-1"
            >
              <Plus size={12} /> Add item
            </button>
          </div>
        ) : agendaTemplate.length > 0 ? (
          <div className="card">
            <ol className="space-y-1.5">
              {agendaTemplate.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-xs text-gray-400 mt-0.5 w-4 text-right flex-shrink-0">{i + 1}.</span>
                  {item}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="text-xs text-gray-400">No agenda template. Tap Edit to add recurring agenda items.</p>
        )}
      </div>

      {/* Past instances */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
            <FileText size={14} className="text-primary-600" />
            Meeting History
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleNewInstance()}
              disabled={creating}
              className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800"
            >
              <Plus size={14} />
              Today
              {pendingCount > 0 && (
                <span className="ml-1 bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                  {pendingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => { setCustomDate(todayStr()); setShowDatePicker(true); }}
              disabled={creating}
              className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-primary-600"
              title="Add meeting for a specific date"
            >
              <Calendar size={14} />
              Other Date
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-400">
            <div className="animate-spin w-5 h-5 border-2 border-primary-300 border-t-primary-700 rounded-full mx-auto mb-2" />
            <p className="text-xs">Loading...</p>
          </div>
        ) : instances.length === 0 ? (
          <div className="card text-center py-8 text-gray-400">
            <Calendar size={32} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No meetings recorded yet.</p>
            <div className="flex items-center justify-center gap-2 mt-3">
              <button
                onClick={() => handleNewInstance()}
                disabled={creating}
                className="btn-primary text-sm"
              >
                <Plus size={14} className="inline mr-1" />
                Start Today
              </button>
              <button
                onClick={() => { setCustomDate(todayStr()); setShowDatePicker(true); }}
                disabled={creating}
                className="btn-secondary text-sm"
              >
                <Calendar size={14} className="inline mr-1" />
                Other Date
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {instances.map(inst => (
              <InstanceCard
                key={inst.id}
                instance={inst}
                onPress={() => setActiveInstance(inst)}
                onDelete={async () => {
                  await deleteMeetingInstance(inst.id);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit form modal */}
      {showEditForm && (
        <AddMeetingForm
          editMeeting={meeting}
          onSave={handleEditSave}
          onClose={() => setShowEditForm(false)}
        />
      )}

      {/* Add Ongoing Task modal */}
      <Modal open={showAddTask} onClose={() => setShowAddTask(false)} title="Add Ongoing Task" size="sm">
        <div className="space-y-3">
          <input
            type="text"
            value={newTaskTitle}
            onChange={e => setNewTaskTitle(e.target.value)}
            placeholder="Task or project name..."
            className="input-field"
            autoFocus
          />
          <p className="text-xs text-gray-400">This task will appear on every agenda for this meeting until dismissed.</p>
          <div className="flex gap-3">
            <button onClick={handleAddTask} disabled={!newTaskTitle.trim()} className="btn-primary flex-1">Create</button>
            <button onClick={() => setShowAddTask(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Add Ministering Plan modal */}
      <Modal open={showAddPlan} onClose={() => setShowAddPlan(false)} title="Add Ministering Plan" size="sm">
        <div className="space-y-3">
          <input
            type="text"
            value={newPlanPerson}
            onChange={e => setNewPlanPerson(e.target.value)}
            placeholder="Individual name..."
            className="input-field"
            autoFocus
          />
          <input
            type="text"
            value={newPlanFamily}
            onChange={e => setNewPlanFamily(e.target.value)}
            placeholder="Family name (optional)..."
            className="input-field"
          />
          <textarea
            value={newPlanDesc}
            onChange={e => setNewPlanDesc(e.target.value)}
            placeholder="What service is planned? (optional)"
            rows={2}
            className="input-field"
          />
          <p className="text-xs text-gray-400">This plan will appear on ALL meeting agendas until completed.</p>
          <div className="flex gap-3">
            <button onClick={handleAddPlan} disabled={!newPlanPerson.trim()} className="btn-primary flex-1">Create</button>
            <button onClick={() => setShowAddPlan(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Add Pre-Meeting Task modal */}
      <Modal open={showAddPreMeetingTask} onClose={() => setShowAddPreMeetingTask(false)} title="Add Pre-Meeting Task" size="sm">
        <div className="space-y-3">
          <input
            type="text"
            value={preMeetingTaskTitle}
            onChange={e => setPreMeetingTaskTitle(e.target.value)}
            placeholder="Topic or agenda item..."
            className="input-field"
            autoFocus
          />
          <p className="text-xs text-gray-400">This item will be added to the agenda when you start a new meeting.</p>
          <div className="flex gap-3">
            <button onClick={handleAddPreMeetingTask} disabled={!preMeetingTaskTitle.trim()} className="btn-primary flex-1">Add</button>
            <button onClick={() => setShowAddPreMeetingTask(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Date picker modal for historical meetings */}
      <Modal open={showDatePicker} onClose={() => setShowDatePicker(false)} title="Select Meeting Date" size="sm">
        <div className="space-y-3">
          <input
            type="date"
            value={customDate}
            onChange={e => setCustomDate(e.target.value)}
            className="input-field"
            autoFocus
          />
          <p className="text-xs text-gray-400">
            Select a date to record a past or future meeting. Carry-forward items from the most recent prior meeting will be auto-populated.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => handleNewInstance(customDate)}
              disabled={!customDate || creating}
              className="btn-primary flex-1"
            >
              Create Meeting
            </button>
            <button onClick={() => setShowDatePicker(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function InstanceCard({ instance, onPress, onDelete }) {
  const statusConfig = MEETING_STATUSES[instance.status] || MEETING_STATUSES.scheduled;
  const isCompleted = instance.status === 'completed';
  const StatusIcon = isCompleted ? CheckCircle2 : Clock;
  const [editingDate, setEditingDate] = useState(false);
  const [editDate, setEditDate] = useState(instance.date);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDateSave(e) {
    e.stopPropagation();
    if (editDate && editDate !== instance.date) {
      await updateMeetingInstance(instance.id, { date: editDate });
      instance.date = editDate;
    }
    setEditingDate(false);
  }

  if (confirmDelete) {
    return (
      <div className="card bg-red-50 border-red-200 p-3" onClick={e => e.stopPropagation()}>
        <p className="text-xs font-medium text-red-800 mb-1">
          Delete meeting from {formatMeetingDate(instance.date)}?
        </p>
        <p className="text-[10px] text-red-600 mb-2">This will permanently remove this meeting instance and its notes.</p>
        <div className="flex gap-2">
          <button
            onClick={() => setConfirmDelete(false)}
            className="px-2.5 py-1 text-[11px] font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onDelete?.()}
            className="px-2.5 py-1 text-[11px] font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onPress}
      className="card flex items-center gap-3 cursor-pointer hover:border-primary-200 transition-colors group"
    >
      <StatusIcon
        size={18}
        className={isCompleted ? 'text-green-500 flex-shrink-0' : 'text-gray-400 flex-shrink-0'}
      />
      <div className="flex-1 min-w-0">
        {editingDate ? (
          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
            <input
              type="date"
              value={editDate}
              onChange={e => setEditDate(e.target.value)}
              className="text-sm border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-300"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleDateSave(e); if (e.key === 'Escape') setEditingDate(false); }}
            />
            <button onClick={handleDateSave} className="text-primary-600 hover:text-primary-800">
              <CheckCircle2 size={16} />
            </button>
          </div>
        ) : (
          <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
            {formatMeetingDate(instance.date)}
            <button
              onClick={e => { e.stopPropagation(); setEditingDate(true); }}
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-primary-600 transition-opacity"
              title="Change date"
            >
              <Pencil size={12} />
            </button>
          </p>
        )}
        <p className="text-xs text-gray-500">{statusConfig.label}</p>
      </div>
      {instance.actionItemIds?.length > 0 && (
        <span className="text-xs text-gray-400 mr-1">
          {instance.actionItemIds.length} action{instance.actionItemIds.length !== 1 ? 's' : ''}
        </span>
      )}
      <button
        onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
        className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-all flex-shrink-0"
        title="Delete instance"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
