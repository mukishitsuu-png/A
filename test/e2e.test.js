import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from '../cloud/server.js';
import { startApp } from '../mac/app.js';
import { Orca } from '../mac/orca.js';
import { codexExec } from '../mac/codex.js';

const fake = path.resolve('test/fake-codex.sh');
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8' }).trim();

test('User -> メインBot -> ローカルMac bot -> Grok Bot app -> Orca -> Codex', async () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'gb-'));
  const repo = path.join(tmp, 'repo');
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');

  const { server } = createServer({ apiToken: 'api', deviceTokens: { mac: 'sec' } });
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const app = startApp({
    url: base.replace('http', 'ws') + '/devices/connect', deviceId: 'mac', token: 'sec', log: () => {},
    orca: new Orca({ repos: { repo }, root: path.join(tmp, 'wt'),
      codex: (cwd, p) => codexExec(cwd, p, { bin: fake, extraArgs: [] }) }),
  });
  const api = (p, o = {}) => fetch(base + p, { ...o, headers: { authorization: 'Bearer api', 'content-type': 'application/json' } }).then(r => r.json());
  try {
    for (let i = 0; i < 50 && !(await api('/devices')).online.length; i++) await new Promise(r => setTimeout(r, 50));

    const job = await api('/bots/main/messages?wait=true', { method: 'POST', body: JSON.stringify({ text: 'hello', repo: 'repo' }) });
    assert.equal(job.status, 'done', job.error);
    assert.equal(job.result.output, 'done: hello');
    assert.match(job.result.branch, /^orca\//);
    assert.equal(git(repo, 'show', `${job.result.branch}:codex.txt`), 'hello');
    assert.equal(git(repo, 'worktree', 'list').split('\n').length, 1);

    const bad = await api('/bots/main/messages?wait=true', { method: 'POST', body: JSON.stringify({ text: 'x', repo: 'nope' }) });
    assert.equal(bad.status, 'error');
    assert.match(bad.error, /not allowed/);

    const r = await fetch(base + '/devices');
    assert.equal(r.status, 401);
  } finally {
    app.stop();
    server.close();
    server.closeAllConnections();
  }
});

test('unauthorized device is rejected', async () => {
  const { server, agents } = createServer({ apiToken: 'api', deviceTokens: { mac: 'sec' } });
  await new Promise(r => server.listen(0, r));
  const msgs = [];
  const app = startApp({ url: `ws://127.0.0.1:${server.address().port}/devices/connect`, deviceId: 'mac', token: 'bad', log: m => msgs.push(m), orca: {} });
  await new Promise(r => setTimeout(r, 300));
  app.stop(); server.close(); server.closeAllConnections();
  assert.deepEqual(agents['local-mac'].online(), []);
  assert.ok(msgs.some(m => m.includes('unauthorized')));
});
