// Orca: worktree 管理 → Codex 呼び出し
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { codexExec } from './codex.js';

const exec = promisify(execFile);
const git = async (cwd, ...args) => (await exec('git', ['-C', cwd, ...args], { maxBuffer: 10e6 })).stdout.trim();

export class Orca {
  constructor({
    repos,                                   // {name: absPath}
    root = path.join(homedir(), '.orca', 'worktrees'),
    maxParallel = 2,
    codex = codexExec,
  }) {
    Object.assign(this, { repos, root, maxParallel, codex });
    this.running = 0;
    this.queue = [];
  }

  run(id, task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ id, task, resolve, reject });
      this.#next();
    });
  }

  #next() {
    if (this.running >= this.maxParallel || !this.queue.length) return;
    const { id, task, resolve, reject } = this.queue.shift();
    this.running++;
    this.#exec(id, task).then(resolve, reject).finally(() => { this.running--; this.#next(); });
  }

  async #exec(id, { repo, prompt, base = 'HEAD', keep = false }) {
    const repoPath = this.repos[repo];
    if (!repoPath) throw new Error(`repo not allowed: ${repo}`);
    const short = id.slice(0, 8);
    const branch = `orca/${short}`;
    const wt = path.join(this.root, repo, short);
    await mkdir(path.dirname(wt), { recursive: true });

    // worktree create
    await git(repoPath, 'worktree', 'add', '-b', branch, wt, base);
    try {
      const output = await this.codex(wt, prompt);
      await git(wt, 'add', '-A');
      const changed = await git(wt, 'diff', '--cached', '--name-only');
      let diffStat = '';
      if (changed) {
        diffStat = await git(wt, 'diff', '--cached', '--stat');
        await git(wt, '-c', 'user.name=Orca', '-c', 'user.email=orca@localhost',
          'commit', '-q', '-m', `codex: ${prompt.split('\n')[0].slice(0, 72)}`);
      }
      return { output, branch: changed ? branch : null, worktree: keep ? wt : null, diffStat };
    } finally {
      if (!keep) {
        await git(repoPath, 'worktree', 'remove', '--force', wt).catch(() => {});
        // 変更なしならブランチも削除
        const ahead = await git(repoPath, 'rev-list', '--count', `${base}..${branch}`).catch(() => '0');
        if (ahead === '0') await git(repoPath, 'branch', '-D', branch).catch(() => {});
      }
    }
  }
}
