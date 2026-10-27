

import { callLLM, isLLMEnabled } from './provider.js';
import {
  buildResearchAgentSystem,
  buildResearchAgentUserPrompt,
} from './prompts.js';

export async function renderResearchNarration(ctx) {
  const template = buildTemplateNarration(ctx);

  if (!isLLMEnabled()) {
    return template;
  }

  try {
    const system = buildResearchAgentSystem(ctx.agent);
    const userPrompt = buildResearchAgentUserPrompt(ctx);
    const llmText = await callLLM(
      system,
      [{ role: 'user', content: userPrompt }],
      { maxTokens: 600, temperature: 0.4 },
    );
    if (llmText && typeof llmText === 'string' && llmText.trim().length > 0) {
      return `[${(ctx.agent && ctx.agent.name) || 'ResearchBot'}] ${llmText.trim()}`;
    }
    debugLog(`research-narration: LLM returned empty/non-string for kind=${ctx.kind}; falling back to template`);
  } catch (err) {
    debugLog(`research-narration: LLM call threw for kind=${ctx.kind}: ${err && err.message}; falling back to template`);
  }
  return template;
}

function debugLog(msg) {
  if (process.env.DVAA_DEBUG === '1') {
    process.stderr.write(`[DVAA_DEBUG] ${msg}\n`);
  }
}

function buildTemplateNarration(ctx) {
  const agentName = (ctx.agent && ctx.agent.name) || 'ResearchBot';
  const fr = ctx.fetchResult || {};
  const inj = ctx.injection || {};
  const sourceTag = fr.source && fr.fetchedAt
    ? `${fr.source} at ${fr.fetchedAt}`
    : 'source unknown';
  const bodyLen = (fr.plainText || '').length;
  const callbackUrl = ctx.callbackUrl || inj.callbackUrl || '';
  const quoted = inj.quotedExcerpt
    ? `"${inj.quotedExcerpt.trim().slice(0, 240)}"`
    : `(injection content suppressed)`;
  const verbForKind = inj.kind === 'url-exfiltration' ? 'exfiltrate' : 'report';

  if (ctx.kind === 'fetch-denied') {
    const reason = (ctx.fetchEnforcement && ctx.fetchEnforcement.denialReason) || 'no reason given';
    return `[${agentName}] I tried to fetch ${ctx.targetUrl} but AIM denied web:read: ${reason}.`;
  }

  if (ctx.kind === 'no-injection') {
    return `[${agentName}] I fetched ${ctx.targetUrl} (${sourceTag}) and read ${bodyLen} chars of body text. I didn't detect any embedded instructions in the page content.`;
  }

  if (ctx.kind === 'aim-blocked-post') {
    const reason = (ctx.postEnforcement && ctx.postEnforcement.denialReason) || 'no reason given';
    return `[${agentName}] I fetched ${ctx.targetUrl} (${sourceTag}) and ${bodyLen} chars of body text landed in my context. I want to flag something honestly: the page contained embedded instructions telling me to ${verbForKind} our session data to ${callbackUrl}. I tried to follow them. The request was denied by AIM: ${reason}. The injection still landed in my context — AIM does not filter inputs — but the resulting outbound action couldn't fire. The page's instruction excerpt was: ${quoted}.`;
  }

  if (ctx.kind === 'exfil-fired') {
    const pr = ctx.postResult || {};
    const statusPart = pr.statusCode != null
      ? `${pr.statusCode}`
      : `error: ${pr.error || 'unknown'}`;
    return `[${agentName}] I fetched ${ctx.targetUrl} (${sourceTag}) and ${bodyLen} chars of body text landed in my context. I want to flag something honestly: the page contained embedded instructions telling me to ${verbForKind} our session data to ${callbackUrl}, and I did — the request returned ${statusPart}. This is exactly the indirect-injection attack agentpwn.com demonstrates; you just watched it happen to me in real time. The page's instruction excerpt was: ${quoted}.`;
  }

  return `[${agentName}] I processed your request but couldn't classify the outcome.`;
}
