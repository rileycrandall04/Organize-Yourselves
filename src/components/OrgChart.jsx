import { useState, useMemo } from 'react';
import { useOrgTree, useCallingSlots } from '../hooks/useDb';
import { useVisibility } from '../hooks/useVisibility';
import { CALLING_STAGES } from '../utils/constants';
import { ORGANIZATIONS } from '../data/callings';
import { groupSlotsByOrganization } from '../utils/orgGrouping';
import {
  ChevronDown, ChevronRight, Plus, Users, GitBranch,
  UserPlus, ArrowRight, Play, Eye, Clock,
  AlertTriangle,
} from 'lucide-react';

export default function OrgChart({ onEditSlot, onAddChild, onAddCandidate, onBeginRelease, onAdvance, onNavigateSettings }) {
  const { tree, loading } = useOrgTree();
  const { filterTree, hiddenOrgs, toggleHideOrg } = useVisibility();

  const filteredTree = useMemo(() => filterTree(tree), [tree, filterTree]);
  const orgGroups = useMemo(() => groupSlotsByOrganization(filteredTree), [filteredTree]);

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-400">
        <div className="animate-spin w-6 h-6 border-2 border-primary-300 border-t-primary-700 rounded-full mx-auto mb-3" />
        <p className="text-sm">Loading...</p>
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="card text-center text-gray-400 py-12">
        <Users size={40} className="mx-auto mb-3 text-gray-300" />
        <p className="text-sm font-medium text-gray-600">No organization chart yet</p>
        <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">Add your calling in Settings to automatically set up your organization chart with the right positions for your role.</p>
        {onNavigateSettings && (
          <button
            onClick={onNavigateSettings}
            className="btn-primary mt-4 text-sm"
          >
            <GitBranch size={14} className="inline mr-1" />
            Go to Settings
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {orgGroups.map(group => (
        <OrgFolder
          key={group.orgKey}
          group={group}
          hidden={hiddenOrgs?.includes(group.orgKey)}
          onToggleHide={() => toggleHideOrg?.(group.orgKey)}
          onEditSlot={onEditSlot}
          onAddChild={onAddChild}
          onAddCandidate={onAddCandidate}
          onBeginRelease={onBeginRelease}
          onAdvance={onAdvance}
        />
      ))}
    </div>
  );
}

// ── Org Folder ──────────────────────────────────────────────

function OrgFolder({ group, hidden, onToggleHide, onEditSlot, onAddChild, onAddCandidate, onBeginRelease, onAdvance }) {
  const [expanded, setExpanded] = useState(false);
  const [otherExpanded, setOtherExpanded] = useState(false);

  // Hidden org — compact single row
  if (hidden) {
    return (
      <div
        onClick={onToggleHide}
        className="flex items-center gap-2 py-1 px-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors text-gray-400"
      >
        <Eye size={12} />
        <span className="text-xs">
          {group.orgLabel}
          <span className="text-gray-300 ml-1">
            ({group.totalCount} positions{group.vacantCount > 0 ? `, ${group.vacantCount} vacant` : ''})
          </span>
        </span>
      </div>
    );
  }

  return (
    <div>
      {/* Org header row */}
      <div
        className="flex items-center gap-1.5 py-1 px-1 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors group"
        onClick={() => setExpanded(!expanded)}
      >
        <button className="p-0.5 text-gray-400">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex-1">
          {group.orgLabel}
        </span>
        <span className="text-[10px] text-gray-400">
          {group.totalCount} position{group.totalCount !== 1 ? 's' : ''}
        </span>
        {group.vacantCount > 0 && (
          <span className="text-[10px] font-medium text-red-400">
            {group.vacantCount} vacant
          </span>
        )}
        {/* Hide org button */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleHide(); }}
          className="p-0.5 rounded text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Hide organization"
        >
          <Eye size={11} />
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="ml-2">
          {/* Presidency slots (always visible when org is expanded) */}
          {group.presidencySlots.map(slot => (
            <SlotRow
              key={slot.id}
              slot={slot}
              onEdit={onEditSlot}
              onAddChild={onAddChild}
              onAddCandidate={onAddCandidate}
              onBeginRelease={onBeginRelease}
              onAdvance={onAdvance}
            />
          ))}

          {/* Other Callings sub-section */}
          {group.otherSlots.length > 0 && (
            <div>
              <div
                className="flex items-center gap-1.5 py-0.5 px-1 rounded cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setOtherExpanded(!otherExpanded)}
              >
                <button className="p-0.5 text-gray-300">
                  {otherExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                <span className="text-[10px] font-medium text-gray-400">
                  Other Callings ({group.otherSlots.length})
                </span>
              </div>
              {otherExpanded && (
                <div className="ml-3">
                  {group.otherSlots.map(slot => (
                    <SlotRow
                      key={slot.id}
                      slot={slot}
                      indented
                      onEdit={onEditSlot}
                      onAddChild={onAddChild}
                      onAddCandidate={onAddCandidate}
                      onBeginRelease={onBeginRelease}
                      onAdvance={onAdvance}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Slot Row ────────────────────────────────────────────────

function getDotColor(slot) {
  const stage = slot.stage;
  if (stage === 'serving') return 'bg-green-500';
  if (stage === 'declined') return 'bg-red-400';
  if (['release_planned', 'release_meeting'].includes(stage)) return 'bg-amber-400';
  if (['prayed_about', 'discussed', 'extended', 'accepted', 'sustained', 'set_apart'].includes(stage)) return 'bg-blue-400';
  if (!slot.candidateName && stage === 'identified') return 'bg-red-400';
  return 'bg-gray-300';
}

function getServiceInfo(slot) {
  if (!slot.servingSince) return null;
  const start = new Date(slot.servingSince);
  const now = new Date();
  const months = Math.round((now - start) / (1000 * 60 * 60 * 24 * 30.44));
  const dateStr = start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  return { dateStr, months };
}

function SlotRow({ slot, indented, onEdit, onAddChild, onAddCandidate, onBeginRelease, onAdvance }) {
  const isVacant = !slot.candidateName && slot.stage === 'identified';
  const dotColor = getDotColor(slot);
  const stageConfig = CALLING_STAGES[slot.stage] || CALLING_STAGES.identified;
  const serviceInfo = slot.stage === 'serving' ? getServiceInfo(slot) : null;
  const isNearingService = slot.stage === 'serving' && slot.recommendedServiceMonths && serviceInfo &&
    (slot.recommendedServiceMonths - serviceInfo.months) <= 3;
  const personName = isVacant ? null : (slot.servedBy || slot.candidateName);

  return (
    <div
      className="flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer hover:bg-gray-50 transition-colors group min-w-0"
      onClick={() => onEdit?.(slot)}
    >
      {/* Status dot */}
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />

      {/* Role name */}
      <span className="text-xs font-medium text-gray-800 truncate whitespace-nowrap">
        {slot.roleName}
      </span>

      {/* Dotted leader line */}
      <span className="flex-1 border-b border-dotted border-gray-200 min-w-[12px]" />

      {/* Person name or vacant */}
      {personName ? (
        <span className="text-xs text-gray-600 truncate whitespace-nowrap max-w-[40%]">
          {personName}
        </span>
      ) : (
        <span className="text-xs text-red-400 italic whitespace-nowrap">&mdash;</span>
      )}

      {/* Service info */}
      {serviceInfo && (
        <span className={`text-[10px] whitespace-nowrap flex-shrink-0 ${isNearingService ? 'text-amber-500' : 'text-gray-300'}`}>
          {isNearingService && <AlertTriangle size={9} className="inline mr-0.5" />}
          {serviceInfo.months}mo
        </span>
      )}

      {/* Stage badge (for non-serving, non-vacant states) */}
      {slot.stage !== 'identified' && slot.stage !== 'serving' && (
        <span className={`text-[9px] font-medium px-1 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap
          ${slot.stage === 'set_apart' ? 'bg-green-50 text-green-700' :
            slot.stage === 'declined' ? 'bg-red-50 text-red-600' :
            slot.stage === 'released' ? 'bg-gray-100 text-gray-500' :
            ['release_planned', 'release_meeting'].includes(slot.stage) ? 'bg-amber-50 text-amber-600' :
            'bg-gray-100 text-gray-600'}`}
        >
          {stageConfig.label}
        </span>
      )}

      {/* Hover actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {isVacant && (
          <button
            onClick={(e) => { e.stopPropagation(); onAddCandidate?.(slot); }}
            className="p-0.5 rounded text-gray-300 hover:text-blue-500 transition-colors"
            title="Add candidate"
          >
            <UserPlus size={10} />
          </button>
        )}

        {slot.candidates?.length > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onAddCandidate?.(slot); }}
            className="p-0.5 rounded text-blue-400 hover:text-blue-600 transition-colors"
            title={`Review ${slot.candidates.length} candidate${slot.candidates.length !== 1 ? 's' : ''}`}
          >
            <Eye size={10} />
          </button>
        )}

        {slot.stage === 'serving' && (
          <button
            onClick={(e) => { e.stopPropagation(); onBeginRelease?.(slot); }}
            className="p-0.5 rounded text-gray-300 hover:text-amber-500 transition-colors"
            title="Begin release"
          >
            <Clock size={10} />
          </button>
        )}

        {['prayed_about', 'discussed', 'extended', 'accepted', 'sustained', 'set_apart'].includes(slot.stage) && (
          <button
            onClick={(e) => { e.stopPropagation(); onAdvance?.(slot); }}
            className="p-0.5 rounded text-gray-300 hover:text-green-500 transition-colors"
            title="Advance stage"
          >
            <Play size={10} />
          </button>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); onAddChild?.(slot); }}
          className="p-0.5 rounded text-gray-300 hover:text-primary-500 transition-colors"
          title="Add position under this role"
        >
          <Plus size={10} />
        </button>
      </div>
    </div>
  );
}
