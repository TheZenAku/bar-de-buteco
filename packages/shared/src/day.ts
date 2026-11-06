// The bar's day is Brasília's (UTC-3, no daylight saving since 2019), whatever the server's clock says: daily bonus, job and Pix caps, stats.
const OFFSET = 3 * 3_600_000, DAY = 86_400_000;
export const startOfBarDay = (now = new Date()): Date => new Date(Math.floor((now.getTime() - OFFSET) / DAY) * DAY + OFFSET);
export const barDayKey = (now = new Date()): string => new Date(now.getTime() - OFFSET).toISOString().slice(0, 10);
