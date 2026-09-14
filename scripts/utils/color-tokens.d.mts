interface ColorTokenViolation {
  token: string
  line: number
  column: number
}

type ColorTokenBaseline = Record<
  string,
  { reason?: string; tokens: Record<string, number> }
>

/** Find raw colors outside their definition owners. */
export function findColorTokenViolations(
  file: string,
  source: string,
): ColorTokenViolation[]

/** Report new occurrences and stale baseline allowances. */
export function compareColorTokenBaseline(
  file: string,
  violations: ColorTokenViolation[],
  baseline?: ColorTokenBaseline,
): string[]
