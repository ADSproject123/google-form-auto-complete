import { chromium, Page } from 'playwright';
import { FormField, FormSubmissionResult, SurveyConfig, UIFieldConfig, AnswerMode } from './types';
import { generateAllTextAnswers, generateChoiceAnswer, inferFormContext, AIProvider } from './aiGenerator';
import { assignPersona, getAnswerHint } from './configLoader';
import { extractFields } from './inspector';

// Returns all text representations of a choice element for matching against a target string.
// Radio uses data-value; checkbox uses data-answer-value. aria-label is present on both.
async function choiceTexts(el: import('playwright').ElementHandle): Promise<string[]> {
  return el.evaluate((node: Element) => {
    const texts: string[] = [];
    const al = node.getAttribute('aria-label'); if (al?.trim()) texts.push(al.trim());
    const dv = node.getAttribute('data-value');
    if (dv && dv !== '__other_option__') texts.push(dv.trim());
    const dav = node.getAttribute('data-answer-value');
    if (dav && dav !== '__other_option__') texts.push(dav.trim());
    const span = node.querySelector('.aDTYNe'); if (span?.textContent?.trim()) texts.push(span.textContent.trim());
    const dir = node.querySelector('[dir="auto"]'); if (dir?.textContent?.trim()) texts.push(dir.textContent.trim());
    const raw = node.textContent?.trim(); if (raw) texts.push(raw);
    return texts;
  });
}

async function matchesTarget(el: import('playwright').ElementHandle, target: string): Promise<boolean> {
  const lower = target.toLowerCase();
  const texts = await choiceTexts(el);
  return texts.some(t => t.toLowerCase().includes(lower));
}

async function findQuestionContainer(page: Page, index: number) {
  // .Qr7Oae is the top-level question wrapper in current Google Forms.
  // Avoids .eBFwI (checkbox option rows) which also carry role="listitem".
  const qr7 = await page.$$('.Qr7Oae');
  if (qr7.length > index) return qr7[index];
  // Older layout fallback
  const legacy = await page.$$('.freebirdFormviewerViewItemsItemItem');
  if (legacy.length > index) return legacy[index];
  return null;
}

async function fillField(
  page: Page,
  field: FormField,
  answer: string,
  index: number,
  preferredOptions?: string[]
): Promise<void> {
  const el = await findQuestionContainer(page, index);
  if (!el) return;

  switch (field.type) {
    case 'text': {
      const input = await el.$('input[type="text"], input[type="email"], input[type="number"], input[type="tel"], input[type="url"]');
      if (input) { await input.click(); await input.fill(answer); }
      break;
    }
    case 'textarea': {
      const textarea = await el.$('textarea');
      if (textarea) { await textarea.click(); await textarea.fill(answer); }
      break;
    }
    case 'radio': {
      const radioEls = await el.$$('[role="radio"]');
      if (radioEls.length === 0) break;
      const target = preferredOptions?.[0] ?? (field.options?.length ? field.options[Math.floor(Math.random() * field.options.length)] : null);
      if (target) {
        for (const radioEl of radioEls) {
          if (await matchesTarget(radioEl, target)) { await radioEl.click(); break; }
        }
      } else {
        await radioEls[Math.floor(Math.random() * radioEls.length)].click();
      }
      break;
    }
    case 'checkbox': {
      const checkboxEls = await el.$$('[role="checkbox"]');
      if (checkboxEls.length === 0) break;
      if (preferredOptions?.length) {
        // Click each preferred option (AI-all mode may provide multiple)
        for (const target of preferredOptions) {
          for (const cb of checkboxEls) {
            if (await matchesTarget(cb, target)) { await cb.click(); break; }
          }
        }
      } else {
        const num = Math.max(1, Math.floor(Math.random() * Math.min(checkboxEls.length, 2)) + 1);
        const shuffled = [...checkboxEls].sort(() => Math.random() - 0.5);
        for (let i = 0; i < num; i++) await shuffled[i].click();
      }
      break;
    }
    case 'dropdown': {
      const selectEl = await el.$('select');
      const target = preferredOptions?.[0] ?? (field.options?.length ? field.options[Math.floor(Math.random() * field.options.length)] : null);
      if (selectEl) {
        if (target) await selectEl.selectOption({ label: target }).catch(() => {});
        else if (field.options?.length) await selectEl.selectOption({ label: field.options[Math.floor(Math.random() * field.options.length)] });
      } else {
        const trigger = await el.$('[role="listbox"], .exportSelectPopup');
        if (trigger) {
          await trigger.click();
          await page.waitForTimeout(400);
          const opts = await page.$$('[role="option"]');
          if (target) {
            for (const opt of opts) {
              if (await matchesTarget(opt, target)) { await opt.click(); break; }
            }
          } else if (opts.length > 1) {
            await opts[Math.floor(Math.random() * (opts.length - 1)) + 1].click();
          }
        }
      }
      break;
    }
    case 'linear_scale': {
      const scaleEls = await el.$$('[role="radio"]');
      if (scaleEls.length > 0) await scaleEls[Math.floor(Math.random() * scaleEls.length)].click();
      break;
    }
    case 'date': {
      const dateInput = await el.$('input[type="date"]');
      if (dateInput) {
        const d = new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000);
        await dateInput.fill(d.toISOString().split('T')[0]);
      }
      break;
    }
    default:
      break;
  }
}

function resolveChoiceOption(
  field: FormField,
  persona: { name: string } | null,
  fieldConfigs: UIFieldConfig[]
): string | undefined {
  const cfg = fieldConfigs.find(c => c.label === field.label);
  if (!cfg?.weightedOptions?.length) return undefined;

  const hasWeights = cfg.weightedOptions.some(wo => wo.percentage > 0);
  if (!hasWeights) return undefined;

  const profileMatches = !cfg.applyToProfiles.length ||
    (persona && cfg.applyToProfiles.includes(persona.name));
  if (!profileMatches) return undefined;

  const roll = Math.random() * 100;
  let cumulative = 0;
  for (const wo of cfg.weightedOptions) {
    cumulative += wo.percentage;
    if (roll < cumulative) return wo.option;
  }
  return cfg.weightedOptions[cfg.weightedOptions.length - 1]?.option;
}

function resolveTextHint(
  field: FormField,
  persona: { name: string } | null,
  surveyConfig: SurveyConfig | null,
  fieldConfigs: UIFieldConfig[]
): string | null {
  // UIFieldConfig takes precedence over SurveyConfig
  const cfg = fieldConfigs.find(c => c.label === field.label);
  if (cfg?.answerHint?.trim()) {
    const profileMatches = !cfg.applyToProfiles.length ||
      (persona && cfg.applyToProfiles.includes(persona.name));
    if (profileMatches) {
      const roll = Math.random() * 100;
      if (roll < cfg.targetPercentage) return cfg.answerHint;
    }
    return null;
  }

  if (surveyConfig && persona) {
    return getAnswerHint(
      field.label,
      { name: persona.name, percentage: 0, description: '' },
      surveyConfig.questionTargets
    );
  }
  return null;
}

async function processPage(
  page: Page,
  formContext: string,
  provider: AIProvider,
  persona: { name: string; description: string } | null,
  surveyConfig: SurveyConfig | null,
  fieldConfigs: UIFieldConfig[],
  mode: AnswerMode,
  onLog: (msg: string) => void
): Promise<void> {
  const { fields } = await extractFields(page);

  const answers: Array<{ text: string; preferredOptions?: string[] }> = [];

  // ── Batch-generate all text/textarea answers in one API call ─────────────
  const textIndices: number[] = [];
  const textFieldBatch: Array<{ label: string; hint?: string | null }> = [];
  for (let i = 0; i < fields.length; i++) {
    if (fields[i].type === 'text' || fields[i].type === 'textarea') {
      textIndices.push(i);
      textFieldBatch.push({
        label: fields[i].label,
        hint: resolveTextHint(fields[i], persona, surveyConfig, fieldConfigs),
      });
    }
  }

  let batchedTextAnswers: string[] = [];
  if (textFieldBatch.length > 0) {
    batchedTextAnswers = await generateAllTextAnswers(textFieldBatch, formContext, {
      provider,
      persona: persona?.name,
      personaDescription: persona?.description,
    });
    for (let j = 0; j < textFieldBatch.length; j++) {
      const hintNote = textFieldBatch[j].hint ? ` [hint: ${textFieldBatch[j].hint}]` : '';
      onLog(`    "${textFieldBatch[j].label}": "${batchedTextAnswers[j]}"${hintNote}`);
    }
  }

  // ── Build answer array for all fields ────────────────────────────────────
  let textAnswerCursor = 0;
  for (const field of fields) {
    if (field.type === 'text' || field.type === 'textarea') {
      answers.push({ text: batchedTextAnswers[textAnswerCursor++] ?? '' });

    } else if (mode === 'ai-all' && ['radio', 'checkbox', 'dropdown'].includes(field.type)) {
      const options = field.options ?? [];
      if (options.length) {
        const selected = await generateChoiceAnswer(field.label, options, formContext, {
          provider,
          persona: persona?.name,
          personaDescription: persona?.description,
          isMultiSelect: field.type === 'checkbox',
        });
        onLog(`    "${field.label}" [AI]: ${selected.join(', ')}`);
        answers.push({ text: '', preferredOptions: selected });
      } else {
        answers.push({ text: '' });
      }

    } else {
      // pct mode: use weighted percentage distribution configured by the user
      const preferredOption = resolveChoiceOption(field, persona, fieldConfigs);
      answers.push({ text: '', preferredOptions: preferredOption ? [preferredOption] : undefined });
    }
  }

  for (let i = 0; i < fields.length; i++) {
    await fillField(page, fields[i], answers[i].text, i, answers[i].preferredOptions);
    await page.waitForTimeout(200);
  }
}

export async function fillAndSubmitForm(
  formUrl: string,
  respondentIndex: number,
  headless: boolean = true,
  provider: AIProvider = 'claude',
  surveyConfig: SurveyConfig | null = null,
  fieldConfigs: UIFieldConfig[] = [],
  mode: AnswerMode = 'pct',
  onLog: (msg: string) => void = console.log
): Promise<FormSubmissionResult> {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  const persona = surveyConfig && surveyConfig.respondentProfiles.length > 0
    ? assignPersona(surveyConfig.respondentProfiles)
    : null;

  try {
    await page.goto(formUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    const { fields, title } = await extractFields(page);

    if (fields.length === 0) {
      throw new Error('No form fields detected. Make sure the URL is a valid Google Form.');
    }

    const textFieldLabels = fields.filter(f => f.type === 'text' || f.type === 'textarea').map(f => f.label);
    const formContext = await inferFormContext(title, textFieldLabels, provider);

    const personaLabel = persona ? ` | Persona: ${persona.name}` : '';
    onLog(`  [Respondent ${respondentIndex + 1}] ${fields.length} fields detected.${personaLabel}`);
    onLog(`  Context: ${formContext}`);

    await processPage(page, formContext, provider, persona, surveyConfig, fieldConfigs, mode, onLog);

    // Handle multi-page forms then submit
    // jsname="M2UYVd" is Google Forms' stable identifier for the Submit button
    // jsname="sM3Oof" is the Next button (forward navigation)
    let pagesLeft = 20;
    while (pagesLeft-- > 0) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(600);

      // ── Next page ─────────────────────────────────────────────────────────
      const nextLocator = page.locator('[jsname="sM3Oof"]');
      if (await nextLocator.count() > 0) {
        await nextLocator.click();
        await page.waitForTimeout(1200);
        await processPage(page, formContext, provider, persona, surveyConfig, fieldConfigs, mode, onLog);
        continue;
      }

      // ── Submit ────────────────────────────────────────────────────────────
      const submitLocator = page.locator('[jsname="M2UYVd"]');
      if (await submitLocator.count() > 0) {
        await submitLocator.click();
        await page.waitForTimeout(2000);
        break;
      }

      throw new Error('Neither Next ([jsname="sM3Oof"]) nor Submit ([jsname="M2UYVd"]) button found on this page');
    }

    // Confirm submission
    const confirmed = await page.$('.freebirdFormviewerViewResponseConfirmationMessage');
    if (!confirmed) {
      const pageContent = (await page.textContent('body') ?? '').toLowerCase();
      if (!pageContent.includes('response') && !pageContent.includes('submitted') && !pageContent.includes('thank')) {
        throw new Error('Submission confirmation not detected — the form may not have submitted correctly');
      }
    }

    return { respondentIndex, success: true, persona: persona?.name };
  } catch (err) {
    return { respondentIndex, success: false, persona: persona?.name, error: String(err) };
  } finally {
    await context.close();
    await browser.close();
  }
}
