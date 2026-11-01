// Grok Bot クラウド: HTTP API (ユーザー) + WebSocket (常駐Mac)
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { parsePairs, safeEqual } from '../shared/protocol.js';
import { LocalMacAgent } from './localMacAgent.js';
import { createBots } from './bots.js';

export function createServer({
  apiToken = process.env.API_TOKEN,
  deviceTokens = parsePairs(process.env.DEVICE_TOKENS),
  taskTimeoutMs = Number(process.env.TASK_TIMEOUT_MS) || undefined,
} = {}) {
  if (!apiToken) throw new Error('API_TOKEN is required');
  const agents = { 'local-mac': new LocalMacAgent({ deviceTokens, taskTimeoutMs }) };
  const sendToAgent = (name, payload) => {
    const a = agents[name];
    return a ? a.handle(payload) : Promise.reject(new Error(`unknown agent: ${name}`));
  };
  const bots = createBots(sendToAgent);
  const jobs = new Map();

  const json = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };
  const readBody = req => new Promise((ok, ng) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 1e6) req.destroy(); });
    req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { ng(e); } });
    req.on('error', ng);
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/health') return json(res, 200, { ok: true });
    if (!safeEqual(req.headers.authorization, `Bearer ${apiToken}`)) return json(res, 401, { error: 'unauthorized' });

    let m;
    if (req.method === 'GET' && url.pathname === '/devices') {
      return json(res, 200, { online: agents['local-mac'].online() });
    }
    if (req.method === 'GET' && (m = url.pathname.match(/^\/jobs\/([\w-]+)$/))) {
      const job = jobs.get(m[1]);
      return job ? json(res, 200, view(job)) : json(res, 404, { error: 'not found' });
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/bots\/(\w+)\/messages$/))) {
      const bot = bots[m[1]];
      if (!bot) return json(res, 404, { error: `unknown bot: ${m[1]}` });
      let body;
      try { body = await readBody(req); } catch { return json(res, 400, { error: 'invalid json' }); }
      const job = { id: randomUUID(), bot: m[1], status: 'running', createdAt: new Date().toISOString() };
      jobs.set(job.id, job);
      job.done = bot(body).then(
        r => Object.assign(job, { status: 'done', result: r }),
        e => Object.assign(job, { status: 'error', error: e.message }),
      );
      if (url.searchParams.get('wait') === 'true') await job.done;
      return json(res, job.status === 'running' ? 202 : 200, view(job));
    }
    json(res, 404, { error: 'not found' });
  });

  const wss = new WebSocketServer({ server, path: '/devices/connect' });
  wss.on('connection', ws => agents['local-mac'].attach(ws));
  const ping = setInterval(() => wss.clients.forEach(ws => ws.ping()), 30_000);
  server.on('close', () => { clearInterval(ping); wss.close(); });

  return { server, agents, jobs };
}

const view = ({ done, ...j }) => j;

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 8787;
  createServer().server.listen(port, () => console.log(`grok-bot cloud :${port}`));
}
