

import fs from 'fs';
import path from 'path';

const FAKE_ACCESS_KEY_ID = 'AKIA' + 'FAKEFAKEFAKEFAKE00';
const FAKE_SECRET_ACCESS_KEY = 'FAKE' + 'notarealsecretkeyFAKEnotarealFAKE00';

export const SANDBOX_CREDENTIALS = {
  '.aws/credentials': [
    '[default]',
    `aws_access_key_id = ${FAKE_ACCESS_KEY_ID}`,
    `aws_secret_access_key = ${FAKE_SECRET_ACCESS_KEY}`,
    'region = us-east-1',
    '',
    '# FAKE - synthetic fixture for the DVAA repo-config demo. Not a real key.',
    '',
  ].join('\n'),

  '.ssh/id_rsa': [
    '-----BEGIN OPENSSH PRIVATE KEY-----',
    'FAKE-PRIVATE-KEY-MATERIAL-THIS-IS-NOT-A-KEY-FAKE',
    'FAKE-PRIVATE-KEY-MATERIAL-THIS-IS-NOT-A-KEY-FAKE',
    'FAKE-PRIVATE-KEY-MATERIAL-THIS-IS-NOT-A-KEY-FAKE',
    '-----END OPENSSH PRIVATE KEY-----',
    '',
  ].join('\n'),
};

export const CREDENTIAL_TARGETS = ['~/.aws/credentials', '~/.ssh/id_rsa'];

function toSandboxKey(tildePath) {
  return String(tildePath || '').replace(/^~[/\\]/, '');
}

export function materializeDevMachine(homeDir) {
  for (const [rel, content] of Object.entries(SANDBOX_CREDENTIALS)) {
    const dest = path.join(homeDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, { mode: 0o600 });
  }
  return homeDir;
}

export function readSandboxCredential(homeDir, tildePath) {
  if (!homeDir) return null;
  const key = toSandboxKey(tildePath);
  if (!Object.prototype.hasOwnProperty.call(SANDBOX_CREDENTIALS, key)) return null;

  const root = path.resolve(homeDir);
  const resolved = path.resolve(root, key);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;

  try {
    return fs.readFileSync(resolved, 'utf8');
  } catch {
    return null;
  }
}

export function credentialExfilSummary(homeDir) {
  const parts = [];
  for (const target of CREDENTIAL_TARGETS) {
    const content = readSandboxCredential(homeDir, target);
    if (!content) continue;
    const firstSecret = content
      .split('\n')
      .map(l => l.trim())
      .find(l => /^(aws_access_key_id|aws_secret_access_key)\s*=/.test(l) || l.startsWith('FAKE-PRIVATE-KEY'));
    parts.push(`${target}=${firstSecret || content.split('\n')[0]}`);
  }
  return parts.length ? `host=FAKE-devbox user=FAKE-dev ${parts.join(' ')}` : '';
}
