// ローカルMac bot: 常駐Mac専用エージェント（クラウド側）
import { randomUUID } from 'node:crypto';
import { send, parse, safeEqual } from '../shared/protocol.js';

export class LocalMacAgent {
  constructor({ deviceTokens, taskTimeoutMs = 60 * 60_000 }) {
    this.deviceTokens = deviceTokens; // {deviceId: token}
    this.taskTimeoutMs = taskTimeoutMs;
    this.devices = new Map();          // deviceId -> ws
    this.pending = new Map();          // taskId -> {resolve, reject, deviceId, timer}
  }

  // 登録端末接続
  attach(ws) {
    let deviceId = null;
    const authTimer = setTimeout(() => ws.close(4001, 'auth timeout'), 10_000);
    ws.on('message', data => {
      const msg = parse(data);
      if (!msg) return;
      if (!deviceId) {
        if (msg.type !== 'hello' || !safeEqual(this.deviceTokens[msg.deviceId], msg.token)) {
          return ws.close(4003, 'unauthorized');
        }
        clearTimeout(authTimer);
        deviceId = msg.deviceId;
        this.devices.get(deviceId)?.close(4000, 'replaced');
        this.devices.set(deviceId, ws);
        return send(ws, { type: 'ready' });
      }
      if (msg.type === 'result') this.#settle(msg.id, msg);
    });
    ws.on('close', () => {
      clearTimeout(authTimer);
      if (!deviceId || this.devices.get(deviceId) !== ws) return;
      this.devices.delete(deviceId);
      for (const [id, p] of this.pending) {
        if (p.deviceId === deviceId) this.#settle(id, { ok: false, error: 'device disconnected' });
      }
    });
  }

  online() { return [...this.devices.keys()]; }

  // SendToAgent の受け口
  handle({ repo, prompt, base, keep, device }) {
    if (!repo || !prompt) return Promise.reject(new Error('repo and prompt are required'));
    const deviceId = device ?? this.online()[0];
    const ws = deviceId && this.devices.get(deviceId);
    if (!ws) return Promise.reject(new Error(`device offline: ${deviceId ?? '(none)'}`));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.#settle(id, { ok: false, error: 'task timeout' }), this.taskTimeoutMs);
      this.pending.set(id, { resolve, reject, deviceId, timer });
      send(ws, { type: 'task', id, task: { repo, prompt, base, keep } });
    });
  }

  #settle(id, msg) {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    clearTimeout(p.timer);
    const { type, id: _, ...rest } = msg;
    msg.ok ? p.resolve({ device: p.deviceId, ...rest }) : p.reject(new Error(msg.error || 'task failed'));
  }
}
