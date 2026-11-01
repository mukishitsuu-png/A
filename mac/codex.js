// Codex: worktree 内で `codex exec` を実行
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export async function codexExec(cwd, prompt, {
  bin = process.env.CODEX_BIN || 'codex',
  extraArgs = (process.env.CODEX_ARGS ?? '--full-auto').split(' ').filter(Boolean),
  timeoutMs = Number(process.env.CODEX_TIMEOUT_MS) || 30 * 60_000,
} = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'codex-'));
  const outFile = path.join(dir, 'last.txt');
  try {
    const args = ['exec', ...extraArgs, '--cd', cwd, '--output-last-message', outFile, prompt];
    const { code, log } = await run(bin, args, cwd, timeoutMs);
    const last = await readFile(outFile, 'utf8').catch(() => '');
    if (code !== 0) throw new Error(`codex exited ${code}: ${log.slice(-2000)}`);
    return last.trim() || log.slice(-4000).trim();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function run(bin, args, cwd, timeoutMs) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    const add = d => { log = (log + d).slice(-100_000); };
    p.stdout.on('data', add);
    p.stderr.on('data', add);
    const t = setTimeout(() => p.kill('SIGTERM'), timeoutMs);
    p.on('error', e => { clearTimeout(t); reject(e); });
    p.on('close', code => { clearTimeout(t); resolve({ code, log }); });
  });
}
