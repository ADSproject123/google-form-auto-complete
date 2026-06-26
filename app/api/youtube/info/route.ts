import { NextRequest, NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url') ?? '';

  if (!url || !ytdl.validateURL(url)) {
    return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
  }

  try {
    const info = await ytdl.getInfo(url);
    const { videoDetails } = info;

    // Collect unique qualities available as combined video+audio (for MP4 tab)
    const combined = ytdl.filterFormats(info.formats, 'videoandaudio');
    const qualities = [...new Set(combined.map(f => f.qualityLabel).filter(Boolean))];

    return NextResponse.json({
      title: videoDetails.title,
      thumbnail: videoDetails.thumbnails.at(-1)?.url ?? '',
      duration: Number(videoDetails.lengthSeconds),
      channel: videoDetails.author?.name ?? '',
      qualities: qualities.length ? qualities : ['720p', '480p', '360p'],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch video info' },
      { status: 500 },
    );
  }
}
