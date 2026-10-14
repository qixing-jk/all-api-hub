import type { ManagedResourceMatchCandidate } from "~/types/managedResourceMatching"

export const NATIVE_INVENTORY_NAMESPACES = {
  OVERRIDE: "override",
  DEFAULT: "default",
} as const

export interface NativeInventoryLookup {
  namespace: string
  key: string
}

/** Index native lookup identities once, retaining only secret-free candidate facts. */
export function createNativeInventoryIndex<T>(
  rows: readonly T[],
  lookup: (row: T) => NativeInventoryLookup,
  project: (row: T) => ManagedResourceMatchCandidate,
) {
  type Entry = { ordinal: number; candidate: ManagedResourceMatchCandidate }
  const namespaces = new Map<string, Map<string, Entry[]>>()
  rows.forEach((row, ordinal) => {
    const identity = lookup(row)
    let buckets = namespaces.get(identity.namespace)
    if (!buckets) {
      buckets = new Map()
      namespaces.set(identity.namespace, buckets)
    }
    const candidate = project(row)
    const bucket = buckets.get(identity.key) ?? []
    bucket.push({
      ordinal,
      candidate: { ...candidate, ref: { ...candidate.ref }, key: "" },
    })
    buckets.set(identity.key, bucket)
  })
  return {
    find(
      lookups: readonly NativeInventoryLookup[],
    ): ManagedResourceMatchCandidate[] {
      const matches = new Map<number, Entry>()
      for (const identity of lookups) {
        for (const entry of namespaces
          .get(identity.namespace)
          ?.get(identity.key) ?? []) {
          matches.set(entry.ordinal, entry)
        }
      }
      return [...matches.values()]
        .sort((left, right) => left.ordinal - right.ordinal)
        .map(({ candidate }) => ({ ...candidate, ref: { ...candidate.ref } }))
    },
  }
}
