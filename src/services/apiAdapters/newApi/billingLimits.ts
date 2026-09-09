/** Bound expansion of untrusted billing expressions without changing accepted limits. */
export const BILLING_EXPRESSION_LIMITS = {
  CHARACTERS: 16_000,
  BRANCHES: 64,
  ALTERNATIVES: 128,
  CONDITIONS_PER_GROUP: 32,
  PARENTHESIS_DEPTH: 64,
  REQUEST_FACTOR_PARTS: 7,
  FACTOR_RULES: 512,
} as const
