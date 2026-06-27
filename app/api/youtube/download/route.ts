import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { createReadStream } from 'fs';
import { readdir, unlink, stat } from 'fs/promises';
import { createClient } from '@/src/lib/supabase/server';
import { CREDIT_COSTS, spendCredits } from '@/src/credits';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function sanitizeFilename(name: string) {
  return name.replace(/[^\w\s\-().]/g, '').trim().slice(0, 100);
}

function runYtDlp(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args);
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.split('\n').filter(Boolean).at(-1) ?? `yt-dlp exited with code ${code}`));
    });
    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') reject(new Error('yt-dlp is not installed. Run: brew install yt-dlp'));
      else reject(err);
    });
  });
}

async function findOutputFile(dir: string, prefix: string): Promise<string | null> {
  const files = await readdir(dir);
  const match = files.find(f => f.startsWith(prefix));
  return match ? join(dir, match) : null;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const url = req.nextUrl.searchParams.get('url') ?? '';
  const format = req.nextUrl.searchParams.get('format') ?? 'mp4';

  if (!url) return new Response('Missing URL', { status: 400 });

  const cost = CREDIT_COSTS.youtube_dl;
  const spent = await spendCredits(cost, 'youtube_dl', `Download ${format.toUpperCase()}: ${url.slice(0, 80)}`);
  if (!spent.ok) {
    return new Response(
      JSON.stringify({ error: 'Insufficient credits', required: cost, balance: spent.balance }),
      { status: 402, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const prefix = `yt-${Date.now()}`;
  const outputTemplate = join(tmpdir(), `${prefix}.%(ext)s`);

  const formatArgs = format === 'mp3'
    ? ['-x', '--audio-format', 'mp3', '--audio-quality', '192K']
    : ['-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best', '--merge-output-format', 'mp4'];

  try {
    // Get title before download
    const titleProc = await new Promise<string>((resolve, reject) => {
      const p = spawn('yt-dlp', ['--get-title', '--no-playlist', url]);
      let out = '';
      let err = '';
      p.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      p.stderr.on('data', (d: Buffer) => { err += d.toString(); });
      p.on('close', (code) => code === 0 ? resolve(out.trim()) : reject(new Error(err)));
      p.on('error', reject);
    });
    const title = sanitizeFilename(titleProc) || 'video';

    await runYtDlp([
      ...formatArgs,
      '--no-playlist',
      '-o', outputTemplate,
      url,
    ]);

    const filePath = await findOutputFile(tmpdir(), prefix);
    if (!filePath) throw new Error('Output file not found after download');

    const fileStat = await stat(filePath);
    const mimeType = format === 'mp3' ? 'audio/mpeg' : 'video/mp4';
    const fileExt = format === 'mp3' ? 'mp3' : 'mp4';

    const nodeStream = createReadStream(filePath);
    const readable = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk) => controller.enqueue(chunk as Buffer));
        nodeStream.on('end', () => {
          controller.close();
          unlink(filePath).catch(() => {});
        });
        nodeStream.on('error', (err) => {
          controller.error(err);
          unlink(filePath).catch(() => {});
        });
      },
      cancel() {
        nodeStream.destroy();
        unlink(filePath).catch(() => {});
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${title}.${fileExt}"`,
        'Content-Length': String(fileStat.size),
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
