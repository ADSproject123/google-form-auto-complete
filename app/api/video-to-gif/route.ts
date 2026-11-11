import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { getCurrentUser } from '@/src/lib/firebase/server';
import { CREDIT_COSTS, spendCredits, refundCredits } from '@/src/credits';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB
const MAX_GIF_SECONDS = 30;               // GIFs grow very fast; keep clips short
const MIN_GIF_SECONDS = 0.5;
const MAX_START_SECONDS = 24 * 60 * 60;
const MAX_FPS = 30;
const MAX_WIDTH = 1280;                   // never upscale / never exceed this

type GifQuality = 'high' | 'balanced' | 'small';

// Each preset trades colour fidelity against file size.
const QUALITY_PRESETS: Record<GifQuality, { maxColors: number; dither: string }> = {
  high:     { maxColors: 256, dither: 'sierra2_4a' },
  balanced: { maxColors: 192, dither: 'bayer:bayer_scale=5' },
  small:    { maxColors: 96,  dither: 'bayer:bayer_scale=3' },
};

function getFfmpegPath(): string {
  if (ffmpegInstaller.path && fs.existsSync(ffmpegInstaller.path)) {
    return ffmpegInstaller.path;
  }
  return 'ffmpeg';
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), args);
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else {
        const lastLines = stderr.split('\n').filter(Boolean).slice(-3).join('; ');
        reject(new Error(lastLines || `ffmpeg exited with code ${code}`));
      }
    });
    proc.on('error', (err: NodeJS.ErrnoException) => {
      reject(new Error(`Failed to start ffmpeg: ${err.message}`));
    });
  });
}

/** Parse a form value as a finite number clamped to [min, max]; falls back to `fallback`. */
function parseNumber(raw: FormDataEntryValue | null, fallback: number, min: number, max: number): number {
  if (typeof raw !== 'string' || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function jsonError(error: string, status: number, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError('Unauthorized', 401);

  const cost = CREDIT_COSTS.video_to_gif;
  const spent = await spendCredits(cost, 'video_to_gif', 'Video to GIF conversion');
  if (!spent.ok) {
    return jsonError('Insufficient credits', 402, { required: cost, balance: spent.balance });
  }

  let tmpDir = '';

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      await refundCredits(user.uid, cost, 'Video to GIF — missing file refund');
      return jsonError('No video file provided', 400);
    }

    if (file.size > MAX_FILE_BYTES) {
      await refundCredits(user.uid, cost, 'Video to GIF — file too large refund');
      return jsonError('File exceeds 500 MB limit', 400);
    }

    // All numeric options are clamped, and the quality is looked up in a fixed table,
    // so nothing user-controlled is ever interpolated into the ffmpeg filter unchecked.
    const startTime = parseNumber(formData.get('startTime'), 0, 0, MAX_START_SECONDS);
    const duration = parseNumber(formData.get('duration'), 5, MIN_GIF_SECONDS, MAX_GIF_SECONDS);
    const fps = Math.round(parseNumber(formData.get('fps'), 15, 1, MAX_FPS));
    const widthRaw = (formData.get('width') as string | null) ?? '480';
    const width =
      widthRaw === 'original'
        ? MAX_WIDTH
        : Math.round(parseNumber(widthRaw, 480, 16, MAX_WIDTH));
    const qualityRaw = ((formData.get('quality') as string | null) ?? 'balanced') as GifQuality;
    const preset = QUALITY_PRESETS[qualityRaw];
    if (!preset) {
      await refundCredits(user.uid, cost, 'Video to GIF — invalid quality refund');
      return jsonError(`Unsupported quality: ${qualityRaw}`, 400);
    }
    // loop: 'infinite' (default) or 'once'
    const loopOnce = formData.get('loop') === 'once';

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vid-gif-'));
    const safeBase = path.basename(file.name || 'input').replace(/[^a-zA-Z0-9._-]/g, '_');
    const inputPath = path.join(tmpDir, safeBase);
    const outputPath = path.join(tmpDir, `output_${Date.now()}.gif`);

    fs.writeFileSync(inputPath, Buffer.from(await file.arrayBuffer()));

    // Two-pass palette GIF in a single filtergraph: generate an optimal palette from the
    // clip, then map frames onto it. Far better colours than ffmpeg's default GIF palette.
    // min(W,iw) means we only ever downscale. Input/output pads are labelled explicitly
    // because newer ffmpeg (7+) refuses an unlabelled input once the stream is -map'd.
    const filterGraph =
      `[0:v:0]fps=${fps},scale='min(${width},iw)':-1:flags=lanczos,split[s0][s1]` +
      `;[s0]palettegen=max_colors=${preset.maxColors}:stats_mode=diff[p]` +
      `;[s1][p]paletteuse=dither=${preset.dither}:diff_mode=rectangle[out]`;

    const ffmpegArgs = [
      '-y',
      '-ss', String(startTime), // before -i: fast seek
      '-t', String(duration),
      '-i', inputPath,
      '-filter_complex', filterGraph,
      '-map', '[out]',
      '-loop', loopOnce ? '-1' : '0', // 0 = loop forever, -1 = play once
      '-f', 'gif',
      outputPath,
    ];

    try {
      await runFfmpeg(ffmpegArgs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('matches no streams')) {
        throw new Error('This file has no video stream to convert to a GIF.');
      }
      throw err;
    }

    // Some ffmpeg builds exit 0 but leave an empty / 1-byte file when the start time is
    // past the end of the video, so check for a real GIF header rather than just size.
    const gifBuffer = fs.existsSync(outputPath) ? fs.readFileSync(outputPath) : Buffer.alloc(0);
    if (gifBuffer.length < 6 || gifBuffer.subarray(0, 3).toString('ascii') !== 'GIF') {
      throw new Error(
        'No frames were produced. Check that the file is a valid video and that the start time is within its length.'
      );
    }

    const originalStem = path.basename(file.name || 'video', path.extname(file.name || 'video'));
    const downloadFilename = `${originalStem}.gif`;

    return new Response(gifBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Content-Disposition': `attachment; filename="${downloadFilename}"`,
        'X-Original-Size': String(file.size),
        'X-Converted-Size': String(gifBuffer.length),
        'X-Output-Format': 'GIF',
      },
    });
  } catch (err: unknown) {
    await refundCredits(user.uid, cost, 'Video to GIF failed refund');
    const message = err instanceof Error ? err.message : 'GIF conversion failed';
    return jsonError(message, 500);
  } finally {
    if (tmpDir && fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
  }
}
