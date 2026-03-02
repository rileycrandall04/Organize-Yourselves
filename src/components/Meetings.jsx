import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useMeetings, useUserCallings } from '../hooks/useDb';
import { addMeeting, searchMeetingInstances } from '../db';
import { getCallingConfig, getCallingDisplayTitle, formatCadenceLabel } from '../data/callings';
import { formatMeetingDate } from '../utils/dates';
import { Calendar, ChevronRight, Plus, Search, X } from 'lucide-react';
import MeetingDetail from './MeetingDetail';
import AddMeetingForm from './AddMeetingForm';

export default function Meetings() {
  const location = useLocation();
  const { callings } = useUserCallings();
  const { meetings, loading } = useMeetings();
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Debounced search
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const results = await searchMeetingInstances(searchQuery);
      setSearchResults(results);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  function handleSearchResultClick(result) {
    const meeting = meetings.find(m => m.id === result.meetingId);
    if (meeting) {
      setSelectedMeeting(meeting);
      setSearchQuery('');
      setSearchResults([]);
    }
  }

  // Auto-select meeting if navigated from Dashboard with meeting ID
  useEffect(() => {
    const openMeetingId = location.state?.openMeetingId;
    if (openMeetingId && meetings.length > 0 && !selectedMeeting) {
      const found = meetings.find(m => m.id === openMeetingId);
      if (found) setSelectedMeeting(found);
    }
  }, [location.state?.openMeetingId, meetings]);

  // Group meetings by calling, plus a "Custom Meetings" group
  const grouped = callings.map(uc => {
    return {
      callingKey: uc.callingKey,
      title: getCallingDisplayTitle(uc),
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

      {/* Search */}
      <div className="mb-4 relative">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search meeting notes..."
            className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300 placeholder:text-gray-300"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setSearchResults([]); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {searchQuery.trim().length >= 2 && (
          <div className="mt-2">
            {searching ? (
              <p className="text-xs text-gray-400">Searching...</p>
            ) : searchResults.length === 0 ? (
              <p className="text-xs text-gray-400">No results found for "{searchQuery}"</p>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                </p>
                {searchResults.slice(0, 20).map(result => (
                  <div
                    key={result.instanceId}
                    onClick={() => handleSearchResultClick(result)}
                    className="card !p-2.5 cursor-pointer hover:border-primary-200 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-900">{result.meetingName}</span>
                      <span className="text-[10px] text-gray-400">{formatMeetingDate(result.date)}</span>
                    </div>
                    {result.matches.slice(0, 2).map((match, i) => {
                      const text = match.text || '';
                      const idx = text.toLowerCase().indexOf(searchQuery.toLowerCase());
                      const snippet = idx >= 0
                        ? '...' + text.substring(Math.max(0, idx - 30), idx + searchQuery.length + 30) + '...'
                        : text.substring(0, 60) + '...';
                      return (
                        <p key={i} className="text-[10px] text-gray-500 truncate">
                          <span className="text-gray-400">{match.type === 'notes' ? 'Notes' : match.type === 'agenda' ? 'Agenda' : match.type === 'focus_family' ? 'Focus' : 'Agenda notes'}:</span>{' '}
                          {snippet}
                        </p>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
  const cadenceLabel = formatCadenceLabel(meeting.cadence);

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
