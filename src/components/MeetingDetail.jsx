import { useState } from 'react';
import { useMeetingInstances, useMeetingNoteTags } from '../hooks/useDb';
import { buildAutoAgenda, getUnresolvedActionItems } from '../db';
import { MEETING_CADENCES } from '../data/callings';
import { todayStr, formatMeetingDate } from '../utils/dates';
import { MEETING_STATUSES } from '../utils/constants';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft, Calendar, Plus, Clock, CheckCircle2, ListChecks, FileText,
  ArrowUpRight, RotateCw,
} from 'lucide-react';
import MeetingNotes from './MeetingNotes';

export default function MeetingDetail({ meeting, onBack }) {
  const { instances, loading, add: addInstance } = useMeetingInstances(meeting.id);
  const { tags: pendingTags } = useMeetingNoteTags(meeting.id);
  const [activeInstance, setActiveInstance] = useState(null);
  const [creating, setCreating] = useState(false);

  // Get unresolved action items from last instance (for pending count)
  const unresolvedItems = useLiveQuery(
    () => getUnresolvedActionItems(meeting.id),
    [meeting.id]
  ) ?? [];

  const cadenceLabel = MEETING_CADENCES[meeting.cadence] || meeting.cadence;
  const agendaTemplate = meeting.agendaTemplate || [];
  const pendingCount = pendingTags.length + unresolvedItems.length;

  const isSacrament = meeting.name === 'Sacrament Meeting';

  async function handleNewInstance() {
    if (creating) return;
    setCreating(true);
    try {
      const newInstance = {
        meetingId: meeting.id,
        date: todayStr(),
        notes: '',
        actionItemIds: [],
        attendees: [],
        status: 'scheduled',
      };

      if (isSacrament) {
        // Sacrament meetings use structured programData instead of agenda items
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
        // Use auto-agenda builder for other meetings
        const autoAgenda = await buildAutoAgenda(meeting.id);
        newInstance.agendaItems = autoAgenda;
      }

      const id = await addInstance(newInstance);
      setActiveInstance({ id, ...newInstance });
    } finally {
      setCreating(false);
    }
  }

  if (activeInstance) {
    return (
      <MeetingNotes
        instance={activeInstance}
        meetingName={meeting.name}
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

      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">{meeting.name}</h1>
        <p className="text-sm text-gray-500 mt-1">{cadenceLabel}</p>
      </div>

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

      {/* Agenda template */}
      {agendaTemplate.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-3">
            <ListChecks size={14} className="text-primary-600" />
            Agenda Template
          </h2>
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
        </div>
      )}

      {/* Past instances */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
            <FileText size={14} className="text-primary-600" />
            Meeting History
          </h2>
          <button
            onClick={handleNewInstance}
            disabled={creating}
            className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800"
          >
            <Plus size={14} />
            New Meeting
            {pendingCount > 0 && (
              <span className="ml-1 bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                {pendingCount}
              </span>
            )}
          </button>
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
            <button
              onClick={handleNewInstance}
              disabled={creating}
              className="btn-primary mt-3 text-sm"
            >
              <Plus size={14} className="inline mr-1" />
              Start a Meeting
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {instances.map(inst => (
              <InstanceCard
                key={inst.id}
                instance={inst}
                onPress={() => setActiveInstance(inst)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InstanceCard({ instance, onPress }) {
  const statusConfig = MEETING_STATUSES[instance.status] || MEETING_STATUSES.scheduled;
  const isCompleted = instance.status === 'completed';
  const StatusIcon = isCompleted ? CheckCircle2 : Clock;

  return (
    <div
      onClick={onPress}
      className="card flex items-center gap-3 cursor-pointer hover:border-primary-200 transition-colors"
    >
      <StatusIcon
        size={18}
        className={isCompleted ? 'text-green-500 flex-shrink-0' : 'text-gray-400 flex-shrink-0'}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">
          {formatMeetingDate(instance.date)}
        </p>
        <p className="text-xs text-gray-500">{statusConfig.label}</p>
      </div>
      {instance.actionItemIds?.length > 0 && (
        <span className="text-xs text-gray-400">
          {instance.actionItemIds.length} action{instance.actionItemIds.length !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}
