import { Star, CheckCircle2, Circle, Clock, Pause } from 'lucide-react';
import PriorityBadge from './PriorityBadge';
import { formatFriendly, isOverdue } from '../../utils/dates';

const STATUS_ICONS = {
  not_started: Circle,
  in_progress: Clock,
  waiting: Pause,
  complete: CheckCircle2,
};

export default function ActionItemRow({ item, onToggleStatus, onToggleStar, onPress }) {
  const StatusIcon = STATUS_ICONS[item.status] || Circle;
  const overdue = item.status !== 'complete' && isOverdue(item.dueDate);
  const isComplete = item.status === 'complete';

  function handleStatusTap(e) {
    e.stopPropagation();
    if (onToggleStatus) {
      // Cycle: not_started → in_progress → complete
      const next = isComplete ? 'not_started' : item.status === 'in_progress' ? 'complete' : 'in_progress';
      onToggleStatus(item.id, next);
    }
  }

  function handleStarTap(e) {
    e.stopPropagation();
    if (onToggleStar) onToggleStar(item.id, !item.starred);
  }

  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-lg border transition-colors cursor-pointer
        ${isComplete ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200 hover:border-primary-200'}
        ${overdue ? 'border-red-200 bg-red-50/30' : ''}`}
      onClick={() => onPress?.(item)}
    >
      {/* Status toggle */}
      <button onClick={handleStatusTap} className="flex-shrink-0">
        <StatusIcon
          size={16}
          className={
            isComplete ? 'text-green-500' :
            item.status === 'in_progress' ? 'text-blue-500' :
            item.status === 'waiting' ? 'text-yellow-500' :
            'text-gray-300'
          }
        />
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-medium truncate ${isComplete ? 'line-through text-gray-400' : 'text-gray-900'}`}>
            {item.title}
          </span>
          {item.starred && (
            <Star size={12} className="text-amber-400 fill-amber-400 flex-shrink-0" />
          )}
        </div>

        {(item.priority || item.dueDate) && (
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {item.priority && item.priority !== 'low' && (
              <PriorityBadge priority={item.priority} />
            )}
            {item.dueDate && (
              <span className={`text-[11px] ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                {formatFriendly(item.dueDate)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Star toggle */}
      <button onClick={handleStarTap} className="flex-shrink-0">
        <Star
          size={14}
          className={item.starred ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}
        />
      </button>
    </div>
  );
}
