import Dexie from 'dexie';
import { getCallingConfig, getPresidentForOrg, ORG_HIERARCHY, ORG_TEMPLATES, JURISDICTION_MAP } from './data/callings';
import { CALLING_STAGES, CALL_STAGE_ORDER } from './utils/constants';
import { getNextMeetingDate } from './utils/meetingSchedule';

// Debounce Firestore sync to avoid rapid-fire writes.
// Uses dynamic import to break circular dependency (firestoreSync imports db).
let _syncTimer = null;
function debouncedSync() {
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(async () => {
    const { syncMeetingSchedule } = await import('./utils/firestoreSync');
    syncMeetingSchedule();
  }, 2000);
}

// Cloud sync helper — fire-and-forget push after each Dexie write
async function syncAfterWrite(tableName, id, data) {
  try {
    const { pushToCloud } = await import('./utils/cloudSync');
    pushToCloud(tableName, id, data);
  } catch {}
}

async function syncAfterDelete(tableName, id) {
  try {
    const { deleteFromCloud } = await import('./utils/cloudSync');
    deleteFromCloud(tableName, id);
  } catch {}
}

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

// Phase 5: Per-meeting reminder preferences
db.version(5).stores({
  meetings: '++id, callingId, name, cadence, agendaTemplate, participants, reminderDays',
});

// Phase 6: Ongoing tasks, ministering plans, cloud sync
db.version(6).stores({
  ongoingTasks: '++id, meetingId, title, status, createdAt',
  ministeringPlans: '++id, personName, familyName, status, createdAt',
});

// Phase 7: Unified tasks table — replaces actionItems, ongoingTasks, ministeringPlans, events
db.version(7).stores({
  tasks: '++id, type, status, priority, dueDate, starred, createdAt, completedAt, *meetingIds, callingSlotId',
}).upgrade(async tx => {
  const tasksTable = tx.table('tasks');

  // Migrate actionItems → tasks (type: 'action_item')
  const actionItems = await tx.table('actionItems').toArray();
  for (const item of actionItems) {
    await tasksTable.add({
      type: 'action_item',
      title: item.title || '',
      description: item.description || '',
      status: item.status || 'not_started',
      priority: item.priority || 'low',
      context: item.context || '',
      dueDate: item.dueDate || '',
      starred: item.starred || false,
      assignedTo: item.assignedTo || null,
      isRecurring: item.isRecurring || false,
      recurringCadence: item.recurringCadence || '',
      meetingIds: item.targetMeetingIds || [],
      sourceMeetingInstanceId: item.sourceMeetingInstanceId || null,
      followUp: (item.targetMeetingIds?.length > 0 && item.status !== 'complete') ? 'next' : null,
      followUpNotes: [],
      createdAt: item.createdAt || new Date().toISOString(),
      completedAt: item.completedAt || null,
      _migratedFrom: 'actionItems',
      _oldId: item.id,
    });
  }

  // Migrate ongoingTasks → tasks (type: 'ongoing')
  const ongoingTasks = await tx.table('ongoingTasks').toArray();
  for (const task of ongoingTasks) {
    if (task.status !== 'active') continue; // skip dismissed
    await tasksTable.add({
      type: 'ongoing',
      title: task.title || '',
      description: '',
      status: 'in_progress',
      priority: 'medium',
      meetingIds: task.meetingId ? [task.meetingId] : [],
      followUp: 'next',
      followUpNotes: (task.updates || []).map(u => ({
        text: u.text,
        date: u.date,
        instanceId: u.instanceId || null,
        meetingName: u.meetingName || '',
      })),
      createdAt: task.createdAt || new Date().toISOString(),
      completedAt: null,
      _migratedFrom: 'ongoingTasks',
      _oldId: task.id,
    });
  }

  // Migrate ministeringPlans → tasks (type: 'ministering_plan')
  const plans = await tx.table('ministeringPlans').toArray();
  for (const plan of plans) {
    if (plan.status !== 'active') continue; // skip completed
    await tasksTable.add({
      type: 'ministering_plan',
      title: plan.personName ? `${plan.personName}${plan.familyName ? ' — ' + plan.familyName : ''}` : 'Ministering Plan',
      description: plan.description || '',
      status: 'in_progress',
      priority: 'medium',
      personName: plan.personName || '',
      familyName: plan.familyName || '',
      meetingIds: [], // ministering plans appear globally
      followUp: 'next',
      followUpNotes: (plan.updates || []).map(u => ({
        text: u.text,
        date: u.date,
        instanceId: u.instanceId || null,
        meetingName: u.meetingName || '',
      })),
      createdAt: plan.createdAt || new Date().toISOString(),
      completedAt: null,
      _migratedFrom: 'ministeringPlans',
      _oldId: plan.id,
    });
  }

  // Migrate events → tasks (type: 'event')
  const events = await tx.table('events').toArray();
  for (const evt of events) {
    await tasksTable.add({
      type: 'event',
      title: evt.title || '',
      description: evt.notes || '',
      status: evt.status || 'not_started',
      priority: 'medium',
      eventDate: evt.date || '',
      dueDate: evt.date || '',
      organization: evt.organization || '',
      budget: evt.budget || '',
      meetingIds: [],
      followUp: null,
      followUpNotes: [],
      createdAt: new Date().toISOString(),
      completedAt: null,
      _migratedFrom: 'events',
      _oldId: evt.id,
    });
  }

  console.log(`[Migration v7] Migrated ${actionItems.length} action items, ${ongoingTasks.length} ongoing tasks, ${plans.length} ministering plans, ${events.length} events → unified tasks table`);
});

// ── Unified Tasks CRUD (Phase 7) ──────────────────────────────

export async function getTasks(filters = {}) {
  const items = await db.tasks.toArray();

  return items.filter(item => {
    if (filters.type && item.type !== filters.type) return false;
    if (filters.status && item.status !== filters.status) return false;
    if (filters.priority && item.priority !== filters.priority) return false;
    if (filters.excludeComplete && item.status === 'complete') return false;
    if (filters.starred && !item.starred) return false;
    if (filters.meetingId && !(item.meetingIds || []).includes(filters.meetingId)) return false;
    if (filters.callingSlotId && item.callingSlotId !== filters.callingSlotId) return false;
    if (filters.overdue) {
      const now = new Date().toISOString().split('T')[0];
      if (!item.dueDate || item.dueDate >= now || item.status === 'complete') return false;
    }
    if (filters.dueBy) {
      if (!item.dueDate || item.dueDate > filters.dueBy) return false;
    }
    return true;
  }).sort((a, b) => {
    // Starred first, then overdue, then by priority, then by due date
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
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
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
}

export async function addTask(task) {
  const data = {
    ...task,
    type: task.type || 'action_item',
    status: task.status || 'not_started',
    priority: task.priority || 'low',
    meetingIds: task.meetingIds || [],
    followUp: task.followUp || null,
    followUpNotes: task.followUpNotes || [],
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  const id = await db.tasks.add(data);
  syncAfterWrite('tasks', id, { ...data, id });
  return id;
}

export async function updateTask(id, changes) {
  if (changes.status === 'complete' && !changes.completedAt) {
    changes.completedAt = new Date().toISOString();
  }
  if (changes.status && changes.status !== 'complete') {
    changes.completedAt = null;
  }
  await db.tasks.update(id, changes);
  const updated = await db.tasks.get(id);
  if (updated) syncAfterWrite('tasks', id, updated);
}

export async function deleteTask(id) {
  await db.tasks.delete(id);
  syncAfterDelete('tasks', id);
}

export async function getTask(id) {
  return await db.tasks.get(id);
}

export async function getTasksForMeeting(meetingId) {
  const all = await db.tasks.toArray();
  return all.filter(t =>
    (t.meetingIds || []).includes(meetingId) && t.status !== 'complete'
  ).sort((a, b) => {
    // Group by type: discussions first, then action items, then others
    const typeOrder = { discussion: 0, action_item: 1, calling_plan: 2, ministering_plan: 3, ongoing: 4, event: 5 };
    const aOrder = typeOrder[a.type] ?? 6;
    const bOrder = typeOrder[b.type] ?? 6;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });
}

export async function getFollowUpsForMeeting(meetingId) {
  const all = await db.tasks.toArray();
  return all.filter(t =>
    t.status !== 'complete' &&
    t.followUp === 'next' &&
    (t.meetingIds || []).includes(meetingId)
  );
}

export async function addTaskFollowUpNote(id, note) {
  const task = await db.tasks.get(id);
  if (!task) return;
  const followUpNotes = [...(task.followUpNotes || []), {
    ...note,
    date: note.date || new Date().toISOString(),
  }];
  await db.tasks.update(id, { followUpNotes });
  syncAfterWrite('tasks', id, { ...task, followUpNotes });
}

export async function getTasksByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const items = await db.tasks.bulkGet(ids);
  return items.filter(Boolean);
}

// ── Helper functions ────────────────────────────────────────

// Profile
export async function getProfile() {
  return (await db.profile.toCollection().first()) ?? null;
}

export async function saveProfile(profile) {
  const existing = await getProfile();
  if (existing) {
    await db.profile.update(existing.id, profile);
    syncAfterWrite('profile', existing.id, { ...existing, ...profile });
    return;
  }
  const id = await db.profile.add(profile);
  syncAfterWrite('profile', id, { ...profile, id });
  return id;
}

// User Callings
export async function getUserCallings() {
  return await db.userCallings.toArray();
}

export async function addUserCalling(calling) {
  const data = { ...calling, startDate: new Date().toISOString() };
  const id = await db.userCallings.add(data);
  syncAfterWrite('userCallings', id, { ...data, id });
  return id;
}

export async function removeUserCalling(id) {
  await db.userCallings.delete(id);
  syncAfterDelete('userCallings', id);
}

// Responsibilities
export async function getResponsibilities(callingId) {
  return await db.responsibilities.where('callingId').equals(callingId).toArray();
}

export async function addResponsibility(resp) {
  const id = await db.responsibilities.add(resp);
  syncAfterWrite('responsibilities', id, { ...resp, id });
  return id;
}

export async function updateResponsibility(id, changes) {
  await db.responsibilities.update(id, changes);
  const updated = await db.responsibilities.get(id);
  if (updated) syncAfterWrite('responsibilities', id, updated);
}

export async function deleteResponsibility(id) {
  await db.responsibilities.delete(id);
  syncAfterDelete('responsibilities', id);
}

// People
export async function getPeople() {
  return await db.people.orderBy('name').toArray();
}

export async function addPerson(person) {
  const id = await db.people.add(person);
  syncAfterWrite('people', id, { ...person, id });
  return id;
}

export async function updatePerson(id, changes) {
  await db.people.update(id, changes);
  const updated = await db.people.get(id);
  if (updated) syncAfterWrite('people', id, updated);
}

export async function deletePerson(id) {
  await db.people.delete(id);
  syncAfterDelete('people', id);
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
  const id = await db.meetings.add(meeting);
  syncAfterWrite('meetings', id, { ...meeting, id });
  debouncedSync();
  return id;
}

export async function updateMeeting(id, changes) {
  const result = await db.meetings.update(id, changes);
  const updated = await db.meetings.get(id);
  if (updated) syncAfterWrite('meetings', id, updated);
  debouncedSync();
  return result;
}

export async function deleteMeeting(id) {
  await db.meetings.delete(id);
  syncAfterDelete('meetings', id);
  debouncedSync();
}

export async function deleteMeetingWithInstances(id) {
  const instances = await db.meetingInstances.where('meetingId').equals(id).toArray();
  for (const inst of instances) syncAfterDelete('meetingInstances', inst.id);
  await db.meetingInstances.bulkDelete(instances.map(i => i.id));
  await db.meetings.delete(id);
  syncAfterDelete('meetings', id);
  debouncedSync();
}

// Meeting Instances
export async function getMeetingInstances(meetingId, limit = 10) {
  return await db.meetingInstances
    .where('meetingId').equals(meetingId)
    .reverse()
    .sortBy('date');
}

export async function addMeetingInstance(instance) {
  const data = { ...instance, status: instance.status || 'scheduled' };
  const id = await db.meetingInstances.add(data);
  syncAfterWrite('meetingInstances', id, { ...data, id });
  debouncedSync();
  return id;
}

export async function updateMeetingInstance(id, changes) {
  await db.meetingInstances.update(id, changes);
  const updated = await db.meetingInstances.get(id);
  if (updated) syncAfterWrite('meetingInstances', id, updated);
}

export async function deleteMeetingInstance(id) {
  await db.meetingInstances.delete(id);
  syncAfterDelete('meetingInstances', id);
  debouncedSync();
}

// ── Upcoming Meetings (calculated next dates) ────────────────

export async function getUpcomingMeetings() {
  const allMeetings = await db.meetings.toArray();
  const results = [];

  for (const meeting of allMeetings) {
    // Get the latest instance to determine last meeting date
    const instances = await db.meetingInstances
      .where('meetingId').equals(meeting.id)
      .reverse()
      .sortBy('date');
    const latestInstance = instances[0] || null;
    const lastInstanceDate = latestInstance?.date || null;

    // Calculate next date from cadence + last instance
    const nextDate = getNextMeetingDate(meeting.cadence, lastInstanceDate);

    results.push({
      ...meeting,
      nextDate,
      lastInstanceDate,
    });
  }

  // Sort: meetings with dates first (soonest first), then null-date meetings
  results.sort((a, b) => {
    if (a.nextDate && b.nextDate) return a.nextDate.localeCompare(b.nextDate);
    if (a.nextDate) return -1;
    if (b.nextDate) return 1;
    return 0;
  });

  return results;
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
  const data = {
    ...item,
    status: item.status || 'not_started',
    priority: item.priority || 'low',
    createdAt: new Date().toISOString(),
    targetMeetingIds: item.targetMeetingIds || [],
  };
  const id = await db.actionItems.add(data);
  syncAfterWrite('actionItems', id, { ...data, id });
  return id;
}

export async function updateActionItem(id, changes) {
  if (changes.status === 'complete' && !changes.completedAt) {
    changes.completedAt = new Date().toISOString();
  }
  await db.actionItems.update(id, changes);
  const updated = await db.actionItems.get(id);
  if (updated) syncAfterWrite('actionItems', id, updated);
}

export async function deleteActionItem(id) {
  await db.actionItems.delete(id);
  syncAfterDelete('actionItems', id);
}

export async function getActionItemsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const items = await db.actionItems.bulkGet(ids);
  return items.filter(Boolean);
}

export async function searchMeetingInstances(query) {
  if (!query || query.trim().length < 2) return [];
  const q = query.toLowerCase();
  const allInstances = await db.meetingInstances.toArray();
  const allMeetings = await db.meetings.toArray();
  const meetingMap = {};
  allMeetings.forEach(m => { meetingMap[m.id] = m.name; });

  const results = [];
  for (const inst of allInstances) {
    const matches = [];
    // Search general notes
    if (inst.notes && inst.notes.toLowerCase().includes(q)) {
      matches.push({ type: 'notes', text: inst.notes });
    }
    // Search agenda items
    if (inst.agendaItems) {
      for (const item of inst.agendaItems) {
        if (item.label?.toLowerCase().includes(q)) {
          matches.push({ type: 'agenda', text: item.label });
        }
        if (item.notes?.toLowerCase().includes(q)) {
          matches.push({ type: 'agenda_notes', text: item.notes, label: item.label });
        }
      }
    }
    // Search focus families
    if (inst.focusFamilies) {
      for (const ff of inst.focusFamilies) {
        if (ff.name?.toLowerCase().includes(q) || ff.notes?.toLowerCase().includes(q)) {
          matches.push({ type: 'focus_family', text: ff.name + (ff.notes ? ': ' + ff.notes : '') });
        }
      }
    }
    if (matches.length > 0) {
      results.push({
        instanceId: inst.id,
        meetingId: inst.meetingId,
        meetingName: meetingMap[inst.meetingId] || 'Meeting',
        date: inst.date,
        status: inst.status,
        matches,
      });
    }
  }
  results.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return results;
}

// Quick Capture Inbox
export async function getInboxItems() {
  return await db.inbox.where('processed').equals(0).sortBy('createdAt');
}

export async function addInboxItem(text) {
  const data = { text, createdAt: new Date().toISOString(), processed: 0 };
  const id = await db.inbox.add(data);
  syncAfterWrite('inbox', id, { ...data, id });
  return id;
}

export async function markInboxProcessed(id) {
  await db.inbox.update(id, { processed: 1 });
  const updated = await db.inbox.get(id);
  if (updated) syncAfterWrite('inbox', id, updated);
}

export async function deleteInboxItem(id) {
  await db.inbox.delete(id);
  syncAfterDelete('inbox', id);
}

// ── Meeting Note Tags (Phase 2: cross-meeting intelligence) ──

export async function addMeetingNoteTag(tag) {
  const data = { ...tag, consumed: 0, createdAt: new Date().toISOString() };
  const id = await db.meetingNoteTags.add(data);
  syncAfterWrite('meetingNoteTags', id, { ...data, id });
  return id;
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
  await db.meetingNoteTags.delete(id);
  syncAfterDelete('meetingNoteTags', id);
}

export async function markTagConsumed(id) {
  await db.meetingNoteTags.update(id, { consumed: 1 });
  const updated = await db.meetingNoteTags.get(id);
  if (updated) syncAfterWrite('meetingNoteTags', id, updated);
}

// ── Auto-Agenda Builder (Phase 2) ────────────────────────────

export async function getLatestInstance(meetingId, beforeDate) {
  const instances = await db.meetingInstances
    .where('meetingId').equals(meetingId)
    .reverse()
    .sortBy('date');
  if (beforeDate) {
    // Return the most recent instance BEFORE the given date
    return instances.find(i => i.date < beforeDate) || null;
  }
  return instances[0] || null;
}

export async function getUnresolvedActionItems(meetingId, beforeDate) {
  const latest = await getLatestInstance(meetingId, beforeDate);
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

export async function buildAutoAgenda(meetingId, forDate) {
  const meeting = await db.meetings.get(meetingId);
  if (!meeting) return [];

  const template = meeting.agendaTemplate || [];

  // 1. Start with template items
  const agendaItems = template.map(label => ({
    label,
    notes: '',
    source: 'template',
  }));

  // 1b. Inject pre-meeting tasks (added by user before starting the meeting)
  if (meeting.pendingAgendaItems?.length > 0) {
    for (const item of meeting.pendingAgendaItems) {
      agendaItems.push({
        label: item.label,
        notes: item.notes || '',
        source: 'pre_meeting',
      });
    }
    // Clear pre-meeting tasks after consumption
    await db.meetings.update(meetingId, { pendingAgendaItems: [] });
    syncAfterWrite('meetings', meetingId, await db.meetings.get(meetingId));
  }

  // 2. Get unresolved action items from the instance before this date (or latest)
  const unresolved = await getUnresolvedActionItems(meetingId, forDate);
  if (unresolved.length > 0) {
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

  // 2b. Get recently completed follow-ups
  const completedFollowUps = await getCompletedFollowUps(meetingId);
  if (completedFollowUps.length > 0) {
    const followUpIdx = agendaItems.findIndex(
      a => a.label.toLowerCase().includes('follow-up') || a.label.toLowerCase().includes('action items')
    );
    const insertAt = followUpIdx >= 0 ? followUpIdx + 1 : Math.min(2, agendaItems.length);

    for (let i = completedFollowUps.length - 1; i >= 0; i--) {
      agendaItems.splice(insertAt, 0, {
        label: `[Completed] ${completedFollowUps[i].title}`,
        notes: '',
        source: 'completed_followup',
        actionItemId: completedFollowUps[i].id,
      });
    }
  }

  // 3. Get ongoing tasks for this meeting
  const ongoingTasks = await getOngoingTasks(meetingId);
  if (ongoingTasks.length > 0) {
    const closingIdx = agendaItems.findIndex(a => a.label.toLowerCase().includes('closing prayer'));
    const insertAt = closingIdx >= 0 ? closingIdx : agendaItems.length;

    for (let i = ongoingTasks.length - 1; i >= 0; i--) {
      const task = ongoingTasks[i];
      const lastUpdate = task.updates?.length > 0 ? task.updates[task.updates.length - 1].text : '';
      agendaItems.splice(insertAt, 0, {
        label: `[Ongoing] ${task.title}`,
        notes: lastUpdate,
        source: 'ongoing_task',
        ongoingTaskId: task.id,
      });
    }
  }

  // 4. Get active ministering plans (available to ALL meetings)
  const ministeringPlans = await getActiveMinisteringPlans();
  if (ministeringPlans.length > 0) {
    const closingIdx = agendaItems.findIndex(a => a.label.toLowerCase().includes('closing prayer'));
    const insertAt = closingIdx >= 0 ? closingIdx : agendaItems.length;

    for (let i = ministeringPlans.length - 1; i >= 0; i--) {
      const plan = ministeringPlans[i];
      const label = plan.familyName
        ? `[Ministering] ${plan.personName} ${plan.familyName} Family`
        : `[Ministering] ${plan.personName}`;
      const lastUpdate = plan.updates?.length > 0 ? plan.updates[plan.updates.length - 1].text : '';
      agendaItems.splice(insertAt, 0, {
        label,
        notes: lastUpdate,
        source: 'ministering_plan',
        ministeringPlanId: plan.id,
      });
    }
  }

  // 5. Get tagged notes from other meetings
  const tags = await getTagsForMeeting(meetingId);
  if (tags.length > 0) {
    const closingIdx = agendaItems.findIndex(
      a => a.label.toLowerCase().includes('closing prayer')
    );
    const insertAt = closingIdx >= 0 ? closingIdx : agendaItems.length;

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
      await markTagConsumed(tag.id);
    }
  }

  // 6. Get active calling pipeline items for meetings with jurisdiction
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

  // 7. Get action items assigned to this meeting (via targetMeetingIds)
  const allActions = await db.actionItems.toArray();
  const assignedActions = allActions.filter(a =>
    a.status !== 'complete' &&
    a.targetMeetingIds?.includes(meetingId)
  );
  if (assignedActions.length > 0) {
    const closingIdx3 = agendaItems.findIndex(
      a => a.label.toLowerCase().includes('closing prayer')
    );
    const insertAt = closingIdx3 >= 0 ? closingIdx3 : agendaItems.length;

    for (let i = assignedActions.length - 1; i >= 0; i--) {
      const action = assignedActions[i];
      const assignee = action.assignedTo?.name ? ` (${action.assignedTo.name})` : '';
      agendaItems.splice(insertAt, 0, {
        label: `[Action Item] ${action.title}${assignee}`,
        notes: action.description || '',
        source: 'assigned_action_item',
        actionItemId: action.id,
      });
    }
  }

  return agendaItems;
}

/** Detect closing prayer / benediction lines in the template */
const _CLOSING_RE = /^(closing\s+prayer|benediction|closing\s+hymn)/i;
function _isClosingItem(text) { return _CLOSING_RE.test(text.trim()); }

/**
 * Build block-based agenda for a new meeting instance.
 * Returns simplified blocks: text (single document) + task_ref (inline chips).
 * Tasks are categorized into labeled sections by type.
 */
export async function buildAutoAgendaBlocks(meetingId) {
  const meeting = await db.meetings.get(meetingId);
  if (!meeting) return [{ id: _nextBlockId(), type: 'text', text: '' }];

  const template = meeting.agendaTemplate || [];

  // Split template at closing items
  const beforeClosing = [];
  const closingItems = [];
  let reachedClosing = false;
  for (const item of template) {
    if (!reachedClosing && _isClosingItem(item)) reachedClosing = true;
    (reachedClosing ? closingItems : beforeClosing).push(item);
  }

  const blocks = [];

  // 1. Main agenda text — template items as bullet points
  const mainLines = beforeClosing.map(item => `• ${item}`);
  blocks.push({ id: _nextBlockId(), type: 'text', text: mainLines.join('\n') });

  // 2. Gather all follow-up and linked tasks, categorize by type
  const allTasks = await db.tasks.toArray();
  const seen = new Set();
  const categorized = {
    action_item: [],
    discussion: [],
    event: [],
    calling_plan: [],
    ministering_plan: [],
    ongoing: [],
  };

  // Follow-up tasks (any type with followUp === 'next' linked to this meeting)
  const followUps = await getFollowUpsForMeeting(meetingId);
  for (const t of followUps) {
    if (!seen.has(t.id) && categorized[t.type]) {
      categorized[t.type].push(t);
      seen.add(t.id);
    }
  }

  // Also include non-complete tasks linked to this meeting (discussions, etc.)
  const linkedTasks = allTasks.filter(t =>
    t.status !== 'complete' &&
    !seen.has(t.id) &&
    (t.meetingIds || []).includes(meetingId)
  );
  for (const t of linkedTasks) {
    if (categorized[t.type]) {
      categorized[t.type].push(t);
      seen.add(t.id);
    }
  }

  // Section labels matching the user's requested terminology
  const sectionDefs = [
    { key: 'action_item', label: 'Follow Up' },
    { key: 'discussion', label: 'Discussion' },
    { key: 'event', label: 'Announcements' },
    { key: 'calling_plan', label: 'Callings' },
    { key: 'ministering_plan', label: 'Fellowshipping' },
    { key: 'ongoing', label: 'Ongoing Follow Up' },
  ];

  // 3. Add categorized sections with task chips
  for (const { key, label } of sectionDefs) {
    const tasks = categorized[key];
    if (tasks.length === 0) continue;
    blocks.push({ id: _nextBlockId(), type: 'text', text: `\n${label}` });
    for (const t of tasks) {
      blocks.push({ id: _nextBlockId(), type: 'task_ref', taskId: t.id });
    }
  }

  // 4. Calling pipeline items (non-task text items)
  const callingItems = await getCallingPipelineAgendaItems(meetingId);
  if (callingItems.length > 0) {
    const hasCallingTasks = categorized.calling_plan.length > 0;
    const callingText = callingItems.map(item => `• ${item.label}`).join('\n');
    if (hasCallingTasks) {
      // Append to the last text block (which is after calling task_refs)
      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock.type === 'text') {
        lastBlock.text += '\n' + callingText;
      } else {
        blocks.push({ id: _nextBlockId(), type: 'text', text: callingText });
      }
    } else {
      blocks.push({ id: _nextBlockId(), type: 'text', text: `\nCallings\n${callingText}` });
    }
  }

  // 5. Tagged notes from other meetings
  const tags = await getTagsForMeeting(meetingId);
  for (const tag of tags) {
    let sourceName = 'another meeting';
    if (tag.sourceMeetingInstanceId) {
      const inst = await db.meetingInstances.get(tag.sourceMeetingInstanceId);
      if (inst) {
        const mtg = await db.meetings.get(inst.meetingId);
        if (mtg) sourceName = mtg.name;
      }
    }
    const tagText = `\n📌 From ${sourceName}:\n${tag.text}`;
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock.type === 'text') {
      lastBlock.text += tagText;
    } else {
      blocks.push({ id: _nextBlockId(), type: 'text', text: tagText });
    }
    await markTagConsumed(tag.id);
  }

  // 6. Closing items
  if (closingItems.length > 0) {
    const closingText = '\n' + closingItems.map(item => `• ${item}`).join('\n');
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock.type === 'text') {
      lastBlock.text += closingText;
    } else {
      blocks.push({ id: _nextBlockId(), type: 'text', text: closingText });
    }
  }

  // 7. Trailing empty text block for freeform notes
  blocks.push({ id: _nextBlockId(), type: 'text', text: '' });

  return blocks;
}

let _blockIdCounter = 0;
function _nextBlockId() {
  return `b_${Date.now()}_${++_blockIdCounter}`;
}

/**
 * Get completed follow-up action items for a meeting.
 * These are action items from past instances of this meeting
 * that have been completed since the last instance, and haven't
 * been acknowledged yet.
 */
export async function getCompletedFollowUps(meetingId) {
  const allInstances = await db.meetingInstances
    .where('meetingId').equals(meetingId)
    .toArray();
  if (allInstances.length === 0) return [];

  const instanceIds = new Set(allInstances.map(i => i.id));
  const allActions = await db.actionItems.toArray();

  return allActions.filter(item =>
    item.status === 'complete' &&
    item.sourceMeetingInstanceId &&
    instanceIds.has(item.sourceMeetingInstanceId) &&
    !item.followUpShown
  );
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

  // Get all calling slots in active stages (discussion through set apart)
  const activeStages = ['discussed', 'prayed_about', 'assigned_to_extend', 'extended', 'accepted', 'sustained', 'set_apart'];
  const allSlots = await db.callingSlots.toArray();
  const activeSlots = allSlots.filter(slot => {
    if (!activeStages.includes(slot.stage)) return false;
    // Filter by jurisdiction
    if (jurisdiction.orgs[0] === '*') return true; // full access
    return jurisdiction.orgs.includes(slot.organization);
  });

  if (activeSlots.length === 0) return [];

  // Sort by stage urgency: action-needed stages first
  const stageOrder = { assigned_to_extend: 0, extended: 1, prayed_about: 2, discussed: 3, accepted: 4, sustained: 5, set_apart: 6 };
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

export async function getCallingSlots(filters = {}, jurisdiction) {
  let items;
  if (filters.organization) {
    items = await db.callingSlots.where('organization').equals(filters.organization).toArray();
  } else if (filters.stage) {
    items = await db.callingSlots.where('stage').equals(filters.stage).toArray();
  } else {
    items = await db.callingSlots.toArray();
  }
  if (jurisdiction) {
    items = filterSlotsByJurisdiction(items, jurisdiction);
  }
  return items;
}

export async function addCallingSlot(slot) {
  const data = {
    priority: 'low',
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
  };
  const id = await db.callingSlots.add(data);
  syncAfterWrite('callingSlots', id, { ...data, id });
  return id;
}

export async function updateCallingSlot(id, changes) {
  // Strip undefined values — Dexie ignores undefined, so clearing fields wouldn't save
  const sanitized = {};
  for (const [key, val] of Object.entries(changes)) {
    if (val !== undefined) sanitized[key] = val;
  }
  sanitized.updatedAt = new Date().toISOString();

  // Stage-aware side-effects when stage changes via form edit
  if (sanitized.stage) {
    const slot = await db.callingSlots.get(id);
    if (slot && slot.stage !== sanitized.stage) {
      if (sanitized.stage === 'serving') {
        sanitized.isOpen = false;
        sanitized.currentCount = Math.max((slot.currentCount || 0), 1);
        if (!slot.servedBy && !sanitized.servedBy) {
          sanitized.servedBy = sanitized.candidateName || slot.candidateName || '';
          sanitized.servedByPersonId = sanitized.personId || slot.personId || null;
        }
        if (!slot.servingSince && !sanitized.servingSince) {
          sanitized.servingSince = new Date().toISOString();
        }
      } else if (sanitized.stage === 'released') {
        sanitized.isOpen = true;
        sanitized.servedBy = null;
        sanitized.servedByPersonId = null;
        sanitized.servingSince = null;
        sanitized.candidateName = '';
        sanitized.personId = null;
        sanitized.currentCount = Math.max(0, (slot.currentCount || 1) - 1);
      }
    }
  }

  // Clean up stale pipeline action items when stage is manually skipped
  if (sanitized.stage) {
    const slot = await db.callingSlots.get(id);
    if (slot && slot.stage !== sanitized.stage) {
      const staleActions = await db.actionItems
        .filter(a => a.callingSlotId === id && a.status !== 'complete')
        .toArray();
      for (const action of staleActions) {
        await db.actionItems.delete(action.id);
        syncAfterDelete('actionItems', action.id);
      }
    }
  }

  await db.callingSlots.update(id, sanitized);
  const updated = await db.callingSlots.get(id);
  if (updated) syncAfterWrite('callingSlots', id, updated);
}

export async function deleteCallingSlot(id) {
  await db.callingSlots.delete(id);
  syncAfterDelete('callingSlots', id);
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
  const updated = await db.callingSlots.get(id);
  if (updated) syncAfterWrite('callingSlots', id, updated);

  return { hasCurrentHolder: !!slot.servedBy };
}

export async function getPipelineSummary(jurisdiction) {
  let all = await db.callingSlots.toArray();
  if (jurisdiction) {
    all = filterSlotsByJurisdiction(all, jurisdiction);
  }
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

/** Filter calling slots by jurisdiction (visible orgs). */
function filterSlotsByJurisdiction(slots, jurisdiction) {
  if (!jurisdiction || !jurisdiction.visibleOrgs || !jurisdiction.canEdit) return [];
  if (jurisdiction.visibleOrgs.includes('*')) return slots;
  return slots.filter(s => jurisdiction.visibleOrgs.includes(s.organization));
}

// ── Backup Metadata (no schema change — stored on profile row) ──

export async function updateLastExportDate() {
  const profile = await getProfile();
  if (profile) {
    await db.profile.update(profile.id, {
      lastExportDate: new Date().toISOString(),
    });
    const updated = await db.profile.get(profile.id);
    if (updated) syncAfterWrite('profile', profile.id, updated);
  }
}

export async function dismissBackupReminder() {
  const profile = await getProfile();
  if (profile) {
    await db.profile.update(profile.id, {
      backupReminderDismissedAt: new Date().toISOString(),
    });
    const updated = await db.profile.get(profile.id);
    if (updated) syncAfterWrite('profile', profile.id, updated);
  }
}

// Journal
export async function getJournalEntries(limit = 20) {
  return await db.journal.orderBy('date').reverse().limit(limit).toArray();
}

export async function addJournalEntry(entry) {
  const data = { ...entry, date: new Date().toISOString() };
  const id = await db.journal.add(data);
  syncAfterWrite('journal', id, { ...data, id });
  return id;
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
  const id = await db.lessons.add(lesson);
  syncAfterWrite('lessons', id, { ...lesson, id });
  return id;
}

// Stats helpers
export async function getDashboardStats() {
  // Use unified tasks table for stats
  const allTasks = await db.tasks.toArray();
  const now = new Date().toISOString().split('T')[0];
  const active = allTasks.filter(i => i.status !== 'complete');
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
    for (const inst of instances) {
      syncAfterDelete('meetingInstances', inst.id);
      await db.meetingInstances.delete(inst.id);
    }
    syncAfterDelete('meetings', m.id);
    await db.meetings.delete(m.id);
  }

  // Create new meetings from each assigned org's president calling
  for (const orgKey of organizations) {
    const presidentKey = getPresidentForOrg(orgKey);
    if (!presidentKey) continue;

    const presidentConfig = getCallingConfig(presidentKey);
    if (!presidentConfig) continue;

    for (const m of presidentConfig.meetings || []) {
      const meetingData = {
        callingId: callingKey,
        name: m.name,
        cadence: m.cadence,
        agendaTemplate: m.agendaTemplate || [],
        handbook: m.handbook || '',
        source: 'assignment',
        sourceOrg: orgKey,
      };
      const id = await db.meetings.add(meetingData);
      syncAfterWrite('meetings', id, { ...meetingData, id });
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
    for (const inst of instances) {
      syncAfterDelete('meetingInstances', inst.id);
      await db.meetingInstances.delete(inst.id);
    }
    syncAfterDelete('meetings', m.id);
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
  const jurisdiction = JURISDICTION_MAP[callingKey];
  if (!jurisdiction) return false;

  // Extract the relevant subtree from ORG_HIERARCHY based on scope
  const subtree = extractSubtreeForScope(jurisdiction);
  if (!subtree || subtree.length === 0) return false;

  const existing = await db.callingSlots.toArray();

  // For full-access scopes (ward/stake), only init if nothing exists
  if (jurisdiction.orgs.includes('*')) {
    if (existing.length > 0) return false;
  }

  // For org-scoped callings, only create slots for orgs that don't exist yet
  const existingOrgs = new Set(existing.map(s => s.organization));
  const newNodes = jurisdiction.orgs.includes('*')
    ? subtree
    : subtree.filter(node => !existingOrgs.has(node.organization));

  if (newNodes.length === 0) return false;

  async function createNode(node, parentId, sortOrder) {
    const count = node.expectedCount || 1;
    let lastId = null;

    for (let n = 0; n < count; n++) {
      const roleName = count > 1 ? `${node.roleName} ${n + 1}` : node.roleName;
      const slotData = {
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
      };
      const id = await db.callingSlots.add(slotData);
      syncAfterWrite('callingSlots', id, { ...slotData, id });

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

  for (let i = 0; i < newNodes.length; i++) {
    await createNode(newNodes[i], null, i);
  }
  return true;
}

// Auto-populate the user into their own calling slot
export async function autoPopulateUserSlot(callingKey, userName) {
  const slots = await db.callingSlots.toArray();
  const match = slots.find(s => s.callingKey === callingKey);
  if (!match || match.servedBy) return; // don't overwrite existing person

  await db.callingSlots.update(match.id, {
    candidateName: userName,
    servedBy: userName,
    stage: 'serving',
    servingSince: new Date().toISOString(),
    isOpen: false,
    currentCount: 1,
    updatedAt: new Date().toISOString(),
  });
  const updated = await db.callingSlots.get(match.id);
  if (updated) syncAfterWrite('callingSlots', match.id, updated);
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

export async function getOpenPositions(orgFilter, jurisdiction) {
  let all = await db.callingSlots.toArray();
  if (jurisdiction) {
    all = filterSlotsByJurisdiction(all, jurisdiction);
  }
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
    const slotData = {
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
    };
    const id = await db.callingSlots.add(slotData);
    syncAfterWrite('callingSlots', id, { ...slotData, id });
    ids.push(id);
  }
  return ids;
}

// ── Hidden Orgs (user preference) ───────────────────────────

export async function updateHiddenOrgs(hiddenOrgs) {
  const profile = await getProfile();
  if (profile) {
    await db.profile.update(profile.id, { hiddenOrgs });
    const updated = await db.profile.get(profile.id);
    if (updated) syncAfterWrite('profile', profile.id, updated);
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
  const data = {
    ...comp,
    status: comp.status || 'active',
    assignedFamilyIds: comp.assignedFamilyIds || [],
    assignedFamilyNames: comp.assignedFamilyNames || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const id = await db.ministeringCompanionships.add(data);
  syncAfterWrite('ministeringCompanionships', id, { ...data, id });
  return id;
}

export async function updateMinisteringCompanionship(id, changes) {
  await db.ministeringCompanionships.update(id, { ...changes, updatedAt: new Date().toISOString() });
  const updated = await db.ministeringCompanionships.get(id);
  if (updated) syncAfterWrite('ministeringCompanionships', id, updated);
}

export async function deleteMinisteringCompanionship(id) {
  const interviews = await db.ministeringInterviews.where('companionshipId').equals(id).toArray();
  for (const i of interviews) syncAfterDelete('ministeringInterviews', i.id);
  await db.ministeringInterviews.bulkDelete(interviews.map(i => i.id));
  await db.ministeringCompanionships.delete(id);
  syncAfterDelete('ministeringCompanionships', id);
}

export async function getMinisteringInterviews(companionshipId) {
  return await db.ministeringInterviews
    .where('companionshipId').equals(companionshipId)
    .reverse()
    .sortBy('date');
}

export async function addMinisteringInterview(interview) {
  const data = { ...interview, date: interview.date || new Date().toISOString() };
  const id = await db.ministeringInterviews.add(data);
  syncAfterWrite('ministeringInterviews', id, { ...data, id });
  return id;
}

export async function updateMinisteringInterview(id, changes) {
  await db.ministeringInterviews.update(id, changes);
  const updated = await db.ministeringInterviews.get(id);
  if (updated) syncAfterWrite('ministeringInterviews', id, updated);
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

// ── Ongoing Tasks (Phase 6) ─────────────────────────────────

export async function getOngoingTasks(meetingId) {
  if (meetingId) {
    return await db.ongoingTasks.where('meetingId').equals(meetingId).filter(t => t.status === 'active').toArray();
  }
  return await db.ongoingTasks.where('status').equals('active').toArray();
}

export async function getAllOngoingTasks() {
  return await db.ongoingTasks.where('status').equals('active').toArray();
}

export async function addOngoingTask(task) {
  const data = {
    ...task,
    status: 'active',
    updates: [],
    createdAt: new Date().toISOString(),
  };
  const id = await db.ongoingTasks.add(data);
  syncAfterWrite('ongoingTasks', id, { ...data, id });
  return id;
}

export async function addOngoingTaskUpdate(id, update) {
  const task = await db.ongoingTasks.get(id);
  if (!task) return;
  const updates = [...(task.updates || []), { ...update, date: new Date().toISOString() }];
  await db.ongoingTasks.update(id, { updates });
  syncAfterWrite('ongoingTasks', id, { ...task, updates });
}

export async function dismissOngoingTask(id) {
  await db.ongoingTasks.update(id, { status: 'dismissed' });
  const updated = await db.ongoingTasks.get(id);
  if (updated) syncAfterWrite('ongoingTasks', id, updated);
}

export async function deleteOngoingTask(id) {
  await db.ongoingTasks.delete(id);
  syncAfterDelete('ongoingTasks', id);
}

// ── Ministering Plans (Phase 6) ─────────────────────────────

export async function getActiveMinisteringPlans() {
  return await db.ministeringPlans.where('status').equals('active').toArray();
}

export async function addMinisteringPlan(plan) {
  const data = {
    ...plan,
    status: 'active',
    updates: [],
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  const id = await db.ministeringPlans.add(data);
  syncAfterWrite('ministeringPlans', id, { ...data, id });
  return id;
}

export async function addMinisteringPlanUpdate(id, update) {
  const plan = await db.ministeringPlans.get(id);
  if (!plan) return;
  const updates = [...(plan.updates || []), { ...update, date: new Date().toISOString() }];
  await db.ministeringPlans.update(id, { updates });
  syncAfterWrite('ministeringPlans', id, { ...plan, updates });
}

export async function completeMinisteringPlan(id) {
  await db.ministeringPlans.update(id, { status: 'completed', completedAt: new Date().toISOString() });
  const updated = await db.ministeringPlans.get(id);
  if (updated) syncAfterWrite('ministeringPlans', id, updated);
}

export async function deleteMinisteringPlan(id) {
  await db.ministeringPlans.delete(id);
  syncAfterDelete('ministeringPlans', id);
}

export default db;
