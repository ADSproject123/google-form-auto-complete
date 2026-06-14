import Anthropic from '@anthropic-ai/sdk';

export type AIProvider = 'claude' | 'sealion';

const SEALION_API_URL = 'https://api.sea-lion.ai/v1/chat/completions';
const SEALION_MODEL = 'aisingapore/Gemma-SEA-LION-v4-27B-IT';

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

async function callSealion(prompt: string, maxTokens: number): Promise<string> {
  const response = await fetch(SEALION_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SEALION_API_KEY}`,
    },
    body: JSON.stringify({
      model: SEALION_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`SEA-LION API error ${response.status}: ${err}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices?.[0]?.message?.content?.trim() ?? 'N/A';
}

async function callClaude(prompt: string, maxTokens: number): Promise<string> {
  const stream = await getAnthropicClient().messages.stream({
    model: 'claude-opus-4-8',
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    messages: [{ role: 'user', content: prompt }],
  });

  const response = await stream.finalMessage();
  for (const block of response.content) {
    if (block.type === 'text') return block.text.trim();
  }
  return 'N/A';
}

export interface GenerateOptions {
  provider?: AIProvider;
  persona?: string;
  personaDescription?: string;
  answerHint?: string | null;
}

// Batch-generate answers for ALL text/textarea fields in a single API call.
// Returns answers as an ordered array matching the input fields array.
// This is the primary path — one request per respondent regardless of how many text fields.
export async function generateAllTextAnswers(
  fields: Array<{ label: string; hint?: string | null }>,
  formContext: string,
  opts: GenerateOptions = {}
): Promise<string[]> {
  const { provider = 'claude', persona, personaDescription } = opts;
  if (fields.length === 0) return [];

  const personaLine = persona
    ? `You are a ${persona}${personaDescription ? ` — ${personaDescription}` : ''}.`
    : 'You are a realistic survey respondent.';

  const questionsBlock = fields
    .map((f, i) => {
      const hint = f.hint ? ` [lean toward: "${f.hint}"]` : '';
      return `${i + 1}. ${f.label}${hint}`;
    })
    .join('\n');

  const prompt = `${personaLine}
You are filling out a Google Form survey about: "${formContext}".

Answer every question below. Return ONLY the answers — one per line — numbered to match:
${questionsBlock}

Format your reply exactly like this (number then pipe then answer):
1 | your answer
2 | your answer
...

Rules:
- Concise and realistic — sound like a real human
- No extra commentary or explanation
- For email fields use realistic fake emails
- For name fields use realistic fictional names
- For optional / contact fields you may write N/A`;

  // Token budget: ~80 tokens per answer is generous for short form answers
  const maxTokens = Math.min(2000, fields.length * 80 + 200);

  const raw = provider === 'sealion'
    ? await callSealion(prompt, maxTokens)
    : await callClaude(prompt, maxTokens);

  // Parse "N | answer" lines
  const parsed: string[] = new Array(fields.length).fill('');
  for (const line of raw.split('\n')) {
    const m = line.match(/^(\d+)\s*[|:.\)]\s*(.+)/);
    if (m) {
      const idx = parseInt(m[1], 10) - 1;
      if (idx >= 0 && idx < fields.length) parsed[idx] = m[2].trim();
    }
  }

  // Fallback: if the model ignored the format, split by lines in order
  const answered = parsed.filter(Boolean).length;
  if (answered === 0) {
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < fields.length && i < lines.length; i++) {
      parsed[i] = lines[i];
    }
  }

  // Last resort: fill blanks with 'N/A'
  return parsed.map(a => a || 'N/A');
}

// Single-field fallback (used only if needed individually)
export async function generateTextAnswer(
  fieldLabel: string,
  formContext: string,
  options: GenerateOptions = {}
): Promise<string> {
  const results = await generateAllTextAnswers(
    [{ label: fieldLabel, hint: options.answerHint }],
    formContext,
    options
  );
  return results[0] ?? 'N/A';
}

export interface ChoiceGenerateOptions extends GenerateOptions {
  isMultiSelect?: boolean;
}

// Ask the AI to pick the best option(s) from a list for a given persona.
// Returns an array of matched option strings (always at least one).
export async function generateChoiceAnswer(
  fieldLabel: string,
  options: string[],
  formContext: string,
  opts: ChoiceGenerateOptions = {}
): Promise<string[]> {
  const { provider = 'claude', persona, personaDescription, isMultiSelect = false } = opts;

  if (!options.length) return [];

  const personaLine = persona
    ? `You are a ${persona}${personaDescription ? ` — ${personaDescription}` : ''}.`
    : 'You are a realistic survey respondent.';

  const selectRule = isMultiSelect
    ? 'Select one or more options that best fit your persona. List each chosen option on its own line.'
    : 'Select EXACTLY ONE option that best fits your persona. Reply with only that option text.';

  const prompt = `${personaLine}
You are completing a survey about: "${formContext}".

Question: "${fieldLabel}"
${selectRule}

Options:
${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}

Reply with only the exact option text(s), one per line. No numbering, no explanation.`;

  const raw = provider === 'sealion'
    ? await callSealion(prompt, 200)
    : await callClaude(prompt, 200);

  // Match each line of AI output to a known option (exact → includes → contained-in)
  const lines = raw.split('\n').map(l => l.replace(/^\d+[.)]\s*/, '').trim()).filter(Boolean);
  const matched: string[] = [];
  for (const line of lines) {
    const hit =
      options.find(o => o.toLowerCase() === line.toLowerCase()) ??
      options.find(o => o.toLowerCase().includes(line.toLowerCase())) ??
      options.find(o => line.toLowerCase().includes(o.toLowerCase()));
    if (hit && !matched.includes(hit)) matched.push(hit);
  }

  // Fallback: pick a random option so we always return something
  if (!matched.length) matched.push(options[Math.floor(Math.random() * options.length)]);
  return matched;
}

export async function inferFormContext(
  formTitle: string,
  fieldLabels: string[],
  provider: AIProvider = 'claude'
): Promise<string> {
  const prompt = `Given the Google Form title "${formTitle}" and fields: ${fieldLabels.slice(0, 5).join(', ')}, summarize what this form is about in one sentence.`;

  if (provider === 'sealion') return callSealion(prompt, 100);
  return callClaude(prompt, 100);
}
