import { useState } from 'react';
import { useMeetings, useUserCallings } from '../hooks/useDb';
import { addMeeting } from '../db';
import { getCallingConfig, MEETING_CADENCES } from '../data/callings';
import { Calendar, ChevronRight, Plus, Sparkles } from 'lucide-react';
import MeetingDetail from './MeetingDetail';
import AddMeetingForm from './AddMeetingForm';

export default function Meetings() {
  const { callings } = useUserCallings();
  const { meetings, loading } = useMeetings();
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Group meetings by calling, plus a "Custom Meetings" group
  const grouped = callings.map(uc => {
    const config = getCallingConfig(uc.callingKey);
    return {
      callingKey: uc.callingKey,
      title: config?.title || uc.callingKey,
      meetings: meetings.filter(m => m.callingId === uc.callingKey),
    };
  }).filter(g => g.meetings.length > 0);

  // Custom meetings: no calling association or source === 'custom' with no matching calling
  const customMeetings = meetings.filter(
    m => !m.callingId || !callings.some(uc => uc.callingKey === m.callingId)
  ).filter(m => m.source === 'custom');

  async function handleAddMeeting(meetingData) {
    await addMeeting(meetingData);
  }

  if (selectedMeeting) {
    return (
      <MeetingDetail
        meeting={selectedMeeting}
        onBack={() => setSelectedMeeting(null)}
        onMeetingDeleted={() => setSelectedMeeting(null)}
      />
    );
  }

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Calendar size={24} className="text-primary-700" />
          <h1 className="text-2xl font-bold text-gray-900">Meetings</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{meetings.length} meeting{meetings.length !== 1 ? 's' : ''}</span>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800 bg-primary-50 px-2.5 py-1.5 rounded-lg"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <div className="animate-spin w-6 h-6 border-2 border-primary-300 border-t-primary-700 rounded-full mx-auto mb-3" />
          <p className="text-sm">Loading...</p>
        </div>
      ) : grouped.length === 0 && customMeetings.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          <Calendar size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No meetings set up yet.</p>
          <p className="text-xs mt-1.5 text-gray-300">Add a custom meeting or set up callings to get started.</p>
          <button
            onClick={() => setShowAddForm(true)}
            className="btn-primary mt-4 text-sm"
          >
            <Plus size={14} className="inline mr-1" />
            Add Meeting
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(group => (
            <div key={group.callingKey}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.meetings.map(meeting => (
                  <MeetingCard
                    key={meeting.id}
                    meeting={meeting}
                    onPress={() => setSelectedMeeting(meeting)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Custom Meetings group */}
          {customMeetings.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Custom Meetings
              </h3>
              <div className="space-y-2">
                {customMeetings.map(meeting => (
                  <MeetingCard
                    key={meeting.id}
                    meeting={meeting}
                    isCustom
                    onPress={() => setSelectedMeeting(meeting)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showAddForm && (
        <AddMeetingForm
          onSave={handleAddMeeting}
          onClose={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
}

function MeetingCard({ meeting, onPress, isCustom }) {
  const cadenceLabel = MEETING_CADENCES[meeting.cadence] || meeting.cadence;

  return (
    <div
      onClick={onPress}
      className="card !py-2.5 !px-3 flex items-center gap-2 cursor-pointer hover:border-primary-200 transition-colors"
    >
      <div className="p-1 rounded-lg bg-primary-50">
        <Calendar size={14} className="text-primary-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium text-gray-900 truncate">{meeting.name}</p>
          {isCustom && (
            <span className="text-[9px] font-medium text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full flex-shrink-0">
              Custom
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-500">{cadenceLabel}</p>
      </div>
      <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
    </div>
  );
}
