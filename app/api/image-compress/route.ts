import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { getCurrentUser } from '@/src/lib/firebase/server';
import { CREDIT_COSTS, spendCredits, refundCredits } from '@/src/credits';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type QualityTier = 'high' | 'balanced' | 'small';
type OutFormat = 'jpeg' | 'png' | 'webp' | 'avif';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const QUALITY_PRESETS: Record<QualityTier, { quality: number; maxDimension: number | null; pngColors: number }> = {
  high:     { quality: 90, maxDimension: null, pngColors: 256 },
  balanced: { quality: 80, maxDimension: 2560, pngColors: 256 },
  small:    { quality: 60, maxDimension: 1600, pngColors: 128 },
};

const MIME_TO_FORMAT: Record<string, OutFormat> = {
  'image/jpeg': 'jpeg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

const FORMAT_META: Record<OutFormat, { mime: string; ext: string }> = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
  png:  { mime: 'image/png',  ext: 'png' },
  webp: { mime: 'image/webp', ext: 'webp' },
  avif: { mime: 'image/avif', ext: 'avif' },
};

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const cost = CREDIT_COSTS.image_compress;
  const spent = await spendCredits(cost, 'image_compress', 'Image compression');
  if (!spent.ok) {
    return new Response(
      JSON.stringify({ error: 'Insufficient credits', required: cost, balance: spent.balance }),
      { status: 402, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const quality = (formData.get('quality') as string) as QualityTier;
    const requestedFormat = formData.get('format') as string | null; // 'original' | OutFormat

    const inputFormat = file ? MIME_TO_FORMAT[file.type] : undefined;
    if (!file || !inputFormat) {
      await refundCredits(user.uid, cost, 'Image compress — invalid file refund');
      return new Response('Unsupported file. Use JPEG, PNG, WebP or AVIF.', { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      await refundCredits(user.uid, cost, 'Image compress — file too large refund');
      return new Response('Image is too large (max 25 MB).', { status: 413 });
    }

    const preset = QUALITY_PRESETS[quality] ?? QUALITY_PRESETS.balanced;
    const outFormat: OutFormat =
      requestedFormat && requestedFormat in FORMAT_META ? (requestedFormat as OutFormat) : inputFormat;

    const inputBuffer = Buffer.from(await file.arrayBuffer());

    // rotate() applies EXIF orientation; metadata is stripped by default
    let pipeline = sharp(inputBuffer, { failOn: 'none' }).rotate();
    if (preset.maxDimension) {
      pipeline = pipeline.resize({
        width: preset.maxDimension,
        height: preset.maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    switch (outFormat) {
      case 'jpeg':
        // JPEG has no alpha — flatten onto white
        pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: preset.quality, mozjpeg: true });
        break;
      case 'png':
        pipeline = pipeline.png({ compressionLevel: 9, palette: true, quality: preset.quality, colours: preset.pngColors });
        break;
      case 'webp':
        pipeline = pipeline.webp({ quality: preset.quality });
        break;
      case 'avif':
        pipeline = pipeline.avif({ quality: preset.quality });
        break;
    }

    const outputBuffer = await pipeline.toBuffer();

    // If recompression made it bigger (already well-optimised input, same format), keep the original bytes
    const useOriginal = outFormat === inputFormat && outputBuffer.length >= inputBuffer.length;
    const body = useOriginal ? inputBuffer : outputBuffer;
    const meta = FORMAT_META[outFormat];

    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^\w.\- ]+/g, '_') || 'image';
    const filename = `${baseName}-compressed.${meta.ext}`;

    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': meta.mime,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(body.length),
        'X-Original-Size': String(inputBuffer.length),
        'X-Compressed-Size': String(body.length),
        'X-Filename': filename,
      },
    });
  } catch (err) {
    console.error('Image compress error:', err);
    await refundCredits(user.uid, cost, 'Image compress — error refund').catch(() => {});
    return new Response(
      err instanceof Error ? err.message : 'Compression failed',
      { status: 500 },
    );
  }
}

