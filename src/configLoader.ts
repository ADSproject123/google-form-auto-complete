import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { SurveyConfig, RespondentProfile, QuestionTarget } from './types';

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'survey-config.json');

const EXAMPLE_CONFIG: SurveyConfig = {
  respondentProfiles: [
    { name: 'Farmer', percentage: 50, description: 'A small-scale farmer who grows and sells produce' },
    { name: 'Buyer', percentage: 25, description: 'A wholesale buyer or market trader purchasing produce' },
    { name: 'Transport', percentage: 15, description: 'A transport or logistics provider moving goods' },
    { name: 'General', percentage: 10, description: 'A general member of the public' },
  ],
  questionTargets: [
    {
      questionKeyword: 'buyer access',
      targetAnswer: 'difficult',
      targetPercentage: 75,
      applyToProfiles: ['Farmer'],
    },
    {
      questionKeyword: 'sold at low prices',
      targetAnswer: 'yes',
      targetPercentage: 75,
      applyToProfiles: ['Farmer'],
    },
    {
      questionKeyword: 'fair price',
      targetAnswer: 'not confident',
      targetPercentage: 60,
      applyToProfiles: ['Farmer'],
    },
    {
      questionKeyword: 'list future harvest',
      targetAnswer: 'yes, interested',
      targetPercentage: 80,
      applyToProfiles: ['Farmer'],
    },
  ],
};

function normalizePercentages(profiles: RespondentProfile[]): RespondentProfile[] {
  const total = profiles.reduce((sum, p) => sum + p.percentage, 0);
  if (total === 0) return profiles;
  return profiles.map(p => ({ ...p, percentage: (p.percentage / total) * 100 }));
}

export function assignPersona(profiles: RespondentProfile[]): RespondentProfile {
  const normalized = normalizePercentages(profiles);
  const roll = Math.random() * 100;
  let cumulative = 0;
  for (const profile of normalized) {
    cumulative += profile.percentage;
    if (roll < cumulative) return profile;
  }
  return normalized[normalized.length - 1];
}

export function getAnswerHint(
  fieldLabel: string,
  persona: RespondentProfile,
  targets: QuestionTarget[]
): string | null {
  const labelLower = fieldLabel.toLowerCase();
  for (const target of targets) {
    const keywordLower = target.questionKeyword.toLowerCase();
    if (!labelLower.includes(keywordLower)) continue;

    const profileMatches =
      !target.applyToProfiles ||
      target.applyToProfiles.length === 0 ||
      target.applyToProfiles.some(p => p.toLowerCase() === persona.name.toLowerCase());

    if (!profileMatches) continue;

    const roll = Math.random() * 100;
    if (roll < target.targetPercentage) {
      return target.targetAnswer;
    }
  }
  return null;
}

export async function loadOrCreateConfig(rl: readline.Interface): Promise<SurveyConfig | null> {
  const ask = (q: string) => new Promise<string>(resolve => rl.question(q, resolve));

  const useConfig = (await ask('Use a custom survey config (profiles + question targets)? (y/n, default: n): '))
    .trim()
    .toLowerCase();

  if (useConfig !== 'y') return null;

  console.log(`\nConfig file location: ${DEFAULT_CONFIG_PATH}`);

  if (!fs.existsSync(DEFAULT_CONFIG_PATH)) {
    fs.writeFileSync(DEFAULT_CONFIG_PATH, JSON.stringify(EXAMPLE_CONFIG, null, 2), 'utf-8');
    console.log('  → Example config created. Edit it now, then press Enter to continue.');
    await ask('  Press Enter when ready...');
  } else {
    console.log('  → Found existing config file.');
  }

  try {
    const raw = fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf-8');
    const config: SurveyConfig = JSON.parse(raw);

    if (!Array.isArray(config.respondentProfiles) || config.respondentProfiles.length === 0) {
      throw new Error('respondentProfiles must be a non-empty array');
    }
    if (!Array.isArray(config.questionTargets)) {
      throw new Error('questionTargets must be an array');
    }

    const totalPct = config.respondentProfiles.reduce((s, p) => s + p.percentage, 0);
    console.log(`  → Loaded ${config.respondentProfiles.length} profiles (total: ${totalPct}%) and ${config.questionTargets.length} question target(s).`);

    return config;
  } catch (err) {
    console.error(`  Error reading config: ${err}`);
    console.error('  Proceeding without custom config.');
    return null;
  }
}
