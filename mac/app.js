// Grok Bot（常駐Mac上のアプリ）: クラウドへ常時接続し、タスクを Orca へ渡す
import WebSocket from 'ws';
import { send, parse, parsePairs } from '../shared/protocol.js';
import { Orca } from './orca.js';

export function startApp({
  url = process.env.CLOUD_URL,           // ws(s)://host/devices/connect
  deviceId = process.env.DEVICE_ID,
  token = process.env.DEVICE_TOKEN,
  orca = new Orca({
    repos: parsePairs(process.env.REPOS),
    root: process.env.ORCA_ROOT || undefined,
    maxParallel: Number(process.env.MAX_PARALLEL) || 2,
  }),
  log = console.log,
} = {}) {
  if (!url || !deviceId || !token) throw new Error('CLOUD_URL, DEVICE_ID, DEVICE_TOKEN are required');
  let ws, stopped = false, delay = 1000;

  const connect = () => {
    ws = new WebSocket(url);
    ws.on('open', () => send(ws, { type: 'hello', deviceId, token }));
    ws.on('message', async data => {
      const msg = parse(data);
      if (msg?.type === 'ready') { delay = 1000; return log(`connected as ${deviceId}`); }
      if (msg?.type !== 'task') return;
      log(`task ${msg.id} repo=${msg.task.repo}`);
      try {
        const r = await orca.run(msg.id, msg.task);
        send(ws, { type: 'result', id: msg.id, ok: true, ...r });
      } catch (e) {
        send(ws, { type: 'result', id: msg.id, ok: false, error: e.message });
      }
    });
    ws.on('close', (code) => {
      if (stopped) return;
      if (code === 4003) log('unauthorized: check DEVICE_ID/DEVICE_TOKEN');
      setTimeout(connect, delay);
      delay = Math.min(delay * 2, 60_000);
    });
    ws.on('error', e => log(`ws error: ${e.message}`));
  };
  connect();
  return { stop: () => { stopped = true; ws?.close(); } };
}

if (import.meta.url === `file://${process.argv[1]}`) startApp();
