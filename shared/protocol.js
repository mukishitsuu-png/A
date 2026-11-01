// cloud <-> 常駐Mac WebSocket protocol
// device -> cloud : {type:'hello', deviceId, token}
// cloud  -> device: {type:'ready'} | {type:'task', id, task:{repo, prompt, base?, keep?}}
// device -> cloud : {type:'result', id, ok, output?, branch?, worktree?, diffStat?, error?}
import { timingSafeEqual } from 'node:crypto';

export const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));

export function parse(data) {
  try { return JSON.parse(String(data)); } catch { return null; }
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
}

// "a:x,b:y" -> {a:'x', b:'y'}
export function parsePairs(s = '') {
  return Object.fromEntries(
    s.split(',').map(p => p.trim()).filter(Boolean).map(p => {
      const i = p.indexOf(':');
      return [p.slice(0, i), p.slice(i + 1)];
    }),
  );
}
