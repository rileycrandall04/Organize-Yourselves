import { useState, useMemo } from 'react';
import { useOrgTree, useCallingSlots } from '../hooks/useDb';
import { useVisibility } from '../hooks/useVisibility';
import { initializeOrgChart } from '../db';
import { CALLING_STAGES } from '../utils/constants';
import { ORGANIZATIONS } from '../data/callings';
import {
  ChevronDown, ChevronRight, Plus, Users, User, GitBranch,
  CheckCircle, Circle, Clock, AlertTriangle, UserPlus, ArrowRight,
  Play, Eye,
} from 'lucide-react';

export default function OrgChart({ onEditSlot, onAddChild, onAddCandidate, onBeginRelease, onAdvance }) {
  const { tree, loading } = useOrgTree();
  const { slots } = useCallingSlots();
  const { filterTree, getExpandState, hiddenOrgs, toggleHideOrg } = useVisibility();
  const [initializing, setInitializing] = useState(false);

  const filteredTree = useMemo(() => filterTree(tree), [tree, filterTree]);
  const expandState = useMemo(() => getExpandState(filteredTree), [filteredTree, getExpandState]);

  async function handleInitialize() {
    if (initializing) return;
    setInitializing(true);
    try {
      await initializeOrgChart();
    } finally {
      setInitializing(false);
    }
  }

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
        <p className="text-sm font-medium text-gray-600">No organization chart set up</p>
        <p className="text-xs text-gray-400 mt-1">Initialize the org chart with the default stake and ward structure.</p>
        <button
          onClick={handleInitialize}
          disabled={initializing}
          className="btn-primary mt-4 text-sm"
        >
          <GitBranch size={14} className="inline mr-1" />
          {initializing ? 'Setting up...' : 'Initialize Org Chart'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {filteredTree.map(node => (
        <OrgTreeNode
          key={node.id}
          node={node}
          depth={0}
          expandState={expandState}
          onEdit={onEditSlot}
          onAddChild={onAddChild}
          onAddCandidate={onAddCandidate}
          onBeginRelease={onBeginRelease}
          onAdvance={onAdvance}
          hiddenOrgs={hiddenOrgs}
          toggleHideOrg={toggleHideOrg}
        />
      ))}
    </div>
  );
}

function getStatusIcon(node) {
  const stage = node.stage;
  if (stage === 'serving') return { icon: CheckCircle, color: 'text-green-500', title: 'Serving' };
  if (stage === 'released') return { icon: Circle, color: 'text-gray-300', title: 'Released' };
  if (['release_planned', 'release_meeting'].includes(stage)) return { icon: Clock, color: 'text-amber-500', title: 'Release in progress' };
  if (stage === 'declined') return { icon: Circle, color: 'text-red-400', title: 'Declined' };
  if (!node.candidateName && stage === 'identified') return { icon: Circle, color: 'text-red-400', title: 'Open / Vacant' };
  // In the calling pipeline
  if (['prayed_about', 'discussed', 'extended', 'accepted', 'sustained', 'set_apart'].includes(stage)) {
    return { icon: ArrowRight, color: 'text-blue-400', title: 'In pipeline' };
  }
  return { icon: Circle, color: 'text-gray-300', title: 'Identified' };
}

function getServiceInfo(node) {
  if (!node.servingSince) return null;
  const start = new Date(node.servingSince);
  const now = new Date();
  const months = Math.round((now - start) / (1000 * 60 * 60 * 24 * 30.44));
  const dateStr = start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  return { dateStr, months };
}

function OrgTreeNode({ node, depth, expandState, onEdit, onAddChild, onAddCandidate, onBeginRelease, onAdvance, hiddenOrgs, toggleHideOrg }) {
  const defaultExpanded = expandState[node.id] !== undefined ? expandState[node.id] : depth < 2;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = node.children && node.children.length > 0;
  const isVacant = !node.candidateName && node.stage === 'identified';
  const stageConfig = CALLING_STAGES[node.stage] || CALLING_STAGES.identified;

  // Check if this node represents an org header that can be hidden
  const isOrgHeader = hasChildren && node.tier !== undefined && node.tier <= 4;

  // If this org is hidden, show collapsed summary
  if (hiddenOrgs?.includes(node.organization) && isOrgHeader && depth > 0) {
    const totalPositions = countDescendants(node);
    const openCount = countOpen(node);

    return (
      <div style={{ paddingLeft: `${depth * 20}px` }}>
        <div
          onClick={() => toggleHideOrg?.(node.organization)}
          className="flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors text-gray-400"
        >
          <Eye size={12} />
          <span className="text-xs">
            {ORGANIZATIONS.find(o => o.key === node.organization)?.label || node.roleName}
            <span className="text-gray-300 ml-1">
              ({totalPositions} positions{openCount > 0 ? `, ${openCount} open` : ''})
            </span>
          </span>
        </div>
      </div>
    );
  }

  const status = getStatusIcon(node);
  const StatusIcon = status.icon;
  const serviceInfo = node.stage === 'serving' ? getServiceInfo(node) : null;
  const isNearingService = node.stage === 'serving' && node.recommendedServiceMonths && serviceInfo &&
    (node.recommendedServiceMonths - serviceInfo.months) <= 3;

  return (
    <div>
      <div
        className="flex items-center gap-1 group"
        style={{ paddingLeft: `${depth * 20}px` }}
      >
        {/* Expand/collapse toggle */}
        <button
          onClick={() => hasChildren && setExpanded(!expanded)}
          className={`p-0.5 rounded ${hasChildren ? 'text-gray-400 hover:text-gray-600' : 'text-transparent pointer-events-none'}`}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* Node card */}
        <div
          onClick={() => onEdit?.(node)}
          className="flex-1 flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors min-w-0"
        >
          {/* Status icon */}
          <StatusIcon size={14} className={`flex-shrink-0 ${status.color}`} title={status.title} />

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-gray-900 truncate">{node.roleName}</span>
              {node.isCustomPosition && (
                <span className="text-[9px] font-medium text-violet-600 bg-violet-50 px-1 py-0.5 rounded flex-shrink-0">
                  Custom
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] ${isVacant ? 'text-red-400 italic' : 'text-gray-600'}`}>
                {isVacant ? 'Vacant' : (node.servedBy || node.candidateName || 'Vacant')}
              </span>
              {serviceInfo && (
                <span className={`text-[10px] ${isNearingService ? 'text-amber-500' : 'text-gray-300'}`}>
                  {isNearingService && <AlertTriangle size={9} className="inline mr-0.5" />}
                  {serviceInfo.dateStr} &middot; {serviceInfo.months}mo
                </span>
              )}
            </div>
          </div>

          {/* Fill status for multi-position roles */}
          {(node.expectedCount || 1) > 1 && (
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
              (node.currentCount || 0) < (node.expectedCount || 1)
                ? 'bg-amber-50 text-amber-600'
                : 'bg-green-50 text-green-600'
            }`}>
              {node.currentCount || 0}/{node.expectedCount}
            </span>
          )}

          {/* Candidate count badge */}
          {node.candidates?.length > 0 && (
            <span className="text-[9px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full flex-shrink-0">
              {node.candidates.length} name{node.candidates.length !== 1 ? 's' : ''}
            </span>
          )}

          {/* Stage badge */}
          {node.stage !== 'identified' && node.stage !== 'serving' && (
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0
              ${node.stage === 'set_apart' ? 'bg-green-50 text-green-700' :
                node.stage === 'declined' ? 'bg-red-50 text-red-600' :
                node.stage === 'released' ? 'bg-gray-100 text-gray-500' :
                ['release_planned', 'release_meeting'].includes(node.stage) ? 'bg-amber-50 text-amber-600' :
                'bg-gray-100 text-gray-600'}`}
            >
              {stageConfig.label}
            </span>
          )}
        </div>

        {/* Quick actions (visible on hover) */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Open position: Add Candidate */}
          {isVacant && (
            <button
              onClick={(e) => { e.stopPropagation(); onAddCandidate?.(node); }}
              className="p-1 rounded text-gray-300 hover:text-blue-500 transition-colors"
              title="Add candidate"
            >
              <UserPlus size={12} />
            </button>
          )}

          {/* Has candidates: Review */}
          {node.candidates?.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onAddCandidate?.(node); }}
              className="p-1 rounded text-blue-400 hover:text-blue-600 transition-colors"
              title={`Review ${node.candidates.length} candidate${node.candidates.length !== 1 ? 's' : ''}`}
            >
              <Eye size={12} />
            </button>
          )}

          {/* Serving: Begin Release */}
          {node.stage === 'serving' && (
            <button
              onClick={(e) => { e.stopPropagation(); onBeginRelease?.(node); }}
              className="p-1 rounded text-gray-300 hover:text-amber-500 transition-colors"
              title="Begin release"
            >
              <Clock size={12} />
            </button>
          )}

          {/* In pipeline: Advance */}
          {['prayed_about', 'discussed', 'extended', 'accepted', 'sustained', 'set_apart'].includes(node.stage) && (
            <button
              onClick={(e) => { e.stopPropagation(); onAdvance?.(node); }}
              className="p-1 rounded text-gray-300 hover:text-green-500 transition-colors"
              title="Advance stage"
            >
              <Play size={12} />
            </button>
          )}

          {/* Add child position */}
          <button
            onClick={(e) => { e.stopPropagation(); onAddChild?.(node); }}
            className="p-1 rounded text-gray-300 hover:text-primary-500 transition-colors"
            title="Add position under this role"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <OrgTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandState={expandState}
              onEdit={onEdit}
              onAddChild={onAddChild}
              onAddCandidate={onAddCandidate}
              onBeginRelease={onBeginRelease}
              onAdvance={onAdvance}
              hiddenOrgs={hiddenOrgs}
              toggleHideOrg={toggleHideOrg}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Count total descendants
function countDescendants(node) {
  let count = 1;
  if (node.children) {
    for (const child of node.children) {
      count += countDescendants(child);
    }
  }
  return count;
}

// Count open/vacant positions in subtree
function countOpen(node) {
  let count = 0;
  if (!node.candidateName && node.stage === 'identified') count++;
  if (node.children) {
    for (const child of node.children) {
      count += countOpen(child);
    }
  }
  return count;
}
