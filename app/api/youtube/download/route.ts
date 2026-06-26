import { NextRequest } from 'next/server';
import ytdl from '@distube/ytdl-core';
import ffmpeg from 'fluent-ffmpeg';
import { PassThrough } from 'stream';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function sanitizeFilename(name: string) {
  return name.replace(/[^\w\s\-().]/g, '').trim().slice(0, 100);
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url') ?? '';
  const format = req.nextUrl.searchParams.get('format') ?? 'mp4'; // 'mp4' | 'mp3'
  const quality = req.nextUrl.searchParams.get('quality') ?? 'highest';

  if (!url || !ytdl.validateURL(url)) {
    return new Response('Invalid YouTube URL', { status: 400 });
  }

  try {
    const info = await ytdl.getInfo(url);
    const title = sanitizeFilename(info.videoDetails.title) || 'video';

    if (format === 'mp3') {
      // Audio only → pipe through ffmpeg → true MP3
      const audioStream = ytdl.downloadFromInfo(info, {
        filter: 'audioonly',
        quality: 'highestaudio',
      });

      const pass = new PassThrough();

      ffmpeg(audioStream)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioBitrate(192)
        .format('mp3')
        .on('error', (err) => {
          console.error('ffmpeg error:', err.message);
          pass.destroy(err);
        })
        .pipe(pass);

      const readable = new ReadableStream({
        start(controller) {
          pass.on('data', (chunk: Buffer) => controller.enqueue(chunk));
          pass.on('end', () => controller.close());
          pass.on('error', (err) => controller.error(err));
        },
        cancel() {
          pass.destroy();
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': `attachment; filename="${title}.mp3"`,
          'Transfer-Encoding': 'chunked',
        },
      });
    }

    // MP4 — combined video+audio stream
    const videoStream = ytdl.downloadFromInfo(info, {
      filter: 'videoandaudio',
      quality: quality === 'highest' ? 'highestvideo' : quality,
    });

    const readable = new ReadableStream({
      start(controller) {
        videoStream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
        videoStream.on('end', () => controller.close());
        videoStream.on('error', (err) => controller.error(err));
      },
      cancel() {
        videoStream.destroy();
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${title}.mp4"`,
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (err) {
    console.error('YouTube download error:', err);
    return new Response(
      err instanceof Error ? err.message : 'Download failed',
      { status: 500 },
    );
  }
}
