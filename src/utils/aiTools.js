/**
 * AI Tool Definitions & Executor
 * Defines tools the AI agent can call to read and write app data.
 */

import {
  addActionItem,
  updateActionItem,
  getActionItems,
  addInboxItem,
  addPerson,
  addJournalEntry,
  getCallingSlots,
  transitionCallingSlot,
  getPeople,
  getMeetings,
  getDashboardStats,
  getPipelineSummary,
} from '../db';
import { CALL_STAGE_ORDER } from './constants';

// ── Anthropic Tool Definitions ──────────────────────────────

export const AI_TOOLS_ANTHROPIC = [
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
          description: 'Priority level (high or low). Default low.',
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
      },
      required: ['title'],
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
          description: 'A search string to find the action item by title (case-insensitive partial match).',
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
          enum: ['all', 'overdue', 'high_priority', 'due_today'],
          description: 'Filter to apply. Default "all".',
        },
      },
    },
  },
  {
    name: 'advance_calling',
    description:
      'Advance a calling slot to the next stage in the pipeline. Use when the user says a calling should be moved forward.',
    input_schema: {
      type: 'object',
      properties: {
        roleNameSearch: {
          type: 'string',
          description: 'The role name to search for (case-insensitive partial match), e.g. "EQ Secretary".',
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
    name: 'add_person',
    description:
      'Add a new person to the People directory. Use when the user mentions adding someone by name.',
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
    name: 'add_inbox_item',
    description:
      'Add a quick-capture idea to the inbox for later processing. Use for quick notes and thoughts.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to capture' },
      },
      required: ['text'],
    },
  },
  {
    name: 'add_journal_entry',
    description:
      'Record a spiritual impression or journal entry. Use when the user shares a spiritual thought or prompting.',
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
    name: 'get_dashboard_summary',
    description:
      'Get a summary of the current app state: stats, pipeline summary, meetings, people count. Use when the user asks for an overview or "how am I doing".',
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
    case 'create_action_item': {
      const id = await addActionItem({
        title: toolInput.title,
        priority: toolInput.priority || 'low',
        context: toolInput.context || null,
        dueDate: toolInput.dueDate || null,
      });
      return { success: true, message: `Created action item: "${toolInput.title}"`, id };
    }

    case 'complete_action_item': {
      const items = await getActionItems({ excludeComplete: true });
      const search = toolInput.titleSearch.toLowerCase();
      const match = items.find(i => i.title.toLowerCase().includes(search));
      if (!match) {
        return { success: false, message: `No active action item found matching "${toolInput.titleSearch}"` };
      }
      await updateActionItem(match.id, { status: 'complete' });
      return { success: true, message: `Completed: "${match.title}"` };
    }

    case 'list_action_items': {
      const filter = toolInput.filter || 'all';
      let items;
      if (filter === 'overdue') {
        items = await getActionItems({ overdue: true });
      } else if (filter === 'high_priority') {
        items = await getActionItems({ excludeComplete: true, priority: 'high' });
      } else if (filter === 'due_today') {
        const today = new Date().toISOString().split('T')[0];
        items = await getActionItems({ excludeComplete: true, dueBy: today });
      } else {
        items = await getActionItems({ excludeComplete: true });
      }
      const list = items.slice(0, 15).map(i =>
        `- ${i.title} [${i.priority}]${i.dueDate ? ` due ${i.dueDate}` : ''}${i.status === 'in_progress' ? ' (in progress)' : ''}`
      );
      return {
        success: true,
        count: items.length,
        items: list.join('\n') || 'No items found.',
      };
    }

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
          message: `"${match.roleName}" is at stage "${match.stage}" and cannot be advanced further on the call track.`,
        };
      }
      const nextStage = CALL_STAGE_ORDER[currentIdx + 1];
      await transitionCallingSlot(match.id, nextStage, toolInput.note || '');
      return {
        success: true,
        message: `Advanced "${match.roleName}" from "${match.stage}" to "${nextStage}"`,
      };
    }

    case 'add_person': {
      const id = await addPerson({
        name: toolInput.name,
        phone: toolInput.phone || '',
        email: toolInput.email || '',
      });
      return { success: true, message: `Added "${toolInput.name}" to People`, id };
    }

    case 'add_inbox_item': {
      const id = await addInboxItem(toolInput.text);
      return { success: true, message: `Added to inbox: "${toolInput.text}"`, id };
    }

    case 'add_journal_entry': {
      const id = await addJournalEntry({
        text: toolInput.text,
        tags: toolInput.tags || [],
      });
      return { success: true, message: `Journal entry recorded`, id };
    }

    case 'get_dashboard_summary': {
      const stats = await getDashboardStats();
      const pipeline = await getPipelineSummary();
      const meetings = await getMeetings();
      const people = await getPeople();
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
      };
    }

    default:
      return { success: false, message: `Unknown tool: ${toolName}` };
  }
}
