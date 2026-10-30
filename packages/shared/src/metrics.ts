/**
 * Minimal metrics for the API and the world, rendered in the Prometheus text format (no dependency, no I/O).
 * Counters only grow; gauges are read when rendered; windows keep the last N samples for p50/p95/p99.
 */
type Labels = Record<string, string>;
const key = (labels: Labels = {}) => Object.keys(labels).sort().map(name => `${name}="${labels[name]!.replace(/["\\\n]/g, '_')}"`).join(',');

export class Window {
  private samples: number[] = [];
  private next = 0;
  constructor(private size = 1200) {}
  add(value: number): void {
    if (!Number.isFinite(value)) return;
    if (this.samples.length < this.size) this.samples.push(value); else { this.samples[this.next] = value; this.next = (this.next + 1) % this.size; }
  }
  /** Nearest-rank percentile of the window; undefined while empty. */
  percentile(p: number): number | undefined {
    if (!this.samples.length) return undefined;
    const sorted = [...this.samples].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p / 100 * sorted.length) - 1))];
  }
  get count(): number { return this.samples.length; }
}

export class MetricsRegistry {
  private counters = new Map<string, { help: string; values: Map<string, number> }>();
  private gauges = new Map<string, { help: string; read: () => number | undefined }>();
  private windows = new Map<string, { help: string; window: Window }>();

  inc(name: string, help: string, labels?: Labels, amount = 1): void {
    const counter = this.counters.get(name) ?? { help, values: new Map() };
    const id = key(labels);
    counter.values.set(id, (counter.values.get(id) ?? 0) + amount);
    this.counters.set(name, counter);
  }
  counter(name: string, labels?: Labels): number { return this.counters.get(name)?.values.get(key(labels)) ?? 0; }
  /** A counter summed over its label sets; `where` sees each set as rendered (`status="5xx"`). */
  sum(name: string, where: (labels: string) => boolean = () => true): number {
    let total = 0;
    for (const [labels, value] of this.counters.get(name)?.values ?? []) if (where(labels)) total += value;
    return total;
  }
  gauge(name: string, help: string, read: () => number | undefined): void { this.gauges.set(name, { help, read }); }
  observe(name: string, help: string, value: number, size?: number): void {
    const entry = this.windows.get(name) ?? { help, window: new Window(size) };
    entry.window.add(value);
    this.windows.set(name, entry);
  }
  window(name: string): Window | undefined { return this.windows.get(name)?.window; }

  render(): string {
    const lines: string[] = [];
    for (const [name, { help, values }] of this.counters) {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} counter`);
      for (const [labels, value] of values) lines.push(`${name}${labels ? `{${labels}}` : ''} ${value}`);
    }
    for (const [name, { help, read }] of this.gauges) {
      const value = read();
      if (value === undefined || !Number.isFinite(value)) continue;
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`, `${name} ${value}`);
    }
    for (const [name, { help, window }] of this.windows) {
      if (!window.count) continue;
      lines.push(`# HELP ${name} ${help} (last ${window.count} samples)`, `# TYPE ${name} summary`);
      for (const quantile of [50, 95, 99]) lines.push(`${name}{quantile="${quantile / 100}"} ${window.percentile(quantile)}`);
      lines.push(`${name}_count ${window.count}`);
    }
    return `${lines.join('\n')}\n`;
  }
}
