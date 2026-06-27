import { NextRequest } from 'next/server';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import PptxGenJS from 'pptxgenjs';
import { createClient } from '@/src/lib/supabase/server';
import { CREDIT_COSTS, spendCredits, refundCredits } from '@/src/credits';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const execAsync = promisify(exec);

const PDFTOPPM = '/opt/homebrew/bin/pdftoppm';

// Layout options mapped to pptxgenjs layout names
const LAYOUTS: Record<string, string> = {
  '16:9': 'LAYOUT_WIDE',
  '4:3': 'LAYOUT_4x3',
  'A4': 'LAYOUT_USER', // handled separately
};

// A4 dimensions in inches: 297mm x 210mm (landscape)
const A4_W = 11.69;
const A4_H = 8.27;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const cost = CREDIT_COSTS.pdf_convert;
  const spent = await spendCredits(cost, 'pdf_convert', 'PDF to PPTX conversion');
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
    const layout = (formData.get('layout') as string) ?? '16:9';

    if (!file || file.type !== 'application/pdf') {
      await refundCredits(user.id, cost, 'PDF to PPTX — invalid file refund');
      return new Response('No PDF file provided', { status: 400 });
    }

    // Write PDF to a temp directory
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-pptx-'));
    const pdfPath = path.join(tmpDir, 'input.pdf');
    const pdfBuffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(pdfPath, pdfBuffer);

    // Convert all pages to PNG at 150 DPI
    const outputPrefix = path.join(tmpDir, 'slide');
    await execAsync(`"${PDFTOPPM}" -r 150 -png "${pdfPath}" "${outputPrefix}"`);

    // Collect sorted PNG files
    const pngFiles = fs.readdirSync(tmpDir)
      .filter(f => f.startsWith('slide') && f.endsWith('.png'))
      .sort((a, b) => {
        const na = parseInt(a.match(/(\d+)/)?.[1] ?? '0', 10);
        const nb = parseInt(b.match(/(\d+)/)?.[1] ?? '0', 10);
        return na - nb;
      })
      .map(f => path.join(tmpDir, f));

    if (!pngFiles.length) {
      return new Response('Could not convert PDF pages', { status: 500 });
    }

    // Build PPTX
    const pptx = new PptxGenJS();

    if (layout === 'A4') {
      pptx.defineLayout({ name: 'A4_LAND', width: A4_W, height: A4_H });
      pptx.layout = 'A4_LAND';
    } else {
      pptx.layout = LAYOUTS[layout] ?? 'LAYOUT_WIDE';
    }

    for (const pngPath of pngFiles) {
      const imgData = fs.readFileSync(pngPath);
      const base64 = `data:image/png;base64,${imgData.toString('base64')}`;
      const slide = pptx.addSlide();
      slide.addImage({ data: base64, x: 0, y: 0, w: '100%', h: '100%' });
    }

    const pptxBuffer = await pptx.write({ outputType: 'nodebuffer' });

    const originalName = file.name.replace(/\.pdf$/i, '');
    const filename = `${originalName}.pptx`;

    return new Response(pptxBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('PDF→PPTX error:', err);
    await refundCredits(user.id, cost, 'PDF to PPTX — conversion error refund').catch(() => {});
    return new Response(
      err instanceof Error ? err.message : 'Conversion failed',
      { status: 500 },
    );
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
