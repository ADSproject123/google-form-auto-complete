import * as readline from 'readline';
import * as dotenv from 'dotenv';
import { fillAndSubmitForm } from './formFiller';
import { FormSubmissionResult } from './types';
import { AIProvider } from './aiGenerator';
import { loadOrCreateConfig } from './configLoader';

dotenv.config();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  console.log('=== Google Form Auto-Filler (AI-Powered) ===\n');

  // AI provider selection
  console.log('Select AI provider:');
  console.log('  1. Claude (Anthropic) — requires ANTHROPIC_API_KEY');
  console.log('  2. SEA-LION (AI Singapore) — requires SEALION_API_KEY');
  const providerChoice = (await ask('Choice (1 or 2, default: 1): ')).trim();
  const provider: AIProvider = providerChoice === '2' ? 'sealion' : 'claude';

  if (provider === 'claude' && !process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set. Create a .env file based on .env.example.');
    process.exit(1);
  }
  if (provider === 'sealion' && !process.env.SEALION_API_KEY) {
    console.error('Error: SEALION_API_KEY is not set. Add it to your .env file.');
    process.exit(1);
  }
  console.log(`Using: ${provider === 'sealion' ? 'SEA-LION (AI Singapore)' : 'Claude (Anthropic)'}\n`);

  // Survey config (respondent profiles + question targets)
  const surveyConfig = await loadOrCreateConfig(rl);

  const formUrl = (await ask('\nEnter Google Form URL: ')).trim();
  if (!formUrl.startsWith('https://docs.google.com/forms/') && !formUrl.includes('forms.gle')) {
    console.error('Error: Please provide a valid Google Forms URL.');
    process.exit(1);
  }

  const respondentCountStr = (await ask('How many respondents to simulate? ')).trim();
  const respondentCount = parseInt(respondentCountStr, 10);
  if (isNaN(respondentCount) || respondentCount < 1) {
    console.error('Error: Please enter a valid number (minimum 1).');
    process.exit(1);
  }

  const headlessStr = (await ask('Run in headless mode? (y/n, default: y): ')).trim().toLowerCase();
  const headless = headlessStr !== 'n';

  rl.close();

  console.log(`\nStarting ${respondentCount} submission(s) for: ${formUrl}`);
  if (surveyConfig) {
    console.log('Respondent distribution:');
    surveyConfig.respondentProfiles.forEach(p => {
      console.log(`  ${p.name}: ${p.percentage}%`);
    });
  }
  console.log();

  const results: FormSubmissionResult[] = [];
  let successCount = 0;
  const personaCounts: Record<string, number> = {};

  for (let i = 0; i < respondentCount; i++) {
    console.log(`\n[${i + 1}/${respondentCount}] Submitting form...`);
    const result = await fillAndSubmitForm(formUrl, i, headless, provider, surveyConfig);
    results.push(result);

    if (result.persona) {
      personaCounts[result.persona] = (personaCounts[result.persona] ?? 0) + 1;
    }

    if (result.success) {
      successCount++;
      const personaTag = result.persona ? ` (${result.persona})` : '';
      console.log(`  ✓ Respondent ${i + 1}${personaTag} submitted successfully`);
    } else {
      console.error(`  ✗ Respondent ${i + 1} failed: ${result.error}`);
    }

    if (i < respondentCount - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Provider: ${provider === 'sealion' ? 'SEA-LION' : 'Claude'}`);
  console.log(`Total: ${respondentCount} | Success: ${successCount} | Failed: ${respondentCount - successCount}`);

  if (Object.keys(personaCounts).length > 0) {
    console.log('\nPersona breakdown (actual):');
    for (const [name, count] of Object.entries(personaCounts)) {
      const pct = ((count / respondentCount) * 100).toFixed(1);
      console.log(`  ${name}: ${count} respondents (${pct}%)`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
