import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { parseMediaLink, type MediaLink } from '@bar/shared';
import { VideoCheck } from '../src/world/media-check.js';

const link = (url: string) => parseMediaLink(url) as MediaLink;

/** An oEmbed double: the status and body each asked-about address gets, and what it was asked. */
async function oembed(answers: Record<string, { status?: number; body?: unknown; raw?: string }>): Promise<{ server: Server; url: string; asked: string[] }> {
  const asked: string[] = [];
  const server = createServer((request, response) => {
    const target = new URL(request.url!, 'http://x').searchParams.get('url') ?? '';
    asked.push(target);
    const answer = answers[target] ?? { status: 404 };
    response.writeHead(answer.status ?? 200, { 'content-type': 'application/json' });
    response.end(answer.raw ?? JSON.stringify(answer.body ?? {}));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}/oembed`, asked };
}

test('each platform is asked at its own endpoint, about its own address, and gives a title and a cover', async () => {
  const double = await oembed({
    'https://soundcloud.com/forss/flickermood': { body: { title: 'Flicker\nmood  by <b>Forss</b>', thumbnail_url: 'https://i1.sndcdn.com/a.jpg' } },
    'https://vimeo.com/1084537/abc': { body: { title: 'Big Buck Bunny', thumbnail_url: 'http://insecure.example.com/a.jpg' } },
    'https://www.youtube.com/watch?v=aqz-KE-bpKQ': { body: { title: 'Do YouTube', thumbnail_url: 42 } },
  });
  try {
    const check = new VideoCheck(double.url, () => {}, 2000, { soundcloud: double.url, vimeo: double.url });
    // The pasted form never reaches it: the address is rebuilt from what was parsed.
    assert.deepEqual(await check.check(link('https://m.soundcloud.com/forss/flickermood?utm=evil')), { title: 'Flicker mood by <b>Forss</b>', thumb: 'https://i1.sndcdn.com/a.jpg' });
    assert.deepEqual(await check.check(link('https://player.vimeo.com/video/1084537?h=abc')), { title: 'Big Buck Bunny', thumb: '' }, 'a cover that is not https is dropped');
    assert.deepEqual(await check.check(link('https://youtu.be/aqz-KE-bpKQ')), { title: 'Do YouTube', thumb: '' });
    assert.deepEqual(double.asked, ['https://soundcloud.com/forss/flickermood', 'https://vimeo.com/1084537/abc', 'https://www.youtube.com/watch?v=aqz-KE-bpKQ']);
  } finally { double.server.close(); }
});

test('a refusal names the platform and is remembered; an unusable answer lets the video through', async () => {
  const double = await oembed({
    'https://vimeo.com/1': { status: 403 },
    'https://open.spotify.com/track/00000000000000000000aa': { status: 404 },
    'https://www.mixcloud.com/a/b/': { status: 500 },
    'https://soundcloud.com/a/b': { raw: 'Invalid video URL.' },
  });
  const logged: unknown[] = [];
  try {
    const check = new VideoCheck(double.url, (_, details) => logged.push(details), 2000, { vimeo: double.url, spotify: double.url, mixcloud: double.url, soundcloud: double.url });
    await assert.rejects(check.check(link('https://vimeo.com/1')), /O Vimeo não deixa/);
    await assert.rejects(check.check(link('https://vimeo.com/1')), /O Vimeo não deixa/);
    assert.equal(double.asked.filter(url => url === 'https://vimeo.com/1').length, 1, 'answered from memory');
    await assert.rejects(check.check(link('https://open.spotify.com/track/00000000000000000000aa')), /inexistente/);
    assert.deepEqual(await check.check(link('https://www.mixcloud.com/a/b/')), { title: '', thumb: '' });
    assert.deepEqual(await check.check(link('https://soundcloud.com/a/b')), { title: '', thumb: '' }, 'a 200 that is not JSON');
    assert.equal(logged.length, 2);
  } finally { double.server.close(); }
});

test('no request is made for a direct link, nor for the platforms without an endpoint, nor with the check off', async () => {
  const double = await oembed({});
  try {
    const check = new VideoCheck(double.url, () => {}, 2000, {});
    for (const url of ['https://cdn.example.com/a.mp4', 'https://www.twitch.tv/gaules', 'https://www.tiktok.com/@a/video/1', 'https://soundcloud.com/a/b']) assert.deepEqual(await check.check(link(url)), { title: '', thumb: '' }, url);
    assert.deepEqual(double.asked, []);
    assert.deepEqual(await new VideoCheck('', () => {}, 2000, { soundcloud: double.url }).check(link('https://soundcloud.com/a/b')), { title: '', thumb: '' });
    assert.deepEqual(double.asked, []);
  } finally { double.server.close(); }
});
