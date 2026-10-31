import { MEDIA_PLATFORMS, mediaLinkUrl, type MediaLink, type MediaProvider } from '@bar/shared';

/** What a platform says about a video before it goes into a queue. `thumb`: its cover, for the lights that follow it. */
export interface VideoInfo { title: string; thumb: string }

/** How long an answer is reused, and how many are kept. */
const CACHE_MS = 10 * 60_000, CACHE_MAX = 500;

/**
 * The other platforms with a public oEmbed. Twitch's needs a key; TikTok's answers the same for any id, with no title.
 * Those and direct links go straight to the players, whose own error skips one that does not play (failMedia).
 */
const OEMBED: Partial<Record<MediaProvider, string>> = {
  vimeo: 'https://vimeo.com/api/oembed.json',
  soundcloud: 'https://soundcloud.com/oembed',
  mixcloud: 'https://app.mixcloud.com/oembed/',
  spotify: 'https://open.spotify.com/oembed',
};

/**
 * Whether a platform lets a video play on other sites, asked before it is queued (packages/shared/src/jukebox.ts). An
 * oEmbed endpoint answers 401 or 403 for a video whose owner turned embedding off (or a private one) and 404 for one
 * that does not exist; a playable video comes back with its title, which the queue shows to everyone. Without an answer
 * (the platform unreachable, slow or limiting us) the video goes through: the players' own error then skips it. An empty
 * endpoint (YouTube's) switches every check off (tests). Only the address rebuilt from a parsed link is ever sent, and
 * to these endpoints alone: a pasted link is never fetched by the server.
 */
export class VideoCheck {
  private cache = new Map<string, { at: number; answer: VideoInfo | string }>();
  constructor(private endpoint: string, private log: (event: string, details: Record<string, unknown>) => void, private timeoutMs = 4000, private others = OEMBED) {}

  /** The video's title and cover; throws the reason when its platform does not let it play here. */
  async check(link: MediaLink): Promise<VideoInfo> {
    const endpoint = !this.endpoint ? undefined : link.provider === 'youtube' ? this.endpoint : this.others[link.provider];
    if (!endpoint) return { title: '', thumb: '' };
    const key = `${link.provider}:${link.id}`, now = Date.now(), cached = this.cache.get(key);
    let answer = cached && now - cached.at < CACHE_MS ? cached.answer : undefined;
    if (answer === undefined) {
      answer = await this.ask(endpoint, link);
      // A failed request is not remembered: the next try asks again.
      if (answer !== undefined) {
        if (this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, { at: now, answer });
      }
    }
    if (typeof answer === 'string') throw new Error(answer);
    return answer ?? { title: '', thumb: '' };
  }

  /** Undefined when the platform gave no usable answer. */
  private async ask(endpoint: string, link: MediaLink): Promise<VideoInfo | string | undefined> {
    const url = new URL(endpoint), named = MEDIA_PLATFORMS[link.provider].named, details = { provider: link.provider, videoId: link.id };
    url.searchParams.set('format', 'json'); url.searchParams.set('url', mediaLinkUrl(link.provider, link.id));
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs), headers: { accept: 'application/json' } });
      if (response.status === 401 || response.status === 403) return `${named} não deixa este vídeo tocar fora do site dele (o autor bloqueou ou o vídeo é privado). Escolha outro.`;
      if (response.status === 400 || response.status === 404) return 'Vídeo removido, privado ou inexistente. Confira o link.';
      if (!response.ok) { this.log('media_check_unavailable', { ...details, status: response.status }); return undefined; }
      const body = await response.json() as { title?: unknown; thumbnail_url?: unknown };
      return { title: typeof body.title === 'string' ? plainTitle(body.title) : '', thumb: cover(body.thumbnail_url) };
    } catch (error) {
      this.log('media_check_unavailable', { ...details, error: error instanceof Error ? error.name : 'unknown' });
      return undefined;
    }
  }
}

/** One line of plain text: everyone's panel shows it as text, never as markup. */
export function plainTitle(title: string): string {
  return title.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** A cover every browser may load: https only, and short enough for the shared state. */
function cover(thumbnail: unknown): string {
  if (typeof thumbnail !== 'string' || thumbnail.length > 500) return '';
  try { return new URL(thumbnail).protocol === 'https:' ? thumbnail : ''; } catch { return ''; }
}
