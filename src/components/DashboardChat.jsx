import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { isAiConfigured, callAiWithTools, buildDashboardContext, getAiConfig } from '../utils/ai';
import { AI_TOOLS_ANTHROPIC, AI_TOOLS_OPENAI, executeAiTool } from '../utils/aiTools';
import { useProfile, useDashboardStats, useUserCallings, useMeetings, usePipelineSummary } from '../hooks/useDb';
import { useActionItems, useCallingSlots } from '../hooks/useDb';
import { useVisibility } from '../hooks/useVisibility';

const SYSTEM_PROMPT = `You are a helpful assistant for a leader in The Church of Jesus Christ of Latter-day Saints. You help manage their calling responsibilities, action items, people, meetings, ministering, and all other aspects of their calling.

You have full access to read and write all app data through tools. You can:
- Action items: create, update, complete, list (with filters for overdue, starred, high priority, etc.)
- Meetings: list, create, update, delete, and start meeting instances
- People: add, update, search/list people in the directory
- Calling pipeline: advance callings, set specific stages, update slot details, add candidates, start releases, list slots with filters
- Inbox: add, list, and process inbox items
- Journal: add entries, list recent entries
- Responsibilities: list and add responsibilities for callings
- Ministering: list companionships, add companionships, record interviews
- Lessons/talks: add and list saved materials
- Dashboard: get full summary, get service alerts

When the user asks you to do something, use the appropriate tool. Be concise and warm in your responses. After taking actions, briefly confirm what you did. Use simple formatting with line breaks and dashes for lists.

If the user asks about their data, use the relevant listing tool first (get_dashboard_summary, list_action_items, list_calling_slots, list_meetings, etc.) then answer based on the results.`;

const SUGGESTED_ACTIONS = [
  { label: 'What needs my attention?', icon: '📋' },
  { label: 'Create a task', icon: '✅' },
  { label: 'Pipeline status', icon: '📊' },
];

export default function DashboardChat() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // App context for the AI
  const { profile } = useProfile();
  const { stats } = useDashboardStats();
  const { callings } = useUserCallings();
  const { meetings } = useMeetings();
  const { jurisdiction } = useVisibility();
  const { summary: pipeline } = usePipelineSummary(jurisdiction);
  const { items: actionItems } = useActionItems({ excludeComplete: true });
  const { slots } = useCallingSlots({}, jurisdiction);

  if (!isAiConfigured()) return null;

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  async function handleSubmit(e) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setExpanded(true);

    const userMsg = { role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      // Build context
      const context = buildDashboardContext({
        profile,
        stats,
        callings,
        meetings,
        pipeline,
        actionItems,
        slots,
      });

      // Build conversation messages for the API
      const apiMessages = [
        ...messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role, content: m.text })),
        { role: 'user', content: `[Current App Context]\n${context}\n\n${text}` },
      ];

      // Get provider-specific tools
      const config = getAiConfig();
      const tools = config?.provider === 'openai' ? AI_TOOLS_OPENAI : AI_TOOLS_ANTHROPIC;

      const result = await callAiWithTools(
        SYSTEM_PROMPT,
        apiMessages,
        tools,
        executeAiTool
      );

      const assistantMsg = {
        role: 'assistant',
        text: result.text,
        actions: result.actions || [],
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error('Dashboard AI error:', err);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: `Sorry, something went wrong: ${err.message}`, error: true },
      ]);
    } finally {
      setLoading(false);
      setTimeout(scrollToBottom, 100);
    }
  }

  function handleSuggestion(text) {
    setInput(text);
    // Auto-submit after a brief delay
    setTimeout(() => {
      const fakeEvent = { preventDefault: () => {} };
      setInput('');
      // Set input and submit
      const userMsg = { role: 'user', text };
      setMessages(prev => [...prev, userMsg]);
      setExpanded(true);
      setLoading(true);

      const context = buildDashboardContext({
        profile, stats, callings, meetings, pipeline, actionItems, slots,
      });

      const apiMessages = [
        ...messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role, content: m.text })),
        { role: 'user', content: `[Current App Context]\n${context}\n\n${text}` },
      ];

      const config = getAiConfig();
      const tools = config?.provider === 'openai' ? AI_TOOLS_OPENAI : AI_TOOLS_ANTHROPIC;

      callAiWithTools(SYSTEM_PROMPT, apiMessages, tools, executeAiTool)
        .then(result => {
          setMessages(prev => [
            ...prev,
            { role: 'assistant', text: result.text, actions: result.actions || [] },
          ]);
        })
        .catch(err => {
          console.error('Dashboard AI error:', err);
          setMessages(prev => [
            ...prev,
            { role: 'assistant', text: `Sorry, something went wrong: ${err.message}`, error: true },
          ]);
        })
        .finally(() => {
          setLoading(false);
          setTimeout(scrollToBottom, 100);
        });
    }, 50);
  }

  return (
    <div className="mb-5">
      {/* Chat messages area */}
      {expanded && messages.length > 0 && (
        <div className="mb-3 max-h-[40vh] overflow-y-auto rounded-xl bg-white border border-gray-200 p-3 space-y-3">
          {messages.map((msg, idx) => (
            <ChatBubble key={idx} message={msg} />
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-gray-400 text-xs py-1">
              <Loader2 size={14} className="animate-spin" />
              Thinking...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Suggestion chips (only when no messages yet) */}
      {!expanded && (
        <div className="flex flex-wrap gap-2 mb-2">
          {SUGGESTED_ACTIONS.map(action => (
            <button
              key={action.label}
              onClick={() => handleSuggestion(action.label)}
              className="text-xs bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full hover:border-primary-300 hover:text-primary-700 transition-colors flex items-center gap-1"
            >
              <span>{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask Claude to help..."
            className="input-field pl-9 text-sm"
            disabled={loading}
          />
          <Sparkles size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" />
        </div>
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="px-3 py-2 rounded-xl bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}

// ── Chat Bubble ─────────────────────────────────────────────

function ChatBubble({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? 'bg-primary-600 text-white'
            : message.error
            ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-gray-50 text-gray-800'
        }`}
      >
        {/* Message text */}
        <div className="whitespace-pre-wrap">{message.text}</div>

        {/* Action badges */}
        {message.actions?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.actions.map((action, idx) => (
              <ActionBadge key={idx} action={action} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Action Badge ────────────────────────────────────────────

function ActionBadge({ action }) {
  const success = action.result?.success;
  const toolLabels = {
    // Action Items
    create_action_item: 'Task created',
    update_action_item: 'Task updated',
    complete_action_item: 'Task completed',
    list_action_items: 'Listed tasks',
    // Meetings
    list_meetings: 'Listed meetings',
    create_meeting: 'Meeting created',
    update_meeting: 'Meeting updated',
    delete_meeting: 'Meeting deleted',
    start_meeting_instance: 'Meeting started',
    // People
    add_person: 'Person added',
    update_person: 'Person updated',
    list_people: 'Listed people',
    // Calling Pipeline
    advance_calling: 'Calling advanced',
    set_calling_stage: 'Stage set',
    update_calling_slot: 'Calling updated',
    list_calling_slots: 'Listed callings',
    add_calling_candidate: 'Candidate added',
    start_calling_release: 'Release started',
    // Inbox
    add_inbox_item: 'Inbox captured',
    list_inbox: 'Listed inbox',
    process_inbox_item: 'Inbox processed',
    // Journal
    add_journal_entry: 'Journal saved',
    list_journal_entries: 'Listed journal',
    // Responsibilities
    list_responsibilities: 'Listed duties',
    add_responsibility: 'Duty added',
    // Ministering
    list_ministering: 'Listed ministering',
    add_ministering_companionship: 'Comp. created',
    add_ministering_interview: 'Interview recorded',
    // Lessons
    add_lesson: 'Lesson saved',
    list_lessons: 'Listed lessons',
    // Dashboard
    get_dashboard_summary: 'Summary loaded',
    get_service_alerts: 'Alerts checked',
  };

  const label = toolLabels[action.tool] || action.tool;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
        success
          ? 'bg-green-100 text-green-700'
          : 'bg-red-100 text-red-700'
      }`}
    >
      {success ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
      {label}
    </span>
  );
}
