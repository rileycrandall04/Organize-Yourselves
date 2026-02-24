import Dexie from 'dexie';
import { getCallingConfig, getPresidentForOrg, ORG_HIERARCHY, ORG_TEMPLATES, JURISDICTION_MAP } from './data/callings';
import { CALLING_STAGES, CALL_STAGE_ORDER } from './utils/constants';

const db = new Dexie('CallingOrganizer');

db.version(1).stores({
  // User profile and settings
  profile: '++id, name',

  // User's active callings
  userCallings: '++id, callingKey, startDate',

  // Responsibilities per calling (handbook defaults + custom)
  responsibilities: '++id, callingId, title, isCustom, isRecurring, recurringCadence',

  // People (manually entered as relevant — NOT a full ward list)
  people: '++id, name, phone, email',

  // Callings org chart (calling slots in the ward)
  callingSlots: '++id, organization, roleName, personId, status, assignedTo',

  // Meeting types (recurring templates)
  meetings: '++id, callingId, name, cadence, agendaTemplate, participants',

  // Individual meeting instances
  meetingInstances: '++id, meetingId, date, notes, attendees, status',

  // Action items — the heart of the system
  actionItems: '++id, title, description, ownerId, sourceMeetingInstanceId, status, priority, context, dueDate, isRecurring, recurringCadence, createdAt, completedAt, *targetMeetingIds',

  // Quick capture inbox
  inbox: '++id, text, createdAt, processed',

  // Lessons, talks, training materials
  lessons: '++id, title, content, type, *tags, date, audience',

  // Events (3-month calendar)
  events: '++id, title, date, organization, status, budget, notes',

  // Receipts
  receipts: '++id, amount, vendor, date, organization, purpose, imageData, status',

  // Private spiritual impressions journal
  journal: '++id, text, date, *tags',
});

// Phase 2: Meeting Intelligence + Calling Pipeline
db.version(2).stores({
  meetingNoteTags: '++id, sourceMeetingInstanceId, targetMeetingId, consumed, createdAt',
  callingSlots: '++id, organization, roleName, personId, status, assignedTo, stage',
});

// Phase 3: Org Chart hierarchy + custom meetings
db.version(3).stores({
  callingSlots: '++id, organization, roleName, personId, status, assignedTo, stage, parentSlotId, callingKey, tier',
});

// Phase 4: Enhanced pipeline — priority, open positions, candidates, service tracking, release flow
db.version(4).stores({
  callingSlots: '++id, organization, roleName, personId, status, assignedTo, stage, parentSlotId, callingKey, tier, priority, isOpen',
  ministeringCompanionships: '++id, type, status',
  ministeringInterviews: '++id, companionshipId, date',
});

// ── Helper functions ────────────────────────────────────────

// Profile
export async function getProfile() {
  return (await db.profile.toCollection().first()) ?? null;
}

export async function saveProfile(profile) {
  const existing = await getProfile();
  if (existing) {
    return await db.profile.update(existing.id, profile);
  }
  return await db.profile.add(profile);
}

// User Callings
export async function getUserCallings() {
  return await db.userCallings.toArray();
}

export async function addUserCalling(calling) {
  return await db.userCallings.add({
    ...calling,
    startDate: new Date().toISOString(),
  });
}

export async function removeUserCalling(id) {
  return await db.userCallings.delete(id);
}

// Responsibilities
export async function getResponsibilities(callingId) {
  return await db.responsibilities.where('callingId').equals(callingId).toArray();
}

export async function addResponsibility(resp) {
  return await db.responsibilities.add(resp);
}

export async function updateResponsibility(id, changes) {
  return await db.responsibilities.update(id, changes);
}

export async function deleteResponsibility(id) {
  return await db.responsibilities.delete(id);
}

// People
export async function getPeople() {
  return await db.people.orderBy('name').toArray();
}

export async function addPerson(person) {
  return await db.people.add(person);
}

export async function updatePerson(id, changes) {
  return await db.people.update(id, changes);
}

export async function deletePerson(id) {
  return await db.people.delete(id);
}

export async function searchPeople(query) {
  if (!query) return getPeople();
  const q = query.toLowerCase();
  const all = await db.people.toArray();
  return all.filter(p => p.name.toLowerCase().includes(q));
}

// Meetings
export async function getMeetings(callingId) {
  if (callingId) {
    return await db.meetings.where('callingId').equals(callingId).toArray();
  }
  return await db.meetings.toArray();
}

export async function addMeeting(meeting) {
  return await db.meetings.add(meeting);
}

export async function updateMeeting(id, changes) {
  return await db.meetings.update(id, changes);
}

export async function deleteMeeting(id) {
  return await db.meetings.delete(id);
}

export async function deleteMeetingWithInstances(id) {
  const instances = await db.meetingInstances.where('meetingId').equals(id).toArray();
  await db.meetingInstances.bulkDelete(instances.map(i => i.id));
  await db.meetings.delete(id);
}

// Meeting Instances
export async function getMeetingInstances(meetingId, limit = 10) {
  return await db.meetingInstances
    .where('meetingId').equals(meetingId)
    .reverse()
    .sortBy('date');
}

export async function addMeetingInstance(instance) {
  return await db.meetingInstances.add({
    ...instance,
    status: instance.status || 'scheduled',
  });
}

export async function updateMeetingInstance(id, changes) {
  return await db.meetingInstances.update(id, changes);
}

// Action Items
export async function getActionItems(filters = {}) {
  let collection = db.actionItems.toCollection();

  const items = await collection.toArray();

  return items.filter(item => {
    if (filters.status && item.status !== filters.status) return false;
    if (filters.priority && item.priority !== filters.priority) return false;
    if (filters.context && item.context !== filters.context) return false;
    if (filters.excludeComplete && item.status === 'complete') return false;
    if (filters.overdue) {
      const now = new Date().toISOString().split('T')[0];
      if (!item.dueDate || item.dueDate >= now || item.status === 'complete') return false;
    }
    if (filters.dueBy) {
      if (!item.dueDate || item.dueDate > filters.dueBy) return false;
    }
    return true;
  }).sort((a, b) => {
    // Sort: overdue first, then by priority, then by due date
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const now = new Date().toISOString().split('T')[0];
    const aOverdue = a.dueDate && a.dueDate < now && a.status !== 'complete';
    const bOverdue = b.dueDate && b.dueDate < now && b.status !== 'complete';
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    if ((priorityOrder[a.priority] || 2) !== (priorityOrder[b.priority] || 2)) {
      return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
    }
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
}

export async function addActionItem(item) {
  return await db.actionItems.add({
    ...item,
    status: item.status || 'not_started',
    priority: item.priority || 'medium',
    createdAt: new Date().toISOString(),
    targetMeetingIds: item.targetMeetingIds || [],
  });
}

export async function updateActionItem(id, changes) {
  if (changes.status === 'complete' && !changes.completedAt) {
    changes.completedAt = new Date().toISOString();
  }
  return await db.actionItems.update(id, changes);
}

export async function deleteActionItem(id) {
  return await db.actionItems.delete(id);
}

// Quick Capture Inbox
export async function getInboxItems() {
  return await db.inbox.where('processed').equals(0).sortBy('createdAt');
}

export async function addInboxItem(text) {
  return await db.inbox.add({
    text,
    createdAt: new Date().toISOString(),
    processed: 0,
  });
}

export async function markInboxProcessed(id) {
  return await db.inbox.update(id, { processed: 1 });
}

export async function deleteInboxItem(id) {
  return await db.inbox.delete(id);
}

// ── Meeting Note Tags (Phase 2: cross-meeting intelligence) ──

export async function addMeetingNoteTag(tag) {
  return await db.meetingNoteTags.add({
    ...tag,
    consumed: 0,
    createdAt: new Date().toISOString(),
  });
}

export async function getTagsForMeeting(targetMeetingId) {
  return await db.meetingNoteTags
    .where('targetMeetingId').equals(targetMeetingId)
    .filter(t => !t.consumed)
    .toArray();
}

export async function getTagsFromInstance(sourceMeetingInstanceId) {
  return await db.meetingNoteTags
    .where('sourceMeetingInstanceId').equals(sourceMeetingInstanceId)
    .toArray();
}

export async function deleteMeetingNoteTag(id) {
  return await db.meetingNoteTags.delete(id);
}

export async function markTagConsumed(id) {
  return await db.meetingNoteTags.update(id, { consumed: 1 });
}

// ── Auto-Agenda Builder (Phase 2) ────────────────────────────

export async function getLatestInstance(meetingId) {
  const instances = await db.meetingInstances
    .where('meetingId').equals(meetingId)
    .reverse()
    .sortBy('date');
  return instances[0] || null;
}

export async function getUnresolvedActionItems(meetingId) {
  const latest = await getLatestInstance(meetingId);
  if (!latest || !latest.actionItemIds || latest.actionItemIds.length === 0) return [];

  const unresolved = [];
  for (const aid of latest.actionItemIds) {
    const item = await db.actionItems.get(aid);
    if (item && item.status !== 'complete') {
      unresolved.push(item);
    }
  }
  return unresolved;
}

export async function buildAutoAgenda(meetingId) {
  const meeting = await db.meetings.get(meetingId);
  if (!meeting) return [];

  const template = meeting.agendaTemplate || [];

  // 1. Start with template items
  const agendaItems = template.map(label => ({
    label,
    notes: '',
    source: 'template',
  }));

  // 2. Get unresolved action items from last instance
  const unresolved = await getUnresolvedActionItems(meetingId);
  if (unresolved.length > 0) {
    // Insert after "Follow-up" item if it exists, otherwise at position 2
    const followUpIdx = agendaItems.findIndex(
      a => a.label.toLowerCase().includes('follow-up') || a.label.toLowerCase().includes('action items')
    );
    const insertAt = followUpIdx >= 0 ? followUpIdx + 1 : Math.min(2, agendaItems.length);

    for (let i = unresolved.length - 1; i >= 0; i--) {
      agendaItems.splice(insertAt, 0, {
        label: `[Carry Forward] ${unresolved[i].title}`,
        notes: '',
        source: 'carry_forward',
        actionItemId: unresolved[i].id,
      });
    }
  }

  // 3. Get tagged notes from other meetings
  const tags = await getTagsForMeeting(meetingId);
  if (tags.length > 0) {
    // Insert before closing prayer if exists, otherwise at end
    const closingIdx = agendaItems.findIndex(
      a => a.label.toLowerCase().includes('closing prayer')
    );
    const insertAt = closingIdx >= 0 ? closingIdx : agendaItems.length;

    // Get source meeting names for display
    for (let i = tags.length - 1; i >= 0; i--) {
      const tag = tags[i];
      let sourceName = 'another meeting';
      if (tag.sourceMeetingInstanceId) {
        const inst = await db.meetingInstances.get(tag.sourceMeetingInstanceId);
        if (inst) {
          const mtg = await db.meetings.get(inst.meetingId);
          if (mtg) sourceName = mtg.name;
        }
      }
      const preview = tag.text.length > 60 ? tag.text.substring(0, 60) + '...' : tag.text;
      agendaItems.splice(insertAt, 0, {
        label: `[From ${sourceName}] ${preview}`,
        notes: tag.text,
        source: 'tagged_note',
        sourceNoteTagId: tag.id,
      });
      // Mark tag as consumed
      await markTagConsumed(tag.id);
    }
  }

  // 4. Get active calling pipeline items for meetings with jurisdiction
  const callingItems = await getCallingPipelineAgendaItems(meetingId);
  if (callingItems.length > 0) {
    const closingIdx2 = agendaItems.findIndex(
      a => a.label.toLowerCase().includes('closing prayer')
    );
    const insertAt = closingIdx2 >= 0 ? closingIdx2 : agendaItems.length;

    for (let i = callingItems.length - 1; i >= 0; i--) {
      agendaItems.splice(insertAt, 0, callingItems[i]);
    }
  }

  return agendaItems;
}

/**
 * Get active calling pipeline items as agenda entries.
 * Queries calling slots in discussion stages (discussed, prayed_about, assigned_to_extend)
 * filtered by the meeting's calling jurisdiction.
 */
async function getCallingPipelineAgendaItems(meetingId) {
  const meeting = await db.meetings.get(meetingId);
  if (!meeting || !meeting.callingId) return [];

  const jurisdiction = JURISDICTION_MAP[meeting.callingId];
  if (!jurisdiction) return [];

  // Get all calling slots in active discussion stages
  const activeStages = ['discussed', 'prayed_about', 'assigned_to_extend'];
  const allSlots = await db.callingSlots.toArray();
  const activeSlots = allSlots.filter(slot => {
    if (!activeStages.includes(slot.stage)) return false;
    // Filter by jurisdiction
    if (jurisdiction.orgs[0] === '*') return true; // full access
    return jurisdiction.orgs.includes(slot.organization);
  });

  if (activeSlots.length === 0) return [];

  // Sort by stage urgency: assigned_to_extend first, then prayed_about, then discussed
  const stageOrder = { assigned_to_extend: 0, prayed_about: 1, discussed: 2 };
  activeSlots.sort((a, b) => (stageOrder[a.stage] ?? 99) - (stageOrder[b.stage] ?? 99));

  return activeSlots.map(slot => ({
    label: `[Calling] ${slot.roleName} — ${CALLING_STAGES[slot.stage]?.label || slot.stage}${slot.candidateName ? ` (${slot.candidateName})` : ''}`,
    notes: '',
    source: 'calling_pipeline',
    callingSlotId: slot.id,
  }));
}

// Export for use in MeetingNotes
export async function syncCallingNotesFromMeeting(agendaItems, instanceDate, meetingName) {
  for (const item of agendaItems) {
    if (item.source === 'calling_pipeline' && item.callingSlotId && item.notes?.trim()) {
      const slot = await db.callingSlots.get(item.callingSlotId);
      if (!slot) continue;

      // Append meeting notes to the slot's meetingNotes array
      const meetingNotes = [...(slot.meetingNotes || [])];
      meetingNotes.push({
        date: instanceDate,
        meetingName: meetingName,
        note: item.notes.trim(),
      });

      await db.callingSlots.update(item.callingSlotId, {
        meetingNotes,
        notes: item.notes.trim(), // Also update the main notes field
        updatedAt: new Date().toISOString(),
      });
    }
  }
}

// ── Calling Slots / Pipeline (Phase 2) ───────────────────────

export async function getCallingSlots(filters = {}) {
  let items;
  if (filters.organization) {
    items = await db.callingSlots.where('organization').equals(filters.organization).toArray();
  } else if (filters.stage) {
    items = await db.callingSlots.where('stage').equals(filters.stage).toArray();
  } else {
    items = await db.callingSlots.toArray();
  }
  return items;
}

export async function addCallingSlot(slot) {
  return await db.callingSlots.add({
    priority: 'medium',
    isOpen: true,
    expectedCount: 1,
    currentCount: 0,
    candidates: [],
    priorSubmissions: [],
    recommendedServiceMonths: null,
    presidingOfficer: null,
    ...slot,
    stage: slot.stage || 'identified',
    history: slot.history || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export async function updateCallingSlot(id, changes) {
  return await db.callingSlots.update(id, {
    ...changes,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteCallingSlot(id) {
  return await db.callingSlots.delete(id);
}

export async function transitionCallingSlot(id, newStage, note = '', extraUpdates = {}) {
  const slot = await db.callingSlots.get(id);
  if (!slot) return;

  const history = [...(slot.history || [])];
  history.push({
    from: slot.stage,
    to: newStage,
    date: new Date().toISOString(),
    note,
  });

  const updates = {
    stage: newStage,
    history,
    updatedAt: new Date().toISOString(),
    ...extraUpdates,
  };

  // Stage-specific side effects
  if (newStage === 'serving') {
    updates.servedBy = updates.servedBy || slot.candidateName || '';
    updates.servedByPersonId = slot.personId || null;
    updates.servingSince = updates.servingSince || new Date().toISOString();
    updates.isOpen = false;
    updates.currentCount = (slot.currentCount || 0) + 1;
  } else if (newStage === 'released') {
    updates.isOpen = true;
    updates.servedBy = null;
    updates.servedByPersonId = null;
    updates.servingSince = null;
    updates.candidateName = '';
    updates.personId = null;
    updates.currentCount = Math.max(0, (slot.currentCount || 1) - 1);
  }

  await db.callingSlots.update(id, updates);

  // Auto-generate action items for this transition
  const autoActions = getAutoActionsForTransition(newStage, { ...slot, ...updates });
  for (const action of autoActions) {
    await addActionItem(action);
  }

  return { autoActionCount: autoActions.length, hasCurrentHolder: !!slot.servedBy };
}

function getAutoActionsForTransition(newStage, slot) {
  const name = slot.candidateName || 'the candidate';
  const role = slot.roleName || 'the calling';
  const assignedTo = slot.assignedTo || 'a presidency member';

  switch (newStage) {
    case 'discussed':
      return [{ title: `Discuss names for ${role} in presidency meeting`, priority: 'high', context: 'at_church' }];
    case 'prayed_about':
      return [{ title: `Pray about ${name} for ${role}`, priority: 'high' }];
    case 'assigned_to_extend':
      return [{ title: `${assignedTo}: extend ${role} to ${name}`, priority: 'high', context: 'visit' }];
    case 'extended':
      return [{ title: `Follow up on ${role} extension to ${name}`, priority: 'high', context: 'phone' }];
    case 'accepted':
      return [{ title: `Add ${name} for ${role} to sustainings`, priority: 'medium', context: 'at_church' }];
    case 'declined':
      return [{ title: `Reconsider candidates for ${role} (${name} declined)`, priority: 'medium' }];
    case 'sustained':
      return [{ title: `Schedule setting apart for ${name} as ${role}`, priority: 'high', context: 'phone' }];
    case 'set_apart':
      return [
        { title: `Set apart ${name} as ${role}`, priority: 'high', context: 'at_church' },
        { title: `Ensure ${name} has resources for ${role}`, priority: 'medium' },
      ];
    case 'serving':
      return [{ title: `Ensure ${name} has training and resources for ${role}`, priority: 'medium' }];
    case 'release_planned':
      return [{ title: `Schedule meeting with ${name} about release from ${role}`, priority: 'high', context: 'phone' }];
    case 'release_meeting':
      return [{ title: `Announce release of ${name} from ${role}`, priority: 'high', context: 'at_church' }];
    case 'released':
      return [{ title: `Identify replacement for ${role}`, priority: 'high' }];
    default:
      return [];
  }
}

export async function getPipelineSummary() {
  const all = await db.callingSlots.toArray();
  const inPipeline = all.filter(s => s.stage && !['serving', 'released'].includes(s.stage));
  const needsAction = inPipeline.filter(s =>
    ['identified', 'extended', 'sustained'].includes(s.stage)
  );
  const openPositions = all.filter(s => s.isOpen || (!s.candidateName && s.stage === 'identified'));
  const releasesInProgress = all.filter(s => ['release_planned', 'release_meeting'].includes(s.stage));
  const candidatesPending = all.reduce((n, s) => n + (s.candidates?.length || 0), 0);

  return {
    total: all.length,
    active: inPipeline.length,
    needsAction: needsAction.length,
    openPositions: openPositions.length,
    releasesInProgress: releasesInProgress.length,
    candidatesPending,
  };
}

// ── Backup Metadata (no schema change — stored on profile row) ──

export async function updateLastExportDate() {
  const profile = await getProfile();
  if (profile) {
    await db.profile.update(profile.id, {
      lastExportDate: new Date().toISOString(),
    });
  }
}

export async function dismissBackupReminder() {
  const profile = await getProfile();
  if (profile) {
    await db.profile.update(profile.id, {
      backupReminderDismissedAt: new Date().toISOString(),
    });
  }
}

// Journal
export async function getJournalEntries(limit = 20) {
  return await db.journal.orderBy('date').reverse().limit(limit).toArray();
}

export async function addJournalEntry(entry) {
  return await db.journal.add({
    ...entry,
    date: new Date().toISOString(),
  });
}

// Lessons
export async function getLessons(filters = {}) {
  let items = await db.lessons.toArray();
  if (filters.type) items = items.filter(l => l.type === filters.type);
  if (filters.search) {
    const s = filters.search.toLowerCase();
    items = items.filter(l =>
      l.title.toLowerCase().includes(s) ||
      (l.content && l.content.toLowerCase().includes(s)) ||
      (l.tags && l.tags.some(t => t.toLowerCase().includes(s)))
    );
  }
  return items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export async function addLesson(lesson) {
  return await db.lessons.add(lesson);
}

// Stats helpers
export async function getDashboardStats() {
  const allItems = await db.actionItems.toArray();
  const now = new Date().toISOString().split('T')[0];
  const active = allItems.filter(i => i.status !== 'complete');
  const overdue = active.filter(i => i.dueDate && i.dueDate < now);
  const dueToday = active.filter(i => i.dueDate === now);
  const inboxCount = await db.inbox.where('processed').equals(0).count();

  return {
    totalActive: active.length,
    overdue: overdue.length,
    dueToday: dueToday.length,
    inboxCount,
    highPriority: active.filter(i => i.priority === 'high').length,
  };
}

// ── Counselor Organization Assignments ────────────────────────

export async function updateCallingAssignments(callingId, organizations) {
  const uc = await db.userCallings.where('callingKey').equals(callingId).first();
  if (uc) {
    await db.userCallings.update(uc.id, { organizationAssignments: organizations });
  }
}

export async function syncAssignmentMeetings(callingKey, organizations, callingConfig) {
  // Remove all existing assignment meetings for this calling
  const existingMeetings = await db.meetings
    .where('callingId').equals(callingKey)
    .filter(m => m.source === 'assignment')
    .toArray();

  for (const m of existingMeetings) {
    // Delete instances too
    const instances = await db.meetingInstances.where('meetingId').equals(m.id).toArray();
    for (const inst of instances) await db.meetingInstances.delete(inst.id);
    await db.meetings.delete(m.id);
  }

  // Create new meetings from each assigned org's president calling
  for (const orgKey of organizations) {
    const presidentKey = getPresidentForOrg(orgKey);
    if (!presidentKey) continue;

    const presidentConfig = getCallingConfig(presidentKey);
    if (!presidentConfig) continue;

    for (const m of presidentConfig.meetings || []) {
      await db.meetings.add({
        callingId: callingKey,
        name: m.name,
        cadence: m.cadence,
        agendaTemplate: m.agendaTemplate || [],
        handbook: m.handbook || '',
        source: 'assignment',
        sourceOrg: orgKey,
      });
    }
  }
}

export async function removeAssignmentMeetings(callingKey, orgKey) {
  const meetings = await db.meetings
    .where('callingId').equals(callingKey)
    .filter(m => m.source === 'assignment' && m.sourceOrg === orgKey)
    .toArray();

  for (const m of meetings) {
    const instances = await db.meetingInstances.where('meetingId').equals(m.id).toArray();
    for (const inst of instances) await db.meetingInstances.delete(inst.id);
    await db.meetings.delete(m.id);
  }
}

// ── Org Chart Tree Helpers (Phase 3) ──────────────────────────

export async function buildOrgTree() {
  const all = await db.callingSlots.toArray();
  const byParent = {};
  const roots = [];

  for (const slot of all) {
    if (!slot.parentSlotId) {
      roots.push(slot);
    } else {
      if (!byParent[slot.parentSlotId]) byParent[slot.parentSlotId] = [];
      byParent[slot.parentSlotId].push(slot);
    }
  }

  function buildNode(slot) {
    const children = (byParent[slot.id] || [])
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    return { ...slot, children: children.map(buildNode) };
  }

  return roots
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map(buildNode);
}

export async function initializeOrgChart() {
  return initializeOrgChartForRole('stake_president');
}

// ── Role-Scoped Org Chart Initialization ─────────────────────
// Creates calling slots appropriate to the user's role/jurisdiction.
// Bishop → full ward tree, EQ President → EQ subtree only, etc.

export async function initializeOrgChartForRole(callingKey) {
  const existing = await db.callingSlots.count();
  if (existing > 0) return false;

  const jurisdiction = JURISDICTION_MAP[callingKey];
  if (!jurisdiction) return false;

  // Extract the relevant subtree from ORG_HIERARCHY based on scope
  const subtree = extractSubtreeForScope(jurisdiction);
  if (!subtree || subtree.length === 0) return false;

  async function createNode(node, parentId, sortOrder) {
    const count = node.expectedCount || 1;
    let lastId = null;

    for (let n = 0; n < count; n++) {
      const roleName = count > 1 ? `${node.roleName} ${n + 1}` : node.roleName;
      const id = await db.callingSlots.add({
        organization: node.organization,
        roleName,
        callingKey: node.callingKey || null,
        tier: node.tier,
        sortOrder: count > 1 ? sortOrder * 100 + n : sortOrder,
        parentSlotId: parentId || null,
        isCustomPosition: false,
        stage: 'identified',
        candidateName: '',
        isOpen: true,
        expectedCount: 1,
        currentCount: 0,
        candidates: [],
        priorSubmissions: [],
        history: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Only attach children to the first instance (or the single instance)
      if (n === 0 && node.children) {
        for (let i = 0; i < node.children.length; i++) {
          await createNode(node.children[i], id, i);
        }
      }
      lastId = id;
    }
    return lastId;
  }

  for (let i = 0; i < subtree.length; i++) {
    await createNode(subtree[i], null, i);
  }
  return true;
}

// Helper: extract the relevant portion of ORG_HIERARCHY for a jurisdiction
function extractSubtreeForScope(jurisdiction) {
  const { scope, orgs } = jurisdiction;

  if (scope === 'stake') {
    // Full hierarchy
    return ORG_HIERARCHY;
  }

  // Find the Bishop node inside the hierarchy
  function findBishopNode(nodes) {
    for (const node of nodes) {
      if (node.callingKey === 'bishop') return node;
      if (node.children) {
        const found = findBishopNode(node.children);
        if (found) return found;
      }
    }
    return null;
  }

  if (scope === 'ward' || scope === 'assigned_wards') {
    // Ward-level: Bishop node as root with all ward children
    const bishop = findBishopNode(ORG_HIERARCHY);
    return bishop ? [bishop] : [];
  }

  if (scope === 'org') {
    // Org-level: only the org president nodes matching visible orgs
    const bishop = findBishopNode(ORG_HIERARCHY);
    if (!bishop || !bishop.children) return [];

    const matchingNodes = [];
    for (const child of bishop.children) {
      if (orgs.includes(child.organization)) {
        matchingNodes.push(child);
      }
    }
    return matchingNodes;
  }

  return [];
}

// ── Open Positions ──────────────────────────────────────────

export async function getOpenPositions(orgFilter) {
  let all = await db.callingSlots.toArray();
  if (orgFilter) {
    all = all.filter(s => s.organization === orgFilter);
  }
  return all.filter(s =>
    s.isOpen === true ||
    (s.currentCount || 0) < (s.expectedCount || 1) ||
    (!s.candidateName && s.stage === 'identified')
  );
}

// ── Candidate Management ────────────────────────────────────

export async function addCandidate(slotId, candidate) {
  const slot = await db.callingSlots.get(slotId);
  if (!slot) return;

  const candidates = [...(slot.candidates || [])];
  candidates.push({
    ...candidate,
    submittedAt: new Date().toISOString(),
    status: 'pending',
  });

  await db.callingSlots.update(slotId, {
    candidates,
    updatedAt: new Date().toISOString(),
  });
}

export async function declineCandidate(slotId, candidateIndex) {
  const slot = await db.callingSlots.get(slotId);
  if (!slot || !slot.candidates?.[candidateIndex]) return;

  const candidates = [...(slot.candidates || [])];
  const declined = candidates.splice(candidateIndex, 1)[0];
  declined.status = 'declined';
  declined.declinedAt = new Date().toISOString();

  const priorSubmissions = [...(slot.priorSubmissions || []), declined];

  await db.callingSlots.update(slotId, {
    candidates,
    priorSubmissions,
    updatedAt: new Date().toISOString(),
  });
}

export async function acceptCandidate(slotId, candidateIndex) {
  const slot = await db.callingSlots.get(slotId);
  if (!slot || !slot.candidates?.[candidateIndex]) return null;

  const candidates = [...(slot.candidates || [])];
  const accepted = candidates.splice(candidateIndex, 1)[0];
  accepted.status = 'accepted';
  accepted.acceptedAt = new Date().toISOString();

  await db.callingSlots.update(slotId, {
    candidateName: accepted.name,
    personId: accepted.personId || null,
    candidates,
    stage: 'identified',
    updatedAt: new Date().toISOString(),
  });

  return slot; // Return slot so caller can check if someone is currently serving
}

// ── Release Flow ────────────────────────────────────────────

export async function startRelease(slotId, releaseTarget) {
  const slot = await db.callingSlots.get(slotId);
  if (!slot || slot.stage !== 'serving') return;

  await transitionCallingSlot(slotId, 'release_planned');
  await db.callingSlots.update(slotId, { releaseTarget });
}

// ── Service Alerts ──────────────────────────────────────────

export async function getServiceAlerts() {
  const all = await db.callingSlots.toArray();
  const now = Date.now();
  const alerts = [];

  for (const slot of all) {
    if (slot.stage !== 'serving' || !slot.servingSince || !slot.recommendedServiceMonths) continue;
    const start = new Date(slot.servingSince).getTime();
    const servedMs = now - start;
    const servedMonths = servedMs / (1000 * 60 * 60 * 24 * 30.44);
    const remaining = slot.recommendedServiceMonths - servedMonths;

    if (remaining <= 3 && remaining > -6) {
      alerts.push({
        ...slot,
        servedMonths: Math.round(servedMonths),
        remainingMonths: Math.round(remaining),
      });
    }
  }

  return alerts.sort((a, b) => a.remainingMonths - b.remainingMonths);
}

// ── Org Template Initialization ─────────────────────────────

export async function initializeOrgFromTemplate(orgKey, parentSlotId) {
  const template = ORG_TEMPLATES[orgKey];
  if (!template) return [];

  const ids = [];
  for (let i = 0; i < template.children.length; i++) {
    const child = template.children[i];
    const count = child.expectedCount || 1;
    const id = await db.callingSlots.add({
      organization: orgKey,
      roleName: child.roleName,
      parentSlotId,
      isCustomPosition: false,
      stage: 'identified',
      candidateName: '',
      priority: 'medium',
      isOpen: true,
      expectedCount: count,
      currentCount: 0,
      candidates: [],
      priorSubmissions: [],
      recommendedServiceMonths: null,
      presidingOfficer: null,
      sortOrder: i,
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    ids.push(id);
  }
  return ids;
}

// ── Hidden Orgs (user preference) ───────────────────────────

export async function updateHiddenOrgs(hiddenOrgs) {
  const profile = await getProfile();
  if (profile) {
    await db.profile.update(profile.id, { hiddenOrgs });
  }
}

// ── Ministering (Phase 4) ───────────────────────────────────

export async function getMinisteringCompanionships(type) {
  if (type) {
    return await db.ministeringCompanionships.where('type').equals(type).toArray();
  }
  return await db.ministeringCompanionships.toArray();
}

export async function addMinisteringCompanionship(comp) {
  return await db.ministeringCompanionships.add({
    ...comp,
    status: comp.status || 'active',
    assignedFamilyIds: comp.assignedFamilyIds || [],
    assignedFamilyNames: comp.assignedFamilyNames || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export async function updateMinisteringCompanionship(id, changes) {
  return await db.ministeringCompanionships.update(id, {
    ...changes,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteMinisteringCompanionship(id) {
  // Also delete related interviews
  const interviews = await db.ministeringInterviews.where('companionshipId').equals(id).toArray();
  await db.ministeringInterviews.bulkDelete(interviews.map(i => i.id));
  return await db.ministeringCompanionships.delete(id);
}

export async function getMinisteringInterviews(companionshipId) {
  return await db.ministeringInterviews
    .where('companionshipId').equals(companionshipId)
    .reverse()
    .sortBy('date');
}

export async function addMinisteringInterview(interview) {
  return await db.ministeringInterviews.add({
    ...interview,
    date: interview.date || new Date().toISOString(),
  });
}

export async function updateMinisteringInterview(id, changes) {
  return await db.ministeringInterviews.update(id, changes);
}

// ── Ministering Summary (for Dashboard) ──────────────────────

export async function getMinisteringSummary() {
  const comps = await db.ministeringCompanionships.toArray();
  const activeComps = comps.filter(c => c.status === 'active');

  // Get all people to find unassigned
  const people = await db.people.toArray();
  const assignedIds = new Set();
  const ministerIds = new Set();
  for (const c of activeComps) {
    if (c.minister1Id) ministerIds.add(c.minister1Id);
    if (c.minister2Id) ministerIds.add(c.minister2Id);
    for (const fId of (c.assignedFamilyIds || [])) {
      assignedIds.add(fId);
    }
  }

  const eligible = people.filter(p => p.isMinisterEligible !== false && !p.moveOutDate);
  const unassignedFamilies = eligible.filter(p =>
    !assignedIds.has(p.id) && !ministerIds.has(p.id)
  ).length;

  // Check for overdue interviews (> 90 days)
  const now = Date.now();
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;
  let overdueInterviews = 0;

  for (const c of activeComps) {
    const interviews = await db.ministeringInterviews
      .where('companionshipId').equals(c.id)
      .reverse()
      .sortBy('date');
    const lastInterview = interviews[0];
    if (!lastInterview || (now - new Date(lastInterview.date).getTime()) > ninetyDays) {
      overdueInterviews++;
    }
  }

  return {
    totalCompanionships: activeComps.length,
    unassignedFamilies,
    overdueInterviews,
  };
}

export default db;
