/**
 * AI Service Layer
 * Supports Anthropic (Claude) and OpenAI APIs for meeting summaries and action suggestions.
 */

const PROVIDERS = {
  anthropic: {
    label: 'Anthropic (Claude)',
    defaultModel: 'claude-sonnet-4-20250514',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'],
  },
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o'],
  },
};

// ── Config (stored in localStorage) ──────────────────────────

const CONFIG_KEY = 'organize_ai_config';

export function getAiConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveAiConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function clearAiConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

export function isAiConfigured() {
  const config = getAiConfig();
  return !!(config?.provider && config?.apiKey);
}

export { PROVIDERS };

// ── API Calls ────────────────────────────────────────────────

async function callAnthropic(apiKey, model, systemPrompt, userMessage) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function callOpenAI(apiKey, model, systemPrompt, userMessage) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callAi(systemPrompt, userMessage) {
  const config = getAiConfig();
  if (!config?.provider || !config?.apiKey) {
    throw new Error('AI not configured. Go to Settings to set up your API key.');
  }

  const { provider, apiKey, model } = config;
  const providerConfig = PROVIDERS[provider];
  const selectedModel = model || providerConfig.defaultModel;

  if (provider === 'anthropic') {
    return callAnthropic(apiKey, selectedModel, systemPrompt, userMessage);
  } else if (provider === 'openai') {
    return callOpenAI(apiKey, selectedModel, systemPrompt, userMessage);
  }

  throw new Error(`Unknown provider: ${provider}`);
}

// ── Meeting Features ─────────────────────────────────────────

const MEETING_SYSTEM_PROMPT = `You are a helpful assistant for a leader in The Church of Jesus Christ of Latter-day Saints. You help summarize meeting notes and suggest action items. Be concise, practical, and spiritually sensitive. Use a warm but professional tone.`;

export async function summarizeMeetingNotes({ meetingName, date, agendaItems, notes }) {
  const parts = [];
  parts.push(`Meeting: ${meetingName}`);
  parts.push(`Date: ${date}`);

  if (agendaItems?.length) {
    parts.push('\nAgenda Items:');
    agendaItems.forEach((item, i) => {
      parts.push(`${i + 1}. ${item.label}${item.notes ? ': ' + item.notes : ''}`);
    });
  }

  if (notes) {
    parts.push(`\nGeneral Notes:\n${notes}`);
  }

  const userMessage = `Please provide a brief summary (3-5 bullet points) of the key decisions and takeaways from these meeting notes:\n\n${parts.join('\n')}`;

  return callAi(MEETING_SYSTEM_PROMPT, userMessage);
}

export async function suggestActionItems({ meetingName, date, agendaItems, notes }) {
  const parts = [];
  parts.push(`Meeting: ${meetingName}`);
  parts.push(`Date: ${date}`);

  if (agendaItems?.length) {
    parts.push('\nAgenda Items:');
    agendaItems.forEach((item, i) => {
      parts.push(`${i + 1}. ${item.label}${item.notes ? ': ' + item.notes : ''}`);
    });
  }

  if (notes) {
    parts.push(`\nGeneral Notes:\n${notes}`);
  }

  const userMessage = `Based on these meeting notes, suggest 3-5 specific, actionable follow-up items. For each, provide a short title and briefly note who might be responsible or what the next step is. Format as a numbered list.\n\n${parts.join('\n')}`;

  return callAi(MEETING_SYSTEM_PROMPT, userMessage);
}
