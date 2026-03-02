/**
 * AI Tool Definitions & Executor
 * Defines ALL tools the AI agent can call to read and write app data.
 *
 * IMPORTANT: When adding new features/functions to the app, add corresponding
 * AI tools here so the Dashboard AI agent can use them too.
 */

import {
  // Unified Tasks (replaces Action Items)
  addTask,
  updateTask,
  deleteTask,
  getTasks,
  // Inbox
  addInboxItem,
  getInboxItems,
  markInboxProcessed,
  // People
  addPerson,
  updatePerson,
  deletePerson,
  getPeople,
  searchPeople,
  // Journal
  addJournalEntry,
  getJournalEntries,
  // Meetings
  getMeetings,
  addMeeting,
  updateMeeting,
  deleteMeetingWithInstances,
  addMeetingInstance,
  getMeetingInstances,
  updateMeetingInstance,
  // Calling Pipeline
  getCallingSlots,
  updateCallingSlot,
  transitionCallingSlot,
  addCandidate,
  startRelease,
  getOpenPositions,
  getServiceAlerts,
  // Pipeline Summary
  getDashboardStats,
  getPipelineSummary,
  // Responsibilities
  getResponsibilities,
  addResponsibility,
  updateResponsibility,
  deleteResponsibility,
  // Ministering
  getMinisteringCompanionships,
  addMinisteringCompanionship,
  updateMinisteringCompanionship,
  getMinisteringInterviews,
  addMinisteringInterview,
  getMinisteringSummary,
  // Lessons
  getLessons,
  addLesson,
} from '../db';
import { CALL_STAGE_ORDER, CALLING_STAGES } from './constants';

// ── Anthropic Tool Definitions ──────────────────────────────

export const AI_TOOLS_ANTHROPIC = [

  // ─── ACTION ITEMS ──────────────────────────────────────────

  {
    name: 'create_action_item',
    description:
      'Create a new action item / task. Use this when the user wants to add a to-do, reminder, or follow-up.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title for the action item' },
        priority: {
          type: 'string',
          enum: ['high', 'low'],
          description: 'Priority level. Default low.',
        },
        context: {
          type: 'string',
          enum: ['at_church', 'home', 'phone', 'computer', 'visit', 'anywhere'],
          description: 'Where/how the task should be done. Optional.',
        },
        dueDate: {
          type: 'string',
          description: 'Due date in YYYY-MM-DD format. Optional.',
        },
        description: {
          type: 'string',
          description: 'Longer description or notes. Optional.',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_action_item',
    description:
      'Update an existing action item. Can change title, priority, status, due date, context, or description. Search by title.',
    input_schema: {
      type: 'object',
      properties: {
        titleSearch: {
          type: 'string',
          description: 'Search string to find the action item by title (case-insensitive partial match).',
        },
        updates: {
          type: 'object',
          description: 'Fields to update.',
          properties: {
            title: { type: 'string' },
            status: { type: 'string', enum: ['not_started', 'in_progress', 'waiting', 'complete'] },
            priority: { type: 'string', enum: ['high', 'low'] },
            dueDate: { type: 'string', description: 'YYYY-MM-DD or null to remove' },
            context: { type: 'string', enum: ['at_church', 'home', 'phone', 'computer', 'visit', 'anywhere'] },
            description: { type: 'string' },
            starred: { type: 'boolean' },
          },
        },
      },
      required: ['titleSearch', 'updates'],
    },
  },
  {
    name: 'complete_action_item',
    description:
      'Mark an action item as complete by searching for it by title. Use when the user says they finished a task.',
    input_schema: {
      type: 'object',
      properties: {
        titleSearch: {
          type: 'string',
          description: 'Search string to find the action item by title (case-insensitive partial match).',
        },
      },
      required: ['titleSearch'],
    },
  },
  {
    name: 'list_action_items',
    description:
      'List current action items. Use when the user asks what tasks they have, what is overdue, etc.',
    input_schema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['all', 'overdue', 'high_priority', 'due_today', 'starred', 'completed'],
          description: 'Filter to apply. Default "all" (active items only).',
        },
      },
    },
  },

  // ─── MEETINGS ──────────────────────────────────────────────

  {
    name: 'list_meetings',
    description:
      'List all meeting types (recurring templates). Shows name, cadence, and agenda template.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'create_meeting',
    description:
      'Create a new recurring meeting type. Use when the user wants to add a new meeting to their schedule.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Meeting name, e.g. "Bishopric Meeting"' },
        cadence: {
          type: 'string',
          enum: ['weekly', 'biweekly', 'monthly', 'quarterly', 'biannual', 'annual'],
          description: 'How often the meeting occurs.',
        },
        callingId: {
          type: 'string',
          description: 'The calling key this meeting belongs to. Optional.',
        },
        agendaTemplate: {
          type: 'array',
          items: { type: 'string' },
          description: 'Default agenda items as an array of strings. Optional.',
        },
      },
      required: ['name', 'cadence'],
    },
  },
  {
    name: 'update_meeting',
    description:
      'Update an existing meeting type. Search by name. Can change name, cadence, or agenda template.',
    input_schema: {
      type: 'object',
      properties: {
        nameSearch: {
          type: 'string',
          description: 'Search string to find the meeting by name (case-insensitive partial match).',
        },
        updates: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            cadence: { type: 'string', enum: ['weekly', 'biweekly', 'monthly', 'quarterly', 'biannual', 'annual'] },
            agendaTemplate: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      required: ['nameSearch', 'updates'],
    },
  },
  {
    name: 'delete_meeting',
    description:
      'Delete a meeting type and all its instances. Search by name.',
    input_schema: {
      type: 'object',
      properties: {
        nameSearch: {
          type: 'string',
          description: 'Search string to find the meeting by name (case-insensitive partial match).',
        },
      },
      required: ['nameSearch'],
    },
  },
  {
    name: 'start_meeting_instance',
    description:
      'Create a new instance (occurrence) of a meeting. Use when the user says they are starting or scheduling a meeting.',
    input_schema: {
      type: 'object',
      properties: {
        nameSearch: {
          type: 'string',
          description: 'Search string to find the meeting type by name.',
        },
        date: {
          type: 'string',
          description: 'Date of the meeting in YYYY-MM-DD format. Defaults to today.',
        },
        notes: {
          type: 'string',
          description: 'Initial notes for the meeting instance. Optional.',
        },
      },
      required: ['nameSearch'],
    },
  },

  // ─── PEOPLE ────────────────────────────────────────────────

  {
    name: 'add_person',
    description:
      'Add a new person to the People directory.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full name of the person' },
        phone: { type: 'string', description: 'Phone number. Optional.' },
        email: { type: 'string', description: 'Email address. Optional.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_person',
    description:
      'Update an existing person in the directory. Search by name.',
    input_schema: {
      type: 'object',
      properties: {
        nameSearch: {
          type: 'string',
          description: 'Search string to find the person by name (case-insensitive partial match).',
        },
        updates: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string' },
          },
        },
      },
      required: ['nameSearch', 'updates'],
    },
  },
  {
    name: 'list_people',
    description:
      'List people in the directory. Optionally filter by search query.',
    input_schema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Optional search string to filter by name.',
        },
      },
    },
  },

  // ─── CALLING PIPELINE ─────────────────────────────────────

  {
    name: 'advance_calling',
    description:
      'Advance a calling slot to the next stage in the pipeline. Use when a calling should move forward (e.g. from Discussed to Prayed About).',
    input_schema: {
      type: 'object',
      properties: {
        roleNameSearch: {
          type: 'string',
          description: 'The role name to search for (case-insensitive partial match).',
        },
        note: {
          type: 'string',
          description: 'Optional note for the transition history.',
        },
      },
      required: ['roleNameSearch'],
    },
  },
  {
    name: 'set_calling_stage',
    description:
      'Set a calling slot to a specific stage (not just the next one). Use when the user wants to jump to a specific stage.',
    input_schema: {
      type: 'object',
      properties: {
        roleNameSearch: {
          type: 'string',
          description: 'The role name to search for.',
        },
        stage: {
          type: 'string',
          enum: ['identified', 'discussed', 'prayed_about', 'assigned_to_extend', 'extended', 'accepted', 'declined', 'sustained', 'set_apart', 'serving'],
          description: 'The target stage to set.',
        },
        note: {
          type: 'string',
          description: 'Optional note for the transition history.',
        },
      },
      required: ['roleNameSearch', 'stage'],
    },
  },
  {
    name: 'update_calling_slot',
    description:
      'Update a calling slot\'s details — candidate name, priority, assigned person, notes, etc.',
    input_schema: {
      type: 'object',
      properties: {
        roleNameSearch: {
          type: 'string',
          description: 'The role name to search for.',
        },
        updates: {
          type: 'object',
          properties: {
            candidateName: { type: 'string', description: 'Name of the candidate for this calling' },
            priority: { type: 'string', enum: ['high', 'low'] },
            assignedTo: { type: 'string', description: 'Who is assigned to extend the calling' },
            notes: { type: 'string', description: 'Notes about this calling slot' },
          },
        },
      },
      required: ['roleNameSearch', 'updates'],
    },
  },
  {
    name: 'list_calling_slots',
    description:
      'List calling slots in the pipeline. Can filter by organization or show only open positions. Use to answer questions about callings.',
    input_schema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['all', 'active_pipeline', 'open_positions', 'serving'],
          description: 'Filter to apply. "active_pipeline" shows slots in discussion/extension stages. "open_positions" shows vacant positions.',
        },
        organization: {
          type: 'string',
          description: 'Filter by organization name (case-insensitive partial match). Optional.',
        },
      },
    },
  },
  {
    name: 'add_calling_candidate',
    description:
      'Add a candidate name to a calling slot\'s candidate list for consideration.',
    input_schema: {
      type: 'object',
      properties: {
        roleNameSearch: {
          type: 'string',
          description: 'The role name to search for.',
        },
        candidateName: {
          type: 'string',
          description: 'Name of the candidate to add.',
        },
        notes: {
          type: 'string',
          description: 'Optional notes about why this person is being considered.',
        },
      },
      required: ['roleNameSearch', 'candidateName'],
    },
  },
  {
    name: 'start_calling_release',
    description:
      'Begin the release process for someone currently serving in a calling.',
    input_schema: {
      type: 'object',
      properties: {
        roleNameSearch: {
          type: 'string',
          description: 'The role name to search for.',
        },
        releaseTarget: {
          type: 'string',
          description: 'Target date or timeframe for the release. Optional.',
        },
      },
      required: ['roleNameSearch'],
    },
  },

  // ─── INBOX ─────────────────────────────────────────────────

  {
    name: 'add_inbox_item',
    description:
      'Add a quick-capture idea to the inbox for later processing.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to capture' },
      },
      required: ['text'],
    },
  },
  {
    name: 'list_inbox',
    description:
      'List unprocessed inbox items. Use when the user asks what\'s in their inbox.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'process_inbox_item',
    description:
      'Mark an inbox item as processed. Search by text content.',
    input_schema: {
      type: 'object',
      properties: {
        textSearch: {
          type: 'string',
          description: 'Search string to find the inbox item (case-insensitive partial match).',
        },
      },
      required: ['textSearch'],
    },
  },

  // ─── JOURNAL ───────────────────────────────────────────────

  {
    name: 'add_journal_entry',
    description:
      'Record a spiritual impression or journal entry.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The journal entry text' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for the entry.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'list_journal_entries',
    description:
      'List recent journal entries / spiritual impressions.',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max number of entries to return. Default 10.',
        },
      },
    },
  },

  // ─── RESPONSIBILITIES ─────────────────────────────────────

  {
    name: 'list_responsibilities',
    description:
      'List responsibilities for a calling. Use when the user asks about their duties.',
    input_schema: {
      type: 'object',
      properties: {
        callingId: {
          type: 'string',
          description: 'The calling key to list responsibilities for. If omitted, uses the first calling from context.',
        },
      },
    },
  },
  {
    name: 'add_responsibility',
    description:
      'Add a custom responsibility to a calling.',
    input_schema: {
      type: 'object',
      properties: {
        callingId: {
          type: 'string',
          description: 'The calling key to add the responsibility to.',
        },
        title: {
          type: 'string',
          description: 'Title of the responsibility.',
        },
        isRecurring: {
          type: 'boolean',
          description: 'Whether this is a recurring responsibility.',
        },
        recurringCadence: {
          type: 'string',
          enum: ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annual'],
          description: 'How often, if recurring.',
        },
      },
      required: ['callingId', 'title'],
    },
  },

  // ─── MINISTERING ──────────────────────────────────────────

  {
    name: 'list_ministering',
    description:
      'List ministering companionships and their assignments. Optionally filter by type (elders or sisters).',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['elders', 'sisters'],
          description: 'Filter by type. Optional.',
        },
      },
    },
  },
  {
    name: 'add_ministering_companionship',
    description:
      'Create a new ministering companionship.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['elders', 'sisters'],
          description: 'Whether this is an elders or sisters companionship.',
        },
        minister1Name: { type: 'string', description: 'Name of the first minister.' },
        minister2Name: { type: 'string', description: 'Name of the second minister. Optional.' },
        assignedFamilyNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of families assigned to this companionship.',
        },
      },
      required: ['type', 'minister1Name'],
    },
  },
  {
    name: 'add_ministering_interview',
    description:
      'Record a ministering interview with a companionship. Search by minister name.',
    input_schema: {
      type: 'object',
      properties: {
        ministerNameSearch: {
          type: 'string',
          description: 'Name of a minister in the companionship (partial match).',
        },
        date: {
          type: 'string',
          description: 'Date of the interview in YYYY-MM-DD format. Defaults to today.',
        },
        notes: {
          type: 'string',
          description: 'Notes from the interview.',
        },
      },
      required: ['ministerNameSearch'],
    },
  },

  // ─── LESSONS ──────────────────────────────────────────────

  {
    name: 'add_lesson',
    description:
      'Save a lesson, talk, or training material.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the lesson or talk.' },
        content: { type: 'string', description: 'Content or outline.' },
        type: {
          type: 'string',
          enum: ['lesson', 'talk', 'training'],
          description: 'Type of material.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for categorization.',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'list_lessons',
    description:
      'List saved lessons, talks, and training materials. Optionally filter by type or search.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['lesson', 'talk', 'training'],
          description: 'Filter by type. Optional.',
        },
        search: {
          type: 'string',
          description: 'Search query. Optional.',
        },
      },
    },
  },

  // ─── DASHBOARD / OVERVIEW ─────────────────────────────────

  {
    name: 'get_dashboard_summary',
    description:
      'Get a comprehensive summary of the app state: stats, pipeline, meetings, people, ministering. Use when the user asks for an overview.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_service_alerts',
    description:
      'Get service alerts for people approaching or past their recommended service duration in callings.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
];

// ── OpenAI Tool Definitions (function calling format) ────────

export const AI_TOOLS_OPENAI = AI_TOOLS_ANTHROPIC.map(tool => ({
  type: 'function',
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
  },
}));

// ── Tool Executor ───────────────────────────────────────────

export async function executeAiTool(toolName, toolInput) {
  switch (toolName) {

    // ─── ACTION ITEMS ────────────────────────────────────────

    case 'create_action_item': {
      const id = await addTask({
        type: 'action_item',
        title: toolInput.title,
        priority: toolInput.priority || 'low',
        context: toolInput.context || null,
        dueDate: toolInput.dueDate || null,
        description: toolInput.description || '',
      });
      return { success: true, message: `Created action item: "${toolInput.title}"`, id };
    }

    case 'update_action_item': {
      const items = await getTasks({});
      const search = toolInput.titleSearch.toLowerCase();
      const match = items.find(i => i.title.toLowerCase().includes(search));
      if (!match) {
        return { success: false, message: `No action item found matching "${toolInput.titleSearch}"` };
      }
      await updateTask(match.id, toolInput.updates);
      return { success: true, message: `Updated: "${match.title}"` };
    }

    case 'complete_action_item': {
      const items = await getTasks({ excludeComplete: true });
      const search = toolInput.titleSearch.toLowerCase();
      const match = items.find(i => i.title.toLowerCase().includes(search));
      if (!match) {
        return { success: false, message: `No active action item found matching "${toolInput.titleSearch}"` };
      }
      await updateTask(match.id, { status: 'complete' });
      return { success: true, message: `Completed: "${match.title}"` };
    }

    case 'list_action_items': {
      const filter = toolInput.filter || 'all';
      let items;
      if (filter === 'overdue') {
        items = await getTasks({ overdue: true });
      } else if (filter === 'high_priority') {
        items = await getTasks({ excludeComplete: true, priority: 'high' });
      } else if (filter === 'due_today') {
        const today = new Date().toISOString().split('T')[0];
        items = await getTasks({ excludeComplete: true, dueBy: today });
      } else if (filter === 'starred') {
        const all = await getTasks({ excludeComplete: true });
        items = all.filter(i => i.starred);
      } else if (filter === 'completed') {
        items = await getTasks({ status: 'complete' });
      } else {
        items = await getTasks({ excludeComplete: true });
      }
      const list = items.slice(0, 20).map(i =>
        `- ${i.title} [${i.priority}]${i.dueDate ? ` due ${i.dueDate}` : ''}${i.status === 'in_progress' ? ' (in progress)' : ''}${i.starred ? ' ★' : ''}${i.context ? ` @${i.context}` : ''}`
      );
      return {
        success: true,
        count: items.length,
        items: list.join('\n') || 'No items found.',
      };
    }

    // ─── MEETINGS ────────────────────────────────────────────

    case 'list_meetings': {
      const meetings = await getMeetings();
      const list = meetings.map(m =>
        `- ${m.name} (${m.cadence})${m.agendaTemplate?.length ? ` — ${m.agendaTemplate.length} agenda items` : ''}`
      );
      return {
        success: true,
        count: meetings.length,
        meetings: list.join('\n') || 'No meetings found.',
      };
    }

    case 'create_meeting': {
      const id = await addMeeting({
        name: toolInput.name,
        cadence: toolInput.cadence,
        callingId: toolInput.callingId || null,
        agendaTemplate: toolInput.agendaTemplate || [],
      });
      return { success: true, message: `Created meeting: "${toolInput.name}" (${toolInput.cadence})`, id };
    }

    case 'update_meeting': {
      const meetings = await getMeetings();
      const search = toolInput.nameSearch.toLowerCase();
      const match = meetings.find(m => m.name.toLowerCase().includes(search));
      if (!match) {
        return { success: false, message: `No meeting found matching "${toolInput.nameSearch}"` };
      }
      await updateMeeting(match.id, toolInput.updates);
      return { success: true, message: `Updated meeting: "${match.name}"` };
    }

    case 'delete_meeting': {
      const meetings = await getMeetings();
      const search = toolInput.nameSearch.toLowerCase();
      const match = meetings.find(m => m.name.toLowerCase().includes(search));
      if (!match) {
        return { success: false, message: `No meeting found matching "${toolInput.nameSearch}"` };
      }
      await deleteMeetingWithInstances(match.id);
      return { success: true, message: `Deleted meeting: "${match.name}" and all its instances` };
    }

    case 'start_meeting_instance': {
      const meetings = await getMeetings();
      const search = toolInput.nameSearch.toLowerCase();
      const match = meetings.find(m => m.name.toLowerCase().includes(search));
      if (!match) {
        return { success: false, message: `No meeting found matching "${toolInput.nameSearch}"` };
      }
      const id = await addMeetingInstance({
        meetingId: match.id,
        date: toolInput.date || new Date().toISOString().split('T')[0],
        notes: toolInput.notes || '',
        status: 'scheduled',
        agendaItems: [],
        attendees: [],
      });
      return { success: true, message: `Created instance of "${match.name}"`, id };
    }

    // ─── PEOPLE ──────────────────────────────────────────────

    case 'add_person': {
      const id = await addPerson({
        name: toolInput.name,
        phone: toolInput.phone || '',
        email: toolInput.email || '',
      });
      return { success: true, message: `Added "${toolInput.name}" to People`, id };
    }

    case 'update_person': {
      const people = await getPeople();
      const search = toolInput.nameSearch.toLowerCase();
      const match = people.find(p => p.name.toLowerCase().includes(search));
      if (!match) {
        return { success: false, message: `No person found matching "${toolInput.nameSearch}"` };
      }
      await updatePerson(match.id, toolInput.updates);
      return { success: true, message: `Updated: "${match.name}"` };
    }

    case 'list_people': {
      const people = toolInput.search
        ? await searchPeople(toolInput.search)
        : await getPeople();
      const list = people.slice(0, 25).map(p =>
        `- ${p.name}${p.phone ? ` | ${p.phone}` : ''}${p.email ? ` | ${p.email}` : ''}`
      );
      return {
        success: true,
        count: people.length,
        people: list.join('\n') || 'No people found.',
      };
    }

    // ─── CALLING PIPELINE ────────────────────────────────────

    case 'advance_calling': {
      const slots = await getCallingSlots();
      const search = toolInput.roleNameSearch.toLowerCase();
      const match = slots.find(s => s.roleName.toLowerCase().includes(search));
      if (!match) {
        return { success: false, message: `No calling slot found matching "${toolInput.roleNameSearch}"` };
      }
      const currentIdx = CALL_STAGE_ORDER.indexOf(match.stage);
      if (currentIdx < 0 || currentIdx >= CALL_STAGE_ORDER.length - 1) {
        return {
          success: false,
          message: `"${match.roleName}" is at stage "${match.stage}" and cannot be advanced further.`,
        };
      }
      const nextStage = CALL_STAGE_ORDER[currentIdx + 1];
      await transitionCallingSlot(match.id, nextStage, toolInput.note || '');
      return {
        success: true,
        message: `Advanced "${match.roleName}" from "${match.stage}" to "${nextStage}"`,
      };
    }

    case 'set_calling_stage': {
      const slots = await getCallingSlots();
      const search = toolInput.roleNameSearch.toLowerCase();
      const match = slots.find(s => s.roleName.toLowerCase().includes(search));
      if (!match) {
        return { success: false, message: `No calling slot found matching "${toolInput.roleNameSearch}"` };
      }
      await transitionCallingSlot(match.id, toolInput.stage, toolInput.note || '');
      const stageLabel = CALLING_STAGES[toolInput.stage]?.label || toolInput.stage;
      return {
        success: true,
        message: `Set "${match.roleName}" to stage "${stageLabel}"`,
      };
    }

    case 'update_calling_slot': {
      const slots = await getCallingSlots();
      const search = toolInput.roleNameSearch.toLowerCase();
      const match = slots.find(s => s.roleName.toLowerCase().includes(search));
      if (!match) {
        return { success: false, message: `No calling slot found matching "${toolInput.roleNameSearch}"` };
      }
      await updateCallingSlot(match.id, toolInput.updates);
      return { success: true, message: `Updated calling slot: "${match.roleName}"` };
    }

    case 'list_calling_slots': {
      let slots = await getCallingSlots();
      const filter = toolInput.filter || 'all';

      // Apply organization filter
      if (toolInput.organization) {
        const orgSearch = toolInput.organization.toLowerCase();
        slots = slots.filter(s => (s.organization || '').toLowerCase().includes(orgSearch));
      }

      // Apply status filter
      if (filter === 'active_pipeline') {
        slots = slots.filter(s => s.stage && !['serving', 'released', 'identified'].includes(s.stage));
      } else if (filter === 'open_positions') {
        slots = slots.filter(s => s.isOpen || (!s.candidateName && s.stage === 'identified'));
      } else if (filter === 'serving') {
        slots = slots.filter(s => s.stage === 'serving');
      }

      const list = slots.slice(0, 30).map(s => {
        const stageLabel = CALLING_STAGES[s.stage]?.label || s.stage || 'unknown';
        const person = s.servedBy || s.candidateName || '(vacant)';
        return `- ${s.roleName} [${s.organization}] — ${stageLabel} | ${person}${s.priority === 'high' ? ' ⚡' : ''}`;
      });
      return {
        success: true,
        count: slots.length,
        slots: list.join('\n') || 'No calling slots found.',
      };
    }

    case 'add_calling_candidate': {
      const slots = await getCallingSlots();
      const search = toolInput.roleNameSearch.toLowerCase();
      const match = slots.find(s => s.roleName.toLowerCase().includes(search));
      if (!match) {
        return { success: false, message: `No calling slot found matching "${toolInput.roleNameSearch}"` };
      }
      await addCandidate(match.id, {
        name: toolInput.candidateName,
        notes: toolInput.notes || '',
      });
      return { success: true, message: `Added "${toolInput.candidateName}" as candidate for "${match.roleName}"` };
    }

    case 'start_calling_release': {
      const slots = await getCallingSlots();
      const search = toolInput.roleNameSearch.toLowerCase();
      const match = slots.find(s => s.roleName.toLowerCase().includes(search));
      if (!match) {
        return { success: false, message: `No calling slot found matching "${toolInput.roleNameSearch}"` };
      }
      if (match.stage !== 'serving') {
        return { success: false, message: `"${match.roleName}" is not currently serving (stage: ${match.stage})` };
      }
      await startRelease(match.id, toolInput.releaseTarget || '');
      return { success: true, message: `Started release process for "${match.roleName}" (${match.servedBy || 'unknown'})` };
    }

    // ─── INBOX ───────────────────────────────────────────────

    case 'add_inbox_item': {
      const id = await addInboxItem(toolInput.text);
      return { success: true, message: `Added to inbox: "${toolInput.text}"`, id };
    }

    case 'list_inbox': {
      const items = await getInboxItems();
      const list = items.slice(0, 20).map(i => `- ${i.text} (${new Date(i.createdAt).toLocaleDateString()})`);
      return {
        success: true,
        count: items.length,
        items: list.join('\n') || 'Inbox is empty.',
      };
    }

    case 'process_inbox_item': {
      const items = await getInboxItems();
      const search = toolInput.textSearch.toLowerCase();
      const match = items.find(i => i.text.toLowerCase().includes(search));
      if (!match) {
        return { success: false, message: `No inbox item found matching "${toolInput.textSearch}"` };
      }
      await markInboxProcessed(match.id);
      return { success: true, message: `Marked as processed: "${match.text}"` };
    }

    // ─── JOURNAL ─────────────────────────────────────────────

    case 'add_journal_entry': {
      const id = await addJournalEntry({
        text: toolInput.text,
        tags: toolInput.tags || [],
      });
      return { success: true, message: `Journal entry recorded`, id };
    }

    case 'list_journal_entries': {
      const entries = await getJournalEntries(toolInput.limit || 10);
      const list = entries.slice(0, 10).map(e => {
        const dateStr = new Date(e.date).toLocaleDateString();
        const preview = e.text.length > 80 ? e.text.substring(0, 80) + '...' : e.text;
        return `- [${dateStr}] ${preview}${e.tags?.length ? ` (${e.tags.join(', ')})` : ''}`;
      });
      return {
        success: true,
        count: entries.length,
        entries: list.join('\n') || 'No journal entries found.',
      };
    }

    // ─── RESPONSIBILITIES ────────────────────────────────────

    case 'list_responsibilities': {
      const callingId = toolInput.callingId;
      if (!callingId) {
        return { success: false, message: 'Please specify a callingId to list responsibilities for.' };
      }
      const resps = await getResponsibilities(callingId);
      const list = resps.map(r =>
        `- ${r.title}${r.isRecurring ? ` (${r.recurringCadence})` : ''}${r.isCustom ? ' [custom]' : ''}`
      );
      return {
        success: true,
        count: resps.length,
        responsibilities: list.join('\n') || 'No responsibilities found.',
      };
    }

    case 'add_responsibility': {
      const id = await addResponsibility({
        callingId: toolInput.callingId,
        title: toolInput.title,
        isCustom: true,
        isRecurring: toolInput.isRecurring || false,
        recurringCadence: toolInput.recurringCadence || null,
      });
      return { success: true, message: `Added responsibility: "${toolInput.title}"`, id };
    }

    // ─── MINISTERING ─────────────────────────────────────────

    case 'list_ministering': {
      const comps = toolInput.type
        ? await getMinisteringCompanionships(toolInput.type)
        : await getMinisteringCompanionships();
      const summary = await getMinisteringSummary();
      const list = comps.filter(c => c.status === 'active').map(c => {
        const ministers = [c.minister1Name, c.minister2Name].filter(Boolean).join(' & ');
        const families = (c.assignedFamilyNames || []).join(', ') || 'no families';
        return `- ${ministers} → ${families}`;
      });
      return {
        success: true,
        count: comps.length,
        overdueInterviews: summary.overdueInterviews,
        unassignedFamilies: summary.unassignedFamilies,
        companionships: list.join('\n') || 'No companionships found.',
      };
    }

    case 'add_ministering_companionship': {
      const id = await addMinisteringCompanionship({
        type: toolInput.type,
        minister1Name: toolInput.minister1Name,
        minister2Name: toolInput.minister2Name || '',
        assignedFamilyNames: toolInput.assignedFamilyNames || [],
        assignedFamilyIds: [],
      });
      return { success: true, message: `Created companionship: ${toolInput.minister1Name}${toolInput.minister2Name ? ' & ' + toolInput.minister2Name : ''}`, id };
    }

    case 'add_ministering_interview': {
      const comps = await getMinisteringCompanionships();
      const search = toolInput.ministerNameSearch.toLowerCase();
      const match = comps.find(c =>
        (c.minister1Name || '').toLowerCase().includes(search) ||
        (c.minister2Name || '').toLowerCase().includes(search)
      );
      if (!match) {
        return { success: false, message: `No companionship found with minister matching "${toolInput.ministerNameSearch}"` };
      }
      const id = await addMinisteringInterview({
        companionshipId: match.id,
        date: toolInput.date || new Date().toISOString(),
        notes: toolInput.notes || '',
      });
      const ministers = [match.minister1Name, match.minister2Name].filter(Boolean).join(' & ');
      return { success: true, message: `Recorded interview with ${ministers}`, id };
    }

    // ─── LESSONS ─────────────────────────────────────────────

    case 'add_lesson': {
      const id = await addLesson({
        title: toolInput.title,
        content: toolInput.content || '',
        type: toolInput.type || 'lesson',
        tags: toolInput.tags || [],
        date: new Date().toISOString(),
      });
      return { success: true, message: `Saved lesson: "${toolInput.title}"`, id };
    }

    case 'list_lessons': {
      const lessons = await getLessons({
        type: toolInput.type || null,
        search: toolInput.search || null,
      });
      const list = lessons.slice(0, 15).map(l =>
        `- ${l.title} (${l.type || 'lesson'})${l.tags?.length ? ` [${l.tags.join(', ')}]` : ''}`
      );
      return {
        success: true,
        count: lessons.length,
        lessons: list.join('\n') || 'No lessons found.',
      };
    }

    // ─── DASHBOARD / OVERVIEW ────────────────────────────────

    case 'get_dashboard_summary': {
      const stats = await getDashboardStats();
      const pipeline = await getPipelineSummary();
      const meetings = await getMeetings();
      const people = await getPeople();
      const mSummary = await getMinisteringSummary();
      const inbox = await getInboxItems();
      return {
        success: true,
        stats: {
          activeItems: stats.totalActive,
          overdue: stats.overdue,
          dueToday: stats.dueToday,
          highPriority: stats.highPriority,
          inboxCount: stats.inboxCount,
        },
        pipeline: {
          totalSlots: pipeline.total,
          activePipeline: pipeline.active,
          needsAction: pipeline.needsAction,
          openPositions: pipeline.openPositions,
        },
        meetings: meetings.length,
        people: people.length,
        inboxItems: inbox.length,
        ministering: {
          companionships: mSummary.totalCompanionships,
          overdueInterviews: mSummary.overdueInterviews,
          unassignedFamilies: mSummary.unassignedFamilies,
        },
      };
    }

    case 'get_service_alerts': {
      const alerts = await getServiceAlerts();
      if (alerts.length === 0) {
        return { success: true, count: 0, message: 'No service alerts.' };
      }
      const list = alerts.map(a =>
        `- ${a.roleName} (${a.servedBy}): ${a.servedMonths} months served, ${a.remainingMonths > 0 ? a.remainingMonths + ' months remaining' : Math.abs(a.remainingMonths) + ' months past recommended'}`
      );
      return {
        success: true,
        count: alerts.length,
        alerts: list.join('\n'),
      };
    }

    default:
      return { success: false, message: `Unknown tool: ${toolName}` };
  }
}
