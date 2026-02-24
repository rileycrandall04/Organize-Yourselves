import { ORGANIZATIONS } from '../data/callings';

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
 *   - orgKey, orgLabel
 *   - presidencySlots: tier <= 5 (president, counselors, secretary)
 *   - otherSlots: tier 6 (teachers, advisors, coordinators, missionaries)
 *   - totalCount, vacantCount
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

    // Sort slots: lower tier first, then alphabetically by roleName
    const sorted = [...slots].sort((a, b) => {
      const tierDiff = (a.tier ?? 99) - (b.tier ?? 99);
      if (tierDiff !== 0) return tierDiff;
      return (a.roleName || '').localeCompare(b.roleName || '');
    });

    const presidencySlots = sorted.filter(s => (s.tier ?? 99) <= 5);
    const otherSlots = sorted.filter(s => (s.tier ?? 99) > 5);

    const vacantCount = slots.filter(
      s => !s.candidateName && s.stage === 'identified'
    ).length;

    result.push({
      orgKey: org.key,
      orgLabel: org.label,
      presidencySlots,
      otherSlots,
      totalCount: slots.length,
      vacantCount,
    });
  }

  return result;
}
