import { chromium, Page } from 'playwright';
import { FormField } from './types';

const TYPE_ID_MAP: Record<number, string> = {
  0: 'text', 1: 'textarea', 2: 'radio', 3: 'dropdown',
  4: 'checkbox', 5: 'linear_scale', 6: 'unknown',
  7: 'unknown', 8: 'unknown', 9: 'date', 10: 'time',
};

function parseDataParams(attr: string | null): any[] | null {
  if (!attr) return null;
  try { return JSON.parse(attr.replace(/^%\.@\./, '')); }
  catch { return null; }
}

function optionsFromParams(params: any[]): string[] {
  try {
    const groups = params[4];
    if (!Array.isArray(groups)) return [];
    const out: string[] = [];
    for (const group of groups) {
      const opts = group?.[1];
      if (!Array.isArray(opts)) continue;
      for (const opt of opts) {
        const text = Array.isArray(opt) ? String(opt[0] ?? '') : String(opt ?? '');
        if (!text) continue;
        out.push(text === '__other_option__' ? 'Other:' : text);
      }
    }
    return out;
  } catch { return []; }
}

async function domDetectType(c: import('playwright').Locator): Promise<string> {
  // CRITICAL: radio/checkbox before text — "Other:" option hides an input[type="text"]
  if (await c.locator('[role="radio"], input[type="radio"]').count() > 0)    return 'radio';
  if (await c.locator('[role="checkbox"], input[type="checkbox"]').count() > 0) return 'checkbox';
  if (await c.locator('input[type="text"], input[type="email"], input[type="number"], input[type="tel"], input[type="url"]').count() > 0) return 'text';
  if (await c.locator('textarea').count() > 0)                                return 'textarea';
  if (await c.locator('select, [role="listbox"]').count() > 0)               return 'dropdown';
  if (await c.locator('input[type="date"]').count() > 0)                     return 'date';
  if (await c.locator('input[type="time"]').count() > 0)                     return 'time';
  return 'unknown';
}

async function extractOptions(
  c: import('playwright').Locator,
  type: string,
  params: any[] | null
): Promise<string[]> {
  if (!['radio', 'checkbox', 'dropdown'].includes(type)) return [];

  // A — data-params JSON
  if (params) {
    const from = optionsFromParams(params);
    if (from.length) return from;
  }

  // B — .aDTYNe: the visible rendered label span inside every option row
  const spanTexts = await c.locator('.aDTYNe').allTextContents();
  const fromSpans = Array.from(new Set(spanTexts.map(t => t.trim()).filter(Boolean)));
  if (fromSpans.length) return fromSpans;

  // C — aria-label on role elements (radio: data-value, checkbox: data-answer-value)
  const role = type === 'radio' ? 'radio' : type === 'checkbox' ? 'checkbox' : null;
  if (role) {
    const roleEls = c.locator(`[role="${role}"]`);
    const n = await roleEls.count();
    const opts: string[] = [];
    for (let j = 0; j < n; j++) {
      const el = roleEls.nth(j);
      const al = await el.getAttribute('aria-label');
      if (al?.trim()) { opts.push(al.trim()); continue; }
      const dv = await el.getAttribute('data-value') ?? await el.getAttribute('data-answer-value');
      if (dv && dv !== '__other_option__') opts.push(dv.trim());
    }
    return opts;
  }

  if (type === 'dropdown') {
    const texts = await c.locator('[role="option"], select option').allTextContents();
    return texts.map(t => t.trim()).filter(t => t && t !== 'Choose');
  }

  return [];
}

export async function extractFields(page: Page): Promise<{ fields: FormField[]; title: string }> {
  const title = await page.title();

  // Pick container selector — .Qr7Oae is the top-level question wrapper in current Forms
  // (avoids .eBFwI, which are checkbox option rows and also carry role="listitem")
  let sel = '.Qr7Oae';
  if (await page.locator(sel).count() === 0) {
    sel = '.freebirdFormviewerViewItemsItemItem, .freebirdFormviewerComponentsQuestionBaseRoot';
  }

  const total = await page.locator(sel).count();
  const fields: FormField[] = [];

  for (let i = 0; i < total; i++) {
    const c = page.locator(sel).nth(i);

    // Label
    const labelEl = c.locator('.M7eMe').first();
    const label = ((await labelEl.count()) > 0
      ? await labelEl.textContent()
      : await c.locator('[role="heading"]').first().textContent().catch(() => '')
    )?.trim() ?? '';
    if (!label) continue;

    // Type via data-params (most reliable) or DOM fallback
    let type: string;
    let params: any[] | null = null;
    const paramEl = c.locator('[data-params]').first();
    if (await paramEl.count() > 0) {
      const attr = await paramEl.getAttribute('data-params');
      params = parseDataParams(attr);
    }

    if (params && typeof params[3] === 'number') {
      type = TYPE_ID_MAP[params[3]] ?? 'unknown';
    } else {
      type = await domDetectType(c);
    }

    // Refine radio → linear_scale when all options are plain digit strings
    if (type === 'radio') {
      const radioEls = c.locator('[role="radio"]');
      const n = await radioEls.count();
      const labels: string[] = [];
      for (let j = 0; j < n; j++) {
        const el = radioEls.nth(j);
        const dv = await el.getAttribute('data-value');
        if (dv === '__other_option__') continue;
        labels.push((await el.getAttribute('aria-label') ?? dv ?? '').trim());
      }
      if (labels.length > 1 && labels.every(l => /^\d+$/.test(l))) type = 'linear_scale';
    }

    // Options
    let options: string[] = [];
    if (type === 'linear_scale') {
      const radioEls = c.locator('[role="radio"]');
      const n = await radioEls.count();
      for (let j = 0; j < n; j++) {
        const al = await radioEls.nth(j).getAttribute('aria-label');
        if (al) options.push(al.trim());
      }
    } else {
      options = await extractOptions(c, type, params);
    }

    const required = await c.locator('.vnumgf, [aria-label="Required question"]').count() > 0;

    fields.push({ label, type: type as FormField['type'], options, required });
  }

  return { fields, title };
}

export async function inspectForm(url: string): Promise<{ fields: FormField[]; title: string }> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    // Scroll to bottom so any lazy-rendered content appears in the DOM
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    return await extractFields(page);
  } finally {
    await context.close();
    await browser.close();
  }
}
