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

type QualityTier = 'high' | 'balanced' | 'small' | 'custom';

const QUALITY_PRESETS: Record<Exclude<QualityTier, 'custom'>, { crf: number; preset: string; maxHeight: number | null; audioBitrate: string }> = {
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

function probeDurationSeconds(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', inputPath,
    ]);
    let out = '';
    proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    proc.on('close', () => {
      const secs = parseFloat(out.trim());
      if (Number.isFinite(secs) && secs > 0) resolve(secs);
      else reject(new Error('Could not read video duration'));
    });
    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') reject(new Error('ffprobe is not installed. Run: apt install ffmpeg'));
      else reject(err);
    });
  });
}

const MIN_TARGET_MB = 0.5;

/** Work out video/audio bitrates (bits per second) and a sensible max height to land near targetBytes. */
function planForTargetSize(targetBytes: number, durationSec: number) {
  const totalBitrate = (targetBytes * 8 * 0.94) / durationSec; // ~6% headroom for container overhead
  const audioBitrate = totalBitrate > 400_000 ? 96_000 : 48_000;
  const videoBitrate = Math.max(Math.floor(totalBitrate - audioBitrate), 50_000);

  // Lower bitrates look better at lower resolution
  const maxHeight =
    videoBitrate < 300_000 ? 360
    : videoBitrate < 700_000 ? 480
    : videoBitrate < 1_500_000 ? 720
    : videoBitrate < 3_500_000 ? 1080
    : null;

  return { videoBitrate, audioBitrate, maxHeight };
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
    const qualityRaw = formData.get('quality') as string;
    const isCustom = qualityRaw === 'custom';
    const quality = qualityRaw as QualityTier;
    const targetMb = Number(formData.get('targetMb'));

    if (!file || !file.type.startsWith('video/')) {
      await refundCredits(user.uid, cost, 'Video compress — invalid file refund');
      return new Response('No video file provided', { status: 400 });
    }

    if (isCustom) {
      if (!Number.isFinite(targetMb) || targetMb < MIN_TARGET_MB) {
        await refundCredits(user.uid, cost, 'Video compress — invalid target refund');
        return new Response(`Target size must be at least ${MIN_TARGET_MB} MB.`, { status: 400 });
      }
      if (targetMb * 1024 * 1024 >= file.size) {
        await refundCredits(user.uid, cost, 'Video compress — target too large refund');
        return new Response('Target size must be smaller than the original file.', { status: 400 });
      }
    }

    const preset = (!isCustom && quality in QUALITY_PRESETS)
      ? QUALITY_PRESETS[quality as Exclude<QualityTier, 'custom'>]
      : QUALITY_PRESETS.balanced;

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-compress-'));
    const inputExt = path.extname(file.name) || '.mp4';
    const inputPath = path.join(tmpDir, `input${inputExt}`);
    const outputPath = path.join(tmpDir, 'output.mp4');
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(inputPath, inputBuffer);

    if (isCustom) {
      const duration = await probeDurationSeconds(inputPath);
      const plan = planForTargetSize(Math.floor(targetMb * 1024 * 1024), duration);
      const vf = plan.maxHeight ? ['-vf', `scale=-2:min(ih\\,${plan.maxHeight})`] : [];
      const passLog = path.join(tmpDir, 'ffpass');
      const common = ['-c:v', 'libx264', '-b:v', String(plan.videoBitrate), '-preset', 'fast', ...vf];

      // Two-pass encode lands much closer to the requested size than a single pass
      await runFfmpeg(['-y', '-i', inputPath, ...common, '-pass', '1', '-passlogfile', passLog, '-an', '-f', 'null', '/dev/null']);
      await runFfmpeg([
        '-y', '-i', inputPath, ...common, '-pass', '2', '-passlogfile', passLog,
        '-c:a', 'aac', '-b:a', String(plan.audioBitrate), '-movflags', '+faststart', outputPath,
      ]);
    } else {
      const args = ['-i', inputPath, '-c:v', 'libx264', '-crf', String(preset.crf), '-preset', preset.preset];
      if (preset.maxHeight) {
        args.push('-vf', `scale=-2:min(ih\\,${preset.maxHeight})`);
      }
      args.push('-c:a', 'aac', '-b:a', preset.audioBitrate, '-movflags', '+faststart', '-y', outputPath);

      await runFfmpeg(args);
    }

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
