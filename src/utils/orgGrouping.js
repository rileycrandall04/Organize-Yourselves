import { ORGANIZATIONS, PRESIDENCY_ROLES } from '../data/callings';

/**
 * Flatten a nested org tree into a flat array of all slots.
 */
function flattenTree(nodes) {
  const result = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children && node.children.length > 0) {
      result.push(...flattenTree(node.children));
    }
  }
  return result;
}

/**
 * Transform a nested org tree into flat org-grouped data for the folder view.
 *
 * Each group contains:
 *   - orgKey, orgLabel, hasPresidency
 *   - presidencySlots: matched by PRESIDENCY_ROLES (name-based, authority order)
 *   - otherSlots: everything else (only populated for orgs with a presidency)
 *   - totalCount, vacantCount
 *
 * Orgs in PRESIDENCY_ROLES get presidency/other split.
 * Orgs NOT in PRESIDENCY_ROLES show all slots directly (presidencySlots = all, otherSlots = []).
 *
 * Groups are ordered by the ORGANIZATIONS array and empty orgs are skipped.
 */
export function groupSlotsByOrganization(tree) {
  const allSlots = flattenTree(tree);

  // Build a map of orgKey -> slots
  const orgMap = {};
  for (const slot of allSlots) {
    const orgKey = slot.organization || 'other';
    if (!orgMap[orgKey]) orgMap[orgKey] = [];
    orgMap[orgKey].push(slot);
  }

  // Order by ORGANIZATIONS array
  const result = [];
  for (const org of ORGANIZATIONS) {
    const slots = orgMap[org.key];
    if (!slots || slots.length === 0) continue;

    const presidencyRoleNames = PRESIDENCY_ROLES[org.key];
    const hasPresidency = !!presidencyRoleNames;

    let presidencySlots;
    let otherSlots;

    if (hasPresidency) {
      // Name-based matching: match slots to presidency roles in authority order
      const matched = [];
      const unmatched = [];

      for (const slot of slots) {
        const idx = presidencyRoleNames.indexOf(slot.roleName);
        if (idx >= 0) {
          matched.push({ slot, order: idx });
        } else {
          unmatched.push(slot);
        }
      }

      // Sort presidency slots by authority order
      matched.sort((a, b) => a.order - b.order);
      presidencySlots = matched.map(m => m.slot);

      // Sort other slots alphabetically by roleName
      otherSlots = unmatched.sort((a, b) =>
        (a.roleName || '').localeCompare(b.roleName || '')
      );
    } else {
      // Flat org (bishopric, missionary, music, etc.) — show all directly
      // Sort by tier first, then alphabetically
      presidencySlots = [...slots].sort((a, b) => {
        const tierDiff = (a.tier ?? 99) - (b.tier ?? 99);
        if (tierDiff !== 0) return tierDiff;
        return (a.roleName || '').localeCompare(b.roleName || '');
      });
      otherSlots = [];
    }

    const vacantCount = slots.filter(
      s => !s.candidateName && s.stage === 'identified'
    ).length;

    result.push({
      orgKey: org.key,
      orgLabel: org.label,
      hasPresidency,
      presidencySlots,
      otherSlots,
      totalCount: slots.length,
      vacantCount,
    });
  }

  return result;
}
