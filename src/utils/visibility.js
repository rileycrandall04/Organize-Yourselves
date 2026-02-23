import { JURISDICTION_MAP } from '../data/callings';

// Determine what the user can see/edit based on their callings
export function getJurisdiction(userCallings) {
  if (!userCallings || userCallings.length === 0) {
    return { visibleOrgs: [], scope: 'org', canEdit: false };
  }

  let bestScope = 'org';
  const scopePriority = { stake: 4, assigned_wards: 3, ward: 2, org: 1 };
  const visibleOrgs = new Set();

  for (const uc of userCallings) {
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

// Filter org tree by jurisdiction — only show the user's subtree
export function filterTreeByJurisdiction(tree, jurisdiction) {
  if (!jurisdiction || !jurisdiction.canEdit) return [];
  if (jurisdiction.visibleOrgs.includes('*')) return tree;

  function nodeMatchesOrg(node) {
    return jurisdiction.visibleOrgs.includes(node.organization);
  }

  function filterNode(node) {
    // If this node's org matches, include it and all children
    if (nodeMatchesOrg(node)) {
      return { ...node };
    }
    // Otherwise, check if any children match — if so, include this as a structural parent
    if (node.children && node.children.length > 0) {
      const filteredChildren = node.children
        .map(filterNode)
        .filter(Boolean);
      if (filteredChildren.length > 0) {
        return { ...node, children: filteredChildren };
      }
    }
    return null;
  }

  return tree.map(filterNode).filter(Boolean);
}

// Determine which nodes should auto-expand vs collapse
export function getDefaultExpandState(tree, jurisdiction) {
  const expandMap = {};

  function walk(nodes, depth) {
    for (const node of nodes) {
      if (jurisdiction.scope === 'stake') {
        // Stake sees everything, auto-expand stake-level (tier 0-1), collapse ward details (tier > 4)
        expandMap[node.id] = (node.tier || 0) <= 2;
      } else if (jurisdiction.scope === 'ward') {
        // Bishop sees all ward orgs, expand bishopric + org presidents (tier <= 4)
        expandMap[node.id] = (node.tier || 0) <= 4;
      } else if (jurisdiction.scope === 'org') {
        // Org leaders see only their subtree, everything expanded
        expandMap[node.id] = true;
      } else if (jurisdiction.scope === 'assigned_wards') {
        // High councilor: expand stake level, collapse most ward details
        expandMap[node.id] = (node.tier || 0) <= 3;
      }

      if (node.children) walk(node.children, depth + 1);
    }
  }

  walk(tree, 0);
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
    const p = rolePriority[uc.callingKey] || 0;
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
