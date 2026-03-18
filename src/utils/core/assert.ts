/**
 * Exhaustiveness guard for discriminated unions and literal unions.
 */
export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${String(value)}`)
}
