import { useState } from 'react';
import { useOpenPositions, useServiceAlerts } from '../hooks/useDb';
import { CALLING_PRIORITIES } from '../utils/constants';
import { getOrgLabel } from '../data/callings';
import { AlertTriangle, ChevronDown, ChevronRight, Clock, UserPlus, Users } from 'lucide-react';

export default function NeedsDashboard({ onSelectSlot, onAddCandidate }) {
  const { positions, loading } = useOpenPositions();
  const { alerts } = useServiceAlerts();
  const [expanded, setExpanded] = useState(true);
  const [showAlerts, setShowAlerts] = useState(true);

  if (loading) return null;
  if (positions.length === 0 && alerts.length === 0) return null;

  // Group open positions by priority
  const byPriority = { high: [], medium: [], low: [] };
  for (const pos of positions) {
    const p = pos.priority || 'medium';
    if (byPriority[p]) byPriority[p].push(pos);
    else byPriority.medium.push(pos);
  }

  const priorityOrder = ['high', 'medium', 'low'];

  return (
    <div className="mb-4 space-y-2">
      {/* Open Positions */}
      {positions.length > 0 && (
        <div className="card !p-0 overflow-hidden">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
          >
            {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
            <Users size={14} className="text-amber-500" />
            <span className="text-xs font-semibold text-gray-700 flex-1">
              Open Positions
            </span>
            <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
              {positions.length}
            </span>
          </button>

          {expanded && (
            <div className="border-t border-gray-100 divide-y divide-gray-50">
              {priorityOrder.map(priority => {
                const items = byPriority[priority];
                if (items.length === 0) return null;
                const config = CALLING_PRIORITIES[priority];

                return items.map(pos => (
                  <div
                    key={pos.id}
                    onClick={() => onSelectSlot?.(pos)}
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    {/* Priority dot */}
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      priority === 'high' ? 'bg-red-400' :
                      priority === 'medium' ? 'bg-yellow-400' :
                      'bg-green-400'
                    }`} />

                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-gray-900 truncate block">
                        {pos.roleName}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {getOrgLabel(pos.organization)}
                        {(pos.expectedCount || 1) > 1 && (
                          <> &middot; {pos.currentCount || 0}/{pos.expectedCount} filled</>
                        )}
                        {!pos.candidateName && (pos.expectedCount || 1) <= 1 && ' · Vacant'}
                      </span>
                    </div>

                    {/* Candidate count */}
                    {pos.candidates?.length > 0 && (
                      <span className="text-[9px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        {pos.candidates.length} name{pos.candidates.length !== 1 ? 's' : ''}
                      </span>
                    )}

                    {/* Add candidate quick action */}
                    <button
                      onClick={(e) => { e.stopPropagation(); onAddCandidate?.(pos); }}
                      className="p-1 rounded text-gray-300 hover:text-primary-500 transition-colors"
                      title="Add candidate"
                    >
                      <UserPlus size={12} />
                    </button>
                  </div>
                ));
              })}
            </div>
          )}
        </div>
      )}

      {/* Service Alerts */}
      {alerts.length > 0 && (
        <div className="card !p-0 overflow-hidden">
          <button
            onClick={() => setShowAlerts(!showAlerts)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
          >
            {showAlerts ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
            <Clock size={14} className="text-amber-500" />
            <span className="text-xs font-semibold text-gray-700 flex-1">
              Service Alerts
            </span>
            <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
              {alerts.length}
            </span>
          </button>

          {showAlerts && (
            <div className="border-t border-gray-100 divide-y divide-gray-50">
              {alerts.map(alert => (
                <div
                  key={alert.id}
                  onClick={() => onSelectSlot?.(alert)}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <AlertTriangle size={12} className={`flex-shrink-0 ${
                    alert.remainingMonths <= 0 ? 'text-red-400' : 'text-amber-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-gray-900 truncate block">
                      {alert.servedBy || alert.candidateName} — {alert.roleName}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {alert.servedMonths} months (recommended: {alert.recommendedServiceMonths})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
