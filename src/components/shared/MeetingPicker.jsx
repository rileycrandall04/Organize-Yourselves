import { useMeetings, useUserCallings } from '../../hooks/useDb';
import { getCallingConfig } from '../../data/callings';
import Modal from './Modal';
import { Calendar, X } from 'lucide-react';

/**
 * MeetingPicker — Modal for selecting one or more meetings.
 * Shows meetings grouped by calling.
 *
 * Props:
 *   open          — whether the picker is open
 *   onClose       — close callback
 *   onSelect      — called with the selected meeting object
 *   excludeIds    — array of meeting IDs to exclude (e.g., the current meeting)
 *   title         — modal title (default: "Select Meeting")
 *   multiSelect   — if true, shows checkboxes and a confirm button (default: false)
 *   selectedIds   — for multiSelect: currently selected meeting IDs
 *   onConfirm     — for multiSelect: called with array of selected IDs
 */
export default function MeetingPicker({
  open,
  onClose,
  onSelect,
  excludeIds = [],
  title = 'Select Meeting',
  multiSelect = false,
  selectedIds = [],
  onConfirm,
}) {
  const { callings } = useUserCallings();
  const { meetings } = useMeetings();

  // Group meetings by calling, excluding specified IDs
  const groups = callings
    .map(uc => {
      const config = getCallingConfig(uc.callingKey);
      const callingMeetings = meetings.filter(
        m => m.callingId === uc.callingKey && !excludeIds.includes(m.id)
      );
      return {
        key: uc.callingKey,
        label: config?.title || uc.callingKey,
        meetings: callingMeetings,
      };
    })
    .filter(g => g.meetings.length > 0);

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <div className="space-y-4 max-h-[50vh] overflow-y-auto">
        {groups.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No meetings available.</p>
        ) : (
          groups.map(group => (
            <div key={group.key}>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                {group.label}
              </h3>
              <div className="space-y-1">
                {group.meetings.map(mtg => {
                  const isSelected = selectedIds.includes(mtg.id);
                  return (
                    <button
                      key={mtg.id}
                      onClick={() => {
                        if (multiSelect) {
                          // Toggle selection — handled by parent via onSelect
                          onSelect(mtg);
                        } else {
                          onSelect(mtg);
                          onClose();
                        }
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm border transition-colors flex items-center gap-2
                        ${isSelected
                          ? 'border-primary-300 bg-primary-50 text-primary-700'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-primary-200 hover:bg-primary-50'}`}
                    >
                      <Calendar size={14} className={isSelected ? 'text-primary-600' : 'text-gray-400'} />
                      <span className="flex-1">{mtg.name}</span>
                      {isSelected && <span className="text-primary-600 text-xs font-medium">Selected</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
      {multiSelect && (
        <div className="flex gap-3 mt-4 pt-3 border-t border-gray-100">
          <button
            onClick={() => { if (onConfirm) onConfirm(selectedIds); onClose(); }}
            className="btn-primary flex-1"
          >
            Done ({selectedIds.length} selected)
          </button>
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
        </div>
      )}
    </Modal>
  );
}
