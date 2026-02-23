/**
 * Test Data Seeder
 * Generates a full year of realistic data across multiple callings.
 * Run via Settings page "Seed Test Data" button (dev only).
 */
import db from '../db';
import { getCallingConfig } from '../data/callings';

// ── Helpers ──────────────────────────────────────────────────

function randomDate(startMonthsAgo, endMonthsAgo = 0) {
  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - startMonthsAgo);
  const end = new Date(now);
  end.setMonth(end.getMonth() - endMonthsAgo);
  const t = start.getTime() + Math.random() * (end.getTime() - start.getTime());
  return new Date(t);
}

function dateStr(date) {
  return date.toISOString().split('T')[0];
}

function isoStr(date) {
  return date.toISOString();
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN(arr, n) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(n, arr.length));
}

// ── People Data ──────────────────────────────────────────────

const PEOPLE_DATA = [
  { name: 'Michael Anderson', phone: '801-555-0101', email: 'manderson@email.com' },
  { name: 'Sarah Williams', phone: '801-555-0102', email: 'swilliams@email.com' },
  { name: 'David Thompson', phone: '801-555-0103', email: '' },
  { name: 'Jennifer Martinez', phone: '801-555-0104', email: 'jmartinez@email.com' },
  { name: 'Robert Johnson', phone: '801-555-0105', email: '' },
  { name: 'Emily Davis', phone: '', email: 'edavis@email.com' },
  { name: 'James Wilson', phone: '801-555-0107', email: 'jwilson@email.com' },
  { name: 'Jessica Brown', phone: '801-555-0108', email: '' },
  { name: 'Christopher Lee', phone: '801-555-0109', email: 'clee@email.com' },
  { name: 'Amanda Taylor', phone: '801-555-0110', email: 'ataylor@email.com' },
  { name: 'Matthew Harris', phone: '801-555-0111', email: '' },
  { name: 'Ashley Clark', phone: '', email: '' },
  { name: 'Daniel Lewis', phone: '801-555-0113', email: 'dlewis@email.com' },
  { name: 'Stephanie Walker', phone: '801-555-0114', email: '' },
  { name: 'Andrew Hall', phone: '801-555-0115', email: 'ahall@email.com' },
  { name: 'Rachel Allen', phone: '801-555-0116', email: 'rallen@email.com' },
  { name: 'Joshua Young', phone: '', email: 'jyoung@email.com' },
  { name: 'Lauren King', phone: '801-555-0118', email: '' },
  { name: 'Ryan Wright', phone: '801-555-0119', email: 'rwright@email.com' },
  { name: 'Nicole Scott', phone: '801-555-0120', email: 'nscott@email.com' },
  { name: 'Brandon Hill', phone: '801-555-0121', email: '' },
  { name: 'Megan Green', phone: '801-555-0122', email: 'mgreen@email.com' },
  { name: 'Kevin Adams', phone: '', email: 'kadams@email.com' },
  { name: 'Christina Baker', phone: '801-555-0124', email: '' },
  { name: 'Tyler Nelson', phone: '801-555-0125', email: 'tnelson@email.com' },
];

// ── Action Item Templates ────────────────────────────────────

const ACTION_TEMPLATES = [
  // Living
  { title: 'Prepare sacrament meeting talk on faith', context: 'home', priority: 'high' },
  { title: 'Review Come Follow Me lesson for next week', context: 'home', priority: 'medium' },
  { title: 'Plan ward temple night', context: 'at_church', priority: 'medium' },
  { title: 'Coordinate with seminary teacher on youth curriculum', context: 'phone', priority: 'low' },

  { title: 'Visit Sister Henderson — recovering from surgery', context: 'visit', priority: 'high' },
  { title: 'Coordinate meals for the Thompson family', context: 'phone', priority: 'high' },
  { title: 'Follow up with Brother Kim about employment', context: 'phone', priority: 'medium' },
  { title: 'Review welfare requests with EQ president', context: 'at_church', priority: 'medium' },
  { title: 'Check on less-active members in northeast area', context: 'visit', priority: 'medium' },
  { title: 'Arrange fast offering assistance for the Garcias', context: 'at_church', priority: 'high' },

  { title: 'Meet with investigators attending ward', context: 'at_church', priority: 'high' },
  { title: 'Plan ward open house for community', context: 'at_church', priority: 'medium' },
  { title: 'Coordinate with missionaries on new family', context: 'phone', priority: 'medium' },
  { title: 'Welcome new move-ins: the Peterson family', context: 'visit', priority: 'high' },

  { title: 'Process temple recommend renewal for Brother Adams', context: 'at_church', priority: 'medium' },
  { title: 'Follow up on temple preparation class attendance', context: 'phone', priority: 'low' },
  { title: 'Coordinate youth temple trip', context: 'at_church', priority: 'medium' },

  { title: 'Submit annual ward budget report', context: 'computer', priority: 'high' },
  { title: 'Update ward directory in LCR', context: 'computer', priority: 'medium' },
  { title: 'Prepare agenda for upcoming ward council', context: 'computer', priority: 'medium' },
  { title: 'Review and approve building reservation requests', context: 'computer', priority: 'low' },
  { title: 'Complete quarterly report for stake', context: 'computer', priority: 'high' },
  { title: 'Schedule interviews for new members', context: 'phone', priority: 'high' },
  { title: 'Order new hymnbooks for the chapel', context: 'computer', priority: 'low' },
  { title: 'Coordinate building cleaning assignments', context: 'at_church', priority: 'low' },
  { title: 'Follow up with Brother Jones about temple prep', context: 'phone', priority: 'medium' },
];

// ── Journal Entry Templates ──────────────────────────────────

const JOURNAL_ENTRIES = [
  { text: 'Felt prompted during bishopric meeting to reach out to the Harris family. Need to make this a priority this week.', tags: ['prompting', 'ministering'] },
  { text: 'Powerful sacrament meeting today. Brother Thompson gave a heartfelt talk about the Atonement. Several members came up after expressing how much it meant to them.', tags: ['sacrament', 'atonement'] },
  { text: 'Met with a family struggling financially. Helped connect them with employment resources. Feeling grateful for the Church welfare program.', tags: ['welfare', 'gratitude'] },
  { text: 'Youth fireside went well. About 30 youth attended. The spirit was strong when Sister Davis shared her conversion story.', tags: ['youth', 'fireside'] },
  { text: 'Feeling overwhelmed with all the needs in the ward. Need to rely more on counselors and trust in the Lord\'s timing.', tags: ['overwhelm', 'trust'] },
  { text: 'Had a wonderful temple session today. Received clarity about the direction for the ward youth program.', tags: ['temple', 'revelation'] },
  { text: 'Conducted a baptismal interview. What a privilege to witness someone\'s commitment to follow Christ.', tags: ['baptism', 'interview'] },
  { text: 'Ward council was productive today. The Relief Society president had excellent insights about a family in need.', tags: ['ward council', 'collaboration'] },
  { text: 'Set apart a new Sunday School teacher today. Felt strongly that this was the right person for this calling.', tags: ['calling', 'confirmation'] },
  { text: 'Spent time studying the general conference talks about ministering. Want to help the ward improve our approach to caring for individuals.', tags: ['study', 'ministering'] },
  { text: 'Difficult meeting today with a family going through a divorce. Praying for wisdom to help them through this.', tags: ['counseling', 'prayer'] },
  { text: 'The ward service project at the food bank was a great success. Over 50 ward members participated.', tags: ['service', 'community'] },
  { text: 'Received a call from the stake president about potential boundary changes. Need to prayerfully consider the impact on our ward families.', tags: ['stake', 'boundaries'] },
  { text: 'Had a revelation while reading in Alma about what our ward needs right now — more focus on unity and less on programs.', tags: ['scripture', 'revelation', 'unity'] },
  { text: 'Grateful for my counselors. They carried a heavy load this week while I was traveling. The Lord provides.', tags: ['gratitude', 'counselors'] },
];

// ── Inbox Templates ──────────────────────────────────────────

const INBOX_ITEMS = [
  'Call Brother Lewis about volunteer opportunity',
  'Ask EQ about helping the Scotts move this Saturday',
  'Look into summer youth camp dates',
  'Remember to announce new ward directory online',
  'Check if building has projector available for fireside',
  'Follow up with missionary about dinner appointment',
  'Need to update ward website with new schedule',
  'Remind counselors about upcoming training',
];

// ── Calling Pipeline Data ────────────────────────────────────

const PIPELINE_SLOTS = [
  { organization: 'elders_quorum', roleName: 'EQ 2nd Counselor', candidateName: 'James Wilson', stage: 'extended' },
  { organization: 'relief_society', roleName: 'RS Activities Committee Chair', candidateName: 'Rachel Allen', stage: 'accepted' },
  { organization: 'primary', roleName: 'CTR 7 Teacher', candidateName: 'Amanda Taylor', stage: 'prayed_about' },
  { organization: 'young_women', roleName: 'Beehive Advisor', candidateName: 'Megan Green', stage: 'discussed' },
  { organization: 'sunday_school', roleName: 'Gospel Doctrine Teacher', candidateName: 'Daniel Lewis', stage: 'sustained' },
  { organization: 'primary', roleName: 'Nursery Leader', candidateName: 'Christina Baker', stage: 'identified' },
  { organization: 'music', roleName: 'Ward Choir Director', candidateName: 'Nicole Scott', stage: 'set_apart' },
  { organization: 'elders_quorum', roleName: 'EQ Secretary', candidateName: '', stage: 'identified' },
  { organization: 'missionary', roleName: 'Ward Mission Leader', candidateName: 'Kevin Adams', stage: 'declined' },
  { organization: 'temple_fh', roleName: 'Temple & Family History Consultant', candidateName: 'Tyler Nelson', stage: 'prayed_about' },
];

// ── Meeting Notes Templates ──────────────────────────────────

const MEETING_NOTES_TEMPLATES = [
  'Discussed ward needs and upcoming activities. Good participation from all members.',
  'Reviewed action items from last week. Most are progressing well.',
  'Focused discussion on youth activities for the coming month.',
  'Planned the upcoming ward social. Budget approved.',
  'Reviewed ministering assignments and identified families needing additional support.',
  'Discussed sacrament meeting schedule for next month. Speakers confirmed.',
  'Went over temple and family history goals for the quarter.',
  'Addressed building maintenance issues. Submitted work order.',
  'Planned upcoming stake conference participation.',
  'Reviewed financial report. Ward is within budget.',
];

// ── Sacrament Program Data ────────────────────────────────────

const HYMNS = [
  '#2 The Spirit of God', '#85 How Firm a Foundation', '#92 For the Beauty of the Earth',
  '#116 Come, Follow Me', '#134 I Believe in Christ', '#146 Gently Raise the Sacred Strain',
  '#169 As Now We Take the Sacrament', '#170 God, Our Father, Hear Us Pray',
  '#193 I Stand All Amazed', '#219 Because I Have Been Given Much',
  '#241 Count Your Blessings', '#270 I\'ll Go Where You Want Me to Go',
  '#292 O My Father', '#301 I Am a Child of God', '#304 Teach Me to Walk in the Light',
];

const SPEAKER_TOPICS = [
  'Faith in Jesus Christ', 'Repentance and Forgiveness', 'The Atonement',
  'Ministering to Others', 'Temple Blessings', 'Family Scripture Study',
  'Personal Revelation', 'Sabbath Day Observance', 'Gratitude',
  'Following the Prophet', 'Service and Charity', 'Overcoming Adversity',
  'The Sacrament', 'Covenant Keeping', 'Hope in Christ',
];

function buildProgramData(peopleNames, weekIndex) {
  const speakers = pickN(peopleNames, 2 + (weekIndex % 2)).map(name => ({
    name,
    topic: pick(SPEAKER_TOPICS),
  }));

  return {
    presiding: pick(['Bishop Taylor', 'President Wilson']),
    conducting: pick(['Bishop Taylor', 'Brother Anderson', 'Brother Thompson']),
    announcements: weekIndex % 3 === 0 ? 'Ward social this Friday at 6pm. All families welcome.' : '',
    openingHymn: pick(HYMNS),
    invocation: pick(peopleNames),
    wardBusiness: weekIndex % 4 === 0 ? 'Sustainings: Brother Lee as EQ Secretary.' : '',
    sacramentHymn: pick(HYMNS.filter(h => h.includes('#169') || h.includes('#170') || h.includes('#146') || h.includes('#193'))),
    speakers,
    musicalNumber: weekIndex % 5 === 0 ? 'Ward Choir — "Come Thou Fount"' : '',
    intermediateHymn: weekIndex % 2 === 0 ? pick(HYMNS) : '',
    closingHymn: pick(HYMNS),
    benediction: pick(peopleNames),
    notes: weekIndex === 0 ? 'Fast Sunday — open mic testimonies instead of assigned speakers.' : '',
  };
}

// ── Main Seeder Function ─────────────────────────────────────

export async function seedTestData() {
  // Clear existing data
  const tables = db.tables.map(t => t.name);
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
    }
  });

  // ── 1. Profile ─────────────────────────────────────────

  await db.profile.add({
    name: 'Bishop Taylor',
    lastExportDate: null,
    backupReminderDismissedAt: null,
  });

  // ── 2. People ──────────────────────────────────────────

  const personIds = [];
  for (const person of PEOPLE_DATA) {
    const id = await db.people.add(person);
    personIds.push(id);
  }

  // ── 3. Callings ────────────────────────────────────────

  const callingKeys = ['bishop', 'bishopric_1st', 'eq_president', 'rs_president'];
  const peopleNames = PEOPLE_DATA.map(p => p.name);

  for (const key of callingKeys) {
    const callingRecord = {
      callingKey: key,
      startDate: isoStr(randomDate(14, 12)),
    };

    // Add org assignments for bishopric 1st counselor (demo data)
    if (key === 'bishopric_1st') {
      callingRecord.organizationAssignments = ['primary', 'sunday_school'];
    }

    await db.userCallings.add(callingRecord);

    const config = getCallingConfig(key);
    if (!config) continue;

    // Add meetings
    for (const m of config.meetings || []) {
      const isSacrament = m.name === 'Sacrament Meeting';

      const meetingId = await db.meetings.add({
        callingId: key,
        name: m.name,
        cadence: m.cadence,
        agendaTemplate: m.agendaTemplate || [],
        handbook: m.handbook || '',
      });

      // Generate meeting instances over the past year
      const instanceCount = getInstanceCount(m.cadence);
      for (let i = 0; i < instanceCount; i++) {
        const meetingDate = getMeetingDate(m.cadence, i);
        const status = i === 0 ? 'scheduled' : (Math.random() > 0.1 ? 'completed' : 'cancelled');

        const instanceData = {
          meetingId,
          date: dateStr(meetingDate),
          notes: status === 'completed' ? pick(MEETING_NOTES_TEMPLATES) : '',
          actionItemIds: [],
          status,
          attendees: [],
        };

        if (isSacrament) {
          // Sacrament meetings get structured programData
          instanceData.agendaItems = [];
          instanceData.programData = status === 'completed'
            ? buildProgramData(peopleNames, i)
            : {
                presiding: '', conducting: '', announcements: '',
                openingHymn: '', invocation: '', wardBusiness: '',
                sacramentHymn: '', speakers: [{ name: '', topic: '' }, { name: '', topic: '' }],
                musicalNumber: '', intermediateHymn: '', closingHymn: '',
                benediction: '', notes: '',
              };
        } else {
          // Regular meetings get agenda items from template
          instanceData.agendaItems = (m.agendaTemplate || []).map(label => ({
            label,
            notes: status === 'completed' && Math.random() > 0.4
              ? pick(MEETING_NOTES_TEMPLATES).substring(0, 80)
              : '',
            source: 'template',
          }));
        }

        await db.meetingInstances.add(instanceData);
      }
    }

    // Add responsibilities
    for (const r of config.responsibilities || []) {
      await db.responsibilities.add({
        callingId: key,
        title: r.title,
        isCustom: false,
        handbook: r.handbook || '',
      });
    }
  }

  // Add a couple custom responsibilities
  await db.responsibilities.add({
    callingId: 'bishop',
    title: 'Coordinate with stake on ward boundary adjustments',
    isCustom: true,
  });
  await db.responsibilities.add({
    callingId: 'bishop',
    title: 'Monthly check-in with ward missionaries',
    isCustom: true,
  });

  // ── 4. Action Items ────────────────────────────────────

  const statuses = ['not_started', 'in_progress', 'waiting', 'complete'];
  const now = new Date();
  const todayString = dateStr(now);

  for (let i = 0; i < ACTION_TEMPLATES.length; i++) {
    const t = ACTION_TEMPLATES[i];
    const created = randomDate(10, 0);
    const isComplete = i < 6; // First 6 are completed
    const isOverdue = !isComplete && i >= 6 && i < 10; // Next 4 are overdue
    const isDueToday = !isComplete && !isOverdue && i === 10; // One due today
    const isStarred = !isComplete && (i === 11 || i === 14 || i === 17);

    let dueDate;
    if (isComplete) {
      dueDate = dateStr(randomDate(8, 2));
    } else if (isOverdue) {
      const d = new Date(now);
      d.setDate(d.getDate() - Math.floor(Math.random() * 14 + 1));
      dueDate = dateStr(d);
    } else if (isDueToday) {
      dueDate = todayString;
    } else if (Math.random() > 0.3) {
      const d = new Date(now);
      d.setDate(d.getDate() + Math.floor(Math.random() * 30 + 1));
      dueDate = dateStr(d);
    } else {
      dueDate = undefined;
    }

    let status;
    if (isComplete) {
      status = 'complete';
    } else {
      status = pick(['not_started', 'in_progress', 'waiting']);
    }

    const isRecurring = i === 1 || i === 19 || i === 24;

    await db.actionItems.add({
      title: t.title,
      description: i % 3 === 0 ? `Additional notes: ${t.title.toLowerCase()} — follow up as needed.` : '',
      priority: t.priority,
      context: t.context,
      status,
      dueDate,
      starred: isStarred,
      isRecurring,
      recurringCadence: isRecurring ? pick(['weekly', 'monthly']) : undefined,
      createdAt: isoStr(created),
      completedAt: isComplete ? isoStr(randomDate(4, 0)) : undefined,
      targetMeetingIds: [],
    });
  }

  // ── 5. Inbox ───────────────────────────────────────────

  for (const text of INBOX_ITEMS) {
    await db.inbox.add({
      text,
      createdAt: isoStr(randomDate(1, 0)),
      processed: 0,
    });
  }

  // Also add some already-processed items
  for (let i = 0; i < 4; i++) {
    await db.inbox.add({
      text: `Processed item ${i + 1}: ${pick(['Follow up on interview', 'Check meeting room availability', 'Review talk assignment', 'Order supplies'])}`,
      createdAt: isoStr(randomDate(3, 1)),
      processed: 1,
    });
  }

  // ── 6. Journal ─────────────────────────────────────────

  for (let i = 0; i < JOURNAL_ENTRIES.length; i++) {
    const entry = JOURNAL_ENTRIES[i];
    const date = randomDate(11, 0);
    await db.journal.add({
      text: entry.text,
      date: isoStr(date),
      tags: entry.tags,
    });
  }

  // ── 7. Calling Pipeline ────────────────────────────────

  for (const slot of PIPELINE_SLOTS) {
    const history = buildSlotHistory(slot.stage);
    await db.callingSlots.add({
      organization: slot.organization,
      roleName: slot.roleName,
      candidateName: slot.candidateName,
      stage: slot.stage,
      notes: slot.candidateName
        ? `Considering ${slot.candidateName} for this role.`
        : 'Need to identify a candidate.',
      history,
      createdAt: isoStr(randomDate(6, 2)),
      updatedAt: isoStr(randomDate(2, 0)),
    });
  }

  // ── 8. Meeting Note Tags ───────────────────────────────

  // Get some meeting IDs to create cross-meeting tags
  const allMeetings = await db.meetings.toArray();
  const allInstances = await db.meetingInstances.toArray();
  const completedInstances = allInstances.filter(i => i.status === 'completed');

  if (completedInstances.length >= 2 && allMeetings.length >= 2) {
    // Create 3-4 tags from various instances to various meetings
    const tagTexts = [
      'Need to discuss the Smith family situation at Ward Council',
      'Budget request for youth camp — bring to bishopric meeting',
      'Sister Allen has a great idea for the Relief Society activity',
      'Follow up on building maintenance request',
    ];

    for (let i = 0; i < Math.min(4, completedInstances.length); i++) {
      const srcInstance = completedInstances[i];
      const targetMeeting = allMeetings.find(m => m.id !== srcInstance.meetingId) || allMeetings[0];

      await db.meetingNoteTags.add({
        sourceMeetingInstanceId: srcInstance.id,
        targetMeetingId: targetMeeting.id,
        text: tagTexts[i],
        agendaItemIndex: Math.floor(Math.random() * 3),
        consumed: i < 2 ? 1 : 0, // First 2 consumed, last 2 pending
        createdAt: isoStr(randomDate(2, 0)),
      });
    }
  }

  return {
    people: PEOPLE_DATA.length,
    callings: callingKeys.length,
    actionItems: ACTION_TEMPLATES.length,
    inbox: INBOX_ITEMS.length + 4,
    journal: JOURNAL_ENTRIES.length,
    pipeline: PIPELINE_SLOTS.length,
    tags: Math.min(4, completedInstances.length),
  };
}

// ── Helper: Instance count by cadence ────────────────────────

function getInstanceCount(cadence) {
  switch (cadence) {
    case 'weekly': return 20; // ~5 months of weekly
    case 'biweekly': return 12;
    case 'monthly': return 10;
    case 'quarterly': return 4;
    case 'biannual': return 2;
    case 'annual': return 1;
    default: return 8;
  }
}

function getMeetingDate(cadence, index) {
  const now = new Date();
  const d = new Date(now);
  switch (cadence) {
    case 'weekly':
      d.setDate(d.getDate() - index * 7);
      break;
    case 'biweekly':
      d.setDate(d.getDate() - index * 14);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() - index);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() - index * 3);
      break;
    case 'biannual':
      d.setMonth(d.getMonth() - index * 6);
      break;
    case 'annual':
      d.setFullYear(d.getFullYear() - index);
      break;
    default:
      d.setDate(d.getDate() - index * 7);
  }
  return d;
}

// ── Helper: Build transition history for a slot ──────────────

function buildSlotHistory(currentStage) {
  const STAGE_ORDER = ['identified', 'prayed_about', 'discussed', 'extended', 'accepted', 'sustained', 'set_apart'];
  const history = [];
  const stageIdx = STAGE_ORDER.indexOf(currentStage);

  if (currentStage === 'declined') {
    // Went through identified -> prayed_about -> discussed -> extended -> declined
    const stages = ['identified', 'prayed_about', 'discussed', 'extended', 'declined'];
    for (let i = 1; i < stages.length; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (stages.length - i) * 7);
      history.push({
        from: stages[i - 1],
        to: stages[i],
        date: isoStr(date),
        note: i === stages.length - 1 ? 'Candidate declined the calling.' : '',
      });
    }
    return history;
  }

  if (stageIdx <= 0) return history;

  for (let i = 1; i <= stageIdx; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (stageIdx - i + 1) * 10);
    history.push({
      from: STAGE_ORDER[i - 1],
      to: STAGE_ORDER[i],
      date: isoStr(date),
      note: '',
    });
  }

  return history;
}
