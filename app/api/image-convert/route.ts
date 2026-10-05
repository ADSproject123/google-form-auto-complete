import { NextRequest } from 'next/server';
import { promisify } from 'util';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getCurrentUser } from '@/src/lib/firebase/server';
import { CREDIT_COSTS, spendCredits, refundCredits } from '@/src/credits';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const execFileAsync = promisify(execFile);
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

const FORMAT_MIME: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  cur: 'image/x-win-bitmap',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  tga: 'image/x-tga',
  dds: 'image/x-dds',
  ppm: 'image/x-portable-pixmap',
  pgm: 'image/x-portable-graymap',
  pbm: 'image/x-portable-bitmap',
  pcx: 'image/x-pcx',
  sgi: 'image/sgi',
  jp2: 'image/jp2',
};

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cost = CREDIT_COSTS.image_convert;
  const spent = await spendCredits(cost, 'image_convert', 'Image format conversion');
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
    const targetFormat = ((formData.get('format') as string) || 'webp').trim().toLowerCase();
    const quality = formData.get('quality') as string | null;
    const background = formData.get('background') as string | null;
    const vectorize = formData.get('vectorize') === 'true';
    const lossless = formData.get('lossless') === 'true';

    if (!file) {
      await refundCredits(user.uid, cost, 'Image conversion — missing file refund');
      return new Response(JSON.stringify({ error: 'No image file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (file.size > MAX_FILE_BYTES) {
      await refundCredits(user.uid, cost, 'Image conversion — file too large refund');
      return new Response(JSON.stringify({ error: 'File size exceeds the 50 MB limit.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Prepare temp directory
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-conv-'));
    const safeBaseName = path.basename(file.name || 'input').replace(/[^a-zA-Z0-9._-]/g, '_');
    const inputPath = path.join(tmpDir, safeBaseName);
    const outputPath = path.join(tmpDir, `converted_${Date.now()}.${targetFormat}`);

    // Write file to disk
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(inputPath, fileBuffer);

    // Build python CLI args
    const scriptPath = path.join(process.cwd(), 'image_converter.py');
    const args: string[] = [
      scriptPath,
      inputPath,
      '-f', targetFormat,
      '-o', outputPath,
      '--overwrite',
      '--json',
    ];

    if (quality && !isNaN(Number(quality))) {
      args.push('-q', String(Math.round(Number(quality))));
    }
    if (background) {
      args.push('--background', background);
    }
    if (vectorize) {
      args.push('--vectorize');
    }
    if (lossless) {
      args.push('--lossless');
    }

    const { stdout, stderr } = await execFileAsync('python3', args, {
      timeout: 45000,
      env: { ...process.env, PATH: process.env.PATH },
    });

    if (!fs.existsSync(outputPath)) {
      throw new Error(`Converted output file was not generated: ${stderr || stdout}`);
    }

    let meta: {
      file_size_bytes?: number;
      dimensions?: [number, number];
      warnings?: string[];
      error?: string;
      message?: string;
    } = {};

    try {
      meta = JSON.parse(stdout);
      if (meta.error) {
        throw new Error(meta.message || meta.error);
      }
    } catch (parseErr) {
      if (meta.error) throw parseErr;
    }

    const convertedBuffer = fs.readFileSync(outputPath);
    const outMime = FORMAT_MIME[targetFormat] || 'application/octet-stream';
    const originalStem = path.basename(file.name || 'image', path.extname(file.name || 'image'));
    const downloadFilename = `${originalStem}-converted.${targetFormat}`;

    return new Response(convertedBuffer, {
      status: 200,
      headers: {
        'Content-Type': outMime,
        'Content-Disposition': `attachment; filename="${downloadFilename}"`,
        'X-Original-Size': String(file.size),
        'X-Converted-Size': String(convertedBuffer.length),
        'X-Output-Format': targetFormat.toUpperCase(),
        'X-Dimensions': meta.dimensions ? `${meta.dimensions[0]}x${meta.dimensions[1]}` : '',
      },
    });

  } catch (err: unknown) {
    await refundCredits(user.uid, cost, 'Image conversion failed refund');
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

