export function findTypographyViolations(
  file: string,
  source: string,
): Array<{
  line: number
  message: string
}>
