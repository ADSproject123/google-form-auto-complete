import { NextRequest, NextResponse } from 'next/server';
import { inspectForm } from '@/src/inspector';

export async function POST(req: NextRequest) {
  const { url } = await req.json() as { url: string };
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });
  try {
    const result = await inspectForm(url);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
