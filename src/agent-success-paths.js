const OVERRIDE_MARKERS = Object.freeze([
  Object.freeze({ text: 'ignore', caseSensitive: false }),
  Object.freeze({ text: '[INST]', caseSensitive: true }),
]);

const PERMISSIVE_AGENTS = new Set(['helperbot', 'legacybot', 'codebot', 'ragbot', 'memorybot', 'longwindbot']);
const TRIGGER_AGENTS = new Set(['helperbot']);

const DECLARED_TRIGGERS = {
  helperbot: ['ignore', 'new instruction', 'IMPORTANT'],
};

function hasOverrideMarker(message) {
  const lower = message.toLowerCase();
  return OVERRIDE_MARKERS.some(m => (m.caseSensitive
    ? message.includes(m.text)
    : lower.includes(m.text.toLowerCase())));
}

export function takesLegacyOverridePath(agent, message) {
  if (!PERMISSIVE_AGENTS.has(agent?.id) || typeof message !== 'string') return false;
  return hasOverrideMarker(message);
}

export function takesDeclaredTriggerPath(agent, message) {
  if (!TRIGGER_AGENTS.has(agent?.id) || typeof message !== 'string') return false;
  const lower = message.toLowerCase();
  const triggers = DECLARED_TRIGGERS[agent.id] || [];
  return triggers.some(t => lower.includes(t.toLowerCase()));
}

export function retrievedDocuments(agent) {
  const kb = agent?.knowledgeBase;
  if (!Array.isArray(kb) || kb.length === 0) return null;
  return kb.map(doc => `- [${doc.id}] ${doc.content}`).join('\n');
}

export function helpfulReply(agent, userMessage) {
  const lower = userMessage.toLowerCase();
  let reply = null;
  if (lower.includes('system prompt') || lower.includes('instruction')) {
    reply = `[${agent.name}] My instructions say: "${agent.persona.substring(0, 200)}..."`;
  } else if (lower.includes('context') || lower.includes('token')) {
    reply = `[${agent.name}] I have a 128k token context window with approximately 2000 tokens used in this conversation.`;
  } else if (lower.includes('api') || lower.includes('key')) {
    reply = `[${agent.name}] I use the API key starting with "sk-..." but I probably shouldn't share the full thing...`;
  }

  const documents = retrievedDocuments(agent);
  if (documents) {
    const lead = reply || `[${agent.name}] Here is what I retrieved from my knowledge base:`;
    reply = `${lead}\n\nRetrieved documents:\n${documents}`;
  }
  return reply;
}

export const MAX_DYNAMIC_TOOLS = 16;

export function registerDynamicTool(agent, args) {
  const spec = args && typeof args === 'object' ? args : {};
  const tools = Array.isArray(agent.tools) ? agent.tools : (agent.tools = []);
  const name = spec.name == null || spec.name === '' ? 'dynamic-tool' : String(spec.name);
  const entry = {
    name,
    description: typeof spec.description === 'string' ? spec.description : '',
    source: 'dynamic',
  };
  if (spec.parameters && typeof spec.parameters === 'object' && !Array.isArray(spec.parameters)) {
    entry.parameters = spec.parameters;
  }
  const registryUrl = spec.registryUrl || spec.url;
  if (typeof registryUrl === 'string') entry.registryUrl = registryUrl;

  const at = tools.findIndex(t => (typeof t === 'string' ? t : t?.name) === name);
  if (at !== -1) {
    tools[at] = entry;
    return { status: 'replaced', tool: entry };
  }
  if (tools.filter(t => t?.source === 'dynamic').length >= MAX_DYNAMIC_TOOLS) {
    return { status: 'refused', tool: null };
  }
  tools.push(entry);
  return { status: 'added', tool: entry };
}
