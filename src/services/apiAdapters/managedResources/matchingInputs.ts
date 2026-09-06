import type {
  ManagedResourceMatchCandidate,
  ManagedResourceMatchList,
} from "~/types/managedResourceMatching"

const toManagedResourceMatchCandidate = (
  channel: ManagedResourceMatchCandidate,
): ManagedResourceMatchCandidate => ({
  id: channel.id,
  name: channel.name,
  type: channel.type,
  base_url: channel.base_url,
  models: channel.models,
  key: channel.key,
})
export const toManagedResourceMatchList = (
  list: ManagedResourceMatchList | null,
): ManagedResourceMatchList | null =>
  list && {
    items: list.items.map(toManagedResourceMatchCandidate),
    total: list.total,
    type_counts: list.type_counts,
  }
/** Numeric backends must reject opaque ids rather than coercing or truncating them. */
export function requireNumericManagedResourceId(id: number | string): number {
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0)
    throw new TypeError("Invalid numeric resource id")
  return id
}
