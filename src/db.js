import Dexie from 'dexie';
import { getCallingConfig, getPresidentForOrg } from './data/callings';

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
  // New table: tagged notes bridging meetings
  meetingNoteTags: '++id, sourceMeetingInstanceId, targetMeetingId, consumed, createdAt',

  // Enhanced callingSlots with stage index
  callingSlots: '++id, organization, roleName, personId, status, assignedTo, stage',

  // All other tables remain unchanged (Dexie preserves them automatically)
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

  return agendaItems;
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

export async function transitionCallingSlot(id, newStage, note = '') {
  const slot = await db.callingSlots.get(id);
  if (!slot) return;

  const history = [...(slot.history || [])];
  history.push({
    from: slot.stage,
    to: newStage,
    date: new Date().toISOString(),
    note,
  });

  await db.callingSlots.update(id, {
    stage: newStage,
    history,
    updatedAt: new Date().toISOString(),
  });

  // Auto-generate action items for this transition
  const autoActions = getAutoActionsForTransition(newStage, slot);
  for (const action of autoActions) {
    await addActionItem(action);
  }

  return autoActions.length;
}

function getAutoActionsForTransition(newStage, slot) {
  const name = slot.candidateName || 'the candidate';
  const role = slot.roleName || 'the calling';

  switch (newStage) {
    case 'prayed_about':
      return [{ title: `Pray about ${name} for ${role}`, priority: 'high' }];
    case 'discussed':
      return [{ title: `Discuss ${name} for ${role} in Bishopric Meeting`, priority: 'high', context: 'at_church' }];
    case 'extended':
      return [
        { title: `Schedule interview to extend ${role} to ${name}`, priority: 'high', context: 'phone' },
        { title: `Extend ${role} calling to ${name}`, priority: 'high', context: 'visit' },
      ];
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
    default:
      return [];
  }
}

export async function getPipelineSummary() {
  const all = await db.callingSlots.toArray();
  const active = all.filter(s => s.stage && s.stage !== 'set_apart');
  const needsAction = active.filter(s =>
    ['identified', 'extended', 'sustained'].includes(s.stage)
  );
  return { total: all.length, active: active.length, needsAction: needsAction.length };
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

export default db;
