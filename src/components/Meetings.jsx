import { useState } from 'react';
import { useMeetings, useUserCallings } from '../hooks/useDb';
import { getCallingConfig, MEETING_CADENCES } from '../data/callings';
import { Calendar, ChevronRight, Plus } from 'lucide-react';
import MeetingDetail from './MeetingDetail';

export default function Meetings() {
  const { callings } = useUserCallings();
  const { meetings, loading } = useMeetings();
  const [selectedMeeting, setSelectedMeeting] = useState(null);

  // Group meetings by calling
  const grouped = callings.map(uc => {
    const config = getCallingConfig(uc.callingKey);
    return {
      callingKey: uc.callingKey,
      title: config?.title || uc.callingKey,
      meetings: meetings.filter(m => m.callingId === uc.callingKey),
    };
  }).filter(g => g.meetings.length > 0);

  if (selectedMeeting) {
    return (
      <MeetingDetail
        meeting={selectedMeeting}
        onBack={() => setSelectedMeeting(null)}
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
        <span className="text-sm text-gray-400">{meetings.length} meeting{meetings.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <div className="animate-spin w-6 h-6 border-2 border-primary-300 border-t-primary-700 rounded-full mx-auto mb-3" />
          <p className="text-sm">Loading...</p>
        </div>
      ) : grouped.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          <Calendar size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No meetings set up yet.</p>
          <p className="text-xs mt-1.5 text-gray-300">Meetings are created from your calling configuration.</p>
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
        </div>
      )}
    </div>
  );
}

function MeetingCard({ meeting, onPress }) {
  const cadenceLabel = MEETING_CADENCES[meeting.cadence] || meeting.cadence;

  return (
    <div
      onClick={onPress}
      className="card flex items-center gap-3 cursor-pointer hover:border-primary-200 transition-colors"
    >
      <div className="p-2 rounded-lg bg-primary-50">
        <Calendar size={18} className="text-primary-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{meeting.name}</p>
        <p className="text-xs text-gray-500">{cadenceLabel}</p>
      </div>
      <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
    </div>
  );
}
