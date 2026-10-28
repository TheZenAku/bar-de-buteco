import { fork, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** What the bots process reports every 3 s (status() in tests/load/bots.ts). */
export interface BotsStatus {
  target: number; inBar: number; walking: number; doing: Array<[string, number]>;
  rttP50?: number; rttP95?: number; inputs?: number; routes?: number; planP95?: number; unreached?: number; loopP95?: number; refusals?: Array<[string, number]>;
}
export interface BotRunnerOptions {
  apiUrl: string; worldUrl: string;
  log: (event: string, details: Record<string, unknown>) => void;
  /** All the bots asked for are in (or out), or the process ended: the administrator's panel can show it. */
  settled: () => void;
}

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const script = join(root, 'tests/load/bots.ts');

/**
 * The development bots (tests/load/bots.ts) started from the in-game administration. They run in a child process of
 * their own, so their load never counts as the world's; messages change how many there are or stop them, and the child
 * leaves with the world (a restart closes its channel). Not in production: no script there, no API route for the accounts.
 */
export class BotRunner {
  private child?: ChildProcess;
  private status?: BotsStatus;
  private target = 0;
  /** A stop was sent and the process has not exited yet: a new number waits for it. */
  private stopping = false;
  constructor(private readonly options: BotRunnerOptions) {}

  get available(): boolean { return process.env.NODE_ENV !== 'production' && existsSync(script); }

  /** How many bots the bar should have; 0 takes them all out. */
  set(count: number): void {
    if (!this.available) throw new Error('Os bots de teste só existem no ambiente de desenvolvimento.');
    this.target = count;
    if (!this.child) { if (count) this.start(count); return; }
    if (this.stopping) return;
    if (!count) this.stop();
    else this.send({ type: 'count', count });
  }
  stop(): void { if (this.child && !this.stopping) { this.stopping = true; this.send({ type: 'stop' }); } }

  snapshot(): { available: boolean; running: boolean; target: number; status?: BotsStatus } {
    return { available: this.available, running: !!this.child, target: this.target, status: this.status };
  }

  private send(message: object): void {
    try { this.child?.send(message); } catch (error) { this.options.log('bots_unreachable', { error: error instanceof Error ? error.message : String(error) }); }
  }
  private start(count: number): void {
    const child = fork(script, [String(count)], {
      cwd: root, execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      env: { ...process.env, API_INTERNAL_URL: this.options.apiUrl, BOTS_WORLD_URL: this.options.worldUrl, TSX_TSCONFIG_PATH: join(root, 'tsconfig.base.json') },
    });
    this.child = child; this.status = undefined; this.stopping = false;
    child.on('message', message => {
      const update = message as { type?: string; status?: BotsStatus };
      if (update?.type !== 'status' || !update.status) return;
      const joining = this.status?.inBar !== this.target;
      this.status = update.status;
      if (joining && this.status.inBar === this.target) this.options.settled();
    });
    // Its warnings (an API out of reach, a full bar) go to the world's log.
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (text: string) => { for (const line of text.split(/\r?\n/)) if (line.trim()) this.options.log('bots_output', { line: line.slice(0, 300) }); });
    child.on('exit', code => {
      this.options.log('bots_exit', { code });
      if (this.child !== child) return;
      // Asked for again while the previous run was leaving: it starts now.
      const again = this.stopping ? this.target : 0;
      this.child = undefined; this.status = undefined; this.stopping = false; this.target = 0;
      if (again) this.set(again); else this.options.settled();
    });
    this.options.log('bots_start', { count });
  }
}
