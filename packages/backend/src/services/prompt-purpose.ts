export const PROMPT_PURPOSES = [
  "deck.company",
  "deck.pitch",
  "deck.report",
  "deck.sales",
  "deck.training",
  "prototype.dashboard",
  "prototype.diagram",
  "prototype.editorial",
  "prototype.landing",
  "prototype.sandbox",
] as const;

export type PromptPurpose = (typeof PROMPT_PURPOSES)[number];

const PROMPT_PURPOSE_SET = new Set<string>(PROMPT_PURPOSES);

export function isPromptPurpose(value: unknown): value is PromptPurpose {
  return typeof value === "string" && PROMPT_PURPOSE_SET.has(value);
}
