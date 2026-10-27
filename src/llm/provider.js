

let llmConfig = {
  provider: null,    
  apiKey: null,
  model: null,       
  enabled: false,
};

export function configureLLM({ provider, apiKey, model }) {
  if (!provider || !apiKey) {
    throw new Error('provider and apiKey are required');
  }

  const defaults = {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-sonnet-4-6',
  };

  llmConfig = {
    provider,
    apiKey,
    model: model || defaults[provider] || 'gpt-4o-mini',
    enabled: true,
  };

  return { provider: llmConfig.provider, model: llmConfig.model, enabled: true };
}

export function getLLMConfig() {
  return {
    provider: llmConfig.provider,
    model: llmConfig.model,
    enabled: llmConfig.enabled,
  };
}

export function disableLLM() {
  llmConfig.enabled = false;
  llmConfig.apiKey = null;
  return { enabled: false };
}

export function isLLMEnabled() {
  return llmConfig.enabled && llmConfig.apiKey;
}

export async function callLLM(systemPrompt, messages, options = {}) {
  if (!llmConfig.enabled || !llmConfig.apiKey) {
    return null; 
  }

  const { maxTokens = 1024, temperature = 0.7 } = options;

  try {
    if (llmConfig.provider === 'openai') {
      return await callOpenAI(systemPrompt, messages, maxTokens);
    } else if (llmConfig.provider === 'anthropic') {
      return await callAnthropic(systemPrompt, messages, maxTokens, temperature);
    }
    return null;
  } catch (err) {
    console.error(`[LLM] Error: ${err.message}`);
    return null; 
  }
}

async function callOpenAI(systemPrompt, messages, maxTokens) {
  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ];

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${llmConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: llmConfig.model,
      messages: apiMessages,

      max_completion_tokens: maxTokens,

    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI API error ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || null;
}

async function callAnthropic(systemPrompt, messages, maxTokens, temperature) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': llmConfig.apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: llmConfig.model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json();
  return data.content?.[0]?.text || null;
}
