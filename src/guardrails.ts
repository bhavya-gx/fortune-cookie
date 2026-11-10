// Guardrails (approved 4 Nov 2026):
// - entertainment only
// - no health, money, legal or death predictions
// - nothing about another person unless they opted in
// - "stop" works for anyone
// These are cheap checks that run BEFORE any model call, so a refused
// question never costs a request and never counts toward the daily cap.

export type Refusal = "health" | "money" | "legal" | "death" | "someone-else";

const RESTRICTED: Array<[Refusal, RegExp]> = [
  ["death", /\b(die|dies|dying|death|dead|funeral|suicide|kill myself|end it all|how long (do|will) (i|he|she|they) live)\b/i],
  ["health", /\b(cancer|tumou?r|diagnos\w*|pregnan\w*|miscarriage|surgery|disease|illness|sick|symptom\w*|medic\w*|therapy|depress\w*|anxiety|disorder|std|hiv|covid|baby)\b/i],
  ["money", /\b(stocks?|crypto|bitcoin|invest\w*|lottery|jackpot|gambl\w*|bet on|casino|loan|mortgage|tax(es)?|salary|raise|get rich|millionaire|portfolio)\b/i],
  ["legal", /\b(lawsuit|sue|sued|court|lawyer|attorney|arrest\w*|jail|prison|custody|divorce|visa|immigration|deport\w*|green card|verdict)\b/i],
];

const SOMEONE_ELSE = /\b(he|she|him|her|his|hers|they|them|their|my (ex|boss|boyfriend|girlfriend|husband|wife|mom|dad|mother|father|friend|sister|brother|roommate|crush|date))\b/i;

// Returns a reason to refuse, or null when the question is fine.
export function checkQuestion(question: string): Refusal | null {
  for (const [kind, re] of RESTRICTED) if (re.test(question)) return kind;
  if (SOMEONE_ELSE.test(question)) return "someone-else";
  return null;
}

const REFUSALS: Record<Refusal, string> = {
  health: "🥠 No health fortunes. Please ask a doctor.",
  money: "🥠 No money fortunes. Ask about love, luck or your week.",
  legal: "🥠 No legal fortunes. Ask me something fun.",
  death: "🥠 Not that one. If things feel heavy, talk to someone you trust. 💛",
  "someone-else": '🥠 I only read for whoever asks. They can text "fortune join".',
};

export function refusalMessage(kind: Refusal): string {
  return REFUSALS[kind];
}

// House style: no em dashes and no double hyphens, anywhere, including model output.
export function cleanStyle(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s*--+\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .trim();
}

export const DISCLAIMER = "For entertainment only. Text \"fortune stop\" anytime.";
