import { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db, {
  getProfile,
  saveProfile,
  getUserCallings,
  addUserCalling,
  removeUserCalling,
  getResponsibilities,
  addResponsibility,
  updateResponsibility,
  deleteResponsibility,
  getPeople,
  addPerson,
  updatePerson,
  deletePerson,
  getMeetings,
  addMeeting,
  updateMeeting,
  deleteMeeting,
  deleteMeetingWithInstances,
  getMeetingInstances,
  addMeetingInstance,
  updateMeetingInstance,
  getActionItems,
  addActionItem,
  updateActionItem,
  deleteActionItem,
  getInboxItems,
  addInboxItem,
  markInboxProcessed,
  deleteInboxItem,
  getJournalEntries,
  addJournalEntry,
  getDashboardStats,
  // Phase 2
  addMeetingNoteTag,
  getTagsForMeeting,
  getTagsFromInstance,
  deleteMeetingNoteTag,
  getCallingSlots,
  addCallingSlot,
  updateCallingSlot,
  deleteCallingSlot,
  transitionCallingSlot,
  getPipelineSummary,
  buildOrgTree,
  // Phase 4
  getOpenPositions,
  addCandidate,
  declineCandidate,
  acceptCandidate,
  startRelease,
  getServiceAlerts,
  initializeOrgFromTemplate,
  updateHiddenOrgs,
  getMinisteringCompanionships,
  addMinisteringCompanionship,
  updateMinisteringCompanionship,
  deleteMinisteringCompanionship,
  getMinisteringInterviews,
  addMinisteringInterview,
  updateMinisteringInterview,
  getMinisteringSummary,
} from '../db';

// ── Profile ─────────────────────────────────────────────────

export function useProfile() {
  const profile = useLiveQuery(() => getProfile());
  return {
    profile: profile ?? null,
    loading: profile === undefined,
    save: saveProfile,
  };
}

// ── User Callings ───────────────────────────────────────────

export function useUserCallings() {
  const callings = useLiveQuery(() => getUserCallings());
  return {
    callings: callings ?? [],
    loading: callings === undefined,
    add: addUserCalling,
    remove: removeUserCalling,
  };
}

// ── Responsibilities ────────────────────────────────────────

export function useResponsibilities(callingId) {
  const items = useLiveQuery(
    () => (callingId ? getResponsibilities(callingId) : Promise.resolve([])),
    [callingId]
  );
  return {
    responsibilities: items ?? [],
    loading: items === undefined,
    add: addResponsibility,
    update: updateResponsibility,
    remove: deleteResponsibility,
  };
}

// ── People ──────────────────────────────────────────────────

export function usePeople() {
  const people = useLiveQuery(() => getPeople());
  return {
    people: people ?? [],
    loading: people === undefined,
    add: addPerson,
    update: updatePerson,
    remove: deletePerson,
  };
}

// ── Meetings ────────────────────────────────────────────────

export function useMeetings(callingId) {
  const meetings = useLiveQuery(
    () => getMeetings(callingId),
    [callingId]
  );
  return {
    meetings: meetings ?? [],
    loading: meetings === undefined,
    add: addMeeting,
    update: updateMeeting,
    remove: deleteMeeting,
  };
}

// ── Meeting Instances ───────────────────────────────────────

export function useMeetingInstances(meetingId) {
  const instances = useLiveQuery(
    () => (meetingId ? getMeetingInstances(meetingId) : Promise.resolve([])),
    [meetingId]
  );
  return {
    instances: instances ?? [],
    loading: instances === undefined,
    add: addMeetingInstance,
    update: updateMeetingInstance,
  };
}

// ── Action Items ────────────────────────────────────────────

export function useActionItems(filters = {}) {
  // Serialize filters so useLiveQuery re-runs when they change
  const filterKey = JSON.stringify(filters);
  const items = useLiveQuery(
    () => getActionItems(filters),
    [filterKey]
  );
  return {
    items: items ?? [],
    loading: items === undefined,
    add: addActionItem,
    update: updateActionItem,
    remove: deleteActionItem,
  };
}

// ── Inbox ───────────────────────────────────────────────────

export function useInbox() {
  const items = useLiveQuery(() => getInboxItems());
  return {
    items: items ?? [],
    loading: items === undefined,
    add: addInboxItem,
    markProcessed: markInboxProcessed,
    remove: deleteInboxItem,
  };
}

// ── Journal ─────────────────────────────────────────────────

export function useJournal(limit = 20) {
  const entries = useLiveQuery(
    () => getJournalEntries(limit),
    [limit]
  );
  return {
    entries: entries ?? [],
    loading: entries === undefined,
    add: addJournalEntry,
  };
}

// ── Dashboard Stats ─────────────────────────────────────────

export function useDashboardStats() {
  const stats = useLiveQuery(() => getDashboardStats());
  return {
    stats: stats ?? { totalActive: 0, overdue: 0, dueToday: 0, inboxCount: 0, highPriority: 0 },
    loading: stats === undefined,
  };
}

// ── Onboarding Check ────────────────────────────────────────

export function useOnboardingComplete() {
  const profile = useLiveQuery(() => getProfile());
  const callings = useLiveQuery(() => getUserCallings());

  if (profile === undefined || callings === undefined) {
    return { ready: false, loading: true };
  }

  return {
    ready: !!(profile?.name && callings?.length > 0),
    loading: false,
  };
}

// ── Phase 2: Meeting Note Tags ─────────────────────────────

export function useMeetingNoteTags(targetMeetingId) {
  const tags = useLiveQuery(
    () => (targetMeetingId ? getTagsForMeeting(targetMeetingId) : Promise.resolve([])),
    [targetMeetingId]
  );
  return {
    tags: tags ?? [],
    loading: tags === undefined,
    add: addMeetingNoteTag,
    remove: deleteMeetingNoteTag,
  };
}

export function useTagsFromInstance(instanceId) {
  const tags = useLiveQuery(
    () => (instanceId ? getTagsFromInstance(instanceId) : Promise.resolve([])),
    [instanceId]
  );
  return {
    tags: tags ?? [],
    loading: tags === undefined,
    remove: deleteMeetingNoteTag,
  };
}

// ── Phase 2: Calling Pipeline ──────────────────────────────

export function useCallingSlots(filters = {}) {
  const filterKey = JSON.stringify(filters);
  const slots = useLiveQuery(
    () => getCallingSlots(filters),
    [filterKey]
  );
  return {
    slots: slots ?? [],
    loading: slots === undefined,
    add: addCallingSlot,
    update: updateCallingSlot,
    remove: deleteCallingSlot,
    transition: transitionCallingSlot,
  };
}

export function usePipelineSummary() {
  const summary = useLiveQuery(() => getPipelineSummary());
  return {
    summary: summary ?? { total: 0, active: 0, needsAction: 0, openPositions: 0, releasesInProgress: 0, candidatesPending: 0 },
    loading: summary === undefined,
  };
}

// ── Phase 3: Org Chart ───────────────────────────────────────

export function useOrgTree() {
  const tree = useLiveQuery(() => buildOrgTree());
  return {
    tree: tree ?? [],
    loading: tree === undefined,
  };
}

// ── Phase 4: Open Positions & Service Alerts ────────────────

export function useOpenPositions(orgFilter) {
  const positions = useLiveQuery(
    () => getOpenPositions(orgFilter),
    [orgFilter]
  );
  return {
    positions: positions ?? [],
    loading: positions === undefined,
    addCandidate,
    declineCandidate,
    acceptCandidate,
  };
}

export function useServiceAlerts() {
  const alerts = useLiveQuery(() => getServiceAlerts());
  return {
    alerts: alerts ?? [],
    loading: alerts === undefined,
  };
}

// ── Phase 4: Ministering ────────────────────────────────────

export function useMinisteringCompanionships(type) {
  const comps = useLiveQuery(
    () => getMinisteringCompanionships(type),
    [type]
  );
  return {
    companionships: comps ?? [],
    loading: comps === undefined,
    add: addMinisteringCompanionship,
    update: updateMinisteringCompanionship,
    remove: deleteMinisteringCompanionship,
  };
}

export function useMinisteringInterviews(companionshipId) {
  const interviews = useLiveQuery(
    () => (companionshipId ? getMinisteringInterviews(companionshipId) : Promise.resolve([])),
    [companionshipId]
  );
  return {
    interviews: interviews ?? [],
    loading: interviews === undefined,
    add: addMinisteringInterview,
    update: updateMinisteringInterview,
  };
}

// ── Ministering Summary (for Dashboard) ──────────────────────

export function useMinisteringSummary() {
  const summary = useLiveQuery(() => getMinisteringSummary());
  return {
    summary: summary ?? { totalCompanionships: 0, unassignedFamilies: 0, overdueInterviews: 0 },
    loading: summary === undefined,
  };
}
