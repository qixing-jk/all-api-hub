/**
 * Indexed reads a test intends to succeed.
 *
 * `noUncheckedIndexedAccess` correctly treats every array and record read as
 * possibly `undefined`. Production code should branch on that, but test
 * fixtures, queried elements and recorded mock calls are addressed by an index
 * the test author chose, and the test would fail if that element were missing.
 *
 * This helper is an assertion, not a guard: it keeps the exact runtime value
 * the unguarded read would have produced (including `undefined`), so a test
 * behaves identically with the flag on. A missing collection still throws,
 * matching `collection[index]` when `collection` itself is nullish.
 */
export function atIndex(source: null | undefined, key: PropertyKey): never
export function atIndex<T extends readonly unknown[], I extends number>(
  items: T | null | undefined,
  index: I,
): T[I]
export function atIndex<T>(
  items: ArrayLike<T> | null | undefined,
  index: number,
): T
export function atIndex<T extends object, K extends keyof T>(
  record: T | null | undefined,
  key: K,
): Exclude<T[K], undefined>
export function atIndex(
  source: object | null | undefined,
  index: PropertyKey,
): unknown {
  return (source as Record<PropertyKey, unknown>)[index]
}
