import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

export const dynamic = 'force-dynamic';

function runYtDlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.split('\n').filter(Boolean).at(-1) ?? `yt-dlp exited with code ${code}`));
    });
    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') reject(new Error('yt-dlp is not installed. Run: brew install yt-dlp'));
      else reject(err);
    });
  });
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url') ?? '';
  if (!url) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
  }

  try {
    const raw = await runYtDlp(['--dump-json', '--no-playlist', url]);
    const info = JSON.parse(raw) as {
      title: string;
      thumbnail?: string;
      duration?: number;
      uploader?: string;
      channel?: string;
      formats?: Array<{ height?: number; vcodec?: string }>;
    };

    const qualities = [
      ...new Set(
        (info.formats ?? [])
          .filter(f => f.height && f.vcodec && f.vcodec !== 'none')
          .map(f => `${f.height}p`)
      ),
    ].sort((a, b) => parseInt(b) - parseInt(a));

    return NextResponse.json({
      title: info.title,
      thumbnail: info.thumbnail ?? '',
      duration: info.duration ?? 0,
      channel: info.uploader ?? info.channel ?? '',
      qualities: qualities.length ? qualities : ['720p', '480p', '360p'],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch video info' },
      { status: 500 },
    );
  }
}
