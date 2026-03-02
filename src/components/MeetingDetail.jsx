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
  Check, Save, ChevronRight,
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
  const [expandedSection, setExpandedSection] = useState(null);

  // Get unresolved action items from last instance (for pending count)
  const unresolvedItems = useLiveQuery(
    () => getUnresolvedActionItems(meeting.id),
    [meeting.id]
  ) ?? [];

  const cadenceLabel = formatCadenceLabel(meeting.cadence);
  const agendaTemplate = meeting.agendaTemplate || [];
  const pendingCount = pendingTags.length + unresolvedItems.length;
  const preMeetingCount = (meeting.pendingAgendaItems || []).length;
  const isCustom = meeting.source === 'custom';
  const isSacrament = meeting.name === 'Sacrament Meeting';

  function toggleSection(key) {
    setExpandedSection(prev => prev === key ? null : key);
  }

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
        const autoBlocks = await buildAutoAgendaBlocks(meeting.id);
        newInstance.blocks = autoBlocks;
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

  // ── Quick-access section data ─────────────────────────────
  const sections = [
    {
      key: 'pre',
      icon: ClipboardList,
      label: 'Pre-Meeting',
      count: preMeetingCount,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      onAdd: () => setShowAddPreMeetingTask(true),
    },
    {
      key: 'ongoing',
      icon: Target,
      label: 'Ongoing',
      count: ongoingTasks.length,
      color: 'text-green-600',
      bg: 'bg-green-50',
      border: 'border-green-200',
      onAdd: () => setShowAddTask(true),
    },
    {
      key: 'minister',
      icon: Heart,
      label: 'Ministering',
      count: ministeringPlans.length,
      color: 'text-teal-600',
      bg: 'bg-teal-50',
      border: 'border-teal-200',
      onAdd: () => setShowAddPlan(true),
    },
  ];

  // Add pending section if there are items
  if (pendingCount > 0) {
    sections.push({
      key: 'pending',
      icon: RotateCw,
      label: 'Pending',
      count: pendingCount,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
    });
  }

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      {/* Header */}
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary-600 mb-3">
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="flex items-start justify-between mb-4">
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
              className="text-xs text-gray-400 mt-0.5 hover:text-primary-600 hover:underline transition-colors"
              title="Click to change frequency"
            >
              {cadenceLabel}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowEditForm(true)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            title="Edit meeting"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
            title="Delete meeting"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="bg-red-50 border border-red-200 rounded-lg mb-4 p-3">
          <p className="text-xs font-medium text-red-800 mb-1">Delete this meeting?</p>
          <p className="text-[11px] text-red-600 mb-2">
            This will permanently delete the meeting and all {instances.length} instance{instances.length !== 1 ? 's' : ''}.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setShowDeleteConfirm(false)} className="px-2.5 py-1 text-[11px] font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleDelete} className="px-2.5 py-1 text-[11px] font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">Delete</button>
          </div>
        </div>
      )}

      {/* ── Quick-access icon bar ───────────────────────────── */}
      <div className="flex items-center gap-1.5 mb-3">
        {sections.map(s => {
          const Icon = s.icon;
          const isActive = expandedSection === s.key;
          return (
            <button
              key={s.key}
              onClick={() => toggleSection(s.key)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                isActive
                  ? `${s.bg} ${s.border} ${s.color}`
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Icon size={13} />
              <span className="hidden sm:inline">{s.label}</span>
              {s.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                  isActive ? 'bg-white/60' : 'bg-gray-100'
                }`}>
                  {s.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Expanded section content ────────────────────────── */}
      {expandedSection === 'pre' && (
        <div className="mb-4 border border-blue-100 rounded-lg bg-blue-50/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide">Pre-Meeting Tasks</span>
            <button onClick={() => setShowAddPreMeetingTask(true)} className="text-blue-600 hover:text-blue-800">
              <Plus size={14} />
            </button>
          </div>
          {preMeetingCount === 0 ? (
            <p className="text-[11px] text-gray-400">Items added here auto-populate the next agenda.</p>
          ) : (
            <div className="space-y-1">
              {(meeting.pendingAgendaItems || []).map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-2 py-1 px-2 bg-white rounded border border-blue-100">
                  <span className="text-xs text-gray-700">{item.label}</span>
                  <button onClick={() => handleRemovePreMeetingTask(i)} className="text-gray-300 hover:text-red-500 flex-shrink-0">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {expandedSection === 'ongoing' && (
        <div className="mb-4 border border-green-100 rounded-lg bg-green-50/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-green-700 uppercase tracking-wide">Ongoing Tasks</span>
            <button onClick={() => setShowAddTask(true)} className="text-green-600 hover:text-green-800">
              <Plus size={14} />
            </button>
          </div>
          {ongoingTasks.length === 0 ? (
            <p className="text-[11px] text-gray-400">Tasks appear on every agenda until dismissed.</p>
          ) : (
            <div className="space-y-1">
              {ongoingTasks.map(task => (
                <div key={task.id} className="py-1 px-2 bg-white rounded border border-green-100">
                  <span className="text-xs text-gray-700">{task.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {expandedSection === 'minister' && (
        <div className="mb-4 border border-teal-100 rounded-lg bg-teal-50/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-teal-700 uppercase tracking-wide">Ministering Plans</span>
            <button onClick={() => setShowAddPlan(true)} className="text-teal-600 hover:text-teal-800">
              <Plus size={14} />
            </button>
          </div>
          {ministeringPlans.length === 0 ? (
            <p className="text-[11px] text-gray-400">Plans appear on all meeting agendas until completed.</p>
          ) : (
            <div className="space-y-1">
              {ministeringPlans.map(plan => (
                <div key={plan.id} className="py-1 px-2 bg-white rounded border border-teal-100">
                  <span className="text-xs text-gray-700">
                    {plan.personName}{plan.familyName ? ` ${plan.familyName} Family` : ''}
                  </span>
                  {plan.description && (
                    <p className="text-[10px] text-gray-400 mt-0.5">{plan.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {expandedSection === 'pending' && (
        <div className="mb-4 border border-amber-100 rounded-lg bg-amber-50/30 p-3">
          <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide block mb-2">Pending for Next Meeting</span>
          <div className="space-y-1">
            {unresolvedItems.map(item => (
              <div key={item.id} className="py-1 px-2 bg-white rounded border border-amber-100 flex items-center gap-2">
                <RotateCw size={10} className="text-amber-400 flex-shrink-0" />
                <span className="text-xs text-gray-700">{item.title}</span>
              </div>
            ))}
            {pendingTags.map(tag => (
              <div key={tag.id} className="py-1 px-2 bg-white rounded border border-amber-100 flex items-start gap-2">
                <ArrowUpRight size={10} className="text-indigo-400 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-gray-700">
                  {tag.text.length > 80 ? tag.text.substring(0, 80) + '...' : tag.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Agenda template ─────────────────────────────────── */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
            <ListChecks size={12} />
            Agenda Template
          </h2>
          {editingAgenda ? (
            <button onClick={saveAgendaTemplate} className="flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-800">
              <Save size={12} /> Save
            </button>
          ) : (
            <button onClick={startEditingAgenda} className="flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-primary-600">
              <Pencil size={10} /> Edit
            </button>
          )}
        </div>
        {editingAgenda ? (
          <div className="space-y-1.5">
            {agendaEditItems.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 w-3.5 text-right flex-shrink-0">{i + 1}.</span>
                <input
                  type="text"
                  value={item}
                  onChange={e => {
                    const updated = [...agendaEditItems];
                    updated[i] = e.target.value;
                    setAgendaEditItems(updated);
                  }}
                  placeholder="Agenda item..."
                  className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary-300"
                />
                {agendaEditItems.length > 1 && (
                  <button onClick={() => setAgendaEditItems(prev => prev.filter((_, idx) => idx !== i))} className="p-0.5 text-gray-300 hover:text-red-400">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setAgendaEditItems(prev => [...prev, ''])}
              className="flex items-center gap-1 text-[11px] text-primary-600 hover:text-primary-800 font-medium mt-1"
            >
              <Plus size={11} /> Add item
            </button>
          </div>
        ) : agendaTemplate.length > 0 ? (
          <div className="pl-1">
            {agendaTemplate.map((item, i) => (
              <div key={i} className="flex items-start gap-2 py-0.5">
                <span className="text-[10px] text-gray-300 mt-px w-3.5 text-right flex-shrink-0">{i + 1}.</span>
                <span className="text-xs text-gray-600">{item}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-gray-400">No template yet. Tap Edit to add recurring agenda items.</p>
        )}
      </div>

      {/* ── Meeting History ──────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
            <FileText size={12} />
            Meeting History
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleNewInstance()}
              disabled={creating}
              className="flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-800"
            >
              <Plus size={12} /> Today
            </button>
            <button
              onClick={() => { setCustomDate(todayStr()); setShowDatePicker(true); }}
              disabled={creating}
              className="flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-primary-600"
            >
              <Calendar size={12} /> Date
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-6 text-gray-400">
            <div className="animate-spin w-4 h-4 border-2 border-primary-300 border-t-primary-700 rounded-full mx-auto mb-2" />
            <p className="text-[11px]">Loading...</p>
          </div>
        ) : instances.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Calendar size={28} className="mx-auto mb-2 text-gray-300" />
            <p className="text-xs mb-3">No meetings recorded yet.</p>
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => handleNewInstance()} disabled={creating} className="btn-primary text-xs px-4">
                <Plus size={12} className="inline mr-1" /> Start Today
              </button>
              <button onClick={() => { setCustomDate(todayStr()); setShowDatePicker(true); }} disabled={creating} className="btn-secondary text-xs px-4">
                <Calendar size={12} className="inline mr-1" /> Other Date
              </button>
            </div>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
            {instances.map(inst => (
              <InstanceRow
                key={inst.id}
                instance={inst}
                onPress={() => setActiveInstance(inst)}
                onDelete={async () => { await deleteMeetingInstance(inst.id); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ───────────────────────────────────────────── */}

      {showEditForm && (
        <AddMeetingForm
          editMeeting={meeting}
          onSave={handleEditSave}
          onClose={() => setShowEditForm(false)}
        />
      )}

      <Modal open={showAddTask} onClose={() => setShowAddTask(false)} title="Add Ongoing Task" size="sm">
        <div className="space-y-3">
          <input type="text" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="Task or project name..." className="input-field" autoFocus />
          <p className="text-xs text-gray-400">This task will appear on every agenda until dismissed.</p>
          <div className="flex gap-3">
            <button onClick={handleAddTask} disabled={!newTaskTitle.trim()} className="btn-primary flex-1">Create</button>
            <button onClick={() => setShowAddTask(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>

      <Modal open={showAddPlan} onClose={() => setShowAddPlan(false)} title="Add Ministering Plan" size="sm">
        <div className="space-y-3">
          <input type="text" value={newPlanPerson} onChange={e => setNewPlanPerson(e.target.value)} placeholder="Individual name..." className="input-field" autoFocus />
          <input type="text" value={newPlanFamily} onChange={e => setNewPlanFamily(e.target.value)} placeholder="Family name (optional)..." className="input-field" />
          <textarea value={newPlanDesc} onChange={e => setNewPlanDesc(e.target.value)} placeholder="What service is planned? (optional)" rows={2} className="input-field" />
          <p className="text-xs text-gray-400">This plan will appear on ALL meeting agendas until completed.</p>
          <div className="flex gap-3">
            <button onClick={handleAddPlan} disabled={!newPlanPerson.trim()} className="btn-primary flex-1">Create</button>
            <button onClick={() => setShowAddPlan(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>

      <Modal open={showAddPreMeetingTask} onClose={() => setShowAddPreMeetingTask(false)} title="Add Pre-Meeting Task" size="sm">
        <div className="space-y-3">
          <input type="text" value={preMeetingTaskTitle} onChange={e => setPreMeetingTaskTitle(e.target.value)} placeholder="Topic or agenda item..." className="input-field" autoFocus />
          <p className="text-xs text-gray-400">This item will be added to the agenda when you start a new meeting.</p>
          <div className="flex gap-3">
            <button onClick={handleAddPreMeetingTask} disabled={!preMeetingTaskTitle.trim()} className="btn-primary flex-1">Add</button>
            <button onClick={() => setShowAddPreMeetingTask(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>

      <Modal open={showDatePicker} onClose={() => setShowDatePicker(false)} title="Select Meeting Date" size="sm">
        <div className="space-y-3">
          <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} className="input-field" autoFocus />
          <p className="text-xs text-gray-400">Select a date to record a past or future meeting.</p>
          <div className="flex gap-3">
            <button onClick={() => handleNewInstance(customDate)} disabled={!customDate || creating} className="btn-primary flex-1">Create</button>
            <button onClick={() => setShowDatePicker(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Compact instance row (file-folder style) ────────────────
function InstanceRow({ instance, onPress, onDelete }) {
  const isCompleted = instance.status === 'completed';
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (confirmDelete) {
    return (
      <div className="px-3 py-2 bg-red-50" onClick={e => e.stopPropagation()}>
        <p className="text-[11px] text-red-700 mb-1.5">Delete {formatMeetingDate(instance.date)}?</p>
        <div className="flex gap-2">
          <button onClick={() => setConfirmDelete(false)} className="px-2 py-0.5 text-[10px] font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50">Cancel</button>
          <button onClick={() => onDelete?.()} className="px-2 py-0.5 text-[10px] font-medium text-white bg-red-600 rounded hover:bg-red-700">Delete</button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onPress}
      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors text-left group"
    >
      {isCompleted ? (
        <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />
      ) : (
        <Clock size={13} className="text-gray-300 flex-shrink-0" />
      )}
      <span className="text-xs text-gray-800 flex-1">{formatMeetingDate(instance.date)}</span>
      <span className={`text-[10px] ${isCompleted ? 'text-green-500' : 'text-gray-400'}`}>
        {isCompleted ? 'Finalized' : 'Draft'}
      </span>
      <Trash2
        size={11}
        onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
        className="text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 cursor-pointer"
      />
      <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
    </button>
  );
}
