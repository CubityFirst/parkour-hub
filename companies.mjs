// Which company makes each model, by model/family name. The landing page groups cards into
// one section per company, in this order. A games.mjs entry can set `company` to override.
// Names are matched as a prefix not followed by a letter, so "Qwen3.8" and "GLM-5.3" match
// but "Grokky" wouldn't (\b fails between "Qwen" and "3").
const prefix = (...names) => new RegExp(`^(?:${names.join('|')})(?![a-z])`, 'i');
export const companies = [
  { name: 'Anthropic', match: prefix('Claude', 'Opus', 'Sonnet', 'Haiku', 'Fable') },
  { name: 'OpenAI', match: prefix('GPT', 'Astra', 'Codex') },
  { name: 'Google', match: prefix('Gemini') },
  { name: 'xAI', match: prefix('Grok') },
  { name: 'DeepSeek', match: prefix('DeepSeek') },
  { name: 'Moonshot AI', match: prefix('Kimi') },
  { name: 'Z.ai', match: prefix('GLM') },
  { name: 'Alibaba', match: prefix('Qwen') },
];
export const OTHER = 'Other';

export function companyOf(game) {
  if (game.company) return game.company;
  return companies.find((c) => c.match.test(game.model))?.name ?? OTHER;
}
