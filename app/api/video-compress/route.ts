import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import * as fs from 'fs';
import { createReadStream } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getCurrentUser } from '@/src/lib/firebase/server';
import { CREDIT_COSTS, spendCredits, refundCredits } from '@/src/credits';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type QualityTier = 'high' | 'balanced' | 'small';

const QUALITY_PRESETS: Record<QualityTier, { crf: number; preset: string; maxHeight: number | null; audioBitrate: string }> = {
  high:     { crf: 18, preset: 'slow',   maxHeight: null, audioBitrate: '192k' },
  balanced: { crf: 23, preset: 'medium', maxHeight: 1080, audioBitrate: '128k' },
  small:    { crf: 28, preset: 'fast',   maxHeight: 720,  audioBitrate: '96k'  },
};

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.split('\n').filter(Boolean).at(-1) ?? `ffmpeg exited with code ${code}`));
    });
    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') reject(new Error('ffmpeg is not installed. Run: apt install ffmpeg'));
      else reject(err);
    });
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const cost = CREDIT_COSTS.video_compress;
  const spent = await spendCredits(cost, 'video_compress', 'Video compression');
  if (!spent.ok) {
    return new Response(
      JSON.stringify({ error: 'Insufficient credits', required: cost, balance: spent.balance }),
      { status: 402, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let tmpDir = '';

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const quality = (formData.get('quality') as string) as QualityTier;

    if (!file || !file.type.startsWith('video/')) {
      await refundCredits(user.uid, cost, 'Video compress — invalid file refund');
      return new Response('No video file provided', { status: 400 });
    }

    const preset = QUALITY_PRESETS[quality] ?? QUALITY_PRESETS.balanced;

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-compress-'));
    const inputExt = path.extname(file.name) || '.mp4';
    const inputPath = path.join(tmpDir, `input${inputExt}`);
    const outputPath = path.join(tmpDir, 'output.mp4');
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(inputPath, inputBuffer);

    const args = ['-i', inputPath, '-c:v', 'libx264', '-crf', String(preset.crf), '-preset', preset.preset];
    if (preset.maxHeight) {
      args.push('-vf', `scale=-2:min(ih\\,${preset.maxHeight})`);
    }
    args.push('-c:a', 'aac', '-b:a', preset.audioBitrate, '-movflags', '+faststart', '-y', outputPath);

    await runFfmpeg(args);

    const outStat = fs.statSync(outputPath);
    const originalName = file.name.replace(/\.[^.]+$/, '');
    const filename = `${originalName}-compressed.mp4`;

    const cleanup = () => fs.rmSync(tmpDir, { recursive: true, force: true });

    const nodeStream = createReadStream(outputPath);
    const readable = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk) => controller.enqueue(chunk as Buffer));
        nodeStream.on('end', () => { controller.close(); cleanup(); });
        nodeStream.on('error', (err) => { controller.error(err); cleanup(); });
      },
      cancel() {
        nodeStream.destroy();
        cleanup();
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(outStat.size),
        'X-Original-Size': String(inputBuffer.length),
        'X-Compressed-Size': String(outStat.size),
      },
    });
  } catch (err) {
    console.error('Video compress error:', err);
    await refundCredits(user.uid, cost, 'Video compress — conversion error refund').catch(() => {});
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    return new Response(
      err instanceof Error ? err.message : 'Compression failed',
      { status: 500 },
    );
  }
}
