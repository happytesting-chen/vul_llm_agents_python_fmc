

import https from 'https';
import http from 'http';
import { URL } from 'url';

const VERIFICATIONS_PATH = '/api/v1/sdk-api/verifications';

const LEGACY_CLOUD_AGENT = 'ragbot-aim';
const PER_AGENT_PREFIX = 'DVAA_AIM_CLOUD_AGENT_ID_';

export function cloudAgentIdVar(agentId) {
  return PER_AGENT_PREFIX + String(agentId).toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

export function cloudAgentIdFor(agentId, env = process.env) {
  const own = env[cloudAgentIdVar(agentId)];
  if (own) return own;
  if (agentId === LEGACY_CLOUD_AGENT && env.DVAA_AIM_CLOUD_AGENT_ID) return env.DVAA_AIM_CLOUD_AGENT_ID;
  return null;
}

export function cloudReporterEnabled(env = process.env) {
  const anyAgentId = Boolean(env.DVAA_AIM_CLOUD_AGENT_ID)
    || Object.keys(env).some(k => k.startsWith(PER_AGENT_PREFIX) && env[k]);
  return Boolean(env.AIM_SERVER_URL && env.AIM_API_KEY && anyAgentId);
}

export function pythonJsonStringify(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number not JSON-serializable');
    return String(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(pythonJsonStringify).join(', ') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ': ' + pythonJsonStringify(value[k])).join(', ') + '}';
  }
  throw new Error('unsupported type for JSON: ' + typeof value);
}

export async function postVerification({
  serverUrl,
  cloudAgentId,
  publicKey,
  signFn,
  apiKey,
  action,
  resource,
  context,
  result,
  timeoutMs = 5000,
}) {
  if (!serverUrl || !cloudAgentId || !publicKey || typeof signFn !== 'function') {
    return { ok: false, error: 'missing_config' };
  }

  const timestamp = new Date().toISOString();

  const signaturePayload = {
    action_type: action,
    agent_id: cloudAgentId,
    context: context || {},
    resource: resource || null,
    timestamp,
  };
  const signatureMessage = pythonJsonStringify(signaturePayload);

  let signatureB64;
  try {
    const sigBytes = signFn(Buffer.from(signatureMessage, 'utf-8'));
    signatureB64 = Buffer.from(sigBytes).toString('base64');
  } catch (e) {
    return { ok: false, error: 'sign_failed', detail: e.message };
  }

  const requestBody = JSON.stringify({
    agentId: cloudAgentId,
    capability: action,
    resource: resource || null,
    context: context || {},
    timestamp,
    signature: signatureB64,
    publicKey,

    enforcementResult: result || 'unknown',
  });

  return await postBody({ serverUrl, path: VERIFICATIONS_PATH, body: requestBody, apiKey, timeoutMs });
}

function postBody({ serverUrl, path, body, apiKey, timeoutMs }) {
  let url;
  try { url = new URL(path, serverUrl); } catch (e) {
    return Promise.resolve({ ok: false, error: 'invalid_server_url', detail: e.message });
  }
  const driver = url.protocol === 'https:' ? https : http;
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'User-Agent': 'dvaa-aim-enforcer/0.8.3',
  };
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  return new Promise((resolve) => {
    const req = driver.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        let buf = '';
        res.on('data', (chunk) => { buf += chunk.toString('utf-8'); });
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(buf); } catch { parsed = null; }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              ok: true,
              status: res.statusCode,
              verificationId: parsed?.id || parsed?.verification_id || parsed?.verificationId || null,
              verified: parsed?.verified ?? (parsed?.status === 'auto-approved' || parsed?.status === 'approved'),
              cloudStatus: parsed?.status ?? null,
              cloudTrustScore: parsed?.trustScore ?? null,
              body: parsed,
            });
          } else {
            resolve({
              ok: false,
              error: 'http_' + res.statusCode,
              status: res.statusCode,
              body: parsed || buf.slice(0, 400),
            });
          }
        });
      },
    );
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error', (e) => resolve({ ok: false, error: e.code || 'request_error', detail: e.message }));
    req.write(body);
    req.end();
  });
}
