import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { getCurrentUser } from '@/src/lib/firebase/server';
import { CREDIT_COSTS, spendCredits, refundCredits } from '@/src/credits';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type QualityTier = 'high' | 'balanced' | 'small' | 'custom';
type OutFormat = 'jpeg' | 'png' | 'webp' | 'avif';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const QUALITY_PRESETS: Record<Exclude<QualityTier, 'custom'>, { quality: number; maxDimension: number | null; pngColors: number }> = {
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

async function compressImageToTargetBytes(
  inputBuffer: Buffer,
  outFormat: OutFormat,
  targetBytes: number,
): Promise<Buffer> {
  const metadata = await sharp(inputBuffer).metadata();
  let currentWidth = metadata.width || 1920;
  let currentHeight = metadata.height || 1080;

  // Try binary search on quality, and downscale dimensions if needed
  for (let pass = 0; pass < 4; pass++) {
    let lowQ = 10;
    let highQ = 95;
    let passBestBuffer: Buffer | null = null;

    while (lowQ <= highQ) {
      const midQ = Math.floor((lowQ + highQ) / 2);
      let pipeline = sharp(inputBuffer, { failOn: 'none' }).rotate();
      pipeline = pipeline.resize({
        width: Math.round(currentWidth),
        height: Math.round(currentHeight),
        fit: 'inside',
        withoutEnlargement: true,
      });

      switch (outFormat) {
        case 'jpeg':
          pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: midQ, mozjpeg: true });
          break;
        case 'png':
          pipeline = pipeline.png({
            compressionLevel: 9,
            palette: true,
            quality: midQ,
            colours: Math.max(32, Math.min(256, Math.floor(midQ * 2.8))),
          });
          break;
        case 'webp':
          pipeline = pipeline.webp({ quality: midQ });
          break;
        case 'avif':
          pipeline = pipeline.avif({ quality: midQ });
          break;
      }

      const buf = await pipeline.toBuffer();

      if (buf.length <= targetBytes) {
        passBestBuffer = buf;
        lowQ = midQ + 1; // Fits, try higher quality
      } else {
        highQ = midQ - 1; // Too big, lower quality
      }
    }

    if (passBestBuffer) {
      return passBestBuffer;
    }

    // Exceeds target even at lowest quality; scale down dimensions by 30%
    currentWidth *= 0.7;
    currentHeight *= 0.7;
    if (currentWidth < 120 || currentHeight < 120) {
      break;
    }
  }

  // Fallback if target is extremely small
  let fallback = sharp(inputBuffer, { failOn: 'none' }).rotate().resize({
    width: Math.round(Math.max(120, currentWidth)),
    height: Math.round(Math.max(120, currentHeight)),
    fit: 'inside',
    withoutEnlargement: true,
  });
  if (outFormat === 'jpeg') fallback = fallback.flatten({ background: '#ffffff' }).jpeg({ quality: 10, mozjpeg: true });
  else if (outFormat === 'png') fallback = fallback.png({ compressionLevel: 9, palette: true, quality: 10, colours: 32 });
  else if (outFormat === 'webp') fallback = fallback.webp({ quality: 10 });
  else fallback = fallback.avif({ quality: 10 });

  return await fallback.toBuffer();
}

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
    const qualityRaw = formData.get('quality') as string;
    const isCustom = qualityRaw === 'custom';
    const quality = qualityRaw as QualityTier;
    const targetKb = Number(formData.get('targetKb'));
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

    if (isCustom) {
      if (!Number.isFinite(targetKb) || targetKb < 5) {
        await refundCredits(user.uid, cost, 'Image compress — invalid target size refund');
        return new Response('Target size must be at least 5 KB.', { status: 400 });
      }
      if (targetKb * 1024 >= file.size) {
        await refundCredits(user.uid, cost, 'Image compress — target too large refund');
        return new Response('Target size must be smaller than the original file.', { status: 400 });
      }
    }

    const outFormat: OutFormat =
      requestedFormat && requestedFormat in FORMAT_META ? (requestedFormat as OutFormat) : inputFormat;

    const inputBuffer = Buffer.from(await file.arrayBuffer());

    let outputBuffer: Buffer;

    if (isCustom) {
      const targetBytes = Math.floor(targetKb * 1024);
      outputBuffer = await compressImageToTargetBytes(inputBuffer, outFormat, targetBytes);
    } else {
      const preset = (!isCustom && quality in QUALITY_PRESETS)
        ? QUALITY_PRESETS[quality as Exclude<QualityTier, 'custom'>]
        : QUALITY_PRESETS.balanced;

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

      outputBuffer = await pipeline.toBuffer();
    }

    // If recompression made it bigger (already well-optimised input, same format), keep original bytes
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
