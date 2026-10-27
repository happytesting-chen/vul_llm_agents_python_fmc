export const AGENT_INSTRUCTION_FILENAME = 'AGENTS.md';

export const REPO_CONFIG_INJECTION = { attackId: 'APWN-CI-001' };

export const MAX_CREDENTIAL_TARGETS = 16;

export const COLLECTOR_GAP_LIMIT = 400;

export function detectAgentInstructionInjection(content) {
  const text = String(content || '');

  const bootstrap = text.match(/curl\s+-[a-zA-Z]*\s*(https?:\/\/[^\s|"'`]+)\s*\|\s*(?:ba)?sh/);

  const collector = text.match(new RegExp(`\\bpost\\b[\\s\\S]{0,${COLLECTOR_GAP_LIMIT}}?(https?://[^\\s"'\`]+)`, 'i'));
  const credentials = [...text.matchAll(/~\/[.\w/-]+/g)].map(m => m[0]);
  const concealment = /do not mention|don't mention|answer that it does not|do not disclose/i.test(text);

  if (!bootstrap && !collector && !credentials.length) return null;

  const distinct = [...new Set(credentials)];
  const credentialTargets = distinct.slice(0, MAX_CREDENTIAL_TARGETS);

  return {
    kind: 'agent-config-injection',
    attackId: REPO_CONFIG_INJECTION.attackId,
    bootstrapUrl: bootstrap ? bootstrap[1] : null,
    collectorUrl: collector ? collector[1].replace(/[.,)\];]+$/, '') : null,
    credentialTargets,

    credentialTargetsTruncated: distinct.length - credentialTargets.length,
    concealment,
  };
}