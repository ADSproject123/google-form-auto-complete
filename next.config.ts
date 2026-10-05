import type { NextConfig } from 'next';

// @sparticuz/chromium ships its Chromium binary under bin/ and loads it via a
// dynamically-built path, so Next's file tracer misses it — it has to be
// force-included for every route that launches a browser at runtime.
const CHROMIUM_BIN = ['./node_modules/@sparticuz/chromium/bin/**/*'];
const FFMPEG_BIN = ['./node_modules/@ffmpeg-installer/**/ffmpeg*'];

const nextConfig: NextConfig = {
  serverExternalPackages: ['playwright', 'playwright-core', '@sparticuz/chromium', '@ffmpeg-installer/ffmpeg'],
  outputFileTracingIncludes: {
    '/api/inspect': CHROMIUM_BIN,
    '/api/jobs/submit': CHROMIUM_BIN,
    '/api/webhook/baray': CHROMIUM_BIN,
    '/api/video-compress': FFMPEG_BIN,
  },
};

export default nextConfig;
