import { useMemo, useCallback } from 'react';
import { useUserCallings, useProfile } from './useDb';
import { updateHiddenOrgs } from '../db';
import {
  getJurisdiction,
  filterTreeByJurisdiction,
  getDefaultExpandState,
  getHighestRole,
  isBishopric,
} from '../utils/visibility';

export function useVisibility() {
  const { callings } = useUserCallings();
  const { profile } = useProfile();

  const jurisdiction = useMemo(
    () => getJurisdiction(callings),
    [callings]
  );

  const highestRole = useMemo(
    () => getHighestRole(callings),
    [callings]
  );

  const hiddenOrgs = useMemo(
    () => profile?.hiddenOrgs || [],
    [profile]
  );

  const toggleHideOrg = useCallback(async (orgKey) => {
    const current = profile?.hiddenOrgs || [];
    const next = current.includes(orgKey)
      ? current.filter(k => k !== orgKey)
      : [...current, orgKey];
    await updateHiddenOrgs(next);
  }, [profile]);

  return {
    jurisdiction,
    isBishopric: isBishopric(callings),
    highestRole,
    hiddenOrgs,
    toggleHideOrg,
    filterTree: (tree) => filterTreeByJurisdiction(tree, jurisdiction),
    getExpandState: (tree) => getDefaultExpandState(tree, jurisdiction, highestRole?.callingKey),
  };
}
