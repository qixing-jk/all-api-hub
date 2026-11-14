export const VERIFICATION_CONCURRENCY_KINDS = {
  Routine: "routine",
  Needle: "needle",
} as const
export type VerificationConcurrencyKind =
  (typeof VERIFICATION_CONCURRENCY_KINDS)[keyof typeof VERIFICATION_CONCURRENCY_KINDS]
export type VerificationConcurrency = Partial<
  Record<VerificationConcurrencyKind, number>
>
export const DEFAULT_VERIFICATION_CONCURRENCY = 1
export const MAX_VERIFICATION_CONCURRENCY = 10

/** Existing installations keep one request per batch until the user opts in. */
export function normalizeVerificationConcurrency(value: unknown): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= DEFAULT_VERIFICATION_CONCURRENCY
    ? Math.min(MAX_VERIFICATION_CONCURRENCY, value)
    : DEFAULT_VERIFICATION_CONCURRENCY
}
