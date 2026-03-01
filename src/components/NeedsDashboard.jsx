import { useState, useMemo } from 'react';
import { useOpenPositions, useServiceAlerts } from '../hooks/useDb';
import { CALLING_PRIORITIES } from '../utils/constants';
import { getOrgLabel, ORGANIZATIONS } from '../data/callings';
import { AlertTriangle, ChevronDown, ChevronRight, Clock, UserPlus, Users } from 'lucide-react';

export default function NeedsDashboard({ onSelectSlot, onAddCandidate, onOrgFilter, activeOrgFilter, jurisdiction }) {
  const { positions, loading } = useOpenPositions(null, jurisdiction);
  const { alerts } = useServiceAlerts();
  const [expanded, setExpanded] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState(null);

  // Group positions by organization
  const byOrg = useMemo(() => {
    const map = {};
    for (const pos of positions) {
      const orgKey = pos.organization || 'other';
      if (!map[orgKey]) map[orgKey] = [];
      map[orgKey].push(pos);
    }
    // Return ordered by ORGANIZATIONS array, only non-empty
    return ORGANIZATIONS
      .filter(o => map[o.key] && map[o.key].length > 0)
      .map(o => ({ orgKey: o.key, label: o.label, positions: map[o.key] }));
  }, [positions]);

  if (loading) return null;
  if (positions.length === 0 && alerts.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {/* Open Positions */}
      {positions.length > 0 && (
        <div className="card !p-0 overflow-hidden">
          <button
            onClick={() => { setExpanded(!expanded); if (expanded) setSelectedOrg(null); }}
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
            <div className="border-t border-gray-100 px-3 py-2.5">
              {/* Horizontal org chips + Show All */}
              <div className="flex flex-wrap gap-1.5">
                {/* Show All chip */}
                <button
                  onClick={() => setSelectedOrg(selectedOrg === '__all__' ? null : '__all__')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                    selectedOrg === '__all__'
                      ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-300'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span>Show All</span>
                  <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[18px] text-center ${
                    selectedOrg === '__all__'
                      ? 'bg-primary-200 text-primary-800'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {positions.length}
                  </span>
                </button>
                {byOrg.map(({ orgKey, label, positions: orgPositions }) => (
                  <button
                    key={orgKey}
                    onClick={() => {
                      const newOrg = selectedOrg === orgKey ? null : orgKey;
                      setSelectedOrg(newOrg);
                      onOrgFilter?.(newOrg);
                    }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                      selectedOrg === orgKey
                        ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-300'
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <span>{label}</span>
                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[18px] text-center ${
                      selectedOrg === orgKey
                        ? 'bg-primary-200 text-primary-800'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {orgPositions.length}
                    </span>
                  </button>
                ))}
              </div>

              {/* Selected org detail list */}
              {selectedOrg && selectedOrg !== '__all__' && (
                <div className="mt-2 border-t border-gray-100 pt-2 space-y-0.5">
                  {byOrg
                    .find(o => o.orgKey === selectedOrg)
                    ?.positions.map(pos => (
                      <PositionRow key={pos.id} pos={pos} onSelectSlot={onSelectSlot} onAddCandidate={onAddCandidate} />
                    ))}
                </div>
              )}

              {/* Show All — grouped by org with sub-headers */}
              {selectedOrg === '__all__' && (
                <div className="mt-2 border-t border-gray-100 pt-2 space-y-2">
                  {byOrg.map(({ orgKey, label, positions: orgPositions }) => (
                    <div key={orgKey}>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-1.5 mb-0.5">{label}</p>
                      <div className="space-y-0.5">
                        {orgPositions.map(pos => (
                          <PositionRow key={pos.id} pos={pos} onSelectSlot={onSelectSlot} onAddCandidate={onAddCandidate} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                  className="flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <AlertTriangle size={10} className={`flex-shrink-0 ${
                    alert.remainingMonths <= 0 ? 'text-red-400' : 'text-amber-400'
                  }`} />
                  <span className="text-[11px] font-medium text-gray-900 truncate flex-1 min-w-0">
                    {alert.servedBy || alert.candidateName} — {alert.roleName}
                  </span>
                  <span className="text-[9px] text-gray-400 flex-shrink-0">
                    {alert.servedMonths}mo / {alert.recommendedServiceMonths}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PositionRow({ pos, onSelectSlot, onAddCandidate }) {
  return (
    <div
      onClick={() => onSelectSlot?.(pos)}
      className="flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer hover:bg-gray-50 transition-colors group"
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        (pos.priority === 'high') ? 'bg-red-400' :
        (pos.priority === 'low') ? 'bg-green-400' :
        'bg-amber-400'
      }`} />
      <span className="text-xs text-gray-800 truncate flex-1">{pos.roleName}</span>
      {pos.candidates?.length > 0 && (
        <span className="text-[9px] font-medium text-blue-600 bg-blue-50 px-1 py-0.5 rounded-full flex-shrink-0">
          {pos.candidates.length}
        </span>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onAddCandidate?.(pos); }}
        className="p-0.5 rounded text-gray-300 hover:text-primary-500 opacity-0 group-hover:opacity-100 transition-all"
        title="Add candidate"
      >
        <UserPlus size={10} />
      </button>
    </div>
  );
}
