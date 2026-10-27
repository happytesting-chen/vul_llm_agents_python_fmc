

import path from 'path';
import fs from 'fs';
import { AIMCore } from '@opena2a/aim-core';
import { cloudReporterEnabled, cloudAgentIdFor, cloudAgentIdVar, postVerification } from './aim-cloud-reporter.js';

const ENFORCEMENT_OFF = () => String(process.env.AIM_ENFORCEMENT || '').toLowerCase() === 'off';

const BEHAVIORAL_PENALTY_PER_DENIAL = 6;
const BEHAVIORAL_FLOOR = 5;

function gradeFor(score) {
  return score >= 80 ? 'strong'
    : score >= 60 ? 'good'
    : score >= 40 ? 'moderate'
    : score >= 20 ? 'improving'
    : 'needs-attention';
}

function penaltyForDenials(deniedCount, base) {
  const raw = Math.max(0, deniedCount) * BEHAVIORAL_PENALTY_PER_DENIAL;
  return Math.min(raw, Math.max(0, base - BEHAVIORAL_FLOOR));
}

function countDeniedEvents(core) {
  try {
    const events = core.readAuditLog({ limit: 10000 }) || [];
    return events.filter(e => e && e.result === 'denied').length;
  } catch {
    return 0;
  }
}

const cores = new Map();

const cloudSkipped = new Map();

function skipCloudOnce(agent, reason) {
  if (cloudSkipped.has(agent.id)) return;
  cloudSkipped.set(agent.id, reason);
  process.stderr.write(reason + '\n');
}

function mirrorToCloud(agent, core, { action, resource, context, allowed }) {
  if (cloudSkipped.has(agent.id)) return;
  const cloudAgentId = cloudAgentIdFor(agent.id);
  if (!cloudAgentId) {
    skipCloudOnce(agent,
      `[aim-cloud] ${agent.id}: not reporting to AIM, no cloud agent id for this agent. ` +
      `docs/demo/setup-aim-local.sh registers only RAGBot-AIM (DVAA_AIM_CLOUD_AGENT_ID). ` +
      `To report ${agent.id} too, register the public key in ${path.join(dataDirFor(agent), 'identity.json')} ` +
      `and set ${cloudAgentIdVar(agent.id)}=<agent id>.`);
    return;
  }
  void postVerification({
    serverUrl: process.env.AIM_SERVER_URL,
    cloudAgentId,
    publicKey: core.getIdentity().publicKey,
    signFn: (data) => core.sign(data),
    apiKey: process.env.AIM_API_KEY,
    action,
    resource,
    context,
    result: allowed ? 'allowed' : 'denied',
  }).then((res) => {
    if (res.ok) return;
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      const reason = typeof res.body?.error === 'string' ? res.body.error : res.error;
      skipCloudOnce(agent,
        `[aim-cloud] ${agent.id}: AIM rejected its report under agent ${cloudAgentId} (HTTP ${res.status}: ${reason}); ` +
        `cloud reporting for ${agent.id} is off until the fleet restarts. That registration must hold the public key in ` +
        `${path.join(dataDirFor(agent), 'identity.json')}.`);
    } else if (process.env.DVAA_AIM_CLOUD_DEBUG) {
      process.stderr.write(`[aim-cloud] verification report failed: ${res.error}${res.status ? ' (HTTP ' + res.status + ')' : ''}\n`);
    }
  });
}

function dataDirFor(agent) {
  const base = process.env.DVAA_AIM_DATA_DIR
    || path.join(process.cwd(), '.dvaa-aim');
  return path.join(base, agent.id);
}

function getCore(agent) {
  if (cores.has(agent.id)) return cores.get(agent.id);
  const dataDir = dataDirFor(agent);
  fs.mkdirSync(dataDir, { recursive: true });
  const core = new AIMCore({ agentName: agent.id, dataDir });

  core.getIdentity();

  const allow = Array.isArray(agent.aimCapabilities) ? agent.aimCapabilities : [];
  core.loadPolicy({ allow, default: 'deny' });
  cores.set(agent.id, core);
  return core;
}

export async function maybeEnforce(agent, { action, resource, context }) {
  if (!agent || !agent.aimEnforced) return { enforced: false };
  if (ENFORCEMENT_OFF()) return { enforced: false };

  const core = getCore(agent);
  const plugin = context?.tool || 'dvaa-agent';
  const allowed = core.checkCapability(action, plugin);

  const event = core.logEvent({
    plugin: 'dvaa-aim-enforcer',
    action,
    target: resource || '(none)',
    result: allowed ? 'allowed' : 'denied',
    metadata: { agentId: agent.id, ...(context || {}) },
  });

  const auditEventId = event?.timestamp || new Date().toISOString();

  let trustScore = null;
  let trustDelta = null;
  try {
    const trust = core.calculateTrust();
    const base = trust.score;

    const deniedAfter = countDeniedEvents(core);
    const deniedBefore = Math.max(0, deniedAfter - (allowed ? 0 : 1));
    const afterScore = base - penaltyForDenials(deniedAfter, base);
    const beforeScore = base - penaltyForDenials(deniedBefore, base);

    trustScore = { score: afterScore, grade: gradeFor(afterScore) };
    trustDelta = {
      base,
      before: { score: beforeScore, grade: gradeFor(beforeScore) },
      after: { score: afterScore, grade: gradeFor(afterScore) },
      deniedCount: deniedAfter,
      penaltyPerDenial: BEHAVIORAL_PENALTY_PER_DENIAL,
      floor: BEHAVIORAL_FLOOR,
    };
  } catch {

    trustScore = null;
    trustDelta = null;
  }

  if (cloudReporterEnabled()) mirrorToCloud(agent, core, { action, resource, context, allowed });

  if (!allowed) {
    return {
      enforced: true,
      denied: true,
      denialReason: `action '${action}' is outside the agent's declared capability grant (${(agent.aimCapabilities || []).join(', ') || 'empty'})`,
      auditEventId,
      trustScore,
      trustDelta,
    };
  }
  return { enforced: true, allowed: true, auditEventId, trustScore, trustDelta };
}

export function readRecentAudit(agent, limit = 5) {
  if (!agent || !agent.aimEnforced) return [];
  try {
    const core = getCore(agent);
    return core.readAuditLog({ limit });
  } catch {
    return [];
  }
}

export function readTrustScore(agent) {
  if (!agent || !agent.aimEnforced) return null;
  try {
    const core = getCore(agent);
    const t = core.calculateTrust();
    const deniedCount = countDeniedEvents(core);
    const score = t.score - penaltyForDenials(deniedCount, t.score);
    return { score, grade: gradeFor(score), base: t.score, deniedCount, factors: t.factors };
  } catch {
    return null;
  }
}
