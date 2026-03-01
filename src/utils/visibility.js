import { JURISDICTION_MAP, isCustomCalling } from '../data/callings';

// Determine what the user can see/edit based on their callings
export function getJurisdiction(userCallings) {
  if (!userCallings || userCallings.length === 0) {
    return { visibleOrgs: [], scope: 'org', canEdit: false };
  }

  let bestScope = 'org';
  const scopePriority = { stake: 4, assigned_wards: 3, ward: 2, org: 1 };
  const visibleOrgs = new Set();

  for (const uc of userCallings) {
    // Custom callings get ward-level scope so they can manage all orgs
    if (isCustomCalling(uc.callingKey)) {
      if (scopePriority['ward'] > scopePriority[bestScope]) {
        bestScope = 'ward';
      }
      visibleOrgs.add('*');
      continue;
    }

    const jurisdiction = JURISDICTION_MAP[uc.callingKey];
    if (!jurisdiction) continue;

    if (scopePriority[jurisdiction.scope] > scopePriority[bestScope]) {
      bestScope = jurisdiction.scope;
    }

    if (jurisdiction.orgs.includes('*')) {
      visibleOrgs.add('*');
    } else {
      for (const org of jurisdiction.orgs) {
        visibleOrgs.add(org);
      }
    }
  }

  return {
    visibleOrgs: visibleOrgs.has('*') ? ['*'] : [...visibleOrgs],
    scope: bestScope,
    canEdit: true,
  };
}

// Filter org tree by jurisdiction — only show the user's org subtrees
// Promotes matching subtrees to root level so non-matching parents don't create phantom org groups
export function filterTreeByJurisdiction(tree, jurisdiction) {
  if (!jurisdiction || !jurisdiction.canEdit) return [];
  if (jurisdiction.visibleOrgs.includes('*')) return tree;

  function collectMatchingSubtrees(nodes) {
    const result = [];
    for (const node of nodes) {
      if (jurisdiction.visibleOrgs.includes(node.organization)) {
        // This node's org matches — include it and all its children
        result.push({ ...node });
      } else if (node.children && node.children.length > 0) {
        // This node doesn't match, but check if children match
        result.push(...collectMatchingSubtrees(node.children));
      }
    }
    return result;
  }

  return collectMatchingSubtrees(tree);
}

// Determine which nodes should auto-expand vs collapse
// Uses "2 lines of authority" rule: expand the user's node, direct children (1 line),
// and collapse everything 2+ lines away from the user's position.
export function getDefaultExpandState(tree, jurisdiction, userCallingKey) {
  const expandMap = {};

  // First, try to find the user's node and compute distances from it
  if (userCallingKey) {
    const ancestorIds = new Set();
    let userNodeId = null;

    // Find the user's node and all ancestor IDs leading to it
    function findUserNode(nodes, ancestors) {
      for (const node of nodes) {
        if (node.callingKey === userCallingKey) {
          userNodeId = node.id;
          for (const a of ancestors) ancestorIds.add(a);
          return true;
        }
        if (node.children) {
          if (findUserNode(node.children, [...ancestors, node.id])) return true;
        }
      }
      return false;
    }

    findUserNode(tree, []);

    if (userNodeId) {
      // Mark distances from the user's node downward
      function markDistances(nodes, distanceFromUser) {
        for (const node of nodes) {
          if (node.id === userNodeId) {
            // User's own node — always expanded
            expandMap[node.id] = true;
            // Mark children with distance 1
            if (node.children) markDistances(node.children, 1);
          } else if (ancestorIds.has(node.id)) {
            // Ancestor of user — expand to show path to user
            expandMap[node.id] = true;
            if (node.children) markDistances(node.children, distanceFromUser);
          } else if (distanceFromUser !== null) {
            // We're in the user's subtree — expand if within 1 line of authority
            expandMap[node.id] = distanceFromUser < 2;
            if (node.children) markDistances(node.children, distanceFromUser + 1);
          } else {
            // Outside user's subtree (sibling branches of ancestors) — collapsed
            expandMap[node.id] = false;
            if (node.children) markDistances(node.children, null);
          }
        }
      }

      markDistances(tree, null);
      return expandMap;
    }
  }

  // Fallback: tier-based logic if user's node isn't found
  function walkFallback(nodes) {
    for (const node of nodes) {
      if (jurisdiction.scope === 'stake') {
        expandMap[node.id] = (node.tier || 0) <= 2;
      } else if (jurisdiction.scope === 'ward') {
        expandMap[node.id] = (node.tier || 0) <= 4;
      } else if (jurisdiction.scope === 'org') {
        expandMap[node.id] = true;
      } else if (jurisdiction.scope === 'assigned_wards') {
        expandMap[node.id] = (node.tier || 0) <= 3;
      }
      if (node.children) walkFallback(node.children);
    }
  }

  walkFallback(tree);
  return expandMap;
}

// Get the user's highest/most senior calling
export function getHighestRole(userCallings) {
  if (!userCallings || userCallings.length === 0) return null;

  const rolePriority = {
    stake_president: 10,
    stake_1st_counselor: 9,
    stake_2nd_counselor: 9,
    high_councilor: 8,
    bishop: 7,
    bishopric_1st: 6,
    bishopric_2nd: 6,
    exec_secretary: 5,
    ward_clerk: 5,
    eq_president: 4,
    rs_president: 4,
    yw_president: 3,
    primary_president: 3,
    ss_president: 3,
    ward_mission_leader: 2,
    temple_fh_leader: 2,
  };

  let highest = null;
  let highestPriority = -1;

  for (const uc of userCallings) {
    const p = rolePriority[uc.callingKey] || (isCustomCalling(uc.callingKey) ? 1 : 0);
    if (p > highestPriority) {
      highestPriority = p;
      highest = uc;
    }
  }

  return highest;
}

// Check if user is in bishopric
export function isBishopric(userCallings) {
  if (!userCallings) return false;
  const bishopricKeys = ['bishop', 'bishopric_1st', 'bishopric_2nd'];
  return userCallings.some(uc => bishopricKeys.includes(uc.callingKey));
}
