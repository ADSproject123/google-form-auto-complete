import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getCurrentUser } from '@/src/lib/firebase/server';
import { CREDIT_COSTS, spendCredits, refundCredits } from '@/src/credits';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB

function getFfmpegPath(): string {
  return 'ffmpeg';
}

type VideoFormatKey =
  | 'avi'
  | 'mov'
  | 'webm'
  | 'mpeg'
  | 'wmv'
  | 'mpg'
  | 'ogv'
  | 'mkv'
  | '3gp'
  | 'hevc'
  | 'mpeg-2'
  | 'm4v'
  | 'mjpeg'
  | 'divx'
  | 'flv'
  | 'av1'
  | 'swf'
  | 'avchd'
  | 'vob'
  | 'ts'
  | 'xvid'
  | 'mxf'
  | 'rm'
  | 'mts'
  | 'f4v'
  | 'asf'
  | 'rmvb'
  | 'wtv'
  | '3g2'
  | 'm2v'
  | 'm2ts'
  | 'mp4';

interface FormatConfig {
  ext: string;
  mime: string;
  getArgs: () => string[];
}

const VIDEO_FORMAT_CONFIGS: Record<VideoFormatKey, FormatConfig> = {
  avi: {
    ext: 'avi',
    mime: 'video/x-msvideo',
    getArgs: () => ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'mp3'],
  },
  mov: {
    ext: 'mov',
    mime: 'video/quicktime',
    getArgs: () => ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac'],
  },
  webm: {
    ext: 'webm',
    mime: 'video/webm',
    getArgs: () => ['-c:v', 'libvpx-vp9', '-c:a', 'libopus'],
  },
  mpeg: {
    ext: 'mpeg',
    mime: 'video/mpeg',
    getArgs: () => ['-c:v', 'mpeg2video', '-c:a', 'mp2'],
  },
  wmv: {
    ext: 'wmv',
    mime: 'video/x-ms-wmv',
    getArgs: () => ['-c:v', 'wmv2', '-c:a', 'wmav2'],
  },
  mpg: {
    ext: 'mpg',
    mime: 'video/mpeg',
    getArgs: () => ['-c:v', 'mpeg2video', '-c:a', 'mp2'],
  },
  ogv: {
    ext: 'ogv',
    mime: 'video/ogg',
    getArgs: () => ['-c:v', 'libtheora', '-c:a', 'libvorbis'],
  },
  mkv: {
    ext: 'mkv',
    mime: 'video/x-matroska',
    getArgs: () => ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac'],
  },
  '3gp': {
    ext: '3gp',
    mime: 'video/3gpp',
    getArgs: () => ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '32000'],
  },
  hevc: {
    ext: 'mp4',
    mime: 'video/mp4',
    getArgs: () => ['-c:v', 'libx265', '-pix_fmt', 'yuv420p', '-c:a', 'aac'],
  },
  'mpeg-2': {
    ext: 'mpg',
    mime: 'video/mpeg',
    getArgs: () => ['-c:v', 'mpeg2video', '-c:a', 'mp2'],
  },
  m4v: {
    ext: 'm4v',
    mime: 'video/x-m4v',
    getArgs: () => ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac'],
  },
  mjpeg: {
    ext: 'mjpeg',
    mime: 'video/x-motion-jpeg',
    getArgs: () => ['-c:v', 'mjpeg', '-q:v', '3', '-an'],
  },
  divx: {
    ext: 'avi',
    mime: 'video/x-msvideo',
    getArgs: () => ['-c:v', 'mpeg4', '-vtag', 'DIVX', '-c:a', 'mp3'],
  },
  flv: {
    ext: 'flv',
    mime: 'video/x-flv',
    getArgs: () => ['-c:v', 'flv1', '-c:a', 'mp3', '-ar', '44100'],
  },
  av1: {
    ext: 'mp4',
    mime: 'video/mp4',
    getArgs: () => ['-c:v', 'libsvtav1', '-pix_fmt', 'yuv420p', '-c:a', 'aac'],
  },
  swf: {
    ext: 'swf',
    mime: 'application/x-shockwave-flash',
    getArgs: () => ['-c:v', 'flv1', '-c:a', 'mp3', '-ar', '44100'],
  },
  avchd: {
    ext: 'm2ts',
    mime: 'video/mp2t',
    getArgs: () => ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'ac3'],
  },
  vob: {
    ext: 'vob',
    mime: 'video/dvd',
    getArgs: () => ['-c:v', 'mpeg2video', '-c:a', 'ac3'],
  },
  ts: {
    ext: 'ts',
    mime: 'video/mp2t',
    getArgs: () => ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac'],
  },
  xvid: {
    ext: 'avi',
    mime: 'video/x-msvideo',
    getArgs: () => ['-c:v', 'libxvid', '-vtag', 'XVID', '-c:a', 'mp3'],
  },
  mxf: {
    ext: 'mxf',
    mime: 'application/mxf',
    getArgs: () => ['-c:v', 'mpeg2video', '-c:a', 'pcm_s16le', '-ar', '48000'],
  },
  rm: {
    ext: 'rm',
    mime: 'application/vnd.rn-realmedia',
    getArgs: () => ['-f', 'rm', '-c:v', 'rv10', '-c:a', 'ac3'],
  },
  mts: {
    ext: 'mts',
    mime: 'video/mp2t',
    getArgs: () => ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'ac3'],
  },
  f4v: {
    ext: 'f4v',
    mime: 'video/mp4',
    getArgs: () => ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac'],
  },
  asf: {
    ext: 'asf',
    mime: 'video/x-ms-asf',
    getArgs: () => ['-c:v', 'wmv2', '-c:a', 'wmav2'],
  },
  rmvb: {
    ext: 'rmvb',
    mime: 'application/vnd.rn-realmedia-vbr',
    getArgs: () => ['-f', 'rm', '-c:v', 'rv20', '-c:a', 'ac3'],
  },
  wtv: {
    ext: 'wtv',
    mime: 'video/wtv',
    getArgs: () => ['-c:v', 'mpeg2video', '-c:a', 'mp2'],
  },
  '3g2': {
    ext: '3g2',
    mime: 'video/3gpp2',
    getArgs: () => ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '32000'],
  },
  m2v: {
    ext: 'm2v',
    mime: 'video/mpeg',
    getArgs: () => ['-c:v', 'mpeg2video', '-an'],
  },
  m2ts: {
    ext: 'm2ts',
    mime: 'video/mp2t',
    getArgs: () => ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'ac3'],
  },
  mp4: {
    ext: 'mp4',
    mime: 'video/mp4',
    getArgs: () => ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac'],
  },
};

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFfmpegPath();
    const proc = spawn(ffmpegPath, args);
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

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cost = CREDIT_COSTS.video_convert;
  const spent = await spendCredits(cost, 'video_convert', 'Video format conversion');
  if (!spent.ok) {
    return new Response(
      JSON.stringify({ error: 'Insufficient credits', required: cost, balance: spent.balance }),
      { status: 402, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let tmpDir = '';

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const formatKey = ((formData.get('format') as string) || 'mp4').trim().toLowerCase() as VideoFormatKey;
    const resolution = (formData.get('resolution') as string) || 'original';
    const quality = (formData.get('quality') as string) || 'balanced';
    const muteAudio = formData.get('muteAudio') === 'true';

    if (!file) {
      await refundCredits(user.uid, cost, 'Video conversion — missing file refund');
      return new Response(JSON.stringify({ error: 'No video file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (file.size > MAX_FILE_BYTES) {
      await refundCredits(user.uid, cost, 'Video conversion — file too large refund');
      return new Response(JSON.stringify({ error: 'File exceeds 500 MB limit' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const config = VIDEO_FORMAT_CONFIGS[formatKey];
    if (!config) {
      await refundCredits(user.uid, cost, 'Video conversion — unsupported format refund');
      return new Response(JSON.stringify({ error: `Unsupported video format: ${formatKey}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vid-conv-'));
    const safeBase = path.basename(file.name || 'input').replace(/[^a-zA-Z0-9._-]/g, '_');
    const inputPath = path.join(tmpDir, safeBase);
    const outputPath = path.join(tmpDir, `converted_${Date.now()}.${config.ext}`);

    // Write input file to disk
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(inputPath, fileBuffer);

    // Build FFmpeg command arguments
    const ffmpegArgs: string[] = ['-y', '-i', inputPath];

    // Video filters (resolution scaling with even dimensions)
    const filters: string[] = [];
    if (resolution === '1080p') filters.push('scale=-2:1080');
    else if (resolution === '720p') filters.push('scale=-2:720');
    else if (resolution === '480p') filters.push('scale=-2:480');
    else if (resolution === '360p') filters.push('scale=-2:360');

    if (filters.length > 0) {
      ffmpegArgs.push('-vf', filters.join(','));
    }

    // Preset quality / speed
    if (quality === 'high') {
      ffmpegArgs.push('-preset', 'slow');
    } else if (quality === 'fast') {
      ffmpegArgs.push('-preset', 'veryfast');
    } else {
      ffmpegArgs.push('-preset', 'medium');
    }

    // Audio options
    if (muteAudio) {
      ffmpegArgs.push('-an');
    }

    // Add format-specific codec & container flags
    ffmpegArgs.push(...config.getArgs());

    // Destination
    ffmpegArgs.push(outputPath);

    // Execute FFmpeg
    await runFfmpeg(ffmpegArgs);

    if (!fs.existsSync(outputPath)) {
      throw new Error('Converted video output file was not generated.');
    }

    const convertedBuffer = fs.readFileSync(outputPath);
    const originalStem = path.basename(file.name || 'video', path.extname(file.name || 'video'));
    const downloadFilename = `${originalStem}-converted.${config.ext}`;

    return new Response(convertedBuffer, {
      status: 200,
      headers: {
        'Content-Type': config.mime,
        'Content-Disposition': `attachment; filename="${downloadFilename}"`,
        'X-Original-Size': String(file.size),
        'X-Converted-Size': String(convertedBuffer.length),
        'X-Output-Format': formatKey.toUpperCase(),
      },
    });

  } catch (err: unknown) {
    await refundCredits(user.uid, cost, 'Video conversion failed refund');
    const message = err instanceof Error ? err.message : 'Conversion failed';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });

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
