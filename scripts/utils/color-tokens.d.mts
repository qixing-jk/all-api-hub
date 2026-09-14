interface ColorTokenViolation {
  token: string
  line: number
  column: number
}

type ColorTokenBaseline = Record<
  string,
  { reason?: string; tokens: Record<string, number> }
>

/**
 * Find raw colors outside their definition owners.
 * @param file Source path relative to the repository root.
 * @param source File contents to inspect.
 * @returns Raw color occurrences with source locations.
 */
export function findColorTokenViolations(
  file: string,
  source: string,
): ColorTokenViolation[]

/**
 * Report new occurrences and stale baseline allowances.
 * @param file Source path relative to the repository root.
 * @param violations Raw colors detected in the file.
 * @param baseline Existing occurrence allowances by file.
 * @returns Errors for new occurrences and stale allowances.
 */
export function compareColorTokenBaseline(
  file: string,
  violations: ColorTokenViolation[],
  baseline?: ColorTokenBaseline,
): string[]
