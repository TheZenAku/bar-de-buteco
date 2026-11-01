import { achievementSeries, type AchievementEvent } from '@bar/shared';

/** What is less than this from a whole number is that number: portions of a beer add up to 0.9999999. */
const ROUNDING = 1e-6;
const SEPARATOR = '\n';

/**
 * What players did since the last report to the API (docs/sistemas/conquistas.md). Parts add up here (a sip, a metre) and
 * only whole numbers go out, so a report is small however busy the bar is. It is not money: a crash loses what was not
 * reported, at most a few seconds' worth.
 */
export class AchievementTracker {
  private readonly owed = new Map<string, number>();
  private readonly lastCounted = new Map<string, number>();

  add(userId: string, seriesId: string, amount = 1, now = Date.now()): void {
    const series = achievementSeries(seriesId), key = `${userId}${SEPARATOR}${seriesId}`;
    if (!series || !(amount > 0)) return;
    if (series.everyMs) {
      if (now - (this.lastCounted.get(key) ?? -Infinity) < series.everyMs) return;
      this.lastCounted.set(key, now);
    }
    this.owed.set(key, (this.owed.get(key) ?? 0) + amount);
  }

  /** The whole numbers owed; the fractions stay here. */
  take(): AchievementEvent[] {
    const events: AchievementEvent[] = [];
    for (const [key, value] of this.owed) {
      const amount = Math.floor(value + ROUNDING), left = value - amount;
      if (left > ROUNDING) this.owed.set(key, left); else this.owed.delete(key);
      if (amount < 1) continue;
      const [userId, series] = key.split(SEPARATOR) as [string, string];
      events.push({ userId, series, amount });
    }
    return events;
  }

  /** A report the API did not take goes out again with the next one. */
  giveBack(events: readonly AchievementEvent[]): void {
    for (const { userId, series, amount } of events) {
      const key = `${userId}${SEPARATOR}${series}`;
      this.owed.set(key, (this.owed.get(key) ?? 0) + amount);
    }
  }
}
