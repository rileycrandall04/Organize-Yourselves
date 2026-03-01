import { Star, CheckCircle2, Circle, Clock, Pause, Phone, MessageSquare } from 'lucide-react';
import PriorityBadge from './PriorityBadge';
import { formatFriendly, isOverdue } from '../../utils/dates';

const CALL_REGEX = /\b(call|phone)\b/i;
const TEXT_REGEX = /\b(text|sms|message)\b/i;

const STATUS_ICONS = {
  not_started: Circle,
  in_progress: Clock,
  waiting: Pause,
  complete: CheckCircle2,
};

export default function ActionItemRow({ item, onToggleStatus, onToggleStar, onPress, phoneForPerson }) {
  const StatusIcon = STATUS_ICONS[item.status] || Circle;
  const overdue = item.status !== 'complete' && isOverdue(item.dueDate);
  const isComplete = item.status === 'complete';

  // Phone/text link detection
  const isCallItem = CALL_REGEX.test(item.title);
  const isTextItem = TEXT_REGEX.test(item.title);
  const phoneNumber = phoneForPerson || item.phoneNumber || null;

  function handleStatusTap(e) {
    e.stopPropagation();
    if (onToggleStatus) {
      // Cycle: not_started → in_progress → complete
      const next = isComplete ? 'not_started' : item.status === 'in_progress' ? 'complete' : 'in_progress';
      onToggleStatus(item.id, next);
    }
  }

  function handleQuickComplete(e) {
    e.stopPropagation();
    if (onToggleStatus) {
      onToggleStatus(item.id, 'complete');
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

        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {item.priority && item.priority !== 'low' && (
            <PriorityBadge priority={item.priority} />
          )}
          {item.assignedTo?.name && (
            <span className="text-[10px] text-primary-600 bg-primary-50 px-1 py-0.5 rounded">
              {item.assignedTo.name}
            </span>
          )}
          {item.dueDate && (
            <span className={`text-[11px] ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
              {formatFriendly(item.dueDate)}
            </span>
          )}
        </div>
      </div>

      {/* Phone/text links */}
      {!isComplete && phoneNumber && (isCallItem || isTextItem) && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {isCallItem && (
            <a
              href={`tel:${phoneNumber}`}
              onClick={e => e.stopPropagation()}
              className="p-1 rounded-lg text-green-600 hover:bg-green-50"
              title={`Call ${phoneNumber}`}
            >
              <Phone size={14} />
            </a>
          )}
          {isTextItem && (
            <a
              href={`sms:${phoneNumber}`}
              onClick={e => e.stopPropagation()}
              className="p-1 rounded-lg text-blue-600 hover:bg-blue-50"
              title={`Text ${phoneNumber}`}
            >
              <MessageSquare size={14} />
            </a>
          )}
        </div>
      )}

      {/* Quick complete button */}
      {!isComplete && (
        <button
          onClick={handleQuickComplete}
          className="flex-shrink-0 p-1 rounded-lg text-gray-300 hover:text-green-500 hover:bg-green-50 transition-colors"
          title="Mark complete"
        >
          <CheckCircle2 size={16} />
        </button>
      )}

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
