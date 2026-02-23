import { PRIORITIES } from '../../utils/constants';

export default function PriorityBadge({ priority, className = '' }) {
  if (!priority) return null;

  const config = PRIORITIES[priority];
  if (!config) return null;

  return (
    <span className={`badge ${config.badge} ${className}`}>
      {config.label}
    </span>
  );
}
