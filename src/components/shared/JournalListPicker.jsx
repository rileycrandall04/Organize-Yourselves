import { useJournalLists } from '../../hooks/useDb';
import { getJournalListColor } from '../../utils/constants';
import Modal from './Modal';
import { BookOpen, X } from 'lucide-react';

/**
 * JournalListPicker — Modal for selecting a journal list.
 *
 * Props:
 *   open          — whether the picker is open
 *   onClose       — close callback
 *   onSelect      — called with the selected list object
 *   excludeIds    — array of list IDs to exclude (e.g., the current list)
 *   title         — modal title (default: "Select Journal List")
 */
export default function JournalListPicker({
  open,
  onClose,
  onSelect,
  excludeIds = [],
  title = 'Select Journal List',
}) {
  const { lists } = useJournalLists();

  const filtered = lists.filter(l => !excludeIds.includes(l.id));

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <div className="space-y-2 max-h-[50vh] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No journal lists available.</p>
        ) : (
          filtered.map(list => {
            const color = getJournalListColor(list.color);
            return (
              <button
                key={list.id}
                onClick={() => {
                  onSelect(list);
                  onClose();
                }}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-700 hover:border-primary-200 hover:bg-primary-50 transition-colors flex items-center gap-2"
              >
                <div className={`w-3 h-3 rounded-full ${color.dot}`} />
                <span className="flex-1">{list.name}</span>
              </button>
            );
          })
        )}
      </div>
    </Modal>
  );
}
