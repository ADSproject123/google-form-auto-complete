import type { Browser } from 'playwright';

// AWS_LAMBDA_FUNCTION_VERSION is only set inside the actual deployed serverless
// execution environment — not during `next dev`/`vercel dev` or the build step —
// so it's the reliable signal for "use the Lambda-sized Chromium build".
function isServerlessRuntime(): boolean {
  return !!process.env.AWS_LAMBDA_FUNCTION_VERSION;
}

export async function launchChromium(options: { headless?: boolean } = {}): Promise<Browser> {
  const headless = options.headless ?? true;

  if (isServerlessRuntime()) {
    const [{ default: chromium }, { chromium: playwrightChromium }] = await Promise.all([
      import('@sparticuz/chromium'),
      import('playwright-core'),
    ]);
    return playwrightChromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless,
    });
  }

  const { chromium: playwrightChromium } = await import('playwright');
  return playwrightChromium.launch({ headless });
}
