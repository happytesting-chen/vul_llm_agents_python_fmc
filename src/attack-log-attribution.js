
import { AsyncLocalStorage } from 'node:async_hooks';

const attackLogContext = new AsyncLocalStorage();

export function recordAttackEntry(entry) {
  const ctx = attackLogContext.getStore();
  if (ctx) ctx.entry = entry;
}

export async function runWithAttribution(impl) {
  const ctx = {};
  const result = await attackLogContext.run(ctx, impl);
  return { result, entry: ctx.entry ?? null };
}

export function attributeResponse(entry, result, maxLen) {
  if (!entry || entry.response != null) return;
  const text = typeof result === 'string'
    ? result
    : (result && typeof result.content === 'string' ? result.content : null);
  if (text != null) entry.response = text.substring(0, maxLen);
}
